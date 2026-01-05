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
