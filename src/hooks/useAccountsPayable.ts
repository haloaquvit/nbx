import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AccountsPayable, PayablePayment } from '@/types/accountsPayable'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from './useAuth'
import { useBranch } from '@/contexts/BranchContext'
import { generateSequentialId } from '@/utils/idGenerator'
import { useTimezone } from '@/contexts/TimezoneContext'
import { getOfficeDateString } from '@/utils/officeTime'
// journalService removed - now using RPC for all journal operations
// IMPORTANT: Do NOT create AP manually for PO - use approve_purchase_order_atomic instead


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
  const { timezone } = useTimezone()

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

  // Create Payable - Using Atomic RPC
  const createAccountsPayable = useMutation({
    mutationFn: async (newPayable: Omit<AccountsPayable, 'id' | 'createdAt'> & { skipJournal?: boolean }): Promise<AccountsPayable> => {
      if (!currentBranch?.id) {
        throw new Error('Branch tidak dipilih. Silakan pilih branch terlebih dahulu.')
      }

      // 🔥 NEW: Prevent manual AP creation for PO
      if (newPayable.purchaseOrderId) {
        throw new Error('Hutang untuk PO dibuat otomatis saat approve PO. Tidak perlu membuat manual.');
      }

      // skipJournal = true when called from PO approve flow (journal created separately)
      const skipJournal = newPayable.skipJournal ?? false;

      // Signature: create_accounts_payable_atomic(p_branch_id, p_supplier_name, p_amount, p_due_date, p_description, p_creditor_type, p_purchase_order_id, p_skip_journal)
      const { data: rpcResultRaw, error: rpcError } = await supabase
        .rpc('create_accounts_payable_atomic', {
          p_branch_id: currentBranch.id,
          p_supplier_name: newPayable.supplierName,
          p_amount: newPayable.amount,
          p_due_date: newPayable.dueDate ? newPayable.dueDate.toISOString().split('T')[0] : null,
          p_description: newPayable.description || null,
          p_creditor_type: newPayable.creditorType || 'supplier',
          p_purchase_order_id: newPayable.purchaseOrderId || null,
          p_skip_journal: skipJournal
        })

      if (rpcError) throw new Error(rpcError.message)

      const rpcResult = Array.isArray(rpcResultRaw) ? rpcResultRaw[0] : rpcResultRaw

      if (!rpcResult?.success) {
        throw new Error(rpcResult?.error_message || 'Gagal membuat hutang')
      }

      console.log('✅ Accounts payable created via RPC:', rpcResult.payable_id)

      // Fetch created record
      const { data: createdRaw, error: fetchError } = await supabase
        .from('accounts_payable')
        .select('*')
        .eq('id', rpcResult.payable_id)
        .order('id').limit(1)

      const data = Array.isArray(createdRaw) ? createdRaw[0] : createdRaw
      if (!data) throw new Error('Failed to fetch created accounts payable')

      return fromDb(data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountsPayable'] })
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] })
    },
  })

  // ============================================================================
  // PAY ACCOUNTS PAYABLE - Using Atomic RPC (pay_supplier_atomic)
  // This handles: update payable + create journal in one atomic transaction
  // Falls back to legacy method if RPC not deployed
  // ============================================================================
  const payAccountsPayable = useMutation({
    mutationFn: async ({
      payableId,
      amount,
      paymentAccountId,
      liabilityAccountId, // DEPRECATED: Not used by RPC - hutang account is auto-detected (2110)
      notes,
      paymentMethod = 'cash'
    }: {
      payableId: string
      amount: number
      paymentAccountId: string
      liabilityAccountId?: string // Made optional - not used by RPC
      notes?: string
      paymentMethod?: 'cash' | 'transfer'
    }) => {
      // WAJIB: branch_id untuk isolasi data
      if (!currentBranch?.id) {
        throw new Error('Branch tidak dipilih. Silakan pilih branch terlebih dahulu.')
      }

      const paymentDateStr = getOfficeDateString(timezone)

      // Try atomic RPC first - pay_supplier_atomic
      // Signature: pay_supplier_atomic(p_payable_id, p_branch_id, p_amount, p_payment_account_id, p_payment_method, p_payment_date, p_notes)
      const { data: rpcResultRaw, error: rpcError } = await supabase
        .rpc('pay_supplier_atomic', {
          p_payable_id: payableId,
          p_branch_id: currentBranch.id,
          p_amount: amount,
          p_payment_account_id: paymentAccountId, // User-selected payment account
          p_payment_method: paymentMethod,
          p_payment_date: paymentDateStr, // DATE format from office timezone
          p_notes: notes || null
        })

      // Strict RPC Check
      if (rpcError) throw new Error(rpcError.message)

      const rpcResult = Array.isArray(rpcResultRaw) ? rpcResultRaw[0] : rpcResultRaw

      if (!rpcResult?.success) {
        throw new Error(rpcResult?.error_message || 'Payment failed')
      }

      console.log(`✅ Payable payment via RPC:`, {
        paymentId: rpcResult.payment_id,
        remainingAmount: rpcResult.remaining_amount,
        journalId: rpcResult.journal_id
      })

      // Fetch updated payable to return
      const { data: updatedPayableRaw } = await supabase
        .from('accounts_payable')
        .select('*')
        .eq('id', payableId)
        .order('id').limit(1)

      const updatedPayable = Array.isArray(updatedPayableRaw) ? updatedPayableRaw[0] : updatedPayableRaw
      if (!updatedPayable) throw new Error('Failed to fetch updated payable')

      // Update PO status if fully paid
      if (updatedPayable.status === 'paid' && updatedPayable.purchase_order_id) {
        await supabase
          .from('purchase_orders')
          .update({ status: 'Selesai' })
          .eq('id', updatedPayable.purchase_order_id)
      }

      return fromDb(updatedPayable)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountsPayable'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['accounts'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['cashFlow'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['cashBalance'] })
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] }) // Refresh PO status after payment
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] })
    }
  })

  // Legacy Fallback function removed

  const deleteAccountsPayable = useMutation({
    mutationFn: async (payableId: string) => {
      if (!currentBranch?.id) throw new Error('Branch tidak dipilih');

      const { data: rpcResultRaw, error: rpcError } = await supabase
        .rpc('delete_accounts_payable_atomic', {
          p_payable_id: payableId,
          p_branch_id: currentBranch.id
        });

      if (rpcError) throw new Error(rpcError.message);

      const rpcResult = Array.isArray(rpcResultRaw) ? rpcResultRaw[0] : rpcResultRaw;
      if (!rpcResult?.success) {
        throw new Error(rpcResult?.error_message || 'Gagal menghapus hutang');
      }

      console.log('✅ Accounts Payable deleted via RPC, journals voided:', rpcResult.journals_voided);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountsPayable'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] })
      queryClient.invalidateQueries({ queryKey: ['cashFlow'] }) // Might affect cash flow if payments were involved (blocked) but good to sync
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