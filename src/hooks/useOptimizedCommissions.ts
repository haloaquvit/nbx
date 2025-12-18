import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { CommissionEntry } from '@/types/commission'
import { useAuth } from './useAuth'
import { useBranch } from '@/contexts/BranchContext'
import { deleteCommissionExpense, deleteTransactionCommissionExpenses } from '@/utils/financialIntegration'

// Query keys for consistent caching
export const commissionKeys = {
  all: ['commissions'] as const,
  entries: () => [...commissionKeys.all, 'entries'] as const,
  entriesFiltered: (params: { startDate?: string, endDate?: string, role?: string, userId?: string }) => 
    [...commissionKeys.entries(), params] as const,
  rules: () => [...commissionKeys.all, 'rules'] as const,
}

// Optimized commission entries hook with React Query
export function useOptimizedCommissionEntries(
  startDate?: Date,
  endDate?: Date,
  role?: string
) {
  const { user } = useAuth()
  const { currentBranch } = useBranch()

  // Create stable query key based on parameters
  const queryKey = commissionKeys.entriesFiltered({
    startDate: startDate?.toISOString().split('T')[0],
    endDate: endDate?.toISOString().split('T')[0],
    role: role && role !== 'all' ? role : undefined,
    userId: user?.role !== 'admin' && user?.role !== 'owner' ? user?.id : undefined
  })

  return useQuery({
    queryKey: [...queryKey, currentBranch?.id],
    queryFn: async () => {
      console.log('🔄 Fetching commission entries with params:', {
        startDate: startDate?.toISOString(),
        endDate: endDate?.toISOString(),
        role,
        userId: user?.id,
        userRole: user?.role,
        branchId: currentBranch?.id,
        isAdminOrOwner: user?.role === 'admin' || user?.role === 'owner'
      })

      // Check if commission_entries table exists
      const { data: testData, error: testError } = await supabase
        .from('commission_entries')
        .select('id')
        .limit(1)

      if (testError && testError.code === 'PGRST116') {
        console.log('❌ Commission entries table does not exist yet')
        throw new Error('Tabel komisi belum dibuat. Silakan jalankan migrasi database terlebih dahulu.')
      }

      // Build query
      let query = supabase
        .from('commission_entries')
        .select('*')
        .order('created_at', { ascending: false })

      // Apply branch filter - ALWAYS filter by selected branch
      if (currentBranch?.id) {
        query = query.eq('branch_id', currentBranch.id)
      }

      // Apply filters
      if (startDate) {
        query = query.gte('created_at', startDate.toISOString())
      }
      if (endDate) {
        query = query.lte('created_at', endDate.toISOString())
      }
      if (role && role !== 'all') {
        query = query.eq('role', role)
      }

      // Apply user filter for non-admin users
      if (user?.role !== 'admin' && user?.role !== 'owner') {
        query = query.eq('user_id', user?.id)
      }

      const { data, error } = await query

      if (error) {
        console.error('❌ Commission entries query error:', error)
        throw error
      }

      console.log(`📊 Commission entries query result:`, {
        totalEntries: data?.length || 0,
        roleBreakdown: data?.reduce((acc, entry) => {
          acc[entry.role] = (acc[entry.role] || 0) + 1;
          return acc;
        }, {} as Record<string, number>) || {},
        sampleEntries: data?.slice(0, 3).map(e => ({
          id: e.id,
          role: e.role,
          userName: e.user_name,
          productName: e.product_name,
          amount: e.amount
        })) || []
      });

      // Transform data
      const formattedEntries: CommissionEntry[] = data?.map(entry => ({
        id: entry.id,
        userId: entry.user_id,
        userName: entry.user_name,
        role: entry.role,
        productId: entry.product_id,
        productName: entry.product_name,
        quantity: entry.quantity,
        ratePerQty: entry.rate_per_qty,
        amount: entry.amount,
        transactionId: entry.transaction_id,
        deliveryId: entry.delivery_id,
        ref: entry.ref,
        createdAt: new Date(entry.created_at),
        status: entry.status
      })) || []

      console.log(`✅ Fetched ${formattedEntries.length} commission entries`)
      return formattedEntries
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    refetchOnMount: false, // Don't auto-refetch on mount
    refetchOnWindowFocus: false, // Don't auto-refetch on focus
    enabled: !!user && !!currentBranch, // Only run when user and branch are available
  })
}

// Optimized delete commission mutation
export function useDeleteCommissionEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (entryId: string) => {
      console.log('🗑️ Deleting commission entry:', entryId)
      
      // Get commission entry details to check if we need to delete expense
      const { data: commissionEntry } = await supabase
        .from('commission_entries')
        .select('role, delivery_id')
        .eq('id', entryId)
        .single()
      
      // Only delete expense entry for sales commission (not delivery commission)
      if (commissionEntry && commissionEntry.role === 'sales' && !commissionEntry.delivery_id) {
        try {
          await deleteCommissionExpense(entryId)
          console.log('✅ Deleted sales commission expense entry')
        } catch (expenseError) {
          console.error('❌ Failed to delete commission expense (continuing):', expenseError)
        }
      } else {
        console.log('ℹ️ Skipped expense deletion for delivery commission')
      }
      
      // Delete commission entry
      const { error } = await supabase
        .from('commission_entries')
        .delete()
        .eq('id', entryId)

      if (error) {
        console.error('❌ Error deleting commission entry:', error)
        throw error
      }

      console.log('✅ Commission entry and expense deleted successfully')
    },
    onSuccess: () => {
      // Invalidate all commission-related queries
      queryClient.invalidateQueries({ queryKey: commissionKeys.all })
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
    },
    onError: (error) => {
      console.error('❌ Delete commission mutation error:', error)
    }
  })
}

