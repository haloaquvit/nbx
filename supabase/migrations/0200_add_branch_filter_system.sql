-- Migration: Add Branch Filter System
-- Purpose: Enable branch-level data filtering and multi-branch support
-- Created: 2025-12-18

-- ============================================
-- STEP 1: Add branch_id columns to all tables
-- ============================================

-- Transactions
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- Customers
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- Products
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- Materials
ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- Purchase Orders
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- Employees
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- Accounts (Chart of Accounts)
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- Cash History
ALTER TABLE cash_history
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- Stock Movements
ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- Material Stock Movements
ALTER TABLE material_stock_movements
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- Deliveries
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- Retasi
ALTER TABLE retasi
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- Commissions
ALTER TABLE commissions
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- Assets
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- Maintenance Records
ALTER TABLE maintenance_records
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- Zakat Records
ALTER TABLE zakat_records
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- Profiles (User/Employee accounts) - IMPORTANT for employee management
-- Note: profiles table already has branch_id from initial schema
-- But we add it here for completeness and to ensure it exists
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- ============================================
-- STEP 2: Create indexes for performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_transactions_branch_id ON transactions(branch_id);
CREATE INDEX IF NOT EXISTS idx_customers_branch_id ON customers(branch_id);
CREATE INDEX IF NOT EXISTS idx_products_branch_id ON products(branch_id);
CREATE INDEX IF NOT EXISTS idx_materials_branch_id ON materials(branch_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_branch_id ON purchase_orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_employees_branch_id ON employees(branch_id);
CREATE INDEX IF NOT EXISTS idx_accounts_branch_id ON accounts(branch_id);
CREATE INDEX IF NOT EXISTS idx_cash_history_branch_id ON cash_history(branch_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_branch_id ON stock_movements(branch_id);
CREATE INDEX IF NOT EXISTS idx_material_stock_movements_branch_id ON material_stock_movements(branch_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_branch_id ON deliveries(branch_id);
CREATE INDEX IF NOT EXISTS idx_retasi_branch_id ON retasi(branch_id);
CREATE INDEX IF NOT EXISTS idx_commissions_branch_id ON commissions(branch_id);
CREATE INDEX IF NOT EXISTS idx_assets_branch_id ON assets(branch_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_records_branch_id ON maintenance_records(branch_id);
CREATE INDEX IF NOT EXISTS idx_zakat_records_branch_id ON zakat_records(branch_id);
CREATE INDEX IF NOT EXISTS idx_profiles_branch_id ON profiles(branch_id);

-- ============================================
-- STEP 3: Migrate existing data
-- ============================================
-- Set branch_id for existing data based on user's branch from profiles

-- Helper function to get default branch (first active branch)
DO $$
DECLARE
  default_branch_id UUID;
BEGIN
  -- Get first active branch as default
  SELECT id INTO default_branch_id
  FROM branches
  WHERE is_active = true
  ORDER BY created_at ASC
  LIMIT 1;

  -- If no default branch found, exit
  IF default_branch_id IS NULL THEN
    RAISE NOTICE 'No active branch found. Skipping data migration.';
    RETURN;
  END IF;

  RAISE NOTICE 'Using default branch: %', default_branch_id;

  -- Update transactions (use cashier's branch)
  UPDATE transactions t
  SET branch_id = COALESCE(
    (SELECT branch_id FROM profiles WHERE id = t.cashier_id),
    default_branch_id
  )
  WHERE branch_id IS NULL;

  -- Update customers (use default branch for now)
  UPDATE customers
  SET branch_id = default_branch_id
  WHERE branch_id IS NULL;

  -- Update products (use default branch)
  UPDATE products
  SET branch_id = default_branch_id
  WHERE branch_id IS NULL;

  -- Update materials (use default branch)
  UPDATE materials
  SET branch_id = default_branch_id
  WHERE branch_id IS NULL;

  -- Update purchase_orders (use requester's branch if available)
  UPDATE purchase_orders po
  SET branch_id = COALESCE(
    (SELECT branch_id FROM profiles WHERE name = po.requested_by LIMIT 1),
    default_branch_id
  )
  WHERE branch_id IS NULL;

  -- Update employees (use their assigned branch from profiles)
  UPDATE employees e
  SET branch_id = COALESCE(
    (SELECT branch_id FROM profiles WHERE id = e.user_id),
    default_branch_id
  )
  WHERE branch_id IS NULL;

  -- Update accounts (use default branch)
  UPDATE accounts
  SET branch_id = default_branch_id
  WHERE branch_id IS NULL;

  -- Update cash_history (use user's branch)
  UPDATE cash_history ch
  SET branch_id = COALESCE(
    (SELECT branch_id FROM profiles WHERE id = ch.user_id),
    default_branch_id
  )
  WHERE branch_id IS NULL;

  -- Update stock_movements (use default branch)
  UPDATE stock_movements
  SET branch_id = default_branch_id
  WHERE branch_id IS NULL;

  -- Update material_stock_movements (use default branch)
  UPDATE material_stock_movements
  SET branch_id = default_branch_id
  WHERE branch_id IS NULL;

  -- Update other tables similarly
  UPDATE deliveries SET branch_id = default_branch_id WHERE branch_id IS NULL;
  UPDATE retasi SET branch_id = default_branch_id WHERE branch_id IS NULL;
  UPDATE commissions SET branch_id = default_branch_id WHERE branch_id IS NULL;
  UPDATE assets SET branch_id = default_branch_id WHERE branch_id IS NULL;
  UPDATE maintenance_records SET branch_id = default_branch_id WHERE branch_id IS NULL;
  UPDATE zakat_records SET branch_id = default_branch_id WHERE branch_id IS NULL;

  -- Update profiles (assign users to default branch if not assigned)
  -- Note: profiles might already have branch_id from initial setup
  UPDATE profiles
  SET branch_id = default_branch_id
  WHERE branch_id IS NULL
  AND role NOT IN ('super_admin', 'head_office_admin'); -- Don't force branch for head office users

  RAISE NOTICE 'Data migration completed successfully';
END $$;

-- ============================================
-- STEP 4: Add RLS policies for branch filtering
-- ============================================

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "branch_filter_transactions_select" ON transactions;
DROP POLICY IF EXISTS "branch_filter_customers_select" ON customers;
DROP POLICY IF EXISTS "branch_filter_products_select" ON products;
DROP POLICY IF EXISTS "branch_filter_materials_select" ON materials;

-- Transactions: Users can only see transactions from their branch
-- Head office roles can see all branches
CREATE POLICY "branch_filter_transactions_select"
  ON transactions
  FOR SELECT
  USING (
    -- Head office can see all
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'owner', 'head_office_admin')
    )
    OR
    -- Regular users see their branch only
    branch_id IN (
      SELECT branch_id FROM profiles WHERE profiles.id = auth.uid()
    )
  );

-- Customers: Branch-level filtering
CREATE POLICY "branch_filter_customers_select"
  ON customers
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'owner', 'head_office_admin')
    )
    OR
    branch_id IN (
      SELECT branch_id FROM profiles WHERE profiles.id = auth.uid()
    )
  );

-- Products: Branch-level filtering
CREATE POLICY "branch_filter_products_select"
  ON products
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'owner', 'head_office_admin')
    )
    OR
    branch_id IN (
      SELECT branch_id FROM profiles WHERE profiles.id = auth.uid()
    )
  );

