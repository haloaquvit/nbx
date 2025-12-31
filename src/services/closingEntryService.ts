import { supabase } from '@/integrations/supabase/client';

/**
 * Service untuk Tutup Buku Tahunan (Closing Entry)
 *
 * Proses tutup buku tahunan di Indonesia:
 * 1. Tutup semua akun Pendapatan ke Ikhtisar Laba Rugi
 * 2. Tutup semua akun Beban ke Ikhtisar Laba Rugi
 * 3. Tutup Ikhtisar Laba Rugi ke Laba Ditahan
 *
 * Setelah tutup buku:
 * - Semua akun Pendapatan dan Beban saldo menjadi 0
 * - Laba/Rugi tahun berjalan masuk ke Laba Ditahan
 * - Periode baru dimulai dengan clean slate untuk Pendapatan/Beban
 */

export interface ClosingPeriod {
  id: string;
  year: number;
  closedAt: Date;
  closedBy: string;
  journalEntryId: string;
  netIncome: number;
  branchId: string;
  createdAt: Date;
}

export interface ClosingPreview {
  year: number;
  totalPendapatan: number;
  totalBeban: number;
  labaRugiBersih: number;
  pendapatanAccounts: { id: string; code: string; name: string; balance: number }[];
  bebanAccounts: { id: string; code: string; name: string; balance: number }[];
  labaDitahanAccount: { id: string; code: string; name: string; balance: number } | null;
  ikhtisarLabaRugiAccount: { id: string; code: string; name: string } | null;
}

// Kode akun standar Indonesia
const IKHTISAR_LABA_RUGI_CODE = '3300';
const LABA_DITAHAN_CODE = '3200';

/**
 * Get atau create akun Ikhtisar Laba Rugi (3300)
 */
async function getOrCreateIkhtisarLabaRugi(branchId: string) {
  // Cari akun existing
  const { data: existingList, error: fetchError } = await supabase
    .from('accounts')
    .select('id, code, name, type')
    .eq('branch_id', branchId)
    .eq('code', IKHTISAR_LABA_RUGI_CODE)
    .limit(1);

  if (fetchError) {
    console.error('[ClosingEntry] Error fetching Ikhtisar account:', fetchError);
  }

  if (existingList && existingList.length > 0) {
    return existingList[0];
  }

  // Buat akun baru jika belum ada
  const { data: newAccountList, error } = await supabase
    .from('accounts')
    .insert({
      branch_id: branchId,
      code: IKHTISAR_LABA_RUGI_CODE,
      name: 'Ikhtisar Laba Rugi',
      type: 'Modal',
      is_header: false,
      is_active: true,
      balance: 0,
      initial_balance: 0,
      level: 2,
      sort_order: 300
    })
    .select('id, code, name, type');

  if (error || !newAccountList || newAccountList.length === 0) {
    throw new Error(`Gagal membuat akun Ikhtisar Laba Rugi: ${error?.message}`);
  }
  return newAccountList[0];
}

/**
 * Get akun Laba Ditahan (3200)
 */
async function getLabaDitahanAccount(branchId: string) {
  const { data, error } = await supabase
    .from('accounts')
    .select('id, code, name, type')
    .eq('branch_id', branchId)
    .or(`code.eq.${LABA_DITAHAN_CODE},code.eq.3-200`)
    .limit(1);

  if (error) {
    console.error('[ClosingEntry] Error fetching Laba Ditahan account:', error);
  }

  return data && data.length > 0 ? data[0] : null;
}

/**
 * Cek apakah tahun sudah pernah ditutup
 */
export async function isYearClosed(year: number, branchId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('closing_periods')
    .select('id')
    .eq('year', year)
    .eq('branch_id', branchId)
    .limit(1);

  if (error) {
    console.error('[ClosingEntry] Error checking if year is closed:', error);
    return false;
  }

  return data && data.length > 0;
}

/**
 * Dapatkan daftar tahun yang sudah ditutup
 */
export async function getClosedYears(branchId: string): Promise<ClosingPeriod[]> {
  const { data, error } = await supabase
    .from('closing_periods')
    .select('*')
    .eq('branch_id', branchId)
    .order('year', { ascending: false });

  if (error) {
    console.error('[ClosingEntry] Error fetching closed years:', error);
    return [];
  }

  return (data || []).map(row => ({
    id: row.id,
    year: row.year,
    closedAt: new Date(row.closed_at),
    closedBy: row.closed_by,
    journalEntryId: row.journal_entry_id,
    netIncome: Number(row.net_income) || 0,
    branchId: row.branch_id,
    createdAt: new Date(row.created_at)
  }));
}

