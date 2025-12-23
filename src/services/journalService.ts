/**
 * Journal Service
 *
 * Service untuk auto-generate jurnal dari berbagai transaksi.
 * Sesuai dengan standar akuntansi double-entry bookkeeping.
 *
 * Flow: Transaksi → Jurnal → Buku Besar → Laporan Keuangan
 */

import { supabase } from '@/integrations/supabase/client';

// Type definitions
export interface JournalLineInput {
  accountId: string;
  accountCode: string;
  accountName: string;
  debitAmount: number;
  creditAmount: number;
  description?: string;
}

export interface CreateJournalInput {
  entryDate: Date;
  description: string;
  referenceType: 'transaction' | 'expense' | 'payroll' | 'advance' | 'transfer' | 'receivable' | 'payable' | 'manual' | 'adjustment' | 'closing' | 'opening';
  referenceId?: string;
  branchId: string;
  lines: JournalLineInput[];
  autoPost?: boolean; // If true, auto-post the journal after creation
}

export interface AccountMapping {
  kas: string;        // Kas/Bank - biasanya 1-1100
  piutang: string;    // Piutang Usaha - 1-1200
  hutang: string;     // Hutang Usaha - 2-1100
  pendapatan: string; // Pendapatan Penjualan - 4-1000
  beban: string;      // Beban Umum - 5-1000
  persediaan: string; // Persediaan Barang - 1-1300
  panjar: string;     // Panjar Karyawan - 1-1400
  gaji: string;       // Beban Gaji - 5-2000
  modal: string;      // Modal - 3-1000
}

// Default account mappings (will be fetched from database)
let accountCache: Map<string, { id: string; code: string; name: string }> = new Map();

/**
 * Fetch and cache account by code
 */
async function getAccountByCode(code: string, branchId: string): Promise<{ id: string; code: string; name: string } | null> {
  const cacheKey = `${branchId}:${code}`;

  if (accountCache.has(cacheKey)) {
    return accountCache.get(cacheKey)!;
  }

  const { data, error } = await supabase
    .from('accounts')
    .select('id, code, name')
    .eq('code', code)
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    console.warn(`Account with code ${code} not found for branch ${branchId}`);
    return null;
  }

  const account = { id: data.id, code: data.code, name: data.name };
  accountCache.set(cacheKey, account);
  return account;
}

/**
 * Find account by partial code match or name search
 */
async function findAccountByPattern(pattern: string, type: string, branchId: string): Promise<{ id: string; code: string; name: string } | null> {
  const { data, error } = await supabase
    .from('accounts')
    .select('id, code, name')
    .eq('branch_id', branchId)
    .eq('type', type)
    .eq('is_active', true)
    .eq('is_header', false)
    .or(`code.ilike.%${pattern}%,name.ilike.%${pattern}%`)
    .limit(1)
    .single();

  if (error || !data) {
    return null;
  }

  return { id: data.id, code: data.code, name: data.name };
}

/**
 * Generate journal entry number
 */
async function generateJournalNumber(branchId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `JE-${year}-`;

  const { data } = await supabase
    .from('journal_entries')
    .select('entry_number')
    .eq('branch_id', branchId)
    .ilike('entry_number', `${prefix}%`)
    .order('entry_number', { ascending: false })
    .limit(1);

  let nextNumber = 1;
  if (data && data.length > 0) {
    const lastNumber = data[0].entry_number;
    const parts = lastNumber.split('-');
    if (parts.length === 3) {
      nextNumber = parseInt(parts[2], 10) + 1;
    }
  }

  return `${prefix}${nextNumber.toString().padStart(6, '0')}`;
}

/**
 * Create journal entry with lines
 */
