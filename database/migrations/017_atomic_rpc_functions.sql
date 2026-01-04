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
      v_persediaan_barang_id UUID;
      v_persediaan_bahan_id UUID;
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

        -- Create journal header
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
          'posted',
          v_total_material_cost,
          v_total_material_cost
        )
        RETURNING id INTO v_journal_id;

        -- Create journal lines
        -- Dr. Persediaan Barang Dagang (1310)
        INSERT INTO journal_lines (
          journal_id,
          account_id,
          description,
          debit_amount,
          credit_amount
        ) VALUES (
          v_journal_id,
          v_persediaan_barang_id,
          format('Hasil produksi: %s x%s', v_product.name, p_quantity),
          v_total_material_cost,
          0
        );

        -- Cr. Persediaan Bahan Baku (1320)
        INSERT INTO journal_lines (
          journal_id,
          account_id,
          description,
          debit_amount,
          credit_amount
        ) VALUES (
          v_journal_id,
          v_persediaan_bahan_id,
          format('Bahan baku terpakai: %s', RTRIM(v_material_details, ', ')),
          0,
          v_total_material_cost
        );
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
      v_beban_lain_id UUID;
      v_persediaan_bahan_id UUID;
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

        -- Create journal header
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
          'posted',
          v_spoilage_cost,
          v_spoilage_cost
        )
        RETURNING id INTO v_journal_id;

        -- Create journal lines
        -- Dr. Beban Lain-lain / HPP
        INSERT INTO journal_lines (
          journal_id,
          account_id,
          description,
          debit_amount,
          credit_amount
        ) VALUES (
          v_journal_id,
          v_beban_lain_id,
          format('Bahan rusak: %s x%s', v_material.name, p_quantity),
          v_spoilage_cost,
          0
        );

        -- Cr. Persediaan Bahan Baku (1320)
        INSERT INTO journal_lines (
          journal_id,
          account_id,
          description,
          debit_amount,
          credit_amount
        ) VALUES (
          v_journal_id,
          v_persediaan_bahan_id,
          format('Bahan keluar: %s x%s', v_material.name, p_quantity),
          0,
          v_spoilage_cost
        );
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

CREATE OR REPLACE FUNCTION process_delivery_atomic(
  p_transaction_id UUID,
  p_delivery_date TIMESTAMP DEFAULT NOW(),
  p_branch_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_user_name TEXT DEFAULT 'System'
)
RETURNS TABLE (
  success BOOLEAN,
  delivery_id UUID,
  total_hpp NUMERIC,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_transaction RECORD;
  v_item RECORD;
  v_total_hpp NUMERIC := 0;
  v_journal_id UUID;
  v_fifo_result RECORD;
  v_delivery_id UUID;
  v_hpp_details TEXT := '';
BEGIN
  -- Get transaction details
  SELECT
    t.id,
    t.ref,
    t.customer_name,
    t.total,
    t.branch_id,
    t.is_delivered,
    t.delivery_id as existing_delivery_id
  INTO v_transaction
  FROM transactions t
  WHERE t.id = p_transaction_id;

  IF v_transaction.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID, 'Transaction not found'::TEXT;
    RETURN;
  END IF;

  IF v_transaction.is_delivered THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID, 'Transaction already delivered'::TEXT;
    RETURN;
  END IF;

  -- Use transaction branch if not specified
  IF p_branch_id IS NULL THEN
    p_branch_id := v_transaction.branch_id;
  END IF;

  -- Create delivery record
  INSERT INTO deliveries (
    transaction_id,
    delivery_date,
    status,
    branch_id,
    created_by
  ) VALUES (
    p_transaction_id,
    p_delivery_date,
    'completed',
    p_branch_id,
    p_user_id
  )
  RETURNING id INTO v_delivery_id;

  -- Process each item - consume stock via FIFO
  FOR v_item IN
    SELECT
      ti.product_id,
      ti.quantity,
      p.name as product_name
    FROM transaction_items ti
    JOIN products p ON p.id = ti.product_id
    WHERE ti.transaction_id = p_transaction_id
  LOOP
    -- Consume inventory via FIFO
    SELECT * INTO v_fifo_result
    FROM consume_inventory_fifo(
      v_item.product_id,
      p_branch_id,
      v_item.quantity,
      p_transaction_id::TEXT,
      NULL  -- material_id null for products
    );

    IF v_fifo_result.total_hpp > 0 THEN
      v_total_hpp := v_total_hpp + v_fifo_result.total_hpp;
      v_hpp_details := v_hpp_details || format('%s x%s (Rp%s), ',
        v_item.product_name, v_item.quantity, ROUND(v_fifo_result.total_hpp));
    END IF;
  END LOOP;

  -- Update transaction as delivered
  UPDATE transactions
  SET
    is_delivered = TRUE,
    delivery_id = v_delivery_id,
    delivered_at = p_delivery_date,
    hpp = v_total_hpp,
    updated_at = NOW()
  WHERE id = p_transaction_id;

  -- Create HPP journal if total > 0
  IF v_total_hpp > 0 AND p_branch_id IS NOT NULL THEN
    DECLARE
      v_hpp_account_id UUID;
      v_persediaan_id UUID;
      v_entry_number TEXT;
    BEGIN
      -- Get accounts: HPP (5200) and Persediaan Barang Dagang (1310)
      SELECT id INTO v_hpp_account_id
      FROM accounts
      WHERE code = '5200' AND branch_id = p_branch_id AND is_active = TRUE
      LIMIT 1;

      SELECT id INTO v_persediaan_id
      FROM accounts
      WHERE code = '1310' AND branch_id = p_branch_id AND is_active = TRUE
      LIMIT 1;

      IF v_hpp_account_id IS NOT NULL AND v_persediaan_id IS NOT NULL THEN
        -- Generate entry number
        v_entry_number := 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
          LPAD((SELECT COUNT(*) + 1 FROM journal_entries WHERE branch_id = p_branch_id AND DATE(created_at) = CURRENT_DATE)::TEXT, 4, '0');

        -- Create journal header
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
          v_delivery_id,
          p_branch_id,
          'posted',
          v_total_hpp,
          v_total_hpp
        )
        RETURNING id INTO v_journal_id;

        -- Create journal lines
        -- Dr. HPP (5200)
        INSERT INTO journal_lines (
          journal_id,
          account_id,
          description,
          debit_amount,
          credit_amount
        ) VALUES (
          v_journal_id,
          v_hpp_account_id,
          format('HPP: %s', RTRIM(v_hpp_details, ', ')),
          v_total_hpp,
          0
        );

        -- Cr. Persediaan Barang Dagang (1310)
        INSERT INTO journal_lines (
          journal_id,
          account_id,
          description,
          debit_amount,
          credit_amount
        ) VALUES (
          v_journal_id,
          v_persediaan_id,
          format('Stock keluar: %s', v_transaction.ref),
          0,
          v_total_hpp
        );
      END IF;
    END;
  END IF;

  RETURN QUERY SELECT
    TRUE,
    v_delivery_id,
    v_total_hpp,
    v_journal_id,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 4. VOID TRANSACTION RPC - Atomic void with stock restore + journal reverse
