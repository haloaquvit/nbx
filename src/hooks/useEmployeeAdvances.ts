import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { EmployeeAdvance, AdvanceRepayment } from '@/types/employeeAdvance'
import { useAccounts } from './useAccounts';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useBranch } from '@/contexts/BranchContext';

const fromDbToApp = (dbAdvance: any): EmployeeAdvance => ({
  id: dbAdvance.id,
  employeeId: dbAdvance.employee_id,
  employeeName: dbAdvance.employee_name,
  amount: dbAdvance.amount,
  date: new Date(dbAdvance.date),
  notes: dbAdvance.notes,
  remainingAmount: dbAdvance.remaining_amount,
  repayments: (dbAdvance.advance_repayments || []).map((r: any) => ({
    id: r.id,
    amount: r.amount,
    date: new Date(r.date),
    recordedBy: r.recorded_by,
  })),
  createdAt: new Date(dbAdvance.created_at),
  accountId: dbAdvance.account_id,
  accountName: dbAdvance.account_name,
});

const fromAppToDb = (appAdvance: Partial<EmployeeAdvance>) => {
  const dbData: { [key: string]: any } = {};
  if (appAdvance.id !== undefined) dbData.id = appAdvance.id;
  if (appAdvance.employeeId !== undefined) dbData.employee_id = appAdvance.employeeId;
  if (appAdvance.employeeName !== undefined) dbData.employee_name = appAdvance.employeeName;
  if (appAdvance.amount !== undefined) dbData.amount = appAdvance.amount;
  if (appAdvance.date !== undefined) dbData.date = appAdvance.date;
  if (appAdvance.notes !== undefined) dbData.notes = appAdvance.notes;
  if (appAdvance.remainingAmount !== undefined) dbData.remaining_amount = appAdvance.remainingAmount;
  if (appAdvance.accountId !== undefined) dbData.account_id = appAdvance.accountId;
  if (appAdvance.accountName !== undefined) dbData.account_name = appAdvance.accountName;
  return dbData;
};

