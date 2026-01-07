-- ============================================================================
-- RPC 01: FIFO Inventory (Products)
-- Purpose: Atomic FIFO consume/restore untuk products
-- PENTING: Semua operasi WAJIB filter by branch_id
-- ============================================================================

-- Drop existing functions
DROP FUNCTION IF EXISTS consume_inventory_fifo(UUID, UUID, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS restore_inventory_fifo(UUID, UUID, NUMERIC, NUMERIC, TEXT);

-- ============================================================================
-- 1. CONSUME INVENTORY FIFO
-- Mengkonsumsi stok produk dengan metode FIFO (First In First Out)
-- Returns: success, total_hpp, batches_consumed, error_message
-- ============================================================================

CREATE OR REPLACE FUNCTION consume_inventory_fifo(
  p_product_id UUID,
  p_branch_id UUID,           -- WAJIB: identitas cabang
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
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 2. RESTORE INVENTORY FIFO
-- Mengembalikan stok produk (untuk void/cancel)
-- Creates new batch dengan cost yang diberikan
-- ============================================================================

CREATE OR REPLACE FUNCTION restore_inventory_fifo(
  p_product_id UUID,
  p_branch_id UUID,           -- WAJIB: identitas cabang
  p_quantity NUMERIC,
  p_unit_cost NUMERIC DEFAULT 0,
  p_reference_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  batch_id UUID,
  error_message TEXT
) AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 3. GET PRODUCT STOCK
-- Helper untuk mendapatkan stok produk di branch tertentu
-- ============================================================================

-- Drop all versions of get_product_stock to avoid ambiguity
DROP FUNCTION IF EXISTS get_product_stock(UUID, UUID);

CREATE OR REPLACE FUNCTION get_product_stock(
  p_product_id UUID,
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
     WHERE product_id = p_product_id
       AND branch_id = p_branch_id
       AND remaining_quantity > 0),
    0
  );
END;
$$ LANGUAGE plpgsql STABLE;


-- ============================================================================
-- 4. SYNC PRODUCT INITIAL STOCK ATOMIC
-- Sinkronisasi stok awal produk (batch khusus 'Stok Awal')
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_product_initial_stock_atomic(
  p_product_id UUID,
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION consume_inventory_fifo(UUID, UUID, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION restore_inventory_fifo(UUID, UUID, NUMERIC, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_product_stock(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION sync_product_initial_stock_atomic(UUID, UUID, NUMERIC, NUMERIC) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION consume_inventory_fifo IS
  'Atomic FIFO consume untuk products. WAJIB branch_id untuk isolasi data.';
COMMENT ON FUNCTION restore_inventory_fifo IS
  'Restore stok produk dengan membuat batch baru. WAJIB branch_id.';
COMMENT ON FUNCTION get_product_stock IS
  'Get current stock produk di branch tertentu.';
COMMENT ON FUNCTION sync_product_initial_stock_atomic IS
  'Sinkronisasi stok awal produk (batch khusus Stok Awal).';

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
-- ============================================================================
-- RPC 03: Journal Entry Atomic
-- Purpose: Create journal entry dengan validasi balance
-- PENTING: Semua operasi WAJIB filter by branch_id
-- ============================================================================

-- Drop existing function
DROP FUNCTION IF EXISTS create_journal_atomic(UUID, DATE, TEXT, TEXT, TEXT, JSONB, BOOLEAN);

-- ============================================================================
-- 1. CREATE JOURNAL ATOMIC
-- Membuat journal entry dengan validasi:
-- - Branch ID wajib
-- - Debit = Credit (balanced)
-- - Account IDs valid
-- - Period not closed
-- ============================================================================

CREATE OR REPLACE FUNCTION create_journal_atomic(
  p_branch_id UUID,
  p_entry_date DATE,
  p_description TEXT,
  p_reference_type TEXT DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_lines JSONB DEFAULT '[]'::JSONB,
  p_auto_post BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  entry_number TEXT,
  error_message TEXT
) AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_total_debit NUMERIC := 0;
  v_total_credit NUMERIC := 0;
  v_line RECORD;
  v_line_number INTEGER := 0;
  v_period_closed BOOLEAN := FALSE;
BEGIN
  -- ==================== VALIDASI ====================

  -- Validasi branch_id WAJIB
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE AS success, NULL::UUID AS journal_id, NULL::TEXT AS entry_number,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT AS error_message;
    RETURN;
  END IF;

  -- Validasi lines tidak kosong
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RETURN QUERY SELECT FALSE AS success, NULL::UUID AS journal_id, NULL::TEXT AS entry_number,
      'Journal lines are required'::TEXT AS error_message;
    RETURN;
  END IF;

  -- Validasi minimal 2 lines
  IF jsonb_array_length(p_lines) < 2 THEN
    RETURN QUERY SELECT FALSE AS success, NULL::UUID AS journal_id, NULL::TEXT AS entry_number,
      'Minimal 2 journal lines required (double-entry)'::TEXT AS error_message;
    RETURN;
  END IF;

  -- ==================== CEK PERIOD LOCK ====================

  -- Cek apakah periode sudah ditutup
  BEGIN
    SELECT EXISTS (
      SELECT 1 FROM closing_entries
      WHERE branch_id = p_branch_id
        AND closing_type = 'year_end'
        AND status = 'posted'
        AND closing_date >= p_entry_date
    ) INTO v_period_closed;
  EXCEPTION WHEN undefined_table THEN
    v_period_closed := FALSE;
  END;

  IF v_period_closed THEN
    RETURN QUERY SELECT FALSE AS success, NULL::UUID AS journal_id, NULL::TEXT AS entry_number,
      format('Periode %s sudah ditutup. Tidak dapat membuat jurnal.', p_entry_date)::TEXT AS error_message;
    RETURN;
  END IF;

  -- ==================== VALIDASI LINES ====================

  -- Hitung total dan validasi accounts
  FOR v_line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
    account_id TEXT,
    account_code TEXT,
    debit_amount NUMERIC,
    credit_amount NUMERIC,
    description TEXT
  )
  LOOP
    -- Validasi account exists
    IF v_line.account_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM accounts
        WHERE id = v_line.account_id
          AND branch_id = p_branch_id
          AND is_active = TRUE
      ) THEN
        RETURN QUERY SELECT FALSE AS success, NULL::UUID AS journal_id, NULL::TEXT AS entry_number,
          format('Account ID %s tidak ditemukan di branch ini', v_line.account_id)::TEXT AS error_message;
        RETURN;
      END IF;
    ELSIF v_line.account_code IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM accounts
        WHERE code = v_line.account_code
          AND branch_id = p_branch_id
          AND is_active = TRUE
      ) THEN
        RETURN QUERY SELECT FALSE AS success, NULL::UUID AS journal_id, NULL::TEXT AS entry_number,
          format('Account code %s tidak ditemukan di branch ini', v_line.account_code)::TEXT AS error_message;
        RETURN;
      END IF;
    ELSE
      RETURN QUERY SELECT FALSE AS success, NULL::UUID AS journal_id, NULL::TEXT AS entry_number,
        'Setiap line harus memiliki account_id atau account_code'::TEXT AS error_message;
      RETURN;
    END IF;

    v_total_debit := v_total_debit + COALESCE(v_line.debit_amount, 0);
    v_total_credit := v_total_credit + COALESCE(v_line.credit_amount, 0);
  END LOOP;

  -- ==================== VALIDASI BALANCE ====================

  IF v_total_debit != v_total_credit THEN
    RETURN QUERY SELECT FALSE AS success, NULL::UUID AS journal_id, NULL::TEXT AS entry_number,
      format('Jurnal tidak balance! Debit: %s, Credit: %s', v_total_debit, v_total_credit)::TEXT AS error_message;
    RETURN;
  END IF;

  IF v_total_debit = 0 THEN
    RETURN QUERY SELECT FALSE AS success, NULL::UUID AS journal_id, NULL::TEXT AS entry_number,
      'Total debit/credit tidak boleh 0'::TEXT AS error_message;
    RETURN;
  END IF;

  -- ==================== GENERATE ENTRY NUMBER ====================

  FOR i IN 1..10 LOOP
    v_entry_number := 'JE-' || TO_CHAR(p_entry_date, 'YYYYMMDD') || '-' ||
      LPAD((SELECT COUNT(*) + 1 FROM journal_entries
            WHERE branch_id = p_branch_id
            AND DATE(created_at) = DATE(p_entry_date))::TEXT, 4, '0') ||
      LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0');

    BEGIN
      INSERT INTO journal_entries (
        entry_number,
        entry_date,
        description,
        reference_type,
        reference_id,
        branch_id,
        status,
        total_debit,
        total_credit
      ) VALUES (
        v_entry_number,
        p_entry_date,
        p_description,
        p_reference_type,
        p_reference_id,
        p_branch_id,
        'draft',
        v_total_debit,
        v_total_credit
      )
      RETURNING id INTO v_journal_id;
      
      EXIT; -- Insert successful
    EXCEPTION WHEN unique_violation THEN
      IF i = 10 THEN RAISE; END IF;
      -- Retry loop
    END;
  END LOOP;

  -- ==================== CREATE JOURNAL LINES ====================

  v_line_number := 0;
  FOR v_line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
    account_id TEXT,
    account_code TEXT,
    debit_amount NUMERIC,
    credit_amount NUMERIC,
    description TEXT
  )
  LOOP
    v_line_number := v_line_number + 1;

    INSERT INTO journal_entry_lines (
      journal_entry_id,
      line_number,
      account_id,
      account_code,
      description,
      debit_amount,
      credit_amount
    ) VALUES (
      v_journal_id,
      v_line_number,
      CASE
        WHEN v_line.account_id IS NOT NULL THEN v_line.account_id  -- accounts.id is TEXT
        ELSE (SELECT id FROM accounts WHERE code = v_line.account_code AND branch_id = p_branch_id LIMIT 1)
      END,
      COALESCE(v_line.account_code,
        (SELECT code FROM accounts WHERE id = v_line.account_id LIMIT 1)),
      COALESCE(v_line.description, p_description),
      COALESCE(v_line.debit_amount, 0),
      COALESCE(v_line.credit_amount, 0)
    );
  END LOOP;

  -- ==================== POST JOURNAL ====================

  IF p_auto_post THEN
    UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
  END IF;

  RETURN QUERY SELECT TRUE AS success, v_journal_id AS journal_id, v_entry_number AS entry_number, NULL::TEXT AS error_message;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE AS success, NULL::UUID AS journal_id, NULL::TEXT AS entry_number, SQLERRM::TEXT AS error_message;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 2. VOID JOURNAL ENTRY
-- Void journal entry yang sudah posted
-- ============================================================================

CREATE OR REPLACE FUNCTION void_journal_entry(
  p_journal_id UUID,
  p_branch_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  error_message TEXT
) AS $$
DECLARE
  v_journal RECORD;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT;
    RETURN;
  END IF;

  IF p_journal_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Journal ID is required'::TEXT;
    RETURN;
  END IF;

  -- Get journal
  SELECT * INTO v_journal
  FROM journal_entries
  WHERE id = p_journal_id AND branch_id = p_branch_id;

  IF v_journal.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Journal not found in this branch'::TEXT;
    RETURN;
  END IF;

  IF v_journal.is_voided = TRUE THEN
    RETURN QUERY SELECT FALSE, 'Journal already voided'::TEXT;
    RETURN;
  END IF;

  -- ==================== VOID JOURNAL ====================

  UPDATE journal_entries
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_reason = COALESCE(p_reason, 'Voided via RPC'),
    updated_at = NOW()
  WHERE id = p_journal_id;

  RETURN QUERY SELECT TRUE, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE AS success, SQLERRM::TEXT AS error_message;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION create_journal_atomic(UUID, DATE, TEXT, TEXT, TEXT, JSONB, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION void_journal_entry(UUID, UUID, TEXT) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION create_journal_atomic IS
  'Create journal entry atomic dengan validasi balance. WAJIB branch_id.';
COMMENT ON FUNCTION void_journal_entry IS
  'Void journal entry. WAJIB branch_id untuk isolasi.';
-- ============================================================================
-- RPC 04: Production Atomic
-- Purpose: Proses produksi atomic dengan:
-- - Consume materials (FIFO) - auto-fetch dari BOM
-- - Create production record
-- - Create product inventory batch
-- - Create journal entry
-- PENTING: Semua operasi WAJIB filter by branch_id
-- ============================================================================

-- Drop existing functions (all signatures)
DROP FUNCTION IF EXISTS process_production_atomic(UUID, UUID, NUMERIC, JSONB, UUID, TEXT);
DROP FUNCTION IF EXISTS process_production_atomic(UUID, NUMERIC, BOOLEAN, TEXT, UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS process_spoilage_atomic(UUID, UUID, NUMERIC, TEXT, UUID);
DROP FUNCTION IF EXISTS process_spoilage_atomic(UUID, NUMERIC, TEXT, UUID, UUID, TEXT);

-- ============================================================================
-- 1. PROCESS PRODUCTION ATOMIC
-- Proses produksi lengkap dalam satu transaksi
-- Auto-fetch BOM dari product_materials jika p_consume_bom = true
-- ============================================================================

CREATE OR REPLACE FUNCTION process_production_atomic(
  p_product_id UUID,
  p_quantity NUMERIC,
  p_consume_bom BOOLEAN DEFAULT TRUE,
  p_note TEXT DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,        -- WAJIB: identitas cabang
  p_user_id UUID DEFAULT NULL,
  p_user_name TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  production_id UUID,
  production_ref TEXT,
  total_material_cost NUMERIC,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_production_id UUID;
  v_ref TEXT;
  v_bom_item RECORD;
  v_consume_result RECORD;
  v_total_material_cost NUMERIC := 0;
  v_material_details TEXT := '';
  v_bom_snapshot JSONB := '[]'::JSONB;
  v_product RECORD;
  v_journal_id UUID;
  v_entry_number TEXT;
  v_persediaan_barang_id TEXT;  -- accounts.id is TEXT not UUID
  v_persediaan_bahan_id TEXT;   -- accounts.id is TEXT not UUID
  v_unit_cost NUMERIC;
  v_required_qty NUMERIC;
  v_available_stock NUMERIC;
  v_material_name TEXT;
  v_seq INTEGER;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT;
    RETURN;
  END IF;

  IF p_product_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID,
      'Product ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_quantity <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID,
      'Quantity must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get product info
  SELECT id, name INTO v_product
  FROM products WHERE id = p_product_id;

  IF v_product.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID,
      'Product not found'::TEXT;
    RETURN;
  END IF;

  -- ==================== GENERATE REFERENCE ====================

  v_ref := 'PRD-' || TO_CHAR(NOW(), 'YYMMDD') || '-' ||
    LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0');

  -- ==================== CONSUME MATERIALS (FIFO) ====================

  IF p_consume_bom THEN
    -- Fetch BOM from product_materials
    FOR v_bom_item IN
      SELECT
        pm.material_id,
        pm.quantity as bom_qty,
        m.name as material_name,
        m.unit as material_unit
      FROM product_materials pm
      JOIN materials m ON m.id = pm.material_id
      WHERE pm.product_id = p_product_id
    LOOP
      v_required_qty := v_bom_item.bom_qty * p_quantity;

      -- Check stock availability first
      SELECT COALESCE(SUM(remaining_quantity), 0)
      INTO v_available_stock
      FROM inventory_batches
      WHERE material_id = v_bom_item.material_id
        AND (branch_id = p_branch_id OR branch_id IS NULL)
        AND remaining_quantity > 0;

      IF v_available_stock < v_required_qty THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID,
          format('Stok %s tidak cukup: butuh %s, tersedia %s',
            v_bom_item.material_name, v_required_qty, v_available_stock)::TEXT;
        RETURN;
      END IF;

      -- Call consume_material_fifo
      -- Note: using 6th arg default NULL
      SELECT * INTO v_consume_result
      FROM consume_material_fifo(
        v_bom_item.material_id,
        p_branch_id,
        v_required_qty,
        v_ref,
        'production'
      );

      IF NOT v_consume_result.success THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID,
          v_consume_result.error_message;
        RETURN;
      END IF;

      v_total_material_cost := v_total_material_cost + v_consume_result.total_cost;

      -- Build material details for journal notes
      v_material_details := v_material_details ||
        v_bom_item.material_name || ' x' || v_required_qty ||
        ' (Rp' || ROUND(v_consume_result.total_cost) || '), ';

      -- Build BOM snapshot for record
      v_bom_snapshot := v_bom_snapshot || jsonb_build_object(
        'id', gen_random_uuid(),
        'materialId', v_bom_item.material_id,
        'materialName', v_bom_item.material_name,
        'quantity', v_bom_item.bom_qty,
        'unit', v_bom_item.material_unit,
        'consumed', v_required_qty,
        'cost', v_consume_result.total_cost
      );
    END LOOP;
  END IF;

  -- Calculate unit cost for produced product
  v_unit_cost := CASE WHEN p_quantity > 0 AND v_total_material_cost > 0
    THEN v_total_material_cost / p_quantity ELSE 0 END;

  -- ==================== CREATE PRODUCTION RECORD ====================

  INSERT INTO production_records (
    ref,
    product_id,
    quantity,
    note,
    consume_bom,
    bom_snapshot,
    created_by,
    user_input_id,
    user_input_name,
    branch_id,
    created_at,
    updated_at
  ) VALUES (
    v_ref,
    p_product_id,
    p_quantity,
    p_note,
    p_consume_bom,
    CASE WHEN jsonb_array_length(v_bom_snapshot) > 0 THEN v_bom_snapshot ELSE NULL END,
    COALESCE(p_user_id, '00000000-0000-0000-0000-000000000000'::UUID),  -- Required NOT NULL
    p_user_id,
    COALESCE(p_user_name, 'System'),
    p_branch_id,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_production_id;

  -- ==================== CREATE PRODUCT INVENTORY BATCH ====================

  IF p_consume_bom AND v_total_material_cost > 0 THEN
    INSERT INTO inventory_batches (
      product_id,
      branch_id,
      initial_quantity,
      remaining_quantity,
      unit_cost,
      batch_date,
      notes,
      production_id
    ) VALUES (
      p_product_id,
      p_branch_id,
      p_quantity,
      p_quantity,
      v_unit_cost,
      NOW(),
      format('Produksi %s', v_ref),
      v_production_id
    );
  END IF;

  -- ==================== CREATE JOURNAL ENTRY ====================

  IF p_consume_bom AND v_total_material_cost > 0 THEN
    -- Get account IDs
    SELECT id INTO v_persediaan_barang_id
    FROM accounts
    WHERE code = '1310' AND branch_id = p_branch_id AND is_active = TRUE
    LIMIT 1;

    SELECT id INTO v_persediaan_bahan_id
    FROM accounts
    WHERE code = '1320' AND branch_id = p_branch_id AND is_active = TRUE
    LIMIT 1;

    IF v_persediaan_barang_id IS NOT NULL AND v_persediaan_bahan_id IS NOT NULL THEN
       -- Build Journal Lines for create_journal_atomic
       -- Dr. Persediaan Barang Dagang (1310)
       -- Cr. Persediaan Bahan Baku (1320)
       
       DECLARE
         v_journal_lines JSONB;
         v_journal_res RECORD;
       BEGIN
         v_journal_lines := jsonb_build_array(
           jsonb_build_object(
             'account_id', v_persediaan_barang_id,
             'debit_amount', v_total_material_cost,
             'credit_amount', 0,
             'description', format('Hasil produksi: %s x%s', v_product.name, p_quantity)
           ),
           jsonb_build_object(
             'account_id', v_persediaan_bahan_id,
             'credit_amount', v_total_material_cost,
             'debit_amount', 0,
             'description', format('Bahan terpakai: %s', RTRIM(v_material_details, ', '))
           )
         );

         SELECT * INTO v_journal_res FROM create_journal_atomic(
           p_branch_id,
           CURRENT_DATE,
           format('Produksi %s: %s x%s', v_ref, v_product.name, p_quantity),
           'production',
           v_production_id::TEXT,
           v_journal_lines,
           TRUE -- auto_post
         );

         IF v_journal_res.success THEN
            v_journal_id := v_journal_res.journal_id;
         ELSE
            -- Log error but don't fail transaction? Or fail? 
            -- Better to fail if journal fails.
            RAISE EXCEPTION 'Gagal membuat jurnal: %', v_journal_res.error_message;
         END IF;
       END;
    END IF;
  END IF;

  -- Note: Stok produk sekarang di-track via inventory_batches (FIFO)
  -- Tidak perlu log ke stock_movements karena inventory_batches sudah dibuat di atas

  RETURN QUERY SELECT
    TRUE,
    v_production_id,
    v_ref,
    v_total_material_cost,
    v_journal_id,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 2. PROCESS SPOILAGE ATOMIC
-- Catat material rusak dengan journal entry
-- ============================================================================

CREATE OR REPLACE FUNCTION process_spoilage_atomic(
  p_material_id UUID,
  p_quantity NUMERIC,
  p_note TEXT DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,        -- WAJIB: identitas cabang
  p_user_id UUID DEFAULT NULL,
  p_user_name TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  record_id UUID,
  record_ref TEXT,
  spoilage_cost NUMERIC,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_record_id UUID;
  v_ref TEXT;
  v_consume_result RECORD;
  v_spoilage_cost NUMERIC := 0;
  v_material RECORD;
  v_journal_id UUID;
  v_entry_number TEXT;
  v_beban_lain_id TEXT;         -- accounts.id is TEXT not UUID
  v_persediaan_bahan_id TEXT;   -- accounts.id is TEXT not UUID
  v_seq INTEGER;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT;
    RETURN;
  END IF;

  IF p_material_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID,
      'Material ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_quantity <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID,
      'Quantity must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get material info
  SELECT id, name, unit, stock INTO v_material
  FROM materials WHERE id = p_material_id;

  IF v_material.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID,
      'Material not found'::TEXT;
    RETURN;
  END IF;

  -- ==================== GENERATE REFERENCE ====================

  v_ref := 'ERR-' || TO_CHAR(NOW(), 'YYMMDD') || '-' ||
    LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0');

  -- ==================== CONSUME MATERIAL (FIFO) ====================
  -- This will deduct stock from batches and log to material_stock_movements

  SELECT * INTO v_consume_result
  FROM consume_material_fifo(
    p_material_id,
    p_branch_id,
    p_quantity,
    v_ref,
    'spoilage',
    format('Bahan rusak: %s', COALESCE(p_note, 'Tidak ada catatan'))  -- 6th arg: Custom note
  );

  IF NOT v_consume_result.success THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID,
      v_consume_result.error_message;
    RETURN;
  END IF;

  v_spoilage_cost := v_consume_result.total_cost;

  -- ==================== UPDATE MATERIALS.STOCK (backward compat) ====================
  -- REMOVED: consume_material_fifo already updates the legacy stock column.
  --          Keeping it here would cause double deduction.

  -- ==================== CREATE PRODUCTION RECORD (as error) ====================

  INSERT INTO production_records (
    ref,
    product_id,
    quantity,
    note,
    consume_bom,
    created_by,
    user_input_id,
    user_input_name,
    branch_id,
    created_at,
    updated_at
  ) VALUES (
    v_ref,
    NULL,  -- No product for spoilage
    -p_quantity,  -- Negative quantity indicates error/spoilage
    format('BAHAN RUSAK: %s - %s', v_material.name, COALESCE(p_note, 'Tidak ada catatan')),
    FALSE,
    p_user_id,
    p_user_id,
    COALESCE(p_user_name, 'System'),
    p_branch_id,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_record_id;

  -- ==================== LOG MATERIAL MOVEMENT ====================
  -- REMOVED: consume_material_fifo already logs to material_stock_movements with correct Reason.
  --          Double logging caused constraint errors and redundant data.

  -- ==================== CREATE JOURNAL ENTRY ====================

  IF v_spoilage_cost > 0 THEN
    SELECT id INTO v_beban_lain_id
    FROM accounts
    WHERE code = '8100' AND branch_id = p_branch_id AND is_active = TRUE
    LIMIT 1;

    SELECT id INTO v_persediaan_bahan_id
    FROM accounts
    WHERE code = '1320' AND branch_id = p_branch_id AND is_active = TRUE
    LIMIT 1;

    IF v_beban_lain_id IS NOT NULL AND v_persediaan_bahan_id IS NOT NULL THEN
       -- Use create_journal_atomic
       DECLARE
         v_journal_lines JSONB;
         v_journal_res RECORD;
       BEGIN
         v_journal_lines := jsonb_build_array(
           jsonb_build_object(
             'account_id', v_beban_lain_id,
             'debit_amount', v_spoilage_cost,
             'credit_amount', 0,
             'description', format('Bahan rusak: %s x%s', v_material.name, p_quantity)
           ),
           jsonb_build_object(
             'account_id', v_persediaan_bahan_id,
             'debit_amount', 0,
             'credit_amount', v_spoilage_cost,
             'description', format('Bahan keluar: %s x%s', v_material.name, p_quantity)
           )
         );

         SELECT * INTO v_journal_res FROM create_journal_atomic(
           p_branch_id,
           CURRENT_DATE,
           format('Bahan Rusak %s: %s x%s %s', v_ref, v_material.name, p_quantity, COALESCE(v_material.unit, 'pcs')),
           'adjustment',
           v_record_id::TEXT,
           v_journal_lines,
           TRUE
         );

         IF v_journal_res.success THEN
            v_journal_id := v_journal_res.journal_id;
         ELSE
            RAISE EXCEPTION 'Gagal membuat jurnal spoilage: %', v_journal_res.error_message;
         END IF;
       END;
    END IF;
  END IF;

  RETURN QUERY SELECT
    TRUE,
    v_record_id,
    v_ref,
    v_spoilage_cost,
    v_journal_id,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT EXECUTE ON FUNCTION process_production_atomic(UUID, NUMERIC, BOOLEAN, TEXT, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION process_spoilage_atomic(UUID, NUMERIC, TEXT, UUID, UUID, TEXT) TO authenticated;
-- ============================================================================
-- RPC 05: Delivery Management (Atomic)
-- Purpose: Create delivery, consume stock (FIFO), generate HPP journal, commissions
-- Updated: Uses "Modal Barang Dagang Tertahan" flow (Accrual)
-- ============================================================================

-- Function to process delivery atomically
CREATE OR REPLACE FUNCTION process_delivery_atomic(
  p_transaction_id TEXT,
  p_items JSONB,
  p_branch_id UUID,
  p_driver_id UUID DEFAULT NULL,
  p_helper_id UUID DEFAULT NULL,
  p_delivery_date TIMESTAMPTZ DEFAULT NOW(),
  p_notes TEXT DEFAULT NULL,
  p_photo_url TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  delivery_id UUID,
  delivery_number INTEGER,
  total_hpp NUMERIC,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_delivery_id UUID;
  v_transaction RECORD;
  v_item JSONB;
  v_consume_result RECORD;
  v_total_hpp_real NUMERIC := 0; -- Based on REAL FIFO at delivery moment
  v_journal_id UUID;
  v_acc_tertahan TEXT;  -- Changed from UUID to TEXT for compatibility
  v_acc_persediaan TEXT;  -- Changed from UUID to TEXT for compatibility
  v_delivery_number INTEGER;
  v_product_id UUID;
  v_qty NUMERIC;
  v_product_name TEXT;
  v_is_bonus BOOLEAN;
  v_total_ordered NUMERIC;
  v_total_delivered NUMERIC;
  v_new_status TEXT;
  v_hpp_account_id TEXT;  -- Changed from UUID to TEXT for compatibility
  v_entry_number TEXT;
  v_counter_int INTEGER;
  v_item_type TEXT;
  v_material_id UUID;
BEGIN
  -- ==================== VALIDASI ====================
  
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, NULL::UUID, 'Branch ID is REQUIRED'::TEXT;
    RETURN;
  END IF;

  IF p_transaction_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, NULL::UUID, 'Transaction ID is required'::TEXT;
    RETURN;
  END IF;

  -- Get Transaction
  SELECT * INTO v_transaction FROM transactions WHERE id = p_transaction_id;

  IF v_transaction.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, NULL::UUID, 'Transaction not found'::TEXT;
    RETURN;
  END IF;

  -- ==================== CREATE DELIVERY HEADER ====================
  -- Fix: Explicit alias d.delivery_number to avoid ambiguity with output column 'delivery_number'
  SELECT COALESCE(MAX(d.delivery_number), 0) + 1 INTO v_delivery_number 
  FROM deliveries d 
  WHERE d.transaction_id = p_transaction_id;

  INSERT INTO deliveries (
    transaction_id, delivery_number, branch_id, status, 
    customer_name, customer_address, customer_phone,
    driver_id, helper_id, delivery_date, notes, photo_url,
    created_at, updated_at
  )
  VALUES (
    p_transaction_id, v_delivery_number, p_branch_id, 'delivered',
    v_transaction.customer_name, NULL, NULL, -- Assuming txn has these or can be null
    p_driver_id, p_helper_id, p_delivery_date, 
    COALESCE(p_notes, format('Pengiriman ke-%s', v_delivery_number)), p_photo_url,
    NOW(), NOW()
  )
  RETURNING id INTO v_delivery_id;

  -- ==================== CONSUME STOCK & ITEMS ====================

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_product_id := NULL;
        v_material_id := NULL;
        v_qty := (v_item->>'quantity')::NUMERIC;
        v_product_name := v_item->>'product_name';
        v_is_bonus := COALESCE((v_item->>'is_bonus')::BOOLEAN, FALSE);
        v_item_type := v_item->>'item_type'; -- 'product' or 'material'

        -- Determine if this is a material or product based on ID prefix
        IF (v_item->>'product_id') LIKE 'material-%' THEN
          -- This is a material item
          v_material_id := (v_item->>'material_id')::UUID;
        ELSE
          -- This is a regular product
          v_product_id := (v_item->>'product_id')::UUID;
        END IF;

        IF v_qty > 0 THEN
           -- Insert Item
           INSERT INTO delivery_items (
             delivery_id, product_id, product_name, quantity_delivered, unit, is_bonus, notes, width, height, created_at
           ) VALUES (
             v_delivery_id, v_product_id, v_product_name, v_qty, 
             COALESCE(v_item->>'unit', 'pcs'), v_is_bonus, v_item->>'notes', 
             (v_item->>'width')::NUMERIC, (v_item->>'height')::NUMERIC, NOW()
           );
           
           -- Consume Stock (FIFO) - Only if not office sale (already consumed)
           -- Check logic: Office sale consumes at transaction time.
           IF NOT v_transaction.is_office_sale THEN
               IF v_material_id IS NOT NULL THEN
                 -- This is a material - use consume_material_fifo
                 SELECT * INTO v_consume_result FROM consume_material_fifo(
                   v_material_id, p_branch_id, v_qty, COALESCE(v_transaction.ref, 'TR-UNKNOWN'), 'delivery'
                 );
                 
                 IF NOT v_consume_result.success THEN
                    RAISE EXCEPTION 'Gagal potong stok material: %', v_consume_result.error_message;
                 END IF;
                 
                 v_total_hpp_real := v_total_hpp_real + COALESCE(v_consume_result.total_cost, 0);
               ELSIF v_product_id IS NOT NULL THEN
                 -- This is a regular product - use consume_inventory_fifo
                 SELECT * INTO v_consume_result FROM consume_inventory_fifo(
                   v_product_id, p_branch_id, v_qty, COALESCE(v_transaction.ref, 'TR-UNKNOWN')
                 );
                 
                 IF NOT v_consume_result.success THEN
                    RAISE EXCEPTION 'Gagal potong stok produk: %', v_consume_result.error_message;
                 END IF;
                 
                 v_total_hpp_real := v_total_hpp_real + v_consume_result.total_hpp;
               END IF;
           END IF;
        END IF;
    END LOOP;

  -- Update Delivery HPP
  UPDATE deliveries SET hpp_total = v_total_hpp_real WHERE id = v_delivery_id;

  -- ==================== UPDATE TRANSACTION STATUS ====================
  
  -- Check total ordered vs total delivered
  SELECT COALESCE(SUM((item->>'quantity')::NUMERIC), 0) INTO v_total_ordered
  FROM jsonb_array_elements(v_transaction.items) item
  WHERE NOT COALESCE((item->>'_isSalesMeta')::BOOLEAN, FALSE);

  SELECT COALESCE(SUM(di.quantity_delivered), 0) INTO v_total_delivered
  FROM delivery_items di
  JOIN deliveries d ON d.id = di.delivery_id
  WHERE d.transaction_id = p_transaction_id;

  IF v_total_delivered >= v_total_ordered THEN
    v_new_status := 'Selesai';
  ELSE
    v_new_status := 'Diantar Sebagian';
  END IF;

  UPDATE transactions
  SET status = v_new_status, delivery_status = 'delivered', delivered_at = NOW(), updated_at = NOW()
  WHERE id = p_transaction_id;

  -- ==================== JOURNAL ENTRY ====================
  -- Logic: Modal Tertahan (2140) vs Persediaan (1310)
  -- This clears the "Modal Tertahan" liability created during Invoice.
  
  IF NOT v_transaction.is_office_sale AND v_total_hpp_real > 0 THEN
      SELECT id INTO v_acc_tertahan FROM accounts WHERE code = '2140' AND branch_id = p_branch_id LIMIT 1;
      SELECT id INTO v_acc_persediaan FROM accounts WHERE code = '1310' AND branch_id = p_branch_id LIMIT 1;

      IF v_acc_tertahan IS NOT NULL AND v_acc_persediaan IS NOT NULL THEN
         DECLARE
           v_journal_lines JSONB;
           v_journal_res RECORD;
         BEGIN
           -- Construct lines
           -- Dr. Modal Barang Dagang Tertahan (2140)
           -- Cr. Persediaan Barang Jadi (1310)
           v_journal_lines := jsonb_build_array(
             jsonb_build_object(
               'account_id', v_acc_tertahan,
               'debit_amount', v_total_hpp_real,
               'credit_amount', 0,
               'description', 'Realisasi Pengiriman'
             ),
             jsonb_build_object(
               'account_id', v_acc_persediaan,
               'debit_amount', 0,
               'credit_amount', v_total_hpp_real,
               'description', 'Barang Keluar Gudang'
             )
           );

           -- Use atomic creator
           SELECT * INTO v_journal_res FROM create_journal_atomic(
             p_branch_id,
             p_delivery_date::DATE, -- Ensure DATE type
             format('Pengiriman %s', v_transaction.ref),
             'transaction', -- Reference type is transaction here as stated in original code
             v_delivery_id::TEXT, -- Using delivery ID as reference ID
             v_journal_lines,
             TRUE -- auto_post
           );

           IF v_journal_res.success THEN
              v_journal_id := v_journal_res.journal_id;
           ELSE
              RAISE EXCEPTION 'Gagal membuat jurnal pengiriman: %', v_journal_res.error_message;
           END IF;
         END;
      END IF;
  END IF;

  -- ==================== GENERATE COMMISSIONS ====================
  
  IF p_driver_id IS NOT NULL OR p_helper_id IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      v_product_id := (v_item->>'product_id')::UUID;
      v_qty := (v_item->>'quantity')::NUMERIC;
      v_product_name := v_item->>'product_name';
      v_is_bonus := COALESCE((v_item->>'is_bonus')::BOOLEAN, FALSE);

      -- Skip bonus items
      IF v_qty > 0 AND NOT v_is_bonus THEN
        -- Driver Commission
        IF p_driver_id IS NOT NULL THEN
          INSERT INTO commission_entries (
            user_id, user_name, role, product_id, product_name, quantity, rate_per_qty, amount, 
            transaction_id, delivery_id, ref, status, branch_id, created_at
          )
          SELECT 
            p_driver_id, (SELECT full_name FROM profiles WHERE id = p_driver_id), 'driver', 
            v_product_id, v_product_name, v_qty, cr.rate_per_qty, v_qty * cr.rate_per_qty, 
            p_transaction_id, v_delivery_id, 'DEL-' || v_delivery_id, 'pending', p_branch_id, NOW()
          FROM commission_rules cr
          WHERE cr.product_id = v_product_id AND cr.role = 'driver' AND cr.rate_per_qty > 0;
        END IF;

        -- Helper Commission
        IF p_helper_id IS NOT NULL THEN
          INSERT INTO commission_entries (
            user_id, user_name, role, product_id, product_name, quantity, rate_per_qty, amount, 
            transaction_id, delivery_id, ref, status, branch_id, created_at
          )
          SELECT 
            p_helper_id, (SELECT full_name FROM profiles WHERE id = p_helper_id), 'helper', 
            v_product_id, v_product_name, v_qty, cr.rate_per_qty, v_qty * cr.rate_per_qty, 
            p_transaction_id, v_delivery_id, 'DEL-' || v_delivery_id, 'pending', p_branch_id, NOW()
          FROM commission_rules cr
          WHERE cr.product_id = v_product_id AND cr.role = 'helper' AND cr.rate_per_qty > 0;
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN QUERY SELECT TRUE, v_delivery_id, v_delivery_number, v_total_hpp_real, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION process_delivery_atomic(TEXT, JSONB, UUID, UUID, UUID, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;
-- ============================================================================
-- RPC 06: Payment Atomic
-- Purpose: Proses pembayaran atomic dengan:
-- - Receivable payment (terima bayar piutang)
-- - Payable payment (bayar hutang)
-- - Journal entry otomatis
-- PENTING: Semua operasi WAJIB filter by branch_id
-- ============================================================================

-- Drop existing functions
DROP FUNCTION IF EXISTS receive_payment_atomic(UUID, UUID, NUMERIC, TEXT, DATE, TEXT);
DROP FUNCTION IF EXISTS pay_supplier_atomic(UUID, UUID, NUMERIC, TEXT, DATE, TEXT);
DROP FUNCTION IF EXISTS pay_supplier_atomic(TEXT, UUID, NUMERIC, TEXT, DATE, TEXT);

-- ============================================================================
-- 1. RECEIVE PAYMENT ATOMIC
-- Terima pembayaran piutang dari customer
-- ============================================================================

CREATE OR REPLACE FUNCTION receive_payment_atomic(
  p_receivable_id TEXT,       -- TEXT because transactions.id is TEXT
  p_branch_id UUID,           -- WAJIB: identitas cabang
  p_amount NUMERIC,
  p_payment_method TEXT DEFAULT 'cash',
  p_payment_date DATE DEFAULT CURRENT_DATE,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  payment_id UUID,
  remaining_amount NUMERIC,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_payment_id UUID;
  v_receivable RECORD;
  v_remaining NUMERIC;
  v_journal_id UUID;
  v_entry_number TEXT;
  v_kas_account_id TEXT;      -- accounts.id is TEXT
  v_piutang_account_id TEXT;  -- accounts.id is TEXT
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT;
    RETURN;
  END IF;

  IF p_receivable_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID,
      'Receivable ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID,
      'Amount must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get transaction info (acting as receivable)
  SELECT
    t.id,
    t.customer_id,
    t.total,
    COALESCE(t.paid_amount, 0) as paid_amount,
    COALESCE(t.total - COALESCE(t.paid_amount, 0), 0) as remaining_amount,
    t.payment_status as status,
    c.name as customer_name
  INTO v_receivable
  FROM transactions t
  LEFT JOIN customers c ON c.id = t.customer_id
  WHERE t.id = p_receivable_id::TEXT AND t.branch_id = p_branch_id; -- Cast UUID param to TEXT for transactions.id

  IF v_receivable.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID,
      'Transaction not found in this branch'::TEXT;
    RETURN;
  END IF;

  IF v_receivable.status = 'paid' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID,
      'Transaction already fully paid'::TEXT;
    RETURN;
  END IF;

  -- Calculate new remaining
  v_remaining := GREATEST(0, v_receivable.remaining_amount - p_amount);

  -- ==================== CREATE PAYMENT RECORD ====================
  -- Using transaction_payments table
  
  INSERT INTO transaction_payments (
    transaction_id,
    branch_id,
    amount,
    payment_method,
    payment_date,
    notes,
    created_at
  ) VALUES (
    p_receivable_id::TEXT,
    p_branch_id,
    p_amount,
    p_payment_method,
    p_payment_date,
    COALESCE(p_notes, format('Payment from %s', COALESCE(v_receivable.customer_name, 'Customer'))),
    NOW()
  )
  RETURNING id INTO v_payment_id;

  -- ==================== UPDATE TRANSACTION ====================

  UPDATE transactions
  SET
    paid_amount = COALESCE(paid_amount, 0) + p_amount,
    payment_status = CASE WHEN v_remaining <= 0 THEN 'Lunas' ELSE 'Partial' END,
    updated_at = NOW()
  WHERE id = p_receivable_id::TEXT;

  -- ==================== CREATE JOURNAL ENTRY ====================

  -- Get account IDs based on payment method
  IF p_payment_method = 'transfer' THEN
    SELECT id INTO v_kas_account_id
    FROM accounts
    WHERE code = '1120' AND branch_id = p_branch_id AND is_active = TRUE
    LIMIT 1;
  ELSE
    SELECT id INTO v_kas_account_id
    FROM accounts
    WHERE code = '1110' AND branch_id = p_branch_id AND is_active = TRUE
    LIMIT 1;
  END IF;

  SELECT id INTO v_piutang_account_id
  FROM accounts
  WHERE code = '1210' AND branch_id = p_branch_id AND is_active = TRUE
  LIMIT 1;

  IF v_kas_account_id IS NOT NULL AND v_piutang_account_id IS NOT NULL THEN
    DECLARE
      v_journal_lines JSONB;
      v_journal_res RECORD;
    BEGIN
       -- Dr. Kas/Bank
       -- Cr. Piutang Usaha
       v_journal_lines := jsonb_build_array(
         jsonb_build_object(
           'account_id', v_kas_account_id,
           'debit_amount', p_amount,
           'credit_amount', 0,
           'description', format('Terima dari %s', COALESCE(v_receivable.customer_name, 'Customer'))
         ),
         jsonb_build_object(
           'account_id', v_piutang_account_id,
           'debit_amount', 0,
           'credit_amount', p_amount,
           'description', format('Pelunasan piutang: %s', COALESCE(v_receivable.customer_name, 'Customer'))
         )
       );

       SELECT * INTO v_journal_res FROM create_journal_atomic(
         p_branch_id,
         p_payment_date,
         format('Terima pembayaran piutang: %s', COALESCE(v_receivable.customer_name, 'Customer')),
         'receivable_payment',
         v_payment_id::TEXT,
         v_journal_lines,
         TRUE
       );

       IF v_journal_res.success THEN
          v_journal_id := v_journal_res.journal_id;
       ELSE
          RAISE EXCEPTION 'Gagal membuat jurnal penerimaan: %', v_journal_res.error_message;
       END IF;
    END;
  END IF;

  RETURN QUERY SELECT
    TRUE,
    v_payment_id,
    v_remaining,
    v_journal_id,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 2. PAY SUPPLIER ATOMIC
-- Bayar hutang ke supplier
-- Note: accounts_payable.id adalah TEXT, bukan UUID
-- ============================================================================

CREATE OR REPLACE FUNCTION pay_supplier_atomic(
  p_payable_id TEXT,              -- TEXT karena accounts_payable.id adalah TEXT
  p_branch_id UUID,               -- WAJIB: identitas cabang
  p_amount NUMERIC,
  p_payment_method TEXT DEFAULT 'cash',
  p_payment_date DATE DEFAULT CURRENT_DATE,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  payment_id UUID,
  remaining_amount NUMERIC,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_payment_id UUID;
  v_payable RECORD;
  v_remaining NUMERIC;
  v_new_paid_amount NUMERIC;
  v_journal_id UUID;
  v_entry_number TEXT;
  v_kas_account_id TEXT;      -- accounts.id is TEXT
  v_hutang_account_id TEXT;   -- accounts.id is TEXT
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT;
    RETURN;
  END IF;

  IF p_payable_id IS NULL OR p_payable_id = '' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID,
      'Payable ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID,
      'Amount must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get payable info (struktur sesuai tabel accounts_payable yang ada)
  SELECT
    ap.id,
    ap.supplier_name,
    ap.amount,              -- Total amount hutang
    COALESCE(ap.paid_amount, 0) as paid_amount,
    ap.status
  INTO v_payable
  FROM accounts_payable ap
  WHERE ap.id = p_payable_id AND ap.branch_id = p_branch_id;

  IF v_payable.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID,
      'Payable not found in this branch'::TEXT;
    RETURN;
  END IF;

  IF v_payable.status = 'Paid' OR v_payable.status = 'paid' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID,
      'Hutang sudah lunas'::TEXT;
    RETURN;
  END IF;

  -- Calculate new amounts
  v_new_paid_amount := v_payable.paid_amount + p_amount;
  v_remaining := GREATEST(0, v_payable.amount - v_new_paid_amount);

  -- ==================== UPDATE PAYABLE (langsung, tanpa payment record terpisah) ====================

  UPDATE accounts_payable
  SET
    paid_amount = v_new_paid_amount,
    status = CASE WHEN v_remaining <= 0 THEN 'Paid' ELSE 'Partial' END,
    paid_at = CASE WHEN v_remaining <= 0 THEN NOW() ELSE paid_at END,
    notes = COALESCE(p_notes, notes)
  WHERE id = p_payable_id;

  -- Generate a payment ID for tracking
  v_payment_id := gen_random_uuid();

  -- ==================== CREATE JOURNAL ENTRY ====================

  -- Get account IDs
  IF p_payment_method = 'transfer' THEN
    SELECT id INTO v_kas_account_id
    FROM accounts
    WHERE code = '1120' AND branch_id = p_branch_id AND is_active = TRUE
    LIMIT 1;
  ELSE
    SELECT id INTO v_kas_account_id
    FROM accounts
    WHERE code = '1110' AND branch_id = p_branch_id AND is_active = TRUE
    LIMIT 1;
  END IF;

  SELECT id INTO v_hutang_account_id
  FROM accounts
  WHERE code = '2110' AND branch_id = p_branch_id AND is_active = TRUE
  LIMIT 1;

  IF v_kas_account_id IS NOT NULL AND v_hutang_account_id IS NOT NULL THEN
    DECLARE
       v_journal_lines JSONB;
       v_journal_res RECORD;
    BEGIN
       -- Dr. Hutang Usaha
       -- Cr. Kas/Bank
       v_journal_lines := jsonb_build_array(
         jsonb_build_object(
           'account_id', v_hutang_account_id,
           'debit_amount', p_amount,
           'credit_amount', 0,
           'description', format('Bayar ke %s', COALESCE(v_payable.supplier_name, 'Supplier'))
         ),
         jsonb_build_object(
           'account_id', v_kas_account_id,
           'debit_amount', 0,
           'credit_amount', p_amount,
           'description', format('Pembayaran hutang: %s', COALESCE(v_payable.supplier_name, 'Supplier'))
         )
       );

       SELECT * INTO v_journal_res FROM create_journal_atomic(
         p_branch_id,
         p_payment_date,
         format('Bayar hutang ke: %s', COALESCE(v_payable.supplier_name, 'Supplier')),
         'payable_payment',
         v_payment_id::TEXT,
         v_journal_lines,
         TRUE
       );

       IF v_journal_res.success THEN
         v_journal_id := v_journal_res.journal_id;
       ELSE
         RAISE EXCEPTION 'Gagal membuat jurnal pembayaran hutang: %', v_journal_res.error_message;
       END IF;
    END;
  END IF;

  RETURN QUERY SELECT
    TRUE,
    v_payment_id,
    v_remaining,
    v_journal_id,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 3. CREATE ACCOUNTS PAYABLE ATOMIC
-- Membuat hutang baru secara atomic dengan jurnal otomatis
-- ============================================================================

CREATE OR REPLACE FUNCTION create_accounts_payable_atomic(
  p_branch_id UUID,
  p_supplier_name TEXT,
  p_amount NUMERIC,
  p_due_date DATE DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_creditor_type TEXT DEFAULT 'supplier',
  p_purchase_order_id TEXT DEFAULT NULL,
  p_skip_journal BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  success BOOLEAN,
  payable_id TEXT,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_payable_id TEXT;
  v_journal_id UUID;
  v_entry_number TEXT;
  v_hutang_account_id TEXT;
  v_lawan_account_id TEXT; -- Usually Cash or Inventory depending on context
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID,
      'Branch ID is REQUIRED'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID,
      'Amount must be positive'::TEXT;
    RETURN;
  END IF;

  -- ðŸ”¥ NEW: Check if AP already exists for this PO
  IF p_purchase_order_id IS NOT NULL THEN
    DECLARE
      v_existing_ap_count INTEGER;
    BEGIN
      SELECT COUNT(*) INTO v_existing_ap_count
      FROM accounts_payable
      WHERE purchase_order_id = p_purchase_order_id;

      IF v_existing_ap_count > 0 THEN
        RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID,
          'Accounts Payable sudah ada untuk PO ini. Gunakan approve_purchase_order_atomic untuk PO.'::TEXT;
        RETURN;
      END IF;
    END;

    -- ðŸ”¥ FORCE skip_journal for PO (journal should be created by approve_purchase_order_atomic)
    p_skip_journal := TRUE;
  END IF;

  -- Generate Sequential ID
  v_payable_id := 'AP-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

  -- ==================== INSERT ACCOUNTS PAYABLE ====================

  INSERT INTO accounts_payable (
    id,
    branch_id,
    supplier_name,
    creditor_type,
    amount,
    due_date,
    description,
    purchase_order_id,
    status,
    paid_amount,
    created_at
  ) VALUES (
    v_payable_id,
    p_branch_id,
    p_supplier_name,
    p_creditor_type,
    p_amount,
    p_due_date,
    p_description,
    p_purchase_order_id,
    'Outstanding',
    0,
    NOW()
  );

  -- ==================== CREATE JOURNAL ENTRY ====================

  IF NOT p_skip_journal THEN
    -- Get Account IDs
    -- Default Hutang Usaha: 2110
    SELECT id INTO v_hutang_account_id FROM accounts WHERE code = '2110' AND branch_id = p_branch_id AND is_active = TRUE LIMIT 1;
    
    -- Lawan: 5110 (Pembelian) as default
    SELECT id INTO v_lawan_account_id FROM accounts WHERE code = '5110' AND branch_id = p_branch_id AND is_active = TRUE LIMIT 1;

    IF v_hutang_account_id IS NOT NULL AND v_lawan_account_id IS NOT NULL THEN
       DECLARE
         v_journal_lines JSONB;
         v_journal_res RECORD;
       BEGIN
         -- Dr. Lawan
         -- Cr. Hutang
         v_journal_lines := jsonb_build_array(
           jsonb_build_object(
             'account_id', v_lawan_account_id,
             'debit_amount', p_amount,
             'credit_amount', 0,
             'description', COALESCE(p_description, 'Hutang Baru')
           ),
           jsonb_build_object(
             'account_id', v_hutang_account_id,
             'debit_amount', 0,
             'credit_amount', p_amount,
             'description', COALESCE(p_description, 'Hutang Baru')
           )
         );

         SELECT * INTO v_journal_res FROM create_journal_atomic(
           p_branch_id,
           CURRENT_DATE,
           COALESCE(p_description, 'Hutang Baru: ' || p_supplier_name),
           'accounts_payable',
           v_payable_id,
           v_journal_lines,
           TRUE -- auto post
         );

         IF v_journal_res.success THEN
           v_journal_id := v_journal_res.journal_id;
         ELSE
           RAISE EXCEPTION 'Gagal membuat jurnal hutang: %', v_journal_res.error_message;
         END IF;
       END;
    END IF;
  END IF;

  RETURN QUERY SELECT TRUE, v_payable_id, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION receive_payment_atomic(TEXT, UUID, NUMERIC, TEXT, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION pay_supplier_atomic(TEXT, UUID, NUMERIC, TEXT, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_accounts_payable_atomic(UUID, TEXT, NUMERIC, DATE, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION receive_payment_atomic IS
  'Atomic receivable payment: update saldo + journal. WAJIB branch_id.';
COMMENT ON FUNCTION pay_supplier_atomic IS
  'Atomic payable payment: update saldo + journal. WAJIB branch_id.';
COMMENT ON FUNCTION create_accounts_payable_atomic IS
  'Atomic creation of accounts payable with optional automatic journal entry. WAJIB branch_id. PREVENTS duplicate AP for PO (use approve_purchase_order_atomic instead).';


-- ============================================================================
-- RPC 13: Debt Installment Payment Atomic
-- Purpose: Bayar angsuran hutang secara atomic (1 transaksi DB)
-- - Update debt_installment status
-- - Update accounts_payable paid_amount
-- - Create journal entry
-- PENTING: Semua dalam 1 transaksi, rollback otomatis jika gagal
-- ============================================================================

DROP FUNCTION IF EXISTS pay_debt_installment_atomic(UUID, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION pay_debt_installment_atomic(
  p_installment_id UUID,
  p_branch_id UUID,
  p_payment_account_id TEXT,        -- Account ID for payment (e.g., 1110 for cash)
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  installment_id UUID,
  debt_id TEXT,
  journal_id UUID,
  remaining_debt NUMERIC,
  error_message TEXT
) AS $$
DECLARE
  v_installment RECORD;
  v_payable RECORD;
  v_journal_id UUID;
  v_entry_number TEXT;
  v_payment_method TEXT;
  v_payment_date DATE := CURRENT_DATE;
  v_kas_account_id TEXT;
  v_hutang_account_id TEXT;
  v_new_paid_amount NUMERIC;
  v_remaining NUMERIC;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::UUID, 0::NUMERIC,
      'Branch ID is REQUIRED'::TEXT;
    RETURN;
  END IF;

  IF p_installment_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::UUID, 0::NUMERIC,
      'Installment ID is required'::TEXT;
    RETURN;
  END IF;

  -- Get installment info
  SELECT
    di.id,
    di.debt_id,
    di.installment_number,
    di.total_amount,
    di.status,
    di.principal_amount,
    di.interest_amount
  INTO v_installment
  FROM debt_installments di
  WHERE di.id = p_installment_id;

  IF v_installment.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::UUID, 0::NUMERIC,
      'Angsuran tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  IF v_installment.status = 'paid' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::UUID, 0::NUMERIC,
      'Angsuran sudah dibayar'::TEXT;
    RETURN;
  END IF;

  -- Get payable info
  SELECT
    ap.id,
    ap.supplier_name,
    ap.amount,
    COALESCE(ap.paid_amount, 0) as paid_amount,
    ap.status,
    ap.branch_id
  INTO v_payable
  FROM accounts_payable ap
  WHERE ap.id = v_installment.debt_id AND ap.branch_id = p_branch_id;

  IF v_payable.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::UUID, 0::NUMERIC,
      'Hutang tidak ditemukan di cabang ini'::TEXT;
    RETURN;
  END IF;

  -- ==================== UPDATE INSTALLMENT ====================

  UPDATE debt_installments
  SET
    status = 'paid',
    paid_at = NOW(),
    paid_amount = v_installment.total_amount,
    payment_account_id = p_payment_account_id,
    notes = COALESCE(p_notes, notes)
  WHERE id = p_installment_id;

  -- ==================== UPDATE ACCOUNTS PAYABLE ====================

  v_new_paid_amount := v_payable.paid_amount + v_installment.total_amount;
  v_remaining := GREATEST(0, v_payable.amount - v_new_paid_amount);

  UPDATE accounts_payable
  SET
    paid_amount = v_new_paid_amount,
    status = CASE WHEN v_remaining <= 0 THEN 'Paid' ELSE 'Partial' END,
    paid_at = CASE WHEN v_remaining <= 0 THEN NOW() ELSE paid_at END
  WHERE id = v_installment.debt_id;

  -- ==================== CREATE JOURNAL ENTRY ====================

  -- Determine payment method from account ID
  v_payment_method := CASE WHEN p_payment_account_id LIKE '%1120%' THEN 'transfer' ELSE 'cash' END;

  -- Get account IDs
  IF v_payment_method = 'transfer' THEN
    SELECT id INTO v_kas_account_id
    FROM accounts
    WHERE code = '1120' AND branch_id = p_branch_id AND is_active = TRUE
    LIMIT 1;
  ELSE
    SELECT id INTO v_kas_account_id
    FROM accounts
    WHERE code = '1110' AND branch_id = p_branch_id AND is_active = TRUE
    LIMIT 1;
  END IF;

  SELECT id INTO v_hutang_account_id
  FROM accounts
  WHERE code = '2110' AND branch_id = p_branch_id AND is_active = TRUE
  LIMIT 1;

  IF v_kas_account_id IS NOT NULL AND v_hutang_account_id IS NOT NULL THEN
  IF v_kas_account_id IS NOT NULL AND v_hutang_account_id IS NOT NULL THEN
     DECLARE
       v_journal_lines JSONB;
       v_journal_res RECORD;
     BEGIN
       -- Dr. Hutang Usaha
       -- Cr. Kas/Bank
       v_journal_lines := jsonb_build_array(
         jsonb_build_object(
           'account_id', v_hutang_account_id,
           'debit_amount', v_installment.total_amount,
           'credit_amount', 0,
           'description', format('Angsuran #%s - %s', v_installment.installment_number, COALESCE(v_payable.supplier_name, 'Supplier'))
         ),
         jsonb_build_object(
           'account_id', v_kas_account_id,
           'debit_amount', 0,
           'credit_amount', v_installment.total_amount,
           'description', format('Pembayaran angsuran hutang: %s', COALESCE(v_payable.supplier_name, 'Supplier'))
         )
       );

       SELECT * INTO v_journal_res FROM create_journal_atomic(
         p_branch_id,
         v_payment_date,
         format('Bayar angsuran #%s ke: %s%s',
           v_installment.installment_number,
           COALESCE(v_payable.supplier_name, 'Supplier'),
           CASE WHEN p_notes IS NOT NULL THEN ' - ' || p_notes ELSE '' END),
         'debt_installment',
         p_installment_id::TEXT,
         v_journal_lines,
         TRUE
       );

       IF v_journal_res.success THEN
         v_journal_id := v_journal_res.journal_id;
       ELSE
         RAISE EXCEPTION 'Gagal membuat jurnal angsuran: %', v_journal_res.error_message;
       END IF;
     END;
  END IF;

  RETURN QUERY SELECT
    TRUE,
    p_installment_id,
    v_installment.debt_id,
    v_journal_id,
    v_remaining,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  -- Automatic rollback happens here
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::UUID, 0::NUMERIC, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION pay_debt_installment_atomic(UUID, UUID, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION pay_debt_installment_atomic IS
  'Atomic debt installment payment: update installment + payable + journal in single transaction.';
-- Drop existing functions generically to avoid ambiguity
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Drop create_employee_advance_atomic
  FOR r IN SELECT oid::regprocedure AS func_signature
           FROM pg_proc
           WHERE proname = 'create_employee_advance_atomic'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE';
  END LOOP;

  -- Drop repay_employee_advance_atomic
  FOR r IN SELECT oid::regprocedure AS func_signature
           FROM pg_proc
           WHERE proname = 'repay_employee_advance_atomic'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE';
  END LOOP;

  -- Drop void_employee_advance_atomic
  FOR r IN SELECT oid::regprocedure AS func_signature
           FROM pg_proc
           WHERE proname = 'void_employee_advance_atomic'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE';
  END LOOP;
END $$;

-- ============================================================================
-- 1. CREATE EMPLOYEE ADVANCE ATOMIC
-- Kasbon karyawan dengan jurnal otomatis
-- ============================================================================

CREATE OR REPLACE FUNCTION create_employee_advance_atomic(
  p_advance JSONB,
  p_branch_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  advance_id UUID,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_advance_id UUID;
  v_journal_id UUID;
  v_employee_id UUID;
  v_employee_name TEXT;
  v_amount NUMERIC;
  v_advance_date DATE;
  v_reason TEXT;
  v_payment_account_id TEXT;

  v_kas_account_id TEXT;
  v_piutang_karyawan_id TEXT;
  v_entry_number TEXT;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  -- Permission check
  IF auth.uid() IS NOT NULL THEN
    IF NOT check_user_permission(auth.uid(), 'advances_manage') THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Tidak memiliki akses untuk membuat kasbon'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- ==================== PARSE DATA ====================

  v_advance_id := COALESCE((p_advance->>'id')::UUID, gen_random_uuid());
  v_employee_id := (p_advance->>'employee_id')::UUID;
  v_employee_name := p_advance->>'employee_name';
  v_amount := COALESCE((p_advance->>'amount')::NUMERIC, 0);
  v_advance_date := COALESCE((p_advance->>'advance_date')::DATE, CURRENT_DATE);
  v_reason := COALESCE(p_advance->>'reason', 'Kasbon karyawan');
  v_payment_account_id := (p_advance->>'payment_account_id'); -- No cast to UUID, it's TEXT

  IF v_employee_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Employee ID is required'::TEXT;
    RETURN;
  END IF;

  IF v_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Amount must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get employee name if not provided (localhost uses profiles, not employees)
  IF v_employee_name IS NULL THEN
    SELECT full_name INTO v_employee_name FROM profiles WHERE id = v_employee_id;
  END IF;

  -- ==================== GET ACCOUNT IDS ====================

  -- Kas account
  IF v_payment_account_id IS NOT NULL THEN
    v_kas_account_id := v_payment_account_id;
  ELSE
    SELECT id INTO v_kas_account_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '1110' AND is_active = TRUE LIMIT 1;
  END IF;

  -- Piutang Karyawan (1230 atau sesuai chart of accounts)
  SELECT id INTO v_piutang_karyawan_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1230' AND is_active = TRUE LIMIT 1;

  -- Fallback: cari akun dengan nama mengandung "Piutang Karyawan"
  IF v_piutang_karyawan_id IS NULL THEN
    SELECT id INTO v_piutang_karyawan_id FROM accounts
    WHERE branch_id = p_branch_id AND name ILIKE '%piutang karyawan%' AND is_active = TRUE LIMIT 1;
  END IF;

  IF v_kas_account_id IS NULL OR v_piutang_karyawan_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Akun Kas atau Piutang Karyawan tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- ==================== INSERT ADVANCE RECORD ====================

  INSERT INTO employee_advances (
    id,
    branch_id,
    employee_id,
    employee_name,
    amount,
    remaining_amount,
    date,      -- Correct column name
    notes,     -- Map reason to notes
    status,
    created_at, -- No created_by column in schema output, let's omit or check if it exists differently? schema said no created_by
    account_id  -- Map payment account
  ) VALUES (
    v_advance_id::TEXT, -- Cast to TEXT as ID in table is TEXT
    p_branch_id,
    v_employee_id,
    v_employee_name,
    v_amount,
    v_amount, 
    v_advance_date,
    v_reason,
    'active',
    NOW(),
    v_payment_account_id
  );

  -- ==================== CREATE JOURNAL ENTRY ====================

  -- ==================== CREATE JOURNAL ENTRY ====================
  
  DECLARE
    v_journal_lines JSONB;
    v_journal_res RECORD;
  BEGIN
    -- Dr. Piutang Karyawan
    -- Cr. Kas
    v_journal_lines := jsonb_build_array(
      jsonb_build_object(
        'account_id', v_piutang_karyawan_id,
        'debit_amount', v_amount,
        'credit_amount', 0,
        'description', 'Kasbon ' || v_employee_name
      ),
      jsonb_build_object(
        'account_id', v_kas_account_id,
        'debit_amount', 0,
        'credit_amount', v_amount,
        'description', 'Pengeluaran kas untuk kasbon'
      )
    );

    SELECT * INTO v_journal_res FROM create_journal_atomic(
      p_branch_id,
      v_advance_date,
      'Kasbon Karyawan - ' || v_employee_name || ' - ' || v_reason,
      'advance',
      v_advance_id::TEXT,
      v_journal_lines,
      TRUE
    );

    IF v_journal_res.success THEN
      v_journal_id := v_journal_res.journal_id;
    ELSE
      RAISE EXCEPTION 'Gagal membuat jurnal kasbon: %', v_journal_res.error_message;
    END IF;
  END;

  -- ==================== SUCCESS ====================

  RETURN QUERY SELECT TRUE, v_advance_id, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 2. REPAY EMPLOYEE ADVANCE ATOMIC
-- Pembayaran/cicilan kasbon dengan jurnal otomatis
-- ============================================================================

CREATE OR REPLACE FUNCTION repay_employee_advance_atomic(
  p_advance_id UUID,
  p_branch_id UUID,
  p_amount NUMERIC,
  p_payment_date DATE DEFAULT CURRENT_DATE,
  p_payment_method TEXT DEFAULT 'cash',
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  payment_id UUID,
  journal_id UUID,
  remaining_amount NUMERIC,
  is_fully_paid BOOLEAN,
  error_message TEXT
) AS $$
DECLARE
  v_advance RECORD;
  v_payment_id UUID;
  v_journal_id UUID;
  v_kas_account_id TEXT;
  v_piutang_karyawan_id TEXT;
  v_entry_number TEXT;
  v_new_remaining NUMERIC;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, FALSE, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, FALSE, 'Amount must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get advance record
  SELECT * INTO v_advance
  FROM employee_advances
  WHERE id = p_advance_id AND branch_id = p_branch_id
  FOR UPDATE;

  IF v_advance.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, FALSE, 'Kasbon tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  IF v_advance.status = 'paid' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, FALSE, 'Kasbon sudah lunas'::TEXT;
    RETURN;
  END IF;

  IF p_amount > v_advance.remaining_amount THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, FALSE,
      format('Jumlah pembayaran (%s) melebihi sisa kasbon (%s)', p_amount, v_advance.remaining_amount)::TEXT;
    RETURN;
  END IF;

  -- ==================== GET ACCOUNT IDS ====================

  SELECT id INTO v_kas_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1110' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_piutang_karyawan_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1230' AND is_active = TRUE LIMIT 1;

  IF v_piutang_karyawan_id IS NULL THEN
    SELECT id INTO v_piutang_karyawan_id FROM accounts
    WHERE branch_id = p_branch_id AND name ILIKE '%piutang karyawan%' AND is_active = TRUE LIMIT 1;
  END IF;

  -- ==================== CALCULATE NEW REMAINING ====================

  v_new_remaining := v_advance.remaining_amount - p_amount;
  v_payment_id := gen_random_uuid();

  -- ==================== UPDATE ADVANCE RECORD ====================

  UPDATE employee_advances
  SET
    remaining_amount = v_new_remaining,
    status = CASE WHEN v_new_remaining <= 0 THEN 'paid' ELSE 'active' END,
    updated_at = NOW()
  WHERE id = p_advance_id;

  -- ==================== INSERT PAYMENT RECORD ====================

  INSERT INTO employee_advance_payments (
    id,
    advance_id,
    branch_id,
    amount,
    payment_date,
    payment_method,
    notes,
    created_by,
    created_at
  ) VALUES (
    v_payment_id,
    p_advance_id,
    p_branch_id,
    p_amount,
    p_payment_date,
    p_payment_method,
    p_notes,
    auth.uid(),
    NOW()
  );

  -- ==================== CREATE JOURNAL ENTRY ====================

  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

  INSERT INTO journal_entries (
    id,
    branch_id,
    entry_number,
    entry_date,
    description,
    reference_type,
    reference_id,
    status,
    is_voided,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    p_branch_id,
    v_entry_number,
    p_payment_date,
    'Pembayaran Kasbon - ' || v_advance.employee_name,
    'advance_payment',
    v_payment_id::TEXT,
    'posted',
    FALSE,
    NOW(),
    NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Kas
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_kas_account_id,
    (SELECT name FROM accounts WHERE id = v_kas_account_id),
    p_amount, 0, 'Penerimaan pembayaran kasbon', 1
  );

  -- Cr. Piutang Karyawan
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_piutang_karyawan_id,
    (SELECT name FROM accounts WHERE id = v_piutang_karyawan_id),
    0, p_amount, 'Pelunasan piutang karyawan', 2
  );

  -- ==================== SUCCESS ====================

  RETURN QUERY SELECT TRUE, v_payment_id, v_journal_id, v_new_remaining, (v_new_remaining <= 0), NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, FALSE, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 3. VOID EMPLOYEE ADVANCE ATOMIC
-- Batalkan kasbon dengan rollback jurnal
-- ============================================================================

CREATE OR REPLACE FUNCTION void_employee_advance_atomic(
  p_advance_id UUID,
  p_branch_id UUID,
  p_reason TEXT DEFAULT 'Dibatalkan'
)
RETURNS TABLE (
  success BOOLEAN,
  journals_voided INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_advance RECORD;
  v_journals_voided INTEGER := 0;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  -- Get advance
  SELECT * INTO v_advance
  FROM employee_advances
  WHERE id = p_advance_id::TEXT AND branch_id = p_branch_id
  FOR UPDATE;

  IF v_advance.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Kasbon tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- Cannot void if there are payments
  IF v_advance.remaining_amount < v_advance.amount THEN
    RETURN QUERY SELECT FALSE, 0, 'Tidak bisa membatalkan kasbon yang sudah ada pembayaran'::TEXT;
    RETURN;
  END IF;

  -- ==================== VOID JOURNALS ====================

  UPDATE journal_entries
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_reason = p_reason,
    status = 'voided',
    updated_at = NOW()
  WHERE reference_type = 'advance'
    AND reference_id = p_advance_id::TEXT
    AND branch_id = p_branch_id
    AND is_voided = FALSE;

  GET DIAGNOSTICS v_journals_voided = ROW_COUNT;

  -- ==================== UPDATE ADVANCE STATUS ====================

  UPDATE employee_advances
  SET
    status = 'cancelled'
    -- updated_at doesn't exist in schema, removing it
  WHERE id = p_advance_id::TEXT;

  -- ==================== SUCCESS ====================

  RETURN QUERY SELECT TRUE, v_journals_voided, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION create_employee_advance_atomic(JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION repay_employee_advance_atomic(UUID, UUID, NUMERIC, DATE, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION void_employee_advance_atomic(UUID, UUID, TEXT) TO authenticated;


-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION create_employee_advance_atomic IS
  'Create employee advance (kasbon) with auto journal. Dr. Piutang Karyawan, Cr. Kas.';
COMMENT ON FUNCTION repay_employee_advance_atomic IS
  'Repay employee advance with auto journal. Dr. Kas, Cr. Piutang Karyawan.';
COMMENT ON FUNCTION void_employee_advance_atomic IS
  'Void employee advance and related journals. Only if no payments made.';
-- ============================================================================
-- RPC 16: Purchase Order Management Atomic (FIXED - Prevent Duplicates)
-- Purpose: Pembuatan dan Persetujuan PO secara atomik
-- CHANGE: Added duplicate check to prevent double journal/AP creation
-- ============================================================================

-- 1. CREATE PURCHASE ORDER ATOMIC (No changes)
CREATE OR REPLACE FUNCTION create_purchase_order_atomic(
  p_po_header JSONB,
  p_po_items JSONB,
  p_branch_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  po_id TEXT,
  error_message TEXT
) AS $$
DECLARE
  v_po_id TEXT;
  v_item JSONB;
BEGIN
  -- Validate required fields
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, 'Branch ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_po_header->>'supplier_id' IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, 'Supplier ID is required'::TEXT;
    RETURN;
  END IF;

  -- Generate PO ID if not provided
  v_po_id := p_po_header->>'id';
  IF v_po_id IS NULL THEN
    v_po_id := 'PO-' || EXTRACT(EPOCH FROM NOW())::TEXT;
  END IF;

  -- Insert Header
  INSERT INTO purchase_orders (
    id,
    po_number,
    status,
    requested_by,
    supplier_id,
    supplier_name,
    total_cost,
    subtotal,
    include_ppn,
    ppn_mode,
    ppn_amount,
    expedition,
    order_date,
    expected_delivery_date,
    notes,
    branch_id,
    created_at
  ) VALUES (
    v_po_id,
    p_po_header->>'po_number',
    'Pending',
    COALESCE(p_po_header->>'requested_by', 'System'),
    (p_po_header->>'supplier_id')::UUID,
    p_po_header->>'supplier_name',
    (p_po_header->>'total_cost')::NUMERIC,
    (p_po_header->>'subtotal')::NUMERIC,
    COALESCE((p_po_header->>'include_ppn')::BOOLEAN, FALSE),
    COALESCE(p_po_header->>'ppn_mode', 'exclude'),
    COALESCE((p_po_header->>'ppn_amount')::NUMERIC, 0),
    p_po_header->>'expedition',
    COALESCE((p_po_header->>'order_date')::TIMESTAMP, NOW()),
    (p_po_header->>'expected_delivery_date')::TIMESTAMP,
    p_po_header->>'notes',
    p_branch_id,
    NOW()
  );

  -- Insert Items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_po_items)
  LOOP
    INSERT INTO purchase_order_items (
      purchase_order_id,
      material_id,
      product_id,
      material_name,
      product_name,
      item_type,
      quantity,
      unit_price,
      unit,
      subtotal,
      notes
    ) VALUES (
      v_po_id,
      (v_item->>'material_id')::UUID,
      (v_item->>'product_id')::UUID,
      v_item->>'material_name',
      v_item->>'product_name',
      COALESCE(v_item->>'item_type', CASE WHEN v_item->>'material_id' IS NOT NULL THEN 'material' ELSE 'product' END),
      (v_item->>'quantity')::NUMERIC,
      (v_item->>'unit_price')::NUMERIC,
      v_item->>'unit',
      COALESCE((v_item->>'subtotal')::NUMERIC, (v_item->>'quantity')::NUMERIC * (v_item->>'unit_price')::NUMERIC),
      v_item->>'notes'
    );
  END LOOP;

  RETURN QUERY SELECT TRUE, v_po_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::TEXT, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. APPROVE PURCHASE ORDER ATOMIC (FIXED - Added Duplicate Check)
-- Set status Approved, buat Jurnal (Persediaan vs Hutang), dan buat Accounts Payable
CREATE OR REPLACE FUNCTION approve_purchase_order_atomic(
  p_po_id TEXT,
  p_branch_id UUID,
  p_user_id UUID,
  p_user_name TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  journal_ids UUID[],
  ap_id TEXT,
  error_message TEXT
) AS $$
DECLARE
  v_po RECORD;
  v_item RECORD;
  v_journal_id UUID;
  v_journal_ids UUID[] := ARRAY[]::UUID[];
  v_ap_id TEXT;
  v_entry_number TEXT;
  v_acc_persediaan_bahan UUID;
  v_acc_persediaan_produk UUID;
  v_acc_hutang_usaha UUID;
  v_acc_piutang_pajak UUID;
  v_total_material NUMERIC := 0;
  v_total_product NUMERIC := 0;
  v_material_ppn NUMERIC := 0;
  v_product_ppn NUMERIC := 0;
  v_material_names TEXT := '';
  v_product_names TEXT := '';
  v_subtotal_all NUMERIC := 0;
  v_days INTEGER;
  v_due_date DATE;
  v_supplier_terms TEXT;
  v_existing_journal_count INTEGER;
  v_existing_ap_count INTEGER;
BEGIN
  -- 1. Get PO Header
  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id AND branch_id = p_branch_id;
  IF v_po.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID[], NULL::TEXT, 'Purchase Order tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  IF v_po.status <> 'Pending' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID[], NULL::TEXT, 'Hanya PO status Pending yang bisa disetujui'::TEXT;
    RETURN;
  END IF;

  -- ðŸ”¥ NEW: Check if journal already exists for this PO
  SELECT COUNT(*) INTO v_existing_journal_count
  FROM journal_entries
  WHERE reference_id = p_po_id
    AND reference_type = 'purchase_order'
    AND is_voided = FALSE;

  IF v_existing_journal_count > 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID[], NULL::TEXT, 
      format('Journal sudah ada untuk PO ini (%s entries). Tidak dapat approve lagi.', v_existing_journal_count)::TEXT;
    RETURN;
  END IF;

  -- ðŸ”¥ NEW: Check if AP already exists for this PO
  SELECT COUNT(*) INTO v_existing_ap_count
  FROM accounts_payable
  WHERE purchase_order_id = p_po_id;

  IF v_existing_ap_count > 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID[], NULL::TEXT, 
      'Accounts Payable sudah ada untuk PO ini. Tidak dapat approve lagi.'::TEXT;
    RETURN;
  END IF;

  -- 2. Get Accounts
  SELECT id INTO v_acc_persediaan_bahan FROM accounts WHERE code = '1320' AND branch_id = p_branch_id LIMIT 1;
  SELECT id INTO v_acc_persediaan_produk FROM accounts WHERE code = '1310' AND branch_id = p_branch_id LIMIT 1;
  SELECT id INTO v_acc_hutang_usaha FROM accounts WHERE code = '2110' AND branch_id = p_branch_id LIMIT 1;
  SELECT id INTO v_acc_piutang_pajak FROM accounts WHERE code = '1230' AND branch_id = p_branch_id LIMIT 1;

  IF v_acc_hutang_usaha IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID[], NULL::TEXT, 'Akun Hutang Usaha (2110) tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- 3. Calculate Totals and Names
  FOR v_item IN SELECT * FROM purchase_order_items WHERE purchase_order_id = p_po_id LOOP
    v_subtotal_all := v_subtotal_all + COALESCE(v_item.subtotal, 0);
    IF v_item.item_type = 'material' OR v_item.material_id IS NOT NULL THEN
      v_total_material := v_total_material + COALESCE(v_item.subtotal, 0);
      v_material_names := v_material_names || v_item.material_name || ' x' || v_item.quantity || ', ';
    ELSE
      v_total_product := v_total_product + COALESCE(v_item.subtotal, 0);
      v_product_names := v_product_names || v_item.product_name || ' x' || v_item.quantity || ', ';
    END IF;
  END LOOP;

  v_material_names := RTRIM(v_material_names, ', ');
  v_product_names := RTRIM(v_product_names, ', ');

  -- Proportional PPN
  IF v_po.include_ppn AND v_po.ppn_amount > 0 AND v_subtotal_all > 0 THEN
    v_material_ppn := ROUND(v_po.ppn_amount * (v_total_material / v_subtotal_all));
    v_product_ppn := v_po.ppn_amount - v_material_ppn;
  END IF;

  -- 4. Create Material Journal
  IF v_total_material > 0 THEN
    IF v_acc_persediaan_bahan IS NULL THEN
      RETURN QUERY SELECT FALSE, NULL::UUID[], NULL::TEXT, 'Akun Persediaan Bahan Baku (1320) tidak ditemukan'::TEXT;
      RETURN;
    END IF;

    DECLARE
       v_journal_lines JSONB := '[]'::JSONB;
       v_journal_res RECORD;
    BEGIN
       -- Dr. Persediaan Bahan Baku
       v_journal_lines := v_journal_lines || jsonb_build_object(
          'account_id', v_acc_persediaan_bahan,
          'debit_amount', v_total_material,
          'credit_amount', 0,
          'description', 'Persediaan: ' || v_material_names
       );
       
       -- Dr. Piutang Pajak (PPN Masukan) jika ada
       IF v_material_ppn > 0 AND v_acc_piutang_pajak IS NOT NULL THEN
          v_journal_lines := v_journal_lines || jsonb_build_object(
            'account_id', v_acc_piutang_pajak,
            'debit_amount', v_material_ppn,
            'credit_amount', 0,
            'description', 'PPN Masukan (PO ' || p_po_id || ')'
          );
       END IF;

       -- Cr. Hutang Usaha
       v_journal_lines := v_journal_lines || jsonb_build_object(
          'account_id', v_acc_hutang_usaha,
          'debit_amount', 0,
          'credit_amount', v_total_material + v_material_ppn,
          'description', 'Hutang: ' || v_po.supplier_name
       );

       SELECT * INTO v_journal_res FROM create_journal_atomic(
         p_branch_id,
         CURRENT_DATE,
         'Pembelian Bahan Baku: ' || v_po.supplier_name || ' (' || p_po_id || ')',
         'purchase_order',
         p_po_id,
         v_journal_lines,
         TRUE
       );

       IF v_journal_res.success THEN
         v_journal_ids := array_append(v_journal_ids, v_journal_res.journal_id);
       ELSE
         RAISE EXCEPTION 'Gagal membuat jurnal bahan baku PO: %', v_journal_res.error_message;
       END IF;
    END;
  END IF;

  -- 5. Create Product Journal
  IF v_total_product > 0 THEN
    IF v_acc_persediaan_produk IS NULL THEN
      RETURN QUERY SELECT FALSE, NULL::UUID[], NULL::TEXT, 'Akun Persediaan Barang Dagang (1310) tidak ditemukan'::TEXT;
      RETURN;
    END IF;

    DECLARE
       v_journal_lines JSONB := '[]'::JSONB;
       v_journal_res RECORD;
    BEGIN
       -- Dr. Persediaan Produk Jadi
       v_journal_lines := v_journal_lines || jsonb_build_object(
          'account_id', v_acc_persediaan_produk,
          'debit_amount', v_total_product,
          'credit_amount', 0,
          'description', 'Persediaan: ' || v_product_names
       );

       -- Dr. Piutang Pajak (PPN Masukan) jika ada
       IF v_product_ppn > 0 AND v_acc_piutang_pajak IS NOT NULL THEN
           v_journal_lines := v_journal_lines || jsonb_build_object(
            'account_id', v_acc_piutang_pajak,
            'debit_amount', v_product_ppn,
            'credit_amount', 0,
            'description', 'PPN Masukan (PO ' || p_po_id || ')'
           );
       END IF;

       -- Cr. Hutang Usaha
       v_journal_lines := v_journal_lines || jsonb_build_object(
          'account_id', v_acc_hutang_usaha,
          'debit_amount', 0,
          'credit_amount', v_total_product + v_product_ppn,
          'description', 'Hutang: ' || v_po.supplier_name
       );
       
       SELECT * INTO v_journal_res FROM create_journal_atomic(
         p_branch_id,
         CURRENT_DATE,
         'Pembelian Produk Jadi: ' || v_po.supplier_name || ' (' || p_po_id || ')',
         'purchase_order',
         p_po_id,
         v_journal_lines,
         TRUE
       );

       IF v_journal_res.success THEN
         v_journal_ids := array_append(v_journal_ids, v_journal_res.journal_id);
       ELSE
         RAISE EXCEPTION 'Gagal membuat jurnal produk PO: %', v_journal_res.error_message;
       END IF;
    END;
  END IF;

  -- 6. Create Accounts Payable (AP)
  v_due_date := NOW()::DATE + INTERVAL '30 days'; -- Default
  SELECT payment_terms INTO v_supplier_terms FROM suppliers WHERE id = v_po.supplier_id;
  IF v_supplier_terms ILIKE '%net%' THEN
    v_days := (regexp_matches(v_supplier_terms, '\\d+'))[1]::INTEGER;
    v_due_date := NOW()::DATE + (v_days || ' days')::INTERVAL;
  ELSIF v_supplier_terms ILIKE '%cash%' THEN
    v_due_date := NOW()::DATE;
  END IF;

  v_ap_id := 'AP-PO-' || p_po_id;

  INSERT INTO accounts_payable (
    id, purchase_order_id, supplier_id, supplier_name, amount, due_date,
    description, status, paid_amount, branch_id, created_at
  ) VALUES (
    v_ap_id, p_po_id, v_po.supplier_id, v_po.supplier_name, v_po.total_cost, v_due_date,
    'Purchase Order ' || p_po_id || ' - ' || COALESCE(v_material_names, '') || COALESCE(v_product_names, ''), 
    'Outstanding', 0, p_branch_id, NOW()
  );

  -- 7. Update PO Status
  UPDATE purchase_orders
  SET
    status = 'Approved',
    approved_at = NOW(),
    approved_by = p_user_name,
    updated_at = NOW()
  WHERE id = p_po_id;

  RETURN QUERY SELECT TRUE, v_journal_ids, v_ap_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID[], NULL::TEXT, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- GRANTS
GRANT EXECUTE ON FUNCTION create_purchase_order_atomic(JSONB, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION approve_purchase_order_atomic(TEXT, UUID, UUID, TEXT) TO authenticated;

-- COMMENTS
COMMENT ON FUNCTION approve_purchase_order_atomic IS
  'FIXED: Added duplicate check to prevent double journal/AP creation. Creates journal (Dr. Persediaan, Cr. Hutang) and AP record.';
