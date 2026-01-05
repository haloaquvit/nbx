-- ============================================================================
-- FULL SYNC: aquvit_dev → Production (aquvit_new & mkw_db)
--
-- Script ini akan:
-- 1. Hapus SEMUA functions lama (data TIDAK terhapus)
-- 2. Sync schema (add missing columns/tables)
-- 3. Deploy semua functions baru
--
-- Cara pakai:
--   # Nabire
--   PGPASSWORD='Aquvit2024' psql -U aquavit -h 127.0.0.1 -d aquvit_new -f full_sync_to_production.sql
--
--   # Manokwari
--   PGPASSWORD='Aquvit2024' psql -U aquavit -h 127.0.0.1 -d mkw_db -f full_sync_to_production.sql
--
--   # Restart PostgREST
--   pm2 restart postgrest-aquvit postgrest-mkw
-- ============================================================================

\echo '============================================'
\echo '  FULL SYNC TO PRODUCTION'
\echo '============================================'

SET client_min_messages TO WARNING;

-- ============================================================================
-- PART 1: DROP ALL EXISTING FUNCTIONS
-- ============================================================================

\echo ''
\echo '[1/3] Dropping all existing functions...'

DO $$
DECLARE
  func_record RECORD;
  drop_count INT := 0;
BEGIN
  -- Drop all functions in public schema (except system functions)
  FOR func_record IN
    SELECT
      n.nspname as schema_name,
      p.proname as func_name,
      pg_get_function_identity_arguments(p.oid) as func_args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname IN ('public', 'auth')
      AND p.proname NOT LIKE 'pg_%'
      AND p.proname NOT LIKE '_pg_%'
      AND p.prokind = 'f'
  LOOP
    BEGIN
      EXECUTE format('DROP FUNCTION IF EXISTS %I.%I(%s) CASCADE',
                     func_record.schema_name,
                     func_record.func_name,
                     func_record.func_args);
      drop_count := drop_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not drop %.%: %', func_record.schema_name, func_record.func_name, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'Dropped % functions', drop_count;
END $$;

-- ============================================================================
-- PART 2: SYNC SCHEMA (ADD MISSING COLUMNS/TABLES)
-- ============================================================================

\echo ''
\echo '[2/3] Syncing schema...'

-- Schema & Extensions
CREATE SCHEMA IF NOT EXISTS auth;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;

-- Types
DO $$ BEGIN
  CREATE TYPE attendance_status AS ENUM ('Hadir', 'Pulang');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- === CUSTOMERS ===
ALTER TABLE customers ADD COLUMN IF NOT EXISTS classification TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_visited_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_visited_by UUID;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS visit_count INTEGER DEFAULT 0;

-- === TRANSACTIONS ===
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_voided BOOLEAN DEFAULT FALSE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS voided_by UUID;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN DEFAULT FALSE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS cancelled_by UUID;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS hpp_snapshot JSONB;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS hpp_total NUMERIC DEFAULT 0;

-- === DELIVERIES ===
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN DEFAULT FALSE;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS cancelled_by UUID;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS hpp_total NUMERIC DEFAULT 0;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS hpp_snapshot JSONB;

-- === PRODUCTION_RECORDS ===
ALTER TABLE production_records ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN DEFAULT FALSE;
ALTER TABLE production_records ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE production_records ADD COLUMN IF NOT EXISTS cancelled_by UUID;
ALTER TABLE production_records ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE production_records ADD COLUMN IF NOT EXISTS bom_snapshot JSONB;

-- === EXPENSES ===
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN DEFAULT FALSE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS cancelled_by UUID;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- === JOURNAL_ENTRIES ===
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS is_voided BOOLEAN DEFAULT FALSE;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS voided_reason TEXT;

-- === JOURNAL_ENTRY_LINES ===
ALTER TABLE journal_entry_lines ADD COLUMN IF NOT EXISTS account_code TEXT;

-- === PROFILES ===
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pin TEXT;

-- === INVENTORY_BATCHES ===
ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS material_id UUID;
ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS production_id UUID;
ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS purchase_order_id UUID;
ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS supplier_id UUID;

-- === ACCOUNTS ===
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS initial_balance NUMERIC DEFAULT 0;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS normal_balance TEXT DEFAULT 'DEBIT';

-- === ACCOUNTS_PAYABLE ===
ALTER TABLE accounts_payable ADD COLUMN IF NOT EXISTS creditor_type TEXT DEFAULT 'supplier';
ALTER TABLE accounts_payable ADD COLUMN IF NOT EXISTS purchase_order_id TEXT;

