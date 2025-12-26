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
// cash_history digunakan HANYA untuk Buku Kas Harian (monitoring), TIDAK update balance
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
      // DOUBLE-ENTRY ACCOUNTING FOR PANJAR KARYAWAN
      // Journal Entry:
      // - Debit: Piutang Karyawan (increase asset - employee owes company)
      // - Credit: Kas/Bank (decrease asset - cash out)
      //
      // Saldo dihitung dari cash_history, jadi HARUS dicatat di cash_history
      // untuk kedua akun agar muncul di Neraca
      // ============================================================================
      if (newData.accountId && user) {
        try {
          const description = `Panjar karyawan untuk ${newData.employeeName}: ${newData.notes || 'Tidak ada keterangan'}`;

          // 1. Record DEBIT to Piutang Karyawan (piutang bertambah = kas masuk ke akun piutang)
          if (piutangAccount) {
            const piutangRecord = {
              account_id: piutangAccount.id,
              transaction_type: 'income', // Piutang bertambah = aset bertambah
              type: 'panjar_pengambilan', // Custom type for panjar
              amount: newData.amount,
              description: `[DEBIT] ${description}`,
              reference_number: data.id,
              created_by: user.id,
              created_by_name: user.name || user.email || 'Unknown User',
              source_type: 'employee_advance',
              branch_id: currentBranch?.id || null,
            };

            const { error: piutangError } = await supabase
              .from('cash_history')
              .insert(piutangRecord);

            if (piutangError) {
              console.error('Failed to record piutang in cash history:', piutangError.message);
            } else {
              console.log(`✅ Piutang Karyawan (${piutangAccount.id}) increased by ${newData.amount}`);
            }
          } else {
            console.warn('⚠️ Piutang Karyawan account not found, skipping piutang recording');
          }

          // 2. Record CREDIT to Kas/Bank (kas berkurang = expense)
          const cashFlowRecord = {
            account_id: newData.accountId,
            transaction_type: 'expense',
            type: 'panjar_pengambilan',
            amount: newData.amount,
            description: `[CREDIT] ${description}`,
            reference_number: data.id,
            created_by: user.id,
            created_by_name: user.name || user.email || 'Unknown User',
            source_type: 'employee_advance',
            branch_id: currentBranch?.id || null,
          };

          const { error: cashFlowError } = await supabase
            .from('cash_history')
            .insert(cashFlowRecord);

          if (cashFlowError) {
            console.error('Failed to record cash flow:', cashFlowError.message);
          } else {
            console.log(`✅ Kas/Bank decreased by ${newData.amount}`);
          }

          console.log('📝 Double-entry for panjar completed:', {
            debit: { account: piutangAccount?.name, amount: newData.amount },
            credit: { account: newData.accountName, amount: newData.amount }
          });

        } catch (error) {
          console.error('Error recording advance cash flow:', error);
        }
      }

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
      // DOUBLE-ENTRY ACCOUNTING FOR PELUNASAN PANJAR
      // Journal Entry:
      // - Debit: Kas/Bank (increase asset - cash in)
      // - Credit: Piutang Karyawan (decrease asset - employee paid back)
      //
      // Saldo dihitung dari cash_history, jadi HARUS dicatat di cash_history
      // untuk kedua akun agar muncul di Neraca
      // ============================================================================
      if (accountId && user) {
        try {
          // Get advance details for the description
          // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
          const { data: advanceRaw } = await supabase
            .from('employee_advances')
            .select('employee_name')
            .eq('id', advanceId)
            .order('id').limit(1);
          const advance = Array.isArray(advanceRaw) ? advanceRaw[0] : advanceRaw;

          const description = `Pelunasan panjar dari ${advance?.employee_name || 'karyawan'} - ${advanceId}`;
          const piutangAccount = await getPiutangKaryawanAccount();

          // 1. Record DEBIT to Kas/Bank (kas bertambah = income)
          const cashFlowRecord = {
            account_id: accountId,
            transaction_type: 'income',
            type: 'panjar_pelunasan',
            amount: repaymentData.amount,
            description: `[DEBIT] ${description}`,
            reference_number: newRepayment.id,
            created_by: user.id,
            created_by_name: user.name || user.email || 'Unknown User',
            source_type: 'advance_repayment',
            branch_id: currentBranch?.id || null,
          };

          const { error: cashFlowError } = await supabase
            .from('cash_history')
            .insert(cashFlowRecord);

          if (cashFlowError) {
            console.error('Failed to record cash income:', cashFlowError.message);
          } else {
            console.log(`✅ Kas/Bank increased by ${repaymentData.amount}`);
          }

          // 2. Record CREDIT to Piutang Karyawan (piutang berkurang = expense dari akun piutang)
          if (piutangAccount) {
            const piutangRecord = {
              account_id: piutangAccount.id,
              transaction_type: 'expense', // Piutang berkurang = aset berkurang
              type: 'panjar_pelunasan',
              amount: repaymentData.amount,
              description: `[CREDIT] ${description}`,
              reference_number: newRepayment.id,
              created_by: user.id,
              created_by_name: user.name || user.email || 'Unknown User',
              source_type: 'advance_repayment',
              branch_id: currentBranch?.id || null,
            };

            const { error: piutangError } = await supabase
              .from('cash_history')
              .insert(piutangRecord);

            if (piutangError) {
              console.error('Failed to record piutang decrease:', piutangError.message);
            } else {
              console.log(`✅ Piutang Karyawan (${piutangAccount.id}) decreased by ${repaymentData.amount}`);
            }
          }

          console.log('📝 Double-entry for pelunasan panjar completed:', {
            debit: { account: accountName, amount: repaymentData.amount },
            credit: { account: piutangAccount?.name, amount: repaymentData.amount }
          });

        } catch (error) {
          console.error('Error recording repayment cash flow:', error);
        }
      }

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

      // Delete related cash_history records by reference_number (advance ID) - untuk monitoring saja
      const { error: cashHistoryError } = await supabase
        .from('cash_history')
        .delete()
        .eq('reference_number', advanceToDelete.id);

      if (cashHistoryError) {
        console.error('Failed to delete related cash history:', cashHistoryError.message);
      } else {
        console.log(`✅ Deleted cash_history records for advance ${advanceToDelete.id}`);
      }

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