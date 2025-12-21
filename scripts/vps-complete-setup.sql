-- ============================================================================
-- COMPLETE VPS DATABASE SETUP
-- Menambahkan tabel dan data yang kurang dari Supabase
-- ============================================================================

-- 1. TABEL YANG KURANG
-- ============================================================================

-- Assets table
CREATE TABLE IF NOT EXISTS assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT UNIQUE,
    category TEXT,
    purchase_date DATE,
    purchase_price NUMERIC(15,2) DEFAULT 0,
    current_value NUMERIC(15,2) DEFAULT 0,
    depreciation_method TEXT DEFAULT 'straight_line',
    useful_life_years INTEGER DEFAULT 5,
    salvage_value NUMERIC(15,2) DEFAULT 0,
    location TEXT,
    status TEXT DEFAULT 'active',
    notes TEXT,
    branch_id UUID REFERENCES branches(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Asset maintenance table
CREATE TABLE IF NOT EXISTS asset_maintenance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID REFERENCES assets(id),
    maintenance_date DATE,
    maintenance_type TEXT,
    description TEXT,
    cost NUMERIC(15,2) DEFAULT 0,
    performed_by TEXT,
    next_maintenance_date DATE,
    status TEXT DEFAULT 'completed',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Attendance table
CREATE TABLE IF NOT EXISTS attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES profiles(id),
    date DATE NOT NULL,
    check_in TIMESTAMPTZ,
    check_out TIMESTAMPTZ,
    status TEXT DEFAULT 'present',
    notes TEXT,
    branch_id UUID REFERENCES branches(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customer pricings table
CREATE TABLE IF NOT EXISTS customer_pricings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id),
    customer_id UUID REFERENCES customers(id),
    customer_classification TEXT,
    price_type TEXT DEFAULT 'fixed',
    price_value NUMERIC(15,2),
    priority INTEGER DEFAULT 0,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    branch_id UUID REFERENCES branches(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Delivery photos table
CREATE TABLE IF NOT EXISTS delivery_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id UUID REFERENCES deliveries(id),
    photo_url TEXT NOT NULL,
    photo_type TEXT DEFAULT 'delivery',
    description TEXT,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id),
    title TEXT NOT NULL,
    message TEXT,
    type TEXT DEFAULT 'info',
    is_read BOOLEAN DEFAULT false,
    link TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Nishab reference table
CREATE TABLE IF NOT EXISTS nishab_reference (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gold_price NUMERIC(15,2),
    silver_price NUMERIC(15,2),
    gold_nishab NUMERIC(15,4) DEFAULT 85,
    silver_nishab NUMERIC(15,4) DEFAULT 595,
    zakat_rate NUMERIC(5,4) DEFAULT 0.025,
    effective_date DATE DEFAULT CURRENT_DATE,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT
);

-- Zakat records table
CREATE TABLE IF NOT EXISTS zakat_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_assets NUMERIC(15,2) DEFAULT 0,
    total_liabilities NUMERIC(15,2) DEFAULT 0,
    net_zakatable NUMERIC(15,2) DEFAULT 0,
    zakat_amount NUMERIC(15,2) DEFAULT 0,
    nishab_reference_id UUID REFERENCES nishab_reference(id),
    status TEXT DEFAULT 'calculated',
    paid_date DATE,
    notes TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User roles table
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id),
    role_id UUID REFERENCES roles(id),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_by UUID REFERENCES profiles(id),
    UNIQUE(user_id, role_id)
);

