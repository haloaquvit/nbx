import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Expense } from '@/types/expense'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from './useAuth'
import { useBranch } from '@/contexts/BranchContext'
import { createExpenseJournal } from '@/services/journalService'

// ============================================================================
// CATATAN PENTING: DOUBLE-ENTRY ACCOUNTING SYSTEM
// ============================================================================
// Semua saldo akun HANYA dihitung dari journal_entries (tidak ada updateAccountBalance)
// cash_history digunakan HANYA untuk Buku Kas Harian (monitoring), TIDAK update balance
// Jurnal otomatis dibuat melalui journalService untuk setiap transaksi
// ============================================================================

// Helper to map from DB (snake_case) to App (camelCase)
const fromDbToApp = (dbExpense: any): Expense => ({
  id: dbExpense.id,
  description: dbExpense.description,
  amount: dbExpense.amount,
  accountId: dbExpense.account_id,
  accountName: dbExpense.account_name,
  expenseAccountId: dbExpense.expense_account_id,
  expenseAccountName: dbExpense.expense_account_name,
  date: new Date(dbExpense.date),
  category: dbExpense.category,
  createdAt: new Date(dbExpense.created_at),
});

// Helper to map from App (camelCase) to DB (snake_case)
const fromAppToDb = (appExpense: Partial<Omit<Expense, 'id' | 'createdAt'>>) => {
  const { accountId, accountName, expenseAccountId, expenseAccountName, date, ...rest } = appExpense;
  const dbData: any = { ...rest };
  if (accountId !== undefined) dbData.account_id = accountId;
  if (accountName !== undefined) dbData.account_name = accountName;
  if (expenseAccountId !== undefined) dbData.expense_account_id = expenseAccountId;
  if (expenseAccountName !== undefined) dbData.expense_account_name = expenseAccountName;
  // Convert Date object to ISO string for database
  if (date !== undefined) dbData.date = date instanceof Date ? date.toISOString() : date;
  return dbData;
};

