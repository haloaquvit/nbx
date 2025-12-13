import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://emfvoassfrsokqwspuml.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZnZvYXNzZnJzb2txd3NwdW1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyNzMzNjIsImV4cCI6MjA3MDg0OTM2Mn0.sCi25jGYEiCdmvFFLLWAD3BOpma3kJlYgsUuTZS-bQM';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAllDataRanges() {
  console.log('🔍 Checking all data ranges in database...');

  const tables = [
    'material_stock_movements',
    'payroll_records',
    'commission_entries',
    'cash_history',
    'transactions'
  ];

  for (const table of tables) {
    console.log(`\n📊 ${table.toUpperCase()}:`);

    try {
      // Get count
      const { count, error: countError } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (countError) {
        console.log('❌ Count error:', countError.message);
        continue;
      }

      console.log(`Total records: ${count}`);

      if (count > 0) {
        // Get date range
        const { data: minDate, error: minError } = await supabase
          .from(table)
          .select('created_at')
          .order('created_at', { ascending: true })
          .limit(1);

        const { data: maxDate, error: maxError } = await supabase
          .from(table)
          .select('created_at')
          .order('created_at', { ascending: false })
          .limit(1);

        if (!minError && !maxError && minDate?.[0] && maxDate?.[0]) {
          console.log(`Date range: ${minDate[0].created_at} to ${maxDate[0].created_at}`);
        }

        // Get sample records
        const { data: sample, error: sampleError } = await supabase
          .from(table)
          .select('*')
          .limit(3);

        if (!sampleError && sample?.length > 0) {
          console.log(`Sample columns:`, Object.keys(sample[0]));
          console.log(`First record:`, sample[0]);
        }
      }

    } catch (error) {
      console.log('❌ Error:', error.message);
    }
  }

  // Special check for material_stock_movements with details
  console.log('\n🔍 SPECIAL CHECK - MATERIAL STOCK MOVEMENTS:');
  try {
    const { data: materials, error } = await supabase
      .from('material_stock_movements')
      .select('*')
      .limit(10);

    if (!error) {
      console.log('Material movements sample:', materials);
    } else {
      console.log('Error:', error.message);
    }

    // Check if we can access materials table
    const { data: materialsTable, error: matError } = await supabase
      .from('materials')
      .select('id, name, price_per_unit')
      .limit(3);

    if (!matError) {
      console.log('Materials table sample:', materialsTable);
    } else {
      console.log('Materials table error:', matError.message);
    }

  } catch (error) {
    console.log('Error in special check:', error.message);
  }
}

checkAllDataRanges();