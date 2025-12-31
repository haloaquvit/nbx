export interface AccountsPayable {
  id: string;
  purchaseOrderId?: string | null;
  supplierName: string;
  creditorType?: 'supplier' | 'bank' | 'credit_card' | 'other';
  amount: number;
  interestRate?: number;
  interestType?: 'flat' | 'per_month' | 'per_year';
  tenorMonths?: number; // Tenor dalam bulan untuk cicilan
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

// Interface untuk jadwal angsuran hutang
export interface DebtInstallment {
  id: string;
  debtId: string;
  installmentNumber: number;
  dueDate: Date;
  principalAmount: number; // Pokok
  interestAmount: number;  // Bunga
  totalAmount: number;     // Total = Pokok + Bunga
  status: 'pending' | 'paid' | 'overdue';
  paidAt?: Date;
  paidAmount?: number;
  paymentAccountId?: string;
  notes?: string;
  branchId?: string;
  createdAt: Date;
}

// Input untuk generate jadwal angsuran
export interface GenerateInstallmentInput {
  debtId: string;
  principal: number;        // Total pokok hutang
  interestRate: number;     // Persentase bunga
  interestType: 'flat' | 'per_month' | 'per_year';
  tenorMonths: number;      // Berapa bulan cicilan
  startDate: Date;          // Tanggal mulai cicilan
  branchId?: string;
}