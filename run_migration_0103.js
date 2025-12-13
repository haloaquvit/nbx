// Script untuk menjalankan migration 0103 - add PO receipt fields
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  try {
    console.log('🚀 Menjalankan migration 0103_add_po_receipt_fields.sql...\n');

    // Read migration file
    const migrationSQL = readFileSync('./supabase/migrations/0103_add_po_receipt_fields.sql', 'utf8');
    console.log('📄 Migration SQL:');
    console.log(migrationSQL);
    console.log('\n');

    // Execute each ALTER TABLE statement separately
    const statements = [
      'ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_date timestamptz',
      'ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS delivery_note_photo text',
      'ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_by text',
      'ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_quantity numeric',
      'ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS expedition_receiver text'
    ];

    for (const statement of statements) {
      console.log(`⚙️  Executing: ${statement}`);
      const { error } = await supabase.rpc('exec_sql', { sql_query: statement }).single();

      if (error) {
        console.error(`❌ Error executing statement: ${error.message}`);
        console.log('⚠️  Trying alternative method...\n');

        // Alternative: Try using direct insert (won't work with ANON key, but we can try)
        console.log('💡 Migration perlu dijalankan melalui Supabase Dashboard atau Supabase CLI');
        console.log('\n📝 Cara menjalankan:');
        console.log('1. Buka Supabase Dashboard: https://supabase.com/dashboard/project/emfvoassfrsokqwspuml/editor');
        console.log('2. Pilih tab "SQL Editor"');
        console.log('3. Copy-paste SQL berikut:\n');
        console.log('-- Add fields for purchase order receipt tracking');
        console.log('ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_date timestamptz;');
        console.log('ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS delivery_note_photo text;');
        console.log('ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_by text;');
        console.log('ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_quantity numeric;');
        console.log('ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS expedition_receiver text;');
        console.log('\n4. Klik "Run" atau tekan Ctrl+Enter');
        return;
      }
      console.log('✅ Success!\n');
    }

    console.log('✅ Migration completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n💡 Migration perlu dijalankan melalui Supabase Dashboard atau Supabase CLI');
    console.log('\n📝 SQL yang perlu dijalankan:');
    console.log('-- Add fields for purchase order receipt tracking');
    console.log('ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_date timestamptz;');
    console.log('ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS delivery_note_photo text;');
    console.log('ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_by text;');
    console.log('ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_quantity numeric;');
    console.log('ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS expedition_receiver text;');
  }
}

runMigration();
