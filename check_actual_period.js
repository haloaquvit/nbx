import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://emfvoassfrsokqwspuml.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZnZvYXNzZnJzb2txd3NwdW1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyNzMzNjIsImV4cCI6MjA3MDg0OTM2Mn0.sCi25jGYEiCdmvFFLLWAD3BOpma3kJlYgsUuTZS-bQM';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkActualDataPeriod() {
  console.log('🔍 Checking actual data periods and structure...');

  try {
    // Check material_stock_movements data range
    console.log('\n1. 📦 MATERIAL STOCK MOVEMENTS:');
    const { data: materialRange, error: materialError } = await supabase
      .from('material_stock_movements')
      .select('created_at, quantity, material_name')
      .eq('type', 'OUT')
      .eq('reason', 'PRODUCTION_CONSUMPTION')
      .order('created_at', { ascending: false })
      .limit(10);

    if (materialError) {
      console.log('❌ Error:', materialError.message);
    } else {
      console.log('Recent material movements:');
      materialRange?.forEach(m => {
        console.log(`- ${m.created_at}: ${m.material_name} qty=${m.quantity}`);
      });
    }

    // Check payroll_records structure
    console.log('\n2. 👷 PAYROLL RECORDS STRUCTURE:');
    const { data: payrollSample, error: payrollError } = await supabase
      .from('payroll_records')
      .select('*')
      .limit(1);

    if (payrollError) {
      console.log('❌ Error:', payrollError.message);
    } else {
      console.log('Payroll columns:', Object.keys(payrollSample?.[0] || {}));
      console.log('Sample record:', payrollSample?.[0]);
    }

    // Check commission_entries data range
    console.log('\n3. 💰 COMMISSION ENTRIES:');
    const { data: commissionRange, error: commissionError } = await supabase
      .from('commission_entries')
      .select('created_at, amount, user_name')
      .order('created_at', { ascending: false })
      .limit(5);

    if (commissionError) {
      console.log('❌ Error:', commissionError.message);
    } else {
      console.log('Recent commissions:');
      commissionRange?.forEach(c => {
        console.log(`- ${c.created_at}: ${c.user_name} amount=${c.amount}`);
      });
    }

    // Check cash_history for overhead
    console.log('\n4. 🏭 CASH HISTORY (Overhead):');
    const { data: cashRange, error: cashError } = await supabase
      .from('cash_history')
      .select('created_at, amount, description, type')
      .in('type', ['pengeluaran', 'kas_keluar_manual'])
      .order('created_at', { ascending: false })
      .limit(5);

    if (cashError) {
      console.log('❌ Error:', cashError.message);
    } else {
      console.log('Recent cash movements:');
      cashRange?.forEach(c => {
        console.log(`- ${c.created_at}: ${c.description} amount=${c.amount} type=${c.type}`);
      });
    }

    // Check material_stock_movements with different date range
    console.log('\n5. 📦 MATERIAL MOVEMENTS (All Time):');
    const { data: allMaterials, error: allMaterialError } = await supabase
      .from('material_stock_movements')
      .select('created_at, quantity, material_name, type, reason')
      .order('created_at', { ascending: false })
      .limit(10);

    if (allMaterialError) {
      console.log('❌ Error:', allMaterialError.message);
    } else {
      console.log('All material movements:');
      allMaterials?.forEach(m => {
        console.log(`- ${m.created_at}: ${m.material_name} qty=${m.quantity} ${m.type}/${m.reason}`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkActualDataPeriod();