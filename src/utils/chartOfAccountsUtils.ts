/**
 * Chart of Accounts Utilities
 * Utilities for managing hierarchical account structures
 */

import { Account, AccountTreeNode, CoATemplate, AccountCategory, NormalBalance } from '@/types/account';

// Standard Chart of Accounts Template untuk Aquvit
export const STANDARD_COA_TEMPLATE: CoATemplate[] = [
  // ========== ASET ==========
  { code: '1000', name: 'ASET', category: 'ASET', level: 1, normalBalance: 'DEBIT', isHeader: true, sortOrder: 1000 },
  
  // Kas dan Setara Kas
  { code: '1100', name: 'Kas dan Setara Kas', category: 'ASET', level: 2, normalBalance: 'DEBIT', isHeader: true, parentCode: '1000', sortOrder: 1100 },
  { code: '1110', name: 'Kas Tunai', category: 'ASET', level: 3, normalBalance: 'DEBIT', isHeader: false, parentCode: '1100', sortOrder: 1110 },
  { code: '1111', name: 'Bank BCA', category: 'ASET', level: 3, normalBalance: 'DEBIT', isHeader: false, parentCode: '1100', sortOrder: 1111 },
  { code: '1112', name: 'Bank Mandiri', category: 'ASET', level: 3, normalBalance: 'DEBIT', isHeader: false, parentCode: '1100', sortOrder: 1112 },
  { code: '1113', name: 'Bank Lainnya', category: 'ASET', level: 3, normalBalance: 'DEBIT', isHeader: false, parentCode: '1100', sortOrder: 1113 },
  
  // Piutang
  { code: '1200', name: 'Piutang', category: 'ASET', level: 2, normalBalance: 'DEBIT', isHeader: true, parentCode: '1000', sortOrder: 1200 },
  { code: '1210', name: 'Piutang Usaha', category: 'ASET', level: 3, normalBalance: 'DEBIT', isHeader: false, parentCode: '1200', sortOrder: 1210 },
  { code: '1220', name: 'Piutang Karyawan', category: 'ASET', level: 3, normalBalance: 'DEBIT', isHeader: false, parentCode: '1200', sortOrder: 1220 },
  
  // Persediaan
  { code: '1300', name: 'Persediaan', category: 'ASET', level: 2, normalBalance: 'DEBIT', isHeader: true, parentCode: '1000', sortOrder: 1300 },
  { code: '1310', name: 'Persediaan Bahan Baku', category: 'ASET', level: 3, normalBalance: 'DEBIT', isHeader: false, parentCode: '1300', sortOrder: 1310 },
  { code: '1320', name: 'Persediaan Produk Jadi', category: 'ASET', level: 3, normalBalance: 'DEBIT', isHeader: false, parentCode: '1300', sortOrder: 1320 },
  
  // Aset Tetap
  { code: '1400', name: 'Aset Tetap', category: 'ASET', level: 2, normalBalance: 'DEBIT', isHeader: true, parentCode: '1000', sortOrder: 1400 },
  { code: '1410', name: 'Peralatan Produksi', category: 'ASET', level: 3, normalBalance: 'DEBIT', isHeader: false, parentCode: '1400', sortOrder: 1410 },
  { code: '1420', name: 'Kendaraan', category: 'ASET', level: 3, normalBalance: 'DEBIT', isHeader: false, parentCode: '1400', sortOrder: 1420 },
  
  // ========== KEWAJIBAN ==========
  { code: '2000', name: 'KEWAJIBAN', category: 'KEWAJIBAN', level: 1, normalBalance: 'CREDIT', isHeader: true, sortOrder: 2000 },
  
  // Kewajiban Lancar
  { code: '2100', name: 'Kewajiban Lancar', category: 'KEWAJIBAN', level: 2, normalBalance: 'CREDIT', isHeader: true, parentCode: '2000', sortOrder: 2100 },
  { code: '2110', name: 'Utang Usaha', category: 'KEWAJIBAN', level: 3, normalBalance: 'CREDIT', isHeader: false, parentCode: '2100', sortOrder: 2110 },
  { code: '2120', name: 'Utang Gaji', category: 'KEWAJIBAN', level: 3, normalBalance: 'CREDIT', isHeader: false, parentCode: '2100', sortOrder: 2120 },
  { code: '2130', name: 'Utang Pajak', category: 'KEWAJIBAN', level: 3, normalBalance: 'CREDIT', isHeader: false, parentCode: '2100', sortOrder: 2130 },
  
  // ========== MODAL ==========
  { code: '3000', name: 'MODAL', category: 'MODAL', level: 1, normalBalance: 'CREDIT', isHeader: true, sortOrder: 3000 },
  { code: '3100', name: 'Modal Pemilik', category: 'MODAL', level: 2, normalBalance: 'CREDIT', isHeader: false, parentCode: '3000', sortOrder: 3100 },
  { code: '3200', name: 'Laba Ditahan', category: 'MODAL', level: 2, normalBalance: 'CREDIT', isHeader: false, parentCode: '3000', sortOrder: 3200 },
  { code: '3300', name: 'Prive', category: 'MODAL', level: 2, normalBalance: 'DEBIT', isHeader: false, parentCode: '3000', sortOrder: 3300 },
  
  // ========== PENDAPATAN ==========
  { code: '4000', name: 'PENDAPATAN', category: 'PENDAPATAN', level: 1, normalBalance: 'CREDIT', isHeader: true, sortOrder: 4000 },
  { code: '4100', name: 'Pendapatan Penjualan', category: 'PENDAPATAN', level: 2, normalBalance: 'CREDIT', isHeader: false, parentCode: '4000', sortOrder: 4100 },
  { code: '4200', name: 'Pendapatan Jasa', category: 'PENDAPATAN', level: 2, normalBalance: 'CREDIT', isHeader: false, parentCode: '4000', sortOrder: 4200 },
  { code: '4300', name: 'Pendapatan Lain-lain', category: 'PENDAPATAN', level: 2, normalBalance: 'CREDIT', isHeader: false, parentCode: '4000', sortOrder: 4300 },
  
  // ========== HARGA POKOK PENJUALAN ==========
  { code: '5000', name: 'HARGA POKOK PENJUALAN', category: 'HPP', level: 1, normalBalance: 'DEBIT', isHeader: true, sortOrder: 5000 },
  { code: '5100', name: 'HPP Bahan Baku', category: 'HPP', level: 2, normalBalance: 'DEBIT', isHeader: false, parentCode: '5000', sortOrder: 5100 },
  { code: '5200', name: 'HPP Tenaga Kerja', category: 'HPP', level: 2, normalBalance: 'DEBIT', isHeader: false, parentCode: '5000', sortOrder: 5200 },
  { code: '5300', name: 'HPP Overhead', category: 'HPP', level: 2, normalBalance: 'DEBIT', isHeader: false, parentCode: '5000', sortOrder: 5300 },
  
  // ========== BEBAN OPERASIONAL ==========
  { code: '6000', name: 'BEBAN OPERASIONAL', category: 'BEBAN_OPERASIONAL', level: 1, normalBalance: 'DEBIT', isHeader: true, sortOrder: 6000 },
  
  // Beban Penjualan
  { code: '6100', name: 'Beban Penjualan', category: 'BEBAN_OPERASIONAL', level: 2, normalBalance: 'DEBIT', isHeader: true, parentCode: '6000', sortOrder: 6100 },
  { code: '6110', name: 'Beban Gaji Sales', category: 'BEBAN_OPERASIONAL', level: 3, normalBalance: 'DEBIT', isHeader: false, parentCode: '6100', sortOrder: 6110 },
  { code: '6120', name: 'Beban Transportasi', category: 'BEBAN_OPERASIONAL', level: 3, normalBalance: 'DEBIT', isHeader: false, parentCode: '6100', sortOrder: 6120 },
  
  // Beban Umum & Administrasi
  { code: '6200', name: 'Beban Umum & Administrasi', category: 'BEBAN_OPERASIONAL', level: 2, normalBalance: 'DEBIT', isHeader: true, parentCode: '6000', sortOrder: 6200 },
  { code: '6210', name: 'Beban Gaji Karyawan', category: 'BEBAN_OPERASIONAL', level: 3, normalBalance: 'DEBIT', isHeader: false, parentCode: '6200', sortOrder: 6210 },
  { code: '6220', name: 'Beban Listrik', category: 'BEBAN_OPERASIONAL', level: 3, normalBalance: 'DEBIT', isHeader: false, parentCode: '6200', sortOrder: 6220 },
  { code: '6230', name: 'Beban Telepon', category: 'BEBAN_OPERASIONAL', level: 3, normalBalance: 'DEBIT', isHeader: false, parentCode: '6200', sortOrder: 6230 },
  { code: '6240', name: 'Beban Penyusutan', category: 'BEBAN_OPERASIONAL', level: 3, normalBalance: 'DEBIT', isHeader: false, parentCode: '6200', sortOrder: 6240 },
];

