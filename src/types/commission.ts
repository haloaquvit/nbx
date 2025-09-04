export interface CommissionRule {
  id: string
  productId: string
  productName: string
  productSku?: string
  role: 'sales' | 'driver' | 'helper'
  ratePerQty: number
  createdAt: Date
  updatedAt: Date
}

export interface CommissionEntry {
  id: string
  userId: string
  userName: string
  role: 'sales' | 'driver' | 'helper'
  productId: string
  productName: string
  productSku?: string
  quantity: number
  ratePerQty: number
  amount: number
  transactionId?: string
  deliveryId?: string
  ref: string
  createdAt: Date
  status: 'pending' | 'paid' | 'cancelled'
}

export interface CommissionSummary {
  userId: string
  userName: string
  role: 'sales' | 'driver' | 'helper'
  totalAmount: number
  totalQuantity: number
  entryCount: number
}

export interface SalesCommissionSetting {
  id: string;
  salesId: string;
  salesName: string;
  commissionType: 'percentage' | 'fixed';
  commissionValue: number; // Percentage (0-100) or fixed amount
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface SalesCommissionReport {
  salesId: string;
  salesName: string;
  totalSales: number;
  totalTransactions: number;
  commissionEarned: number;
  commissionType: 'percentage' | 'fixed';
  commissionRate: number;
  period: {
    startDate: Date;
    endDate: Date;
  };
  transactions: SalesCommissionTransaction[];
}

export interface SalesCommissionTransaction {
  id: string;
  transactionId: string;
  customerName: string;
  orderDate: Date;
  totalAmount: number;
  commissionAmount: number;
  status: 'pending' | 'paid';
}