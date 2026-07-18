import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { Drug, Order, User, OrderStatus, Notification } from '../../models';
import { forkJoin, Subscription, interval } from 'rxjs';
import { startWith, switchMap } from 'rxjs/operators';
import Chart from 'chart.js/auto';

declare var Razorpay: any;

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

  constructor(
    private apiService: ApiService,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.doctorUser = this.authService.getCurrentUser();
    this.loadDrugs();
    this.loadOrders();
    this.startNotificationPolling();
  }

  ngOnDestroy() {
    this.stopNotificationPolling();
  }

  setSection(section: 'dashboard' | 'order-drugs' | 'order-history' | 'view-drugs') {
    this.currentSection = section;
    if (section === 'dashboard') {
      setTimeout(() => {
        this.initCharts();
      }, 50);
    }
  }

  private startNotificationPolling() {
    this.stopNotificationPolling();
    if (!this.doctorUser) return;

    const email = this.doctorUser.email || this.doctorUser.userId || '';
    this.notifSub = interval(5000).pipe(
      startWith(0),
      switchMap(() => this.apiService.getNotificationsByUser(email))
    ).subscribe({
      next: (data) => {
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

  loadDrugs() {
    this.apiService.getDrugs().subscribe({
      next: (data) => {
        this.drugs = data;
        this.filteredDrugs = [...data];
        
        // Initialize quantities map with 1
        this.drugs.forEach(d => {
          const key = d.id! || d.drugId!;
          this.quantitiesMap[key] = 1;
        });
      },
      error: (err) => console.error('Failed to load drugs', err)
    });
  }

  loadOrders() {
    this.doctorUser = this.authService.getCurrentUser();
    if (this.doctorUser) {
      const userId = this.doctorUser.email || this.doctorUser.userId || '';
      this.apiService.getOrdersByUser(userId).subscribe({
        next: (data) => {
          this.orders = data;
          this.orders.sort((a, b) => {
            const idA = a.id || a.orderId || '';
            const idB = b.id || b.orderId || '';
            return idB > idA ? 1 : -1;
          });
          // Initialize/refresh charts on load
          if (this.currentSection === 'dashboard') {
            setTimeout(() => {
              this.initCharts();
            }, 100);
          }
        },
        error: (err) => console.error('Failed to load orders', err)
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
      alert(`Insufficient stock. Only ${drug.stock} items available.`);
      return;
    }

    const existing = this.cart.find(item => (item.drug.id === drug.id || item.drug.drugId === drug.drugId));
    if (existing) {
      if (existing.quantity + qty > drug.stock) {
        alert(`Cannot add more. Combined cart quantity exceeds stock of ${drug.stock}.`);
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
    
    this.processingPayment = true;
    this.paymentSuccessMsg = '';
    this.showPaymentModal = false;
    this.paymentAmount = this.cartTotal;
    this.isBulkPayment = true;
    this.checkoutOrders = [];
    this.checkoutRzpOrders = [];

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

        // Launch real Razorpay checkout popup directly
        this.launchRazorpayCheckout(totalToPay, true, createdOrders);
      },
      error: (err) => {
        this.processingPayment = false;
        alert('Failed to place orders. Please try again.');
        console.error(err);
      }
    });
  }

  launchRazorpayCheckout(amount: number, isBulk: boolean, orders: Order[]) {
    if (amount <= 0) {
      alert('Invalid payment amount.');
      this.processingPayment = false;
      return;
    }

    this.processingPayment = true;

    const options = {
      key: 'rzp_test_SkUT7TYdihPuCN',
      amount: Math.round(amount * 100), // in paise
      currency: 'INR',
      name: 'Pharmacare Pharmacy',
      description: isBulk ? 'Bulk Order Payment' : 'Order Payment',
      image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=100&q=80',
      handler: (response: any) => {
        console.log('Razorpay payment successful:', response);
        const paymentId = response.razorpay_payment_id;

        if (isBulk) {
          // Parallel payment success callbacks for all bulk orders!
          const paymentCallbacks = orders.map(order => {
            const orderId = order.id || order.orderId || '';
            const orderAmount = order.total || 0;
            // Generate a unique dummy Razorpay Order ID for each sub-payment
            const dummyRzpOrderId = 'order_bulk_' + orderId + '_' + Math.random().toString(36).substring(2, 7);

            return this.apiService.submitPaymentSuccess({
              orderId: orderId,
              amount: orderAmount,
              paymentId: paymentId,
              signature: '', // dynamically calculated by api.service.ts
              razorpayOrderId: dummyRzpOrderId
            });
          });

          forkJoin(paymentCallbacks).subscribe({
            next: (responses) => {
              // Direct frontend state sync update to PLACED for maximum resilience
              const statusUpdates = orders.map(order => {
                const orderId = order.id || order.orderId || '';
                return this.apiService.updateOrderStatus(orderId, 'PLACED');
              });

              forkJoin(statusUpdates).subscribe({
                next: () => {
                  this.processingPayment = false;
                  alert(`Checkout successful! Total Paid: ₹${amount}. Razorpay Payment ID: ${paymentId}`);
                  this.loadOrders();
                },
                error: (err) => {
                  console.error('Failed to sync order states directly:', err);
                  this.processingPayment = false;
                  alert(`Checkout successful! Total Paid: ₹${amount}. Razorpay Payment ID: ${paymentId}`);
                  this.loadOrders();
                }
              });
            },
            error: (err) => {
              this.processingPayment = false;
              alert('Payment callback verification failed.');
              console.error(err);
              this.loadOrders();
            }
          });
        } else {
          // Single order payment from history
          const order = orders[0];
          const orderId = order.id || order.orderId || '';
          const dummyRzpOrderId = 'order_' + orderId + '_' + Math.random().toString(36).substring(2, 7);

          this.apiService.submitPaymentSuccess({
            orderId: orderId,
            amount: amount,
            paymentId: paymentId,
            signature: '', // dynamically calculated by api.service.ts
            razorpayOrderId: dummyRzpOrderId
          }).subscribe({
            next: (res) => {
              // Direct frontend state sync update to PLACED
              this.apiService.updateOrderStatus(orderId, 'PLACED').subscribe({
                next: () => {
                  this.processingPayment = false;
                  alert(`Payment successful! Razorpay Payment ID: ${paymentId}`);
                  this.loadOrders();
                },
                error: (err) => {
                  console.error('Failed to sync order state directly:', err);
                  this.processingPayment = false;
                  alert(`Payment successful! Razorpay Payment ID: ${paymentId}`);
                  this.loadOrders();
                }
              });
            },
            error: (err) => {
              this.processingPayment = false;
              alert('Payment callback verification failed.');
              console.error(err);
              this.loadOrders();
            }
          });
        }
      },
      prefill: {
        name: this.doctorUser?.name || '',
        email: this.doctorUser?.email || '',
        contact: this.doctorUser?.contact || ''
      },
      theme: {
        color: '#2563eb'
      },
      modal: {
        ondismiss: () => {
          console.log('Payment modal dismissed');
          this.processingPayment = false;
          
          // Call payment failure endpoint to mark orders as FAILED
          if (isBulk) {
            const failCallbacks = orders.map(order => {
              const orderId = order.id || order.orderId || '';
              const orderAmount = order.total || 0;
              return this.apiService.submitPaymentFailure({ orderId: orderId, amount: orderAmount });
            });
            forkJoin(failCallbacks).subscribe({
              next: () => this.loadOrders(),
              error: () => this.loadOrders()
            });
          } else {
            const order = orders[0];
            const orderId = order.id || order.orderId || '';
            this.apiService.submitPaymentFailure({ orderId: orderId, amount: amount }).subscribe({
              next: () => this.loadOrders(),
              error: () => this.loadOrders()
            });
          }
          alert('Payment cancelled.');
        }
      }
    };

    const rzp = new Razorpay(options);
    rzp.open();
  }

  openPaymentModal(order: Order) {
    this.isBulkPayment = false;
    this.selectedOrderForPayment = order;
    this.paymentAmount = order.balance || order.total || 0;
    
    // Launch Razorpay directly instead of opening modal
    this.launchRazorpayCheckout(this.paymentAmount, false, [order]);
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
