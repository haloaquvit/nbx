-- Migration 003: Create RPC Function for FIFO Stock Restoration
-- Purpose: Restore stock when transaction is cancelled/voided
-- Date: 2026-01-03

-- Drop existing function if exists
DROP FUNCTION IF EXISTS restore_stock_fifo_v2(UUID, NUMERIC, TEXT, TEXT, UUID);

-- Main FIFO restore function
CREATE OR REPLACE FUNCTION restore_stock_fifo_v2(
  p_product_id UUID,
  p_quantity NUMERIC,
  p_reference_id TEXT,
  p_reference_type TEXT,  -- 'transaction' | 'delivery' | 'production'
  p_branch_id UUID DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  total_restored NUMERIC,
  batches_restored JSONB,
  error_message TEXT
) AS $$
DECLARE
  v_batch RECORD;
  v_remaining NUMERIC := p_quantity;
  v_restored JSONB := '[]'::JSONB;
  v_restore_qty NUMERIC;
  v_space_in_batch NUMERIC;
  v_consumption RECORD;
BEGIN
  -- Validate input
  IF p_product_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, 'Product ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_quantity <= 0 THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, 'Quantity must be positive'::TEXT;
    RETURN;
  END IF;

  -- Strategy 1: Try to restore to original batches if we have consumption log
  SELECT * INTO v_consumption
  FROM inventory_batch_consumptions
  WHERE reference_id = p_reference_id
    AND reference_type = p_reference_type
    AND product_id = p_product_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_consumption IS NOT NULL AND v_consumption.batches_detail IS NOT NULL THEN
    -- Restore to original batches (reverse FIFO)
    FOR v_batch IN
      SELECT
        (elem->>'batch_id')::UUID as batch_id,
        (elem->>'quantity')::NUMERIC as quantity
      FROM jsonb_array_elements(v_consumption.batches_detail) as elem
    LOOP
      EXIT WHEN v_remaining <= 0;

      v_restore_qty := LEAST(v_batch.quantity, v_remaining);

      -- Restore to this batch
      UPDATE inventory_batches
      SET
        remaining_quantity = remaining_quantity + v_restore_qty,
        updated_at = NOW()
      WHERE id = v_batch.batch_id;

      v_restored := v_restored || jsonb_build_object(
        'batch_id', v_batch.batch_id,
        'quantity', v_restore_qty,
        'method', 'original_batch'
      );

      v_remaining := v_remaining - v_restore_qty;
    END LOOP;

    -- Mark consumption as restored
    UPDATE inventory_batch_consumptions
    SET batches_detail = batches_detail || jsonb_build_object('restored_at', NOW())
    WHERE id = v_consumption.id;

  ELSE
    -- Strategy 2: Restore to oldest batches that have space
    FOR v_batch IN
      SELECT
        id,
        initial_quantity,
        remaining_quantity
      FROM inventory_batches
      WHERE product_id = p_product_id
        AND (p_branch_id IS NULL OR branch_id = p_branch_id)
        AND remaining_quantity < initial_quantity  -- Has space to restore
      ORDER BY batch_date ASC, created_at ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;

      v_space_in_batch := v_batch.initial_quantity - v_batch.remaining_quantity;
      v_restore_qty := LEAST(v_space_in_batch, v_remaining);

      IF v_restore_qty > 0 THEN
        UPDATE inventory_batches
        SET
          remaining_quantity = remaining_quantity + v_restore_qty,
          updated_at = NOW()
        WHERE id = v_batch.id;

        v_restored := v_restored || jsonb_build_object(
          'batch_id', v_batch.id,
          'quantity', v_restore_qty,
          'method', 'available_space'
        );

        v_remaining := v_remaining - v_restore_qty;
      END IF;
    END LOOP;

    -- Strategy 3: If still remaining, create new batch
    IF v_remaining > 0 THEN
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
      )
      SELECT
        p_product_id,
        p_branch_id,
        NOW(),
        v_remaining,
        v_remaining,
        COALESCE(
          (SELECT unit_cost FROM inventory_batches
           WHERE product_id = p_product_id
           ORDER BY batch_date DESC LIMIT 1),
          (SELECT cost_price FROM products WHERE id = p_product_id),
          0
        ),
        format('Stock restored from cancelled %s: %s', p_reference_type, p_reference_id),
        NOW(),
        NOW()
      RETURNING id INTO v_batch;

      v_restored := v_restored || jsonb_build_object(
        'batch_id', v_batch.id,
        'quantity', v_remaining,
        'method', 'new_batch'
      );

      v_remaining := 0;
    END IF;
  END IF;

  -- Update products.current_stock to keep in sync
  UPDATE products
  SET
    current_stock = current_stock + (p_quantity - v_remaining),
    updated_at = NOW()
  WHERE id = p_product_id;

  RETURN QUERY SELECT
    TRUE,
    p_quantity - v_remaining,
    v_restored,
    NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION restore_stock_fifo_v2(UUID, NUMERIC, TEXT, TEXT, UUID) TO authenticated;

COMMENT ON FUNCTION restore_stock_fifo_v2 IS 'Restore stock when transaction is cancelled - reverses FIFO consumption';
