// Legacy types (for backward compatibility)
export type AccountType = 'Aset' | 'Kewajiban' | 'Modal' | 'Pendapatan' | 'Beban';
export type AccountCategory = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type NormalBalance = 'debit' | 'credit';

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
  normalBalance?: NormalBalance; // Normal balance (debit/credit)
  category?: AccountCategory; // Account category for reporting

  // Employee assignment for cash accounts
  employeeId?: string; // ID karyawan yang ditugaskan untuk akun kas ini
  employeeName?: string; // Nama karyawan (dari join)
}

// Account tree node for hierarchical display
export interface AccountTreeNode {
  account: Account;
  children: AccountTreeNode[];
  level: number;
  isExpanded?: boolean;
}