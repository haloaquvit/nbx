import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useBranch } from '@/contexts/BranchContext'
import { useAccounts } from '@/hooks/useAccounts'

export interface PaymentHistory {
  id: string
  account_id: string
  account_name: string
  type: string
  amount: number
  description: string
  reference_id: string
  reference_name: string
  user_id: string
  user_name: string
  created_at: Date
}

/**
 * usePaymentHistory - Mengambil riwayat pembayaran piutang dari JOURNAL ENTRIES
 *
 * ARSITEKTUR BARU:
 * - Data diambil dari journal_entry_lines dengan reference_type='receivable'
 * - TIDAK LAGI menggunakan cash_history table
 */
export const usePaymentHistory = (filters?: {
  date_from?: string
  date_to?: string
  account_id?: string
}) => {
  const { currentBranch } = useBranch();
  const { accounts } = useAccounts();

  const { data: paymentHistory, isLoading } = useQuery<PaymentHistory[]>({
    queryKey: ['paymentHistory', currentBranch?.id, filters, accounts?.length],
    queryFn: async () => {
      // Get payment accounts (kas/bank)
      const paymentAccounts = (accounts || []).filter(acc => acc.isPaymentAccount);
      const paymentAccountIds = paymentAccounts.map(acc => acc.id);

      if (paymentAccountIds.length === 0) {
        return [];
      }

      // Create account lookup map
      const accountMap = new Map(paymentAccounts.map(acc => [acc.id, acc]));

      // Query journal entries with reference_type='receivable'
      let query = supabase
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

      const { data: journalLines, error } = await query;

      if (error) {
        console.error('Failed to fetch payment history from journal entries:', error);
        return [];
      }

      // Filter: reference_type='receivable', posted, not voided, current branch, debit > 0 (kas masuk)
      const filteredLines = (journalLines || []).filter((line: any) => {
        const journal = line.journal_entries;
        if (!journal) return false;

        const isReceivablePayment = journal.reference_type === 'receivable';
        const isPosted = journal.status === 'posted';
        const isNotVoided = journal.is_voided === false;
        const isCurrentBranch = journal.branch_id === currentBranch?.id;
        const isDebit = Number(line.debit_amount) > 0; // Kas masuk = debit untuk akun kas

        // Apply date filters
        let passDateFilter = true;
        if (filters?.date_from) {
          passDateFilter = passDateFilter && new Date(journal.created_at) >= new Date(filters.date_from);
        }
        if (filters?.date_to) {
          passDateFilter = passDateFilter && new Date(journal.created_at) <= new Date(filters.date_to);
        }

        // Apply account filter
        let passAccountFilter = true;
        if (filters?.account_id && filters.account_id !== 'all') {
          passAccountFilter = line.account_id === filters.account_id;
        }

        return isReceivablePayment && isPosted && isNotVoided && isCurrentBranch && isDebit && passDateFilter && passAccountFilter;
      });

      // Sort by created_at descending
      filteredLines.sort((a: any, b: any) => {
        const dateA = new Date(a.journal_entries?.created_at || 0);
        const dateB = new Date(b.journal_entries?.created_at || 0);
        return dateB.getTime() - dateA.getTime();
      });

      // Transform to PaymentHistory format
      return filteredLines.map((line: any): PaymentHistory => {
        const journal = line.journal_entries;
        const account = accountMap.get(line.account_id);

        return {
          id: line.id,
          account_id: line.account_id,
          account_name: line.account_name || account?.name || 'Unknown',
          type: 'pembayaran_piutang',
          amount: Number(line.debit_amount) || 0,
          description: line.description || journal.description,
          reference_id: journal.reference_id || '',
          reference_name: journal.entry_number || '',
          user_id: journal.created_by || '',
          user_name: '', // Not available in journal_entries, can be fetched separately if needed
          created_at: new Date(journal.created_at)
        };
      });
    },
    enabled: !!currentBranch && !!accounts,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    retryDelay: 1000,
  })

  return {
    paymentHistory: paymentHistory || [],
    isLoading
  }
}
