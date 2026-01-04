-- Migration 010 v2: Fix Manokwari Stock and Inventory Journal
-- Purpose: Create inventory batches and stock adjustment journals for existing stock
-- Run this on Manokwari database ONLY
-- Date: 2026-01-04
-- Fixed: Removed updated_at from journal_entries, use inventory_batches for materials

-- ============================================================================
-- STEP 1: CEK BRANCH ID MANOKWARI
-- ============================================================================
DO $$
DECLARE
  v_branch_id UUID;
  v_branch_name TEXT;
BEGIN
  -- Get Manokwari branch (adjust name if different)
  SELECT id, name INTO v_branch_id, v_branch_name
  FROM branches
  WHERE name ILIKE '%manokwari%' OR name ILIKE '%mkw%' OR name ILIKE '%AEK%'
  LIMIT 1;

  IF v_branch_id IS NULL THEN
    -- If not found, get the first/only branch
    SELECT id, name INTO v_branch_id, v_branch_name
    FROM branches
    LIMIT 1;
  END IF;

  RAISE NOTICE 'Working on branch: % (ID: %)', v_branch_name, v_branch_id;
END $$;

-- ============================================================================
-- STEP 2: CREATE INVENTORY BATCHES FOR PRODUCTS (if not exists)
-- ============================================================================
DO $$
DECLARE
  v_product RECORD;
  v_batch_count INTEGER := 0;
  v_branch_id UUID;
BEGIN
  -- Get branch ID
  SELECT id INTO v_branch_id FROM branches LIMIT 1;

  RAISE NOTICE '=== CREATING PRODUCT INVENTORY BATCHES ===';

  FOR v_product IN
    SELECT p.id, p.name, p.initial_stock, p.current_stock, p.cost_price, p.branch_id
    FROM products p
    WHERE p.initial_stock > 0
      AND NOT EXISTS (
        SELECT 1 FROM inventory_batches ib
        WHERE ib.product_id = p.id
        AND ib.notes = 'Stok Awal'
      )
  LOOP
    -- Create batch with initial_stock
    INSERT INTO inventory_batches (
      product_id,
      branch_id,
      batch_date,
      initial_quantity,
      remaining_quantity,
      unit_cost,
      notes,
      created_at,
      updated_at
    ) VALUES (
      v_product.id,
      COALESCE(v_product.branch_id, v_branch_id),
      NOW(),
      v_product.initial_stock,
      v_product.initial_stock, -- Set remaining = initial (fresh start)
      COALESCE(v_product.cost_price, 0),
      'Stok Awal',
      NOW(),
      NOW()
    );

    v_batch_count := v_batch_count + 1;
    RAISE NOTICE 'Created batch for product: % (qty: %, cost: %)',
      v_product.name, v_product.initial_stock, COALESCE(v_product.cost_price, 0);
  END LOOP;

  RAISE NOTICE 'Created % new product inventory batches', v_batch_count;
END $$;

-- ============================================================================
-- STEP 3: CREATE INVENTORY BATCHES FOR MATERIALS (using inventory_batches with material_id)
-- ============================================================================
DO $$
DECLARE
  v_material RECORD;
  v_batch_count INTEGER := 0;
  v_branch_id UUID;
BEGIN
  -- Get branch ID
  SELECT id INTO v_branch_id FROM branches LIMIT 1;

  RAISE NOTICE '=== CREATING MATERIAL INVENTORY BATCHES ===';

  FOR v_material IN
    SELECT m.id, m.name, m.stock, m.price_per_unit, m.branch_id
    FROM materials m
    WHERE m.stock > 0
      AND NOT EXISTS (
        SELECT 1 FROM inventory_batches ib
        WHERE ib.material_id = m.id
        AND ib.notes = 'Stok Awal'
      )
  LOOP
    -- Create batch with current stock using material_id column
    INSERT INTO inventory_batches (
      material_id,
      branch_id,
      batch_date,
      initial_quantity,
      remaining_quantity,
      unit_cost,
      notes,
      created_at,
      updated_at
    ) VALUES (
      v_material.id,
      COALESCE(v_material.branch_id, v_branch_id),
      NOW(),
      v_material.stock,
      v_material.stock,
      COALESCE(v_material.price_per_unit, 0),
      'Stok Awal',
      NOW(),
      NOW()
    );

    v_batch_count := v_batch_count + 1;
    RAISE NOTICE 'Created batch for material: % (qty: %, cost: %)',
      v_material.name, v_material.stock, COALESCE(v_material.price_per_unit, 0);
  END LOOP;

  RAISE NOTICE 'Created % new material inventory batches', v_batch_count;
