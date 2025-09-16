export interface AccountsPayable {
  id: string;
  purchaseOrderId: string;
  supplierName: string;
  amount: number;
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