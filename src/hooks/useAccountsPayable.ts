import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AccountsPayable, PayablePayment } from '@/types/accountsPayable'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from './useAuth'
import { useBranch } from '@/contexts/BranchContext'
import { generateSequentialId } from '@/utils/idGenerator'

const fromDb = (dbPayable: any): AccountsPayable => ({
  id: dbPayable.id,
  purchaseOrderId: dbPayable.purchase_order_id,
  supplierName: dbPayable.supplier_name,
  creditorType: dbPayable.creditor_type,
  amount: dbPayable.amount,
  interestRate: dbPayable.interest_rate,
  interestType: dbPayable.interest_type,
  dueDate: dbPayable.due_date ? new Date(dbPayable.due_date) : undefined,
  description: dbPayable.description,
  status: dbPayable.status,
  createdAt: new Date(dbPayable.created_at),
  paidAt: dbPayable.paid_at ? new Date(dbPayable.paid_at) : undefined,
  paidAmount: dbPayable.paid_amount,
  paymentAccountId: dbPayable.payment_account_id,
  notes: dbPayable.notes,
})

const toDb = (appPayable: Partial<AccountsPayable> & { branchId?: string }) => ({
  id: appPayable.id,
  purchase_order_id: appPayable.purchaseOrderId,
  supplier_name: appPayable.supplierName,
  amount: appPayable.amount,
  due_date: appPayable.dueDate || null,
  description: appPayable.description,
  status: appPayable.status,
  paid_at: appPayable.paidAt || null,
  paid_amount: appPayable.paidAmount !== undefined ? appPayable.paidAmount : 0, // Default to 0, not null
  payment_account_id: appPayable.paymentAccountId || null,
  notes: appPayable.notes || null,
  branch_id: appPayable.branchId || null,
})

export const useAccountsPayable = () => {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { currentBranch } = useBranch()

  const { data: accountsPayable, isLoading } = useQuery<AccountsPayable[]>({
    queryKey: ['accountsPayable', currentBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('accounts_payable')
        .select('*')
        .order('created_at', { ascending: false });

      // Apply branch filter - ALWAYS filter by selected branch
      if (currentBranch?.id) {
        query = query.eq('branch_id', currentBranch.id);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data ? data.map(fromDb) : [];
    },
    enabled: !!currentBranch,
    // Optimized for accounts payable management
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes cache
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    retryDelay: 1000,
  })

  const createAccountsPayable = useMutation({
    mutationFn: async (newPayable: Omit<AccountsPayable, 'id' | 'createdAt'>): Promise<AccountsPayable> => {
      // Generate ID with sequential number using utility function
      const payableId = await generateSequentialId({
        branchName: currentBranch?.name,
        tableName: 'accounts_payable',
        pageCode: 'HT-AP',
        branchId: currentBranch?.id || null,
      })

      const dbData = toDb({
        ...newPayable,
        id: payableId,
        createdAt: new Date(),
        paidAmount: newPayable.paidAmount ?? 0, // Ensure paidAmount is always set to 0 if not provided
        branchId: currentBranch?.id,
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
      liabilityAccountId,
      notes
    }: {
      payableId: string
      amount: number
      paymentAccountId: string
      liabilityAccountId: string
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

      // Get payment account info
      const { data: paymentAccount } = await supabase
        .from('accounts')
        .select('id, name, code')
        .eq('id', paymentAccountId)
        .single()

      // Get liability account info
      const { data: liabilityAccount } = await supabase
        .from('accounts')
        .select('id, name, code')
        .eq('id', liabilityAccountId)
        .single()

      console.log('Payment account:', paymentAccount)
      console.log('Liability account:', liabilityAccount)

      // Update payment account balance (decrease cash/bank)
      if (paymentAccountId) {
        const { data: paymentAccData, error: fetchPaymentErr } = await supabase
          .from('accounts')
          .select('balance')
          .eq('id', paymentAccountId)
          .single()

        if (!fetchPaymentErr && paymentAccData) {
          const currentBalance = Number(paymentAccData.balance) || 0
          const newBalance = currentBalance - amount // Decrease cash/bank

          const { error: updatePaymentError } = await supabase
            .from('accounts')
            .update({ balance: newBalance })
            .eq('id', paymentAccountId)

          if (updatePaymentError) {
            console.error('Error updating payment account balance:', updatePaymentError)
          } else {
            console.log(`Payment account ${paymentAccountId} balance updated: ${currentBalance} -> ${newBalance}`)
          }
        }
      }

      // Update liability account balance (decrease liability/hutang)
      if (liabilityAccountId) {
        const { data: liabilityAccData, error: fetchLiabilityErr } = await supabase
          .from('accounts')
          .select('balance')
          .eq('id', liabilityAccountId)
          .single()

        if (!fetchLiabilityErr && liabilityAccData) {
          const currentBalance = Number(liabilityAccData.balance) || 0
          const newBalance = currentBalance - amount // Decrease liability

          const { error: updateLiabilityError } = await supabase
            .from('accounts')
            .update({ balance: newBalance })
            .eq('id', liabilityAccountId)

          if (updateLiabilityError) {
            console.error('Error updating liability account balance:', updateLiabilityError)
          } else {
            console.log(`Liability account ${liabilityAccountId} balance updated: ${currentBalance} -> ${newBalance}`)
          }
        }
      }

      // Record in cash_history for tracking
      if (user) {
        const liabilityInfo = liabilityAccount ? `(${liabilityAccount.code || ''} ${liabilityAccount.name})` : ''
        const cashFlowRecord = {
          account_id: paymentAccountId,
          account_name: paymentAccount?.name || 'Unknown Account',
          type: 'pembayaran_hutang',
          amount: amount,
          description: `Pembayaran hutang ${liabilityInfo} - ${currentPayable.description}`,
          reference_id: payableId,
          reference_name: `Pembayaran Hutang ${currentPayable.supplier_name}`,
          user_id: user.id,
          user_name: user.name || user.email || 'Unknown User',
          branch_id: currentBranch?.id || null,
        }

        console.log('Recording payment in cash history:', cashFlowRecord)

        const { error: cashFlowError } = await supabase
          .from('cash_history')
          .insert(cashFlowRecord)

        if (cashFlowError) {
          console.error('Failed to record payment in cash flow:', cashFlowError.message)
        }
      }

      const isPurchaseOrderPayment = !!currentPayable.purchase_order_id

      // Update PO status to Selesai if this is a PO payment and fully paid
      if (isPurchaseOrderPayment && isFullyPaid) {
        await supabase
          .from('purchase_orders')
          .update({ status: 'Selesai' })
          .eq('id', currentPayable.purchase_order_id)
      }

      return fromDb(updatedPayable)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountsPayable'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['cashFlow'] })
      queryClient.invalidateQueries({ queryKey: ['cashBalance'] })
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] }) // Refresh PO status after payment
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