/**
 * Preview tutup buku - hitung laba/rugi sebelum eksekusi
 */
export async function previewClosingEntry(year: number, branchId: string): Promise<ClosingPreview> {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  // Get semua akun
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, code, name, type, balance, initial_balance')
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .eq('is_header', false);

  if (!accounts) {
    throw new Error('Gagal mengambil data akun');
  }

  // Get journal entries untuk tahun tersebut
  const { data: journalLines } = await supabase
    .from('journal_entry_lines')
    .select(`
      account_id,
      debit_amount,
      credit_amount,
      journal_entries!inner(
        branch_id,
        entry_date,
        status,
        is_voided
      )
    `)
    .eq('journal_entries.branch_id', branchId)
    .eq('journal_entries.status', 'posted')
    .eq('journal_entries.is_voided', false)
    .gte('journal_entries.entry_date', yearStart)
    .lte('journal_entries.entry_date', yearEnd);

  // Hitung saldo per akun dari jurnal tahun ini
  const balanceByAccount: Record<string, number> = {};
  (journalLines || []).forEach((line: any) => {
    const accountId = line.account_id;
    if (!balanceByAccount[accountId]) {
      balanceByAccount[accountId] = 0;
    }
    balanceByAccount[accountId] += (line.debit_amount || 0) - (line.credit_amount || 0);
  });

  // Filter akun Pendapatan dan Beban
  const pendapatanAccounts = accounts
    .filter(acc => acc.type === 'Pendapatan')
    .map(acc => ({
      id: acc.id,
      code: acc.code || '',
      name: acc.name,
      // Pendapatan: saldo normal kredit, jadi balance negatif = ada pendapatan
      balance: Math.abs(balanceByAccount[acc.id] || 0)
    }))
    .filter(acc => acc.balance !== 0);

  const bebanAccounts = accounts
    .filter(acc => acc.type === 'Beban')
    .map(acc => ({
      id: acc.id,
      code: acc.code || '',
      name: acc.name,
      // Beban: saldo normal debit, jadi balance positif = ada beban
      balance: Math.abs(balanceByAccount[acc.id] || 0)
    }))
    .filter(acc => acc.balance !== 0);

  const totalPendapatan = pendapatanAccounts.reduce((sum, acc) => sum + acc.balance, 0);
  const totalBeban = bebanAccounts.reduce((sum, acc) => sum + acc.balance, 0);
  const labaRugiBersih = totalPendapatan - totalBeban;

  // Get akun Laba Ditahan
  const labaDitahanAcc = accounts.find(acc =>
    acc.code === LABA_DITAHAN_CODE || acc.code === '3-200' ||
    acc.name.toLowerCase().includes('laba ditahan')
  );

  // Get atau info akun Ikhtisar Laba Rugi
  const ikhtisarAcc = accounts.find(acc =>
    acc.code === IKHTISAR_LABA_RUGI_CODE || acc.code === '3-300' ||
    acc.name.toLowerCase().includes('ikhtisar')
  );

  return {
    year,
    totalPendapatan,
    totalBeban,
    labaRugiBersih,
    pendapatanAccounts,
    bebanAccounts,
    labaDitahanAccount: labaDitahanAcc ? {
      id: labaDitahanAcc.id,
      code: labaDitahanAcc.code || '',
      name: labaDitahanAcc.name,
      balance: balanceByAccount[labaDitahanAcc.id] || 0
    } : null,
    ikhtisarLabaRugiAccount: ikhtisarAcc ? {
      id: ikhtisarAcc.id,
      code: ikhtisarAcc.code || '',
      name: ikhtisarAcc.name
    } : null
  };
}

/**
 * Eksekusi tutup buku tahunan
 *
 * Generate 3 jurnal:
 * 1. Tutup Pendapatan ke Ikhtisar Laba Rugi
 * 2. Tutup Beban ke Ikhtisar Laba Rugi
 * 3. Tutup Ikhtisar ke Laba Ditahan
 */
