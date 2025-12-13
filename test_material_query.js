import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://emfvoassfrsokqwspuml.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZnZvYXNzZnJzb2txd3NwdW1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyNzMzNjIsImV4cCI6MjA3MDg0OTM2Mn0.sCi25jGYEiCdmvFFLLWAD3BOpma3kJlYgsUuTZS-bQM';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testMaterialQuery() {
  console.log('🔍 Testing material_stock_movements query...');

  try {
    // Test basic query first
    console.log('1. Testing basic query...');
    const { data: basicData, error: basicError } = await supabase
      .from('material_stock_movements')
      .select('*')
      .limit(5);

    if (basicError) {
      console.log('❌ Basic query error:', basicError.message);
      return;
    } else {
      console.log('✅ Basic query works, sample data:', basicData?.slice(0, 2));
    }

    // Test query with materials join
    console.log('2. Testing query with materials join...');
    const { data: joinData, error: joinError } = await supabase
      .from('material_stock_movements')
      .select('quantity, material_id, materials(price_per_unit)')
      .limit(5);

    if (joinError) {
      console.log('❌ Join query error:', joinError.message);
      console.log('❌ Join error details:', joinError);
    } else {
      console.log('✅ Join query works, sample data:', joinData?.slice(0, 2));
    }

    // Test query with filters
    console.log('3. Testing query with filters...');
    const { data: filterData, error: filterError } = await supabase
      .from('material_stock_movements')
      .select('quantity, material_id')
      .eq('type', 'OUT')
      .eq('reason', 'PRODUCTION_CONSUMPTION')
      .limit(5);

    if (filterError) {
      console.log('❌ Filter query error:', filterError.message);
    } else {
      console.log('✅ Filter query works, sample data:', filterData?.slice(0, 2));
    }

    // Test the exact failing query
    console.log('4. Testing exact failing query...');
    const { data: exactData, error: exactError } = await supabase
      .from('material_stock_movements')
      .select('quantity, material_id, materials(price_per_unit)')
      .gte('created_at', '2025-09-01')
      .lte('created_at', '2025-09-30T23:59:59')
      .eq('type', 'OUT')
      .eq('reason', 'PRODUCTION_CONSUMPTION');

    if (exactError) {
      console.log('❌ Exact query error:', exactError.message);
      console.log('❌ Exact error details:', exactError);
    } else {
      console.log('✅ Exact query works, data count:', exactData?.length);
    }

    // Check materials table relationship
    console.log('5. Testing materials table...');
    const { data: materialsData, error: materialsError } = await supabase
      .from('materials')
      .select('id, name, price_per_unit')
      .limit(5);

    if (materialsError) {
      console.log('❌ Materials query error:', materialsError.message);
    } else {
      console.log('✅ Materials query works, sample data:', materialsData?.slice(0, 2));
    }

  } catch (error) {
    console.error('❌ Error testing queries:', error);
  }
}

testMaterialQuery();