END $$;

-- ============================================================================
-- STEP 4: SYNC PRODUCTS.CURRENT_STOCK WITH INVENTORY BATCHES
-- ============================================================================
UPDATE products p
SET
  current_stock = COALESCE(batch_calc.calculated_stock, 0)
FROM (
  SELECT
    product_id,
    SUM(remaining_quantity) as calculated_stock
  FROM inventory_batches
  WHERE product_id IS NOT NULL AND remaining_quantity > 0
  GROUP BY product_id
) batch_calc
WHERE p.id = batch_calc.product_id
  AND p.current_stock != batch_calc.calculated_stock;

-- Set to 0 for products without batches
UPDATE products p
SET current_stock = 0
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_batches ib
  WHERE ib.product_id = p.id AND ib.remaining_quantity > 0
)
AND p.current_stock != 0;

-- ============================================================================
-- STEP 5: CREATE INITIAL STOCK JOURNALS FOR PERSEDIAAN BARANG DAGANG (1310)
-- NOTE: journal_entries does NOT have updated_at column
-- ============================================================================
DO $$
DECLARE
  v_product RECORD;
  v_journal_id UUID;
  v_entry_number TEXT;
  v_account_1310_id TEXT;
  v_account_3100_id TEXT;
  v_branch_id UUID;
  v_total_value NUMERIC := 0;
  v_journal_count INTEGER := 0;
BEGIN
  -- Get branch ID
  SELECT id INTO v_branch_id FROM branches LIMIT 1;

  -- Get account IDs
  SELECT id INTO v_account_1310_id FROM accounts WHERE code = '1310' LIMIT 1;
  SELECT id INTO v_account_3100_id FROM accounts WHERE code = '3100' LIMIT 1;

  IF v_account_1310_id IS NULL THEN
    RAISE NOTICE 'Account 1310 (Persediaan Barang Dagang) not found, skipping product journals';
    RETURN;
  END IF;

  IF v_account_3100_id IS NULL THEN
    RAISE NOTICE 'Account 3100 (Modal Disetor) not found, skipping product journals';
    RETURN;
  END IF;

  RAISE NOTICE '=== CREATING PRODUCT STOCK ADJUSTMENT JOURNALS ===';
  RAISE NOTICE 'Account 1310: %, Account 3100: %', v_account_1310_id, v_account_3100_id;

  -- Create one consolidated journal for all products
  FOR v_product IN
    SELECT
      p.id,
      p.name,
      p.initial_stock,
      p.cost_price,
      (p.initial_stock * COALESCE(p.cost_price, 0)) as total_value
    FROM products p
    WHERE p.initial_stock > 0
      AND p.cost_price > 0
      AND NOT EXISTS (
        -- Skip if journal already exists for this product
        SELECT 1 FROM journal_entries je
        WHERE je.reference_type = 'stock_adjustment'
        AND je.reference_id = p.id::text
        AND je.description LIKE '%Penyesuaian Stok Awal%'
      )
  LOOP
    v_total_value := v_total_value + v_product.total_value;

    -- Generate entry number
    v_entry_number := 'STK-ADJ-' || TO_CHAR(NOW(), 'YYMMDD') || '-' || LPAD((v_journal_count + 1)::TEXT, 3, '0');

    -- Create journal entry (NO updated_at column)
    INSERT INTO journal_entries (
      id,
      entry_number,
      entry_date,
      description,
      reference_type,
      reference_id,
      status,
      is_voided,
      branch_id,
      created_at
    ) VALUES (
      gen_random_uuid(),
      v_entry_number,
      NOW(),
      'Penyesuaian Stok Awal: ' || v_product.name || ' (' || v_product.initial_stock || ' unit x Rp ' || v_product.cost_price || ')',
      'stock_adjustment',
      v_product.id::text,
      'posted',
      false,
      v_branch_id,
      NOW()
    ) RETURNING id INTO v_journal_id;

    -- Debit: Persediaan Barang Dagang (1310)
    INSERT INTO journal_entry_lines (
      id,
      journal_entry_id,
      account_id,
      account_code,
      account_name,
      debit_amount,
      credit_amount,
      description,
      created_at
    ) VALUES (
      gen_random_uuid(),
      v_journal_id,
      v_account_1310_id,
      '1310',
      'Persediaan Barang Dagang',
      v_product.total_value,
      0,
      'Stok Awal: ' || v_product.name,
      NOW()
    );

    -- Credit: Modal Disetor (3100)
    INSERT INTO journal_entry_lines (
      id,
      journal_entry_id,
      account_id,
      account_code,
      account_name,
      debit_amount,
      credit_amount,
      description,
      created_at
    ) VALUES (
      gen_random_uuid(),
      v_journal_id,
      v_account_3100_id,
      '3100',
      'Modal Disetor',
      0,
      v_product.total_value,
      'Stok Awal: ' || v_product.name,
      NOW()
    );

    v_journal_count := v_journal_count + 1;
    RAISE NOTICE 'Created journal for %: Rp %', v_product.name, v_product.total_value;
  END LOOP;

  RAISE NOTICE 'Created % product stock journals, total value: Rp %', v_journal_count, v_total_value;
