import { supabase } from '@/integrations/supabase/client';
import {
  findAccountByLookup,
  findAllAccountsByLookup,
  findAccountsByType,
  getTotalBalance,
} from '@/services/accountLookupService';
import { Account } from '@/types/account';

// Helper to map from DB to App (Account type)
const fromDbToApp = (dbAccount: any): Account => ({
  id: dbAccount.id,
  name: dbAccount.name,
  type: dbAccount.type,
  balance: Number(dbAccount.balance) || 0,
  initialBalance: Number(dbAccount.initial_balance) || 0,
  isPaymentAccount: dbAccount.is_payment_account,
  createdAt: new Date(dbAccount.created_at),
  code: dbAccount.code || undefined,
  parentId: dbAccount.parent_id || undefined,
  level: dbAccount.level || 1,
  isHeader: dbAccount.is_header || false,
  isActive: dbAccount.is_active !== false,
  sortOrder: dbAccount.sort_order || 0,
  branchId: dbAccount.branch_id || undefined,
});

/**
 * Calculate account balances from journal entries (same logic as useAccounts.ts)
 * This ensures financial reports use the same balance calculation as the UI
 */
async function calculateAccountBalancesFromJournal(
  accounts: Account[],
  branchId: string,
  asOfDate?: Date
): Promise<Account[]> {
  // Get all journal_entry_lines for the branch
  // Note: PostgREST doesn't support !inner syntax, so we filter on client side
  const { data: journalLines, error: journalError } = await supabase
    .from('journal_entry_lines')
    .select(`
      account_id,
      debit_amount,
      credit_amount,
      journal_entries (
        branch_id,
        status,
        is_voided,
        entry_date
      )
    `);

  if (journalError) {
    console.warn('Error fetching journal_entry_lines for balance calculation:', journalError.message);
    // Fallback to initial_balance only
    return accounts.map(acc => ({
      ...acc,
      balance: acc.initialBalance || 0
    }));
  }

  // Initialize balance map with initial_balance
  const accountBalanceMap = new Map<string, number>();
  const accountTypes = new Map<string, string>();

  accounts.forEach(acc => {
    accountBalanceMap.set(acc.id, acc.initialBalance || 0);
    accountTypes.set(acc.id, acc.type);
  });

  // Filter journal lines on client side
  const asOfDateStr = asOfDate ? asOfDate.toISOString().split('T')[0] : null;

  const filteredJournalLines = (journalLines || []).filter((line: any) => {
    const journal = line.journal_entries;
    if (!journal) return false;

    const matchesBranch = journal.branch_id === branchId;
    const matchesStatus = journal.status === 'posted' && journal.is_voided === false;
    const matchesDate = !asOfDateStr || journal.entry_date <= asOfDateStr;

    return matchesBranch && matchesStatus && matchesDate;
  });

  // Calculate balance per account
  filteredJournalLines.forEach((line: any) => {
    if (!line.account_id) return;

    const currentBalance = accountBalanceMap.get(line.account_id) || 0;
    const debitAmount = Number(line.debit_amount) || 0;
    const creditAmount = Number(line.credit_amount) || 0;
    const accountType = accountTypes.get(line.account_id) || 'Aset';

    // Determine balance change based on account type
    // Normalize account type for comparison (handle variations like Liabilitas, Liability, etc.)
    const normalizedType = accountType.toLowerCase();
    const isDebitNormal =
      normalizedType.includes('aset') ||
      normalizedType.includes('asset') ||
      normalizedType.includes('aktiva') ||
      normalizedType.includes('beban') ||
      normalizedType.includes('expense') ||
      normalizedType.includes('biaya');

    let balanceChange = 0;
    if (isDebitNormal) {
      // Aset & Beban: Debit increases, Credit decreases
      balanceChange = debitAmount - creditAmount;
    } else {
      // Kewajiban/Liabilitas, Modal/Ekuitas, Pendapatan: Credit increases, Debit decreases
      balanceChange = creditAmount - debitAmount;
    }

    accountBalanceMap.set(line.account_id, currentBalance + balanceChange);
  });

  // Apply calculated balances to accounts
  const accountsWithCalculatedBalance = accounts.map(acc => ({
    ...acc,
    balance: accountBalanceMap.get(acc.id) ?? 0
  }));

  console.log('📊 Financial Reports: Calculated balances from journal for branch:', branchId,
    'Journal lines processed:', filteredJournalLines.length);

  return accountsWithCalculatedBalance;
}

// Financial Statement Types
export interface BalanceSheetData {
  assets: {
    currentAssets: {
      kasBank: BalanceSheetItem[];
      piutangUsaha: BalanceSheetItem[];
      piutangPajak: BalanceSheetItem[];  // Piutang Pajak / PPN Masukan
      persediaan: BalanceSheetItem[];
      panjarKaryawan: BalanceSheetItem[];
      totalCurrentAssets: number;
    };
    fixedAssets: {
      peralatan: BalanceSheetItem[];
      akumulasiPenyusutan: BalanceSheetItem[];
      totalFixedAssets: number;
    };
    totalAssets: number;
  };
  liabilities: {
    currentLiabilities: {
      hutangUsaha: BalanceSheetItem[];
      hutangBank: BalanceSheetItem[];
      hutangKartuKredit: BalanceSheetItem[];
      hutangLain: BalanceSheetItem[];
      hutangGaji: BalanceSheetItem[];
      hutangPajak: BalanceSheetItem[];
      totalCurrentLiabilities: number;
    };
    totalLiabilities: number;
  };
  equity: {
    modalPemilik: BalanceSheetItem[];
    labaRugiDitahan: number;
    totalEquity: number;
  };
  totalLiabilitiesEquity: number;
  isBalanced: boolean;
  generatedAt: Date;
}

export interface BalanceSheetItem {
  accountId: string;
  accountCode?: string;
  accountName: string;
  balance: number;
  formattedBalance: string;
}

export interface IncomeStatementData {
  revenue: {
    penjualan: IncomeStatementItem[];
    pendapatanLain: IncomeStatementItem[];
    totalRevenue: number;
  };
  cogs: {
    bahanBaku: IncomeStatementItem[];
    tenagaKerja: IncomeStatementItem[];
    overhead: IncomeStatementItem[];
    totalCOGS: number;
  };
  grossProfit: number;
  grossProfitMargin: number;
  operatingExpenses: {
    bebanGaji: IncomeStatementItem[];
    bebanOperasional: IncomeStatementItem[];
    bebanAdministrasi: IncomeStatementItem[];
    komisi: IncomeStatementItem[];
    totalOperatingExpenses: number;
  };
  operatingIncome: number;
  otherIncome: {
    pendapatanLainLain: IncomeStatementItem[];
    bebanLainLain: IncomeStatementItem[];
    netOtherIncome: number;
  };
  netIncomeBeforeTax: number;
  taxExpense: number;
  netIncome: number;
  netProfitMargin: number;
  periodFrom: Date;
  periodTo: Date;
  generatedAt: Date;
}

export interface IncomeStatementItem {
  accountId?: string;
  accountCode?: string;
  accountName: string;
  amount: number;
  formattedAmount: string;
  source: 'transactions' | 'cash_history' | 'expenses' | 'manual_journal' | 'calculated';
}

export interface CashFlowCategoryItem {
  accountId: string;
  accountCode: string;
  accountName: string;
  amount: number;
  formattedAmount: string;
  transactions: number; // Count of transactions
}

export interface CashFlowStatementData {
  operatingActivities: {
    netIncome: number;
    adjustments: CashFlowItem[];
    workingCapitalChanges: CashFlowItem[];
    cashReceipts: {
      fromCustomers: number;
      fromReceivablePayments: number;
      fromOtherOperating: number;
      fromAdvanceRepayment: number;
      total: number;
      // NEW: Detail by COA account
      byAccount: CashFlowCategoryItem[];
    };
    cashPayments: {
      forRawMaterials: number;
      forPayablePayments: number;
      forInterestExpense: number;
      forDirectLabor: number;
      forEmployeeAdvances: number;
      forManufacturingOverhead: number;
      forOperatingExpenses: number;
      forTaxes: number;
      total: number;
      // NEW: Detail by COA account
      byAccount: CashFlowCategoryItem[];
    };
    netCashFromOperations: number;
  };
  investingActivities: {
    equipmentPurchases: CashFlowItem[];
    otherInvestments: CashFlowItem[];
    netCashFromInvesting: number;
    // NEW: Detail by COA account
    byAccount: CashFlowCategoryItem[];
  };
  financingActivities: {
    ownerInvestments: CashFlowItem[];
    ownerWithdrawals: CashFlowItem[];
    loans: CashFlowItem[];
    netCashFromFinancing: number;
    // NEW: Detail by COA account
    byAccount: CashFlowCategoryItem[];
  };
  netCashFlow: number;
  beginningCash: number;
  endingCash: number;
  periodFrom: Date;
  periodTo: Date;
  generatedAt: Date;
  // NEW: Summary by account type
  summaryByAccountType: {
    pendapatan: number;
    beban: number;
    aset: number;
    kewajiban: number;
    modal: number;
  };
}

