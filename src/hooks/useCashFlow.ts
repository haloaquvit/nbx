import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CashHistory } from '@/types/cashFlow';
import { useBranch } from '@/contexts/BranchContext';
import { useAccounts } from '@/hooks/useAccounts';

/**
 * useCashFlow - Mengambil mutasi kas/bank dari JOURNAL ENTRIES
 *
 * ARSITEKTUR BARU:
 * - Cash flow dibaca dari journal_entry_lines untuk akun kas/bank (isPaymentAccount)
 * - TIDAK LAGI menggunakan cash_history table
 * - Format output tetap kompatibel dengan CashHistory interface
 *
 * Prinsip: Journal entries adalah SUMBER KEBENARAN untuk semua mutasi kas
 */
export function useCashFlow() {
  const { currentBranch } = useBranch();
  const { accounts } = useAccounts();

  const {
    data: cashHistory,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['cashFlow', currentBranch?.id, accounts?.length],
    queryFn: async (): Promise<CashHistory[]> => {
      // Get payment accounts (kas/bank)
      const paymentAccounts = (accounts || []).filter(acc => acc.isPaymentAccount);
      const paymentAccountIds = paymentAccounts.map(acc => acc.id);

      if (paymentAccountIds.length === 0) {
        console.log('📊 No payment accounts found for cash flow');
        return [];
      }

      // Create account lookup map
      const accountMap = new Map(paymentAccounts.map(acc => [acc.id, acc]));

      // Get journal entry lines for payment accounts
      const { data: journalLines, error: journalError } = await supabase
        .from('journal_entry_lines')
        .select(`
          id,
          account_id,
          account_code,
          account_name,
          debit_amount,
          credit_amount,
          description,
          journal_entries (
            id,
            entry_number,
            entry_date,
            description,
            reference_type,
            reference_id,
            status,
            is_voided,
            branch_id,
            created_at,
            created_by
          )
        `)
        .in('account_id', paymentAccountIds);

      if (journalError) {
        console.error('❌ Failed to fetch journal lines for cash flow:', journalError);
        return [];
      }

      // Filter only posted and not voided journals for current branch
      const filteredLines = (journalLines || []).filter((line: any) => {
        const journal = line.journal_entries;
        if (!journal) return false;
        return journal.status === 'posted' &&
               journal.is_voided === false &&
               journal.branch_id === currentBranch?.id;
      });

      // Sort by created_at descending
      filteredLines.sort((a: any, b: any) => {
        const dateA = new Date(a.journal_entries?.created_at || 0);
        const dateB = new Date(b.journal_entries?.created_at || 0);
        return dateB.getTime() - dateA.getTime();
      });

      // Transform to CashHistory format
      // For payment accounts: Debit = kas masuk (income), Credit = kas keluar (expense)
      const cashHistoryData: CashHistory[] = filteredLines.map((line: any) => {
        const journal = line.journal_entries;
        const debitAmount = Number(line.debit_amount) || 0;
        const creditAmount = Number(line.credit_amount) || 0;

        // Determine if this is income or expense
        const isIncome = debitAmount > 0;
        const amount = isIncome ? debitAmount : creditAmount;

        // Map reference_type to old type format for compatibility
        const typeMap: Record<string, CashHistory['type']> = {
          'transaction': 'orderan',
          'expense': 'pengeluaran',
          'payroll': 'gaji_karyawan',
          'advance': 'panjar_pengambilan',
          'transfer': isIncome ? 'transfer_masuk' : 'transfer_keluar',
          'receivable': 'pembayaran_piutang',
          'payable': 'pembayaran_hutang',
          'manual': isIncome ? 'kas_masuk_manual' : 'kas_keluar_manual',
        };

        return {
          id: line.id,
          account_id: line.account_id,
          account_name: line.account_name || accountMap.get(line.account_id)?.name || 'Unknown',
          type: typeMap[journal.reference_type] || (isIncome ? 'kas_masuk_manual' : 'kas_keluar_manual'),
          transaction_type: isIncome ? 'income' : 'expense',
          amount: amount,
          description: line.description || journal.description,
          reference_id: journal.reference_id,
          reference_number: journal.entry_number,
          created_at: journal.created_at,
          created_by: journal.created_by,
        };
      });

      console.log(`📊 Cash flow loaded from journal_entries: ${cashHistoryData.length} transactions`);
      return cashHistoryData;
    },
    enabled: !!currentBranch && !!accounts,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes cache
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    retryDelay: 1000,
  });

  return {
    cashHistory,
    isLoading,
    error,
    refetch
  };
}
