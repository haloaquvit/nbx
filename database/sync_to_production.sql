-- ============================================================================
-- SYNC SCRIPT: aquvit_dev → Production (aquvit_new & mkw_db)
--
-- Cara pakai:
--   1. SSH ke VPS: ssh -i Aquvit.pem deployer@103.197.190.54
--   2. Jalankan untuk Nabire:
--      PGPASSWORD='Aquvit2024' psql -U aquavit -h 127.0.0.1 -d aquvit_new -f sync_to_production.sql
--   3. Jalankan untuk Manokwari:
--      PGPASSWORD='Aquvit2024' psql -U aquavit -h 127.0.0.1 -d mkw_db -f sync_to_production.sql
--   4. Restart PostgREST:
--      pm2 restart postgrest-aquvit postgrest-mkw
--
-- Script ini AMAN - tidak menghapus data apapun
-- ============================================================================

SET client_min_messages TO WARNING;

-- ============================================================================
-- 1. SCHEMA & EXTENSIONS
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS auth;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;

-- ============================================================================
-- 2. TYPES (jika belum ada)
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE attendance_status AS ENUM ('Hadir', 'Pulang');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 3. TABLES - ADD MISSING COLUMNS
-- ============================================================================

-- customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS classification TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_visited_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_visited_by UUID;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS visit_count INTEGER DEFAULT 0;

-- transactions table
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_voided BOOLEAN DEFAULT FALSE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS voided_by UUID;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN DEFAULT FALSE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS cancelled_by UUID;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- deliveries table
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN DEFAULT FALSE;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS cancelled_by UUID;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS hpp_total NUMERIC DEFAULT 0;

-- production_records table
ALTER TABLE production_records ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN DEFAULT FALSE;
ALTER TABLE production_records ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE production_records ADD COLUMN IF NOT EXISTS cancelled_by UUID;
ALTER TABLE production_records ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE production_records ADD COLUMN IF NOT EXISTS bom_snapshot JSONB;

-- expenses table
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN DEFAULT FALSE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS cancelled_by UUID;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- journal_entries table
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS is_voided BOOLEAN DEFAULT FALSE;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS voided_reason TEXT;

-- journal_entry_lines table
ALTER TABLE journal_entry_lines ADD COLUMN IF NOT EXISTS account_code TEXT;

-- profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pin TEXT;

-- inventory_batches table
ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS material_id UUID;
ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS production_id UUID;
ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS purchase_order_id UUID;
ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS supplier_id UUID;

-- accounts table
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS initial_balance NUMERIC DEFAULT 0;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS normal_balance TEXT DEFAULT 'DEBIT';

-- accounts_payable table
ALTER TABLE accounts_payable ADD COLUMN IF NOT EXISTS creditor_type TEXT DEFAULT 'supplier';
ALTER TABLE accounts_payable ADD COLUMN IF NOT EXISTS purchase_order_id TEXT;

-- commission_entries table
ALTER TABLE commission_entries ADD COLUMN IF NOT EXISTS delivery_id UUID;
ALTER TABLE commission_entries ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE commission_entries ADD COLUMN IF NOT EXISTS user_name TEXT;
ALTER TABLE commission_entries ADD COLUMN IF NOT EXISTS role TEXT;
ALTER TABLE commission_entries ADD COLUMN IF NOT EXISTS rate_per_qty NUMERIC;
ALTER TABLE commission_entries ADD COLUMN IF NOT EXISTS ref TEXT;

-- ============================================================================
-- 4. NEW TABLES (CREATE IF NOT EXISTS)
-- ============================================================================

-- closing_periods table
CREATE TABLE IF NOT EXISTS closing_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INTEGER NOT NULL,
  branch_id UUID REFERENCES branches(id),
  closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_by UUID REFERENCES profiles(id),
  journal_entry_id UUID REFERENCES journal_entries(id),
  net_income NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(year, branch_id)
);

-- transaction_payments table
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

-- inventory_batch_consumptions table (untuk audit FIFO)
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

-- product_stock_movements table
CREATE TABLE IF NOT EXISTS product_stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  branch_id UUID,
  movement_type TEXT NOT NULL, -- IN, OUT
  quantity NUMERIC NOT NULL,
  reference_id TEXT,
  reference_type TEXT,
  unit_cost NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 5. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_transactions_not_cancelled ON transactions(id) WHERE is_cancelled IS NOT TRUE;
CREATE INDEX IF NOT EXISTS idx_deliveries_not_cancelled ON deliveries(id) WHERE is_cancelled IS NOT TRUE;
CREATE INDEX IF NOT EXISTS idx_production_not_cancelled ON production_records(id) WHERE is_cancelled IS NOT TRUE;
CREATE INDEX IF NOT EXISTS idx_expenses_not_cancelled ON expenses(id) WHERE is_cancelled IS NOT TRUE;
CREATE INDEX IF NOT EXISTS idx_profiles_pin ON profiles(id) WHERE pin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_batches_material_id ON inventory_batches(material_id);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_product_fifo ON inventory_batches(product_id, branch_id, batch_date);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_material_fifo ON inventory_batches(material_id, branch_id, batch_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_reference ON journal_entries(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_branch_date ON journal_entries(branch_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_customers_classification ON customers(classification);

-- ============================================================================
-- 6. VIEWS
-- ============================================================================

-- View untuk stok produk saat ini (dari FIFO batches)
CREATE OR REPLACE VIEW v_product_current_stock AS
SELECT
  product_id,
  branch_id,
  COALESCE(SUM(remaining_quantity), 0) as current_stock,
  COALESCE(SUM(remaining_quantity * unit_cost) / NULLIF(SUM(remaining_quantity), 0), 0) as avg_cost
FROM inventory_batches
WHERE product_id IS NOT NULL
  AND remaining_quantity > 0
GROUP BY product_id, branch_id;

-- View untuk stok material saat ini
CREATE OR REPLACE VIEW v_material_current_stock AS
SELECT
  material_id,
  branch_id,
  COALESCE(SUM(remaining_quantity), 0) as current_stock,
  COALESCE(SUM(remaining_quantity * unit_cost) / NULLIF(SUM(remaining_quantity), 0), 0) as avg_cost
FROM inventory_batches
WHERE material_id IS NOT NULL
  AND remaining_quantity > 0
GROUP BY material_id, branch_id;

-- ============================================================================
-- 7. FOREIGN KEYS (safe add)
-- ============================================================================

DO $$ BEGIN
  ALTER TABLE transactions ADD CONSTRAINT transactions_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES customers(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE inventory_batches ADD CONSTRAINT inventory_batches_material_id_fkey
    FOREIGN KEY (material_id) REFERENCES materials(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE inventory_batches ADD CONSTRAINT inventory_batches_production_id_fkey
    FOREIGN KEY (production_id) REFERENCES production_records(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 8. GRANTS
-- ============================================================================

-- Ensure authenticated role exists
DO $$ BEGIN
  CREATE ROLE authenticated;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Grant authenticated to all app roles
DO $$ BEGIN
  GRANT authenticated TO owner;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  GRANT authenticated TO admin;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  GRANT authenticated TO cashier;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  GRANT authenticated TO supir;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  GRANT authenticated TO sales;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  GRANT authenticated TO helper;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Grant table access
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA auth TO authenticated;

-- ============================================================================
-- 9. SUCCESS MESSAGE
-- ============================================================================

DO $$ BEGIN
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Schema sync completed successfully!';
  RAISE NOTICE 'Remember to restart PostgREST:';
  RAISE NOTICE '  pm2 restart postgrest-aquvit postgrest-mkw';
  RAISE NOTICE '============================================';
END $$;
