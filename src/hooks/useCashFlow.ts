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
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        // If table doesn't exist, return empty array instead of throwing
        if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
          console.warn('cash_history table does not exist, returning empty array');
          return [];
        }
        throw new Error(`Failed to fetch cash history: ${error.message}`);
      }

      // Return the data directly since account_name is already in cash_history table
      return data || [];
    }
  });

  return {
    cashHistory,
    isLoading,
    error,
    refetch
  };
}