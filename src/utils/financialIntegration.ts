import { supabase } from '@/integrations/supabase/client'
import { CommissionEntry } from '@/types/commission'

// Function to create expense entry when commission is generated
export async function createCommissionExpense(commission: CommissionEntry) {
  try {
    const expenseId = `EXP-COMMISSION-${commission.id}`;
    

    // Try to find an existing commission expense account
    let accountId = 'beban-komisi';
    let accountName = 'Beban Komisi Karyawan';
    
    // Check if the preferred account exists, if not use a fallback
    // Use .order('id').limit(1) instead of .single() because our client forces Accept: application/json
    const { data: accountExistsRaw } = await supabase
      .from('accounts')
      .select('id, name')
      .eq('id', accountId)
      .order('id').limit(1);
    const accountExists = Array.isArray(accountExistsRaw) ? accountExistsRaw[0] : accountExistsRaw;

    if (!accountExists) {

      // Try alternative account IDs
      const fallbackAccounts = ['expense-commission', 'beban-operasional', 'beban-lain-lain'];
      let foundAccount = null;

      for (const fallbackId of fallbackAccounts) {
        const { data: fallbackRaw } = await supabase
          .from('accounts')
          .select('id, name')
          .eq('id', fallbackId)
          .order('id').limit(1);
        const fallback = Array.isArray(fallbackRaw) ? fallbackRaw[0] : fallbackRaw;

        if (fallback) {
          foundAccount = fallback;
          break;
        }
      }
      
      if (foundAccount) {
        accountId = foundAccount.id;
        accountName = foundAccount.name;
      } else {
        throw new Error('No expense account available for commission. Please create beban-komisi account.');
      }
    }

    const expenseData = {
      id: expenseId,
      description: `Komisi ${commission.role} - ${commission.userName} (${commission.productName} x${commission.quantity})`,
      amount: commission.amount,
      account_id: accountId,
      account_name: accountName,
      date: commission.createdAt.toISOString(),
      category: 'Komisi',
      created_at: new Date().toISOString()
    };

    // Use upsert to handle both insert and update cases
    const result = await supabase
      .from('expenses')
      .upsert(expenseData, { 
        onConflict: 'id',
        ignoreDuplicates: false 
      });

    if (result.error) {
      throw result.error;
    }

    return expenseId;

  } catch (error) {
    throw error;
  }
}

// Function to delete expense entry when commission is deleted
export async function deleteCommissionExpense(commissionId: string) {
  try {
    const expenseId = `EXP-COMMISSION-${commissionId}`;
    

    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', expenseId);

    if (error) {
      throw error;
    }

  } catch (error) {
    throw error;
  }
}

// Function to delete all commission expenses for a transaction
export async function deleteTransactionCommissionExpenses(transactionId: string) {
  try {

    // First get all commission entries for this transaction
    const { data: commissions, error: fetchError } = await supabase
      .from('commission_entries')
      .select('id')
      .eq('transaction_id', transactionId);

    if (fetchError) {
      return; // Don't throw - table might not exist
    }

    if (!commissions || commissions.length === 0) {
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
      throw deleteError;
    }

  } catch (error) {
    throw error;
  }
}

// Function to update commission expense when commission changes
export async function updateCommissionExpense(commission: CommissionEntry) {
  try {
    const expenseId = `EXP-COMMISSION-${commission.id}`;
    

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
      throw error;
    }

  } catch (error) {
    throw error;
  }
}

// Function to sync all existing commissions to expenses (for one-time migration)
export async function syncCommissionsToExpenses() {
  try {

    // Get all commission entries
    const { data: commissions, error: fetchError } = await supabase
      .from('commission_entries')
      .select('*');

    if (fetchError) {
      throw fetchError;
    }

    if (!commissions || commissions.length === 0) {
      return;
    }

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
        errorCount++;
      }
    }


  } catch (error) {
    throw error;
  }
}