-- ============================================================================

CREATE OR REPLACE FUNCTION void_transaction_atomic(
  p_transaction_id UUID,
  p_void_reason TEXT DEFAULT 'Void by user',
  p_user_id UUID DEFAULT NULL,
  p_user_name TEXT DEFAULT 'System'
)
RETURNS TABLE (
  success BOOLEAN,
  stock_restored BOOLEAN,
  journal_voided BOOLEAN,
  receivable_cancelled BOOLEAN,
  error_message TEXT
) AS $$
DECLARE
  v_transaction RECORD;
  v_item RECORD;
  v_batch RECORD;
  v_stock_restored BOOLEAN := FALSE;
  v_journal_voided BOOLEAN := FALSE;
  v_receivable_cancelled BOOLEAN := FALSE;
  v_restore_qty NUMERIC;
BEGIN
  -- Get transaction details
  SELECT
    t.id,
    t.ref,
    t.is_delivered,
    t.is_voided,
    t.delivery_id,
    t.hpp,
    t.branch_id,
    t.payment_status,
    t.customer_id
  INTO v_transaction
  FROM transactions t
  WHERE t.id = p_transaction_id;

  IF v_transaction.id IS NULL THEN
    RETURN QUERY SELECT FALSE, FALSE, FALSE, FALSE, 'Transaction not found'::TEXT;
    RETURN;
  END IF;

  IF v_transaction.is_voided THEN
    RETURN QUERY SELECT FALSE, FALSE, FALSE, FALSE, 'Transaction already voided'::TEXT;
    RETURN;
  END IF;

  -- If delivered, restore stock using LIFO (newest batch first)
  IF v_transaction.is_delivered THEN
    FOR v_item IN
      SELECT
        ti.product_id,
        ti.quantity,
        p.name as product_name
      FROM transaction_items ti
      JOIN products p ON p.id = ti.product_id
      WHERE ti.transaction_id = p_transaction_id
    LOOP
      v_restore_qty := v_item.quantity;

      -- Restore to batches in LIFO order (newest first)
      FOR v_batch IN
        SELECT id, remaining_quantity, initial_quantity
        FROM inventory_batches
        WHERE product_id = v_item.product_id
          AND (branch_id = v_transaction.branch_id OR branch_id IS NULL)
          AND remaining_quantity < initial_quantity
        ORDER BY batch_date DESC, created_at DESC
      LOOP
        EXIT WHEN v_restore_qty <= 0;

        DECLARE
          v_can_restore NUMERIC;
        BEGIN
          v_can_restore := LEAST(v_restore_qty, v_batch.initial_quantity - v_batch.remaining_quantity);

          UPDATE inventory_batches
          SET
            remaining_quantity = remaining_quantity + v_can_restore,
            updated_at = NOW()
          WHERE id = v_batch.id;

          v_restore_qty := v_restore_qty - v_can_restore;
        END;
      END LOOP;

      -- If still have qty to restore, create new batch
      IF v_restore_qty > 0 THEN
        INSERT INTO inventory_batches (
          product_id,
          branch_id,
          initial_quantity,
          remaining_quantity,
          unit_cost,
          batch_date,
          notes
        ) VALUES (
          v_item.product_id,
          v_transaction.branch_id,
          v_restore_qty,
          v_restore_qty,
          0, -- Unknown cost for restored stock
          NOW(),
          format('Restored from void: %s', v_transaction.ref)
        );
      END IF;
    END LOOP;

    v_stock_restored := TRUE;
  END IF;

  -- Void related journal entries
  UPDATE journal_entries
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_by = p_user_id,
    void_reason = p_void_reason,
    status = 'voided'
  WHERE reference_id = p_transaction_id::TEXT
    OR reference_id = v_transaction.delivery_id::TEXT;

  IF FOUND THEN
    v_journal_voided := TRUE;
  END IF;

  -- Cancel receivable if exists
  IF v_transaction.payment_status = 'credit' OR v_transaction.payment_status = 'partial' THEN
    UPDATE receivables
    SET
      status = 'cancelled',
      updated_at = NOW()
    WHERE transaction_id = p_transaction_id;

    IF FOUND THEN
      v_receivable_cancelled := TRUE;
    END IF;
  END IF;

  -- Mark transaction as voided
  UPDATE transactions
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_by = p_user_id,
    void_reason = p_void_reason,
    updated_at = NOW()
  WHERE id = p_transaction_id;

  RETURN QUERY SELECT
    TRUE,
    v_stock_restored,
    v_journal_voided,
    v_receivable_cancelled,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, FALSE, FALSE, FALSE, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 5. RECEIVABLE PAYMENT RPC - Atomic payment with journal
