-- Fix All Tables Schema for Aquvit ERP
-- Sync dengan TypeScript types dari frontend

-- ============================================
-- 1. CUSTOMERS TABLE
-- ============================================
ALTER TABLE customers ADD COLUMN IF NOT EXISTS classification TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,8);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS longitude DECIMAL(11,8);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS full_address TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS store_photo_url TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS jumlah_galon_titip INTEGER DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- ============================================
-- 2. PRODUCTS TABLE
-- ============================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'Produksi';
ALTER TABLE products ADD COLUMN IF NOT EXISTS base_price DECIMAL(15,2) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price DECIMAL(15,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'pcs';
ALTER TABLE products ADD COLUMN IF NOT EXISTS current_stock INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_order INTEGER DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS specifications JSONB DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- ============================================
-- 3. TRANSACTIONS TABLE
-- ============================================
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS cashier_id UUID REFERENCES profiles(id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS cashier_name TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS sales_id UUID REFERENCES profiles(id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS sales_name TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS designer_id UUID REFERENCES profiles(id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS operator_id UUID REFERENCES profiles(id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_account_id TEXT REFERENCES accounts(id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS retasi_id UUID;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS retasi_number TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS order_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS finish_date TIMESTAMPTZ;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS subtotal DECIMAL(15,2) DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS ppn_enabled BOOLEAN DEFAULT false;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS ppn_mode TEXT DEFAULT 'exclude';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS ppn_percentage DECIMAL(5,2) DEFAULT 11;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS ppn_amount DECIMAL(15,2) DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS total DECIMAL(15,2) DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(15,2) DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'Belum Lunas';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Pesanan Masuk';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_office_sale BOOLEAN DEFAULT false;

-- ============================================
-- 4. SUPPLIERS TABLE
-- ============================================
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_person TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS payment_terms TEXT DEFAULT 'COD';
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS tax_number TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS bank_account TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- ============================================
-- 5. PROFILES (EMPLOYEES) TABLE
-- ============================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Aktif';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- ============================================
-- 6. MATERIALS TABLE
-- ============================================
ALTER TABLE materials ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'Stock';
ALTER TABLE materials ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'pcs';
ALTER TABLE materials ADD COLUMN IF NOT EXISTS price_per_unit DECIMAL(15,2) DEFAULT 0;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS stock DECIMAL(15,2) DEFAULT 0;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS min_stock DECIMAL(15,2) DEFAULT 0;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS description TEXT;

-- ============================================
-- 7. EXPENSES TABLE
-- ============================================
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS amount DECIMAL(15,2) DEFAULT 0;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS account_id TEXT REFERENCES accounts(id);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS account_name TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS expense_account_id TEXT REFERENCES accounts(id);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS expense_account_name TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS date DATE DEFAULT CURRENT_DATE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- ============================================
-- 8. DELIVERIES TABLE
-- ============================================
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS transaction_id UUID REFERENCES transactions(id);
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS delivery_number INTEGER DEFAULT 1;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS delivery_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES profiles(id);
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS driver_name TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS helper_id UUID REFERENCES profiles(id);
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS helper_name TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- ============================================
-- 9. DELIVERY_ITEMS TABLE
-- ============================================
ALTER TABLE delivery_items ADD COLUMN IF NOT EXISTS delivery_id UUID REFERENCES deliveries(id);
ALTER TABLE delivery_items ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id);
ALTER TABLE delivery_items ADD COLUMN IF NOT EXISTS product_name TEXT;
ALTER TABLE delivery_items ADD COLUMN IF NOT EXISTS quantity_delivered DECIMAL(15,2) DEFAULT 0;
ALTER TABLE delivery_items ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE delivery_items ADD COLUMN IF NOT EXISTS width DECIMAL(10,2);
ALTER TABLE delivery_items ADD COLUMN IF NOT EXISTS height DECIMAL(10,2);
ALTER TABLE delivery_items ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE delivery_items ADD COLUMN IF NOT EXISTS is_bonus BOOLEAN DEFAULT false;

-- ============================================
-- 10. PURCHASE_ORDERS TABLE
-- ============================================
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS po_number TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS supplier_name TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS supplier_contact TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS order_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS expected_delivery_date DATE;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_date DATE;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS payment_date DATE;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Pending';
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS requested_by TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS total_cost DECIMAL(15,2) DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS include_ppn BOOLEAN DEFAULT false;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS ppn_amount DECIMAL(15,2) DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS payment_account_id TEXT REFERENCES accounts(id);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS expedition TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
-- Legacy single-item fields
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS material_id UUID REFERENCES materials(id);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS material_name TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS quantity DECIMAL(15,2);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS unit_price DECIMAL(15,2);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS quoted_price DECIMAL(15,2);

-- ============================================
-- 11. PURCHASE_ORDER_ITEMS TABLE
-- ============================================
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS purchase_order_id UUID REFERENCES purchase_orders(id);
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS material_id UUID REFERENCES materials(id);
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id);
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS item_type TEXT DEFAULT 'material';
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS material_name TEXT;
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS product_name TEXT;
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS quantity DECIMAL(15,2) DEFAULT 0;
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS unit_price DECIMAL(15,2) DEFAULT 0;
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS quantity_received DECIMAL(15,2) DEFAULT 0;
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS notes TEXT;

-- ============================================
-- 12. ASSETS TABLE
-- ============================================
ALTER TABLE assets ADD COLUMN IF NOT EXISTS asset_name TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS asset_code TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'other';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS purchase_date DATE;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS purchase_price DECIMAL(15,2) DEFAULT 0;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS supplier_name TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS serial_number TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS useful_life_years INTEGER DEFAULT 5;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS salvage_value DECIMAL(15,2) DEFAULT 0;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS depreciation_method TEXT DEFAULT 'straight_line';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS condition TEXT DEFAULT 'good';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS account_id TEXT REFERENCES accounts(id);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS current_value DECIMAL(15,2) DEFAULT 0;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS warranty_expiry DATE;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS insurance_expiry DATE;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- ============================================
-- 13. ASSET_MAINTENANCE TABLE
-- ============================================
ALTER TABLE asset_maintenance ADD COLUMN IF NOT EXISTS asset_id UUID REFERENCES assets(id);
ALTER TABLE asset_maintenance ADD COLUMN IF NOT EXISTS maintenance_type TEXT DEFAULT 'preventive';
ALTER TABLE asset_maintenance ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE asset_maintenance ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE asset_maintenance ADD COLUMN IF NOT EXISTS scheduled_date DATE;
ALTER TABLE asset_maintenance ADD COLUMN IF NOT EXISTS completed_date DATE;
ALTER TABLE asset_maintenance ADD COLUMN IF NOT EXISTS next_maintenance_date DATE;
ALTER TABLE asset_maintenance ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false;
ALTER TABLE asset_maintenance ADD COLUMN IF NOT EXISTS recurrence_interval INTEGER;
ALTER TABLE asset_maintenance ADD COLUMN IF NOT EXISTS recurrence_unit TEXT;
ALTER TABLE asset_maintenance ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'scheduled';
ALTER TABLE asset_maintenance ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium';
ALTER TABLE asset_maintenance ADD COLUMN IF NOT EXISTS estimated_cost DECIMAL(15,2) DEFAULT 0;
ALTER TABLE asset_maintenance ADD COLUMN IF NOT EXISTS actual_cost DECIMAL(15,2) DEFAULT 0;
ALTER TABLE asset_maintenance ADD COLUMN IF NOT EXISTS payment_account_id TEXT REFERENCES accounts(id);
ALTER TABLE asset_maintenance ADD COLUMN IF NOT EXISTS payment_account_name TEXT;
ALTER TABLE asset_maintenance ADD COLUMN IF NOT EXISTS service_provider TEXT;
ALTER TABLE asset_maintenance ADD COLUMN IF NOT EXISTS technician_name TEXT;
ALTER TABLE asset_maintenance ADD COLUMN IF NOT EXISTS parts_replaced TEXT;
ALTER TABLE asset_maintenance ADD COLUMN IF NOT EXISTS labor_hours DECIMAL(10,2);
ALTER TABLE asset_maintenance ADD COLUMN IF NOT EXISTS work_performed TEXT;
ALTER TABLE asset_maintenance ADD COLUMN IF NOT EXISTS findings TEXT;
ALTER TABLE asset_maintenance ADD COLUMN IF NOT EXISTS recommendations TEXT;
ALTER TABLE asset_maintenance ADD COLUMN IF NOT EXISTS attachments TEXT;
ALTER TABLE asset_maintenance ADD COLUMN IF NOT EXISTS notify_before_days INTEGER DEFAULT 7;
ALTER TABLE asset_maintenance ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN DEFAULT false;
ALTER TABLE asset_maintenance ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id);
ALTER TABLE asset_maintenance ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES profiles(id);
ALTER TABLE asset_maintenance ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- ============================================
-- 14. ATTENDANCE TABLE
-- ============================================
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES profiles(id);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS date DATE DEFAULT CURRENT_DATE;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_in TIMESTAMPTZ;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_out TIMESTAMPTZ;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_in_time TIMESTAMPTZ;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_out_time TIMESTAMPTZ;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'present';
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- ============================================
-- 15. SUPPLIER_MATERIALS TABLE
-- ============================================
ALTER TABLE supplier_materials ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id);
ALTER TABLE supplier_materials ADD COLUMN IF NOT EXISTS material_id UUID REFERENCES materials(id);
ALTER TABLE supplier_materials ADD COLUMN IF NOT EXISTS supplier_price DECIMAL(15,2) DEFAULT 0;
ALTER TABLE supplier_materials ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE supplier_materials ADD COLUMN IF NOT EXISTS min_order_qty DECIMAL(15,2) DEFAULT 1;
ALTER TABLE supplier_materials ADD COLUMN IF NOT EXISTS lead_time_days INTEGER DEFAULT 0;
ALTER TABLE supplier_materials ADD COLUMN IF NOT EXISTS last_updated TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE supplier_materials ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE supplier_materials ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- ============================================
-- 16. QUOTATIONS TABLE
-- ============================================
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id);
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]';
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS total DECIMAL(15,2) DEFAULT 0;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Draft';
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS valid_until DATE;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- ============================================
-- 17. EMPLOYEE_ADVANCES TABLE
-- ============================================
ALTER TABLE employee_advances ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES profiles(id);
ALTER TABLE employee_advances ADD COLUMN IF NOT EXISTS employee_name TEXT;
ALTER TABLE employee_advances ADD COLUMN IF NOT EXISTS amount DECIMAL(15,2) DEFAULT 0;
ALTER TABLE employee_advances ADD COLUMN IF NOT EXISTS remaining_amount DECIMAL(15,2) DEFAULT 0;
ALTER TABLE employee_advances ADD COLUMN IF NOT EXISTS purpose TEXT;
ALTER TABLE employee_advances ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE employee_advances ADD COLUMN IF NOT EXISTS account_id TEXT REFERENCES accounts(id);
ALTER TABLE employee_advances ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES profiles(id);
ALTER TABLE employee_advances ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE employee_advances ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- ============================================
-- 18. RETASI TABLE
-- ============================================
ALTER TABLE retasi ADD COLUMN IF NOT EXISTS retasi_number TEXT;
ALTER TABLE retasi ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES profiles(id);
ALTER TABLE retasi ADD COLUMN IF NOT EXISTS driver_name TEXT;
ALTER TABLE retasi ADD COLUMN IF NOT EXISTS helper_id UUID REFERENCES profiles(id);
ALTER TABLE retasi ADD COLUMN IF NOT EXISTS helper_name TEXT;
ALTER TABLE retasi ADD COLUMN IF NOT EXISTS date DATE DEFAULT CURRENT_DATE;
ALTER TABLE retasi ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open';
ALTER TABLE retasi ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE retasi ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- ============================================
-- 19. RETASI_ITEMS TABLE
-- ============================================
ALTER TABLE retasi_items ADD COLUMN IF NOT EXISTS retasi_id UUID REFERENCES retasi(id);
ALTER TABLE retasi_items ADD COLUMN IF NOT EXISTS transaction_id UUID REFERENCES transactions(id);
ALTER TABLE retasi_items ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE retasi_items ADD COLUMN IF NOT EXISTS amount DECIMAL(15,2) DEFAULT 0;
ALTER TABLE retasi_items ADD COLUMN IF NOT EXISTS collected_amount DECIMAL(15,2) DEFAULT 0;
ALTER TABLE retasi_items ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE retasi_items ADD COLUMN IF NOT EXISTS notes TEXT;

