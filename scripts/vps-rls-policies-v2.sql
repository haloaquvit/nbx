-- ============================================================================
-- RLS POLICIES FOR AQUVIT VPS - v2 (Role Management Compatible)
-- Run this on VPS PostgreSQL: psql -U aquavit -d aquavit_db -f vps-rls-policies-v2.sql
-- ============================================================================

-- ============================================================================
-- PART 1: AUTH SCHEMA & HELPER FUNCTIONS
-- ============================================================================

-- Create auth schema if not exists
CREATE SCHEMA IF NOT EXISTS auth;

-- Function to get current user ID from JWT
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID AS $$
DECLARE
    jwt_claims JSON;
    user_id TEXT;
BEGIN
    -- Get JWT claims from request headers
    jwt_claims := current_setting('request.jwt.claims', true)::JSON;

    IF jwt_claims IS NULL THEN
        RETURN NULL;
    END IF;

    -- Try to get user_id from claims
    user_id := jwt_claims->>'user_id';
    IF user_id IS NULL THEN
        user_id := jwt_claims->>'sub';
    END IF;

    IF user_id IS NULL OR user_id = '' THEN
        RETURN NULL;
    END IF;

    RETURN user_id::UUID;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to get current user role from JWT
CREATE OR REPLACE FUNCTION auth.role()
RETURNS TEXT AS $$
DECLARE
    jwt_claims JSON;
    user_role TEXT;
BEGIN
    jwt_claims := current_setting('request.jwt.claims', true)::JSON;

    IF jwt_claims IS NULL THEN
        RETURN 'anon';
    END IF;

    user_role := jwt_claims->>'role';
    IF user_role IS NULL OR user_role = '' THEN
        RETURN 'anon';
    END IF;

    RETURN user_role;
EXCEPTION WHEN OTHERS THEN
    RETURN 'anon';
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to get current user email from JWT
CREATE OR REPLACE FUNCTION auth.email()
RETURNS TEXT AS $$
DECLARE
    jwt_claims JSON;
BEGIN
    jwt_claims := current_setting('request.jwt.claims', true)::JSON;

    IF jwt_claims IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN jwt_claims->>'email';
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- PART 2: ROLE HIERARCHY HELPER FUNCTIONS
-- ============================================================================

-- Get user's branch_id from profiles
CREATE OR REPLACE FUNCTION public.get_user_branch_id()
RETURNS UUID AS $$
DECLARE
    user_branch UUID;
BEGIN
    SELECT branch_id INTO user_branch
    FROM profiles
    WHERE id = auth.uid();

    RETURN user_branch;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Check if user is OWNER level (full access to everything)
-- Roles: owner
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
BEGIN
    user_role := auth.role();
    RETURN user_role = 'owner';
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Check if user is SUPER ADMIN level (system-wide management)
-- Roles: super_admin, head_office_admin, owner
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
BEGIN
    user_role := auth.role();
    RETURN user_role IN ('super_admin', 'head_office_admin', 'owner');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Check if user is ADMIN level (can manage data)
-- Roles: super_admin, head_office_admin, owner, admin, branch_admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
BEGIN
    user_role := auth.role();
    RETURN user_role IN ('super_admin', 'head_office_admin', 'owner', 'admin', 'branch_admin');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Check if user is SUPERVISOR level (can supervise operations)
-- Roles: super_admin, head_office_admin, owner, admin, branch_admin, supervisor
CREATE OR REPLACE FUNCTION public.is_supervisor()
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
BEGIN
    user_role := auth.role();
    RETURN user_role IN ('super_admin', 'head_office_admin', 'owner', 'admin', 'branch_admin', 'supervisor');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Check if user is STAFF level (operational roles that can access/create data)
