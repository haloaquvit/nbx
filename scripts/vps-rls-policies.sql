-- ============================================================================
-- VPS RLS POLICIES SETUP
-- Row Level Security untuk PostgREST dengan Custom Auth
-- ============================================================================

-- ============================================================================
-- 1. AUTH SCHEMA DAN FUNCTIONS
-- PostgREST menggunakan JWT claims yang di-set oleh pre-request function
-- ============================================================================

-- Create auth schema if not exists
CREATE SCHEMA IF NOT EXISTS auth;

-- Function to get user ID from JWT (set by PostgREST from JWT claims)
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
BEGIN
    -- PostgREST sets request.jwt.claim.sub from JWT
    RETURN NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get user role from JWT
CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
BEGIN
    RETURN COALESCE(current_setting('request.jwt.claim.role', true), 'anon');
EXCEPTION WHEN OTHERS THEN
    RETURN 'anon';
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get user email from JWT
CREATE OR REPLACE FUNCTION auth.email() RETURNS TEXT AS $$
BEGIN
    RETURN current_setting('request.jwt.claim.email', true);
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 2. HELPER FUNCTIONS (SECURITY DEFINER to bypass RLS)
-- ============================================================================

-- Get user's branch ID - bypasses RLS
CREATE OR REPLACE FUNCTION public.get_user_branch_id()
RETURNS UUID AS $$
DECLARE
    user_branch UUID;
