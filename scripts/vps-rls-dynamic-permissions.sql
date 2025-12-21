-- ============================================================================
-- DYNAMIC PERMISSION-BASED RLS FOR AQUVIT VPS
-- RLS berdasarkan tabel role_permissions - otomatis untuk role baru
-- Run: psql -U aquavit -d aquavit_db -f vps-rls-dynamic-permissions.sql
-- ============================================================================

-- ============================================================================
-- PART 1: AUTH SCHEMA & HELPER FUNCTIONS
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS auth;

-- Get current user ID from JWT
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID AS $$
DECLARE
    jwt_claims JSON;
    user_id TEXT;
BEGIN
    jwt_claims := current_setting('request.jwt.claims', true)::JSON;
    IF jwt_claims IS NULL THEN RETURN NULL; END IF;

    user_id := jwt_claims->>'user_id';
    IF user_id IS NULL THEN user_id := jwt_claims->>'sub'; END IF;
    IF user_id IS NULL OR user_id = '' THEN RETURN NULL; END IF;

    RETURN user_id::UUID;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Get current user role from JWT
CREATE OR REPLACE FUNCTION auth.role()
RETURNS TEXT AS $$
DECLARE
    jwt_claims JSON;
BEGIN
    jwt_claims := current_setting('request.jwt.claims', true)::JSON;
    IF jwt_claims IS NULL THEN RETURN 'anon'; END IF;
    RETURN COALESCE(jwt_claims->>'role', 'anon');
EXCEPTION WHEN OTHERS THEN
    RETURN 'anon';
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Get current user email from JWT
CREATE OR REPLACE FUNCTION auth.email()
RETURNS TEXT AS $$
DECLARE
    jwt_claims JSON;
BEGIN
    jwt_claims := current_setting('request.jwt.claims', true)::JSON;
    IF jwt_claims IS NULL THEN RETURN NULL; END IF;
    RETURN jwt_claims->>'email';
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- PART 2: DYNAMIC PERMISSION HELPER FUNCTIONS
-- ============================================================================