export const useExpenses = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { currentBranch } = useBranch();

  const { data: expenses, isLoading } = useQuery<Expense[]>({
    queryKey: ['expenses', currentBranch?.id],
    queryFn: async () => {
      // Filter out commission expenses - they are handled automatically in financial reports
      let query = supabase
        .from('expenses')
        .select('*')
        .not('id', 'like', 'EXP-COMMISSION-%')
        .order('date', { ascending: false });

      // Apply branch filter - ALWAYS filter by selected branch
      if (currentBranch?.id) {
        query = query.eq('branch_id', currentBranch.id);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data ? data.map(fromDbToApp) : [];
    },
    enabled: !!currentBranch,
    // Optimized for expense management
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes cache
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    retryDelay: 1000,
  });

  // Query untuk mendapatkan pembayaran hutang dari cash_history
  const { data: debtPayments, isLoading: isLoadingDebtPayments } = useQuery<Expense[]>({
    queryKey: ['debtPayments', currentBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('cash_history')
        .select('*')
        .eq('type', 'pembayaran_hutang')
        .order('created_at', { ascending: false });

      if (currentBranch?.id) {
        query = query.eq('branch_id', currentBranch.id);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      // Map cash_history ke format Expense untuk tampilan
      return data ? data.map((ch: any): Expense => ({
        id: ch.id,
        description: ch.description || 'Pembayaran Hutang',
        amount: ch.amount,
        accountId: ch.account_id,
        accountName: ch.account_name,
        expenseAccountId: undefined,
        expenseAccountName: ch.description?.match(/\(([^)]+)\)/)?.[1] || 'Pembayaran Hutang', // Extract akun kewajiban dari description
        date: new Date(ch.created_at),
        category: 'Pembayaran Hutang',
        createdAt: new Date(ch.created_at),
      })) : [];
    },
    enabled: !!currentBranch,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    retryDelay: 1000,
  });

  // Gabungkan expenses dan debtPayments, lalu sort by date descending
  const allExpenses = [...(expenses || []), ...(debtPayments || [])].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const addExpense = useMutation({
    mutationFn: async (newExpenseData: Omit<Expense, 'id' | 'createdAt'>): Promise<Expense> => {
      const dbData = fromAppToDb(newExpenseData);

      // Debug log to see what's being sent
      const insertData = {
        ...dbData,
        id: `exp-${Date.now()}`,
        branch_id: currentBranch?.id || null,
      };
      console.log('Inserting expense:', insertData);

      // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
      const { data: dataRaw, error } = await supabase
        .from('expenses')
        .insert(insertData)
        .select()
        .order('id').limit(1);
      if (error) {
        console.error('Expense insert error:', error);
        throw new Error(error.message);
      }
      const data = Array.isArray(dataRaw) ? dataRaw[0] : dataRaw;
      if (!data) throw new Error('Failed to create expense');
      
      // ============================================================================
      // BALANCE UPDATE DIHAPUS - Sekarang dihitung dari journal_entries
      // Double-entry accounting dilakukan melalui createExpenseJournal di bawah
      // ============================================================================

      // Record in cash_history for expense tracking (MONITORING ONLY - tidak update balance)
      if (newExpenseData.accountId && user) {
        try {
          // Determine expense type based on category
          let sourceType = 'manual_expense';
          if (newExpenseData.category === 'Panjar Karyawan') {
            sourceType = 'employee_advance';
          } else if (newExpenseData.category === 'Pembayaran PO') {
            sourceType = 'po_payment';
          } else if (newExpenseData.category === 'Penghapusan Piutang') {
            sourceType = 'receivables_writeoff';
          }

          // Determine the new format type based on category 
          let expenseType = 'pengeluaran';
          if (newExpenseData.category === 'Panjar Karyawan') {
            expenseType = 'panjar_pengambilan';
          } else if (newExpenseData.category === 'Pembayaran PO') {
            expenseType = 'pembayaran_po';
          }

          // cash_history table columns: id, account_id, transaction_type, amount, description,
          // reference_number, created_by, created_by_name, source_type, created_at, branch_id, type
          // IMPORTANT: transaction_type must be 'income' or 'expense' (database constraint)
          const cashFlowRecord: any = {
            account_id: newExpenseData.accountId,
            transaction_type: 'expense',
            type: expenseType,
            amount: newExpenseData.amount,
            description: newExpenseData.description,
            reference_number: data.id,
            created_by: user.id,
            created_by_name: user.name || user.email || 'Unknown User',
            source_type: 'expense',
            branch_id: currentBranch?.id || null,
          };

          console.log('Recording expense in cash history:', cashFlowRecord);

          const { error: cashFlowError } = await supabase
            .from('cash_history')
            .insert(cashFlowRecord);

          if (cashFlowError) {
            console.error('Failed to record expense in cash flow:', cashFlowError.message);
          } else {
            console.log('Successfully recorded expense in cash history');
          }
        } catch (error) {
          console.error('Error recording expense cash flow:', error);
        }
      } else {
        console.log('Skipping cash flow record - missing accountId or user:', {
          accountId: newExpenseData.accountId,
          user: user ? 'exists' : 'missing'
        });
      }

      // ============================================================================
      // AUTO-GENERATE JOURNAL ENTRY
      // ============================================================================
      // Buat jurnal otomatis untuk pengeluaran ini
      // Dr. Beban (expense account)   xxx
      //   Cr. Kas/Bank                     xxx
      // ============================================================================
      if (currentBranch?.id) {
        try {
          const journalResult = await createExpenseJournal({
            expenseId: data.id,
            expenseDate: newExpenseData.date,
            amount: newExpenseData.amount,
            categoryName: newExpenseData.category || 'Beban Umum',
            description: newExpenseData.description,
            branchId: currentBranch.id,
            accountId: newExpenseData.expenseAccountId, // Akun beban spesifik
          });

          if (journalResult.success) {
            console.log('✅ Jurnal pengeluaran auto-generated:', journalResult.journalId);
          } else {
            console.warn('⚠️ Gagal membuat jurnal otomatis:', journalResult.error);
          }
        } catch (journalError) {
          console.error('Error creating expense journal:', journalError);
        }
      }

      return fromDbToApp(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['cashFlow'] });
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
    },
  });

  const deleteExpense = useMutation({
    mutationFn: async (expenseId: string): Promise<Expense> => {
      // First delete related cash_history records
      const { error: cashHistoryError } = await supabase
        .from('cash_history')
        .delete()
        .eq('reference_id', expenseId);
      
      if (cashHistoryError) {
        console.error('Failed to delete related cash history:', cashHistoryError.message);
        // Continue anyway, don't throw
      }

      // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
      const { data: deletedExpenseRaw, error: deleteError } = await supabase
        .from('expenses')
        .delete()
        .eq('id', expenseId)
        .select()
        .order('id').limit(1);

      if (deleteError) throw new Error(deleteError.message);
      const deletedExpense = Array.isArray(deletedExpenseRaw) ? deletedExpenseRaw[0] : deletedExpenseRaw;
      if (!deletedExpense) throw new Error("Pengeluaran tidak ditemukan");
      
      const appExpense = fromDbToApp(deletedExpense);

      // ============================================================================
      // ROLLBACK: Void jurnal terkait expense ini
      // Balance akan otomatis ter-rollback karena dihitung dari journal_entries
      // ============================================================================
      try {
        const { error: voidError } = await supabase
          .from('journal_entries')
          .update({ status: 'voided' })
          .eq('reference_id', expenseId)
          .eq('reference_type', 'expense');

        if (voidError) {
          console.error('Failed to void expense journal:', voidError.message);
        } else {
          console.log('✅ Expense journal voided:', expenseId);
        }
      } catch (err) {
        console.error('Error voiding expense journal:', err);
      }

      return appExpense;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['cashFlow'] });
    }
  });

  return {
    expenses: allExpenses, // Return gabungan expenses + pembayaran hutang
    expensesOnly: expenses, // Pure expenses tanpa pembayaran hutang
    isLoading: isLoading || isLoadingDebtPayments,
    addExpense,
    deleteExpense,
  }
}