BEGIN
    SELECT branch_id INTO user_branch
    FROM public.profiles
    WHERE id = auth.uid()
    LIMIT 1;

    RETURN user_branch;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user is super admin, owner, or admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role
    FROM public.profiles
    WHERE id = auth.uid()
    LIMIT 1;

    RETURN user_role IN ('super_admin', 'head_office_admin', 'owner', 'admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role
    FROM public.profiles
    WHERE id = auth.uid()
    LIMIT 1;

    RETURN user_role IN ('admin', 'owner');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user is owner
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role
    FROM public.profiles
    WHERE id = auth.uid()
    LIMIT 1;

    RETURN user_role = 'owner';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user can access a specific branch
CREATE OR REPLACE FUNCTION public.can_access_branch(branch_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
    user_branch UUID;
BEGIN
    -- If no branch specified, allow (for shared data)
    IF branch_uuid IS NULL THEN
        RETURN true;
    END IF;

    SELECT role, branch_id INTO user_role, user_branch
    FROM public.profiles
    WHERE id = auth.uid()
    LIMIT 1;

    -- Super admins, owners, and head office admins can access all branches
    IF user_role IN ('super_admin', 'head_office_admin', 'owner', 'admin') THEN
        RETURN true;
    END IF;

    -- Regular users can only access their own branch
    RETURN user_branch = branch_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================================
-- 3. ENABLE RLS ON ALL TABLES
-- ============================================================================

-- Core tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

-- Transaction tables
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;

-- Purchase & Supplier tables
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts_payable ENABLE ROW LEVEL SECURITY;

-- Employee tables
ALTER TABLE employee_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE advance_repayments ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_salaries ENABLE ROW LEVEL SECURITY;

-- Production tables
ALTER TABLE production_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_stock_movements ENABLE ROW LEVEL SECURITY;

-- Other tables
ALTER TABLE retasi ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_pricings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonus_pricings ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4. DROP EXISTING POLICIES (to avoid conflicts)
-- ============================================================================

DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
            pol.policyname, pol.schemaname, pol.tablename);
    END LOOP;
END $$;

-- ============================================================================
-- 5. CREATE RLS POLICIES
-- ============================================================================

-- -------------------------------------------
-- PROFILES TABLE
-- -------------------------------------------
CREATE POLICY "profiles_select" ON profiles FOR SELECT
    USING (
        is_super_admin()
        OR branch_id = get_user_branch_id()
        OR id = auth.uid()
    );

CREATE POLICY "profiles_insert" ON profiles FOR INSERT
    WITH CHECK (is_admin());

CREATE POLICY "profiles_update" ON profiles FOR UPDATE
    USING (id = auth.uid() OR is_admin());

CREATE POLICY "profiles_delete" ON profiles FOR DELETE
    USING (is_owner());

-- -------------------------------------------
-- BRANCHES TABLE
-- -------------------------------------------
CREATE POLICY "branches_select" ON branches FOR SELECT
    USING (is_super_admin() OR id = get_user_branch_id());

CREATE POLICY "branches_insert" ON branches FOR INSERT
    WITH CHECK (is_owner());

CREATE POLICY "branches_update" ON branches FOR UPDATE
    USING (is_owner());

CREATE POLICY "branches_delete" ON branches FOR DELETE
    USING (is_owner());

-- -------------------------------------------
-- COMPANY_SETTINGS TABLE
-- -------------------------------------------
CREATE POLICY "company_settings_select" ON company_settings FOR SELECT
    USING (true);  -- Everyone can read settings

CREATE POLICY "company_settings_insert" ON company_settings FOR INSERT
    WITH CHECK (is_admin());

CREATE POLICY "company_settings_update" ON company_settings FOR UPDATE
    USING (is_admin());

CREATE POLICY "company_settings_delete" ON company_settings FOR DELETE
    USING (is_owner());

-- -------------------------------------------
-- ACCOUNTS TABLE
-- -------------------------------------------
CREATE POLICY "accounts_select" ON accounts FOR SELECT
    USING (can_access_branch(branch_id) OR branch_id IS NULL);

CREATE POLICY "accounts_insert" ON accounts FOR INSERT
    WITH CHECK (is_admin());

CREATE POLICY "accounts_update" ON accounts FOR UPDATE
    USING (is_admin());

CREATE POLICY "accounts_delete" ON accounts FOR DELETE
    USING (is_owner());

-- -------------------------------------------
-- TRANSACTIONS TABLE
-- -------------------------------------------
CREATE POLICY "transactions_select" ON transactions FOR SELECT
    USING (can_access_branch(branch_id));

CREATE POLICY "transactions_insert" ON transactions FOR INSERT
    WITH CHECK (true);  -- Authenticated users can create

CREATE POLICY "transactions_update" ON transactions FOR UPDATE
    USING (can_access_branch(branch_id));

CREATE POLICY "transactions_delete" ON transactions FOR DELETE
    USING (is_admin());

-- -------------------------------------------
-- CUSTOMERS TABLE
-- -------------------------------------------
CREATE POLICY "customers_select" ON customers FOR SELECT
    USING (can_access_branch(branch_id) OR branch_id IS NULL);

CREATE POLICY "customers_insert" ON customers FOR INSERT
    WITH CHECK (true);

CREATE POLICY "customers_update" ON customers FOR UPDATE
    USING (can_access_branch(branch_id) OR is_admin());

CREATE POLICY "customers_delete" ON customers FOR DELETE
    USING (is_admin());

-- -------------------------------------------
-- PRODUCTS TABLE
-- -------------------------------------------
CREATE POLICY "products_select" ON products FOR SELECT
    USING (can_access_branch(branch_id) OR branch_id IS NULL);

CREATE POLICY "products_insert" ON products FOR INSERT
    WITH CHECK (is_admin());

CREATE POLICY "products_update" ON products FOR UPDATE
    USING (is_admin());

CREATE POLICY "products_delete" ON products FOR DELETE
    USING (is_owner());

-- -------------------------------------------
-- MATERIALS TABLE
-- -------------------------------------------
CREATE POLICY "materials_select" ON materials FOR SELECT
    USING (can_access_branch(branch_id) OR branch_id IS NULL);

CREATE POLICY "materials_insert" ON materials FOR INSERT
    WITH CHECK (is_admin());

CREATE POLICY "materials_update" ON materials FOR UPDATE
    USING (is_admin());

CREATE POLICY "materials_delete" ON materials FOR DELETE
    USING (is_owner());

-- -------------------------------------------
-- SUPPLIERS TABLE
-- -------------------------------------------
CREATE POLICY "suppliers_select" ON suppliers FOR SELECT
    USING (can_access_branch(branch_id) OR branch_id IS NULL);

CREATE POLICY "suppliers_insert" ON suppliers FOR INSERT
    WITH CHECK (is_admin());

CREATE POLICY "suppliers_update" ON suppliers FOR UPDATE
    USING (is_admin());

CREATE POLICY "suppliers_delete" ON suppliers FOR DELETE
    USING (is_owner());

-- -------------------------------------------
-- EXPENSES TABLE
-- -------------------------------------------
CREATE POLICY "expenses_select" ON expenses FOR SELECT
    USING (can_access_branch(branch_id));

CREATE POLICY "expenses_insert" ON expenses FOR INSERT
    WITH CHECK (true);

CREATE POLICY "expenses_update" ON expenses FOR UPDATE
    USING (can_access_branch(branch_id));

CREATE POLICY "expenses_delete" ON expenses FOR DELETE
    USING (is_admin());

-- -------------------------------------------
-- CASH_HISTORY TABLE
-- -------------------------------------------
CREATE POLICY "cash_history_select" ON cash_history FOR SELECT
    USING (can_access_branch(branch_id));

CREATE POLICY "cash_history_insert" ON cash_history FOR INSERT
    WITH CHECK (true);

CREATE POLICY "cash_history_update" ON cash_history FOR UPDATE
    USING (is_admin());

CREATE POLICY "cash_history_delete" ON cash_history FOR DELETE
    USING (is_owner());

-- -------------------------------------------
-- DELIVERIES TABLE
-- -------------------------------------------
CREATE POLICY "deliveries_select" ON deliveries FOR SELECT
    USING (can_access_branch(branch_id));

CREATE POLICY "deliveries_insert" ON deliveries FOR INSERT
    WITH CHECK (true);

CREATE POLICY "deliveries_update" ON deliveries FOR UPDATE
    USING (can_access_branch(branch_id));

CREATE POLICY "deliveries_delete" ON deliveries FOR DELETE
    USING (is_admin());

-- -------------------------------------------
-- DELIVERY_ITEMS TABLE
-- -------------------------------------------
CREATE POLICY "delivery_items_select" ON delivery_items FOR SELECT
    USING (true);

CREATE POLICY "delivery_items_insert" ON delivery_items FOR INSERT
    WITH CHECK (true);

CREATE POLICY "delivery_items_update" ON delivery_items FOR UPDATE
    USING (true);

CREATE POLICY "delivery_items_delete" ON delivery_items FOR DELETE
    USING (is_admin());

-- -------------------------------------------
-- PURCHASE_ORDERS TABLE
-- -------------------------------------------
CREATE POLICY "purchase_orders_select" ON purchase_orders FOR SELECT
    USING (can_access_branch(branch_id));

CREATE POLICY "purchase_orders_insert" ON purchase_orders FOR INSERT
    WITH CHECK (is_admin());

CREATE POLICY "purchase_orders_update" ON purchase_orders FOR UPDATE
    USING (is_admin());

CREATE POLICY "purchase_orders_delete" ON purchase_orders FOR DELETE
    USING (is_owner());

-- -------------------------------------------
-- EMPLOYEE_ADVANCES TABLE
-- -------------------------------------------
CREATE POLICY "employee_advances_select" ON employee_advances FOR SELECT
    USING (can_access_branch(branch_id) OR is_admin());

CREATE POLICY "employee_advances_insert" ON employee_advances FOR INSERT
    WITH CHECK (is_admin());

CREATE POLICY "employee_advances_update" ON employee_advances FOR UPDATE
    USING (is_admin());

CREATE POLICY "employee_advances_delete" ON employee_advances FOR DELETE
    USING (is_owner());

-- -------------------------------------------
-- EMPLOYEE_SALARIES TABLE
-- -------------------------------------------
CREATE POLICY "employee_salaries_select" ON employee_salaries FOR SELECT
    USING (is_admin());

CREATE POLICY "employee_salaries_insert" ON employee_salaries FOR INSERT
    WITH CHECK (is_admin());

CREATE POLICY "employee_salaries_update" ON employee_salaries FOR UPDATE
    USING (is_admin());

CREATE POLICY "employee_salaries_delete" ON employee_salaries FOR DELETE
    USING (is_owner());

-- -------------------------------------------
-- PRODUCTION_RECORDS TABLE
-- -------------------------------------------
CREATE POLICY "production_records_select" ON production_records FOR SELECT
    USING (can_access_branch(branch_id));

CREATE POLICY "production_records_insert" ON production_records FOR INSERT
    WITH CHECK (true);

CREATE POLICY "production_records_update" ON production_records FOR UPDATE
    USING (can_access_branch(branch_id));

CREATE POLICY "production_records_delete" ON production_records FOR DELETE
    USING (is_admin());

-- -------------------------------------------
-- RETASI TABLE
-- -------------------------------------------
CREATE POLICY "retasi_select" ON retasi FOR SELECT
    USING (can_access_branch(branch_id));

CREATE POLICY "retasi_insert" ON retasi FOR INSERT
    WITH CHECK (true);

CREATE POLICY "retasi_update" ON retasi FOR UPDATE
    USING (can_access_branch(branch_id));

CREATE POLICY "retasi_delete" ON retasi FOR DELETE
    USING (is_admin());

-- -------------------------------------------
-- ROLES TABLE
-- -------------------------------------------
CREATE POLICY "roles_select" ON roles FOR SELECT
    USING (true);  -- Everyone can see roles

CREATE POLICY "roles_insert" ON roles FOR INSERT
    WITH CHECK (is_owner());

CREATE POLICY "roles_update" ON roles FOR UPDATE
    USING (is_owner());

CREATE POLICY "roles_delete" ON roles FOR DELETE
    USING (is_owner());

-- -------------------------------------------
-- ROLE_PERMISSIONS TABLE
-- -------------------------------------------
CREATE POLICY "role_permissions_select" ON role_permissions FOR SELECT
    USING (true);

CREATE POLICY "role_permissions_insert" ON role_permissions FOR INSERT
    WITH CHECK (is_owner());

CREATE POLICY "role_permissions_update" ON role_permissions FOR UPDATE
    USING (is_owner());

CREATE POLICY "role_permissions_delete" ON role_permissions FOR DELETE
    USING (is_owner());

-- -------------------------------------------
-- COMMISSION TABLES
-- -------------------------------------------
CREATE POLICY "commission_rules_select" ON commission_rules FOR SELECT
    USING (true);

CREATE POLICY "commission_rules_all" ON commission_rules FOR ALL
    USING (is_admin());

CREATE POLICY "commission_entries_select" ON commission_entries FOR SELECT
    USING (can_access_branch(branch_id));

CREATE POLICY "commission_entries_all" ON commission_entries FOR ALL
    USING (is_admin());

-- -------------------------------------------
-- PRICING TABLES
-- -------------------------------------------
CREATE POLICY "stock_pricings_select" ON stock_pricings FOR SELECT
    USING (true);

CREATE POLICY "stock_pricings_all" ON stock_pricings FOR ALL
    USING (is_admin());

CREATE POLICY "bonus_pricings_select" ON bonus_pricings FOR SELECT
    USING (true);

CREATE POLICY "bonus_pricings_all" ON bonus_pricings FOR ALL
    USING (is_admin());

-- -------------------------------------------
-- OTHER TABLES
-- -------------------------------------------
CREATE POLICY "payment_history_select" ON payment_history FOR SELECT
    USING (can_access_branch(branch_id));

CREATE POLICY "payment_history_all" ON payment_history FOR ALL
    USING (true);

CREATE POLICY "quotations_select" ON quotations FOR SELECT
    USING (can_access_branch(branch_id));

CREATE POLICY "quotations_all" ON quotations FOR ALL
    USING (can_access_branch(branch_id));

CREATE POLICY "accounts_payable_select" ON accounts_payable FOR SELECT
    USING (can_access_branch(branch_id));

CREATE POLICY "accounts_payable_all" ON accounts_payable FOR ALL
    USING (is_admin());

CREATE POLICY "advance_repayments_select" ON advance_repayments FOR SELECT
    USING (is_admin());

CREATE POLICY "advance_repayments_all" ON advance_repayments FOR ALL
    USING (is_admin());

CREATE POLICY "material_stock_movements_select" ON material_stock_movements FOR SELECT
    USING (can_access_branch(branch_id));

CREATE POLICY "material_stock_movements_all" ON material_stock_movements FOR ALL
    USING (true);

-- ============================================================================
-- 6. GRANT PERMISSIONS TO ROLES
-- ============================================================================

-- Grant to authenticated role (for logged in users via JWT)
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO authenticated;

-- Grant to anon role (for public access without JWT)
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- Done!
SELECT 'RLS Policies setup completed!' as status;
