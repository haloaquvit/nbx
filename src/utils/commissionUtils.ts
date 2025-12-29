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

export async function regenerateDeliveryCommission(deliveryId: string) {
  try {
    // Get delivery details with items
    const { data: deliveryData, error: deliveryError } = await supabase
      .from('deliveries')
      .select(`
        *,
        items:delivery_items(*),
        driver:profiles!driver_id(full_name),
        helper:profiles!helper_id(full_name)
      `)
      .eq('id', deliveryId)
      .order('id').limit(1);

    if (deliveryError) throw deliveryError;

    const delivery = Array.isArray(deliveryData) ? deliveryData[0] : deliveryData;
    if (!delivery) {
      throw new Error('Pengantaran tidak ditemukan');
    }

    // Check if commission already exists for this delivery
    const { data: existingCommissions, error: existingError } = await supabase
      .from('commission_entries')
      .select('id')
      .eq('delivery_id', deliveryId);

    if (existingError) throw existingError;

    if (existingCommissions && existingCommissions.length > 0) {
      // Delete existing commission entries for this delivery first
      const { error: deleteError } = await supabase
        .from('commission_entries')
        .delete()
        .eq('delivery_id', deliveryId);

      if (deleteError) throw deleteError;
      console.log(`🗑️ Deleted ${existingCommissions.length} existing commission entries for delivery ${deliveryId}`);
    }

    // Get commission rules for driver and helper
    const { data: rules, error: rulesError } = await supabase
      .from('commission_rules')
      .select('*')
      .in('role', ['driver', 'helper']);

    if (rulesError) throw rulesError;

    if (!rules || rules.length === 0) {
      console.log('⚠️ No commission rules found for driver/helper');
      return { success: true, message: 'Tidak ada aturan komisi untuk driver/helper', entriesCreated: 0 };
    }

    const commissionEntries = [];

    // Create commission entries for delivered items (exclude bonus items)
    for (const item of (delivery.items || [])) {
      // Skip bonus items
      const isBonusItem = item.is_bonus || item.product_name?.includes('(Bonus)') || item.product_name?.includes('BONUS');
      if (isBonusItem) {
        continue;
      }

      const driverRule = rules.find(r => r.product_id === item.product_id && r.role === 'driver');
      const helperRule = rules.find(r => r.product_id === item.product_id && r.role === 'helper');

      // Driver commission
      if (delivery.driver_id && driverRule && driverRule.rate_per_qty > 0) {
        const commissionEntry = {
          user_id: delivery.driver_id,
          user_name: delivery.driver?.full_name || 'Unknown Driver',
          role: 'driver' as const,
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity_delivered,
          rate_per_qty: driverRule.rate_per_qty,
          amount: item.quantity_delivered * driverRule.rate_per_qty,
          transaction_id: delivery.transaction_id,
          delivery_id: delivery.id,
          ref: `DEL-${delivery.id}`,
          status: 'pending' as const,
          created_at: new Date().toISOString(),
          branch_id: delivery.branch_id || null
        };

        commissionEntries.push(commissionEntry);
      }

      // Helper commission
      if (delivery.helper_id && helperRule && helperRule.rate_per_qty > 0) {
        const commissionEntry = {
          user_id: delivery.helper_id,
          user_name: delivery.helper?.full_name || 'Unknown Helper',
          role: 'helper' as const,
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity_delivered,
          rate_per_qty: helperRule.rate_per_qty,
          amount: item.quantity_delivered * helperRule.rate_per_qty,
          transaction_id: delivery.transaction_id,
          delivery_id: delivery.id,
          ref: `DEL-${delivery.id}`,
          status: 'pending' as const,
          created_at: new Date().toISOString(),
          branch_id: delivery.branch_id || null
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

      if (insertError) throw insertError;

      console.log(`✅ Regenerated ${insertedEntries?.length || 0} commission entries for delivery ${deliveryId}`);
      return {
        success: true,
        message: `Berhasil generate ${insertedEntries?.length || 0} komisi`,
        entriesCreated: insertedEntries?.length || 0
      };
    }

    return {
      success: true,
      message: 'Tidak ada item yang memenuhi syarat komisi',
      entriesCreated: 0
    };

  } catch (error: any) {
    console.error('Error regenerating delivery commission:', error);
    throw error;
  }
}

/**
 * Recalculate commissions for all deliveries in a date range
 * - Creates new commission entries for deliveries without commissions
 * - Updates commission amounts if rates changed (only for 'pending' status)
 * - Skips deliveries with 'paid' commissions
 */
export async function recalculateCommissionsForPeriod(startDate: Date, endDate: Date) {
  let created = 0;
  let updated = 0;
  let skipped = 0;

  try {
    // Get all deliveries in the date range
    const { data: deliveries, error: deliveriesError } = await supabase
      .from('deliveries')
      .select(`
        id,
        transaction_id,
        delivery_date,
        driver_id,
        helper_id,
        branch_id,
        items:delivery_items(id, product_id, product_name, quantity_delivered, is_bonus),
        driver:profiles!driver_id(full_name),
        helper:profiles!helper_id(full_name)
      `)
      .gte('delivery_date', startDate.toISOString())
      .lte('delivery_date', endDate.toISOString())
      .or('driver_id.not.is.null,helper_id.not.is.null');

    if (deliveriesError) throw deliveriesError;

    if (!deliveries || deliveries.length === 0) {
      return { created: 0, updated: 0, skipped: 0, message: 'Tidak ada pengantaran dalam periode ini' };
    }

    // Get all commission rules
    const { data: rules, error: rulesError } = await supabase
      .from('commission_rules')
      .select('*')
      .in('role', ['driver', 'helper']);

    if (rulesError) throw rulesError;

    if (!rules || rules.length === 0) {
      return { created: 0, updated: 0, skipped: 0, message: 'Tidak ada aturan komisi untuk driver/helper' };
    }

    // Get existing commission entries for these deliveries
    const deliveryIds = deliveries.map(d => d.id);
    const { data: existingCommissions, error: existingError } = await supabase
      .from('commission_entries')
      .select('id, delivery_id, product_id, role, status, amount, rate_per_qty')
      .in('delivery_id', deliveryIds);

    if (existingError) throw existingError;

    // Create a map of existing commissions: delivery_id -> product_id -> role -> commission
    const existingMap = new Map<string, any>();
    for (const c of (existingCommissions || [])) {
      const key = `${c.delivery_id}-${c.product_id}-${c.role}`;
      existingMap.set(key, c);
    }

    const newEntries: any[] = [];
    const updateEntries: { id: string; amount: number; rate_per_qty: number }[] = [];

    // Process each delivery
    for (const delivery of deliveries) {
      for (const item of (delivery.items || [])) {
        // Skip bonus items
        if (item.is_bonus || item.product_name?.includes('(Bonus)') || item.product_name?.includes('BONUS')) {
          continue;
        }

        // Check driver commission
        if (delivery.driver_id) {
          const driverRule = rules.find(r => r.product_id === item.product_id && r.role === 'driver');
          const key = `${delivery.id}-${item.product_id}-driver`;
          const existing = existingMap.get(key);

          if (driverRule && driverRule.rate_per_qty > 0) {
            const newAmount = item.quantity_delivered * driverRule.rate_per_qty;

            if (existing) {
              if (existing.status === 'paid') {
                skipped++;
              } else if (existing.amount !== newAmount || existing.rate_per_qty !== driverRule.rate_per_qty) {
                updateEntries.push({
                  id: existing.id,
                  amount: newAmount,
                  rate_per_qty: driverRule.rate_per_qty
                });
                updated++;
              }
            } else {
              newEntries.push({
                user_id: delivery.driver_id,
                user_name: (delivery.driver as any)?.full_name || 'Unknown Driver',
                role: 'driver',
                product_id: item.product_id,
                product_name: item.product_name,
                quantity: item.quantity_delivered,
                rate_per_qty: driverRule.rate_per_qty,
                amount: newAmount,
                transaction_id: delivery.transaction_id,
                delivery_id: delivery.id,
                ref: `DEL-${delivery.id}`,
                status: 'pending',
                created_at: delivery.delivery_date,
                branch_id: delivery.branch_id || null
              });
              created++;
            }
          }
        }

        // Check helper commission
        if (delivery.helper_id) {
          const helperRule = rules.find(r => r.product_id === item.product_id && r.role === 'helper');
          const key = `${delivery.id}-${item.product_id}-helper`;
          const existing = existingMap.get(key);

          if (helperRule && helperRule.rate_per_qty > 0) {
            const newAmount = item.quantity_delivered * helperRule.rate_per_qty;

            if (existing) {
              if (existing.status === 'paid') {
                skipped++;
              } else if (existing.amount !== newAmount || existing.rate_per_qty !== helperRule.rate_per_qty) {
                updateEntries.push({
                  id: existing.id,
                  amount: newAmount,
                  rate_per_qty: helperRule.rate_per_qty
                });
                updated++;
              }
            } else {
              newEntries.push({
                user_id: delivery.helper_id,
                user_name: (delivery.helper as any)?.full_name || 'Unknown Helper',
                role: 'helper',
                product_id: item.product_id,
                product_name: item.product_name,
                quantity: item.quantity_delivered,
                rate_per_qty: helperRule.rate_per_qty,
                amount: newAmount,
                transaction_id: delivery.transaction_id,
                delivery_id: delivery.id,
                ref: `DEL-${delivery.id}`,
                status: 'pending',
                created_at: delivery.delivery_date,
                branch_id: delivery.branch_id || null
              });
              created++;
            }
          }
        }
      }
    }

    // Insert new entries in batches
    if (newEntries.length > 0) {
      const BATCH_SIZE = 50;
      for (let i = 0; i < newEntries.length; i += BATCH_SIZE) {
        const batch = newEntries.slice(i, i + BATCH_SIZE);
        const { error: insertError } = await supabase
          .from('commission_entries')
          .insert(batch);

        if (insertError) {
          console.error('Error inserting commission entries batch:', insertError);
        }
      }
    }

    // Update existing entries
    for (const entry of updateEntries) {
      const { error: updateError } = await supabase
        .from('commission_entries')
        .update({ amount: entry.amount, rate_per_qty: entry.rate_per_qty })
        .eq('id', entry.id);

      if (updateError) {
        console.error('Error updating commission entry:', updateError);
      }
    }

    console.log(`✅ Recalculate complete: ${created} created, ${updated} updated, ${skipped} skipped`);
    return { created, updated, skipped };

  } catch (error: any) {
    console.error('Error recalculating commissions:', error);
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