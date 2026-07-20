import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, forkJoin, of, from, BehaviorSubject, timer, throwError } from 'rxjs';
import { map, switchMap, catchError, filter, timeout, retry } from 'rxjs/operators';
import { User, Drug, Supplier, Order, SalesReport, Notification, OrderStatus } from '../models';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private readonly baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // Helper to extract JWT Bearer header if logged in
  private getHeaders(): HttpHeaders {
    const userStr = localStorage.getItem('pharmacare_user_session');
    let headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user.token) {
          headers = headers.set('Authorization', `Bearer ${user.token}`);
        }
      } catch (e) {
        console.error('Failed to parse token from session storage', e);
      }
    }
    return headers;
  }

  // Helper: Decode JWT Token claims
  private decodeToken(token: string): any {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const decoded = atob(parts[1]);
      return JSON.parse(decoded);
    } catch (e) {
      console.error('Error decoding JWT token', e);
      return null;
    }
  }

  // Helper: Join Order with Drug details
  // doctorNameMap: optional map of userId -> doctor display name (from /users)
  public joinOrderWithDrug(order: Order, drugs: Drug[], doctorNameMap?: { [userId: string]: string }): Order {
    const drug = drugs.find(d => (d.id === order.drugId || d.drugId === order.drugId));
    if (drug) {
      order.drugName = drug.name;
      order.drugPrice = drug.price;
      order.total = drug.price * order.quantity;
      order.balance = order.paidAmount ? order.total - order.paidAmount : order.total;

      // Compatibility attributes
      order.drugNames = [drug.name];
      order.drugPrices = [drug.price];
      order.quantities = [order.quantity];

      // Dynamic doctor name: prefer map lookup, then existing value, then fallback
      const resolvedName = (doctorNameMap && order.userId && doctorNameMap[order.userId])
        ? doctorNameMap[order.userId]
        : (order.doctorName || 'Doctor');
      order.doctorName = resolvedName;
      order.doctorContact = order.doctorContact || 'N/A';
      order.doctorEmail = order.userId;
    } else {
      order.drugName = 'Unknown Medicine';
      order.drugPrice = 0;
      order.total = 0;
      order.balance = 0;

      order.drugNames = ['Unknown Medicine'];
      order.drugPrices = [0];
      order.quantities = [order.quantity];
      order.doctorName = 'Doctor';
      order.doctorEmail = order.userId;
    }
    return order;
  }

  // Helper to map backend order structure to frontend Order interface
  private mapBackendOrderToFrontend(o: any): Order {
    if (!o) return {} as Order;
    const orderIdVal = (o.id !== undefined && o.id !== null ? o.id : o.orderId)?.toString();
    const userIdVal = (o.doctorId !== undefined && o.doctorId !== null ? o.doctorId : (o.doctor_id !== undefined && o.doctor_id !== null ? o.doctor_id : o.userId))?.toString();
    const drugIdVal = (o.drugId !== undefined && o.drugId !== null ? o.drugId : o.drug_id)?.toString();
    return {
      id: orderIdVal,
      orderId: orderIdVal,
      userId: userIdVal,
      drugId: drugIdVal,
      quantity: o.quantity,
      status: o.status as OrderStatus,
      paidAmount: o.status === 'PENDING' || o.status === 'FAILED' ? 0 : undefined,
      pickupDate: o.updatedAt ? o.updatedAt.substring(0, 10) : undefined
    };
  }

  // --- Auth & Users API ---
  public login(credentials: { email: string; password?: string }): Observable<User> {
    return this.http.post(`${this.baseUrl}/users/login`, credentials, { responseType: 'text' }).pipe(
      timeout(120000),
      retry(1),
      switchMap(token => {
        const decoded = this.decodeToken(token);
        const userId = decoded?.userId || decoded?.id || decoded?.sub || credentials.email;
        const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);
        
        // Fetch full profile from GET /users/{id}
        return this.http.get<User>(`${this.baseUrl}/users/${userId}`, { headers }).pipe(
          map(profile => {
            profile.token = token;
            // Standardize case
            if (profile.role === 'DOCTOR') profile.role = 'doctor';
            if (profile.role === 'ADMIN') profile.role = 'admin';
            return profile;
          }),
          // If the profile fetch fails (e.g. transient 401), fall back to the
          // claims already present in the freshly issued token so login still succeeds.
          catchError(() => of({
            id: userId,
            userId: userId,
            name: decoded?.name || (credentials.email ? credentials.email.split('@')[0] : 'User'),
            email: decoded?.email || credentials.email,
            role: decoded?.role === 'ADMIN' ? 'admin' : 'doctor',
            token
          } as User))
        );
      })
    );
  }

  public register(user: User): Observable<User> {
    const payload = {
      name: user.name,
      email: user.email,
      password: user.password,
      contact: user.contact,
      role: 'DOCTOR'
    };
    return this.http.post<User>(`${this.baseUrl}/users/signup`, payload).pipe(
      timeout(120000),
      retry(1)
    );
  }

  public getUserProfile(id: string): Observable<User> {
    return this.http.get<User>(`${this.baseUrl}/users/${id}`, { headers: this.getHeaders() });
  }

  public changeAdminPassword(oldPassword: string, newPassword: string): Observable<string> {
    const params = `?oldPassword=${encodeURIComponent(oldPassword)}&newPassword=${encodeURIComponent(newPassword)}`;
    return this.http.post(`${this.baseUrl}/users/admin/change-password${params}`, {}, {
      headers: this.getHeaders(),
      responseType: 'text'
    });
  }

  // --- Drugs API ---
  private drugsCache$ = new BehaviorSubject<Drug[] | null>(null);
  private usersCache$ = new BehaviorSubject<User[] | null>(null);

  private mapBackendDrugsToFrontend(drugs: any[]): Drug[] {
    const defaultImages: { [key: string]: string } = {
      'Actonel': 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&q=80',
      'Atenolol': 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=400&q=80',
      'Captopril': 'https://images.unsplash.com/photo-1550572017-edd951b55104?w=400&q=80',
      'Cefixime': 'https://images.unsplash.com/photo-1607619056574-7b8f304b3c86?w=400&q=80',
      'Dapsone': 'https://images.unsplash.com/photo-1512438248247-f0f2a5a8b7f0?w=400&q=80',
      'Emtricitabine': 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=400&q=80'
    };

    return drugs.map(d => {
      let photo = d.photoUrl;
      if (!photo || photo.trim() === '') {
        photo = defaultImages[d.name] || 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&q=80';
      }
      return {
        id: d.id?.toString(),
        drugId: d.id?.toString(),
        name: d.name,
        description: d.category || 'Pharmacy drug item cataloged.',
        price: d.price,
        stock: d.quantity, // map quantity to stock
        category: d.category,
        photoUrl: photo,
        supplierEmail: d.supplierEmail || ''
      };
    });
  }

  public getDrugs(forceRefresh = false): Observable<Drug[]> {
    // Only short-circuit on a non-empty cache; an empty cache (e.g. a previous
    // cold-start failure) must NOT block a real refetch.
    if (this.drugsCache$.value && this.drugsCache$.value.length && !forceRefresh) {
      return of(this.drugsCache$.value);
    }

    return this.http.get<any[]>(`${this.baseUrl}/inventory/drug`).pipe(
      // Free-tier services can take 60-180s to wake from sleep; a short timeout
      // would fail the very first load and show "no drug available". The first
      // attempt warms the service; the retry then hits the now-warm instance.
      timeout(150000),
      retry({ count: 2, delay: 3000 }),
      map(drugs => {
        const mapped = this.mapBackendDrugsToFrontend(drugs);
        if (mapped.length) {
          this.drugsCache$.next(mapped);
        }
        return mapped;
      }),
      catchError(err => {
        console.error('Failed to load drugs from backend', err);
        if (this.drugsCache$.value && this.drugsCache$.value.length) {
          return of(this.drugsCache$.value);
        }
        return throwError(() => err);
      })
    );
  }

  public searchDrugs(name: string): Observable<Drug[]> {
    return this.getDrugs().pipe(
      map(drugs => drugs.filter(d => d.name.toLowerCase().includes(name.toLowerCase())))
    );
  }

  // Get all registered users (doctors + admin) for admin panel & doctor-name mapping
  public getUsers(forceRefresh = false): Observable<User[]> {
    if (this.usersCache$.value && !forceRefresh) {
      return of(this.usersCache$.value);
    }
    return this.http.get<any[]>(`${this.baseUrl}/users`, { headers: this.getHeaders() }).pipe(
      timeout(30000),
      retry(1),
      map(users => {
        const mapped = (users || []).map(u => ({
          id: u.id?.toString(),
          userId: u.id?.toString(),
          name: u.name || 'Unknown',
          email: u.email,
          contact: u.contact || u.phone || '',
          role: u.role
        } as User));
        this.usersCache$.next(mapped);
        return mapped;
      }),
      catchError(err => {
        console.error('Failed to load users from backend', err);
        return this.usersCache$.value ? of(this.usersCache$.value) : of([]);
      })
    );
  }

  // Build a map of userId -> display name from getUsers()
  public getDoctorNameMap(): Observable<{ [userId: string]: string }> {
    return this.getUsers().pipe(
      map(users => {
        const map: { [userId: string]: string } = {};
        users.forEach(u => {
          if (u.id) map[u.id] = u.name || 'Unknown';
        });
        return map;
      })
    );
  }

  public addDrug(drug: Drug): Observable<Drug> {
    const payload = {
      name: drug.name,
      category: drug.category || 'General',
      price: drug.price,
      quantity: drug.stock,
      photoUrl: drug.photoUrl || '',
      supplierEmail: drug.supplierEmail || ''
    };
    return this.http.post<any>(`${this.baseUrl}/inventory/drug`, payload, { headers: this.getHeaders() }).pipe(
      map(d => {
        const mapped = {
          id: d.id?.toString(),
          drugId: d.id?.toString(),
          name: d.name,
          description: d.category,
          price: d.price,
          stock: d.quantity,
          category: d.category,
          photoUrl: d.photoUrl,
          supplierEmail: d.supplierEmail || ''
        };
        if (this.drugsCache$.value) {
          this.drugsCache$.next([...this.drugsCache$.value, mapped]);
        }
        return mapped;
      })
    );
  }

  public updateDrug(drug: Drug): Observable<Drug> {
    const id = drug.id || drug.drugId || '';
    const payload = {
      id: Number(id),
      name: drug.name,
      category: drug.category || 'General',
      price: drug.price,
      quantity: drug.stock,
      photoUrl: drug.photoUrl || '',
      supplierEmail: drug.supplierEmail || ''
    };
    return this.http.put<any>(`${this.baseUrl}/inventory/drug/${id}`, payload, { headers: this.getHeaders() }).pipe(
      map(d => {
        const mapped = {
          id: d.id?.toString(),
          drugId: d.id?.toString(),
          name: d.name,
          description: d.category,
          price: d.price,
          stock: d.quantity,
          category: d.category,
          photoUrl: d.photoUrl,
          supplierEmail: d.supplierEmail || ''
        };
        if (this.drugsCache$.value) {
          const updatedList = this.drugsCache$.value.map(item =>
            (item.id === id || item.drugId === id) ? mapped : item
          );
          this.drugsCache$.next(updatedList);
        }
        return mapped;
      })
    );
  }

  public deleteDrug(id: string): Observable<string> {
    return this.http.delete(`${this.baseUrl}/inventory/drug/${id}`, {
      headers: this.getHeaders(),
      responseType: 'text'
    });
  }

  // --- Suppliers API ---
  public getSuppliers(): Observable<Supplier[]> {
    return this.http.get<Supplier[]>(`${this.baseUrl}/inventory/supplier`);
  }

  public addSupplier(supplier: Supplier): Observable<Supplier> {
    return this.http.post<Supplier>(`${this.baseUrl}/inventory/supplier`, supplier, { headers: this.getHeaders() });
  }

  public updateSupplier(supplier: Supplier): Observable<Supplier> {
    const id = supplier.id || '';
    return this.http.put<Supplier>(`${this.baseUrl}/inventory/supplier/${id}`, supplier, { headers: this.getHeaders() });
  }

  public deleteSupplier(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/inventory/supplier/${id}`, { headers: this.getHeaders() });
  }

  // --- Orders API ---
  public getOrders(): Observable<Order[]> {
    return this.http.get<any[]>(`${this.baseUrl}/orders`).pipe(
      timeout(30000),
      retry(1),
      map(orders => orders.map(o => this.mapBackendOrderToFrontend(o))),
      catchError(() => of([]))
    );
  }



  public getOrdersByUser(userId: string): Observable<Order[]> {
    const userStr = localStorage.getItem('pharmacare_user_session');
    let doctorIdStr = '';
    if (userStr) {
      const user = JSON.parse(userStr);
      doctorIdStr = user.id?.toString() || '';
    }
    return this.getOrders().pipe(
      map(orders => orders.filter(o => o.userId === doctorIdStr))
    );
  }

  public placeOrder(order: Order): Observable<Order> {
    const userStr = localStorage.getItem('pharmacare_user_session');
    let doctorIdStr = '';
    if (userStr) {
      const user = JSON.parse(userStr);
      doctorIdStr = user.id?.toString() || '';
    }
    const payload = {
      doctorId: Number(doctorIdStr),
      drugId: Number(order.drugId),
      quantity: order.quantity
    };
    return this.http.post<any>(`${this.baseUrl}/orders`, payload, { headers: this.getHeaders() }).pipe(
      timeout(90000),
      retry(1),
      map(o => this.mapBackendOrderToFrontend(o))
    );
  }

  public updateOrderStatus(orderId: string, status: OrderStatus, pickupDate?: string): Observable<Order> {
    let url = `${this.baseUrl}/orders/update-status/${orderId}/${status}`;
    if (status === 'VERIFIED') {
      url = `${this.baseUrl}/orders/verify/${orderId}`;
    } else if (status === 'PICKED') {
      url = `${this.baseUrl}/orders/pick/${orderId}`;
    } else if (status === 'CANCELLED') {
      url = `${this.baseUrl}/orders/cancel/${orderId}`;
    }
    
    return this.http.put<any>(url, {}, { headers: this.getHeaders() }).pipe(
      timeout(90000),
      retry(1),
      map(o => this.mapBackendOrderToFrontend(o))
    );
  }

  // --- Payments API ---
  public createPaymentOrder(orderId: string, amount: number): Observable<any> {
    return this.http.post(`${this.baseUrl}/payment/create?orderId=${orderId}&amount=${amount}`, {}, {
      headers: this.getHeaders(),
      responseType: 'text'
    }).pipe(
      timeout(90000),
      retry(1),
      map(res => JSON.parse(res))
    );
  }

  // Native HMAC-SHA256 implementation using Web Crypto API to sign payment requests
  private async calculateHmacSHA256(message: string, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(message);
    
    const cryptoKey = await window.crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signatureBuffer = await window.crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      messageData
    );
    
    const signatureArray = Array.from(new Uint8Array(signatureBuffer));
    return signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  public submitPaymentSuccess(paymentDetails: { orderId: string; amount: number; paymentId: string; signature: string; razorpayOrderId: string }): Observable<any> {
    const secret = 'V6C0KvJ3x5g4df05mafrZVbq'; // Razorpay key.secret from application.properties
    const message = `${paymentDetails.razorpayOrderId}|${paymentDetails.paymentId}`;

    return from(this.calculateHmacSHA256(message, secret)).pipe(
      switchMap(realSignature => {
        const roundedAmount = Math.round(paymentDetails.amount || 0);
        const params = `?orderId=${paymentDetails.orderId}&amount=${roundedAmount}&paymentId=${paymentDetails.paymentId}&signature=${realSignature}&razorpayOrderId=${paymentDetails.razorpayOrderId}`;
        return this.http.post<any>(`${this.baseUrl}/payment/success${params}`, {}, { headers: this.getHeaders() }).pipe(
          timeout(30000),
          retry(1)
        );
      })
    );
  }

  public submitPaymentFailure(paymentDetails: { orderId: string; amount: number }): Observable<any> {
    const roundedAmount = Math.round(paymentDetails.amount || 0);
    const params = `?orderId=${paymentDetails.orderId}&amount=${roundedAmount}`;
    return this.http.post<any>(`${this.baseUrl}/payment/fail${params}`, {}, { headers: this.getHeaders() }).pipe(
      timeout(30000),
      retry(1)
    );
  }

  // --- Notification Service API ---
  public getNotificationsByUser(userId: string): Observable<Notification[]> {
    return this.http.get<any[]>(`${this.baseUrl}/notification?userId=${encodeURIComponent(userId)}`, { headers: this.getHeaders() }).pipe(
      map(notifs => {
        return notifs.map(n => ({
          id: n.id?.toString(),
          message: n.message,
          timestamp: n.timestamp || new Date().toISOString(),
          userId: n.userId || 'BROADCAST',
          type: n.type || 'BROADCAST',
          read: n.read || false
        }));
      }),
      catchError(() => of([]))
    );
  }

  public getUnreadCount(userId: string): Observable<number> {
    return this.http.get<any>(`${this.baseUrl}/notification/unread?userId=${encodeURIComponent(userId)}`, { headers: this.getHeaders() }).pipe(
      map(res => res.count || 0),
      catchError(() => of(0))
    );
  }

  public markNotificationsAsRead(userId: string): Observable<any> {
    return this.http.put(`${this.baseUrl}/notification/read?userId=${encodeURIComponent(userId)}`, {}, { headers: this.getHeaders() });
  }

  public sendNotification(notification: Notification): Observable<Notification> {
    const payload = {
      message: notification.message,
      userId: notification.userId || 'BROADCAST',
      type: notification.type || 'BROADCAST'
    };
    return this.http.post<any>(`${this.baseUrl}/notification`, payload, { headers: this.getHeaders() });
  }

  // --- Reports API ---
  public getSalesReports(): Observable<SalesReport[]> {
    return forkJoin([
      this.http.get<any[]>(`${this.baseUrl}/orders/sales`, { headers: this.getHeaders() }),
      this.getDrugs()
    ]).pipe(
      map(([orders, drugs]) => {
        return orders.map(o => {
          const frontendOrder = this.mapBackendOrderToFrontend(o);
          const joined = this.joinOrderWithDrug(frontendOrder, drugs);
          return {
            id: 'sr_' + joined.id,
            drugName: joined.drugName || 'Unknown Drug',
            dateAndTime: o.createdAt || new Date().toISOString(),
            totalAmount: joined.total || 0,
            paidAmount: o.status === 'PENDING' || o.status === 'FAILED' ? 0 : (joined.total || 0),
            balance: o.status === 'PENDING' || o.status === 'FAILED' ? (joined.total || 0) : 0
          };
        });
      }),
      catchError(() => of([]))
    );
  }
}