-- Roles: all except anon
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
BEGIN
    user_role := auth.role();
    RETURN user_role IN (
        'super_admin', 'head_office_admin', 'owner',
        'admin', 'branch_admin', 'supervisor',
        'cashier', 'operator', 'designer', 'ceo', 'me', 'user'
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Check if user can access a specific branch
-- Owner/Super Admin can access all, others only their branch
CREATE OR REPLACE FUNCTION public.can_access_branch(target_branch_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
    user_branch UUID;
BEGIN
    user_role := auth.role();

    -- Owner and super admins can access all branches
    IF user_role IN ('super_admin', 'head_office_admin', 'owner') THEN
        RETURN true;
    END IF;

    -- Others can only access their own branch
    user_branch := get_user_branch_id();

    -- If no branch filter, allow (for backward compatibility)
    IF target_branch_id IS NULL THEN
        RETURN true;
    END IF;

    RETURN user_branch = target_branch_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Check if user can manage a specific branch (admin functions)
CREATE OR REPLACE FUNCTION public.can_manage_branch(target_branch_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
    user_branch UUID;
BEGIN
    user_role := auth.role();

    -- Owner and super admins can manage all branches
    IF user_role IN ('super_admin', 'head_office_admin', 'owner') THEN
        RETURN true;
    END IF;

    -- Branch admin can only manage their own branch
    IF user_role = 'branch_admin' THEN
        user_branch := get_user_branch_id();
        RETURN user_branch = target_branch_id;
    END IF;

    -- Admin can manage (for backward compatibility)
    IF user_role = 'admin' THEN
        RETURN true;
    END IF;

    RETURN false;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- PART 3: ENABLE RLS ON ALL TABLES
-- ============================================================================

-- Core Tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Product & Inventory
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_unit_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_opname ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_opname_items ENABLE ROW LEVEL SECURITY;

-- Customers & Sales
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_items ENABLE ROW LEVEL SECURITY;

-- Receivables & Payables
ALTER TABLE receivables ENABLE ROW LEVEL SECURITY;
ALTER TABLE receivable_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payables ENABLE ROW LEVEL SECURITY;
ALTER TABLE payable_payments ENABLE ROW LEVEL SECURITY;

-- Purchase Orders
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

-- Production
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_materials ENABLE ROW LEVEL SECURITY;

-- Delivery
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_crew ENABLE ROW LEVEL SECURITY;

-- Accounting
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entry_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_cash_summary ENABLE ROW LEVEL SECURITY;

-- Payroll & Commissions
ALTER TABLE payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_salary_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_commissions ENABLE ROW LEVEL SECURITY;

-- Settings & Others
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 4: CREATE RLS POLICIES
-- ============================================================================

-- Drop existing policies first (prevent duplicates)
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname, tablename
        FROM pg_policies
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

-- ============================================================================
-- PROFILES TABLE
-- ============================================================================
-- Staff can view all profiles (for dropdowns, etc)
CREATE POLICY "Staff can view profiles"
    ON profiles FOR SELECT
    USING (is_staff());

-- User can update own profile
CREATE POLICY "User can update own profile"
    ON profiles FOR UPDATE
    USING (id = auth.uid());

-- Admin can manage profiles
CREATE POLICY "Admin can insert profiles"
    ON profiles FOR INSERT
    WITH CHECK (is_admin());

CREATE POLICY "Admin can update profiles"
    ON profiles FOR UPDATE
    USING (is_admin());

CREATE POLICY "Owner can delete profiles"
    ON profiles FOR DELETE
    USING (is_owner());

-- ============================================================================
-- COMPANIES TABLE
-- ============================================================================
CREATE POLICY "Staff can view companies"
    ON companies FOR SELECT
    USING (is_staff());

CREATE POLICY "Owner can manage companies"
    ON companies FOR ALL
    USING (is_owner());

-- ============================================================================
-- BRANCHES TABLE
-- ============================================================================
-- Staff can view branches they have access to
CREATE POLICY "Staff can view accessible branches"
    ON branches FOR SELECT
    USING (is_super_admin() OR id = get_user_branch_id());

CREATE POLICY "Owner can manage branches"
    ON branches FOR ALL
    USING (is_owner());

-- ============================================================================
-- ROLES TABLE
-- ============================================================================
CREATE POLICY "Staff can view roles"
    ON roles FOR SELECT
    USING (is_staff());

CREATE POLICY "Super admin can manage roles"
    ON roles FOR ALL
    USING (is_super_admin());

-- ============================================================================
-- USER_ROLES TABLE
-- ============================================================================
CREATE POLICY "Admin can view user_roles"
    ON user_roles FOR SELECT
    USING (is_admin());

CREATE POLICY "Super admin can manage user_roles"
    ON user_roles FOR ALL
    USING (is_super_admin());

-- ============================================================================
-- PRODUCTS TABLE
-- ============================================================================
-- All staff can view products
CREATE POLICY "Staff can view products"
    ON products FOR SELECT
    USING (is_staff());

-- Admin can manage products
CREATE POLICY "Admin can insert products"
    ON products FOR INSERT
    WITH CHECK (is_admin());

CREATE POLICY "Admin can update products"
    ON products FOR UPDATE
    USING (is_admin());

CREATE POLICY "Owner can delete products"
    ON products FOR DELETE
    USING (is_owner());

-- ============================================================================
-- MATERIALS TABLE
-- ============================================================================
CREATE POLICY "Staff can view materials"
    ON materials FOR SELECT
    USING (is_staff());

CREATE POLICY "Admin can manage materials"
    ON materials FOR INSERT
    WITH CHECK (is_admin());

CREATE POLICY "Admin can update materials"
    ON materials FOR UPDATE
    USING (is_admin());

CREATE POLICY "Owner can delete materials"
    ON materials FOR DELETE
    USING (is_owner());

-- ============================================================================
-- PRODUCT_MATERIALS TABLE
-- ============================================================================
CREATE POLICY "Staff can view product_materials"
    ON product_materials FOR SELECT
    USING (is_staff());

CREATE POLICY "Admin can manage product_materials"
    ON product_materials FOR ALL
    USING (is_admin());

-- ============================================================================
-- PRODUCT_UNIT_PRICES TABLE
-- ============================================================================
CREATE POLICY "Staff can view product_unit_prices"
    ON product_unit_prices FOR SELECT
    USING (is_staff());

CREATE POLICY "Admin can manage product_unit_prices"
    ON product_unit_prices FOR ALL
    USING (is_admin());

-- ============================================================================
-- STOCK TABLE (Branch-based)
-- ============================================================================
CREATE POLICY "Staff can view stock in their branch"
    ON stock FOR SELECT
    USING (can_access_branch(branch_id));

CREATE POLICY "Staff can insert stock"
    ON stock FOR INSERT
    WITH CHECK (is_staff() AND can_access_branch(branch_id));

CREATE POLICY "Staff can update stock"
    ON stock FOR UPDATE
    USING (is_staff() AND can_access_branch(branch_id));

CREATE POLICY "Admin can delete stock"
    ON stock FOR DELETE
    USING (is_admin());

-- ============================================================================
-- STOCK_MOVEMENTS TABLE
-- ============================================================================
CREATE POLICY "Staff can view stock_movements"
    ON stock_movements FOR SELECT
    USING (can_access_branch(branch_id));

CREATE POLICY "Staff can insert stock_movements"
    ON stock_movements FOR INSERT
    WITH CHECK (is_staff());

CREATE POLICY "Admin can manage stock_movements"
    ON stock_movements FOR ALL
    USING (is_admin());

-- ============================================================================
-- STOCK_OPNAME & ITEMS
-- ============================================================================
CREATE POLICY "Staff can view stock_opname"
    ON stock_opname FOR SELECT
    USING (can_access_branch(branch_id));

CREATE POLICY "Supervisor can manage stock_opname"
    ON stock_opname FOR ALL
    USING (is_supervisor());

CREATE POLICY "Staff can view stock_opname_items"
    ON stock_opname_items FOR SELECT
    USING (is_staff());

CREATE POLICY "Supervisor can manage stock_opname_items"
    ON stock_opname_items FOR ALL
    USING (is_supervisor());

-- ============================================================================
-- CUSTOMERS TABLE
-- ============================================================================
CREATE POLICY "Staff can view customers"
    ON customers FOR SELECT
    USING (is_staff());

CREATE POLICY "Staff can insert customers"
    ON customers FOR INSERT
    WITH CHECK (is_staff());

CREATE POLICY "Staff can update customers"
    ON customers FOR UPDATE
    USING (is_staff());

CREATE POLICY "Admin can delete customers"
    ON customers FOR DELETE
    USING (is_admin());

-- ============================================================================
-- CUSTOMER_ADDRESSES TABLE
-- ============================================================================
CREATE POLICY "Staff can view customer_addresses"
    ON customer_addresses FOR SELECT
    USING (is_staff());

CREATE POLICY "Staff can manage customer_addresses"
    ON customer_addresses FOR ALL
    USING (is_staff());

-- ============================================================================
-- TRANSACTIONS TABLE (Branch-based)
-- ============================================================================
CREATE POLICY "Staff can view transactions in their branch"
    ON transactions FOR SELECT
    USING (can_access_branch(branch_id));

-- Cashier can create transactions
CREATE POLICY "Staff can insert transactions"
    ON transactions FOR INSERT
    WITH CHECK (is_staff() AND can_access_branch(branch_id));

CREATE POLICY "Staff can update transactions"
    ON transactions FOR UPDATE
    USING (is_staff() AND can_access_branch(branch_id));

CREATE POLICY "Admin can delete transactions"
    ON transactions FOR DELETE
    USING (is_admin());

-- ============================================================================
-- TRANSACTION_ITEMS TABLE
-- ============================================================================
CREATE POLICY "Staff can view transaction_items"
    ON transaction_items FOR SELECT
    USING (is_staff());

CREATE POLICY "Staff can manage transaction_items"
    ON transaction_items FOR ALL
    USING (is_staff());

-- ============================================================================
-- TRANSACTION_PAYMENTS TABLE
-- ============================================================================
CREATE POLICY "Staff can view transaction_payments"
    ON transaction_payments FOR SELECT
    USING (is_staff());

CREATE POLICY "Staff can manage transaction_payments"
    ON transaction_payments FOR ALL
    USING (is_staff());

-- ============================================================================
-- QUOTATIONS TABLE (Branch-based)
-- ============================================================================
CREATE POLICY "Staff can view quotations"
    ON quotations FOR SELECT
    USING (can_access_branch(branch_id));

CREATE POLICY "Staff can manage quotations"
    ON quotations FOR ALL
    USING (is_staff());

-- ============================================================================
-- QUOTATION_ITEMS TABLE
-- ============================================================================
CREATE POLICY "Staff can view quotation_items"
    ON quotation_items FOR SELECT
    USING (is_staff());

CREATE POLICY "Staff can manage quotation_items"
    ON quotation_items FOR ALL
    USING (is_staff());

-- ============================================================================
-- RECEIVABLES TABLE (Branch-based)
-- ============================================================================
CREATE POLICY "Staff can view receivables"
    ON receivables FOR SELECT
    USING (can_access_branch(branch_id));

CREATE POLICY "Staff can manage receivables"
    ON receivables FOR ALL
    USING (is_staff());

-- ============================================================================
-- RECEIVABLE_PAYMENTS TABLE
-- ============================================================================
CREATE POLICY "Staff can view receivable_payments"
    ON receivable_payments FOR SELECT
    USING (is_staff());

CREATE POLICY "Staff can manage receivable_payments"
    ON receivable_payments FOR ALL
    USING (is_staff());

-- ============================================================================
-- PAYABLES TABLE
-- ============================================================================
CREATE POLICY "Staff can view payables"
    ON payables FOR SELECT
    USING (is_staff());

CREATE POLICY "Admin can manage payables"
    ON payables FOR ALL
    USING (is_admin());

-- ============================================================================
-- PAYABLE_PAYMENTS TABLE
-- ============================================================================
CREATE POLICY "Staff can view payable_payments"
    ON payable_payments FOR SELECT
    USING (is_staff());

CREATE POLICY "Admin can manage payable_payments"
    ON payable_payments FOR ALL
    USING (is_admin());

-- ============================================================================
-- PURCHASE_ORDERS TABLE
-- ============================================================================
CREATE POLICY "Staff can view purchase_orders"
    ON purchase_orders FOR SELECT
    USING (is_staff());

CREATE POLICY "Admin can manage purchase_orders"
    ON purchase_orders FOR ALL
    USING (is_admin());

-- ============================================================================
-- PURCHASE_ORDER_ITEMS TABLE
-- ============================================================================
CREATE POLICY "Staff can view purchase_order_items"
    ON purchase_order_items FOR SELECT
    USING (is_staff());

CREATE POLICY "Admin can manage purchase_order_items"
    ON purchase_order_items FOR ALL
    USING (is_admin());

-- ============================================================================
-- SUPPLIERS TABLE
-- ============================================================================
CREATE POLICY "Staff can view suppliers"
    ON suppliers FOR SELECT
    USING (is_staff());

CREATE POLICY "Admin can manage suppliers"
    ON suppliers FOR ALL
    USING (is_admin());

-- ============================================================================
-- WORK_ORDERS TABLE (Branch-based)
-- ============================================================================
CREATE POLICY "Staff can view work_orders"
    ON work_orders FOR SELECT
    USING (can_access_branch(branch_id));

CREATE POLICY "Operator can insert work_orders"
    ON work_orders FOR INSERT
    WITH CHECK (is_staff());

CREATE POLICY "Operator can update work_orders"
    ON work_orders FOR UPDATE
    USING (is_staff());

CREATE POLICY "Admin can delete work_orders"
    ON work_orders FOR DELETE
    USING (is_admin());

-- ============================================================================
-- WORK_ORDER_ITEMS TABLE
-- ============================================================================
CREATE POLICY "Staff can view work_order_items"
    ON work_order_items FOR SELECT
    USING (is_staff());

CREATE POLICY "Staff can manage work_order_items"
    ON work_order_items FOR ALL
    USING (is_staff());

-- ============================================================================
-- WORK_ORDER_MATERIALS TABLE
-- ============================================================================
CREATE POLICY "Staff can view work_order_materials"
    ON work_order_materials FOR SELECT
    USING (is_staff());

CREATE POLICY "Staff can manage work_order_materials"
    ON work_order_materials FOR ALL
    USING (is_staff());

-- ============================================================================
-- DELIVERIES TABLE (Branch-based)
-- ============================================================================
CREATE POLICY "Staff can view deliveries"
    ON deliveries FOR SELECT
    USING (can_access_branch(branch_id));

CREATE POLICY "Staff can manage deliveries"
    ON deliveries FOR ALL
    USING (is_staff());

-- ============================================================================
-- DELIVERY_ITEMS TABLE
-- ============================================================================
CREATE POLICY "Staff can view delivery_items"
    ON delivery_items FOR SELECT
    USING (is_staff());

CREATE POLICY "Staff can manage delivery_items"
    ON delivery_items FOR ALL
    USING (is_staff());

-- ============================================================================
-- DELIVERY_CREW TABLE
-- ============================================================================
CREATE POLICY "Staff can view delivery_crew"
    ON delivery_crew FOR SELECT
    USING (is_staff());

CREATE POLICY "Staff can manage delivery_crew"
    ON delivery_crew FOR ALL
    USING (is_staff());

-- ============================================================================
-- ACCOUNTS TABLE (Chart of Accounts)
-- ============================================================================
CREATE POLICY "Staff can view accounts"
    ON accounts FOR SELECT
    USING (is_staff());

CREATE POLICY "Admin can manage accounts"
    ON accounts FOR ALL
    USING (is_admin());

-- ============================================================================
-- JOURNAL_ENTRIES TABLE (Branch-based)
-- ============================================================================
CREATE POLICY "Staff can view journal_entries"
    ON journal_entries FOR SELECT
    USING (can_access_branch(branch_id));

CREATE POLICY "Staff can manage journal_entries"
    ON journal_entries FOR ALL
    USING (is_staff());

-- ============================================================================
-- JOURNAL_ENTRY_LINES TABLE
-- ============================================================================
CREATE POLICY "Staff can view journal_entry_lines"
    ON journal_entry_lines FOR SELECT
    USING (is_staff());

CREATE POLICY "Staff can manage journal_entry_lines"
    ON journal_entry_lines FOR ALL
    USING (is_staff());

-- ============================================================================
-- DAILY_CASH_SUMMARY TABLE (Branch-based)
-- ============================================================================
CREATE POLICY "Staff can view daily_cash_summary"
    ON daily_cash_summary FOR SELECT
    USING (can_access_branch(branch_id));

CREATE POLICY "Staff can manage daily_cash_summary"
    ON daily_cash_summary FOR ALL
    USING (is_staff());

-- ============================================================================
-- PAYROLL TABLE
-- ============================================================================
CREATE POLICY "Admin can view payroll"
    ON payroll FOR SELECT
    USING (is_admin());

CREATE POLICY "Owner can manage payroll"
    ON payroll FOR ALL
    USING (is_owner());

-- ============================================================================
-- PAYROLL_ITEMS TABLE
-- ============================================================================
CREATE POLICY "Admin can view payroll_items"
    ON payroll_items FOR SELECT
    USING (is_admin());

CREATE POLICY "Owner can manage payroll_items"
    ON payroll_items FOR ALL
    USING (is_owner());

-- ============================================================================
-- EMPLOYEE_SALARY_CONFIGS TABLE
-- ============================================================================
CREATE POLICY "Admin can view employee_salary_configs"
    ON employee_salary_configs FOR SELECT
    USING (is_admin());

CREATE POLICY "Owner can manage employee_salary_configs"
    ON employee_salary_configs FOR ALL
    USING (is_owner());

-- ============================================================================
-- COMMISSION_SETTINGS TABLE
-- ============================================================================
CREATE POLICY "Admin can view commission_settings"
    ON commission_settings FOR SELECT
    USING (is_admin());

CREATE POLICY "Owner can manage commission_settings"
    ON commission_settings FOR ALL
    USING (is_owner());

-- ============================================================================
-- COMMISSIONS TABLE
-- ============================================================================
CREATE POLICY "Staff can view own commissions"
    ON commissions FOR SELECT
    USING (employee_id = auth.uid() OR is_admin());

CREATE POLICY "Admin can manage commissions"
    ON commissions FOR ALL
    USING (is_admin());

-- ============================================================================
-- SALES_COMMISSIONS TABLE
-- ============================================================================
CREATE POLICY "Staff can view own sales_commissions"
    ON sales_commissions FOR SELECT
    USING (employee_id = auth.uid() OR is_admin());

CREATE POLICY "Admin can manage sales_commissions"
    ON sales_commissions FOR ALL
    USING (is_admin());

-- ============================================================================
-- SETTINGS TABLE
-- ============================================================================
CREATE POLICY "Staff can view settings"
    ON settings FOR SELECT
    USING (is_staff());

CREATE POLICY "Admin can manage settings"
    ON settings FOR ALL
    USING (is_admin());

-- ============================================================================
-- NOTIFICATIONS TABLE
-- ============================================================================
-- User can view own notifications
CREATE POLICY "User can view own notifications"
    ON notifications FOR SELECT
    USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "Staff can manage notifications"
    ON notifications FOR ALL
    USING (is_staff());

-- ============================================================================
-- PART 5: GRANT PERMISSIONS TO ROLES
-- ============================================================================

-- Grant schema usage
GRANT USAGE ON SCHEMA public TO anon, authenticated, aquavit;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, aquavit;

-- Grant function execution
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, aquavit;
GRANT EXECUTE ON FUNCTION auth.role() TO anon, authenticated, aquavit;
GRANT EXECUTE ON FUNCTION auth.email() TO anon, authenticated, aquavit;
GRANT EXECUTE ON FUNCTION public.get_user_branch_id() TO anon, authenticated, aquavit;
GRANT EXECUTE ON FUNCTION public.is_owner() TO anon, authenticated, aquavit;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO anon, authenticated, aquavit;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, aquavit;
GRANT EXECUTE ON FUNCTION public.is_supervisor() TO anon, authenticated, aquavit;
GRANT EXECUTE ON FUNCTION public.is_staff() TO anon, authenticated, aquavit;
GRANT EXECUTE ON FUNCTION public.can_access_branch(UUID) TO anon, authenticated, aquavit;
GRANT EXECUTE ON FUNCTION public.can_manage_branch(UUID) TO anon, authenticated, aquavit;

-- Grant table permissions (RLS will filter access)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, aquavit;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- Grant sequence permissions
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, aquavit;

-- ============================================================================
-- SUMMARY
-- ============================================================================
SELECT 'RLS Policies v2 Applied Successfully!' as status;
SELECT 'Role Hierarchy:' as info;
SELECT '  1. owner - Full access to everything' as level1;
SELECT '  2. super_admin, head_office_admin - System-wide management' as level2;
SELECT '  3. admin, branch_admin - Data management' as level3;
SELECT '  4. supervisor - Supervise operations' as level4;
SELECT '  5. cashier, operator, designer, ceo - Operational access' as level5;