export async function createJournalEntry(input: CreateJournalInput): Promise<{ success: boolean; journalId?: string; error?: string }> {
  try {
    // Validate balance
    const totalDebit = input.lines.reduce((sum, line) => sum + (line.debitAmount || 0), 0);
    const totalCredit = input.lines.reduce((sum, line) => sum + (line.creditAmount || 0), 0);

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return { success: false, error: `Jurnal tidak seimbang: Debit ${totalDebit}, Credit ${totalCredit}` };
    }

    // Generate journal number
    const entryNumber = await generateJournalNumber(input.branchId);

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'User tidak terautentikasi' };
    }

    // Create journal entry
    const { data: journalEntry, error: journalError } = await supabase
      .from('journal_entries')
      .insert({
        entry_number: entryNumber,
        entry_date: input.entryDate.toISOString().split('T')[0],
        description: input.description,
        reference_type: input.referenceType,
        reference_id: input.referenceId,
        status: input.autoPost ? 'posted' : 'draft',
        total_debit: totalDebit,
        total_credit: totalCredit,
        branch_id: input.branchId,
        created_by: user.id,
        approved_by: input.autoPost ? user.id : null,
        approved_at: input.autoPost ? new Date().toISOString() : null,
      })
      .select('id')
      .single();

    if (journalError || !journalEntry) {
      console.error('Error creating journal entry:', journalError);
      return { success: false, error: journalError?.message || 'Gagal membuat jurnal' };
    }

    // Create journal lines
    const journalLines = input.lines.map((line, index) => ({
      journal_entry_id: journalEntry.id,
      line_number: index + 1,
      account_id: line.accountId,
      account_code: line.accountCode,
      account_name: line.accountName,
      debit_amount: line.debitAmount || 0,
      credit_amount: line.creditAmount || 0,
      description: line.description || '',
    }));

    const { error: linesError } = await supabase
      .from('journal_entry_lines')
      .insert(journalLines);

    if (linesError) {
      console.error('Error creating journal lines:', linesError);
      // Rollback: delete the journal entry
      await supabase.from('journal_entries').delete().eq('id', journalEntry.id);
      return { success: false, error: linesError.message };
    }

    // ============================================================================
    // BALANCE TIDAK DIUPDATE LANGSUNG DI SINI
    // Saldo akun sekarang dihitung langsung dari query journal_entry_lines
    // di useAccounts.ts. Ini menghindari duplikasi dan memastikan
    // saldo selalu konsisten dengan jurnal yang ter-posted.
    // ============================================================================

    return { success: true, journalId: journalEntry.id };
  } catch (error) {
    console.error('Error in createJournalEntry:', error);
    return { success: false, error: String(error) };
  }
}

// ============================================
// TRANSACTION-SPECIFIC JOURNAL GENERATORS
// ============================================

/**
 * Generate journal for POS Transaction (Sales)
 *
 * Penjualan Tunai (dengan HPP):
 * Dr. Kas                     xxx (total penjualan)
 * Dr. HPP                     xxx (cost of goods sold)
 *   Cr. Pendapatan Penjualan       xxx (total penjualan)
 *   Cr. Persediaan                 xxx (cost of goods sold)
 *
 * Penjualan Kredit (dengan HPP):
 * Dr. Piutang Usaha           xxx
 * Dr. HPP                     xxx
 *   Cr. Pendapatan Penjualan       xxx
 *   Cr. Persediaan                 xxx
 */
