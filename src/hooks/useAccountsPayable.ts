import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AccountsPayable, PayablePayment } from '@/types/accountsPayable'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from './useAuth'
import { useBranch } from '@/contexts/BranchContext'
import { generateSequentialId } from '@/utils/idGenerator'
import { createPayablePaymentJournal } from '@/services/journalService'

// ============================================================================
// CATATAN PENTING: DOUBLE-ENTRY ACCOUNTING SYSTEM
// ============================================================================
// Semua saldo akun HANYA dihitung dari journal_entries (tidak ada update balance langsung)
// cash_history digunakan HANYA untuk Buku Kas Harian (monitoring), TIDAK update balance
// Jurnal otomatis dibuat melalui journalService untuk setiap pembayaran hutang
// ============================================================================

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

      // Use .limit(1) and handle array response because our client forces Accept: application/json
      const { data: dataRaw, error } = await supabase
        .from('accounts_payable')
        .insert(dbData)
        .select()
        .limit(1)

      if (error) throw new Error(error.message)
      const data = Array.isArray(dataRaw) ? dataRaw[0] : dataRaw
      if (!data) throw new Error('Failed to create accounts payable')
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
      // Use .limit(1) and handle array response because our client forces Accept: application/json
      const { data: currentPayableRaw, error: fetchError } = await supabase
        .from('accounts_payable')
        .select('*')
        .eq('id', payableId)
        .limit(1)

      if (fetchError) throw fetchError
      const currentPayable = Array.isArray(currentPayableRaw) ? currentPayableRaw[0] : currentPayableRaw
      if (!currentPayable) throw new Error('Payable not found')

      const currentPaidAmount = currentPayable.paid_amount || 0
      const newPaidAmount = currentPaidAmount + amount
      const isFullyPaid = newPaidAmount >= currentPayable.amount

      // Update accounts payable
      // Use .limit(1) and handle array response because our client forces Accept: application/json
      const { data: updatedPayableRaw, error: updateError } = await supabase
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
        .limit(1)

      if (updateError) throw updateError
      const updatedPayable = Array.isArray(updatedPayableRaw) ? updatedPayableRaw[0] : updatedPayableRaw
      if (!updatedPayable) throw new Error('Failed to update payable')

      // Get payment account info
      // Use .limit(1) and handle array response because our client forces Accept: application/json
      const { data: paymentAccountRaw } = await supabase
        .from('accounts')
        .select('id, name, code')
        .eq('id', paymentAccountId)
        .limit(1)
      const paymentAccount = Array.isArray(paymentAccountRaw) ? paymentAccountRaw[0] : paymentAccountRaw

      // Get liability account info
      // Use .limit(1) and handle array response because our client forces Accept: application/json
      const { data: liabilityAccountRaw } = await supabase
        .from('accounts')
        .select('id, name, code')
        .eq('id', liabilityAccountId)
        .limit(1)
      const liabilityAccount = Array.isArray(liabilityAccountRaw) ? liabilityAccountRaw[0] : liabilityAccountRaw

      console.log('Payment account:', paymentAccount)
      console.log('Liability account:', liabilityAccount)

      // ============================================================================
      // BALANCE UPDATE LANGSUNG DIHAPUS
      // Semua saldo sekarang dihitung dari journal_entries
      // Pembayaran hutang di-jurnal via createPayablePaymentJournal
      // ============================================================================

      // ============================================================================
      // AUTO-GENERATE JOURNAL ENTRY FOR PEMBAYARAN HUTANG
      // ============================================================================
      // Jurnal otomatis untuk pembayaran hutang:
      // Dr. Hutang Usaha        xxx
      //   Cr. Kas/Bank               xxx
      // ============================================================================
      if (currentBranch?.id) {
        try {
          const journalResult = await createPayablePaymentJournal({
            payableId: payableId,
            paymentDate: paymentDate,
            amount: amount,
            supplierName: currentPayable.supplier_name || 'Supplier',
            invoiceNumber: currentPayable.purchase_order_id || undefined,
            branchId: currentBranch.id,
            paymentAccountId: paymentAccountId,
            liabilityAccountId: liabilityAccountId,
          });

          if (journalResult.success) {
            console.log('✅ Jurnal pembayaran hutang auto-generated:', journalResult.journalId);
          } else {
            console.warn('⚠️ Gagal membuat jurnal pembayaran hutang otomatis:', journalResult.error);
          }
        } catch (journalError) {
          console.error('Error creating payable payment journal:', journalError);
        }
      }

      // NOTE: cash_history INSERT DIHAPUS - semua cash flow sekarang dibaca dari journal_entries

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
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] })
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