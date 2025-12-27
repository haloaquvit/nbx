/**
 * Journal Service
 *
 * Service untuk auto-generate jurnal dari berbagai transaksi.
 * Sesuai dengan standar akuntansi double-entry bookkeeping.
 *
 * Flow: Transaksi → Jurnal → Buku Besar → Laporan Keuangan
 */

import { supabase } from '@/integrations/supabase/client';
import { postgrestAuth } from '@/integrations/supabase/postgrestAuth';

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
  kas: string;        // Kas/Bank - biasanya 1120
  piutang: string;    // Piutang Usaha - 1210
  hutang: string;     // Hutang Usaha - 2110
  pendapatan: string; // Pendapatan Penjualan - 4100
  beban: string;      // Beban Umum - 6100
  persediaan: string; // Persediaan Barang - 1320
  panjar: string;     // Panjar Karyawan - 1220
  gaji: string;       // Beban Gaji - 6210
  modal: string;      // Modal - 3100
}

// Default account mappings (will be fetched from database)
let accountCache: Map<string, { id: string; code: string; name: string }> = new Map();

// Clear account cache (call this when accounts might have changed)
export function clearAccountCache() {
  accountCache.clear();
  console.log('[JournalService] Account cache cleared');
}

/**
 * Fetch and cache account by code
 */
async function getAccountByCode(code: string, branchId: string): Promise<{ id: string; code: string; name: string } | null> {
  const cacheKey = `${branchId}:${code}`;

  if (accountCache.has(cacheKey)) {
    return accountCache.get(cacheKey)!;
  }

  // Use .order('id').limit(1) instead of .single() because our client forces Accept: application/json
  // which makes PostgREST return array instead of object
  const { data, error } = await supabase
    .from('accounts')
    .select('id, code, name, is_header')
    .eq('code', code)
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .order('id').limit(1);

  if (error) {
    console.warn(`[getAccountByCode] Error fetching account ${code}:`, error.message);
    return null;
  }

  // Handle array response (PostgREST returns array when Accept: application/json)
  const record = Array.isArray(data) ? data[0] : data;

  if (!record) {
    console.warn(`[getAccountByCode] Account ${code} not found for branch ${branchId}`);
    return null;
  }

  if (record.is_header === true) {
    console.warn(`[getAccountByCode] Account ${code} is a header account - skipping`);
    return null;
  }

  const account = { id: record.id, code: record.code, name: record.name };
  accountCache.set(cacheKey, account);
  console.log(`[getAccountByCode] Found account: ${code} - ${record.name}`);
  return account;
}

/**
 * Find account by partial code match or name search
 * Now supports multiple types (e.g., 'Kewajiban' can match 'Liabilitas', 'Liability')
 */
async function findAccountByPattern(pattern: string, type: string, branchId: string): Promise<{ id: string; code: string; name: string } | null> {
  // Map common type variations
  const typeVariations: Record<string, string[]> = {
    'Kewajiban': ['Kewajiban', 'Liabilitas', 'Liability'],
    'Modal': ['Modal', 'Ekuitas', 'Equity'],
    'Aset': ['Aset', 'Asset', 'Aktiva'],
    'Beban': ['Beban', 'Expense', 'Biaya'],
    'Pendapatan': ['Pendapatan', 'Revenue', 'Income'],
  };

  const typesToSearch = typeVariations[type] || [type];

  // Build OR condition for types
  const typeFilter = typesToSearch.map(t => `type.eq.${t}`).join(',');

  // Use .order('id').limit(1) instead of .single() because our client forces Accept: application/json
  const { data, error } = await supabase
    .from('accounts')
    .select('id, code, name')
    .eq('branch_id', branchId)
    .or(typeFilter)
    .eq('is_active', true)
    .eq('is_header', false)
    .or(`code.ilike.%${pattern}%,name.ilike.%${pattern}%`)
    .order('id').limit(1);

  if (error) {
    return null;
  }

  // Handle array response
  const record = Array.isArray(data) ? data[0] : data;

  if (!record) {
    return null;
  }

  return { id: record.id, code: record.code, name: record.name };
}

/**
 * Generate journal entry number with timestamp suffix to prevent race condition duplicates
 */
async function generateJournalNumber(branchId: string): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const prefix = `JE-${year}${month}${day}-`;

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

  // Add milliseconds suffix to prevent race condition duplicates
  const msSuffix = now.getMilliseconds().toString().padStart(3, '0');
  return `${prefix}${nextNumber.toString().padStart(4, '0')}${msSuffix}`;
}

/**
 * Create journal entry with lines (with retry logic for duplicate key conflicts)
 */