// Optimized delete transaction commissions mutation
export function useDeleteTransactionCommissions() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (transactionId: string) => {
      console.log('🗑️ Deleting commission entries and expenses for transaction:', transactionId)
      
      // Delete commission expenses first
      try {
        await deleteTransactionCommissionExpenses(transactionId)
      } catch (expenseError) {
        console.error('❌ Failed to delete commission expenses (continuing):', expenseError)
      }
      
      // Delete commission entries
      const { error } = await supabase
        .from('commission_entries')
        .delete()
        .eq('transaction_id', transactionId)

      if (error) {
        console.error('❌ Error deleting commission entries:', error)
        throw error
      }

      console.log('✅ All commission entries and expenses for transaction deleted')
    },
    onSuccess: () => {
      // Invalidate commission and expense queries
      queryClient.invalidateQueries({ queryKey: commissionKeys.all })
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
    }
  })
}

// Hook for commission summary with caching
export function useCommissionSummary(
  startDate?: Date,
  endDate?: Date
) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['commission-summary', {
      startDate: startDate?.toISOString().split('T')[0],
      endDate: endDate?.toISOString().split('T')[0],
      userId: user?.id
    }],
    queryFn: async () => {
      // Get commission entries for summary calculation
      let query = supabase
        .from('commission_entries')
        .select('user_id, user_name, role, amount, quantity')

      if (startDate) {
        query = query.gte('created_at', startDate.toISOString())
      }
      if (endDate) {
        query = query.lte('created_at', endDate.toISOString())
      }
      if (user?.id && user?.role !== 'admin' && user?.role !== 'owner') {
        query = query.eq('user_id', user.id)
      }

      const { data, error } = await query

      if (error) throw error

      // Calculate summary
      const summary = data?.reduce((acc, entry) => {
        const key = `${entry.user_id}-${entry.role}`
        
        if (!acc[key]) {
          acc[key] = {
            userId: entry.user_id,
            userName: entry.user_name,
            role: entry.role,
            totalAmount: 0,
            totalQuantity: 0,
            entryCount: 0
          }
        }

        acc[key].totalAmount += entry.amount
        acc[key].totalQuantity += entry.quantity
        acc[key].entryCount += 1

        return acc
      }, {} as Record<string, {
        userId: string
        userName: string
        role: string
        totalAmount: number
        totalQuantity: number
        entryCount: number
      }>)

      return Object.values(summary || {})
    },
    staleTime: 10 * 60 * 1000, // 10 minutes for summary
    gcTime: 20 * 60 * 1000, // 20 minutes
    enabled: !!user,
  })
}

// Prefetch hook for commission data
export function usePrefetchCommissions() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const prefetchEntries = (startDate?: Date, endDate?: Date) => {
    if (!user) return

    const queryKey = commissionKeys.entriesFiltered({
      startDate: startDate?.toISOString().split('T')[0],
      endDate: endDate?.toISOString().split('T')[0],
    })

    queryClient.prefetchQuery({
      queryKey,
      queryFn: async () => {
        let query = supabase
          .from('commission_entries')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50) // Limit for prefetch

        if (startDate) query = query.gte('created_at', startDate.toISOString())
        if (endDate) query = query.lte('created_at', endDate.toISOString())

        const { data, error } = await query
        if (error) throw error

        return data?.map(entry => ({
          id: entry.id,
          userId: entry.user_id,
          userName: entry.user_name,
          role: entry.role,
          productId: entry.product_id,
          productName: entry.product_name,
          quantity: entry.quantity,
          ratePerQty: entry.rate_per_qty,
          amount: entry.amount,
          transactionId: entry.transaction_id,
          deliveryId: entry.delivery_id,
          ref: entry.ref,
          createdAt: new Date(entry.created_at),
          status: entry.status
        })) || []
      },
      staleTime: 5 * 60 * 1000,
    })
  }

  return { prefetchEntries }
}