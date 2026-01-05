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
 * Preview tutup buku - hitung laba/rugi sebelum eksekusi (Atomic via RPC)
 */
export async function previewClosingEntry(year: number, branchId: string): Promise<ClosingPreview> {
  console.log('🔍 Previewing Closing Entry via RPC...', year);

  const { data: rpcResultRaw, error } = await supabase
    .rpc('preview_closing_entry', {
      p_branch_id: branchId,
      p_year: year
    });

  if (error) throw new Error(`Gagal memuat preview: ${error.message}`);

  const data = Array.isArray(rpcResultRaw) ? rpcResultRaw[0] : rpcResultRaw;

  // Map RPC result properties (snake_case) to our interface (camelCase)
  return {
    year,
    totalPendapatan: Number(data.total_pendapatan) || 0,
    totalBeban: Number(data.total_beban) || 0,
    labaRugiBersih: Number(data.laba_rugi_bersih) || 0,
    pendapatanAccounts: (data.pendapatan_accounts || []).map((acc: any) => ({
      id: acc.id,
      code: acc.code,
      name: acc.name,
      balance: Number(acc.balance) || 0
    })),
    bebanAccounts: (data.beban_accounts || []).map((acc: any) => ({
      id: acc.id,
      code: acc.code,
      name: acc.name,
      balance: Number(acc.balance) || 0
    })),
    labaDitahanAccount: null, // Not used much in preview UI but kept for compatibility
    ikhtisarLabaRugiAccount: null
  };
}

/**
 * Eksekusi tutup buku tahunan (Atomic via RPC)
 */
export async function executeClosingEntry(
  year: number,
  branchId: string
): Promise<{ success: boolean; journalEntryId?: string; error?: string }> {
  try {
    console.log('🚀 Executing Closing Entry via RPC...', year);

    const { data: rpcResultRaw, error: rpcError } = await supabase
      .rpc('execute_closing_entry_atomic', {
        p_branch_id: branchId,
        p_year: year
      });

    if (rpcError) throw new Error(rpcError.message);

    const result = Array.isArray(rpcResultRaw) ? rpcResultRaw[0] : rpcResultRaw;

    if (!result.success) {
      return { success: false, error: result.error_message };
    }

    console.log('✅ Closing Entry Successful. Journal ID:', result.journal_id);
    return { success: true, journalEntryId: result.journal_id };
  } catch (error: any) {
    console.error('[ClosingEntry] Error executing closing entry:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Batalkan tutup buku (Atomic via RPC)
 */
export async function voidClosingEntry(
  year: number,
  branchId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('🗑️ Voiding Closing Entry via RPC...', year);

    const { data: rpcResultRaw, error: rpcError } = await supabase
      .rpc('void_closing_entry_atomic', {
        p_branch_id: branchId,
        p_year: year
      });

    if (rpcError) throw new Error(rpcError.message);

    const result = Array.isArray(rpcResultRaw) ? rpcResultRaw[0] : rpcResultRaw;

    if (!result.success) {
      return { success: false, error: result.error_message };
    }

    console.log('✅ Closing Entry Voided');
    return { success: true };
  } catch (error: any) {
    console.error('[ClosingEntry] Error voiding closing entry:', error);
    return { success: false, error: error.message };
  }
}

