import { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { CommissionRule, CommissionEntry } from '@/types/commission'
import { useAuth } from './useAuth'

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
        productSku: rule.product_sku,
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
        .select('name, sku')
        .eq('id', productId)
        .single()

      if (productError) {
        console.error('Error fetching product:', productError)
        throw new Error(`Product tidak ditemukan: ${productError.message}`)
      }

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
            product_sku: product.sku,
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

export function useCommissionEntries() {
  const [entries, setEntries] = useState<CommissionEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuth()

  const fetchEntries = async (startDate?: Date, endDate?: Date, role?: string) => {
    try {
      setIsLoading(true)
      
      // Check if commission_entries table exists, if not use empty data
      const { data, error } = await supabase
        .from('commission_entries')
        .select('*')
        .limit(1)

      if (error && error.code === 'PGRST116') {
        // Table doesn't exist, return empty data
        console.log('Commission entries table does not exist yet')
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

      if (queryError) throw queryError

      const formattedEntries: CommissionEntry[] = queryData?.map(entry => ({
        id: entry.id,
        userId: entry.user_id,
        userName: entry.user_name,
        role: entry.role,
        productId: entry.product_id,
        productName: entry.product_name,
        productSku: entry.product_sku,
        quantity: entry.quantity,
        ratePerQty: entry.rate_per_qty,
        amount: entry.amount,
        transactionId: entry.transaction_id,
        deliveryId: entry.delivery_id,
        ref: entry.ref,
        createdAt: new Date(entry.created_at),
        status: entry.status
      })) || []

      setEntries(formattedEntries)
    } catch (err: any) {
      console.error('Error fetching commission entries:', err)
      if (err.code === 'PGRST116' || err.message.includes('relation "commission_entries" does not exist')) {
        setError('Tabel komisi belum dibuat. Silakan jalankan migrasi database terlebih dahulu.')
        setEntries([])
      } else {
        setError(err.message)
      }
    } finally {
      setIsLoading(false)
    }
  }

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
          product_sku: entry.productSku,
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

  useEffect(() => {
    fetchEntries()
  }, [user])

  return {
    entries,
    isLoading,
    error,
    fetchEntries,
    createCommissionEntry,
    refetch: () => fetchEntries()
  }
}