-- ============================================
-- 20. NOTIFICATIONS TABLE
-- ============================================
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'other';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS reference_type TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS reference_id TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS reference_url TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- ============================================
-- SIMPLIFY ALL RLS POLICIES
-- ============================================
DO $$
DECLARE
    t TEXT;
    tables TEXT[] := ARRAY[
        'customers', 'products', 'transactions', 'suppliers', 'materials',
        'expenses', 'deliveries', 'delivery_items', 'purchase_orders',
        'purchase_order_items', 'assets', 'asset_maintenance', 'attendance',
        'supplier_materials', 'quotations', 'employee_advances', 'retasi',
        'retasi_items', 'notifications', 'profiles', 'accounts', 'branches'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        -- Drop existing policies
        EXECUTE format('DROP POLICY IF EXISTS %I_select ON %I', t, t);
        EXECUTE format('DROP POLICY IF EXISTS %I_insert ON %I', t, t);
        EXECUTE format('DROP POLICY IF EXISTS %I_update ON %I', t, t);
        EXECUTE format('DROP POLICY IF EXISTS %I_delete ON %I', t, t);

        -- Create simple policies
        EXECUTE format('CREATE POLICY %I_select ON %I FOR SELECT USING (true)', t, t);
        EXECUTE format('CREATE POLICY %I_insert ON %I FOR INSERT WITH CHECK (true)', t, t);
        EXECUTE format('CREATE POLICY %I_update ON %I FOR UPDATE USING (true)', t, t);
        EXECUTE format('CREATE POLICY %I_delete ON %I FOR DELETE USING (true)', t, t);

        -- Grant permissions
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO owner, admin, supervisor, cashier, designer, operator', t);
    END LOOP;
END $$;

-- ============================================
-- RELOAD SCHEMA
-- ============================================
NOTIFY pgrst, 'reload schema';

SELECT 'All tables fixed!' as status;
