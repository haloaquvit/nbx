import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CashHistory } from '@/types/cashFlow';
import { useBranch } from '@/contexts/BranchContext';

export function useCashFlow() {
  const { currentBranch } = useBranch();

  const {
    data: cashHistory,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['cashFlow', currentBranch?.id],
    queryFn: async (): Promise<CashHistory[]> => {
      let query = supabase
        .from('cash_history')
        .select('*')
        .order('created_at', { ascending: false });

      // Apply branch filter - ALWAYS filter by selected branch
      if (currentBranch?.id) {
        query = query.eq('branch_id', currentBranch.id);
      }

      const { data, error } = await query;

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
    },
    enabled: !!currentBranch,
    // Optimized for Dashboard usage - cash flow updates frequently
    staleTime: 2 * 60 * 1000, // 2 minutes - cash flow changes frequently
    gcTime: 5 * 60 * 1000, // 5 minutes cache
    refetchOnWindowFocus: false, // Don't refetch on window focus
    refetchOnReconnect: false, // Don't refetch on reconnect
    retry: 1, // Only retry once
    retryDelay: 1000,
  });

  return {
    cashHistory,
    isLoading,
    error,
    refetch
  };
}