END $$;

-- ============================================================================
-- STEP 6: CREATE INITIAL STOCK JOURNALS FOR PERSEDIAAN BAHAN BAKU (1320)
-- ============================================================================
DO $$
DECLARE
  v_material RECORD;
  v_journal_id UUID;
  v_entry_number TEXT;
  v_account_1320_id TEXT;
  v_account_3100_id TEXT;
  v_branch_id UUID;
  v_total_value NUMERIC := 0;
  v_journal_count INTEGER := 0;
BEGIN
  -- Get branch ID
  SELECT id INTO v_branch_id FROM branches LIMIT 1;

  -- Get account IDs
  SELECT id INTO v_account_1320_id FROM accounts WHERE code = '1320' LIMIT 1;
  SELECT id INTO v_account_3100_id FROM accounts WHERE code = '3100' LIMIT 1;

  IF v_account_1320_id IS NULL THEN
    RAISE NOTICE 'Account 1320 (Persediaan Bahan Baku) not found, skipping material journals';
    RETURN;
  END IF;

  IF v_account_3100_id IS NULL THEN
    RAISE NOTICE 'Account 3100 (Modal Disetor) not found, skipping material journals';
    RETURN;
  END IF;

  RAISE NOTICE '=== CREATING MATERIAL STOCK ADJUSTMENT JOURNALS ===';
  RAISE NOTICE 'Account 1320: %, Account 3100: %', v_account_1320_id, v_account_3100_id;

  FOR v_material IN
    SELECT
      m.id,
      m.name,
      m.stock,
      m.price_per_unit,
      (m.stock * COALESCE(m.price_per_unit, 0)) as total_value
    FROM materials m
    WHERE m.stock > 0
      AND m.price_per_unit > 0
      AND NOT EXISTS (
        -- Skip if journal already exists for this material
        SELECT 1 FROM journal_entries je
        WHERE je.reference_type = 'material_stock_adjustment'
        AND je.reference_id = m.id::text
        AND je.description LIKE '%Penyesuaian Stok Awal%'
      )
  LOOP
    v_total_value := v_total_value + v_material.total_value;

    -- Generate entry number
    v_entry_number := 'MAT-ADJ-' || TO_CHAR(NOW(), 'YYMMDD') || '-' || LPAD((v_journal_count + 1)::TEXT, 3, '0');

    -- Create journal entry (NO updated_at column)
    INSERT INTO journal_entries (
      id,
      entry_number,
      entry_date,
      description,
      reference_type,
      reference_id,
      status,
      is_voided,
      branch_id,
      created_at
    ) VALUES (
      gen_random_uuid(),
      v_entry_number,
      NOW(),
      'Penyesuaian Stok Awal Bahan: ' || v_material.name || ' (' || v_material.stock || ' unit x Rp ' || v_material.price_per_unit || ')',
      'material_stock_adjustment',
      v_material.id::text,
      'posted',
      false,
      v_branch_id,
      NOW()
    ) RETURNING id INTO v_journal_id;

    -- Debit: Persediaan Bahan Baku (1320)
    INSERT INTO journal_entry_lines (
      id,
      journal_entry_id,
      account_id,
      account_code,
      account_name,
      debit_amount,
      credit_amount,
      description,
      created_at
    ) VALUES (
      gen_random_uuid(),
      v_journal_id,
      v_account_1320_id,
      '1320',
      'Persediaan Bahan Baku',
      v_material.total_value,
      0,
      'Stok Awal: ' || v_material.name,
      NOW()
    );

    -- Credit: Modal Disetor (3100)
    INSERT INTO journal_entry_lines (
      id,
      journal_entry_id,
      account_id,
      account_code,
      account_name,
      debit_amount,
      credit_amount,
      description,
      created_at
    ) VALUES (
      gen_random_uuid(),
      v_journal_id,
      v_account_3100_id,
      '3100',
      'Modal Disetor',
      0,
      v_material.total_value,
      'Stok Awal: ' || v_material.name,
      NOW()
    );

    v_journal_count := v_journal_count + 1;
    RAISE NOTICE 'Created journal for %: Rp %', v_material.name, v_material.total_value;
  END LOOP;

  RAISE NOTICE 'Created % material stock journals, total value: Rp %', v_journal_count, v_total_value;
