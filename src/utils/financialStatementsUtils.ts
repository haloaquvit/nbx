import { supabase } from '@/integrations/supabase/client';

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
  let accountsQuery = supabase
    .from('accounts')
    .select('id, name, type, balance, initial_balance, code, branch_id')
    .order('code');

  if (branchId) {
    accountsQuery = accountsQuery.eq('branch_id', branchId);
  }

  const { data: accounts, error: accountsError } = await accountsQuery;

  if (accountsError) throw new Error(`Failed to fetch accounts: ${accountsError.message}`);

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
  // PIUTANG USAHA - FROM COA (Account 1200/1210)
  // ============================================================================
  // Piutang diambil dari saldo akun COA, bukan dihitung dari transaksi
  // Ini memastikan konsistensi dengan double-entry accounting
  // ============================================================================
  const piutangAccount = accounts?.find(acc =>
    acc.code === '1200' || acc.code === '1210' ||
    acc.name.toLowerCase().includes('piutang usaha')
  );
  const totalReceivables = piutangAccount?.balance || 0;

  // Fallback: Calculate from transactions if COA account not found or zero
  const calculatedReceivables = transactions?.reduce((sum, tx) =>
    sum + ((tx.total || 0) - (tx.paid_amount || 0)), 0) || 0;

  // Use COA value if available and non-zero, otherwise use calculated
  const finalReceivables = totalReceivables > 0 ? totalReceivables : calculatedReceivables;

  // ============================================================================
  // PERSEDIAAN - FROM COA (Account 1400/1410)
  // ============================================================================
  // Persediaan diambil dari saldo akun COA, bukan dihitung dari materials
  // Ini memastikan konsistensi dengan double-entry accounting
  // ============================================================================
  const persediaanAccount = accounts?.find(acc =>
    acc.code === '1400' || acc.code === '1410' ||
    acc.name.toLowerCase().includes('persediaan')
  );
  const totalInventoryFromCOA = persediaanAccount?.balance || 0;

  // Fallback: Calculate from materials if COA account not found or zero
  const calculatedInventory = materials?.reduce((sum, material) =>
    sum + ((material.stock || 0) * (material.price_per_unit || 0)), 0) || 0;

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

  // Group accounts by type
  const assetAccounts = accounts?.filter(acc => acc.type === 'Aset') || [];
  const liabilityAccounts = accounts?.filter(acc => acc.type === 'Kewajiban') || [];
  const equityAccounts = accounts?.filter(acc => acc.type === 'Modal') || [];

  // Build current assets
  const kasBank = assetAccounts
    .filter(acc => acc.name.toLowerCase().includes('kas') || acc.name.toLowerCase().includes('bank'))
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
  const persediaan: BalanceSheetItem[] = totalInventory > 0 ? [{
    accountId: persediaanAccount?.id || 'calculated-inventory',
    accountCode: persediaanAccount?.code || '1400',
    accountName: persediaanAccount?.name || 'Persediaan',
    balance: totalInventory,
    formattedBalance: formatCurrency(totalInventory)
  }] : [];

  const panjarKaryawan = assetAccounts
    .filter(acc => acc.name.toLowerCase().includes('panjar'))
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

  // Build fixed assets - include all accounts with code 1400-1499 (Aset Tetap)
  const peralatan = assetAccounts
    .filter(acc => {
      // Include accounts with code starting with 14 (1400-1499 range for fixed assets)
      if (acc.code && acc.code.startsWith('14')) return true;

      // Fallback: also include by name for accounts without codes
      return acc.name.toLowerCase().includes('peralatan') ||
             acc.name.toLowerCase().includes('kendaraan') ||
             acc.name.toLowerCase().includes('mesin') ||
             acc.name.toLowerCase().includes('bangunan') ||
             acc.name.toLowerCase().includes('tanah') ||
             acc.name.toLowerCase().includes('komputer') ||
             acc.name.toLowerCase().includes('furniture') ||
             acc.name.toLowerCase().includes('aset tetap');
    })
    .filter(acc => (acc.balance || 0) !== 0) // Hide zero balances
    .map(acc => ({
      accountId: acc.id,
      accountCode: acc.code,
      accountName: acc.name,
      balance: acc.balance || 0,
      formattedBalance: formatCurrency(acc.balance || 0)
    }));

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

  // Build liabilities
  const hutangUsaha = liabilityAccounts
    .filter(acc =>
      acc.name.toLowerCase().includes('hutang') &&
      !acc.name.toLowerCase().includes('gaji') &&
      !acc.name.toLowerCase().includes('pajak')
    )
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

  const hutangGaji = liabilityAccounts
    .filter(acc => acc.name.toLowerCase().includes('gaji'))
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

  const hutangPajak = liabilityAccounts
    .filter(acc => acc.name.toLowerCase().includes('pajak') || acc.name.toLowerCase().includes('ppn'))
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

  // Calculate retained earnings (would need period income statement)
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
 * Generate Income Statement from existing data
 */