/**
 * Build hierarchical tree structure from flat account list
 */
export function buildAccountTree(accounts: Account[]): AccountTreeNode[] {
  const accountMap = new Map<string, Account>();
  const children = new Map<string, Account[]>();
  
  // Build maps for quick lookup
  accounts.forEach(account => {
    accountMap.set(account.id, account);
    if (!children.has(account.parentId || 'root')) {
      children.set(account.parentId || 'root', []);
    }
    children.get(account.parentId || 'root')!.push(account);
  });
  
  // Build tree recursively
  function buildNode(account: Account, level: number): AccountTreeNode {
    const childAccounts = children.get(account.id) || [];
    const childNodes = childAccounts
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
      .map(child => buildNode(child, level + 1));
    
    return {
      account,
      children: childNodes,
      level,
      isExpanded: level <= 2 // Expand first 2 levels by default
    };
  }
  
  // Start with root accounts (no parent)
  const rootAccounts = children.get('root') || [];
  return rootAccounts
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .map(account => buildNode(account, 1));
}

/**
 * Flatten tree structure to list with indentation info
 */
export function flattenAccountTree(tree: AccountTreeNode[]): Array<Account & { level: number; indentedName: string }> {
  const result: Array<Account & { level: number; indentedName: string }> = [];
  
  function traverse(nodes: AccountTreeNode[]) {
    nodes.forEach(node => {
      const indent = '  '.repeat(node.level - 1);
      const icon = node.account.isHeader ? '📁 ' : '💰 ';
      
      result.push({
        ...node.account,
        level: node.level,
        indentedName: indent + icon + node.account.name
      });
      
      if (node.isExpanded && node.children.length > 0) {
        traverse(node.children);
      }
    });
  }
  
  traverse(tree);
  return result;
}

