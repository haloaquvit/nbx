import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface CashBalance {
  currentBalance: number;
  todayIncome: number;
  todayExpense: number;
  todayNet: number;
  previousBalance: number;
  accountBalances: Array<{
    accountId: string;
    accountName: string;
    currentBalance: number;
    previousBalance: number;
    todayIncome: number;
    todayExpense: number;
    todayNet: number;
    todayChange: number;
  }>;
}

export const useCashBalance = () => {
  const { data: cashBalance, isLoading, error } = useQuery<CashBalance>({
    queryKey: ['cashBalance'],
    queryFn: async () => {
      // Get today's date range
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

      // Get all cash flow records
      const { data: allCashFlow, error: cashFlowError } = await supabase
        .from('cash_history')
        .select('*')
        .order('created_at', { ascending: true });

      if (cashFlowError) {
        throw new Error(`Failed to fetch cash history: ${cashFlowError.message}`);
      }

      // Get account balances
      const { data: accounts, error: accountsError } = await supabase
        .from('accounts')
        .select('id, name, balance')
        .order('name');

      if (accountsError) {
        throw new Error(`Failed to fetch accounts: ${accountsError.message}`);
      }

      // Initialize tracking variables
      let todayIncome = 0;
      let todayExpense = 0;
      let totalBalance = 0;
      const accountBalances = new Map();

      // Initialize account data with current balances from accounts table
      (accounts || []).forEach(account => {
        accountBalances.set(account.id, {
          accountId: account.id,
          accountName: account.name,
          currentBalance: account.balance || 0,
          previousBalance: 0,
          todayIncome: 0,
          todayExpense: 0,
          todayNet: 0,
          todayChange: 0
        });
        totalBalance += account.balance || 0;
      });

      // Process cash flow records to calculate today's activity only
      (allCashFlow || []).forEach(record => {
        const recordDate = new Date(record.created_at);
        const isToday = recordDate >= todayStart && recordDate < todayEnd;
        
        // Only process today's transactions for income/expense calculation
        if (isToday) {
          // Skip transfers in total calculation (they don't change total cash, only move between accounts)
          if (record.source_type === 'transfer_masuk' || record.source_type === 'transfer_keluar') {
            // Still update per-account data for transfers
            if (record.account_id && accountBalances.has(record.account_id)) {
              const current = accountBalances.get(record.account_id);
              if (record.source_type === 'transfer_masuk') {
                current.todayIncome += record.amount;
              } else if (record.source_type === 'transfer_keluar') {
                current.todayExpense += record.amount;
              }
              current.todayNet = current.todayIncome - current.todayExpense;
              current.todayChange = current.todayNet;
            }
            return; // Skip adding to total income/expense
          }

          // Determine if this is income or expense (exclude transfers)
          const isIncome = record.transaction_type === 'income' || 
            (record.type && ['orderan', 'kas_masuk_manual', 'panjar_pelunasan', 'pemutihan_piutang'].includes(record.type));

          if (isIncome) {
            todayIncome += record.amount;
          } else {
            todayExpense += record.amount;
          }

          // Update account today data
          if (record.account_id && accountBalances.has(record.account_id)) {
            const current = accountBalances.get(record.account_id);
            if (isIncome) {
              current.todayIncome += record.amount;
            } else {
              current.todayExpense += record.amount;
            }
            current.todayNet = current.todayIncome - current.todayExpense;
            current.todayChange = current.todayNet;
          }
        }
      });

      // Calculate totals based on accounts table + today's activity
      const todayNet = todayIncome - todayExpense;
      const totalPreviousBalance = totalBalance - todayNet;

      // Calculate previous balance for each account
      accountBalances.forEach(account => {
        account.previousBalance = account.currentBalance - account.todayNet;
      });

      return {
        currentBalance: totalBalance,
        todayIncome,
        todayExpense,
        todayNet,
        previousBalance: totalPreviousBalance,
        accountBalances: Array.from(accountBalances.values())
      };
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  return {
    cashBalance,
    isLoading,
    error
  };
};