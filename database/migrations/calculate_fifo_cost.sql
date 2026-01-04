-- ============================================================================
-- FUNCTION: calculate_fifo_cost (READ-ONLY)
-- Menghitung HPP dari inventory_batches TANPA mengurangi remaining_quantity
-- Digunakan untuk non-office sale (HPP dihitung saat transaksi, stok dikurangi saat delivery)
-- ============================================================================
CREATE OR REPLACE FUNCTION calculate_fifo_cost(
  p_product_id UUID DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_quantity NUMERIC DEFAULT 0,
  p_material_id UUID DEFAULT NULL
)
RETURNS TABLE(total_hpp NUMERIC, batches_info JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  remaining_qty NUMERIC;
  batch_record RECORD;
  consume_qty NUMERIC;
  total_cost NUMERIC := 0;
  batch_list JSONB := '[]'::JSONB;
BEGIN
  remaining_qty := p_quantity;

  -- Validate input: must have either product_id or material_id
  IF p_product_id IS NULL AND p_material_id IS NULL THEN
    RETURN QUERY SELECT 0::NUMERIC, '[]'::JSONB;
    RETURN;
  END IF;

  -- Loop through batches in FIFO order (oldest first based on batch_date)
  -- READ-ONLY: NO UPDATE to remaining_quantity
  FOR batch_record IN
    SELECT
      id,
      remaining_quantity,
      unit_cost,
      notes,
      batch_date
    FROM inventory_batches
    WHERE
      -- Match by product_id OR material_id
      ((p_product_id IS NOT NULL AND product_id = p_product_id)
      OR (p_material_id IS NOT NULL AND material_id = p_material_id))
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND remaining_quantity > 0
    ORDER BY batch_date ASC, created_at ASC
  LOOP
    -- Exit if we've consumed enough
    IF remaining_qty <= 0 THEN
      EXIT;
    END IF;

    -- Calculate how much to consume from this batch
    IF batch_record.remaining_quantity >= remaining_qty THEN
      consume_qty := remaining_qty;
    ELSE
      consume_qty := batch_record.remaining_quantity;
    END IF;

    -- Calculate cost for this batch
    total_cost := total_cost + (consume_qty * COALESCE(batch_record.unit_cost, 0));

    -- Log the consumption (for reference only, no actual update)
    batch_list := batch_list || jsonb_build_object(
      'batch_id', batch_record.id,
      'quantity', consume_qty,
      'unit_cost', batch_record.unit_cost,
      'subtotal', consume_qty * COALESCE(batch_record.unit_cost, 0),
      'notes', batch_record.notes
    );

    remaining_qty := remaining_qty - consume_qty;
  END LOOP;

  -- If batch not enough, try to get cost from BOM or cost_price
  IF remaining_qty > 0 AND p_product_id IS NOT NULL THEN
    DECLARE
      bom_cost NUMERIC := 0;
      fallback_cost NUMERIC := 0;
    BEGIN
      -- Try BOM cost first
      SELECT COALESCE(SUM(pm.quantity * m.price_per_unit), 0) INTO bom_cost
      FROM product_materials pm
      JOIN materials m ON m.id = pm.material_id
      WHERE pm.product_id = p_product_id;

      IF bom_cost > 0 THEN
        total_cost := total_cost + (bom_cost * remaining_qty);
        batch_list := batch_list || jsonb_build_object(
          'batch_id', 'bom_fallback',
          'quantity', remaining_qty,
          'unit_cost', bom_cost,
          'subtotal', bom_cost * remaining_qty,
          'notes', 'Calculated from BOM'
        );
      ELSE
        -- Fallback to cost_price
        SELECT COALESCE(cost_price, base_price, 0) INTO fallback_cost
        FROM products WHERE id = p_product_id;

        IF fallback_cost > 0 THEN
          total_cost := total_cost + (fallback_cost * remaining_qty);
          batch_list := batch_list || jsonb_build_object(
            'batch_id', 'cost_price_fallback',
            'quantity', remaining_qty,
            'unit_cost', fallback_cost,
            'subtotal', fallback_cost * remaining_qty,
            'notes', 'Fallback to cost_price'
          );
        END IF;
      END IF;
    END;
  END IF;

  -- Return result
  RETURN QUERY SELECT total_cost, batch_list;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION calculate_fifo_cost TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_fifo_cost TO anon;
