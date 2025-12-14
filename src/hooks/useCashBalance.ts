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
        // If table doesn't exist, return basic balance data from accounts only
        if (cashFlowError.code === 'PGRST116' || cashFlowError.message.includes('does not exist')) {
          console.warn('cash_history table does not exist, calculating balance from accounts only');
          
          // Get account balances - ONLY payment accounts
          const { data: accounts, error: accountsError } = await supabase
            .from('accounts')
            .select('id, name, balance, is_payment_account')
            .eq('is_payment_account', true) // Filter hanya akun pembayaran
            .order('name');

          if (accountsError) {
            throw new Error(`Failed to fetch accounts: ${accountsError.message}`);
          }

          let totalBalance = 0;
          const accountBalances = (accounts || []).map(account => {
            totalBalance += account.balance || 0;
            return {
              accountId: account.id,
              accountName: account.name,
              currentBalance: account.balance || 0,
              previousBalance: account.balance || 0,
              todayIncome: 0,
              todayExpense: 0,
              todayNet: 0,
              todayChange: 0
            };
          });

          return {
            currentBalance: totalBalance,
            todayIncome: 0,
            todayExpense: 0,
            todayNet: 0,
            previousBalance: totalBalance,
            accountBalances
          };
        }
        throw new Error(`Failed to fetch cash history: ${cashFlowError.message}`);
      }

      // Get account balances - ONLY payment accounts
      const { data: accounts, error: accountsError } = await supabase
        .from('accounts')
        .select('id, name, balance, is_payment_account')
        .eq('is_payment_account', true) // Filter hanya akun pembayaran
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

      // Debug: Log payroll records found
      const payrollRecords = (allCashFlow || []).filter(record =>
        record.type === 'gaji_karyawan' ||
        record.type === 'pembayaran_gaji' ||
        (record.type === 'kas_keluar_manual' &&
         (record.description?.includes('Pembayaran gaji') || record.description?.includes('Payroll Payment')))
      );

      console.log('💰 Debug Cash Balance Calculation:');
      console.log('📊 Total cash flow records:', (allCashFlow || []).length);
      console.log('💸 Payroll records found:', payrollRecords.length);
      payrollRecords.forEach(record => {
        console.log(`  - ${record.type}: ${record.amount} (${record.description})`);
      });
      console.log('📅 Today range:', todayStart, 'to', todayEnd);

      // Process cash flow records to calculate today's activity only
      (allCashFlow || []).forEach(record => {
        const recordDate = new Date(record.created_at);
        const isToday = recordDate >= todayStart && recordDate < todayEnd;
        
        // Only process today's transactions for income/expense calculation
        if (isToday) {
          // Debug log today's records
          if (record.type === 'gaji_karyawan' || record.type === 'pembayaran_gaji' ||
              (record.type === 'kas_keluar_manual' && record.description?.includes('Pembayaran gaji'))) {
            console.log('🎯 Processing payroll record for today:', {
              type: record.type,
              amount: record.amount,
              description: record.description,
              date: record.created_at
            });
          }
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
            (record.type && ['orderan', 'kas_masuk_manual', 'panjar_pelunasan', 'pembayaran_piutang'].includes(record.type));
            
          // All other types should be considered expenses
          const isExpense = record.transaction_type === 'expense' ||
            (record.type && ['pengeluaran', 'panjar_pengambilan', 'pembayaran_po', 'kas_keluar_manual', 'gaji_karyawan', 'pembayaran_gaji'].includes(record.type));

          if (isIncome) {
            todayIncome += record.amount;
          } else if (isExpense) {
            todayExpense += record.amount;
            // Debug: Log which records contribute to today's expenses
            if (record.type === 'gaji_karyawan' || record.type === 'pembayaran_gaji' ||
                (record.type === 'kas_keluar_manual' && record.description?.includes('Pembayaran gaji'))) {
              console.log('➕ Adding payroll to today expense:', record.amount, 'Total so far:', todayExpense);
            }
          }

          // Update account today data
          if (record.account_id && accountBalances.has(record.account_id)) {
            const current = accountBalances.get(record.account_id);
            if (isIncome) {
              current.todayIncome += record.amount;
            } else if (isExpense) {
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

      // Debug summary
      console.log('📊 Final Cash Balance Summary:');
      console.log(`💰 Today Income: Rp ${todayIncome.toLocaleString('id-ID')}`);
      console.log(`💸 Today Expense: Rp ${todayExpense.toLocaleString('id-ID')}`);
      console.log(`📈 Today Net: Rp ${todayNet.toLocaleString('id-ID')}`);
      console.log(`🏦 Total Balance: Rp ${totalBalance.toLocaleString('id-ID')}`);
      console.log('---');

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