import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://emfvoassfrsokqwspuml.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZnZvYXNzZnJzb2txd3NwdW1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyNzMzNjIsImV4cCI6MjA3MDg0OTM2Mn0.sCi25jGYEiCdmvFFLLWAD3BOpma3kJlYgsUuTZS-bQM';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTablesExist() {
  console.log('🔍 Checking if accounts_payable and material_stock_movements tables exist...');

  try {
    // Test accounts_payable table
    const { data: apData, error: apError } = await supabase
      .from('accounts_payable')
      .select('*')
      .limit(1);

    if (apError) {
      console.log('❌ accounts_payable error:', apError.message);
    } else {
      console.log('✅ accounts_payable table exists');
    }

    // Test material_stock_movements table
    const { data: msmData, error: msmError } = await supabase
      .from('material_stock_movements')
      .select('*')
      .limit(1);

    if (msmError) {
      console.log('❌ material_stock_movements error:', msmError.message);
    } else {
      console.log('✅ material_stock_movements table exists');
    }

    // Test other tables mentioned in financialStatementsUtils
    const tables = ['payroll_records', 'employee_salaries', 'cash_history'];

    for (const table of tables) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);

      if (error) {
        console.log(`❌ ${table} error:`, error.message);
      } else {
        console.log(`✅ ${table} table exists`);
      }
    }

  } catch (error) {
    console.error('❌ Error checking tables:', error);
  }
}

checkTablesExist();