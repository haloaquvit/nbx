import { supabase } from '@/integrations/supabase/client';

export async function backfillTodayTransactions() {
  try {
    console.log('Starting backfill of today\'s transactions...');
    
    // Get today's transactions with payments
    const today = new Date().toISOString().split('T')[0];
    const { data: transactions, error: transError } = await supabase
      .from('transactions')
      .select('*')
      .gte('created_at', today + 'T00:00:00.000Z')
      .gt('paid_amount', 0)
      .not('payment_account_id', 'is', null);

    if (transError) {
      throw new Error(`Failed to fetch transactions: ${transError.message}`);
    }

    if (!transactions || transactions.length === 0) {
      console.log('No transactions with payments found for today');
      return;
    }

    console.log(`Found ${transactions.length} transactions with payments for today`);

    // Get accounts for name mapping
    const { data: accounts, error: accountError } = await supabase
      .from('accounts')
      .select('id, name');

    if (accountError) {
      throw new Error(`Failed to fetch accounts: ${accountError.message}`);
    }

    const accountMap = new Map(accounts?.map(acc => [acc.id, acc.name]) || []);

    // Use the same format as existing pembayaran piutang data
    const minimalRecord = {
      account_id: transactions[0].payment_account_id,
      transaction_type: 'income', // Use transaction_type like existing data
      amount: transactions[0].paid_amount,
      description: `Pembayaran orderan dari ${transactions[0].customer_name} - Order: ${transactions[0].id}`,
      reference_number: `ORDER-${transactions[0].id.slice(0, 8)}`,
      source_type: 'pos_direct',
      created_by: transactions[0].cashier_id,
      created_by_name: transactions[0].cashier_name,
    };

    // Try inserting one record first to test the structure
    console.log('Testing with minimal record:', minimalRecord);
    const { error: testError } = await supabase
      .from('cash_history')
      .insert([minimalRecord]);

    if (testError) {
      throw new Error(`Test insert failed: ${testError.message}`);
    }

    console.log('Test insert successful, inserting remaining records...');

    // If successful, prepare all records with the same format
    const cashHistoryRecords = transactions.slice(1).map(transaction => ({
      account_id: transaction.payment_account_id,
      transaction_type: 'income',
      amount: transaction.paid_amount,
      description: `Pembayaran orderan dari ${transaction.customer_name} - Order: ${transaction.id}`,
      reference_number: `ORDER-${transaction.id.slice(0, 8)}`,
      source_type: 'pos_direct',
      created_by: transaction.cashier_id,
      created_by_name: transaction.cashier_name,
    }));

    if (cashHistoryRecords.length > 0) {
      const { error: insertError } = await supabase
        .from('cash_history')
        .insert(cashHistoryRecords);

      if (insertError) {
        throw new Error(`Failed to insert remaining records: ${insertError.message}`);
      }
    }

    console.log(`Successfully backfilled ${cashHistoryRecords.length} cash history records`);
    return cashHistoryRecords.length;

  } catch (error) {
    console.error('Backfill failed:', error);
    throw error;
  }
}