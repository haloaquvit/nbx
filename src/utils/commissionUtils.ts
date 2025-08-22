import { supabase } from '@/integrations/supabase/client'
import { CommissionEntry } from '@/types/commission'
import { Transaction } from '@/types/transaction'
import { Delivery } from '@/types/delivery'

export async function generateSalesCommission(transaction: Transaction) {
  try {
    // Get commission rules for sales
    const { data: rules, error: rulesError } = await supabase
      .from('commission_rules')
      .select('*')
      .eq('role', 'sales')

    if (rulesError) throw rulesError

    if (!rules || rules.length === 0) {
      console.log('No sales commission rules found')
      return
    }

    const commissionEntries = []

    // Create commission entries for each item
    for (const item of transaction.items) {
      const rule = rules.find(r => r.product_id === item.product.id)
      
      if (rule && rule.rate_per_qty > 0) {
        const commissionEntry = {
          user_id: transaction.cashierId,
          user_name: transaction.cashierName,
          role: 'sales' as const,
          product_id: item.product.id,
          product_name: item.product.name,
          product_sku: item.product.sku,
          quantity: item.quantity,
          rate_per_qty: rule.rate_per_qty,
          amount: item.quantity * rule.rate_per_qty,
          transaction_id: transaction.id,
          ref: `TXN-${transaction.id}`,
          status: 'pending' as const,
          created_at: new Date().toISOString()
        }

        commissionEntries.push(commissionEntry)
      }
    }

    // Insert commission entries
    if (commissionEntries.length > 0) {
      const { error: insertError } = await supabase
        .from('commission_entries')
        .insert(commissionEntries)

      if (insertError) throw insertError

      console.log(`Generated ${commissionEntries.length} sales commission entries for transaction ${transaction.id}`)
    }

  } catch (error) {
    console.error('Error generating sales commission:', error)
    throw error
  }
}

export async function generateDeliveryCommission(delivery: Delivery) {
  try {
    // Get commission rules for driver and helper
    const { data: rules, error: rulesError } = await supabase
      .from('commission_rules')
      .select('*')
      .where('role', 'in', ['driver', 'helper'])

    if (rulesError) throw rulesError

    if (!rules || rules.length === 0) {
      console.log('No delivery commission rules found')
      return
    }

    const commissionEntries = []

    // Create commission entries for delivered items
    for (const item of delivery.items) {
      const driverRule = rules.find(r => r.product_id === item.productId && r.role === 'driver')
      const helperRule = rules.find(r => r.product_id === item.productId && r.role === 'helper')

      // Driver commission
      if (delivery.driverId && driverRule && driverRule.rate_per_qty > 0) {
        const commissionEntry = {
          user_id: delivery.driverId,
          user_name: delivery.driverName || 'Unknown Driver',
          role: 'driver' as const,
          product_id: item.productId,
          product_name: item.productName,
          product_sku: '', // Could be populated from product info
          quantity: item.quantityDelivered,
          rate_per_qty: driverRule.rate_per_qty,
          amount: item.quantityDelivered * driverRule.rate_per_qty,
          transaction_id: delivery.transactionId,
          delivery_id: delivery.id,
          ref: `DEL-${delivery.id}`,
          status: 'pending' as const,
          created_at: new Date().toISOString()
        }

        commissionEntries.push(commissionEntry)
      }

      // Helper commission
      if (delivery.helperId && helperRule && helperRule.rate_per_qty > 0) {
        const commissionEntry = {
          user_id: delivery.helperId,
          user_name: delivery.helperName || 'Unknown Helper',
          role: 'helper' as const,
          product_id: item.productId,
          product_name: item.productName,
          product_sku: '', // Could be populated from product info
          quantity: item.quantityDelivered,
          rate_per_qty: helperRule.rate_per_qty,
          amount: item.quantityDelivered * helperRule.rate_per_qty,
          transaction_id: delivery.transactionId,
          delivery_id: delivery.id,
          ref: `DEL-${delivery.id}`,
          status: 'pending' as const,
          created_at: new Date().toISOString()
        }

        commissionEntries.push(commissionEntry)
      }
    }

    // Insert commission entries
    if (commissionEntries.length > 0) {
      const { error: insertError } = await supabase
        .from('commission_entries')
        .insert(commissionEntries)

      if (insertError) throw insertError

      console.log(`Generated ${commissionEntries.length} delivery commission entries for delivery ${delivery.id}`)
    }

  } catch (error) {
    console.error('Error generating delivery commission:', error)
    throw error
  }
}

export async function getCommissionSummary(userId?: string, startDate?: Date, endDate?: Date) {
  try {
    let query = supabase
      .from('commission_entries')
      .select('*')

    if (userId) {
      query = query.eq('user_id', userId)
    }

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString())
    }

    if (endDate) {
      query = query.lte('created_at', endDate.toISOString())
    }

    const { data: entries, error } = await query

    if (error) throw error

    // Calculate summary
    const summary = entries?.reduce((acc, entry) => {
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

  } catch (error) {
    console.error('Error getting commission summary:', error)
    throw error
  }
}