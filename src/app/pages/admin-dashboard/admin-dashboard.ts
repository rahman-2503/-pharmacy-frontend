import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { Drug, Supplier, Order, SalesReport, Notification } from '../../models';
import { forkJoin, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import Chart from 'chart.js/auto';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.css'
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  // Top Level Sections: 'analytics' | 'drugs-list' | 'drugs-form' | 'suppliers' | 'orders' | 'reports' | 'change-password'
  currentSection: 'analytics' | 'drugs-list' | 'drugs-form' | 'suppliers' | 'orders' | 'reports' | 'change-password' = 'analytics';

  // Chart references
  ordersChart: any;
  salesChartObj: any;
  stockChart: any;

  // Sub-tabs
  drugsTab: 'form' | 'list' = 'list';
  suppliersTab: 'form' | 'list' = 'list';
  ordersTab: 'new' | 'verified' | 'pickedUp' = 'new';
  reportsTab: 'chart' | 'report' = 'report';

  // Data arrays
  drugs: Drug[] = [];
  filteredDrugs: Drug[] = [];
  suppliers: Supplier[] = [];
  orders: Order[] = [];
  salesReports: SalesReport[] = [];
  doctors: string[] = []; // To send notifications to

  // Search queries
  drugSearchQuery: string = '';

  // Forms Binding Model
  drugFormModel: Drug = this.resetDrugForm();
  isEditingDrug = false;

  supplierFormModel: Supplier = this.resetSupplierForm();
  isEditingSupplier = false;

  // Notification form model
  notifFormModel = {
    userId: '',
    message: ''
  };

  // Order verify state
  verifyingOrderId: string | null = null;
  verifyPickupDate: string = '';

  // Sales aggregates
  totalSalesValue = 0;
  totalCollections = 0;
  totalOutstanding = 0;

  loading = false;
  dataLoaded = false;
  loadError = false;
  loadingCharts = false;
  loadingDrugs = false;
  loadingOrders = false;
  loadingSuppliers = false;
  private destroy$ = new Subject<void>();
  private readonly CACHE_KEY = 'admin_dashboard_cache_v1';

  constructor(private apiService: ApiService) {}

  ngOnInit() {
    this.restoreFromCache();
    this.loadAllData();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  reloadData() {
    this.dataLoaded = false;
    this.loadAllData();
  }

  private restoreFromCache() {
    try {
      const raw = localStorage.getItem(this.CACHE_KEY);
      if (raw) {
        const c = JSON.parse(raw);
        this.drugs = c.drugs || [];
        this.filteredDrugs = [...this.drugs];
        this.suppliers = c.suppliers || [];
        this.orders = c.orders || [];
        this.salesReports = c.salesReports || [];
        this.calculateSalesAggregates();
        this.dataLoaded = true;
      }
    } catch { /* ignore cache errors */ }
  }

  private persistCache() {
    try {
      localStorage.setItem(this.CACHE_KEY, JSON.stringify({
        drugs: this.drugs,
        suppliers: this.suppliers,
        orders: this.orders,
        salesReports: this.salesReports,
        ts: Date.now()
      }));
    } catch { /* ignore */ }
  }

  setSection(section: 'analytics' | 'drugs-list' | 'drugs-form' | 'suppliers' | 'orders' | 'reports' | 'change-password') {
    this.currentSection = section;
    if (section === 'analytics') {
      setTimeout(() => {
        this.initCharts();
      }, 150);
    }
  }

  loadAllData() {
    if (this.dataLoaded) return;
    this.loading = true;
    this.loadError = false;
    forkJoin([
      this.apiService.getDrugs(),
      this.apiService.getSuppliers(),
      this.apiService.getOrders(),
      this.apiService.getSalesReports()
    ]).pipe(takeUntil(this.destroy$)).subscribe({
      next: ([drugs, suppliers, orders, reports]) => {
        this.drugs = drugs;
        this.filteredDrugs = [...drugs];
        this.suppliers = suppliers;
        this.orders = orders.map(o => this.apiService.joinOrderWithDrug(o, drugs));
        
        const emails = new Set<string>();
        orders.forEach(o => {
          if (o.doctorEmail) emails.add(o.doctorEmail);
        });
        this.doctors = Array.from(emails);

        this.salesReports = reports;
        this.calculateSalesAggregates();
        this.loading = false;
        this.dataLoaded = true;
        this.persistCache();
        
        if (this.currentSection === 'analytics') {
          setTimeout(() => {
            this.initCharts();
          }, 100);
        }
      },
      error: (err) => {
        console.error('Failed to load admin dashboard data', err);
        this.loading = false;
        this.loadError = true;
      }
    });
  }

  initCharts() {
    // Destroy existing charts to prevent canvas reuse errors
    if (this.ordersChart) this.ordersChart.destroy();
    if (this.salesChartObj) this.salesChartObj.destroy();
    if (this.stockChart) this.stockChart.destroy();

    // 1. Orders Chart (Doughnut)
    const ordersCanvas = document.getElementById('ordersChart') as HTMLCanvasElement;
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

    // 2. Sales Chart (Bar chart)
    const salesCanvas = document.getElementById('salesChart') as HTMLCanvasElement;
    if (salesCanvas) {
      const drugSales: { [key: string]: number } = {};
      this.salesReports.forEach(r => {
        drugSales[r.drugName] = (drugSales[r.drugName] || 0) + r.totalAmount;
      });

      this.salesChartObj = new Chart(salesCanvas, {
        type: 'bar',
        data: {
          labels: Object.keys(drugSales),
          datasets: [{
            label: 'Sales Revenue (₹)',
            data: Object.values(drugSales),
            backgroundColor: '#0d9488',
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

    // 3. Stock Level Chart (Horizontal Bar Chart)
    const stockCanvas = document.getElementById('stockChart') as HTMLCanvasElement;
    if (stockCanvas) {
      const drugNames = this.drugs.map(d => d.name);
      const stockLevels = this.drugs.map(d => d.stock);

      this.stockChart = new Chart(stockCanvas, {
        type: 'bar',
        data: {
          labels: drugNames,
          datasets: [{
            label: 'Stock Quantity',
            data: stockLevels,
            backgroundColor: '#0284c7',
            borderRadius: 6
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { beginAtZero: true }
          }
        }
      });
    }
  }

  loadDrugs() {
    this.apiService.getDrugs().subscribe(data => {
      this.drugs = data;
      this.applyDrugSearch();
    });
  }

  loadSuppliers() {
    this.apiService.getSuppliers().subscribe(data => {
      this.suppliers = data;
    });
  }

  loadOrders() {
    this.apiService.getOrders().subscribe(data => {
      this.orders = data;
      
      const emails = new Set<string>();
      data.forEach(o => {
        if (o.doctorEmail) emails.add(o.doctorEmail);
      });
      this.doctors = Array.from(emails);
    });
  }

  loadReports() {
    this.apiService.getSalesReports().subscribe(data => {
      this.salesReports = data;
      this.calculateSalesAggregates();
    });
  }

  calculateSalesAggregates() {
    this.totalSalesValue = this.salesReports.reduce((sum, r) => sum + r.totalAmount, 0);
    this.totalCollections = this.salesReports.reduce((sum, r) => sum + r.paidAmount, 0);
    this.totalOutstanding = this.salesReports.reduce((sum, r) => sum + r.balance, 0);
  }

  // --- Search actions ---
  applyDrugSearch() {
    if (!this.drugSearchQuery) {
      this.filteredDrugs = [...this.drugs];
    } else {
      const q = this.drugSearchQuery.toLowerCase();
      this.filteredDrugs = this.drugs.filter(d => 
        d.name.toLowerCase().includes(q) || (d.category?.toLowerCase() || '').includes(q)
      );
    }
  }

  // --- Drugs CRUD Form ---
  resetDrugForm(): Drug {
    return {
      name: '',
      price: 100,
      stock: 50,
      photoUrl: '',
      category: ''
    };
  }

  submitDrugForm() {
    if (this.isEditingDrug) {
      this.apiService.updateDrug(this.drugFormModel).subscribe({
        next: () => {
          alert('Drug inventory stock updated successfully!');
          this.isEditingDrug = false;
          this.drugFormModel = this.resetDrugForm();
          this.setSection('drugs-list');
          this.loadDrugs();
        },
        error: (err) => alert('Failed to update drug: ' + err.message)
      });
    } else {
      this.apiService.addDrug(this.drugFormModel).subscribe({
        next: () => {
          alert('Drug cataloged and stock registered successfully!');
          this.drugFormModel = this.resetDrugForm();
          this.setSection('drugs-list');
          this.loadDrugs();
        },
        error: (err) => alert('Failed to catalog drug: ' + err.message)
      });
    }
  }

  editDrug(drug: Drug) {
    this.drugFormModel = { ...drug };
    this.isEditingDrug = true;
    this.currentSection = 'drugs-form';
  }

  deleteDrug(id: string) {
    if (confirm('Are you sure you want to delete this drug from inventory?')) {
      this.apiService.deleteDrug(id).subscribe({
        next: () => {
          alert('Drug deleted successfully');
          this.loadDrugs();
        },
        error: (err) => alert('Failed to delete drug')
      });
    }
  }

  // --- Suppliers CRUD ---
  resetSupplierForm(): Supplier {
    return {
      name: '',
      email: '',
      contact: '',
      address: ''
    };
  }

  submitSupplierForm() {
    if (this.isEditingSupplier) {
      this.apiService.updateSupplier(this.supplierFormModel).subscribe({
        next: () => {
          alert('Supplier updated successfully!');
          this.suppliersTab = 'list';
          this.isEditingSupplier = false;
          this.supplierFormModel = this.resetSupplierForm();
          this.loadSuppliers();
        },
        error: (err) => alert('Failed to update supplier')
      });
    } else {
      this.apiService.addSupplier(this.supplierFormModel).subscribe({
        next: () => {
          alert('Supplier registered successfully!');
          this.suppliersTab = 'list';
          this.supplierFormModel = this.resetSupplierForm();
          this.loadSuppliers();
        },
        error: (err) => alert('Failed to add supplier')
      });
    }
  }

  editSupplier(supplier: Supplier) {
    this.supplierFormModel = { ...supplier };
    this.isEditingSupplier = true;
    this.suppliersTab = 'form';
  }

  deleteSupplier(id: string) {
    if (confirm('Are you sure you want to delete this supplier?')) {
      this.apiService.deleteSupplier(id).subscribe({
        next: () => {
          alert('Supplier deleted successfully');
          this.loadSuppliers();
        },
        error: (err) => alert('Failed to delete supplier')
      });
    }
  }

  // --- Orders Audit & Status Transitions ---
  startVerification(orderId: string) {
    this.verifyingOrderId = orderId;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    this.verifyPickupDate = tomorrow.toISOString().substring(0, 10);
  }

  cancelVerification() {
    this.verifyingOrderId = null;
    this.verifyPickupDate = '';
  }

  submitVerification(id: string) {
    if (!this.verifyPickupDate) {
      alert('Please specify a pickup date');
      return;
    }

    // Verify order and set status to VERIFIED (microservices lifecycle)
    this.apiService.updateOrderStatus(id, 'VERIFIED', this.verifyPickupDate).subscribe({
      next: () => {
        alert('Order status transitioned to VERIFIED!');
        this.verifyingOrderId = null;
        this.loadOrders();
        this.loadReports();
      },
      error: (err) => alert('Failed to verify order')
    });
  }

  markOrderPickedUp(id: string) {
    // Pick up order and transition status to PICKED
    this.apiService.updateOrderStatus(id, 'PICKED').subscribe({
      next: () => {
        alert('Order picked up! Status transitioned to PICKED.');
        this.loadOrders();
        this.loadReports();
      },
      error: (err) => alert('Failed to complete dispatch')
    });
  }

  // --- Send Custom Notification ---
  sendCustomNotif() {
    if (!this.notifFormModel.userId || !this.notifFormModel.message) {
      alert('Please select a recipient and input a message');
      return;
    }

    const notif: Notification = {
      userId: this.notifFormModel.userId,
      message: this.notifFormModel.message,
      timestamp: new Date().toISOString(),
      type: 'BROADCAST'
    };

    this.apiService.sendNotification(notif).subscribe({
      next: () => {
        alert('Alert notification sent successfully!');
        this.notifFormModel.message = '';
      },
      error: (err) => alert('Failed to dispatch alert.')
    });
  }

  // --- Broadcast to all doctors ---
  broadcastNotif() {
    if (!this.notifFormModel.message) {
      alert('Please enter a message');
      return;
    }

    const notif: Notification = {
      userId: 'BROADCAST',
      message: this.notifFormModel.message,
      timestamp: new Date().toISOString(),
      type: 'BROADCAST'
    };

    this.apiService.sendNotification(notif).subscribe({
      next: () => {
        alert('Broadcast notification sent to all doctors!');
        this.notifFormModel.message = '';
      },
      error: (err) => alert('Failed to broadcast.')
    });
  }

  // Change Password state
  showPasswordModal = false;
  passwordFormModel = {
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
  };
  passwordError: string | null = null;
  passwordSuccess = '';
  processingPassword = false;

  openPasswordModal() {
    this.showPasswordModal = true;
    this.passwordFormModel = { oldPassword: '', newPassword: '', confirmPassword: '' };
    this.passwordError = null;
    this.passwordSuccess = '';
    this.processingPassword = false;
  }

  closePasswordModal() {
    this.showPasswordModal = false;
  }

  submitPasswordChange() {
    this.passwordError = null;
    this.passwordSuccess = '';

    if (this.passwordFormModel.newPassword !== this.passwordFormModel.confirmPassword) {
      this.passwordError = 'Passwords do not match.';
      return;
    }

    if (this.passwordFormModel.newPassword.length < 4) {
      this.passwordError = 'Password must be at least 4 characters.';
      return;
    }

    this.processingPassword = true;
    this.apiService.changeAdminPassword(
      this.passwordFormModel.oldPassword,
      this.passwordFormModel.newPassword
    ).subscribe({
      next: (res) => {
        this.processingPassword = false;
        this.passwordSuccess = 'Password changed successfully!';
        setTimeout(() => {
          this.passwordSuccess = '';
          this.passwordFormModel = { oldPassword: '', newPassword: '', confirmPassword: '' };
          this.setSection('analytics');
        }, 600);
      },
      error: (err) => {
        this.processingPassword = false;
        this.passwordError = err.error || err.message || 'Failed to change password. Please check your credentials.';
      }
    });
  }

  // --- Export Reports ---
  printReport() {
    window.print();
  }

  downloadCSV() {
    if (this.salesReports.length === 0) {
      alert('No data available to download.');
      return;
    }

    const headers = ['Drug Name', 'Date and Time', 'Total Amount', 'Paid Amount', 'Balance'];
    const rows = this.salesReports.map(r => [
      `"${r.drugName}"`,
      r.dateAndTime,
      r.totalAmount,
      r.paidAmount,
      r.balance
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Sales_Report_${new Date().toISOString().substring(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  hasOrdersWithStatus(statuses: string[]): boolean {
    return this.orders.some(o => statuses.includes(o.status));
  }
}
