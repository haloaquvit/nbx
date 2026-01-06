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
      // Use the dedicated RPC for fetching payment history
      // This is much faster and bypasses the complex journal entry parsing on the client side
      const { data, error } = await supabase.rpc('get_payment_history_rpc', {
        p_branch_id: currentBranch?.id,
        p_limit: 100 // Load last 100 payments by default
      });

      if (error) {
        console.error('Failed to fetch payment history via RPC:', error);
        return [];
      }

      // Transform to PaymentHistory interface
      return (data || []).map((item: any) => ({
        id: item.id,
        account_id: '', // Not returned by RPC directly but valid for display
        account_name: item.payment_method === 'transfer' ? 'Bank' : 'Kas Besar', // Simplified mapping or fetch if needed
        type: 'pembayaran_piutang',
        amount: item.amount,
        description: item.notes || `Pembayaran Piutang: ${item.transaction_id}`,
        reference_id: item.transaction_id,
        reference_name: item.transaction_id,
        user_id: '',
        user_name: 'System', // Or join with users table if needed
        created_at: new Date(item.payment_date || item.created_at)
      }));
    },
    enabled: !!currentBranch,
    staleTime: 1 * 60 * 1000, // 1 minute stale time
    gcTime: 5 * 60 * 1000,
    retry: 1,
  })
})

return {
  paymentHistory: paymentHistory || [],
  isLoading
}
}
