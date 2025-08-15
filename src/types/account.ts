export type AccountType = 'Aset' | 'Kewajiban' | 'Modal' | 'Pendapatan' | 'Beban';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  balance: number; // Saldo saat ini (dihitung dari initial_balance + transaksi)
  initialBalance: number; // Saldo awal yang diinput owner
  isPaymentAccount: boolean; // Menandai akun yang bisa menerima pembayaran
  createdAt: Date;
}