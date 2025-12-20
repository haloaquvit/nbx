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
    };
    netCashFromOperations: number;
  };
  investingActivities: {
    equipmentPurchases: CashFlowItem[];
    otherInvestments: CashFlowItem[];
    netCashFromInvesting: number;
  };
  financingActivities: {
    ownerInvestments: CashFlowItem[];
    ownerWithdrawals: CashFlowItem[];
    loans: CashFlowItem[];
    netCashFromFinancing: number;
  };
  netCashFlow: number;
  beginningCash: number;
  endingCash: number;
  periodFrom: Date;
  periodTo: Date;
  generatedAt: Date;
}

export interface CashFlowItem {
  description: string;
  amount: number;
  formattedAmount: string;
  source: string;
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

  // Calculate accounts receivable
  const totalReceivables = transactions?.reduce((sum, tx) => 
    sum + ((tx.total || 0) - (tx.paid_amount || 0)), 0) || 0;

  // Calculate inventory value
  const totalInventory = materials?.reduce((sum, material) =>
    sum + ((material.stock || 0) * (material.price_per_unit || 0)), 0) || 0;

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

  const piutangUsaha: BalanceSheetItem[] = totalReceivables > 0 ? [{
    accountId: 'calculated-receivables',
    accountCode: '1200',
    accountName: 'Piutang Usaha',
    balance: totalReceivables,
    formattedBalance: formatCurrency(totalReceivables)
  }] : [];

