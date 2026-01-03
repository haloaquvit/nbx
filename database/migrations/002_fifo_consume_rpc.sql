-- Migration 002: Create RPC Function for FIFO Stock Consumption
-- Purpose: Atomic FIFO consume in database, not frontend
-- Date: 2026-01-03

-- Drop existing function if exists (to recreate with new signature)
DROP FUNCTION IF EXISTS consume_stock_fifo_v2(UUID, NUMERIC, TEXT, TEXT, UUID);

-- Main FIFO consume function
CREATE OR REPLACE FUNCTION consume_stock_fifo_v2(
  p_product_id UUID,
  p_quantity NUMERIC,
  p_reference_id TEXT,
  p_reference_type TEXT,  -- 'transaction' | 'delivery' | 'production'
  p_branch_id UUID DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  total_hpp NUMERIC,
  batches_consumed JSONB,
  remaining_to_consume NUMERIC,
  error_message TEXT
) AS $$
DECLARE
  v_batch RECORD;
  v_remaining NUMERIC := p_quantity;
  v_total_hpp NUMERIC := 0;
  v_consumed JSONB := '[]'::JSONB;
  v_deduct_qty NUMERIC;
  v_available_stock NUMERIC;
BEGIN
  -- Validate input
  IF p_product_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, p_quantity, 'Product ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_quantity <= 0 THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, 0::NUMERIC, 'Quantity must be positive'::TEXT;
    RETURN;
  END IF;

  -- Check available stock
  SELECT COALESCE(SUM(remaining_quantity), 0)
  INTO v_available_stock
  FROM inventory_batches
  WHERE product_id = p_product_id
    AND remaining_quantity > 0
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  IF v_available_stock < p_quantity THEN
    RETURN QUERY SELECT
      FALSE,
      0::NUMERIC,
      '[]'::JSONB,
      p_quantity,
      format('Insufficient stock. Available: %s, Requested: %s', v_available_stock, p_quantity)::TEXT;
    RETURN;
  END IF;

  -- Loop through batches in FIFO order (oldest first)
  FOR v_batch IN
    SELECT
      id,
      remaining_quantity,
      unit_cost,
      batch_date,
      notes
    FROM inventory_batches
    WHERE product_id = p_product_id
      AND remaining_quantity > 0
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    ORDER BY batch_date ASC, created_at ASC
    FOR UPDATE  -- Lock rows to prevent race condition
  LOOP
    EXIT WHEN v_remaining <= 0;

    -- Calculate how much to deduct from this batch
    v_deduct_qty := LEAST(v_batch.remaining_quantity, v_remaining);

    -- Update batch remaining quantity
    UPDATE inventory_batches
    SET
      remaining_quantity = remaining_quantity - v_deduct_qty,
      updated_at = NOW()
    WHERE id = v_batch.id;

    -- Calculate HPP for this batch
    v_total_hpp := v_total_hpp + (v_deduct_qty * COALESCE(v_batch.unit_cost, 0));

    -- Add to consumed array
    v_consumed := v_consumed || jsonb_build_object(
      'batch_id', v_batch.id,
      'quantity', v_deduct_qty,
      'unit_cost', COALESCE(v_batch.unit_cost, 0),
      'subtotal', v_deduct_qty * COALESCE(v_batch.unit_cost, 0),
      'batch_date', v_batch.batch_date,
      'notes', v_batch.notes
    );

    v_remaining := v_remaining - v_deduct_qty;
  END LOOP;

  -- Log the consumption (optional - for audit)
  INSERT INTO inventory_batch_consumptions (
    product_id,
    reference_id,
    reference_type,
    quantity_consumed,
    total_hpp,
    batches_detail,
    created_at
  ) VALUES (
    p_product_id,
    p_reference_id,
    p_reference_type,
    p_quantity - v_remaining,
    v_total_hpp,
    v_consumed,
    NOW()
  ) ON CONFLICT DO NOTHING;  -- Ignore if table doesn't exist

  -- Update products.current_stock to keep in sync
  UPDATE products
  SET
    current_stock = current_stock - (p_quantity - v_remaining),
    updated_at = NOW()
  WHERE id = p_product_id;

  RETURN QUERY SELECT
    TRUE,
    v_total_hpp,
    v_consumed,
    v_remaining,
    NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Create consumption log table if not exists
CREATE TABLE IF NOT EXISTS inventory_batch_consumptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL,
  material_id UUID,
  reference_id TEXT NOT NULL,
  reference_type TEXT NOT NULL,
  quantity_consumed NUMERIC NOT NULL,
  total_hpp NUMERIC DEFAULT 0,
  batches_detail JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  branch_id UUID
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_batch_consumptions_reference
ON inventory_batch_consumptions(reference_id, reference_type);

CREATE INDEX IF NOT EXISTS idx_batch_consumptions_product
ON inventory_batch_consumptions(product_id);

-- Grant permissions
GRANT EXECUTE ON FUNCTION consume_stock_fifo_v2(UUID, NUMERIC, TEXT, TEXT, UUID) TO authenticated;
GRANT ALL ON inventory_batch_consumptions TO authenticated;

COMMENT ON FUNCTION consume_stock_fifo_v2 IS 'Atomic FIFO stock consumption - returns HPP and consumed batches';
COMMENT ON TABLE inventory_batch_consumptions IS 'Audit log of batch consumptions for traceability';