export interface CashFlowItem {
  description: string;
  amount: number;
  formattedAmount: string;
  source: string;
  accountId?: string;
  accountCode?: string;
  accountName?: string;
}

// Utility Functions
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
}

export function calculatePercentage(part: number, whole: number): number {
  return whole !== 0 ? (part / whole) * 100 : 0;
}

/**
 * Generate Balance Sheet from existing data
 * ============================================================================
 * PENTING: Saldo akun dihitung dari journal_entry_lines, BUKAN dari
 * kolom balance di tabel accounts. Ini memastikan konsistensi dengan
 * useAccounts.ts yang juga menghitung balance dari jurnal.
 * ============================================================================
 */
export async function generateBalanceSheet(asOfDate?: Date, branchId?: string): Promise<BalanceSheetData> {
  const cutoffDate = asOfDate || new Date();
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

  if (!branchId) {
    throw new Error('Branch ID is required for generating Balance Sheet');
  }

  // Get all accounts structure (without relying on balance column)
  let accountsQuery = supabase
    .from('accounts')
    .select('id, name, type, balance, initial_balance, code, branch_id, is_payment_account, is_header, is_active, level, sort_order, parent_id, created_at')
    .order('code');

  // Note: We don't filter by branch_id here because COA structure is global
  // Balance will be calculated per-branch from journal entries

  const { data: accountsData, error: accountsError } = await accountsQuery;

  if (accountsError) throw new Error(`Failed to fetch accounts: ${accountsError.message}`);

  // Convert DB accounts to App accounts
  const baseAccounts = accountsData?.map(fromDbToApp) || [];

  // ============================================================================
  // CALCULATE BALANCES FROM JOURNAL ENTRIES (not from accounts.balance column)
  // This is the same logic as useAccounts.ts
  // ============================================================================
  const accounts = await calculateAccountBalancesFromJournal(baseAccounts, branchId, cutoffDate);

  // Get account receivables from transactions (filtered by branch)
  let transactionsQuery = supabase
    .from('transactions')
    .select('id, total, paid_amount, payment_status, order_date, branch_id')
    .lte('order_date', cutoffDateStr)
    .in('payment_status', ['Belum Lunas', 'Kredit']);

  if (branchId) {
    transactionsQuery = transactionsQuery.eq('branch_id', branchId);
  }

  const { data: transactions, error: transactionsError } = await transactionsQuery;

  if (transactionsError) throw new Error(`Failed to fetch transactions: ${transactionsError.message}`);

  // Get inventory value from materials (filtered by branch)
  let materialsQuery = supabase
    .from('materials')
    .select('id, name, stock, price_per_unit, branch_id');

  if (branchId) {
    materialsQuery = materialsQuery.eq('branch_id', branchId);
  }

  const { data: materials, error: materialsError } = await materialsQuery;

  if (materialsError) throw new Error(`Failed to fetch materials: ${materialsError.message}`);

  // Get accounts payable data (filtered by branch)
  let apQuery = supabase
    .from('accounts_payable')
    .select('amount, paid_amount, status')
    .lte('created_at', cutoffDateStr + 'T23:59:59');

  if (branchId) {
    apQuery = apQuery.eq('branch_id', branchId);
  }

  const { data: accountsPayable, error: apError } = await apQuery;

  // Ignore error if table doesn't exist
  const apData = apError ? [] : (accountsPayable || []);

  // Get payroll liabilities (filtered by branch)
  let payrollQuery = supabase
    .from('payroll_records')
    .select('net_salary, status, created_at')
    .lte('created_at', cutoffDateStr + 'T23:59:59')
    .eq('status', 'approved');

  if (branchId) {
    payrollQuery = payrollQuery.eq('branch_id', branchId);
  }

  const { data: payrollRecords, error: payrollError } = await payrollQuery;

  // Ignore error if table doesn't exist
  const payrollData = payrollError ? [] : (payrollRecords || []);

  // ============================================================================
  // GET ALL PRODUCTS FOR INVENTORY CALCULATION
  // ============================================================================
  // Nilai persediaan dihitung langsung dari:
  // - Persediaan Barang Dagang (1310) = Semua produk × cost_price
  // - Persediaan Bahan Baku (1320) = Semua materials × price_per_unit
  // Ini lebih akurat daripada menggunakan saldo akun COA karena:
  // 1. Stock selalu up-to-date dari tabel products/materials
  // 2. Tidak perlu initial_balance yang bisa menyebabkan ketidaksesuaian
  // ============================================================================
  let productsQuery = supabase
    .from('products')
    .select('id, name, type, current_stock, cost_price, base_price, branch_id');

  if (branchId) {
    productsQuery = productsQuery.eq('branch_id', branchId);
  }

  const { data: products, error: productsError } = await productsQuery;
  const productsData = productsError ? [] : (products || []);

  // ============================================================================
  // PIUTANG USAHA - USING ACCOUNT LOOKUP SERVICE
  // ============================================================================
  // Piutang diambil dari saldo akun COA menggunakan lookup by name/type
  // Ini memastikan konsistensi dengan double-entry accounting dan fleksibilitas
  // terhadap perubahan format kode akun
  // ============================================================================
  const piutangAccount = findAccountByLookup(accounts, 'PIUTANG_USAHA');
  const totalReceivables = piutangAccount?.balance || 0;

  // Fallback: Calculate from transactions if COA account not found or zero
  const calculatedReceivables = transactions?.reduce((sum, tx) =>
    sum + ((tx.total || 0) - (tx.paid_amount || 0)), 0) || 0;

  // Use COA value if available and non-zero, otherwise use calculated
  const finalReceivables = totalReceivables > 0 ? totalReceivables : calculatedReceivables;

  // ============================================================================
  // PERSEDIAAN - DIHITUNG LANGSUNG DARI STOCK × HARGA
  // ============================================================================
  // Nilai persediaan dihitung langsung dari:
  // 1. Persediaan Bahan Baku (1320) = materials.stock × materials.price_per_unit
  // 2. Persediaan Barang Dagang (1310) = products.current_stock × products.cost_price
  //
  // PENTING: Tidak menggunakan saldo akun COA atau initial_balance karena:
  // - Stock di tabel products/materials selalu up-to-date
  // - Menghindari ketidaksesuaian antara stock fisik dan saldo akuntansi
  // ============================================================================

  // Calculate inventory from materials (bahan baku - 1320)
  const materialsInventory = materials?.reduce((sum, material) =>
    sum + ((material.stock || 0) * (material.price_per_unit || 0)), 0) || 0;

  // Calculate inventory from ALL products (barang dagang - 1310)
  // Gunakan cost_price jika ada, jika tidak gunakan base_price
  const productsInventory = productsData?.reduce((sum, product) => {
    const costPrice = product.cost_price || product.base_price || 0;
    return sum + ((product.current_stock || 0) * costPrice);
  }, 0) || 0;

  // Total persediaan = bahan baku + barang dagang
  const totalInventory = materialsInventory + productsInventory;

  console.log('📦 Inventory Calculation:', {
    materialsCount: materials?.length || 0,
    materialsInventory,
    productsCount: productsData?.length || 0,
    productsInventory,
    totalInventory,
    productDetails: productsData?.slice(0, 5).map(p => ({
      name: p.name,
      stock: p.current_stock,
      costPrice: p.cost_price,
      basePrice: p.base_price,
      value: (p.current_stock || 0) * (p.cost_price || p.base_price || 0)
    }))
  });

  // Calculate outstanding accounts payable
  const totalAccountsPayable = apData.reduce((sum, ap) => {
    if (ap.status === 'Outstanding') {
      return sum + ap.amount;
    } else if (ap.status === 'Partial') {
      return sum + (ap.amount - (ap.paid_amount || 0));
    }
    return sum;
  }, 0);

  // Calculate unpaid payroll liabilities
  const totalPayrollLiabilities = payrollData.reduce((sum, payroll) => {
    return sum + (payroll.net_salary || 0);
  }, 0);

  // Group accounts by type using lookup service
  const assetAccounts = findAccountsByType(accounts, 'Aset');
  const equityAccounts = findAccountsByType(accounts, 'Modal');

  // Build current assets - Using lookup service for Kas dan Bank
  const kasAccounts = findAllAccountsByLookup(accounts, 'KAS_UTAMA');
  const kasKecilAccounts = findAllAccountsByLookup(accounts, 'KAS_KECIL');
  const bankAccounts = findAllAccountsByLookup(accounts, 'BANK');
  const allCashAccounts = [...kasAccounts, ...kasKecilAccounts, ...bankAccounts];

  const kasBank = allCashAccounts
    .filter(acc => (acc.balance || 0) !== 0) // Hide zero balances
    .map(acc => ({
      accountId: acc.id,
      accountCode: acc.code,
      accountName: acc.name,
      balance: acc.balance || 0,
      formattedBalance: formatCurrency(acc.balance || 0)
    }));

  // Use COA account info if available, otherwise show as calculated
  const piutangUsaha: BalanceSheetItem[] = finalReceivables > 0 ? [{
    accountId: piutangAccount?.id || 'calculated-receivables',
    accountCode: piutangAccount?.code || '1200',
    accountName: piutangAccount?.name || 'Piutang Usaha',
    balance: finalReceivables,
    formattedBalance: formatCurrency(finalReceivables)
  }] : [];

  // ============================================================================
  // PERSEDIAAN - Tampilkan terpisah: Barang Dagang dan Bahan Baku
  // ============================================================================
  const persediaan: BalanceSheetItem[] = [];

  // Persediaan Barang Dagang (1310) - dari semua produk
  if (productsInventory > 0) {
    persediaan.push({
      accountId: 'calculated-products-inventory',
      accountCode: '1310',
      accountName: 'Persediaan Barang Dagang',
      balance: productsInventory,
      formattedBalance: formatCurrency(productsInventory)
    });
  }

  // Persediaan Bahan Baku (1320) - dari materials
  if (materialsInventory > 0) {
    persediaan.push({
      accountId: 'calculated-materials-inventory',
      accountCode: '1320',
      accountName: 'Persediaan Bahan Baku',
      balance: materialsInventory,
      formattedBalance: formatCurrency(materialsInventory)
    });
  }

  // Piutang Karyawan / Panjar Karyawan - Using lookup service
  const piutangKaryawanAccounts = findAllAccountsByLookup(accounts, 'PIUTANG_KARYAWAN');
  const panjarKaryawan = piutangKaryawanAccounts
    .filter(acc => (acc.balance || 0) !== 0) // Hide zero balances
    .map(acc => ({
      accountId: acc.id,
      accountCode: acc.code,
      accountName: acc.name,
      balance: acc.balance || 0,
      formattedBalance: formatCurrency(acc.balance || 0)
    }));

  // ============================================================================
  // PIUTANG PAJAK / PPN MASUKAN - Using lookup service + code fallback
  // ============================================================================
  // Piutang Pajak diambil dari:
  // 1. Akun COA yang memiliki nama: "Piutang Pajak", "PPN Masukan", "Pajak Masukan"
  // 2. FALLBACK: Akun dengan kode 1230 atau 123x (Piutang Pajak range)
  // Akun ini dicatat saat PO dengan PPN di-approve:
  // - Dr. Persediaan (subtotal)
  // - Dr. PPN Masukan / Piutang Pajak (ppnAmount)
  // - Cr. Hutang Usaha (total)
  // ============================================================================
  let piutangPajakAccounts = findAllAccountsByLookup(accounts, 'PIUTANG_PAJAK');

  // Fallback: If lookup service finds nothing, search by account code (123x range)
  if (piutangPajakAccounts.length === 0) {
    piutangPajakAccounts = accounts.filter(acc => {
      const code = acc.code || '';
      // Match code 1230, 1231, 1-230, 1-23x, etc.
      return code.startsWith('123') || code.startsWith('1-23') || code.startsWith('1.23');
    }).filter(acc => !acc.isHeader);
  }

  const piutangPajak = piutangPajakAccounts
    .filter(acc => (acc.balance || 0) !== 0) // Hide zero balances
    .map(acc => ({
      accountId: acc.id,
      accountCode: acc.code,
      accountName: acc.name,
      balance: acc.balance || 0,
      formattedBalance: formatCurrency(acc.balance || 0)
    }));

  console.log('📊 Piutang Pajak Debug:', {
    foundByLookup: findAllAccountsByLookup(accounts, 'PIUTANG_PAJAK').length,
    foundByCodeFallback: accounts.filter(acc => (acc.code || '').startsWith('123')).length,
    finalAccounts: piutangPajakAccounts.map(a => ({ code: a.code, name: a.name, balance: a.balance })),
    totalPiutangPajak: piutangPajak.reduce((sum, item) => sum + item.balance, 0)
  });

  const totalCurrentAssets =
    kasBank.reduce((sum, item) => sum + item.balance, 0) +
    piutangUsaha.reduce((sum, item) => sum + item.balance, 0) +
    piutangPajak.reduce((sum, item) => sum + item.balance, 0) +
    persediaan.reduce((sum, item) => sum + item.balance, 0) +
    panjarKaryawan.reduce((sum, item) => sum + item.balance, 0);

  // ============================================================================
  // ASET TETAP - FROM COA + ASSETS TABLE
  // ============================================================================
  // Aset tetap diambil dari:
  // 1. Akun COA dengan kode 14xx, 15xx, 16xx (Aset Tetap)
  // 2. Tabel assets (jika saldo akun belum ter-update)
  // ============================================================================

  // Get assets from assets table for additional data (filtered by branch)
  let assetsQuery = supabase
    .from('assets')
    .select('id, asset_name, asset_code, category, purchase_price, current_value, account_id, status')
    .eq('status', 'active');

  if (branchId) {
    assetsQuery = assetsQuery.eq('branch_id', branchId);
  }

  const { data: assetsData } = await assetsQuery;

  // Calculate total assets value from assets table
  const assetsByAccountId: Record<string, { name: string; totalValue: number; category: string }> = {};
  assetsData?.forEach(asset => {
    const accountId = asset.account_id || 'unlinked';
    const value = asset.current_value || asset.purchase_price || 0;

    if (!assetsByAccountId[accountId]) {
      assetsByAccountId[accountId] = {
        name: asset.category === 'building' ? 'Bangunan' :
              asset.category === 'vehicle' ? 'Kendaraan' :
              asset.category === 'equipment' ? 'Peralatan' :
              asset.category === 'computer' ? 'Komputer' :
              asset.category === 'furniture' ? 'Furniture' : 'Aset Lainnya',
        totalValue: 0,
        category: asset.category || 'other'
      };
    }
    assetsByAccountId[accountId].totalValue += value;
  });

  // Build fixed assets - include all accounts with code 14xx, 15xx, 16xx (Aset Tetap)
  const peralatan = assetAccounts
    .filter(acc => {
      // Include accounts with code starting with 14, 15, 16 (fixed assets range)
      if (acc.code) {
        const codePrefix = acc.code.substring(0, 2);
        if (['14', '15', '16'].includes(codePrefix)) return true;
      }

      // Fallback: also include by name for accounts without codes
      return acc.name.toLowerCase().includes('peralatan') ||
             acc.name.toLowerCase().includes('kendaraan') ||
             acc.name.toLowerCase().includes('mesin') ||
             acc.name.toLowerCase().includes('bangunan') ||
             acc.name.toLowerCase().includes('tanah') ||
             acc.name.toLowerCase().includes('komputer') ||
             acc.name.toLowerCase().includes('furniture') ||
             acc.name.toLowerCase().includes('aset tetap') ||
             acc.name.toLowerCase().includes('gedung');
    })
    .filter(acc => {
      // Check if account has balance OR has linked assets
      const hasBalance = (acc.balance || 0) !== 0;
      const hasLinkedAssets = assetsByAccountId[acc.id]?.totalValue > 0;
      return hasBalance || hasLinkedAssets;
    })
    .map(acc => {
      // Use account balance if available, otherwise use linked assets total
      const accountBalance = acc.balance || 0;
      const linkedAssetsValue = assetsByAccountId[acc.id]?.totalValue || 0;
      // Use the larger value (account balance should include assets, but if not, use assets value)
      const balance = Math.max(accountBalance, linkedAssetsValue);

      return {
        accountId: acc.id,
        accountCode: acc.code,
        accountName: acc.name,
        balance: balance,
        formattedBalance: formatCurrency(balance)
      };
    });

  // Add unlinked assets (assets without account_id in COA)
  const unlinkedAssetsValue = assetsByAccountId['unlinked']?.totalValue || 0;
  if (unlinkedAssetsValue > 0) {
    peralatan.push({
      accountId: 'unlinked-assets',
      accountCode: '1499',
      accountName: 'Aset Tetap Lainnya',
      balance: unlinkedAssetsValue,
      formattedBalance: formatCurrency(unlinkedAssetsValue)
    });
  }

  // Check for assets linked to accounts not in the filter (edge case)
  Object.entries(assetsByAccountId).forEach(([accountId, data]) => {
    if (accountId === 'unlinked') return;

    // Check if this account is already included
    const alreadyIncluded = peralatan.some(p => p.accountId === accountId);
    if (!alreadyIncluded && data.totalValue > 0) {
      // Add this as a separate entry
      peralatan.push({
        accountId: accountId,
        accountCode: '',
        accountName: data.name,
        balance: data.totalValue,
        formattedBalance: formatCurrency(data.totalValue)
      });
    }
  });

  const akumulasiPenyusutan = assetAccounts
    .filter(acc => acc.name.toLowerCase().includes('akumulasi'))
    .filter(acc => (acc.balance || 0) !== 0) // Hide zero balances
    .map(acc => ({
      accountId: acc.id,
      accountCode: acc.code,
      accountName: acc.name,
      balance: acc.balance || 0,
      formattedBalance: formatCurrency(acc.balance || 0)
    }));

  const totalFixedAssets = 
    peralatan.reduce((sum, item) => sum + item.balance, 0) -
    Math.abs(akumulasiPenyusutan.reduce((sum, item) => sum + Math.abs(item.balance), 0));

  const totalAssets = totalCurrentAssets + totalFixedAssets;

  // Build liabilities - Using lookup service
  // ============================================================================
  // HUTANG USAHA - HANYA DARI SALDO COA (JOURNAL ENTRIES)
  // ============================================================================
  // PENTING: Hutang TIDAK BOLEH dihitung 2 kali!
  // Saldo akun Hutang Usaha di COA sudah mencakup semua hutang dari:
  // - Jurnal pembelian saat PO di-approve (Dr. Persediaan, Cr. Hutang Usaha)
  // - Jurnal pembayaran hutang (Dr. Hutang Usaha, Cr. Kas)
  //
  // Tabel accounts_payable HANYA digunakan untuk tracking/manajemen hutang,
  // BUKAN untuk perhitungan neraca. Jangan ditambahkan lagi!
  // ============================================================================
  const hutangUsahaAccounts = findAllAccountsByLookup(accounts, 'HUTANG_USAHA');
  const hutangUsaha = hutangUsahaAccounts
    .filter(acc => (acc.balance || 0) !== 0) // Hide zero balances
    .map(acc => ({
      accountId: acc.id,
      accountCode: acc.code,
      accountName: acc.name,
      balance: Math.abs(acc.balance || 0),
      formattedBalance: formatCurrency(Math.abs(acc.balance || 0))
    }));

  // NOTE: totalAccountsPayable dari tabel accounts_payable TIDAK DITAMBAHKAN
  // karena sudah tercakup dalam saldo akun Hutang Usaha dari journal entries

  // ============================================================================
  // HUTANG BANK - Pinjaman bank jangka pendek & panjang
  // ============================================================================
  const hutangBankAccounts = findAllAccountsByLookup(accounts, 'HUTANG_BANK');
  const hutangBank = hutangBankAccounts
    .filter(acc => (acc.balance || 0) !== 0)
    .map(acc => ({
      accountId: acc.id,
      accountCode: acc.code,
      accountName: acc.name,
      balance: Math.abs(acc.balance || 0),
      formattedBalance: formatCurrency(Math.abs(acc.balance || 0))
    }));

  // ============================================================================
  // HUTANG KARTU KREDIT
  // ============================================================================
  const hutangKartuKreditAccounts = findAllAccountsByLookup(accounts, 'HUTANG_KARTU_KREDIT');
  const hutangKartuKredit = hutangKartuKreditAccounts
    .filter(acc => (acc.balance || 0) !== 0)
    .map(acc => ({
      accountId: acc.id,
      accountCode: acc.code,
      accountName: acc.name,
      balance: Math.abs(acc.balance || 0),
      formattedBalance: formatCurrency(Math.abs(acc.balance || 0))
    }));

  // ============================================================================
  // HUTANG LAIN-LAIN
  // ============================================================================
  const hutangLainAccounts = findAllAccountsByLookup(accounts, 'HUTANG_LAIN');
  const hutangLain = hutangLainAccounts
    .filter(acc => (acc.balance || 0) !== 0)
    .map(acc => ({
      accountId: acc.id,
      accountCode: acc.code,
      accountName: acc.name,
      balance: Math.abs(acc.balance || 0),
      formattedBalance: formatCurrency(Math.abs(acc.balance || 0))
    }));

  // Hutang Gaji - Using lookup service
  // ============================================================================
  // HUTANG GAJI - HANYA DARI SALDO COA (JOURNAL ENTRIES)
  // ============================================================================
  // Sama seperti Hutang Usaha, saldo akun Hutang Gaji di COA sudah mencakup
  // semua hutang gaji dari jurnal payroll. TIDAK perlu ditambah dari
  // tabel payroll_records lagi untuk menghindari duplikasi.
  // ============================================================================
  const hutangGajiAccounts = findAllAccountsByLookup(accounts, 'HUTANG_GAJI');
  const hutangGaji = hutangGajiAccounts
    .filter(acc => (acc.balance || 0) !== 0) // Hide zero balances
    .map(acc => ({
      accountId: acc.id,
      accountCode: acc.code,
      accountName: acc.name,
      balance: Math.abs(acc.balance || 0),
      formattedBalance: formatCurrency(Math.abs(acc.balance || 0))
    }));

  // NOTE: totalPayrollLiabilities dari tabel payroll_records TIDAK DITAMBAHKAN
  // karena sudah tercakup dalam saldo akun Hutang Gaji dari journal entries

  // Hutang Pajak - Using lookup service
  const hutangPajakAccounts = findAllAccountsByLookup(accounts, 'HUTANG_PAJAK');
  const hutangPajak = hutangPajakAccounts
    .filter(acc => (acc.balance || 0) !== 0) // Hide zero balances
    .map(acc => ({
      accountId: acc.id,
      accountCode: acc.code,
      accountName: acc.name,
      balance: Math.abs(acc.balance || 0),
      formattedBalance: formatCurrency(Math.abs(acc.balance || 0))
    }));

  const totalCurrentLiabilities =
    hutangUsaha.reduce((sum, item) => sum + item.balance, 0) +
    hutangBank.reduce((sum, item) => sum + item.balance, 0) +
    hutangKartuKredit.reduce((sum, item) => sum + item.balance, 0) +
    hutangLain.reduce((sum, item) => sum + item.balance, 0) +
    hutangGaji.reduce((sum, item) => sum + item.balance, 0) +
    hutangPajak.reduce((sum, item) => sum + item.balance, 0);

  const totalLiabilities = totalCurrentLiabilities;

  // Build equity
  const modalPemilik = equityAccounts
    .filter(acc => (acc.balance || 0) !== 0) // Hide zero balances
    .map(acc => ({
      accountId: acc.id,
      accountCode: acc.code,
      accountName: acc.name,
      balance: acc.balance || 0,
      formattedBalance: formatCurrency(acc.balance || 0)
    }));

  // ============================================================================
  // MODAL - Hanya dari akun Modal di COA
  // ============================================================================
  // Modal hanya diambil dari akun tipe Modal yang sudah ada di COA.
  // Persediaan TIDAK lagi ditambahkan sebagai modal karena:
  // - Nilai persediaan sudah dihitung langsung dari stock × harga
  // - Tidak perlu initial_balance untuk persediaan
  // - Neraca akan balance dengan: Aset = Kewajiban + Modal + Laba Ditahan
  // ============================================================================

  // Calculate retained earnings (excludes modal persediaan awal because it's now explicit)
  const labaRugiDitahan = totalAssets - totalLiabilities - modalPemilik.reduce((sum, item) => sum + item.balance, 0);

  const totalEquity = 
    modalPemilik.reduce((sum, item) => sum + item.balance, 0) + labaRugiDitahan;

  const totalLiabilitiesEquity = totalLiabilities + totalEquity;
  const isBalanced = Math.abs(totalAssets - totalLiabilitiesEquity) < 1; // Allow for rounding

  return {
    assets: {
      currentAssets: {
        kasBank,
        piutangUsaha,
        piutangPajak,
        persediaan,
        panjarKaryawan,
        totalCurrentAssets
      },
      fixedAssets: {
        peralatan,
        akumulasiPenyusutan,
        totalFixedAssets
      },
      totalAssets
    },
    liabilities: {
      currentLiabilities: {
        hutangUsaha,
        hutangBank,
        hutangKartuKredit,
        hutangLain,
        hutangGaji,
        hutangPajak,
        totalCurrentLiabilities
      },
      totalLiabilities
    },
    equity: {
      modalPemilik,
      labaRugiDitahan,
      totalEquity
    },
    totalLiabilitiesEquity,
    isBalanced,
    generatedAt: new Date()
  };
}

