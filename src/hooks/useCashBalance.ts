import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranch } from '@/contexts/BranchContext';
import { useAccounts } from '@/hooks/useAccounts';

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

/**
 * useCashBalance - Menghitung saldo kas dari JOURNAL ENTRIES
 *
 * ARSITEKTUR BARU:
 * - Saldo akun dihitung dari journal_entry_lines (di useAccounts.ts)
 * - Kas masuk/keluar hari ini dihitung dari journal_entry_lines untuk akun kas/bank
 * - TIDAK LAGI menggunakan cash_history table
 *
 * Prinsip: Journal entries adalah SUMBER KEBENARAN untuk semua perhitungan keuangan
 */
export const useCashBalance = () => {
  const { currentBranch } = useBranch();
  const { accounts } = useAccounts(); // Get accounts with calculated balances per branch

  const { data: cashBalance, isLoading, error } = useQuery<CashBalance>({
    queryKey: ['cashBalance', currentBranch?.id, accounts?.length],
    queryFn: async () => {
      // Get today's date range (in local timezone)
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD format

      // Use accounts from useAccounts (already filtered and calculated per branch)
      const paymentAccounts = (accounts || []).filter(acc => acc.isPaymentAccount);

      // Initialize tracking variables
      let todayIncome = 0;
      let todayExpense = 0;
      let totalBalance = 0;
      const accountBalancesMap = new Map();

      // Initialize account data with calculated balances from useAccounts
      paymentAccounts.forEach(account => {
        accountBalancesMap.set(account.id, {
          accountId: account.id,
          accountName: account.name,
          accountCode: account.code,
          currentBalance: account.balance || 0,
          previousBalance: 0,
          todayIncome: 0,
          todayExpense: 0,
          todayNet: 0,
          todayChange: 0
        });
        totalBalance += account.balance || 0;
      });

      // ============================================================================
      // CALCULATE TODAY'S CASH MOVEMENT FROM JOURNAL_ENTRY_LINES
      // ============================================================================
      // Untuk menghitung kas masuk/keluar hari ini, kita perlu:
      // 1. Ambil semua journal_entry_lines untuk akun kas/bank (isPaymentAccount)
      // 2. Filter hanya jurnal hari ini yang posted dan tidak voided
      // 3. Debit = kas masuk, Credit = kas keluar (untuk akun Aset)
      // ============================================================================

      const paymentAccountIds = paymentAccounts.map(acc => acc.id);

      if (paymentAccountIds.length === 0) {
        console.log('💰 No payment accounts found');
        return {
          currentBalance: totalBalance,
          todayIncome: 0,
          todayExpense: 0,
          todayNet: 0,
          previousBalance: totalBalance,
          accountBalances: Array.from(accountBalancesMap.values())
        };
      }

      // Get today's journal entry lines for payment accounts
      const { data: todayJournalLines, error: journalError } = await supabase
        .from('journal_entry_lines')
        .select(`
          account_id,
          debit_amount,
          credit_amount,
          journal_entries!inner (
            entry_date,
            branch_id,
            status,
            is_voided,
            reference_type,
            description
          )
        `)
        .in('account_id', paymentAccountIds);

      if (journalError) {
        console.error('❌ Failed to fetch journal lines for cash balance:', journalError);
        // Return balance from accounts only
        return {
          currentBalance: totalBalance,
          todayIncome: 0,
          todayExpense: 0,
          todayNet: 0,
          previousBalance: totalBalance,
          accountBalances: Array.from(accountBalancesMap.values())
        };
      }

      // Filter and calculate today's transactions
      const todayLines = (todayJournalLines || []).filter((line: any) => {
        const journal = line.journal_entries;
        if (!journal) return false;

        // Must be today, posted, not voided, and same branch
        return journal.entry_date === todayStr &&
               journal.status === 'posted' &&
               journal.is_voided === false &&
               journal.branch_id === currentBranch?.id;
      });

      console.log('💰 Today journal lines for payment accounts:', todayLines.length);

      // Calculate today's income and expense per account
      // For Asset accounts (Kas/Bank): Debit = income (masuk), Credit = expense (keluar)
      todayLines.forEach((line: any) => {
        const accountId = line.account_id;
        const debitAmount = Number(line.debit_amount) || 0;
        const creditAmount = Number(line.credit_amount) || 0;

        // Update global totals
        todayIncome += debitAmount;
        todayExpense += creditAmount;

        // Update per-account data
        if (accountBalancesMap.has(accountId)) {
          const accountData = accountBalancesMap.get(accountId);
          accountData.todayIncome += debitAmount;
          accountData.todayExpense += creditAmount;
          accountData.todayNet = accountData.todayIncome - accountData.todayExpense;
          accountData.todayChange = accountData.todayNet;
        }
      });

      // Calculate totals
      const todayNet = todayIncome - todayExpense;
      const totalPreviousBalance = totalBalance - todayNet;

      // Calculate previous balance for each account
      accountBalancesMap.forEach(account => {
        account.previousBalance = account.currentBalance - account.todayNet;
      });

      // Debug summary
      console.log('📊 Cash Balance Summary (from Journal):');
      console.log(`💰 Today Income (Debit to Kas/Bank): Rp ${todayIncome.toLocaleString('id-ID')}`);
      console.log(`💸 Today Expense (Credit from Kas/Bank): Rp ${todayExpense.toLocaleString('id-ID')}`);
      console.log(`📈 Today Net: Rp ${todayNet.toLocaleString('id-ID')}`);
      console.log(`🏦 Total Balance: Rp ${totalBalance.toLocaleString('id-ID')}`);

      return {
        currentBalance: totalBalance,
        todayIncome,
        todayExpense,
        todayNet,
        previousBalance: totalPreviousBalance,
        accountBalances: Array.from(accountBalancesMap.values())
      };
    },
    enabled: !!currentBranch && !!accounts, // Only run when branch and accounts are loaded
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes cache
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    retryDelay: 1000,
  });

  return {
    cashBalance,
    isLoading,
    error
  };
};