import { supabase } from '@/integrations/supabase/client';

export async function cleanupOrphanCashHistory() {
  try {
    console.log('Starting cleanup of orphan cash history records...');
    
    // Get all cash history records that reference transactions
    const { data: cashHistoryRecords, error: cashError } = await supabase
      .from('cash_history')
      .select('id, reference_number, description, source_type')
      .or('source_type.eq.receivables_payment,source_type.eq.pos_direct');

    if (cashError) {
      throw new Error(`Failed to fetch cash history: ${cashError.message}`);
    }

    if (!cashHistoryRecords || cashHistoryRecords.length === 0) {
      console.log('No cash history records found to check');
      return 0;
    }

    console.log(`Found ${cashHistoryRecords.length} cash history records to check`);

    // Extract transaction IDs from descriptions and reference_numbers
    const transactionIds = new Set<string>();
    
    cashHistoryRecords.forEach(record => {
      // Try to extract transaction ID from description
      const descMatch = record.description.match(/Order:\s*([A-Z0-9-]+)/i);
      if (descMatch) {
        transactionIds.add(descMatch[1]);
      }
      
      // Try to extract from reference_number
      if (record.reference_number) {
        if (record.reference_number.startsWith('PIUTANG-')) {
          // Extract transaction ID from PIUTANG-KRP-2508 format
          const refMatch = record.reference_number.replace('PIUTANG-', '');
          // Find full transaction ID by searching transactions
        } else if (record.reference_number.startsWith('ORDER-')) {
          // Extract from ORDER-KRP-2508 format
          const refMatch = record.reference_number.replace('ORDER-', '');
          // This is a partial ID, need to find full ID
        }
      }
    });

    console.log(`Extracted ${transactionIds.size} unique transaction IDs`);

    // Check which transaction IDs actually exist in transactions table
    const existingTransactionIds = new Set<string>();
    
    if (transactionIds.size > 0) {
      const { data: existingTransactions, error: transError } = await supabase
        .from('transactions')
        .select('id')
        .in('id', Array.from(transactionIds));

      if (transError) {
        throw new Error(`Failed to check existing transactions: ${transError.message}`);
      }

      existingTransactions?.forEach(t => existingTransactionIds.add(t.id));
    }

    console.log(`Found ${existingTransactionIds.size} existing transactions`);

    // Find orphan cash history records
    const orphanRecords = cashHistoryRecords.filter(record => {
      const descMatch = record.description.match(/Order:\s*([A-Z0-9-]+)/i);
      const transactionId = descMatch ? descMatch[1] : null;
      
      if (!transactionId) return false; // Keep records without clear transaction ID
      
      return !existingTransactionIds.has(transactionId);
    });

    console.log(`Found ${orphanRecords.length} orphan cash history records`);

    if (orphanRecords.length === 0) {
      return 0;
    }

    // Delete orphan records
    const orphanIds = orphanRecords.map(r => r.id);
    const { error: deleteError } = await supabase
      .from('cash_history')
      .delete()
      .in('id', orphanIds);

    if (deleteError) {
      throw new Error(`Failed to delete orphan records: ${deleteError.message}`);
    }

    console.log(`Successfully deleted ${orphanRecords.length} orphan cash history records`);
    
    // Log deleted records for reference
    console.log('Deleted records:', orphanRecords.map(r => ({
      id: r.id,
      description: r.description,
      reference: r.reference_number
    })));

    return orphanRecords.length;

  } catch (error) {
    console.error('Cleanup failed:', error);
    throw error;
  }
}