-- Get user's branch_id
CREATE OR REPLACE FUNCTION public.get_user_branch_id()
RETURNS UUID AS $$
BEGIN
    RETURN (SELECT branch_id FROM profiles WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Check if user has a specific permission from role_permissions table
CREATE OR REPLACE FUNCTION public.has_permission(permission_name TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
    permissions JSONB;
BEGIN
    user_role := auth.role();

    -- Anon has no permissions
    IF user_role IS NULL OR user_role = 'anon' THEN
        RETURN false;
    END IF;

    -- Get permissions from role_permissions table
    SELECT rp.permissions INTO permissions
    FROM role_permissions rp
    WHERE rp.role_id = user_role;

    -- If role not found in role_permissions, fallback to roles table
    IF permissions IS NULL THEN
        SELECT r.permissions INTO permissions
        FROM roles r
        WHERE r.name = user_role AND r.is_active = true;
    END IF;

    -- No permissions found
    IF permissions IS NULL THEN
        RETURN false;
    END IF;

    -- Check "all" permission (owner-level access)
    IF (permissions->>'all')::boolean = true THEN
        RETURN true;
    END IF;

    -- Check specific permission
    RETURN COALESCE((permissions->>permission_name)::boolean, false);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Check if user is authenticated (any role except anon)
CREATE OR REPLACE FUNCTION public.is_authenticated()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN auth.uid() IS NOT NULL AND auth.role() != 'anon';
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Check if user can access a specific branch
CREATE OR REPLACE FUNCTION public.can_access_branch(target_branch_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_branch UUID;
BEGIN
    -- Users with role_management can access all branches
    IF has_permission('role_management') THEN
        RETURN true;
    END IF;

    -- If no target branch specified, allow
    IF target_branch_id IS NULL THEN
        RETURN true;
    END IF;

    -- Check if user's branch matches
    user_branch := get_user_branch_id();
    RETURN user_branch IS NULL OR user_branch = target_branch_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- PART 3: PERMISSION MAPPING FUNCTIONS
-- Maps table operations to role_permissions keys
-- ============================================================================

-- Products permissions
CREATE OR REPLACE FUNCTION public.can_view_products() RETURNS BOOLEAN AS $$
BEGIN RETURN has_permission('products_view'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.can_create_products() RETURNS BOOLEAN AS $$
BEGIN RETURN has_permission('products_create'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.can_edit_products() RETURNS BOOLEAN AS $$
BEGIN RETURN has_permission('products_edit'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.can_delete_products() RETURNS BOOLEAN AS $$
BEGIN RETURN has_permission('products_delete'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Materials permissions
CREATE OR REPLACE FUNCTION public.can_view_materials() RETURNS BOOLEAN AS $$
BEGIN RETURN has_permission('materials_view'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.can_create_materials() RETURNS BOOLEAN AS $$
BEGIN RETURN has_permission('materials_create'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.can_edit_materials() RETURNS BOOLEAN AS $$
BEGIN RETURN has_permission('materials_edit'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.can_delete_materials() RETURNS BOOLEAN AS $$
BEGIN RETURN has_permission('materials_delete'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Transactions permissions
CREATE OR REPLACE FUNCTION public.can_view_transactions() RETURNS BOOLEAN AS $$
BEGIN RETURN has_permission('transactions_view'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.can_create_transactions() RETURNS BOOLEAN AS $$
BEGIN RETURN has_permission('transactions_create'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.can_edit_transactions() RETURNS BOOLEAN AS $$
BEGIN RETURN has_permission('transactions_edit'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.can_delete_transactions() RETURNS BOOLEAN AS $$
BEGIN RETURN has_permission('transactions_delete'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Quotations permissions
CREATE OR REPLACE FUNCTION public.can_view_quotations() RETURNS BOOLEAN AS $$
BEGIN RETURN has_permission('quotations_view'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.can_create_quotations() RETURNS BOOLEAN AS $$
BEGIN RETURN has_permission('quotations_create'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.can_edit_quotations() RETURNS BOOLEAN AS $$
BEGIN RETURN has_permission('quotations_edit'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Customers permissions
CREATE OR REPLACE FUNCTION public.can_view_customers() RETURNS BOOLEAN AS $$
BEGIN RETURN has_permission('customers_view'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.can_create_customers() RETURNS BOOLEAN AS $$
BEGIN RETURN has_permission('customers_create'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.can_edit_customers() RETURNS BOOLEAN AS $$
BEGIN RETURN has_permission('customers_edit'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.can_delete_customers() RETURNS BOOLEAN AS $$
BEGIN RETURN has_permission('customers_delete'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Employees permissions
CREATE OR REPLACE FUNCTION public.can_view_employees() RETURNS BOOLEAN AS $$
BEGIN RETURN has_permission('employees_view'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.can_create_employees() RETURNS BOOLEAN AS $$
BEGIN RETURN has_permission('employees_create'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.can_edit_employees() RETURNS BOOLEAN AS $$
BEGIN RETURN has_permission('employees_edit'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.can_delete_employees() RETURNS BOOLEAN AS $$
BEGIN RETURN has_permission('employees_delete'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Accounts permissions
CREATE OR REPLACE FUNCTION public.can_view_accounts() RETURNS BOOLEAN AS $$
BEGIN RETURN has_permission('accounts_view'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.can_create_accounts() RETURNS BOOLEAN AS $$
BEGIN RETURN has_permission('accounts_create'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.can_edit_accounts() RETURNS BOOLEAN AS $$
BEGIN RETURN has_permission('accounts_edit'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Financial/reporting permissions
CREATE OR REPLACE FUNCTION public.can_view_receivables() RETURNS BOOLEAN AS $$
BEGIN RETURN has_permission('receivables_view'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.can_view_expenses() RETURNS BOOLEAN AS $$
BEGIN RETURN has_permission('expenses_view'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.can_create_expenses() RETURNS BOOLEAN AS $$
BEGIN RETURN has_permission('expenses_create'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.can_view_advances() RETURNS BOOLEAN AS $$
BEGIN RETURN has_permission('advances_view'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.can_create_advances() RETURNS BOOLEAN AS $$
BEGIN RETURN has_permission('advances_create'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.can_view_financial_reports() RETURNS BOOLEAN AS $$
BEGIN RETURN has_permission('financial_reports'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.can_view_stock_reports() RETURNS BOOLEAN AS $$
BEGIN RETURN has_permission('stock_reports'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Settings & management permissions
CREATE OR REPLACE FUNCTION public.can_access_settings() RETURNS BOOLEAN AS $$
BEGIN RETURN has_permission('settings_access'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.can_manage_roles() RETURNS BOOLEAN AS $$
BEGIN RETURN has_permission('role_management'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- POS access
CREATE OR REPLACE FUNCTION public.can_access_pos() RETURNS BOOLEAN AS $$
BEGIN RETURN has_permission('pos_access'); END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- PART 4: ENABLE RLS ON ALL TABLES
-- ============================================================================

-- Core Tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

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
-- PART 5: DROP EXISTING POLICIES
-- ============================================================================
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
-- PART 6: CREATE RLS POLICIES (Dynamic Permission-based)
-- ============================================================================

-- PROFILES TABLE
CREATE POLICY "profiles_select" ON profiles FOR SELECT
    USING (is_authenticated() AND (can_view_employees() OR id = auth.uid()));
CREATE POLICY "profiles_insert" ON profiles FOR INSERT
    WITH CHECK (can_create_employees());
CREATE POLICY "profiles_update" ON profiles FOR UPDATE
    USING (id = auth.uid() OR can_edit_employees());
CREATE POLICY "profiles_delete" ON profiles FOR DELETE
    USING (can_delete_employees());

-- COMPANIES TABLE
CREATE POLICY "companies_select" ON companies FOR SELECT
    USING (is_authenticated());
CREATE POLICY "companies_all" ON companies FOR ALL
    USING (can_manage_roles());

-- BRANCHES TABLE
CREATE POLICY "branches_select" ON branches FOR SELECT
    USING (is_authenticated() AND can_access_branch(id));
CREATE POLICY "branches_all" ON branches FOR ALL
    USING (can_manage_roles());

-- ROLES TABLE
CREATE POLICY "roles_select" ON roles FOR SELECT
    USING (is_authenticated());
CREATE POLICY "roles_all" ON roles FOR ALL
    USING (can_manage_roles());

-- ROLE_PERMISSIONS TABLE
CREATE POLICY "role_permissions_select" ON role_permissions FOR SELECT
    USING (is_authenticated());
CREATE POLICY "role_permissions_all" ON role_permissions FOR ALL
    USING (can_manage_roles());

-- PRODUCTS TABLE
CREATE POLICY "products_select" ON products FOR SELECT
    USING (can_view_products());
CREATE POLICY "products_insert" ON products FOR INSERT
    WITH CHECK (can_create_products());
CREATE POLICY "products_update" ON products FOR UPDATE
    USING (can_edit_products());
CREATE POLICY "products_delete" ON products FOR DELETE
    USING (can_delete_products());

-- MATERIALS TABLE
CREATE POLICY "materials_select" ON materials FOR SELECT
    USING (can_view_materials());
CREATE POLICY "materials_insert" ON materials FOR INSERT
    WITH CHECK (can_create_materials());
CREATE POLICY "materials_update" ON materials FOR UPDATE
    USING (can_edit_materials());
CREATE POLICY "materials_delete" ON materials FOR DELETE
    USING (can_delete_materials());

-- PRODUCT_MATERIALS TABLE
CREATE POLICY "product_materials_select" ON product_materials FOR SELECT
    USING (can_view_products());
CREATE POLICY "product_materials_all" ON product_materials FOR ALL
    USING (can_edit_products());

-- PRODUCT_UNIT_PRICES TABLE
CREATE POLICY "product_unit_prices_select" ON product_unit_prices FOR SELECT
    USING (can_view_products());
CREATE POLICY "product_unit_prices_all" ON product_unit_prices FOR ALL
    USING (can_edit_products());

-- STOCK TABLE (Branch-based)
CREATE POLICY "stock_select" ON stock FOR SELECT
    USING (can_view_products() AND can_access_branch(branch_id));
CREATE POLICY "stock_insert" ON stock FOR INSERT
    WITH CHECK (can_create_products() AND can_access_branch(branch_id));
CREATE POLICY "stock_update" ON stock FOR UPDATE
    USING (can_edit_products() AND can_access_branch(branch_id));
CREATE POLICY "stock_delete" ON stock FOR DELETE
    USING (can_delete_products());

-- STOCK_MOVEMENTS TABLE
CREATE POLICY "stock_movements_select" ON stock_movements FOR SELECT
    USING (can_view_stock_reports() AND can_access_branch(branch_id));
CREATE POLICY "stock_movements_insert" ON stock_movements FOR INSERT
    WITH CHECK (is_authenticated());
CREATE POLICY "stock_movements_all" ON stock_movements FOR ALL
    USING (can_access_settings());

-- STOCK_OPNAME TABLE
CREATE POLICY "stock_opname_select" ON stock_opname FOR SELECT
    USING (can_view_stock_reports() AND can_access_branch(branch_id));
CREATE POLICY "stock_opname_all" ON stock_opname FOR ALL
    USING (can_access_settings());

-- STOCK_OPNAME_ITEMS TABLE
CREATE POLICY "stock_opname_items_select" ON stock_opname_items FOR SELECT
    USING (can_view_stock_reports());
CREATE POLICY "stock_opname_items_all" ON stock_opname_items FOR ALL
    USING (can_access_settings());

-- CUSTOMERS TABLE
CREATE POLICY "customers_select" ON customers FOR SELECT
    USING (can_view_customers());
CREATE POLICY "customers_insert" ON customers FOR INSERT
    WITH CHECK (can_create_customers());
CREATE POLICY "customers_update" ON customers FOR UPDATE
    USING (can_edit_customers());
CREATE POLICY "customers_delete" ON customers FOR DELETE
    USING (can_delete_customers());

-- CUSTOMER_ADDRESSES TABLE
CREATE POLICY "customer_addresses_select" ON customer_addresses FOR SELECT
    USING (can_view_customers());
CREATE POLICY "customer_addresses_all" ON customer_addresses FOR ALL
    USING (can_edit_customers());

-- TRANSACTIONS TABLE (Branch-based)
CREATE POLICY "transactions_select" ON transactions FOR SELECT
    USING (can_view_transactions() AND can_access_branch(branch_id));
CREATE POLICY "transactions_insert" ON transactions FOR INSERT
    WITH CHECK (can_create_transactions() AND can_access_branch(branch_id));
CREATE POLICY "transactions_update" ON transactions FOR UPDATE
    USING (can_edit_transactions() AND can_access_branch(branch_id));
CREATE POLICY "transactions_delete" ON transactions FOR DELETE
    USING (can_delete_transactions());

-- TRANSACTION_ITEMS TABLE
CREATE POLICY "transaction_items_select" ON transaction_items FOR SELECT
    USING (can_view_transactions());
CREATE POLICY "transaction_items_all" ON transaction_items FOR ALL
    USING (can_create_transactions());

-- TRANSACTION_PAYMENTS TABLE
CREATE POLICY "transaction_payments_select" ON transaction_payments FOR SELECT
    USING (can_view_transactions());
CREATE POLICY "transaction_payments_all" ON transaction_payments FOR ALL
    USING (can_create_transactions());

-- QUOTATIONS TABLE (Branch-based)
CREATE POLICY "quotations_select" ON quotations FOR SELECT
    USING (can_view_quotations() AND can_access_branch(branch_id));
CREATE POLICY "quotations_insert" ON quotations FOR INSERT
    WITH CHECK (can_create_quotations());
CREATE POLICY "quotations_update" ON quotations FOR UPDATE
    USING (can_edit_quotations());
CREATE POLICY "quotations_delete" ON quotations FOR DELETE
    USING (can_manage_roles()); -- Only role managers can delete

-- QUOTATION_ITEMS TABLE
CREATE POLICY "quotation_items_select" ON quotation_items FOR SELECT
    USING (can_view_quotations());
CREATE POLICY "quotation_items_all" ON quotation_items FOR ALL
    USING (can_create_quotations());

-- RECEIVABLES TABLE (Branch-based)
CREATE POLICY "receivables_select" ON receivables FOR SELECT
    USING (can_view_receivables() AND can_access_branch(branch_id));
CREATE POLICY "receivables_all" ON receivables FOR ALL
    USING (can_view_receivables());

-- RECEIVABLE_PAYMENTS TABLE
CREATE POLICY "receivable_payments_select" ON receivable_payments FOR SELECT
    USING (can_view_receivables());
CREATE POLICY "receivable_payments_all" ON receivable_payments FOR ALL
    USING (can_view_receivables());

-- PAYABLES TABLE
CREATE POLICY "payables_select" ON payables FOR SELECT
    USING (can_view_expenses());
CREATE POLICY "payables_all" ON payables FOR ALL
    USING (can_access_settings());

-- PAYABLE_PAYMENTS TABLE
CREATE POLICY "payable_payments_select" ON payable_payments FOR SELECT
    USING (can_view_expenses());
CREATE POLICY "payable_payments_all" ON payable_payments FOR ALL
    USING (can_access_settings());

-- PURCHASE_ORDERS TABLE
CREATE POLICY "purchase_orders_select" ON purchase_orders FOR SELECT
    USING (can_view_expenses());
CREATE POLICY "purchase_orders_all" ON purchase_orders FOR ALL
    USING (can_create_expenses());

-- PURCHASE_ORDER_ITEMS TABLE
CREATE POLICY "purchase_order_items_select" ON purchase_order_items FOR SELECT
    USING (can_view_expenses());
CREATE POLICY "purchase_order_items_all" ON purchase_order_items FOR ALL
    USING (can_create_expenses());

-- SUPPLIERS TABLE
CREATE POLICY "suppliers_select" ON suppliers FOR SELECT
    USING (can_view_expenses());
CREATE POLICY "suppliers_all" ON suppliers FOR ALL
    USING (can_access_settings());

-- WORK_ORDERS TABLE (Branch-based)
CREATE POLICY "work_orders_select" ON work_orders FOR SELECT
    USING (is_authenticated() AND can_access_branch(branch_id));
CREATE POLICY "work_orders_all" ON work_orders FOR ALL
    USING (is_authenticated());

-- WORK_ORDER_ITEMS TABLE
CREATE POLICY "work_order_items_select" ON work_order_items FOR SELECT
    USING (is_authenticated());
CREATE POLICY "work_order_items_all" ON work_order_items FOR ALL
    USING (is_authenticated());

-- WORK_ORDER_MATERIALS TABLE
CREATE POLICY "work_order_materials_select" ON work_order_materials FOR SELECT
    USING (is_authenticated());
CREATE POLICY "work_order_materials_all" ON work_order_materials FOR ALL
    USING (is_authenticated());

-- DELIVERIES TABLE (Branch-based)
CREATE POLICY "deliveries_select" ON deliveries FOR SELECT
    USING (is_authenticated() AND can_access_branch(branch_id));
CREATE POLICY "deliveries_all" ON deliveries FOR ALL
    USING (is_authenticated());

-- DELIVERY_ITEMS TABLE
CREATE POLICY "delivery_items_select" ON delivery_items FOR SELECT
    USING (is_authenticated());
CREATE POLICY "delivery_items_all" ON delivery_items FOR ALL
    USING (is_authenticated());

-- DELIVERY_CREW TABLE
CREATE POLICY "delivery_crew_select" ON delivery_crew FOR SELECT
    USING (is_authenticated());
CREATE POLICY "delivery_crew_all" ON delivery_crew FOR ALL
    USING (is_authenticated());

-- ACCOUNTS TABLE (Chart of Accounts)
CREATE POLICY "accounts_select" ON accounts FOR SELECT
    USING (can_view_accounts());
CREATE POLICY "accounts_insert" ON accounts FOR INSERT
    WITH CHECK (can_create_accounts());
CREATE POLICY "accounts_update" ON accounts FOR UPDATE
    USING (can_edit_accounts());
CREATE POLICY "accounts_delete" ON accounts FOR DELETE
    USING (can_manage_roles());

-- JOURNAL_ENTRIES TABLE (Branch-based)
CREATE POLICY "journal_entries_select" ON journal_entries FOR SELECT
    USING (can_view_financial_reports() AND can_access_branch(branch_id));
CREATE POLICY "journal_entries_all" ON journal_entries FOR ALL
    USING (can_create_expenses());

-- JOURNAL_ENTRY_LINES TABLE
CREATE POLICY "journal_entry_lines_select" ON journal_entry_lines FOR SELECT
    USING (can_view_financial_reports());
CREATE POLICY "journal_entry_lines_all" ON journal_entry_lines FOR ALL
    USING (can_create_expenses());

-- DAILY_CASH_SUMMARY TABLE (Branch-based)
CREATE POLICY "daily_cash_summary_select" ON daily_cash_summary FOR SELECT
    USING (can_view_financial_reports() AND can_access_branch(branch_id));
CREATE POLICY "daily_cash_summary_all" ON daily_cash_summary FOR ALL
    USING (can_access_settings());

-- PAYROLL TABLE
CREATE POLICY "payroll_select" ON payroll FOR SELECT
    USING (can_view_employees() OR employee_id = auth.uid());
CREATE POLICY "payroll_all" ON payroll FOR ALL
    USING (can_manage_roles());

-- PAYROLL_ITEMS TABLE
CREATE POLICY "payroll_items_select" ON payroll_items FOR SELECT
    USING (can_view_employees());
CREATE POLICY "payroll_items_all" ON payroll_items FOR ALL
    USING (can_manage_roles());

-- EMPLOYEE_SALARY_CONFIGS TABLE
CREATE POLICY "employee_salary_configs_select" ON employee_salary_configs FOR SELECT
    USING (can_view_employees() OR employee_id = auth.uid());
CREATE POLICY "employee_salary_configs_all" ON employee_salary_configs FOR ALL
    USING (can_manage_roles());

-- COMMISSION_SETTINGS TABLE
CREATE POLICY "commission_settings_select" ON commission_settings FOR SELECT
    USING (can_access_settings());
CREATE POLICY "commission_settings_all" ON commission_settings FOR ALL
    USING (can_manage_roles());

-- COMMISSIONS TABLE
CREATE POLICY "commissions_select" ON commissions FOR SELECT
    USING (employee_id = auth.uid() OR can_view_employees());
CREATE POLICY "commissions_all" ON commissions FOR ALL
    USING (can_access_settings());

-- SALES_COMMISSIONS TABLE
CREATE POLICY "sales_commissions_select" ON sales_commissions FOR SELECT
    USING (employee_id = auth.uid() OR can_view_employees());
CREATE POLICY "sales_commissions_all" ON sales_commissions FOR ALL
    USING (can_access_settings());

-- SETTINGS TABLE
CREATE POLICY "settings_select" ON settings FOR SELECT
    USING (is_authenticated());
CREATE POLICY "settings_all" ON settings FOR ALL
    USING (can_access_settings());

-- NOTIFICATIONS TABLE
CREATE POLICY "notifications_select" ON notifications FOR SELECT
    USING (user_id = auth.uid() OR can_access_settings());
CREATE POLICY "notifications_all" ON notifications FOR ALL
    USING (is_authenticated());

-- ============================================================================
-- PART 7: GRANT PERMISSIONS
-- ============================================================================

-- Grant schema usage
GRANT USAGE ON SCHEMA public TO anon, authenticated, aquavit;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, aquavit;

-- Grant function execution
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, aquavit;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, aquavit;

-- Grant table permissions (RLS will filter)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, aquavit;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- Grant sequence permissions
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, aquavit;

-- ============================================================================
-- SUMMARY
-- ============================================================================
SELECT '==================================================' as info;
SELECT 'RLS Dynamic Permissions Applied Successfully!' as status;
SELECT '==================================================' as info;
SELECT 'Permission yang digunakan (dari role_permissions):' as header;
SELECT '- products_view/create/edit/delete' as p1;
SELECT '- materials_view/create/edit/delete' as p2;
SELECT '- transactions_view/create/edit/delete' as p3;
SELECT '- quotations_view/create/edit' as p4;
SELECT '- customers_view/create/edit/delete' as p5;
SELECT '- employees_view/create/edit/delete' as p6;
SELECT '- accounts_view/create/edit' as p7;
SELECT '- receivables_view, expenses_view/create' as p8;
SELECT '- financial_reports, stock_reports' as p9;
SELECT '- settings_access, role_management' as p10;
SELECT '- pos_access' as p11;
SELECT '' as spacer;
SELECT 'Saat role baru dibuat di Management Roles,' as note1;
SELECT 'permission yang di-set akan otomatis berlaku untuk RLS!' as note2;
