import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AccountsPayable, PayablePayment } from '@/types/accountsPayable'
import { supabase } from '@/integrations/supabase/client'
import { useExpenses } from './useExpenses'
import { useAuth } from './useAuth'

const fromDb = (dbPayable: any): AccountsPayable => ({
  id: dbPayable.id,
  purchaseOrderId: dbPayable.purchase_order_id,
  supplierName: dbPayable.supplier_name,
  amount: dbPayable.amount,
  dueDate: dbPayable.due_date ? new Date(dbPayable.due_date) : undefined,
  description: dbPayable.description,
  status: dbPayable.status,
  createdAt: new Date(dbPayable.created_at),
  paidAt: dbPayable.paid_at ? new Date(dbPayable.paid_at) : undefined,
  paidAmount: dbPayable.paid_amount,
  paymentAccountId: dbPayable.payment_account_id,
  notes: dbPayable.notes,
})

const toDb = (appPayable: Partial<AccountsPayable>) => ({
  id: appPayable.id,
  purchase_order_id: appPayable.purchaseOrderId,
  supplier_name: appPayable.supplierName,
  amount: appPayable.amount,
  due_date: appPayable.dueDate || null,
  description: appPayable.description,
  status: appPayable.status,
  paid_at: appPayable.paidAt || null,
  paid_amount: appPayable.paidAmount || null,
  payment_account_id: appPayable.paymentAccountId || null,
  notes: appPayable.notes || null,
})

export const useAccountsPayable = () => {
  const queryClient = useQueryClient()
  const { addExpense } = useExpenses()
  const { user } = useAuth()

  const { data: accountsPayable, isLoading } = useQuery<AccountsPayable[]>({
    queryKey: ['accountsPayable'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounts_payable')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) throw new Error(error.message)
      return data ? data.map(fromDb) : []
    }
  })

  const createAccountsPayable = useMutation({
    mutationFn: async (newPayable: Omit<AccountsPayable, 'id' | 'createdAt'>): Promise<AccountsPayable> => {
      const payableId = `AP-${Date.now()}`
      const dbData = toDb({
        ...newPayable,
        id: payableId,
        createdAt: new Date(),
      })

      const { data, error } = await supabase
        .from('accounts_payable')
        .insert(dbData)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return fromDb(data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountsPayable'] })
    },
  })

  const payAccountsPayable = useMutation({
    mutationFn: async ({ 
      payableId, 
      amount, 
      paymentAccountId, 
      notes 
    }: { 
      payableId: string
      amount: number
      paymentAccountId: string
      notes?: string 
    }) => {
      const paymentDate = new Date()
      
      // Get current payable data
      const { data: currentPayable, error: fetchError } = await supabase
        .from('accounts_payable')
        .select('*')
        .eq('id', payableId)
        .single()

      if (fetchError) throw fetchError

      const currentPaidAmount = currentPayable.paid_amount || 0
      const newPaidAmount = currentPaidAmount + amount
      const isFullyPaid = newPaidAmount >= currentPayable.amount

      // Update accounts payable
      const { data: updatedPayable, error: updateError } = await supabase
        .from('accounts_payable')
        .update({
          paid_amount: newPaidAmount,
          status: isFullyPaid ? 'Paid' : 'Partial',
          paid_at: isFullyPaid ? paymentDate : currentPayable.paid_at,
          payment_account_id: paymentAccountId,
          notes: notes || currentPayable.notes
        })
        .eq('id', payableId)
        .select()
        .single()

      if (updateError) throw updateError

      // Create expense record
      await addExpense.mutateAsync({
        description: `Pembayaran utang supplier - ${currentPayable.description}`,
        amount: amount,
        accountId: paymentAccountId,
        accountName: '', // Will be filled by useExpenses hook
        date: paymentDate,
        category: 'Pembayaran Utang',
      })

      // Record in cash_history for accounts payable payment tracking
      if (paymentAccountId && user) {
        try {
          // Get account name for the payment account
          const { data: account } = await supabase
            .from('accounts')
            .select('name')
            .eq('id', paymentAccountId)
            .single();

          const cashFlowRecord = {
            account_id: paymentAccountId,
            account_name: account?.name || 'Unknown Account',
            type: 'pembayaran_utang',
            amount: amount,
            description: `Pembayaran utang supplier - ${currentPayable.description}`,
            reference_id: payableId,
            reference_name: `Accounts Payable ${payableId}`,
            user_id: user.id,
            user_name: user.name || user.email || 'Unknown User',
            transaction_type: 'expense'
          };

          console.log('Recording accounts payable payment in cash history:', cashFlowRecord);

          const { error: cashFlowError } = await supabase
            .from('cash_history')
            .insert(cashFlowRecord);

          if (cashFlowError) {
            console.error('Failed to record accounts payable payment in cash flow:', cashFlowError.message);
          } else {
            console.log('Successfully recorded accounts payable payment in cash history');
          }
        } catch (error) {
          console.error('Error recording accounts payable payment cash flow:', error);
        }
      } else {
        console.log('Skipping accounts payable payment cash flow record - missing paymentAccountId or user:', {
          paymentAccountId,
          user: user ? 'exists' : 'missing'
        });
      }

      return fromDb(updatedPayable)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountsPayable'] })
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['cashFlow'] })
      queryClient.invalidateQueries({ queryKey: ['cashBalance'] })
    }
  })

  const deleteAccountsPayable = useMutation({
    mutationFn: async (payableId: string) => {
      const { error } = await supabase
        .from('accounts_payable')
        .delete()
        .eq('id', payableId)
      
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountsPayable'] })
    },
  })

  return {
    accountsPayable,
    isLoading,
    createAccountsPayable,
    payAccountsPayable,
    deleteAccountsPayable,
  }
}