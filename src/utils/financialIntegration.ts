import { supabase } from '@/integrations/supabase/client'
import { CommissionEntry } from '@/types/commission'

// Function to create expense entry when commission is generated
export async function createCommissionExpense(commission: CommissionEntry) {
  try {
    const expenseId = `EXP-COMMISSION-${commission.id}`;
    
    console.log('💰 Creating automatic expense entry for commission:', {
      commissionId: commission.id,
      amount: commission.amount,
      user: commission.userName,
      role: commission.role
    });

    const expenseData = {
      id: expenseId,
      description: `Komisi ${commission.role} - ${commission.userName} (${commission.productName} x${commission.quantity})`,
      amount: commission.amount,
      account_id: 'beban-komisi', // Specific commission expense account
      account_name: 'Beban Komisi Karyawan',
      date: commission.createdAt.toISOString(),
      category: 'Komisi',
      created_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('expenses')
      .upsert(expenseData, { onConflict: 'id' });

    if (error) {
      console.error('❌ Failed to create commission expense:', error);
      throw error;
    }

    console.log('✅ Commission expense entry created successfully:', expenseId);
    return expenseId;

  } catch (error) {
    console.error('❌ Error creating commission expense:', error);
    throw error;
  }
}

// Function to delete expense entry when commission is deleted
export async function deleteCommissionExpense(commissionId: string) {
  try {
    const expenseId = `EXP-COMMISSION-${commissionId}`;
    
    console.log('🗑️ Deleting automatic expense entry for commission:', commissionId);

    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', expenseId);

    if (error) {
      console.error('❌ Failed to delete commission expense:', error);
      throw error;
    }

    console.log('✅ Commission expense entry deleted successfully:', expenseId);

  } catch (error) {
    console.error('❌ Error deleting commission expense:', error);
    throw error;
  }
}

// Function to delete all commission expenses for a transaction
export async function deleteTransactionCommissionExpenses(transactionId: string) {
  try {
    console.log('🗑️ Deleting all commission expenses for transaction:', transactionId);

    // First get all commission entries for this transaction
    const { data: commissions, error: fetchError } = await supabase
      .from('commission_entries')
      .select('id')
      .eq('transaction_id', transactionId);

    if (fetchError) {
      console.error('❌ Failed to fetch commissions for transaction:', fetchError);
      return; // Don't throw - table might not exist
    }

    if (!commissions || commissions.length === 0) {
      console.log('ℹ️ No commission entries found for transaction:', transactionId);
      return;
    }

    // Delete corresponding expense entries
    const expenseIds = commissions.map(c => `EXP-COMMISSION-${c.id}`);
    
    const { data: deletedExpenses, error: deleteError } = await supabase
      .from('expenses')
      .delete()
      .in('id', expenseIds)
      .select();

    if (deleteError) {
      console.error('❌ Failed to delete commission expenses:', deleteError);
      throw deleteError;
    }

    console.log(`✅ Deleted ${deletedExpenses?.length || 0} commission expense entries for transaction`);

  } catch (error) {
    console.error('❌ Error deleting transaction commission expenses:', error);
    throw error;
  }
}

// Function to update commission expense when commission changes
export async function updateCommissionExpense(commission: CommissionEntry) {
  try {
    const expenseId = `EXP-COMMISSION-${commission.id}`;
    
    console.log('📝 Updating automatic expense entry for commission:', commission.id);

    const updateData = {
      description: `Komisi ${commission.role} - ${commission.userName} (${commission.productName} x${commission.quantity})`,
      amount: commission.amount,
      date: commission.createdAt.toISOString()
    };

    const { error } = await supabase
      .from('expenses')
      .update(updateData)
      .eq('id', expenseId);

    if (error) {
      console.error('❌ Failed to update commission expense:', error);
      throw error;
    }

    console.log('✅ Commission expense entry updated successfully:', expenseId);

  } catch (error) {
    console.error('❌ Error updating commission expense:', error);
    throw error;
  }
}

// Function to sync all existing commissions to expenses (for one-time migration)
export async function syncCommissionsToExpenses() {
  try {
    console.log('🔄 Starting commission-to-expense synchronization...');

    // Get all commission entries
    const { data: commissions, error: fetchError } = await supabase
      .from('commission_entries')
      .select('*');

    if (fetchError) {
      console.error('❌ Failed to fetch commission entries:', fetchError);
      throw fetchError;
    }

    if (!commissions || commissions.length === 0) {
      console.log('ℹ️ No commission entries found to sync');
      return;
    }

    console.log(`📊 Found ${commissions.length} commission entries to sync`);

    let successCount = 0;
    let errorCount = 0;

    // Create expense entries for each commission
    for (const commission of commissions) {
      try {
        const commissionEntry: CommissionEntry = {
          id: commission.id,
          userId: commission.user_id,
          userName: commission.user_name,
          role: commission.role,
          productId: commission.product_id,
          productName: commission.product_name,
          quantity: commission.quantity,
          ratePerQty: commission.rate_per_qty,
          amount: commission.amount,
          transactionId: commission.transaction_id,
          deliveryId: commission.delivery_id,
          ref: commission.ref,
          status: commission.status,
          createdAt: new Date(commission.created_at)
        };

        await createCommissionExpense(commissionEntry);
        successCount++;
      } catch (error) {
        console.error(`❌ Failed to sync commission ${commission.id}:`, error);
        errorCount++;
      }
    }

    console.log(`✅ Commission sync completed: ${successCount} success, ${errorCount} errors`);

  } catch (error) {
    console.error('❌ Error syncing commissions to expenses:', error);
    throw error;
  }
}