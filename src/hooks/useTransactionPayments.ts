import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

export interface PaymentRecord {
    id: string
    payment_date: string
    amount: number
    payment_method: string
    notes: string | null
    created_at: string
    created_by_name: string | null
}

export const useTransactionPayments = (transactionId: string) => {
    return useQuery({
        queryKey: ['transaction_payments', transactionId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('transaction_payments')
                .select(`
          id,
          payment_date,
          amount,
          payment_method,
          notes,
          created_at,
          created_by
        `)
                .eq('transaction_id', transactionId)
                .order('payment_date', { ascending: false });

            if (error) {
                console.error('Error fetching payments:', error);
                throw error;
            }

            return data as PaymentRecord[];
        },
        enabled: !!transactionId,
    });
};
