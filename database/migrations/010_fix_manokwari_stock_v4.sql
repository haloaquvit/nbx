-- Migration 010 v4: Fix Manokwari Stock and Inventory Journal
-- Purpose: Create stock adjustment journals for existing stock
-- Run this on Manokwari database ONLY
-- Date: 2026-01-04
-- Fixed: Create journal as 'draft', add lines, then update to 'posted'

-- ============================================================================
-- STEP 1: CEK BRANCH ID MANOKWARI
-- ============================================================================
DO $$
DECLARE
  v_branch_id UUID;
  v_branch_name TEXT;
BEGIN
  SELECT id, name INTO v_branch_id, v_branch_name
  FROM branches LIMIT 1;
  RAISE NOTICE 'Working on branch: % (ID: %)', v_branch_name, v_branch_id;
END $$;

-- ============================================================================
-- STEP 2: CREATE INITIAL STOCK JOURNALS FOR PERSEDIAAN BARANG DAGANG (1310)
-- Create as draft, add lines, then update to posted
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
  SELECT id INTO v_branch_id FROM branches LIMIT 1;

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
        SELECT 1 FROM journal_entries je
        WHERE je.reference_type = 'adjustment'
        AND je.reference_id = p.id::text
        AND je.description LIKE '%Penyesuaian Stok Awal%'
      )
  LOOP
    v_total_value := v_total_value + v_product.total_value;
    v_entry_number := 'STK-ADJ-' || TO_CHAR(NOW(), 'YYMMDD') || '-' || LPAD((v_journal_count + 1)::TEXT, 3, '0');

    -- Create journal as DRAFT first
    INSERT INTO journal_entries (
      id, entry_number, entry_date, description,
      reference_type, reference_id, status, is_voided,
      branch_id, created_at
    ) VALUES (
      gen_random_uuid(),
      v_entry_number,
      NOW(),
      'Penyesuaian Stok Awal Produk: ' || v_product.name || ' (' || v_product.initial_stock || ' unit x Rp ' || v_product.cost_price || ')',
      'adjustment',
      v_product.id::text,
      'draft',  -- Start as draft to allow adding lines
      false,
      v_branch_id,
      NOW()
    ) RETURNING id INTO v_journal_id;

    -- Debit: Persediaan Barang Dagang (1310)
    INSERT INTO journal_entry_lines (
      id, journal_entry_id, account_id, account_code, account_name,
      debit_amount, credit_amount, description, created_at
    ) VALUES (
      gen_random_uuid(), v_journal_id, v_account_1310_id, '1310',
      'Persediaan Barang Dagang', v_product.total_value, 0,
      'Stok Awal Produk: ' || v_product.name, NOW()
    );

    -- Credit: Modal Disetor (3100)
    INSERT INTO journal_entry_lines (
      id, journal_entry_id, account_id, account_code, account_name,
      debit_amount, credit_amount, description, created_at
    ) VALUES (
      gen_random_uuid(), v_journal_id, v_account_3100_id, '3100',
      'Modal Disetor', 0, v_product.total_value,
      'Stok Awal Produk: ' || v_product.name, NOW()
    );

    -- Now update to posted
    UPDATE journal_entries SET status = 'posted', total_debit = v_product.total_value, total_credit = v_product.total_value
    WHERE id = v_journal_id;

    v_journal_count := v_journal_count + 1;
    RAISE NOTICE 'Created journal for product %: Rp %', v_product.name, v_product.total_value;
  END LOOP;

  RAISE NOTICE 'Created % product stock journals, total value: Rp %', v_journal_count, v_total_value;
END $$;

-- ============================================================================
-- STEP 3: CREATE INITIAL STOCK JOURNALS FOR PERSEDIAAN BAHAN BAKU (1320)
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
  SELECT id INTO v_branch_id FROM branches LIMIT 1;

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
        SELECT 1 FROM journal_entries je
        WHERE je.reference_type = 'adjustment'
        AND je.reference_id = m.id::text
        AND je.description LIKE '%Penyesuaian Stok Awal Bahan%'
      )
  LOOP
    v_total_value := v_total_value + v_material.total_value;
    v_entry_number := 'MAT-ADJ-' || TO_CHAR(NOW(), 'YYMMDD') || '-' || LPAD((v_journal_count + 1)::TEXT, 3, '0');

    -- Create journal as DRAFT first
    INSERT INTO journal_entries (
      id, entry_number, entry_date, description,
      reference_type, reference_id, status, is_voided,
      branch_id, created_at
    ) VALUES (
      gen_random_uuid(),
      v_entry_number,
      NOW(),
      'Penyesuaian Stok Awal Bahan: ' || v_material.name || ' (' || v_material.stock || ' unit x Rp ' || v_material.price_per_unit || ')',
      'adjustment',
      v_material.id::text,
      'draft',  -- Start as draft to allow adding lines
      false,
      v_branch_id,
      NOW()
    ) RETURNING id INTO v_journal_id;

    -- Debit: Persediaan Bahan Baku (1320)
    INSERT INTO journal_entry_lines (
      id, journal_entry_id, account_id, account_code, account_name,
      debit_amount, credit_amount, description, created_at
    ) VALUES (
      gen_random_uuid(), v_journal_id, v_account_1320_id, '1320',
      'Persediaan Bahan Baku', v_material.total_value, 0,
      'Stok Awal Bahan: ' || v_material.name, NOW()
    );

    -- Credit: Modal Disetor (3100)
    INSERT INTO journal_entry_lines (
      id, journal_entry_id, account_id, account_code, account_name,
      debit_amount, credit_amount, description, created_at
    ) VALUES (
      gen_random_uuid(), v_journal_id, v_account_3100_id, '3100',
      'Modal Disetor', 0, v_material.total_value,
      'Stok Awal Bahan: ' || v_material.name, NOW()
    );

    -- Now update to posted
    UPDATE journal_entries SET status = 'posted', total_debit = v_material.total_value, total_credit = v_material.total_value
    WHERE id = v_journal_id;

    v_journal_count := v_journal_count + 1;
    RAISE NOTICE 'Created journal for material %: Rp %', v_material.name, v_material.total_value;
  END LOOP;

  RAISE NOTICE 'Created % material stock journals, total value: Rp %', v_journal_count, v_total_value;
END $$;

-- ============================================================================
-- STEP 4: VERIFY RESULTS
-- ============================================================================
DO $$
DECLARE
  v_product_batch_count INTEGER;
  v_material_batch_count INTEGER;
  v_adjustment_journal_count INTEGER;
  v_persediaan_barang NUMERIC;
  v_persediaan_bahan NUMERIC;
BEGIN
  SELECT COUNT(*) INTO v_product_batch_count FROM inventory_batches WHERE product_id IS NOT NULL AND notes = 'Stok Awal';
  SELECT COUNT(*) INTO v_material_batch_count FROM inventory_batches WHERE material_id IS NOT NULL AND notes = 'Stok Awal';
  SELECT COUNT(*) INTO v_adjustment_journal_count FROM journal_entries WHERE reference_type = 'adjustment' AND description LIKE '%Penyesuaian Stok Awal%';

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
  RAISE NOTICE 'Adjustment Journals Created: %', v_adjustment_journal_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Saldo Persediaan Barang Dagang (1310): Rp %', v_persediaan_barang;
  RAISE NOTICE 'Saldo Persediaan Bahan Baku (1320): Rp %', v_persediaan_bahan;
  RAISE NOTICE '========================================';
END $$;
