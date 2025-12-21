/**
 * Script untuk Export Data dari Supabase via API
 * Bisa dijalankan dengan Docker atau Node.js langsung
 *
 * Usage:
 *   node export-supabase.js
 *   atau
 *   docker run --rm -v $(pwd)/output:/app/output supabase-export
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ============================================================================
// KONFIGURASI - Ganti dengan credentials Supabase Anda
// ============================================================================
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://emfvoassfrsokqwspuml.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZnZvYXNzZnJzb2txd3NwdW1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyNzMzNjIsImV4cCI6MjA3MDg0OTM2Mn0.sCi25jGYEiCdmvFFLLWAD3BOpma3kJlYgsUuTZS-bQM';

// Daftar lengkap tabel yang akan di-export (dari analisis codebase)
const TABLES = [
  // Core tables
  'accounts',
  'accounts_payable',
  'assets',
  'asset_maintenance',
  'attendance',
  'branches',
  'companies',
  'company_settings',
  'customers',
  'customer_pricings',

  // Transaction & Cash
  'cash_history',
  'transactions',
  'deliveries',
  'delivery_items',
  'quotations',
  'payment_history',

  // Products & Materials
  'products',
  'product_materials',
  'materials',
  'material_stock_movements',
  'stock_pricings',
  'bonus_pricings',

  // Purchase & Suppliers
  'purchase_orders',
  'purchase_order_items',
  'suppliers',
  'supplier_materials',

  // Employees & Payroll
  'profiles',
  'employee_advances',
  'advance_repayments',
  'employee_salaries',
  'employee_salary_summary',
  'payroll_records',
  'payroll_summary',

  // Commission
  'commission_rules',
  'commission_entries',
  'sales_commission_settings',

  // Production
  'production_records',

  // Expenses
  'expenses',
  'expense_category_mapping',

  // Retasi
  'retasi',
  'retasi_items',

  // Roles & Permissions
  'roles',
  'user_roles',
  'role_permissions',

  // Notifications
  'notifications',

  // Zakat
  'zakat_records',
  'nishab_reference',

  // Dashboard
  'dashboard_summary',
];

// Output directory
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(__dirname, 'output');

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function makeRequest(tableName, offset = 0, limit = 1000) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${tableName}`);
    url.searchParams.set('select', '*');
    url.searchParams.set('offset', offset.toString());
    url.searchParams.set('limit', limit.toString());

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'count=exact'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const contentRange = res.headers['content-range'];
          const total = contentRange ? parseInt(contentRange.split('/')[1]) : null;
          resolve({
            data: JSON.parse(data),
            total,
            statusCode: res.statusCode
          });
        } catch (e) {
          reject(new Error(`Failed to parse response for ${tableName}: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function exportTable(tableName) {
  console.log(`\n📦 Exporting table: ${tableName}`);

  let allData = [];
  let offset = 0;
  const limit = 1000;
  let total = null;

  try {
    // Fetch data with pagination
    while (true) {
      const result = await makeRequest(tableName, offset, limit);

      if (result.statusCode === 404) {
        console.log(`   ⚠️  Table not found: ${tableName}`);
        return { table: tableName, count: 0, error: 'Table not found' };
      }

      if (result.statusCode !== 200) {
        console.log(`   ❌ Error: ${result.statusCode}`);
        return { table: tableName, count: 0, error: `HTTP ${result.statusCode}` };
      }

      if (!Array.isArray(result.data)) {
        console.log(`   ❌ Invalid response format`);
        return { table: tableName, count: 0, error: 'Invalid response' };
      }

      allData = allData.concat(result.data);

      if (total === null) {
        total = result.total || result.data.length;
      }

      console.log(`   📊 Fetched ${allData.length}/${total || '?'} rows`);

      if (result.data.length < limit) {
        break; // No more data
      }
      offset += limit;
    }

    // Save to file
    const filePath = path.join(OUTPUT_DIR, `${tableName}.json`);
    fs.writeFileSync(filePath, JSON.stringify(allData, null, 2));
    console.log(`   ✅ Saved to ${tableName}.json (${allData.length} rows)`);

    return { table: tableName, count: allData.length, error: null };
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return { table: tableName, count: 0, error: error.message };
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         SUPABASE DATA EXPORT TOOL                          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\n📁 Output directory: ${OUTPUT_DIR}`);
  console.log(`🔗 Supabase URL: ${SUPABASE_URL}`);
  console.log(`📋 Tables to export: ${TABLES.length}`);

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const startTime = Date.now();
  const results = [];

  // Export each table
  for (const table of TABLES) {
    const result = await exportTable(table);
    results.push(result);
  }

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  const successCount = results.filter(r => !r.error).length;
  const totalRows = results.reduce((sum, r) => sum + r.count, 0);

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                     EXPORT SUMMARY                         ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\n⏱️  Time elapsed: ${elapsed}s`);
  console.log(`✅ Successful: ${successCount}/${TABLES.length} tables`);
  console.log(`📊 Total rows: ${totalRows}`);

  // Save summary
  const summaryPath = path.join(OUTPUT_DIR, '_export_summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify({
    exportedAt: new Date().toISOString(),
    supabaseUrl: SUPABASE_URL,
    elapsedSeconds: parseFloat(elapsed),
    results
  }, null, 2));

  console.log(`\n📄 Summary saved to: _export_summary.json`);

  // Show errors if any
  const errors = results.filter(r => r.error);
  if (errors.length > 0) {
    console.log('\n⚠️  Tables with errors:');
    errors.forEach(e => console.log(`   - ${e.table}: ${e.error}`));
  }

  console.log('\n🎉 Export complete!\n');
}

main().catch(console.error);