export async function createSalesJournal(params: {
  transactionId: string;
  transactionNumber: string;
  transactionDate: Date;
  totalAmount: number;
  paymentMethod: 'cash' | 'credit' | 'transfer';
  customerName?: string;
  branchId: string;
  // Optional: HPP (Cost of Goods Sold) data
  hppAmount?: number;
}): Promise<{ success: boolean; journalId?: string; error?: string }> {
  const { transactionId, transactionNumber, transactionDate, totalAmount, paymentMethod, customerName, branchId, hppAmount } = params;

  // Find accounts
  const kasAccount = await getAccountByCode('1-1100', branchId) || await findAccountByPattern('kas', 'Aset', branchId);
  const piutangAccount = await getAccountByCode('1-1200', branchId) || await findAccountByPattern('piutang', 'Aset', branchId);
  const pendapatanAccount = await getAccountByCode('4-1000', branchId) || await findAccountByPattern('penjualan', 'Pendapatan', branchId);

  // HPP & Persediaan accounts (optional, for COGS recording)
  const hppAccount = await getAccountByCode('5-1000', branchId) || await findAccountByPattern('hpp', 'Beban', branchId);
  const persediaanAccount = await getAccountByCode('1-1300', branchId) || await findAccountByPattern('persediaan', 'Aset', branchId);

  if (!pendapatanAccount) {
    return { success: false, error: 'Akun Pendapatan tidak ditemukan' };
  }

  const debitAccount = paymentMethod === 'credit' ? piutangAccount : kasAccount;
  if (!debitAccount) {
    return { success: false, error: paymentMethod === 'credit' ? 'Akun Piutang tidak ditemukan' : 'Akun Kas tidak ditemukan' };
  }

  const description = `Penjualan ${paymentMethod === 'credit' ? 'Kredit' : 'Tunai'} - ${transactionNumber}${customerName ? ` - ${customerName}` : ''}`;

  // Build journal lines
  const lines: JournalLineInput[] = [
    // Dr. Kas/Piutang
    {
      accountId: debitAccount.id,
      accountCode: debitAccount.code,
      accountName: debitAccount.name,
      debitAmount: totalAmount,
      creditAmount: 0,
      description: paymentMethod === 'credit' ? 'Piutang penjualan' : 'Penerimaan kas',
    },
    // Cr. Pendapatan Penjualan
    {
      accountId: pendapatanAccount.id,
      accountCode: pendapatanAccount.code,
      accountName: pendapatanAccount.name,
      debitAmount: 0,
      creditAmount: totalAmount,
      description: 'Pendapatan penjualan',
    },
  ];

  // Add HPP & Persediaan entries if HPP data is provided
  if (hppAmount && hppAmount > 0 && hppAccount && persediaanAccount) {
    // Dr. HPP (Cost of Goods Sold)
    lines.push({
      accountId: hppAccount.id,
      accountCode: hppAccount.code,
      accountName: hppAccount.name,
      debitAmount: hppAmount,
      creditAmount: 0,
      description: 'Harga Pokok Penjualan',
    });
    // Cr. Persediaan
    lines.push({
      accountId: persediaanAccount.id,
      accountCode: persediaanAccount.code,
      accountName: persediaanAccount.name,
      debitAmount: 0,
      creditAmount: hppAmount,
      description: 'Pengurangan persediaan',
    });
  }

  return createJournalEntry({
    entryDate: transactionDate,
    description,
    referenceType: 'transaction',
    referenceId: transactionId,
    branchId,
    autoPost: true,
    lines,
  });
}

/**
 * Generate journal for Expense
 *
 * Dr. Beban (sesuai kategori)   xxx
 *   Cr. Kas                          xxx
 */
export async function createExpenseJournal(params: {
  expenseId: string;
  expenseDate: Date;
  amount: number;
  categoryName: string;
  description: string;
  branchId: string;
  accountId?: string; // Optional: specific expense account
}): Promise<{ success: boolean; journalId?: string; error?: string }> {
  const { expenseId, expenseDate, amount, categoryName, description, branchId, accountId } = params;

  // Find accounts
  const kasAccount = await getAccountByCode('1-1100', branchId) || await findAccountByPattern('kas', 'Aset', branchId);

  let bebanAccount: { id: string; code: string; name: string } | null = null;

  if (accountId) {
    // Use specific account if provided
    const { data } = await supabase
      .from('accounts')
      .select('id, code, name')
      .eq('id', accountId)
      .single();
    if (data) {
      bebanAccount = { id: data.id, code: data.code, name: data.name };
    }
  }

  if (!bebanAccount) {
    // Try to find expense account by category name
    bebanAccount = await findAccountByPattern(categoryName, 'Beban', branchId);
  }

  if (!bebanAccount) {
    // Fallback to general expense account
    bebanAccount = await getAccountByCode('5-1000', branchId) || await findAccountByPattern('beban', 'Beban', branchId);
  }

  if (!kasAccount) {
    return { success: false, error: 'Akun Kas tidak ditemukan' };
  }

  if (!bebanAccount) {
    return { success: false, error: 'Akun Beban tidak ditemukan' };
  }

  return createJournalEntry({
    entryDate: expenseDate,
    description: `Pengeluaran: ${categoryName} - ${description}`,
    referenceType: 'expense',
    referenceId: expenseId,
    branchId,
    autoPost: true,
    lines: [
      {
        accountId: bebanAccount.id,
        accountCode: bebanAccount.code,
        accountName: bebanAccount.name,
        debitAmount: amount,
        creditAmount: 0,
        description: categoryName,
      },
      {
        accountId: kasAccount.id,
        accountCode: kasAccount.code,
        accountName: kasAccount.name,
        debitAmount: 0,
        creditAmount: amount,
        description: 'Pengeluaran kas',
      },
    ],
  });
}

