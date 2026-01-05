CREATE OR REPLACE FUNCTION consume_inventory_fifo(
  p_product_id UUID,
  p_branch_id UUID,
  p_quantity NUMERIC,
  p_reference_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  total_hpp NUMERIC,
  batches_consumed JSONB,
  error_message TEXT
) AS $$
DECLARE
  v_batch RECORD;
  v_remaining NUMERIC := p_quantity;
  v_total_hpp NUMERIC := 0;
  v_consumed JSONB := '[]'::JSONB;
  v_deduct_qty NUMERIC;
  v_available_stock NUMERIC;
  v_product_name TEXT;
  v_is_material BOOLEAN := FALSE;
  v_material_cost NUMERIC := 0;
BEGIN
  -- Validasi Basic
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, 'Branch ID is REQUIRED'::TEXT;
    RETURN;
  END IF;

  -- 1. Cek Product
  SELECT name INTO v_product_name FROM products WHERE id = p_product_id;

  -- Jika bukan produk, cek Material
  IF v_product_name IS NULL THEN
     SELECT name, stock, cost_price INTO v_product_name, v_available_stock, v_material_cost
     FROM materials WHERE id = p_product_id;
     
     IF v_product_name IS NOT NULL THEN
       v_is_material := TRUE;
     ELSE
       -- Tidak ditemukan di Products maupun Materials
       RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, 'Item not found in Products or Materials'::TEXT;
       RETURN;
     END IF;
  END IF;

  -- 2. Logic Material (Simple Stock Update)
  IF v_is_material THEN
     IF v_available_stock < p_quantity THEN
        RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB,
          format('Stok Material tidak cukup. Tersedia: %s, Diminta: %s', v_available_stock, p_quantity)::TEXT;
        RETURN;
     END IF;

     -- Update Material Stock
     UPDATE materials
     SET stock = stock - p_quantity, updated_at = NOW()
     WHERE id = p_product_id;

     -- Calculate HPP (Cost * Qty)
     v_total_hpp := p_quantity * COALESCE(v_material_cost, 0);
     v_consumed := jsonb_build_array(jsonb_build_object('type', 'material', 'qty', p_quantity, 'cost', v_material_cost));

     -- Log Movement
     INSERT INTO product_stock_movements (
        product_id, branch_id, movement_type, quantity, reference_id, reference_type, unit_cost, notes, created_at
     ) VALUES (
        p_product_id, p_branch_id, 'OUT', p_quantity, p_reference_id, 'material_consume',
        COALESCE(v_material_cost, 0), 'Delivery Material', NOW()
     );

     RETURN QUERY SELECT TRUE, v_total_hpp, v_consumed, NULL::TEXT;
     RETURN;
  END IF;


  -- 3. Logic FIFO Normal (Products)
  -- Cek stok
  SELECT COALESCE(SUM(remaining_quantity), 0) INTO v_available_stock
  FROM inventory_batches
  WHERE product_id = p_product_id AND branch_id = p_branch_id AND remaining_quantity > 0;

  IF v_available_stock < p_quantity THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB,
      format('Stok tidak cukup untuk %s. Tersedia: %s, Diminta: %s', v_product_name, v_available_stock, p_quantity)::TEXT;
    RETURN;
  END IF;

  -- Loop Batches
  FOR v_batch IN
    SELECT id, remaining_quantity, unit_cost 
    FROM inventory_batches
    WHERE product_id = p_product_id AND branch_id = p_branch_id AND remaining_quantity > 0
    ORDER BY batch_date ASC, created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_deduct_qty := LEAST(v_batch.remaining_quantity, v_remaining);
    
    UPDATE inventory_batches
    SET remaining_quantity = remaining_quantity - v_deduct_qty, updated_at = NOW()
    WHERE id = v_batch.id;

    v_total_hpp := v_total_hpp + (v_deduct_qty * COALESCE(v_batch.unit_cost, 0));
    v_consumed := v_consumed || jsonb_build_object('batch_id', v_batch.id, 'qty', v_deduct_qty);
    v_remaining := v_remaining - v_deduct_qty;
  END LOOP;

  -- Log Movement
  INSERT INTO product_stock_movements (
    product_id, branch_id, movement_type, quantity, reference_id, reference_type, unit_cost, notes, created_at
  ) VALUES (
    p_product_id, p_branch_id, 'OUT', p_quantity, p_reference_id, 'fifo_consume',
    CASE WHEN p_quantity > 0 THEN v_total_hpp / p_quantity ELSE 0 END,
    'Delivery FIFO', NOW()
  );

  RETURN QUERY SELECT TRUE, v_total_hpp, v_consumed, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
