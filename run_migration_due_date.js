// Script untuk menjalankan migration add due_date
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  try {
    console.log('🚀 Menjalankan migration add due_date...\n');

    const migrationSQL = readFileSync('./supabase/migrations/0200_add_due_date_to_purchase_orders.sql', 'utf8');
    console.log('📄 Migration SQL:');
    console.log(migrationSQL);
    console.log('\n');

    console.log('💡 Untuk menjalankan migration ini:');
    console.log('1. Buka Supabase Dashboard: https://supabase.com/dashboard/project/emfvoassfrsokqwspuml/editor');
    console.log('2. Pilih tab "SQL Editor"');
    console.log('3. Copy-paste SQL berikut:\n');
    console.log(migrationSQL);
    console.log('\n4. Klik "Run" atau tekan Ctrl+Enter\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

runMigration();
