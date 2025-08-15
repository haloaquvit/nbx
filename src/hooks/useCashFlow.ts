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
          accounts!account_id (
            name
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch cash history: ${error.message}`);
      }

      // Map the data to include account_name from the join if missing
      const mappedData = (data || []).map(item => ({
        ...item,
        account_name: item.account_name || (item.accounts?.name) || 'Unknown Account'
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