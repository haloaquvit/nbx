-- ============================================================================
-- FIX FIFO INVENTORY SYNC
-- Script ini memperbaiki fungsi FIFO agar otomatis update tabel materials (stock legacy)
-- Jalankan script ini agar stok di aplikasi (frontend) sinkron dengan inventory batches
-- ============================================================================

-- Reference to RPC 02: FIFO Material
-- ============================================================================

-- 1. CONSUME MATERIAL FIFO (Updated with legacy stock sync)
CREATE OR REPLACE FUNCTION consume_material_fifo(
  p_material_id UUID,
  p_branch_id UUID,           -- WAJIB: identitas cabang
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
  -- Validasi
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, 'Branch ID is REQUIRED'::TEXT;
    RETURN;
  END IF;

  IF p_material_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, 'Material ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_quantity <= 0 THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, 'Quantity must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get material name 
  SELECT name INTO v_material_name FROM materials WHERE id = p_material_id;
  IF v_material_name IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, 'Material not found'::TEXT;
    RETURN;
  END IF;

  -- Cek Stok di batches
  SELECT COALESCE(SUM(remaining_quantity), 0) INTO v_available_stock
  FROM inventory_batches
  WHERE material_id = p_material_id
    AND (branch_id = p_branch_id OR branch_id IS NULL)
    AND remaining_quantity > 0;

  IF v_available_stock < p_quantity THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB,
      format('Stok material tidak cukup untuk %s. Tersedia: %s, Diminta: %s',
        v_material_name, v_available_stock, p_quantity)::TEXT;
    RETURN;
  END IF;

  -- Consume FIFO
  FOR v_batch IN
    SELECT id, remaining_quantity, unit_cost
    FROM inventory_batches
    WHERE material_id = p_material_id
      AND (branch_id = p_branch_id OR branch_id IS NULL)
      AND remaining_quantity > 0
    ORDER BY batch_date ASC, created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_deduct_qty := LEAST(v_batch.remaining_quantity, v_remaining);

    -- [NEW] PRICE FALLBACK LOGIC
    -- Use batch cost if available, otherwise fallback to material master price
    v_cost_to_use := COALESCE(v_batch.unit_cost, 0);
    IF v_cost_to_use = 0 THEN
      SELECT COALESCE(price_per_unit, 0) INTO v_cost_to_use
      FROM materials WHERE id = p_material_id;
    END IF;

    UPDATE inventory_batches
    SET remaining_quantity = remaining_quantity - v_deduct_qty,
        updated_at = NOW()
    WHERE id = v_batch.id;

    v_total_cost := v_total_cost + (v_deduct_qty * v_cost_to_use);

    v_consumed := v_consumed || jsonb_build_object(
      'batch_id', v_batch.id,
      'quantity', v_deduct_qty,
      'unit_cost', v_cost_to_use
    );

    -- Log consumption
    BEGIN
      INSERT INTO inventory_batch_consumptions (
        batch_id, quantity_consumed, consumed_at, reference_id, reference_type, unit_cost, total_cost
      ) VALUES (
        v_batch.id, v_deduct_qty, NOW(), p_reference_id, p_reference_type, v_cost_to_use, v_deduct_qty * v_cost_to_use
      );
    EXCEPTION WHEN undefined_table THEN NULL; END;

    v_remaining := v_remaining - v_deduct_qty;
  END LOOP;

  -- Log Movement
  INSERT INTO material_stock_movements (
    material_id, material_name, type, reason, quantity, previous_stock, new_stock, 
    reference_id, reference_type, notes, branch_id, created_at
  ) VALUES (
    p_material_id, v_material_name, 'OUT', 'PRODUCTION_CONSUMPTION', p_quantity, 
    v_available_stock, v_available_stock - p_quantity, p_reference_id, p_reference_type, 
    format('FIFO consume'), p_branch_id, NOW()
  );

  -- [FIX] UPDATE LEGACY STOCK COLUMN
  UPDATE materials 
  SET stock = GREATEST(0, stock - p_quantity),
      updated_at = NOW()
  WHERE id = p_material_id;

  RETURN QUERY SELECT TRUE, v_total_cost, v_consumed, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. RESTORE MATERIAL FIFO (Updated with legacy stock sync)
CREATE OR REPLACE FUNCTION restore_material_fifo(
  p_material_id UUID,
  p_branch_id UUID,
  p_quantity NUMERIC,
  p_unit_cost NUMERIC DEFAULT 0,
  p_reference_id TEXT DEFAULT NULL,
  p_reference_type TEXT DEFAULT 'restore'
)
RETURNS TABLE (
  success BOOLEAN,
  batch_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_new_batch_id UUID;
  v_current_stock NUMERIC;
BEGIN
  IF p_branch_id IS NULL THEN RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID required'::TEXT; RETURN; END IF;
  
  -- Get current batches stock
  SELECT COALESCE(SUM(remaining_quantity), 0) INTO v_current_stock
  FROM inventory_batches
  WHERE material_id = p_material_id AND remaining_quantity > 0;

  -- Create Batch
  INSERT INTO inventory_batches (
    material_id, branch_id, initial_quantity, remaining_quantity, unit_cost, batch_date, notes
  ) VALUES (
    p_material_id, p_branch_id, p_quantity, p_quantity, COALESCE(p_unit_cost, 0), NOW(), 
    format('Restored: %s', p_reference_type)
  ) RETURNING id INTO v_new_batch_id;

  -- Log Movement
  INSERT INTO material_stock_movements (
    material_id, material_name, type, reason, quantity, previous_stock, new_stock, 
    reference_id, reference_type, notes, branch_id, created_at
  ) VALUES (
    p_material_id, (SELECT name FROM materials WHERE id=p_material_id), 'IN', 'ADJUSTMENT', p_quantity, 
    v_current_stock, v_current_stock + p_quantity, p_reference_id, p_reference_type, 
    'FIFO Restore', p_branch_id, NOW()
  );

  -- [FIX] UPDATE LEGACY STOCK COLUMN
  UPDATE materials 
  SET stock = stock + p_quantity,
      updated_at = NOW()
  WHERE id = p_material_id;

  RETURN QUERY SELECT TRUE, v_new_batch_id, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. ADD MATERIAL BATCH (Updated with legacy stock sync)
CREATE OR REPLACE FUNCTION add_material_batch(
  p_material_id UUID,
  p_branch_id UUID,
  p_quantity NUMERIC,
  p_unit_cost NUMERIC,
  p_reference_id TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  batch_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_new_batch_id UUID;
  v_current_stock NUMERIC;
BEGIN
  IF p_branch_id IS NULL THEN RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID required'::TEXT; RETURN; END IF;

  SELECT COALESCE(SUM(remaining_quantity), 0) INTO v_current_stock
  FROM inventory_batches
  WHERE material_id = p_material_id AND remaining_quantity > 0;

  INSERT INTO inventory_batches (
    material_id, branch_id, initial_quantity, remaining_quantity, unit_cost, batch_date, notes
  ) VALUES (
    p_material_id, p_branch_id, p_quantity, p_quantity, COALESCE(p_unit_cost, 0), NOW(), 
    COALESCE(p_notes, 'Purchase')
  ) RETURNING id INTO v_new_batch_id;

  INSERT INTO material_stock_movements (
    material_id, material_name, type, reason, quantity, previous_stock, new_stock, 
    reference_id, reference_type, notes, branch_id, created_at
  ) VALUES (
    p_material_id, (SELECT name FROM materials WHERE id=p_material_id), 'IN', 'PURCHASE', p_quantity, 
    v_current_stock, v_current_stock + p_quantity, p_reference_id, 'purchase', 
    'Purchase Batch', p_branch_id, NOW()
  );

  -- [FIX] UPDATE LEGACY STOCK COLUMN
  UPDATE materials 
  SET stock = stock + p_quantity,
      updated_at = NOW()
  WHERE id = p_material_id;

  RETURN QUERY SELECT TRUE, v_new_batch_id, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION consume_material_fifo(UUID, UUID, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION restore_material_fifo(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION add_material_batch(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT) TO authenticated;