/**
 * Generate Income Statement from Journal Entries
 *
 * ============================================================================
 * LAPORAN LABA RUGI - 100% DARI JOURNAL ENTRIES
 * ============================================================================
 * Semua data pendapatan dan beban diambil dari journal_entry_lines
 * dengan filter status='posted' dan is_voided=false
 * ============================================================================
 */
export async function generateIncomeStatement(
  periodFrom: Date,
  periodTo: Date,
  branchId?: string
): Promise<IncomeStatementData> {
  const fromDateStr = periodFrom.toISOString().split('T')[0];
  const toDateStr = periodTo.toISOString().split('T')[0];

  // ============================================================================
  // FETCH JOURNAL ENTRIES FOR THE PERIOD
  // Note: PostgREST doesn't support !inner syntax, so we filter on client side
  // ============================================================================
  const { data: rawJournalLines, error: journalError } = await supabase
    .from('journal_entry_lines')
    .select(`
      id,
      account_id,
      account_code,
      account_name,
      debit_amount,
      credit_amount,
      description,
      journal_entries (
        id,
        entry_number,
        entry_date,
        description,
        status,
        is_voided,
        branch_id
      )
    `);

  // Filter on client side since PostgREST doesn't support nested filtering with !inner
  const journalLines = (rawJournalLines || []).filter((line: any) => {
    const journal = line.journal_entries;
    if (!journal) return false;
    const entryDate = journal.entry_date;
    const matchesDate = entryDate >= fromDateStr && entryDate <= toDateStr;
    const matchesStatus = journal.status === 'posted' && journal.is_voided === false;
    const matchesBranch = !branchId || journal.branch_id === branchId;
    return matchesDate && matchesStatus && matchesBranch;
  });

  if (journalError) {
    console.error('Error fetching journal lines:', journalError);
  }

  // ============================================================================
  // GET ACCOUNTS TO DETERMINE TYPES
  // Note: COA (accounts) is GLOBAL - no branch_id filter needed
  // Branch filtering is already done on journal_entries level
  // ============================================================================
  const { data: accountsData } = await supabase
    .from('accounts')
    .select('id, code, name, type, is_header')
    .order('code');

  // Create account type lookup
  const accountTypes: Record<string, { type: string; code: string; name: string; isHeader: boolean }> = {};
  accountsData?.forEach(acc => {
    accountTypes[acc.id] = {
      type: acc.type,
      code: acc.code || '',
      name: acc.name,
      isHeader: acc.is_header || false
    };
  });

  // ============================================================================
  // AGGREGATE JOURNAL LINES BY ACCOUNT
  // ============================================================================
  // PENTING: Gunakan account_code yang disimpan di journal_entry_lines
  // sebagai primary key, bukan account_id. Ini karena:
  // - Akun dibuat per-branch, sehingga ID bisa berbeda antar branch
  // - Kode akun lebih stabil dan konsisten (4100, 5100, 6100, dll)
  // - Journal lines sudah menyimpan account_code dan account_name
  // ============================================================================
  const accountTotals: Record<string, {
    accountId: string;
    accountCode: string;
    accountName: string;
    accountType: string;
    debit: number;
    credit: number;
  }> = {};

  journalLines?.forEach(line => {
    // Use account_code as the key instead of account_id
    const accountCode = line.account_code || '';
    const accountId = line.account_id;
    const accountInfo = accountTypes[accountId];

    // Determine account type from:
    // 1. accountTypes lookup (if found)
    // 2. Fallback: infer from account_code prefix
    let accountType = accountInfo?.type || '';
    if (!accountType) {
      // Infer type from account code
      if (accountCode.startsWith('1')) accountType = 'Aset';
      else if (accountCode.startsWith('2')) accountType = 'Kewajiban';
      else if (accountCode.startsWith('3')) accountType = 'Modal';
      else if (accountCode.startsWith('4')) accountType = 'Pendapatan';
      else if (accountCode.startsWith('5') || accountCode.startsWith('6')) accountType = 'Beban';
      else if (accountCode.startsWith('7')) accountType = 'Pendapatan';
      else if (accountCode.startsWith('8')) accountType = 'Beban';
      else accountType = 'Unknown';
    }

    if (!accountTotals[accountCode]) {
      accountTotals[accountCode] = {
        accountId,
        accountCode,
        accountName: line.account_name || accountInfo?.name || 'Unknown',
        accountType,
        debit: 0,
        credit: 0
      };
    }

    accountTotals[accountCode].debit += line.debit_amount || 0;
    accountTotals[accountCode].credit += line.credit_amount || 0;
  });

  // ============================================================================
  // PENDAPATAN (Revenue) - Type 'Pendapatan' or code starts with '4'
  // Normal balance: CREDIT (credit increases, debit decreases)
  // Supports multiple code formats: '4xxx', '4-xxx', '4.xxx'
  // ============================================================================
  const revenueAccounts = Object.values(accountTotals).filter(acc => {
    const code = acc.accountCode || '';
    const type = acc.accountType?.toLowerCase() || '';
    // Check type or code prefix (supports: 4xxx, 4-xxx, 4.xxx formats)
    return type === 'pendapatan' ||
           code.startsWith('4') ||
           code.startsWith('4-') ||
           code.startsWith('4.');
  });

  const penjualan: IncomeStatementItem[] = revenueAccounts
    .map(acc => {
      // Revenue: Credit - Debit (credit is positive)
      const amount = acc.credit - acc.debit;
      return {
        accountId: acc.accountId,
        accountCode: acc.accountCode,
        accountName: acc.accountName,
        amount: amount,
        formattedAmount: formatCurrency(amount),
        source: 'manual_journal' as const
      };
    })
    .filter(item => item.amount !== 0)
    .sort((a, b) => (a.accountCode || '').localeCompare(b.accountCode || ''));

  const totalRevenue = penjualan.reduce((sum, item) => sum + item.amount, 0);

  // ============================================================================
  // HPP (COGS) - Code starts with '5' (Harga Pokok Penjualan)
  // Normal balance: DEBIT (debit increases)
  // Supports multiple code formats: '5xxx', '5-xxx', '5.xxx'
  // ============================================================================
  const cogsAccounts = Object.values(accountTotals).filter(acc => {
    const code = acc.accountCode || '';
    return code.startsWith('5') || code.startsWith('5-') || code.startsWith('5.');
  });

  const bahanBaku: IncomeStatementItem[] = cogsAccounts
    .map(acc => {
      // COGS: Debit - Credit (debit is positive)
      const amount = acc.debit - acc.credit;
      return {
        accountId: acc.accountId,
        accountCode: acc.accountCode,
        accountName: acc.accountName,
        amount: amount,
        formattedAmount: formatCurrency(amount),
        source: 'manual_journal' as const
      };
    })
    .filter(item => item.amount !== 0)
    .sort((a, b) => (a.accountCode || '').localeCompare(b.accountCode || ''));

  const totalCOGS = bahanBaku.reduce((sum, item) => sum + item.amount, 0);

  const grossProfit = totalRevenue - totalCOGS;
  const grossProfitMargin = calculatePercentage(grossProfit, totalRevenue);

  // ============================================================================
  // BEBAN OPERASIONAL (Operating Expenses) - Type 'Beban' or code starts with '6'
  // Normal balance: DEBIT (debit increases)
  // Supports multiple code formats: '6xxx', '6-xxx', '6.xxx'
  // ============================================================================
  const expenseAccounts = Object.values(accountTotals).filter(acc => {
    const code = acc.accountCode || '';
    const type = acc.accountType?.toLowerCase() || '';
    const isExpense = type === 'beban' ||
                      code.startsWith('6') || code.startsWith('6-') || code.startsWith('6.');
    // Exclude COGS accounts (already counted)
    const isCOGS = code.startsWith('5') || code.startsWith('5-') || code.startsWith('5.');
    return isExpense && !isCOGS;
  });

  const bebanOperasional: IncomeStatementItem[] = expenseAccounts
    .map(acc => {
      // Expense: Debit - Credit (debit is positive)
      const amount = acc.debit - acc.credit;
      return {
        accountId: acc.accountId,
        accountCode: acc.accountCode,
        accountName: acc.accountName,
        amount: amount,
        formattedAmount: formatCurrency(amount),
        source: 'manual_journal' as const
      };
    })
    .filter(item => item.amount !== 0)
    .sort((a, b) => (a.accountCode || '').localeCompare(b.accountCode || ''));

  const totalOperatingExpenses = bebanOperasional.reduce((sum, item) => sum + item.amount, 0);
  const operatingIncome = grossProfit - totalOperatingExpenses;

  // ============================================================================
  // PENDAPATAN/BEBAN LAIN-LAIN - Code starts with '7' or '8'
  // Supports multiple code formats: '7xxx', '7-xxx', '7.xxx', etc.
  // ============================================================================
  const otherIncomeAccounts = Object.values(accountTotals).filter(acc => {
    const code = acc.accountCode || '';
    return code.startsWith('7') || code.startsWith('7-') || code.startsWith('7.');
  });

  const otherExpenseAccounts = Object.values(accountTotals).filter(acc => {
    const code = acc.accountCode || '';
    return code.startsWith('8') || code.startsWith('8-') || code.startsWith('8.');
  });

  const pendapatanLainLain: IncomeStatementItem[] = otherIncomeAccounts
    .map(acc => {
      const amount = acc.credit - acc.debit;
      return {
        accountId: acc.accountId,
        accountCode: acc.accountCode,
        accountName: acc.accountName,
        amount: amount,
        formattedAmount: formatCurrency(amount),
        source: 'manual_journal' as const
      };
    })
    .filter(item => item.amount !== 0);

  const bebanLainLain: IncomeStatementItem[] = otherExpenseAccounts
    .map(acc => {
      const amount = acc.debit - acc.credit;
      return {
        accountId: acc.accountId,
        accountCode: acc.accountCode,
        accountName: acc.accountName,
        amount: amount,
        formattedAmount: formatCurrency(amount),
        source: 'manual_journal' as const
      };
    })
    .filter(item => item.amount !== 0);

  const totalOtherIncome = pendapatanLainLain.reduce((sum, item) => sum + item.amount, 0);
  const totalOtherExpense = bebanLainLain.reduce((sum, item) => sum + item.amount, 0);
  const netOtherIncome = totalOtherIncome - totalOtherExpense;

  const netIncomeBeforeTax = operatingIncome + netOtherIncome;
  const netIncome = netIncomeBeforeTax; // Simplified - no tax calculation yet

  // Debug: Check for missing account mappings
  const unmappedAccounts = journalLines?.filter((line: any) => !accountTypes[line.account_id]) || [];

  console.log('📊 Income Statement from Journal:', {
    periodFrom: fromDateStr,
    periodTo: toDateStr,
    branchId,
    accountsLoaded: accountsData?.length || 0,
    journalLinesRaw: rawJournalLines?.length || 0,
    journalLinesFiltered: journalLines?.length || 0,
    accountTotalsCount: Object.keys(accountTotals).length,
    revenueAccountsFound: Object.values(accountTotals).filter(acc => {
      const code = acc.accountCode || '';
      const type = acc.accountType?.toLowerCase() || '';
      return type === 'pendapatan' || code.startsWith('4') || code.startsWith('4-') || code.startsWith('4.');
    }).length,
    totalRevenue,
    totalCOGS,
    grossProfit,
    totalOperatingExpenses,
    operatingIncome,
    netOtherIncome,
    netIncome,
    // Debug: show account types available in database
    accountTypesInDB: [...new Set(accountsData?.map(acc => acc.type) || [])],
    // Debug: show unmapped journal lines (account_id not found in accounts table)
    unmappedAccountsCount: unmappedAccounts.length,
    unmappedAccountIds: unmappedAccounts.slice(0, 5).map((line: any) => ({
      account_id: line.account_id,
      account_code: line.account_code,
      account_name: line.account_name
    })),
    // Detail per akun untuk debugging
    allAccountTotals: Object.values(accountTotals).map(acc => ({
      code: acc.accountCode,
      name: acc.accountName,
      type: acc.accountType,
      debit: acc.debit,
      credit: acc.credit
    }))
  });

  return {
    revenue: {
      penjualan,
      pendapatanLain: pendapatanLainLain,
      totalRevenue
    },
    cogs: {
      bahanBaku,
      tenagaKerja: [],
      overhead: [],
      totalCOGS
    },
    grossProfit,
    grossProfitMargin,
    operatingExpenses: {
      bebanGaji: [],
      bebanOperasional,
      bebanAdministrasi: [],
      komisi: [],
      totalOperatingExpenses
    },
    operatingIncome,
    otherIncome: {
      pendapatanLainLain,
      bebanLainLain,
      netOtherIncome
    },
    netIncomeBeforeTax,
    taxExpense: 0,
    netIncome,
    netProfitMargin: calculatePercentage(netIncome, totalRevenue),
    periodFrom,
    periodTo,
    generatedAt: new Date()
  };
}

