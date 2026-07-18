export interface User {
  id?: string;
  userId?: string;
  name: string;
  email: string;
  contact: string;
  password?: string;
  role: 'doctor' | 'admin' | 'DOCTOR' | 'ADMIN';
  token?: string; // JWT token string
}

export interface Drug {
  id?: string;
  drugId?: string; // Mapper alias
  name: string;
  description?: string;
  price: number;
  stock: number;
  batchId?: string;
  expireDate?: string;
  supplierEmail?: string;
  photoUrl?: string;
  category?: string;
}

export interface Supplier {
  id?: string;
  name: string;
  email: string;
  contact: string;
  address: string;
}

// Fixed Order Statuses: PENDING -> PLACED -> FAILED -> CANCELLED -> VERIFIED -> PICKED
export type OrderStatus = 'PENDING' | 'PLACED' | 'FAILED' | 'CANCELLED' | 'VERIFIED' | 'PICKED';

export interface Order {
  id?: string;
  orderId?: string;
  userId: string; // Doctor's email/ID
  drugId: string; // Medicine ID
  quantity: number;
  total?: number;
  status: OrderStatus;
  pickupDate?: string;
  paidAmount?: number;
  balance?: number;
  paid?: boolean;

  // Joined display attributes (optional, joined by API service)
  drugName?: string;
  drugPrice?: number;
  doctorName?: string;
  doctorContact?: string;
  doctorEmail?: string;
  
  // Array support for legacy mockup UI display compatibility
  drugNames?: string[];
  drugPrices?: number[];
  quantities?: number[];
}

export interface SalesReport {
  id?: string;
  drugName: string;
  dateAndTime: string;
  totalAmount: number;
  paidAmount: number;
  balance: number;
}

export interface Notification {
  id?: string;
  userId: string;
  message: string;
  type?: string; // BROADCAST, ORDER, PAYMENT, DRUG
  timestamp: string;
  read?: boolean;
}