/**
 * Generate journal for Employee Advance (Panjar)
 *
 * Pemberian Panjar:
 * Dr. Panjar Karyawan      xxx
 *   Cr. Kas                     xxx
 *
 * Pengembalian Panjar:
 * Dr. Kas                  xxx
 *   Cr. Panjar Karyawan         xxx
 */
export async function createAdvanceJournal(params: {
  advanceId: string;
  advanceDate: Date;
  amount: number;
  employeeName: string;
  type: 'given' | 'returned';
  description?: string;
  branchId: string;
}): Promise<{ success: boolean; journalId?: string; error?: string }> {
  const { advanceId, advanceDate, amount, employeeName, type, description, branchId } = params;

  // Find accounts
  const kasAccount = await getAccountByCode('1-1100', branchId) || await findAccountByPattern('kas', 'Aset', branchId);
  const panjarAccount = await getAccountByCode('1-1400', branchId) || await findAccountByPattern('panjar', 'Aset', branchId);

  if (!kasAccount) {
    return { success: false, error: 'Akun Kas tidak ditemukan' };
  }

  if (!panjarAccount) {
    return { success: false, error: 'Akun Panjar tidak ditemukan' };
  }

  const journalDescription = type === 'given'
    ? `Pemberian Panjar - ${employeeName}${description ? ` - ${description}` : ''}`
    : `Pengembalian Panjar - ${employeeName}${description ? ` - ${description}` : ''}`;

  const lines: JournalLineInput[] = type === 'given'
    ? [
        {
          accountId: panjarAccount.id,
          accountCode: panjarAccount.code,
          accountName: panjarAccount.name,
          debitAmount: amount,
          creditAmount: 0,
          description: 'Panjar diberikan',
        },
        {
          accountId: kasAccount.id,
          accountCode: kasAccount.code,
          accountName: kasAccount.name,
          debitAmount: 0,
          creditAmount: amount,
          description: 'Pengeluaran kas',
        },
      ]
    : [
        {
          accountId: kasAccount.id,
          accountCode: kasAccount.code,
          accountName: kasAccount.name,
          debitAmount: amount,
          creditAmount: 0,
          description: 'Penerimaan kas',
        },
        {
          accountId: panjarAccount.id,
          accountCode: panjarAccount.code,
          accountName: panjarAccount.name,
          debitAmount: 0,
          creditAmount: amount,
          description: 'Panjar dikembalikan',
        },
      ];

  return createJournalEntry({
    entryDate: advanceDate,
    description: journalDescription,
    referenceType: 'advance',
    referenceId: advanceId,
    branchId,
    autoPost: true,
    lines,
  });
}

/**
 * Generate journal for Payroll
 *
 * Dr. Beban Gaji           xxx
 *   Cr. Kas                     xxx
 *   Cr. Panjar Karyawan         xxx (if deducted)
 */
export async function createPayrollJournal(params: {
  payrollId: string;
  payrollDate: Date;
  employeeName: string;
  grossSalary: number;
  advanceDeduction: number;
  netSalary: number;
  branchId: string;
}): Promise<{ success: boolean; journalId?: string; error?: string }> {
  const { payrollId, payrollDate, employeeName, grossSalary, advanceDeduction, netSalary, branchId } = params;

  // Find accounts
  const kasAccount = await getAccountByCode('1-1100', branchId) || await findAccountByPattern('kas', 'Aset', branchId);
  const gajiAccount = await getAccountByCode('5-2000', branchId) || await findAccountByPattern('gaji', 'Beban', branchId);
  const panjarAccount = await getAccountByCode('1-1400', branchId) || await findAccountByPattern('panjar', 'Aset', branchId);

  if (!kasAccount) {
    return { success: false, error: 'Akun Kas tidak ditemukan' };
  }

  if (!gajiAccount) {
    return { success: false, error: 'Akun Beban Gaji tidak ditemukan' };
  }

  const lines: JournalLineInput[] = [
    {
      accountId: gajiAccount.id,
      accountCode: gajiAccount.code,
      accountName: gajiAccount.name,
      debitAmount: grossSalary,
      creditAmount: 0,
      description: `Gaji ${employeeName}`,
    },
    {
      accountId: kasAccount.id,
      accountCode: kasAccount.code,
      accountName: kasAccount.name,
      debitAmount: 0,
      creditAmount: netSalary,
      description: 'Pembayaran gaji bersih',
    },
  ];

  // Add advance deduction if any
  if (advanceDeduction > 0 && panjarAccount) {
    lines.push({
      accountId: panjarAccount.id,
      accountCode: panjarAccount.code,
      accountName: panjarAccount.name,
      debitAmount: 0,
      creditAmount: advanceDeduction,
      description: 'Potongan panjar',
    });
  }

  return createJournalEntry({
    entryDate: payrollDate,
    description: `Pembayaran Gaji - ${employeeName}`,
    referenceType: 'payroll',
    referenceId: payrollId,
    branchId,
    autoPost: true,
    lines,
  });
}

