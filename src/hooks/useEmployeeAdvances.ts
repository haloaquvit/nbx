import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { EmployeeAdvance, AdvanceRepayment } from '@/types/employeeAdvance'
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useBranch } from '@/contexts/BranchContext';
import { findAccountByLookup } from '@/services/accountLookupService';
import { Account } from '@/types/account';
import { createAdvanceJournal } from '@/services/journalService';

// ============================================================================
// CATATAN PENTING: DOUBLE-ENTRY ACCOUNTING SYSTEM
// ============================================================================
// Semua saldo akun HANYA dihitung dari journal_entries (tidak ada update balance langsung)
// cash_history SUDAH DIHAPUS - tidak lagi digunakan
// Jurnal otomatis dibuat melalui journalService untuk setiap transaksi panjar
// ============================================================================

// Helper to map DB account to App account format
const fromDbToAppAccount = (dbAccount: any): Account => ({
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
  normalBalance: dbAccount.normal_balance || 'DEBIT',
  isHeader: dbAccount.is_header || false,
  isActive: dbAccount.is_active !== false,
  sortOrder: dbAccount.sort_order || 0,
  branchId: dbAccount.branch_id || undefined,
});

// Helper to get Piutang Karyawan account using lookup service (by name/type)
const getPiutangKaryawanAccount = async (): Promise<{ id: string; name: string } | null> => {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .order('code');

  if (error || !data) {
    console.warn('Failed to fetch accounts for Piutang Karyawan lookup:', error?.message);
    return null;
  }

  const accounts = data.map(fromDbToAppAccount);
  const piutangAccount = findAccountByLookup(accounts, 'PIUTANG_KARYAWAN');

  if (!piutangAccount) {
    console.warn('Piutang Karyawan account not found using lookup service');
    return null;
  }

  return { id: piutangAccount.id, name: piutangAccount.name };
};

const fromDbToApp = (dbAdvance: any): EmployeeAdvance => ({
  id: dbAdvance.id,
  employeeId: dbAdvance.employee_id,
  employeeName: dbAdvance.employee_name,
  amount: dbAdvance.amount,
  date: new Date(dbAdvance.date),
  notes: dbAdvance.notes,
  remainingAmount: dbAdvance.remaining_amount,
  repayments: (dbAdvance.advance_repayments || []).map((r: any) => ({
    id: r.id,
    amount: r.amount,
    date: new Date(r.date),
    recordedBy: r.recorded_by,
  })),
  createdAt: new Date(dbAdvance.created_at),
  accountId: dbAdvance.account_id,
  accountName: dbAdvance.account_name,
});

const fromAppToDb = (appAdvance: Partial<EmployeeAdvance>) => {
  const dbData: { [key: string]: any } = {};
  if (appAdvance.id !== undefined) dbData.id = appAdvance.id;
  if (appAdvance.employeeId !== undefined) dbData.employee_id = appAdvance.employeeId;
  if (appAdvance.employeeName !== undefined) dbData.employee_name = appAdvance.employeeName;
  if (appAdvance.amount !== undefined) dbData.amount = appAdvance.amount;
  if (appAdvance.date !== undefined) dbData.date = appAdvance.date;
  if (appAdvance.notes !== undefined) dbData.notes = appAdvance.notes;
  if (appAdvance.remainingAmount !== undefined) dbData.remaining_amount = appAdvance.remainingAmount;
  if (appAdvance.accountId !== undefined) dbData.account_id = appAdvance.accountId;
  if (appAdvance.accountName !== undefined) dbData.account_name = appAdvance.accountName;
  return dbData;
};

