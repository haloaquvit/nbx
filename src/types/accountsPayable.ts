export interface AccountsPayable {
  id: string;
  purchaseOrderId?: string | null;
  supplierName: string;
  creditorType?: 'supplier' | 'bank' | 'credit_card' | 'other';
  amount: number;
  interestRate?: number;
  interestType?: 'flat' | 'per_month' | 'per_year';
  dueDate?: Date;
  description: string;
  status: 'Outstanding' | 'Paid' | 'Partial';
  createdAt: Date;
  paidAt?: Date;
  paidAmount?: number;
  paymentAccountId?: string;
  notes?: string;
}

export interface PayablePayment {
  id: string;
  accountsPayableId: string;
  amount: number;
  paymentDate: Date;
  paymentAccountId: string;
  paymentAccountName: string;
  notes?: string;
  createdAt: Date;
}