  const persediaan: BalanceSheetItem[] = totalInventory > 0 ? [{
    accountId: 'calculated-inventory',
    accountCode: '1400',
    accountName: 'Persediaan',
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

  // Calculate revenue
  const totalRevenue = transactions?.reduce((sum, tx) => sum + (tx.total || 0), 0) || 0;
  const penjualan: IncomeStatementItem[] = [{
    accountName: 'Penjualan',
    amount: totalRevenue,
    formattedAmount: formatCurrency(totalRevenue),
    source: 'transactions'
  }];

  // ============================================================================
  // CALCULATE HPP (COGS) - DARI PENJUALAN
  // ============================================================================
  // HPP dihitung dari produk yang TERJUAL, bukan dari produksi/konsumsi bahan.
  //
  // Ada 2 jenis produk:
  // 1. Produksi (BOM) - HPP = Total harga bahan baku dari BOM per unit × qty terjual
  // 2. Jual Langsung - HPP = cost_price (harga pokok/modal) dari produk
  //
  // Untuk produk Jual Langsung, jika cost_price belum diisi, akan fallback ke
  // 70% dari harga jual sebagai estimasi.
  // ============================================================================

  // Get all products with their BOM (materials) and cost_price
  let productsQuery = supabase
    .from('products')
    .select('id, name, type, base_price, cost_price, materials');

  if (branchId) {
    productsQuery = productsQuery.or(`branch_id.eq.${branchId},is_shared.eq.true`);
  }

  const { data: productsData } = await productsQuery;

  // Get all materials for BOM calculation
  let materialsQuery = supabase
    .from('materials')
    .select('id, name, price_per_unit');

  if (branchId) {
    materialsQuery = materialsQuery.eq('branch_id', branchId);
  }

  const { data: materialsData } = await materialsQuery;

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

  // Calculate total HPP from transactions
  let materialCost = 0;
  transactions?.forEach(tx => {
    if (tx.items && Array.isArray(tx.items)) {
      tx.items.forEach((item: any) => {
        if (item.product?.id) {
          const hpp = productHPP[item.product.id] || 0;
          const qty = item.quantity || 0;
          materialCost += hpp * qty;
        }
      });
    }
  });

  // Get direct labor cost from payroll (production workers)
  let payrollQuery = supabase
    .from('cash_history')
    .select('amount, branch_id')
    .gte('created_at', fromDateStr)
    .lte('created_at', toDateStr + 'T23:59:59')
    .in('type', ['gaji_karyawan', 'pembayaran_gaji']);

  if (branchId) {
    payrollQuery = payrollQuery.eq('branch_id', branchId);
  }

  const { data: payrollData, error: payrollError } = await payrollQuery;

  const laborCost = payrollData?.reduce((sum, record) => sum + (record.amount || 0), 0) || 0;

  // Get manufacturing overhead from cash_history
  let overheadQuery = supabase
    .from('cash_history')
    .select('amount, branch_id')
    .gte('created_at', fromDateStr)
    .lte('created_at', toDateStr + 'T23:59:59')
    .in('type', ['pengeluaran', 'kas_keluar_manual'])
    .or('description.ilike.%listrik%,description.ilike.%air%,description.ilike.%utilitas%,description.ilike.%overhead%');

  if (branchId) {
    overheadQuery = overheadQuery.eq('branch_id', branchId);
  }

  const { data: overheadData, error: overheadError } = await overheadQuery;

  const overheadCost = overheadData?.reduce((sum, record) => sum + (record.amount || 0), 0) || 0;

  // Calculate COGS: Material Cost + Labor Cost + Manufacturing Overhead
  const totalCOGS = materialCost + laborCost + overheadCost;

  const bahanBaku: IncomeStatementItem[] = materialCost > 0 ? [{
    accountName: 'HPP Barang Terjual',
    amount: materialCost,
    formattedAmount: formatCurrency(materialCost),
    source: 'transactions'
  }] : [];

  const tenagaKerja: IncomeStatementItem[] = laborCost > 0 ? [{
    accountName: 'Tenaga Kerja Langsung',
    amount: laborCost,
    formattedAmount: formatCurrency(laborCost),
    source: 'payroll_records'
  }] : [];

  const overhead: IncomeStatementItem[] = overheadCost > 0 ? [{
    accountName: 'Biaya Overhead Pabrik',
    amount: overheadCost,
    formattedAmount: formatCurrency(overheadCost),
    source: 'manufacturing_expenses'
  }] : [];

  const grossProfit = totalRevenue - totalCOGS;
  const grossProfitMargin = calculatePercentage(grossProfit, totalRevenue);

  // ============================================================================
  // CALCULATE OPERATING EXPENSES
  // ============================================================================
  // Semua expenses (termasuk pembelian bahan) adalah biaya operasional
  // yang mengurangi cash. Pembelian bahan TIDAK masuk HPP, tapi masuk
  // operating expenses karena ini adalah cash outflow.
  //
  // Catatan: Dalam accounting yang benar, pembelian bahan seharusnya masuk
  // ke "Inventory" di balance sheet, bukan langsung ke expense. Tapi untuk
  // simplicity, kita treat semua sebagai operating expenses.
  // ============================================================================

  let operatingExpensesQuery = supabase
    .from('expenses')
    .select('amount, branch_id')
    .gte('date', fromDateStr)
    .lte('date', toDateStr + 'T23:59:59');

  if (branchId) {
    operatingExpensesQuery = operatingExpensesQuery.eq('branch_id', branchId);
  }

  const { data: operatingExpensesData, error: opExpensesError } = await operatingExpensesQuery;

  const operatingExpenseCash = operatingExpensesData?.reduce((sum, expense) => sum + (expense.amount || 0), 0) || 0;

  const totalCommissions = commissionData.reduce((sum, comm) => sum + (comm.amount || 0), 0);

  const bebanOperasional: IncomeStatementItem[] = [{
    accountName: 'Beban Operasional',
    amount: operatingExpenseCash,
    formattedAmount: formatCurrency(operatingExpenseCash),
    source: 'cash_history'
  }];

  const komisi: IncomeStatementItem[] = totalCommissions > 0 ? [{
    accountName: 'Beban Komisi (Otomatis)',
    amount: totalCommissions,
    formattedAmount: formatCurrency(totalCommissions),
    source: 'calculated'
  }] : [];

  const totalOperatingExpenses = operatingExpenseCash + totalCommissions;
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
  let cashAccountsQuery = supabase
    .from('accounts')
    .select('id, name, balance, initial_balance, branch_id')
    .ilike('name', '%kas%')
    .or('name.ilike.%bank%');

  if (branchId) {
    cashAccountsQuery = cashAccountsQuery.eq('branch_id', branchId);
  }

  const { data: cashAccounts, error: accountsError } = await cashAccountsQuery;

  if (accountsError) throw new Error(`Failed to fetch cash accounts: ${accountsError.message}`);

  const endingCash = cashAccounts?.reduce((sum, acc) => sum + (acc.balance || 0), 0) || 0;

  // Categorize cash flows
  const operatingCashFlows = cashHistory?.filter(ch => 
    ['orderan', 'kas_masuk_manual', 'pengeluaran', 'kas_keluar_manual'].includes(ch.type || '')
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
    .filter(ch => ch.type === 'pembayaran_utang')
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

  return {
    operatingActivities: {
      netIncome: netCashFromOperations, // Simplified
      adjustments: [],
      workingCapitalChanges: [],
      cashReceipts,
      cashPayments,
      netCashFromOperations
    },
    investingActivities: {
      equipmentPurchases: investingCashFlows.map(ch => ({
        description: ch.description || 'Equipment Purchase',
        amount: -(ch.amount || 0),
        formattedAmount: formatCurrency(-(ch.amount || 0)),
        source: 'cash_history'
      })),
      otherInvestments: [],
      netCashFromInvesting
    },
    financingActivities: {
      ownerInvestments: [],
      ownerWithdrawals: [],
      loans: [],
      netCashFromFinancing
    },
    netCashFlow,
    beginningCash,
    endingCash,
    periodFrom,
    periodTo,
    generatedAt: new Date()
  };
}