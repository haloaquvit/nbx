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

// Financial Statement Types
export interface BalanceSheetData {
  assets: {
    currentAssets: {
      kasBank: BalanceSheetItem[];
      piutangUsaha: BalanceSheetItem[];
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
 */
export async function generateBalanceSheet(asOfDate?: Date, branchId?: string): Promise<BalanceSheetData> {
  const cutoffDate = asOfDate || new Date();
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

  // Get all accounts with current balances (filtered by branch if provided)
  // Setiap branch memiliki COA (Chart of Accounts) sendiri
  let accountsQuery = supabase
    .from('accounts')
    .select('id, name, type, balance, initial_balance, code, branch_id')
    .order('code');

  if (branchId) {
    accountsQuery = accountsQuery.eq('branch_id', branchId);
  }

  const { data: accountsData, error: accountsError } = await accountsQuery;

  if (accountsError) throw new Error(`Failed to fetch accounts: ${accountsError.message}`);

  // Convert DB accounts to App accounts for use with lookup service
  const accounts = accountsData?.map(fromDbToApp) || [];

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

  // Get products (Jual Langsung) for inventory calculation
  let productsQuery = supabase
    .from('products')
    .select('id, name, type, current_stock, cost_price, branch_id')
    .eq('type', 'Jual Langsung');

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
  // PERSEDIAAN - USING ACCOUNT LOOKUP SERVICE
  // ============================================================================
  // Persediaan diambil dari saldo akun COA menggunakan lookup by name/type
  // Mencari semua jenis persediaan: bahan baku, barang jadi, WIP
  // ============================================================================
  const persediaanBahan = findAllAccountsByLookup(accounts, 'PERSEDIAAN_BAHAN');
  const persediaanBarang = findAllAccountsByLookup(accounts, 'PERSEDIAAN_BARANG');
  const persediaanWIP = findAllAccountsByLookup(accounts, 'PERSEDIAAN_WIP');
  const allPersediaan = [...persediaanBahan, ...persediaanBarang, ...persediaanWIP];
  const totalInventoryFromCOA = getTotalBalance(allPersediaan);

  // Calculate inventory from materials (raw materials)
  const materialsInventory = materials?.reduce((sum, material) =>
    sum + ((material.stock || 0) * (material.price_per_unit || 0)), 0) || 0;

  // Calculate inventory from products (Jual Langsung products)
  // Value = current_stock × cost_price
  const productsInventory = productsData?.reduce((sum, product) =>
    sum + ((product.current_stock || 0) * (product.cost_price || 0)), 0) || 0;

  // Total calculated inventory = materials + products (Jual Langsung)
  const calculatedInventory = materialsInventory + productsInventory;

  // Use COA value if available and non-zero, otherwise use calculated
  const totalInventory = totalInventoryFromCOA > 0 ? totalInventoryFromCOA : calculatedInventory;

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

  // Use COA account info if available, otherwise show as calculated
  // Take the first inventory account for display purposes
  const firstPersediaanAccount = allPersediaan[0];
  const persediaan: BalanceSheetItem[] = totalInventory > 0 ? [{
    accountId: firstPersediaanAccount?.id || 'calculated-inventory',
    accountCode: firstPersediaanAccount?.code || '1.1.3',
    accountName: firstPersediaanAccount?.name || 'Persediaan',
    balance: totalInventory,
    formattedBalance: formatCurrency(totalInventory)
  }] : [];

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

  const totalCurrentAssets = 
    kasBank.reduce((sum, item) => sum + item.balance, 0) +
    piutangUsaha.reduce((sum, item) => sum + item.balance, 0) +
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

  // Add accounts payable from purchase orders
  if (totalAccountsPayable > 0) {
    hutangUsaha.push({
      accountId: 'calculated-accounts-payable',
      accountCode: '2100',
      accountName: 'Hutang Supplier (PO)',
      balance: totalAccountsPayable,
      formattedBalance: formatCurrency(totalAccountsPayable)
    });
  }

  // Hutang Gaji - Using lookup service
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

  // Add unpaid payroll liabilities
  if (totalPayrollLiabilities > 0) {
    hutangGaji.push({
      accountId: 'calculated-payroll-liabilities',
      accountCode: '2110',
      accountName: 'Hutang Gaji Karyawan',
      balance: totalPayrollLiabilities,
      formattedBalance: formatCurrency(totalPayrollLiabilities)
    });
  }

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
  // MODAL ASET AWAL (Initial Asset Contributions as Capital)
  // ============================================================================
  // Saldo awal (initial_balance) dari semua akun Aset harus dicatat sebagai
  // Modal, bukan sebagai Laba Rugi Ditahan. Ini karena:
  // - Persediaan awal adalah kontribusi modal pemilik saat memulai usaha
  // - Kas awal adalah setoran modal awal
  // - Aset tetap awal adalah kontribusi modal dalam bentuk barang
  //
  // CATATAN: Jika persediaan dihitung dari tabel materials (fallback),
  // nilai tersebut juga dianggap sebagai modal awal karena merupakan
  // kontribusi awal pemilik dalam bentuk barang/bahan.
  // ============================================================================

  // Get initial_balance from all asset accounts (grouped by category)
  const assetInitialBalances = {
    persediaan: 0,
    kasBank: 0,
    asetTetap: 0,
    lainnya: 0
  };

  accounts?.filter(acc => acc.type?.toLowerCase() === 'aset').forEach(acc => {
    const initialBal = acc.initialBalance || 0;
    if (initialBal <= 0) return;

    // Categorize by account code or name
    if (acc.code?.startsWith('13') || acc.name.toLowerCase().includes('persediaan')) {
      assetInitialBalances.persediaan += initialBal;
    } else if (acc.code?.startsWith('11') || acc.name.toLowerCase().includes('kas') || acc.name.toLowerCase().includes('bank')) {
      assetInitialBalances.kasBank += initialBal;
    } else if (acc.code?.startsWith('14') || acc.code?.startsWith('15') || acc.code?.startsWith('16') ||
               acc.name.toLowerCase().includes('peralatan') || acc.name.toLowerCase().includes('kendaraan') ||
               acc.name.toLowerCase().includes('aset tetap')) {
      assetInitialBalances.asetTetap += initialBal;
    } else {
      assetInitialBalances.lainnya += initialBal;
    }
  });

  // PENTING: Jika persediaan dari COA = 0 tapi calculatedInventory > 0,
  // artinya persediaan dihitung dari materials table (fallback).
  // Nilai ini adalah persediaan awal yang merupakan kontribusi modal pemilik.
  if (totalInventoryFromCOA === 0 && calculatedInventory > 0) {
    assetInitialBalances.persediaan += calculatedInventory;
  }

  // Add Modal entries for each category with initial balance
  if (assetInitialBalances.persediaan > 0) {
    modalPemilik.push({
      accountId: 'modal-persediaan-awal',
      accountCode: '3210',
      accountName: 'Modal Persediaan Awal',
      balance: assetInitialBalances.persediaan,
      formattedBalance: formatCurrency(assetInitialBalances.persediaan)
    });
  }

  if (assetInitialBalances.kasBank > 0) {
    modalPemilik.push({
      accountId: 'modal-kas-awal',
      accountCode: '3100',
      accountName: 'Modal Disetor (Kas)',
      balance: assetInitialBalances.kasBank,
      formattedBalance: formatCurrency(assetInitialBalances.kasBank)
    });
  }

  if (assetInitialBalances.asetTetap > 0) {
    modalPemilik.push({
      accountId: 'modal-aset-tetap-awal',
      accountCode: '3220',
      accountName: 'Modal Aset Tetap Awal',
      balance: assetInitialBalances.asetTetap,
      formattedBalance: formatCurrency(assetInitialBalances.asetTetap)
    });
  }

  if (assetInitialBalances.lainnya > 0) {
    modalPemilik.push({
      accountId: 'modal-aset-lainnya',
      accountCode: '3290',
      accountName: 'Modal Aset Lainnya',
      balance: assetInitialBalances.lainnya,
      formattedBalance: formatCurrency(assetInitialBalances.lainnya)
    });
  }

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
  // ============================================================================
  let journalQuery = supabase
    .from('journal_entry_lines')
    .select(`
      id,
      account_id,
      account_code,
      account_name,
      debit_amount,
      credit_amount,
      description,
      journal_entries!inner (
        id,
        entry_number,
        entry_date,
        description,
        status,
        is_voided,
        branch_id
      )
    `)
    .gte('journal_entries.entry_date', fromDateStr)
    .lte('journal_entries.entry_date', toDateStr)
    .eq('journal_entries.status', 'posted')
    .eq('journal_entries.is_voided', false);

  if (branchId) {
    journalQuery = journalQuery.eq('journal_entries.branch_id', branchId);
  }

  const { data: journalLines, error: journalError } = await journalQuery;

  if (journalError) {
    console.error('Error fetching journal lines:', journalError);
  }

  // ============================================================================
  // GET ACCOUNTS TO DETERMINE TYPES
  // ============================================================================
  let accountsQuery = supabase
    .from('accounts')
    .select('id, code, name, type, is_header')
    .order('code');

  if (branchId) {
    accountsQuery = accountsQuery.eq('branch_id', branchId);
  }

  const { data: accountsData } = await accountsQuery;

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
  const accountTotals: Record<string, {
    accountId: string;
    accountCode: string;
    accountName: string;
    accountType: string;
    debit: number;
    credit: number;
  }> = {};

  journalLines?.forEach(line => {
    const accountId = line.account_id;
    const accountInfo = accountTypes[accountId];

    if (!accountTotals[accountId]) {
      accountTotals[accountId] = {
        accountId,
        accountCode: line.account_code || accountInfo?.code || '',
        accountName: line.account_name || accountInfo?.name || 'Unknown',
        accountType: accountInfo?.type || 'Unknown',
        debit: 0,
        credit: 0
      };
    }

    accountTotals[accountId].debit += line.debit_amount || 0;
    accountTotals[accountId].credit += line.credit_amount || 0;
  });

  // ============================================================================
  // PENDAPATAN (Revenue) - Type 'Pendapatan' or code starts with '4'
  // Normal balance: CREDIT (credit increases, debit decreases)
  // ============================================================================
  const revenueAccounts = Object.values(accountTotals).filter(acc => {
    const accInfo = accountTypes[acc.accountId];
    if (accInfo?.isHeader) return false;
    return acc.accountType.toLowerCase() === 'pendapatan' || acc.accountCode.startsWith('4');
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
  // ============================================================================
  const cogsAccounts = Object.values(accountTotals).filter(acc => {
    const accInfo = accountTypes[acc.accountId];
    if (accInfo?.isHeader) return false;
    return acc.accountCode.startsWith('5');
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
  // ============================================================================
  const expenseAccounts = Object.values(accountTotals).filter(acc => {
    const accInfo = accountTypes[acc.accountId];
    if (accInfo?.isHeader) return false;
    const isExpense = acc.accountType.toLowerCase() === 'beban' || acc.accountCode.startsWith('6');
    // Exclude COGS accounts (already counted)
    const isCOGS = acc.accountCode.startsWith('5');
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
  // ============================================================================
  const otherIncomeAccounts = Object.values(accountTotals).filter(acc => {
    const accInfo = accountTypes[acc.accountId];
    if (accInfo?.isHeader) return false;
    return acc.accountCode.startsWith('7');
  });

  const otherExpenseAccounts = Object.values(accountTotals).filter(acc => {
    const accInfo = accountTypes[acc.accountId];
    if (accInfo?.isHeader) return false;
    return acc.accountCode.startsWith('8');
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

  console.log('📊 Income Statement from Journal:', {
    totalRevenue,
    totalCOGS,
    grossProfit,
    totalOperatingExpenses,
    operatingIncome,
    netOtherIncome,
    netIncome,
    journalLinesProcessed: journalLines?.length || 0
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

  // ============================================================================
  // GET ALL ACCOUNTS FOR CLASSIFICATION
  // ============================================================================
  let allAccountsQuery = supabase
    .from('accounts')
    .select('id, code, name, type, balance, initial_balance, branch_id')
    .order('code');

  if (branchId) {
    allAccountsQuery = allAccountsQuery.eq('branch_id', branchId);
  }

  const { data: allAccountsData } = await allAccountsQuery;

  // Convert DB accounts to App accounts for use with lookup service
  const allAccounts = allAccountsData?.map(fromDbToApp) || [];

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
      // Piutang Karyawan (13xx)
      return code.startsWith('13') || code.startsWith('1-3');
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
      // Persediaan (13xx) atau Hutang Usaha (21xx)
      return code.startsWith('13') || code.startsWith('21') || code.startsWith('1-3') || code.startsWith('2-1');
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
      // Piutang Karyawan
      return code.startsWith('13') || code.startsWith('1-3');
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
    cashFlowEntriesGenerated: cashFlowEntries.length
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