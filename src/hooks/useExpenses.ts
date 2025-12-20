import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Expense } from '@/types/expense'
import { supabase } from '@/integrations/supabase/client'
import { useAccounts } from './useAccounts'
import { useAuth } from './useAuth'
import { useBranch } from '@/contexts/BranchContext'

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
  const { updateAccountBalance } = useAccounts();
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

      const { data, error } = await supabase
        .from('expenses')
        .insert(insertData)
        .select()
        .single();
      if (error) {
        console.error('Expense insert error:', error);
        throw new Error(error.message);
      }
      
      // Kurangi saldo akun yang digunakan, jika ada
      if (newExpenseData.accountId) {
        updateAccountBalance.mutate({ accountId: newExpenseData.accountId, amount: -newExpenseData.amount });
      }

      // Record in cash_history for expense tracking
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

          const cashFlowRecord = {
            account_id: newExpenseData.accountId,
            account_name: newExpenseData.accountName || 'Unknown Account',
            type: expenseType,
            amount: newExpenseData.amount,
            description: newExpenseData.description,
            reference_id: data.id,
            reference_name: `Pengeluaran ${data.id}`,
            user_id: user.id,
            user_name: user.name || user.email || 'Unknown User',
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

      return fromDbToApp(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['cashFlow'] });
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

      const { data: deletedExpense, error: deleteError } = await supabase
        .from('expenses')
        .delete()
        .eq('id', expenseId)
        .select()
        .single();
      
      if (deleteError) throw new Error(deleteError.message);
      if (!deletedExpense) throw new Error("Pengeluaran tidak ditemukan");
      
      const appExpense = fromDbToApp(deletedExpense);
      // Kembalikan saldo ke akun yang digunakan, jika ada
      if (appExpense.accountId) {
        updateAccountBalance.mutate({ accountId: appExpense.accountId, amount: appExpense.amount });
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