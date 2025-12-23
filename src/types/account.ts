// Legacy types (for backward compatibility)
export type AccountType = 'Aset' | 'Kewajiban' | 'Modal' | 'Pendapatan' | 'Beban';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  balance: number; // Saldo saat ini (dihitung dari initial_balance + transaksi)
  initialBalance: number; // Saldo awal yang diinput owner
  isPaymentAccount: boolean; // Menandai akun yang bisa menerima pembayaran
  createdAt: Date;

  // Chart of Accounts fields
  code?: string; // Kode akun standar (1000, 1100, 1110, dst)
  parentId?: string; // ID parent account untuk hierarki
  level?: number; // Level hierarki: 1=Header, 2=Sub-header, 3=Detail
  isHeader?: boolean; // Apakah ini header account (tidak bisa digunakan untuk transaksi)
  isActive?: boolean; // Status aktif account
  sortOrder?: number; // Urutan tampilan dalam laporan
  branchId?: string; // Branch ID untuk multi-branch COA
}

// Account tree node for hierarchical display
export interface AccountTreeNode {
  account: Account;
  children: AccountTreeNode[];
  level: number;
  isExpanded?: boolean;
}