/**
 * Generate journal for Receivable Payment
 *
 * Dr. Kas                  xxx
 *   Cr. Piutang Usaha           xxx
 */
export async function createReceivablePaymentJournal(params: {
  receivableId: string;
  paymentDate: Date;
  amount: number;
  customerName: string;
  invoiceNumber?: string;
  branchId: string;
}): Promise<{ success: boolean; journalId?: string; error?: string }> {
  const { receivableId, paymentDate, amount, customerName, invoiceNumber, branchId } = params;

  // Find accounts
  const kasAccount = await getAccountByCode('1-1100', branchId) || await findAccountByPattern('kas', 'Aset', branchId);
  const piutangAccount = await getAccountByCode('1-1200', branchId) || await findAccountByPattern('piutang', 'Aset', branchId);

  if (!kasAccount) {
    return { success: false, error: 'Akun Kas tidak ditemukan' };
  }

  if (!piutangAccount) {
    return { success: false, error: 'Akun Piutang tidak ditemukan' };
  }

  return createJournalEntry({
    entryDate: paymentDate,
    description: `Pembayaran Piutang - ${customerName}${invoiceNumber ? ` (${invoiceNumber})` : ''}`,
    referenceType: 'receivable',
    referenceId: receivableId,
    branchId,
    autoPost: true,
    lines: [
      {
        accountId: kasAccount.id,
        accountCode: kasAccount.code,
        accountName: kasAccount.name,
        debitAmount: amount,
        creditAmount: 0,
        description: 'Penerimaan pembayaran piutang',
      },
      {
        accountId: piutangAccount.id,
        accountCode: piutangAccount.code,
        accountName: piutangAccount.name,
        debitAmount: 0,
        creditAmount: amount,
        description: 'Pelunasan piutang',
      },
    ],
  });
}

/**
 * Generate journal for Payable Payment
 *
 * Dr. Hutang Usaha         xxx
 *   Cr. Kas                     xxx
 */
export async function createPayablePaymentJournal(params: {
  payableId: string;
  paymentDate: Date;
  amount: number;
  supplierName: string;
  invoiceNumber?: string;
  branchId: string;
}): Promise<{ success: boolean; journalId?: string; error?: string }> {
  const { payableId, paymentDate, amount, supplierName, invoiceNumber, branchId } = params;

  // Find accounts
  const kasAccount = await getAccountByCode('1-1100', branchId) || await findAccountByPattern('kas', 'Aset', branchId);
  const hutangAccount = await getAccountByCode('2-1100', branchId) || await findAccountByPattern('hutang', 'Kewajiban', branchId);

  if (!kasAccount) {
    return { success: false, error: 'Akun Kas tidak ditemukan' };
  }

  if (!hutangAccount) {
    return { success: false, error: 'Akun Hutang tidak ditemukan' };
  }

  return createJournalEntry({
    entryDate: paymentDate,
    description: `Pembayaran Hutang - ${supplierName}${invoiceNumber ? ` (${invoiceNumber})` : ''}`,
    referenceType: 'payable',
    referenceId: payableId,
    branchId,
    autoPost: true,
    lines: [
      {
        accountId: hutangAccount.id,
        accountCode: hutangAccount.code,
        accountName: hutangAccount.name,
        debitAmount: amount,
        creditAmount: 0,
        description: 'Pelunasan hutang',
      },
      {
        accountId: kasAccount.id,
        accountCode: kasAccount.code,
        accountName: kasAccount.name,
        debitAmount: 0,
        creditAmount: amount,
        description: 'Pengeluaran kas',
      },
    ],
  });
}

/**
 * Generate journal for Account Transfer
 *
 * Dr. Akun Tujuan          xxx
 *   Cr. Akun Asal               xxx
 */
