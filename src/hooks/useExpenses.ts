import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Expense } from '@/types/expense'
import { supabase } from '@/integrations/supabase/client'
import { useAccounts } from './useAccounts'
import { useAuth } from './useAuth'

// Helper to map from DB (snake_case) to App (camelCase)
const fromDbToApp = (dbExpense: any): Expense => ({
  id: dbExpense.id,
  description: dbExpense.description,
  amount: dbExpense.amount,
  accountId: dbExpense.account_id,
  accountName: dbExpense.account_name,
  date: new Date(dbExpense.date),
  category: dbExpense.category,
  createdAt: new Date(dbExpense.created_at),
});

// Helper to map from App (camelCase) to DB (snake_case)
const fromAppToDb = (appExpense: Partial<Omit<Expense, 'id' | 'createdAt'>>) => {
  const { accountId, accountName, ...rest } = appExpense;
  const dbData: any = { ...rest };
  if (accountId !== undefined) dbData.account_id = accountId;
  if (accountName !== undefined) dbData.account_name = accountName;
  return dbData;
};

export const useExpenses = () => {
  const queryClient = useQueryClient();
  const { updateAccountBalance } = useAccounts();
  const { user } = useAuth();

  const { data: expenses, isLoading } = useQuery<Expense[]>({
    queryKey: ['expenses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('expenses').select('*').order('date', { ascending: false });
      if (error) throw new Error(error.message);
      return data ? data.map(fromDbToApp) : [];
    }
  });

  const addExpense = useMutation({
    mutationFn: async (newExpenseData: Omit<Expense, 'id' | 'createdAt'>): Promise<Expense> => {
      const dbData = fromAppToDb(newExpenseData);
      const { data, error } = await supabase
        .from('expenses')
        .insert({ ...dbData, id: `exp-${Date.now()}` })
        .select()
        .single();
      if (error) throw new Error(error.message);
      
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

          const cashFlowRecord = {
            account_id: newExpenseData.accountId,
            transaction_type: 'expense',
            amount: newExpenseData.amount,
            description: newExpenseData.description,
            reference_number: `EXP-${data.id.slice(4)}`, // Remove 'exp-' prefix
            source_type: sourceType,
            created_by: user.id,
            created_by_name: user.name || user.email || 'Unknown User'
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
        .eq('reference_number', `EXP-${expenseId.slice(4)}`);
      
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
    expenses,
    isLoading,
    addExpense,
    deleteExpense,
  }
}