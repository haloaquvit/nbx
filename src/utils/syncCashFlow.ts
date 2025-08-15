import { supabase } from '@/integrations/supabase/client';
import { startOfDay, endOfDay } from 'date-fns';

export async function syncTodayCashFlow() {
  try {
    const today = new Date();
    const startToday = startOfDay(today);
    const endToday = endOfDay(today);

    // Get today's transactions
    const { data: transactions, error: transError } = await supabase
      .from('transactions')
      .select('*')
      .gte('order_date', startToday.toISOString())
      .lte('order_date', endToday.toISOString());

    if (transError) {
      throw new Error(`Failed to fetch transactions: ${transError.message}`);
    }

    // Get today's cash history
    const { data: cashHistory, error: cashError } = await supabase
      .from('cash_history')
      .select('*')
      .gte('created_at', startToday.toISOString())
      .lte('created_at', endToday.toISOString())
      .eq('source_type', 'pos_direct');

    if (cashError) {
      throw new Error(`Failed to fetch cash history: ${cashError.message}`);
    }

    console.log('Today transactions:', transactions?.length);
    console.log('Today cash history (pos_direct):', cashHistory?.length);

    // Get Kas Kecil account ID
    const { data: kasKecilAccount } = await supabase
      .from('accounts')
      .select('id, name')
      .ilike('name', '%kas kecil%')
      .single();

    console.log('Kas Kecil Account:', kasKecilAccount);

    let totalTransactionAmount = 0;
    let totalCashFlowAmount = 0;
    const kasKecilTransactions = [];
    const kasKecilCashFlow = [];
    const missingRecords = [];
    
    // Calculate total from transactions for Kas Kecil
    for (const transaction of transactions || []) {
      if (transaction.paid_amount > 0 && transaction.payment_account_id === kasKecilAccount?.id) {
        totalTransactionAmount += transaction.paid_amount;
        kasKecilTransactions.push({
          id: transaction.id,
          customer: transaction.customer_name,
          amount: transaction.paid_amount,
          date: transaction.order_date
        });
      }
    }

    // Calculate total from cash flow for Kas Kecil
    for (const cf of cashHistory || []) {
      if (cf.account_id === kasKecilAccount?.id) {
        if (cf.transaction_type === 'income') {
          totalCashFlowAmount += cf.amount;
        }
        kasKecilCashFlow.push({
          description: cf.description,
          amount: cf.amount,
          type: cf.transaction_type,
          date: cf.created_at
        });
      }
    }

    console.log('=== KAS KECIL ANALYSIS ===');
    console.log('Total from Transactions:', totalTransactionAmount);
    console.log('Total from Cash Flow:', totalCashFlowAmount);
    console.log('Difference:', totalTransactionAmount - totalCashFlowAmount);
    console.log('Kas Kecil Transactions:', kasKecilTransactions);
    console.log('Kas Kecil Cash Flow:', kasKecilCashFlow);
    
    // Check each Kas Kecil transaction for missing cash flow
    const kasKecilMissing = [];
    for (const trans of kasKecilTransactions) {
      const foundInCashFlow = kasKecilCashFlow.find(cf => 
        cf.description?.includes(trans.id) ||
        cf.description?.includes(trans.customer)
      );
      if (!foundInCashFlow) {
        kasKecilMissing.push(trans);
        console.log(`❌ MISSING: Transaction ${trans.id} - ${trans.customer} - Rp ${trans.amount.toLocaleString('id-ID')}`);
      } else {
        console.log(`✅ FOUND: Transaction ${trans.id} - ${trans.customer} - Rp ${trans.amount.toLocaleString('id-ID')}`);
      }
    }
    console.log(`Found ${kasKecilMissing.length} Kas Kecil transactions without cash flow:`, kasKecilMissing);
    
    // Create missing cash flow records for Kas Kecil transactions
    for (const missingTrans of kasKecilMissing) {
      // Find the original transaction to get the correct created_by
      const originalTransaction = transactions?.find(t => t.id === missingTrans.id);
      
      const missingRecord = {
        account_id: kasKecilAccount.id,
        transaction_type: 'income',
        amount: missingTrans.amount,
        description: `Pembayaran orderan dari ${missingTrans.customer} - Order: ${missingTrans.id}`,
        reference_number: `ORDER-${missingTrans.id.slice(0, 8)}`,
        source_type: 'pos_direct',
        created_by: originalTransaction?.cashier_id || null,
        created_by_name: originalTransaction?.cashier_name || 'System Sync',
        created_at: missingTrans.date
      };

      missingRecords.push(missingRecord);
      console.log(`Will create cash flow for transaction ${missingTrans.id}: ${missingTrans.amount} (Kas Kecil)`);
    }

    console.log(`Found ${missingRecords.length} missing cash flow records`);

    if (missingRecords.length > 0) {
      const { error: insertError } = await supabase
        .from('cash_history')
        .insert(missingRecords);

      if (insertError) {
        throw new Error(`Failed to insert missing records: ${insertError.message}`);
      }

      console.log(`Successfully inserted ${missingRecords.length} missing cash flow records`);
    }

    return {
      transactionsCount: transactions?.length || 0,
      cashHistoryCount: cashHistory?.length || 0,
      missingCount: missingRecords.length,
      totalTransactionAmount,
      totalCashFlowAmount,
      difference: totalTransactionAmount - totalCashFlowAmount,
      kasKecilTransactions,
      kasKecilCashFlow,
      success: true
    };

  } catch (error) {
    console.error('Sync error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}