/**
 * Script untuk Import Data JSON ke PostgreSQL
 * Jalankan setelah export-supabase.js
 *
 * Usage:
 *   node import-to-postgres.js
 *
 * Environment Variables:
 *   POSTGRES_HOST - PostgreSQL host (default: localhost)
 *   POSTGRES_PORT - PostgreSQL port (default: 5432)
 *   POSTGRES_DB   - Database name (default: aquvit)
 *   POSTGRES_USER - Database user (default: postgres)
 *   POSTGRES_PASSWORD - Database password
 *   INPUT_DIR - Directory containing JSON files (default: ./output)
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// ============================================================================
// KONFIGURASI
// ============================================================================
const config = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'aquvit',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'your_password',
};

const INPUT_DIR = process.env.INPUT_DIR || path.join(__dirname, 'output');

// Urutan import (untuk foreign key constraints)
const IMPORT_ORDER = [
  'branches',
  'roles',
  'accounts',
  'suppliers',
  'customers',
  'drivers',
  'employees',
  'user_roles',
  'materials',
  'products',
  'purchase_orders',
  'purchase_order_items',
  'productions',
  'production_items',
  'transactions',
  'transaction_items',
  'retasi',
  'retasi_items',
  'cash_history',
  'expenses',
  'payroll',
  'commissions',
  'accounts_payable',
  'accounts_receivable',
  'assets',
  'hpp_movements',
  'stock_movements',
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function escapeValue(value) {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  if (typeof value === 'number') {
    return value.toString();
  }
  if (typeof value === 'object') {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  }
  // String
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function importTable(client, tableName) {
  const filePath = path.join(INPUT_DIR, `${tableName}.json`);

  if (!fs.existsSync(filePath)) {
    console.log(`   ⚠️  File not found: ${tableName}.json`);
    return { table: tableName, count: 0, error: 'File not found' };
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    if (!Array.isArray(data) || data.length === 0) {
      console.log(`   ⏭️  Empty or invalid data: ${tableName}`);
      return { table: tableName, count: 0, error: null };
    }

    // Get column names from first row
    const columns = Object.keys(data[0]);

    // Disable triggers temporarily for faster insert
    await client.query(`ALTER TABLE ${tableName} DISABLE TRIGGER ALL`);

    let insertedCount = 0;

    // Insert in batches
    const batchSize = 100;
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);

      const values = batch.map(row => {
        const rowValues = columns.map(col => escapeValue(row[col]));
        return `(${rowValues.join(', ')})`;
      }).join(',\n');

      const sql = `
        INSERT INTO ${tableName} (${columns.map(c => `"${c}"`).join(', ')})
        VALUES ${values}
        ON CONFLICT DO NOTHING
      `;

      try {
        const result = await client.query(sql);
        insertedCount += result.rowCount || 0;
      } catch (e) {
        console.log(`   ⚠️  Batch error: ${e.message.substring(0, 100)}`);
      }
    }

    // Re-enable triggers
    await client.query(`ALTER TABLE ${tableName} ENABLE TRIGGER ALL`);

    console.log(`   ✅ Imported ${insertedCount}/${data.length} rows to ${tableName}`);
    return { table: tableName, count: insertedCount, error: null };

  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return { table: tableName, count: 0, error: error.message };
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         POSTGRESQL DATA IMPORT TOOL                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\n📁 Input directory: ${INPUT_DIR}`);
  console.log(`🔗 PostgreSQL: ${config.host}:${config.port}/${config.database}`);

  const client = new Client(config);

  try {
    console.log('\n🔌 Connecting to PostgreSQL...');
    await client.connect();
    console.log('   ✅ Connected!\n');

    const startTime = Date.now();
    const results = [];

    // Import each table in order
    for (const table of IMPORT_ORDER) {
      console.log(`\n📦 Importing table: ${table}`);
      const result = await importTable(client, table);
      results.push(result);
    }

    // Summary
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    const successCount = results.filter(r => !r.error).length;
    const totalRows = results.reduce((sum, r) => sum + r.count, 0);

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                     IMPORT SUMMARY                         ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`\n⏱️  Time elapsed: ${elapsed}s`);
    console.log(`✅ Successful: ${successCount}/${IMPORT_ORDER.length} tables`);
    console.log(`📊 Total rows imported: ${totalRows}`);

    // Show errors if any
    const errors = results.filter(r => r.error);
    if (errors.length > 0) {
      console.log('\n⚠️  Tables with errors:');
      errors.forEach(e => console.log(`   - ${e.table}: ${e.error}`));
    }

    console.log('\n🎉 Import complete!\n');

  } catch (error) {
    console.error('❌ Connection error:', error.message);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
