import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://emfvoassfrsokqwspuml.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZnZvYXNzZnJzb2txd3NwdW1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyNzMzNjIsImV4cCI6MjA3MDg0OTM2Mn0.sCi25jGYEiCdmvFFLLWAD3BOpma3kJlYgsUuTZS-bQM';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testAccountsPayable() {
  console.log('🔍 Testing accounts_payable access...');

  try {
    // Test 1: Basic query
    console.log('1. Testing basic select...');
    const { data: basicData, error: basicError } = await supabase
      .from('accounts_payable')
      .select('*')
      .limit(5);

    if (basicError) {
      console.log('❌ Basic query error:', basicError.message);
      console.log('❌ Error details:', basicError);
    } else {
      console.log('✅ Basic query works, data count:', basicData?.length);
    }

    // Test 2: Count query
    console.log('2. Testing count query...');
    const { count, error: countError } = await supabase
      .from('accounts_payable')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.log('❌ Count query error:', countError.message);
    } else {
      console.log('✅ Count query works, total records:', count);
    }

    // Test 3: Ordered query (the failing one)
    console.log('3. Testing ordered query...');
    const { data: orderedData, error: orderedError } = await supabase
      .from('accounts_payable')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    if (orderedError) {
      console.log('❌ Ordered query error:', orderedError.message);
      console.log('❌ Error details:', orderedError);
    } else {
      console.log('✅ Ordered query works, data:', orderedData);
    }

    // Test 4: Insert test record
    console.log('4. Testing insert...');
    const testRecord = {
      id: 'test-ap-' + Date.now(),
      supplier_name: 'Test Supplier',
      amount: 100000,
      description: 'Test payable',
      status: 'Outstanding'
    };

    const { data: insertData, error: insertError } = await supabase
      .from('accounts_payable')
      .insert(testRecord)
      .select()
      .single();

    if (insertError) {
      console.log('❌ Insert error:', insertError.message);
      console.log('❌ Insert error details:', insertError);
    } else {
      console.log('✅ Insert works, inserted record:', insertData);

      // Clean up test record
      await supabase
        .from('accounts_payable')
        .delete()
        .eq('id', testRecord.id);
      console.log('✅ Test record cleaned up');
    }

    // Test 5: Check RLS policies
    console.log('5. Testing RLS policies...');
    const { data: rlsData, error: rlsError } = await supabase
      .rpc('check_table_policies', { table_name: 'accounts_payable' })
      .catch(() => null);

    console.log('RLS test completed (may not be available)');

  } catch (error) {
    console.error('❌ Error testing accounts_payable:', error);
  }
}

// Test direct URL access
async function testDirectURL() {
  console.log('🌐 Testing direct URL access...');

  try {
    const response = await fetch(
      'https://emfvoassfrsokqwspuml.supabase.co/rest/v1/accounts_payable?select=*&order=created_at.desc&limit=1',
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Response status:', response.status);
    console.log('Response statusText:', response.statusText);

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Direct URL works, data:', data);
    } else {
      const errorText = await response.text();
      console.log('❌ Direct URL failed:', errorText);
    }
  } catch (error) {
    console.error('❌ Direct URL error:', error);
  }
}

async function main() {
  await testAccountsPayable();
  console.log('\n' + '='.repeat(50) + '\n');
  await testDirectURL();
}

main();