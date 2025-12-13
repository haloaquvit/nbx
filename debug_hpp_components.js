import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://emfvoassfrsokqwspuml.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZnZvYXNzZnJzb2txd3NwdW1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyNzMzNjIsImV4cCI6MjA3MDg0OTM2Mn0.sCi25jGYEiCdmvFFLLWAD3BOpma3kJlYgsUuTZS-bQM';

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugHPPComponents() {
  console.log('🔍 Debug HPP Components - September 2025');
  const fromDateStr = '2025-09-01';
  const toDateStr = '2025-09-30';

  try {
    // 1. Material Cost (Bahan Baku)
    console.log('\n1. 📦 MATERIAL COST (Bahan Baku):');
    const { data: materialConsumption, error: materialError } = await supabase
      .from('material_stock_movements')
      .select('quantity, material_id, materials(price_per_unit)')
      .gte('created_at', fromDateStr)
      .lte('created_at', toDateStr + 'T23:59:59')
      .eq('type', 'OUT')
      .eq('reason', 'PRODUCTION_CONSUMPTION');

    if (materialError) {
      console.log('❌ Material query error:', materialError.message);
    } else {
      console.log('Material movements count:', materialConsumption?.length || 0);
      const materialCost = materialConsumption?.reduce((sum, movement) => {
        const cost = (movement.quantity || 0) * (movement.materials?.price_per_unit || 0);
        return sum + cost;
      }, 0) || 0;
      console.log('✅ Material Cost:', materialCost.toLocaleString('id-ID'));
      console.log('Sample data:', materialConsumption?.slice(0, 3));
    }

    // 2. Labor Cost (Tenaga Kerja)
    console.log('\n2. 👷 LABOR COST (Tenaga Kerja):');
    const { data: payrollData, error: payrollError } = await supabase
      .from('payroll_records')
      .select('total_net, commission_amount, created_at')
      .gte('created_at', fromDateStr)
      .lte('created_at', toDateStr + 'T23:59:59');

    if (payrollError) {
      console.log('❌ Payroll query error:', payrollError.message);
    } else {
      console.log('Payroll records count:', payrollData?.length || 0);
      const laborCost = payrollData?.reduce((sum, record) => sum + (record.total_net || 0), 0) || 0;
      console.log('✅ Labor Cost:', laborCost.toLocaleString('id-ID'));
      console.log('Sample data:', payrollData?.slice(0, 3));
    }

    // 3. Overhead Cost (Biaya Overhead)
    console.log('\n3. 🏭 OVERHEAD COST (Biaya Overhead):');
    const { data: overheadData, error: overheadError } = await supabase
      .from('cash_history')
      .select('amount, description, type, created_at')
      .gte('created_at', fromDateStr)
      .lte('created_at', toDateStr + 'T23:59:59')
      .in('type', ['pengeluaran', 'kas_keluar_manual'])
      .or('description.ilike.%listrik%,description.ilike.%air%,description.ilike.%utilitas%,description.ilike.%overhead%');

    if (overheadError) {
      console.log('❌ Overhead query error:', overheadError.message);
    } else {
      console.log('Overhead records count:', overheadData?.length || 0);
      const overheadCost = overheadData?.reduce((sum, record) => sum + (record.amount || 0), 0) || 0;
      console.log('✅ Overhead Cost:', overheadCost.toLocaleString('id-ID'));
      console.log('Sample data:', overheadData?.slice(0, 3));
    }

    // 4. Commission Data (for comparison)
    console.log('\n4. 💰 COMMISSION DATA:');
    const { data: commissionData, error: commissionError } = await supabase
      .from('commission_entries')
      .select('amount, user_name, product_name, created_at')
      .gte('created_at', fromDateStr)
      .lte('created_at', toDateStr + 'T23:59:59');

    if (commissionError) {
      console.log('❌ Commission query error:', commissionError.message);
    } else {
      console.log('Commission records count:', commissionData?.length || 0);
      const totalCommissions = commissionData?.reduce((sum, comm) => sum + (comm.amount || 0), 0) || 0;
      console.log('✅ Total Commissions:', totalCommissions.toLocaleString('id-ID'));
      console.log('Sample data:', commissionData?.slice(0, 3));
    }

    // 5. Summary
    console.log('\n📊 SUMMARY:');
    const materialCostFinal = materialConsumption?.reduce((sum, movement) => {
      const cost = (movement.quantity || 0) * (movement.materials?.price_per_unit || 0);
      return sum + cost;
    }, 0) || 0;

    const laborCostFinal = payrollData?.reduce((sum, record) => sum + (record.total_net || 0), 0) || 0;

    const overheadCostFinal = overheadData?.reduce((sum, record) => sum + (record.amount || 0), 0) || 0;

    const totalCOGS = materialCostFinal + laborCostFinal + overheadCostFinal;

    console.log('Material Cost:', materialCostFinal.toLocaleString('id-ID'));
    console.log('Labor Cost:', laborCostFinal.toLocaleString('id-ID'));
    console.log('Overhead Cost:', overheadCostFinal.toLocaleString('id-ID'));
    console.log('TOTAL HPP:', totalCOGS.toLocaleString('id-ID'));

    console.log('\n🔍 VISIBILITY CHECK:');
    console.log('Material > 0?', materialCostFinal > 0);
    console.log('Labor > 0?', laborCostFinal > 0);
    console.log('Overhead > 0?', overheadCostFinal > 0);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

debugHPPComponents();