export const useEmployeeAdvances = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { currentBranch } = useBranch();

  const { data: advances, isLoading, isError, error } = useQuery<EmployeeAdvance[]>({
    queryKey: ['employeeAdvances', currentBranch?.id, user?.id],
    queryFn: async () => {
      let query = supabase.from('employee_advances').select('*, advance_repayments:advance_repayments(*)');

      // Apply branch filter - ALWAYS filter by selected branch
      if (currentBranch?.id) {
        query = query.eq('branch_id', currentBranch.id);
      }

      // Role-based filtering: only kasir, admin, owner can see all data
      // Other users can only see their own advances
      if (user && !['kasir', 'admin', 'owner'].includes(user.role || '')) {
        query = query.eq('employee_id', user.id);
      }

      const { data, error } = await query;
      if (error) {
        console.error("❌ Gagal mengambil data panjar:", error.message);
        throw new Error(error.message);
      }
      return data ? data.map(fromDbToApp) : [];
    },
    enabled: !!currentBranch,
    // Optimized for panjar management
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes cache
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    retryDelay: 1000,
  });

  const addAdvance = useMutation({
    mutationFn: async (newData: Omit<EmployeeAdvance, 'id' | 'createdAt' | 'remainingAmount' | 'repayments'>): Promise<EmployeeAdvance> => {
      const advanceToInsert = {
        ...newData,
        remainingAmount: newData.amount,
      };
      const dbData = fromAppToDb(advanceToInsert);

      // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
      const { data: dataRaw, error } = await supabase
        .from('employee_advances')
        .insert({
          ...dbData,
          id: `adv-${Date.now()}`,
          branch_id: currentBranch?.id || null, // Add branch_id for branch categorization
        })
        .select()
        .order('id').limit(1);

      if (error) throw new Error(error.message);
      const data = Array.isArray(dataRaw) ? dataRaw[0] : dataRaw;
      if (!data) throw new Error('Failed to create employee advance');

      // Get Piutang Karyawan account using lookup service
      const piutangAccount = await getPiutangKaryawanAccount();

      // ============================================================================
      // cash_history SUDAH DIHAPUS - Cash flow sekarang dibaca dari journal_entries
      // ============================================================================

      // ============================================================================
      // AUTO-GENERATE JOURNAL ENTRY FOR PANJAR
      // ============================================================================
      // Jurnal otomatis untuk pemberian panjar:
      // Dr. Panjar Karyawan   xxx
      //   Cr. Kas/Bank             xxx
      // ============================================================================
      if (currentBranch?.id) {
        try {
          const journalResult = await createAdvanceJournal({
            advanceId: data.id,
            advanceDate: new Date(newData.date),
            amount: newData.amount,
            employeeName: newData.employeeName,
            type: 'given',
            description: newData.notes,
            branchId: currentBranch.id,
          });

          if (journalResult.success) {
            console.log('✅ Jurnal panjar auto-generated:', journalResult.journalId);
          } else {
            console.warn('⚠️ Gagal membuat jurnal panjar otomatis:', journalResult.error);
          }
        } catch (journalError) {
          console.error('Error creating advance journal:', journalError);
        }
      }

      return fromDbToApp({ ...data, advance_repayments: [] });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employeeAdvances'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['cashFlow'] });
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
    },
  });

  const addRepayment = useMutation({
    mutationFn: async ({ advanceId, repaymentData, accountId, accountName }: { 
      advanceId: string, 
      repaymentData: Omit<AdvanceRepayment, 'id'>,
      accountId?: string,
      accountName?: string
    }): Promise<void> => {
      const newRepayment = {
        id: `rep-${Date.now()}`,
        advance_id: advanceId,
        amount: repaymentData.amount,
        date: repaymentData.date,
        recorded_by: repaymentData.recordedBy,
      };
      const { error: insertError } = await supabase.from('advance_repayments').insert(newRepayment);
      if (insertError) throw insertError;

      // Call RPC to update remaining amount
      const { error: rpcError } = await supabase.rpc('update_remaining_amount', {
        p_advance_id: advanceId
      });
      if (rpcError) throw new Error(rpcError.message);

      // ============================================================================
      // cash_history SUDAH DIHAPUS - Cash flow sekarang dibaca dari journal_entries
      // ============================================================================

      // ============================================================================
      // AUTO-GENERATE JOURNAL ENTRY FOR PELUNASAN PANJAR
      // ============================================================================
      // Jurnal otomatis untuk pengembalian panjar:
      // Dr. Kas/Bank          xxx
      //   Cr. Panjar Karyawan      xxx
      // ============================================================================
      if (currentBranch?.id) {
        try {
          // Get advance details for the description
          // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
          const { data: advanceRaw2 } = await supabase
            .from('employee_advances')
            .select('employee_name')
            .eq('id', advanceId)
            .order('id').limit(1);
          const advance = Array.isArray(advanceRaw2) ? advanceRaw2[0] : advanceRaw2;

          const journalResult = await createAdvanceJournal({
            advanceId: newRepayment.id,
            advanceDate: new Date(repaymentData.date),
            amount: repaymentData.amount,
            employeeName: advance?.employee_name || 'Karyawan',
            type: 'returned',
            description: `Pelunasan panjar ${advanceId}`,
            branchId: currentBranch.id,
          });

          if (journalResult.success) {
            console.log('✅ Jurnal pelunasan panjar auto-generated:', journalResult.journalId);
          } else {
            console.warn('⚠️ Gagal membuat jurnal pelunasan otomatis:', journalResult.error);
          }
        } catch (journalError) {
          console.error('Error creating repayment journal:', journalError);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employeeAdvances'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['cashFlow'] });
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
    }
  });

  const deleteAdvance = useMutation({
    mutationFn: async (advanceToDelete: EmployeeAdvance): Promise<void> => {
      // ============================================================================
      // VOID JURNAL PANJAR
      // Balance otomatis ter-rollback karena dihitung dari journal_entries
      // ============================================================================
      try {
        const { error: voidError } = await supabase
          .from('journal_entries')
          .update({ status: 'voided' })
          .eq('reference_id', advanceToDelete.id)
          .eq('reference_type', 'advance');

        if (voidError) {
          console.error('Failed to void advance journal:', voidError.message);
        } else {
          console.log('✅ Advance journal voided:', advanceToDelete.id);
        }
      } catch (err) {
        console.error('Error voiding advance journal:', err);
      }

      // cash_history SUDAH DIHAPUS - tidak perlu delete lagi

      // Delete associated repayments first
      await supabase.from('advance_repayments').delete().eq('advance_id', advanceToDelete.id);

      // Then delete the advance itself
      const { error } = await supabase.from('employee_advances').delete().eq('id', advanceToDelete.id);
      if (error) throw new Error(error.message);

      console.log(`✅ Advance ${advanceToDelete.id} deleted`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employeeAdvances'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['cashFlow'] });
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
    }
  });

  return {
    advances,
    isLoading,
    isError,
    error,
    addAdvance,
    addRepayment,
    deleteAdvance,
  }
}