-- ============================================================================

CREATE OR REPLACE FUNCTION receive_payment_atomic(
  p_receivable_id UUID,
  p_amount NUMERIC,
  p_payment_method TEXT DEFAULT 'cash',
  p_payment_date TIMESTAMP DEFAULT NOW(),
  p_payment_account_id UUID DEFAULT NULL,
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
  v_kas_account_id UUID;
  v_piutang_account_id UUID;
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
          'posted',
          p_amount,
          p_amount
        )
        RETURNING id INTO v_journal_id;

        -- Dr. Kas/Bank
        INSERT INTO journal_lines (
          journal_id,
          account_id,
          description,
          debit_amount,
          credit_amount
        ) VALUES (
          v_journal_id,
          v_kas_account_id,
          format('Terima dari %s', COALESCE(v_receivable.customer_name, 'Unknown')),
          p_amount,
          0
        );

        -- Cr. Piutang Usaha
        INSERT INTO journal_lines (
          journal_id,
          account_id,
          description,
          debit_amount,
          credit_amount
        ) VALUES (
          v_journal_id,
          v_piutang_account_id,
          format('Pelunasan piutang: %s', COALESCE(v_receivable.customer_name, 'Unknown')),
          0,
          p_amount
        );
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
  p_payment_account_id UUID DEFAULT NULL,
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
  v_kas_account_id UUID;
  v_hutang_account_id UUID;
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
          'posted',
          p_amount,
          p_amount
        )
        RETURNING id INTO v_journal_id;

        -- Dr. Hutang Usaha
        INSERT INTO journal_lines (
          journal_id,
          account_id,
          description,
          debit_amount,
          credit_amount
        ) VALUES (
          v_journal_id,
          v_hutang_account_id,
          format('Bayar ke %s', COALESCE(v_payable.supplier_name, 'Unknown')),
          p_amount,
          0
        );

        -- Cr. Kas/Bank
        INSERT INTO journal_lines (
          journal_id,
          account_id,
          description,
          debit_amount,
          credit_amount
        ) VALUES (
          v_journal_id,
          v_kas_account_id,
          format('Pembayaran hutang: %s', COALESCE(v_payable.supplier_name, 'Unknown')),
          0,
          p_amount
        );
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
  p_reference_id TEXT DEFAULT NULL,
  p_branch_id UUID,
  p_lines JSONB,  -- Array of {account_id, debit_amount, credit_amount, description}
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
    account_id UUID,
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

  -- Create journal header
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
    CASE WHEN p_auto_post THEN 'posted' ELSE 'draft' END,
    v_total_debit,
    v_total_credit
  )
  RETURNING id INTO v_journal_id;

  -- Create journal lines
  FOR v_line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
    account_id UUID,
    debit_amount NUMERIC,
    credit_amount NUMERIC,
    description TEXT
  )
  LOOP
    INSERT INTO journal_lines (
      journal_id,
      account_id,
      description,
      debit_amount,
      credit_amount
    ) VALUES (
      v_journal_id,
      v_line.account_id,
      v_line.description,
      COALESCE(v_line.debit_amount, 0),
      COALESCE(v_line.credit_amount, 0)
    );
  END LOOP;

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