export async function createTransferJournal(params: {
  transferId: string;
  transferDate: Date;
  amount: number;
  fromAccountId: string;
  fromAccountCode: string;
  fromAccountName: string;
  toAccountId: string;
  toAccountCode: string;
  toAccountName: string;
  description?: string;
  branchId: string;
}): Promise<{ success: boolean; journalId?: string; error?: string }> {
  const { transferId, transferDate, amount, fromAccountId, fromAccountCode, fromAccountName, toAccountId, toAccountCode, toAccountName, description, branchId } = params;

  return createJournalEntry({
    entryDate: transferDate,
    description: description || `Transfer: ${fromAccountName} → ${toAccountName}`,
    referenceType: 'transfer',
    referenceId: transferId,
    branchId,
    autoPost: true,
    lines: [
      {
        accountId: toAccountId,
        accountCode: toAccountCode,
        accountName: toAccountName,
        debitAmount: amount,
        creditAmount: 0,
        description: 'Transfer masuk',
      },
      {
        accountId: fromAccountId,
        accountCode: fromAccountCode,
        accountName: fromAccountName,
        debitAmount: 0,
        creditAmount: amount,
        description: 'Transfer keluar',
      },
    ],
  });
}

/**
 * Void a journal entry
 *
 * CATATAN: Balance tidak perlu diupdate di sini karena:
 * - Balance dihitung dari query journal_entry_lines di useAccounts.ts
 * - Query hanya mengambil jurnal dengan status 'posted' dan is_voided = false
 * - Saat jurnal di-void, otomatis tidak dihitung dalam balance
 */