export async function executeClosingEntry(
  year: number,
  branchId: string,
  userId: string
): Promise<{ success: boolean; journalEntryId?: string; error?: string }> {
  try {
    // Validasi: cek apakah tahun sudah ditutup
    const alreadyClosed = await isYearClosed(year, branchId);
    if (alreadyClosed) {
      return { success: false, error: `Tahun ${year} sudah pernah ditutup` };
    }

    // Get preview data
    const preview = await previewClosingEntry(year, branchId);

    if (preview.pendapatanAccounts.length === 0 && preview.bebanAccounts.length === 0) {
      return { success: false, error: 'Tidak ada transaksi Pendapatan atau Beban untuk ditutup' };
    }

    // Get atau create akun yang diperlukan
    const ikhtisarAccount = await getOrCreateIkhtisarLabaRugi(branchId);
    const labaDitahanAccount = await getLabaDitahanAccount(branchId);

    if (!labaDitahanAccount) {
      return { success: false, error: 'Akun Laba Ditahan (3200) tidak ditemukan. Silakan buat akun tersebut terlebih dahulu.' };
    }

    // Generate entry number
    const { data: lastEntryList } = await supabase
      .from('journal_entries')
      .select('entry_number')
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false })
      .limit(1);

    const lastEntry = lastEntryList && lastEntryList.length > 0 ? lastEntryList[0] : null;
    const lastNum = lastEntry?.entry_number ? parseInt(lastEntry.entry_number.replace(/\D/g, '')) : 0;
    const entryNumber = `JC-${year}-${String(lastNum + 1).padStart(4, '0')}`;

    // Create main closing journal entry
    const closingDate = `${year}-12-31`;
    const { data: journalEntryList, error: journalError } = await supabase
      .from('journal_entries')
      .insert({
        branch_id: branchId,
        entry_number: entryNumber,
        entry_date: closingDate,
        description: `Jurnal Penutup Tahun ${year}`,
        reference_type: 'closing',
        status: 'posted',
        is_voided: false,
        created_by: userId
      })
      .select('id, entry_number');

    if (journalError || !journalEntryList || journalEntryList.length === 0) {
      throw new Error(`Gagal membuat jurnal penutup: ${journalError?.message}`);
    }

    const journalEntry = journalEntryList[0];

    const lines: any[] = [];
    let lineNumber = 1;

    // 1. Tutup Pendapatan ke Ikhtisar (Dr. Pendapatan, Cr. Ikhtisar)
    for (const acc of preview.pendapatanAccounts) {
      lines.push({
        journal_entry_id: journalEntry.id,
        line_number: lineNumber++,
        account_id: acc.id,
        account_code: acc.code,
        account_name: acc.name,
        debit_amount: acc.balance,
        credit_amount: 0,
        description: `Tutup ${acc.name} ke Ikhtisar Laba Rugi`
      });
    }

    // Credit ke Ikhtisar Laba Rugi (total pendapatan)
    if (preview.totalPendapatan > 0) {
      lines.push({
        journal_entry_id: journalEntry.id,
        line_number: lineNumber++,
        account_id: ikhtisarAccount.id,
        account_code: ikhtisarAccount.code,
        account_name: ikhtisarAccount.name,
        debit_amount: 0,
        credit_amount: preview.totalPendapatan,
        description: 'Tutup Pendapatan ke Ikhtisar Laba Rugi'
      });
    }

    // 2. Tutup Beban ke Ikhtisar (Dr. Ikhtisar, Cr. Beban)
    if (preview.totalBeban > 0) {
      lines.push({
        journal_entry_id: journalEntry.id,
        line_number: lineNumber++,
        account_id: ikhtisarAccount.id,
        account_code: ikhtisarAccount.code,
        account_name: ikhtisarAccount.name,
        debit_amount: preview.totalBeban,
        credit_amount: 0,
        description: 'Tutup Beban ke Ikhtisar Laba Rugi'
      });
    }

    for (const acc of preview.bebanAccounts) {
      lines.push({
        journal_entry_id: journalEntry.id,
        line_number: lineNumber++,
        account_id: acc.id,
        account_code: acc.code,
        account_name: acc.name,
        debit_amount: 0,
        credit_amount: acc.balance,
        description: `Tutup ${acc.name} ke Ikhtisar Laba Rugi`
      });
    }

    // 3. Tutup Ikhtisar ke Laba Ditahan
    if (preview.labaRugiBersih > 0) {
      // LABA: Dr. Ikhtisar, Cr. Laba Ditahan
      lines.push({
        journal_entry_id: journalEntry.id,
        line_number: lineNumber++,
        account_id: ikhtisarAccount.id,
        account_code: ikhtisarAccount.code,
        account_name: ikhtisarAccount.name,
        debit_amount: preview.labaRugiBersih,
        credit_amount: 0,
        description: 'Tutup Laba Bersih ke Laba Ditahan'
      });
      lines.push({
        journal_entry_id: journalEntry.id,
        line_number: lineNumber++,
        account_id: labaDitahanAccount.id,
        account_code: labaDitahanAccount.code,
        account_name: labaDitahanAccount.name,
        debit_amount: 0,
        credit_amount: preview.labaRugiBersih,
        description: 'Penerimaan Laba Bersih Tahun ' + year
      });
    } else if (preview.labaRugiBersih < 0) {
      // RUGI: Dr. Laba Ditahan, Cr. Ikhtisar
      const rugi = Math.abs(preview.labaRugiBersih);
      lines.push({
        journal_entry_id: journalEntry.id,
        line_number: lineNumber++,
        account_id: labaDitahanAccount.id,
        account_code: labaDitahanAccount.code,
        account_name: labaDitahanAccount.name,
        debit_amount: rugi,
        credit_amount: 0,
        description: 'Pengurangan akibat Rugi Bersih Tahun ' + year
      });
      lines.push({
        journal_entry_id: journalEntry.id,
        line_number: lineNumber++,
        account_id: ikhtisarAccount.id,
        account_code: ikhtisarAccount.code,
        account_name: ikhtisarAccount.name,
        debit_amount: 0,
        credit_amount: rugi,
        description: 'Tutup Rugi Bersih ke Laba Ditahan'
      });
    }

    // Insert all journal lines
    const { error: linesError } = await supabase
      .from('journal_entry_lines')
      .insert(lines);

    if (linesError) {
      // Rollback: delete the journal entry
      await supabase.from('journal_entries').delete().eq('id', journalEntry.id);
      throw new Error(`Gagal membuat baris jurnal: ${linesError.message}`);
    }

    // Record closing period
    const { error: closingError } = await supabase
      .from('closing_periods')
      .insert({
        year,
        branch_id: branchId,
        closed_at: new Date().toISOString(),
        closed_by: userId,
        journal_entry_id: journalEntry.id,
        net_income: preview.labaRugiBersih
      });

    if (closingError) {
      console.warn('[ClosingEntry] Warning: Failed to record closing period:', closingError);
      // Don't rollback - the journal is valid, just the tracking failed
    }

    console.log(`[ClosingEntry] Successfully closed year ${year}`, {
      journalEntryId: journalEntry.id,
      netIncome: preview.labaRugiBersih,
      pendapatanClosed: preview.pendapatanAccounts.length,
      bebanClosed: preview.bebanAccounts.length
    });

    return { success: true, journalEntryId: journalEntry.id };
  } catch (error: any) {
    console.error('[ClosingEntry] Error executing closing entry:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Batalkan tutup buku (void closing entry)
 * Hanya bisa dilakukan jika belum ada transaksi di tahun berikutnya
 */
export async function voidClosingEntry(
  year: number,
  branchId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get closing period record
    const { data: closingPeriod } = await supabase
      .from('closing_periods')
      .select('*')
      .eq('year', year)
      .eq('branch_id', branchId)
      .single();

    if (!closingPeriod) {
      return { success: false, error: `Tidak ada tutup buku untuk tahun ${year}` };
    }

    // Check if there are transactions in the next year
    const nextYearStart = `${year + 1}-01-01`;
    const { data: nextYearTx } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('branch_id', branchId)
      .gte('entry_date', nextYearStart)
      .eq('status', 'posted')
      .eq('is_voided', false)
      .limit(1);

    if (nextYearTx && nextYearTx.length > 0) {
      return {
        success: false,
        error: `Tidak dapat membatalkan tutup buku karena sudah ada transaksi di tahun ${year + 1}`
      };
    }

    // Void the closing journal entry
    const { error: voidError } = await supabase
      .from('journal_entries')
      .update({ is_voided: true })
      .eq('id', closingPeriod.journal_entry_id);

    if (voidError) {
      throw new Error(`Gagal membatalkan jurnal penutup: ${voidError.message}`);
    }

    // Delete closing period record
    await supabase
      .from('closing_periods')
      .delete()
      .eq('id', closingPeriod.id);

    console.log(`[ClosingEntry] Successfully voided closing for year ${year}`);
    return { success: true };
  } catch (error: any) {
    console.error('[ClosingEntry] Error voiding closing entry:', error);
    return { success: false, error: error.message };
  }
}