export async function generateIncomeStatement(
  periodFrom: Date,
  periodTo: Date,
  branchId?: string
): Promise<IncomeStatementData> {
  const fromDateStr = periodFrom.toISOString().split('T')[0];
  const toDateStr = periodTo.toISOString().split('T')[0];

  // Get revenue from transactions (filtered by branch)
  let transactionsQuery = supabase
    .from('transactions')
    .select('id, total, subtotal, ppn_amount, order_date, items, branch_id')
    .gte('order_date', fromDateStr)
    .lte('order_date', toDateStr);

  if (branchId) {
    transactionsQuery = transactionsQuery.eq('branch_id', branchId);
  }

  const { data: transactions, error: transactionsError } = await transactionsQuery;

  if (transactionsError) throw new Error(`Failed to fetch transactions: ${transactionsError.message}`);

  // Get expenses from cash_history (filtered by branch)
  let cashHistoryQuery = supabase
    .from('cash_history')
    .select('*')
    .gte('created_at', fromDateStr)
    .lte('created_at', toDateStr + 'T23:59:59')
    .in('type', ['pengeluaran', 'kas_keluar_manual', 'pembayaran_po']);

  if (branchId) {
    cashHistoryQuery = cashHistoryQuery.eq('branch_id', branchId);
  }

  const { data: cashHistory, error: cashError } = await cashHistoryQuery;

  if (cashError) throw new Error(`Failed to fetch cash history: ${cashError.message}`);

  // Get commission data (filtered by branch)
  let commissionsQuery = supabase
    .from('commission_entries')
    .select('*')
    .gte('created_at', fromDateStr)
    .lte('created_at', toDateStr + 'T23:59:59');

  if (branchId) {
    commissionsQuery = commissionsQuery.eq('branch_id', branchId);
  }

  const { data: commissions, error: commissionsError } = await commissionsQuery;

  // Ignore commission errors as table might not exist
  const commissionData = commissionsError ? [] : (commissions || []);

  // ============================================================================
  // PENDAPATAN - FROM COA (Account 4xxx) + CALCULATED FROM TRANSACTIONS
  // ============================================================================
  // Pendapatan bisa diambil dari:
  // 1. Akun COA dengan kode 4xxx (Pendapatan)
  // 2. Calculated dari transaksi (sebagai fallback/comparison)
  // Kita gabungkan keduanya untuk mendapatkan nilai yang lebih akurat
  // ============================================================================

  // Get all revenue accounts from COA (code starts with 4)
  let revenueAccountsQuery = supabase
    .from('accounts')
    .select('id, code, name, type, balance')
    .or('type.eq.Pendapatan,code.like.4%')
    .order('code');

  if (branchId) {
    revenueAccountsQuery = revenueAccountsQuery.eq('branch_id', branchId);
  }

  const { data: revenueAccounts } = await revenueAccountsQuery;

  // Calculate revenue from transactions (as baseline)
  const calculatedRevenue = transactions?.reduce((sum, tx) => sum + (tx.total || 0), 0) || 0;

  // Get revenue from COA accounts
  const revenueFromCOA = revenueAccounts?.reduce((sum, acc) => sum + (acc.balance || 0), 0) || 0;

  // Use COA value if available and > 0, otherwise use calculated
  const totalRevenue = revenueFromCOA > 0 ? revenueFromCOA : calculatedRevenue;

  // Build revenue items from COA accounts
  const penjualan: IncomeStatementItem[] = [];

  // Add individual COA accounts if they have balances
  if (revenueAccounts && revenueAccounts.length > 0) {
    revenueAccounts
      .filter(acc => (acc.balance || 0) > 0)
      .forEach(acc => {
        penjualan.push({
          accountId: acc.id,
          accountCode: acc.code,
          accountName: acc.name,
          amount: acc.balance || 0,
          formattedAmount: formatCurrency(acc.balance || 0),
          source: 'manual_journal'
        });
      });
  }

  // If no COA accounts have balances, use calculated value
  if (penjualan.length === 0) {
    penjualan.push({
      accountName: 'Penjualan (Calculated)',
      amount: calculatedRevenue,
      formattedAmount: formatCurrency(calculatedRevenue),
      source: 'transactions'
    });
  }

  // ============================================================================
  // CALCULATE HPP (COGS) - DARI PENJUALAN
  // ============================================================================
  // HPP dihitung HANYA dari cost_price produk yang TERJUAL:
  // 1. Produksi (BOM) - HPP = Total harga bahan baku dari BOM per unit
  // 2. Jual Langsung - HPP = cost_price (harga pokok/modal) dari produk
  //
  // Tenaga kerja dan overhead TIDAK masuk HPP, melainkan masuk Beban Operasional
  // ============================================================================

  // Get all products with their BOM (materials) and cost_price
  // Note: Don't filter by branch to ensure we can calculate HPP for all sold products
  const { data: productsData } = await supabase
    .from('products')
    .select('id, name, type, base_price, cost_price, materials');

  // Get all materials for BOM calculation
  // Note: Don't filter by branch to ensure we can calculate HPP from all materials
  const { data: materialsData } = await supabase
    .from('materials')
    .select('id, name, price_per_unit');

  // Create a map of material prices
  const materialPrices: Record<string, number> = {};
  materialsData?.forEach(m => {
    materialPrices[m.id] = m.price_per_unit || 0;
  });

  // Calculate HPP per product
  const productHPP: Record<string, number> = {};
  productsData?.forEach(product => {
    if (product.type === 'Produksi' && product.materials && Array.isArray(product.materials)) {
      // Produksi: Calculate HPP from BOM (Bill of Materials)
      let bomCost = 0;
      product.materials.forEach((mat: any) => {
        const materialPrice = materialPrices[mat.materialId] || 0;
        bomCost += materialPrice * (mat.quantity || 0);
      });
      productHPP[product.id] = bomCost;
    } else {
      // Jual Langsung: Use cost_price if available, otherwise fallback to 70% of base_price
      if (product.cost_price && product.cost_price > 0) {
        productHPP[product.id] = product.cost_price;
      } else {
        // Fallback: Use 70% of base_price as estimated cost
        productHPP[product.id] = (product.base_price || 0) * 0.7;
      }
    }
  });

  // Calculate total HPP from transactions (ONLY material/product cost)
  let materialCost = 0;
  let hppDebugInfo: { productId: string; productName: string; hpp: number; qty: number; subtotal: number }[] = [];

  transactions?.forEach(tx => {
    if (tx.items && Array.isArray(tx.items)) {
      tx.items.forEach((item: any) => {
        // Skip sales metadata item
        if (item._isSalesMeta) return;

        // Try to get product ID from various possible structures:
        // 1. item.product.id (standard format)
        // 2. item.productId (alternative format)
        // 3. item.product_id (snake_case format from DB)
        const productId = item.product?.id || item.productId || item.product_id;
        const productName = item.product?.name || item.productName || 'Unknown';

        if (productId) {
          // Get HPP from calculated map, fallback to 70% of item price if not found
          let hpp = productHPP[productId];
          if (hpp === undefined || hpp === 0) {
            // Fallback: use 70% of item price as estimated HPP
            const itemPrice = item.price || 0;
            hpp = itemPrice * 0.7;
          }

          const qty = item.quantity || 0;
          const subtotal = hpp * qty;
          materialCost += subtotal;

          // Debug info
          hppDebugInfo.push({ productId, productName, hpp, qty, subtotal });
        }
      });
    }
  });

  // Log HPP calculation for debugging (only in development)
  if (hppDebugInfo.length > 0) {
    console.log('📊 HPP Calculation Debug:', {
      totalTransactions: transactions?.length || 0,
      itemsProcessed: hppDebugInfo.length,
      totalHPP: materialCost,
      details: hppDebugInfo.slice(0, 10) // Show first 10 items only
    });
  }

  // HPP = ONLY material/product cost (no labor, no overhead)
  const totalCOGS = materialCost;

  const bahanBaku: IncomeStatementItem[] = materialCost > 0 ? [{
    accountName: 'HPP Barang Terjual',
    amount: materialCost,
    formattedAmount: formatCurrency(materialCost),
    source: 'transactions'
  }] : [];

  // Tenaga kerja dan overhead sekarang masuk ke Beban Operasional (lihat di bawah)
  const tenagaKerja: IncomeStatementItem[] = [];
  const overhead: IncomeStatementItem[] = [];

  const grossProfit = totalRevenue - totalCOGS;
  const grossProfitMargin = calculatePercentage(grossProfit, totalRevenue);

  // ============================================================================
  // CALCULATE OPERATING EXPENSES - FROM COA (Chart of Accounts)
  // ============================================================================
  // Beban operasional diambil dari:
  // 1. Tabel expenses dengan expense_account_id yang link ke akun Beban di COA
  // 2. Cash history untuk gaji dan pembayaran lainnya
  // 3. Grouped by expense account untuk detail per akun beban
  // ============================================================================

  // Get all expense accounts from COA (type = 'Beban')
  let expenseAccountsQuery = supabase
    .from('accounts')
    .select('id, code, name, type')
    .eq('type', 'Beban')
    .order('code');

  if (branchId) {
    expenseAccountsQuery = expenseAccountsQuery.eq('branch_id', branchId);
  }

  const { data: expenseAccounts } = await expenseAccountsQuery;

  // Get expenses with their expense_account_id
  let operatingExpensesQuery = supabase
    .from('expenses')
    .select('amount, expense_account_id, expense_account_name, category, branch_id')
    .gte('date', fromDateStr)
    .lte('date', toDateStr + 'T23:59:59');

  if (branchId) {
    operatingExpensesQuery = operatingExpensesQuery.eq('branch_id', branchId);
  }

  const { data: operatingExpensesData } = await operatingExpensesQuery;

  // Get payroll expenses from cash_history
  let payrollExpenseQuery = supabase
    .from('cash_history')
    .select('amount, description, branch_id')
    .gte('created_at', fromDateStr)
    .lte('created_at', toDateStr + 'T23:59:59')
    .in('type', ['gaji_karyawan', 'pembayaran_gaji']);

  if (branchId) {
    payrollExpenseQuery = payrollExpenseQuery.eq('branch_id', branchId);
  }

  const { data: payrollExpenseData } = await payrollExpenseQuery;
  const totalPayrollExpense = payrollExpenseData?.reduce((sum, record) => sum + (record.amount || 0), 0) || 0;

  // Group expenses by account
  const expensesByAccount: Record<string, { accountId: string; accountCode: string; accountName: string; amount: number }> = {};

  // Process expenses with expense_account_id
  operatingExpensesData?.forEach(expense => {
    const accountId = expense.expense_account_id || 'other';
    const accountName = expense.expense_account_name || expense.category || 'Beban Lain-lain';

    if (!expensesByAccount[accountId]) {
      // Find account code from COA
      const account = expenseAccounts?.find(a => a.id === accountId);
      expensesByAccount[accountId] = {
        accountId,
        accountCode: account?.code || '',
        accountName: account?.name || accountName,
        amount: 0
      };
    }
    expensesByAccount[accountId].amount += expense.amount || 0;
  });

  // Add payroll as separate expense category (Beban Gaji Karyawan - 6210)
  if (totalPayrollExpense > 0) {
    // First try to find specific account 6210 (Beban Gaji Karyawan)
    // Then fallback to any account with 'gaji' in name or starts with '62'
    const payrollAccount = expenseAccounts?.find(a => a.code === '6210') ||
      expenseAccounts?.find(a => a.name.toLowerCase().includes('gaji karyawan')) ||
      expenseAccounts?.find(a => a.name.toLowerCase().includes('gaji') || a.code?.startsWith('62'));

    const payrollAccountId = payrollAccount?.id || 'payroll-6210';

    if (!expensesByAccount[payrollAccountId]) {
      expensesByAccount[payrollAccountId] = {
        accountId: payrollAccountId,
        accountCode: payrollAccount?.code || '6210',
        accountName: payrollAccount?.name || 'Beban Gaji Karyawan',
        amount: 0
      };
    }
    expensesByAccount[payrollAccountId].amount += totalPayrollExpense;
  }

  // Convert to IncomeStatementItem array, sorted by account code
  const bebanOperasional: IncomeStatementItem[] = Object.values(expensesByAccount)
    .filter(exp => exp.amount > 0)
    .sort((a, b) => (a.accountCode || '').localeCompare(b.accountCode || ''))
    .map(exp => ({
      accountId: exp.accountId,
      accountCode: exp.accountCode,
      accountName: exp.accountName,
      amount: exp.amount,
      formattedAmount: formatCurrency(exp.amount),
      source: 'expenses' as const
    }));

  const totalCommissions = commissionData.reduce((sum, comm) => sum + (comm.amount || 0), 0);

  const komisi: IncomeStatementItem[] = totalCommissions > 0 ? [{
    accountName: 'Beban Komisi',
    amount: totalCommissions,
    formattedAmount: formatCurrency(totalCommissions),
    source: 'calculated'
  }] : [];

  const totalOperatingExpenses = bebanOperasional.reduce((sum, exp) => sum + exp.amount, 0) + totalCommissions;
  const operatingIncome = grossProfit - totalOperatingExpenses;

  // Calculate interest expense from accounts payable (filtered by branch)
  let apIncomeQuery = supabase
    .from('accounts_payable')
    .select('amount, interest_rate, interest_type, creditor_type, created_at, status, paid_at')
    .gte('created_at', fromDateStr)
    .lte('created_at', toDateStr + 'T23:59:59');

  if (branchId) {
    apIncomeQuery = apIncomeQuery.eq('branch_id', branchId);
  }

  const { data: accountsPayableForIncome, error: apIncomeError } = await apIncomeQuery;

  let interestExpense = 0;

  if (!apIncomeError && accountsPayableForIncome) {
    accountsPayableForIncome.forEach(payable => {
      const interestRate = payable.interest_rate || 0;
      const amount = payable.amount || 0;

      if (interestRate > 0 && amount > 0) {
        let interestAmount = 0;

        switch (payable.interest_type) {
          case 'flat':
            interestAmount = amount * (interestRate / 100);
            break;

          case 'per_month':
            const createdDate = new Date(payable.created_at);
            const endDate = payable.paid_at ? new Date(payable.paid_at) : periodTo;
            const monthsDiff = Math.max(1,
              (endDate.getFullYear() - createdDate.getFullYear()) * 12 +
              (endDate.getMonth() - createdDate.getMonth())
            );
            interestAmount = amount * (interestRate / 100) * monthsDiff;
            break;

          case 'per_year':
            const createdDateYear = new Date(payable.created_at);
            const endDateYear = payable.paid_at ? new Date(payable.paid_at) : periodTo;
            const daysDiff = Math.max(1,
              (endDateYear.getTime() - createdDateYear.getTime()) / (1000 * 60 * 60 * 24)
            );
            interestAmount = amount * (interestRate / 100) * (daysDiff / 365);
            break;
        }

        interestExpense += interestAmount;
      }
    });
  }

  const bebanLainLain: IncomeStatementItem[] = interestExpense > 0 ? [{
    accountName: 'Hutang Bunga Atas Hutang Bank',
    amount: interestExpense,
    formattedAmount: formatCurrency(interestExpense),
    source: 'calculated'
  }] : [];

  const netOtherIncome = -interestExpense; // Negative because it's an expense
  const netIncome = operatingIncome + netOtherIncome; // Simplified - no tax calculation yet

  return {
    revenue: {
      penjualan,
      pendapatanLain: [],
      totalRevenue
    },
    cogs: {
      bahanBaku,
      tenagaKerja,
      overhead,
      totalCOGS
    },
    grossProfit,
    grossProfitMargin,
    operatingExpenses: {
      bebanGaji: [],
      bebanOperasional,
      bebanAdministrasi: [],
      komisi,
      totalOperatingExpenses
    },
    operatingIncome,
    otherIncome: {
      pendapatanLainLain: [],
      bebanLainLain,
      netOtherIncome
    },
    netIncomeBeforeTax: netIncome,
    taxExpense: 0,
    netIncome,
    netProfitMargin: calculatePercentage(netIncome, totalRevenue),
    periodFrom,
    periodTo,
    generatedAt: new Date()
  };
}

