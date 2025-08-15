export interface Expense {
  id: string;
  description: string;
  amount: number;
  accountId?: string; // Akun mana yang digunakan untuk membayar (opsional)
  accountName?: string;
  date: Date;
  category: string;
  createdAt: Date;
}