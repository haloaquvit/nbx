-- ============================================================================
-- FIX SPOILAGE DOUBLE DEDUCTION
-- Memperbaiki logika 'Item Keluar' (Spoilage) yang sebelumnya mengurangi stok 2x
-- (sekali via consume_material_fifo, sekali via manual update).
-- Sekarang kita hapus manual update & log statik, dan percayakan pada consume_fifo.
-- ============================================================================

-- 1. Update CONSUME_MATERIAL_FIFO agar mencatat reason yang sesuai
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
  v_reason TEXT;
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

    -- Price Fallback
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

  -- Determine Reason
  IF p_reference_type = 'spoilage' THEN
    v_reason := 'SPOILAGE';
  ELSIF p_reference_type = 'production' THEN
    v_reason := 'PRODUCTION_CONSUMPTION';
  ELSE
    v_reason := 'OUT';
  END IF;

  INSERT INTO material_stock_movements (
    material_id, material_name, type, reason, quantity, previous_stock, new_stock, 
    reference_id, reference_type, notes, branch_id, created_at
  ) VALUES (
    p_material_id, v_material_name, 'OUT', v_reason, p_quantity, 
    v_available_stock, v_available_stock - p_quantity, p_reference_id, p_reference_type, 
    format('FIFO consume: %s batches', jsonb_array_length(v_consumed)), p_branch_id, NOW()
  );

  -- [FIX] Update Legacy Stock
  UPDATE materials SET stock = GREATEST(0, stock - p_quantity), updated_at = NOW() WHERE id = p_material_id;

  RETURN QUERY SELECT TRUE, v_total_cost, v_consumed, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Update PROCESS_SPOILAGE_ATOMIC (Remove Double Deduct)
-- ============================================================================

CREATE OR REPLACE FUNCTION process_spoilage_atomic(
  p_material_id UUID,
  p_quantity NUMERIC,
  p_note TEXT DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_user_name TEXT DEFAULT NULL
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
  v_record_id UUID;
  v_ref TEXT;
  v_consume_result RECORD;
  v_spoilage_cost NUMERIC := 0;
  v_material RECORD;
  v_journal_id UUID;
  v_entry_number TEXT;
  v_beban_lain_id TEXT;
  v_persediaan_bahan_id TEXT;
BEGIN
  IF p_branch_id IS NULL THEN RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID, 'Branch ID is REQUIRED'::TEXT; RETURN; END IF;
  IF p_material_id IS NULL THEN RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID, 'Material ID is required'::TEXT; RETURN; END IF;
  IF p_quantity <= 0 THEN RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID, 'Quantity must be positive'::TEXT; RETURN; END IF;

  SELECT id, name, unit, stock INTO v_material FROM materials WHERE id = p_material_id;
  IF v_material.id IS NULL THEN RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID, 'Material not found'::TEXT; RETURN; END IF;

  v_ref := 'ERR-' || TO_CHAR(NOW(), 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0');

  -- CALL CONSUME FIFO (Logs Stock Movement & Update Material Stock)
  SELECT * INTO v_consume_result FROM consume_material_fifo(p_material_id, p_branch_id, p_quantity, v_ref, 'spoilage');
  
  IF NOT v_consume_result.success THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID, v_consume_result.error_message;
    RETURN;
  END IF;

  v_spoilage_cost := v_consume_result.total_cost;

  -- [REMOVED] DO NOT UPDATE MATERIALS.STOCK MANUALLY (Double Deduct)
  -- [REMOVED] DO NOT INSERT MATERIAL_STOCK_MOVEMENTS MANUALLY (Double Log)

  INSERT INTO production_records (
    ref, product_id, quantity, note, consume_bom, created_by, user_input_id, user_input_name, branch_id, created_at, updated_at
  ) VALUES (
    v_ref, NULL, -p_quantity, 
    format('BAHAN RUSAK: %s - %s', v_material.name, COALESCE(p_note, 'Tidak ada catatan')),
    FALSE, COALESCE(p_user_id, '00000000-0000-0000-0000-000000000000'::UUID), p_user_id, COALESCE(p_user_name, 'System'), p_branch_id, NOW(), NOW()
  ) RETURNING id INTO v_record_id;

  -- Create Journal
  IF v_spoilage_cost > 0 THEN
    SELECT id INTO v_beban_lain_id FROM accounts WHERE code = '8100' AND branch_id = p_branch_id AND is_active = TRUE LIMIT 1;
    SELECT id INTO v_persediaan_bahan_id FROM accounts WHERE code = '1320' AND branch_id = p_branch_id AND is_active = TRUE LIMIT 1;

    IF v_beban_lain_id IS NOT NULL AND v_persediaan_bahan_id IS NOT NULL THEN
      -- Use improved entry number generator
      v_entry_number := 'JE-' || TO_CHAR(NOW(), 'YYMMDDHH24MISS') || '-' || LPAD(FLOOR(RANDOM() * 999)::TEXT, 3, '0');

      INSERT INTO journal_entries (
        entry_number, entry_date, description, reference_type, reference_id, branch_id, status, total_debit, total_credit
      ) VALUES (
        v_entry_number, NOW(), format('Bahan Rusak %s: %s x%s', v_ref, v_material.name, p_quantity), 'adjustment', v_record_id::TEXT, p_branch_id, 'draft', v_spoilage_cost, v_spoilage_cost
      ) RETURNING id INTO v_journal_id;

      INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
      VALUES (v_journal_id, 1, v_beban_lain_id, format('Bahan rusak: %s x%s', v_material.name, p_quantity), v_spoilage_cost, 0);

      INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
      VALUES (v_journal_id, 2, v_persediaan_bahan_id, format('Bahan keluar: %s x%s', v_material.name, p_quantity), 0, v_spoilage_cost);

      UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
    END IF;
  END IF;

  RETURN QUERY SELECT TRUE, v_record_id, v_ref, v_spoilage_cost, v_journal_id, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
