-- ============================================================================
-- AQUVIT ERP - COMBINED RPC DEPLOYMENT
-- Generated: 2026-01-05
-- 
-- AMAN UNTUK PRODUCTION:
-- - Semua function menggunakan CREATE OR REPLACE
-- - Tidak ada DROP TABLE/TRUNCATE/DELETE
-- - Hanya update logic, tidak hapus data
-- ============================================================================

SET client_min_messages TO WARNING;


-- ============================================================================
-- FILE: 00_permission_checker.sql
-- ============================================================================
-- ============================================================================
-- RPC 00: Permission Checker Functions
-- Purpose: Centralized permission checking for all RPC functions
-- All RPC functions should call these before executing business logic
-- ============================================================================

-- ============================================================================
-- 1. CHECK USER PERMISSION
-- Cek apakah user memiliki permission tertentu berdasarkan role
-- ============================================================================

CREATE OR REPLACE FUNCTION check_user_permission(
  p_user_id UUID,
  p_permission TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_role TEXT;
  v_has_permission BOOLEAN := FALSE;
BEGIN
  -- Jika user_id NULL, return FALSE
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Get user role from profiles table (localhost uses profiles, not employees)
  SELECT role INTO v_role
  FROM profiles
  WHERE id = p_user_id AND status = 'Aktif';

  -- Jika user tidak ditemukan atau tidak aktif
  IF v_role IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Owner SELALU punya akses penuh
  IF v_role = 'owner' THEN
    RETURN TRUE;
  END IF;

  -- Admin punya semua akses kecuali role_management
  IF v_role = 'admin' AND p_permission != 'role_management' THEN
    RETURN TRUE;
  END IF;

  -- Cek dari role_permissions table
  SELECT (permissions->>p_permission)::BOOLEAN INTO v_has_permission
  FROM role_permissions
  WHERE role_id = v_role;

  RETURN COALESCE(v_has_permission, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 2. CHECK MULTIPLE PERMISSIONS (ANY)
-- Return TRUE jika user memiliki SALAH SATU permission
-- ============================================================================

CREATE OR REPLACE FUNCTION check_user_permission_any(
  p_user_id UUID,
  p_permissions TEXT[]
) RETURNS BOOLEAN AS $$
DECLARE
  v_permission TEXT;
BEGIN
  FOREACH v_permission IN ARRAY p_permissions
  LOOP
    IF check_user_permission(p_user_id, v_permission) THEN
      RETURN TRUE;
    END IF;
  END LOOP;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 3. CHECK MULTIPLE PERMISSIONS (ALL)
-- Return TRUE jika user memiliki SEMUA permission
-- ============================================================================

CREATE OR REPLACE FUNCTION check_user_permission_all(
  p_user_id UUID,
  p_permissions TEXT[]
) RETURNS BOOLEAN AS $$
DECLARE
  v_permission TEXT;
BEGIN
  FOREACH v_permission IN ARRAY p_permissions
  LOOP
    IF NOT check_user_permission(p_user_id, v_permission) THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 4. GET USER ROLE
-- Get role name dari user ID
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_role(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role
  FROM profiles
  WHERE id = p_user_id AND status = 'Aktif';

  RETURN v_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 5. VALIDATE USER ACCESS TO BRANCH
-- Cek apakah user boleh akses branch tertentu
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_branch_access(
  p_user_id UUID,
  p_branch_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_user_branch_id UUID;
  v_role TEXT;
BEGIN
  -- Get user's branch and role from profiles table
  SELECT branch_id, role INTO v_user_branch_id, v_role
  FROM profiles
  WHERE id = p_user_id AND status = 'Aktif';

  -- Owner dan Admin bisa akses semua branch
  IF v_role IN ('owner', 'admin') THEN
    RETURN TRUE;
  END IF;

  -- User lain hanya bisa akses branch sendiri
  RETURN v_user_branch_id = p_branch_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- PERMISSION CONSTANTS (untuk referensi)
-- ============================================================================
-- Granular Permissions yang tersedia:
--
-- POS & Transactions:
--   pos_access, pos_driver_access, transactions_view, transactions_edit
--
-- Products & Materials:
--   products_view, products_create, products_edit, products_delete
--   materials_view, materials_create, materials_edit, materials_delete
--
-- Customers & Suppliers:
--   customers_view, customers_create, customers_edit, customers_delete
--   suppliers_view, suppliers_create, suppliers_edit
--
-- Employees & Payroll:
--   employees_view, employees_create, employees_edit, employees_delete
--   payroll_view, payroll_manage
--
-- Deliveries & Retasi:
--   delivery_view, delivery_create, delivery_edit
--   retasi_view, retasi_create, retasi_edit
--
-- Financial:
--   accounts_view, accounts_manage
--   receivables_view, receivables_manage
--   payables_view, payables_manage
--   expenses_view, expenses_create, expenses_edit, expenses_delete
--   advances_view, advances_manage
--   cash_flow_view
--   financial_reports
--
-- Assets:
--   assets_view, assets_create, assets_edit, assets_delete
--
-- Production:
--   production_view, production_create, production_edit
--
-- Reports:
--   stock_reports, transaction_reports, attendance_reports
--   production_reports, material_movement_report, transaction_items_report
--
-- Settings & Admin:
--   settings_access, role_management
--   attendance_access, attendance_view
-- ============================================================================


-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION check_user_permission(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION check_user_permission_any(UUID, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION check_user_permission_all(UUID, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_role(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_branch_access(UUID, UUID) TO authenticated;


-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION check_user_permission IS
  'Check if user has specific granular permission. Owner always TRUE, Admin TRUE except role_management.';
COMMENT ON FUNCTION check_user_permission_any IS
  'Check if user has ANY of the specified permissions.';
COMMENT ON FUNCTION check_user_permission_all IS
  'Check if user has ALL of the specified permissions.';
COMMENT ON FUNCTION get_user_role IS
  'Get user role name from employee ID.';
COMMENT ON FUNCTION validate_branch_access IS
  'Validate if user can access specific branch. Owner/Admin can access all.';

-- ============================================================================
-- FILE: 01_fifo_inventory.sql
-- ============================================================================
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

  -- ==================== CEK STOK ====================

  -- Cek available stock HANYA di branch ini
  SELECT COALESCE(SUM(remaining_quantity), 0)
  INTO v_available_stock
  FROM inventory_batches
  WHERE product_id = p_product_id
    AND branch_id = p_branch_id      -- WAJIB filter branch
    AND remaining_quantity > 0;

  IF v_available_stock < p_quantity THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB,
      format('Stok tidak cukup untuk %s. Tersedia: %s, Diminta: %s',
        v_product_name, v_available_stock, p_quantity)::TEXT;
    RETURN;
  END IF;

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

  -- ==================== LOGGING ====================

  -- Log consumption untuk audit
  INSERT INTO product_stock_movements (
    product_id,
    branch_id,
    movement_type,
    quantity,
    reference_id,
    reference_type,
    unit_cost,
    notes,
    created_at
  ) VALUES (
    p_product_id,
    p_branch_id,
    'OUT',
    p_quantity,
    p_reference_id,
    'fifo_consume',
    CASE WHEN p_quantity > 0 THEN v_total_hpp / p_quantity ELSE 0 END,
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
    movement_type,
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
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION consume_inventory_fifo(UUID, UUID, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION restore_inventory_fifo(UUID, UUID, NUMERIC, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_product_stock(UUID, UUID) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION consume_inventory_fifo IS
  'Atomic FIFO consume untuk products. WAJIB branch_id untuk isolasi data.';
COMMENT ON FUNCTION restore_inventory_fifo IS
  'Restore stok produk dengan membuat batch baru. WAJIB branch_id.';
COMMENT ON FUNCTION get_product_stock IS
  'Get current stock produk di branch tertentu.';

-- ============================================================================
-- FILE: 01_fifo_inventory_v3.sql
-- ============================================================================
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

CREATE OR REPLACE FUNCTION consume_inventory_fifo_v3(
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

  -- ==================== CEK STOK ====================

  -- Cek available stock HANYA di branch ini
  SELECT COALESCE(SUM(remaining_quantity), 0)
  INTO v_available_stock
  FROM inventory_batches
  WHERE product_id = p_product_id
    AND branch_id = p_branch_id      -- WAJIB filter branch
    AND remaining_quantity > 0;

  IF v_available_stock < p_quantity THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB,
      format('Stok tidak cukup untuk %s. Tersedia: %s, Diminta: %s',
        v_product_name, v_available_stock, p_quantity)::TEXT;
    RETURN;
  END IF;

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

  -- ==================== LOGGING ====================

  -- Log consumption untuk audit
  INSERT INTO product_stock_movements (
    product_id,
    branch_id,
    movement_type,
    quantity,
    reference_id,
    reference_type,
    unit_cost,
    notes,
    created_at
  ) VALUES (
    p_product_id,
    p_branch_id,
    'OUT',
    p_quantity,
    p_reference_id,
    'fifo_consume',
    CASE WHEN p_quantity > 0 THEN v_total_hpp / p_quantity ELSE 0 END,
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
    movement_type,
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
-- FILE: 02_fifo_material.sql
-- ============================================================================
-- ============================================================================
-- RPC 02: FIFO Material
-- Purpose: Atomic FIFO consume/restore untuk materials (bahan baku)
-- PENTING: Semua operasi WAJIB filter by branch_id
-- ============================================================================

-- Drop existing functions
DROP FUNCTION IF EXISTS consume_material_fifo(UUID, UUID, NUMERIC, TEXT, TEXT);
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
  p_reference_type TEXT DEFAULT 'production'
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

  IF v_available_stock < p_quantity THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB,
      format('Stok material tidak cukup untuk %s. Tersedia: %s, Diminta: %s',
        v_material_name, v_available_stock, p_quantity)::TEXT;
    RETURN;
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

  -- ==================== LOGGING ====================

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
      WHEN p_reference_type = 'spoilage' THEN 'SPOILAGE'
      ELSE 'ADJUSTMENT'
    END,
    p_quantity,
    v_available_stock,
    v_available_stock - p_quantity,
    p_reference_id,
    p_reference_type,
    format('FIFO consume: %s batches, total cost %s', jsonb_array_length(v_consumed), v_total_cost),
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
    'ADJUSTMENT',
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

GRANT EXECUTE ON FUNCTION consume_material_fifo(UUID, UUID, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION restore_material_fifo(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION add_material_batch(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_material_stock(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION sync_material_initial_stock_atomic(UUID, UUID, NUMERIC, NUMERIC) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION consume_material_fifo IS
  'Atomic FIFO consume untuk materials. WAJIB branch_id untuk isolasi data.';
COMMENT ON FUNCTION restore_material_fifo IS
  'Restore stok material dengan membuat batch baru. WAJIB branch_id.';
COMMENT ON FUNCTION add_material_batch IS
  'Tambah batch material baru (untuk pembelian). WAJIB branch_id.';
COMMENT ON FUNCTION get_material_stock IS
  'Get current stock material di branch tertentu.';
COMMENT ON FUNCTION sync_material_initial_stock_atomic IS
  'Sinkronisasi stok awal material (batch khusus Stok Awal).';


-- ============================================================================
-- FILE: 03_journal.sql
-- ============================================================================
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

  v_entry_number := 'JE-' || TO_CHAR(p_entry_date, 'YYYYMMDD') || '-' ||
    LPAD((SELECT COUNT(*) + 1 FROM journal_entries
          WHERE branch_id = p_branch_id
          AND DATE(created_at) = DATE(p_entry_date))::TEXT, 4, '0') ||
    LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0');

  -- ==================== CREATE JOURNAL HEADER ====================

  -- Create as draft first (trigger may block lines on posted)
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
-- FILE: 04_production.sql
-- ============================================================================
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
      -- Generate entry number
      v_entry_number := 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
        LPAD((SELECT COUNT(*) + 1 FROM journal_entries
              WHERE branch_id = p_branch_id
              AND DATE(created_at) = CURRENT_DATE)::TEXT, 4, '0');

      -- Create journal header as draft
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
        NOW(),
        format('Produksi %s: %s x%s', v_ref, v_product.name, p_quantity),
        'adjustment',
        v_production_id::TEXT,
        p_branch_id,
        'draft',
        v_total_material_cost,
        v_total_material_cost
      )
      RETURNING id INTO v_journal_id;

      -- Dr. Persediaan Barang Dagang (1310)
      INSERT INTO journal_entry_lines (
        journal_entry_id,
        line_number,
        account_id,
        description,
        debit_amount,
        credit_amount
      ) VALUES (
        v_journal_id,
        1,
        v_persediaan_barang_id,
        format('Hasil produksi: %s x%s', v_product.name, p_quantity),
        v_total_material_cost,
        0
      );

      -- Cr. Persediaan Bahan Baku (1320)
      INSERT INTO journal_entry_lines (
        journal_entry_id,
        line_number,
        account_id,
        description,
        debit_amount,
        credit_amount
      ) VALUES (
        v_journal_id,
        2,
        v_persediaan_bahan_id,
        format('Bahan terpakai: %s', RTRIM(v_material_details, ', ')),
        0,
        v_total_material_cost
      );

      -- Post the journal
      UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
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

DROP FUNCTION IF EXISTS process_spoilage_atomic(UUID, UUID, NUMERIC, TEXT, UUID);
DROP FUNCTION IF EXISTS process_spoilage_atomic(UUID, NUMERIC, TEXT, UUID, UUID, TEXT);

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

  SELECT * INTO v_consume_result
  FROM consume_material_fifo(
    p_material_id,
    p_branch_id,
    p_quantity,
    v_ref,
    'spoilage'
  );

  IF NOT v_consume_result.success THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID,
      v_consume_result.error_message;
    RETURN;
  END IF;

  v_spoilage_cost := v_consume_result.total_cost;

  -- ==================== UPDATE MATERIALS.STOCK (backward compat) ====================

  UPDATE materials
  SET
    stock = GREATEST(0, stock - p_quantity),
    updated_at = NOW()
  WHERE id = p_material_id;

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
    branch_id,
    created_at
  ) VALUES (
    p_material_id,
    v_material.name,
    'OUT',
    'ADJUSTMENT',
    p_quantity,
    v_material.stock,
    GREATEST(0, v_material.stock - p_quantity),
    v_record_id::TEXT,
    'production',
    p_user_id,
    COALESCE(p_user_name, 'System'),
    format('Bahan rusak: %s', COALESCE(p_note, 'Tidak ada catatan')),
    p_branch_id,
    NOW()
  );

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
      v_entry_number := 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
        LPAD((SELECT COUNT(*) + 1 FROM journal_entries
              WHERE branch_id = p_branch_id
              AND DATE(created_at) = CURRENT_DATE)::TEXT, 4, '0');

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
        NOW(),
        format('Bahan Rusak %s: %s x%s %s', v_ref, v_material.name, p_quantity, COALESCE(v_material.unit, 'pcs')),
        'adjustment',
        v_record_id::TEXT,
        p_branch_id,
        'draft',
        v_spoilage_cost,
        v_spoilage_cost
      )
      RETURNING id INTO v_journal_id;

      -- Dr. Beban Lain-lain (8100)
      INSERT INTO journal_entry_lines (
        journal_entry_id,
        line_number,
        account_id,
        description,
        debit_amount,
        credit_amount
      ) VALUES (
        v_journal_id,
        1,
        v_beban_lain_id,
        format('Bahan rusak: %s x%s', v_material.name, p_quantity),
        v_spoilage_cost,
        0
      );

      -- Cr. Persediaan Bahan Baku (1320)
      INSERT INTO journal_entry_lines (
        journal_entry_id,
        line_number,
        account_id,
        description,
        debit_amount,
        credit_amount
      ) VALUES (
        v_journal_id,
        2,
        v_persediaan_bahan_id,
        format('Bahan keluar: %s x%s', v_material.name, p_quantity),
        0,
        v_spoilage_cost
      );

      UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
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
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION process_production_atomic IS
  'Atomic production: auto-fetch BOM, consume materials FIFO, create product batch + journal. WAJIB branch_id.';
COMMENT ON FUNCTION process_spoilage_atomic IS
  'Atomic spoilage: consume material FIFO + journal beban. WAJIB branch_id.';

-- ============================================================================
-- FILE: 05_delivery.sql
-- ============================================================================
-- ============================================================================
-- RPC 05: Delivery Atomic
-- Purpose: Proses pengiriman atomic dengan:
-- - Insert Delivery Header & Items (Support Partial)
-- - Consume product inventory (FIFO)
-- - Update delivery status (Partial vs Selesai)
-- - Create HPP journal entry
-- PENTING: Semua operasi WAJIB filter by branch_id
-- ============================================================================

-- Drop existing functions to avoid signature conflicts
DROP FUNCTION IF EXISTS process_delivery_atomic(UUID, UUID, UUID, DATE, TEXT);
DROP FUNCTION IF EXISTS process_delivery_atomic(UUID, JSONB, UUID, UUID, UUID, DATE, TEXT, TEXT);
DROP FUNCTION IF EXISTS process_delivery_atomic(UUID, JSONB, UUID, UUID, UUID, TIMESTAMP WITH TIME ZONE, TEXT, TEXT);

-- ============================================================================
-- 1. PROCESS DELIVERY ATOMIC
-- Proses pengiriman + HPP journal dalam satu transaksi
-- ============================================================================

CREATE OR REPLACE FUNCTION process_delivery_atomic(
  p_transaction_id TEXT,
  p_items JSONB,              -- Array: [{product_id, quantity, notes, unit, is_bonus, width, height, product_name}]
  p_branch_id UUID,           -- WAJIB: identitas cabang
  p_driver_id UUID DEFAULT NULL,
  p_helper_id UUID DEFAULT NULL,
  p_delivery_date DATE DEFAULT CURRENT_DATE,
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
  v_delivery_number INTEGER;
  v_transaction RECORD;
  v_item JSONB;
  v_consume_result RECORD;
  v_total_hpp NUMERIC := 0;
  v_hpp_details TEXT := '';
  v_journal_id UUID;
  v_entry_number TEXT;
  v_hpp_account_id UUID;
  v_persediaan_id UUID;
  v_customer_name TEXT;
  v_total_ordered NUMERIC;
  v_total_delivered NUMERIC;
  v_new_status TEXT;
  v_product_id UUID;
  v_qty NUMERIC;
  v_product_name TEXT;
  v_is_bonus BOOLEAN;
  v_item_notes TEXT;
  v_unit TEXT;
  v_width NUMERIC;
  v_height NUMERIC;
  v_txn_items JSONB;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, NULL::UUID,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT;
    RETURN;
  END IF;

  IF p_transaction_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, NULL::UUID,
      'Transaction ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, NULL::UUID,
      'No items to deliver'::TEXT;
    RETURN;
  END IF;

  -- Get transaction info
  SELECT
    t.id,
    t.ref,
    t.branch_id,
    t.customer_id,
    t.customer_name,
    t.items,
    t.status,
    t.is_office_sale,
    c.address as customer_address,
    c.phone as customer_phone
  INTO v_transaction
  FROM transactions t
  LEFT JOIN customers c ON c.id = t.customer_id
  WHERE t.id = p_transaction_id AND t.branch_id = p_branch_id;

  IF v_transaction.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, NULL::UUID,
      'Transaction not found in this branch'::TEXT;
    RETURN;
  END IF;

  -- ==================== CREATE DELIVERY HEADER ====================

  -- Calculate next delivery number
  SELECT COALESCE(MAX(d.delivery_number), 0) + 1 INTO v_delivery_number
  FROM deliveries d
  WHERE d.transaction_id = p_transaction_id;

  INSERT INTO deliveries (
    transaction_id,
    delivery_number,
    branch_id,
    customer_name,
    customer_address,
    customer_phone,
    driver_id,
    helper_id,
    delivery_date,
    status,
    hpp_total,
    notes,
    photo_url,
    created_at,
    updated_at
  ) VALUES (
    p_transaction_id,
    v_delivery_number,
    p_branch_id,
    v_transaction.customer_name,
    v_transaction.customer_address,
    v_transaction.customer_phone,
    p_driver_id,
    p_helper_id,
    p_delivery_date,
    'delivered',
    0, -- Will update later
    COALESCE(p_notes, format('Pengiriman ke-%s', v_delivery_number)),
    p_photo_url,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_delivery_id;

  -- ==================== PROCESS ITEMS & CONSUME STOCK ====================

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_product_name := v_item->>'product_name';
    v_is_bonus := COALESCE((v_item->>'is_bonus')::BOOLEAN, FALSE);
    v_item_notes := v_item->>'notes';
    v_unit := v_item->>'unit';
    v_width := (v_item->>'width')::NUMERIC;
    v_height := (v_item->>'height')::NUMERIC;

    IF v_qty > 0 THEN
       -- Insert Delivery Item
       INSERT INTO delivery_items (
         delivery_id,
         product_id,
         product_name,
         quantity_delivered,
         unit,
         is_bonus,
         width,
         height,
         notes,
         created_at
       ) VALUES (
         v_delivery_id,
         v_product_id,
         v_product_name,
         v_qty,
         COALESCE(v_unit, 'pcs'),
         v_is_bonus,
         v_width,
         v_height,
         v_item_notes,
         NOW()
       );

       -- Consume Stock (FIFO) - Only for Non-Office Sales
       -- Office sales deduct stock at transaction time
       IF NOT v_transaction.is_office_sale THEN
          SELECT * INTO v_consume_result
          FROM consume_inventory_fifo(
            v_product_id,
            p_branch_id,
            v_qty,
            COALESCE(v_transaction.ref, 'TR-UNKNOWN')
          );

          IF v_consume_result.success THEN
            v_total_hpp := v_total_hpp + v_consume_result.total_hpp;
            v_hpp_details := v_hpp_details || v_product_name || ' x' || v_qty || ', ';
          ELSE
            -- Log warning
            NULL;
          END IF;
       END IF;
    END IF;
  END LOOP;

  -- Update Delivery HPP Total
  UPDATE deliveries SET hpp_total = v_total_hpp WHERE id = v_delivery_id;

  -- ==================== UPDATE TRANSACTION STATUS ====================

  -- Check total ordered vs total delivered
  SELECT
    COALESCE(SUM(
      CASE WHEN (item->>'_isSalesMeta')::BOOLEAN THEN 0
      ELSE (item->>'quantity')::NUMERIC END
    ), 0)
  INTO v_total_ordered
  FROM jsonb_array_elements(v_transaction.items) item;

  SELECT
    COALESCE(SUM(di.quantity_delivered), 0)
  INTO v_total_delivered
  FROM delivery_items di
  JOIN deliveries d ON d.id = di.delivery_id
  WHERE d.transaction_id = p_transaction_id;

  IF v_total_delivered >= v_total_ordered THEN
    v_new_status := 'Selesai';
  ELSE
    v_new_status := 'Diantar Sebagian';
  END IF;

  UPDATE transactions
  SET
    status = v_new_status,
    delivery_status = 'delivered', -- Legacy field
    delivered_at = NOW(),
    updated_at = NOW()
  WHERE id = p_transaction_id;

  -- ==================== CREATE HPP JOURNAL ====================
  -- Only for Non-Office Sales. Office sales journal handled at transaction creation.

  IF NOT v_transaction.is_office_sale AND v_total_hpp > 0 THEN
    -- Get account IDs
    SELECT id INTO v_hpp_account_id
    FROM accounts
    WHERE code = '5100' AND branch_id = p_branch_id AND is_active = TRUE
    LIMIT 1;

    SELECT id INTO v_persediaan_id
    FROM accounts
    WHERE code = '1310' AND branch_id = p_branch_id AND is_active = TRUE
    LIMIT 1;

    IF v_hpp_account_id IS NOT NULL AND v_persediaan_id IS NOT NULL THEN
      v_entry_number := 'JE-' || TO_CHAR(p_delivery_date, 'YYYYMMDD') || '-' ||
        LPAD((SELECT COUNT(*) + 1 FROM journal_entries
              WHERE branch_id = p_branch_id
              AND DATE(created_at) = DATE(p_delivery_date))::TEXT, 4, '0');

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
        p_delivery_date,
        format('HPP Pengiriman %s: %s', v_transaction.ref, v_transaction.customer_name),
        'delivery', -- Set as 'delivery'
        v_delivery_id::TEXT,
        p_branch_id,
        'draft',
        v_total_hpp,
        v_total_hpp
      )
      RETURNING id INTO v_journal_id;

      -- Dr. HPP (5100)
      INSERT INTO journal_entry_lines (
        journal_entry_id,
        line_number,
        account_id,
        description,
        debit_amount,
        credit_amount
      ) VALUES (
        v_journal_id,
        1,
        v_hpp_account_id,
        format('HPP: %s', LEFT(v_hpp_details, 200)),
        v_total_hpp,
        0
      );

      -- Cr. Persediaan Barang Dagang (1310)
      INSERT INTO journal_entry_lines (
        journal_entry_id,
        line_number,
        account_id,
        description,
        debit_amount,
        credit_amount
      ) VALUES (
        v_journal_id,
        2,
        v_persediaan_id,
        format('Stock keluar: %s', v_transaction.ref),
        0,
        v_total_hpp
      );

      UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
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
            user_id,
            user_name,
            role,
            product_id,
            product_name,
            quantity,
            rate_per_qty,
            amount,
            transaction_id,
            delivery_id,
            ref,
            status,
            branch_id,
            created_at
          )
          SELECT 
            p_driver_id,
            (SELECT full_name FROM profiles WHERE id = p_driver_id),
            'driver',
            v_product_id,
            v_product_name,
            v_qty,
            cr.rate_per_qty,
            v_qty * cr.rate_per_qty,
            p_transaction_id,
            v_delivery_id,
            'DEL-' || v_delivery_id,
            'pending',
            p_branch_id,
            NOW()
          FROM commission_rules cr
          WHERE cr.product_id = v_product_id AND cr.role = 'driver' AND cr.rate_per_qty > 0;
        END IF;

        -- Helper Commission
        IF p_helper_id IS NOT NULL THEN
          INSERT INTO commission_entries (
            user_id,
            user_name,
            role,
            product_id,
            product_name,
            quantity,
            rate_per_qty,
            amount,
            transaction_id,
            delivery_id,
            ref,
            status,
            branch_id,
            created_at
          )
          SELECT 
            p_helper_id,
            (SELECT full_name FROM profiles WHERE id = p_helper_id),
            'helper',
            v_product_id,
            v_product_name,
            v_qty,
            cr.rate_per_qty,
            v_qty * cr.rate_per_qty,
            p_transaction_id,
            v_delivery_id,
            'DEL-' || v_delivery_id,
            'pending',
            p_branch_id,
            NOW()
          FROM commission_rules cr
          WHERE cr.product_id = v_product_id AND cr.role = 'helper' AND cr.rate_per_qty > 0;
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN QUERY SELECT
    TRUE,
    v_delivery_id,
    v_delivery_number,
    v_total_hpp,
    v_journal_id,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 2. PROCESS LAKU KANTOR (Immediate stock deduction)
-- Untuk penjualan yang langsung ambil stok (tidak perlu delivery)
-- ============================================================================

CREATE OR REPLACE FUNCTION process_laku_kantor_atomic(
  p_transaction_id TEXT,
  p_branch_id UUID           -- WAJIB: identitas cabang
)
RETURNS TABLE (
  success BOOLEAN,
  total_hpp NUMERIC,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_transaction RECORD;
  v_item RECORD;
  v_consume_result RECORD;
  v_total_hpp NUMERIC := 0;
  v_hpp_details TEXT := '';
  v_journal_id UUID;
  v_entry_number TEXT;
  v_hpp_account_id UUID;
  v_persediaan_id UUID;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, NULL::UUID,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT;
    RETURN;
  END IF;

  IF p_transaction_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, NULL::UUID,
      'Transaction ID is required'::TEXT;
    RETURN;
  END IF;

  -- Get transaction info
  SELECT
    t.id,
    t.ref,
    t.branch_id,
    t.customer_id,
    c.name as customer_name,
    t.is_laku_kantor
  INTO v_transaction
  FROM transactions t
  LEFT JOIN customers c ON c.id = t.customer_id
  WHERE t.id = p_transaction_id AND t.branch_id = p_branch_id;

  IF v_transaction.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, NULL::UUID,
      'Transaction not found in this branch'::TEXT;
    RETURN;
  END IF;

  -- ==================== CONSUME INVENTORY (FIFO) ====================

  FOR v_item IN
    SELECT
      ti.product_id,
      ti.quantity,
      p.name as product_name
    FROM transaction_items ti
    JOIN products p ON p.id = ti.product_id
    WHERE ti.transaction_id = p_transaction_id
      AND ti.quantity > 0
  LOOP
    SELECT * INTO v_consume_result
    FROM consume_inventory_fifo(
      v_item.product_id,
      p_branch_id,
      v_item.quantity,
      v_transaction.ref
    );

    IF NOT v_consume_result.success THEN
      RETURN QUERY SELECT FALSE, 0::NUMERIC, NULL::UUID,
        format('Gagal consume stok %s: %s', v_item.product_name, v_consume_result.error_message);
      RETURN;
    END IF;

    v_total_hpp := v_total_hpp + v_consume_result.total_hpp;
    v_hpp_details := v_hpp_details || v_item.product_name || ' x' || v_item.quantity || ', ';
  END LOOP;

  -- ==================== UPDATE TRANSACTION ====================

  UPDATE transactions
  SET
    delivery_status = 'delivered',
    delivered_at = NOW(),
    updated_at = NOW()
  WHERE id = p_transaction_id;

  -- ==================== CREATE HPP JOURNAL ====================

  IF v_total_hpp > 0 THEN
    SELECT id INTO v_hpp_account_id
    FROM accounts
    WHERE code = '5100' AND branch_id = p_branch_id AND is_active = TRUE
    LIMIT 1;

    SELECT id INTO v_persediaan_id
    FROM accounts
    WHERE code = '1310' AND branch_id = p_branch_id AND is_active = TRUE
    LIMIT 1;

    IF v_hpp_account_id IS NOT NULL AND v_persediaan_id IS NOT NULL THEN
      v_entry_number := 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
        LPAD((SELECT COUNT(*) + 1 FROM journal_entries
              WHERE branch_id = p_branch_id
              AND DATE(created_at) = CURRENT_DATE)::TEXT, 4, '0');

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
        NOW(),
        format('HPP Laku Kantor %s: %s', v_transaction.ref, COALESCE(v_transaction.customer_name, 'Customer')),
        'transaction',
        p_transaction_id::TEXT,
        p_branch_id,
        'draft',
        v_total_hpp,
        v_total_hpp
      )
      RETURNING id INTO v_journal_id;

      INSERT INTO journal_entry_lines (
        journal_entry_id,
        line_number,
        account_id,
        description,
        debit_amount,
        credit_amount
      ) VALUES (
        v_journal_id,
        1,
        v_hpp_account_id,
        format('HPP Laku Kantor: %s', RTRIM(v_hpp_details, ', ')),
        v_total_hpp,
        0
      );

      INSERT INTO journal_entry_lines (
        journal_entry_id,
        line_number,
        account_id,
        description,
        debit_amount,
        credit_amount
      ) VALUES (
        v_journal_id,
        2,
        v_persediaan_id,
        format('Stock keluar: %s', v_transaction.ref),
        0,
        v_total_hpp
      );

      UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
    END IF;
  END IF;

  RETURN QUERY SELECT
    TRUE,
    v_total_hpp,
    v_journal_id,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0::NUMERIC, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION process_delivery_atomic(TEXT, JSONB, UUID, UUID, UUID, DATE, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION process_laku_kantor_atomic(TEXT, UUID) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION process_delivery_atomic IS
  'Atomic delivery: insert delivery & items + consume FIFO + update status + HPP journal. WAJIB branch_id.';
COMMENT ON FUNCTION process_laku_kantor_atomic IS
  'Atomic laku kantor: immediate stock consume + HPP journal. WAJIB branch_id.';

-- ============================================================================
-- FILE: 05_delivery_no_stock.sql
-- ============================================================================
-- ============================================================================
-- RPC: Delivery Atomic NO STOCK
-- Purpose: Proses pengiriman TANPA MENGURANGI STOCK DAN TANPA KOMISI
-- Digunakan untuk migrasi data lama
-- ============================================================================

CREATE OR REPLACE FUNCTION process_delivery_atomic_no_stock(
  p_transaction_id TEXT,
  p_items JSONB,              -- Array: [{product_id, quantity, notes, unit, is_bonus, width, height, product_name}]
  p_branch_id UUID,           -- WAJIB: identitas cabang
  p_driver_id UUID DEFAULT NULL,
  p_helper_id UUID DEFAULT NULL,
  p_delivery_date DATE DEFAULT CURRENT_DATE,
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
  v_delivery_number INTEGER;
  v_transaction RECORD;
  v_item JSONB;
  v_total_hpp NUMERIC := 0;
  v_product_id UUID;
  v_qty NUMERIC;
  v_product_name TEXT;
  v_is_bonus BOOLEAN;
  v_item_notes TEXT;
  v_unit TEXT;
  v_width NUMERIC;
  v_height NUMERIC;
  v_total_ordered NUMERIC;
  v_total_delivered NUMERIC;
  v_new_status TEXT;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, NULL::UUID,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT;
    RETURN;
  END IF;

  IF p_transaction_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, NULL::UUID,
      'Transaction ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, NULL::UUID,
      'No items to deliver'::TEXT;
    RETURN;
  END IF;

  -- Get transaction info
  SELECT
    t.id,
    t.ref,
    t.branch_id,
    t.customer_id,
    t.customer_name,
    t.items,
    t.status,
    t.is_office_sale,
    c.address as customer_address,
    c.phone as customer_phone
  INTO v_transaction
  FROM transactions t
  LEFT JOIN customers c ON c.id = t.customer_id
  WHERE t.id = p_transaction_id AND t.branch_id = p_branch_id;

  IF v_transaction.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, NULL::UUID,
      'Transaction not found in this branch'::TEXT;
    RETURN;
  END IF;

  -- ==================== CREATE DELIVERY HEADER ====================

  -- Calculate next delivery number
  SELECT COALESCE(MAX(d.delivery_number), 0) + 1 INTO v_delivery_number
  FROM deliveries d
  WHERE d.transaction_id = p_transaction_id;

  INSERT INTO deliveries (
    transaction_id,
    delivery_number,
    branch_id,
    customer_name,
    customer_address,
    customer_phone,
    driver_id,
    helper_id,
    delivery_date,
    status,
    hpp_total,
    notes,
    photo_url,
    created_at,
    updated_at
  ) VALUES (
    p_transaction_id,
    v_delivery_number,
    p_branch_id,
    v_transaction.customer_name,
    v_transaction.customer_address,
    v_transaction.customer_phone,
    p_driver_id,
    p_helper_id,
    p_delivery_date,
    'delivered',
    0, -- HPP is 0 for legacy data migration
    COALESCE(p_notes, format('Pengiriman ke-%s (Migrasi)', v_delivery_number)),
    p_photo_url,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_delivery_id;

  -- ==================== PROCESS ITEMS (NO STOCK DEDUCTION) ====================

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_product_name := v_item->>'product_name';
    v_is_bonus := COALESCE((v_item->>'is_bonus')::BOOLEAN, FALSE);
    v_item_notes := v_item->>'notes';
    v_unit := v_item->>'unit';
    v_width := (v_item->>'width')::NUMERIC;
    v_height := (v_item->>'height')::NUMERIC;

    IF v_qty > 0 THEN
       -- Insert Delivery Item ONLY
       INSERT INTO delivery_items (
         delivery_id,
         product_id,
         product_name,
         quantity_delivered,
         unit,
         is_bonus,
         width,
         height,
         notes,
         created_at
       ) VALUES (
         v_delivery_id,
         v_product_id,
         v_product_name,
         v_qty,
         COALESCE(v_unit, 'pcs'),
         v_is_bonus,
         v_width,
         v_height,
         v_item_notes,
         NOW()
       );
    END IF;
  END LOOP;

  -- ==================== UPDATE TRANSACTION STATUS ====================

  -- Check total ordered vs total delivered
  SELECT
    COALESCE(SUM(
      CASE WHEN (item->>'_isSalesMeta')::BOOLEAN THEN 0
      ELSE (item->>'quantity')::NUMERIC END
    ), 0)
  INTO v_total_ordered
  FROM jsonb_array_elements(v_transaction.items) item;

  SELECT
    COALESCE(SUM(di.quantity_delivered), 0)
  INTO v_total_delivered
  FROM delivery_items di
  JOIN deliveries d ON d.id = di.delivery_id
  WHERE d.transaction_id = p_transaction_id;

  IF v_total_delivered >= v_total_ordered THEN
    v_new_status := 'Selesai';
  ELSE
    v_new_status := 'Diantar Sebagian';
  END IF;

  UPDATE transactions
  SET
    status = v_new_status,
    delivery_status = 'delivered', -- Legacy field
    delivered_at = NOW(),
    updated_at = NOW()
  WHERE id = p_transaction_id;

  -- NOTE: NO JOURNAL ENTRY CREATED
  -- NOTE: NO COMMISSION ENTRY CREATED

  RETURN QUERY SELECT
    TRUE,
    v_delivery_id,
    v_delivery_number,
    0::NUMERIC, -- Total HPP is 0
    NULL::UUID, -- No Journal
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION process_delivery_atomic_no_stock(TEXT, JSONB, UUID, UUID, UUID, DATE, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- FILE: 06_payment.sql
-- ============================================================================
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
    v_entry_number := 'JE-' || TO_CHAR(p_payment_date, 'YYYYMMDD') || '-' ||
      LPAD((SELECT COUNT(*) + 1 FROM journal_entries
            WHERE branch_id = p_branch_id
            AND DATE(created_at) = p_payment_date)::TEXT, 4, '0');

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
      p_payment_date,
      format('Terima pembayaran piutang: %s', COALESCE(v_receivable.customer_name, 'Customer')),
      'receivable_payment',
      v_payment_id::TEXT,
      p_branch_id,
      'draft',
      p_amount,
      p_amount
    )
    RETURNING id INTO v_journal_id;

    -- Dr. Kas/Bank
    INSERT INTO journal_entry_lines (
      journal_entry_id,
      line_number,
      account_id,
      description,
      debit_amount,
      credit_amount
    ) VALUES (
      v_journal_id,
      1,
      v_kas_account_id,
      format('Terima dari %s', COALESCE(v_receivable.customer_name, 'Customer')),
      p_amount,
      0
    );

    -- Cr. Piutang Usaha
    INSERT INTO journal_entry_lines (
      journal_entry_id,
      line_number,
      account_id,
      description,
      debit_amount,
      credit_amount
    ) VALUES (
      v_journal_id,
      2,
      v_piutang_account_id,
      format('Pelunasan piutang: %s', COALESCE(v_receivable.customer_name, 'Customer')),
      0,
      p_amount
    );

    UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
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
    v_entry_number := 'JE-' || TO_CHAR(p_payment_date, 'YYYYMMDD') || '-' ||
      LPAD((SELECT COUNT(*) + 1 FROM journal_entries
            WHERE branch_id = p_branch_id
            AND DATE(created_at) = p_payment_date)::TEXT, 4, '0');

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
      p_payment_date,
      format('Bayar hutang ke: %s', COALESCE(v_payable.supplier_name, 'Supplier')),
      'payable_payment',
      v_payment_id::TEXT,
      p_branch_id,
      'draft',
      p_amount,
      p_amount
    )
    RETURNING id INTO v_journal_id;

    -- Dr. Hutang Usaha
    INSERT INTO journal_entry_lines (
      journal_entry_id,
      line_number,
      account_id,
      description,
      debit_amount,
      credit_amount
    ) VALUES (
      v_journal_id,
      1,
      v_hutang_account_id,
      format('Bayar ke %s', COALESCE(v_payable.supplier_name, 'Supplier')),
      p_amount,
      0
    );

    -- Cr. Kas/Bank
    INSERT INTO journal_entry_lines (
      journal_entry_id,
      line_number,
      account_id,
      description,
      debit_amount,
      credit_amount
    ) VALUES (
      v_journal_id,
      2,
      v_kas_account_id,
      format('Pembayaran hutang: %s', COALESCE(v_payable.supplier_name, 'Supplier')),
      0,
      p_amount
    );

    UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
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
      v_entry_number := 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
        LPAD((SELECT COUNT(*) + 1 FROM journal_entries WHERE branch_id = p_branch_id AND DATE(created_at) = CURRENT_DATE)::TEXT, 4, '0');

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
        CURRENT_DATE,
        COALESCE(p_description, 'Hutang Baru: ' || p_supplier_name),
        'accounts_payable',
        v_payable_id,
        p_branch_id,
        'draft',
        p_amount,
        p_amount
      )
      RETURNING id INTO v_journal_id;

      -- Dr. Lawan (Expense/Asset)
      INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
      VALUES (v_journal_id, 1, v_lawan_account_id, COALESCE(p_description, 'Hutang Baru'), p_amount, 0);

      -- Cr. Hutang Usaha
      INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
      VALUES (v_journal_id, 2, v_hutang_account_id, COALESCE(p_description, 'Hutang Baru'), 0, p_amount);

      UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
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
  'Atomic creation of accounts payable with optional automatic journal entry. WAJIB branch_id.';


-- ============================================================================
-- FILE: 07_void.sql
-- ============================================================================
-- ============================================================================
-- RPC 07: Void Operations Atomic
-- Purpose: Void transaksi/delivery dengan:
-- - Restore inventory
-- - Void journal entries
-- - Update status
-- PENTING: Semua operasi WAJIB filter by branch_id
-- ============================================================================

-- Drop existing functions (multiple signatures)
DROP FUNCTION IF EXISTS void_transaction_atomic(UUID, UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS void_transaction_atomic(TEXT, UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS void_delivery_atomic(UUID, UUID, TEXT, UUID);

-- ============================================================================
-- 1. VOID TRANSACTION ATOMIC
-- Void transaksi: void journals + update status
-- Stock restore handled per-delivery via void_delivery_atomic
-- NOTE: transactions table tidak punya kolom is_voided - hanya update status
-- NOTE: items disimpan dalam JSONB transactions.items, bukan transaction_items table
-- ============================================================================

-- void_transaction_atomic MOVED TO 09_transaction.sql
-- Function definition removed to prevent conflicts



-- ============================================================================
-- 2. VOID DELIVERY ATOMIC
-- Void pengiriman saja (transaksi tetap valid)
-- PERBAIKAN: Restore dari delivery_items, bukan transaction_items
-- NOTE: deliveries table tidak punya kolom status/voided - hanya update timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION void_delivery_atomic(
  p_delivery_id UUID,
  p_branch_id UUID,           -- WAJIB: identitas cabang
  p_reason TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  items_restored INTEGER,
  journals_voided INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_delivery RECORD;
  v_transaction RECORD;
  v_item RECORD;
  v_restore_result RECORD;
  v_items_restored INTEGER := 0;
  v_journals_voided INTEGER := 0;
  v_total_ordered NUMERIC;
  v_total_delivered NUMERIC;
  v_new_status TEXT;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT;
    RETURN;
  END IF;

  IF p_delivery_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0,
      'Delivery ID is required'::TEXT;
    RETURN;
  END IF;

  -- Get delivery info (deliveries table tidak punya kolom status)
  SELECT
    d.id,
    d.transaction_id,
    d.branch_id,
    d.delivery_number
  INTO v_delivery
  FROM deliveries d
  WHERE d.id = p_delivery_id AND d.branch_id = p_branch_id;

  IF v_delivery.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0,
      'Delivery not found in this branch'::TEXT;
    RETURN;
  END IF;

  -- Get transaction info (transaction_id is TEXT in deliveries table)
  SELECT * INTO v_transaction
  FROM transactions
  WHERE id::TEXT = v_delivery.transaction_id;

  IF v_transaction.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0,
      'Transaction not found for this delivery'::TEXT;
    RETURN;
  END IF;

  -- ==================== RESTORE INVENTORY ====================
  -- Restore dari delivery_items (yang benar-benar dikirim)

  FOR v_item IN
    SELECT
      di.product_id,
      di.quantity_delivered as quantity,
      di.product_name,
      COALESCE(p.cost_price, p.base_price, 0) as unit_cost
    FROM delivery_items di
    LEFT JOIN products p ON p.id = di.product_id
    WHERE di.delivery_id = p_delivery_id
      AND di.quantity_delivered > 0
  LOOP
    SELECT * INTO v_restore_result
    FROM restore_inventory_fifo(
      v_item.product_id,
      p_branch_id,
      v_item.quantity,
      v_item.unit_cost,
      format('void_delivery_%s', p_delivery_id)
    );

    IF v_restore_result.success THEN
      v_items_restored := v_items_restored + 1;
    END IF;
  END LOOP;

  -- ==================== VOID JOURNALS ====================

  UPDATE journal_entries
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_reason = COALESCE(p_reason, 'Delivery voided')
  WHERE reference_id = p_delivery_id::TEXT
    AND branch_id = p_branch_id
    AND is_voided = FALSE;

  GET DIAGNOSTICS v_journals_voided = ROW_COUNT;

  -- ==================== DELETE COMMISSIONS ====================

  DELETE FROM commission_entries
  WHERE delivery_id = p_delivery_id;

  -- ==================== UPDATE TRANSACTION STATUS ====================
  -- Hitung ulang status berdasarkan sisa delivery yang masih valid

  -- Get total ordered from transaction items
  SELECT
    COALESCE(SUM(
      CASE WHEN (item->>'_isSalesMeta')::BOOLEAN THEN 0
      ELSE (item->>'quantity')::NUMERIC END
    ), 0)
  INTO v_total_ordered
  FROM jsonb_array_elements(v_transaction.items) item;

  -- Get total delivered from remaining deliveries (exclude current one being voided)
  SELECT
    COALESCE(SUM(di.quantity_delivered), 0)
  INTO v_total_delivered
  FROM delivery_items di
  JOIN deliveries d ON d.id = di.delivery_id
  WHERE d.transaction_id = v_delivery.transaction_id
    AND d.id != p_delivery_id;  -- Exclude current delivery being voided

  -- Determine new status
  IF v_total_delivered >= v_total_ordered AND v_total_delivered > 0 THEN
    v_new_status := 'Selesai';
  ELSIF v_total_delivered > 0 THEN
    v_new_status := 'Diantar Sebagian';
  ELSE
    v_new_status := 'Pesanan Masuk';
  END IF;

  UPDATE transactions
  SET
    status = v_new_status
  WHERE id = v_transaction.id;

  -- Note: Delivery record deletion will be handled by frontend after RPC returns success
  -- This RPC only handles: restore inventory + void journals + update transaction status

  RETURN QUERY SELECT
    TRUE,
    v_items_restored,
    v_journals_voided,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0, 0, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 3. VOID PRODUCTION ATOMIC
-- Void produksi dan kembalikan material
-- NOTE: Tabel production adalah 'production_records', bukan 'production_batches'
-- NOTE: Material yang dikonsumsi disimpan dalam bom_snapshot JSONB
-- ============================================================================

CREATE OR REPLACE FUNCTION void_production_atomic(
  p_production_id UUID,
  p_branch_id UUID,           -- WAJIB: identitas cabang
  p_reason TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  materials_restored INTEGER,
  products_consumed INTEGER,
  journals_voided INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_production RECORD;
  v_material JSONB;
  v_restore_result RECORD;
  v_consume_result RECORD;
  v_materials_restored INTEGER := 0;
  v_products_consumed INTEGER := 0;
  v_journals_voided INTEGER := 0;
  v_material_id UUID;
  v_material_qty NUMERIC;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0, 0,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT;
    RETURN;
  END IF;

  IF p_production_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0, 0,
      'Production ID is required'::TEXT;
    RETURN;
  END IF;

  -- Get production info from production_records (actual table name)
  SELECT
    pr.id,
    pr.product_id,
    pr.branch_id,
    pr.quantity,
    pr.bom_snapshot,
    pr.consume_bom
  INTO v_production
  FROM production_records pr
  WHERE pr.id = p_production_id AND pr.branch_id = p_branch_id;

  IF v_production.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0, 0,
      'Production not found in this branch'::TEXT;
    RETURN;
  END IF;

  -- ==================== CONSUME PRODUCED PRODUCTS ====================
  -- Reverse: consume the products that were produced

  SELECT * INTO v_consume_result
  FROM consume_inventory_fifo(
    v_production.product_id,
    p_branch_id,
    v_production.quantity,
    format('void_prod_%s', p_production_id)
  );

  IF v_consume_result.success THEN
    v_products_consumed := 1;
  END IF;

  -- ==================== RESTORE MATERIALS ====================
  -- Get materials from bom_snapshot JSONB and restore them

  IF v_production.bom_snapshot IS NOT NULL AND v_production.consume_bom = TRUE THEN
    FOR v_material IN SELECT * FROM jsonb_array_elements(v_production.bom_snapshot)
    LOOP
      v_material_id := (v_material->>'material_id')::UUID;
      v_material_qty := (v_material->>'quantity')::NUMERIC * v_production.quantity;

      IF v_material_id IS NOT NULL AND v_material_qty > 0 THEN
        SELECT * INTO v_restore_result
        FROM restore_material_fifo(
          v_material_id,
          p_branch_id,
          v_material_qty,
          0, -- Unit cost (will be estimated)
          format('void_prod_%s', p_production_id),
          'void_production'
        );

        IF v_restore_result.success THEN
          v_materials_restored := v_materials_restored + 1;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- ==================== VOID JOURNALS ====================

  UPDATE journal_entries
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_reason = COALESCE(p_reason, 'Production voided')
  WHERE reference_id = p_production_id::TEXT
    AND branch_id = p_branch_id
    AND is_voided = FALSE;

  GET DIAGNOSTICS v_journals_voided = ROW_COUNT;

  -- ==================== DELETE PRODUCTION RECORD ====================
  -- production_records tidak punya status column - langsung delete

  DELETE FROM production_records
  WHERE id = p_production_id;

  RETURN QUERY SELECT
    TRUE,
    v_materials_restored,
    v_products_consumed,
    v_journals_voided,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0, 0, 0, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION void_transaction_atomic(TEXT, UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION void_delivery_atomic(UUID, UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION void_production_atomic(UUID, UUID, TEXT, UUID) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION void_transaction_atomic IS
  'Atomic void transaction: restore inventory + void journals. WAJIB branch_id.';
COMMENT ON FUNCTION void_delivery_atomic IS
  'Atomic void delivery: restore inventory + void journals. WAJIB branch_id.';
COMMENT ON FUNCTION void_production_atomic IS
  'Atomic void production: consume product + restore materials + void journals. WAJIB branch_id.';

-- ============================================================================
-- FILE: 08_purchase_order.sql
-- ============================================================================
-- ============================================================================
-- RPC 08: Purchase Order Atomic
-- Purpose: Proses penerimaan PO dengan:
-- - Add inventory batches (FIFO tracking)
-- - Update material/product stock
-- - Create material movements
-- PENTING: Semua operasi WAJIB filter by branch_id
-- ============================================================================

-- Drop existing functions
DROP FUNCTION IF EXISTS receive_po_atomic(UUID, UUID, DATE, UUID, TEXT);

-- ============================================================================
-- 1. RECEIVE PO ATOMIC
-- Terima barang dari PO, tambahkan ke inventory batch untuk FIFO tracking
-- ============================================================================

CREATE OR REPLACE FUNCTION receive_po_atomic(
  p_po_id UUID,
  p_branch_id UUID,           -- WAJIB: identitas cabang
  p_received_date DATE DEFAULT CURRENT_DATE,
  p_user_id UUID DEFAULT NULL,
  p_user_name TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  materials_received INTEGER,
  products_received INTEGER,
  batches_created INTEGER,
  error_message TEXT
) AS $$
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
        movement_type,
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
        p_po_id::TEXT,
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
      movement_type,
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
      p_po_id::TEXT,
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
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 2. DELETE PO ATOMIC
-- Hapus PO dengan validasi dan rollback
-- ============================================================================

CREATE OR REPLACE FUNCTION delete_po_atomic(
  p_po_id UUID,
  p_branch_id UUID,           -- WAJIB: identitas cabang
  p_skip_validation BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  success BOOLEAN,
  batches_deleted INTEGER,
  stock_rolled_back INTEGER,
  journals_voided INTEGER,
  error_message TEXT
) AS $$
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
  WHERE reference_id = p_po_id::TEXT
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
  WHERE reference_id = p_po_id::TEXT
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
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION receive_po_atomic(UUID, UUID, DATE, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_po_atomic(UUID, UUID, BOOLEAN) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION receive_po_atomic IS
  'Atomic PO receive: add inventory batches + update stock + create movements. WAJIB branch_id.';
COMMENT ON FUNCTION delete_po_atomic IS
  'Atomic PO delete: validate + rollback stock + void journals + delete records. WAJIB branch_id.';

-- ============================================================================
-- FILE: 09_transaction.sql
-- ============================================================================
-- ============================================================================
-- RPC 09: Transaction Atomic
-- Purpose: Proses transaksi penjualan atomic dengan:
-- - Insert Transaction Header & Items
-- - Consume product inventory FIFO (untuk Laku Kantor)
-- - Calculate HPP dari FIFO batches
-- - Create sales journal entry (Kas/Piutang, Pendapatan, HPP, Persediaan)
-- - Generate sales commission
-- PENTING: Semua operasi WAJIB filter by branch_id
-- ============================================================================

-- Drop existing functions
DROP FUNCTION IF EXISTS create_transaction_atomic(JSONB, JSONB, UUID, UUID, TEXT, TEXT);

-- ============================================================================
-- 1. CREATE TRANSACTION ATOMIC
-- Membuat transaksi penjualan dengan semua operasi dalam satu transaksi
-- ============================================================================

CREATE OR REPLACE FUNCTION create_transaction_atomic(
  p_transaction JSONB,        -- Transaction data
  p_items JSONB,              -- Array items: [{product_id, product_name, quantity, price, discount, is_bonus, cost_price, width, height, unit}]
  p_branch_id UUID,           -- WAJIB
  p_cashier_id UUID DEFAULT NULL,
  p_cashier_name TEXT DEFAULT NULL,
  p_quotation_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  transaction_id TEXT,
  total_hpp NUMERIC,
  total_hpp_bonus NUMERIC,
  journal_id UUID,
  items_count INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_transaction_id TEXT;
  v_customer_id UUID;
  v_customer_name TEXT;
  v_total NUMERIC;
  v_paid_amount NUMERIC;
  v_payment_method TEXT;
  v_is_office_sale BOOLEAN;
  v_date DATE;
  v_notes TEXT;
  v_sales_id UUID;
  v_sales_name TEXT;

  v_item JSONB;
  v_product_id UUID;
  v_product_name TEXT;
  v_quantity NUMERIC;
  v_price NUMERIC;
  v_discount NUMERIC;
  v_is_bonus BOOLEAN;
  v_cost_price NUMERIC;
  v_unit TEXT;
  v_width NUMERIC;
  v_height NUMERIC;

  v_total_hpp NUMERIC := 0;
  v_total_hpp_bonus NUMERIC := 0;
  v_fifo_result RECORD;
  v_item_hpp NUMERIC;
  v_items_inserted INTEGER := 0;

  v_journal_id UUID;
  v_kas_account_id TEXT;  -- accounts.id is TEXT not UUID
  v_piutang_account_id TEXT;
  v_pendapatan_account_id TEXT;
  v_hpp_account_id TEXT;
  v_hpp_bonus_account_id TEXT;
  v_persediaan_account_id TEXT;

  v_journal_lines JSONB := '[]'::JSONB;
  v_items_array JSONB := '[]'::JSONB;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, 0::NUMERIC, 0::NUMERIC, NULL::UUID, 0,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT;
    RETURN;
  END IF;

  IF p_transaction IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, 0::NUMERIC, 0::NUMERIC, NULL::UUID, 0,
      'Transaction data is required'::TEXT;
    RETURN;
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, 0::NUMERIC, 0::NUMERIC, NULL::UUID, 0,
      'Items are required'::TEXT;
    RETURN;
  END IF;

  -- ==================== PARSE TRANSACTION DATA ====================

  v_transaction_id := COALESCE(
    p_transaction->>'id',
    'TRX-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 100000)::TEXT, 5, '0')
  );
  v_customer_id := (p_transaction->>'customer_id')::UUID;
  v_customer_name := p_transaction->>'customer_name';
  v_total := COALESCE((p_transaction->>'total')::NUMERIC, 0);
  v_paid_amount := COALESCE((p_transaction->>'paid_amount')::NUMERIC, 0);
  -- Normalize payment_method to valid values: cash, bank_transfer, check, digital_wallet
  v_payment_method := CASE LOWER(COALESCE(p_transaction->>'payment_method', 'cash'))
    WHEN 'tunai' THEN 'cash'
    WHEN 'cash' THEN 'cash'
    WHEN 'transfer' THEN 'bank_transfer'
    WHEN 'bank_transfer' THEN 'bank_transfer'
    WHEN 'bank' THEN 'bank_transfer'
    WHEN 'cek' THEN 'check'
    WHEN 'check' THEN 'check'
    WHEN 'giro' THEN 'check'
    WHEN 'digital' THEN 'digital_wallet'
    WHEN 'digital_wallet' THEN 'digital_wallet'
    WHEN 'e-wallet' THEN 'digital_wallet'
    ELSE 'cash'
  END;
  v_is_office_sale := COALESCE((p_transaction->>'is_office_sale')::BOOLEAN, FALSE);
  v_date := COALESCE((p_transaction->>'date')::DATE, CURRENT_DATE);
  v_notes := p_transaction->>'notes';
  v_sales_id := (p_transaction->>'sales_id')::UUID;
  v_sales_name := p_transaction->>'sales_name';

  -- ==================== GET ACCOUNT IDS ====================

  SELECT id INTO v_kas_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1110' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_piutang_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1210' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_pendapatan_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '4100' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_hpp_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '5100' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_hpp_bonus_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '5210' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_persediaan_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1310' AND is_active = TRUE LIMIT 1;

  -- ==================== PROCESS ITEMS & CALCULATE HPP ====================

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_product_name := v_item->>'product_name';
    v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 0);
    v_price := COALESCE((v_item->>'price')::NUMERIC, 0);
    v_discount := COALESCE((v_item->>'discount')::NUMERIC, 0);
    v_is_bonus := COALESCE((v_item->>'is_bonus')::BOOLEAN, FALSE);
    v_cost_price := COALESCE((v_item->>'cost_price')::NUMERIC, 0);
    v_unit := v_item->>'unit';
    v_width := (v_item->>'width')::NUMERIC;
    v_height := (v_item->>'height')::NUMERIC;

    IF v_product_id IS NOT NULL AND v_quantity > 0 THEN
      -- Calculate HPP using FIFO
      IF v_is_office_sale THEN
        -- Office Sale: Consume inventory immediately
        SELECT * INTO v_fifo_result FROM consume_inventory_fifo(
          v_product_id,
          p_branch_id,
          v_quantity,
          v_transaction_id
        );

        IF v_fifo_result.success THEN
          v_item_hpp := v_fifo_result.total_hpp;
        ELSE
          -- Fallback to cost_price
          v_item_hpp := v_cost_price * v_quantity;
        END IF;
      ELSE
        -- Non-Office Sale: Calculate only (consume at delivery)
        SELECT f.total_hpp INTO v_item_hpp FROM calculate_fifo_cost(
          v_product_id,
          p_branch_id,
          v_quantity
        ) f;
        v_item_hpp := COALESCE(v_item_hpp, v_cost_price * v_quantity);
      END IF;

      -- Accumulate HPP
      IF v_is_bonus THEN
        v_total_hpp_bonus := v_total_hpp_bonus + v_item_hpp;
      ELSE
        v_total_hpp := v_total_hpp + v_item_hpp;
      END IF;

      -- Build item for storage
      v_items_array := v_items_array || jsonb_build_object(
        'productId', v_product_id,
        'productName', v_product_name,
        'quantity', v_quantity,
        'price', v_price,
        'discount', v_discount,
        'isBonus', v_is_bonus,
        'costPrice', v_cost_price,
        'hppAmount', v_item_hpp,
        'unit', v_unit,
        'width', v_width,
        'height', v_height
      );

      v_items_inserted := v_items_inserted + 1;
    END IF;
  END LOOP;

  -- ==================== INSERT TRANSACTION ====================

  INSERT INTO transactions (
    id,
    branch_id,
    customer_id,
    customer_name,
    cashier_id,
    cashier_name,
    sales_id,
    sales_name,
    order_date,
    items,
    total,
    paid_amount,
    payment_status,
    status,
    delivery_status,
    is_office_sale,
    notes,
    created_at,
    updated_at
  ) VALUES (
    v_transaction_id,
    p_branch_id,
    v_customer_id,
    v_customer_name,
    p_cashier_id,
    p_cashier_name,
    v_sales_id,
    v_sales_name,
    v_date,
    v_items_array,
    v_total,
    v_paid_amount,
    CASE WHEN v_paid_amount >= v_total THEN 'Lunas' ELSE 'Belum Lunas' END,
    'Pesanan Masuk',
    CASE WHEN v_is_office_sale THEN 'Completed' ELSE 'Pending' END,
    v_is_office_sale,
    v_notes,
    NOW(),
    NOW()
  );

  -- ==================== INSERT PAYMENT RECORD ====================

  IF v_paid_amount > 0 THEN
    INSERT INTO transaction_payments (
      transaction_id,
      branch_id,
      amount,
      payment_method,
      payment_date,
      account_name,
      description,
      notes,
      paid_by_user_name,
      created_by,
      created_at
    ) VALUES (
      v_transaction_id,
      p_branch_id,
      v_paid_amount,
      v_payment_method,
      v_date,
      COALESCE(v_payment_method, 'Tunai'),
      'Pembayaran transaksi ' || v_transaction_id,
      'Initial Payment for ' || v_transaction_id,
      COALESCE(p_cashier_name, 'System'),
      p_cashier_id,
      NOW()
    );
  END IF;

  -- ==================== UPDATE QUOTATION IF EXISTS ====================

  IF p_quotation_id IS NOT NULL THEN
    UPDATE quotations
    SET transaction_id = v_transaction_id, status = 'Disetujui', updated_at = NOW()
    WHERE id = p_quotation_id;
  END IF;

  -- ==================== CREATE SALES JOURNAL ====================

  IF v_total > 0 THEN
    -- Build journal lines
    v_journal_lines := '[]'::JSONB;

    -- Debit: Kas atau Piutang
    IF v_paid_amount >= v_total THEN
      -- Lunas: Debit Kas
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', '1110',
        'debit_amount', v_total,
        'credit_amount', 0,
        'description', 'Penerimaan kas dari penjualan'
      );
    ELSIF v_paid_amount > 0 THEN
      -- Bayar sebagian: Debit Kas + Piutang
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', '1110',
        'debit_amount', v_paid_amount,
        'credit_amount', 0,
        'description', 'Penerimaan kas dari penjualan'
      );
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', '1210',
        'debit_amount', v_total - v_paid_amount,
        'credit_amount', 0,
        'description', 'Piutang usaha'
      );
    ELSE
      -- Belum bayar: Debit Piutang
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', '1210',
        'debit_amount', v_total,
        'credit_amount', 0,
        'description', 'Piutang usaha'
      );
    END IF;

    -- Credit: Pendapatan
    v_journal_lines := v_journal_lines || jsonb_build_object(
      'account_code', '4100',
      'debit_amount', 0,
      'credit_amount', v_total,
      'description', 'Pendapatan penjualan'
    );

    -- Debit: HPP (regular items)
    IF v_total_hpp > 0 THEN
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', '5100',
        'debit_amount', v_total_hpp,
        'credit_amount', 0,
        'description', 'Harga Pokok Penjualan'
      );
    END IF;

    -- Debit: HPP Bonus (bonus items)
    IF v_total_hpp_bonus > 0 THEN
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', '5210',
        'debit_amount', v_total_hpp_bonus,
        'credit_amount', 0,
        'description', 'HPP Bonus/Gratis'
      );
    END IF;

    -- Credit: Persediaan
    IF (v_total_hpp + v_total_hpp_bonus) > 0 THEN
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', '1310',
        'debit_amount', 0,
        'credit_amount', v_total_hpp + v_total_hpp_bonus,
        'description', 'Pengurangan persediaan'
      );
    END IF;

    -- Create journal using existing RPC
    SELECT * INTO v_fifo_result FROM create_journal_atomic(
      p_branch_id,
      v_date,
      'Penjualan ke ' || COALESCE(v_customer_name, 'Umum') || ' - ' || v_transaction_id,
      'transaction',
      v_transaction_id,
      v_journal_lines,
      TRUE
    );

    IF v_fifo_result.success THEN
      v_journal_id := v_fifo_result.journal_id;
    END IF;
  END IF;

  -- ==================== GENERATE SALES COMMISSION ====================

  IF v_sales_id IS NOT NULL AND v_total > 0 THEN
    BEGIN
      INSERT INTO commission_entries (
        employee_id,
        transaction_id,
        delivery_id,
        product_id,
        quantity,
        amount,
        commission_type,
        status,
        branch_id,
        entry_date,
        created_at
      )
      SELECT
        v_sales_id,
        v_transaction_id,
        NULL,
        (item->>'productId')::UUID,
        (item->>'quantity')::NUMERIC,
        COALESCE(
          (SELECT cr.amount FROM commission_rules cr
           WHERE cr.product_id = (item->>'productId')::UUID
           AND cr.role = 'sales'
           AND cr.is_active = TRUE LIMIT 1),
          0
        ) * (item->>'quantity')::NUMERIC,
        'sales',
        'pending',
        p_branch_id,
        v_date,
        NOW()
      FROM jsonb_array_elements(v_items_array) AS item
      WHERE (item->>'isBonus')::BOOLEAN IS NOT TRUE
        AND (item->>'quantity')::NUMERIC > 0;
    EXCEPTION WHEN OTHERS THEN
      -- Commission generation failed, but don't fail the transaction
      NULL;
    END;
  END IF;

  -- ==================== MARK CUSTOMER AS VISITED ====================

  IF v_customer_id IS NOT NULL THEN
    BEGIN
      UPDATE customers
      SET
        last_transaction_date = NOW(),
        last_visited_at = NOW(),
        last_visited_by = p_cashier_id,
        updated_at = NOW()
      WHERE id = v_customer_id;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  -- ==================== SUCCESS ====================

  RETURN QUERY SELECT
    TRUE,
    v_transaction_id,
    v_total_hpp,
    v_total_hpp_bonus,
    v_journal_id,
    v_items_inserted,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::TEXT, 0::NUMERIC, 0::NUMERIC, NULL::UUID, 0, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 2. UPDATE TRANSACTION ATOMIC
-- Update transaksi dengan recalculate journal
-- ============================================================================

CREATE OR REPLACE FUNCTION update_transaction_atomic(
  p_transaction_id TEXT,
  p_transaction JSONB,        -- Updated transaction data
  p_branch_id UUID,           -- WAJIB
  p_user_id UUID DEFAULT NULL,
  p_user_name TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  transaction_id TEXT,
  journal_id UUID,
  changes_made TEXT[],
  error_message TEXT
) AS $$
DECLARE
  v_old_transaction RECORD;
  v_new_total NUMERIC;
  v_new_paid_amount NUMERIC;
  v_changes TEXT[] := '{}';
  v_journal_id UUID;
  v_journal_lines JSONB := '[]'::JSONB;
  v_customer_name TEXT;
  v_date DATE;
  v_total_hpp NUMERIC := 0;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, '{}'::TEXT[],
      'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_transaction_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, '{}'::TEXT[],
      'Transaction ID is required'::TEXT;
    RETURN;
  END IF;

  -- Get existing transaction
  SELECT * INTO v_old_transaction
  FROM transactions
  WHERE id = p_transaction_id AND branch_id = p_branch_id;

  IF v_old_transaction.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, '{}'::TEXT[],
      'Transaction not found in this branch'::TEXT;
    RETURN;
  END IF;

  -- ==================== PARSE NEW DATA ====================

  v_new_total := COALESCE((p_transaction->>'total')::NUMERIC, v_old_transaction.total);
  v_new_paid_amount := COALESCE((p_transaction->>'paid_amount')::NUMERIC, v_old_transaction.paid_amount);
  v_customer_name := COALESCE(p_transaction->>'customer_name', v_old_transaction.customer_name);
  v_date := COALESCE(v_old_transaction.order_date, CURRENT_DATE);

  -- Detect changes
  IF v_new_total != v_old_transaction.total THEN
    v_changes := array_append(v_changes, 'total');
  END IF;
  IF v_new_paid_amount != v_old_transaction.paid_amount THEN
    v_changes := array_append(v_changes, 'paid_amount');
  END IF;

  -- ==================== UPDATE TRANSACTION ====================

  UPDATE transactions SET
    total = v_new_total,
    paid_amount = v_new_paid_amount,
    payment_status = CASE WHEN v_new_paid_amount >= v_new_total THEN 'Lunas' ELSE 'Belum Lunas' END,
    customer_name = v_customer_name,
    notes = COALESCE(p_transaction->>'notes', notes),
    updated_at = NOW()
  WHERE id = p_transaction_id;

  -- ==================== UPDATE JOURNAL IF AMOUNTS CHANGED ====================

  IF 'total' = ANY(v_changes) OR 'paid_amount' = ANY(v_changes) THEN
    -- Void old journal
    UPDATE journal_entries
    SET is_voided = TRUE, voided_at = NOW(), voided_reason = 'Transaction updated'
    WHERE reference_type = 'transaction'
      AND reference_id = p_transaction_id
      AND branch_id = p_branch_id
      AND is_voided = FALSE;

    -- Calculate HPP from items
    SELECT COALESCE(SUM((item->>'hppAmount')::NUMERIC), 0) INTO v_total_hpp
    FROM jsonb_array_elements(v_old_transaction.items) AS item;

    -- Build new journal lines
    v_journal_lines := '[]'::JSONB;

    -- Debit: Kas atau Piutang
    IF v_new_paid_amount >= v_new_total THEN
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', '1110',
        'debit_amount', v_new_total,
        'credit_amount', 0,
        'description', 'Penerimaan kas dari penjualan'
      );
    ELSIF v_new_paid_amount > 0 THEN
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', '1110',
        'debit_amount', v_new_paid_amount,
        'credit_amount', 0,
        'description', 'Penerimaan kas dari penjualan'
      );
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', '1210',
        'debit_amount', v_new_total - v_new_paid_amount,
        'credit_amount', 0,
        'description', 'Piutang usaha'
      );
    ELSE
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', '1210',
        'debit_amount', v_new_total,
        'credit_amount', 0,
        'description', 'Piutang usaha'
      );
    END IF;

    -- Credit: Pendapatan
    v_journal_lines := v_journal_lines || jsonb_build_object(
      'account_code', '4100',
      'debit_amount', 0,
      'credit_amount', v_new_total,
      'description', 'Pendapatan penjualan'
    );

    -- HPP entries
    IF v_total_hpp > 0 THEN
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', '5100',
        'debit_amount', v_total_hpp,
        'credit_amount', 0,
        'description', 'Harga Pokok Penjualan'
      );
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', '1310',
        'debit_amount', 0,
        'credit_amount', v_total_hpp,
        'description', 'Pengurangan persediaan'
      );
    END IF;

    -- Create new journal
    SELECT cja.journal_id INTO v_journal_id FROM create_journal_atomic(
      p_branch_id,
      v_date,
      'Penjualan ke ' || COALESCE(v_customer_name, 'Umum') || ' - ' || p_transaction_id || ' (Updated)',
      'transaction',
      p_transaction_id,
      v_journal_lines,
      TRUE
    );

    v_changes := array_append(v_changes, 'journal_updated');
  END IF;

  RETURN QUERY SELECT TRUE, p_transaction_id, v_journal_id, v_changes, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, '{}'::TEXT[], SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 3. VOID TRANSACTION ATOMIC
-- Void transaksi dengan rollback semua
-- ============================================================================

CREATE OR REPLACE FUNCTION void_transaction_atomic(
  p_transaction_id TEXT,
  p_branch_id UUID,
  p_reason TEXT DEFAULT 'Cancelled',
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  items_restored INTEGER,
  journals_voided INTEGER,
  commissions_deleted INTEGER,
  deliveries_deleted INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_transaction RECORD;
  v_items_restored INTEGER := 0;
  v_journals_voided INTEGER := 0;
  v_commissions_deleted INTEGER := 0;
  v_deliveries_deleted INTEGER := 0;
  v_item RECORD;
  v_batch RECORD;
  v_restore_qty NUMERIC;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0, 0, 0, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  -- Get transaction with row lock
  SELECT * INTO v_transaction
  FROM transactions
  WHERE id = p_transaction_id AND branch_id = p_branch_id
  FOR UPDATE;

  IF v_transaction.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0, 0, 0, 'Transaction not found'::TEXT;
    RETURN;
  END IF;

  -- ==================== RESTORE INVENTORY ====================

  -- IF Office Sale (immediate consume) OR already delivered (consume via delivery)
  IF v_transaction.is_office_sale OR v_transaction.delivery_status = 'Delivered' THEN
    -- Parse items from JSONB
    FOR v_item IN 
      SELECT 
        (elem->>'productId')::UUID as product_id,
        (elem->>'quantity')::NUMERIC as quantity
      FROM jsonb_array_elements(v_transaction.items) as elem
      WHERE (elem->>'productId') IS NOT NULL
    LOOP
      v_restore_qty := v_item.quantity;

      -- Restore to batches in LIFO order (newest first)
      FOR v_batch IN
        SELECT id, remaining_quantity, initial_quantity
        FROM inventory_batches
        WHERE product_id = v_item.product_id
          AND branch_id = p_branch_id
          AND remaining_quantity < initial_quantity
        ORDER BY batch_date DESC, created_at DESC
        FOR UPDATE
      LOOP
        EXIT WHEN v_restore_qty <= 0;

        DECLARE
          v_can_restore NUMERIC;
        BEGIN
          v_can_restore := LEAST(v_restore_qty, v_batch.initial_quantity - v_batch.remaining_quantity);

          UPDATE inventory_batches
          SET
            remaining_quantity = remaining_quantity + v_can_restore,
            updated_at = NOW()
          WHERE id = v_batch.id;

          v_restore_qty := v_restore_qty - v_can_restore;
        END;
      END LOOP;

      -- If still have qty to restore, create new batch
      IF v_restore_qty > 0 THEN
        INSERT INTO inventory_batches (
          product_id,
          branch_id,
          initial_quantity,
          remaining_quantity,
          unit_cost,
          batch_date,
          notes
        ) VALUES (
          v_item.product_id,
          p_branch_id,
          v_restore_qty,
          v_restore_qty,
          0,
          NOW(),
          format('Restored from void: %s', v_transaction.id)
        );
      END IF;
      
      v_items_restored := v_items_restored + 1;
    END LOOP;
  END IF;

  -- ==================== VOID JOURNALS ====================

  UPDATE journal_entries
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_reason = p_reason,
    status = 'voided',
    updated_at = NOW()
  WHERE reference_type = 'transaction'
    AND reference_id = p_transaction_id
    AND branch_id = p_branch_id
    AND is_voided = FALSE;

  GET DIAGNOSTICS v_journals_voided = ROW_COUNT;

  -- Void related delivery journals
  UPDATE journal_entries
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_reason = 'Transaction voided: ' || p_reason,
    status = 'voided',
    updated_at = NOW()
  WHERE reference_type = 'delivery'
    AND reference_id IN (SELECT id::TEXT FROM deliveries WHERE transaction_id = p_transaction_id)
    AND branch_id = p_branch_id
    AND is_voided = FALSE;

  -- ==================== DELETE COMMISSIONS ====================

  DELETE FROM commission_entries
  WHERE transaction_id = p_transaction_id AND branch_id = p_branch_id;

  GET DIAGNOSTICS v_commissions_deleted = ROW_COUNT;

  -- ==================== DELETE DELIVERIES ====================

  DELETE FROM delivery_items
  WHERE delivery_id IN (SELECT id FROM deliveries WHERE transaction_id = p_transaction_id);

  DELETE FROM deliveries
  WHERE transaction_id = p_transaction_id AND branch_id = p_branch_id;

  GET DIAGNOSTICS v_deliveries_deleted = ROW_COUNT;

  -- ==================== DELETE STOCK MOVEMENTS ====================

  DELETE FROM product_stock_movements
  WHERE reference_id = p_transaction_id AND reference_type IN ('transaction', 'delivery', 'fifo_consume');

  -- ==================== CANCEL RECEIVABLES ====================
  
  UPDATE receivables
  SET status = 'cancelled', updated_at = NOW()
  WHERE transaction_id = p_transaction_id AND branch_id = p_branch_id;

  -- ==================== DELETE TRANSACTION ====================

  -- Hard delete the transaction (not soft delete)
  DELETE FROM transactions
  WHERE id = p_transaction_id AND branch_id = p_branch_id;

  -- ==================== SUCCESS ====================

  RETURN QUERY SELECT
    TRUE,
    v_items_restored,
    v_journals_voided,
    v_commissions_deleted,
    v_deliveries_deleted,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0, 0, 0, 0, SQLERRM::TEXT;
END;

$$ LANGUAGE plpgsql SECURITY DEFINER;



-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION create_transaction_atomic(JSONB, JSONB, UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_transaction_atomic(TEXT, JSONB, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION void_transaction_atomic(TEXT, UUID, TEXT, UUID) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION create_transaction_atomic IS
  'Create transaction atomic dengan FIFO HPP calculation, journal, dan commission. WAJIB branch_id.';
COMMENT ON FUNCTION update_transaction_atomic IS
  'Update transaction dan recreate journal jika amounts berubah. WAJIB branch_id.';
COMMENT ON FUNCTION void_transaction_atomic IS
  'Void transaction dengan restore inventory LIFO, void journals, delete commissions & deliveries.';


-- ============================================================================
-- FILE: 10_migration_transaction.sql
-- ============================================================================
-- ============================================================================
-- RPC 10: Migration Transaction
-- Purpose: Import transaksi historis dari sistem lama
-- PENTING:
-- - TIDAK memotong stok (karena sudah diantar di sistem lama)
-- - TIDAK mencatat komisi (karena sudah dicatat di sistem lama)
-- - TIDAK mempengaruhi kas saat input
-- - TIDAK mempengaruhi pendapatan saat input (dicatat saat pengiriman nanti)
-- - Mencatat piutang dan modal barang dagang tertahan (2140)
-- - Sisa barang yang belum terkirim akan masuk ke daftar pengiriman
-- ============================================================================

DROP FUNCTION IF EXISTS create_migration_transaction(TEXT, UUID, TEXT, DATE, JSONB, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION create_migration_transaction(
  p_transaction_id TEXT,
  p_customer_id UUID,
  p_customer_name TEXT,
  p_order_date DATE,
  p_items JSONB,                      -- includes delivered_qty per item
  p_total NUMERIC,                    -- total transaction value
  p_delivered_value NUMERIC,          -- value of delivered items
  p_paid_amount NUMERIC DEFAULT 0,    -- amount already paid in old system
  p_payment_account_id TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_cashier_id TEXT DEFAULT NULL,
  p_cashier_name TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  transaction_id TEXT,
  journal_id UUID,
  delivery_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_journal_id UUID;
  v_delivery_id UUID;
  v_entry_number TEXT;
  v_piutang_account_id TEXT;
  v_modal_tertahan_account_id TEXT;
  v_kas_account_id TEXT;
  v_payment_status TEXT;
  v_transaction_notes TEXT;
  v_remaining_value NUMERIC;
  v_item JSONB;
  v_has_remaining_delivery BOOLEAN := FALSE;
  v_remaining_items JSONB := '[]'::JSONB;
  v_transaction_items JSONB := '[]'::JSONB;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, NULL::UUID,
      'Branch ID is REQUIRED'::TEXT;
    RETURN;
  END IF;

  IF p_customer_name IS NULL OR p_customer_name = '' THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, NULL::UUID,
      'Customer name is required'::TEXT;
    RETURN;
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, NULL::UUID,
      'At least one item is required'::TEXT;
    RETURN;
  END IF;

  IF p_total <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, NULL::UUID,
      'Total must be positive'::TEXT;
    RETURN;
  END IF;

  -- ==================== LOOKUP ACCOUNTS ====================

  -- Find Piutang Dagang account (1130)
  SELECT id INTO v_piutang_account_id
  FROM accounts
  WHERE (
    LOWER(name) LIKE '%piutang%dagang%' OR
    LOWER(name) LIKE '%piutang%usaha%' OR
    code = '1130'
  )
  AND is_header = FALSE
  LIMIT 1;

  IF v_piutang_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, NULL::UUID,
      'Akun Piutang Dagang tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- Find Modal Barang Dagang Tertahan account (2140)
  SELECT id INTO v_modal_tertahan_account_id
  FROM accounts
  WHERE (
    LOWER(name) LIKE '%modal%barang%tertahan%' OR
    LOWER(name) LIKE '%modal%dagang%tertahan%' OR
    code = '2140'
  )
  AND is_header = FALSE
  LIMIT 1;

  -- If not found, create it
  IF v_modal_tertahan_account_id IS NULL THEN
    INSERT INTO accounts (id, code, name, type, parent_id, is_header, balance, is_active, description)
    VALUES (
      '2140',
      '2140',
      'Modal Barang Dagang Tertahan',
      'liability',
      '2100', -- Assuming 2100 is Kewajiban Jangka Pendek header
      FALSE,
      0,
      TRUE,
      'Modal untuk barang yang sudah dijual tapi belum dikirim dari migrasi sistem lama'
    )
    ON CONFLICT (id) DO NOTHING;

    v_modal_tertahan_account_id := '2140';
  END IF;

  -- ==================== CALCULATE VALUES ====================

  -- Calculate remaining value (undelivered items)
  v_remaining_value := p_total - p_delivered_value;

  -- ==================== DETERMINE PAYMENT STATUS ====================

  IF p_paid_amount >= p_total THEN
    v_payment_status := 'Lunas';
  ELSE
    v_payment_status := 'Belum Lunas';
  END IF;

  -- ==================== BUILD TRANSACTION ITEMS ====================

  -- Process items and build remaining items for delivery
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    DECLARE
      v_qty INT := (v_item->>'quantity')::INT;
      v_delivered INT := COALESCE((v_item->>'delivered_qty')::INT, 0);
      v_remaining INT := v_qty - v_delivered;
      v_price NUMERIC := (v_item->>'price')::NUMERIC;
    BEGIN
      -- Add to transaction items with delivered info
      v_transaction_items := v_transaction_items || jsonb_build_object(
        'product_id', v_item->>'product_id',
        'product_name', v_item->>'product_name',
        'quantity', v_qty,
        'delivered_qty', v_delivered,
        'remaining_qty', v_remaining,
        'price', v_price,
        'unit', v_item->>'unit',
        'subtotal', v_qty * v_price,
        'is_migration', true
      );

      -- If there's remaining, mark for delivery
      IF v_remaining > 0 THEN
        v_has_remaining_delivery := TRUE;
        v_remaining_items := v_remaining_items || jsonb_build_object(
          'product_id', v_item->>'product_id',
          'product_name', v_item->>'product_name',
          'quantity', v_remaining,
          'price', v_price,
          'unit', v_item->>'unit'
        );
      END IF;
    END;
  END LOOP;

  -- ==================== BUILD NOTES ====================

  v_transaction_notes := '[MIGRASI] ';
  IF p_notes IS NOT NULL AND p_notes != '' THEN
    v_transaction_notes := v_transaction_notes || p_notes;
  ELSE
    v_transaction_notes := v_transaction_notes || 'Import data dari sistem lama';
  END IF;

  -- ==================== INSERT TRANSACTION ====================

  INSERT INTO transactions (
    id,
    customer_id,
    customer_name,
    cashier_id,
    cashier_name,
    order_date,
    items,
    total,
    subtotal,
    paid_amount,
    payment_status,
    payment_account_id,
    status,
    notes,
    branch_id,
    ppn_enabled,
    ppn_percentage,
    ppn_amount,
    created_at,
    updated_at
  ) VALUES (
    p_transaction_id,
    p_customer_id,
    p_customer_name,
    p_cashier_id,
    p_cashier_name,
    p_order_date,
    v_transaction_items,
    p_total,
    p_total, -- subtotal = total (no PPN for migration)
    p_paid_amount,
    v_payment_status,
    p_payment_account_id,
    CASE WHEN v_has_remaining_delivery THEN 'Dalam Pengiriman' ELSE 'Selesai' END,
    v_transaction_notes,
    p_branch_id,
    FALSE, -- No PPN
    0,
    0,
    NOW(),
    NOW()
  );

  -- ==================== CREATE JOURNAL ENTRY ====================

  -- Generate entry number
  v_entry_number := 'JE-MIG-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
                    LPAD((EXTRACT(EPOCH FROM NOW())::BIGINT % 10000)::TEXT, 4, '0');

  INSERT INTO journal_entries (
    entry_number,
    entry_date,
    description,
    reference_type,
    reference_id,
    is_posted,
    branch_id,
    created_by,
    created_at
  ) VALUES (
    v_entry_number,
    p_order_date,
    format('[MIGRASI] Penjualan - %s', p_customer_name),
    'migration_transaction',
    p_transaction_id,
    TRUE,
    p_branch_id,
    p_cashier_name,
    NOW()
  )
  RETURNING id INTO v_journal_id;

  -- ==================== JOURNAL LINE ITEMS ====================

  -- Jurnal migrasi:
  -- TIDAK mempengaruhi kas saat input
  -- TIDAK mempengaruhi pendapatan saat input
  --
  -- Untuk barang yang SUDAH dikirim (delivered):
  --   Debit: Piutang Dagang (delivered_value)
  --   Credit: Modal Barang Dagang Tertahan (delivered_value)
  --   (Pendapatan akan tercatat saat pembayaran piutang normal)
  --
  -- Untuk barang yang BELUM dikirim (remaining):
  --   Akan masuk ke daftar pengiriman, jurnal dicatat saat pengiriman
  --
  -- Jika ada pembayaran (paid_amount > 0):
  --   Jurnal terpisah untuk penerimaan kas
  --   Debit: Kas (paid_amount)
  --   Credit: Piutang Dagang (paid_amount)

  -- Journal for delivered items (Piutang vs Modal Tertahan)
  IF p_delivered_value > 0 THEN
    -- Debit: Piutang Dagang
    INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_journal_id, v_piutang_account_id, p_delivered_value, 0,
      format('Piutang penjualan migrasi - %s (barang sudah terkirim)', p_customer_name));

    -- Credit: Modal Barang Dagang Tertahan
    INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_journal_id, v_modal_tertahan_account_id, 0, p_delivered_value,
      format('Modal barang tertahan migrasi - %s', p_customer_name));
  END IF;

  -- Journal for remaining items (belum dikirim)
  IF v_remaining_value > 0 THEN
    -- Debit: Piutang Dagang (untuk nilai barang yang belum dikirim)
    INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_journal_id, v_piutang_account_id, v_remaining_value, 0,
      format('Piutang penjualan migrasi - %s (barang belum terkirim)', p_customer_name));

    -- Credit: Modal Barang Dagang Tertahan
    INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_journal_id, v_modal_tertahan_account_id, 0, v_remaining_value,
      format('Modal barang tertahan migrasi - %s (belum dikirim)', p_customer_name));
  END IF;

  -- ==================== JOURNAL FOR PAYMENT (if any) ====================

  IF p_paid_amount > 0 AND p_payment_account_id IS NOT NULL THEN
    DECLARE
      v_payment_journal_id UUID;
      v_payment_entry_number TEXT;
    BEGIN
      v_payment_entry_number := 'JE-MIG-PAY-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
                                LPAD((EXTRACT(EPOCH FROM NOW())::BIGINT % 10000)::TEXT, 4, '0');

      INSERT INTO journal_entries (
        entry_number,
        entry_date,
        description,
        reference_type,
        reference_id,
        is_posted,
        branch_id,
        created_by,
        created_at
      ) VALUES (
        v_payment_entry_number,
        p_order_date,
        format('[MIGRASI] Penerimaan Pembayaran - %s', p_customer_name),
        'migration_payment',
        p_transaction_id,
        TRUE,
        p_branch_id,
        p_cashier_name,
        NOW()
      )
      RETURNING id INTO v_payment_journal_id;

      -- Debit: Kas/Bank
      INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit, description)
      VALUES (v_payment_journal_id, p_payment_account_id, p_paid_amount, 0,
        format('Penerimaan pembayaran migrasi dari %s', p_customer_name));

      -- Credit: Piutang Dagang
      INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit, description)
      VALUES (v_payment_journal_id, v_piutang_account_id, 0, p_paid_amount,
        format('Pelunasan piutang migrasi %s', p_customer_name));
    END;
  END IF;

  -- ==================== CREATE PENDING DELIVERY (if remaining) ====================

  IF v_has_remaining_delivery THEN
    v_delivery_id := gen_random_uuid();

    INSERT INTO deliveries (
      id,
      transaction_id,
      customer_id,
      customer_name,
      items,
      status,
      notes,
      branch_id,
      created_at,
      updated_at
    ) VALUES (
      v_delivery_id,
      p_transaction_id,
      p_customer_id,
      p_customer_name,
      v_remaining_items,
      'Menunggu',
      '[MIGRASI] Sisa pengiriman dari sistem lama',
      p_branch_id,
      NOW(),
      NOW()
    );

    RAISE NOTICE '[Migration] Delivery % created for remaining items from transaction %',
      v_delivery_id, p_transaction_id;
  END IF;

  -- ==================== LOG ====================

  RAISE NOTICE '[Migration] Transaction % created for % (Total: %, Delivered: %, Remaining: %, Paid: %)',
    p_transaction_id, p_customer_name, p_total, p_delivered_value, v_remaining_value, p_paid_amount;

  RETURN QUERY SELECT TRUE, p_transaction_id, v_journal_id, v_delivery_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION create_migration_transaction(TEXT, UUID, TEXT, DATE, JSONB, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION create_migration_transaction IS
  'Import transaksi historis tanpa potong stok dan tanpa komisi.
   - Tidak mempengaruhi kas atau pendapatan saat input
   - Mencatat jurnal: Piutang vs Modal Barang Dagang Tertahan (2140)
   - Sisa barang belum terkirim masuk ke daftar pengiriman
   - Pembayaran dicatat sebagai jurnal terpisah';

-- ============================================================================
-- FILE: 10_payroll.sql
-- ============================================================================
-- ============================================================================
-- RPC 10: Payroll Atomic
-- Purpose: Proses payroll lengkap atomic dengan:
-- - Create payroll record
-- - Process payment dengan journal (Dr. Beban Gaji, Cr. Kas, Cr. Panjar)
-- - Update employee advances (potongan panjar)
-- - Update commission entries status
-- PENTING: Semua operasi WAJIB filter by branch_id
-- ============================================================================

-- Drop existing functions
DROP FUNCTION IF EXISTS process_payroll_complete(JSONB, UUID, UUID, DATE);
DROP FUNCTION IF EXISTS create_payroll_record(JSONB, UUID);
DROP FUNCTION IF EXISTS void_payroll_record(UUID, UUID, TEXT);

-- ============================================================================
-- 1. CREATE PAYROLL RECORD (Draft)
-- Membuat record gaji baru dalam status draft
-- ============================================================================

CREATE OR REPLACE FUNCTION create_payroll_record(
  p_payroll JSONB,          -- {employee_id, period_year, period_month, base_salary, commission, bonus, advance_deduction, salary_deduction, notes}
  p_branch_id UUID          -- WAJIB
)
RETURNS TABLE (
  success BOOLEAN,
  payroll_id UUID,
  net_salary NUMERIC,
  error_message TEXT
) AS $$
DECLARE
  v_payroll_id UUID;
  v_employee_id UUID;
  v_period_year INTEGER;
  v_period_month INTEGER;
  v_period_start DATE;
  v_period_end DATE;
  v_base_salary NUMERIC;
  v_commission NUMERIC;
  v_bonus NUMERIC;
  v_advance_deduction NUMERIC;
  v_salary_deduction NUMERIC;
  v_total_deductions NUMERIC;
  v_gross_salary NUMERIC;
  v_net_salary NUMERIC;
  v_notes TEXT;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC,
      'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_payroll IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC,
      'Payroll data is required'::TEXT;
    RETURN;
  END IF;

  -- ==================== PARSE DATA ====================

  v_employee_id := (p_payroll->>'employee_id')::UUID;
  v_period_year := COALESCE((p_payroll->>'period_year')::INTEGER, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER);
  v_period_month := COALESCE((p_payroll->>'period_month')::INTEGER, EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER);
  v_base_salary := COALESCE((p_payroll->>'base_salary')::NUMERIC, 0);
  v_commission := COALESCE((p_payroll->>'commission')::NUMERIC, 0);
  v_bonus := COALESCE((p_payroll->>'bonus')::NUMERIC, 0);
  v_advance_deduction := COALESCE((p_payroll->>'advance_deduction')::NUMERIC, 0);
  v_salary_deduction := COALESCE((p_payroll->>'salary_deduction')::NUMERIC, 0);
  v_notes := p_payroll->>'notes';

  IF v_employee_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC,
      'Employee ID is required'::TEXT;
    RETURN;
  END IF;

  -- Calculate period dates
  v_period_start := make_date(v_period_year, v_period_month, 1);
  v_period_end := (v_period_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  -- Calculate amounts
  v_total_deductions := v_advance_deduction + v_salary_deduction;
  v_gross_salary := v_base_salary + v_commission + v_bonus;
  v_net_salary := v_gross_salary - v_total_deductions;

  -- ==================== CHECK DUPLICATE ====================

  IF EXISTS (
    SELECT 1 FROM payroll_records
    WHERE employee_id = v_employee_id
      AND period_start = v_period_start
      AND period_end = v_period_end
      AND branch_id = p_branch_id
  ) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC,
      format('Payroll untuk karyawan ini periode %s-%s sudah ada', v_period_year, v_period_month)::TEXT;
    RETURN;
  END IF;

  -- ==================== INSERT PAYROLL RECORD ====================

  INSERT INTO payroll_records (
    employee_id,
    period_start,
    period_end,
    base_salary,
    total_commission,
    total_bonus,
    total_deductions,
    advance_deduction,
    salary_deduction,
    net_salary,
    status,
    notes,
    branch_id,
    created_at
  ) VALUES (
    v_employee_id,
    v_period_start,
    v_period_end,
    v_base_salary,
    v_commission,
    v_bonus,
    v_total_deductions,
    v_advance_deduction,
    v_salary_deduction,
    v_net_salary,
    'draft',
    v_notes,
    p_branch_id,
    NOW()
  )
  RETURNING id INTO v_payroll_id;

  RETURN QUERY SELECT TRUE, v_payroll_id, v_net_salary, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 2. PROCESS PAYROLL COMPLETE
-- Proses pembayaran gaji lengkap:
-- - Update status ke 'paid'
-- - Create journal (Dr. Beban Gaji, Cr. Kas, Cr. Panjar)
-- - Update employee_advances
-- - Update commission_entries status
-- ============================================================================

CREATE OR REPLACE FUNCTION process_payroll_complete(
  p_payroll_id UUID,
  p_branch_id UUID,
  p_payment_account_id UUID,
  p_payment_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  advances_updated INTEGER,
  commissions_paid INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_payroll RECORD;
  v_journal_id UUID;
  v_journal_lines JSONB := '[]'::JSONB;
  v_employee_name TEXT;
  v_gross_salary NUMERIC;
  v_net_salary NUMERIC;
  v_advance_deduction NUMERIC;
  v_salary_deduction NUMERIC;
  v_total_deductions NUMERIC;
  v_advances_updated INTEGER := 0;
  v_commissions_paid INTEGER := 0;
  v_remaining_deduction NUMERIC;
  v_advance RECORD;
  v_amount_to_deduct NUMERIC;
  v_beban_gaji_account UUID;
  v_panjar_account UUID;
  v_period_start DATE;
  v_period_end DATE;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0,
      'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_payroll_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0,
      'Payroll ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_payment_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0,
      'Payment account ID is required'::TEXT;
    RETURN;
  END IF;

  -- ==================== GET PAYROLL DATA ====================

  SELECT
    pr.*,
    p.full_name as employee_name
  INTO v_payroll
  FROM payroll_records pr
  LEFT JOIN profiles p ON p.id = pr.employee_id
  WHERE pr.id = p_payroll_id AND pr.branch_id = p_branch_id;

  IF v_payroll.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0,
      'Payroll record not found in this branch'::TEXT;
    RETURN;
  END IF;

  IF v_payroll.status = 'paid' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0,
      'Payroll sudah dibayar'::TEXT;
    RETURN;
  END IF;

  -- ==================== PREPARE DATA ====================

  v_employee_name := COALESCE(v_payroll.employee_name, 'Karyawan');
  v_advance_deduction := COALESCE(v_payroll.advance_deduction, 0);
  v_salary_deduction := COALESCE(v_payroll.salary_deduction, 0);
  v_total_deductions := COALESCE(v_payroll.total_deductions, v_advance_deduction + v_salary_deduction);
  v_net_salary := v_payroll.net_salary;
  v_gross_salary := COALESCE(v_payroll.base_salary, 0) +
                    COALESCE(v_payroll.total_commission, 0) +
                    COALESCE(v_payroll.total_bonus, 0);
  v_period_start := v_payroll.period_start;
  v_period_end := v_payroll.period_end;

  -- ==================== GET ACCOUNT IDS ====================

  -- Beban Gaji (6110)
  SELECT id INTO v_beban_gaji_account
  FROM accounts
  WHERE branch_id = p_branch_id AND code = '6110' AND is_active = TRUE
  LIMIT 1;

  -- Panjar Karyawan (1260)
  SELECT id INTO v_panjar_account
  FROM accounts
  WHERE branch_id = p_branch_id AND code = '1260' AND is_active = TRUE
  LIMIT 1;

  IF v_beban_gaji_account IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0,
      'Akun Beban Gaji (6110) tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- ==================== BUILD JOURNAL LINES ====================

  -- Debit: Beban Gaji (gross salary)
  v_journal_lines := v_journal_lines || jsonb_build_object(
    'account_id', v_beban_gaji_account,
    'debit_amount', v_gross_salary,
    'credit_amount', 0,
    'description', format('Beban gaji %s periode %s-%s',
      v_employee_name,
      EXTRACT(YEAR FROM v_period_start),
      EXTRACT(MONTH FROM v_period_start))
  );

  -- Credit: Kas (net salary)
  v_journal_lines := v_journal_lines || jsonb_build_object(
    'account_id', p_payment_account_id,
    'debit_amount', 0,
    'credit_amount', v_net_salary,
    'description', format('Pembayaran gaji %s', v_employee_name)
  );

  -- Credit: Panjar Karyawan (if any deductions)
  IF v_advance_deduction > 0 AND v_panjar_account IS NOT NULL THEN
    v_journal_lines := v_journal_lines || jsonb_build_object(
      'account_id', v_panjar_account,
      'debit_amount', 0,
      'credit_amount', v_advance_deduction,
      'description', format('Potongan panjar %s', v_employee_name)
    );
  ELSIF v_advance_deduction > 0 AND v_panjar_account IS NULL THEN
    -- If no panjar account, add to kas credit instead
    v_journal_lines := jsonb_set(
      v_journal_lines,
      '{1,credit_amount}',
      to_jsonb(v_net_salary + v_advance_deduction)
    );
  END IF;

  -- Credit: Other deductions (salary deduction) - goes to company revenue or adjustment
  IF v_salary_deduction > 0 THEN
    -- Could credit to different account if needed, for now add to kas
    NULL; -- Already included in net salary calculation
  END IF;

  -- ==================== CREATE JOURNAL ====================

  SELECT cja.journal_id INTO v_journal_id FROM create_journal_atomic(
    p_branch_id,
    p_payment_date,
    format('Pembayaran Gaji %s - %s/%s',
      v_employee_name,
      EXTRACT(MONTH FROM v_period_start),
      EXTRACT(YEAR FROM v_period_start)),
    'payroll',
    p_payroll_id::TEXT,
    v_journal_lines,
    TRUE
  );

  -- ==================== UPDATE PAYROLL STATUS ====================

  UPDATE payroll_records
  SET
    status = 'paid',
    paid_date = p_payment_date,
    updated_at = NOW()
  WHERE id = p_payroll_id;

  -- ==================== UPDATE EMPLOYEE ADVANCES ====================

  IF v_advance_deduction > 0 AND v_payroll.employee_id IS NOT NULL THEN
    v_remaining_deduction := v_advance_deduction;

    FOR v_advance IN
      SELECT id, remaining_amount
      FROM employee_advances
      WHERE employee_id = v_payroll.employee_id
        AND remaining_amount > 0
      ORDER BY date ASC  -- FIFO: oldest first
    LOOP
      EXIT WHEN v_remaining_deduction <= 0;

      v_amount_to_deduct := LEAST(v_remaining_deduction, v_advance.remaining_amount);

      UPDATE employee_advances
      SET remaining_amount = remaining_amount - v_amount_to_deduct
      WHERE id = v_advance.id;

      v_remaining_deduction := v_remaining_deduction - v_amount_to_deduct;
      v_advances_updated := v_advances_updated + 1;
    END LOOP;
  END IF;

  -- ==================== UPDATE COMMISSION ENTRIES ====================

  IF v_payroll.employee_id IS NOT NULL THEN
    UPDATE commission_entries
    SET status = 'paid'
    WHERE user_id = v_payroll.employee_id
      AND status = 'pending'
      AND created_at >= v_period_start
      AND created_at <= v_period_end + INTERVAL '1 day';

    GET DIAGNOSTICS v_commissions_paid = ROW_COUNT;
  END IF;

  -- ==================== SUCCESS ====================

  RETURN QUERY SELECT TRUE, v_journal_id, v_advances_updated, v_commissions_paid, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 3. VOID PAYROLL RECORD
-- Void payroll dengan rollback journal dan advances
-- ============================================================================

CREATE OR REPLACE FUNCTION void_payroll_record(
  p_payroll_id UUID,
  p_branch_id UUID,
  p_reason TEXT DEFAULT 'Cancelled'
)
RETURNS TABLE (
  success BOOLEAN,
  journals_voided INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_payroll RECORD;
  v_journals_voided INTEGER := 0;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  -- Get payroll
  SELECT * INTO v_payroll
  FROM payroll_records
  WHERE id = p_payroll_id AND branch_id = p_branch_id;

  IF v_payroll.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Payroll record not found'::TEXT;
    RETURN;
  END IF;

  -- ==================== VOID JOURNALS ====================

  UPDATE journal_entries
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_reason = p_reason,
    updated_at = NOW()
  WHERE reference_type = 'payroll'
    AND reference_id = p_payroll_id::TEXT
    AND branch_id = p_branch_id
    AND is_voided = FALSE;

  GET DIAGNOSTICS v_journals_voided = ROW_COUNT;

  -- ==================== DELETE PAYROLL RECORD ====================
  -- Note: This will cascade delete related records if FK is set

  DELETE FROM payroll_records WHERE id = p_payroll_id;

  -- ==================== SUCCESS ====================

  RETURN QUERY SELECT TRUE, v_journals_voided, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION create_payroll_record(JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION process_payroll_complete(UUID, UUID, UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION void_payroll_record(UUID, UUID, TEXT) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION create_payroll_record IS
  'Create payroll record dalam status draft. WAJIB branch_id.';
COMMENT ON FUNCTION process_payroll_complete IS
  'Process payment payroll lengkap: journal, update advances, update commissions. WAJIB branch_id.';
COMMENT ON FUNCTION void_payroll_record IS
  'Void payroll dengan rollback journal. WAJIB branch_id.';

-- ============================================================================
-- FILE: 11_expense.sql
-- ============================================================================
-- ============================================================================
-- RPC 11: Expense Atomic
-- Purpose: Proses pengeluaran/expense atomic dengan:
-- - Create expense record
-- - Auto-generate journal (Dr. Beban, Cr. Kas)
-- PENTING: Semua operasi WAJIB filter by branch_id
-- ============================================================================

-- Drop existing functions
DROP FUNCTION IF EXISTS create_expense_atomic(JSONB, UUID);
DROP FUNCTION IF EXISTS update_expense_atomic(TEXT, JSONB, UUID);
DROP FUNCTION IF EXISTS delete_expense_atomic(TEXT, UUID);

-- ============================================================================
-- 1. CREATE EXPENSE ATOMIC
-- Membuat expense dengan auto journal
-- Journal: Dr. Beban (expense account), Cr. Kas (payment account)
-- ============================================================================

CREATE OR REPLACE FUNCTION create_expense_atomic(
  p_expense JSONB,          -- {description, amount, category, date, account_id, expense_account_id, expense_account_name}
  p_branch_id UUID          -- WAJIB
)
RETURNS TABLE (
  success BOOLEAN,
  expense_id TEXT,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_expense_id TEXT;
  v_description TEXT;
  v_amount NUMERIC;
  v_category TEXT;
  v_date DATE;
  v_cash_account_id TEXT;  -- accounts.id is TEXT not UUID
  v_expense_account_id TEXT;  -- accounts.id is TEXT not UUID
  v_expense_account_name TEXT;
  v_journal_id UUID;
  v_journal_lines JSONB := '[]'::JSONB;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID,
      'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_expense IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID,
      'Expense data is required'::TEXT;
    RETURN;
  END IF;

  -- ==================== PARSE DATA ====================

  v_description := COALESCE(p_expense->>'description', 'Pengeluaran');
  v_amount := COALESCE((p_expense->>'amount')::NUMERIC, 0);
  v_category := COALESCE(p_expense->>'category', 'Beban Umum');
  v_date := COALESCE((p_expense->>'date')::DATE, CURRENT_DATE);
  v_cash_account_id := p_expense->>'account_id';  -- TEXT, no cast needed
  v_expense_account_id := p_expense->>'expense_account_id';  -- TEXT, no cast needed
  v_expense_account_name := p_expense->>'expense_account_name';

  IF v_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID,
      'Amount must be greater than 0'::TEXT;
    RETURN;
  END IF;

  -- ==================== FIND ACCOUNTS ====================

  -- Find expense account by ID or fallback to category-based search
  IF v_expense_account_id IS NULL THEN
    -- Search by category name
    SELECT id INTO v_expense_account_id
    FROM accounts
    WHERE branch_id = p_branch_id
      AND is_active = TRUE
      AND is_header = FALSE
      AND (
        code LIKE '6%'  -- Expense accounts
        OR type IN ('Beban', 'Expense')
      )
      AND (
        LOWER(name) LIKE '%' || LOWER(v_category) || '%'
        OR name ILIKE '%beban umum%'
      )
    ORDER BY
      CASE WHEN LOWER(name) LIKE '%' || LOWER(v_category) || '%' THEN 1 ELSE 2 END,
      code
    LIMIT 1;

    -- Fallback to default expense account (6200 - Beban Operasional or 6100)
    IF v_expense_account_id IS NULL THEN
      SELECT id INTO v_expense_account_id
      FROM accounts
      WHERE branch_id = p_branch_id
        AND is_active = TRUE
        AND is_header = FALSE
        AND code IN ('6200', '6100', '6000')
      ORDER BY code
      LIMIT 1;
    END IF;
  END IF;

  -- Find cash/payment account
  IF v_cash_account_id IS NULL THEN
    SELECT id INTO v_cash_account_id
    FROM accounts
    WHERE branch_id = p_branch_id
      AND is_active = TRUE
      AND is_payment_account = TRUE
      AND code LIKE '11%'
    ORDER BY code
    LIMIT 1;
  END IF;

  -- Validate accounts found
  IF v_expense_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID,
      'Akun beban tidak ditemukan. Pastikan ada akun dengan kode 6xxx.'::TEXT;
    RETURN;
  END IF;

  IF v_cash_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID,
      'Akun kas tidak ditemukan. Pastikan ada akun payment dengan kode 11xx.'::TEXT;
    RETURN;
  END IF;

  -- ==================== GENERATE EXPENSE ID ====================

  v_expense_id := 'exp-' || EXTRACT(EPOCH FROM NOW())::BIGINT::TEXT ||
                  '-' || LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0');

  -- ==================== CREATE EXPENSE RECORD ====================

  INSERT INTO expenses (
    id,
    description,
    amount,
    category,
    date,
    account_id,
    expense_account_id,
    expense_account_name,
    branch_id,
    created_at
  ) VALUES (
    v_expense_id,
    v_description,
    v_amount,
    v_category,
    v_date,
    v_cash_account_id,
    v_expense_account_id,
    v_expense_account_name,
    p_branch_id,
    NOW()
  );

  -- ==================== CREATE JOURNAL ====================

  -- Debit: Beban (expense account)
  v_journal_lines := v_journal_lines || jsonb_build_object(
    'account_id', v_expense_account_id,
    'debit_amount', v_amount,
    'credit_amount', 0,
    'description', v_category || ': ' || v_description
  );

  -- Credit: Kas (payment account)
  v_journal_lines := v_journal_lines || jsonb_build_object(
    'account_id', v_cash_account_id,
    'debit_amount', 0,
    'credit_amount', v_amount,
    'description', 'Pengeluaran kas'
  );

  SELECT cja.journal_id INTO v_journal_id FROM create_journal_atomic(
    p_branch_id,
    v_date,
    format('Pengeluaran - %s', v_description),
    'expense',
    v_expense_id,
    v_journal_lines,
    TRUE
  ) AS cja;

  -- ==================== SUCCESS ====================

  RETURN QUERY SELECT TRUE, v_expense_id, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 2. UPDATE EXPENSE ATOMIC
-- Update expense dan update journal lines
-- ============================================================================

CREATE OR REPLACE FUNCTION update_expense_atomic(
  p_expense_id TEXT,
  p_expense JSONB,          -- {description, amount, category, date, account_id}
  p_branch_id UUID          -- WAJIB
)
RETURNS TABLE (
  success BOOLEAN,
  journal_updated BOOLEAN,
  error_message TEXT
) AS $$
DECLARE
  v_old_expense RECORD;
  v_new_amount NUMERIC;
  v_new_cash_account_id TEXT;  -- accounts.id is TEXT not UUID
  v_journal_id UUID;
  v_expense_account_id TEXT;  -- accounts.id is TEXT not UUID
  v_amount_changed BOOLEAN;
  v_account_changed BOOLEAN;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, FALSE,
      'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  -- Get existing expense
  SELECT * INTO v_old_expense
  FROM expenses
  WHERE id = p_expense_id AND branch_id = p_branch_id;

  IF v_old_expense.id IS NULL THEN
    RETURN QUERY SELECT FALSE, FALSE,
      'Expense not found in this branch'::TEXT;
    RETURN;
  END IF;

  -- ==================== PARSE DATA ====================

  v_new_amount := COALESCE((p_expense->>'amount')::NUMERIC, v_old_expense.amount);
  v_new_cash_account_id := COALESCE(p_expense->>'account_id', v_old_expense.account_id);  -- TEXT, no cast

  v_amount_changed := v_new_amount != v_old_expense.amount;
  v_account_changed := v_new_cash_account_id IS DISTINCT FROM v_old_expense.account_id;

  -- ==================== UPDATE EXPENSE ====================

  UPDATE expenses SET
    description = COALESCE(p_expense->>'description', description),
    amount = v_new_amount,
    category = COALESCE(p_expense->>'category', category),
    date = COALESCE((p_expense->>'date')::DATE, date),
    account_id = v_new_cash_account_id,
    updated_at = NOW()
  WHERE id = p_expense_id;

  -- ==================== UPDATE JOURNAL IF NEEDED ====================

  IF v_amount_changed OR v_account_changed THEN
    -- Find existing journal
    SELECT id INTO v_journal_id
    FROM journal_entries
    WHERE reference_id = p_expense_id
      AND reference_type = 'expense'
      AND branch_id = p_branch_id
      AND is_voided = FALSE
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_journal_id IS NOT NULL THEN
      -- Get expense account from current expense
      v_expense_account_id := v_old_expense.expense_account_id;

      IF v_expense_account_id IS NULL THEN
        -- Fallback: find default expense account
        SELECT id INTO v_expense_account_id
        FROM accounts
        WHERE branch_id = p_branch_id
          AND is_active = TRUE
          AND code LIKE '6%'
        ORDER BY code
        LIMIT 1;
      END IF;

      IF v_expense_account_id IS NOT NULL AND v_new_cash_account_id IS NOT NULL THEN
        -- Delete old lines
        DELETE FROM journal_entry_lines WHERE journal_entry_id = v_journal_id;

        -- Insert new lines
        INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, debit_amount, credit_amount, description)
        VALUES
          (v_journal_id, 1, v_expense_account_id, v_new_amount, 0, 'Beban pengeluaran (edit)'),
          (v_journal_id, 2, v_new_cash_account_id, 0, v_new_amount, 'Pengeluaran kas (edit)');

        -- Update journal totals
        UPDATE journal_entries SET
          total_debit = v_new_amount,
          total_credit = v_new_amount,
          updated_at = NOW()
        WHERE id = v_journal_id;

        RETURN QUERY SELECT TRUE, TRUE, NULL::TEXT;
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT TRUE, FALSE, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, FALSE, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 3. DELETE EXPENSE ATOMIC
-- Delete expense dan void journal
-- ============================================================================

CREATE OR REPLACE FUNCTION delete_expense_atomic(
  p_expense_id TEXT,
  p_branch_id UUID          -- WAJIB
)
RETURNS TABLE (
  success BOOLEAN,
  journals_voided INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_journals_voided INTEGER := 0;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  -- Check expense exists
  IF NOT EXISTS (
    SELECT 1 FROM expenses WHERE id = p_expense_id AND branch_id = p_branch_id
  ) THEN
    RETURN QUERY SELECT FALSE, 0, 'Expense not found'::TEXT;
    RETURN;
  END IF;

  -- ==================== VOID JOURNALS ====================

  UPDATE journal_entries
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_reason = 'Expense deleted',
    status = 'voided',
    updated_at = NOW()
  WHERE reference_id = p_expense_id
    AND reference_type = 'expense'
    AND branch_id = p_branch_id
    AND is_voided = FALSE;

  GET DIAGNOSTICS v_journals_voided = ROW_COUNT;

  -- ==================== DELETE EXPENSE ====================

  DELETE FROM expenses WHERE id = p_expense_id AND branch_id = p_branch_id;

  RETURN QUERY SELECT TRUE, v_journals_voided, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION create_expense_atomic(JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_expense_atomic(TEXT, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_expense_atomic(TEXT, UUID) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION create_expense_atomic IS
  'Create expense dengan auto journal (Dr. Beban, Cr. Kas). WAJIB branch_id.';
COMMENT ON FUNCTION update_expense_atomic IS
  'Update expense dan update journal jika amount/account berubah. WAJIB branch_id.';
COMMENT ON FUNCTION delete_expense_atomic IS
  'Delete expense dan void journal terkait. WAJIB branch_id.';

-- ============================================================================
-- FILE: 11_migration_delivery_journal.sql
-- ============================================================================
-- ============================================================================
-- RPC 11: Migration Delivery Journal
-- Purpose: Jurnal tambahan saat pengiriman barang dari transaksi migrasi
--
-- Saat barang dari transaksi migrasi dikirim:
-- 1. Modal Barang Dagang Tertahan (2140) → Pendapatan Penjualan
-- 2. HPP → Persediaan (sudah ditangani oleh process_delivery_atomic)
-- ============================================================================

DROP FUNCTION IF EXISTS process_migration_delivery_journal(UUID, NUMERIC, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION process_migration_delivery_journal(
  p_delivery_id UUID,
  p_delivery_value NUMERIC,      -- Nilai barang yang dikirim
  p_branch_id UUID,
  p_customer_name TEXT,
  p_transaction_id TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_modal_tertahan_id TEXT;
  v_pendapatan_id TEXT;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is REQUIRED'::TEXT;
    RETURN;
  END IF;

  IF p_delivery_value <= 0 THEN
    RETURN QUERY SELECT TRUE, NULL::UUID, 'No journal needed for zero value'::TEXT;
    RETURN;
  END IF;

  -- ==================== LOOKUP ACCOUNTS ====================

  -- Find Modal Barang Dagang Tertahan (2140)
  SELECT id INTO v_modal_tertahan_id
  FROM accounts
  WHERE (
    LOWER(name) LIKE '%modal%barang%tertahan%' OR
    LOWER(name) LIKE '%modal%dagang%tertahan%' OR
    code = '2140'
  )
  AND is_header = FALSE
  LIMIT 1;

  IF v_modal_tertahan_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Modal Barang Dagang Tertahan (2140) tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- Find Pendapatan Penjualan (4100)
  SELECT id INTO v_pendapatan_id
  FROM accounts
  WHERE (
    LOWER(name) LIKE '%pendapatan%penjualan%' OR
    LOWER(name) LIKE '%penjualan%' OR
    code = '4100'
  )
  AND is_header = FALSE
  AND type = 'revenue'
  LIMIT 1;

  IF v_pendapatan_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Pendapatan Penjualan tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- ==================== CREATE JOURNAL ENTRY ====================

  v_entry_number := 'JE-MIG-DEL-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
                    LPAD((EXTRACT(EPOCH FROM NOW())::BIGINT % 10000)::TEXT, 4, '0');

  INSERT INTO journal_entries (
    entry_number,
    entry_date,
    description,
    reference_type,
    reference_id,
    is_posted,
    branch_id,
    created_by,
    created_at
  ) VALUES (
    v_entry_number,
    CURRENT_DATE,
    format('[MIGRASI] Pengiriman Barang - %s', p_customer_name),
    'migration_delivery',
    p_delivery_id::TEXT,
    TRUE,
    p_branch_id,
    'System',
    NOW()
  )
  RETURNING id INTO v_journal_id;

  -- ==================== JOURNAL LINE ITEMS ====================

  -- Jurnal pengiriman migrasi:
  -- Dr Modal Barang Dagang Tertahan (2140)
  --    Cr Pendapatan Penjualan (4100)
  --
  -- Ini mengubah "utang sistem" → "penjualan sah"

  -- Debit: Modal Barang Dagang Tertahan
  INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit, description)
  VALUES (v_journal_id, v_modal_tertahan_id, p_delivery_value, 0,
    format('Pengiriman migrasi - %s', p_customer_name));

  -- Credit: Pendapatan Penjualan
  INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit, description)
  VALUES (v_journal_id, v_pendapatan_id, 0, p_delivery_value,
    format('Pendapatan penjualan migrasi - %s', p_customer_name));

  -- ==================== LOG ====================

  RAISE NOTICE '[Migration Delivery] Journal created for delivery % (Value: %)',
    p_delivery_id, p_delivery_value;

  RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- TRIGGER: Auto-call migration journal after delivery
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_migration_delivery_journal()
RETURNS TRIGGER AS $$
DECLARE
  v_transaction RECORD;
  v_is_migration BOOLEAN := FALSE;
  v_delivery_value NUMERIC := 0;
  v_item RECORD;
  v_result RECORD;
BEGIN
  -- Check if this delivery is for a migration transaction
  SELECT
    t.id,
    t.customer_name,
    t.notes,
    t.branch_id,
    t.items
  INTO v_transaction
  FROM transactions t
  WHERE t.id = NEW.transaction_id;

  -- Check if it's a migration transaction (notes contains [MIGRASI])
  IF v_transaction.notes IS NOT NULL AND v_transaction.notes LIKE '%[MIGRASI]%' THEN
    v_is_migration := TRUE;
  END IF;

  -- If migration, calculate delivery value and create journal
  IF v_is_migration THEN
    -- Calculate value of delivered items
    SELECT COALESCE(SUM(
      di.quantity_delivered * COALESCE(
        (SELECT (item->>'price')::NUMERIC
         FROM jsonb_array_elements(v_transaction.items) item
         WHERE item->>'product_id' = di.product_id::TEXT
         LIMIT 1
        ), 0)
    ), 0)
    INTO v_delivery_value
    FROM delivery_items di
    WHERE di.delivery_id = NEW.id;

    -- Create migration delivery journal
    IF v_delivery_value > 0 THEN
      SELECT * INTO v_result
      FROM process_migration_delivery_journal(
        NEW.id,
        v_delivery_value,
        v_transaction.branch_id,
        v_transaction.customer_name,
        v_transaction.id::TEXT
      );

      IF NOT v_result.success THEN
        RAISE WARNING 'Failed to create migration delivery journal: %', v_result.error_message;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_migration_delivery_journal ON deliveries;

-- Create trigger (fires after delivery is inserted with status = 'delivered')
CREATE TRIGGER trg_migration_delivery_journal
  AFTER INSERT ON deliveries
  FOR EACH ROW
  WHEN (NEW.status = 'delivered')
  EXECUTE FUNCTION trigger_migration_delivery_journal();

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION process_migration_delivery_journal(UUID, NUMERIC, UUID, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION process_migration_delivery_journal IS
  'Jurnal pengiriman untuk transaksi migrasi:
   - Dr Modal Barang Dagang Tertahan (2140)
   - Cr Pendapatan Penjualan (4100)
   Ini mengubah "utang sistem" menjadi "penjualan sah"';

COMMENT ON TRIGGER trg_migration_delivery_journal ON deliveries IS
  'Trigger otomatis untuk membuat jurnal saat barang dari transaksi migrasi dikirim';

-- ============================================================================
-- FILE: 12_asset.sql
-- ============================================================================
-- ============================================================================
-- RPC 12: Asset Atomic
-- Purpose: Proses aset tetap atomic dengan:
-- - Create asset record
-- - Auto-generate journal pembelian (Dr. Aset, Cr. Kas/Hutang)
-- - Record depreciation dengan journal (Dr. Beban Penyusutan, Cr. Akumulasi)
-- PENTING: Semua operasi WAJIB filter by branch_id
-- ============================================================================

-- Drop existing functions
DROP FUNCTION IF EXISTS create_asset_atomic(JSONB, UUID);
DROP FUNCTION IF EXISTS update_asset_atomic(UUID, JSONB, UUID);
DROP FUNCTION IF EXISTS delete_asset_atomic(UUID, UUID);
DROP FUNCTION IF EXISTS record_depreciation_atomic(UUID, NUMERIC, TEXT, UUID);

-- ============================================================================
-- 1. CREATE ASSET ATOMIC
-- Membuat asset dengan auto journal pembelian
-- Journal: Dr. Aset Tetap, Cr. Kas (atau Hutang)
-- ============================================================================

CREATE OR REPLACE FUNCTION create_asset_atomic(
  p_asset JSONB,            -- {name, code, category, purchase_date, purchase_price, useful_life_years, salvage_value, depreciation_method, location, brand, model, serial_number, supplier_name, notes, source}
  p_branch_id UUID          -- WAJIB
)
RETURNS TABLE (
  success BOOLEAN,
  asset_id UUID,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_asset_id UUID;
  v_name TEXT;
  v_code TEXT;
  v_category TEXT;
  v_purchase_date DATE;
  v_purchase_price NUMERIC;
  v_useful_life_years INTEGER;
  v_salvage_value NUMERIC;
  v_depreciation_method TEXT;
  v_source TEXT;  -- 'cash', 'credit', 'migration'
  v_asset_account_id UUID;
  v_cash_account_id UUID;
  v_hutang_account_id UUID;
  v_journal_id UUID;
  v_journal_lines JSONB := '[]'::JSONB;
  v_category_mapping JSONB;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID,
      'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_asset IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID,
      'Asset data is required'::TEXT;
    RETURN;
  END IF;

  -- ==================== PARSE DATA ====================

  v_name := COALESCE(p_asset->>'name', p_asset->>'asset_name', 'Aset Tetap');
  v_code := COALESCE(p_asset->>'code', p_asset->>'asset_code');
  v_category := COALESCE(p_asset->>'category', 'other');
  v_purchase_date := COALESCE((p_asset->>'purchase_date')::DATE, CURRENT_DATE);
  v_purchase_price := COALESCE((p_asset->>'purchase_price')::NUMERIC, 0);
  v_useful_life_years := COALESCE((p_asset->>'useful_life_years')::INTEGER, 5);
  v_salvage_value := COALESCE((p_asset->>'salvage_value')::NUMERIC, 0);
  v_depreciation_method := COALESCE(p_asset->>'depreciation_method', 'straight_line');
  v_source := COALESCE(p_asset->>'source', 'cash');

  IF v_name IS NULL OR v_name = '' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID,
      'Asset name is required'::TEXT;
    RETURN;
  END IF;

  -- ==================== MAP CATEGORY TO ACCOUNT ====================

  -- Category to account code mapping
  v_category_mapping := '{
    "vehicle": {"codes": ["1410"], "names": ["kendaraan"]},
    "equipment": {"codes": ["1420"], "names": ["peralatan", "mesin"]},
    "building": {"codes": ["1440"], "names": ["bangunan", "gedung"]},
    "furniture": {"codes": ["1450"], "names": ["furniture", "inventaris"]},
    "computer": {"codes": ["1460"], "names": ["komputer", "laptop"]},
    "other": {"codes": ["1490"], "names": ["aset lain"]}
  }'::JSONB;

  -- Find asset account by category
  DECLARE
    v_mapping JSONB := v_category_mapping->v_category;
    v_search_code TEXT;
    v_search_name TEXT;
  BEGIN
    IF v_mapping IS NOT NULL THEN
      -- Try by code first
      FOR v_search_code IN SELECT jsonb_array_elements_text(v_mapping->'codes')
      LOOP
        SELECT id INTO v_asset_account_id
        FROM accounts
        WHERE branch_id = p_branch_id
          AND code = v_search_code
          AND is_active = TRUE
        LIMIT 1;
        EXIT WHEN v_asset_account_id IS NOT NULL;
      END LOOP;

      -- Try by name if not found
      IF v_asset_account_id IS NULL THEN
        FOR v_search_name IN SELECT jsonb_array_elements_text(v_mapping->'names')
        LOOP
          SELECT id INTO v_asset_account_id
          FROM accounts
          WHERE branch_id = p_branch_id
            AND LOWER(name) LIKE '%' || v_search_name || '%'
            AND is_active = TRUE
            AND is_header = FALSE
          LIMIT 1;
          EXIT WHEN v_asset_account_id IS NOT NULL;
        END LOOP;
      END IF;
    END IF;

    -- Fallback to any fixed asset account
    IF v_asset_account_id IS NULL THEN
      SELECT id INTO v_asset_account_id
      FROM accounts
      WHERE branch_id = p_branch_id
        AND code LIKE '14%'
        AND is_active = TRUE
        AND is_header = FALSE
      ORDER BY code
      LIMIT 1;
    END IF;
  END;

  -- Find cash account
  SELECT id INTO v_cash_account_id
  FROM accounts
  WHERE branch_id = p_branch_id
    AND is_active = TRUE
    AND is_payment_account = TRUE
    AND code LIKE '11%'
  ORDER BY code
  LIMIT 1;

  -- Find hutang account (for credit purchases)
  SELECT id INTO v_hutang_account_id
  FROM accounts
  WHERE branch_id = p_branch_id
    AND code IN ('2100', '2110')
    AND is_active = TRUE
  LIMIT 1;

  -- Validate asset account found
  IF v_asset_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID,
      'Akun aset tetap tidak ditemukan. Pastikan ada akun dengan kode 14xx.'::TEXT;
    RETURN;
  END IF;

  -- ==================== GENERATE ASSET ID ====================

  v_asset_id := gen_random_uuid();

  -- Generate code if not provided
  IF v_code IS NULL OR v_code = '' THEN
    v_code := 'AST-' || TO_CHAR(v_purchase_date, 'YYYYMM') || '-' ||
              LPAD((SELECT COUNT(*) + 1 FROM assets WHERE branch_id = p_branch_id)::TEXT, 4, '0');
  END IF;

  -- ==================== CREATE ASSET RECORD ====================

  INSERT INTO assets (
    id,
    name,
    code,
    asset_code,
    category,
    purchase_date,
    purchase_price,
    current_value,
    useful_life_years,
    salvage_value,
    depreciation_method,
    location,
    brand,
    model,
    serial_number,
    supplier_name,
    notes,
    status,
    condition,
    account_id,
    branch_id,
    created_at
  ) VALUES (
    v_asset_id,
    v_name,
    v_code,
    v_code,
    v_category,
    v_purchase_date,
    v_purchase_price,
    v_purchase_price,  -- current_value starts at purchase_price
    v_useful_life_years,
    v_salvage_value,
    v_depreciation_method,
    p_asset->>'location',
    COALESCE(p_asset->>'brand', v_name),
    p_asset->>'model',
    p_asset->>'serial_number',
    p_asset->>'supplier_name',
    p_asset->>'notes',
    COALESCE(p_asset->>'status', 'active'),
    COALESCE(p_asset->>'condition', 'good'),
    v_asset_account_id,
    p_branch_id,
    NOW()
  );

  -- ==================== CREATE JOURNAL (if not migration) ====================

  IF v_purchase_price > 0 AND v_source != 'migration' THEN
    -- Debit: Aset Tetap
    v_journal_lines := v_journal_lines || jsonb_build_object(
      'account_id', v_asset_account_id,
      'debit_amount', v_purchase_price,
      'credit_amount', 0,
      'description', format('Pembelian %s', v_name)
    );

    -- Credit: Kas atau Hutang
    IF v_source = 'credit' AND v_hutang_account_id IS NOT NULL THEN
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_id', v_hutang_account_id,
        'debit_amount', 0,
        'credit_amount', v_purchase_price,
        'description', 'Hutang pembelian aset'
      );
    ELSIF v_cash_account_id IS NOT NULL THEN
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_id', v_cash_account_id,
        'debit_amount', 0,
        'credit_amount', v_purchase_price,
        'description', 'Pembayaran tunai aset'
      );
    ELSE
      RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID,
        'Akun pembayaran tidak ditemukan'::TEXT;
      RETURN;
    END IF;

    SELECT cja.journal_id INTO v_journal_id FROM create_journal_atomic(
      p_branch_id,
      v_purchase_date,
      format('Pembelian Aset - %s', v_name),
      'asset',
      v_asset_id::TEXT,
      v_journal_lines,
      TRUE
    );
  END IF;

  -- ==================== SUCCESS ====================

  RETURN QUERY SELECT TRUE, v_asset_id, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 2. UPDATE ASSET ATOMIC
-- Update asset dan update journal jika harga berubah
-- ============================================================================

CREATE OR REPLACE FUNCTION update_asset_atomic(
  p_asset_id UUID,
  p_asset JSONB,            -- Fields to update
  p_branch_id UUID          -- WAJIB
)
RETURNS TABLE (
  success BOOLEAN,
  journal_updated BOOLEAN,
  error_message TEXT
) AS $$
DECLARE
  v_old_asset RECORD;
  v_new_price NUMERIC;
  v_price_changed BOOLEAN;
  v_journal_id UUID;
  v_asset_account_id UUID;
  v_cash_account_id UUID;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, FALSE,
      'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  -- Get existing asset
  SELECT * INTO v_old_asset
  FROM assets
  WHERE id = p_asset_id AND branch_id = p_branch_id;

  IF v_old_asset.id IS NULL THEN
    RETURN QUERY SELECT FALSE, FALSE,
      'Asset not found in this branch'::TEXT;
    RETURN;
  END IF;

  -- ==================== CHECK PRICE CHANGE ====================

  v_new_price := (p_asset->>'purchase_price')::NUMERIC;
  v_price_changed := v_new_price IS NOT NULL AND v_new_price != v_old_asset.purchase_price;

  -- ==================== UPDATE ASSET ====================

  UPDATE assets SET
    name = COALESCE(p_asset->>'name', p_asset->>'asset_name', name),
    code = COALESCE(p_asset->>'code', p_asset->>'asset_code', code),
    asset_code = COALESCE(p_asset->>'code', p_asset->>'asset_code', asset_code),
    category = COALESCE(p_asset->>'category', category),
    purchase_date = COALESCE((p_asset->>'purchase_date')::DATE, purchase_date),
    purchase_price = COALESCE(v_new_price, purchase_price),
    useful_life_years = COALESCE((p_asset->>'useful_life_years')::INTEGER, useful_life_years),
    salvage_value = COALESCE((p_asset->>'salvage_value')::NUMERIC, salvage_value),
    depreciation_method = COALESCE(p_asset->>'depreciation_method', depreciation_method),
    location = COALESCE(p_asset->>'location', location),
    brand = COALESCE(p_asset->>'brand', brand),
    model = COALESCE(p_asset->>'model', model),
    serial_number = COALESCE(p_asset->>'serial_number', serial_number),
    supplier_name = COALESCE(p_asset->>'supplier_name', supplier_name),
    notes = COALESCE(p_asset->>'notes', notes),
    status = COALESCE(p_asset->>'status', status),
    condition = COALESCE(p_asset->>'condition', condition),
    updated_at = NOW()
  WHERE id = p_asset_id;

  -- ==================== UPDATE JOURNAL IF PRICE CHANGED ====================

  IF v_price_changed THEN
    -- Find existing journal
    SELECT id INTO v_journal_id
    FROM journal_entries
    WHERE reference_id = p_asset_id::TEXT
      AND reference_type = 'asset'
      AND branch_id = p_branch_id
      AND is_voided = FALSE
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_journal_id IS NOT NULL THEN
      v_asset_account_id := COALESCE((p_asset->>'account_id')::UUID, v_old_asset.account_id);

      -- Get cash account
      SELECT id INTO v_cash_account_id
      FROM accounts
      WHERE branch_id = p_branch_id
        AND is_payment_account = TRUE
        AND code LIKE '11%'
      ORDER BY code
      LIMIT 1;

      IF v_asset_account_id IS NOT NULL AND v_cash_account_id IS NOT NULL THEN
        -- Delete old lines
        DELETE FROM journal_entry_lines WHERE journal_entry_id = v_journal_id;

        -- Insert new lines
        INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, debit_amount, credit_amount, description)
        VALUES
          (v_journal_id, 1, v_asset_account_id, v_new_price, 0, format('Pembelian %s (edit)', v_old_asset.name)),
          (v_journal_id, 2, v_cash_account_id, 0, v_new_price, 'Pembayaran aset (edit)');

        -- Update journal totals
        UPDATE journal_entries SET
          total_debit = v_new_price,
          total_credit = v_new_price,
          updated_at = NOW()
        WHERE id = v_journal_id;

        RETURN QUERY SELECT TRUE, TRUE, NULL::TEXT;
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT TRUE, FALSE, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, FALSE, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 3. DELETE ASSET ATOMIC
-- Delete asset dan void semua journal terkait
-- ============================================================================

CREATE OR REPLACE FUNCTION delete_asset_atomic(
  p_asset_id UUID,
  p_branch_id UUID          -- WAJIB
)
RETURNS TABLE (
  success BOOLEAN,
  journals_voided INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_journals_voided INTEGER := 0;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  -- Check asset exists
  IF NOT EXISTS (
    SELECT 1 FROM assets WHERE id = p_asset_id AND branch_id = p_branch_id
  ) THEN
    RETURN QUERY SELECT FALSE, 0, 'Asset not found'::TEXT;
    RETURN;
  END IF;

  -- ==================== VOID JOURNALS ====================

  UPDATE journal_entries
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_reason = 'Asset deleted',
    updated_at = NOW()
  WHERE reference_id = p_asset_id::TEXT
    AND branch_id = p_branch_id
    AND is_voided = FALSE;

  GET DIAGNOSTICS v_journals_voided = ROW_COUNT;

  -- ==================== DELETE ASSET ====================

  DELETE FROM assets WHERE id = p_asset_id AND branch_id = p_branch_id;

  RETURN QUERY SELECT TRUE, v_journals_voided, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 4. RECORD DEPRECIATION ATOMIC
-- Catat penyusutan aset
-- Journal: Dr. Beban Penyusutan (6240), Cr. Akumulasi Penyusutan
-- ============================================================================

CREATE OR REPLACE FUNCTION record_depreciation_atomic(
  p_asset_id UUID,
  p_amount NUMERIC,
  p_period TEXT,            -- e.g., "2024-12"
  p_branch_id UUID          -- WAJIB
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  new_current_value NUMERIC,
  error_message TEXT
) AS $$
DECLARE
  v_asset RECORD;
  v_journal_id UUID;
  v_journal_lines JSONB := '[]'::JSONB;
  v_beban_penyusutan_account UUID;
  v_akumulasi_account UUID;
  v_new_current_value NUMERIC;
  v_depreciation_date DATE;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC,
      'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC,
      'Depreciation amount must be greater than 0'::TEXT;
    RETURN;
  END IF;

  -- Get asset
  SELECT * INTO v_asset
  FROM assets
  WHERE id = p_asset_id AND branch_id = p_branch_id;

  IF v_asset.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC,
      'Asset not found'::TEXT;
    RETURN;
  END IF;

  -- ==================== FIND ACCOUNTS ====================

  -- Beban Penyusutan (6240)
  SELECT id INTO v_beban_penyusutan_account
  FROM accounts
  WHERE branch_id = p_branch_id
    AND code IN ('6240', '6250')
    AND is_active = TRUE
  LIMIT 1;

  -- Akumulasi Penyusutan - try to find by category
  SELECT id INTO v_akumulasi_account
  FROM accounts
  WHERE branch_id = p_branch_id
    AND (
      code IN ('1421', '1431', '1451', '1461', '1491')  -- Akumulasi accounts
      OR LOWER(name) LIKE '%akumulasi%'
    )
    AND is_active = TRUE
  ORDER BY code
  LIMIT 1;

  IF v_beban_penyusutan_account IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC,
      'Akun Beban Penyusutan tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  IF v_akumulasi_account IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC,
      'Akun Akumulasi Penyusutan tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- ==================== CALCULATE NEW VALUE ====================

  v_new_current_value := GREATEST(
    v_asset.salvage_value,
    COALESCE(v_asset.current_value, v_asset.purchase_price) - p_amount
  );

  -- Parse period to date
  BEGIN
    v_depreciation_date := (p_period || '-01')::DATE;
  EXCEPTION WHEN OTHERS THEN
    v_depreciation_date := CURRENT_DATE;
  END;

  -- ==================== CREATE JOURNAL ====================

  -- Debit: Beban Penyusutan
  v_journal_lines := v_journal_lines || jsonb_build_object(
    'account_id', v_beban_penyusutan_account,
    'debit_amount', p_amount,
    'credit_amount', 0,
    'description', format('Penyusutan %s periode %s', v_asset.name, p_period)
  );

  -- Credit: Akumulasi Penyusutan
  v_journal_lines := v_journal_lines || jsonb_build_object(
    'account_id', v_akumulasi_account,
    'debit_amount', 0,
    'credit_amount', p_amount,
    'description', format('Akumulasi penyusutan %s', v_asset.name)
  );

  SELECT cja.journal_id INTO v_journal_id FROM create_journal_atomic(
    p_branch_id,
    v_depreciation_date,
    format('Penyusutan - %s - %s', v_asset.name, p_period),
    'depreciation',
    p_asset_id::TEXT,
    v_journal_lines,
    TRUE
  );

  -- ==================== UPDATE ASSET CURRENT VALUE ====================

  UPDATE assets
  SET current_value = v_new_current_value, updated_at = NOW()
  WHERE id = p_asset_id;

  -- ==================== SUCCESS ====================

  RETURN QUERY SELECT TRUE, v_journal_id, v_new_current_value, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION create_asset_atomic(JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_asset_atomic(UUID, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_asset_atomic(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION record_depreciation_atomic(UUID, NUMERIC, TEXT, UUID) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION create_asset_atomic IS
  'Create asset dengan auto journal pembelian. WAJIB branch_id.';
COMMENT ON FUNCTION update_asset_atomic IS
  'Update asset dan update journal jika harga berubah. WAJIB branch_id.';
COMMENT ON FUNCTION delete_asset_atomic IS
  'Delete asset dan void journal terkait. WAJIB branch_id.';
COMMENT ON FUNCTION record_depreciation_atomic IS
  'Record depreciation dengan journal (Dr. Beban Penyusutan, Cr. Akumulasi). WAJIB branch_id.';

-- ============================================================================
-- FILE: 12_tax_payment.sql
-- ============================================================================
-- ============================================================================
-- RPC 12: Tax Payment (PPN/VAT)
-- Purpose: Mencatat pembayaran pajak PPN dengan jurnal yang benar
-- ============================================================================

-- Drop old function with old signature
DROP FUNCTION IF EXISTS pay_tax_atomic(UUID, NUMERIC, NUMERIC, TEXT, DATE, TEXT, TEXT);
DROP FUNCTION IF EXISTS create_tax_payment_atomic(UUID, TEXT, NUMERIC, NUMERIC, TEXT, TEXT);

CREATE OR REPLACE FUNCTION create_tax_payment_atomic(
  p_branch_id UUID,
  p_period TEXT,                        -- Periode pajak (e.g., '2024-01' or 'Januari 2024')
  p_ppn_masukan_used NUMERIC,           -- PPN yang bisa dikreditkan (asset)
  p_ppn_keluaran_paid NUMERIC,          -- PPN yang harus dibayar (liability)
  p_payment_account_id TEXT,            -- Akun kas/bank untuk pembayaran
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  net_payment NUMERIC,
  error_message TEXT
) AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_reference_id TEXT;
  v_ppn_keluaran_account_id TEXT;
  v_ppn_masukan_account_id TEXT;
  v_net_payment NUMERIC;
  v_description TEXT;
  v_payment_date DATE := CURRENT_DATE;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, 'Branch ID is REQUIRED'::TEXT;
    RETURN;
  END IF;

  IF p_ppn_keluaran_paid <= 0 AND p_ppn_masukan_used <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, 'Jumlah PPN harus lebih dari 0'::TEXT;
    RETURN;
  END IF;

  IF p_payment_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, 'Akun pembayaran harus dipilih'::TEXT;
    RETURN;
  END IF;

  -- ==================== LOOKUP ACCOUNTS ====================

  -- Find PPN Keluaran account (2130)
  SELECT id INTO v_ppn_keluaran_account_id
  FROM accounts
  WHERE (
    LOWER(name) LIKE '%ppn%keluaran%' OR
    code = '2130'
  )
  AND is_header = FALSE
  AND branch_id = p_branch_id
  LIMIT 1;

  IF v_ppn_keluaran_account_id IS NULL THEN
    -- Try without branch filter (global accounts)
    SELECT id INTO v_ppn_keluaran_account_id
    FROM accounts
    WHERE (
      LOWER(name) LIKE '%ppn%keluaran%' OR
      code = '2130'
    )
    AND is_header = FALSE
    LIMIT 1;
  END IF;

  IF v_ppn_keluaran_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, 'Akun PPN Keluaran (2130) tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- Find PPN Masukan account (1230)
  SELECT id INTO v_ppn_masukan_account_id
  FROM accounts
  WHERE (
    LOWER(name) LIKE '%ppn%masukan%' OR
    code = '1230'
  )
  AND is_header = FALSE
  AND branch_id = p_branch_id
  LIMIT 1;

  IF v_ppn_masukan_account_id IS NULL THEN
    -- Try without branch filter (global accounts)
    SELECT id INTO v_ppn_masukan_account_id
    FROM accounts
    WHERE (
      LOWER(name) LIKE '%ppn%masukan%' OR
      code = '1230'
    )
    AND is_header = FALSE
    LIMIT 1;
  END IF;

  IF v_ppn_masukan_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, 'Akun PPN Masukan (1230) tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- ==================== CALCULATE NET PAYMENT ====================

  -- Net payment = PPN Keluaran - PPN Masukan
  -- Jika positif, kita bayar ke negara
  -- Jika negatif, kita punya lebih bayar (kredit)
  v_net_payment := COALESCE(p_ppn_keluaran_paid, 0) - COALESCE(p_ppn_masukan_used, 0);

  -- ==================== BUILD DESCRIPTION & REFERENCE ====================

  v_description := 'Pembayaran PPN';
  IF p_period IS NOT NULL THEN
    v_description := v_description || ' periode ' || p_period;
  END IF;

  -- Create reference_id in format TAX-YYYYMM-xxx for period parsing
  -- Extract YYYYMM from period (handles both "2024-01" and "Januari 2024" formats)
  DECLARE
    v_year_month TEXT;
  BEGIN
    -- Try to match YYYY-MM format
    IF p_period ~ '^\d{4}-\d{2}$' THEN
      v_year_month := REPLACE(p_period, '-', '');
    ELSE
      -- Default to current month
      v_year_month := TO_CHAR(v_payment_date, 'YYYYMM');
    END IF;

    v_reference_id := 'TAX-' || v_year_month || '-' ||
                      LPAD((EXTRACT(EPOCH FROM NOW())::BIGINT % 10000)::TEXT, 4, '0');
  END;

  -- ==================== CREATE JOURNAL ENTRY ====================

  v_entry_number := 'JE-TAX-' || TO_CHAR(v_payment_date, 'YYYYMMDD') || '-' ||
                    LPAD((EXTRACT(EPOCH FROM NOW())::BIGINT % 10000)::TEXT, 4, '0');

  INSERT INTO journal_entries (
    entry_number,
    entry_date,
    description,
    reference_type,
    reference_id,
    is_posted,
    status,
    branch_id,
    created_by,
    created_at
  ) VALUES (
    v_entry_number,
    v_payment_date,
    CASE WHEN p_notes IS NOT NULL AND p_notes != ''
      THEN v_description || ' - ' || p_notes
      ELSE v_description
    END,
    'tax_payment',
    v_reference_id,
    TRUE,
    'posted',
    p_branch_id,
    'System',
    NOW()
  )
  RETURNING id INTO v_journal_id;

  -- ==================== JOURNAL LINE ITEMS ====================

  -- Jurnal Pembayaran PPN:
  -- Untuk mengOffset PPN Keluaran (liability) dan PPN Masukan (asset)
  --
  -- Dr PPN Keluaran (2130) - menghapus kewajiban
  -- Cr PPN Masukan (1230) - menghapus hak kredit
  -- Cr Kas - selisihnya (net payment)

  -- 1. Debit PPN Keluaran (mengurangi liability)
  IF p_ppn_keluaran_paid > 0 THEN
    INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_journal_id, v_ppn_keluaran_account_id, p_ppn_keluaran_paid, 0,
      'Offset PPN Keluaran periode ' || COALESCE(p_period, ''));
  END IF;

  -- 2. Credit PPN Masukan (mengurangi asset/hak kredit)
  IF p_ppn_masukan_used > 0 THEN
    INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_journal_id, v_ppn_masukan_account_id, 0, p_ppn_masukan_used,
      'Offset PPN Masukan periode ' || COALESCE(p_period, ''));
  END IF;

  -- 3. Kas - selisih pembayaran
  IF v_net_payment > 0 THEN
    -- Kita bayar ke negara (Credit Kas)
    INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_journal_id, p_payment_account_id, 0, v_net_payment,
      'Pembayaran PPN ke negara periode ' || COALESCE(p_period, ''));
  ELSIF v_net_payment < 0 THEN
    -- Lebih bayar - record as Debit to Kas (refund or carry forward)
    INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_journal_id, p_payment_account_id, ABS(v_net_payment), 0,
      'Lebih bayar PPN periode ' || COALESCE(p_period, ''));
  END IF;

  -- ==================== UPDATE ACCOUNT BALANCES ====================

  -- Update PPN Keluaran balance (liability decreases = subtract from balance)
  IF p_ppn_keluaran_paid > 0 THEN
    UPDATE accounts
    SET balance = COALESCE(balance, 0) - p_ppn_keluaran_paid,
        updated_at = NOW()
    WHERE id = v_ppn_keluaran_account_id;
  END IF;

  -- Update PPN Masukan balance (asset decreases = subtract from balance)
  IF p_ppn_masukan_used > 0 THEN
    UPDATE accounts
    SET balance = COALESCE(balance, 0) - p_ppn_masukan_used,
        updated_at = NOW()
    WHERE id = v_ppn_masukan_account_id;
  END IF;

  -- Update Kas/Bank balance
  IF v_net_payment > 0 THEN
    -- Payment to government: decrease cash
    UPDATE accounts
    SET balance = COALESCE(balance, 0) - v_net_payment,
        updated_at = NOW()
    WHERE id = p_payment_account_id;
  ELSIF v_net_payment < 0 THEN
    -- Overpayment refund: increase cash
    UPDATE accounts
    SET balance = COALESCE(balance, 0) + ABS(v_net_payment),
        updated_at = NOW()
    WHERE id = p_payment_account_id;
  END IF;

  -- ==================== LOG ====================

  RAISE NOTICE '[Tax Payment] Journal % created. PPN Keluaran: %, PPN Masukan: %, Net: %',
    v_entry_number, p_ppn_keluaran_paid, p_ppn_masukan_used, v_net_payment;

  RETURN QUERY SELECT TRUE, v_journal_id, v_net_payment, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION create_tax_payment_atomic(UUID, TEXT, NUMERIC, NUMERIC, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION create_tax_payment_atomic IS
  'Mencatat pembayaran pajak PPN dengan jurnal:
   - Dr PPN Keluaran (2130) - offset liability
   - Cr PPN Masukan (1230) - offset asset/kredit
   - Cr Kas - pembayaran selisih ke negara
   Parameters:
   - p_branch_id: Branch UUID
   - p_period: Tax period (e.g., "2024-01")
   - p_ppn_masukan_used: PPN input tax credit used
   - p_ppn_keluaran_paid: PPN output tax liability paid
   - p_payment_account_id: Cash/Bank account for payment
   - p_notes: Optional notes';

-- ============================================================================
-- FILE: 13_debt_installment.sql
-- ============================================================================
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
    v_entry_number := 'JE-' || TO_CHAR(v_payment_date, 'YYYYMMDD') || '-' ||
      LPAD((SELECT COUNT(*) + 1 FROM journal_entries
            WHERE branch_id = p_branch_id
            AND DATE(created_at) = v_payment_date)::TEXT, 4, '0');

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
      v_payment_date,
      format('Bayar angsuran #%s ke: %s%s',
        v_installment.installment_number,
        COALESCE(v_payable.supplier_name, 'Supplier'),
        CASE WHEN p_notes IS NOT NULL THEN ' - ' || p_notes ELSE '' END),
      'debt_installment',
      p_installment_id::TEXT,
      p_branch_id,
      'draft',
      v_installment.total_amount,
      v_installment.total_amount
    )
    RETURNING id INTO v_journal_id;

    -- Dr. Hutang Usaha
    INSERT INTO journal_entry_lines (
      journal_entry_id,
      line_number,
      account_id,
      description,
      debit_amount,
      credit_amount
    ) VALUES (
      v_journal_id,
      1,
      v_hutang_account_id,
      format('Angsuran #%s - %s', v_installment.installment_number, COALESCE(v_payable.supplier_name, 'Supplier')),
      v_installment.total_amount,
      0
    );

    -- Cr. Kas/Bank
    INSERT INTO journal_entry_lines (
      journal_entry_id,
      line_number,
      account_id,
      description,
      debit_amount,
      credit_amount
    ) VALUES (
      v_journal_id,
      2,
      v_kas_account_id,
      format('Pembayaran angsuran hutang: %s', COALESCE(v_payable.supplier_name, 'Supplier')),
      0,
      v_installment.total_amount
    );

    UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
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

-- ============================================================================
-- FILE: 13_sales_journal.sql
-- ============================================================================
-- ============================================================================
-- RPC 13: Sales Journal Functions
-- Purpose: Create sales journal entries atomically
-- Replaces: createSalesJournal and createReceivablePaymentJournal from journalService
-- ============================================================================

-- ============================================================================
-- 1. CREATE SALES JOURNAL RPC
-- Creates journal entry for sales transaction
-- Dr. Kas/Piutang, Dr. HPP -> Cr. Pendapatan, Cr. Persediaan/Hutang BD
-- ============================================================================

CREATE OR REPLACE FUNCTION create_sales_journal_rpc(
  p_branch_id UUID,
  p_transaction_id TEXT,
  p_transaction_date DATE,
  p_total_amount NUMERIC,
  p_paid_amount NUMERIC DEFAULT 0,
  p_customer_name TEXT DEFAULT 'Umum',
  p_hpp_amount NUMERIC DEFAULT 0,
  p_hpp_bonus_amount NUMERIC DEFAULT 0,
  p_ppn_enabled BOOLEAN DEFAULT FALSE,
  p_ppn_amount NUMERIC DEFAULT 0,
  p_subtotal NUMERIC DEFAULT 0,
  p_is_office_sale BOOLEAN DEFAULT FALSE,
  p_payment_account_id UUID DEFAULT NULL
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
  v_line_number INTEGER := 1;
  v_cash_amount NUMERIC;
  v_credit_amount NUMERIC;
  v_revenue_amount NUMERIC;
  v_total_hpp NUMERIC;

  -- Account IDs
  v_kas_account_id UUID;
  v_piutang_account_id UUID;
  v_pendapatan_account_id UUID;
  v_hpp_account_id UUID;
  v_hpp_bonus_account_id UUID;
  v_persediaan_account_id UUID;
  v_hutang_bd_account_id UUID;
  v_ppn_account_id UUID;
BEGIN
  -- Validate branch
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Branch ID is required'::TEXT;
    RETURN;
  END IF;

  -- Calculate amounts
  v_cash_amount := LEAST(p_paid_amount, p_total_amount);
  v_credit_amount := p_total_amount - v_cash_amount;
  v_revenue_amount := CASE WHEN p_ppn_enabled AND p_subtotal > 0 THEN p_subtotal ELSE p_total_amount END;
  v_total_hpp := p_hpp_amount + p_hpp_bonus_amount;

  -- Get account IDs
  -- Kas account (use payment account if specified, otherwise default 1110)
  IF p_payment_account_id IS NOT NULL THEN
    v_kas_account_id := p_payment_account_id;
  ELSE
    SELECT id INTO v_kas_account_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '1110' AND is_active = TRUE LIMIT 1;
  END IF;

  SELECT id INTO v_piutang_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1210' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_pendapatan_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '4100' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_hpp_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '5100' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_hpp_bonus_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '5210' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_persediaan_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1310' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_hutang_bd_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '2140' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_ppn_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '2130' AND is_active = TRUE LIMIT 1;

  -- Generate entry number
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

  -- Create journal entry header
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
    p_transaction_date,
    'Penjualan ' ||
    CASE
      WHEN v_credit_amount > 0 AND v_cash_amount = 0 THEN 'Kredit'
      WHEN v_credit_amount > 0 AND v_cash_amount > 0 THEN 'Sebagian'
      ELSE 'Tunai'
    END || ' - ' || p_transaction_id || ' - ' || p_customer_name,
    'transaction',
    p_transaction_id,
    'posted',
    FALSE,
    NOW(),
    NOW()
  ) RETURNING id INTO v_journal_id;

  -- Insert journal lines

  -- 1. Dr. Kas (if cash payment)
  IF v_cash_amount > 0 AND v_kas_account_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, account_name,
      debit_amount, credit_amount, description, line_number
    ) VALUES (
      v_journal_id, v_kas_account_id,
      (SELECT name FROM accounts WHERE id = v_kas_account_id),
      v_cash_amount, 0, 'Penerimaan kas penjualan', v_line_number
    );
    v_line_number := v_line_number + 1;
  END IF;

  -- 2. Dr. Piutang (if credit)
  IF v_credit_amount > 0 AND v_piutang_account_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, account_name,
      debit_amount, credit_amount, description, line_number
    ) VALUES (
      v_journal_id, v_piutang_account_id,
      (SELECT name FROM accounts WHERE id = v_piutang_account_id),
      v_credit_amount, 0, 'Piutang usaha', v_line_number
    );
    v_line_number := v_line_number + 1;
  END IF;

  -- 3. Cr. Pendapatan
  IF v_pendapatan_account_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, account_name,
      debit_amount, credit_amount, description, line_number
    ) VALUES (
      v_journal_id, v_pendapatan_account_id,
      (SELECT name FROM accounts WHERE id = v_pendapatan_account_id),
      0, v_revenue_amount, 'Pendapatan penjualan', v_line_number
    );
    v_line_number := v_line_number + 1;
  END IF;

  -- 4. Cr. PPN Keluaran (if PPN enabled)
  IF p_ppn_enabled AND p_ppn_amount > 0 AND v_ppn_account_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, account_name,
      debit_amount, credit_amount, description, line_number
    ) VALUES (
      v_journal_id, v_ppn_account_id,
      (SELECT name FROM accounts WHERE id = v_ppn_account_id),
      0, p_ppn_amount, 'PPN Keluaran', v_line_number
    );
    v_line_number := v_line_number + 1;
  END IF;

  -- 5. Dr. HPP (regular items)
  IF p_hpp_amount > 0 AND v_hpp_account_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, account_name,
      debit_amount, credit_amount, description, line_number
    ) VALUES (
      v_journal_id, v_hpp_account_id,
      (SELECT name FROM accounts WHERE id = v_hpp_account_id),
      p_hpp_amount, 0, 'Harga Pokok Penjualan', v_line_number
    );
    v_line_number := v_line_number + 1;
  END IF;

  -- 6. Dr. HPP Bonus
  IF p_hpp_bonus_amount > 0 AND v_hpp_bonus_account_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, account_name,
      debit_amount, credit_amount, description, line_number
    ) VALUES (
      v_journal_id, v_hpp_bonus_account_id,
      (SELECT name FROM accounts WHERE id = v_hpp_bonus_account_id),
      p_hpp_bonus_amount, 0, 'HPP Bonus/Gratis', v_line_number
    );
    v_line_number := v_line_number + 1;
  END IF;

  -- 7. Cr. Persediaan or Hutang Barang Dagang
  IF v_total_hpp > 0 THEN
    IF p_is_office_sale THEN
      -- Office Sale: Cr. Persediaan (stok langsung berkurang)
      IF v_persediaan_account_id IS NOT NULL THEN
        INSERT INTO journal_entry_lines (
          journal_entry_id, account_id, account_name,
          debit_amount, credit_amount, description, line_number
        ) VALUES (
          v_journal_id, v_persediaan_account_id,
          (SELECT name FROM accounts WHERE id = v_persediaan_account_id),
          0, v_total_hpp, 'Pengurangan persediaan', v_line_number
        );
      END IF;
    ELSE
      -- Non-Office Sale: Cr. Hutang Barang Dagang (kewajiban kirim)
      IF v_hutang_bd_account_id IS NOT NULL THEN
        INSERT INTO journal_entry_lines (
          journal_entry_id, account_id, account_name,
          debit_amount, credit_amount, description, line_number
        ) VALUES (
          v_journal_id, v_hutang_bd_account_id,
          (SELECT name FROM accounts WHERE id = v_hutang_bd_account_id),
          0, v_total_hpp, 'Hutang barang dagang', v_line_number
        );
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT TRUE, v_journal_id, v_entry_number, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 2. CREATE RECEIVABLE PAYMENT JOURNAL RPC
-- Creates journal entry for receivable payment
-- Dr. Kas/Bank -> Cr. Piutang Usaha
-- ============================================================================

CREATE OR REPLACE FUNCTION create_receivable_payment_journal_rpc(
  p_branch_id UUID,
  p_transaction_id TEXT,
  p_payment_date DATE,
  p_amount NUMERIC,
  p_customer_name TEXT DEFAULT 'Pelanggan',
  p_payment_account_id UUID DEFAULT NULL
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
  v_kas_account_id UUID;
  v_piutang_account_id UUID;
BEGIN
  -- Validate
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Branch ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Amount must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get account IDs
  IF p_payment_account_id IS NOT NULL THEN
    v_kas_account_id := p_payment_account_id;
  ELSE
    SELECT id INTO v_kas_account_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '1110' AND is_active = TRUE LIMIT 1;
  END IF;

  SELECT id INTO v_piutang_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1210' AND is_active = TRUE LIMIT 1;

  IF v_kas_account_id IS NULL OR v_piutang_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Required accounts not found'::TEXT;
    RETURN;
  END IF;

  -- Generate entry number
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

  -- Create journal entry header
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
    'Pembayaran Piutang - ' || p_transaction_id || ' - ' || p_customer_name,
    'receivable',
    p_transaction_id,
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
    p_amount, 0, 'Penerimaan kas pembayaran piutang', 1
  );

  -- Cr. Piutang
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_piutang_account_id,
    (SELECT name FROM accounts WHERE id = v_piutang_account_id),
    0, p_amount, 'Pelunasan piutang usaha', 2
  );

  RETURN QUERY SELECT TRUE, v_journal_id, v_entry_number, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION create_sales_journal_rpc(UUID, TEXT, DATE, NUMERIC, NUMERIC, TEXT, NUMERIC, NUMERIC, BOOLEAN, NUMERIC, NUMERIC, BOOLEAN, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_receivable_payment_journal_rpc(UUID, TEXT, DATE, NUMERIC, TEXT, UUID) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION create_sales_journal_rpc IS
  'Create sales journal entry atomically. Handles cash/credit split, HPP, PPN, and office sale logic.';
COMMENT ON FUNCTION create_receivable_payment_journal_rpc IS
  'Create receivable payment journal entry. Dr. Kas, Cr. Piutang.';

-- ============================================================================
-- FILE: 14_account_management.sql
-- ============================================================================
-- ============================================================================
-- RPC 14: Account Management
-- Purpose: Manage Chart of Accounts (COA) atomically
-- ============================================================================

-- Drop existing functions if any
DROP FUNCTION IF EXISTS create_account(UUID, TEXT, TEXT, TEXT, NUMERIC, BOOLEAN, TEXT, UUID, BOOLEAN, INTEGER, UUID);
DROP FUNCTION IF EXISTS update_account(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, BOOLEAN, TEXT, UUID, BOOLEAN, BOOLEAN, INTEGER, UUID);
DROP FUNCTION IF EXISTS delete_account(UUID);
DROP FUNCTION IF EXISTS import_standard_coa(UUID, JSONB);

-- ============================================================================
-- 1. CREATE ACCOUNT
-- ============================================================================
CREATE OR REPLACE FUNCTION create_account(
  p_branch_id UUID,
  p_name TEXT,
  p_code TEXT,
  p_type TEXT,
  p_initial_balance NUMERIC DEFAULT 0,
  p_is_payment_account BOOLEAN DEFAULT FALSE,
  p_parent_id UUID DEFAULT NULL,
  p_level INTEGER DEFAULT 1,
  p_is_header BOOLEAN DEFAULT FALSE,
  p_sort_order INTEGER DEFAULT 0,
  p_employee_id UUID DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  account_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_account_id UUID;
  v_code_exists BOOLEAN;
BEGIN
  -- Validasi Branch
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is required';
    RETURN;
  END IF;

  -- Validasi Kode Unik dalam Branch
  IF p_code IS NOT NULL AND p_code != '' THEN
    SELECT EXISTS (
      SELECT 1 FROM accounts 
      WHERE code = p_code AND branch_id = p_branch_id AND is_active = TRUE
    ) INTO v_code_exists;
    
    IF v_code_exists THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, 'Account code already exists in this branch';
      RETURN;
    END IF;
  END IF;

  INSERT INTO accounts (
    branch_id,
    name,
    code,
    type,
    balance, -- Initial balance starts as current balance
    initial_balance,
    is_payment_account,
    parent_id,
    level,
    is_header,
    sort_order,
    employee_id,
    is_active,
    created_at,
    updated_at
  ) VALUES (
    p_branch_id,
    p_name,
    NULLIF(p_code, ''),
    p_type,
    p_initial_balance,
    p_initial_balance,
    p_is_payment_account,
    p_parent_id,
    p_level,
    p_is_header,
    p_sort_order,
    p_employee_id,
    TRUE,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_account_id;

  RETURN QUERY SELECT TRUE, v_account_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. UPDATE ACCOUNT
-- ============================================================================
CREATE OR REPLACE FUNCTION update_account(
  p_account_id UUID,
  p_branch_id UUID,
  p_name TEXT,
  p_code TEXT,
  p_type TEXT,
  p_initial_balance NUMERIC,
  p_is_payment_account BOOLEAN,
  p_parent_id UUID,
  p_level INTEGER,
  p_is_header BOOLEAN,
  p_is_active BOOLEAN,
  p_sort_order INTEGER,
  p_employee_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  account_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_code_exists BOOLEAN;
  v_current_code TEXT;
BEGIN
  -- Validasi Branch (untuk security check, pastikan akun milik branch yg benar)
  IF NOT EXISTS (SELECT 1 FROM accounts WHERE id = p_account_id AND (branch_id = p_branch_id OR branch_id IS NULL)) THEN
     RETURN QUERY SELECT FALSE, NULL::UUID, 'Account not found or access denied';
     RETURN;
  END IF;

  -- Get current code
  SELECT code INTO v_current_code FROM accounts WHERE id = p_account_id;

  -- Validasi Kode Unik (jika berubah)
  IF p_code IS NOT NULL AND p_code != '' AND (v_current_code IS NULL OR p_code != v_current_code) THEN
    SELECT EXISTS (
      SELECT 1 FROM accounts 
      WHERE code = p_code AND branch_id = p_branch_id AND id != p_account_id AND is_active = TRUE
    ) INTO v_code_exists;
    
    IF v_code_exists THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, 'Account code already exists in this branch';
      RETURN;
    END IF;
  END IF;

  UPDATE accounts
  SET
    name = COALESCE(p_name, name),
    code = NULLIF(p_code, ''),
    type = COALESCE(p_type, type),
    initial_balance = COALESCE(p_initial_balance, initial_balance),
    is_payment_account = COALESCE(p_is_payment_account, is_payment_account),
    parent_id = p_parent_id, -- Allow NULL
    level = COALESCE(p_level, level),
    is_header = COALESCE(p_is_header, is_header),
    is_active = COALESCE(p_is_active, is_active),
    sort_order = COALESCE(p_sort_order, sort_order),
    employee_id = p_employee_id, -- Allow NULL
    updated_at = NOW()
  WHERE id = p_account_id;

  RETURN QUERY SELECT TRUE, p_account_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 3. DELETE ACCOUNT
-- ============================================================================
CREATE OR REPLACE FUNCTION delete_account(
  p_account_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  error_message TEXT
) AS $$
DECLARE
  v_has_transactions BOOLEAN;
  v_has_children BOOLEAN;
BEGIN
  -- Cek Transactions
  SELECT EXISTS (
    SELECT 1 FROM journal_entry_lines WHERE account_id = p_account_id
  ) INTO v_has_transactions;

  IF v_has_transactions THEN
    RETURN QUERY SELECT FALSE, 'Cannot delete account with existing transactions. Deactivate it instead.';
    RETURN;
  END IF;

  -- Cek Children
  SELECT EXISTS (
    SELECT 1 FROM accounts WHERE parent_id = p_account_id
  ) INTO v_has_children;

  IF v_has_children THEN
    RETURN QUERY SELECT FALSE, 'Cannot delete account with sub-accounts';
    RETURN;
  END IF;

  DELETE FROM accounts WHERE id = p_account_id;

  RETURN QUERY SELECT TRUE, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. IMPORT STANDARD COA
-- ============================================================================
CREATE OR REPLACE FUNCTION import_standard_coa(
  p_branch_id UUID,
  p_items JSONB
)
RETURNS TABLE (
  success BOOLEAN,
  imported_count INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_item JSONB;
  v_count INTEGER := 0;
BEGIN
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Branch ID is required';
    RETURN;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- Insert or ignore if code exists (or update?)
    -- Logic similar to useAccounts: upsert based on some key, but here we don't have predictable IDs.
    -- We'll check by code.
    
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE branch_id = p_branch_id AND code = (v_item->>'code')) THEN
       INSERT INTO accounts (
         branch_id,
         name,
         code,
         type,
         level,
         is_header,
         sort_order,
         is_active,
         balance,
         initial_balance,
         created_at,
         updated_at
       ) VALUES (
         p_branch_id,
         v_item->>'name',
         v_item->>'code',
         v_item->>'type',
         (v_item->>'level')::INTEGER,
         (v_item->>'isHeader')::BOOLEAN,
         (v_item->>'sortOrder')::INTEGER,
         TRUE,
         0,
         0,
         NOW(),
         NOW()
       );
       v_count := v_count + 1;
    END IF;
  END LOOP;
  
  -- Second pass for parents? 
  -- Simplified: Assumes hierarchy is handled by codes or manual update later if needed.
  -- Or implemented if 'parentCode' provided.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
     IF (v_item->>'parentCode') IS NOT NULL THEN
        UPDATE accounts child
        SET parent_id = parent.id
        FROM accounts parent
        WHERE child.branch_id = p_branch_id AND child.code = (v_item->>'code')
          AND parent.branch_id = p_branch_id AND parent.code = (v_item->>'parentCode');
     END IF;
  END LOOP;

  RETURN QUERY SELECT TRUE, v_count, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0, SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grants
GRANT EXECUTE ON FUNCTION create_account(UUID, TEXT, TEXT, TEXT, NUMERIC, BOOLEAN, UUID, INTEGER, BOOLEAN, INTEGER, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_account(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, BOOLEAN, UUID, INTEGER, BOOLEAN, BOOLEAN, INTEGER, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_account(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION import_standard_coa(UUID, JSONB) TO authenticated;

-- ============================================================================
-- FILE: 14_employee_advance.sql
-- ============================================================================
-- ============================================================================
-- RPC 14: Employee Advance (Kasbon) Atomic Functions
-- Purpose: Manage employee advances with proper journal entries
-- - Create advance: Dr. Piutang Karyawan, Cr. Kas
-- - Repay advance: Dr. Kas, Cr. Piutang Karyawan
-- ============================================================================

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
  v_payment_account_id UUID;

  v_kas_account_id UUID;
  v_piutang_karyawan_id UUID;
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
  v_payment_account_id := (p_advance->>'payment_account_id')::UUID;

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
    advance_date,
    reason,
    status,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    v_advance_id,
    p_branch_id,
    v_employee_id,
    v_employee_name,
    v_amount,
    v_amount, -- remaining = full amount initially
    v_advance_date,
    v_reason,
    'active',
    auth.uid(),
    NOW(),
    NOW()
  );

  -- ==================== CREATE JOURNAL ENTRY ====================

  -- Generate entry number
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

  -- Create journal header
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
    v_advance_date,
    'Kasbon Karyawan - ' || v_employee_name || ' - ' || v_reason,
    'advance',
    v_advance_id::TEXT,
    'posted',
    FALSE,
    NOW(),
    NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Piutang Karyawan
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_piutang_karyawan_id,
    (SELECT name FROM accounts WHERE id = v_piutang_karyawan_id),
    v_amount, 0, 'Kasbon ' || v_employee_name, 1
  );

  -- Cr. Kas
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_kas_account_id,
    (SELECT name FROM accounts WHERE id = v_kas_account_id),
    0, v_amount, 'Pengeluaran kas untuk kasbon', 2
  );

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
  v_kas_account_id UUID;
  v_piutang_karyawan_id UUID;
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
  WHERE id = p_advance_id AND branch_id = p_branch_id
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
    status = 'cancelled',
    updated_at = NOW()
  WHERE id = p_advance_id;

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
-- FILE: 15_coa_adjustments.sql
-- ============================================================================
-- ============================================================================
-- RPC 15: COA Adjustments
-- Purpose: Atomic operations for COA initial balance and journal posting
-- ============================================================================

-- ============================================================================
-- 1. UPDATE ACCOUNT INITIAL BALANCE ATOMIC
-- Update initial balance and sync opening journal
-- ============================================================================

CREATE OR REPLACE FUNCTION update_account_initial_balance_atomic(
  p_account_id TEXT,
  p_new_initial_balance NUMERIC,
  p_branch_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_user_name TEXT DEFAULT 'System'
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_account RECORD;
  v_journal_id UUID;
  v_entry_number TEXT;
  v_old_initial NUMERIC;
  v_equity_account_id TEXT;
  v_description TEXT;
BEGIN
  -- 1. Validate inputs
  IF p_account_id IS NULL OR p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Account ID and Branch ID are required'::TEXT;
    RETURN;
  END IF;

  -- 2. Get account info
  SELECT id, code, name, type, initial_balance INTO v_account
  FROM accounts
  WHERE id = p_account_id AND branch_id = p_branch_id;

  IF v_account.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Account not found'::TEXT;
    RETURN;
  END IF;

  v_old_initial := COALESCE(v_account.initial_balance, 0);

  -- No change needed if balances are equal
  IF v_old_initial = p_new_initial_balance THEN
    -- Try to find existing journal
    SELECT id INTO v_journal_id FROM journal_entries 
    WHERE reference_id = p_account_id AND reference_type = 'opening_balance' AND branch_id = p_branch_id
    LIMIT 1;
    
    RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;
    RETURN;
  END IF;

  -- 3. Update account initial balance
  UPDATE accounts
  SET initial_balance = p_new_initial_balance,
      updated_at = NOW()
  WHERE id = p_account_id;

  -- 4. Sync opening journal
  -- Use Equity/Modal account (3xxx) for balancing opening entries
  -- Search for Modal Awal or similar
  SELECT id INTO v_equity_account_id
  FROM accounts
  WHERE code LIKE '3%' AND branch_id = p_branch_id AND is_active = TRUE
  ORDER BY code ASC
  LIMIT 1;

  IF v_equity_account_id IS NULL THEN
    -- Fallback to any active account if Modal not found (should not happen in standard COA)
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Equity account not found for balancing opening entry'::TEXT;
    RETURN;
  END IF;

  -- Find existing journal or create new
  SELECT id INTO v_journal_id 
  FROM journal_entries 
  WHERE reference_id = p_account_id AND reference_type = 'opening_balance' AND branch_id = p_branch_id;

  v_description := format('Saldo Awal: %s - %s', v_account.code, v_account.name);

  IF v_journal_id IS NOT NULL THEN
    -- Update existing journal - set to draft first to allow line updates
    UPDATE journal_entries 
    SET status = 'draft',
        total_debit = ABS(p_new_initial_balance),
        total_credit = ABS(p_new_initial_balance),
        updated_at = NOW()
    WHERE id = v_journal_id;

    -- Delete old lines
    DELETE FROM journal_entry_lines WHERE journal_entry_id = v_journal_id;
  ELSE
    -- Create new journal header
    v_entry_number := 'OB-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0');
    
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
      '2024-01-01', -- Standard opening date
      v_description,
      'opening_balance',
      p_account_id,
      p_branch_id,
      'draft',
      ABS(p_new_initial_balance),
      ABS(p_new_initial_balance)
    ) RETURNING id INTO v_journal_id;
  END IF;

  -- Create lines based on account type
  -- Debit/Credit logic for opening balance
  IF p_new_initial_balance > 0 THEN
    -- Account is Debit (Aset/Beban)
    IF v_account.type IN ('Aset', 'Beban') THEN
      INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
      VALUES (v_journal_id, 1, p_account_id, v_description, p_new_initial_balance, 0),
             (v_journal_id, 2, v_equity_account_id, v_description, 0, p_new_initial_balance);
    -- Account is Credit (Liabilitas/Ekuitas/Pendapatan)
    ELSE
      INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
      VALUES (v_journal_id, 1, p_account_id, v_description, 0, p_new_initial_balance),
             (v_journal_id, 2, v_equity_account_id, v_description, p_new_initial_balance, 0);
    END IF;
  END IF;

  -- Post the journal
  UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;

  RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. POST JOURNAL ATOMIC
-- Safely change journal status to posted
-- ============================================================================

CREATE OR REPLACE FUNCTION post_journal_atomic(
  p_journal_id UUID,
  p_branch_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT
) AS $$
DECLARE
  v_journal RECORD;
BEGIN
  SELECT id, status, total_debit, total_credit INTO v_journal
  FROM journal_entries
  WHERE id = p_journal_id AND branch_id = p_branch_id;

  IF v_journal.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Journal entry not found'::TEXT;
    RETURN;
  END IF;

  IF v_journal.status = 'posted' THEN
    RETURN QUERY SELECT TRUE, 'Journal already posted'::TEXT;
    RETURN;
  END IF;

  IF v_journal.total_debit != v_journal.total_credit THEN
    RETURN QUERY SELECT FALSE, 'Journal is not balanced'::TEXT;
    RETURN;
  END IF;

  UPDATE journal_entries
  SET status = 'posted',
      updated_at = NOW()
  WHERE id = p_journal_id;

  RETURN QUERY SELECT TRUE, 'Journal posted successfully'::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- GRANTS
GRANT EXECUTE ON FUNCTION update_account_initial_balance_atomic(TEXT, NUMERIC, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION post_journal_atomic(UUID, UUID) TO authenticated;

-- ============================================================================
-- FILE: 15_zakat.sql
-- ============================================================================
-- ============================================================================
-- RPC 15: Zakat Atomic Functions
-- Purpose: Manage zakat payments with proper journal entries
-- - Pay zakat: Dr. Beban Zakat, Cr. Kas
-- ============================================================================

-- ============================================================================
-- 1. CREATE ZAKAT PAYMENT ATOMIC
-- Pembayaran zakat dengan jurnal otomatis
-- ============================================================================

CREATE OR REPLACE FUNCTION create_zakat_payment_atomic(
  p_zakat JSONB,
  p_branch_id UUID,
  p_created_by UUID DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  zakat_id UUID,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_zakat_id UUID;
  v_journal_id UUID;
  v_amount NUMERIC;
  v_zakat_type TEXT;
  v_payment_date DATE;
  v_recipient TEXT;
  v_notes TEXT;
  v_payment_account_id UUID;

  v_kas_account_id UUID;
  v_beban_zakat_id UUID;
  v_entry_number TEXT;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  -- ==================== PARSE DATA ====================

  v_zakat_id := COALESCE((p_zakat->>'id')::UUID, gen_random_uuid());
  v_amount := COALESCE((p_zakat->>'amount')::NUMERIC, 0);
  v_zakat_type := COALESCE(p_zakat->>'zakat_type', 'maal'); -- maal, fitrah, profesi
  v_payment_date := COALESCE((p_zakat->>'payment_date')::DATE, CURRENT_DATE);
  v_recipient := COALESCE(p_zakat->>'recipient', 'Lembaga Amil Zakat');
  v_notes := p_zakat->>'notes';
  v_payment_account_id := (p_zakat->>'payment_account_id')::UUID;

  IF v_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Amount must be positive'::TEXT;
    RETURN;
  END IF;

  -- ==================== GET ACCOUNT IDS ====================

  -- Kas account
  IF v_payment_account_id IS NOT NULL THEN
    v_kas_account_id := v_payment_account_id;
  ELSE
    SELECT id INTO v_kas_account_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '1110' AND is_active = TRUE LIMIT 1;
  END IF;

  -- Beban Zakat (6xxx - Beban Operasional, atau buat khusus 6500)
  SELECT id INTO v_beban_zakat_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '6500' AND is_active = TRUE LIMIT 1;

  -- Fallback: cari akun dengan nama mengandung "Zakat"
  IF v_beban_zakat_id IS NULL THEN
    SELECT id INTO v_beban_zakat_id FROM accounts
    WHERE branch_id = p_branch_id AND name ILIKE '%zakat%' AND is_active = TRUE LIMIT 1;
  END IF;

  -- Fallback: gunakan Beban Lain-lain (8100)
  IF v_beban_zakat_id IS NULL THEN
    SELECT id INTO v_beban_zakat_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '8100' AND is_active = TRUE LIMIT 1;
  END IF;

  IF v_kas_account_id IS NULL OR v_beban_zakat_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Akun Kas atau Beban Zakat tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- ==================== INSERT ZAKAT RECORD ====================

  INSERT INTO zakat_payments (
    id,
    branch_id,
    amount,
    zakat_type,
    payment_date,
    recipient,
    notes,
    status,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    v_zakat_id,
    p_branch_id,
    v_amount,
    v_zakat_type,
    v_payment_date,
    v_recipient,
    v_notes,
    'paid',
    p_created_by,
    NOW(),
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
    v_payment_date,
    'Pembayaran Zakat ' || INITCAP(v_zakat_type) || ' - ' || v_recipient,
    'zakat',
    v_zakat_id::TEXT,
    'posted',
    FALSE,
    NOW(),
    NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Beban Zakat
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_beban_zakat_id,
    (SELECT name FROM accounts WHERE id = v_beban_zakat_id),
    v_amount, 0, 'Beban Zakat ' || INITCAP(v_zakat_type), 1
  );

  -- Cr. Kas
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_kas_account_id,
    (SELECT name FROM accounts WHERE id = v_kas_account_id),
    0, v_amount, 'Pengeluaran kas untuk zakat', 2
  );

  -- ==================== SUCCESS ====================

  RETURN QUERY SELECT TRUE, v_zakat_id, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 2. VOID ZAKAT PAYMENT ATOMIC
-- Batalkan pembayaran zakat dengan rollback jurnal
-- ============================================================================

CREATE OR REPLACE FUNCTION void_zakat_payment_atomic(
  p_zakat_id UUID,
  p_branch_id UUID,
  p_reason TEXT DEFAULT 'Dibatalkan',
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  journals_voided INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_zakat RECORD;
  v_journals_voided INTEGER := 0;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  -- Get zakat record
  SELECT * INTO v_zakat
  FROM zakat_payments
  WHERE id = p_zakat_id AND branch_id = p_branch_id
  FOR UPDATE;

  IF v_zakat.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Pembayaran zakat tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  IF v_zakat.status = 'cancelled' THEN
    RETURN QUERY SELECT FALSE, 0, 'Pembayaran zakat sudah dibatalkan'::TEXT;
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
  WHERE reference_type = 'zakat'
    AND reference_id = p_zakat_id::TEXT
    AND branch_id = p_branch_id
    AND is_voided = FALSE;

  GET DIAGNOSTICS v_journals_voided = ROW_COUNT;

  -- ==================== UPDATE STATUS ====================

  UPDATE zakat_payments
  SET
    status = 'cancelled',
    updated_at = NOW()
  WHERE id = p_zakat_id;

  -- ==================== SUCCESS ====================

  RETURN QUERY SELECT TRUE, v_journals_voided, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION create_zakat_payment_atomic(JSONB, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION void_zakat_payment_atomic(UUID, UUID, TEXT, UUID) TO authenticated;


-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION create_zakat_payment_atomic IS
  'Create zakat payment with auto journal. Dr. Beban Zakat, Cr. Kas.';
COMMENT ON FUNCTION void_zakat_payment_atomic IS
  'Void zakat payment and related journals.';

-- ============================================================================
-- FILE: 16_commission_payment.sql
-- ============================================================================
-- ============================================================================
-- RPC 16: Commission Payment Atomic Functions
-- Purpose: Process commission payments with proper journal entries
-- - Pay commission: Dr. Beban Komisi, Cr. Kas/Hutang Komisi
-- ============================================================================

-- ============================================================================
-- 1. PAY COMMISSION ATOMIC
-- Pembayaran komisi karyawan dengan jurnal otomatis
-- ============================================================================

CREATE OR REPLACE FUNCTION pay_commission_atomic(
  p_employee_id UUID,
  p_branch_id UUID,
  p_amount NUMERIC,
  p_payment_date DATE DEFAULT CURRENT_DATE,
  p_payment_method TEXT DEFAULT 'cash',
  p_commission_ids UUID[] DEFAULT NULL, -- specific commission entries to pay
  p_notes TEXT DEFAULT NULL,
  p_paid_by UUID DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  payment_id UUID,
  journal_id UUID,
  commissions_paid INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_payment_id UUID;
  v_journal_id UUID;
  v_employee_name TEXT;
  v_kas_account_id UUID;
  v_beban_komisi_id UUID;
  v_entry_number TEXT;
  v_commissions_paid INTEGER := 0;
  v_total_pending NUMERIC;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_employee_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0, 'Employee ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0, 'Amount must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get employee name from profiles table (localhost uses profiles, not employees)
  SELECT full_name INTO v_employee_name FROM profiles WHERE id = p_employee_id;

  IF v_employee_name IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0, 'Karyawan tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- Check total pending commissions
  SELECT COALESCE(SUM(amount), 0) INTO v_total_pending
  FROM commission_entries
  WHERE user_id = p_employee_id
    AND branch_id = p_branch_id
    AND status = 'pending';

  IF v_total_pending < p_amount THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0,
      format('Jumlah pembayaran (%s) melebihi total komisi pending (%s)', p_amount, v_total_pending)::TEXT;
    RETURN;
  END IF;

  -- ==================== GET ACCOUNT IDS ====================

  SELECT id INTO v_kas_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1110' AND is_active = TRUE LIMIT 1;

  -- Beban Komisi (biasanya 6200 atau sesuai chart of accounts)
  SELECT id INTO v_beban_komisi_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '6200' AND is_active = TRUE LIMIT 1;

  -- Fallback: cari akun dengan nama mengandung "Komisi"
  IF v_beban_komisi_id IS NULL THEN
    SELECT id INTO v_beban_komisi_id FROM accounts
    WHERE branch_id = p_branch_id AND name ILIKE '%komisi%' AND type = 'expense' AND is_active = TRUE LIMIT 1;
  END IF;

  -- Fallback: gunakan Beban Gaji (6100)
  IF v_beban_komisi_id IS NULL THEN
    SELECT id INTO v_beban_komisi_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '6100' AND is_active = TRUE LIMIT 1;
  END IF;

  IF v_kas_account_id IS NULL OR v_beban_komisi_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0, 'Akun Kas atau Beban Komisi tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- ==================== UPDATE COMMISSION ENTRIES ====================

  v_payment_id := gen_random_uuid();

  IF p_commission_ids IS NOT NULL AND array_length(p_commission_ids, 1) > 0 THEN
    -- Pay specific commission entries
    UPDATE commission_entries
    SET
      status = 'paid',
      paid_at = NOW(),
      payment_id = v_payment_id,
      updated_at = NOW()
    WHERE id = ANY(p_commission_ids)
      AND user_id = p_employee_id
      AND branch_id = p_branch_id
      AND status = 'pending';

    GET DIAGNOSTICS v_commissions_paid = ROW_COUNT;
  ELSE
    -- Pay oldest pending commissions up to amount
    WITH to_pay AS (
      SELECT id, amount,
        SUM(amount) OVER (ORDER BY created_at) as running_total
      FROM commission_entries
      WHERE user_id = p_employee_id
        AND branch_id = p_branch_id
        AND status = 'pending'
      ORDER BY created_at
    )
    UPDATE commission_entries ce
    SET
      status = 'paid',
      paid_at = NOW(),
      payment_id = v_payment_id,
      updated_at = NOW()
    FROM to_pay tp
    WHERE ce.id = tp.id
      AND tp.running_total <= p_amount;

    GET DIAGNOSTICS v_commissions_paid = ROW_COUNT;
  END IF;

  -- ==================== INSERT PAYMENT RECORD ====================

  INSERT INTO commission_payments (
    id,
    employee_id,
    employee_name,
    branch_id,
    amount,
    payment_date,
    payment_method,
    notes,
    paid_by,
    created_at
  ) VALUES (
    v_payment_id,
    p_employee_id,
    v_employee_name,
    p_branch_id,
    p_amount,
    p_payment_date,
    p_payment_method,
    p_notes,
    p_paid_by,
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
    'Pembayaran Komisi - ' || v_employee_name,
    'commission_payment',
    v_payment_id::TEXT,
    'posted',
    FALSE,
    NOW(),
    NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Beban Komisi
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_beban_komisi_id,
    (SELECT name FROM accounts WHERE id = v_beban_komisi_id),
    p_amount, 0, 'Beban komisi ' || v_employee_name, 1
  );

  -- Cr. Kas
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_kas_account_id,
    (SELECT name FROM accounts WHERE id = v_kas_account_id),
    0, p_amount, 'Pengeluaran kas untuk komisi', 2
  );

  -- ==================== SUCCESS ====================

  RETURN QUERY SELECT TRUE, v_payment_id, v_journal_id, v_commissions_paid, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 2. GET PENDING COMMISSIONS
-- Dapatkan daftar komisi pending untuk karyawan
-- ============================================================================

CREATE OR REPLACE FUNCTION get_pending_commissions(
  p_employee_id UUID,
  p_branch_id UUID
)
RETURNS TABLE (
  commission_id UUID,
  amount NUMERIC,
  commission_type TEXT,
  product_name TEXT,
  transaction_id TEXT,
  delivery_id UUID,
  entry_date DATE,
  created_at TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ce.id,
    ce.amount,
    ce.commission_type,
    p.name,
    ce.transaction_id,
    ce.delivery_id,
    ce.entry_date,
    ce.created_at
  FROM commission_entries ce
  LEFT JOIN products p ON p.id = ce.product_id
  WHERE ce.user_id = p_employee_id
    AND ce.branch_id = p_branch_id
    AND ce.status = 'pending'
  ORDER BY ce.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 3. GET COMMISSION SUMMARY
-- Ringkasan komisi per karyawan
-- ============================================================================

CREATE OR REPLACE FUNCTION get_commission_summary(
  p_branch_id UUID,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL
)
RETURNS TABLE (
  employee_id UUID,
  employee_name TEXT,
  role TEXT,
  total_pending NUMERIC,
  total_paid NUMERIC,
  pending_count BIGINT,
  paid_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ce.user_id,
    MAX(ce.user_name),
    MAX(ce.role),
    COALESCE(SUM(CASE WHEN ce.status = 'pending' THEN ce.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN ce.status = 'paid' THEN ce.amount ELSE 0 END), 0),
    COUNT(CASE WHEN ce.status = 'pending' THEN 1 END),
    COUNT(CASE WHEN ce.status = 'paid' THEN 1 END)
  FROM commission_entries ce
  WHERE ce.branch_id = p_branch_id
    AND (p_date_from IS NULL OR ce.entry_date >= p_date_from)
    AND (p_date_to IS NULL OR ce.entry_date <= p_date_to)
  GROUP BY ce.user_id
  ORDER BY MAX(ce.user_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION pay_commission_atomic(UUID, UUID, NUMERIC, DATE, TEXT, UUID[], TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_pending_commissions(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_commission_summary(UUID, DATE, DATE) TO authenticated;


-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION pay_commission_atomic IS
  'Pay employee commission with auto journal. Dr. Beban Komisi, Cr. Kas.';
COMMENT ON FUNCTION get_pending_commissions IS
  'Get list of pending commissions for an employee.';
COMMENT ON FUNCTION get_commission_summary IS
  'Get commission summary per employee for a branch.';

-- ============================================================================
-- FILE: 16_po_management.sql
-- ============================================================================
-- ============================================================================
-- RPC 16: Purchase Order Management Atomic
-- Purpose: Pembuatan dan Persetujuan PO secara atomik
-- ============================================================================

-- 1. CREATE PURCHASE ORDER ATOMIC
-- Membuat header dan item PO dalam satu transaksi
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
    created_by,
    created_at,
    updated_at
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
    auth.uid(),  -- Use auth.uid() instead of frontend-passed value
    NOW(),
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

-- 2. APPROVE PURCHASE ORDER ATOMIC
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

    v_entry_number := 'JE-PO-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM()*10000)::TEXT, 4, '0');
    
    INSERT INTO journal_entries(entry_number, entry_date, description, reference_type, reference_id, branch_id, status, total_debit, total_credit)
    VALUES (v_entry_number, NOW(), 'Pembelian Bahan Baku: ' || v_po.supplier_name || ' (' || p_po_id || ')', 'purchase_order', p_po_id, p_branch_id, 'posted', v_total_material + v_material_ppn, v_total_material + v_material_ppn)
    RETURNING id INTO v_journal_id;
    
    v_journal_ids := array_append(v_journal_ids, v_journal_id);

    -- Dr. Persediaan Bahan Baku
    INSERT INTO journal_entry_lines(journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
    VALUES (v_journal_id, 1, v_acc_persediaan_bahan, 'Persediaan: ' || v_material_names, v_total_material, 0);
    
    -- Dr. Piutang Pajak (PPN Masukan) jika ada
    IF v_material_ppn > 0 AND v_acc_piutang_pajak IS NOT NULL THEN
      INSERT INTO journal_entry_lines(journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
      VALUES (v_journal_id, 2, v_acc_piutang_pajak, 'PPN Masukan (PO ' || p_po_id || ')', v_material_ppn, 0);
    END IF;

    -- Cr. Hutang Usaha
    INSERT INTO journal_entry_lines(journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
    VALUES (v_journal_id, 3, v_acc_hutang_usaha, 'Hutang: ' || v_po.supplier_name, 0, v_total_material + v_material_ppn);
  END IF;

  -- 5. Create Product Journal
  IF v_total_product > 0 THEN
    IF v_acc_persediaan_produk IS NULL THEN
      RETURN QUERY SELECT FALSE, NULL::UUID[], NULL::TEXT, 'Akun Persediaan Barang Dagang (1310) tidak ditemukan'::TEXT;
      RETURN;
    END IF;

    v_entry_number := 'JE-PO-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM()*10000)::TEXT, 4, '1');
    
    INSERT INTO journal_entries(entry_number, entry_date, description, reference_type, reference_id, branch_id, status, total_debit, total_credit)
    VALUES (v_entry_number, NOW(), 'Pembelian Produk Jadi: ' || v_po.supplier_name || ' (' || p_po_id || ')', 'purchase_order', p_po_id, p_branch_id, 'posted', v_total_product + v_product_ppn, v_total_product + v_product_ppn)
    RETURNING id INTO v_journal_id;
    
    v_journal_ids := array_append(v_journal_ids, v_journal_id);

    -- Dr. Persediaan Produk Jadi
    INSERT INTO journal_entry_lines(journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
    VALUES (v_journal_id, 1, v_acc_persediaan_produk, 'Persediaan: ' || v_product_names, v_total_product, 0);
    
    -- Dr. Piutang Pajak (PPN Masukan) jika ada
    IF v_product_ppn > 0 AND v_acc_piutang_pajak IS NOT NULL THEN
      INSERT INTO journal_entry_lines(journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
      VALUES (v_journal_id, 2, v_acc_piutang_pajak, 'PPN Masukan (PO ' || p_po_id || ')', v_product_ppn, 0);
    END IF;

    -- Cr. Hutang Usaha
    INSERT INTO journal_entry_lines(journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
    VALUES (v_journal_id, 3, v_acc_hutang_usaha, 'Hutang: ' || v_po.supplier_name, 0, v_total_product + v_product_ppn);
  END IF;

  -- 6. Create Accounts Payable (AP)
  v_due_date := NOW()::DATE + INTERVAL '30 days'; -- Default
  SELECT payment_terms INTO v_supplier_terms FROM suppliers WHERE id = v_po.supplier_id;
  IF v_supplier_terms ILIKE '%net%' THEN
    v_days := (regexp_matches(v_supplier_terms, '\d+'))[1]::INTEGER;
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

-- ============================================================================
-- FILE: 17_production_void.sql
-- ============================================================================
-- ============================================================================
-- RPC 17: Production Void Atomic
-- Purpose: Membatalkan produksi secara atomik (rollback stok & jurnal)
-- ============================================================================

CREATE OR REPLACE FUNCTION void_production_atomic(
  p_production_id UUID,
  p_branch_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  error_message TEXT
) AS $$
DECLARE
  v_record RECORD;
  v_consumption RECORD;
  v_movement RECORD;
  v_journal_id UUID;
BEGIN
  -- 1. Get Production Record
  SELECT * INTO v_record FROM production_records 
  WHERE id = p_production_id AND branch_id = p_branch_id;
  
  IF v_record.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Data produksi tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- 2. Handle Stock Rollback (FIFO)
  -- Cari semua konsumsi batch yang terkait dengan produksi ini (via reference_id/ref)
  FOR v_consumption IN 
    SELECT * FROM inventory_batch_consumptions 
    WHERE reference_id = v_record.ref AND reference_type IN ('production', 'production_error')
  LOOP
    -- Kembalikan kuantitas ke batch asal
    UPDATE inventory_batches 
    SET remaining_quantity = remaining_quantity + v_consumption.quantity_consumed,
        updated_at = NOW()
    WHERE id = v_consumption.batch_id;
  END LOOP;

  -- Hapus log konsumsi
  DELETE FROM inventory_batch_consumptions 
  WHERE reference_id = v_record.ref AND reference_type IN ('production', 'production_error');

  -- 3. Rollback Legacy Stock (materials.stock)
  -- Meskipun deprecated, kita tetap sync untuk menjaga kompatibilitas UI lama
  IF v_record.consume_bom THEN
    -- Restore materials stock based on movements
    FOR v_movement IN 
      SELECT material_id, quantity FROM material_stock_movements 
      WHERE reference_id = v_record.id::TEXT AND reference_type = 'production' AND type = 'OUT'
    LOOP
      UPDATE materials 
      SET stock = stock + v_movement.quantity, 
          updated_at = NOW()
      WHERE id = v_movement.material_id;
    END LOOP;
  ELSIF v_record.quantity < 0 AND v_record.product_id IS NULL THEN
    -- Case Spoilage/Error Input: restore material from notes or movement
    FOR v_movement IN 
      SELECT material_id, quantity FROM material_stock_movements 
      WHERE reference_id = v_record.id::TEXT AND reference_type = 'production' AND type = 'OUT'
    LOOP
      UPDATE materials 
      SET stock = stock + v_movement.quantity, 
          updated_at = NOW()
      WHERE id = v_movement.material_id;
    END LOOP;
  END IF;

  -- 4. Delete Material Stock Movements
  DELETE FROM material_stock_movements 
  WHERE reference_id = v_record.id::TEXT AND reference_type = 'production';

  -- 5. Void Related Journals
  -- Cari jurnal yang mereferensikan produksi ini
  FOR v_journal_id IN 
    SELECT id FROM journal_entries 
    WHERE reference_id = v_record.id::TEXT AND reference_type = 'adjustment' AND is_voided = FALSE
  LOOP
    -- Mark as voided
    UPDATE journal_entries 
    SET is_voided = TRUE, 
        voided_reason = 'Production deleted: ' || v_record.ref,
        updated_at = NOW()
    WHERE id = v_journal_id;
    
    -- Jurnal lines tidak perlu dihapus, is_voided di header sudah cukup untuk exclude dari balance
  END LOOP;

  -- 6. Delete Inventory Batch for Product (Hasil Produksi)
  IF v_record.quantity > 0 AND v_record.product_id IS NOT NULL THEN
    DELETE FROM inventory_batches 
    WHERE product_id = v_record.product_id 
      AND (production_id = v_record.id OR notes = 'Produksi ' || v_record.ref);
  END IF;

  -- 7. Finally Delete Production Record
  DELETE FROM production_records WHERE id = p_production_id;

  RETURN QUERY SELECT TRUE, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- GRANT
GRANT EXECUTE ON FUNCTION void_production_atomic(UUID, UUID) TO authenticated;

-- ============================================================================
-- FILE: 17_retasi.sql
-- ============================================================================
-- ============================================================================
-- RPC 17: Retasi (Driver Return) Atomic Functions
-- Purpose: Process driver returns with proper stock and journal entries
-- - Retasi: Driver returns unsold items, refunds customer payments
-- ============================================================================

-- ============================================================================
-- 1. PROCESS RETASI ATOMIC
-- Proses pengembalian barang dari driver dengan journal
-- ============================================================================

CREATE OR REPLACE FUNCTION process_retasi_atomic(
  p_retasi JSONB,
  p_items JSONB, -- Array of returned items
  p_branch_id UUID,
  p_driver_id UUID,
  p_driver_name TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  retasi_id UUID,
  journal_id UUID,
  items_returned INTEGER,
  total_amount NUMERIC,
  error_message TEXT
) AS $$
DECLARE
  v_retasi_id UUID;
  v_journal_id UUID;
  v_transaction_id TEXT;
  v_delivery_id UUID;
  v_customer_name TEXT;
  v_return_date DATE;
  v_reason TEXT;
  v_total_amount NUMERIC := 0;
  v_items_returned INTEGER := 0;

  v_item JSONB;
  v_product_id UUID;
  v_product_name TEXT;
  v_quantity NUMERIC;
  v_price NUMERIC;
  v_item_total NUMERIC;

  v_kas_account_id UUID;
  v_pendapatan_account_id UUID;
  v_persediaan_account_id UUID;
  v_hpp_account_id UUID;
  v_entry_number TEXT;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0, 0::NUMERIC, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_driver_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0, 0::NUMERIC, 'Driver ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0, 0::NUMERIC, 'Items are required'::TEXT;
    RETURN;
  END IF;

  -- ==================== PARSE DATA ====================

  v_retasi_id := COALESCE((p_retasi->>'id')::UUID, gen_random_uuid());
  v_transaction_id := p_retasi->>'transaction_id';
  v_delivery_id := (p_retasi->>'delivery_id')::UUID;
  v_customer_name := COALESCE(p_retasi->>'customer_name', 'Pelanggan');
  v_return_date := COALESCE((p_retasi->>'return_date')::DATE, CURRENT_DATE);
  v_reason := COALESCE(p_retasi->>'reason', 'Barang tidak terjual');

  -- Get driver name if not provided (localhost uses profiles, not employees)
  IF p_driver_name IS NULL THEN
    SELECT full_name INTO p_driver_name FROM profiles WHERE id = p_driver_id;
  END IF;

  -- ==================== GET ACCOUNT IDS ====================

  SELECT id INTO v_kas_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1110' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_pendapatan_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '4100' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_persediaan_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1310' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_hpp_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '5100' AND is_active = TRUE LIMIT 1;

  -- ==================== PROCESS ITEMS & RESTORE STOCK ====================

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_product_name := v_item->>'product_name';
    v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 0);
    v_price := COALESCE((v_item->>'price')::NUMERIC, 0);

    IF v_product_id IS NOT NULL AND v_quantity > 0 THEN
      v_item_total := v_quantity * v_price;
      v_total_amount := v_total_amount + v_item_total;

      -- Restore stock to inventory batches
      -- Create new batch for returned items
      INSERT INTO inventory_batches (
        product_id,
        branch_id,
        initial_quantity,
        remaining_quantity,
        unit_cost,
        batch_date,
        reference_type,
        reference_id,
        notes,
        created_at
      ) VALUES (
        v_product_id,
        p_branch_id,
        v_quantity,
        v_quantity,
        COALESCE((v_item->>'cost_price')::NUMERIC, 0),
        v_return_date,
        'retasi',
        v_retasi_id::TEXT,
        'Retasi dari ' || p_driver_name || ': ' || v_reason,
        NOW()
      );

      v_items_returned := v_items_returned + 1;
    END IF;
  END LOOP;

  -- ==================== INSERT RETASI RECORD ====================

  INSERT INTO retasi (
    id,
    branch_id,
    transaction_id,
    delivery_id,
    driver_id,
    driver_name,
    customer_name,
    return_date,
    items,
    total_amount,
    reason,
    status,
    created_at,
    updated_at
  ) VALUES (
    v_retasi_id,
    p_branch_id,
    v_transaction_id,
    v_delivery_id,
    p_driver_id,
    p_driver_name,
    v_customer_name,
    v_return_date,
    p_items,
    v_total_amount,
    v_reason,
    'completed',
    NOW(),
    NOW()
  );

  -- ==================== CREATE REVERSAL JOURNAL ====================
  -- Jurnal balik untuk retasi:
  -- Dr. Persediaan (barang kembali)
  -- Dr. Pendapatan (batal pendapatan)
  --   Cr. HPP (batal HPP)
  --   Cr. Kas/Piutang (kembalikan uang/kurangi piutang)

  IF v_total_amount > 0 THEN
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
      v_return_date,
      'Retasi - ' || p_driver_name || ' - ' || v_customer_name || ' - ' || v_reason,
      'retasi',
      v_retasi_id::TEXT,
      'posted',
      FALSE,
      NOW(),
      NOW()
    ) RETURNING id INTO v_journal_id;

    -- Dr. Persediaan (barang kembali ke stok)
    IF v_persediaan_account_id IS NOT NULL THEN
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, account_name,
        debit_amount, credit_amount, description, line_number
      ) VALUES (
        v_journal_id, v_persediaan_account_id,
        (SELECT name FROM accounts WHERE id = v_persediaan_account_id),
        v_total_amount * 0.7, 0, 'Barang retasi kembali ke persediaan', 1
      );
    END IF;

    -- Dr. Pendapatan (batal pendapatan) - reverse credit
    IF v_pendapatan_account_id IS NOT NULL THEN
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, account_name,
        debit_amount, credit_amount, description, line_number
      ) VALUES (
        v_journal_id, v_pendapatan_account_id,
        (SELECT name FROM accounts WHERE id = v_pendapatan_account_id),
        v_total_amount, 0, 'Pembatalan pendapatan retasi', 2
      );
    END IF;

    -- Cr. HPP (batal HPP) - reverse debit
    IF v_hpp_account_id IS NOT NULL THEN
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, account_name,
        debit_amount, credit_amount, description, line_number
      ) VALUES (
        v_journal_id, v_hpp_account_id,
        (SELECT name FROM accounts WHERE id = v_hpp_account_id),
        0, v_total_amount * 0.7, 'Pembatalan HPP retasi', 3
      );
    END IF;

    -- Cr. Kas (kembalikan uang / kurangi piutang)
    IF v_kas_account_id IS NOT NULL THEN
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, account_name,
        debit_amount, credit_amount, description, line_number
      ) VALUES (
        v_journal_id, v_kas_account_id,
        (SELECT name FROM accounts WHERE id = v_kas_account_id),
        0, v_total_amount, 'Pengembalian kas retasi', 4
      );
    END IF;
  END IF;

  -- ==================== UPDATE TRANSACTION IF EXISTS ====================

  IF v_transaction_id IS NOT NULL THEN
    -- Update transaction to reflect return
    UPDATE transactions
    SET
      notes = COALESCE(notes, '') || ' | Retasi: ' || v_reason,
      updated_at = NOW()
    WHERE id = v_transaction_id AND branch_id = p_branch_id;
  END IF;

  -- ==================== SUCCESS ====================

  RETURN QUERY SELECT TRUE, v_retasi_id, v_journal_id, v_items_returned, v_total_amount, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0, 0::NUMERIC, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 2. VOID RETASI ATOMIC
-- Batalkan retasi dengan rollback stok dan jurnal
-- ============================================================================

CREATE OR REPLACE FUNCTION void_retasi_atomic(
  p_retasi_id UUID,
  p_branch_id UUID,
  p_reason TEXT DEFAULT 'Dibatalkan',
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  batches_removed INTEGER,
  journals_voided INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_retasi RECORD;
  v_batches_removed INTEGER := 0;
  v_journals_voided INTEGER := 0;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  -- Get retasi record
  SELECT * INTO v_retasi
  FROM retasi
  WHERE id = p_retasi_id AND branch_id = p_branch_id
  FOR UPDATE;

  IF v_retasi.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0, 'Retasi tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  IF v_retasi.status = 'cancelled' THEN
    RETURN QUERY SELECT FALSE, 0, 0, 'Retasi sudah dibatalkan'::TEXT;
    RETURN;
  END IF;

  -- ==================== REMOVE INVENTORY BATCHES ====================

  DELETE FROM inventory_batches
  WHERE reference_type = 'retasi'
    AND reference_id = p_retasi_id::TEXT
    AND branch_id = p_branch_id;

  GET DIAGNOSTICS v_batches_removed = ROW_COUNT;

  -- ==================== VOID JOURNALS ====================

  UPDATE journal_entries
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_reason = p_reason,
    status = 'voided',
    updated_at = NOW()
  WHERE reference_type = 'retasi'
    AND reference_id = p_retasi_id::TEXT
    AND branch_id = p_branch_id
    AND is_voided = FALSE;

  GET DIAGNOSTICS v_journals_voided = ROW_COUNT;

  -- ==================== UPDATE STATUS ====================

  UPDATE retasi
  SET
    status = 'cancelled',
    updated_at = NOW()
  WHERE id = p_retasi_id;

  -- ==================== SUCCESS ====================

  RETURN QUERY SELECT TRUE, v_batches_removed, v_journals_voided, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0, 0, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION process_retasi_atomic(JSONB, JSONB, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION void_retasi_atomic(UUID, UUID, TEXT, UUID) TO authenticated;


-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION process_retasi_atomic IS
  'Process driver return (retasi) with stock restore and reversal journal.';
COMMENT ON FUNCTION void_retasi_atomic IS
  'Void retasi, remove restored batches and void journals.';

-- ============================================================================
-- FILE: 18_payroll_management.sql
-- ============================================================================
-- ============================================================================
-- RPC 18: Payroll Management Atomic
-- Purpose: Update payroll record dan penyesuaian jurnal secara atomik
-- ============================================================================

CREATE OR REPLACE FUNCTION update_payroll_record_atomic(
  p_payroll_id UUID,
  p_branch_id UUID,
  p_base_salary NUMERIC,
  p_commission NUMERIC,
  p_bonus NUMERIC,
  p_advance_deduction NUMERIC,
  p_salary_deduction NUMERIC,
  p_notes TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  net_salary NUMERIC,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_old_record RECORD;
  v_new_net_salary NUMERIC;
  v_new_gross_salary NUMERIC;
  v_new_total_deductions NUMERIC;
  v_journal_id UUID;
  v_beban_gaji_account UUID;
  v_panjar_account UUID;
  v_payment_account_id UUID;
  v_journal_lines JSONB := '[]'::JSONB;
BEGIN
  -- 1. Get Old Record
  SELECT * INTO v_old_record FROM payroll_records 
  WHERE id = p_payroll_id AND branch_id = p_branch_id;
  
  IF v_old_record.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, NULL::UUID, 'Data gaji tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- 2. Calculate New Amounts
  v_new_gross_salary := COALESCE(p_base_salary, v_old_record.base_salary) + 
                        COALESCE(p_commission, v_old_record.total_commission) + 
                        COALESCE(p_bonus, v_old_record.total_bonus);
  
  v_new_total_deductions := COALESCE(p_advance_deduction, v_old_record.advance_deduction) + 
                           COALESCE(p_salary_deduction, v_old_record.salary_deduction);
  
  v_new_net_salary := v_new_gross_salary - v_new_total_deductions;

  -- 3. Update Record
  UPDATE payroll_records
  SET
    base_salary = COALESCE(p_base_salary, base_salary),
    total_commission = COALESCE(p_commission, total_commission),
    total_bonus = COALESCE(p_bonus, total_bonus),
    advance_deduction = COALESCE(p_advance_deduction, advance_deduction),
    salary_deduction = COALESCE(p_salary_deduction, salary_deduction),
    total_deductions = v_new_total_deductions,
    net_salary = v_new_net_salary,
    notes = COALESCE(p_notes, notes),
    updated_at = NOW()
  WHERE id = p_payroll_id;

  -- 4. Handle Journal Update if Status is 'paid'
  IF v_old_record.status = 'paid' THEN
    -- Find existing journal
    SELECT id INTO v_journal_id FROM journal_entries 
    WHERE reference_id = p_payroll_id::TEXT AND reference_type = 'payroll' AND branch_id = p_branch_id
    ORDER BY created_at DESC LIMIT 1;

    IF v_journal_id IS NOT NULL THEN
      -- Get Accounts
      SELECT id INTO v_beban_gaji_account FROM accounts WHERE branch_id = p_branch_id AND code = '6110' LIMIT 1;
      SELECT id INTO v_panjar_account FROM accounts WHERE branch_id = p_branch_id AND code = '1260' LIMIT 1;
      v_payment_account_id := v_old_record.payment_account_id;

      -- Debit: Beban Gaji (gross)
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_id', v_beban_gaji_account,
        'debit_amount', v_new_gross_salary,
        'credit_amount', 0,
        'description', 'Beban gaji (updated)'
      );

      -- Credit: Kas (net)
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_id', v_payment_account_id,
        'debit_amount', 0,
        'credit_amount', v_new_net_salary,
        'description', 'Pembayaran gaji (updated)'
      );

      -- Credit: Panjar (deductions)
      IF COALESCE(p_advance_deduction, v_old_record.advance_deduction) > 0 AND v_panjar_account IS NOT NULL THEN
        v_journal_lines := v_journal_lines || jsonb_build_object(
          'account_id', v_panjar_account,
          'debit_amount', 0,
          'credit_amount', COALESCE(p_advance_deduction, v_old_record.advance_deduction),
          'description', 'Potongan panjar (updated)'
        );
      END IF;

      -- Delete old lines and insert new ones
      DELETE FROM journal_entry_lines WHERE journal_entry_id = v_journal_id;
      
      INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
      SELECT v_journal_id, row_number() OVER (), (line->>'account_id')::UUID, line->>'description', (line->>'debit_amount')::NUMERIC, (line->>'credit_amount')::NUMERIC
      FROM jsonb_array_elements(v_journal_lines) AS line;

      -- Update header totals
      UPDATE journal_entries 
      SET total_debit = v_new_gross_salary, 
          total_credit = v_new_gross_salary,
          updated_at = NOW()
      WHERE id = v_journal_id;
    END IF;
  END IF;

  RETURN QUERY SELECT TRUE, v_new_net_salary, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0::NUMERIC, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- GRANT
GRANT EXECUTE ON FUNCTION update_payroll_record_atomic(UUID, UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT) TO authenticated;

-- ============================================================================
-- FILE: 18_stock_adjustment.sql
-- ============================================================================
-- ============================================================================
-- RPC 18: Stock Adjustment Atomic Functions
-- Purpose: Handle stock adjustments (products & materials) with journal entries
-- - Adjustment IN: Dr. Persediaan, Cr. Selisih Stok
-- - Adjustment OUT: Dr. Selisih Stok, Cr. Persediaan
-- ============================================================================

-- ============================================================================
-- 1. PRODUCT STOCK ADJUSTMENT ATOMIC
-- Penyesuaian stok produk dengan jurnal otomatis
-- ============================================================================

CREATE OR REPLACE FUNCTION create_product_stock_adjustment_atomic(
  p_product_id UUID,
  p_branch_id UUID,
  p_quantity_change NUMERIC, -- positive = add, negative = reduce
  p_reason TEXT DEFAULT 'Stock Adjustment',
  p_unit_cost NUMERIC DEFAULT 0
)
RETURNS TABLE (
  success BOOLEAN,
  adjustment_id UUID,
  journal_id UUID,
  new_stock NUMERIC,
  error_message TEXT
) AS $$
DECLARE
  v_adjustment_id UUID;
  v_journal_id UUID;
  v_product_name TEXT;
  v_current_stock NUMERIC;
  v_new_stock NUMERIC;
  v_adjustment_value NUMERIC;
  v_persediaan_account_id UUID;
  v_selisih_account_id UUID;
  v_entry_number TEXT;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_product_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, 'Product ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_quantity_change = 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, 'Quantity change cannot be zero'::TEXT;
    RETURN;
  END IF;

  -- Get product info
  SELECT name, COALESCE(current_stock, 0) INTO v_product_name, v_current_stock
  FROM products WHERE id = p_product_id;

  IF v_product_name IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, 'Produk tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- Calculate new stock (cannot go negative)
  v_new_stock := v_current_stock + p_quantity_change;
  IF v_new_stock < 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC,
      format('Stok tidak cukup. Stok saat ini: %s, pengurangan: %s', v_current_stock, ABS(p_quantity_change))::TEXT;
    RETURN;
  END IF;

  -- Calculate adjustment value
  v_adjustment_value := ABS(p_quantity_change) * COALESCE(p_unit_cost, 0);

  -- ==================== GET ACCOUNT IDS ====================

  SELECT id INTO v_persediaan_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1310' AND is_active = TRUE LIMIT 1;

  -- Selisih Stok account (usually 8100 or specific)
  SELECT id INTO v_selisih_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '8100' AND is_active = TRUE LIMIT 1;

  -- ==================== UPDATE PRODUCT STOCK ====================

  UPDATE products
  SET current_stock = v_new_stock, updated_at = NOW()
  WHERE id = p_product_id;

  v_adjustment_id := gen_random_uuid();

  -- ==================== CREATE INVENTORY BATCH (if adding stock) ====================

  IF p_quantity_change > 0 THEN
    INSERT INTO inventory_batches (
      product_id,
      branch_id,
      initial_quantity,
      remaining_quantity,
      unit_cost,
      batch_date,
      reference_type,
      reference_id,
      notes,
      created_at
    ) VALUES (
      p_product_id,
      p_branch_id,
      p_quantity_change,
      p_quantity_change,
      COALESCE(p_unit_cost, 0),
      CURRENT_DATE,
      'adjustment',
      v_adjustment_id::TEXT,
      p_reason,
      NOW()
    );
  ELSE
    -- For reduction, consume from FIFO batches
    PERFORM consume_inventory_fifo(
      p_product_id,
      p_branch_id,
      ABS(p_quantity_change),
      'ADJ-' || v_adjustment_id::TEXT
    );
  END IF;

  -- ==================== CREATE STOCK MOVEMENT RECORD ====================

  INSERT INTO product_stock_movements (
    id,
    product_id,
    branch_id,
    movement_type,
    quantity,
    reference_type,
    reference_id,
    notes,
    user_id,
    created_at
  ) VALUES (
    v_adjustment_id,
    p_product_id,
    p_branch_id,
    CASE WHEN p_quantity_change > 0 THEN 'adjustment_in' ELSE 'adjustment_out' END,
    ABS(p_quantity_change),
    'adjustment',
    v_adjustment_id::TEXT,
    p_reason,
    auth.uid(),
    NOW()
  );

  -- ==================== CREATE JOURNAL ENTRY (if value > 0) ====================

  IF v_adjustment_value > 0 AND v_persediaan_account_id IS NOT NULL AND v_selisih_account_id IS NOT NULL THEN
    SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
      (COALESCE(
        (SELECT COUNT(*) + 1 FROM journal_entries
         WHERE branch_id = p_branch_id
         AND DATE(created_at) = CURRENT_DATE),
        1
      ))::TEXT, 4, '0')
    INTO v_entry_number;

    INSERT INTO journal_entries (
      id, branch_id, entry_number, entry_date, description,
      reference_type, reference_id, status, is_voided, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), p_branch_id, v_entry_number, CURRENT_DATE,
      'Penyesuaian Stok - ' || v_product_name || ' - ' || p_reason,
      'adjustment', v_adjustment_id::TEXT, 'posted', FALSE, NOW(), NOW()
    ) RETURNING id INTO v_journal_id;

    IF p_quantity_change > 0 THEN
      -- Stock IN: Dr. Persediaan, Cr. Selisih
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_name, debit_amount, credit_amount, description, line_number)
      VALUES (v_journal_id, v_persediaan_account_id, (SELECT name FROM accounts WHERE id = v_persediaan_account_id), v_adjustment_value, 0, 'Penambahan persediaan', 1);

      INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_name, debit_amount, credit_amount, description, line_number)
      VALUES (v_journal_id, v_selisih_account_id, (SELECT name FROM accounts WHERE id = v_selisih_account_id), 0, v_adjustment_value, 'Selisih stok', 2);
    ELSE
      -- Stock OUT: Dr. Selisih, Cr. Persediaan
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_name, debit_amount, credit_amount, description, line_number)
      VALUES (v_journal_id, v_selisih_account_id, (SELECT name FROM accounts WHERE id = v_selisih_account_id), v_adjustment_value, 0, 'Selisih stok', 1);

      INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_name, debit_amount, credit_amount, description, line_number)
      VALUES (v_journal_id, v_persediaan_account_id, (SELECT name FROM accounts WHERE id = v_persediaan_account_id), 0, v_adjustment_value, 'Pengurangan persediaan', 2);
    END IF;
  END IF;

  RETURN QUERY SELECT TRUE, v_adjustment_id, v_journal_id, v_new_stock, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 2. MATERIAL STOCK ADJUSTMENT ATOMIC
-- Penyesuaian stok bahan dengan jurnal otomatis
-- ============================================================================

CREATE OR REPLACE FUNCTION create_material_stock_adjustment_atomic(
  p_material_id UUID,
  p_branch_id UUID,
  p_quantity_change NUMERIC,
  p_reason TEXT DEFAULT 'Stock Adjustment',
  p_unit_cost NUMERIC DEFAULT 0
)
RETURNS TABLE (
  success BOOLEAN,
  adjustment_id UUID,
  journal_id UUID,
  new_stock NUMERIC,
  error_message TEXT
) AS $$
DECLARE
  v_adjustment_id UUID;
  v_journal_id UUID;
  v_material_name TEXT;
  v_current_stock NUMERIC;
  v_new_stock NUMERIC;
  v_adjustment_value NUMERIC;
  v_bahan_baku_account_id UUID;
  v_selisih_account_id UUID;
  v_entry_number TEXT;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_material_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, 'Material ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_quantity_change = 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, 'Quantity change cannot be zero'::TEXT;
    RETURN;
  END IF;

  -- Get material info
  SELECT name, COALESCE(stock, 0) INTO v_material_name, v_current_stock
  FROM materials WHERE id = p_material_id;

  IF v_material_name IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, 'Material tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  v_new_stock := v_current_stock + p_quantity_change;
  IF v_new_stock < 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC,
      format('Stok tidak cukup. Stok saat ini: %s', v_current_stock)::TEXT;
    RETURN;
  END IF;

  v_adjustment_value := ABS(p_quantity_change) * COALESCE(p_unit_cost, 0);

  -- ==================== GET ACCOUNT IDS ====================

  SELECT id INTO v_bahan_baku_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1320' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_selisih_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '8100' AND is_active = TRUE LIMIT 1;

  -- ==================== UPDATE MATERIAL STOCK ====================

  UPDATE materials
  SET stock = v_new_stock, updated_at = NOW()
  WHERE id = p_material_id;

  v_adjustment_id := gen_random_uuid();

  -- ==================== CREATE/CONSUME MATERIAL BATCH ====================

  IF p_quantity_change > 0 THEN
    INSERT INTO material_batches (
      material_id, branch_id, initial_quantity, remaining_quantity,
      unit_cost, batch_date, reference_type, reference_id, notes, created_at
    ) VALUES (
      p_material_id, p_branch_id, p_quantity_change, p_quantity_change,
      COALESCE(p_unit_cost, 0), CURRENT_DATE, 'adjustment', v_adjustment_id::TEXT, p_reason, NOW()
    );
  ELSE
    PERFORM consume_material_fifo(
      p_material_id, p_branch_id, ABS(p_quantity_change),
      'adjustment', 'ADJ-' || v_adjustment_id::TEXT
    );
  END IF;

  -- ==================== CREATE STOCK MOVEMENT RECORD ====================

  INSERT INTO material_stock_movements (
    id, material_id, branch_id, movement_type, quantity,
    reference_type, reference_id, notes, user_id, created_at
  ) VALUES (
    v_adjustment_id, p_material_id, p_branch_id,
    CASE WHEN p_quantity_change > 0 THEN 'adjustment_in' ELSE 'adjustment_out' END,
    ABS(p_quantity_change), 'adjustment', v_adjustment_id::TEXT, p_reason, auth.uid(), NOW()
  );

  -- ==================== CREATE JOURNAL ENTRY ====================

  IF v_adjustment_value > 0 AND v_bahan_baku_account_id IS NOT NULL AND v_selisih_account_id IS NOT NULL THEN
    SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
      (COALESCE((SELECT COUNT(*) + 1 FROM journal_entries WHERE branch_id = p_branch_id AND DATE(created_at) = CURRENT_DATE), 1))::TEXT, 4, '0')
    INTO v_entry_number;

    INSERT INTO journal_entries (id, branch_id, entry_number, entry_date, description, reference_type, reference_id, status, is_voided, created_at, updated_at)
    VALUES (gen_random_uuid(), p_branch_id, v_entry_number, CURRENT_DATE, 'Penyesuaian Stok Bahan - ' || v_material_name || ' - ' || p_reason, 'adjustment', v_adjustment_id::TEXT, 'posted', FALSE, NOW(), NOW())
    RETURNING id INTO v_journal_id;

    IF p_quantity_change > 0 THEN
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_name, debit_amount, credit_amount, description, line_number)
      VALUES (v_journal_id, v_bahan_baku_account_id, (SELECT name FROM accounts WHERE id = v_bahan_baku_account_id), v_adjustment_value, 0, 'Penambahan bahan baku', 1);
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_name, debit_amount, credit_amount, description, line_number)
      VALUES (v_journal_id, v_selisih_account_id, (SELECT name FROM accounts WHERE id = v_selisih_account_id), 0, v_adjustment_value, 'Selisih stok', 2);
    ELSE
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_name, debit_amount, credit_amount, description, line_number)
      VALUES (v_journal_id, v_selisih_account_id, (SELECT name FROM accounts WHERE id = v_selisih_account_id), v_adjustment_value, 0, 'Selisih stok', 1);
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_name, debit_amount, credit_amount, description, line_number)
      VALUES (v_journal_id, v_bahan_baku_account_id, (SELECT name FROM accounts WHERE id = v_bahan_baku_account_id), 0, v_adjustment_value, 'Pengurangan bahan baku', 2);
    END IF;
  END IF;

  RETURN QUERY SELECT TRUE, v_adjustment_id, v_journal_id, v_new_stock, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 3. TAX PAYMENT ATOMIC
-- Pembayaran/setor pajak dengan jurnal otomatis
-- ============================================================================

CREATE OR REPLACE FUNCTION create_tax_payment_atomic(
  p_branch_id UUID,
  p_period TEXT, -- YYYY-MM
  p_ppn_masukan_used NUMERIC DEFAULT 0,
  p_ppn_keluaran_paid NUMERIC DEFAULT 0,
  p_payment_account_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  payment_id UUID,
  journal_id UUID,
  net_payment NUMERIC,
  error_message TEXT
) AS $$
DECLARE
  v_payment_id UUID;
  v_journal_id UUID;
  v_net_payment NUMERIC;
  v_kas_account_id UUID;
  v_ppn_masukan_id UUID;
  v_ppn_keluaran_id UUID;
  v_entry_number TEXT;
  v_line_number INTEGER := 1;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  v_net_payment := p_ppn_keluaran_paid - p_ppn_masukan_used;

  IF v_net_payment <= 0 AND p_ppn_keluaran_paid = 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, 'Tidak ada pajak untuk disetor'::TEXT;
    RETURN;
  END IF;

  -- ==================== GET ACCOUNT IDS ====================

  IF p_payment_account_id IS NOT NULL THEN
    v_kas_account_id := p_payment_account_id;
  ELSE
    SELECT id INTO v_kas_account_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '1110' AND is_active = TRUE LIMIT 1;
  END IF;

  SELECT id INTO v_ppn_masukan_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1230' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_ppn_keluaran_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '2130' AND is_active = TRUE LIMIT 1;

  v_payment_id := gen_random_uuid();

  -- ==================== INSERT TAX PAYMENT RECORD ====================

  INSERT INTO tax_payments (
    id, branch_id, period, ppn_masukan_used, ppn_keluaran_paid,
    net_payment, payment_account_id, notes, created_by, created_at
  ) VALUES (
    v_payment_id, p_branch_id, p_period, p_ppn_masukan_used, p_ppn_keluaran_paid,
    v_net_payment, p_payment_account_id, p_notes, auth.uid(), NOW()
  );

  -- ==================== CREATE JOURNAL ENTRY ====================

  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE((SELECT COUNT(*) + 1 FROM journal_entries WHERE branch_id = p_branch_id AND DATE(created_at) = CURRENT_DATE), 1))::TEXT, 4, '0')
  INTO v_entry_number;

  INSERT INTO journal_entries (id, branch_id, entry_number, entry_date, description, reference_type, reference_id, status, is_voided, created_at, updated_at)
  VALUES (gen_random_uuid(), p_branch_id, v_entry_number, CURRENT_DATE, 'Setor Pajak Periode ' || p_period, 'tax_payment', v_payment_id::TEXT, 'posted', FALSE, NOW(), NOW())
  RETURNING id INTO v_journal_id;

  -- Dr. PPN Keluaran (mengurangi kewajiban)
  IF p_ppn_keluaran_paid > 0 AND v_ppn_keluaran_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_name, debit_amount, credit_amount, description, line_number)
    VALUES (v_journal_id, v_ppn_keluaran_id, (SELECT name FROM accounts WHERE id = v_ppn_keluaran_id), p_ppn_keluaran_paid, 0, 'Setor PPN Keluaran', v_line_number);
    v_line_number := v_line_number + 1;
  END IF;

  -- Cr. PPN Masukan (menggunakan kredit pajak)
  IF p_ppn_masukan_used > 0 AND v_ppn_masukan_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_name, debit_amount, credit_amount, description, line_number)
    VALUES (v_journal_id, v_ppn_masukan_id, (SELECT name FROM accounts WHERE id = v_ppn_masukan_id), 0, p_ppn_masukan_used, 'Kompensasi PPN Masukan', v_line_number);
    v_line_number := v_line_number + 1;
  END IF;

  -- Cr. Kas (pembayaran netto)
  IF v_net_payment > 0 AND v_kas_account_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_name, debit_amount, credit_amount, description, line_number)
    VALUES (v_journal_id, v_kas_account_id, (SELECT name FROM accounts WHERE id = v_kas_account_id), 0, v_net_payment, 'Pembayaran pajak', v_line_number);
  END IF;

  RETURN QUERY SELECT TRUE, v_payment_id, v_journal_id, v_net_payment, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION create_product_stock_adjustment_atomic(UUID, UUID, NUMERIC, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION create_material_stock_adjustment_atomic(UUID, UUID, NUMERIC, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION create_tax_payment_atomic(UUID, TEXT, NUMERIC, NUMERIC, UUID, TEXT) TO authenticated;


-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION create_product_stock_adjustment_atomic IS 'Adjust product stock with FIFO batch and journal entry.';
COMMENT ON FUNCTION create_material_stock_adjustment_atomic IS 'Adjust material stock with FIFO batch and journal entry.';
COMMENT ON FUNCTION create_tax_payment_atomic IS 'Process tax payment with proper PPN journal entries.';

-- ============================================================================
-- FILE: 19_delivery_management.sql
-- ============================================================================
-- ============================================================================
-- RPC 19: Delivery Management Atomic
-- Purpose: Update delivery secara atomik (Correct FIFO + Jurnal + Komisi)
-- ============================================================================

CREATE OR REPLACE FUNCTION update_delivery_atomic(
  p_delivery_id UUID,
  p_branch_id UUID,
  p_items JSONB,              -- [{product_id, quantity, is_bonus, notes, width, height, unit, product_name}]
  p_driver_id UUID DEFAULT NULL,
  p_helper_id UUID DEFAULT NULL,
  p_delivery_date DATE DEFAULT CURRENT_DATE,
  p_notes TEXT DEFAULT NULL,
  p_photo_url TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  delivery_id UUID,
  total_hpp NUMERIC,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_delivery RECORD;
  v_transaction RECORD;
  v_item RECORD;
  v_new_item JSONB;
  v_restore_result RECORD;
  v_consume_result RECORD;
  v_total_hpp NUMERIC := 0;
  v_hpp_details TEXT := '';
  v_journal_id UUID;
  v_entry_number TEXT;
  v_hpp_account_id UUID;
  v_persediaan_id UUID;
  v_total_ordered NUMERIC;
  v_total_delivered NUMERIC;
  v_new_status TEXT;
  v_product_id UUID;
  v_qty NUMERIC;
  v_product_name TEXT;
  v_is_bonus BOOLEAN;
BEGIN
  -- 1. Validasi & Get current delivery
  SELECT * INTO v_delivery FROM deliveries WHERE id = p_delivery_id AND branch_id = p_branch_id;
  IF v_delivery.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID, 'Data pengiriman tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- 2. Restore Original Stock (FIFO)
  -- Kita kembalikan stok dari pengiriman lama sebelum memproses yang baru
  FOR v_item IN
    SELECT product_id, quantity_delivered as quantity, product_name
    FROM delivery_items
    WHERE delivery_id = p_delivery_id AND quantity_delivered > 0
  LOOP
    PERFORM restore_inventory_fifo(
      v_item.product_id,
      p_branch_id,
      v_item.quantity,
      0, -- Unit cost (will use estimates or specific batch if found)
      format('update_delivery_rollback_%s', p_delivery_id)
    );
  END LOOP;

  -- 3. Void Old Journal & Commissions
  UPDATE journal_entries SET is_voided = TRUE, voided_reason = 'Delivery updated' 
  WHERE reference_id = p_delivery_id::TEXT AND reference_type = 'payroll' AND branch_id = p_branch_id AND is_voided = FALSE;
  
  -- HPP Journal also needs to be voided
  UPDATE journal_entries SET is_voided = TRUE, voided_reason = 'Delivery updated' 
  WHERE reference_id = p_delivery_id::TEXT AND reference_type = 'adjustment' AND branch_id = p_branch_id AND is_voided = FALSE;

  DELETE FROM commission_entries WHERE delivery_id = p_delivery_id;

  -- 4. Update Delivery Header
  UPDATE deliveries
  SET
    driver_id = p_driver_id,
    helper_id = p_helper_id,
    delivery_date = p_delivery_date,
    notes = p_notes,
    photo_url = COALESCE(p_photo_url, photo_url),
    updated_at = NOW()
  WHERE id = p_delivery_id;

  -- 5. Refresh items: Delete old items and Process new items
  DELETE FROM delivery_items WHERE delivery_id = p_delivery_id;

  FOR v_new_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_new_item->>'product_id')::UUID;
    v_qty := (v_new_item->>'quantity')::NUMERIC;
    v_product_name := v_new_item->>'product_name';
    v_is_bonus := COALESCE((v_new_item->>'is_bonus')::BOOLEAN, FALSE);

    IF v_qty > 0 THEN
      -- Insert new delivery item
      INSERT INTO delivery_items (
        delivery_id, product_id, product_name, quantity_delivered, unit, 
        is_bonus, width, height, notes, created_at
      ) VALUES (
        p_delivery_id, v_product_id, v_product_name, v_qty, v_new_item->>'unit',
        v_is_bonus, (v_new_item->>'width')::NUMERIC, (v_new_item->>'height')::NUMERIC, v_new_item->>'notes', NOW()
      );

      -- Consume Stock (if not bonus)
      IF NOT v_is_bonus THEN
        SELECT * INTO v_consume_result FROM consume_inventory_fifo_v3(
          v_product_id, p_branch_id, v_qty, format('delivery_update_%s', p_delivery_id)
        );

        IF NOT v_consume_result.success THEN
          RAISE EXCEPTION '%', v_consume_result.error_message;
        END IF;

        v_total_hpp := v_total_hpp + v_consume_result.total_hpp;
        v_hpp_details := v_hpp_details || v_product_name || ' x' || v_qty || ', ';
      END IF;
    END IF;
  END LOOP;

  -- 6. Update HPP Total on Delivery
  UPDATE deliveries SET hpp_total = v_total_hpp WHERE id = p_delivery_id;

  -- 7. Update Transaction Status
  -- Get total ordered from transaction
  SELECT * INTO v_transaction FROM transactions WHERE id::TEXT = v_delivery.transaction_id;
  
  SELECT COALESCE(SUM((item->>'quantity')::NUMERIC), 0) INTO v_total_ordered
  FROM jsonb_array_elements(v_transaction.items) item
  WHERE NOT COALESCE((item->>'_isSalesMeta')::BOOLEAN, FALSE);

  SELECT COALESCE(SUM(di.quantity_delivered), 0) INTO v_total_delivered
  FROM delivery_items di
  JOIN deliveries d ON d.id = di.delivery_id
  WHERE d.transaction_id = v_delivery.transaction_id;

  IF v_total_delivered >= v_total_ordered AND v_total_delivered > 0 THEN
    v_new_status := 'Selesai';
  ELSIF v_total_delivered > 0 THEN
    v_new_status := 'Diantar Sebagian';
  ELSE
    v_new_status := 'Pesanan Masuk';
  END IF;

  UPDATE transactions SET status = v_new_status, updated_at = NOW() WHERE id = v_transaction.id;

  -- 8. Create NEW HPP Journal
  IF NOT v_transaction.is_office_sale AND v_total_hpp > 0 THEN
    SELECT id INTO v_hpp_account_id FROM accounts WHERE code = '5100' AND branch_id = p_branch_id AND is_active = TRUE LIMIT 1;
    SELECT id INTO v_persediaan_id FROM accounts WHERE code = '1310' AND branch_id = p_branch_id AND is_active = TRUE LIMIT 1;

    IF v_hpp_account_id IS NOT NULL AND v_persediaan_id IS NOT NULL THEN
      v_entry_number := 'JE-' || TO_CHAR(p_delivery_date, 'YYYYMMDD') || '-' ||
        LPAD((SELECT COUNT(*) + 1 FROM journal_entries WHERE branch_id = p_branch_id AND DATE(created_at) = DATE(p_delivery_date))::TEXT, 4, '0');

      INSERT INTO journal_entries (
        entry_number, entry_date, description, reference_type, reference_id, branch_id, status, total_debit, total_credit
      ) VALUES (
        v_entry_number, NOW(), format('HPP Pengiriman %s (update)', v_transaction.ref), 'adjustment', p_delivery_id::TEXT, p_branch_id, 'posted', v_total_hpp, v_total_hpp
      ) RETURNING id INTO v_journal_id;

      INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
      VALUES 
        (v_journal_id, 1, v_hpp_account_id, format('COGS: %s', v_transaction.ref), v_total_hpp, 0),
        (v_journal_id, 2, v_persediaan_id, format('Stock keluar: %s', v_transaction.ref), 0, v_total_hpp);
    END IF;
  END IF;

  -- 9. Re-generate Commissions
  IF p_driver_id IS NOT NULL OR p_helper_id IS NOT NULL THEN
    FOR v_new_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      v_product_id := (v_new_item->>'product_id')::UUID;
      v_qty := (v_new_item->>'quantity')::NUMERIC;
      v_is_bonus := COALESCE((v_new_item->>'is_bonus')::BOOLEAN, FALSE);

      IF v_qty > 0 AND NOT v_is_bonus THEN
        -- Driver
        IF p_driver_id IS NOT NULL THEN
          INSERT INTO commission_entries (user_id, user_name, role, product_id, quantity, rate_per_qty, amount, delivery_id, status, branch_id, created_at)
          SELECT p_driver_id, (SELECT name FROM profiles WHERE id = p_driver_id), 'driver', v_product_id, v_qty, cr.rate_per_qty, v_qty * cr.rate_per_qty, p_delivery_id, 'pending', p_branch_id, NOW()
          FROM commission_rules cr WHERE cr.product_id = v_product_id AND cr.role = 'driver' AND cr.rate_per_qty > 0;
        END IF;

        -- Helper
        IF p_helper_id IS NOT NULL THEN
          INSERT INTO commission_entries (user_id, user_name, role, product_id, quantity, rate_per_qty, amount, delivery_id, status, branch_id, created_at)
          SELECT p_helper_id, (SELECT name FROM profiles WHERE id = p_helper_id), 'helper', v_product_id, v_qty, cr.rate_per_qty, v_qty * cr.rate_per_qty, p_delivery_id, 'pending', p_branch_id, NOW()
          FROM commission_rules cr WHERE cr.product_id = v_product_id AND cr.role = 'helper' AND cr.rate_per_qty > 0;
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN QUERY SELECT TRUE, p_delivery_id, v_total_hpp, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- GRANT
GRANT EXECUTE ON FUNCTION update_delivery_atomic(UUID, UUID, JSONB, UUID, UUID, DATE, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- FILE: 19_legacy_journal_rpc.sql
-- ============================================================================
-- ============================================================================
-- RPC 19: Legacy Journal Functions (Migration from journalService.ts)
-- Purpose: RPC replacements for legacy frontend journal functions
-- All functions create proper double-entry journal entries
-- ============================================================================

-- ============================================================================
-- 1. CREATE MIGRATION RECEIVABLE JOURNAL RPC
-- Jurnal migrasi piutang: Dr. Piutang Usaha, Cr. Saldo Awal
-- ============================================================================

CREATE OR REPLACE FUNCTION create_migration_receivable_journal_rpc(
  p_branch_id UUID,
  p_receivable_id TEXT,
  p_receivable_date DATE,
  p_amount NUMERIC,
  p_customer_name TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_piutang_account_id UUID;
  v_saldo_awal_account_id UUID;
BEGIN
  -- VALIDASI
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Amount must be greater than 0'::TEXT;
    RETURN;
  END IF;

  -- GET ACCOUNT IDS
  SELECT id INTO v_piutang_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1210' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_saldo_awal_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '3100' AND is_active = TRUE LIMIT 1;

  IF v_piutang_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Piutang Usaha (1210) tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  IF v_saldo_awal_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Saldo Awal (3100) tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- GENERATE ENTRY NUMBER
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

  -- CREATE JOURNAL ENTRY
  INSERT INTO journal_entries (
    id, branch_id, entry_number, entry_date, description,
    reference_type, reference_id, status, is_voided, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_branch_id, v_entry_number, p_receivable_date,
    COALESCE(p_description, 'Piutang Migrasi - ' || p_customer_name),
    'receivable', p_receivable_id, 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Piutang Usaha
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_piutang_account_id, '1210',
    (SELECT name FROM accounts WHERE id = v_piutang_account_id),
    p_amount, 0, 'Piutang migrasi - ' || p_customer_name, 1
  );

  -- Cr. Saldo Awal
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_saldo_awal_account_id, '3100',
    (SELECT name FROM accounts WHERE id = v_saldo_awal_account_id),
    0, p_amount, 'Saldo awal piutang migrasi', 2
  );

  RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 2. CREATE DEBT JOURNAL RPC (PINJAMAN BARU - KAS BERTAMBAH)
-- Jurnal hutang baru: Dr. Kas, Cr. Hutang
-- ============================================================================

CREATE OR REPLACE FUNCTION create_debt_journal_rpc(
  p_branch_id UUID,
  p_debt_id TEXT,
  p_debt_date DATE,
  p_amount NUMERIC,
  p_creditor_name TEXT,
  p_creditor_type TEXT DEFAULT 'other',
  p_description TEXT DEFAULT NULL,
  p_cash_account_id UUID DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_kas_account_id UUID;
  v_hutang_account_id UUID;
  v_hutang_code TEXT;
BEGIN
  -- VALIDASI
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Amount must be greater than 0'::TEXT;
    RETURN;
  END IF;

  -- GET KAS ACCOUNT (use provided or default 1120 Bank)
  IF p_cash_account_id IS NOT NULL THEN
    v_kas_account_id := p_cash_account_id;
  ELSE
    SELECT id INTO v_kas_account_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '1120' AND is_active = TRUE LIMIT 1;
  END IF;

  -- GET HUTANG ACCOUNT BASED ON CREDITOR TYPE
  CASE p_creditor_type
    WHEN 'bank' THEN v_hutang_code := '2120'; -- Hutang Bank
    WHEN 'supplier' THEN v_hutang_code := '2110'; -- Hutang Usaha
    ELSE v_hutang_code := '2190'; -- Hutang Lain-lain
  END CASE;

  SELECT id INTO v_hutang_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = v_hutang_code AND is_active = TRUE LIMIT 1;

  IF v_hutang_account_id IS NULL THEN
    -- Fallback to 2110
    SELECT id INTO v_hutang_account_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '2110' AND is_active = TRUE LIMIT 1;
    v_hutang_code := '2110';
  END IF;

  IF v_kas_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Kas/Bank tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  IF v_hutang_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Hutang tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- GENERATE ENTRY NUMBER
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

  -- CREATE JOURNAL ENTRY
  INSERT INTO journal_entries (
    id, branch_id, entry_number, entry_date, description,
    reference_type, reference_id, status, is_voided, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_branch_id, v_entry_number, p_debt_date,
    COALESCE(p_description, 'Pinjaman dari ' || p_creditor_name),
    'payable', p_debt_id, 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Kas (kas bertambah karena pinjaman)
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_kas_account_id,
    (SELECT code FROM accounts WHERE id = v_kas_account_id),
    (SELECT name FROM accounts WHERE id = v_kas_account_id),
    p_amount, 0, 'Penerimaan pinjaman dari ' || p_creditor_name, 1
  );

  -- Cr. Hutang
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_hutang_account_id, v_hutang_code,
    (SELECT name FROM accounts WHERE id = v_hutang_account_id),
    0, p_amount, 'Hutang kepada ' || p_creditor_name, 2
  );

  RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 3. CREATE MIGRATION DEBT JOURNAL RPC (MIGRASI HUTANG - TANPA KAS)
-- Jurnal migrasi hutang: Dr. Saldo Awal, Cr. Hutang
-- ============================================================================

CREATE OR REPLACE FUNCTION create_migration_debt_journal_rpc(
  p_branch_id UUID,
  p_debt_id TEXT,
  p_debt_date DATE,
  p_amount NUMERIC,
  p_creditor_name TEXT,
  p_creditor_type TEXT DEFAULT 'other',
  p_description TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_saldo_awal_account_id UUID;
  v_hutang_account_id UUID;
  v_hutang_code TEXT;
BEGIN
  -- VALIDASI
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Amount must be greater than 0'::TEXT;
    RETURN;
  END IF;

  -- GET SALDO AWAL ACCOUNT
  SELECT id INTO v_saldo_awal_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '3100' AND is_active = TRUE LIMIT 1;

  -- GET HUTANG ACCOUNT BASED ON CREDITOR TYPE
  CASE p_creditor_type
    WHEN 'bank' THEN v_hutang_code := '2120';
    WHEN 'supplier' THEN v_hutang_code := '2110';
    ELSE v_hutang_code := '2190';
  END CASE;

  SELECT id INTO v_hutang_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = v_hutang_code AND is_active = TRUE LIMIT 1;

  IF v_hutang_account_id IS NULL THEN
    SELECT id INTO v_hutang_account_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '2110' AND is_active = TRUE LIMIT 1;
    v_hutang_code := '2110';
  END IF;

  IF v_saldo_awal_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Saldo Awal (3100) tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  IF v_hutang_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Hutang tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- GENERATE ENTRY NUMBER
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

  -- CREATE JOURNAL ENTRY
  INSERT INTO journal_entries (
    id, branch_id, entry_number, entry_date, description,
    reference_type, reference_id, status, is_voided, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_branch_id, v_entry_number, p_debt_date,
    COALESCE(p_description, 'Migrasi hutang dari ' || p_creditor_name),
    'payable', p_debt_id, 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Saldo Awal (penyeimbang)
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_saldo_awal_account_id, '3100',
    (SELECT name FROM accounts WHERE id = v_saldo_awal_account_id),
    p_amount, 0, 'Saldo awal hutang migrasi', 1
  );

  -- Cr. Hutang
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_hutang_account_id, v_hutang_code,
    (SELECT name FROM accounts WHERE id = v_hutang_account_id),
    0, p_amount, 'Hutang migrasi - ' || p_creditor_name, 2
  );

  RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 4. CREATE MANUAL CASH IN JOURNAL RPC
-- Kas Masuk Manual: Dr. Kas, Cr. Pendapatan Lain-lain
-- ============================================================================

CREATE OR REPLACE FUNCTION create_manual_cash_in_journal_rpc(
  p_branch_id UUID,
  p_reference_id TEXT,
  p_transaction_date DATE,
  p_amount NUMERIC,
  p_description TEXT,
  p_cash_account_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_pendapatan_lain_account_id UUID;
BEGIN
  -- VALIDASI
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Amount must be greater than 0'::TEXT;
    RETURN;
  END IF;

  IF p_cash_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Cash account is required'::TEXT;
    RETURN;
  END IF;

  -- GET PENDAPATAN LAIN-LAIN ACCOUNT (4200 or 4900)
  SELECT id INTO v_pendapatan_lain_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code IN ('4200', '4900') AND is_active = TRUE
  ORDER BY code LIMIT 1;

  IF v_pendapatan_lain_account_id IS NULL THEN
    -- Create if not exists
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Pendapatan Lain-lain tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- GENERATE ENTRY NUMBER
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

  -- CREATE JOURNAL ENTRY
  INSERT INTO journal_entries (
    id, branch_id, entry_number, entry_date, description,
    reference_type, reference_id, status, is_voided, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_branch_id, v_entry_number, p_transaction_date,
    'Kas Masuk: ' || p_description,
    'manual', p_reference_id, 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Kas
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, p_cash_account_id,
    (SELECT code FROM accounts WHERE id = p_cash_account_id),
    (SELECT name FROM accounts WHERE id = p_cash_account_id),
    p_amount, 0, 'Kas masuk - ' || p_description, 1
  );

  -- Cr. Pendapatan Lain-lain
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_pendapatan_lain_account_id,
    (SELECT code FROM accounts WHERE id = v_pendapatan_lain_account_id),
    (SELECT name FROM accounts WHERE id = v_pendapatan_lain_account_id),
    0, p_amount, 'Pendapatan lain-lain', 2
  );

  RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 5. CREATE MANUAL CASH OUT JOURNAL RPC
-- Kas Keluar Manual: Dr. Beban Lain-lain, Cr. Kas
-- ============================================================================

CREATE OR REPLACE FUNCTION create_manual_cash_out_journal_rpc(
  p_branch_id UUID,
  p_reference_id TEXT,
  p_transaction_date DATE,
  p_amount NUMERIC,
  p_description TEXT,
  p_cash_account_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_beban_lain_account_id UUID;
BEGIN
  -- VALIDASI
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Amount must be greater than 0'::TEXT;
    RETURN;
  END IF;

  IF p_cash_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Cash account is required'::TEXT;
    RETURN;
  END IF;

  -- GET BEBAN LAIN-LAIN ACCOUNT (8100 or 6900)
  SELECT id INTO v_beban_lain_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code IN ('8100', '6900') AND is_active = TRUE
  ORDER BY code LIMIT 1;

  IF v_beban_lain_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Beban Lain-lain tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- GENERATE ENTRY NUMBER
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

  -- CREATE JOURNAL ENTRY
  INSERT INTO journal_entries (
    id, branch_id, entry_number, entry_date, description,
    reference_type, reference_id, status, is_voided, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_branch_id, v_entry_number, p_transaction_date,
    'Kas Keluar: ' || p_description,
    'manual', p_reference_id, 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Beban Lain-lain
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_beban_lain_account_id,
    (SELECT code FROM accounts WHERE id = v_beban_lain_account_id),
    (SELECT name FROM accounts WHERE id = v_beban_lain_account_id),
    p_amount, 0, 'Beban lain-lain - ' || p_description, 1
  );

  -- Cr. Kas
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, p_cash_account_id,
    (SELECT code FROM accounts WHERE id = p_cash_account_id),
    (SELECT name FROM accounts WHERE id = p_cash_account_id),
    0, p_amount, 'Kas keluar - ' || p_description, 2
  );

  RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 6. CREATE TRANSFER JOURNAL RPC
-- Transfer antar kas: Dr. Akun Tujuan, Cr. Akun Asal
-- ============================================================================

CREATE OR REPLACE FUNCTION create_transfer_journal_rpc(
  p_branch_id UUID,
  p_transfer_id TEXT,
  p_transfer_date DATE,
  p_amount NUMERIC,
  p_from_account_id UUID,
  p_to_account_id UUID,
  p_description TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_from_account RECORD;
  v_to_account RECORD;
BEGIN
  -- VALIDASI
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Amount must be greater than 0'::TEXT;
    RETURN;
  END IF;

  IF p_from_account_id IS NULL OR p_to_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'From and To accounts are required'::TEXT;
    RETURN;
  END IF;

  IF p_from_account_id = p_to_account_id THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Cannot transfer to same account'::TEXT;
    RETURN;
  END IF;

  -- GET ACCOUNT INFO
  SELECT id, code, name INTO v_from_account FROM accounts WHERE id = p_from_account_id;
  SELECT id, code, name INTO v_to_account FROM accounts WHERE id = p_to_account_id;

  IF v_from_account.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun asal tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  IF v_to_account.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun tujuan tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- GENERATE ENTRY NUMBER
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

  -- CREATE JOURNAL ENTRY
  INSERT INTO journal_entries (
    id, branch_id, entry_number, entry_date, description,
    reference_type, reference_id, status, is_voided, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_branch_id, v_entry_number, p_transfer_date,
    COALESCE(p_description, 'Transfer dari ' || v_from_account.name || ' ke ' || v_to_account.name),
    'transfer', p_transfer_id, 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Akun Tujuan (kas bertambah)
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, p_to_account_id, v_to_account.code, v_to_account.name,
    p_amount, 0, 'Transfer masuk dari ' || v_from_account.name, 1
  );

  -- Cr. Akun Asal (kas berkurang)
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, p_from_account_id, v_from_account.code, v_from_account.name,
    0, p_amount, 'Transfer keluar ke ' || v_to_account.name, 2
  );

  RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 7. CREATE MATERIAL PAYMENT JOURNAL RPC
-- Pembayaran tagihan bahan: Dr. Beban Bahan, Cr. Kas
-- ============================================================================

CREATE OR REPLACE FUNCTION create_material_payment_journal_rpc(
  p_branch_id UUID,
  p_reference_id TEXT,
  p_transaction_date DATE,
  p_amount NUMERIC,
  p_material_id UUID,
  p_material_name TEXT,
  p_description TEXT,
  p_cash_account_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_beban_bahan_account_id UUID;
BEGIN
  -- VALIDASI
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Amount must be greater than 0'::TEXT;
    RETURN;
  END IF;

  IF p_cash_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Cash account is required'::TEXT;
    RETURN;
  END IF;

  -- GET BEBAN BAHAN BAKU ACCOUNT (5300 or 6300)
  SELECT id INTO v_beban_bahan_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code IN ('5300', '6300', '6310') AND is_active = TRUE
  ORDER BY code LIMIT 1;

  IF v_beban_bahan_account_id IS NULL THEN
    -- Fallback to generic expense
    SELECT id INTO v_beban_bahan_account_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '6100' AND is_active = TRUE LIMIT 1;
  END IF;

  IF v_beban_bahan_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Beban Bahan Baku tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- GENERATE ENTRY NUMBER
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

  -- CREATE JOURNAL ENTRY
  INSERT INTO journal_entries (
    id, branch_id, entry_number, entry_date, description,
    reference_type, reference_id, status, is_voided, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_branch_id, v_entry_number, p_transaction_date,
    COALESCE(p_description, 'Pembayaran bahan - ' || p_material_name),
    'expense', p_reference_id, 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Beban Bahan Baku
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_beban_bahan_account_id,
    (SELECT code FROM accounts WHERE id = v_beban_bahan_account_id),
    (SELECT name FROM accounts WHERE id = v_beban_bahan_account_id),
    p_amount, 0, 'Beban bahan - ' || p_material_name, 1
  );

  -- Cr. Kas
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, p_cash_account_id,
    (SELECT code FROM accounts WHERE id = p_cash_account_id),
    (SELECT name FROM accounts WHERE id = p_cash_account_id),
    0, p_amount, 'Pembayaran bahan ' || p_material_name, 2
  );

  RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 8. CREATE INVENTORY OPENING BALANCE JOURNAL RPC
-- Jurnal saldo awal persediaan: Dr. Persediaan, Cr. Laba Ditahan
-- ============================================================================

CREATE OR REPLACE FUNCTION create_inventory_opening_balance_journal_rpc(
  p_branch_id UUID,
  p_products_value NUMERIC DEFAULT 0,
  p_materials_value NUMERIC DEFAULT 0,
  p_opening_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_persediaan_barang_id UUID;
  v_persediaan_bahan_id UUID;
  v_laba_ditahan_id UUID;
  v_total_amount NUMERIC;
  v_line_number INTEGER := 1;
BEGIN
  -- VALIDASI
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  v_total_amount := COALESCE(p_products_value, 0) + COALESCE(p_materials_value, 0);

  IF v_total_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Total value must be greater than 0'::TEXT;
    RETURN;
  END IF;

  -- GET ACCOUNT IDS
  SELECT id INTO v_persediaan_barang_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1310' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_persediaan_bahan_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1320' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_laba_ditahan_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '3200' AND is_active = TRUE LIMIT 1;

  IF v_laba_ditahan_id IS NULL THEN
    -- Fallback to Modal Disetor
    SELECT id INTO v_laba_ditahan_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '3100' AND is_active = TRUE LIMIT 1;
  END IF;

  IF v_laba_ditahan_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Laba Ditahan/Modal tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- GENERATE ENTRY NUMBER
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

  -- CREATE JOURNAL ENTRY
  INSERT INTO journal_entries (
    id, branch_id, entry_number, entry_date, description,
    reference_type, reference_id, status, is_voided, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_branch_id, v_entry_number, p_opening_date,
    'Saldo Awal Persediaan',
    'opening', 'INVENTORY-OPENING', 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Persediaan Barang Dagang (if > 0)
  IF p_products_value > 0 AND v_persediaan_barang_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, account_code, account_name,
      debit_amount, credit_amount, description, line_number
    ) VALUES (
      v_journal_id, v_persediaan_barang_id, '1310',
      (SELECT name FROM accounts WHERE id = v_persediaan_barang_id),
      p_products_value, 0, 'Saldo awal persediaan barang dagang', v_line_number
    );
    v_line_number := v_line_number + 1;
  END IF;

  -- Dr. Persediaan Bahan Baku (if > 0)
  IF p_materials_value > 0 AND v_persediaan_bahan_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, account_code, account_name,
      debit_amount, credit_amount, description, line_number
    ) VALUES (
      v_journal_id, v_persediaan_bahan_id, '1320',
      (SELECT name FROM accounts WHERE id = v_persediaan_bahan_id),
      p_materials_value, 0, 'Saldo awal persediaan bahan baku', v_line_number
    );
    v_line_number := v_line_number + 1;
  END IF;

  -- Cr. Laba Ditahan (penyeimbang)
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_laba_ditahan_id,
    (SELECT code FROM accounts WHERE id = v_laba_ditahan_id),
    (SELECT name FROM accounts WHERE id = v_laba_ditahan_id),
    0, v_total_amount, 'Penyeimbang saldo awal persediaan', v_line_number
  );

  RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 9. CREATE ALL OPENING BALANCE JOURNAL RPC
-- Jurnal saldo awal untuk semua akun dengan initial_balance
-- ============================================================================

CREATE OR REPLACE FUNCTION create_all_opening_balance_journal_rpc(
  p_branch_id UUID,
  p_opening_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  accounts_processed INTEGER,
  total_debit NUMERIC,
  error_message TEXT
) AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_laba_ditahan_id UUID;
  v_account RECORD;
  v_total_debit NUMERIC := 0;
  v_total_credit NUMERIC := 0;
  v_line_number INTEGER := 1;
  v_accounts_processed INTEGER := 0;
BEGIN
  -- VALIDASI
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  -- GET LABA DITAHAN ACCOUNT
  SELECT id INTO v_laba_ditahan_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '3200' AND is_active = TRUE LIMIT 1;

  IF v_laba_ditahan_id IS NULL THEN
    SELECT id INTO v_laba_ditahan_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '3100' AND is_active = TRUE LIMIT 1;
  END IF;

  IF v_laba_ditahan_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, 'Akun Laba Ditahan tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- GENERATE ENTRY NUMBER
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

  -- CREATE JOURNAL ENTRY
  INSERT INTO journal_entries (
    id, branch_id, entry_number, entry_date, description,
    reference_type, reference_id, status, is_voided, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_branch_id, v_entry_number, p_opening_date,
    'Saldo Awal Semua Akun',
    'opening', 'ALL-OPENING', 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;

  -- LOOP THROUGH ALL ACCOUNTS WITH INITIAL BALANCE
  FOR v_account IN
    SELECT id, code, name, type, initial_balance, normal_balance
    FROM accounts
    WHERE branch_id = p_branch_id
      AND initial_balance IS NOT NULL
      AND initial_balance <> 0
      AND code NOT IN ('1310', '1320') -- Exclude inventory (handled separately)
      AND is_active = TRUE
    ORDER BY code
  LOOP
    -- Determine debit/credit based on account type and normal balance
    IF v_account.type IN ('Aset', 'Beban') OR v_account.normal_balance = 'DEBIT' THEN
      -- Debit entry for asset/expense accounts
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, account_code, account_name,
        debit_amount, credit_amount, description, line_number
      ) VALUES (
        v_journal_id, v_account.id, v_account.code, v_account.name,
        ABS(v_account.initial_balance), 0, 'Saldo awal ' || v_account.name, v_line_number
      );
      v_total_debit := v_total_debit + ABS(v_account.initial_balance);
    ELSE
      -- Credit entry for liability/equity/revenue accounts
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, account_code, account_name,
        debit_amount, credit_amount, description, line_number
      ) VALUES (
        v_journal_id, v_account.id, v_account.code, v_account.name,
        0, ABS(v_account.initial_balance), 'Saldo awal ' || v_account.name, v_line_number
      );
      v_total_credit := v_total_credit + ABS(v_account.initial_balance);
    END IF;

    v_line_number := v_line_number + 1;
    v_accounts_processed := v_accounts_processed + 1;
  END LOOP;

  -- ADD BALANCING ENTRY TO LABA DITAHAN
  IF v_total_debit <> v_total_credit THEN
    IF v_total_debit > v_total_credit THEN
      -- Need more credit
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, account_code, account_name,
        debit_amount, credit_amount, description, line_number
      ) VALUES (
        v_journal_id, v_laba_ditahan_id,
        (SELECT code FROM accounts WHERE id = v_laba_ditahan_id),
        (SELECT name FROM accounts WHERE id = v_laba_ditahan_id),
        0, v_total_debit - v_total_credit, 'Penyeimbang saldo awal', v_line_number
      );
    ELSE
      -- Need more debit
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, account_code, account_name,
        debit_amount, credit_amount, description, line_number
      ) VALUES (
        v_journal_id, v_laba_ditahan_id,
        (SELECT code FROM accounts WHERE id = v_laba_ditahan_id),
        (SELECT name FROM accounts WHERE id = v_laba_ditahan_id),
        v_total_credit - v_total_debit, 0, 'Penyeimbang saldo awal', v_line_number
      );
    END IF;
  END IF;

  RETURN QUERY SELECT TRUE, v_journal_id, v_accounts_processed, v_total_debit, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION create_migration_receivable_journal_rpc(UUID, TEXT, DATE, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_debt_journal_rpc(UUID, TEXT, DATE, NUMERIC, TEXT, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_migration_debt_journal_rpc(UUID, TEXT, DATE, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_manual_cash_in_journal_rpc(UUID, TEXT, DATE, NUMERIC, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_manual_cash_out_journal_rpc(UUID, TEXT, DATE, NUMERIC, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_transfer_journal_rpc(UUID, TEXT, DATE, NUMERIC, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_material_payment_journal_rpc(UUID, TEXT, DATE, NUMERIC, UUID, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_inventory_opening_balance_journal_rpc(UUID, NUMERIC, NUMERIC, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION create_all_opening_balance_journal_rpc(UUID, DATE) TO authenticated;


-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION create_migration_receivable_journal_rpc IS 'Create migration journal for receivable: Dr. Piutang, Cr. Saldo Awal';
COMMENT ON FUNCTION create_debt_journal_rpc IS 'Create journal for new debt/loan: Dr. Kas, Cr. Hutang';
COMMENT ON FUNCTION create_migration_debt_journal_rpc IS 'Create migration journal for debt: Dr. Saldo Awal, Cr. Hutang';
COMMENT ON FUNCTION create_manual_cash_in_journal_rpc IS 'Create journal for manual cash in: Dr. Kas, Cr. Pendapatan Lain';
COMMENT ON FUNCTION create_manual_cash_out_journal_rpc IS 'Create journal for manual cash out: Dr. Beban Lain, Cr. Kas';
COMMENT ON FUNCTION create_transfer_journal_rpc IS 'Create journal for inter-account transfer: Dr. To, Cr. From';
COMMENT ON FUNCTION create_material_payment_journal_rpc IS 'Create journal for material bill payment: Dr. Beban Bahan, Cr. Kas';
COMMENT ON FUNCTION create_inventory_opening_balance_journal_rpc IS 'Create opening balance journal for inventory';
COMMENT ON FUNCTION create_all_opening_balance_journal_rpc IS 'Create opening balance journal for all accounts with initial_balance';

-- ============================================================================
-- FILE: 20_employee_advances.sql
-- ============================================================================
-- ============================================================================
-- RPC 20: Employee Advances Atomic
-- Purpose: Atomic operations for employee advances with journal integration
-- ============================================================================

-- ============================================================================
-- 1. CREATE EMPLOYEE ADVANCE ATOMIC
-- ============================================================================

CREATE OR REPLACE FUNCTION create_employee_advance_atomic(
  p_branch_id UUID,
  p_employee_id UUID,
  p_employee_name TEXT,
  p_amount NUMERIC,
  p_date DATE,
  p_notes TEXT,
  p_payment_account_id UUID,
  p_created_by UUID DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  advance_id TEXT,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_advance_id TEXT;
  v_journal_id UUID;
  v_piutang_acc_id UUID;
  v_journal_lines JSONB;
BEGIN
  -- ==================== VALIDASI ====================
  
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, 'Branch ID is REQUIRED'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, 'Amount must be positive'::TEXT;
    RETURN;
  END IF;

  -- Cari akun Piutang Karyawan (1220)
  SELECT id INTO v_piutang_acc_id
  FROM accounts
  WHERE branch_id = p_branch_id
    AND (code = '1220' OR name ILIKE '%Piutang Karyawan%' OR name ILIKE '%Kasbon%')
    AND is_header = FALSE
  LIMIT 1;

  IF v_piutang_acc_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, 'Akun Piutang Karyawan (1220) tidak ditemukan di branch ini'::TEXT;
    RETURN;
  END IF;

  -- ==================== CREATE ADVANCE RECORD ====================
  
  v_advance_id := 'ADV-' || TO_CHAR(p_date, 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

  INSERT INTO employee_advances (
    id,
    branch_id,
    employee_id,
    employee_name,
    amount,
    remaining_amount,
    date,
    notes,
    account_id,
    account_name,
    created_by,
    created_at
  ) VALUES (
    v_advance_id,
    p_branch_id,
    p_employee_id,
    p_employee_name,
    p_amount,
    p_amount, -- Initial remaining = amount
    p_date,
    p_notes,
    p_payment_account_id,
    (SELECT name FROM accounts WHERE id = p_payment_account_id),
    p_created_by,
    NOW()
  );

  -- ==================== CREATE JOURNAL ====================
  
  -- Dr. Piutang Karyawan
  --   Cr. Kas/Bank
  v_journal_lines := jsonb_build_array(
    jsonb_build_object(
      'account_id', v_piutang_acc_id,
      'debit_amount', p_amount,
      'credit_amount', 0,
      'description', format('Panjar Karyawan: %s', p_employee_name)
    ),
    jsonb_build_object(
      'account_id', p_payment_account_id,
      'debit_amount', 0,
      'credit_amount', p_amount,
      'description', format('Pembayaran panjar ke %s', p_employee_name)
    )
  );

  SELECT journal_id INTO v_journal_id
  FROM create_journal_atomic(
    p_branch_id,
    p_date,
    format('Panjar Karyawan - %s (%s)', p_employee_name, v_advance_id),
    'advance',
    v_advance_id,
    v_journal_lines,
    TRUE -- auto post
  );

  IF v_journal_id IS NULL THEN
    RAISE EXCEPTION 'Gagal membuat jurnal panjar';
  END IF;

  RETURN QUERY SELECT TRUE, v_advance_id, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. REPAY EMPLOYEE ADVANCE ATOMIC
-- ============================================================================

CREATE OR REPLACE FUNCTION repay_employee_advance_atomic(
  p_branch_id UUID,
  p_advance_id TEXT,
  p_amount NUMERIC,
  p_date DATE,
  p_payment_account_id UUID,
  p_recorded_by TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  repayment_id TEXT,
  journal_id UUID,
  remaining_amount NUMERIC,
  error_message TEXT
) AS $$
DECLARE
  v_repayment_id TEXT;
  v_journal_id UUID;
  v_advance_record RECORD;
  v_piutang_acc_id UUID;
  v_journal_lines JSONB;
  v_new_remaining NUMERIC;
BEGIN
  -- ==================== VALIDASI ====================
  
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, 0::NUMERIC, 'Branch ID is REQUIRED'::TEXT;
    RETURN;
  END IF;

  -- Get advance record with row lock
  SELECT * INTO v_advance_record
  FROM employee_advances
  WHERE id = p_advance_id AND branch_id = p_branch_id
  FOR UPDATE;

  IF v_advance_record.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, 0::NUMERIC, 'Data panjar tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  IF p_amount > v_advance_record.remaining_amount THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, v_advance_record.remaining_amount, 
      format('Jumlah pelunasan (%s) melebihi sisa panjar (%s)', p_amount, v_advance_record.remaining_amount)::TEXT;
    RETURN;
  END IF;

  -- Cari akun Piutang Karyawan
  SELECT id INTO v_piutang_acc_id
  FROM accounts
  WHERE branch_id = p_branch_id
    AND (code = '1220' OR name ILIKE '%Piutang Karyawan%' OR name ILIKE '%Kasbon%')
  LIMIT 1;

  -- ==================== CREATE REPAYMENT RECORD ====================
  
  v_repayment_id := 'REP-' || TO_CHAR(p_date, 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

  INSERT INTO advance_repayments (
    id,
    advance_id,
    amount,
    date,
    recorded_by,
    created_at
  ) VALUES (
    v_repayment_id,
    p_advance_id,
    p_amount,
    p_date,
    p_recorded_by,
    NOW()
  );

  -- Update remaining amount
  UPDATE employee_advances
  SET 
    remaining_amount = remaining_amount - p_amount,
    updated_at = NOW()
  WHERE id = p_advance_id
  RETURNING remaining_amount INTO v_new_remaining;

  -- ==================== CREATE JOURNAL ====================
  
  -- Dr. Kas/Bank
  --   Cr. Piutang Karyawan
  v_journal_lines := jsonb_build_array(
    jsonb_build_object(
      'account_id', p_payment_account_id,
      'debit_amount', p_amount,
      'credit_amount', 0,
      'description', format('Pelunasan panjar: %s', v_advance_record.employee_name)
    ),
    jsonb_build_object(
      'account_id', v_piutang_acc_id,
      'debit_amount', 0,
      'credit_amount', p_amount,
      'description', format('Pengurangan piutang karyawan (%s)', p_advance_id)
    )
  );

  SELECT journal_id INTO v_journal_id
  FROM create_journal_atomic(
    p_branch_id,
    p_date,
    format('Pelunasan Panjar - %s (%s)', v_advance_record.employee_name, v_repayment_id),
    'advance',
    v_repayment_id,
    v_journal_lines,
    TRUE
  );

  RETURN QUERY SELECT TRUE, v_repayment_id, v_journal_id, v_new_remaining, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, 0::NUMERIC, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 3. VOID EMPLOYEE ADVANCE ATOMIC
-- ============================================================================

CREATE OR REPLACE FUNCTION void_employee_advance_atomic(
  p_branch_id UUID,
  p_advance_id TEXT,
  p_reason TEXT DEFAULT 'Cancelled'
)
RETURNS TABLE (
  success BOOLEAN,
  journals_voided INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_journals_voided INTEGER := 0;
  v_advance_record RECORD;
BEGIN
  -- ==================== VALIDASI ====================

  SELECT * INTO v_advance_record
  FROM employee_advances
  WHERE id = p_advance_id AND branch_id = p_branch_id
  FOR UPDATE;

  IF v_advance_record.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Data panjar tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- ==================== VOID JOURNALS ====================

  -- Void advance journal and all repayment journals
  UPDATE journal_entries
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_reason = p_reason,
    status = 'voided',
    updated_at = NOW()
  WHERE branch_id = p_branch_id
    AND reference_type = 'advance'
    AND (reference_id = p_advance_id OR reference_id IN (SELECT id FROM advance_repayments WHERE advance_id = p_advance_id))
    AND is_voided = FALSE;

  GET DIAGNOSTICS v_journals_voided = ROW_COUNT;

  -- ==================== DELETE RECORDS ====================
  
  -- Hard delete repayments first
  DELETE FROM advance_repayments WHERE advance_id = p_advance_id;

  -- Hard delete the advance
  DELETE FROM employee_advances WHERE id = p_advance_id AND branch_id = p_branch_id;

  RETURN QUERY SELECT TRUE, v_journals_voided, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANTS & COMMENTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION create_employee_advance_atomic(UUID, UUID, TEXT, NUMERIC, DATE, TEXT, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION repay_employee_advance_atomic(UUID, TEXT, NUMERIC, DATE, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION void_employee_advance_atomic(UUID, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION create_employee_advance_atomic IS 'Pemberian panjar karyawan secara atomik dengan jurnal.';
COMMENT ON FUNCTION repay_employee_advance_atomic IS 'Pelunasan panjar karyawan secara atomik dengan jurnal.';
COMMENT ON FUNCTION void_employee_advance_atomic IS 'Pembatalan panjar karyawan secara atomik (void jurnal + hapus data).';

-- ============================================================================
-- FILE: 21_retasi_management.sql
-- ============================================================================
-- ============================================================================
-- RPC 21: Retasi Management Atomic
-- Purpose: Atomic operations for truck loading (retasi) and returns
-- ============================================================================

-- ============================================================================
-- 1. CREATE RETASI ATOMIC
-- ============================================================================

CREATE OR REPLACE FUNCTION create_retasi_atomic(
  p_branch_id UUID,
  p_driver_name TEXT,
  p_helper_name TEXT DEFAULT NULL,
  p_truck_number TEXT DEFAULT NULL,
  p_route TEXT DEFAULT NULL,
  p_departure_date DATE DEFAULT CURRENT_DATE,
  p_departure_time TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::JSONB, -- Array of {product_id, product_name, quantity, weight, notes}
  p_created_by UUID DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  retasi_id UUID,
  retasi_number TEXT,
  retasi_ke INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_retasi_id UUID := gen_random_uuid();
  v_retasi_number TEXT;
  v_retasi_ke INTEGER;
  v_item RECORD;
BEGIN
  -- ==================== VALIDASI ====================
  
  -- Check if driver has active retasi
  IF EXISTS (
    SELECT 1 FROM retasi 
    WHERE driver_name = p_driver_name 
      AND is_returned = FALSE
      AND (branch_id = p_branch_id OR branch_id IS NULL)
  ) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::INTEGER, 
      format('Supir %s masih memiliki retasi yang belum dikembalikan', p_driver_name)::TEXT;
    RETURN;
  END IF;

  -- Generate Retasi Number: RET-YYYYMMDD-HHMISS
  v_retasi_number := 'RET-' || TO_CHAR(p_departure_date, 'YYYYMMDD') || '-' || TO_CHAR(NOW(), 'HH24MISS');

  -- Count retasi_ke for today
  SELECT COALESCE(COUNT(*), 0) + 1 INTO v_retasi_ke
  FROM retasi
  WHERE driver_name = p_driver_name
    AND departure_date = p_departure_date
    AND (branch_id = p_branch_id OR branch_id IS NULL);

  -- ==================== INSERT RETASI ====================
  
  INSERT INTO retasi (
    id,
    branch_id,
    retasi_number,
    truck_number,
    driver_name,
    helper_name,
    departure_date,
    departure_time,
    route,
    notes,
    retasi_ke,
    is_returned,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    v_retasi_id,
    p_branch_id,
    v_retasi_number,
    p_truck_number,
    p_driver_name,
    p_helper_name,
    p_departure_date,
    CASE WHEN p_departure_time IS NOT NULL AND p_departure_time != ''
         THEN p_departure_time::TIME
         ELSE NULL
    END,
    p_route,
    p_notes,
    v_retasi_ke,
    FALSE,
    p_created_by,
    NOW(),
    NOW()
  );

  -- ==================== INSERT ITEMS ====================
  
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
    product_id UUID, 
    product_name TEXT, 
    quantity NUMERIC, 
    weight NUMERIC, 
    notes TEXT
  ) LOOP
    INSERT INTO retasi_items (
      retasi_id,
      product_id,
      product_name,
      quantity,
      weight,
      notes,
      created_at
    ) VALUES (
      v_retasi_id,
      v_item.product_id,
      v_item.product_name,
      v_item.quantity,
      v_item.weight,
      v_item.notes,
      NOW()
    );
  END LOOP;

  RETURN QUERY SELECT TRUE, v_retasi_id, v_retasi_number, v_retasi_ke, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::INTEGER, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. MARK RETASI RETURNED ATOMIC
-- ============================================================================

CREATE OR REPLACE FUNCTION mark_retasi_returned_atomic(
  p_branch_id UUID,
  p_retasi_id UUID,
  p_return_notes TEXT,
  p_item_returns JSONB -- Array of {item_id, returned_qty, sold_qty, error_qty, unsold_qty}
)
RETURNS TABLE (
  success BOOLEAN,
  barang_laku NUMERIC,
  barang_tidak_laku NUMERIC,
  error_message TEXT
) AS $$
DECLARE
  v_item RECORD;
  v_total_laku NUMERIC := 0;
  v_total_tidak_laku NUMERIC := 0;
  v_returned_count INTEGER := 0;
  v_error_count INTEGER := 0;
BEGIN
  -- ==================== VALIDASI ====================
  
  IF NOT EXISTS (SELECT 1 FROM retasi WHERE id = p_retasi_id AND is_returned = FALSE) THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, 0::NUMERIC, 'Retasi tidak ditemukan atau sudah dikembalikan'::TEXT;
    RETURN;
  END IF;

  -- ==================== UPDATE ITEMS ====================
  
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_item_returns) AS x(
    item_id UUID, 
    returned_qty NUMERIC, 
    sold_qty NUMERIC, 
    error_qty NUMERIC, 
    unsold_qty NUMERIC
  ) LOOP
    UPDATE retasi_items
    SET
      returned_qty = v_item.returned_qty,
      sold_qty = v_item.sold_qty,
      error_qty = v_item.error_qty,
      unsold_qty = v_item.unsold_qty
    WHERE id = v_item.item_id AND retasi_id = p_retasi_id;

    v_total_laku := v_total_laku + v_item.sold_qty;
    v_total_tidak_laku := v_total_tidak_laku + v_item.unsold_qty + v_item.returned_qty;
    
    IF v_item.returned_qty > 0 THEN v_returned_count := v_returned_count + 1; END IF;
    IF v_item.error_qty > 0 THEN v_error_count := v_error_count + 1; END IF;
  END LOOP;

  -- ==================== UPDATE RETASI ====================
  
  UPDATE retasi
  SET
    is_returned = TRUE,
    return_notes = p_return_notes,
    barang_laku = v_total_laku,
    barang_tidak_laku = v_total_tidak_laku,
    returned_items_count = v_returned_count,
    error_items_count = v_error_count,
    updated_at = NOW()
  WHERE id = p_retasi_id;

  -- NOTE: Integrasi Jurnal untuk 'error_qty' (Barang Rusak) bisa ditambahkan di sini 
  -- jika sudah ada akun Beban Kerusakan Barang. Untuk saat ini kita simpan datanya dulu.

  RETURN QUERY SELECT TRUE, v_total_laku, v_total_tidak_laku, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0::NUMERIC, 0::NUMERIC, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANTS & COMMENTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION create_retasi_atomic(UUID, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_retasi_returned_atomic(UUID, UUID, TEXT, JSONB) TO authenticated;

COMMENT ON FUNCTION create_retasi_atomic IS 'Membuat keberangkatan retasi (loading truck) secara atomik.';
COMMENT ON FUNCTION mark_retasi_returned_atomic IS 'Memproses pengembalian retasi secara atomik.';

-- ============================================================================
-- FILE: 22_closing_entries.sql
-- ============================================================================
-- ============================================================================
-- RPC 22: Closing Entries Atomic
-- Purpose: Annual closing process in database
-- ============================================================================

-- ============================================================================
-- 1. EXECUTE CLOSING ENTRY ATOMIC
-- ============================================================================

CREATE OR REPLACE FUNCTION execute_closing_entry_atomic(
  p_branch_id UUID,
  p_year INTEGER,
  p_user_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  net_income NUMERIC,
  error_message TEXT
) AS $$
DECLARE
  v_closing_date DATE := (p_year || '-12-31')::DATE;
  v_ikhtisar_acc_id UUID;
  v_laba_ditahan_acc_id UUID;
  v_total_pendapatan NUMERIC := 0;
  v_total_beban NUMERIC := 0;
  v_net_income NUMERIC := 0;
  v_journal_id UUID;
  v_journal_lines JSONB := '[]'::JSONB;
  v_acc RECORD;
  v_line_desc TEXT;
BEGIN
  -- 1. Validasi: cek apakah tahun sudah ditutup
  IF EXISTS (SELECT 1 FROM closing_periods WHERE year = p_year AND branch_id = p_branch_id) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, format('Tahun %s sudah pernah ditutup', p_year)::TEXT;
    RETURN;
  END IF;

  -- 2. Dapatkan Akun Laba Ditahan (3200)
  SELECT id INTO v_laba_ditahan_acc_id FROM accounts
  WHERE branch_id = p_branch_id AND (code = '3200' OR name ILIKE '%Laba Ditahan%') AND is_header = FALSE
  LIMIT 1;

  IF v_laba_ditahan_acc_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, 'Akun Laba Ditahan (3200) tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- 3. Dapatkan atau buat Akun Ikhtisar Laba Rugi (3300)
  SELECT id INTO v_ikhtisar_acc_id FROM accounts
  WHERE branch_id = p_branch_id AND (code = '3300' OR name ILIKE '%Ikhtisar Laba Rugi%') AND is_header = FALSE
  LIMIT 1;

  IF v_ikhtisar_acc_id IS NULL THEN
    INSERT INTO accounts (
      branch_id, code, name, type, is_header, is_active, balance, initial_balance, level, normal_balance
    ) VALUES (
      p_branch_id, '3300', 'Ikhtisar Laba Rugi', 'Modal', FALSE, TRUE, 0, 0, 3, 'CREDIT'
    ) RETURNING id INTO v_ikhtisar_acc_id;
  END IF;

  -- 4. Hitung Saldo Pendapatan & Beban dari Jurnal Posted
  -- Pendapatan (Saldo Normal Kredit)
  FOR v_acc IN 
    SELECT a.id, a.code, a.name, COALESCE(SUM(l.debit_amount - l.credit_amount), 0) as net_balance
    FROM accounts a
    JOIN journal_entry_lines l ON l.account_id = a.id
    JOIN journal_entries j ON j.id = l.journal_entry_id
    WHERE a.branch_id = p_branch_id 
      AND a.type = 'Pendapatan'
      AND j.status = 'posted' AND j.is_voided = FALSE
      AND j.entry_date BETWEEN (p_year || '-01-01')::DATE AND v_closing_date
    GROUP BY a.id, a.code, a.name
    HAVING SUM(l.debit_amount - l.credit_amount) != 0
  LOOP
    -- Pendapatan biasanya bersaldo kredit (negatif di p-net_balance jika debit - credit)
    -- Tutup Pendapatan: Debit Akun Pendapatan, Credit Ikhtisar
    v_total_pendapatan := v_total_pendapatan + ABS(v_acc.net_balance);
    
    v_journal_lines := v_journal_lines || jsonb_build_object(
      'account_id', v_acc.id,
      'debit_amount', ABS(v_acc.net_balance),
      'credit_amount', 0,
      'description', format('Tutup %s ke Ikhtisar Laba Rugi', v_acc.name)
    );
  END LOOP;

  IF v_total_pendapatan > 0 THEN
    v_journal_lines := v_journal_lines || jsonb_build_object(
      'account_id', v_ikhtisar_acc_id,
      'debit_amount', 0,
      'credit_amount', v_total_pendapatan,
      'description', 'Tutup Total Pendapatan ke Ikhtisar Laba Rugi'
    );
  END IF;

  -- Beban (Saldo Normal Debit)
  FOR v_acc IN 
    SELECT a.id, a.code, a.name, COALESCE(SUM(l.debit_amount - l.credit_amount), 0) as net_balance
    FROM accounts a
    JOIN journal_entry_lines l ON l.account_id = a.id
    JOIN journal_entries j ON j.id = l.journal_entry_id
    WHERE a.branch_id = p_branch_id 
      AND a.type = 'Beban'
      AND j.status = 'posted' AND j.is_voided = FALSE
      AND j.entry_date BETWEEN (p_year || '-01-01')::DATE AND v_closing_date
    GROUP BY a.id, a.code, a.name
    HAVING SUM(l.debit_amount - l.credit_amount) != 0
  LOOP
    -- Beban biasanya bersaldo debit (positif)
    -- Tutup Beban: Debit Ikhtisar, Credit Akun Beban
    v_total_beban := v_total_beban + ABS(v_acc.net_balance);
    
    v_journal_lines := v_journal_lines || jsonb_build_object(
      'account_id', v_acc.id,
      'debit_amount', 0,
      'credit_amount', ABS(v_acc.net_balance),
      'description', format('Tutup %s ke Ikhtisar Laba Rugi', v_acc.name)
    );
  END LOOP;

  IF v_total_beban > 0 THEN
    v_journal_lines := v_journal_lines || jsonb_build_object(
      'account_id', v_ikhtisar_acc_id,
      'debit_amount', v_total_beban,
      'credit_amount', 0,
      'description', 'Tutup Total Beban ke Ikhtisar Laba Rugi'
    );
  END IF;

  v_net_income := v_total_pendapatan - v_total_beban;

  IF v_net_income = 0 AND jsonb_array_length(v_journal_lines) = 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, 'Tidak ada saldo pendapatan/beban untuk ditutup'::TEXT;
    RETURN;
  END IF;

  -- 5. Tutup Ikhtisar ke Laba Ditahan
  IF v_net_income > 0 THEN
    -- LABA: Dr. Ikhtisar, Cr. Laba Ditahan
    v_journal_lines := v_journal_lines || jsonb_build_object(
      'account_id', v_ikhtisar_acc_id,
      'debit_amount', v_net_income,
      'credit_amount', 0,
      'description', 'Tutup Laba Bersih ke Laba Ditahan'
    );
    v_journal_lines := v_journal_lines || jsonb_build_object(
      'account_id', v_laba_ditahan_acc_id,
      'debit_amount', 0,
      'credit_amount', v_net_income,
      'description', format('Penerimaan Laba Bersih Tahun %s', p_year)
    );
  ELSIF v_net_income < 0 THEN
    -- RUGI: Dr. Laba Ditahan, Cr. Ikhtisar
    v_journal_lines := v_journal_lines || jsonb_build_object(
      'account_id', v_laba_ditahan_acc_id,
      'debit_amount', ABS(v_net_income),
      'credit_amount', 0,
      'description', format('Pengurangan akibat Rugi Bersih Tahun %s', p_year)
    );
    v_journal_lines := v_journal_lines || jsonb_build_object(
      'account_id', v_ikhtisar_acc_id,
      'debit_amount', 0,
      'credit_amount', ABS(v_net_income),
      'description', 'Tutup Rugi Bersih ke Laba Ditahan'
    );
  END IF;

  -- 6. Buat Jurnal Penutup
  SELECT journal_id INTO v_journal_id
  FROM create_journal_atomic(
    p_branch_id,
    v_closing_date,
    format('Jurnal Penutup Tahun %s', p_year),
    'closing',
    p_year::TEXT,
    v_journal_lines,
    TRUE -- auto post
  );

  -- 7. Simpan di closing_periods
  INSERT INTO closing_periods (
    year, branch_id, closed_at, closed_by, journal_entry_id, net_income
  ) VALUES (
    p_year, p_branch_id, NOW(), p_user_id, v_journal_id, v_net_income
  );

  RETURN QUERY SELECT TRUE, v_journal_id, v_net_income, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. VOID CLOSING ENTRY ATOMIC
-- ============================================================================

CREATE OR REPLACE FUNCTION void_closing_entry_atomic(
  p_branch_id UUID,
  p_year INTEGER
)
RETURNS TABLE ( success BOOLEAN, error_message TEXT ) AS $$
DECLARE
  v_journal_id UUID;
BEGIN
  -- 1. Ambil data closing
  SELECT journal_entry_id INTO v_journal_id
  FROM closing_periods
  WHERE year = p_year AND branch_id = p_branch_id;

  IF v_journal_id IS NULL THEN
    RETURN QUERY SELECT FALSE, format('Tidak ada tutup buku untuk tahun %s', p_year)::TEXT;
    RETURN;
  END IF;

  -- 2. Cek apakah ada transaksi di tahun berikutnya (Opsional, tapi bagus untuk kontrol)
  -- Untuk saat ini kita biarkan void selama journal belum di-audit/lock manual
  
  -- 3. Void Journal
  UPDATE journal_entries
  SET is_voided = TRUE, status = 'voided', voided_reason = format('Pembatalan tutup buku tahun %s', p_year)
  WHERE id = v_journal_id;

  -- 4. Hapus Closing Period
  DELETE FROM closing_periods WHERE year = p_year AND branch_id = p_branch_id;

  RETURN QUERY SELECT TRUE, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 3. PREVIEW CLOSING ENTRY
-- ============================================================================

CREATE OR REPLACE FUNCTION preview_closing_entry(
  p_branch_id UUID,
  p_year INTEGER
)
RETURNS TABLE (
  total_pendapatan NUMERIC,
  total_beban NUMERIC,
  laba_rugi_bersih NUMERIC,
  pendapatan_accounts JSONB,
  beban_accounts JSONB
) AS $$
DECLARE
  v_closing_date DATE := (p_year || '-12-31')::DATE;
  v_total_pendapatan NUMERIC := 0;
  v_total_beban NUMERIC := 0;
  v_pendapatan_json JSONB := '[]'::JSONB;
  v_beban_json JSONB := '[]'::JSONB;
  v_acc RECORD;
BEGIN
  -- Pendapatan
  FOR v_acc IN 
    SELECT a.id, a.code, a.name, ABS(SUM(l.debit_amount - l.credit_amount)) as balance
    FROM accounts a
    JOIN journal_entry_lines l ON l.account_id = a.id
    JOIN journal_entries j ON j.id = l.journal_entry_id
    WHERE a.branch_id = p_branch_id 
      AND a.type = 'Pendapatan'
      AND j.status = 'posted' AND j.is_voided = FALSE
      AND j.entry_date BETWEEN (p_year || '-01-01')::DATE AND v_closing_date
    GROUP BY a.id, a.code, a.name
    HAVING SUM(l.debit_amount - l.credit_amount) != 0
  LOOP
    v_total_pendapatan := v_total_pendapatan + v_acc.balance;
    v_pendapatan_json := v_pendapatan_json || jsonb_build_object(
      'id', v_acc.id,
      'code', v_acc.code,
      'name', v_acc.name,
      'balance', v_acc.balance
    );
  END LOOP;

  -- Beban
  FOR v_acc IN 
    SELECT a.id, a.code, a.name, ABS(SUM(l.debit_amount - l.credit_amount)) as balance
    FROM accounts a
    JOIN journal_entry_lines l ON l.account_id = a.id
    JOIN journal_entries j ON j.id = l.journal_entry_id
    WHERE a.branch_id = p_branch_id 
      AND a.type = 'Beban'
      AND j.status = 'posted' AND j.is_voided = FALSE
      AND j.entry_date BETWEEN (p_year || '-01-01')::DATE AND v_closing_date
    GROUP BY a.id, a.code, a.name
    HAVING SUM(l.debit_amount - l.credit_amount) != 0
  LOOP
    v_total_beban := v_total_beban + v_acc.balance;
    v_beban_json := v_beban_json || jsonb_build_object(
      'id', v_acc.id,
      'code', v_acc.code,
      'name', v_acc.name,
      'balance', v_acc.balance
    );
  END LOOP;

  RETURN QUERY SELECT 
    v_total_pendapatan, 
    v_total_beban, 
    v_total_pendapatan - v_total_beban,
    v_pendapatan_json,
    v_beban_json;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION execute_closing_entry_atomic(UUID, INTEGER, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION void_closing_entry_atomic(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION preview_closing_entry(UUID, INTEGER) TO authenticated;

-- ============================================================================
-- FILE: 23_zakat_management.sql
-- ============================================================================
-- ============================================================================
-- RPC 23: Zakat Management Atomic
-- Purpose: Atomic operations for Zakat records with journal integration
-- ============================================================================

-- ============================================================================
-- 1. UPSERT ZAKAT RECORD ATOMIC
-- ============================================================================

CREATE OR REPLACE FUNCTION upsert_zakat_record_atomic(
  p_branch_id UUID,
  p_zakat_id TEXT,
  p_data JSONB
)
RETURNS TABLE (
  success BOOLEAN,
  zakat_id TEXT,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_zakat_id TEXT := p_zakat_id;
  v_journal_id UUID;
  v_beban_acc_id UUID;
  v_payment_acc_id UUID;
  v_amount NUMERIC;
  v_date DATE;
  v_journal_lines JSONB;
  v_category TEXT;
  v_title TEXT;
BEGIN
  -- ==================== VALIDASI & EKSTRAKSI ====================
  
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, 'Branch ID is REQUIRED'::TEXT;
    RETURN;
  END IF;

  v_amount := (p_data->>'amount')::NUMERIC;
  v_date := (p_data->>'payment_date')::DATE;
  v_payment_acc_id := (p_data->>'payment_account_id')::UUID;
  v_category := p_data->>'category';
  v_title := p_data->>'title';

  IF v_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, 'Amount must be positive'::TEXT;
    RETURN;
  END IF;

  -- Cari atau buat akun Beban Zakat/Sosial (6260-ish)
  -- Jika tidak ada, fallback ke Beban Umum (6200)
  SELECT id INTO v_beban_acc_id
  FROM accounts
  WHERE branch_id = p_branch_id
    AND (name ILIKE '%Beban Zakat%' OR name ILIKE '%Beban Sosial%' OR name ILIKE '%Beban Sumbangan%')
    AND is_header = FALSE
  LIMIT 1;

  IF v_beban_acc_id IS NULL THEN
    -- Fallback ke Beban Umum & Administrasi
    SELECT id INTO v_beban_acc_id
    FROM accounts
    WHERE branch_id = p_branch_id
      AND (code = '6200' OR name ILIKE '%Beban Umum%')
      AND is_header = FALSE
    LIMIT 1;
  END IF;

  IF v_beban_acc_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, 'Akun Beban (6200) tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- ==================== UPSERT ZAKAT RECORD ====================
  
  IF v_zakat_id IS NULL THEN
    v_zakat_id := 'ZAKAT-' || TO_CHAR(v_date, 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0');
  END IF;

  INSERT INTO zakat_records (
    id,
    type,
    category,
    title,
    description,
    recipient,
    recipient_type,
    amount,
    nishab_amount,
    percentage_rate,
    payment_date,
    payment_account_id,
    payment_method,
    status,
    receipt_number,
    calculation_basis,
    calculation_notes,
    is_anonymous,
    notes,
    attachment_url,
    hijri_year,
    hijri_month,
    created_by,
    branch_id,
    created_at,
    updated_at
  ) VALUES (
    v_zakat_id,
    p_data->>'type',
    v_category,
    v_title,
    p_data->>'description',
    p_data->>'recipient',
    p_data->>'recipient_type',
    v_amount,
    (p_data->>'nishab_amount')::NUMERIC,
    (p_data->>'percentage_rate')::NUMERIC,
    v_date,
    v_payment_acc_id,
    p_data->>'payment_method',
    'paid',
    p_data->>'receipt_number',
    p_data->>'calculation_basis',
    p_data->>'calculation_notes',
    (p_data->>'is_anonymous')::BOOLEAN,
    p_data->>'notes',
    p_data->>'attachment_url',
    (p_data->>'hijri_year')::INTEGER,
    p_data->>'hijri_month',
    auth.uid(),
    p_branch_id,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    type = EXCLUDED.type,
    category = EXCLUDED.category,
    title = EXCLUDED.title,
    amount = EXCLUDED.amount,
    payment_date = EXCLUDED.payment_date,
    payment_account_id = EXCLUDED.payment_account_id,
    updated_at = NOW();

  -- ==================== CREATE JOURNAL ====================
  
  -- Void existing journal if updating
  UPDATE journal_entries 
  SET is_voided = TRUE, status = 'voided', voided_reason = 'Updated zakat record'
  WHERE reference_id = v_zakat_id AND reference_type = 'zakat' AND is_voided = FALSE;

  -- Dr. Beban Zakat/Umum
  --   Cr. Kas/Bank
  v_journal_lines := jsonb_build_array(
    jsonb_build_object(
      'account_id', v_beban_acc_id,
      'debit_amount', v_amount,
      'credit_amount', 0,
      'description', format('%s: %s', INITCAP(v_category), v_title)
    ),
    jsonb_build_object(
      'account_id', v_payment_acc_id,
      'debit_amount', 0,
      'credit_amount', v_amount,
      'description', format('Pembayaran %s (%s)', v_category, v_zakat_id)
    )
  );

  SELECT journal_id INTO v_journal_id
  FROM create_journal_atomic(
    p_branch_id,
    v_date,
    format('Pembayaran %s - %s', INITCAP(v_category), v_title),
    'zakat',
    v_zakat_id,
    v_journal_lines,
    TRUE -- auto post
  );

  -- Link journal to zakat record
  UPDATE zakat_records SET journal_entry_id = v_journal_id WHERE id = v_zakat_id;

  RETURN QUERY SELECT TRUE, v_zakat_id, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. DELETE ZAKAT RECORD ATOMIC
-- ============================================================================

CREATE OR REPLACE FUNCTION delete_zakat_record_atomic(
  p_branch_id UUID,
  p_zakat_id TEXT
)
RETURNS TABLE ( success BOOLEAN, error_message TEXT ) AS $$
BEGIN
  -- Void Journals
  UPDATE journal_entries
  SET is_voided = TRUE, status = 'voided', voided_reason = 'Zakat record deleted'
  WHERE reference_id = p_zakat_id AND reference_type = 'zakat' AND is_voided = FALSE;

  -- Delete Record
  DELETE FROM zakat_records WHERE id = p_zakat_id AND branch_id = p_branch_id;

  RETURN QUERY SELECT TRUE, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION upsert_zakat_record_atomic(UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_zakat_record_atomic(UUID, TEXT) TO authenticated;

-- ============================================================================
-- FILE: 24_debt_installment.sql
-- ============================================================================
-- ============================================================================
-- RPC 24: Debt Installment Management
-- Purpose: Manage debt installment operations atomically
-- - Update overdue status for installments
-- ============================================================================

-- ============================================================================
-- 1. UPDATE OVERDUE INSTALLMENTS
-- Automatically mark pending installments as overdue if past due date
-- ============================================================================

CREATE OR REPLACE FUNCTION update_overdue_installments_atomic()
RETURNS TABLE (
  updated_count INTEGER,
  success BOOLEAN,
  error_message TEXT
) AS $$
DECLARE
  v_updated_count INTEGER := 0;
BEGIN
  -- Update all pending installments that are past due date
  UPDATE debt_installments
  SET
    status = 'overdue'
  WHERE status = 'pending'
    AND due_date < CURRENT_DATE;
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  
  RETURN QUERY SELECT 
    v_updated_count,
    TRUE,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT 
    0,
    FALSE,
    SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION update_overdue_installments_atomic() TO authenticated;
GRANT EXECUTE ON FUNCTION update_overdue_installments_atomic() TO anon;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION update_overdue_installments_atomic IS
  'Automatically update pending installments to overdue status if past due date. Can be called by authenticated users or scheduled jobs.';

-- ============================================================================
-- 2. UPSERT NOTIFICATION
-- Create or update notification (for low stock, due payments, etc.)
-- ============================================================================

CREATE OR REPLACE FUNCTION upsert_notification_atomic(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_message TEXT,
  p_priority TEXT DEFAULT 'normal',
  p_reference_id TEXT DEFAULT NULL,
  p_reference_type TEXT DEFAULT NULL,
  p_reference_url TEXT DEFAULT NULL
)
RETURNS TABLE (
  notification_id UUID,
  success BOOLEAN,
  error_message TEXT
) AS $$
DECLARE
  v_notification_id UUID;
  v_existing_id UUID;
  v_today TIMESTAMP;
BEGIN
  -- Get today's start time
  v_today := DATE_TRUNC('day', NOW());

  -- Check if similar unread notification exists today
  SELECT id INTO v_existing_id
  FROM notifications
  WHERE user_id = p_user_id
    AND type = p_type
    AND is_read = FALSE
    AND created_at >= v_today
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Update existing notification
    UPDATE notifications
    SET 
      title = p_title,
      message = p_message,
      priority = p_priority,
      reference_id = p_reference_id,
      updated_at = NOW()
    WHERE id = v_existing_id;
    
    v_notification_id := v_existing_id;
  ELSE
    -- Create new notification
    INSERT INTO notifications (
      user_id,
      type,
      title,
      message,
      priority,
      reference_id,
      reference_type,
      reference_url
    ) VALUES (
      p_user_id,
      p_type,
      p_title,
      p_message,
      p_priority,
      p_reference_id,
      p_reference_type,
      p_reference_url
    )
    RETURNING id INTO v_notification_id;
  END IF;

  RETURN QUERY SELECT 
    v_notification_id,
    TRUE,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT 
    NULL::UUID,
    FALSE,
    SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION upsert_notification_atomic(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_notification_atomic(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION upsert_notification_atomic IS
  'Create or update notification for a user. If similar unread notification exists today, update it instead of creating duplicate.';

-- ============================================================================
-- FILE: cleanup_old_functions.sql
-- ============================================================================
-- Cleanup old RPC functions that have been refactored to use auth.uid()
-- This prevents "function name not unique" errors and confusion

-- 1. PO Management
DROP FUNCTION IF EXISTS approve_purchase_order_atomic(TEXT, UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS create_purchase_order_atomic(JSONB, JSONB, UUID, UUID); -- In case old signature existed

-- 2. Stock Adjustment
DROP FUNCTION IF EXISTS create_product_stock_adjustment_atomic(UUID, UUID, NUMERIC, TEXT, NUMERIC, UUID);
DROP FUNCTION IF EXISTS create_material_stock_adjustment_atomic(UUID, UUID, NUMERIC, TEXT, NUMERIC, UUID);

-- 3. Tax Payment
DROP FUNCTION IF EXISTS create_tax_payment_atomic(UUID, TEXT, NUMERIC, NUMERIC, UUID, TEXT, UUID);

-- 4. Employee Advance
DROP FUNCTION IF EXISTS create_employee_advance_atomic(JSONB, UUID, UUID);
DROP FUNCTION IF EXISTS repay_employee_advance_atomic(UUID, UUID, NUMERIC, DATE, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS void_employee_advance_atomic(UUID, UUID, TEXT, UUID);

-- 5. Closing Entries
DROP FUNCTION IF EXISTS execute_closing_entry_atomic(UUID, INTEGER, UUID);

-- 6. Zakat Management
DROP FUNCTION IF EXISTS upsert_zakat_record_atomic(UUID, TEXT, JSONB, UUID);
