export interface EmployeeAdvance {
  id: string;
  employeeId: string;
  employeeName: string;
  amount: number;
  date: Date;
  notes?: string;
  remainingAmount: number; // Sisa utang
  repayments: AdvanceRepayment[];
  createdAt: Date;
  accountId: string; // BARU: Akun sumber dana
  accountName: string; // BARU: Nama akun sumber dana
}

export interface AdvanceRepayment {
  id: string;
  amount: number;
  date: Date;
  recordedBy: string; // Siapa yang mencatat pembayaran
}