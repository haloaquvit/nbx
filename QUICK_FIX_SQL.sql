-- ==========================================
-- QUICK FIX: Add branch_id columns
-- Run this SQL directly in Supabase SQL Editor
-- ==========================================

-- Add branch_id to most important tables
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE materials ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_profiles_branch_id ON profiles(branch_id);
CREATE INDEX IF NOT EXISTS idx_products_branch_id ON products(branch_id);
CREATE INDEX IF NOT EXISTS idx_transactions_branch_id ON transactions(branch_id);
CREATE INDEX IF NOT EXISTS idx_customers_branch_id ON customers(branch_id);
CREATE INDEX IF NOT EXISTS idx_materials_branch_id ON materials(branch_id);

-- Set default branch_id for existing data
DO $$
DECLARE
  kantor_pusat_id UUID;
  eskristal_id UUID;
BEGIN
  -- Get Kantor Pusat ID
  SELECT id INTO kantor_pusat_id
  FROM branches
  WHERE name = 'Kantor Pusat'
  LIMIT 1;

  -- Get Eskristal Aqvuit ID
  SELECT id INTO eskristal_id
  FROM branches
  WHERE name = 'Eskristal Aqvuit'
  LIMIT 1;

  RAISE NOTICE 'Kantor Pusat ID: %', kantor_pusat_id;
  RAISE NOTICE 'Eskristal Aqvuit ID: %', eskristal_id;

  -- Update profiles (assign to Kantor Pusat by default)
  UPDATE profiles
  SET branch_id = kantor_pusat_id
  WHERE branch_id IS NULL
  AND role NOT IN ('super_admin', 'head_office_admin');

  -- Update products (assign to Kantor Pusat by default)
  UPDATE products
  SET branch_id = kantor_pusat_id
  WHERE branch_id IS NULL;

  -- Update transactions (assign to Kantor Pusat by default)
  UPDATE transactions
  SET branch_id = kantor_pusat_id
  WHERE branch_id IS NULL;

  -- Update customers (assign to Kantor Pusat by default)
  UPDATE customers
  SET branch_id = kantor_pusat_id
  WHERE branch_id IS NULL;

  -- Update materials (assign to Kantor Pusat by default)
  UPDATE materials
  SET branch_id = kantor_pusat_id
  WHERE branch_id IS NULL;

  RAISE NOTICE 'Migration completed!';
END $$;

-- Verify the changes
SELECT
  'Profiles with branch_id' as table_name,
  COUNT(*) as total,
  COUNT(branch_id) as with_branch
FROM profiles
UNION ALL
SELECT
  'Products with branch_id',
  COUNT(*),
  COUNT(branch_id)
FROM products
UNION ALL
SELECT
  'Transactions with branch_id',
  COUNT(*),
  COUNT(branch_id)
FROM transactions;