-- Materials: Branch-level filtering
CREATE POLICY "branch_filter_materials_select"
  ON materials
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'owner', 'head_office_admin')
    )
    OR
    branch_id IN (
      SELECT branch_id FROM profiles WHERE profiles.id = auth.uid()
    )
  );

-- Add similar policies for other tables
-- (Can be extended as needed)

-- ============================================
-- STEP 5: Create function to auto-set branch_id
-- ============================================

-- Function to get current user's branch_id
CREATE OR REPLACE FUNCTION get_current_user_branch_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_branch_id UUID;
BEGIN
  SELECT branch_id INTO user_branch_id
  FROM profiles
  WHERE id = auth.uid();

  RETURN user_branch_id;
END;
$$;

-- Function to auto-set branch_id on insert
CREATE OR REPLACE FUNCTION set_branch_id_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only set if branch_id is NULL
  IF NEW.branch_id IS NULL THEN
    NEW.branch_id := get_current_user_branch_id();
  END IF;
  RETURN NEW;
END;
$$;

-- Create triggers for auto-setting branch_id
CREATE TRIGGER transactions_set_branch_id
  BEFORE INSERT ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION set_branch_id_on_insert();

CREATE TRIGGER customers_set_branch_id
  BEFORE INSERT ON customers
  FOR EACH ROW
  EXECUTE FUNCTION set_branch_id_on_insert();

CREATE TRIGGER products_set_branch_id
  BEFORE INSERT ON products
  FOR EACH ROW
  EXECUTE FUNCTION set_branch_id_on_insert();

CREATE TRIGGER materials_set_branch_id
  BEFORE INSERT ON materials
  FOR EACH ROW
  EXECUTE FUNCTION set_branch_id_on_insert();

-- Add more triggers as needed for other tables

-- ============================================
-- Verification
-- ============================================

-- Comment out or remove after verification
-- SELECT 'Migration completed successfully!' as status;
-- SELECT 'Total branches: ' || COUNT(*) FROM branches;
-- SELECT table_name, column_name
-- FROM information_schema.columns
-- WHERE column_name = 'branch_id'
-- ORDER BY table_name;
