-- ============================================================================
-- FIX ALL PRODUCTION & STOCK ISSUES
-- 1. FIFO Consumption: Update legacy materials.stock & Price Fallback
-- 2. Production Process: Fix Journal Number generation (Collision bug)
-- ============================================================================

-- PART 1: FIFO FUNCTIONS (From fix_fifo_stock_sync.sql)
-- ============================================================================

CREATE OR REPLACE FUNCTION consume_material_fifo(
  p_material_id UUID,
  p_branch_id UUID,
  p_quantity NUMERIC,
  p_reference_id TEXT DEFAULT NULL,
  p_reference_type TEXT DEFAULT 'production'
)
RETURNS TABLE (
  success BOOLEAN,
  total_cost NUMERIC,
  batches_consumed JSONB,
  error_message TEXT
) AS $$
DECLARE
  v_batch RECORD;
  v_remaining NUMERIC := p_quantity;
  v_total_cost NUMERIC := 0;
  v_consumed JSONB := '[]'::JSONB;
  v_deduct_qty NUMERIC;
  v_available_stock NUMERIC;
  v_material_name TEXT;
  v_cost_to_use NUMERIC;
BEGIN
  IF p_branch_id IS NULL THEN RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, 'Branch ID is REQUIRED'::TEXT; RETURN; END IF;
  IF p_material_id IS NULL THEN RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, 'Material ID is required'::TEXT; RETURN; END IF;
  IF p_quantity <= 0 THEN RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, 'Quantity must be positive'::TEXT; RETURN; END IF;

  SELECT name INTO v_material_name FROM materials WHERE id = p_material_id;
  IF v_material_name IS NULL THEN RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, 'Material not found'::TEXT; RETURN; END IF;

  SELECT COALESCE(SUM(remaining_quantity), 0) INTO v_available_stock
  FROM inventory_batches
  WHERE material_id = p_material_id AND (branch_id = p_branch_id OR branch_id IS NULL) AND remaining_quantity > 0;

  IF v_available_stock < p_quantity THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, format('Stok material tidak cukup: %s < %s', v_available_stock, p_quantity)::TEXT;
    RETURN;
  END IF;

  FOR v_batch IN
    SELECT id, remaining_quantity, unit_cost FROM inventory_batches
    WHERE material_id = p_material_id AND (branch_id = p_branch_id OR branch_id IS NULL) AND remaining_quantity > 0
    ORDER BY batch_date ASC, created_at ASC FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_deduct_qty := LEAST(v_batch.remaining_quantity, v_remaining);

    v_cost_to_use := COALESCE(v_batch.unit_cost, 0);
    IF v_cost_to_use = 0 THEN
      SELECT COALESCE(price_per_unit, 0) INTO v_cost_to_use FROM materials WHERE id = p_material_id;
    END IF;

    UPDATE inventory_batches SET remaining_quantity = remaining_quantity - v_deduct_qty, updated_at = NOW() WHERE id = v_batch.id;

    v_total_cost := v_total_cost + (v_deduct_qty * v_cost_to_use);
    v_consumed := v_consumed || jsonb_build_object('batch_id', v_batch.id, 'quantity', v_deduct_qty, 'unit_cost', v_cost_to_use);

    BEGIN
      INSERT INTO inventory_batch_consumptions (
        batch_id, quantity_consumed, consumed_at, reference_id, reference_type, unit_cost, total_cost
      ) VALUES (
        v_batch.id, v_deduct_qty, NOW(), p_reference_id, p_reference_type, v_cost_to_use, v_deduct_qty * v_cost_to_use
      );
    EXCEPTION WHEN undefined_table THEN NULL; END;

    v_remaining := v_remaining - v_deduct_qty;
  END LOOP;

  INSERT INTO material_stock_movements (
    material_id, material_name, type, reason, quantity, previous_stock, new_stock, 
    reference_id, reference_type, notes, branch_id, created_at
  ) VALUES (
    p_material_id, v_material_name, 'OUT', 'PRODUCTION_CONSUMPTION', p_quantity, 
    v_available_stock, v_available_stock - p_quantity, p_reference_id, p_reference_type, 
    'FIFO consume', p_branch_id, NOW()
  );

  UPDATE materials SET stock = GREATEST(0, stock - p_quantity), updated_at = NOW() WHERE id = p_material_id;

  RETURN QUERY SELECT TRUE, v_total_cost, v_consumed, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- PART 2: PRODUCTION PROCESS (Fix Journal Number)
-- ============================================================================

