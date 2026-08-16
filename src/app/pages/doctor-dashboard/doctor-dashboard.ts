import { Component, OnInit, OnDestroy, ViewChild, ElementRef, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { RazorpayService, RazorpayConstructor } from '../../services/razorpay.service';
import { Drug, Order, User, OrderStatus, Notification, Supplier } from '../../models';
import { forkJoin, Subscription, interval, Subject, of, firstValueFrom, Observable } from 'rxjs';
import { startWith, switchMap, takeUntil, finalize, catchError } from 'rxjs/operators';
import Chart from 'chart.js/auto';

interface CartItem {
  drug: Drug;
  quantity: number;
}

@Component({
  selector: 'app-doctor-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './doctor-dashboard.html',
  styleUrl: './doctor-dashboard.css'
})
export class DoctorDashboardComponent implements OnInit, OnDestroy {
  @ViewChild('carousel', { static: false }) carousel!: ElementRef;

  currentSection: 'dashboard' | 'order-drugs' | 'order-history' | 'view-drugs' = 'dashboard';
  doctorUser: User | null = null;
  drugs: Drug[] = [];
  filteredDrugs: Drug[] = [];
  suppliers: Supplier[] = [];
  supplierMap: { [email: string]: string } = {};
  searchQuery: string = '';
  
  // Quantities input mapping: drugId -> quantity
  quantitiesMap: { [key: string]: number } = {};

  // Cart
  cart: CartItem[] = [];
  cartTotal = 0;
  showCartDrawer: boolean = false;

  // Order History
  orders: Order[] = [];
  notifications: Notification[] = [];

  // Notification polling
  private notifSub: Subscription | null = null;

  // Loading states
  loadingOrders = false;
  loadingDrugs = false;
  ordersLoaded = false;
  drugsLoaded = false;
  drugsLoadError = false;
  private destroy$ = new Subject<void>();
  private autoRefreshTimer: any = null;
  processingLabel = '';
  message: string | null = null;
  messageType: 'success' | 'error' | 'info' = 'info';

  private showMessage(msg: string, type: 'success' | 'error' | 'info' = 'info') {
    this.message = msg;
    this.messageType = type;
    this.cd();
    setTimeout(() => {
      this.message = null;
      this.cd();
    }, 6000);
  }

  // Chart references
  ordersChart: any;
  spendChart: any;

  // Payment Modal (Razorpay Integration)
  showPaymentModal = false;
  selectedOrderForPayment: Order | null = null;
  paymentAmount: number = 0;
  paymentSuccessMsg = '';
  processingPayment = false;

  // Bulk payment checkout tracking
  checkoutOrders: Order[] = [];
  checkoutRzpOrders: any[] = [];
  isBulkPayment = false;
  private paymentWatchdog: any = null;

  // When the Razorpay popup can't auto-open (browser blocks popups opened
  // outside a user gesture, e.g. after the async order-placement call), we
  // surface a manual "Complete Payment" button so the user can open it from a
  // real click.
  showPayButton = false;
  private pendingRzp: any = null;

  // Set to true the moment the Razorpay popup reports success or dismissal,
  // so the popup watchdog never fires after the flow already ended.
  private paymentHandled = false;

  constructor(
    private apiService: ApiService,
    private authService: AuthService,
    private razorpayService: RazorpayService,
    private zone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  // This app runs zoneless (no zone.js), so change detection does NOT run
  // after async callbacks (HTTP, promises, timers). Every async state
  // mutation in the payment flow calls cd() to force a render — otherwise
  // the "processing payment" loader stays frozen forever.
  private cd() {
    try { this.cdr.detectChanges(); } catch (e) { /* view already destroyed */ }
  }

  ngOnInit() {
    this.doctorUser = this.authService.getCurrentUser();
    this.restoreFromCache();
    this.loadDrugs();
    this.loadOrders();
    this.loadSuppliers();
    this.startNotificationPolling();
    // Preload the Razorpay checkout script in the background so it is cached
    // (and the checkout flow resolves instantly) by the time the user pays.
    this.razorpayService.load().catch(() => {});
    this.startAutoRefresh();
  }

  // Real-time sync: silently refresh drugs + orders so drugs added by the
  // admin appear (and order status changes show up) without a page reload.
  private startAutoRefresh() {
    this.stopAutoRefresh();
    this.autoRefreshTimer = window.setInterval(() => {
      this.refreshDrugsSilently();
      this.refreshOrdersSilently();
    }, 45000);
  }

  private stopAutoRefresh() {
    if (this.autoRefreshTimer) {
      window.clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
  }

  private refreshDrugsSilently() {
    this.apiService.getDrugs().pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => {
        this.drugs = data;
        this.filteredDrugs = [...data];
        if (data.length) {
          this.drugsLoaded = true;
          data.forEach(d => {
            const key = d.id! || d.drugId!;
            if (!this.quantitiesMap[key]) this.quantitiesMap[key] = 1;
          });
        }
        this.loadingDrugs = false;
        this.drugsLoadError = false;
        this.persistCache();
        this.cd();
      },
      error: () => { /* keep last known data; next tick will retry */ }
    });
  }

  private refreshOrdersSilently() {
    const userId = this.doctorUser?.email || '';
    if (!userId) return;
    this.apiService.getOrdersByUser(userId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => {
        this.orders = data.map(o => this.apiService.joinOrderWithDrug(o, this.drugs));
        this.ordersLoaded = true;
        this.loadingOrders = false;
        this.persistCache();
        this.cd();
      },
      error: () => { /* keep last known data; next tick will retry */ }
    });
  }

  // Race a promise against a hard deadline so NO step in the payment
  // pipeline can ever hang the loader indefinitely.
  private withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error(message)), ms);
      promise.then(
        (v) => { clearTimeout(timer); resolve(v); },
        (e) => { clearTimeout(timer); reject(e); }
      );
    });
  }

  // Replace the payment watchdog with a new one with the given budget.
  private armWatchdog(budgetMs: number, action: () => void) {
    if (this.paymentWatchdog) clearTimeout(this.paymentWatchdog);
    this.paymentWatchdog = window.setTimeout(action, budgetMs);
  }

  // THE single terminal cleanup for the payment UI. Every success, failure,
  // timeout and dismissal path funnels through here so the spinner can never
  // be left running.
  private finalizePaymentUi() {
    this.processingPayment = false;
    this.processingLabel = '';
    this.showPayButton = false;
    this.pendingRzp = null;
    if (this.paymentWatchdog) {
      clearTimeout(this.paymentWatchdog);
      this.paymentWatchdog = null;
    }
  }

  // Load suppliers and build email -> name map for displaying drug suppliers
  loadSuppliers() {
    this.apiService.getSuppliers().pipe(takeUntil(this.destroy$)).subscribe({
      next: (suppliers) => {
        this.suppliers = suppliers;
        const map: { [email: string]: string } = {};
        suppliers.forEach(s => {
          const key = (s.email || s.contact || '').toString();
          if (key) map[key] = s.name;
        });
        this.supplierMap = map;
        this.cd();
      },
      error: (err) => console.error('Failed to load suppliers', err)
    });
  }

  private restoreFromCache() {
    try {
      const raw = localStorage.getItem(this.CACHE_KEY);
      if (raw) {
        const c = JSON.parse(raw);
        if (c.drugs && c.drugs.length) {
          this.drugs = c.drugs;
          this.filteredDrugs = [...c.drugs];
          this.drugsLoaded = true;
          this.drugs.forEach(d => {
            const key = d.id! || d.drugId!;
            this.quantitiesMap[key] = 1;
          });
        }
        if (c.orders && c.orders.length) {
          this.orders = c.orders;
          this.ordersLoaded = true;
        }
      }
    } catch { /* ignore */ }
  }

  private persistCache() {
    try {
      localStorage.setItem(this.CACHE_KEY, JSON.stringify({
        drugs: this.drugs,
        orders: this.orders,
        ts: Date.now()
      }));
    } catch { /* ignore */ }
  }

  ngOnDestroy() {
    this.stopNotificationPolling();
    this.stopAutoRefresh();
    this.destroy$.next();
    this.destroy$.complete();
  }

  setSection(section: 'dashboard' | 'order-drugs' | 'order-history' | 'view-drugs') {
    this.currentSection = section;
    if (section === 'dashboard') {
      setTimeout(() => {
        this.initCharts();
      }, 150);
    }
  }

  private startNotificationPolling() {
    this.stopNotificationPolling();
    if (!this.doctorUser) return;

    const email = this.doctorUser.email || this.doctorUser.userId || '';
    this.notifSub = interval(5000).pipe(
      startWith(0),
      switchMap(() => this.apiService.getNotificationsByUser(email).pipe(
        // Tolerate transient errors (e.g. a backend service asleep on the free
        // tier) without breaking the polling stream or spamming the console.
        catchError(() => of<Notification[]>([]))
      ))
    ).subscribe({
      next: (data) => {
        if (!data || !data.length) return;
        this.notifications = data.sort((a, b) => {
          const tA = a.timestamp || '';
          const tB = b.timestamp || '';
          return tB > tA ? 1 : -1;
        });
      },
      error: (err) => console.error('Failed to load doctor notifications', err)
    });
  }

  private stopNotificationPolling() {
    if (this.notifSub) {
      this.notifSub.unsubscribe();
      this.notifSub = null;
    }
  }

  loadNotifications() {
    // Kept for backward compat, but polling handles it now
  }

  initCharts() {
    if (this.ordersChart) this.ordersChart.destroy();
    if (this.spendChart) this.spendChart.destroy();

    const ordersCanvas = document.getElementById('doctorOrdersChart') as HTMLCanvasElement;
    if (ordersCanvas) {
      const statusCounts = {
        PENDING: 0,
        PLACED: 0,
        VERIFIED: 0,
        PICKED: 0,
        CANCELLED: 0,
        FAILED: 0
      };
      this.orders.forEach(o => {
        if (statusCounts[o.status] !== undefined) {
          statusCounts[o.status]++;
        }
      });

      this.ordersChart = new Chart(ordersCanvas, {
        type: 'doughnut',
        data: {
          labels: Object.keys(statusCounts),
          datasets: [{
            data: Object.values(statusCounts),
            backgroundColor: [
              '#f59e0b', // PENDING
              '#0284c7', // PLACED
              '#3b82f6', // VERIFIED
              '#10b981', // PICKED
              '#64748b', // CANCELLED
              '#ef4444'  // FAILED
            ]
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom' }
          }
        }
      });
    }

    const spendCanvas = document.getElementById('doctorSpendChart') as HTMLCanvasElement;
    if (spendCanvas) {
      const drugSpend: { [key: string]: number } = {};
      this.orders.forEach(o => {
        if (o.status !== 'FAILED' && o.status !== 'CANCELLED') {
          const name = o.drugName || 'Unknown';
          drugSpend[name] = (drugSpend[name] || 0) + (o.total || 0);
        }
      });

      this.spendChart = new Chart(spendCanvas, {
        type: 'bar',
        data: {
          labels: Object.keys(drugSpend),
          datasets: [{
            label: 'Spend Amount (₹)',
            data: Object.values(drugSpend),
            backgroundColor: '#0284c7',
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { beginAtZero: true }
          }
        }
      });
    }
  }

  hasOrdersWithStatus(statuses: string[]): boolean {
    return this.orders.some(o => statuses.includes(o.status));
  }

  private readonly CACHE_KEY = 'doctor_dashboard_cache_v1';

  loadDrugs(forceRefresh = false) {
    if (forceRefresh) {
      this.drugsLoaded = false;
      this.loadingDrugs = true;
    }
    if (this.drugsLoaded && !forceRefresh) return;
    this.drugsLoadError = false;
    this.loadingDrugs = true;
    this.apiService.getDrugs().pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => {
        this.drugs = data;
        this.filteredDrugs = [...data];

        if (data.length > 0) {
          this.drugsLoaded = true;
          this.drugs.forEach(d => {
            const key = d.id! || d.drugId!;
            this.quantitiesMap[key] = 1;
          });
          this.persistCache();
        } else {
          // Genuinely empty inventory — mark loaded so we don't spin forever,
          // but do NOT persist an empty list over a good cache.
          this.drugsLoaded = true;
        }
        this.loadingDrugs = false;
        this.cd();
      },
      error: (err) => {
        console.error('Failed to load drugs', err);
        // Keep drugsLoaded = false so a later call (Retry / section switch)
        // will attempt to fetch again instead of showing empty forever.
        this.drugsLoadError = true;
        this.loadingDrugs = false;
        this.cd();
      }
    });
  }

  loadOrders(forceRefresh = false) {
    if (forceRefresh) {
      this.ordersLoaded = false;
      this.loadingOrders = true;
    }
    if (this.ordersLoaded && !forceRefresh) return;
    this.doctorUser = this.authService.getCurrentUser();
    if (this.doctorUser) {
      this.loadingOrders = true;
      const userId = this.doctorUser.email || this.doctorUser.userId || '';
      this.apiService.getOrdersByUser(userId).pipe(takeUntil(this.destroy$)).subscribe({
        next: (data) => {
          this.orders = data.map(o => this.apiService.joinOrderWithDrug(o, this.drugs));
          this.ordersLoaded = true;
          this.orders.sort((a, b) => {
            const idA = a.id || a.orderId || '';
            const idB = b.id || b.orderId || '';
            return idB > idA ? 1 : -1;
          });
          this.loadingOrders = false;
          this.persistCache();
          this.cd();
          if (this.currentSection === 'dashboard') {
            setTimeout(() => this.initCharts(), 100);
          }
        },
        error: (err) => {
          console.error('Failed to load orders', err);
          this.loadingOrders = false;
          this.cd();
        }
      });
    }
  }

  onSearch() {
    if (!this.searchQuery) {
      this.loadDrugs();
    } else {
      this.apiService.searchDrugs(this.searchQuery).subscribe({
        next: (data) => {
          this.filteredDrugs = data;
          data.forEach(d => {
            const key = d.id! || d.drugId!;
            if (!this.quantitiesMap[key]) {
              this.quantitiesMap[key] = 1;
            }
          });
        },
        error: (err) => console.error('Search failed', err)
      });
    }
  }

  scrollCarousel(direction: number) {
    if (this.carousel) {
      const scrollAmount = 320;
      this.carousel.nativeElement.scrollLeft += direction * scrollAmount;
    }
  }

  addToCart(drug: Drug) {
    const key = drug.id! || drug.drugId!;
    const qty = this.quantitiesMap[key] || 1;
    if (qty <= 0) return;
    
    if (qty > drug.stock) {
      this.showMessage(`Insufficient stock. Only ${drug.stock} items available.`, 'error');
      return;
    }

    const existing = this.cart.find(item => (item.drug.id === drug.id || item.drug.drugId === drug.drugId));
    if (existing) {
      if (existing.quantity + qty > drug.stock) {
        this.showMessage(`Cannot add more. Combined cart quantity exceeds stock of ${drug.stock}.`, 'error');
        return;
      }
      existing.quantity += qty;
    } else {
      this.cart.push({ drug, quantity: qty });
    }

    this.calculateCartTotal();
    this.quantitiesMap[key] = 1;
    this.showCartDrawer = true;
  }

  removeFromCart(index: number) {
    this.cart.splice(index, 1);
    this.calculateCartTotal();
  }

  calculateCartTotal() {
    this.cartTotal = this.cart.reduce((sum, item) => sum + (item.drug.price * item.quantity), 0);
  }

  placeOrder() {
    if (this.cart.length === 0 || !this.doctorUser) return;

    this.showCartDrawer = false;
    const userId = this.doctorUser.email || this.doctorUser.userId || '';
    
    this.finalizePaymentUi();
    this.processingPayment = true;
    this.processingLabel = 'Placing your order...';
    this.paymentSuccessMsg = '';
    this.showPaymentModal = false;
    this.paymentAmount = this.cartTotal;
    this.isBulkPayment = true;
    this.checkoutOrders = [];
    this.paymentHandled = false;
    this.cd();

    // Safety net: if order placement itself hangs (e.g. backend cold start),
    // never leave the loader spinning forever.
    this.armWatchdog(45000, () => {
      this.finalizePaymentUi();
      this.cd();
      this.showMessage('Order placement is taking longer than expected. Please check your order history shortly.', 'info');
      this.loadOrders(true);
    });

    // Create parallel placement orders, one for each drug
    const placements = this.cart.map(item => {
      const drugId = item.drug.id || item.drug.drugId || '';
      const newOrder: Order = {
        userId: userId,
        drugId: drugId,
        quantity: item.quantity,
        status: 'PENDING'
      };
      return this.apiService.placeOrder(newOrder);
    });

    forkJoin(placements).subscribe({
      next: (createdOrders) => {
        console.log('Orders created on backend:', createdOrders);
        
        // Map totals using local cart details before clearing cart
        createdOrders.forEach(order => {
          const orderDrugId = String(order.drugId || '').trim();
          const cartItem = this.cart.find(item => {
            const cartDrugId = String(item.drug.id || item.drug.drugId || '').trim();
            return cartDrugId === orderDrugId && cartDrugId !== '';
          });
          if (cartItem) {
            order.total = cartItem.drug.price * order.quantity;
            order.drugName = cartItem.drug.name;
            order.drugPrice = cartItem.drug.price;
            order.balance = order.total;
          } else {
            // Resilient fallback: search in loaded drugs list
            const matchedDrug = this.drugs.find(d => {
              const listDrugId = String(d.id || d.drugId || '').trim();
              return listDrugId === orderDrugId && listDrugId !== '';
            });
            if (matchedDrug) {
              order.total = matchedDrug.price * order.quantity;
              order.drugName = matchedDrug.name;
              order.drugPrice = matchedDrug.price;
              order.balance = order.total;
            } else {
              console.warn('Could not map price for order:', order);
              order.total = 0;
            }
          }
        });

        this.checkoutOrders = createdOrders;
        const totalToPay = this.cartTotal;
        
        // Deduct local stock in frontend view (backend does it automatically on payment success)
        this.cart.forEach(item => {
          const drug = item.drug;
          drug.stock -= item.quantity;
        });

        // Reset cart
        this.cart = [];
        this.cartTotal = 0;
        this.loadDrugs();
        this.cd();

        // Launch real Razorpay checkout popup directly
        this.runCheckout(totalToPay, true, createdOrders);
      },
      error: (err) => {
        this.finalizePaymentUi();
        this.cd();
        this.showMessage('Failed to place orders. Please try again.', 'error');
        console.error(err);
      }
    });
  }

  // Launch Razorpay checkout: loads the checkout script on demand (with
  // retries + timeout), creates a real Razorpay order on the backend, and
  // prepares the payment popup. Every step is race-guarded by withTimeout and
  // every failure path calls finalizePaymentUi(), so the checkout can never
  // hang on an infinite loader. The popup itself is opened from a REAL user
  // click (the "Complete Payment" button) so browsers never block it.
  private async runCheckout(amount: number, isBulk: boolean, orders: Order[]) {
    if (amount <= 0) {
      this.finalizePaymentUi();
      this.showMessage('Invalid payment amount.', 'error');
      return;
    }

    this.processingPayment = true;
    this.showPayButton = false;
    this.pendingRzp = null;
    this.paymentHandled = false;
    this.processingLabel = 'Connecting to payment gateway...';
    this.cd();

    // 1. Load Razorpay checkout script — hard 20s cap, guaranteed settle.
    let RazorpayCtor: RazorpayConstructor;
    try {
      RazorpayCtor = await this.withTimeout(
        this.razorpayService.load(),
        20000,
        'Razorpay script load timed out'
      );
    } catch (err) {
      console.error('Razorpay script load failed', err);
      this.finalizePaymentUi();
      this.cd();
      this.showMessage('Payment gateway could not be loaded. Please check your connection and try again.', 'error');
      return;
    }
    this.cd();

    // 2. Create a real Razorpay order on the backend (single attempt, 45s cap).
    //    Network/API errors fall back to a key-only checkout so payment is
    //    never blocked.
    this.processingLabel = 'Creating secure payment order...';
    this.cd();
    const primaryOrder = orders[0];
    const primaryOrderId = String(primaryOrder?.id || primaryOrder?.orderId || '');
    let rzpOrderId: string | null = null;
    let rzpKeyId = 'rzp_test_SkUT7TYdihPuCN';
    try {
      const res = await this.withTimeout(
        firstValueFrom(this.apiService.createPaymentOrder(primaryOrderId, amount)),
        45000,
        'Payment order creation timed out'
      );
      if (res && res.success) {
        rzpOrderId = res.razorpayOrderId || null;
        rzpKeyId = res.keyId || rzpKeyId;
      } else {
        console.warn('Razorpay order creation did not succeed, using key-only checkout:', res);
      }
    } catch (err) {
      console.warn('Razorpay order creation failed, using key-only checkout:', err);
    }
    this.cd();

    // 3. Build the Razorpay instance and hand it to the user via the
    //    "Complete Payment" button (a real click → popup never blocked).
    this.processingLabel = 'Payment window ready — click below to open it.';
    this.cd();

    const options: any = {
      key: rzpKeyId,
      amount: Math.round(amount * 100), // in paise
      currency: 'INR',
      name: 'Pharmacare Pharmacy',
      description: isBulk ? 'Bulk Order Payment' : 'Order Payment',
      image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=100&q=80',
      prefill: {
        name: this.doctorUser?.name || '',
        email: this.doctorUser?.email || '',
        contact: this.doctorUser?.contact || ''
      },
      theme: {
        color: '#2563eb'
      },
      handler: (response: any) => {
        // Razorpay runs this callback outside Angular's zone, which prevents
        // the "processing payment" spinner from hiding. Wrap all logic in
        // zone.run() so change detection fires and the loader resets.
        this.zone.run(() => {
          this.paymentHandled = true;
          this.finalizePaymentUi();
          this.cd();
          console.log('Razorpay payment successful:', response);
          this.processingPayment = true;
          this.processingLabel = 'Verifying payment...';
          this.cd();
          const paymentId = response.razorpay_payment_id;
          const realRzpOrderId = response.razorpay_order_id || rzpOrderId || '';
          const realSignature = response.razorpay_signature || '';

          const submitForOrder = (order: Order): Observable<any> => {
            const orderId = order.id || order.orderId || '';
            const orderAmount = order.total || amount;
            return this.apiService.submitPaymentSuccess({
              orderId: orderId,
              amount: orderAmount,
              paymentId: paymentId,
              signature: realSignature,
              razorpayOrderId: realRzpOrderId
            });
          };

          const paymentCallbacks = isBulk
            ? orders.map(o => submitForOrder(o))
            : [submitForOrder(orders[0])];

          forkJoin(paymentCallbacks).pipe(
            finalize(() => {
              this.finalizePaymentUi();
              this.cd();
            })
          ).subscribe({
            next: () => {
              this.showMessage(`Checkout successful! Total Paid: ₹${amount}. Payment ID: ${paymentId}`, 'success');
              this.loadOrders(true);
            },
            error: (err) => {
              console.error('Payment callback verification failed', err);
              this.showMessage(`Payment successful! Total Paid: ₹${amount}. Payment ID: ${paymentId}`, 'success');
              this.loadOrders(true);
            }
          });
        });
      },
      modal: {
        ondismiss: () => {
          this.zone.run(() => {
            console.log('Payment modal dismissed');
            this.paymentHandled = true;
            this.finalizePaymentUi();
            this.cd();

            const failCallbacks = orders.map(order => {
              const orderId = order.id || order.orderId || '';
              const orderAmount = order.total || amount;
              return this.apiService.submitPaymentFailure({ orderId: orderId, amount: orderAmount });
            });
            forkJoin(failCallbacks).subscribe({
              next: () => {
                this.showMessage('Payment cancelled. Your order is saved — you can pay from Order History.', 'info');
                this.loadOrders(true);
              },
              error: () => this.loadOrders(true)
            });
          });
        }
      }
    };

    if (rzpOrderId) {
      options.order_id = rzpOrderId;
    }

    try {
      const rzp = new RazorpayCtor(options);
      this.pendingRzp = rzp;
      this.processingPayment = false;
      this.processingLabel = '';
      this.showPayButton = true;
      this.cd();

      // Popup watchdog: if the user never clicks "Complete Payment" (or the
      // popup is stuck open without a callback), reset after 2 minutes and
      // leave the orders saved as PENDING so nothing is lost.
      this.armWatchdog(120000, () => {
        if (!this.paymentHandled) {
          this.finalizePaymentUi();
          this.cd();
          this.showMessage('Payment session expired. Your order is saved — you can pay from Order History.', 'info');
          this.loadOrders(true);
        }
      });

      // Bonus: attempt an auto-open. Browsers that still allow the popup
      // (permissive settings) will show it immediately — browsers that
      // block it keep the "Complete Payment" button as the reliable path.
      setTimeout(() => {
        if (!this.paymentHandled && this.pendingRzp) {
          try {
            this.pendingRzp.open();
          } catch (e) {
            console.warn('Auto-open popup blocked or failed; pay button remains available', e);
          }
        }
      }, 400);
    } catch (err) {
      console.error('Failed to open Razorpay checkout', err);
      this.finalizePaymentUi();
      this.cd();
      this.showMessage('Could not open payment window. Please try again.', 'error');
    }
  }

  // Open the stored Razorpay instance from a real user click (never blocked
  // by the browser since it happens inside the click handler).
  openPendingRazorpay() {
    if (!this.pendingRzp) {
      this.finalizePaymentUi();
      this.cd();
      return;
    }
    const rzp = this.pendingRzp;
    this.showPayButton = false;
    this.processingPayment = true;
    this.paymentHandled = false;
    this.processingLabel = 'Opening secure payment window...';
    this.cd();

    // Popup watchdog: if the popup neither succeeded nor dismissed within
    // 30s (e.g. its own loader is stuck), reset and offer the button again.
    this.armWatchdog(30000, () => {
      if (!this.paymentHandled) {
        this.processingPayment = false;
        this.processingLabel = '';
        this.showPayButton = true;
        this.cd();
        this.showMessage('The payment window did not respond. Click the button to try again, or cancel.', 'info');
      }
    });

    try {
      rzp.open();
    } catch (err) {
      console.error('Failed to open Razorpay checkout on manual click', err);
      this.finalizePaymentUi();
      this.cd();
      this.showMessage('Could not open the payment window. Please try again.', 'error');
      // Allow the user to try again
      this.showPayButton = true;
      this.cd();
    }
  }

  // Cancel the pending payment (PENDING orders stay in Order History).
  cancelPendingPayment() {
    this.finalizePaymentUi();
    this.cd();
    this.showMessage('Payment cancelled. Your order is saved — you can pay from Order History.', 'info');
    this.loadOrders(true);
  }

  openPaymentModal(order: Order) {
    this.isBulkPayment = false;
    this.selectedOrderForPayment = order;
    this.paymentAmount = order.balance || order.total || 0;
    if (this.paymentAmount <= 0) {
      this.showMessage('This order has no pending amount.', 'info');
      return;
    }
    this.finalizePaymentUi();
    this.processingPayment = true;
    this.processingLabel = 'Preparing payment...';
    this.cd();
    this.runCheckout(this.paymentAmount, false, [order]);
  }

  closePaymentModal() {
    this.showPaymentModal = false;
    this.selectedOrderForPayment = null;
    this.checkoutOrders = [];
    this.checkoutRzpOrders = [];
    this.isBulkPayment = false;
  }

  makePayment() {
    // Left empty since we launch Razorpay directly on placeOrder and openPaymentModal
  }

  get totalOrdersCount(): number {
    return this.orders.length;
  }

  get totalSpent(): number {
    return this.orders
      .filter(o => o.status === 'PLACED' || o.status === 'VERIFIED' || o.status === 'PICKED')
      .reduce((sum, o) => sum + (o.total || 0), 0);
  }

  get pendingPaymentsTotal(): number {
    return this.orders
      .filter(o => o.status === 'PENDING')
      .reduce((sum, o) => sum + (o.balance || o.total || 0), 0);
  }

  printInvoice(order: Order) {
    const orderId = order.id || order.orderId || 'N/A';
    const drugNames = order.drugNames || [];
    const quantities = order.quantities || [];
    const drugDetails = drugNames.map((name, i) => `${name} (x${quantities[i] || 1})`).join(', ');
    const doctorName = this.doctorUser?.name || 'N/A';
    const doctorEmail = this.doctorUser?.email || 'N/A';

    const invoiceHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice - ${orderId}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #1e293b; }
          .invoice-container { max-width: 700px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
          .invoice-header { background: linear-gradient(135deg, #0d9488, #0f766e); color: white; padding: 30px; display: flex; justify-content: space-between; align-items: center; }
          .invoice-header h1 { font-size: 28px; font-weight: 800; }
          .invoice-header span { font-size: 13px; opacity: 0.85; }
          .invoice-body { padding: 30px; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
          .info-box h4 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; margin-bottom: 6px; }
          .info-box p { font-size: 14px; font-weight: 600; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
          th { text-align: left; background-color: #f1f5f9; padding: 12px 16px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; border-bottom: 2px solid #e2e8f0; }
          td { padding: 14px 16px; font-size: 14px; border-bottom: 1px solid #f1f5f9; }
          .total-section { text-align: right; padding-top: 16px; border-top: 2px solid #e2e8f0; }
          .total-section .total-label { font-size: 14px; color: #64748b; margin-right: 12px; }
          .total-section .total-value { font-size: 24px; font-weight: 800; color: #0d9488; }
          .invoice-footer { background-color: #f8fafc; padding: 20px 30px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
          @media print { body { padding: 0; } .invoice-container { border: none; } }
        </style>
      </head>
      <body>
        <div class="invoice-container">
          <div class="invoice-header">
            <div>
              <h1>pharmacare</h1>
              <span>Pharmacy Management System</span>
            </div>
            <div style="text-align: right;">
              <span style="font-size: 16px; font-weight: 700; display: block;">INVOICE</span>
              <span>${orderId}</span>
            </div>
          </div>
          <div class="invoice-body">
            <div class="info-grid">
              <div class="info-box">
                <h4>Doctor</h4>
                <p>${doctorName}</p>
                <p style="font-size: 12px; color: #64748b; margin-top: 2px;">${doctorEmail}</p>
              </div>
              <div class="info-box">
                <h4>Order Details</h4>
                <p>Status: ${order.status}</p>
                <p style="font-size: 12px; color: #64748b; margin-top: 2px;">Pickup: ${order.pickupDate || 'Pending'}</p>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th style="text-align: center;">Quantity</th>
                  <th style="text-align: right;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${drugNames.map((name, i) => `
                  <tr>
                    <td>${name}</td>
                    <td style="text-align: center;">${quantities[i] || 1}</td>
                    <td style="text-align: right;">₹${(order.total || 0) * ((quantities[i] || 1) / quantities.reduce((a, b) => a + (b || 1), 0))}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div class="total-section">
              <span class="total-label">Grand Total:</span>
              <span class="total-value">₹${order.total || 0}</span>
            </div>
          </div>
          <div class="invoice-footer">
            &copy; ${new Date().getFullYear()} pharmacare &mdash; Generated automatically. For queries contact sales@eVital.in
          </div>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (printWindow) {
      printWindow.document.write(invoiceHtml);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
    }
  }
}