END $$;

-- ============================================================================
-- STEP 7: VERIFY RESULTS
-- ============================================================================
DO $$
DECLARE
  v_product_batch_count INTEGER;
  v_material_batch_count INTEGER;
  v_product_journal_count INTEGER;
  v_material_journal_count INTEGER;
  v_persediaan_barang NUMERIC;
  v_persediaan_bahan NUMERIC;
BEGIN
  -- Count inventory batches
  SELECT COUNT(*) INTO v_product_batch_count FROM inventory_batches WHERE product_id IS NOT NULL AND notes = 'Stok Awal';
  SELECT COUNT(*) INTO v_material_batch_count FROM inventory_batches WHERE material_id IS NOT NULL AND notes = 'Stok Awal';

  -- Count journals
  SELECT COUNT(*) INTO v_product_journal_count
  FROM journal_entries WHERE reference_type = 'stock_adjustment';
  SELECT COUNT(*) INTO v_material_journal_count
  FROM journal_entries WHERE reference_type = 'material_stock_adjustment';

  -- Calculate balances
  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0) INTO v_persediaan_barang
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN accounts a ON a.id = jel.account_id
  WHERE a.code = '1310' AND je.is_voided = false AND je.status = 'posted';

  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0) INTO v_persediaan_bahan
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN accounts a ON a.id = jel.account_id
  WHERE a.code = '1320' AND je.is_voided = false AND je.status = 'posted';

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '         MIGRATION RESULTS             ';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Product Inventory Batches: %', v_product_batch_count;
  RAISE NOTICE 'Material Inventory Batches: %', v_material_batch_count;
  RAISE NOTICE 'Product Stock Journals: %', v_product_journal_count;
  RAISE NOTICE 'Material Stock Journals: %', v_material_journal_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Saldo Persediaan Barang Dagang (1310): Rp %', v_persediaan_barang;
  RAISE NOTICE 'Saldo Persediaan Bahan Baku (1320): Rp %', v_persediaan_bahan;
  RAISE NOTICE '========================================';
END $$;
