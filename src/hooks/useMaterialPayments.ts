import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useBranch } from '@/contexts/BranchContext'

export interface MaterialPayment {
  id: string
  materialId: string
  materialName?: string
  amount: number
  paymentDate: Date
  cashAccountId: string
  cashAccountName?: string
  notes?: string
  journalEntryId?: string
  createdBy: string
  createdByName: string
  branchId: string
  createdAt: Date
}

const fromDbToApp = (dbRecord: any): MaterialPayment => ({
  id: dbRecord.id,
  materialId: dbRecord.material_id,
  materialName: dbRecord.materials?.name,
  amount: dbRecord.amount,
  paymentDate: new Date(dbRecord.payment_date),
  cashAccountId: dbRecord.cash_account_id,
  cashAccountName: dbRecord.accounts?.name,
  notes: dbRecord.notes,
  journalEntryId: dbRecord.journal_entry_id,
  createdBy: dbRecord.created_by,
  createdByName: dbRecord.created_by_name,
  branchId: dbRecord.branch_id,
  createdAt: new Date(dbRecord.created_at),
})

export function useMaterialPayments(materialId?: string) {
  const queryClient = useQueryClient()
  const { currentBranch } = useBranch()

  // Fetch all payments for a material
  const { data: payments, isLoading } = useQuery<MaterialPayment[]>({
    queryKey: ['materialPayments', currentBranch?.id, materialId],
    queryFn: async () => {
      let query = supabase
        .from('material_payments')
        .select(`
          *,
          materials (name),
          accounts (name)
        `)
        .order('payment_date', { ascending: false })

      if (currentBranch?.id) {
        query = query.eq('branch_id', currentBranch.id)
      }

      if (materialId) {
        query = query.eq('material_id', materialId)
      }

      const { data, error } = await query

      if (error) {
        console.error('Error fetching material payments:', error)
        return []
      }

      return data ? data.map(fromDbToApp) : []
    },
    enabled: !!currentBranch,
    staleTime: 2 * 60 * 1000, // 2 minutes
  })

  // Calculate total paid for a specific material
  const getTotalPaid = (matId: string) => {
    if (!payments) return 0
    return payments
      .filter(p => p.materialId === matId)
      .reduce((sum, p) => sum + p.amount, 0)
  }

  // Calculate total paid in a date range
  const getTotalPaidInRange = (matId: string, from: Date, to: Date) => {
    if (!payments) return 0
    return payments
      .filter(p => {
        const paymentDate = new Date(p.paymentDate)
        return p.materialId === matId &&
               paymentDate >= from &&
               paymentDate <= to
      })
      .reduce((sum, p) => sum + p.amount, 0)
  }

  return {
    payments,
    isLoading,
    getTotalPaid,
    getTotalPaidInRange,
  }
}

// Calculate unpaid amount for a "Beli" type material
export function useUnpaidMaterialUsage(materialId: string, usageAmount: number, pricePerUnit: number) {
  const { payments } = useMaterialPayments(materialId)

  const totalBilled = usageAmount * pricePerUnit
  const totalPaid = payments?.reduce((sum, p) => sum + p.amount, 0) || 0
  const unpaidAmount = Math.max(0, totalBilled - totalPaid)

  return {
    totalBilled,
    totalPaid,
    unpaidAmount,
    hasUnpaidBill: unpaidAmount > 0,
  }
}