-- === COMMISSION_ENTRIES ===
ALTER TABLE commission_entries ADD COLUMN IF NOT EXISTS delivery_id UUID;
ALTER TABLE commission_entries ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE commission_entries ADD COLUMN IF NOT EXISTS user_name TEXT;
ALTER TABLE commission_entries ADD COLUMN IF NOT EXISTS role TEXT;
ALTER TABLE commission_entries ADD COLUMN IF NOT EXISTS rate_per_qty NUMERIC;
ALTER TABLE commission_entries ADD COLUMN IF NOT EXISTS ref TEXT;

-- === NEW TABLES ===

-- closing_periods
CREATE TABLE IF NOT EXISTS closing_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INTEGER NOT NULL,
  branch_id UUID,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_by UUID,
  journal_entry_id UUID,
  net_income NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(year, branch_id)
);

-- transaction_payments
CREATE TABLE IF NOT EXISTS transaction_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id TEXT NOT NULL,
  branch_id UUID NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  payment_date TIMESTAMPTZ DEFAULT NOW(),
  account_name TEXT,
  description TEXT,
  notes TEXT,
  paid_by_user_name TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- inventory_batch_consumptions
CREATE TABLE IF NOT EXISTS inventory_batch_consumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL,
  quantity_consumed NUMERIC NOT NULL,
  consumed_at TIMESTAMPTZ DEFAULT NOW(),
  reference_id TEXT,
  reference_type TEXT,
  unit_cost NUMERIC DEFAULT 0,
  total_cost NUMERIC DEFAULT 0
);

-- product_stock_movements
CREATE TABLE IF NOT EXISTS product_stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  branch_id UUID,
  movement_type TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  reference_id TEXT,
  reference_type TEXT,
  unit_cost NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- === INDEXES ===
CREATE INDEX IF NOT EXISTS idx_transactions_branch_date ON transactions(branch_id, order_date);
CREATE INDEX IF NOT EXISTS idx_transactions_not_voided ON transactions(id) WHERE is_voided IS NOT TRUE;
CREATE INDEX IF NOT EXISTS idx_deliveries_not_cancelled ON deliveries(id) WHERE is_cancelled IS NOT TRUE;
CREATE INDEX IF NOT EXISTS idx_inventory_batches_product_fifo ON inventory_batches(product_id, branch_id, batch_date);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_material_fifo ON inventory_batches(material_id, branch_id, batch_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_reference ON journal_entries(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_branch_date ON journal_entries(branch_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_customers_classification ON customers(classification);

-- === VIEWS ===
CREATE OR REPLACE VIEW v_product_current_stock AS
SELECT
  product_id,
  branch_id,
  COALESCE(SUM(remaining_quantity), 0) as current_stock,
  COALESCE(SUM(remaining_quantity * unit_cost) / NULLIF(SUM(remaining_quantity), 0), 0) as avg_cost
FROM inventory_batches
WHERE product_id IS NOT NULL AND remaining_quantity > 0
GROUP BY product_id, branch_id;

CREATE OR REPLACE VIEW v_material_current_stock AS
SELECT
  material_id,
  branch_id,
  COALESCE(SUM(remaining_quantity), 0) as current_stock,
  COALESCE(SUM(remaining_quantity * unit_cost) / NULLIF(SUM(remaining_quantity), 0), 0) as avg_cost
FROM inventory_batches
WHERE material_id IS NOT NULL AND remaining_quantity > 0
GROUP BY material_id, branch_id;

-- === FOREIGN KEYS ===
DO $$ BEGIN
  ALTER TABLE transactions ADD CONSTRAINT transactions_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES customers(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE inventory_batches ADD CONSTRAINT inventory_batches_material_id_fkey
    FOREIGN KEY (material_id) REFERENCES materials(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

\echo '  Schema sync complete'

-- ============================================================================
-- PART 3: CREATE ALL FUNCTIONS (will be appended from RPC files)
-- ============================================================================

\echo ''
\echo '[3/3] Creating functions...'
\echo '  (Functions will be created from separate RPC files)'

-- ============================================================================
-- GRANTS
-- ============================================================================

DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN GRANT authenticated TO owner; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT authenticated TO admin; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT authenticated TO cashier; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT authenticated TO supir; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT authenticated TO sales; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT authenticated TO helper; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT authenticated TO supervisor; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT authenticated TO designer; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT authenticated TO operator; EXCEPTION WHEN OTHERS THEN NULL; END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA auth TO authenticated;

-- ============================================================================
-- DONE
-- ============================================================================

\echo ''
\echo '============================================'
\echo '  SCHEMA SYNC COMPLETE!'
\echo ''
\echo '  Next: Run all RPC files to create functions'
\echo '  Then: pm2 restart postgrest-aquvit postgrest-mkw'
\echo '============================================'
