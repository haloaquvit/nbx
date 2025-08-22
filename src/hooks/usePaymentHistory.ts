import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

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

export const usePaymentHistory = (filters?: {
  date_from?: string
  date_to?: string
  account_id?: string
}) => {
  const { data: paymentHistory, isLoading } = useQuery<PaymentHistory[]>({
    queryKey: ['paymentHistory', filters],
    queryFn: async () => {
      let query = supabase
        .from('cash_history')
        .select('*')
        .eq('type', 'pemutihan_piutang')
        .order('created_at', { ascending: false })

      // Apply filters
      if (filters?.date_from) {
        query = query.gte('created_at', filters.date_from)
      }
      if (filters?.date_to) {
        query = query.lte('created_at', filters.date_to)
      }
      if (filters?.account_id && filters.account_id !== 'all') {
        query = query.eq('account_id', filters.account_id)
      }

      const { data, error } = await query

      if (error) {
        // If cash_history table doesn't exist, return empty array
        if (error.code === '42P01' || error.code === 'PGRST116' || error.code === 'PGRST205') {
          console.warn('cash_history table does not exist, returning empty payment history')
          return []
        }
        throw new Error(error.message)
      }

      return data?.map(record => ({
        id: record.id,
        account_id: record.account_id,
        account_name: record.account_name,
        type: record.type,
        amount: record.amount,
        description: record.description,
        reference_id: record.reference_id,
        reference_name: record.reference_name,
        user_id: record.user_id,
        user_name: record.user_name,
        created_at: new Date(record.created_at)
      })) || []
    }
  })

  return {
    paymentHistory: paymentHistory || [],
    isLoading
  }
}