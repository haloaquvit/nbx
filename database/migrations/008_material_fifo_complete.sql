-- Migration 008: Complete Material FIFO System
-- Purpose: Full FIFO implementation for materials matching product pattern
-- materials.stock becomes DEPRECATED - use v_material_current_stock instead
-- Date: 2026-01-03

-- ============================================================================
-- STEP 1: Create material_inventory_batches table (dedicated for materials)
-- This is separate from inventory_batches which is for products
-- ============================================================================

-- Note: We can reuse inventory_batches.material_id column which already exists
-- But for clarity, let's add migration to ensure the column exists and is indexed

-- Ensure inventory_batches can handle materials
DO $$
BEGIN
  -- Add material_id column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_batches' AND column_name = 'material_id'
  ) THEN
    ALTER TABLE inventory_batches ADD COLUMN material_id UUID REFERENCES materials(id);
  END IF;

  -- Create index for material_id lookups
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_inventory_batches_material_id'
  ) THEN
    CREATE INDEX idx_inventory_batches_material_id ON inventory_batches(material_id) WHERE material_id IS NOT NULL;
  END IF;

  -- Create index for FIFO ordering
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_inventory_batches_material_fifo'
  ) THEN
    CREATE INDEX idx_inventory_batches_material_fifo ON inventory_batches(material_id, batch_date, created_at)
    WHERE material_id IS NOT NULL AND remaining_quantity > 0;
  END IF;
END
$$;

-- ============================================================================
-- STEP 2: Create VIEW for material current stock (derived from batches)
-- ============================================================================

DROP VIEW IF EXISTS v_material_current_stock CASCADE;

CREATE VIEW v_material_current_stock AS
SELECT
  m.id as material_id,
  m.name as material_name,
  m.unit,
  m.type as material_type,
  m.branch_id,
  m.stock as legacy_stock, -- DEPRECATED: for backwards compatibility only
  COALESCE(batch_stock.calculated_stock, 0) as current_stock,
  COALESCE(batch_stock.total_batches, 0) as batch_count,
  CASE
    WHEN m.stock != COALESCE(batch_stock.calculated_stock, 0) THEN TRUE
    ELSE FALSE
  END as has_mismatch
FROM materials m
LEFT JOIN (
  SELECT
    material_id,
    SUM(remaining_quantity) as calculated_stock,
    COUNT(*) as total_batches
  FROM inventory_batches
  WHERE material_id IS NOT NULL AND remaining_quantity > 0
  GROUP BY material_id
) batch_stock ON batch_stock.material_id = m.id;

COMMENT ON VIEW v_material_current_stock IS
  'Material stock derived from inventory_batches. materials.stock is DEPRECATED.';

-- ============================================================================
-- STEP 3: Improved consume_material_fifo function
-- NO LONGER updates materials.stock - only uses batches
-- ============================================================================

CREATE OR REPLACE FUNCTION consume_material_fifo_v2(
  p_material_id UUID,
  p_quantity NUMERIC,
  p_reference_id TEXT,
  p_reference_type TEXT,  -- 'production' | 'purchase_return' | 'adjustment'
  p_branch_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_user_name TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  total_cost NUMERIC,
  quantity_consumed NUMERIC,
  batches_consumed JSONB,
  error_message TEXT
) AS $$
DECLARE
  v_batch RECORD;
  v_remaining NUMERIC := p_quantity;
  v_total_cost NUMERIC := 0;
  v_consumed JSONB := '[]'::JSONB;
  v_deduct_qty NUMERIC;
  v_material_name TEXT;
  v_available_stock NUMERIC;
