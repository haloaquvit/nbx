-- ============================================================================
-- RPC 02: FIFO Material
-- Purpose: Atomic FIFO consume/restore untuk materials (bahan baku)
-- PENTING: Semua operasi WAJIB filter by branch_id
-- ============================================================================

-- Drop existing functions to handle signature changes
DROP FUNCTION IF EXISTS consume_material_fifo(UUID, UUID, NUMERIC, TEXT, TEXT);
DROP FUNCTION IF EXISTS consume_material_fifo(UUID, UUID, NUMERIC, TEXT, TEXT, TEXT); -- Drop new signature if exists
DROP FUNCTION IF EXISTS restore_material_fifo(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT);
DROP FUNCTION IF EXISTS add_material_batch(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT);

-- ============================================================================
-- 1. CONSUME MATERIAL FIFO
-- Mengkonsumsi stok material dengan metode FIFO
-- Returns: success, total_cost, batches_consumed, error_message
-- ============================================================================

CREATE OR REPLACE FUNCTION consume_material_fifo(
  p_material_id UUID,
  p_branch_id UUID,           -- WAJIB: identitas cabang
  p_quantity NUMERIC,
  p_reference_id TEXT DEFAULT NULL,
  p_reference_type TEXT DEFAULT 'production',
  p_notes TEXT DEFAULT NULL
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

  -- Get material name untuk logging
  SELECT name INTO v_material_name
  FROM materials WHERE id = p_material_id;

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
  -- If there is still quantity to consume, create a negative batch
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
      0,            -- Cost unknown for negative stock
      NOW(),
      format('Negative Stock fallback for %s', COALESCE(p_reference_id, 'production')),
      NOW(),
      NOW()
    ) RETURNING id INTO v_batch.id;

    v_consumed := v_consumed || jsonb_build_object(
      'batch_id', v_batch.id,
      'quantity', v_remaining,
      'unit_cost', 0,
      'subtotal', 0,
      'notes', 'negative_fallback'
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
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 2. RESTORE MATERIAL FIFO
-- Mengembalikan stok material (untuk void/cancel)
-- Creates new batch dengan cost yang diberikan
-- ============================================================================

CREATE OR REPLACE FUNCTION restore_material_fifo(
  p_material_id UUID,
  p_branch_id UUID,           -- WAJIB: identitas cabang
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
  v_material_name TEXT;
  v_current_stock NUMERIC;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT;
    RETURN;
  END IF;

  IF p_material_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Material ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_quantity <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Quantity must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get material name
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

  -- ==================== CREATE BATCH ====================

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
    format('Restored: %s - %s', p_reference_type, COALESCE(p_reference_id, 'manual'))
  )
  RETURNING id INTO v_new_batch_id;

  -- ==================== LOGGING ====================

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
    'IN',
    CASE
       WHEN p_reference_type = 'void_production' THEN 'PRODUCTION_DELETE_RESTORE'
       ELSE 'ADJUSTMENT'
    END, -- Might need check constraint update if we use other reasons
    p_quantity,
    v_current_stock,
    v_current_stock + p_quantity,
    p_reference_id,
    p_reference_type,
    format('FIFO restore: new batch %s', v_new_batch_id),
    p_branch_id,
    NOW()
  );

  -- Update legacy stock column in materials table
  UPDATE materials 
  SET stock = stock + p_quantity,
      updated_at = NOW()
  WHERE id = p_material_id;

  RETURN QUERY SELECT TRUE, v_new_batch_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 3. ADD MATERIAL BATCH
-- Menambah batch material baru (untuk pembelian)
-- ============================================================================

CREATE OR REPLACE FUNCTION add_material_batch(
  p_material_id UUID,
  p_branch_id UUID,           -- WAJIB: identitas cabang
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
  v_material_name TEXT;
  v_current_stock NUMERIC;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT;
    RETURN;
  END IF;

  IF p_material_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Material ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_quantity <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Quantity must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get material name
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

  -- ==================== CREATE BATCH ====================

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

  -- ==================== LOGGING ====================

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
    'IN',
    'PURCHASE',
    p_quantity,
    v_current_stock,
    v_current_stock + p_quantity,
    p_reference_id,
    'purchase',
    format('New batch %s: %s units @ %s', v_new_batch_id, p_quantity, p_unit_cost),
    p_branch_id,
    NOW()
  );

  -- Update legacy stock column in materials table
  UPDATE materials 
  SET stock = stock + p_quantity,
      updated_at = NOW()
  WHERE id = p_material_id;

  RETURN QUERY SELECT TRUE, v_new_batch_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 4. GET MATERIAL STOCK
-- Helper untuk mendapatkan stok material di branch tertentu
-- ============================================================================

CREATE OR REPLACE FUNCTION get_material_stock(
  p_material_id UUID,
  p_branch_id UUID
)
RETURNS NUMERIC AS $$
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
$$ LANGUAGE plpgsql STABLE;


-- ============================================================================
-- 5. SYNC MATERIAL INITIAL STOCK ATOMIC
-- Sinkronisasi stok awal material (batch khusus 'Stok Awal')
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_material_initial_stock_atomic(
  p_material_id UUID,
  p_branch_id UUID,
  p_new_initial_stock NUMERIC,
  p_unit_cost NUMERIC DEFAULT 0
)
RETURNS TABLE (
  success BOOLEAN,
  batch_id UUID,
  error_message TEXT
) AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION consume_material_fifo(UUID, UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION restore_material_fifo(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION add_material_batch(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_material_stock(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION sync_material_initial_stock_atomic(UUID, UUID, NUMERIC, NUMERIC) TO authenticated;