export const useEmployeeAdvances = () => {
  const queryClient = useQueryClient();
  const { updateAccountBalance } = useAccounts();
  const { user } = useAuth();
  const { currentBranch } = useBranch();

  const { data: advances, isLoading, isError, error } = useQuery<EmployeeAdvance[]>({
    queryKey: ['employeeAdvances', currentBranch?.id, user?.id],
    queryFn: async () => {
      let query = supabase.from('employee_advances').select('*, advance_repayments:advance_repayments(*)');

      // Apply branch filter - ALWAYS filter by selected branch
      if (currentBranch?.id) {
        query = query.eq('branch_id', currentBranch.id);
      }

      // Role-based filtering: only kasir, admin, owner can see all data
      // Other users can only see their own advances
      if (user && !['kasir', 'admin', 'owner'].includes(user.role || '')) {
        query = query.eq('employee_id', user.id);
      }

      const { data, error } = await query;
      if (error) {
        console.error("❌ Gagal mengambil data panjar:", error.message);
        throw new Error(error.message);
      }
      return data ? data.map(fromDbToApp) : [];
    },
    enabled: !!currentBranch,
    // Optimized for panjar management
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes cache
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    retryDelay: 1000,
  });

  const addAdvance = useMutation({
    mutationFn: async (newData: Omit<EmployeeAdvance, 'id' | 'createdAt' | 'remainingAmount' | 'repayments'>): Promise<EmployeeAdvance> => {
      const advanceToInsert = {
        ...newData,
        remainingAmount: newData.amount,
      };
      const dbData = fromAppToDb(advanceToInsert);
      
      const { data, error } = await supabase
        .from('employee_advances')
        .insert({ ...dbData, id: `adv-${Date.now()}` })
        .select()
        .single();

      if (error) throw new Error(error.message);
      
      // Decrease payment account (kas/bank)
      updateAccountBalance.mutate({ accountId: newData.accountId, amount: -newData.amount });

      // Increase panjar karyawan account (1220) - this is an asset
      updateAccountBalance.mutate({ accountId: 'acc-1220', amount: newData.amount });

      // Record in cash_history for advance tracking
      if (newData.accountId && user) {
        try {
          const cashFlowRecord = {
            account_id: newData.accountId,
            account_name: newData.accountName || 'Unknown Account',
            type: 'panjar_pengambilan',
            amount: newData.amount,
            description: `Panjar karyawan untuk ${newData.employeeName}: ${newData.notes || 'Tidak ada keterangan'}`,
            reference_id: data.id,
            reference_name: `Panjar ${data.id}`,
            user_id: user.id,
            user_name: user.name || user.email || 'Unknown User'
          };

          console.log('Recording advance in cash history:', cashFlowRecord);

          const { error: cashFlowError } = await supabase
            .from('cash_history')
            .insert(cashFlowRecord);

          if (cashFlowError) {
            console.error('Failed to record advance in cash flow:', cashFlowError.message);
          } else {
            console.log('Successfully recorded advance in cash history');
          }
        } catch (error) {
          console.error('Error recording advance cash flow:', error);
        }
      }

      return fromDbToApp({ ...data, advance_repayments: [] });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employeeAdvances'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['cashFlow'] });
    },
  });

  const addRepayment = useMutation({
    mutationFn: async ({ advanceId, repaymentData, accountId, accountName }: { 
      advanceId: string, 
      repaymentData: Omit<AdvanceRepayment, 'id'>,
      accountId?: string,
      accountName?: string
    }): Promise<void> => {
      const newRepayment = {
        id: `rep-${Date.now()}`,
        advance_id: advanceId,
        amount: repaymentData.amount,
        date: repaymentData.date,
        recorded_by: repaymentData.recordedBy,
      };
      const { error: insertError } = await supabase.from('advance_repayments').insert(newRepayment);
      if (insertError) throw insertError;

      // Call RPC to update remaining amount
      const { error: rpcError } = await supabase.rpc('update_remaining_amount', {
        p_advance_id: advanceId
      });
      if (rpcError) throw new Error(rpcError.message);

      // Record repayment in cash_history as income (panjar pelunasan)
      if (accountId && user) {
        try {
          // Get advance details for the description
          const { data: advance } = await supabase
            .from('employee_advances')
            .select('employee_name')
            .eq('id', advanceId)
            .single();

          const cashFlowRecord = {
            account_id: accountId,
            account_name: accountName || 'Unknown Account',
            type: 'panjar_pelunasan',
            amount: repaymentData.amount,
            description: `Pelunasan panjar dari ${advance?.employee_name || 'karyawan'} - ${advanceId}`,
            reference_id: newRepayment.id,
            reference_name: `Pelunasan Panjar ${newRepayment.id}`,
            user_id: user.id,
            user_name: user.name || user.email || 'Unknown User'
          };

          console.log('Recording repayment in cash history:', cashFlowRecord);

          const { error: cashFlowError } = await supabase
            .from('cash_history')
            .insert(cashFlowRecord);

          if (cashFlowError) {
            console.error('Failed to record repayment in cash flow:', cashFlowError.message);
          } else {
            console.log('Successfully recorded repayment in cash history');
            // Update account balance for the repayment
            if (accountId) {
              // Increase payment account (kas/bank)
              updateAccountBalance.mutate({ accountId, amount: repaymentData.amount });
              // Decrease panjar karyawan account (1220) - reduce asset
              updateAccountBalance.mutate({ accountId: 'acc-1220', amount: -repaymentData.amount });
            }
          }
        } catch (error) {
          console.error('Error recording repayment cash flow:', error);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employeeAdvances'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['cashFlow'] });
    }
  });

  const deleteAdvance = useMutation({
    mutationFn: async (advanceToDelete: EmployeeAdvance): Promise<void> => {
      // First delete related cash_history records
      const { error: cashHistoryError } = await supabase
        .from('cash_history')
        .delete()
        .eq('reference_id', advanceToDelete.id);
      
      if (cashHistoryError) {
        console.error('Failed to delete related cash history:', cashHistoryError.message);
        // Continue anyway, don't throw
      }

      // Delete associated repayments first
      await supabase.from('advance_repayments').delete().eq('advance_id', advanceToDelete.id);
      
      // Then delete the advance itself
      const { error } = await supabase.from('employee_advances').delete().eq('id', advanceToDelete.id);
      if (error) throw new Error(error.message);

      // Reimburse the payment account with the original amount
      updateAccountBalance.mutate({ accountId: advanceToDelete.accountId, amount: advanceToDelete.amount });
      
      // Decrease panjar karyawan account (1220) since we're removing the advance
      updateAccountBalance.mutate({ accountId: 'acc-1220', amount: -advanceToDelete.amount });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employeeAdvances'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['cashFlow'] });
    }
  });

  return {
    advances,
    isLoading,
    isError,
    error,
    addAdvance,
    addRepayment,
    deleteAdvance,
  }
}