BEGIN
  -- Validate input
  IF p_material_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, 0::NUMERIC, '[]'::JSONB, 'Material ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_quantity <= 0 THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, 0::NUMERIC, '[]'::JSONB, 'Quantity must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get material info
  SELECT name INTO v_material_name
  FROM materials WHERE id = p_material_id;

  IF v_material_name IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, 0::NUMERIC, '[]'::JSONB, 'Material not found'::TEXT;
    RETURN;
  END IF;

  -- Check available stock from batches
  SELECT COALESCE(SUM(remaining_quantity), 0) INTO v_available_stock
  FROM inventory_batches
  WHERE material_id = p_material_id
    AND remaining_quantity > 0
    AND (p_branch_id IS NULL OR branch_id = p_branch_id OR branch_id IS NULL);

  IF v_available_stock < p_quantity THEN
    RETURN QUERY SELECT
      FALSE,
      0::NUMERIC,
      0::NUMERIC,
      '[]'::JSONB,
      format('Insufficient stock: need %s, available %s', p_quantity, v_available_stock)::TEXT;
    RETURN;
  END IF;

  -- Consume from batches using FIFO (oldest first)
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
      AND (p_branch_id IS NULL OR branch_id = p_branch_id OR branch_id IS NULL)
    ORDER BY batch_date ASC, created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_deduct_qty := LEAST(v_batch.remaining_quantity, v_remaining);

    -- Update batch remaining quantity
    UPDATE inventory_batches
    SET
      remaining_quantity = remaining_quantity - v_deduct_qty,
      updated_at = NOW()
    WHERE id = v_batch.id;

    -- Track consumption for inventory_batch_consumptions table
    INSERT INTO inventory_batch_consumptions (
      batch_id,
      quantity_consumed,
      consumed_at,
      reference_id,
      reference_type,
      unit_cost
    ) VALUES (
      v_batch.id,
      v_deduct_qty,
      NOW(),
      p_reference_id,
      p_reference_type,
      COALESCE(v_batch.unit_cost, 0)
    );

    v_total_cost := v_total_cost + (v_deduct_qty * COALESCE(v_batch.unit_cost, 0));

    v_consumed := v_consumed || jsonb_build_object(
      'batch_id', v_batch.id,
      'quantity', v_deduct_qty,
      'unit_cost', COALESCE(v_batch.unit_cost, 0),
      'subtotal', v_deduct_qty * COALESCE(v_batch.unit_cost, 0)
    );

    v_remaining := v_remaining - v_deduct_qty;
  END LOOP;

  -- Log to material_stock_movements for audit trail
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
    v_available_stock,
    v_available_stock - p_quantity,
    p_reference_id,
    p_reference_type,
    p_user_id,
    COALESCE(p_user_name, 'System'),
    format('FIFO v2 consume: %s batches, total cost %s', jsonb_array_length(v_consumed), v_total_cost),
    p_branch_id
  );

  -- NOTE: We do NOT update materials.stock anymore
  -- Stock is derived from v_material_current_stock view

  RETURN QUERY SELECT TRUE, v_total_cost, p_quantity - v_remaining, v_consumed, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 4: Improved restore_material_fifo function
-- Restores stock by creating new batch (like receiving stock back)
-- ============================================================================

CREATE OR REPLACE FUNCTION restore_material_fifo_v2(
  p_material_id UUID,
  p_quantity NUMERIC,
  p_unit_cost NUMERIC,  -- Cost per unit for the restored batch
  p_reference_id TEXT,
  p_reference_type TEXT,
  p_branch_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_user_name TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  batch_id UUID,
  total_restored NUMERIC,
  error_message TEXT
) AS $$
DECLARE
  v_material_name TEXT;
  v_new_batch_id UUID;
  v_current_stock NUMERIC;
BEGIN
  IF p_material_id IS NULL OR p_quantity <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, 'Invalid parameters'::TEXT;
    RETURN;
  END IF;

  -- Get material info
  SELECT name INTO v_material_name
  FROM materials WHERE id = p_material_id;

  IF v_material_name IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, 'Material not found'::TEXT;
    RETURN;
  END IF;

  -- Get current stock from batches
  SELECT COALESCE(SUM(remaining_quantity), 0) INTO v_current_stock
  FROM inventory_batches
  WHERE material_id = p_material_id
    AND remaining_quantity > 0;

  -- Create new batch for restored stock
  INSERT INTO inventory_batches (
    material_id,
    branch_id,
    initial_quantity,
    remaining_quantity,
    unit_cost,
    batch_date,
    notes
  ) VALUES (
    p_material_id,
    p_branch_id,
    p_quantity,
    p_quantity,
    COALESCE(p_unit_cost, 0),
    NOW(),
    format('Restored from %s: %s', p_reference_type, p_reference_id)
  )
  RETURNING id INTO v_new_batch_id;

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
    'ADJUSTMENT',
    p_quantity,
    v_current_stock,
    v_current_stock + p_quantity,
    p_reference_id,
    p_reference_type,
    p_user_id,
    COALESCE(p_user_name, 'System'),
    format('FIFO v2 restore: new batch %s', v_new_batch_id),
    p_branch_id
  );

  -- NOTE: We do NOT update materials.stock anymore
  -- Stock is derived from v_material_current_stock view

  RETURN QUERY SELECT TRUE, v_new_batch_id, p_quantity, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 5: Function to add material batch (for purchases)
