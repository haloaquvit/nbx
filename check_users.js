// Script untuk mengecek user yang terdaftar di Supabase
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkUsers() {
  try {
    console.log('🔍 Mengecek users di database...\n');

    // Coba ambil data dari tabel profiles dulu
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .limit(10);

    if (profileError) {
      console.log('⚠️  Error mengakses tabel profiles:', profileError.message);
    } else if (profiles && profiles.length > 0) {
      console.log('📋 Data dari tabel profiles:');
      console.log('=====================================');
      profiles.forEach((profile, index) => {
        console.log(`\n${index + 1}. User ID: ${profile.id}`);
        console.log(`   Email: ${profile.email || 'N/A'}`);
        console.log(`   Full Name: ${profile.full_name || 'N/A'}`);
        console.log(`   Role: ${profile.role || 'N/A'}`);
      });
      console.log('\n=====================================\n');
    } else {
      console.log('ℹ️  Tidak ada data di tabel profiles\n');
    }

    // Coba cek employees juga
    const { data: employees, error: empError } = await supabase
      .from('employees')
      .select('*')
      .limit(10);

    if (!empError && employees && employees.length > 0) {
      console.log('👥 Data dari tabel employees:');
      console.log('=====================================');
      employees.forEach((emp, index) => {
        console.log(`\n${index + 1}. Employee ID: ${emp.id}`);
        console.log(`   Name: ${emp.name || 'N/A'}`);
        console.log(`   Email: ${emp.email || 'N/A'}`);
        console.log(`   Position: ${emp.position || 'N/A'}`);
        console.log(`   Active: ${emp.is_active ? 'Yes' : 'No'}`);
      });
      console.log('\n=====================================\n');
    }

    console.log('✅ Selesai!\n');
    console.log('💡 Tip: Jika Anda lupa password, bisa reset via Supabase Dashboard');
    console.log('   URL: https://supabase.com/dashboard/project/emfvoassfrsokqwspuml/auth/users');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkUsers();