/**
 * Generate Cash Flow Statement from Journal Entries
 *
 * ============================================================================
 * LAPORAN ARUS KAS - 100% DARI JOURNAL ENTRIES
 * ============================================================================
 * Arus kas dihitung dari pergerakan akun Kas/Bank di journal_entry_lines
 * Metode Langsung: Mengelompokkan berdasarkan akun lawan (counterpart)
 * ============================================================================
 */
export async function generateCashFlowStatement(
  periodFrom: Date,
  periodTo: Date,
  branchId?: string
): Promise<CashFlowStatementData> {
  const fromDateStr = periodFrom.toISOString().split('T')[0];
  const toDateStr = periodTo.toISOString().split('T')[0];

  if (!branchId) {
    throw new Error('Branch ID is required for generating Cash Flow Statement');
  }

  // ============================================================================
  // GET ALL ACCOUNTS FOR CLASSIFICATION
  // ============================================================================
  let allAccountsQuery = supabase
    .from('accounts')
    .select('id, code, name, type, balance, initial_balance, branch_id, is_payment_account, is_header, is_active, level, sort_order, parent_id, created_at')
    .order('code');

  // Note: We get all accounts (COA is global) and calculate balance per branch

  const { data: allAccountsData } = await allAccountsQuery;

  // Convert DB accounts to App accounts for use with lookup service
  const baseAllAccounts = allAccountsData?.map(fromDbToApp) || [];

  // ============================================================================
  // CALCULATE BALANCES FROM JOURNAL ENTRIES (not from accounts.balance column)
  // This ensures ending cash balance is correct based on actual journal entries
  // ============================================================================
  const allAccounts = await calculateAccountBalancesFromJournal(baseAllAccounts, branchId, periodTo);

  // Create account lookup maps
  const accountById: Record<string, { id: string; code: string; name: string; type: string }> = {};
  const accountByCode: Record<string, { id: string; code: string; name: string; type: string }> = {};

  allAccounts?.forEach(acc => {
    accountById[acc.id] = { id: acc.id, code: acc.code || '', name: acc.name, type: acc.type };
    if (acc.code) {
      accountByCode[acc.code] = { id: acc.id, code: acc.code, name: acc.name, type: acc.type };
    }
  });

  // ============================================================================
  // FETCH JOURNAL ENTRIES FOR CASH/BANK ACCOUNTS IN PERIOD
  // ============================================================================
  // Arus kas = pergerakan akun Kas/Bank dari journal_entry_lines
  // Kas masuk = debit pada akun Kas/Bank
  // Kas keluar = credit pada akun Kas/Bank
  // ============================================================================

  // Identify cash/bank accounts (code starts with 11)
  const cashAccountIds = allAccounts
    .filter(acc => acc.code?.startsWith('1-1') || acc.code?.startsWith('11') ||
                   acc.name.toLowerCase().includes('kas') || acc.name.toLowerCase().includes('bank'))
    .map(acc => acc.id);

  // Fetch journal entries that involve cash/bank accounts
  let journalQuery = supabase
    .from('journal_entries')
    .select(`
      id,
      entry_number,
      entry_date,
      description,
      reference_type,
      reference_id,
      status,
      is_voided,
      branch_id
    `)
    .gte('entry_date', fromDateStr)
    .lte('entry_date', toDateStr)
    .eq('status', 'posted')
    .eq('is_voided', false);

  if (branchId) {
    journalQuery = journalQuery.eq('branch_id', branchId);
  }

  const { data: journalEntries, error: journalError } = await journalQuery;

  if (journalError) {
    console.error('Error fetching journal entries:', journalError);
  }

  // Fetch all journal lines for these entries
  const journalIds = journalEntries?.map(j => j.id) || [];

  let journalLinesData: any[] = [];
  if (journalIds.length > 0) {
    const { data: lines } = await supabase
      .from('journal_entry_lines')
      .select('*')
      .in('journal_entry_id', journalIds);
    journalLinesData = lines || [];
  }

  // Group lines by journal entry
  const linesByJournal: Record<string, any[]> = {};
  journalLinesData.forEach(line => {
    if (!linesByJournal[line.journal_entry_id]) {
      linesByJournal[line.journal_entry_id] = [];
    }
    linesByJournal[line.journal_entry_id].push(line);
  });

  // Get beginning and ending cash balances
  const cashKasAccounts = findAllAccountsByLookup(allAccounts, 'KAS_UTAMA');
  const cashKasKecilAccounts = findAllAccountsByLookup(allAccounts, 'KAS_KECIL');
  const cashBankAccounts = findAllAccountsByLookup(allAccounts, 'BANK');
  const cashAccounts = [...cashKasAccounts, ...cashKasKecilAccounts, ...cashBankAccounts];

  if (cashAccounts.length === 0) {
    console.warn('⚠️ No cash/bank accounts found in COA');
  }

  const endingCash = getTotalBalance(cashAccounts);

  // ============================================================================
  // ANALYZE CASH FLOWS FROM JOURNAL ENTRIES
  // ============================================================================
  // Untuk setiap jurnal yang melibatkan akun Kas/Bank:
  // - Identifikasi akun lawan (counterpart) untuk klasifikasi
  // - Debit pada Kas = kas masuk
  // - Credit pada Kas = kas keluar
  // ============================================================================

  interface CashFlowEntry {
    journalId: string;
    date: string;
    description: string;
    referenceType: string;
    amount: number; // positive = kas masuk, negative = kas keluar
    counterpartAccount: { id: string; code: string; name: string; type: string } | null;
    category: 'operating' | 'investing' | 'financing';
  }

  const cashFlowEntries: CashFlowEntry[] = [];

  journalEntries?.forEach(journal => {
    const lines = linesByJournal[journal.id] || [];

    // Find cash account lines and counterpart lines
    const cashLines = lines.filter(l => cashAccountIds.includes(l.account_id));
    const counterpartLines = lines.filter(l => !cashAccountIds.includes(l.account_id));

    cashLines.forEach(cashLine => {
      const cashAmount = (cashLine.debit_amount || 0) - (cashLine.credit_amount || 0);
      if (cashAmount === 0) return;

      // Find counterpart account (the other side of the transaction)
      const counterpart = counterpartLines[0]; // Usually there's one counterpart
      const counterpartAccount = counterpart ? accountById[counterpart.account_id] : null;

      // Classify based on counterpart account code
      let category: 'operating' | 'investing' | 'financing' = 'operating';

      if (counterpartAccount) {
        const code = counterpartAccount.code || '';
        const type = counterpartAccount.type?.toLowerCase() || '';

        // INVESTASI: Aset Tetap (14xx, 15xx, 16xx)
        if (code.startsWith('14') || code.startsWith('15') || code.startsWith('16') ||
            code.startsWith('1-4') || code.startsWith('1-5') || code.startsWith('1-6')) {
          category = 'investing';
        }
        // PENDANAAN: Modal (3xxx) atau Hutang Bank (22xx)
        else if (code.startsWith('3') || code.startsWith('22') || code.startsWith('2-2') ||
                 type === 'modal') {
          category = 'financing';
        }
        // OPERASI: Pendapatan, Beban, Piutang, Hutang Usaha, Persediaan
        else {
          category = 'operating';
        }
      }

      cashFlowEntries.push({
        journalId: journal.id,
        date: journal.entry_date,
        description: journal.description || cashLine.description || '',
        referenceType: journal.reference_type || '',
        amount: cashAmount,
        counterpartAccount,
        category
      });
    });
  });

  // ============================================================================
  // AKTIVITAS OPERASI
  // ============================================================================
  const operatingFlows = cashFlowEntries.filter(e => e.category === 'operating');

  // Penerimaan (kas masuk) - amount > 0
  const operatingReceipts = operatingFlows.filter(e => e.amount > 0);
  // Pengeluaran (kas keluar) - amount < 0
  const operatingPayments = operatingFlows.filter(e => e.amount < 0);

  // Klasifikasi penerimaan berdasarkan akun lawan
  const fromCustomers = operatingReceipts
    .filter(e => {
      const code = e.counterpartAccount?.code || '';
      // Pendapatan (4xxx) atau Piutang (12xx)
      return code.startsWith('4') || code.startsWith('12') || code.startsWith('1-2');
    })
    .reduce((sum, e) => sum + e.amount, 0);

  const fromReceivablePayments = operatingReceipts
    .filter(e => {
      const code = e.counterpartAccount?.code || '';
      // Piutang Usaha
      return code.startsWith('12') || code.startsWith('1-2');
    })
    .reduce((sum, e) => sum + e.amount, 0);

  const fromOtherOperating = operatingReceipts
    .filter(e => {
      const code = e.counterpartAccount?.code || '';
      // Pendapatan lain-lain (7xxx) atau tidak terkategori
      return code.startsWith('7') || !code.startsWith('4');
    })
    .reduce((sum, e) => sum + e.amount, 0);

  const fromAdvanceRepayment = operatingReceipts
    .filter(e => {
      const code = e.counterpartAccount?.code || '';
      const name = e.counterpartAccount?.name?.toLowerCase() || '';
      // Piutang Karyawan/Panjar (1220, 122x) - NOT 13xx which is Persediaan
      return code.startsWith('122') || code.startsWith('1-22') ||
             name.includes('panjar') || name.includes('piutang karyawan');
    })
    .reduce((sum, e) => sum + e.amount, 0);

  const cashReceipts = {
    fromCustomers: fromCustomers - fromReceivablePayments, // Avoid double counting
    fromReceivablePayments,
    fromOtherOperating: fromOtherOperating - fromAdvanceRepayment,
    fromAdvanceRepayment,
    total: operatingReceipts.reduce((sum, e) => sum + e.amount, 0)
  };

  // Klasifikasi pengeluaran berdasarkan akun lawan
  const forRawMaterials = Math.abs(operatingPayments
    .filter(e => {
      const code = e.counterpartAccount?.code || '';
      const name = e.counterpartAccount?.name?.toLowerCase() || '';
      // Persediaan (131x, 132x) atau Hutang Usaha (21xx) - NOT 122x which is Piutang Karyawan
      const isPersediaan = (code.startsWith('131') || code.startsWith('132') || code.startsWith('1-31') || code.startsWith('1-32') ||
                          name.includes('persediaan') || name.includes('bahan'));
      const isHutangUsaha = code.startsWith('211') || code.startsWith('2-11') || name.includes('hutang usaha');
      return isPersediaan || isHutangUsaha;
    })
    .reduce((sum, e) => sum + e.amount, 0));

  const forPayablePayments = Math.abs(operatingPayments
    .filter(e => {
      const code = e.counterpartAccount?.code || '';
      // Hutang Usaha
      return code.startsWith('21') || code.startsWith('2-1');
    })
    .reduce((sum, e) => sum + e.amount, 0));

  const forDirectLabor = Math.abs(operatingPayments
    .filter(e => {
      const code = e.counterpartAccount?.code || '';
      const name = e.counterpartAccount?.name?.toLowerCase() || '';
      // Beban Gaji (62xx) atau Hutang Gaji
      return code.startsWith('62') || name.includes('gaji');
    })
    .reduce((sum, e) => sum + e.amount, 0));

  const forEmployeeAdvances = Math.abs(operatingPayments
    .filter(e => {
      const code = e.counterpartAccount?.code || '';
      const name = e.counterpartAccount?.name?.toLowerCase() || '';
      // Piutang Karyawan/Panjar (1220, 122x) - NOT 13xx which is Persediaan
      return code.startsWith('122') || code.startsWith('1-22') ||
             name.includes('panjar') || name.includes('piutang karyawan');
    })
    .reduce((sum, e) => sum + e.amount, 0));

  const forOperatingExpenses = Math.abs(operatingPayments
    .filter(e => {
      const code = e.counterpartAccount?.code || '';
      // Beban Operasional (6xxx) excluding gaji
      return code.startsWith('6') && !code.startsWith('62');
    })
    .reduce((sum, e) => sum + e.amount, 0));

  const forManufacturingOverhead = Math.abs(operatingPayments
    .filter(e => {
      const name = e.description?.toLowerCase() || '';
      return name.includes('listrik') || name.includes('air') || name.includes('overhead');
    })
    .reduce((sum, e) => sum + e.amount, 0));

  const forInterestExpense = Math.abs(operatingPayments
    .filter(e => {
      const code = e.counterpartAccount?.code || '';
      const name = e.counterpartAccount?.name?.toLowerCase() || '';
      return code.startsWith('8') || name.includes('bunga');
    })
    .reduce((sum, e) => sum + e.amount, 0));

  const forTaxes = 0;

  const cashPayments = {
    forRawMaterials,
    forPayablePayments,
    forInterestExpense,
    forDirectLabor,
    forEmployeeAdvances,
    forManufacturingOverhead,
    forOperatingExpenses,
    forTaxes,
    total: Math.abs(operatingPayments.reduce((sum, e) => sum + e.amount, 0))
  };

  const netCashFromOperations = cashReceipts.total - cashPayments.total;

  // ============================================================================
  // AKTIVITAS INVESTASI
  // ============================================================================
  const investingFlows = cashFlowEntries.filter(e => e.category === 'investing');
  const investingOutflows = Math.abs(investingFlows.filter(e => e.amount < 0).reduce((sum, e) => sum + e.amount, 0));
  const investingInflows = investingFlows.filter(e => e.amount > 0).reduce((sum, e) => sum + e.amount, 0);
  const netCashFromInvesting = investingInflows - investingOutflows;

  // ============================================================================
  // AKTIVITAS PENDANAAN
  // ============================================================================
  const financingFlows = cashFlowEntries.filter(e => e.category === 'financing');

  const fromOwnerInvestments = financingFlows
    .filter(e => {
      const code = e.counterpartAccount?.code || '';
      return e.amount > 0 && code.startsWith('3');
    })
    .reduce((sum, e) => sum + e.amount, 0);

  // Penerimaan pinjaman (kas masuk dari hutang bank)
  const fromLoans = financingFlows
    .filter(e => {
      const code = e.counterpartAccount?.code || '';
      return e.amount > 0 && (code.startsWith('22') || code.startsWith('2-2'));
    })
    .reduce((sum, e) => sum + e.amount, 0);

  // Penarikan modal/prive (kas keluar ke modal)
  const forOwnerWithdrawals = Math.abs(financingFlows
    .filter(e => {
      const code = e.counterpartAccount?.code || '';
      const name = e.counterpartAccount?.name?.toLowerCase() || '';
      return e.amount < 0 && (code.startsWith('3') || name.includes('prive'));
    })
    .reduce((sum, e) => sum + e.amount, 0));

  // Pembayaran pinjaman (kas keluar ke hutang bank)
  const forLoanRepayments = Math.abs(financingFlows
    .filter(e => {
      const code = e.counterpartAccount?.code || '';
      return e.amount < 0 && (code.startsWith('22') || code.startsWith('2-2'));
    })
    .reduce((sum, e) => sum + e.amount, 0));

  const financingInflows = fromOwnerInvestments + fromLoans;
  const financingOutflows = forOwnerWithdrawals + forLoanRepayments;
  const netCashFromFinancing = financingInflows - financingOutflows;

  const netCashFlow = netCashFromOperations + netCashFromInvesting + netCashFromFinancing;

  // ============================================================================
  // SALDO KAS AWAL PERIODE
  // ============================================================================
  // Saldo awal = Saldo akhir - Arus kas bersih periode ini
  // ============================================================================
  const beginningCash = endingCash - netCashFlow;

  // ============================================================================
  // GROUP CASH FLOWS BY COA ACCOUNT
  // ============================================================================
  // Mengelompokkan arus kas berdasarkan akun lawan (counterpart) dari jurnal
  // ============================================================================

  // Group receipts by counterpart account
  const receiptsByAccount: Record<string, { accountId: string; accountCode: string; accountName: string; amount: number; transactions: number }> = {};

  operatingReceipts.forEach(e => {
    const account = e.counterpartAccount;
    const key = account?.code || 'unknown';

    if (!receiptsByAccount[key]) {
      receiptsByAccount[key] = {
        accountId: account?.id || '',
        accountCode: account?.code || 'unknown',
        accountName: account?.name || 'Unknown',
        amount: 0,
        transactions: 0
      };
    }
    receiptsByAccount[key].amount += e.amount;
    receiptsByAccount[key].transactions += 1;
  });

  // Group payments by counterpart account
  const paymentsByAccount: Record<string, { accountId: string; accountCode: string; accountName: string; amount: number; transactions: number }> = {};

  operatingPayments.forEach(e => {
    const account = e.counterpartAccount;
    const key = account?.code || 'unknown';

    if (!paymentsByAccount[key]) {
      paymentsByAccount[key] = {
        accountId: account?.id || '',
        accountCode: account?.code || 'unknown',
        accountName: account?.name || 'Unknown',
        amount: 0,
        transactions: 0
      };
    }
    paymentsByAccount[key].amount += Math.abs(e.amount);
    paymentsByAccount[key].transactions += 1;
  });

  // Convert to arrays and sort by account code
  const receiptsByAccountList: CashFlowCategoryItem[] = Object.values(receiptsByAccount)
    .filter(item => item.amount > 0)
    .sort((a, b) => a.accountCode.localeCompare(b.accountCode))
    .map(item => ({
      ...item,
      formattedAmount: formatCurrency(item.amount)
    }));

  const paymentsByAccountList: CashFlowCategoryItem[] = Object.values(paymentsByAccount)
    .filter(item => item.amount > 0)
    .sort((a, b) => a.accountCode.localeCompare(b.accountCode))
    .map(item => ({
      ...item,
      formattedAmount: formatCurrency(item.amount)
    }));

  // Group investing by counterpart account
  const investingByAccount: Record<string, { accountId: string; accountCode: string; accountName: string; amount: number; transactions: number }> = {};

  investingFlows.forEach(e => {
    const account = e.counterpartAccount;
    const key = account?.code || 'unknown';

    if (!investingByAccount[key]) {
      investingByAccount[key] = {
        accountId: account?.id || '',
        accountCode: account?.code || 'unknown',
        accountName: account?.name || 'Unknown',
        amount: 0,
        transactions: 0
      };
    }
    investingByAccount[key].amount += e.amount;
    investingByAccount[key].transactions += 1;
  });

  const investingByAccountList: CashFlowCategoryItem[] = Object.values(investingByAccount)
    .sort((a, b) => a.accountCode.localeCompare(b.accountCode))
    .map(item => ({
      ...item,
      formattedAmount: formatCurrency(item.amount)
    }));

  // Group financing by counterpart account
  const financingByAccount: Record<string, { accountId: string; accountCode: string; accountName: string; amount: number; transactions: number }> = {};

  financingFlows.forEach(e => {
    const account = e.counterpartAccount;
    const key = account?.code || 'unknown';

    if (!financingByAccount[key]) {
      financingByAccount[key] = {
        accountId: account?.id || '',
        accountCode: account?.code || 'unknown',
        accountName: account?.name || 'Unknown',
        amount: 0,
        transactions: 0
      };
    }
    financingByAccount[key].amount += e.amount;
    financingByAccount[key].transactions += 1;
  });

  const financingByAccountList: CashFlowCategoryItem[] = Object.values(financingByAccount)
    .sort((a, b) => a.accountCode.localeCompare(b.accountCode))
    .map(item => ({
      ...item,
      formattedAmount: formatCurrency(item.amount)
    }));

  // Calculate summary by account type
  const summaryByAccountType = {
    pendapatan: receiptsByAccountList
      .filter(item => item.accountCode.startsWith('4'))
      .reduce((sum, item) => sum + item.amount, 0),
    beban: paymentsByAccountList
      .filter(item => item.accountCode.startsWith('6'))
      .reduce((sum, item) => sum + item.amount, 0),
    aset: receiptsByAccountList
      .filter(item => item.accountCode.startsWith('1'))
      .reduce((sum, item) => sum + item.amount, 0) -
      paymentsByAccountList
      .filter(item => item.accountCode.startsWith('1'))
      .reduce((sum, item) => sum + item.amount, 0),
    kewajiban: paymentsByAccountList
      .filter(item => item.accountCode.startsWith('2'))
      .reduce((sum, item) => sum + item.amount, 0),
    modal: fromOwnerInvestments - forOwnerWithdrawals
  };

  console.log('📊 Cash Flow Statement from Journal:', {
    operatingReceipts: cashReceipts.total,
    operatingPayments: cashPayments.total,
    netCashFromOperations,
    netCashFromInvesting,
    netCashFromFinancing,
    netCashFlow,
    beginningCash,
    endingCash,
    journalEntriesProcessed: journalEntries?.length || 0,
    cashFlowEntriesGenerated: cashFlowEntries.length,
    // Detail klasifikasi
    receiptsBreakdown: {
      fromCustomers: cashReceipts.fromCustomers,
      fromReceivablePayments: cashReceipts.fromReceivablePayments,
      fromAdvanceRepayment: cashReceipts.fromAdvanceRepayment,
      fromOtherOperating: cashReceipts.fromOtherOperating
    },
    paymentsBreakdown: {
      forRawMaterials: cashPayments.forRawMaterials,
      forPayablePayments: cashPayments.forPayablePayments,
      forDirectLabor: cashPayments.forDirectLabor,
      forEmployeeAdvances: cashPayments.forEmployeeAdvances,
      forOperatingExpenses: cashPayments.forOperatingExpenses
    },
    // Detail per akun lawan untuk debugging
    operatingReceiptsDetail: receiptsByAccountList,
    operatingPaymentsDetail: paymentsByAccountList
  });

  return {
    operatingActivities: {
      netIncome: netCashFromOperations,
      adjustments: [],
      workingCapitalChanges: [],
      cashReceipts: {
        ...cashReceipts,
        byAccount: receiptsByAccountList
      },
      cashPayments: {
        ...cashPayments,
        byAccount: paymentsByAccountList
      },
      netCashFromOperations
    },
    investingActivities: {
      equipmentPurchases: investingFlows
        .filter(e => e.amount < 0)
        .map(e => ({
          description: e.description || 'Pembelian Aset',
          amount: e.amount,
          formattedAmount: formatCurrency(e.amount),
          source: 'journal',
          accountId: e.counterpartAccount?.id,
          accountCode: e.counterpartAccount?.code,
          accountName: e.counterpartAccount?.name
        })),
      otherInvestments: investingFlows
        .filter(e => e.amount > 0)
        .map(e => ({
          description: e.description || 'Penjualan Aset',
          amount: e.amount,
          formattedAmount: formatCurrency(e.amount),
          source: 'journal',
          accountId: e.counterpartAccount?.id,
          accountCode: e.counterpartAccount?.code,
          accountName: e.counterpartAccount?.name
        })),
      netCashFromInvesting,
      byAccount: investingByAccountList
    },
    financingActivities: {
      ownerInvestments: fromOwnerInvestments > 0 ? [{
        description: 'Setoran Modal Pemilik',
        amount: fromOwnerInvestments,
        formattedAmount: formatCurrency(fromOwnerInvestments),
        source: 'journal'
      }] : [],
      ownerWithdrawals: forOwnerWithdrawals > 0 ? [{
        description: 'Penarikan Modal/Prive',
        amount: -forOwnerWithdrawals,
        formattedAmount: formatCurrency(-forOwnerWithdrawals),
        source: 'journal'
      }] : [],
      loans: [
        ...(fromLoans > 0 ? [{
          description: 'Penerimaan Pinjaman Bank',
          amount: fromLoans,
          formattedAmount: formatCurrency(fromLoans),
          source: 'journal'
        }] : []),
        ...(forLoanRepayments > 0 ? [{
          description: 'Pembayaran Pinjaman Bank',
          amount: -forLoanRepayments,
          formattedAmount: formatCurrency(-forLoanRepayments),
          source: 'journal'
        }] : [])
      ],
      netCashFromFinancing,
      byAccount: financingByAccountList
    },
    netCashFlow,
    beginningCash,
    endingCash,
    periodFrom,
    periodTo,
    generatedAt: new Date(),
    summaryByAccountType
  };
}