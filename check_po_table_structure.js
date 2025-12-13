// Script untuk mengecek struktur tabel purchase_orders
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTableStructure() {
  try {
    console.log('🔍 Mengecek struktur tabel purchase_orders...\n');

    // Coba ambil satu row untuk melihat kolom yang ada
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('*')
      .limit(1);

    if (error) {
      console.error('❌ Error:', error.message);
      console.log('\n💡 Kemungkinan penyebab:');
      console.log('   1. Migration belum dijalankan di database production');
      console.log('   2. Kolom delivery_note_photo belum ada di tabel');
      return;
    }

    if (data && data.length > 0) {
      console.log('✅ Tabel purchase_orders ditemukan!');
      console.log('\n📋 Kolom yang ada:');
      const columns = Object.keys(data[0]);
      columns.forEach((col, index) => {
        const hasColumn = col === 'delivery_note_photo' ? '✅' : '  ';
        console.log(`${hasColumn} ${index + 1}. ${col}`);
      });

      if (!columns.includes('delivery_note_photo')) {
        console.log('\n⚠️  MASALAH DITEMUKAN:');
        console.log('   Kolom "delivery_note_photo" TIDAK ADA di tabel!');
        console.log('\n🔧 Solusi:');
        console.log('   Perlu menjalankan migration: 0103_add_po_receipt_fields.sql');
      } else {
        console.log('\n✅ Kolom delivery_note_photo sudah ada!');
      }
    } else {
      console.log('ℹ️  Tabel purchase_orders kosong, tapi struktur OK');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkTableStructure();
