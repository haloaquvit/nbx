-- =====================================================
-- RPC Functions for table: inventory_batches
-- Generated: 2026-01-08T22:26:17.725Z
-- Total functions: 19
-- =====================================================

-- Function: calculate_fifo_cost
CREATE OR REPLACE FUNCTION public.calculate_fifo_cost(p_product_id uuid DEFAULT NULL::uuid, p_branch_id uuid DEFAULT NULL::uuid, p_quantity numeric DEFAULT 0, p_material_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(total_hpp numeric, batches_info jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  remaining_qty NUMERIC := p_quantity;
  batch_record RECORD;
  consume_qty NUMERIC;
  total_cost NUMERIC := 0;
  batch_list JSONB := '[]'::JSONB;
BEGIN
  IF p_product_id IS NULL AND p_material_id IS NULL THEN RETURN QUERY SELECT 0::NUMERIC, '[]'::JSONB; RETURN; END IF;
  FOR batch_record IN
    SELECT id, remaining_quantity, unit_cost FROM inventory_batches
    WHERE ((p_product_id IS NOT NULL AND product_id = p_product_id) OR (p_material_id IS NOT NULL AND material_id = p_material_id))
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND remaining_quantity > 0
    ORDER BY batch_date ASC, created_at ASC
  LOOP
    IF remaining_qty <= 0 THEN EXIT; END IF;
    consume_qty := LEAST(remaining_qty, batch_record.remaining_quantity);
    total_cost := total_cost + (consume_qty * COALESCE(batch_record.unit_cost, 0));
    batch_list := batch_list || jsonb_build_object('batch_id', batch_record.id, 'quantity', consume_qty, 'unit_cost', batch_record.unit_cost, 'subtotal', consume_qty * COALESCE(batch_record.unit_cost, 0));
    remaining_qty := remaining_qty - consume_qty;
  END LOOP;
  IF remaining_qty > 0 AND p_product_id IS NOT NULL THEN
    DECLARE fallback_cost NUMERIC := 0;
    BEGIN
      SELECT COALESCE(cost_price, base_price, 0) INTO fallback_cost FROM products WHERE id = p_product_id;
      IF fallback_cost > 0 THEN total_cost := total_cost + (fallback_cost * remaining_qty); batch_list := batch_list || jsonb_build_object('batch_id', 'fallback', 'cost', fallback_cost); END IF;
    END;
  END IF;
  RETURN QUERY SELECT total_cost, batch_list;
END;
$function$
;


-- Function: consume_inventory_fifo
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
BEGIN
  -- ==================== VALIDASI ====================

  -- Validasi branch_id WAJIB
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT;
    RETURN;
  END IF;

  IF p_product_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB,
      'Product ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_quantity <= 0 THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB,
      'Quantity must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get product name AND cost_price for fallback
  DECLARE v_fallback_cost NUMERIC := 0;
  BEGIN
    SELECT name, COALESCE(cost_price, base_price, 0) 
    INTO v_product_name, v_fallback_cost
    FROM products WHERE id = p_product_id;
  END;

  IF v_product_name IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB,
      'Product not found'::TEXT;
    RETURN;
  END IF;

  -- ==================== CEK STOK (MODIFIED: ALLOW NEGATIVE) ====================
  -- We still calculate available stock for logging/HPP purposes
  SELECT COALESCE(SUM(remaining_quantity), 0)
  INTO v_available_stock
  FROM inventory_batches
  WHERE product_id = p_product_id
    AND branch_id = p_branch_id      -- WAJIB filter branch
    AND remaining_quantity > 0;

  -- ==================== CONSUME FIFO ====================

  -- Loop through batches in FIFO order (oldest first)
  FOR v_batch IN
    SELECT id, remaining_quantity, unit_cost, batch_date, notes
    FROM inventory_batches
    WHERE product_id = p_product_id
      AND branch_id = p_branch_id    -- WAJIB filter branch
      AND remaining_quantity > 0
    ORDER BY batch_date ASC, created_at ASC
    FOR UPDATE                       -- Lock rows
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_deduct_qty := LEAST(v_batch.remaining_quantity, v_remaining);

    -- Update batch
    UPDATE inventory_batches
    SET remaining_quantity = remaining_quantity - v_deduct_qty,
        updated_at = NOW()
    WHERE id = v_batch.id;

    -- Calculate HPP
    v_total_hpp := v_total_hpp + (v_deduct_qty * COALESCE(v_batch.unit_cost, 0));

    -- Track consumed batches
    v_consumed := v_consumed || jsonb_build_object(
      'batch_id', v_batch.id,
      'quantity', v_deduct_qty,
      'unit_cost', COALESCE(v_batch.unit_cost, 0),
      'subtotal', v_deduct_qty * COALESCE(v_batch.unit_cost, 0)
    );

    v_remaining := v_remaining - v_deduct_qty;
  END LOOP;

  -- ==================== HANDLE DEFICIT (NEGATIVE STOCK) ====================
  -- If there is still quantity to consume, create a negative batch
  -- FIX: Use v_fallback_cost instead of 0!
  IF v_remaining > 0 THEN
    INSERT INTO inventory_batches (
      product_id,
      branch_id,
      initial_quantity,
      remaining_quantity,
      unit_cost,
      batch_date,
      notes
    ) VALUES (
      p_product_id,
      p_branch_id,
      0,
      -v_remaining, -- Negative stock
      v_fallback_cost,  -- FIX: Use fallback cost instead of 0
      NOW(),
      format('Negative Stock fallback for %s (cost: %s)', COALESCE(p_reference_id, 'sale'), v_fallback_cost)
    ) RETURNING id INTO v_batch.id;

    -- FIX: Add the cost to HPP
    v_total_hpp := v_total_hpp + (v_remaining * v_fallback_cost);

    v_consumed := v_consumed || jsonb_build_object(
      'batch_id', v_batch.id,
      'quantity', v_remaining,
      'unit_cost', v_fallback_cost,  -- FIX: Record actual cost
      'subtotal', v_remaining * v_fallback_cost,
      'notes', 'negative_fallback_with_cost'
    );
    
    v_remaining := 0;
  END IF;

  -- ==================== LOGGING ====================

  -- Log consumption untuk audit
  INSERT INTO product_stock_movements (
    product_id,
    branch_id,
    type,
    reason,
    quantity,
    reference_id,
    reference_type,
    notes,
    created_at
  ) VALUES (
    p_product_id,
    p_branch_id,
    'OUT',
    'delivery',
    p_quantity,
    p_reference_id,
    'fifo_consume',
    -- unit_cost REMOVED
    format('FIFO consume: %s batches, HPP %s', jsonb_array_length(v_consumed), v_total_hpp),
    NOW()
  );

  RETURN QUERY SELECT TRUE, v_total_hpp, v_consumed, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, SQLERRM::TEXT;
END;
$function$
;


-- Function: consume_inventory_fifo_v3
CREATE OR REPLACE FUNCTION public.consume_inventory_fifo_v3(p_product_id uuid, p_branch_id uuid, p_quantity numeric, p_reference_id text DEFAULT NULL::text)
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
BEGIN
  -- ==================== VALIDASI ====================

  -- Validasi branch_id WAJIB
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT;
    RETURN;
  END IF;

  IF p_product_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB,
      'Product ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_quantity <= 0 THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB,
      'Quantity must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get product name untuk logging
  SELECT name INTO v_product_name
  FROM products WHERE id = p_product_id;

  IF v_product_name IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB,
      'Product not found'::TEXT;
    RETURN;
  END IF;

  -- ==================== CEK STOK (MODIFIED: ALLOW NEGATIVE) ====================
  -- We still calculate available stock for logging/HPP purposes
  SELECT COALESCE(SUM(remaining_quantity), 0)
  INTO v_available_stock
  FROM inventory_batches
  WHERE product_id = p_product_id
    AND branch_id = p_branch_id      -- WAJIB filter branch
    AND remaining_quantity > 0;

  -- ==================== CONSUME FIFO ====================

  -- Loop through batches in FIFO order (oldest first)
  FOR v_batch IN
    SELECT id, remaining_quantity, unit_cost, batch_date, notes
    FROM inventory_batches
    WHERE product_id = p_product_id
      AND branch_id = p_branch_id    -- WAJIB filter branch
      AND remaining_quantity > 0
    ORDER BY batch_date ASC, created_at ASC
    FOR UPDATE                       -- Lock rows
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_deduct_qty := LEAST(v_batch.remaining_quantity, v_remaining);

    -- Update batch
    UPDATE inventory_batches
    SET remaining_quantity = remaining_quantity - v_deduct_qty,
        updated_at = NOW()
    WHERE id = v_batch.id;

    -- Calculate HPP
    v_total_hpp := v_total_hpp + (v_deduct_qty * COALESCE(v_batch.unit_cost, 0));

    -- Track consumed batches
    v_consumed := v_consumed || jsonb_build_object(
      'batch_id', v_batch.id,
      'quantity', v_deduct_qty,
      'unit_cost', COALESCE(v_batch.unit_cost, 0),
      'subtotal', v_deduct_qty * COALESCE(v_batch.unit_cost, 0)
    );

    v_remaining := v_remaining - v_deduct_qty;
  END LOOP;

  -- ==================== HANDLE DEFICIT (NEGATIVE STOCK) ====================
  -- If there is still quantity to consume, create a negative batch
  IF v_remaining > 0 THEN
    INSERT INTO inventory_batches (
      product_id,
      branch_id,
      initial_quantity,
      remaining_quantity,
      unit_cost,
      batch_date,
      notes
    ) VALUES (
      p_product_id,
      p_branch_id,
      0,
      -v_remaining, -- Negative stock
      0,            -- Cost unknown for negative stock
      NOW(),
      format('Negative Stock fallback for %s', COALESCE(p_reference_id, 'sale'))
    ) RETURNING id INTO v_batch.id;

    v_consumed := v_consumed || jsonb_build_object(
      'batch_id', v_batch.id,
      'quantity', v_remaining,
      'unit_cost', 0,
      'subtotal', 0,
      'notes', 'negative_fallback'
    );
    
    v_remaining := 0;
  END IF;

  -- ==================== LOGGING ====================

  -- Log consumption untuk audit
  INSERT INTO product_stock_movements (
    product_id,
    branch_id,
    type,
    reason,
    quantity,
    reference_id,
    reference_type,
    notes,
    created_at
  ) VALUES (
    p_product_id,
    p_branch_id,
    'OUT',
    'delivery',
    p_quantity,
    p_reference_id,
    'fifo_consume',
    -- unit_cost REMOVED
    format('FIFO consume: %s batches, HPP %s', jsonb_array_length(v_consumed), v_total_hpp),
    NOW()
  );

  RETURN QUERY SELECT TRUE, v_total_hpp, v_consumed, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, SQLERRM::TEXT;
END;
$function$
;


-- Function: consume_material_fifo
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
BEGIN
  -- ==================== VALIDASI ====================

  -- Validasi branch_id WAJIB
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT;
    RETURN;
  END IF;

  IF p_material_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB,
      'Material ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_quantity <= 0 THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB,
      'Quantity must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get material name AND price_per_unit for fallback
  DECLARE v_fallback_cost NUMERIC := 0;
  BEGIN
    SELECT name, COALESCE(price_per_unit, 0) 
    INTO v_material_name, v_fallback_cost
    FROM materials WHERE id = p_material_id;
  END;

  IF v_material_name IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB,
      'Material not found'::TEXT;
    RETURN;
  END IF;

  -- ==================== CEK STOK ====================

  -- Cek available stock HANYA di branch ini
  -- Material bisa menggunakan inventory_batches dengan material_id
  SELECT COALESCE(SUM(remaining_quantity), 0)
  INTO v_available_stock
  FROM inventory_batches
  WHERE material_id = p_material_id
    AND (branch_id = p_branch_id OR branch_id IS NULL)  -- Support legacy data tanpa branch
    AND remaining_quantity > 0;

  -- Cek available stock (removed strict check to allow negative stock)
  -- We still calculate available stock for logging, but we don't block.
  IF v_available_stock < p_quantity THEN
     -- Check if we should warn? For now, we proceed to create negative stock.
     -- Just a log or simple note could be useful, but we proceed.
  END IF;

  -- ==================== CONSUME FIFO ====================

  -- Loop through batches in FIFO order (oldest first)
  FOR v_batch IN
    SELECT id, remaining_quantity, unit_cost, batch_date, notes
    FROM inventory_batches
    WHERE material_id = p_material_id
      AND (branch_id = p_branch_id OR branch_id IS NULL)
      AND remaining_quantity > 0
    ORDER BY batch_date ASC, created_at ASC
    FOR UPDATE                       -- Lock rows
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_deduct_qty := LEAST(v_batch.remaining_quantity, v_remaining);

    -- Update batch
    UPDATE inventory_batches
    SET remaining_quantity = remaining_quantity - v_deduct_qty,
        updated_at = NOW()
    WHERE id = v_batch.id;

    -- Calculate cost
    v_total_cost := v_total_cost + (v_deduct_qty * COALESCE(v_batch.unit_cost, 0));

    -- Track consumed batches
    v_consumed := v_consumed || jsonb_build_object(
      'batch_id', v_batch.id,
      'quantity', v_deduct_qty,
      'unit_cost', COALESCE(v_batch.unit_cost, 0),
      'subtotal', v_deduct_qty * COALESCE(v_batch.unit_cost, 0)
    );

    -- Log to inventory_batch_consumptions if table exists
    BEGIN
      INSERT INTO inventory_batch_consumptions (
        batch_id,
        quantity_consumed,
        consumed_at,
        reference_id,
        reference_type,
        unit_cost,
        total_cost
      ) VALUES (
        v_batch.id,
        v_deduct_qty,
        NOW(),
        p_reference_id,
        p_reference_type,
        COALESCE(v_batch.unit_cost, 0),
        v_deduct_qty * COALESCE(v_batch.unit_cost, 0)
      );
    EXCEPTION WHEN undefined_table THEN
      -- Table doesn't exist, skip
      NULL;
    END;

    v_remaining := v_remaining - v_deduct_qty;
  END LOOP;

  -- ==================== HANDLE DEFICIT (NEGATIVE STOCK) ====================
  -- FIX: Use v_fallback_cost instead of 0!
  IF v_remaining > 0 THEN
    INSERT INTO inventory_batches (
      id, -- Generate ID explicitly or let default handle it? Schema usually has default. But let's check inserts below.
      material_id, -- Note: This table holds both product/material batches usually, or material has its own? 
      -- Code above selects from inventory_batches where material_id = p_material_id. So it is the same table.
      branch_id,
      initial_quantity,
      remaining_quantity,
      unit_cost,
      batch_date,
      notes,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      p_material_id,
      p_branch_id,
      0,
      -v_remaining, -- Negative stock
      v_fallback_cost,  -- FIX: Use fallback cost instead of 0
      NOW(),
      format('Negative Stock fallback for %s (cost: %s)', COALESCE(p_reference_id, 'production'), v_fallback_cost),
      NOW(),
      NOW()
    ) RETURNING id INTO v_batch.id;

    -- FIX: Add the cost to total
    v_total_cost := v_total_cost + (v_remaining * v_fallback_cost);

    v_consumed := v_consumed || jsonb_build_object(
      'batch_id', v_batch.id,
      'quantity', v_remaining,
      'unit_cost', v_fallback_cost,  -- FIX: Record actual cost
      'subtotal', v_remaining * v_fallback_cost,
      'notes', 'negative_fallback_with_cost'
    );
    
    -- Log consumption for this negative part if needed
    -- For now, we trust the final log.
    
    v_remaining := 0;
  END IF;

  -- ==================== LOGGING ====================

  v_details := format('FIFO consume: %s batches, total cost %s', jsonb_array_length(v_consumed), v_total_cost);
  IF p_notes IS NOT NULL THEN
     v_details := p_notes || ' (' || v_details || ')';
  END IF;

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
    branch_id,
    created_at
  ) VALUES (
    p_material_id,
    v_material_name,
    'OUT',
    CASE
      WHEN p_reference_type = 'production' THEN 'PRODUCTION_CONSUMPTION'
      WHEN p_reference_type = 'spoilage' THEN 'PRODUCTION_ERROR' -- Fixed: Spoilage maps to PRODUCTION_ERROR (valid constraint)
      ELSE 'ADJUSTMENT'
    END,
    p_quantity,
    v_available_stock,
    v_available_stock - p_quantity,
    p_reference_id,
    p_reference_type,
    v_details,
    p_branch_id,
    NOW()
  );

  -- Update legacy stock column in materials table
  UPDATE materials 
  SET stock = GREATEST(0, stock - p_quantity),
      updated_at = NOW()
  WHERE id = p_material_id;

  RETURN QUERY SELECT TRUE, v_total_cost, v_consumed, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, SQLERRM::TEXT;
END;
$function$
;


-- Function: consume_material_fifo_v2
CREATE OR REPLACE FUNCTION public.consume_material_fifo_v2(p_material_id uuid, p_quantity numeric, p_reference_id text, p_reference_type text, p_branch_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid, p_user_name text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, total_cost numeric, quantity_consumed numeric, batches_consumed jsonb, error_message text)
 LANGUAGE plpgsql
AS $function$
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
      unit_cost_at_consumption
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
$function$
;


-- Function: consume_stock_fifo_v2
CREATE OR REPLACE FUNCTION public.consume_stock_fifo_v2(p_product_id uuid, p_quantity numeric, p_reference_id text, p_reference_type text, p_branch_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(success boolean, total_hpp numeric, batches_consumed jsonb, remaining_to_consume numeric, error_message text)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_batch RECORD;
  v_remaining NUMERIC := p_quantity;
  v_total_hpp NUMERIC := 0;
  v_consumed JSONB := '[]'::JSONB;
  v_deduct_qty NUMERIC;
  v_available_stock NUMERIC;
BEGIN
  IF p_product_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, p_quantity, 'Product ID is required'::TEXT;
    RETURN;
  END IF;
  IF p_quantity <= 0 THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, 0::NUMERIC, 'Quantity must be positive'::TEXT;
    RETURN;
  END IF;
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
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_deduct_qty := LEAST(v_batch.remaining_quantity, v_remaining);
    UPDATE inventory_batches
    SET
      remaining_quantity = remaining_quantity - v_deduct_qty,
      updated_at = NOW()
    WHERE id = v_batch.id;
    v_total_hpp := v_total_hpp + (v_deduct_qty * COALESCE(v_batch.unit_cost, 0));
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
  ) ON CONFLICT DO NOTHING;
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
$function$
;


-- Function: delete_po_atomic
CREATE OR REPLACE FUNCTION public.delete_po_atomic(p_po_id text, p_branch_id uuid, p_skip_validation boolean DEFAULT false)
 RETURNS TABLE(success boolean, batches_deleted integer, stock_rolled_back integer, journals_voided integer, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_po RECORD;
  v_batch RECORD;
  v_batches_deleted INTEGER := 0;
  v_stock_rolled_back INTEGER := 0;
  v_journals_voided INTEGER := 0;
  v_current_stock NUMERIC;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0, 0,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT;
    RETURN;
  END IF;

  IF p_po_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0, 0,
      'Purchase Order ID is required'::TEXT;
    RETURN;
  END IF;

  -- Get PO info
  SELECT id, status INTO v_po
  FROM purchase_orders
  WHERE id = p_po_id AND branch_id = p_branch_id;

  IF v_po.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0, 0,
      'Purchase Order not found in this branch'::TEXT;
    RETURN;
  END IF;

  -- ==================== CHECK IF BATCHES USED ====================
  IF NOT p_skip_validation THEN
    -- Check if any batch has been used (remaining < initial)
    IF EXISTS (
      SELECT 1 FROM inventory_batches
      WHERE purchase_order_id = p_po_id
        AND remaining_quantity < initial_quantity
    ) THEN
      RETURN QUERY SELECT FALSE, 0, 0, 0,
        'Tidak dapat menghapus PO karena batch inventory sudah terpakai (FIFO)'::TEXT;
      RETURN;
    END IF;

    -- Check if any payable has been paid
    IF EXISTS (
      SELECT 1 FROM accounts_payable
      WHERE purchase_order_id = p_po_id
        AND paid_amount > 0
    ) THEN
      RETURN QUERY SELECT FALSE, 0, 0, 0,
        'Tidak dapat menghapus PO karena hutang sudah ada pembayaran'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- ==================== VOID JOURNALS ====================

  UPDATE journal_entries
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_reason = format('PO %s dihapus', p_po_id),
    updated_at = NOW()
  WHERE reference_id = p_po_id
    AND branch_id = p_branch_id
    AND is_voided = FALSE;

  GET DIAGNOSTICS v_journals_voided = ROW_COUNT;

  -- ==================== ROLLBACK STOCK FROM BATCHES ====================

  FOR v_batch IN
    SELECT id, material_id, product_id, remaining_quantity
    FROM inventory_batches
    WHERE purchase_order_id = p_po_id
  LOOP
    -- Rollback material stock
    IF v_batch.material_id IS NOT NULL THEN
      SELECT stock INTO v_current_stock
      FROM materials
      WHERE id = v_batch.material_id;

      UPDATE materials
      SET stock = GREATEST(0, COALESCE(v_current_stock, 0) - v_batch.remaining_quantity),
          updated_at = NOW()
      WHERE id = v_batch.material_id;

      v_stock_rolled_back := v_stock_rolled_back + 1;
    END IF;

    -- products.current_stock is DEPRECATED - deleting batch auto-updates via VIEW
    IF v_batch.product_id IS NOT NULL THEN
      v_stock_rolled_back := v_stock_rolled_back + 1;
    END IF;

    v_batches_deleted := v_batches_deleted + 1;
  END LOOP;

  -- ==================== DELETE RELATED RECORDS ====================

  -- Delete inventory batches
  DELETE FROM inventory_batches WHERE purchase_order_id = p_po_id;

  -- Delete material movements
  DELETE FROM material_stock_movements
  WHERE reference_id = p_po_id
    AND reference_type = 'purchase_order';

  -- Delete accounts payable
  DELETE FROM accounts_payable WHERE purchase_order_id = p_po_id;

  -- Delete PO items
  DELETE FROM purchase_order_items WHERE purchase_order_id = p_po_id;

  -- Delete PO
  DELETE FROM purchase_orders WHERE id = p_po_id;

  RETURN QUERY SELECT
    TRUE,
    v_batches_deleted,
    v_stock_rolled_back,
    v_journals_voided,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0, 0, 0, SQLERRM::TEXT;
END;
$function$
;


-- Function: get_material_fifo_cost
CREATE OR REPLACE FUNCTION public.get_material_fifo_cost(p_material_id uuid, p_branch_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_oldest_cost numeric;
BEGIN
    -- Get cost from oldest batch with remaining stock (FIFO)
    SELECT unit_cost INTO v_oldest_cost
    FROM public.inventory_batches
    WHERE material_id = p_material_id
      AND (branch_id = p_branch_id OR branch_id IS NULL)
      AND remaining_quantity > 0
    ORDER BY batch_date ASC
    LIMIT 1;
    -- Fallback to material's cost_price if no batches
    IF v_oldest_cost IS NULL THEN
        SELECT cost_price INTO v_oldest_cost
        FROM public.materials
        WHERE id = p_material_id;
    END IF;
    RETURN COALESCE(v_oldest_cost, 0);
END;
$function$
;


-- Function: get_material_stock
CREATE OR REPLACE FUNCTION public.get_material_stock(p_material_id uuid, p_branch_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  IF p_branch_id IS NULL THEN
    RAISE EXCEPTION 'Branch ID is REQUIRED';
  END IF;

  RETURN COALESCE(
    (SELECT SUM(remaining_quantity)
      FROM inventory_batches
      WHERE material_id = p_material_id
        AND (branch_id = p_branch_id OR branch_id IS NULL)
        AND remaining_quantity > 0),
    0
  );
END;
$function$
;


-- Function: get_product_fifo_cost
CREATE OR REPLACE FUNCTION public.get_product_fifo_cost(p_product_id uuid, p_branch_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_oldest_cost numeric;
BEGIN
    -- Get cost from oldest batch with remaining stock (FIFO)
    SELECT unit_cost INTO v_oldest_cost
    FROM public.inventory_batches
    WHERE product_id = p_product_id
      AND (branch_id = p_branch_id OR branch_id IS NULL)
      AND remaining_quantity > 0
    ORDER BY batch_date ASC
    LIMIT 1;
    -- Fallback to product's cost_price if no batches
    IF v_oldest_cost IS NULL THEN
        SELECT cost_price INTO v_oldest_cost
        FROM public.products
        WHERE id = p_product_id;
    END IF;
    RETURN COALESCE(v_oldest_cost, 0);
END;
$function$
;


-- Function: get_product_stock
CREATE OR REPLACE FUNCTION public.get_product_stock(p_product_id uuid, p_branch_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  IF p_branch_id IS NULL THEN
    RAISE EXCEPTION 'Branch ID is REQUIRED';
  END IF;

  RETURN COALESCE(
    (SELECT SUM(remaining_quantity)
     FROM inventory_batches
     WHERE product_id = p_product_id
       AND branch_id = p_branch_id
       AND remaining_quantity > 0),
    0
  );
END;
$function$
;


-- Function: get_product_weighted_avg_cost
CREATE OR REPLACE FUNCTION public.get_product_weighted_avg_cost(p_product_id uuid, p_branch_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_avg_cost numeric;
BEGIN
    SELECT CASE WHEN SUM(remaining_quantity) > 0 THEN SUM(remaining_quantity * unit_cost) / SUM(remaining_quantity) ELSE NULL END INTO v_avg_cost
    FROM public.inventory_batches
    WHERE product_id = p_product_id
      AND (branch_id = p_branch_id OR branch_id IS NULL)
      AND remaining_quantity > 0;
    IF v_avg_cost IS NULL THEN
        SELECT cost_price INTO v_avg_cost FROM public.products WHERE id = p_product_id;
    END IF;
    RETURN COALESCE(v_avg_cost, 0);
END;
$function$
;


-- Function: migrate_material_stock_to_batches
CREATE OR REPLACE FUNCTION public.migrate_material_stock_to_batches()
 RETURNS TABLE(material_id uuid, material_name text, migrated_quantity numeric, batch_id uuid)
 LANGUAGE plpgsql
AS $function$
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
$function$
;


-- Function: receive_po_atomic
CREATE OR REPLACE FUNCTION public.receive_po_atomic(p_po_id text, p_branch_id uuid, p_received_date date DEFAULT CURRENT_DATE, p_user_id uuid DEFAULT NULL::uuid, p_user_name text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, materials_received integer, products_received integer, batches_created integer, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_po RECORD;
  v_item RECORD;
  v_material RECORD;
  v_materials_received INTEGER := 0;
  v_products_received INTEGER := 0;
  v_batches_created INTEGER := 0;
  v_previous_stock NUMERIC;
  v_new_stock NUMERIC;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0, 0,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT;
    RETURN;
  END IF;

  IF p_po_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0, 0,
      'Purchase Order ID is required'::TEXT;
    RETURN;
  END IF;

  -- Get PO info
  SELECT
    po.id,
    po.status,
    po.supplier_id,
    po.supplier_name,
    po.material_id,
    po.material_name,
    po.quantity,
    po.unit_price,
    po.branch_id
  INTO v_po
  FROM purchase_orders po
  WHERE po.id = p_po_id AND po.branch_id = p_branch_id;

  IF v_po.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0, 0,
      'Purchase Order not found in this branch'::TEXT;
    RETURN;
  END IF;

  IF v_po.status = 'Diterima' THEN
    RETURN QUERY SELECT FALSE, 0, 0, 0,
      'Purchase Order sudah diterima sebelumnya'::TEXT;
    RETURN;
  END IF;

  IF v_po.status NOT IN ('Approved', 'Pending') THEN
    RETURN QUERY SELECT FALSE, 0, 0, 0,
      format('Status PO harus Approved atau Pending, status saat ini: %s', v_po.status)::TEXT;
    RETURN;
  END IF;

  -- ==================== PROCESS MULTI-ITEM PO ====================

  FOR v_item IN
    SELECT
      poi.id,
      poi.material_id,
      poi.product_id,
      poi.item_type,
      poi.quantity,
      poi.unit_price,
      poi.unit,
      poi.material_name,
      poi.product_name,
      m.name as material_name_from_rel,
      m.stock as material_current_stock,
      p.name as product_name_from_rel
    FROM purchase_order_items poi
    LEFT JOIN materials m ON m.id = poi.material_id
    LEFT JOIN products p ON p.id = poi.product_id
    WHERE poi.purchase_order_id = p_po_id
  LOOP
    IF v_item.material_id IS NOT NULL THEN
      -- ==================== PROCESS MATERIAL ====================
      v_previous_stock := COALESCE(v_item.material_current_stock, 0);
      v_new_stock := v_previous_stock + v_item.quantity;

      -- Update material stock
      UPDATE materials
      SET stock = v_new_stock,
          updated_at = NOW()
      WHERE id = v_item.material_id;

      -- Create material movement record
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
        user_id,
        user_name,
        branch_id,
        created_at
      ) VALUES (
        v_item.material_id,
        COALESCE(v_item.material_name_from_rel, v_item.material_name, 'Unknown'),
        'IN',
        'PURCHASE',
        v_item.quantity,
        v_previous_stock,
        v_new_stock,
        p_po_id,
        'purchase_order',
        format('PO %s - Stock received', p_po_id),
        p_user_id,
        p_user_name,
        p_branch_id,
        NOW()
      );

      -- Create inventory batch for FIFO tracking
      INSERT INTO inventory_batches (
        material_id,
        branch_id,
        purchase_order_id,
        supplier_id,
        initial_quantity,
        remaining_quantity,
        unit_cost,
        batch_date,
        notes,
        created_at
      ) VALUES (
        v_item.material_id,
        p_branch_id,
        p_po_id,
        v_po.supplier_id,
        v_item.quantity,
        v_item.quantity,
        COALESCE(v_item.unit_price, 0),
        p_received_date,
        format('PO %s - %s', p_po_id, COALESCE(v_item.material_name_from_rel, v_item.material_name, 'Unknown')),
        NOW()
      );

      v_materials_received := v_materials_received + 1;
      v_batches_created := v_batches_created + 1;

    ELSIF v_item.product_id IS NOT NULL THEN
      -- ==================== PROCESS PRODUCT ====================
      -- products.current_stock is DEPRECATED - stock derived from inventory_batches
      -- Only create inventory_batches, stock will be calculated via v_product_current_stock VIEW

      -- Create inventory batch for FIFO tracking - this IS the stock
      INSERT INTO inventory_batches (
        product_id,
        branch_id,
        purchase_order_id,
        supplier_id,
        initial_quantity,
        remaining_quantity,
        unit_cost,
        batch_date,
        notes,
        created_at
      ) VALUES (
        v_item.product_id,
        p_branch_id,
        p_po_id,
        v_po.supplier_id,
        v_item.quantity,
        v_item.quantity,
        COALESCE(v_item.unit_price, 0),
        p_received_date,
        format('PO %s - %s', p_po_id, COALESCE(v_item.product_name_from_rel, v_item.product_name, 'Unknown')),
        NOW()
      );

      v_products_received := v_products_received + 1;
      v_batches_created := v_batches_created + 1;
    END IF;
  END LOOP;

  -- ==================== PROCESS LEGACY SINGLE-ITEM PO ====================
  -- For backward compatibility with old PO format (material_id on PO table)

  IF v_materials_received = 0 AND v_products_received = 0 AND v_po.material_id IS NOT NULL THEN
    -- Get current material stock
    SELECT stock INTO v_previous_stock
    FROM materials
    WHERE id = v_po.material_id;

    v_previous_stock := COALESCE(v_previous_stock, 0);
    v_new_stock := v_previous_stock + v_po.quantity;

    -- Update material stock
    UPDATE materials
    SET stock = v_new_stock,
        updated_at = NOW()
    WHERE id = v_po.material_id;

    -- Create material movement record
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
      user_id,
      user_name,
      branch_id,
      created_at
    ) VALUES (
      v_po.material_id,
      v_po.material_name,
      'IN',
      'PURCHASE',
      v_po.quantity,
      v_previous_stock,
      v_new_stock,
      p_po_id,
      'purchase_order',
      format('PO %s - Stock received (legacy)', p_po_id),
      p_user_id,
      p_user_name,
      p_branch_id,
      NOW()
    );

    -- Create inventory batch
    INSERT INTO inventory_batches (
      material_id,
      branch_id,
      purchase_order_id,
      supplier_id,
      initial_quantity,
      remaining_quantity,
      unit_cost,
      batch_date,
      notes,
      created_at
    ) VALUES (
      v_po.material_id,
      p_branch_id,
      p_po_id,
      v_po.supplier_id,
      v_po.quantity,
      v_po.quantity,
      COALESCE(v_po.unit_price, 0),
      p_received_date,
      format('PO %s - %s (legacy)', p_po_id, v_po.material_name),
      NOW()
    );

    v_materials_received := 1;
    v_batches_created := 1;
  END IF;

  -- ==================== UPDATE PO STATUS ====================

  UPDATE purchase_orders
  SET
    status = 'Diterima',
    received_date = p_received_date,
    updated_at = NOW()
  WHERE id = p_po_id;

  RETURN QUERY SELECT
    TRUE,
    v_materials_received,
    v_products_received,
    v_batches_created,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0, 0, 0, SQLERRM::TEXT;
END;
$function$
;


-- Function: restore_inventory_fifo
CREATE OR REPLACE FUNCTION public.restore_inventory_fifo(p_product_id uuid, p_branch_id uuid, p_quantity numeric, p_unit_cost numeric DEFAULT 0, p_reference_id text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, batch_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_new_batch_id UUID;
  v_product_name TEXT;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT;
    RETURN;
  END IF;

  IF p_product_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Product ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_quantity <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Quantity must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get product name
  SELECT name INTO v_product_name
  FROM products WHERE id = p_product_id;

  IF v_product_name IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Product not found'::TEXT;
    RETURN;
  END IF;

  -- ==================== CREATE BATCH ====================

  INSERT INTO inventory_batches (
    product_id,
    branch_id,
    initial_quantity,
    remaining_quantity,
    unit_cost,
    batch_date,
    notes
  ) VALUES (
    p_product_id,
    p_branch_id,
    p_quantity,
    p_quantity,
    COALESCE(p_unit_cost, 0),
    NOW(),
    format('Restored: %s', COALESCE(p_reference_id, 'manual'))
  )
  RETURNING id INTO v_new_batch_id;

  -- ==================== LOGGING ====================

  INSERT INTO product_stock_movements (
    product_id,
    branch_id,
    type,
    quantity,
    reference_id,
    reference_type,
    unit_cost,
    notes,
    created_at
  ) VALUES (
    p_product_id,
    p_branch_id,
    'IN',
    p_quantity,
    p_reference_id,
    'fifo_restore',
    p_unit_cost,
    format('FIFO restore: batch %s', v_new_batch_id),
    NOW()
  );

  RETURN QUERY SELECT TRUE, v_new_batch_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$function$
;


-- Function: restore_material_fifo_v2
CREATE OR REPLACE FUNCTION public.restore_material_fifo_v2(p_material_id uuid, p_quantity numeric, p_unit_cost numeric, p_reference_id text, p_reference_type text, p_branch_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid, p_user_name text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, batch_id uuid, total_restored numeric, error_message text)
 LANGUAGE plpgsql
AS $function$
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
$function$
;


-- Function: restore_stock_fifo_v2
CREATE OR REPLACE FUNCTION public.restore_stock_fifo_v2(p_product_id uuid, p_quantity numeric, p_reference_id text, p_reference_type text, p_branch_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(success boolean, total_restored numeric, batches_restored jsonb, error_message text)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_batch RECORD;
  v_remaining NUMERIC := p_quantity;
  v_restored JSONB := '[]'::JSONB;
  v_restore_qty NUMERIC;
  v_space_in_batch NUMERIC;
  v_consumption RECORD;
BEGIN
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
    FOR v_batch IN
      SELECT
        (elem->>'batch_id')::UUID as batch_id,
        (elem->>'quantity')::NUMERIC as quantity
      FROM jsonb_array_elements(v_consumption.batches_detail) as elem
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_restore_qty := LEAST(v_batch.quantity, v_remaining);
      UPDATE inventory_batches
      SET remaining_quantity = remaining_quantity + v_restore_qty, updated_at = NOW()
      WHERE id = v_batch.batch_id;
      v_restored := v_restored || jsonb_build_object('batch_id', v_batch.batch_id, 'quantity', v_restore_qty, 'method', 'original_batch');
      v_remaining := v_remaining - v_restore_qty;
    END LOOP;
    UPDATE inventory_batch_consumptions
    SET batches_detail = batches_detail || jsonb_build_object('restored_at', NOW())
    WHERE id = v_consumption.id;
  ELSE
    FOR v_batch IN
      SELECT id, initial_quantity, remaining_quantity
      FROM inventory_batches
      WHERE product_id = p_product_id
        AND (p_branch_id IS NULL OR branch_id = p_branch_id)
        AND remaining_quantity < initial_quantity
      ORDER BY batch_date ASC, created_at ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_space_in_batch := v_batch.initial_quantity - v_batch.remaining_quantity;
      v_restore_qty := LEAST(v_space_in_batch, v_remaining);
      IF v_restore_qty > 0 THEN
        UPDATE inventory_batches
        SET remaining_quantity = remaining_quantity + v_restore_qty, updated_at = NOW()
        WHERE id = v_batch.id;
        v_restored := v_restored || jsonb_build_object('batch_id', v_batch.id, 'quantity', v_restore_qty, 'method', 'available_space');
        v_remaining := v_remaining - v_restore_qty;
      END IF;
    END LOOP;
    IF v_remaining > 0 THEN
      INSERT INTO inventory_batches (product_id, branch_id, batch_date, initial_quantity, remaining_quantity, unit_cost, notes, created_at, updated_at)
      SELECT p_product_id, p_branch_id, NOW(), v_remaining, v_remaining,
        COALESCE((SELECT unit_cost FROM inventory_batches WHERE product_id = p_product_id ORDER BY batch_date DESC LIMIT 1),
                 (SELECT cost_price FROM products WHERE id = p_product_id), 0),
        format('Stock restored from cancelled %s: %s', p_reference_type, p_reference_id), NOW(), NOW()
      RETURNING id INTO v_batch;
      v_restored := v_restored || jsonb_build_object('batch_id', v_batch.id, 'quantity', v_remaining, 'method', 'new_batch');
      v_remaining := 0;
    END IF;
  END IF;
  UPDATE products
  SET current_stock = current_stock + (p_quantity - v_remaining), updated_at = NOW()
  WHERE id = p_product_id;
  RETURN QUERY SELECT TRUE, p_quantity - v_remaining, v_restored, NULL::TEXT;
END;
$function$
;


-- Function: sync_material_initial_stock_atomic
CREATE OR REPLACE FUNCTION public.sync_material_initial_stock_atomic(p_material_id uuid, p_branch_id uuid, p_new_initial_stock numeric, p_unit_cost numeric DEFAULT 0)
 RETURNS TABLE(success boolean, batch_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_batch_id UUID;
  v_old_initial NUMERIC;
  v_qty_diff NUMERIC;
BEGIN
  -- ==================== VALIDASI ====================
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is REQUIRED'::TEXT;
    RETURN;
  END IF;

  -- Cari batch "Stok Awal" yang ada
  SELECT id, initial_quantity INTO v_batch_id, v_old_initial
  FROM inventory_batches
  WHERE material_id = p_material_id AND branch_id = p_branch_id AND notes = 'Stok Awal'
  LIMIT 1;

  IF v_batch_id IS NOT NULL THEN
    v_qty_diff := p_new_initial_stock - v_old_initial;
    
    UPDATE inventory_batches
    SET initial_quantity = p_new_initial_stock,
        remaining_quantity = GREATEST(0, remaining_quantity + v_qty_diff),
        unit_cost = p_unit_cost,
        updated_at = NOW()
    WHERE id = v_batch_id;
  ELSE
    INSERT INTO inventory_batches (
      material_id, 
      branch_id, 
      initial_quantity, 
      remaining_quantity, 
      unit_cost, 
      notes, 
      batch_date
    ) VALUES (
      p_material_id, 
      p_branch_id, 
      p_new_initial_stock, 
      p_new_initial_stock, 
      p_unit_cost, 
      'Stok Awal', 
      NOW()
    ) RETURNING id INTO v_batch_id;
  END IF;

  RETURN QUERY SELECT TRUE, v_batch_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$function$
;


-- Function: sync_product_initial_stock_atomic
CREATE OR REPLACE FUNCTION public.sync_product_initial_stock_atomic(p_product_id uuid, p_branch_id uuid, p_new_initial_stock numeric, p_unit_cost numeric DEFAULT 0)
 RETURNS TABLE(success boolean, batch_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_batch_id UUID;
  v_old_initial NUMERIC;
  v_qty_diff NUMERIC;
BEGIN
  -- ==================== VALIDASI ====================
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is REQUIRED'::TEXT;
    RETURN;
  END IF;

  -- Cari batch "Stok Awal" yang ada
  SELECT id, initial_quantity INTO v_batch_id, v_old_initial
  FROM inventory_batches
  WHERE product_id = p_product_id AND branch_id = p_branch_id AND notes = 'Stok Awal'
  LIMIT 1;

  IF v_batch_id IS NOT NULL THEN
    v_qty_diff := p_new_initial_stock - v_old_initial;
    
    UPDATE inventory_batches
    SET initial_quantity = p_new_initial_stock,
        remaining_quantity = GREATEST(0, remaining_quantity + v_qty_diff),
        unit_cost = p_unit_cost,
        updated_at = NOW()
    WHERE id = v_batch_id;
  ELSE
    INSERT INTO inventory_batches (
      product_id, 
      branch_id, 
      initial_quantity, 
      remaining_quantity, 
      unit_cost, 
      notes, 
      batch_date
    ) VALUES (
      p_product_id, 
      p_branch_id, 
      p_new_initial_stock, 
      p_new_initial_stock, 
      p_unit_cost, 
      'Stok Awal', 
      NOW()
    ) RETURNING id INTO v_batch_id;
  END IF;

  RETURN QUERY SELECT TRUE, v_batch_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$function$
;