/**
 * Get all child accounts of a parent account
 */
export function getChildAccounts(accounts: Account[], parentId: string): Account[] {
  const children: Account[] = [];
  
  function findChildren(pid: string) {
    accounts.forEach(account => {
      if (account.parentId === pid) {
        children.push(account);
        findChildren(account.id); // Recursive for nested children
      }
    });
  }
  
  findChildren(parentId);
  return children;
}

/**
 * Get account path (breadcrumb) from root to account
 */
export function getAccountPath(accounts: Account[], accountId: string): Account[] {
  const accountMap = new Map(accounts.map(acc => [acc.id, acc]));
  const path: Account[] = [];
  
  let currentId: string | undefined = accountId;
  while (currentId) {
    const account = accountMap.get(currentId);
    if (account) {
      path.unshift(account);
      currentId = account.parentId;
    } else {
      break;
    }
  }
  
  return path;
}

/**
 * Validate account code format
 */
export function validateAccountCode(code: string): boolean {
  // Must be 4 digits
  return /^\d{4}$/.test(code);
}

/**
 * Generate next available account code in sequence
 */
export function generateNextAccountCode(existingCodes: string[], parentCode?: string): string {
  if (!parentCode) {
    // Generate root level code (1000, 2000, etc.)
    const usedRootCodes = existingCodes
      .filter(code => code.endsWith('000'))
      .map(code => parseInt(code));
    
    let nextCode = 1000;
    while (usedRootCodes.includes(nextCode)) {
      nextCode += 1000;
    }
    return nextCode.toString();
  }
  
  // Generate child code
  const parentNum = parseInt(parentCode);
  const baseCode = Math.floor(parentNum / 100) * 100; // Get base (1000, 1100, etc.)
  
  const usedChildCodes = existingCodes
    .filter(code => {
      const codeNum = parseInt(code);
      return codeNum >= baseCode && codeNum < baseCode + 100;
    })
    .map(code => parseInt(code))
    .sort((a, b) => a - b);
  
  let nextCode = baseCode + 10;
  while (usedChildCodes.includes(nextCode)) {
    nextCode += 10;
  }
  
  return nextCode.toString();
}

/**
 * Check if account can be deleted (no children, no transactions)
 */
export function canDeleteAccount(account: Account, allAccounts: Account[]): { canDelete: boolean; reason?: string } {
  // Check if account has children
  const hasChildren = allAccounts.some(acc => acc.parentId === account.id);
  if (hasChildren) {
    return { canDelete: false, reason: 'Account masih memiliki sub-account' };
  }
  
  // Check if account has balance
  if (account.balance !== 0) {
    return { canDelete: false, reason: 'Account masih memiliki saldo' };
  }
  
  return { canDelete: true };
}

/**
 * Map legacy account type to new category
 */
export function mapLegacyTypeToCategory(legacyType: string): AccountCategory {
  switch (legacyType.toLowerCase()) {
    case 'aset': return 'ASET';
    case 'kewajiban': return 'KEWAJIBAN';
    case 'modal': return 'MODAL';
    case 'pendapatan': return 'PENDAPATAN';
    case 'beban': return 'BEBAN_OPERASIONAL';
    default: return 'ASET';
  }
}

/**
 * Get normal balance for account category
 */
export function getNormalBalanceForCategory(category: AccountCategory): NormalBalance {
  switch (category) {
    case 'ASET':
    case 'HPP':
    case 'BEBAN_OPERASIONAL':
    case 'BEBAN_NON_OPERASIONAL':
      return 'DEBIT';
    case 'KEWAJIBAN':
    case 'MODAL':
    case 'PENDAPATAN':
    case 'PENDAPATAN_NON_OPERASIONAL':
      return 'CREDIT';
    default:
      return 'DEBIT';
  }
}

/**
 * Calculate account balance considering normal balance
 */
export function calculateNormalizedBalance(account: Account): number {
  const isNormalDebit = account.normalBalance === 'DEBIT';
  return isNormalDebit ? account.balance : -account.balance;
}