export async function voidJournalEntry(journalId: string, reason: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'User tidak terautentikasi' };
    }

    // Get journal entry
    const { data: journal, error: fetchError } = await supabase
      .from('journal_entries')
      .select('id, status, is_voided')
      .eq('id', journalId)
      .single();

    if (fetchError || !journal) {
      return { success: false, error: 'Jurnal tidak ditemukan' };
    }

    if (journal.is_voided) {
      return { success: false, error: 'Jurnal sudah dibatalkan' };
    }

    if (journal.status !== 'posted') {
      return { success: false, error: 'Hanya jurnal yang sudah diposting yang bisa dibatalkan' };
    }

    // Update journal as voided
    // Balance akan otomatis terupdate karena query di useAccounts.ts
    // hanya mengambil jurnal yang posted dan tidak voided
    const { error: updateError } = await supabase
      .from('journal_entries')
      .update({
        is_voided: true,
        void_reason: reason,
        voided_by: user.id,
        voided_at: new Date().toISOString(),
      })
      .eq('id', journalId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error voiding journal:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Generate journal for Manual Cash In (Kas Masuk Manual)
 *
 * Untuk kas masuk manual, kita perlu akun lawan:
 * Dr. Kas               xxx
 *   Cr. Pendapatan Lain      xxx (atau Modal jika dari pemilik)
 */
export async function createManualCashInJournal(params: {
  referenceId: string;
  transactionDate: Date;
  amount: number;
  description: string;
  cashAccountId: string;
  cashAccountCode: string;
  cashAccountName: string;
  branchId: string;
}): Promise<{ success: boolean; journalId?: string; error?: string }> {
  const { referenceId, transactionDate, amount, description, cashAccountId, cashAccountCode, cashAccountName, branchId } = params;

  // Find Pendapatan Lain-lain account
  const pendapatanLainAccount = await getAccountByCode('4-2000', branchId) || await findAccountByPattern('lain', 'Pendapatan', branchId);

  if (!pendapatanLainAccount) {
    return { success: false, error: 'Akun Pendapatan Lain-lain tidak ditemukan. Buat akun dengan kode 4-2000 atau tipe Pendapatan' };
  }

  return createJournalEntry({
    entryDate: transactionDate,
    description: `Kas Masuk Manual: ${description}`,
    referenceType: 'manual',
    referenceId,
    branchId,
    autoPost: true,
    lines: [
      {
        accountId: cashAccountId,
        accountCode: cashAccountCode,
        accountName: cashAccountName,
        debitAmount: amount,
        creditAmount: 0,
        description: 'Kas masuk',
      },
      {
        accountId: pendapatanLainAccount.id,
        accountCode: pendapatanLainAccount.code,
        accountName: pendapatanLainAccount.name,
        debitAmount: 0,
        creditAmount: amount,
        description: description,
      },
    ],
  });
}

/**
 * Generate journal for Manual Cash Out (Kas Keluar Manual)
 *
 * Untuk kas keluar manual, kita perlu akun lawan:
 * Dr. Beban Lain-lain   xxx
 *   Cr. Kas                  xxx
 */
export async function createManualCashOutJournal(params: {
  referenceId: string;
  transactionDate: Date;
  amount: number;
  description: string;
  cashAccountId: string;
  cashAccountCode: string;
  cashAccountName: string;
  branchId: string;
}): Promise<{ success: boolean; journalId?: string; error?: string }> {
  const { referenceId, transactionDate, amount, description, cashAccountId, cashAccountCode, cashAccountName, branchId } = params;

  // Find Beban Lain-lain account
  const bebanLainAccount = await getAccountByCode('5-9000', branchId) || await findAccountByPattern('lain', 'Beban', branchId);

  if (!bebanLainAccount) {
    return { success: false, error: 'Akun Beban Lain-lain tidak ditemukan. Buat akun dengan kode 5-9000 atau tipe Beban' };
  }

  return createJournalEntry({
    entryDate: transactionDate,
    description: `Kas Keluar Manual: ${description}`,
    referenceType: 'manual',
    referenceId,
    branchId,
    autoPost: true,
    lines: [
      {
        accountId: bebanLainAccount.id,
        accountCode: bebanLainAccount.code,
        accountName: bebanLainAccount.name,
        debitAmount: amount,
        creditAmount: 0,
        description: description,
      },
      {
        accountId: cashAccountId,
        accountCode: cashAccountCode,
        accountName: cashAccountName,
        debitAmount: 0,
        creditAmount: amount,
        description: 'Kas keluar',
      },
    ],
  });
}

/**
 * Clear account cache (useful when accounts are updated)
 */
export function clearAccountCache(): void {
  accountCache.clear();
}

/**
 * Generate journal for Asset Purchase
 *
 * Pembelian Aset Tetap:
 * Dr. Aset Tetap (sesuai kategori)    xxx
 *   Cr. Kas/Bank                           xxx (jika tunai)
 *   Cr. Hutang Usaha                       xxx (jika kredit)
 */
export async function createAssetPurchaseJournal(params: {
  assetId: string;
  purchaseDate: Date;
  amount: number;
  assetAccountId: string;
  assetAccountCode: string;
  assetAccountName: string;
  assetName: string;
  paymentMethod: 'cash' | 'credit';
  branchId: string;
}): Promise<{ success: boolean; journalId?: string; error?: string }> {
  const { assetId, purchaseDate, amount, assetAccountId, assetAccountCode, assetAccountName, assetName, paymentMethod, branchId } = params;

  // Find credit account based on payment method
  let creditAccount: { id: string; code: string; name: string } | null = null;

  if (paymentMethod === 'credit') {
    creditAccount = await getAccountByCode('2-1100', branchId) || await findAccountByPattern('hutang', 'Kewajiban', branchId);
    if (!creditAccount) {
      return { success: false, error: 'Akun Hutang tidak ditemukan' };
    }
  } else {
    creditAccount = await getAccountByCode('1-1100', branchId) || await findAccountByPattern('kas', 'Aset', branchId);
    if (!creditAccount) {
      return { success: false, error: 'Akun Kas tidak ditemukan' };
    }
  }

  return createJournalEntry({
    entryDate: purchaseDate,
    description: `Pembelian Aset: ${assetName}${paymentMethod === 'credit' ? ' (Kredit)' : ' (Tunai)'}`,
    referenceType: 'manual',
    referenceId: assetId,
    branchId,
    autoPost: true,
    lines: [
      {
        accountId: assetAccountId,
        accountCode: assetAccountCode,
        accountName: assetAccountName,
        debitAmount: amount,
        creditAmount: 0,
        description: `Aset: ${assetName}`,
      },
      {
        accountId: creditAccount.id,
        accountCode: creditAccount.code,
        accountName: creditAccount.name,
        debitAmount: 0,
        creditAmount: amount,
        description: paymentMethod === 'credit' ? 'Hutang pembelian aset' : 'Kas keluar pembelian aset',
      },
    ],
  });
}

/**
 * Generate journal for Asset Depreciation
 *
 * Penyusutan Aset Tetap:
 * Dr. Beban Penyusutan           xxx
 *   Cr. Akumulasi Penyusutan          xxx
 */
export async function createDepreciationJournal(params: {
  assetId: string;
  depreciationDate: Date;
  amount: number;
  assetName: string;
  period: string;
  branchId: string;
}): Promise<{ success: boolean; journalId?: string; error?: string }> {
  const { assetId, depreciationDate, amount, assetName, period, branchId } = params;

  // Find depreciation expense account (6240 or type Beban with "penyusutan")
  const bebanPenyusutanAccount = await getAccountByCode('6240', branchId) || await findAccountByPattern('penyusutan', 'Beban', branchId);
  if (!bebanPenyusutanAccount) {
    return { success: false, error: 'Akun Beban Penyusutan tidak ditemukan. Buat akun dengan kode 6240 atau tipe Beban' };
  }

  // Find accumulated depreciation account (1450 or 1420)
  const akumulasiAccount = await getAccountByCode('1450', branchId) || await getAccountByCode('1420', branchId) || await findAccountByPattern('akumulasi', 'Aset', branchId);
  if (!akumulasiAccount) {
    return { success: false, error: 'Akun Akumulasi Penyusutan tidak ditemukan. Buat akun dengan kode 1450 atau 1420' };
  }

  return createJournalEntry({
    entryDate: depreciationDate,
    description: `Penyusutan ${assetName} periode ${period}`,
    referenceType: 'adjustment',
    referenceId: assetId,
    branchId,
    autoPost: true,
    lines: [
      {
        accountId: bebanPenyusutanAccount.id,
        accountCode: bebanPenyusutanAccount.code,
        accountName: bebanPenyusutanAccount.name,
        debitAmount: amount,
        creditAmount: 0,
        description: `Beban penyusutan ${assetName}`,
      },
      {
        accountId: akumulasiAccount.id,
        accountCode: akumulasiAccount.code,
        accountName: akumulasiAccount.name,
        debitAmount: 0,
        creditAmount: amount,
        description: `Akumulasi penyusutan ${assetName}`,
      },
    ],
  });
}

/**
 * Generate journal for Production HPP (Cost of Goods Manufactured)
 *
 * Produksi (consume materials):
 * Dr. HPP Bahan Baku           xxx
 *   Cr. Persediaan Bahan Baku       xxx
 */
export async function createProductionHPPJournal(params: {
  productionId: string;
  productionRef: string;
  productionDate: Date;
  amount: number;
  productName: string;
  materialDetails: string;
  branchId: string;
}): Promise<{ success: boolean; journalId?: string; error?: string }> {
  const { productionId, productionRef, productionDate, amount, productName, materialDetails, branchId } = params;

  // Find HPP Bahan Baku account (5100)
  const hppAccount = await getAccountByCode('5100', branchId) || await findAccountByPattern('hpp', 'Beban', branchId);
  if (!hppAccount) {
    return { success: false, error: 'Akun HPP Bahan Baku tidak ditemukan. Buat akun dengan kode 5100 atau tipe Beban' };
  }

  // Find Persediaan Bahan Baku account (1310 or 1300)
  const persediaanAccount = await getAccountByCode('1310', branchId) || await getAccountByCode('1300', branchId) || await findAccountByPattern('persediaan', 'Aset', branchId);
  if (!persediaanAccount) {
    return { success: false, error: 'Akun Persediaan Bahan Baku tidak ditemukan. Buat akun dengan kode 1310 atau 1300' };
  }

  return createJournalEntry({
    entryDate: productionDate,
    description: `HPP Produksi ${productionRef}: ${materialDetails} -> ${productName}`,
    referenceType: 'adjustment',
    referenceId: productionId,
    branchId,
    autoPost: true,
    lines: [
      {
        accountId: hppAccount.id,
        accountCode: hppAccount.code,
        accountName: hppAccount.name,
        debitAmount: amount,
        creditAmount: 0,
        description: `HPP Bahan: ${materialDetails}`,
      },
      {
        accountId: persediaanAccount.id,
        accountCode: persediaanAccount.code,
        accountName: persediaanAccount.name,
        debitAmount: 0,
        creditAmount: amount,
        description: 'Pengurangan persediaan bahan',
      },
    ],
  });
}
