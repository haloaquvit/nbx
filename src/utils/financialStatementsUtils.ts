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
      fromOtherOperating: number;
      total: number;
    };
    cashPayments: {
      forRawMaterials: number;
      forDirectLabor: number;
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
export async function generateBalanceSheet(asOfDate?: Date): Promise<BalanceSheetData> {
  const cutoffDate = asOfDate || new Date();
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

  // Get all accounts with current balances
  const { data: accounts, error: accountsError } = await supabase
    .from('accounts')
    .select('id, name, type, balance, initial_balance, code')
    .order('code');

  if (accountsError) throw new Error(`Failed to fetch accounts: ${accountsError.message}`);

  // Get account receivables from transactions
  const { data: transactions, error: transactionsError } = await supabase
    .from('transactions')
    .select('id, total, paid_amount, payment_status, order_date')
    .lte('order_date', cutoffDateStr)
    .in('payment_status', ['Belum Lunas', 'Kredit']);

  if (transactionsError) throw new Error(`Failed to fetch transactions: ${transactionsError.message}`);

  // Get inventory value from materials
  const { data: materials, error: materialsError } = await supabase
    .from('materials')
    .select('id, name, stock, price_per_unit');

  if (materialsError) throw new Error(`Failed to fetch materials: ${materialsError.message}`);

  // Get accounts payable data
  const { data: accountsPayable, error: apError } = await supabase
    .from('accounts_payable')
    .select('amount, paid_amount, status')
    .lte('created_at', cutoffDateStr + 'T23:59:59');

  // Ignore error if table doesn't exist
  const apData = apError ? [] : (accountsPayable || []);

  // Get payroll liabilities
  const { data: payrollRecords, error: payrollError } = await supabase
    .from('payroll_records')
    .select('net_salary, status, created_at')
    .lte('created_at', cutoffDateStr + 'T23:59:59')
    .eq('status', 'approved');

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

  // Build fixed assets (simplified - would need more data in real implementation)
  const peralatan = assetAccounts
    .filter(acc => 
      acc.name.toLowerCase().includes('peralatan') || 
      acc.name.toLowerCase().includes('kendaraan') ||
      acc.name.toLowerCase().includes('mesin')
    )
    .map(acc => ({
      accountId: acc.id,
      accountCode: acc.code,
      accountName: acc.name,
      balance: acc.balance || 0,
      formattedBalance: formatCurrency(acc.balance || 0)
    }));

  const akumulasiPenyusutan = assetAccounts
    .filter(acc => acc.name.toLowerCase().includes('akumulasi'))
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
  const modalPemilik = equityAccounts.map(acc => ({
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
  periodTo: Date
): Promise<IncomeStatementData> {
  const fromDateStr = periodFrom.toISOString().split('T')[0];
  const toDateStr = periodTo.toISOString().split('T')[0];

  // Get revenue from transactions
  const { data: transactions, error: transactionsError } = await supabase
    .from('transactions')
    .select('id, total, subtotal, ppn_amount, order_date, items')
    .gte('order_date', fromDateStr)
    .lte('order_date', toDateStr);

  if (transactionsError) throw new Error(`Failed to fetch transactions: ${transactionsError.message}`);

  // Get expenses from cash_history and expenses table
  const { data: cashHistory, error: cashError } = await supabase
    .from('cash_history')
    .select('*')
    .gte('created_at', fromDateStr)
    .lte('created_at', toDateStr + 'T23:59:59')
    .in('type', ['pengeluaran', 'kas_keluar_manual', 'pembayaran_po']);

  if (cashError) throw new Error(`Failed to fetch cash history: ${cashError.message}`);

  // Get commission data
  const { data: commissions, error: commissionsError } = await supabase
    .from('commission_entries')
    .select('*')
    .gte('created_at', fromDateStr)
    .lte('created_at', toDateStr + 'T23:59:59');

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

  // Calculate COGS from actual material consumption (Manufacturing Approach)
  // Get material consumption from material_stock_movements
  const { data: materialConsumption, error: materialError } = await supabase
    .from('material_stock_movements')
    .select('quantity, material_id, materials(price_per_unit)')
    .gte('created_at', fromDateStr)
    .lte('created_at', toDateStr + 'T23:59:59')
    .eq('type', 'OUT')
    .eq('reason', 'PRODUCTION_CONSUMPTION');

  const materialCost = materialConsumption?.reduce((sum, movement) => {
    const pricePerUnit = movement.materials?.price_per_unit || 0;
    return sum + (movement.quantity * pricePerUnit);
  }, 0) || 0;

  // Get direct labor cost from payroll (production workers)
  const { data: payrollData, error: payrollError } = await supabase
    .from('cash_history')
    .select('amount')
    .gte('created_at', fromDateStr)
    .lte('created_at', toDateStr + 'T23:59:59')
    .in('type', ['gaji_karyawan', 'pembayaran_gaji']);

  const laborCost = payrollData?.reduce((sum, record) => sum + (record.amount || 0), 0) || 0;

  // Get manufacturing overhead from cash_history
  const { data: overheadData, error: overheadError } = await supabase
    .from('cash_history')
    .select('amount')
    .gte('created_at', fromDateStr)
    .lte('created_at', toDateStr + 'T23:59:59')
    .in('type', ['pengeluaran', 'kas_keluar_manual'])
    .or('description.ilike.%listrik%,description.ilike.%air%,description.ilike.%utilitas%,description.ilike.%overhead%');

  const overheadCost = overheadData?.reduce((sum, record) => sum + (record.amount || 0), 0) || 0;

  // Calculate COGS: Material Cost + Labor Cost + Manufacturing Overhead
  const totalCOGS = materialCost + laborCost + overheadCost;

  const bahanBaku: IncomeStatementItem[] = materialCost > 0 ? [{
    accountName: 'Bahan Baku Terpakai',
    amount: materialCost,
    formattedAmount: formatCurrency(materialCost),
    source: 'material_consumption'
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

  // Calculate operating expenses
  const operatingExpenseCash = cashHistory?.filter(ch => 
    ch.type === 'pengeluaran' || ch.type === 'kas_keluar_manual'
  ).reduce((sum, ch) => sum + (ch.amount || 0), 0) || 0;

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
  const netIncome = operatingIncome; // Simplified - no tax calculation yet

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
      bebanLainLain: [],
      netOtherIncome: 0
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
  periodTo: Date
): Promise<CashFlowStatementData> {
  const fromDateStr = periodFrom.toISOString().split('T')[0];
  const toDateStr = periodTo.toISOString().split('T')[0];

  // Get all cash movements
  const { data: cashHistory, error: cashError } = await supabase
    .from('cash_history')
    .select('*')
    .gte('created_at', fromDateStr)
    .lte('created_at', toDateStr + 'T23:59:59')
    .order('created_at');

  if (cashError) throw new Error(`Failed to fetch cash history: ${cashError.message}`);

  // Get beginning and ending cash balances
  const { data: cashAccounts, error: accountsError } = await supabase
    .from('accounts')
    .select('id, name, balance, initial_balance')
    .ilike('name', '%kas%')
    .or('name.ilike.%bank%');

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

  const fromOtherOperating = operatingCashFlows
    .filter(ch => ch.type === 'kas_masuk_manual')
    .reduce((sum, ch) => sum + (ch.amount || 0), 0);

  const cashReceipts = {
    fromCustomers,
    fromOtherOperating,
    total: fromCustomers + fromOtherOperating
  };

  // Calculate detailed cash payments
  const forRawMaterials = operatingCashFlows
    .filter(ch => ch.type === 'pembayaran_po' ||
      (ch.description?.toLowerCase().includes('bahan') ||
       ch.description?.toLowerCase().includes('material')))
    .reduce((sum, ch) => sum + (ch.amount || 0), 0);

  const forDirectLabor = operatingCashFlows
    .filter(ch => ch.type === 'gaji_karyawan' || ch.type === 'pembayaran_gaji')
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
    forDirectLabor,
    forManufacturingOverhead,
    forOperatingExpenses,
    forTaxes,
    total: forRawMaterials + forDirectLabor + forManufacturingOverhead + forOperatingExpenses + forTaxes
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