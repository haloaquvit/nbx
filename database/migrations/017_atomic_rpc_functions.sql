-- ============================================================================
-- Migration 017: Atomic RPC Functions
-- Purpose: All critical business operations as atomic database functions
-- Date: 2026-01-04
--
-- This migration creates RPC functions for:
-- 1. Production (material consume + product batch + journal)
-- 2. Delivery (stock transfer + HPP journal)
-- 3. Void/Cancel (reverse all operations)
-- 4. Journal (create journal with validation)
-- 5. Receivables/Payables (saldo update atomic)
-- ============================================================================

-- ============================================================================
-- 1. PRODUCTION RPC - Atomic production with material consume + journal
-- ============================================================================

CREATE OR REPLACE FUNCTION process_production_atomic(
  p_product_id UUID,
  p_quantity NUMERIC,
  p_consume_bom BOOLEAN,
  p_note TEXT DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_user_name TEXT DEFAULT 'System'
)
RETURNS TABLE (
  success BOOLEAN,
  production_id UUID,
  production_ref TEXT,
  total_material_cost NUMERIC,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_ref TEXT;
  v_production_id UUID;
  v_product RECORD;
  v_bom RECORD;
  v_total_material_cost NUMERIC := 0;
  v_material_details TEXT := '';
  v_journal_id UUID;
  v_batch_id UUID;
  v_fifo_result RECORD;
  v_unit_cost NUMERIC;
BEGIN
  -- Generate production reference
  v_ref := 'PRD-' || TO_CHAR(NOW(), 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0');

  -- Validate inputs
  IF p_product_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID, 'Product ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_quantity <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID, 'Quantity must be positive'::TEXT;
    RETURN;
  END IF;

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID, 'Branch ID is required'::TEXT;
    RETURN;
  END IF;

  -- Get product details
  SELECT id, name, branch_id INTO v_product
  FROM products
  WHERE id = p_product_id;

  IF v_product.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID, 'Product not found'::TEXT;
    RETURN;
  END IF;

  -- Validate branch match
  IF v_product.branch_id IS NOT NULL AND v_product.branch_id != p_branch_id THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID, 'Product belongs to different branch'::TEXT;
    RETURN;
  END IF;

  -- If consume BOM, check material stock and consume
  IF p_consume_bom THEN
    -- First, validate all material stock is sufficient
    FOR v_bom IN
      SELECT
        pm.material_id,
        pm.quantity as bom_qty,
        m.name as material_name,
        m.cost_price,
        m.price_per_unit,
        COALESCE(
          (SELECT SUM(remaining_quantity) FROM inventory_batches
           WHERE material_id = pm.material_id AND remaining_quantity > 0
           AND (branch_id = p_branch_id OR branch_id IS NULL)),
          0
        ) as available_stock
      FROM product_materials pm
      JOIN materials m ON m.id = pm.material_id
      WHERE pm.product_id = p_product_id
    LOOP
      IF v_bom.available_stock < (v_bom.bom_qty * p_quantity) THEN
        RETURN QUERY SELECT
          FALSE,
          NULL::UUID,
          NULL::TEXT,
          0::NUMERIC,
          NULL::UUID,
          format('Insufficient stock for %s: need %s, available %s',
            v_bom.material_name,
            v_bom.bom_qty * p_quantity,
            v_bom.available_stock)::TEXT;
        RETURN;
      END IF;
    END LOOP;

    -- All materials validated, now consume them
    FOR v_bom IN
      SELECT
        pm.material_id,
        pm.quantity as bom_qty,
        m.name as material_name,
        m.cost_price,
        m.price_per_unit
      FROM product_materials pm
      JOIN materials m ON m.id = pm.material_id
      WHERE pm.product_id = p_product_id
    LOOP
      -- Consume material using FIFO
      SELECT * INTO v_fifo_result
      FROM consume_material_fifo_v2(
        v_bom.material_id,
        v_bom.bom_qty * p_quantity,
        v_ref,
        'production',
        p_branch_id,
        p_user_id,
        p_user_name
      );

      IF v_fifo_result.success THEN
        v_total_material_cost := v_total_material_cost + v_fifo_result.total_cost;
        v_material_details := v_material_details ||
          format('%s x%s (Rp%s), ', v_bom.material_name, v_bom.bom_qty * p_quantity, ROUND(v_fifo_result.total_cost));
      ELSE
        -- Fallback to cost_price if FIFO fails
        v_total_material_cost := v_total_material_cost +
          (COALESCE(v_bom.cost_price, v_bom.price_per_unit, 0) * v_bom.bom_qty * p_quantity);
        v_material_details := v_material_details ||
          format('%s x%s (fallback), ', v_bom.material_name, v_bom.bom_qty * p_quantity);
      END IF;

      -- Update materials.stock for backward compatibility
      UPDATE materials
      SET
        stock = GREATEST(0, stock - (v_bom.bom_qty * p_quantity)),
        updated_at = NOW()
      WHERE id = v_bom.material_id;
    END LOOP;
  END IF;

  -- Create production record
  INSERT INTO production_records (
    ref,
    product_id,
    quantity,
    note,
    consume_bom,
    bom_snapshot,
    created_by,
    user_input_id,
    user_input_name,
    branch_id
  ) VALUES (
    v_ref,
    p_product_id,
    p_quantity,
    p_note,
    p_consume_bom,
    CASE WHEN p_consume_bom THEN (
      SELECT jsonb_agg(jsonb_build_object(
        'materialId', pm.material_id,
        'materialName', m.name,
        'quantity', pm.quantity,
        'unit', m.unit
      ))
      FROM product_materials pm
      JOIN materials m ON m.id = pm.material_id
      WHERE pm.product_id = p_product_id
    ) ELSE NULL END,
    p_user_id,
    p_user_id,
    p_user_name,
    p_branch_id
  )
  RETURNING id INTO v_production_id;

  -- Create inventory batch for finished product
  v_unit_cost := CASE WHEN p_quantity > 0 THEN v_total_material_cost / p_quantity ELSE 0 END;

  INSERT INTO inventory_batches (
    product_id,
    branch_id,
    initial_quantity,
    remaining_quantity,
    unit_cost,
    batch_date,
    notes,
    production_id
  ) VALUES (
    p_product_id,
    p_branch_id,
    p_quantity,
    p_quantity,
    v_unit_cost,
    NOW(),
    format('Produksi %s', v_ref),
    v_production_id
  )
  RETURNING id INTO v_batch_id;

  -- Create journal entry if cost > 0
  IF v_total_material_cost > 0 AND p_consume_bom THEN
    -- Get account IDs
    DECLARE
      v_persediaan_barang_id TEXT;
      v_persediaan_bahan_id TEXT;
      v_entry_number TEXT;
    BEGIN
      -- Get accounts
      SELECT id INTO v_persediaan_barang_id
      FROM accounts
      WHERE code = '1310' AND branch_id = p_branch_id AND is_active = TRUE
      LIMIT 1;

      SELECT id INTO v_persediaan_bahan_id
      FROM accounts
      WHERE code = '1320' AND branch_id = p_branch_id AND is_active = TRUE
      LIMIT 1;

      IF v_persediaan_barang_id IS NOT NULL AND v_persediaan_bahan_id IS NOT NULL THEN
        -- Generate entry number
        v_entry_number := 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
          LPAD((SELECT COUNT(*) + 1 FROM journal_entries WHERE branch_id = p_branch_id AND DATE(created_at) = CURRENT_DATE)::TEXT, 4, '0');

        -- Create journal header as draft first (trigger blocks lines on posted)
        INSERT INTO journal_entries (
          entry_number,
          entry_date,
          description,
          reference_type,
          reference_id,
          branch_id,
          status,
          total_debit,
          total_credit
        ) VALUES (
          v_entry_number,
          NOW(),
          format('Produksi %s: %s x%s', v_ref, v_product.name, p_quantity),
          'adjustment',
          v_production_id,
          p_branch_id,
          'draft',
          v_total_material_cost,
          v_total_material_cost
        )
        RETURNING id INTO v_journal_id;

        -- Create journal lines
        -- Dr. Persediaan Barang Dagang (1310)
        INSERT INTO journal_entry_lines (
          journal_entry_id,
          line_number,
          account_id,
          description,
          debit_amount,
          credit_amount
        ) VALUES (
          v_journal_id,
          1,
          v_persediaan_barang_id,
          format('Hasil produksi: %s x%s', v_product.name, p_quantity),
          v_total_material_cost,
          0
        );

        -- Cr. Persediaan Bahan Baku (1320)
        INSERT INTO journal_entry_lines (
          journal_entry_id,
          line_number,
          account_id,
          description,
          debit_amount,
          credit_amount
        ) VALUES (
          v_journal_id,
          2,
          v_persediaan_bahan_id,
          format('Bahan baku terpakai: %s', RTRIM(v_material_details, ', ')),
          0,
          v_total_material_cost
        );

        -- Post the journal after lines added
        UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
      END IF;
    END;
  END IF;

  RETURN QUERY SELECT
    TRUE,
    v_production_id,
    v_ref,
    v_total_material_cost,
    v_journal_id,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  -- Rollback happens automatically
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 2. SPOILAGE/ERROR RPC - Atomic material spoilage with journal
-- ============================================================================

CREATE OR REPLACE FUNCTION process_spoilage_atomic(
  p_material_id UUID,
  p_quantity NUMERIC,
  p_note TEXT DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_user_name TEXT DEFAULT 'System'
)
RETURNS TABLE (
  success BOOLEAN,
  record_id UUID,
  record_ref TEXT,
  spoilage_cost NUMERIC,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_ref TEXT;
  v_record_id UUID;
  v_material RECORD;
  v_spoilage_cost NUMERIC := 0;
  v_journal_id UUID;
  v_fifo_result RECORD;
  v_new_stock NUMERIC;
BEGIN
  -- Generate reference
  v_ref := 'ERR-' || TO_CHAR(NOW(), 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0');

  -- Validate inputs
  IF p_material_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID, 'Material ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_quantity <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID, 'Quantity must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get material details
  SELECT id, name, stock, cost_price, price_per_unit, unit INTO v_material
  FROM materials
  WHERE id = p_material_id;

  IF v_material.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID, 'Material not found'::TEXT;
    RETURN;
  END IF;

  -- Consume material via FIFO
  SELECT * INTO v_fifo_result
  FROM consume_material_fifo_v2(
    p_material_id,
    p_quantity,
    v_ref,
    'production_error',
    p_branch_id,
    p_user_id,
    p_user_name
  );

  IF v_fifo_result.success THEN
    v_spoilage_cost := v_fifo_result.total_cost;
  ELSE
    -- Fallback to material price
    v_spoilage_cost := p_quantity * COALESCE(v_material.cost_price, v_material.price_per_unit, 0);
  END IF;

  -- Calculate new stock
  v_new_stock := GREATEST(0, v_material.stock - p_quantity);

  -- Create production_records entry for spoilage
  INSERT INTO production_records (
    ref,
    product_id,
    quantity,
    note,
    consume_bom,
    created_by,
    user_input_id,
    user_input_name,
    branch_id
  ) VALUES (
    v_ref,
    NULL,
    -p_quantity,
    format('BAHAN RUSAK: %s - %s', v_material.name, COALESCE(p_note, 'Tidak ada catatan')),
    FALSE,
    p_user_id,
    p_user_id,
    p_user_name,
    p_branch_id
  )
  RETURNING id INTO v_record_id;

  -- Update materials.stock for backward compatibility
  UPDATE materials
  SET
    stock = v_new_stock,
    updated_at = NOW()
  WHERE id = p_material_id;

  -- Create journal entry if cost > 0 and branch exists
  IF v_spoilage_cost > 0 AND p_branch_id IS NOT NULL THEN
    DECLARE
      v_beban_lain_id TEXT;
      v_persediaan_bahan_id TEXT;
      v_entry_number TEXT;
    BEGIN
      -- Get accounts: Beban Lain-lain (6900) and Persediaan Bahan Baku (1320)
      SELECT id INTO v_beban_lain_id
      FROM accounts
      WHERE code = '6900' AND branch_id = p_branch_id AND is_active = TRUE
      LIMIT 1;

      -- Fallback to 5200 (HPP) if 6900 doesn't exist
      IF v_beban_lain_id IS NULL THEN
        SELECT id INTO v_beban_lain_id
        FROM accounts
        WHERE code = '5200' AND branch_id = p_branch_id AND is_active = TRUE
        LIMIT 1;
      END IF;

      SELECT id INTO v_persediaan_bahan_id
      FROM accounts
      WHERE code = '1320' AND branch_id = p_branch_id AND is_active = TRUE
      LIMIT 1;

      IF v_beban_lain_id IS NOT NULL AND v_persediaan_bahan_id IS NOT NULL THEN
        -- Generate entry number
        v_entry_number := 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
          LPAD((SELECT COUNT(*) + 1 FROM journal_entries WHERE branch_id = p_branch_id AND DATE(created_at) = CURRENT_DATE)::TEXT, 4, '0');

        -- Create journal header as draft first (trigger blocks lines on posted)
        INSERT INTO journal_entries (
          entry_number,
          entry_date,
          description,
          reference_type,
          reference_id,
          branch_id,
          status,
          total_debit,
          total_credit
        ) VALUES (
          v_entry_number,
          NOW(),
          format('Bahan Rusak %s: %s x%s %s', v_ref, v_material.name, p_quantity, COALESCE(v_material.unit, 'pcs')),
          'adjustment',
          v_record_id,
          p_branch_id,
          'draft',
          v_spoilage_cost,
          v_spoilage_cost
        )
        RETURNING id INTO v_journal_id;

        -- Create journal lines
        -- Dr. Beban Lain-lain / HPP
        INSERT INTO journal_entry_lines (
          journal_entry_id,
          line_number,
          account_id,
          description,
          debit_amount,
          credit_amount
        ) VALUES (
          v_journal_id,
          1,
          v_beban_lain_id,
          format('Bahan rusak: %s x%s', v_material.name, p_quantity),
          v_spoilage_cost,
          0
        );

        -- Cr. Persediaan Bahan Baku (1320)
        INSERT INTO journal_entry_lines (
          journal_entry_id,
          line_number,
          account_id,
          description,
          debit_amount,
          credit_amount
        ) VALUES (
          v_journal_id,
          2,
          v_persediaan_bahan_id,
          format('Bahan keluar: %s x%s', v_material.name, p_quantity),
          0,
          v_spoilage_cost
        );

        -- Post the journal after lines added
        UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
      END IF;
    END;
  END IF;

  RETURN QUERY SELECT
    TRUE,
    v_record_id,
    v_ref,
    v_spoilage_cost,
    v_journal_id,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 3. DELIVERY RPC - Atomic delivery with stock consume + HPP journal
-- ============================================================================

-- Drop existing functions to avoid signature conflicts
DROP FUNCTION IF EXISTS process_delivery_atomic(UUID, UUID, UUID, DATE, TEXT);
DROP FUNCTION IF EXISTS process_delivery_atomic(UUID, JSONB, UUID, UUID, UUID, DATE, TEXT, TEXT);
DROP FUNCTION IF EXISTS process_delivery_atomic(UUID, JSONB, UUID, UUID, UUID, TIMESTAMP WITH TIME ZONE, TEXT, TEXT);
DROP FUNCTION IF EXISTS process_delivery_atomic(TEXT, TIMESTAMP, UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS process_delivery_atomic(UUID, TIMESTAMP, UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION process_delivery_atomic(
  p_transaction_id TEXT,
  p_items JSONB,              -- Array: [{product_id, quantity, notes, unit, is_bonus, width, height, product_name}]
  p_branch_id UUID,           -- WAJIB: identitas cabang
  p_driver_id UUID DEFAULT NULL,
  p_helper_id UUID DEFAULT NULL,
  p_delivery_date DATE DEFAULT CURRENT_DATE,
  p_notes TEXT DEFAULT NULL,
  p_photo_url TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  delivery_id UUID,
  delivery_number INTEGER,
  total_hpp NUMERIC,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_delivery_id UUID;
  v_delivery_number INTEGER;
  v_transaction RECORD;
  v_item JSONB;
  v_consume_result RECORD;
  v_total_hpp NUMERIC := 0;
  v_hpp_details TEXT := '';
  v_journal_id UUID;
  v_entry_number TEXT;
  v_hpp_account_id UUID;
  v_persediaan_id UUID;
  v_customer_name TEXT;
  v_total_ordered NUMERIC;
  v_total_delivered NUMERIC;
  v_new_status TEXT;
  v_product_id UUID;
  v_qty NUMERIC;
  v_product_name TEXT;
  v_is_bonus BOOLEAN;
  v_item_notes TEXT;
  v_unit TEXT;
  v_width NUMERIC;
  v_height NUMERIC;
  v_txn_items JSONB;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, NULL::UUID,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT;
    RETURN;
  END IF;

  IF p_transaction_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, NULL::UUID,
      'Transaction ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, NULL::UUID,
      'No items to deliver'::TEXT;
    RETURN;
  END IF;

  -- Get transaction info
  SELECT
    t.id,
    t.ref,
    t.branch_id,
    t.customer_id,
    t.customer_name,
    t.items,
    t.status,
    t.is_office_sale,
    c.address as customer_address,
    c.phone as customer_phone
  INTO v_transaction
  FROM transactions t
  LEFT JOIN customers c ON c.id = t.customer_id
  WHERE t.id = p_transaction_id AND t.branch_id = p_branch_id;

  IF v_transaction.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, NULL::UUID,
      'Transaction not found in this branch'::TEXT;
    RETURN;
  END IF;

  -- ==================== CREATE DELIVERY HEADER ====================

  -- Calculate next delivery number
  SELECT COALESCE(MAX(d.delivery_number), 0) + 1 INTO v_delivery_number
  FROM deliveries d
  WHERE d.transaction_id = p_transaction_id;

  INSERT INTO deliveries (
    transaction_id,
    delivery_number,
    branch_id,
    customer_name,
    customer_address,
    customer_phone,
    driver_id,
    helper_id,
    delivery_date,
    status,
    hpp_total,
    notes,
    photo_url,
    created_at,
    updated_at
  ) VALUES (
    p_transaction_id,
    v_delivery_number,
    p_branch_id,
    v_transaction.customer_name,
    v_transaction.customer_address,
    v_transaction.customer_phone,
    p_driver_id,
    p_helper_id,
    p_delivery_date,
    'delivered',
    0, -- Will update later
    COALESCE(p_notes, format('Pengiriman ke-%s', v_delivery_number)),
    p_photo_url,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_delivery_id;

  -- ==================== PROCESS ITEMS & CONSUME STOCK ====================

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_product_name := v_item->>'product_name';
    v_is_bonus := COALESCE((v_item->>'is_bonus')::BOOLEAN, FALSE);
    v_item_notes := v_item->>'notes';
    v_unit := v_item->>'unit';
    v_width := (v_item->>'width')::NUMERIC;
    v_height := (v_item->>'height')::NUMERIC;

    IF v_qty > 0 THEN
       -- Insert Delivery Item
       INSERT INTO delivery_items (
         delivery_id,
         product_id,
         product_name,
         quantity_delivered,
         unit,
         is_bonus,
         width,
         height,
         notes,
         created_at
       ) VALUES (
         v_delivery_id,
         v_product_id,
         v_product_name,
         v_qty,
         COALESCE(v_unit, 'pcs'),
         v_is_bonus,
         v_width,
         v_height,
         v_item_notes,
         NOW()
       );

       -- Consume Stock (FIFO) - Only for Non-Office Sales
       -- Office sales deduct stock at transaction time
       IF NOT v_transaction.is_office_sale THEN
          SELECT * INTO v_consume_result
          FROM consume_inventory_fifo(
            v_product_id,
            p_branch_id,
            v_qty,
            COALESCE(v_transaction.ref, 'TR-UNKNOWN')
          );

          IF v_consume_result.success THEN
            v_total_hpp := v_total_hpp + v_consume_result.total_hpp;
            v_hpp_details := v_hpp_details || v_product_name || ' x' || v_qty || ', ';
          ELSE
            -- Log warning
            NULL;
          END IF;
       END IF;
    END IF;
  END LOOP;

  -- Update Delivery HPP Total
  UPDATE deliveries SET hpp_total = v_total_hpp WHERE id = v_delivery_id;

  -- ==================== UPDATE TRANSACTION STATUS ====================

  -- Check total ordered vs total delivered
  SELECT
    COALESCE(SUM(
      CASE WHEN (item->>'_isSalesMeta')::BOOLEAN THEN 0
      ELSE (item->>'quantity')::NUMERIC END
    ), 0)
  INTO v_total_ordered
  FROM jsonb_array_elements(v_transaction.items) item;

  SELECT
    COALESCE(SUM(di.quantity_delivered), 0)
  INTO v_total_delivered
  FROM delivery_items di
  JOIN deliveries d ON d.id = di.delivery_id
  WHERE d.transaction_id = p_transaction_id;

  IF v_total_delivered >= v_total_ordered THEN
    v_new_status := 'Selesai';
  ELSE
    v_new_status := 'Diantar Sebagian';
  END IF;

  UPDATE transactions
  SET
    status = v_new_status,
    delivery_status = 'delivered', -- Legacy field
    delivered_at = NOW(),
    updated_at = NOW()
  WHERE id = p_transaction_id;

  -- ==================== CREATE HPP JOURNAL ====================
  -- Only for Non-Office Sales. Office sales journal handled at transaction creation.

  IF NOT v_transaction.is_office_sale AND v_total_hpp > 0 THEN
    -- Get account IDs
    SELECT id INTO v_hpp_account_id
    FROM accounts
    WHERE code = '5100' AND branch_id = p_branch_id AND is_active = TRUE
    LIMIT 1;

    SELECT id INTO v_persediaan_id
    FROM accounts
    WHERE code = '1310' AND branch_id = p_branch_id AND is_active = TRUE
    LIMIT 1;

    IF v_hpp_account_id IS NOT NULL AND v_persediaan_id IS NOT NULL THEN
      v_entry_number := 'JE-' || TO_CHAR(p_delivery_date, 'YYYYMMDD') || '-' ||
        LPAD((SELECT COUNT(*) + 1 FROM journal_entries
              WHERE branch_id = p_branch_id
              AND DATE(created_at) = DATE(p_delivery_date))::TEXT, 4, '0');

      INSERT INTO journal_entries (
        entry_number,
        entry_date,
        description,
        reference_type,
        reference_id,
        branch_id,
        status,
        total_debit,
        total_credit
      ) VALUES (
        v_entry_number,
        p_delivery_date,
        format('HPP Pengiriman %s: %s', v_transaction.ref, v_transaction.customer_name),
        'transaction',
        v_delivery_id::TEXT,
        p_branch_id,
        'draft',
        v_total_hpp,
        v_total_hpp
      )
      RETURNING id INTO v_journal_id;

      -- Dr. HPP (5100)
      INSERT INTO journal_entry_lines (
        journal_entry_id,
        line_number,
        account_id,
        description,
        debit_amount,
        credit_amount
      ) VALUES (
        v_journal_id,
        1,
        v_hpp_account_id,
        format('HPP: %s', LEFT(v_hpp_details, 200)),
        v_total_hpp,
        0
      );

      -- Cr. Persediaan Barang Dagang (1310)
      INSERT INTO journal_entry_lines (
        journal_entry_id,
        line_number,
        account_id,
        description,
        debit_amount,
        credit_amount
      ) VALUES (
        v_journal_id,
        2,
        v_persediaan_id,
        format('Stock keluar: %s', v_transaction.ref),
        0,
        v_total_hpp
      );

      UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
    END IF;
  END IF;

  -- ==================== GENERATE COMMISSIONS ====================
  
  IF p_driver_id IS NOT NULL OR p_helper_id IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      v_product_id := (v_item->>'product_id')::UUID;
      v_qty := (v_item->>'quantity')::NUMERIC;
      v_product_name := v_item->>'product_name';
      v_is_bonus := COALESCE((v_item->>'is_bonus')::BOOLEAN, FALSE);

      -- Skip bonus items
      IF v_qty > 0 AND NOT v_is_bonus THEN
        -- Driver Commission
        IF p_driver_id IS NOT NULL THEN
          INSERT INTO commission_entries (
            user_id,
            user_name,
            role,
            product_id,
            product_name,
            quantity,
            rate_per_qty,
            amount,
            transaction_id,
            delivery_id,
            ref,
            status,
            branch_id,
            created_at
          )
          SELECT 
            p_driver_id,
            (SELECT full_name FROM profiles WHERE id = p_driver_id),
            'driver',
            v_product_id,
            v_product_name,
            v_qty,
            cr.rate_per_qty,
            v_qty * cr.rate_per_qty,
            p_transaction_id,
            v_delivery_id,
            'DEL-' || v_delivery_id,
            'pending',
            p_branch_id,
            NOW()
          FROM commission_rules cr
          WHERE cr.product_id = v_product_id AND cr.role = 'driver' AND cr.rate_per_qty > 0;
        END IF;

        -- Helper Commission
        IF p_helper_id IS NOT NULL THEN
          INSERT INTO commission_entries (
            user_id,
            user_name,
            role,
            product_id,
            product_name,
            quantity,
            rate_per_qty,
            amount,
            transaction_id,
            delivery_id,
            ref,
            status,
            branch_id,
            created_at
          )
          SELECT 
            p_helper_id,
            (SELECT full_name FROM profiles WHERE id = p_helper_id),
            'helper',
            v_product_id,
            v_product_name,
            v_qty,
            cr.rate_per_qty,
            v_qty * cr.rate_per_qty,
            p_transaction_id,
            v_delivery_id,
            'DEL-' || v_delivery_id,
            'pending',
            p_branch_id,
            NOW()
          FROM commission_rules cr
          WHERE cr.product_id = v_product_id AND cr.role = 'helper' AND cr.rate_per_qty > 0;
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN QUERY SELECT
    TRUE,
    v_delivery_id,
    v_delivery_number,
    v_total_hpp,
    v_journal_id,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;



-- [VOID_TRANSACTION_ATOMIC REMOVED - CONSOLIDATED IN 09_TRANSACTION.SQL]

$$ LANGUAGE plpgsql;


-- ============================================================================
-- 5. RECEIVABLE PAYMENT RPC - Atomic payment with journal
-- ============================================================================

CREATE OR REPLACE FUNCTION receive_payment_atomic(
  p_receivable_id UUID,
  p_amount NUMERIC,
  p_payment_method TEXT DEFAULT 'cash',
  p_payment_date TIMESTAMP DEFAULT NOW(),
  p_payment_account_id TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_user_name TEXT DEFAULT 'System'
)
RETURNS TABLE (
  success BOOLEAN,
  payment_id UUID,
  remaining_amount NUMERIC,
  is_fully_paid BOOLEAN,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_receivable RECORD;
  v_payment_id UUID;
  v_journal_id UUID;
  v_remaining NUMERIC;
  v_is_fully_paid BOOLEAN;
  v_kas_account_id TEXT;
  v_piutang_account_id TEXT;
BEGIN
  -- Get receivable details
  SELECT
    r.id,
    r.amount,
    r.amount_paid,
    r.status,
    r.customer_id,
    r.transaction_id,
    r.branch_id,
    c.name as customer_name
  INTO v_receivable
  FROM receivables r
  LEFT JOIN customers c ON c.id = r.customer_id
  WHERE r.id = p_receivable_id;

  IF v_receivable.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, FALSE, NULL::UUID, 'Receivable not found'::TEXT;
    RETURN;
  END IF;

  IF v_receivable.status = 'paid' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, TRUE, NULL::UUID, 'Receivable already fully paid'::TEXT;
    RETURN;
  END IF;

  IF v_receivable.status = 'cancelled' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, FALSE, NULL::UUID, 'Receivable is cancelled'::TEXT;
    RETURN;
  END IF;

  -- Use receivable branch if not specified
  IF p_branch_id IS NULL THEN
    p_branch_id := v_receivable.branch_id;
  END IF;

  -- Calculate remaining
  v_remaining := v_receivable.amount - COALESCE(v_receivable.amount_paid, 0) - p_amount;
  v_is_fully_paid := v_remaining <= 0;

  -- Validate payment amount
  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, FALSE, NULL::UUID, 'Payment amount must be positive'::TEXT;
    RETURN;
  END IF;

  IF p_amount > (v_receivable.amount - COALESCE(v_receivable.amount_paid, 0)) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, FALSE, NULL::UUID, 'Payment exceeds remaining amount'::TEXT;
    RETURN;
  END IF;

  -- Record payment
  INSERT INTO receivable_payments (
    receivable_id,
    amount,
    payment_method,
    payment_date,
    payment_account_id,
    notes,
    created_by
  ) VALUES (
    p_receivable_id,
    p_amount,
    p_payment_method,
    p_payment_date,
    p_payment_account_id,
    p_notes,
    p_user_id
  )
  RETURNING id INTO v_payment_id;

  -- Update receivable
  UPDATE receivables
  SET
    amount_paid = COALESCE(amount_paid, 0) + p_amount,
    status = CASE WHEN v_is_fully_paid THEN 'paid' ELSE 'partial' END,
    updated_at = NOW()
  WHERE id = p_receivable_id;

  -- Create journal entry
  IF p_branch_id IS NOT NULL THEN
    -- Get or use specified payment account
    IF p_payment_account_id IS NOT NULL THEN
      v_kas_account_id := p_payment_account_id;
    ELSE
      SELECT id INTO v_kas_account_id
      FROM accounts
      WHERE code = '1110' AND branch_id = p_branch_id AND is_active = TRUE
      LIMIT 1;
    END IF;

    SELECT id INTO v_piutang_account_id
    FROM accounts
    WHERE code = '1210' AND branch_id = p_branch_id AND is_active = TRUE
    LIMIT 1;

    IF v_kas_account_id IS NOT NULL AND v_piutang_account_id IS NOT NULL THEN
      DECLARE
        v_entry_number TEXT;
      BEGIN
        v_entry_number := 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
          LPAD((SELECT COUNT(*) + 1 FROM journal_entries WHERE branch_id = p_branch_id AND DATE(created_at) = CURRENT_DATE)::TEXT, 4, '0');

        -- Create journal header as draft first (trigger blocks lines on posted)
        INSERT INTO journal_entries (
          entry_number,
          entry_date,
          description,
          reference_type,
          reference_id,
          branch_id,
          status,
          total_debit,
          total_credit
        ) VALUES (
          v_entry_number,
          p_payment_date,
          format('Terima pembayaran piutang: %s', COALESCE(v_receivable.customer_name, 'Unknown')),
          'receivable',
          v_payment_id,
          p_branch_id,
          'draft',
          p_amount,
          p_amount
        )
        RETURNING id INTO v_journal_id;

        -- Dr. Kas/Bank
        INSERT INTO journal_entry_lines (
          journal_entry_id,
          line_number,
          account_id,
          description,
          debit_amount,
          credit_amount
        ) VALUES (
          v_journal_id,
          1,
          v_kas_account_id,
          format('Terima dari %s', COALESCE(v_receivable.customer_name, 'Unknown')),
          p_amount,
          0
        );

        -- Cr. Piutang Usaha
        INSERT INTO journal_entry_lines (
          journal_entry_id,
          line_number,
          account_id,
          description,
          debit_amount,
          credit_amount
        ) VALUES (
          v_journal_id,
          2,
          v_piutang_account_id,
          format('Pelunasan piutang: %s', COALESCE(v_receivable.customer_name, 'Unknown')),
          0,
          p_amount
        );

        -- Post the journal after lines added
        UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
      END;
    END IF;
  END IF;

  RETURN QUERY SELECT
    TRUE,
    v_payment_id,
    GREATEST(0, v_remaining),
    v_is_fully_paid,
    v_journal_id,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 6. PAYABLE PAYMENT RPC - Atomic supplier payment with journal
-- ============================================================================

CREATE OR REPLACE FUNCTION pay_supplier_atomic(
  p_payable_id UUID,
  p_amount NUMERIC,
  p_payment_method TEXT DEFAULT 'cash',
  p_payment_date TIMESTAMP DEFAULT NOW(),
  p_payment_account_id TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_user_name TEXT DEFAULT 'System'
)
RETURNS TABLE (
  success BOOLEAN,
  payment_id UUID,
  remaining_amount NUMERIC,
  is_fully_paid BOOLEAN,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_payable RECORD;
  v_payment_id UUID;
  v_journal_id UUID;
  v_remaining NUMERIC;
  v_is_fully_paid BOOLEAN;
  v_kas_account_id TEXT;
  v_hutang_account_id TEXT;
BEGIN
  -- Get payable details
  SELECT
    p.id,
    p.amount,
    p.amount_paid,
    p.status,
    p.supplier_id,
    p.purchase_order_id,
    p.branch_id,
    s.name as supplier_name
  INTO v_payable
  FROM payables p
  LEFT JOIN suppliers s ON s.id = p.supplier_id
  WHERE p.id = p_payable_id;

  IF v_payable.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, FALSE, NULL::UUID, 'Payable not found'::TEXT;
    RETURN;
  END IF;

  IF v_payable.status = 'paid' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, TRUE, NULL::UUID, 'Payable already fully paid'::TEXT;
    RETURN;
  END IF;

  IF v_payable.status = 'cancelled' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, FALSE, NULL::UUID, 'Payable is cancelled'::TEXT;
    RETURN;
  END IF;

  -- Use payable branch if not specified
  IF p_branch_id IS NULL THEN
    p_branch_id := v_payable.branch_id;
  END IF;

  -- Calculate remaining
  v_remaining := v_payable.amount - COALESCE(v_payable.amount_paid, 0) - p_amount;
  v_is_fully_paid := v_remaining <= 0;

  -- Validate payment amount
  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, FALSE, NULL::UUID, 'Payment amount must be positive'::TEXT;
    RETURN;
  END IF;

  IF p_amount > (v_payable.amount - COALESCE(v_payable.amount_paid, 0)) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, FALSE, NULL::UUID, 'Payment exceeds remaining amount'::TEXT;
    RETURN;
  END IF;

  -- Record payment
  INSERT INTO payable_payments (
    payable_id,
    amount,
    payment_method,
    payment_date,
    payment_account_id,
    notes,
    created_by
  ) VALUES (
    p_payable_id,
    p_amount,
    p_payment_method,
    p_payment_date,
    p_payment_account_id,
    p_notes,
    p_user_id
  )
  RETURNING id INTO v_payment_id;

  -- Update payable
  UPDATE payables
  SET
    amount_paid = COALESCE(amount_paid, 0) + p_amount,
    status = CASE WHEN v_is_fully_paid THEN 'paid' ELSE 'partial' END,
    updated_at = NOW()
  WHERE id = p_payable_id;

  -- Create journal entry
  IF p_branch_id IS NOT NULL THEN
    -- Get or use specified payment account
    IF p_payment_account_id IS NOT NULL THEN
      v_kas_account_id := p_payment_account_id;
    ELSE
      SELECT id INTO v_kas_account_id
      FROM accounts
      WHERE code = '1110' AND branch_id = p_branch_id AND is_active = TRUE
      LIMIT 1;
    END IF;

    SELECT id INTO v_hutang_account_id
    FROM accounts
    WHERE code = '2110' AND branch_id = p_branch_id AND is_active = TRUE
    LIMIT 1;

    IF v_kas_account_id IS NOT NULL AND v_hutang_account_id IS NOT NULL THEN
      DECLARE
        v_entry_number TEXT;
      BEGIN
        v_entry_number := 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
          LPAD((SELECT COUNT(*) + 1 FROM journal_entries WHERE branch_id = p_branch_id AND DATE(created_at) = CURRENT_DATE)::TEXT, 4, '0');

        -- Create journal header as draft first (trigger blocks lines on posted)
        INSERT INTO journal_entries (
          entry_number,
          entry_date,
          description,
          reference_type,
          reference_id,
          branch_id,
          status,
          total_debit,
          total_credit
        ) VALUES (
          v_entry_number,
          p_payment_date,
          format('Bayar hutang ke: %s', COALESCE(v_payable.supplier_name, 'Unknown')),
          'payable',
          v_payment_id,
          p_branch_id,
          'draft',
          p_amount,
          p_amount
        )
        RETURNING id INTO v_journal_id;

        -- Dr. Hutang Usaha
        INSERT INTO journal_entry_lines (
          journal_entry_id,
          line_number,
          account_id,
          description,
          debit_amount,
          credit_amount
        ) VALUES (
          v_journal_id,
          1,
          v_hutang_account_id,
          format('Bayar ke %s', COALESCE(v_payable.supplier_name, 'Unknown')),
          p_amount,
          0
        );

        -- Cr. Kas/Bank
        INSERT INTO journal_entry_lines (
          journal_entry_id,
          line_number,
          account_id,
          description,
          debit_amount,
          credit_amount
        ) VALUES (
          v_journal_id,
          2,
          v_kas_account_id,
          format('Pembayaran hutang: %s', COALESCE(v_payable.supplier_name, 'Unknown')),
          0,
          p_amount
        );

        -- Post the journal after lines added
        UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
      END;
    END IF;
  END IF;

  RETURN QUERY SELECT
    TRUE,
    v_payment_id,
    GREATEST(0, v_remaining),
    v_is_fully_paid,
    v_journal_id,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 7. CREATE JOURNAL RPC - Generic journal creation with validation
-- ============================================================================

CREATE OR REPLACE FUNCTION create_journal_atomic(
  p_entry_date TIMESTAMP,
  p_description TEXT,
  p_reference_type TEXT,
  p_branch_id UUID,
  p_lines JSONB,  -- Array of {account_id, account_code, debit_amount, credit_amount, description}
  p_reference_id TEXT DEFAULT NULL,
  p_auto_post BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  entry_number TEXT,
  error_message TEXT
) AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_total_debit NUMERIC := 0;
  v_total_credit NUMERIC := 0;
  v_line RECORD;
  v_line_number INTEGER := 0;
BEGIN
  -- Validate branch
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Branch ID is required'::TEXT;
    RETURN;
  END IF;

  -- Validate lines
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Journal lines are required'::TEXT;
    RETURN;
  END IF;

  -- Calculate totals
  FOR v_line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
    account_id TEXT,
    debit_amount NUMERIC,
    credit_amount NUMERIC,
    description TEXT
  )
  LOOP
    v_total_debit := v_total_debit + COALESCE(v_line.debit_amount, 0);
    v_total_credit := v_total_credit + COALESCE(v_line.credit_amount, 0);
  END LOOP;

  -- Validate balance
  IF ABS(v_total_debit - v_total_credit) > 0.01 THEN
    RETURN QUERY SELECT
      FALSE,
      NULL::UUID,
      NULL::TEXT,
      format('Journal not balanced: Debit %s, Credit %s', v_total_debit, v_total_credit)::TEXT;
    RETURN;
  END IF;

  -- Check period closed
  DECLARE
    v_period_closed BOOLEAN;
  BEGIN
    SELECT EXISTS(
      SELECT 1 FROM closing_periods
      WHERE branch_id = p_branch_id
        AND year = EXTRACT(YEAR FROM p_entry_date)
    ) INTO v_period_closed;

    IF v_period_closed THEN
      RETURN QUERY SELECT
        FALSE,
        NULL::UUID,
        NULL::TEXT,
        format('Period %s is closed', EXTRACT(YEAR FROM p_entry_date))::TEXT;
      RETURN;
    END IF;
  END;

  -- Generate entry number
  v_entry_number := 'JE-' || TO_CHAR(p_entry_date, 'YYYYMMDD') || '-' ||
    LPAD((SELECT COUNT(*) + 1 FROM journal_entries WHERE branch_id = p_branch_id AND DATE(created_at) = DATE(p_entry_date))::TEXT, 4, '0') ||
    LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0');

  -- Create journal header as draft first (trigger blocks lines on posted)
  INSERT INTO journal_entries (
    entry_number,
    entry_date,
    description,
    reference_type,
    reference_id,
    branch_id,
    status,
    total_debit,
    total_credit
  ) VALUES (
    v_entry_number,
    p_entry_date,
    p_description,
    p_reference_type,
    p_reference_id,
    p_branch_id,
    'draft',
    v_total_debit,
    v_total_credit
  )
  RETURNING id INTO v_journal_id;

  -- Create journal lines
  v_line_number := 0;
  FOR v_line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
    account_id TEXT,
    account_code TEXT,
    debit_amount NUMERIC,
    credit_amount NUMERIC,
    description TEXT
  )
  LOOP
    v_line_number := v_line_number + 1;
    INSERT INTO journal_entry_lines (
      journal_entry_id,
      line_number,
      account_id,
      description,
      debit_amount,
      credit_amount
    ) VALUES (
      v_journal_id,
      v_line_number,
      CASE
        WHEN v_line.account_id IS NOT NULL THEN v_line.account_id::UUID
        ELSE (SELECT id FROM accounts WHERE code = v_line.account_code AND branch_id = p_branch_id LIMIT 1)
      END,
      v_line.description,
      COALESCE(v_line.debit_amount, 0),
      COALESCE(v_line.credit_amount, 0)
    );
  END LOOP;

  -- Post the journal if auto_post is true
  IF p_auto_post THEN
    UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
  END IF;

  RETURN QUERY SELECT TRUE, v_journal_id, v_entry_number, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION process_production_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION process_spoilage_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION process_delivery_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION void_transaction_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION receive_payment_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION pay_supplier_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION create_journal_atomic TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION process_production_atomic IS
  'Atomic production: consume materials + create product batch + journal';

COMMENT ON FUNCTION process_spoilage_atomic IS
  'Atomic spoilage: consume material + journal for damaged goods';

COMMENT ON FUNCTION process_delivery_atomic IS
  'Atomic delivery: consume product stock + HPP journal';

COMMENT ON FUNCTION void_transaction_atomic IS
  'Atomic void: restore stock + void journals + cancel receivables';

COMMENT ON FUNCTION receive_payment_atomic IS
  'Atomic receivable payment: update saldo + journal';

COMMENT ON FUNCTION pay_supplier_atomic IS
  'Atomic payable payment: update saldo + journal';

COMMENT ON FUNCTION create_journal_atomic IS
  'Generic atomic journal creation with balance validation';