export async function createJournalEntry(input: CreateJournalInput, retryCount = 0): Promise<{ success: boolean; journalId?: string; error?: string }> {
  const MAX_RETRIES = 3;

  try {
    // Validate balance
    const totalDebit = input.lines.reduce((sum, line) => sum + (line.debitAmount || 0), 0);
    const totalCredit = input.lines.reduce((sum, line) => sum + (line.creditAmount || 0), 0);

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return { success: false, error: `Jurnal tidak seimbang: Debit ${totalDebit}, Credit ${totalCredit}` };
    }

    // Generate journal number
    const entryNumber = await generateJournalNumber(input.branchId);

    // Get current user from PostgREST auth (not supabase.auth which doesn't work with custom auth)
    const { data: { user } } = await postgrestAuth.getUser();
    if (!user) {
      return { success: false, error: 'User tidak terautentikasi' };
    }

    // Create journal entry using RPC function (SECURITY DEFINER)
    // This bypasses RLS SELECT restrictions and guarantees RETURNING works
    console.log('[JournalService] Inserting journal entry via RPC...', { entryNumber, retryCount });

    const { data: rpcResult, error: journalError } = await supabase
      .rpc('insert_journal_entry', {
        p_entry_number: entryNumber,
        p_entry_date: input.entryDate.toISOString().split('T')[0],
        p_description: input.description,
        p_reference_type: input.referenceType,
        p_reference_id: input.referenceId || null,
        p_status: input.autoPost ? 'posted' : 'draft',
        p_total_debit: totalDebit,
        p_total_credit: totalCredit,
        p_branch_id: input.branchId,
        p_created_by: user.id,
        p_approved_by: input.autoPost ? user.id : null,
        p_approved_at: input.autoPost ? new Date().toISOString() : null,
      });

    console.log('[JournalService] RPC insert_journal_entry result:', { rpcResult, journalError });

    if (journalError) {
      // Check if it's a duplicate key error - retry with new number
      if (journalError.message?.includes('duplicate key') && retryCount < MAX_RETRIES) {
        console.warn(`[JournalService] Duplicate key conflict, retrying (${retryCount + 1}/${MAX_RETRIES})...`);
        // Small delay before retry
        await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
        return createJournalEntry(input, retryCount + 1);
      }
      console.error('[JournalService] Error creating journal entry:', journalError);
      return { success: false, error: journalError?.message || 'Gagal membuat jurnal' };
    }

    // RPC returns array, get first item
    const journalEntry = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
    const journalId = journalEntry?.id;

    if (!journalId) {
      console.error('[JournalService] Journal ID not found after RPC insert');
      return { success: false, error: 'Gagal membuat jurnal - ID tidak dikembalikan' };
    }

    console.log('[JournalService] Journal created via RPC with ID:', journalId);

    // Create journal lines - ensure all keys are present with default values
    // PostgREST PGRST102 requires all objects in array to have same keys
    const journalLines = input.lines.map((line, index) => ({
      journal_entry_id: journalId,
      line_number: index + 1,
      account_id: line.accountId,
      account_code: line.accountCode || '', // Must have value, not undefined
      account_name: line.accountName || '', // Must have value, not undefined
      debit_amount: line.debitAmount || 0,
      credit_amount: line.creditAmount || 0,
      description: line.description || '',
    }));

    console.log('[JournalService] Inserting journal lines:', JSON.stringify(journalLines, null, 2));

    const { data: insertedLines, error: linesError } = await supabase
      .from('journal_entry_lines')
      .insert(journalLines)
      .select('id');

    console.log('[JournalService] Insert lines result:', { insertedLines, linesError });

    if (linesError) {
      console.error('[JournalService] Error creating journal lines:', linesError);
      // Rollback: delete the journal entry
      await supabase.from('journal_entries').delete().eq('id', journalId);
      return { success: false, error: linesError.message };
    }

    // Validate that ALL lines were actually inserted
    // Always verify by fetching from database to ensure data integrity
    const { data: fetchedLines, error: fetchLinesError } = await supabase
      .from('journal_entry_lines')
      .select('id, line_number, debit_amount, credit_amount')
      .eq('journal_entry_id', journalId);

    console.log('[JournalService] Verify lines result:', {
      expected: input.lines.length,
      actual: fetchedLines?.length,
      fetchLinesError
    });

    // CRITICAL: Validate that ALL expected lines were inserted
    if (fetchLinesError || !fetchedLines || fetchedLines.length !== input.lines.length) {
      console.error('[JournalService] Journal lines count mismatch! Expected:', input.lines.length, 'Got:', fetchedLines?.length);
      // Rollback: delete the journal entry (will cascade delete any partial lines)
      await supabase.from('journal_entries').delete().eq('id', journalId);
      return {
        success: false,
        error: `Gagal membuat baris jurnal - hanya ${fetchedLines?.length || 0} dari ${input.lines.length} baris ter-insert`
      };
    }

    // Validate balance of inserted lines
    const insertedDebit = fetchedLines.reduce((sum, line) => sum + Number(line.debit_amount || 0), 0);
    const insertedCredit = fetchedLines.reduce((sum, line) => sum + Number(line.credit_amount || 0), 0);

    if (Math.abs(insertedDebit - insertedCredit) > 0.01) {
      console.error('[JournalService] Inserted journal is unbalanced! Debit:', insertedDebit, 'Credit:', insertedCredit);
      // Rollback
      await supabase.from('journal_entries').delete().eq('id', journalId);
      return {
        success: false,
        error: `Jurnal tidak seimbang setelah insert: Debit ${insertedDebit}, Credit ${insertedCredit}`
      };
    }

    console.log('[JournalService] Journal lines created and verified successfully:', fetchedLines.length, 'lines, balanced:', insertedDebit);

    // ============================================================================
    // BALANCE TIDAK DIUPDATE LANGSUNG DI SINI
    // Saldo akun sekarang dihitung langsung dari query journal_entry_lines
    // di useAccounts.ts. Ini menghindari duplikasi dan memastikan
    // saldo selalu konsisten dengan jurnal yang ter-posted.
    // ============================================================================

    return { success: true, journalId };
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
 * LAKU KANTOR (isOfficeSale = true):
 * Barang langsung diambil → Persediaan langsung berkurang
 * Dr. Kas/Piutang             xxx
 * Dr. HPP                     xxx
 *   Cr. Pendapatan Penjualan       xxx
 *   Cr. Hutang Pajak               xxx (PPN jika ada)
 *   Cr. Persediaan Barang Dagang   xxx
 *
 * NON-OFFICE SALE (isOfficeSale = false):
 * Barang perlu diantar → Hutang Barang Dagang (kewajiban kirim barang)
 * Dr. Kas/Piutang             xxx
 * Dr. HPP                     xxx
 *   Cr. Pendapatan Penjualan       xxx
 *   Cr. Hutang Pajak               xxx (PPN jika ada)
 *   Cr. Hutang Barang Dagang       xxx (kewajiban kirim barang)
 *
 * Saat Pengantaran: use createDeliveryJournal()
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
  // Optional: PPN (Sales Tax) data
  ppnEnabled?: boolean;
  ppnAmount?: number;
  subtotal?: number; // Amount before PPN
  // Office Sale flag - determines if stock reduces immediately or on delivery
  isOfficeSale?: boolean;
}): Promise<{ success: boolean; journalId?: string; error?: string }> {
  const { transactionId, transactionNumber, transactionDate, totalAmount, paymentMethod, customerName, branchId, hppAmount, ppnEnabled, ppnAmount, subtotal, isOfficeSale } = params;

  // Find accounts - using actual database codes (1120, 1210, etc.)
  console.log('[JournalService] createSalesJournal - Finding accounts for branchId:', branchId);

  const kasAccount = await getAccountByCode('1120', branchId) || await findAccountByPattern('kas', 'Aset', branchId);
  const piutangAccount = await getAccountByCode('1210', branchId) || await findAccountByPattern('piutang', 'Aset', branchId);
  const pendapatanAccount = await getAccountByCode('4100', branchId) || await findAccountByPattern('penjualan', 'Pendapatan', branchId);

  console.log('[JournalService] Found accounts:', {
    kas: kasAccount ? `${kasAccount.code} - ${kasAccount.name}` : 'NOT FOUND',
    piutang: piutangAccount ? `${piutangAccount.code} - ${piutangAccount.name}` : 'NOT FOUND',
    pendapatan: pendapatanAccount ? `${pendapatanAccount.code} - ${pendapatanAccount.name}` : 'NOT FOUND',
  });

  // HPP & Persediaan accounts (optional, for COGS recording)
  // Saat penjualan, yang berkurang adalah Persediaan Barang Dagang (1310), bukan Bahan Baku (1320)
  const hppAccount = await getAccountByCode('5100', branchId) || await findAccountByPattern('hpp', 'Beban', branchId);
  const persediaanAccount = await getAccountByCode('1310', branchId)
    || await findAccountByPattern('barang dagang', 'Aset', branchId)
    || await findAccountByPattern('persediaan', 'Aset', branchId);

  // Hutang Barang Dagang (2140) - untuk non-office sale (kewajiban kirim barang)
  const hutangBarangDagangAccount = await getAccountByCode('2140', branchId)
    || await findAccountByPattern('hutang barang dagang', 'Kewajiban', branchId);

  // PPN (Sales Tax) account - Hutang Pajak (2130)
  let hutangPajakAccount: { id: string; code: string; name: string } | null = null;
  if (ppnEnabled && ppnAmount && ppnAmount > 0) {
    hutangPajakAccount = await getAccountByCode('2130', branchId)
      || await findAccountByPattern('hutang pajak', 'Kewajiban', branchId)
      || await findAccountByPattern('ppn', 'Kewajiban', branchId)
      || await findAccountByPattern('pajak', 'Kewajiban', branchId);

    if (!hutangPajakAccount) {
      console.warn('Akun Hutang Pajak (2130) tidak ditemukan. PPN tidak akan dicatat di jurnal.');
    }
  }

  if (!pendapatanAccount) {
    return { success: false, error: 'Akun Pendapatan tidak ditemukan' };
  }

  const debitAccount = paymentMethod === 'credit' ? piutangAccount : kasAccount;
  if (!debitAccount) {
    return { success: false, error: paymentMethod === 'credit' ? 'Akun Piutang tidak ditemukan' : 'Akun Kas tidak ditemukan' };
  }

  const description = `Penjualan ${paymentMethod === 'credit' ? 'Kredit' : 'Tunai'} - ${transactionNumber || 'N/A'}${customerName ? ` - ${customerName}` : ''}${ppnEnabled ? ' (+ PPN)' : ''}`;

  // Determine revenue amount (excluding PPN if applicable)
  // If PPN enabled and we have subtotal, use subtotal as revenue
  // Otherwise use totalAmount as revenue (backward compatible)
  const revenueAmount = (ppnEnabled && ppnAmount && ppnAmount > 0 && subtotal)
    ? subtotal
    : totalAmount;

  // Build journal lines
  const lines: JournalLineInput[] = [
    // Dr. Kas/Piutang (total amount including PPN)
    {
      accountId: debitAccount.id,
      accountCode: debitAccount.code,
      accountName: debitAccount.name,
      debitAmount: totalAmount,
      creditAmount: 0,
      description: paymentMethod === 'credit' ? 'Piutang penjualan' : 'Penerimaan kas',
    },
    // Cr. Pendapatan Penjualan (revenue only, excluding PPN)
    {
      accountId: pendapatanAccount.id,
      accountCode: pendapatanAccount.code,
      accountName: pendapatanAccount.name,
      debitAmount: 0,
      creditAmount: revenueAmount,
      description: 'Pendapatan penjualan',
    },
  ];

  // Add PPN liability if applicable
  if (ppnEnabled && ppnAmount && ppnAmount > 0 && hutangPajakAccount) {
    lines.push({
      accountId: hutangPajakAccount.id,
      accountCode: hutangPajakAccount.code,
      accountName: hutangPajakAccount.name,
      debitAmount: 0,
      creditAmount: ppnAmount,
      description: `PPN Keluaran ${ppnAmount.toLocaleString('id-ID')}`,
    });
  }

  // Add HPP entries if HPP data is provided
  if (hppAmount && hppAmount > 0 && hppAccount) {
    // Dr. HPP (Cost of Goods Sold)
    lines.push({
      accountId: hppAccount.id,
      accountCode: hppAccount.code,
      accountName: hppAccount.name,
      debitAmount: hppAmount,
      creditAmount: 0,
      description: 'Harga Pokok Penjualan',
    });

    // Credit account depends on isOfficeSale flag
    if (isOfficeSale && persediaanAccount) {
      // LAKU KANTOR: Barang langsung diambil → Cr. Persediaan Barang Dagang
      lines.push({
        accountId: persediaanAccount.id,
        accountCode: persediaanAccount.code,
        accountName: persediaanAccount.name,
        debitAmount: 0,
        creditAmount: hppAmount,
        description: 'Pengurangan persediaan (laku kantor)',
      });
    } else if (!isOfficeSale && hutangBarangDagangAccount) {
      // NON-OFFICE SALE: Barang perlu diantar → Cr. Hutang Barang Dagang
      // Kewajiban menyerahkan barang ke pelanggan
      lines.push({
        accountId: hutangBarangDagangAccount.id,
        accountCode: hutangBarangDagangAccount.code,
        accountName: hutangBarangDagangAccount.name,
        debitAmount: 0,
        creditAmount: hppAmount,
        description: 'Hutang barang dagang (kewajiban kirim)',
      });
    } else if (persediaanAccount) {
      // Fallback: use Persediaan if Hutang Barang Dagang not found
      lines.push({
        accountId: persediaanAccount.id,
        accountCode: persediaanAccount.code,
        accountName: persediaanAccount.name,
        debitAmount: 0,
        creditAmount: hppAmount,
        description: 'Pengurangan persediaan',
      });
    }
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
  const kasAccount = await getAccountByCode('1120', branchId) || await findAccountByPattern('kas', 'Aset', branchId);

  let bebanAccount: { id: string; code: string; name: string } | null = null;

  if (accountId) {
    // Use specific account if provided
    // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
    const { data: dataRaw } = await supabase
      .from('accounts')
      .select('id, code, name')
      .eq('id', accountId)
      .order('id').limit(1);
    const data = Array.isArray(dataRaw) ? dataRaw[0] : dataRaw;
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
    bebanAccount = await getAccountByCode('5100', branchId) || await findAccountByPattern('beban', 'Beban', branchId);
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
  const kasAccount = await getAccountByCode('1120', branchId) || await findAccountByPattern('kas', 'Aset', branchId);
  const panjarAccount = await getAccountByCode('1220', branchId) || await findAccountByPattern('panjar', 'Aset', branchId);

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
 *   Cr. Kas/Bank                xxx (akun yang dipilih user)
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
  paymentAccountId?: string;
  paymentAccountName?: string;
  paymentAccountCode?: string;
}): Promise<{ success: boolean; journalId?: string; error?: string }> {
  const { payrollId, payrollDate, employeeName, grossSalary, advanceDeduction, netSalary, branchId, paymentAccountId, paymentAccountName, paymentAccountCode } = params;

  // Find accounts
  const gajiAccount = await getAccountByCode('6100', branchId) || await findAccountByPattern('gaji', 'Beban', branchId);
  const panjarAccount = await getAccountByCode('1220', branchId) || await findAccountByPattern('panjar', 'Aset', branchId);

  // Use provided payment account or fallback to default Kas account
  let kasAccount: { id: string; code: string; name: string } | null = null;
  if (paymentAccountId) {
    kasAccount = { id: paymentAccountId, code: paymentAccountCode || '', name: paymentAccountName || 'Kas/Bank' };
  } else {
    kasAccount = await getAccountByCode('1120', branchId) || await findAccountByPattern('kas', 'Aset', branchId);
  }

  if (!kasAccount) {
    return { success: false, error: 'Akun Pembayaran tidak ditemukan' };
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
      description: `Pembayaran gaji bersih via ${kasAccount.name}`,
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
  paymentAccountId?: string; // Optional: specific payment account selected by user
}): Promise<{ success: boolean; journalId?: string; error?: string }> {
  const { receivableId, paymentDate, amount, customerName, invoiceNumber, branchId, paymentAccountId } = params;

  // Find payment account (Kas/Bank) - use provided ID or fallback to default
  let kasAccount: { id: string; code: string; name: string } | null = null;
  if (paymentAccountId) {
    // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
    const { data: paymentAccRaw } = await supabase
      .from('accounts')
      .select('id, code, name')
      .eq('id', paymentAccountId)
      .order('id').limit(1);
    const paymentAcc = Array.isArray(paymentAccRaw) ? paymentAccRaw[0] : paymentAccRaw;
    if (paymentAcc) {
      kasAccount = paymentAcc;
    }
  }
  if (!kasAccount) {
    kasAccount = await getAccountByCode('1120', branchId) || await findAccountByPattern('kas', 'Aset', branchId);
  }

  // Find piutang account
  const piutangAccount = await getAccountByCode('1210', branchId) || await findAccountByPattern('piutang', 'Aset', branchId);

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
  paymentAccountId?: string;
  liabilityAccountId?: string;
}): Promise<{ success: boolean; journalId?: string; error?: string }> {
  const { payableId, paymentDate, amount, supplierName, invoiceNumber, branchId, paymentAccountId, liabilityAccountId } = params;

  // Find payment account (Kas/Bank) - use provided ID or fallback to default
  let kasAccount: { id: string; code: string; name: string } | null = null;
  if (paymentAccountId) {
    // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
    const { data: paymentAccRaw } = await supabase
      .from('accounts')
      .select('id, code, name')
      .eq('id', paymentAccountId)
      .order('id').limit(1);
    const paymentAcc = Array.isArray(paymentAccRaw) ? paymentAccRaw[0] : paymentAccRaw;
    if (paymentAcc) {
      kasAccount = paymentAcc;
    }
  }
  if (!kasAccount) {
    kasAccount = await getAccountByCode('1120', branchId) || await findAccountByPattern('kas', 'Aset', branchId);
  }

  // Find liability account (Hutang Usaha) - use provided ID or fallback to default
  let hutangAccount: { id: string; code: string; name: string } | null = null;
  if (liabilityAccountId) {
    // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
    const { data: liabilityAccRaw } = await supabase
      .from('accounts')
      .select('id, code, name')
      .eq('id', liabilityAccountId)
      .order('id').limit(1);
    const liabilityAcc = Array.isArray(liabilityAccRaw) ? liabilityAccRaw[0] : liabilityAccRaw;
    if (liabilityAcc) {
      hutangAccount = liabilityAcc;
    }
  }
  if (!hutangAccount) {
    hutangAccount = await getAccountByCode('2110', branchId) || await findAccountByPattern('hutang', 'Kewajiban', branchId);
  }

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
    // Guard: pastikan journalId tidak undefined
    if (!journalId) {
      console.error('[JournalService] voidJournalEntry called with undefined journalId');
      return { success: false, error: 'Journal entry ID is required' };
    }

    // Get current user from PostgREST auth
    const { data: { user } } = await postgrestAuth.getUser();
    if (!user) {
      return { success: false, error: 'User tidak terautentikasi' };
    }

    // Get journal entry
    // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
    const { data: journalRaw, error: fetchError } = await supabase
      .from('journal_entries')
      .select('id, status, is_voided')
      .eq('id', journalId)
      .order('id').limit(1);

    const journal = Array.isArray(journalRaw) ? journalRaw[0] : journalRaw;
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
  const pendapatanLainAccount = await getAccountByCode('4200', branchId) || await findAccountByPattern('lain', 'Pendapatan', branchId);

  if (!pendapatanLainAccount) {
    return { success: false, error: 'Akun Pendapatan Lain-lain tidak ditemukan. Buat akun dengan kode 4200 atau tipe Pendapatan' };
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
  const bebanLainAccount = await getAccountByCode('6700', branchId) || await findAccountByPattern('lain', 'Beban', branchId);

  if (!bebanLainAccount) {
    return { success: false, error: 'Akun Beban Lain-lain tidak ditemukan. Buat akun dengan kode 6700 atau tipe Beban' };
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
    creditAccount = await getAccountByCode('2110', branchId) || await findAccountByPattern('hutang', 'Kewajiban', branchId);
    if (!creditAccount) {
      return { success: false, error: 'Akun Hutang tidak ditemukan' };
    }
  } else {
    creditAccount = await getAccountByCode('1120', branchId) || await findAccountByPattern('kas', 'Aset', branchId);
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

  // Find depreciation expense account (6500 or type Beban with "penyusutan")
  const bebanPenyusutanAccount = await getAccountByCode('6500', branchId) || await findAccountByPattern('penyusutan', 'Beban', branchId);
  if (!bebanPenyusutanAccount) {
    return { success: false, error: 'Akun Beban Penyusutan tidak ditemukan. Buat akun dengan kode 6500 atau tipe Beban' };
  }

  // Find accumulated depreciation account (1430)
  const akumulasiAccount = await getAccountByCode('1430', branchId) || await findAccountByPattern('akumulasi', 'Aset', branchId);
  if (!akumulasiAccount) {
    return { success: false, error: 'Akun Akumulasi Penyusutan tidak ditemukan. Buat akun dengan kode 1430' };
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

/**
 * Generate journal for Material Purchase (PO Approved)
 *
 * Pembelian Bahan Baku (saat PO diapprove):
 *
 * Tanpa PPN:
 * Dr. Persediaan Bahan Baku (1320)  xxx
 *   Cr. Hutang Usaha (2110)              xxx
 *
 * Dengan PPN (PPN Masukan = Piutang Pajak):
 * Dr. Persediaan Bahan Baku (1320)     xxx (subtotal)
 * Dr. PPN Masukan / Piutang Pajak (1230)  xxx (ppnAmount)
 *   Cr. Hutang Usaha (2110)                    xxx (total)
 */
export async function createMaterialPurchaseJournal(params: {
  poId: string;
  poRef: string;
  approvalDate: Date;
  amount: number; // Total amount (subtotal + PPN jika exclude, atau total jika include)
  subtotal?: number; // Subtotal sebelum PPN
  ppnAmount?: number; // Nilai PPN
  materialDetails: string;
  supplierName: string;
  branchId: string;
}): Promise<{ success: boolean; journalId?: string; error?: string }> {
  const { poId, poRef, approvalDate, amount, subtotal, ppnAmount, materialDetails, supplierName, branchId } = params;

  // Calculate actual values
  const hasPpn = ppnAmount && ppnAmount > 0;
  const actualSubtotal = subtotal || (hasPpn ? amount - ppnAmount : amount);
  const totalHutang = amount; // Total yang akan jadi hutang

  // Find Persediaan Bahan Baku account (1320)
  const persediaanAccount = await getAccountByCode('1320', branchId)
    || await getAccountByCode('1310', branchId)
    || await getAccountByCode('1300', branchId)
    || await findAccountByPattern('persediaan', 'Aset', branchId);

  if (!persediaanAccount) {
    return { success: false, error: 'Akun Persediaan Bahan Baku tidak ditemukan. Buat akun dengan kode 1320 atau 1310' };
  }

  // Find Hutang Usaha account (2110)
  const hutangAccount = await getAccountByCode('2110', branchId)
    || await findAccountByPattern('hutang usaha', 'Kewajiban', branchId)
    || await findAccountByPattern('hutang', 'Kewajiban', branchId);

  if (!hutangAccount) {
    return { success: false, error: 'Akun Hutang Usaha tidak ditemukan. Buat akun dengan kode 2110' };
  }

  // Build journal lines
  const lines: JournalLineInput[] = [
    {
      accountId: persediaanAccount.id,
      accountCode: persediaanAccount.code,
      accountName: persediaanAccount.name,
      debitAmount: actualSubtotal,
      creditAmount: 0,
      description: `Persediaan: ${materialDetails}`,
    },
  ];

  // Add PPN Masukan (Piutang Pajak) if applicable
  if (hasPpn) {
    // Find PPN Masukan / Piutang Pajak account (1230)
    const ppnMasukanAccount = await getAccountByCode('1230', branchId)
      || await findAccountByPattern('ppn masukan', 'Aset', branchId)
      || await findAccountByPattern('piutang pajak', 'Aset', branchId);

    if (ppnMasukanAccount) {
      lines.push({
        accountId: ppnMasukanAccount.id,
        accountCode: ppnMasukanAccount.code,
        accountName: ppnMasukanAccount.name,
        debitAmount: ppnAmount,
        creditAmount: 0,
        description: `PPN Masukan PO ${poRef}`,
      });
    } else {
      console.warn('Akun PPN Masukan (1230) tidak ditemukan, PPN tidak dicatat sebagai piutang pajak');
      // Fallback: include PPN in persediaan
      lines[0].debitAmount = totalHutang;
    }
  }

  // Add Hutang Usaha (credit)
  lines.push({
    accountId: hutangAccount.id,
    accountCode: hutangAccount.code,
    accountName: hutangAccount.name,
    debitAmount: 0,
    creditAmount: totalHutang,
    description: `Hutang ke ${supplierName}`,
  });

  // Note: Using 'adjustment' as referenceType because 'purchase' is not in DB constraint
  // Valid types: transaction, expense, payroll, transfer, manual, adjustment, closing, opening, receivable_payment, advance, payable_payment
  return createJournalEntry({
    entryDate: approvalDate,
    description: `Pembelian Bahan Baku - PO ${poRef}: ${materialDetails} dari ${supplierName}${hasPpn ? ' (incl. PPN)' : ''}`,
    referenceType: 'adjustment',
    referenceId: poId,
    branchId,
    autoPost: true,
    lines,
  });
}

/**
 * Generate journal for Product Purchase (PO Approved - Product Items)
 *
 * Pembelian Produk Jadi (saat PO diapprove):
 *
 * Tanpa PPN:
 * Dr. Persediaan Barang Dagang (1310)  xxx
 *   Cr. Hutang Usaha (2110)                 xxx
 *
 * Dengan PPN (PPN Masukan = Piutang Pajak):
 * Dr. Persediaan Barang Dagang (1310)     xxx (subtotal)
 * Dr. PPN Masukan / Piutang Pajak (1230)  xxx (ppnAmount)
 *   Cr. Hutang Usaha (2110)                    xxx (total)
 */
export async function createProductPurchaseJournal(params: {
  poId: string;
  poRef: string;
  approvalDate: Date;
  amount: number; // Total amount
  subtotal?: number; // Subtotal sebelum PPN
  ppnAmount?: number; // Nilai PPN
  productDetails: string;
  supplierName: string;
  branchId: string;
}): Promise<{ success: boolean; journalId?: string; error?: string }> {
  const { poId, poRef, approvalDate, amount, subtotal, ppnAmount, productDetails, supplierName, branchId } = params;

  // Calculate actual values
  const hasPpn = ppnAmount && ppnAmount > 0;
  const actualSubtotal = subtotal || (hasPpn ? amount - ppnAmount : amount);
  const totalHutang = amount;

  // Find Persediaan Barang Dagang account (1310) - untuk produk jadi
  const persediaanProdukAccount = await getAccountByCode('1310', branchId)
    || await findAccountByPattern('barang dagang', 'Aset', branchId)
    || await findAccountByPattern('persediaan produk', 'Aset', branchId);

  if (!persediaanProdukAccount) {
    return { success: false, error: 'Akun Persediaan Barang Dagang tidak ditemukan. Buat akun dengan kode 1310' };
  }

  // Find Hutang Usaha account (2110)
  const hutangAccount = await getAccountByCode('2110', branchId)
    || await findAccountByPattern('hutang usaha', 'Kewajiban', branchId)
    || await findAccountByPattern('hutang', 'Kewajiban', branchId);

  if (!hutangAccount) {
    return { success: false, error: 'Akun Hutang Usaha tidak ditemukan. Buat akun dengan kode 2110' };
  }

  // Build journal lines
  const lines: JournalLineInput[] = [
    {
      accountId: persediaanProdukAccount.id,
      accountCode: persediaanProdukAccount.code,
      accountName: persediaanProdukAccount.name,
      debitAmount: actualSubtotal,
      creditAmount: 0,
      description: `Persediaan: ${productDetails}`,
    },
  ];

  // Add PPN Masukan (Piutang Pajak) if applicable
  if (hasPpn) {
    const ppnMasukanAccount = await getAccountByCode('1230', branchId)
      || await findAccountByPattern('ppn masukan', 'Aset', branchId)
      || await findAccountByPattern('piutang pajak', 'Aset', branchId);

    if (ppnMasukanAccount) {
      lines.push({
        accountId: ppnMasukanAccount.id,
        accountCode: ppnMasukanAccount.code,
        accountName: ppnMasukanAccount.name,
        debitAmount: ppnAmount,
        creditAmount: 0,
        description: `PPN Masukan PO ${poRef}`,
      });
    } else {
      console.warn('Akun PPN Masukan (1230) tidak ditemukan, PPN tidak dicatat sebagai piutang pajak');
      lines[0].debitAmount = totalHutang;
    }
  }

  // Add Hutang Usaha (credit)
  lines.push({
    accountId: hutangAccount.id,
    accountCode: hutangAccount.code,
    accountName: hutangAccount.name,
    debitAmount: 0,
    creditAmount: totalHutang,
    description: `Hutang ke ${supplierName}`,
  });

  return createJournalEntry({
    entryDate: approvalDate,
    description: `Pembelian Produk Jadi - PO ${poRef}: ${productDetails} dari ${supplierName}${hasPpn ? ' (incl. PPN)' : ''}`,
    referenceType: 'adjustment',
    referenceId: poId,
    branchId,
    autoPost: true,
    lines,
  });
}

/**
 * Generate journal for Production Output (Hasil Produksi)
 *
 * Hasil Produksi masuk ke Persediaan Barang Dagang:
 * Dr. Persediaan Barang Dagang (1310)  xxx (HPP bahan yang dipakai)
 *   Cr. Persediaan Bahan Baku (1320)        xxx
 *
 * Note: Ini MENGGANTIKAN createProductionHPPJournal yang sebelumnya
 * Dr. HPP ke Cr. Persediaan Bahan Baku
 *
 * Flow yang benar:
 * 1. Bahan baku keluar dari 1320 (credit)
 * 2. Barang jadi masuk ke 1310 (debit)
 * HPP baru dicatat saat barang DIJUAL, bukan saat produksi
 */
export async function createProductionOutputJournal(params: {
  productionId: string;
  productionRef: string;
  productionDate: Date;
  amount: number;
  productName: string;
  materialDetails: string;
  branchId: string;
}): Promise<{ success: boolean; journalId?: string; error?: string }> {
  const { productionId, productionRef, productionDate, amount, productName, materialDetails, branchId } = params;

  // Find Persediaan Barang Dagang account (1310) - untuk produk jadi
  const persediaanProdukAccount = await getAccountByCode('1310', branchId)
    || await findAccountByPattern('barang dagang', 'Aset', branchId)
    || await findAccountByPattern('persediaan produk', 'Aset', branchId);

  if (!persediaanProdukAccount) {
    return { success: false, error: 'Akun Persediaan Barang Dagang tidak ditemukan. Buat akun dengan kode 1310' };
  }

  // Find Persediaan Bahan Baku account (1320)
  const persediaanBahanAccount = await getAccountByCode('1320', branchId)
    || await getAccountByCode('1300', branchId)
    || await findAccountByPattern('bahan baku', 'Aset', branchId);

  if (!persediaanBahanAccount) {
    return { success: false, error: 'Akun Persediaan Bahan Baku tidak ditemukan. Buat akun dengan kode 1320' };
  }

  return createJournalEntry({
    entryDate: productionDate,
    description: `Produksi ${productionRef}: ${materialDetails} -> ${productName}`,
    referenceType: 'adjustment',
    referenceId: productionId,
    branchId,
    autoPost: true,
    lines: [
      {
        accountId: persediaanProdukAccount.id,
        accountCode: persediaanProdukAccount.code,
        accountName: persediaanProdukAccount.name,
        debitAmount: amount,
        creditAmount: 0,
        description: `Hasil Produksi: ${productName}`,
      },
      {
        accountId: persediaanBahanAccount.id,
        accountCode: persediaanBahanAccount.code,
        accountName: persediaanBahanAccount.name,
        debitAmount: 0,
        creditAmount: amount,
        description: `Bahan: ${materialDetails}`,
      },
    ],
  });
}

/**
 * Generate journal for Manual Debt Entry (Hutang Manual)
 *
 * Saat menambahkan hutang:
 * Dr. Kas/Bank (Aset bertambah)       xxx
 *   Cr. Hutang (Kewajiban bertambah)       xxx
 *
 * Untuk hutang bank: Cr. Hutang Bank (2200)
 * Untuk hutang supplier: Cr. Hutang Usaha (2110)
 * Untuk hutang lainnya: Cr. Hutang Lain-lain (2900)
 */
export async function createDebtJournal(params: {
  debtId: string;
  debtDate: Date;
  amount: number;
  creditorName: string;
  creditorType: 'supplier' | 'bank' | 'credit_card' | 'other';
  description: string;
  branchId: string;
  cashAccountId?: string; // Optional: specific cash/bank account for receiving funds
}): Promise<{ success: boolean; journalId?: string; error?: string }> {
  const { debtId, debtDate, amount, creditorName, creditorType, description, branchId, cashAccountId } = params;

  // Find cash/bank account for receiving funds
  let kasAccount: { id: string; code: string; name: string } | null = null;
  if (cashAccountId) {
    // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
    const { data: cashAccRaw } = await supabase
      .from('accounts')
      .select('id, code, name')
      .eq('id', cashAccountId)
      .order('id').limit(1);
    const cashAcc = Array.isArray(cashAccRaw) ? cashAccRaw[0] : cashAccRaw;
    if (cashAcc) {
      kasAccount = cashAcc;
    }
  }
  if (!kasAccount) {
    kasAccount = await getAccountByCode('1120', branchId) || await findAccountByPattern('kas', 'Aset', branchId);
  }

  if (!kasAccount) {
    return { success: false, error: 'Akun Kas tidak ditemukan' };
  }

  // Find appropriate liability account based on creditor type
  let hutangAccount: { id: string; code: string; name: string } | null = null;

  switch (creditorType) {
    case 'bank':
      // Hutang Bank - code 2210 (detail), 2200 is usually header
      hutangAccount = await getAccountByCode('2210', branchId)
        || await getAccountByCode('2200', branchId)
        || await findAccountByPattern('hutang bank', 'Kewajiban', branchId)
        || await findAccountByPattern('pinjaman bank', 'Kewajiban', branchId);
      break;
    case 'credit_card':
      // Hutang Kartu Kredit - typically code 2150
      hutangAccount = await getAccountByCode('2150', branchId)
        || await findAccountByPattern('kartu kredit', 'Kewajiban', branchId);
      break;
    case 'supplier':
      // Hutang Usaha - typically code 2110
      hutangAccount = await getAccountByCode('2110', branchId)
        || await findAccountByPattern('hutang usaha', 'Kewajiban', branchId);
      break;
    case 'other':
    default:
      // Hutang Lain-lain - typically code 2900
      hutangAccount = await getAccountByCode('2900', branchId)
        || await findAccountByPattern('hutang lain', 'Kewajiban', branchId);
      break;
  }

  // Fallback to general hutang account if specific not found
  if (!hutangAccount) {
    hutangAccount = await getAccountByCode('2110', branchId)
      || await findAccountByPattern('hutang', 'Kewajiban', branchId);
  }

  if (!hutangAccount) {
    return { success: false, error: 'Akun Kewajiban/Hutang tidak ditemukan. Pastikan ada akun dengan kode 2xxx dan tipe Kewajiban.' };
  }

  const creditorTypeLabel = {
    bank: 'Bank',
    credit_card: 'Kartu Kredit',
    supplier: 'Supplier',
    other: 'Lainnya'
  }[creditorType];

  return createJournalEntry({
    entryDate: debtDate,
    description: `Penambahan Hutang ${creditorTypeLabel} - ${creditorName}: ${description}`,
    referenceType: 'payable',
    referenceId: debtId,
    branchId,
    autoPost: true,
    lines: [
      {
        accountId: kasAccount.id,
        accountCode: kasAccount.code,
        accountName: kasAccount.name,
        debitAmount: amount,
        creditAmount: 0,
        description: `Penerimaan dana dari ${creditorName}`,
      },
      {
        accountId: hutangAccount.id,
        accountCode: hutangAccount.code,
        accountName: hutangAccount.name,
        debitAmount: 0,
        creditAmount: amount,
        description: `Hutang kepada ${creditorName}`,
      },
    ],
  });
}

/**
 * Generate journal for Delivery (Pengantaran Barang)
 *
 * Saat barang diantar ke pelanggan:
 * Dr. Hutang Barang Dagang (2140)     xxx (kewajiban kirim terpenuhi)
 *   Cr. Persediaan Barang Dagang (1310)    xxx (stok berkurang)
 *
 * Jurnal ini dipanggil saat delivery dibuat untuk transaksi non-office sale.
 * Untuk office sale (laku kantor), persediaan sudah berkurang saat transaksi.
 *
 * Edge Cases:
 * - Immediate delivery: Tetap buat jurnal ini, audit trail tetap jelas
 * - POS Supir: Seharusnya isOfficeSale=true, jadi tidak perlu jurnal ini
 */
export async function createDeliveryJournal(params: {
  deliveryId: string;
  deliveryDate: Date;
  transactionId: string;
  transactionNumber: string;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    hppPerUnit: number; // HPP per unit dari transaksi
  }>;
  branchId: string;
}): Promise<{ success: boolean; journalId?: string; error?: string }> {
  const { deliveryId, deliveryDate, transactionId, transactionNumber, items, branchId } = params;

  // Calculate total HPP for delivered items
  const totalHPP = items.reduce((sum, item) => sum + (item.quantity * item.hppPerUnit), 0);

  if (totalHPP <= 0) {
    console.log('[JournalService] createDeliveryJournal - No HPP to record, skipping journal');
    return { success: true }; // No journal needed if no HPP
  }

  // Find Hutang Barang Dagang account (2140)
  const hutangBarangDagangAccount = await getAccountByCode('2140', branchId)
    || await findAccountByPattern('hutang barang dagang', 'Kewajiban', branchId);

  if (!hutangBarangDagangAccount) {
    console.warn('[JournalService] Akun Hutang Barang Dagang (2140) tidak ditemukan');
    return { success: false, error: 'Akun Hutang Barang Dagang (2140) tidak ditemukan' };
  }

  // Find Persediaan Barang Dagang account (1310)
  const persediaanAccount = await getAccountByCode('1310', branchId)
    || await findAccountByPattern('barang dagang', 'Aset', branchId)
    || await findAccountByPattern('persediaan', 'Aset', branchId);

  if (!persediaanAccount) {
    return { success: false, error: 'Akun Persediaan Barang Dagang (1310) tidak ditemukan' };
  }

  // Build item description
  const itemDescriptions = items.map(item => `${item.productName} x${item.quantity}`).join(', ');
  const description = `Pengantaran ${transactionNumber}: ${itemDescriptions}`;

  console.log('[JournalService] createDeliveryJournal:', {
    deliveryId,
    transactionNumber,
    totalHPP,
    itemCount: items.length
  });

  return createJournalEntry({
    entryDate: deliveryDate,
    description,
    referenceType: 'adjustment', // Use adjustment as delivery is an adjustment to inventory
    referenceId: deliveryId,
    branchId,
    autoPost: true,
    lines: [
      {
        accountId: hutangBarangDagangAccount.id,
        accountCode: hutangBarangDagangAccount.code,
        accountName: hutangBarangDagangAccount.name,
        debitAmount: totalHPP,
        creditAmount: 0,
        description: 'Kewajiban kirim barang terpenuhi',
      },
      {
        accountId: persediaanAccount.id,
        accountCode: persediaanAccount.code,
        accountName: persediaanAccount.name,
        debitAmount: 0,
        creditAmount: totalHPP,
        description: 'Pengurangan persediaan barang diantar',
      },
    ],
  });
}

/**
 * Generate journal for Material Spoilage/Waste (Bahan Rusak)
 *
 * Bahan Rusak saat Produksi:
 * Dr. Beban Bahan Rusak (5300)     xxx
 *   Cr. Persediaan Bahan Baku (1320)    xxx
 */
export async function createSpoilageJournal(params: {
  errorId: string;
  errorRef: string;
  errorDate: Date;
  amount: number;
  materialName: string;
  quantity: number;
  unit: string;
  notes?: string;
  branchId: string;
}): Promise<{ success: boolean; journalId?: string; error?: string }> {
  const { errorId, errorRef, errorDate, amount, materialName, quantity, unit, notes, branchId } = params;

  // Find Beban Bahan Rusak account (5300) or fallback to similar expense accounts
  const spoilageAccount = await getAccountByCode('5300', branchId)
    || await findAccountByPattern('rusak', 'Beban', branchId)
    || await findAccountByPattern('spoil', 'Beban', branchId)
    || await findAccountByPattern('waste', 'Beban', branchId)
    || await getAccountByCode('5200', branchId) // Fallback to Biaya Bahan Baku
    || await getAccountByCode('5100', branchId); // Fallback to HPP

  if (!spoilageAccount) {
    return { success: false, error: 'Akun Beban Bahan Rusak tidak ditemukan. Buat akun dengan kode 5300 atau tipe Beban' };
  }

  // Find Persediaan Bahan Baku account (1320)
  const persediaanAccount = await getAccountByCode('1320', branchId)
    || await getAccountByCode('1310', branchId)
    || await getAccountByCode('1300', branchId)
    || await findAccountByPattern('persediaan', 'Aset', branchId);

  if (!persediaanAccount) {
    return { success: false, error: 'Akun Persediaan Bahan Baku tidak ditemukan. Buat akun dengan kode 1320' };
  }

  const description = `Bahan Rusak - ${errorRef}: ${materialName} ${quantity} ${unit}${notes ? ` - ${notes}` : ''}`;

  return createJournalEntry({
    entryDate: errorDate,
    description,
    referenceType: 'adjustment',
    referenceId: errorId,
    branchId,
    autoPost: true,
    lines: [
      {
        accountId: spoilageAccount.id,
        accountCode: spoilageAccount.code,
        accountName: spoilageAccount.name,
        debitAmount: amount,
        creditAmount: 0,
        description: `Beban bahan rusak: ${materialName}`,
      },
      {
        accountId: persediaanAccount.id,
        accountCode: persediaanAccount.code,
        accountName: persediaanAccount.name,
        debitAmount: 0,
        creditAmount: amount,
        description: 'Pengurangan persediaan bahan rusak',
      },
    ],
  });
}