-- Payroll records table
CREATE TABLE IF NOT EXISTS payroll_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES profiles(id),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    base_salary NUMERIC(15,2) DEFAULT 0,
    total_commission NUMERIC(15,2) DEFAULT 0,
    total_bonus NUMERIC(15,2) DEFAULT 0,
    total_deductions NUMERIC(15,2) DEFAULT 0,
    advance_deduction NUMERIC(15,2) DEFAULT 0,
    net_salary NUMERIC(15,2) DEFAULT 0,
    status TEXT DEFAULT 'draft',
    paid_date DATE,
    payment_method TEXT,
    notes TEXT,
    branch_id UUID REFERENCES branches(id),
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Retasi items table
CREATE TABLE IF NOT EXISTS retasi_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    retasi_id UUID REFERENCES retasi(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    product_name TEXT,
    quantity INTEGER DEFAULT 0,
    weight NUMERIC(10,2) DEFAULT 0,
    returned_qty INTEGER DEFAULT 0,
    error_qty INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Purchase order items table (if not exists)
CREATE TABLE IF NOT EXISTS purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
    material_id UUID REFERENCES materials(id),
    product_id UUID REFERENCES products(id),
    item_type TEXT DEFAULT 'material',
    quantity NUMERIC(15,2) DEFAULT 0,
    unit_price NUMERIC(15,2) DEFAULT 0,
    quantity_received NUMERIC(15,2) DEFAULT 0,
    is_taxable BOOLEAN DEFAULT false,
    tax_percentage NUMERIC(5,2) DEFAULT 0,
    tax_amount NUMERIC(15,2) DEFAULT 0,
    subtotal NUMERIC(15,2) DEFAULT 0,
    total_with_tax NUMERIC(15,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Companies table
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    tax_id TEXT,
    logo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. GRANT PERMISSIONS
-- ============================================================================

GRANT ALL ON assets TO aquavit;
GRANT ALL ON assets TO authenticated;
GRANT SELECT ON assets TO anon;

GRANT ALL ON asset_maintenance TO aquavit;
GRANT ALL ON asset_maintenance TO authenticated;
GRANT SELECT ON asset_maintenance TO anon;

GRANT ALL ON attendance TO aquavit;
GRANT ALL ON attendance TO authenticated;
GRANT SELECT ON attendance TO anon;

GRANT ALL ON customer_pricings TO aquavit;
GRANT ALL ON customer_pricings TO authenticated;
GRANT SELECT ON customer_pricings TO anon;

GRANT ALL ON delivery_photos TO aquavit;
GRANT ALL ON delivery_photos TO authenticated;
GRANT SELECT ON delivery_photos TO anon;

GRANT ALL ON notifications TO aquavit;
GRANT ALL ON notifications TO authenticated;

GRANT ALL ON nishab_reference TO aquavit;
GRANT ALL ON nishab_reference TO authenticated;
GRANT SELECT ON nishab_reference TO anon;

GRANT ALL ON zakat_records TO aquavit;
GRANT ALL ON zakat_records TO authenticated;

GRANT ALL ON user_roles TO aquavit;
GRANT ALL ON user_roles TO authenticated;
GRANT SELECT ON user_roles TO anon;

GRANT ALL ON payroll_records TO aquavit;
GRANT ALL ON payroll_records TO authenticated;

GRANT ALL ON retasi_items TO aquavit;
GRANT ALL ON retasi_items TO authenticated;
GRANT SELECT ON retasi_items TO anon;

GRANT ALL ON purchase_order_items TO aquavit;
GRANT ALL ON purchase_order_items TO authenticated;
GRANT SELECT ON purchase_order_items TO anon;

GRANT ALL ON companies TO aquavit;
GRANT ALL ON companies TO authenticated;
GRANT SELECT ON companies TO anon;

-- 3. CREATE VIEWS
-- ============================================================================

-- Employee salary summary view
CREATE OR REPLACE VIEW employee_salary_summary AS
SELECT
    es.id,
    es.employee_id,
    p.full_name as employee_name,
    p.role as employee_role,
    es.base_salary,
    es.commission_rate,
    es.payroll_type,
    es.commission_type,
    es.effective_from,
    es.effective_until,
    es.is_active,
    es.created_by,
    es.created_at,
    es.updated_at,
    es.notes
FROM employee_salaries es
LEFT JOIN profiles p ON es.employee_id = p.id;

GRANT SELECT ON employee_salary_summary TO aquavit;
GRANT SELECT ON employee_salary_summary TO authenticated;
GRANT SELECT ON employee_salary_summary TO anon;

-- 4. DISABLE RLS FOR SIMPLER DEVELOPMENT (can enable later with policies)
-- ============================================================================

ALTER TABLE assets DISABLE ROW LEVEL SECURITY;
ALTER TABLE asset_maintenance DISABLE ROW LEVEL SECURITY;
ALTER TABLE attendance DISABLE ROW LEVEL SECURITY;
ALTER TABLE customer_pricings DISABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_photos DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE nishab_reference DISABLE ROW LEVEL SECURITY;
ALTER TABLE zakat_records DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles DISABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_records DISABLE ROW LEVEL SECURITY;
ALTER TABLE retasi_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE companies DISABLE ROW LEVEL SECURITY;

-- Disable RLS on existing tables that had issues
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE materials DISABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers DISABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE expenses DISABLE ROW LEVEL SECURITY;
ALTER TABLE company_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE branches DISABLE ROW LEVEL SECURITY;
ALTER TABLE roles DISABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions DISABLE ROW LEVEL SECURITY;

-- 5. HELPER FUNCTIONS FOR AUTH
-- ============================================================================

-- Auth UID function (returns user ID from JWT)
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Auth role function
CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
BEGIN
    RETURN COALESCE(current_setting('request.jwt.claim.role', true), 'anon');
EXCEPTION WHEN OTHERS THEN
    RETURN 'anon';
END;
$$ LANGUAGE plpgsql STABLE;

-- Auth email function
CREATE OR REPLACE FUNCTION auth.email() RETURNS TEXT AS $$
BEGIN
    RETURN current_setting('request.jwt.claim.email', true);
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- is_admin helper
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'owner')
    );
EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- is_owner helper
CREATE OR REPLACE FUNCTION is_owner() RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role = 'owner'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 6. ENSURE BRANCHES HAS KANTOR PUSAT
-- ============================================================================

INSERT INTO branches (name, is_main, address, phone)
VALUES ('Kantor Pusat', true, 'Alamat Kantor Pusat', '-')
ON CONFLICT DO NOTHING;

-- Update profiles to have branch_id if null
UPDATE profiles
SET branch_id = (SELECT id FROM branches WHERE name = 'Kantor Pusat' LIMIT 1)
WHERE branch_id IS NULL;

-- Done!
SELECT 'VPS Database setup completed!' as status;
