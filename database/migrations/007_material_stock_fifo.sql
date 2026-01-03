-- Migration 007: Material Stock FIFO Functions
-- Purpose: Apply same FIFO pattern to materials as products
-- Date: 2026-01-03

-- View to calculate current material stock from batches (if material_inventory_batches exists)
CREATE OR REPLACE VIEW v_material_current_stock AS
SELECT
  m.id as material_id,
  m.name as material_name,
  m.branch_id,
  m.stock as stored_stock,
  COALESCE(
    (SELECT SUM(remaining_quantity)
     FROM inventory_batches ib
     WHERE ib.material_id = m.id AND ib.remaining_quantity > 0),
    m.stock
  ) as calculated_stock
FROM materials m;

-- Function to consume material stock using FIFO
CREATE OR REPLACE FUNCTION consume_material_fifo(
  p_material_id UUID,
  p_quantity NUMERIC,
  p_reference_id TEXT,
  p_reference_type TEXT,  -- 'production' | 'transaction'
  p_branch_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_user_name TEXT DEFAULT NULL
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
  v_current_stock NUMERIC;
  v_new_stock NUMERIC;
  v_material_name TEXT;
  v_material_type TEXT;
BEGIN
  -- Validate input
  IF p_material_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, 'Material ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_quantity <= 0 THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, 'Quantity must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get material info
  SELECT name, stock, type INTO v_material_name, v_current_stock, v_material_type
  FROM materials WHERE id = p_material_id;

  IF v_material_name IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, 'Material not found'::TEXT;
    RETURN;
  END IF;

  -- Check if material uses batch tracking (inventory_batches with material_id)
  -- Try to consume from batches first
  FOR v_batch IN
    SELECT
      id,
      remaining_quantity,
      unit_cost,
      batch_date,
      notes
    FROM inventory_batches
    WHERE material_id = p_material_id
      AND remaining_quantity > 0
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    ORDER BY batch_date ASC, created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_deduct_qty := LEAST(v_batch.remaining_quantity, v_remaining);

    UPDATE inventory_batches
    SET
      remaining_quantity = remaining_quantity - v_deduct_qty,
      updated_at = NOW()
    WHERE id = v_batch.id;

    v_total_cost := v_total_cost + (v_deduct_qty * COALESCE(v_batch.unit_cost, 0));

    v_consumed := v_consumed || jsonb_build_object(
      'batch_id', v_batch.id,
      'quantity', v_deduct_qty,
      'unit_cost', COALESCE(v_batch.unit_cost, 0),
      'subtotal', v_deduct_qty * COALESCE(v_batch.unit_cost, 0)
    );

    v_remaining := v_remaining - v_deduct_qty;
  END LOOP;

  -- Calculate new stock based on material type
  IF v_material_type = 'Stock' THEN
    -- Stock type: reduce stock
    v_new_stock := GREATEST(0, v_current_stock - p_quantity);
  ELSE
    -- Beli/Jasa type: track consumption (can increase or stay same)
    v_new_stock := v_current_stock + p_quantity;
  END IF;

  -- Update material stock
  UPDATE materials
  SET stock = v_new_stock, updated_at = NOW()
  WHERE id = p_material_id;

  -- Log to material_stock_movements
  INSERT INTO material_stock_movements (
    material_id,
    material_name,
    type,
    reason,
    quantity,
    previous_stock,
    new_stock,
    reference_id,
    reference_type,
    user_id,
    user_name,
    notes,
    branch_id
  ) VALUES (
    p_material_id,
    v_material_name,
    'OUT',
    'PRODUCTION_CONSUMPTION',
    p_quantity,
    v_current_stock,
    v_new_stock,
    p_reference_id,
    p_reference_type,
    p_user_id,
    COALESCE(p_user_name, 'System'),
    format('FIFO consume for %s', p_reference_id),
    p_branch_id
  );

  RETURN QUERY SELECT TRUE, v_total_cost, v_consumed, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Function to restore material stock
CREATE OR REPLACE FUNCTION restore_material_fifo(
  p_material_id UUID,
  p_quantity NUMERIC,
  p_reference_id TEXT,
  p_reference_type TEXT,
  p_branch_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_user_name TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  total_restored NUMERIC,
  error_message TEXT
) AS $$
DECLARE
  v_current_stock NUMERIC;
  v_new_stock NUMERIC;
  v_material_name TEXT;
  v_material_type TEXT;
BEGIN
  IF p_material_id IS NULL OR p_quantity <= 0 THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, 'Invalid parameters'::TEXT;
    RETURN;
  END IF;

  -- Get material info
  SELECT name, stock, type INTO v_material_name, v_current_stock, v_material_type
  FROM materials WHERE id = p_material_id;

  IF v_material_name IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, 'Material not found'::TEXT;
    RETURN;
  END IF;

  -- Calculate new stock (reverse of consume)
  IF v_material_type = 'Stock' THEN
    v_new_stock := v_current_stock + p_quantity;
  ELSE
    v_new_stock := GREATEST(0, v_current_stock - p_quantity);
  END IF;

  -- Update material stock
  UPDATE materials
  SET stock = v_new_stock, updated_at = NOW()
  WHERE id = p_material_id;

  -- Log to material_stock_movements
  INSERT INTO material_stock_movements (
    material_id,
    material_name,
    type,
    reason,
    quantity,
    previous_stock,
    new_stock,
    reference_id,
    reference_type,
    user_id,
    user_name,
    notes,
    branch_id
  ) VALUES (
    p_material_id,
    v_material_name,
    'IN',
    'PRODUCTION_DELETE_RESTORE',
    p_quantity,
    v_current_stock,
    v_new_stock,
    p_reference_id,
    p_reference_type,
    p_user_id,
    COALESCE(p_user_name, 'System'),
    format('FIFO restore for cancelled %s', p_reference_id),
    p_branch_id
  );

  RETURN QUERY SELECT TRUE, p_quantity, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT SELECT ON v_material_current_stock TO authenticated;
GRANT EXECUTE ON FUNCTION consume_material_fifo(UUID, NUMERIC, TEXT, TEXT, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION restore_material_fifo(UUID, NUMERIC, TEXT, TEXT, UUID, UUID, TEXT) TO authenticated;

COMMENT ON VIEW v_material_current_stock IS 'Derived material stock from batches or direct stock column';
COMMENT ON FUNCTION consume_material_fifo IS 'Consume material stock using FIFO for production';
COMMENT ON FUNCTION restore_material_fifo IS 'Restore material stock when production is cancelled';