CREATE OR REPLACE FUNCTION process_production_atomic(
  p_product_id UUID,
  p_quantity NUMERIC,
  p_consume_bom BOOLEAN DEFAULT TRUE,
  p_note TEXT DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_user_name TEXT DEFAULT NULL
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
  v_production_id UUID;
  v_ref TEXT;
  v_bom_item RECORD;
  v_consume_result RECORD;
  v_total_material_cost NUMERIC := 0;
  v_material_details TEXT := '';
  v_bom_snapshot JSONB := '[]'::JSONB;
  v_product RECORD;
  v_journal_id UUID;
  v_entry_number TEXT;
  v_persediaan_barang_id TEXT;
  v_persediaan_bahan_id TEXT;
  v_unit_cost NUMERIC;
  v_required_qty NUMERIC;
  v_available_stock NUMERIC;
BEGIN
  IF p_branch_id IS NULL THEN RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID, 'Branch ID is REQUIRED'::TEXT; RETURN; END IF;
  IF p_quantity <= 0 THEN RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID, 'Quantity must be positive'::TEXT; RETURN; END IF;

  SELECT id, name INTO v_product FROM products WHERE id = p_product_id;
  IF v_product.id IS NULL THEN RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID, 'Product not found'::TEXT; RETURN; END IF;

  v_ref := 'PRD-' || TO_CHAR(NOW(), 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0');

  IF p_consume_bom THEN
    FOR v_bom_item IN
      SELECT pm.material_id, pm.quantity as bom_qty, m.name as material_name, m.unit as material_unit
      FROM product_materials pm
      JOIN materials m ON m.id = pm.material_id
      WHERE pm.product_id = p_product_id
    LOOP
      v_required_qty := v_bom_item.bom_qty * p_quantity;
      
      -- Call consume_material_fifo (WHICH NOW UPDATES MATERIALS.STOCK)
      SELECT * INTO v_consume_result FROM consume_material_fifo(v_bom_item.material_id, p_branch_id, v_required_qty, v_ref, 'production');
      
      IF NOT v_consume_result.success THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID, v_consume_result.error_message;
        RETURN;
      END IF;

      v_total_material_cost := v_total_material_cost + v_consume_result.total_cost;
      v_material_details := v_material_details || v_bom_item.material_name || ' x' || v_required_qty || ', ';
      
      v_bom_snapshot := v_bom_snapshot || jsonb_build_object(
        'id', gen_random_uuid(), 'materialId', v_bom_item.material_id, 'materialName', v_bom_item.material_name,
        'quantity', v_bom_item.bom_qty, 'created_at', NOW(), 'consumed', v_required_qty, 'cost', v_consume_result.total_cost
      );
    END LOOP;
  END IF;

  v_unit_cost := CASE WHEN p_quantity > 0 THEN v_total_material_cost / p_quantity ELSE 0 END;

  INSERT INTO production_records (
    ref, product_id, quantity, note, consume_bom, bom_snapshot, created_by, user_input_id, user_input_name, branch_id, created_at, updated_at
  ) VALUES (
    v_ref, p_product_id, p_quantity, p_note, p_consume_bom, 
    CASE WHEN jsonb_array_length(v_bom_snapshot) > 0 THEN v_bom_snapshot ELSE NULL END,
    COALESCE(p_user_id, '00000000-0000-0000-0000-000000000000'::UUID), 
    p_user_id, COALESCE(p_user_name, 'System'), p_branch_id, NOW(), NOW()
  ) RETURNING id INTO v_production_id;

  IF p_consume_bom AND v_total_material_cost > 0 THEN
    INSERT INTO inventory_batches (
      product_id, branch_id, initial_quantity, remaining_quantity, unit_cost, batch_date, notes, production_id
    ) VALUES (
      p_product_id, p_branch_id, p_quantity, p_quantity, v_unit_cost, NOW(), format('Produksi %s', v_ref), v_production_id
    );

    SELECT id INTO v_persediaan_barang_id FROM accounts WHERE code = '1310' AND branch_id = p_branch_id LIMIT 1;
    SELECT id INTO v_persediaan_bahan_id FROM accounts WHERE code = '1320' AND branch_id = p_branch_id LIMIT 1;

    IF v_persediaan_barang_id IS NOT NULL AND v_persediaan_bahan_id IS NOT NULL THEN
      -- [FIX] Use more robust entry number to avoid collision
      v_entry_number := 'JE-' || TO_CHAR(NOW(), 'YYMMDDHH24MISS') || '-' || LPAD(FLOOR(RANDOM() * 999)::TEXT, 3, '0');

      INSERT INTO journal_entries (
        entry_number, entry_date, description, reference_type, reference_id, branch_id, status, total_debit, total_credit
      ) VALUES (
        v_entry_number, NOW(), format('Produksi %s', v_ref), 'adjustment', v_production_id::TEXT, p_branch_id, 'draft', v_total_material_cost, v_total_material_cost
      ) RETURNING id INTO v_journal_id;

      INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
      VALUES (v_journal_id, 1, v_persediaan_barang_id, format('Hasil produksi: %s x%s', v_product.name, p_quantity), v_total_material_cost, 0);

      INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
      VALUES (v_journal_id, 2, v_persediaan_bahan_id, format('Bahan terpakai: %s', RTRIM(v_material_details, ', ')), 0, v_total_material_cost);
      
      -- Update status to posted after lines are added to avoid trigger error
      UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
    END IF;
  END IF;

  RETURN QUERY SELECT TRUE, v_production_id, v_ref, v_total_material_cost, v_journal_id, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
