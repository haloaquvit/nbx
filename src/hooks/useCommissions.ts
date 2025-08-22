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
      const { data, error } = await supabase
        .from('commission_rules')
        .select('*')
        .order('productName', { ascending: true })

      if (error) throw error

      const formattedRules: CommissionRule[] = data?.map(rule => ({
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
      setError(err.message)
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

      const { data, error } = await query

      if (error) throw error

      const formattedEntries: CommissionEntry[] = data?.map(entry => ({
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
      setError(err.message)
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