// Legacy types (for backward compatibility)
export type AccountType = 'Aset' | 'Kewajiban' | 'Modal' | 'Pendapatan' | 'Beban';

// Enhanced types for Chart of Accounts
export type AccountCategory = 
  | 'ASET' | 'KEWAJIBAN' | 'MODAL' 
  | 'PENDAPATAN' | 'HPP' | 'BEBAN_OPERASIONAL' 
  | 'PENDAPATAN_NON_OPERASIONAL' | 'BEBAN_NON_OPERASIONAL';

export type NormalBalance = 'DEBIT' | 'CREDIT';

export interface Account {
  id: string;
  name: string;
  type: AccountType; // Legacy field
  balance: number; // Saldo saat ini (dihitung dari initial_balance + transaksi)
  initialBalance: number; // Saldo awal yang diinput owner
  isPaymentAccount: boolean; // Menandai akun yang bisa menerima pembayaran
  createdAt: Date;

  // Enhanced Chart of Accounts fields
  code?: string; // Kode akun standar (1000, 1100, 1110, dst)
  parentId?: string; // ID parent account untuk hierarki
  level?: number; // Level hierarki: 1=Header, 2=Sub-header, 3=Detail, 4=Sub-detail
  normalBalance?: NormalBalance; // Saldo normal: DEBIT atau CREDIT
  isHeader?: boolean; // Apakah ini header account (tidak bisa digunakan untuk transaksi)
  isActive?: boolean; // Status aktif account
  sortOrder?: number; // Urutan tampilan dalam laporan
  branchId?: string; // Branch ID untuk multi-branch COA
}

// Enhanced Account interface untuk CoA (future use)
export interface EnhancedAccount {
  id: string;
  code: string; // 4 digit kode (1000, 1010, 1011)
  name: string;
  category: AccountCategory; // Kategori utama
  parentId?: string; // Parent account
  level: number; // Level hierarki
  normalBalance: NormalBalance; // Saldo normal
  isHeader: boolean; // Header atau detail account
  isActive: boolean; // Status aktif
  isPaymentAccount: boolean;
  sortOrder: number;
  balance: number;
  initialBalance: number;
  createdAt: Date;
  
  // Additional computed fields
  children?: EnhancedAccount[]; // Child accounts
  fullPath?: string; // Full path for display
  indentedName?: string; // Indented name for tree view
}

// Account tree node for hierarchical display
export interface AccountTreeNode {
  account: Account | EnhancedAccount;
  children: AccountTreeNode[];
  level: number;
  isExpanded?: boolean;
}

// Chart of Accounts utility types
export interface CoAStructure {
  headers: Account[];
  details: Account[];
  tree: AccountTreeNode[];
}

// Standard Chart of Accounts template
export interface CoATemplate {
  code: string;
  name: string;
  category: AccountCategory;
  level: number;
  normalBalance: NormalBalance;
  isHeader: boolean;
  parentCode?: string;
  sortOrder: number;
}