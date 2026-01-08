-- =====================================================
-- FIX: Negative Stock HPP = 0 Bug
-- Date: 2026-01-09
-- Fixes: consume_inventory_fifo, consume_material_fifo
-- Change: Use cost_price/price_per_unit as fallback instead of 0
-- Deploy to: aquvit_new (Nabire) and mkw_db (Manokwari)
-- =====================================================

-- 1. FIX consume_inventory_fifo (Products)
CREATE OR REPLACE FUNCTION public.consume_inventory_fifo(p_product_id uuid, p_branch_id uuid, p_quantity numeric, p_reference_id text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, total_hpp numeric, batches_consumed jsonb, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_batch RECORD;
  v_remaining NUMERIC := p_quantity;
  v_total_hpp NUMERIC := 0;
  v_consumed JSONB := '[]'::JSONB;
  v_deduct_qty NUMERIC;
  v_available_stock NUMERIC;
  v_product_name TEXT;
  v_fallback_cost NUMERIC := 0;
BEGIN
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, 'Branch ID is REQUIRED'::TEXT;
    RETURN;
  END IF;
  IF p_product_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, 'Product ID is required'::TEXT;
    RETURN;
  END IF;
  IF p_quantity <= 0 THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, 'Quantity must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get product name AND cost_price for fallback
  SELECT name, COALESCE(cost_price, base_price, 0) 
  INTO v_product_name, v_fallback_cost
  FROM products WHERE id = p_product_id;

  IF v_product_name IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, 'Product not found'::TEXT;
    RETURN;
  END IF;

  SELECT COALESCE(SUM(remaining_quantity), 0) INTO v_available_stock
  FROM inventory_batches
  WHERE product_id = p_product_id AND branch_id = p_branch_id AND remaining_quantity > 0;

  FOR v_batch IN
    SELECT id, remaining_quantity, unit_cost, batch_date, notes
    FROM inventory_batches
    WHERE product_id = p_product_id AND branch_id = p_branch_id AND remaining_quantity > 0
    ORDER BY batch_date ASC, created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_deduct_qty := LEAST(v_batch.remaining_quantity, v_remaining);
    UPDATE inventory_batches SET remaining_quantity = remaining_quantity - v_deduct_qty, updated_at = NOW() WHERE id = v_batch.id;
    v_total_hpp := v_total_hpp + (v_deduct_qty * COALESCE(v_batch.unit_cost, 0));
    v_consumed := v_consumed || jsonb_build_object(
      'batch_id', v_batch.id, 'quantity', v_deduct_qty,
      'unit_cost', COALESCE(v_batch.unit_cost, 0),
      'subtotal', v_deduct_qty * COALESCE(v_batch.unit_cost, 0)
    );
    v_remaining := v_remaining - v_deduct_qty;
  END LOOP;

  -- FIX: Handle negative stock with fallback cost
  IF v_remaining > 0 THEN
    INSERT INTO inventory_batches (product_id, branch_id, initial_quantity, remaining_quantity, unit_cost, batch_date, notes)
    VALUES (p_product_id, p_branch_id, 0, -v_remaining, v_fallback_cost, NOW(),
      format('Negative Stock fallback (cost: %s) for %s', v_fallback_cost, COALESCE(p_reference_id, 'sale')))
    RETURNING id INTO v_batch.id;
    
    v_total_hpp := v_total_hpp + (v_remaining * v_fallback_cost);
    v_consumed := v_consumed || jsonb_build_object(
      'batch_id', v_batch.id, 'quantity', v_remaining,
      'unit_cost', v_fallback_cost, 'subtotal', v_remaining * v_fallback_cost,
      'notes', 'negative_fallback_with_cost'
    );
    v_remaining := 0;
  END IF;

  INSERT INTO product_stock_movements (product_id, branch_id, type, reason, quantity, reference_id, reference_type, notes, created_at)
  VALUES (p_product_id, p_branch_id, 'OUT', 'delivery', p_quantity, p_reference_id, 'fifo_consume',
    format('FIFO consume: %s batches, HPP %s', jsonb_array_length(v_consumed), v_total_hpp), NOW());

  RETURN QUERY SELECT TRUE, v_total_hpp, v_consumed, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, SQLERRM::TEXT;
END;
$function$;

-- 2. FIX consume_material_fifo (Materials)
CREATE OR REPLACE FUNCTION public.consume_material_fifo(p_material_id uuid, p_branch_id uuid, p_quantity numeric, p_reference_id text DEFAULT NULL::text, p_reference_type text DEFAULT 'production'::text, p_notes text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, total_cost numeric, batches_consumed jsonb, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_batch RECORD;
  v_remaining NUMERIC := p_quantity;
  v_total_cost NUMERIC := 0;
  v_consumed JSONB := '[]'::JSONB;
  v_deduct_qty NUMERIC;
  v_available_stock NUMERIC;
  v_material_name TEXT;
  v_details TEXT;
  v_fallback_cost NUMERIC := 0;
BEGIN
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

  -- Get material name AND price_per_unit for fallback
  SELECT name, COALESCE(price_per_unit, 0) 
  INTO v_material_name, v_fallback_cost
  FROM materials WHERE id = p_material_id;

  IF v_material_name IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, 'Material not found'::TEXT;
    RETURN;
  END IF;

  SELECT COALESCE(SUM(remaining_quantity), 0) INTO v_available_stock
  FROM inventory_batches
  WHERE material_id = p_material_id AND (branch_id = p_branch_id OR branch_id IS NULL) AND remaining_quantity > 0;

  FOR v_batch IN
    SELECT id, remaining_quantity, unit_cost, batch_date, notes
    FROM inventory_batches
    WHERE material_id = p_material_id AND (branch_id = p_branch_id OR branch_id IS NULL) AND remaining_quantity > 0
    ORDER BY batch_date ASC, created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_deduct_qty := LEAST(v_batch.remaining_quantity, v_remaining);
    UPDATE inventory_batches SET remaining_quantity = remaining_quantity - v_deduct_qty, updated_at = NOW() WHERE id = v_batch.id;
    v_total_cost := v_total_cost + (v_deduct_qty * COALESCE(v_batch.unit_cost, 0));
    v_consumed := v_consumed || jsonb_build_object(
      'batch_id', v_batch.id, 'quantity', v_deduct_qty,
      'unit_cost', COALESCE(v_batch.unit_cost, 0),
      'subtotal', v_deduct_qty * COALESCE(v_batch.unit_cost, 0)
    );
    BEGIN
      INSERT INTO inventory_batch_consumptions (batch_id, quantity_consumed, consumed_at, reference_id, reference_type, unit_cost, total_cost)
      VALUES (v_batch.id, v_deduct_qty, NOW(), p_reference_id, p_reference_type, COALESCE(v_batch.unit_cost, 0), v_deduct_qty * COALESCE(v_batch.unit_cost, 0));
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
    v_remaining := v_remaining - v_deduct_qty;
  END LOOP;

  -- FIX: Handle negative stock with fallback cost
  IF v_remaining > 0 THEN
    INSERT INTO inventory_batches (id, material_id, branch_id, initial_quantity, remaining_quantity, unit_cost, batch_date, notes, created_at, updated_at)
    VALUES (gen_random_uuid(), p_material_id, p_branch_id, 0, -v_remaining, v_fallback_cost, NOW(),
      format('Negative Stock fallback (cost: %s) for %s', v_fallback_cost, COALESCE(p_reference_id, 'production')), NOW(), NOW())
    RETURNING id INTO v_batch.id;
    
    v_total_cost := v_total_cost + (v_remaining * v_fallback_cost);
    v_consumed := v_consumed || jsonb_build_object(
      'batch_id', v_batch.id, 'quantity', v_remaining,
      'unit_cost', v_fallback_cost, 'subtotal', v_remaining * v_fallback_cost,
      'notes', 'negative_fallback_with_cost'
    );
    v_remaining := 0;
  END IF;

  v_details := format('FIFO consume: %s batches, total cost %s', jsonb_array_length(v_consumed), v_total_cost);
  IF p_notes IS NOT NULL THEN v_details := p_notes || ' (' || v_details || ')'; END IF;

  INSERT INTO material_stock_movements (material_id, material_name, type, reason, quantity, previous_stock, new_stock, reference_id, reference_type, notes, branch_id, created_at)
  VALUES (p_material_id, v_material_name, 'OUT',
    CASE WHEN p_reference_type = 'production' THEN 'PRODUCTION_CONSUMPTION' WHEN p_reference_type = 'spoilage' THEN 'PRODUCTION_ERROR' ELSE 'ADJUSTMENT' END,
    p_quantity, v_available_stock, v_available_stock - p_quantity, p_reference_id, p_reference_type, v_details, p_branch_id, NOW());

  UPDATE materials SET stock = GREATEST(0, stock - p_quantity), updated_at = NOW() WHERE id = p_material_id;

  RETURN QUERY SELECT TRUE, v_total_cost, v_consumed, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, SQLERRM::TEXT;
END;
$function$;

-- Verify
SELECT proname, pg_get_function_arguments(oid) FROM pg_proc 
WHERE proname IN ('consume_inventory_fifo', 'consume_material_fifo') AND pronamespace = 'public'::regnamespace;