/**
 * Generate Cash Flow Statement from existing data
 */
export async function generateCashFlowStatement(
  periodFrom: Date,
  periodTo: Date,
  branchId?: string
): Promise<CashFlowStatementData> {
  const fromDateStr = periodFrom.toISOString().split('T')[0];
  const toDateStr = periodTo.toISOString().split('T')[0];

  // ============================================================================
  // ARUS KAS - LINKED TO COA
  // ============================================================================
  // Setiap transaksi kas dihubungkan ke akun COA yang relevan:
  // - Kas/Bank (1100-1199): Akun kas dan bank
  // - Piutang (1200-1299): Pembayaran piutang
  // - Persediaan (1400-1499): Pembelian bahan
  // - Hutang (2100-2199): Pembayaran hutang
  // - Modal (3xxx): Setoran/pengambilan modal
  // - Pendapatan (4xxx): Penerimaan dari penjualan
  // - Beban (6xxx): Pengeluaran operasional
  // ============================================================================

  // Get all accounts for linking
  let allAccountsQuery = supabase
    .from('accounts')
    .select('id, code, name, type, balance, initial_balance')
    .order('code');

  if (branchId) {
    allAccountsQuery = allAccountsQuery.eq('branch_id', branchId);
  }

  const { data: allAccounts } = await allAccountsQuery;

  // Create account lookup maps
  const accountById: Record<string, { id: string; code: string; name: string; type: string }> = {};
  const accountByCode: Record<string, { id: string; code: string; name: string; type: string }> = {};

  allAccounts?.forEach(acc => {
    accountById[acc.id] = { id: acc.id, code: acc.code || '', name: acc.name, type: acc.type };
    if (acc.code) {
      accountByCode[acc.code] = { id: acc.id, code: acc.code, name: acc.name, type: acc.type };
    }
  });

  // Get all cash movements (filtered by branch)
  let cashHistoryQuery = supabase
    .from('cash_history')
    .select('*')
    .gte('created_at', fromDateStr)
    .lte('created_at', toDateStr + 'T23:59:59')
    .order('created_at');

  if (branchId) {
    cashHistoryQuery = cashHistoryQuery.eq('branch_id', branchId);
  }

  const { data: cashHistory, error: cashError } = await cashHistoryQuery;

  if (cashError) throw new Error(`Failed to fetch cash history: ${cashError.message}`);

  // Get beginning and ending cash balances (filtered by branch)
  // Use cash/bank accounts from COA (code 1100-1199)
  const cashAccounts = allAccounts?.filter(acc =>
    (acc.code && acc.code.startsWith('11')) ||
    acc.name.toLowerCase().includes('kas') ||
    acc.name.toLowerCase().includes('bank')
  ) || [];

  if (cashAccounts.length === 0) {
    console.warn('⚠️ No cash/bank accounts found in COA');
  }

  const endingCash = cashAccounts?.reduce((sum, acc) => sum + (acc.balance || 0), 0) || 0;

  // Categorize cash flows - include ALL transaction types that affect cash
  const operatingCashFlows = cashHistory?.filter(ch =>
    ['orderan', 'kas_masuk_manual', 'pengeluaran', 'kas_keluar_manual',
     'pembayaran_piutang', 'panjar_pelunasan', 'panjar_pengambilan',
     'pembayaran_po', 'gaji_karyawan', 'pembayaran_gaji', 'pembayaran_hutang'].includes(ch.type || '')
  ) || [];

  const investingCashFlows = cashHistory?.filter(ch => 
    ch.description?.toLowerCase().includes('peralatan') ||
    ch.description?.toLowerCase().includes('kendaraan') ||
    ch.description?.toLowerCase().includes('mesin')
  ) || [];

  const financingCashFlows = cashHistory?.filter(ch => 
    ch.type === 'transfer_masuk' || ch.type === 'transfer_keluar' ||
    ch.description?.toLowerCase().includes('modal') ||
    ch.description?.toLowerCase().includes('pinjaman')
  ) || [];

  // Calculate detailed cash receipts
  const fromCustomers = operatingCashFlows
    .filter(ch => ch.type === 'orderan')
    .reduce((sum, ch) => sum + (ch.amount || 0), 0);

  // Pembayaran piutang (receivable payments from customers)
  const fromReceivablePayments = operatingCashFlows
    .filter(ch => ch.type === 'pembayaran_piutang')
    .reduce((sum, ch) => sum + (ch.amount || 0), 0);

  const fromOtherOperating = operatingCashFlows
    .filter(ch => ch.type === 'kas_masuk_manual')
    .reduce((sum, ch) => sum + (ch.amount || 0), 0);

  // Panjar pelunasan (employee advance repayment) - cash received back
  const fromAdvanceRepayment = operatingCashFlows
    .filter(ch => ch.type === 'panjar_pelunasan' ||
      (ch.description?.toLowerCase().includes('pelunasan panjar') ||
       ch.description?.toLowerCase().includes('advance repayment')))
    .reduce((sum, ch) => sum + (ch.amount || 0), 0);

  const cashReceipts = {
    fromCustomers,
    fromReceivablePayments,
    fromOtherOperating,
    fromAdvanceRepayment,
    total: fromCustomers + fromReceivablePayments + fromOtherOperating + fromAdvanceRepayment
  };

  // Calculate detailed cash payments
  const forRawMaterials = operatingCashFlows
    .filter(ch => ch.type === 'pembayaran_po' ||
      (ch.description?.toLowerCase().includes('bahan') ||
       ch.description?.toLowerCase().includes('material')))
    .reduce((sum, ch) => sum + (ch.amount || 0), 0);

  // Pembayaran hutang (payable payments to suppliers/creditors)
  const forPayablePayments = operatingCashFlows
    .filter(ch => ch.type === 'pembayaran_hutang')
    .reduce((sum, ch) => sum + (ch.amount || 0), 0);

  // Calculate interest expense from accounts payable
  // Fetch accounts payable data to calculate interest (filtered by branch)
  let apInterestQuery = supabase
    .from('accounts_payable')
    .select('amount, interest_rate, interest_type, creditor_type, created_at, status, paid_at')
    .gte('created_at', fromDateStr)
    .lte('created_at', toDateStr + 'T23:59:59');

  if (branchId) {
    apInterestQuery = apInterestQuery.eq('branch_id', branchId);
  }

  const { data: accountsPayableData, error: apDataError } = await apInterestQuery;

  let forInterestExpense = 0;

  if (!apDataError && accountsPayableData) {
    accountsPayableData.forEach(payable => {
      const interestRate = payable.interest_rate || 0;
      const amount = payable.amount || 0;

      if (interestRate > 0 && amount > 0) {
        let interestAmount = 0;

        switch (payable.interest_type) {
          case 'flat':
            // Flat interest: one-time calculation
            interestAmount = amount * (interestRate / 100);
            break;

          case 'per_month':
            // Monthly interest: calculate for the months in the period
            const createdDate = new Date(payable.created_at);
            const endDate = payable.paid_at ? new Date(payable.paid_at) : periodTo;
            const monthsDiff = Math.max(1,
              (endDate.getFullYear() - createdDate.getFullYear()) * 12 +
              (endDate.getMonth() - createdDate.getMonth())
            );
            interestAmount = amount * (interestRate / 100) * monthsDiff;
            break;

          case 'per_year':
            // Annual interest: calculate pro-rata for the period
            const createdDateYear = new Date(payable.created_at);
            const endDateYear = payable.paid_at ? new Date(payable.paid_at) : periodTo;
            const daysDiff = Math.max(1,
              (endDateYear.getTime() - createdDateYear.getTime()) / (1000 * 60 * 60 * 24)
            );
            interestAmount = amount * (interestRate / 100) * (daysDiff / 365);
            break;
        }

        forInterestExpense += interestAmount;
      }
    });
  }

  const forDirectLabor = operatingCashFlows
    .filter(ch => ch.type === 'gaji_karyawan' || ch.type === 'pembayaran_gaji')
    .reduce((sum, ch) => sum + (ch.amount || 0), 0);

  // Panjar karyawan (employee advances) - included in operating expenses
  const forEmployeeAdvances = operatingCashFlows
    .filter(ch => ch.type === 'panjar_pengambilan' ||
      (ch.description?.toLowerCase().includes('panjar karyawan') ||
       ch.description?.toLowerCase().includes('employee advance')))
    .reduce((sum, ch) => sum + (ch.amount || 0), 0);

  const forManufacturingOverhead = operatingCashFlows
    .filter(ch =>
      (ch.type === 'pengeluaran' || ch.type === 'kas_keluar_manual') &&
      (ch.description?.toLowerCase().includes('listrik') ||
       ch.description?.toLowerCase().includes('air') ||
       ch.description?.toLowerCase().includes('utilitas') ||
       ch.description?.toLowerCase().includes('overhead')))
    .reduce((sum, ch) => sum + (ch.amount || 0), 0);

  const forOperatingExpenses = operatingCashFlows
    .filter(ch =>
      (ch.type === 'pengeluaran' || ch.type === 'kas_keluar_manual') &&
      !(ch.description?.toLowerCase().includes('listrik') ||
        ch.description?.toLowerCase().includes('air') ||
        ch.description?.toLowerCase().includes('utilitas') ||
        ch.description?.toLowerCase().includes('overhead') ||
        ch.description?.toLowerCase().includes('bahan') ||
        ch.description?.toLowerCase().includes('material')))
    .reduce((sum, ch) => sum + (ch.amount || 0), 0);

  const forTaxes = 0; // TODO: Add tax-specific categorization

  const cashPayments = {
    forRawMaterials,
    forPayablePayments,
    forInterestExpense,
    forDirectLabor,
    forEmployeeAdvances,
    forManufacturingOverhead,
    forOperatingExpenses,
    forTaxes,
    total: forRawMaterials + forPayablePayments + forInterestExpense + forDirectLabor + forEmployeeAdvances + forManufacturingOverhead + forOperatingExpenses + forTaxes
  };

  const netCashFromOperations = cashReceipts.total - cashPayments.total;

  // Calculate investing cash flow
  const investingOutflows = investingCashFlows.reduce((sum, ch) => sum + (ch.amount || 0), 0);
  const netCashFromInvesting = -investingOutflows;

  // Calculate financing cash flow
  const financingInflows = financingCashFlows
    .filter(ch => ch.type === 'transfer_masuk')
    .reduce((sum, ch) => sum + (ch.amount || 0), 0);

  const financingOutflows = financingCashFlows
    .filter(ch => ch.type === 'transfer_keluar')
    .reduce((sum, ch) => sum + (ch.amount || 0), 0);

  const netCashFromFinancing = financingInflows - financingOutflows;

  const netCashFlow = netCashFromOperations + netCashFromInvesting + netCashFromFinancing;
  const beginningCash = endingCash - netCashFlow;

  // ============================================================================
  // GROUP CASH FLOWS BY COA ACCOUNT
  // ============================================================================
  // Mengelompokkan arus kas berdasarkan akun COA untuk laporan yang lebih detail
  // ============================================================================

  // Group receipts by account
  const receiptsByAccount: Record<string, { accountId: string; accountCode: string; accountName: string; amount: number; transactions: number }> = {};

  cashHistory?.forEach(ch => {
    const isReceipt = ['orderan', 'kas_masuk_manual', 'panjar_pelunasan', 'pembayaran_piutang'].includes(ch.type || '');
    if (!isReceipt) return;

    const accountId = ch.account_id || 'unknown';
    const account = accountId !== 'unknown' ? accountById[accountId] : null;

    // Determine account based on transaction type
    let targetAccountCode = '1110'; // Default: Kas
    let targetAccountName = 'Kas';

    if (account) {
      targetAccountCode = account.code;
      targetAccountName = account.name;
    } else if (ch.type === 'orderan') {
      // Link to revenue account
      const revenueAccount = allAccounts?.find(a => a.code?.startsWith('4') && !a.code?.endsWith('00'));
      if (revenueAccount) {
        targetAccountCode = revenueAccount.code || '4100';
        targetAccountName = revenueAccount.name;
      } else {
        targetAccountCode = '4100';
        targetAccountName = 'Pendapatan Penjualan';
      }
    }

    const key = targetAccountCode;
    if (!receiptsByAccount[key]) {
      receiptsByAccount[key] = {
        accountId: account?.id || '',
        accountCode: targetAccountCode,
        accountName: targetAccountName,
        amount: 0,
        transactions: 0
      };
    }
    receiptsByAccount[key].amount += ch.amount || 0;
    receiptsByAccount[key].transactions += 1;
  });

  // Group payments by account
  const paymentsByAccount: Record<string, { accountId: string; accountCode: string; accountName: string; amount: number; transactions: number }> = {};

  cashHistory?.forEach(ch => {
    const isPayment = ['pengeluaran', 'kas_keluar_manual', 'pembayaran_po', 'gaji_karyawan', 'pembayaran_gaji', 'panjar_pengambilan', 'pembayaran_hutang'].includes(ch.type || '');
    if (!isPayment) return;

    // Get expense account from cash history if available
    const expenseAccountId = (ch as any).expense_account_id;
    const expenseAccount = expenseAccountId ? accountById[expenseAccountId] : null;

    // Determine account based on transaction type or expense_account_id
    let targetAccountCode = '6900'; // Default: Beban Lain-lain
    let targetAccountName = 'Beban Lain-lain';

    if (expenseAccount) {
      targetAccountCode = expenseAccount.code;
      targetAccountName = expenseAccount.name;
    } else if (ch.type === 'gaji_karyawan' || ch.type === 'pembayaran_gaji') {
      targetAccountCode = '6210';
      targetAccountName = 'Beban Gaji Karyawan';
    } else if (ch.type === 'pembayaran_po') {
      targetAccountCode = '6100';
      targetAccountName = 'Beban Pembelian Bahan';
    } else if (ch.type === 'panjar_pengambilan') {
      targetAccountCode = '1300';
      targetAccountName = 'Panjar Karyawan';
    } else if (ch.type === 'pembayaran_hutang') {
      targetAccountCode = '2100';
      targetAccountName = 'Hutang Usaha';
    }

    const key = targetAccountCode;
    if (!paymentsByAccount[key]) {
      paymentsByAccount[key] = {
        accountId: expenseAccount?.id || '',
        accountCode: targetAccountCode,
        accountName: targetAccountName,
        amount: 0,
        transactions: 0
      };
    }
    paymentsByAccount[key].amount += ch.amount || 0;
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
    modal: 0 // Will be calculated from financing activities
  };

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
      equipmentPurchases: investingCashFlows.map(ch => {
        const linkedAccount = ch.account_id ? accountById[ch.account_id] : null;
        const fixedAssetAccount = allAccounts?.find(acc =>
          acc.code?.startsWith('14') ||
          acc.name.toLowerCase().includes('peralatan') ||
          acc.name.toLowerCase().includes('aset tetap')
        );
        const account = linkedAccount || fixedAssetAccount;

        return {
          description: ch.description || 'Pembelian Peralatan',
          amount: -(ch.amount || 0),
          formattedAmount: formatCurrency(-(ch.amount || 0)),
          source: 'cash_history',
          accountId: account?.id,
          accountCode: account?.code,
          accountName: account?.name
        };
      }),
      otherInvestments: [],
      netCashFromInvesting,
      byAccount: [] // TODO: Group investing by account
    },
    financingActivities: {
      ownerInvestments: [],
      ownerWithdrawals: [],
      loans: [],
      netCashFromFinancing,
      byAccount: [] // TODO: Group financing by account
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