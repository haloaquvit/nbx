import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { CommissionRule, CommissionEntry } from '@/types/commission'
import { useAuth } from './useAuth'
import { deleteCommissionExpense, deleteTransactionCommissionExpenses } from '@/utils/financialIntegration'

export function useCommissionRules() {
  const [rules, setRules] = useState<CommissionRule[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRules = async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      // Check if commission_rules table exists
      const { data, error } = await supabase
        .from('commission_rules')
        .select('*')
        .limit(1)

      if (error && (error.code === 'PGRST116' || error.message.includes('does not exist'))) {
        console.log('Commission rules table does not exist yet')
        setRules([])
        setError('Tabel commission_rules belum tersedia. Fitur komisi tidak dapat digunakan.')
        return
      }

      if (error && error.code === '406') {
        console.log('Commission rules table access denied (406)')
        setRules([])
        setError('Tidak dapat mengakses tabel commission_rules. Periksa konfigurasi database.')
        return
      }

      // Table exists, get all rules
      const { data: allData, error: fetchError } = await supabase
        .from('commission_rules')
        .select('*')
        .order('created_at', { ascending: false })

      if (fetchError) {
        if (fetchError.code === '406') {
          setRules([])
          setError('Tidak dapat mengakses data commission_rules. Periksa permission database.')
          return
        }
        throw fetchError
      }

      const formattedRules: CommissionRule[] = allData?.map(rule => ({
        id: rule.id,
        productId: rule.product_id,
        productName: rule.product_name || 'Unknown Product',
        role: rule.role,
        ratePerQty: rule.rate_per_qty || 0,
        createdAt: new Date(rule.created_at),
        updatedAt: new Date(rule.updated_at || rule.created_at)
      })) || []

      setRules(formattedRules)
      setError(null)
    } catch (err: any) {
      console.error('Error fetching commission rules:', err)
      if (err.code === 'PGRST116' || err.message.includes('does not exist')) {
        setError('Tabel commission_rules belum tersedia. Silakan hubungi administrator.')
        setRules([])
      } else if (err.code === '406') {
        setError('Akses ke tabel commission_rules ditolak. Periksa permission RLS.')
        setRules([])
      } else {
        setError(`Error: ${err.message}`)
        setRules([])
      }
    } finally {
      setIsLoading(false)
    }
  }

  const updateCommissionRate = async (productId: string, role: 'sales' | 'driver' | 'helper', ratePerQty: number) => {
    try {
      // First check if table exists
      const { data: tableCheck, error: tableError } = await supabase
        .from('commission_rules')
        .select('id')
        .limit(1)

      if (tableError && (tableError.code === 'PGRST116' || tableError.message.includes('does not exist'))) {
        throw new Error('Tabel commission_rules belum tersedia. Silakan hubungi administrator.')
      }

      // Get product information first
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('name')
        .eq('id', productId)
        .single()

      if (productError) {
        console.error('Error fetching product:', productError)
        throw new Error(`Product tidak ditemukan: ${productError.message}`)
      }

      console.log('✅ Product found:', product.name, 'for commission rule');

      // Check if rule already exists
      const { data: existing, error: checkError } = await supabase
        .from('commission_rules')
        .select('id')
        .eq('product_id', productId)
        .eq('role', role)
        .maybeSingle()

      // Handle check errors
      if (checkError && checkError.code !== 'PGRST116') {
        console.error('Error checking existing rule:', checkError)
        throw new Error(`Gagal memeriksa rule yang ada: ${checkError.message}`)
      }

      if (existing) {
        // Update existing rule
        const { error } = await supabase
          .from('commission_rules')
          .update({
            rate_per_qty: ratePerQty,
            updated_at: new Date().toISOString()
          })
          .eq('product_id', productId)
          .eq('role', role)

        if (error) {
          console.error('Error updating rule:', error)
          throw new Error(`Gagal memperbarui rule: ${error.message}`)
        }
      } else {
        // Insert new rule with product information
        const { error } = await supabase
          .from('commission_rules')
          .insert({
            product_id: productId,
            product_name: product.name,
            role: role,
            rate_per_qty: ratePerQty,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })

        if (error) {
          console.error('Error inserting rule:', error)
          throw new Error(`Gagal menambahkan rule baru: ${error.message}`)
        }
      }

      await fetchRules()
    } catch (err: any) {
      console.error('Commission rate update error:', err)
      setError(err.message)
      throw err
    }
  }

  useEffect(() => {
    fetchRules()
  }, [])

  return {
    rules,
    isLoading,
    error,
    updateCommissionRate,
    refetch: fetchRules
  }
}

