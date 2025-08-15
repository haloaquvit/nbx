import { supabase } from '@/integrations/supabase/client';

export async function checkCashHistoryTable() {
  try {
    // Check if cash_history table exists and its structure
    const { data, error } = await supabase
      .from('cash_history')
      .select('*')
      .limit(1);

    if (error) {
      console.log('Cash history table error:', error);
      return { exists: false, error: error.message };
    }

    console.log('Cash history table exists, sample data:', data);
    return { exists: true, sampleData: data };

  } catch (error) {
    console.error('Error checking cash_history table:', error);
    return { exists: false, error: error.message };
  }
}

export async function insertSimpleCashFlow(transactionData: any) {
  try {
    // Try the format that worked for pembayaran piutang
    const record = {
      account_id: transactionData.payment_account_id,
      transaction_type: 'income', // Use the same format as existing data
      amount: transactionData.paid_amount,
      description: `Pembayaran orderan dari ${transactionData.customer_name} - Order: ${transactionData.id}`,
      reference_number: `ORDER-${transactionData.id.slice(0, 8)}`,
      source_type: 'pos_direct',
      created_by: transactionData.cashier_id,
      created_by_name: transactionData.cashier_name,
    };

    const { data, error } = await supabase
      .from('cash_history')
      .insert([record])
      .select()
      .single();

    if (error) {
      throw new Error(`Insert failed: ${error.message}`);
    }

    console.log('Successfully inserted cash flow record:', data);
    return data;

  } catch (error) {
    console.error('Insert error:', error);
    throw error;
  }
}