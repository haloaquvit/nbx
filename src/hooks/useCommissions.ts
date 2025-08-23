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
      
      // Check if commission_rules table exists
      const { data, error } = await supabase
        .from('commission_rules')
        .select('*')
        .limit(1)

      if (error && error.code === 'PGRST116') {
        console.log('Commission rules table does not exist yet')
        setRules([])
        setError('Tabel komisi belum dibuat. Silakan jalankan migrasi database terlebih dahulu.')
        return
      }

      // Table exists, get all rules
      const { data: allData, error: fetchError } = await supabase
        .from('commission_rules')
        .select('*')
        .order('product_name', { ascending: true })

      if (fetchError) throw fetchError

      const formattedRules: CommissionRule[] = allData?.map(rule => ({
        id: rule.id,
        productId: rule.product_id,
        productName: rule.product_name,
        productSku: rule.product_sku,
        role: rule.role,
        ratePerQty: rule.rate_per_qty,
        createdAt: new Date(rule.created_at),
        updatedAt: new Date(rule.updated_at)
      })) || []

      setRules(formattedRules)
    } catch (err: any) {
      console.error('Error fetching commission rules:', err)
      if (err.code === 'PGRST116' || err.message.includes('relation "commission_rules" does not exist')) {
        setError('Tabel komisi belum dibuat. Silakan jalankan migrasi database terlebih dahulu.')
        setRules([])
      } else {
        setError(err.message)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const updateCommissionRate = async (productId: string, role: 'sales' | 'driver' | 'helper', ratePerQty: number) => {
    try {
      const { error } = await supabase
        .from('commission_rules')
        .upsert({
          product_id: productId,
          role: role,
          rate_per_qty: ratePerQty,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'product_id,role'
        })

      if (error) throw error
      await fetchRules()
    } catch (err: any) {
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