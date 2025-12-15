import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const supabaseUrl = 'https://emfvoassfrsokqwspuml.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZnZvYXNzZnJzb2txd3NwdW1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyNzMzNjIsImV4cCI6MjA3MDg0OTM2Mn0.sCi25jGYEiCdmvFFLLWAD3BOpma3kJlYgsUuTZS-bQM';

const supabase = createClient(supabaseUrl, supabaseKey);

// List of tables to export
const tables = [
  'profiles',
  'customers',
  'products',
  'materials',
  'transactions',
  'transaction_items',
  'deliveries',
  'delivery_items',
  'accounts',
  'cash_history',
  'expenses',
  'stock_movements',
  'attendance',
  'employee_advances',
  'advance_repayments',
  'purchase_orders',
  'po_items',
  'suppliers',
  'accounts_payable',
  'ap_payments',
  'production_records',
  'production_errors',
  'payroll_periods',
  'payroll_details',
  'commission_rules',
  'retasi',
  'account_transfers',
  'roles',
  'role_permissions',
  'audit_logs'
];

async function exportData() {
  const exportData = {};

  console.log('Starting database export...\n');

  for (const table of tables) {
    try {
      console.log(`Exporting ${table}...`);
      const { data, error } = await supabase
        .from(table)
        .select('*');

      if (error) {
        console.log(`  ⚠️  Table ${table} not found or error: ${error.message}`);
        exportData[table] = [];
      } else {
        exportData[table] = data || [];
        console.log(`  ✓ Exported ${data?.length || 0} rows from ${table}`);
      }
    } catch (err) {
      console.log(`  ✗ Error exporting ${table}: ${err.message}`);
      exportData[table] = [];
    }
  }

  // Save to JSON file
  const filename = `database-export-${new Date().toISOString().split('T')[0]}.json`;
  writeFileSync(filename, JSON.stringify(exportData, null, 2));

  console.log(`\n✓ Export completed! Saved to ${filename}`);
  console.log(`File size: ${(Buffer.byteLength(JSON.stringify(exportData)) / 1024 / 1024).toFixed(2)} MB`);
}

exportData().catch(console.error);
