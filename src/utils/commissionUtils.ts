import { supabase } from '@/integrations/supabase/client';
import { CommissionEntry } from '@/types/commission';
import { Transaction } from '@/types/transaction';
import { Delivery } from '@/types/delivery';
import { createCommissionExpense } from './financialIntegration';

export async function generateSalesCommission(transaction: Transaction) {
  try {
    // Only generate commission if there's a sales person assigned
    if (!transaction.salesId || !transaction.salesName) {
      return;
    }

    // Get commission rules for sales
    const { data: rules, error: rulesError } = await supabase
      .from('commission_rules')
      .select('*')
      .eq('role', 'sales');

    if (rulesError) {
      if (rulesError.code === 'PGRST116') {
        return; // Table doesn't exist
      }
      throw rulesError;
    }

    if (!rules || rules.length === 0) {
      return; // No commission rules
    }

    const commissionEntries = [];

    // Create commission entries for each item (exclude bonus items)
    for (const item of transaction.items) {
      // Skip bonus items - they don't generate commission
      if (item.isBonus) {
        continue;
      }

      const rule = rules.find(r => r.product_id === item.product.id);
      
      if (rule && rule.rate_per_qty > 0) {
        const commissionEntry = {
          user_id: transaction.salesId,
          user_name: transaction.salesName,
          role: 'sales' as const,
          product_id: item.product.id,
          product_name: item.product.name,
          quantity: item.quantity,
          rate_per_qty: rule.rate_per_qty,
          amount: item.quantity * rule.rate_per_qty,
          transaction_id: transaction.id,
          ref: `TXN-${transaction.id}`,
          status: 'pending' as const,
          created_at: new Date().toISOString(),
          branch_id: transaction.branchId || null
        };

        commissionEntries.push(commissionEntry);
      }
    }

    // Insert commission entries
    if (commissionEntries.length > 0) {
      const { data: insertedEntries, error: insertError } = await supabase
        .from('commission_entries')
        .insert(commissionEntries)
        .select();

      if (insertError) {
        throw insertError;
      }

      // Create corresponding expense entries automatically
      if (insertedEntries && insertedEntries.length > 0) {
        for (const entry of insertedEntries) {
          try {
            const commissionEntry: CommissionEntry = {
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
              status: entry.status,
              createdAt: new Date(entry.created_at)
            };
            
            await createCommissionExpense(commissionEntry);
          } catch (expenseError) {
            // Don't throw - commission is created successfully, expense is secondary
          }
        }
      }
    }

  } catch (error) {
    throw error;
  }
}

export async function generateDeliveryCommission(delivery: Delivery) {
  try {
    // Get commission rules for driver and helper
    const { data: rules, error: rulesError } = await supabase
      .from('commission_rules')
      .select('*')
      .in('role', ['driver', 'helper']);

    if (rulesError) {
      throw rulesError;
    }

    if (!rules || rules.length === 0) {
      return;
    }

    const commissionEntries = [];

    // Create commission entries for delivered items (exclude bonus items)
    for (const item of delivery.items) {
      // Skip bonus items - they don't generate commission
      const isBonusItem = item.isBonus || item.productName.includes('(Bonus)') || item.productName.includes('BONUS');
      if (isBonusItem) {
        continue;
      }

      const driverRule = rules.find(r => r.product_id === item.productId && r.role === 'driver');
      const helperRule = rules.find(r => r.product_id === item.productId && r.role === 'helper');

      // Driver commission
      if (delivery.driverId && driverRule && driverRule.rate_per_qty > 0) {
        const commissionEntry = {
          user_id: delivery.driverId,
          user_name: delivery.driverName || 'Unknown Driver',
          role: 'driver' as const,
          product_id: item.productId,
          product_name: item.productName,
          quantity: item.quantityDelivered,
          rate_per_qty: driverRule.rate_per_qty,
          amount: item.quantityDelivered * driverRule.rate_per_qty,
          transaction_id: delivery.transactionId,
          delivery_id: delivery.id,
          ref: `DEL-${delivery.id}`,
          status: 'pending' as const,
          created_at: new Date().toISOString(),
          branch_id: delivery.branchId || null
        };

        commissionEntries.push(commissionEntry);
      }

      // Helper commission
      if (delivery.helperId && helperRule && helperRule.rate_per_qty > 0) {
        const commissionEntry = {
          user_id: delivery.helperId,
          user_name: delivery.helperName || 'Unknown Helper',
          role: 'helper' as const,
          product_id: item.productId,
          product_name: item.productName,
          quantity: item.quantityDelivered,
          rate_per_qty: helperRule.rate_per_qty,
          amount: item.quantityDelivered * helperRule.rate_per_qty,
          transaction_id: delivery.transactionId,
          delivery_id: delivery.id,
          ref: `DEL-${delivery.id}`,
          status: 'pending' as const,
          created_at: new Date().toISOString(),
          branch_id: delivery.branchId || null
        };

        commissionEntries.push(commissionEntry);
      }
    }

    // Insert commission entries
    if (commissionEntries.length > 0) {
      const { data: insertedEntries, error: insertError } = await supabase
        .from('commission_entries')
        .insert(commissionEntries)
        .select();

      if (insertError) {
        throw insertError;
      }

      // NOTE: Delivery commission entries are NOT created as expenses
      // They are calculated directly in financial reports from commission_entries table
      // This prevents them from appearing in expense history while still being counted in financial reports
      console.log(`✅ Generated ${insertedEntries?.length || 0} delivery commission entries (not added to expenses)`)
    }

  } catch (error) {
    throw error;
  }
}

export async function getCommissionSummary(userId?: string, startDate?: Date, endDate?: Date) {
  try {
    let query = supabase
      .from('commission_entries')
      .select('*');

    if (userId) {
      query = query.eq('user_id', userId);
    }

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString());
    }

    if (endDate) {
      query = query.lte('created_at', endDate.toISOString());
    }

    const { data: entries, error } = await query;

    if (error) throw error;

    // Calculate summary
    const summary = entries?.reduce((acc, entry) => {
      const key = `${entry.user_id}-${entry.role}`;
      
      if (!acc[key]) {
        acc[key] = {
          userId: entry.user_id,
          userName: entry.user_name,
          role: entry.role,
          totalAmount: 0,
          totalQuantity: 0,
          entryCount: 0
        };
      }

      acc[key].totalAmount += entry.amount;
      acc[key].totalQuantity += entry.quantity;
      acc[key].entryCount += 1;

      return acc;
    }, {} as Record<string, {
      userId: string;
      userName: string;
      role: string;
      totalAmount: number;
      totalQuantity: number;
      entryCount: number;
    }>);

    return Object.values(summary || {});

  } catch (error) {
    console.error('Error getting commission summary:', error);
    throw error;
  }
}