export function useCommissionEntries(startDate?: Date, endDate?: Date, role?: string) {
  const { user } = useAuth()
  const [entries, setEntries] = useState<CommissionEntry[]>([])
  const [error, setError] = useState<string | null>(null)

  const fetchEntries = useCallback(async (startDate?: Date, endDate?: Date, role?: string) => {
    const callId = Math.random().toString(36).substring(7);
    console.log(`🚀 [${callId}] fetchEntries called with:`, { 
      startDate: startDate?.toISOString(), 
      endDate: endDate?.toISOString(), 
      role, 
      userId: user?.id,
      userRole: user?.role 
    });
    console.log(`📍 [${callId}] Call stack:`, new Error().stack);
    
    try {
      setIsLoading(true)
      console.log(`⏳ [${callId}] Setting loading to true`);
      
      // Check if commission_entries table exists, if not use empty data
      const { data, error } = await supabase
        .from('commission_entries')
        .select('*')
        .limit(1)

      if (error && error.code === 'PGRST116') {
        // Table doesn't exist, return empty data
        console.log(`❌ [${callId}] Commission entries table does not exist yet`)
        setEntries([])
        setError('Tabel komisi belum dibuat. Silakan jalankan migrasi database terlebih dahulu.')
        return
      }

      // Table exists, proceed with normal query
      let query = supabase
        .from('commission_entries')
        .select('*')
        .order('created_at', { ascending: false })

      if (startDate) {
        query = query.gte('created_at', startDate.toISOString())
      }
      if (endDate) {
        query = query.lte('created_at', endDate.toISOString())
      }
      if (role && role !== 'all') {
        query = query.eq('role', role)
      }

      // If user is not admin/owner, only show their own entries
      if (user?.role !== 'admin' && user?.role !== 'owner') {
        query = query.eq('user_id', user?.id)
      }

      const { data: queryData, error: queryError } = await query

      if (queryError) {
        console.error(`❌ [${callId}] Commission entries query error:`, queryError);
        throw queryError;
      }

      console.log(`📊 [${callId}] Commission entries raw data:`, queryData);

      const formattedEntries: CommissionEntry[] = queryData?.map(entry => ({
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

      console.log(`✅ [${callId}] Commission entries formatted (${formattedEntries.length} entries):`, formattedEntries);
      setEntries(formattedEntries)
      setError(null) // Clear any previous errors
    } catch (err: any) {
      console.error(`❌ [${callId}] Error fetching commission entries:`, err)
      if (err.code === 'PGRST116' || err.message.includes('relation "commission_entries" does not exist')) {
        setError('Tabel komisi belum dibuat. Silakan jalankan migrasi database terlebih dahulu.')
        setEntries([])
      } else {
        setError(err.message)
      }
    } finally {
      console.log(`🏁 [${callId}] Setting loading to false`);
      setIsLoading(false)
    }
  }, [user])

  const createCommissionEntry = async (entry: Omit<CommissionEntry, 'id' | 'createdAt'>) => {
    try {
      const { error } = await supabase
        .from('commission_entries')
        .insert({
          user_id: entry.userId,
          user_name: entry.userName,
          role: entry.role,
          product_id: entry.productId,
          product_name: entry.productName,
          quantity: entry.quantity,
          rate_per_qty: entry.ratePerQty,
          amount: entry.amount,
          transaction_id: entry.transactionId,
          delivery_id: entry.deliveryId,
          ref: entry.ref,
          status: entry.status || 'pending',
          created_at: new Date().toISOString()
        })

      if (error) throw error
    } catch (err: any) {
      setError(err.message)
      throw err
    }
  }

  const deleteCommissionEntry = async (entryId: string) => {
    try {
      console.log('🗑️ Deleting commission entry:', entryId);
      
      // Get commission entry details to check if we need to delete expense
      const { data: commissionEntry } = await supabase
        .from('commission_entries')
        .select('role, delivery_id')
        .eq('id', entryId)
        .single()
      
      // Only delete expense entry for sales commission (not delivery commission)
      if (commissionEntry && commissionEntry.role === 'sales' && !commissionEntry.delivery_id) {
        try {
          await deleteCommissionExpense(entryId);
          console.log('✅ Deleted sales commission expense entry')
        } catch (expenseError) {
          console.error('❌ Failed to delete commission expense (continuing with commission deletion):', expenseError);
          // Don't throw - continue with commission deletion even if expense deletion fails
        }
      } else {
        console.log('ℹ️ Skipped expense deletion for delivery commission')
      }
      
      // Then delete the commission entry
      const { error } = await supabase
        .from('commission_entries')
        .delete()
        .eq('id', entryId)

      if (error) {
        console.error('❌ Error deleting commission entry:', error);
        throw error;
      }

      console.log('✅ Commission entry and expense deleted successfully');
      
      // Refresh the entries
      await fetchEntries();
    } catch (err: any) {
      console.error('❌ Delete commission error:', err);
      setError(err.message)
      throw err
    }
  }

  const deleteCommissionsByTransaction = async (transactionId: string) => {
    try {
      console.log('🗑️ Deleting commission entries and expenses for transaction:', transactionId);
      
      // First delete all corresponding expense entries for this transaction
      try {
        await deleteTransactionCommissionExpenses(transactionId);
      } catch (expenseError) {
        console.error('❌ Failed to delete commission expenses for transaction (continuing):', expenseError);
        // Don't throw - continue with commission deletion even if expense deletion fails
      }
      
      // Then delete the commission entries
      const { error } = await supabase
        .from('commission_entries')
        .delete()
        .eq('transaction_id', transactionId)

      if (error) {
        console.error('❌ Error deleting commission entries:', error);
        throw error;
      }

      console.log('✅ All commission entries and expenses for transaction deleted successfully');
    } catch (err: any) {
      console.error('❌ Delete transaction commissions error:', err);
      setError(err.message)
      throw err
    }
  }

  useEffect(() => {
    console.log('🔄 useCommissionEntries useEffect triggered, user changed:', user?.id);
    fetchEntries()
  }, [fetchEntries])

  return {
    entries,
    isLoading,
    error,
    fetchEntries,
    createCommissionEntry,
    deleteCommissionEntry,
    deleteCommissionsByTransaction,
    refetch: () => fetchEntries()
  }
}