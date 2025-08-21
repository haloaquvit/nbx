import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CashHistory } from '@/types/cashFlow';

export function useCashFlow() {
  const {
    data: cashHistory,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['cashFlow'],
    queryFn: async (): Promise<CashHistory[]> => {
      const { data, error } = await supabase
        .from('cash_history')
        .select(`
          *,
          accounts (
            name
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        // If table doesn't exist, return empty array instead of throwing
        if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
          console.warn('cash_history table does not exist, returning empty array');
          return [];
        }
        throw new Error(`Failed to fetch cash history: ${error.message}`);
      }

      // Map the data to include account_name from the join, prioritizing the joined data
      const mappedData = (data || []).map(item => ({
        ...item,
        account_name: (item.accounts?.name) || item.account_name || 'Unknown Account'
      }));

      return mappedData;
    }
  });

  return {
    cashHistory,
    isLoading,
    error,
    refetch
  };
}