-- ============================================================================

CREATE OR REPLACE FUNCTION add_material_batch(
  p_material_id UUID,
  p_quantity NUMERIC,
  p_unit_cost NUMERIC,
  p_reference_id TEXT DEFAULT NULL,
  p_reference_type TEXT DEFAULT 'purchase',
  p_branch_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  batch_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_material_name TEXT;
  v_new_batch_id UUID;
  v_current_stock NUMERIC;
BEGIN
  IF p_material_id IS NULL OR p_quantity <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Invalid parameters'::TEXT;
    RETURN;
  END IF;

  -- Get material info
  SELECT name INTO v_material_name
  FROM materials WHERE id = p_material_id;

  IF v_material_name IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Material not found'::TEXT;
    RETURN;
  END IF;

  -- Get current stock
  SELECT COALESCE(SUM(remaining_quantity), 0) INTO v_current_stock
  FROM inventory_batches
  WHERE material_id = p_material_id AND remaining_quantity > 0;

  -- Create new batch
  INSERT INTO inventory_batches (
    material_id,
    branch_id,
    initial_quantity,
    remaining_quantity,
    unit_cost,
    batch_date,
    notes
  ) VALUES (
    p_material_id,
    p_branch_id,
    p_quantity,
    p_quantity,
    COALESCE(p_unit_cost, 0),
    NOW(),
    COALESCE(p_notes, format('Purchase: %s', COALESCE(p_reference_id, 'direct')))
  )
  RETURNING id INTO v_new_batch_id;

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
    notes,
    branch_id
  ) VALUES (
    p_material_id,
    v_material_name,
    'IN',
    'PURCHASE',
    p_quantity,
    v_current_stock,
    v_current_stock + p_quantity,
    p_reference_id,
    p_reference_type,
    format('New batch %s: %s units @ %s', v_new_batch_id, p_quantity, p_unit_cost),
    p_branch_id
  );

  RETURN QUERY SELECT TRUE, v_new_batch_id, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 6: Function to migrate existing materials.stock to batches
-- Run this ONCE to seed initial batches from current stock
-- ============================================================================

CREATE OR REPLACE FUNCTION migrate_material_stock_to_batches()
RETURNS TABLE (
  material_id UUID,
  material_name TEXT,
  migrated_quantity NUMERIC,
  batch_id UUID
) AS $$
DECLARE
  v_material RECORD;
  v_new_batch_id UUID;
BEGIN
  FOR v_material IN
    SELECT m.id, m.name, m.stock, m.branch_id, m.price_per_unit
    FROM materials m
    WHERE m.stock > 0
      AND NOT EXISTS (
        SELECT 1 FROM inventory_batches ib
        WHERE ib.material_id = m.id AND ib.remaining_quantity > 0
      )
  LOOP
    INSERT INTO inventory_batches (
      material_id,
      branch_id,
      initial_quantity,
      remaining_quantity,
      unit_cost,
      batch_date,
      notes
    ) VALUES (
      v_material.id,
      v_material.branch_id,
      v_material.stock,
      v_material.stock,
      COALESCE(v_material.price_per_unit, 0),
      NOW(),
      'Migrated from materials.stock (initial)'
    )
    RETURNING id INTO v_new_batch_id;

    RETURN QUERY SELECT v_material.id, v_material.name, v_material.stock, v_new_batch_id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 7: Add comment to materials.stock column marking it as deprecated
-- ============================================================================

COMMENT ON COLUMN materials.stock IS
  'DEPRECATED: Use v_material_current_stock.current_stock instead. This column is kept for backwards compatibility only.';

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT SELECT ON v_material_current_stock TO authenticated;
GRANT EXECUTE ON FUNCTION consume_material_fifo_v2(UUID, NUMERIC, TEXT, TEXT, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION restore_material_fifo_v2(UUID, NUMERIC, NUMERIC, TEXT, TEXT, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION add_material_batch(UUID, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION migrate_material_stock_to_batches() TO authenticated;

-- ============================================================================
-- NOTES FOR IMPLEMENTATION:
--
-- 1. Run migrate_material_stock_to_batches() ONCE to seed initial data
-- 2. Update all code to use:
--    - consume_material_fifo_v2() instead of direct UPDATE materials.stock
--    - add_material_batch() when purchasing materials
--    - restore_material_fifo_v2() when cancelling production
--    - v_material_current_stock for reading stock
-- 3. Frontend should read from v_material_current_stock, not materials.stock
-- ============================================================================
