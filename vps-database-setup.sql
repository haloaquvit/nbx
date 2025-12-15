-- ============================================
-- AQUAVIT DATABASE SCHEMA - CONSOLIDATED
-- Generated: 2025-12-15
-- Total Migrations: 68
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Set timezone
SET timezone = 'Asia/Jakarta';


-- ============================================
-- Migration 1: 0000_membuat_skema_database_di_supabase_.sql
-- ============================================

-- Profiles table to store public user data
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  role TEXT,
  status TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public profiles are viewable by everyone." ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile." ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile." ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Function to handle new user signup and create a profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, status)
  VALUES (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.email,
    new.raw_user_meta_data ->> 'role',
    new.raw_user_meta_data ->> 'status'
  );
  RETURN new;
END;
$$;

-- Trigger to execute the function on new user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Customers table
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  "orderCount" INTEGER DEFAULT 0,
  "createdAt" TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage customers" ON public.customers FOR ALL USING (auth.role() = 'authenticated');

-- Accounts table
CREATE TABLE public.accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  balance NUMERIC NOT NULL,
  is_payment_account BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage accounts" ON public.accounts FOR ALL USING (auth.role() = 'authenticated');

-- Materials table
CREATE TABLE public.materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  price_per_unit NUMERIC NOT NULL,
  stock NUMERIC NOT NULL,
  min_stock NUMERIC NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage materials" ON public.materials FOR ALL USING (auth.role() = 'authenticated');

-- Products table
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  base_price NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  min_order INTEGER NOT NULL,
  description TEXT,
  specifications JSONB,
  materials JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage products" ON public.products FOR ALL USING (auth.role() = 'authenticated');

-- Transactions table
CREATE TABLE public.transactions (
  id TEXT PRIMARY KEY,
  customer_id UUID REFERENCES public.customers(id),
  customer_name TEXT,
  cashier_id UUID REFERENCES public.profiles(id),
  cashier_name TEXT,
  designer_id UUID REFERENCES public.profiles(id),
  operator_id UUID REFERENCES public.profiles(id),
  payment_account_id TEXT REFERENCES public.accounts(id),
  order_date TIMESTAMPTZ NOT NULL,
  finish_date TIMESTAMPTZ,
  items JSONB,
  total NUMERIC NOT NULL,
  paid_amount NUMERIC NOT NULL,
  payment_status TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage transactions" ON public.transactions FOR ALL USING (auth.role() = 'authenticated');

-- Quotations table
CREATE TABLE public.quotations (
  id TEXT PRIMARY KEY,
  customer_id UUID REFERENCES public.customers(id),
  customer_name TEXT,
  prepared_by TEXT,
  items JSONB,
  total NUMERIC,
  status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  valid_until TIMESTAMPTZ,
  transaction_id TEXT
);
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage quotations" ON public.quotations FOR ALL USING (auth.role() = 'authenticated');

-- Employee Advances table
CREATE TABLE public.employee_advances (
  id TEXT PRIMARY KEY,
  employee_id UUID REFERENCES public.profiles(id),
  employee_name TEXT,
  amount NUMERIC NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  notes TEXT,
  remaining_amount NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  account_id TEXT REFERENCES public.accounts(id),
  account_name TEXT
);
ALTER TABLE public.employee_advances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage employee advances" ON public.employee_advances FOR ALL USING (auth.role() = 'authenticated');

-- Advance Repayments table
CREATE TABLE public.advance_repayments (
  id TEXT PRIMARY KEY,
  advance_id TEXT REFERENCES public.employee_advances(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  recorded_by TEXT
);
ALTER TABLE public.advance_repayments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage advance repayments" ON public.advance_repayments FOR ALL USING (auth.role() = 'authenticated');

-- Expenses table
CREATE TABLE public.expenses (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  account_id TEXT REFERENCES public.accounts(id),
  account_name TEXT,
  date TIMESTAMPTZ NOT NULL,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage expenses" ON public.expenses FOR ALL USING (auth.role() = 'authenticated');

-- Purchase Orders table
CREATE TABLE public.purchase_orders (
  id TEXT PRIMARY KEY,
  material_id UUID REFERENCES public.materials(id),
  material_name TEXT,
  quantity NUMERIC,
  unit TEXT,
  requested_by TEXT,
  status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  notes TEXT,
  total_cost NUMERIC,
  payment_account_id TEXT REFERENCES public.accounts(id),
  payment_date TIMESTAMPTZ
);
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage purchase orders" ON public.purchase_orders FOR ALL USING (auth.role() = 'authenticated');

-- Company Settings table
CREATE TABLE public.company_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage company settings" ON public.company_settings FOR ALL USING (auth.role() = 'authenticated');

-- Create employees_view
CREATE OR REPLACE VIEW public.employees_view AS
SELECT
    u.id,
    p.full_name,
    u.email,
    p.role,
    p.phone,
    p.address,
    p.status
FROM
    auth.users u
JOIN
    public.profiles p ON u.id = p.id;

-- Create RPC functions
CREATE OR REPLACE FUNCTION public.pay_receivable(p_transaction_id text, p_amount numeric)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  current_paid_amount numeric;
  new_paid_amount numeric;
  total_amount numeric;
BEGIN
  SELECT paid_amount, total INTO current_paid_amount, total_amount
  FROM public.transactions
  WHERE id = p_transaction_id;

  new_paid_amount := current_paid_amount + p_amount;

  UPDATE public.transactions
  SET
    paid_amount = new_paid_amount,
    payment_status = CASE
      WHEN new_paid_amount >= total_amount THEN 'Lunas'
      ELSE 'Belum Lunas'
    END
  WHERE id = p_transaction_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.deduct_materials_for_transaction(p_transaction_id text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  item_record jsonb;
  material_record jsonb;
  material_id_uuid uuid;
  quantity_to_deduct numeric;
BEGIN
  FOR item_record IN (SELECT jsonb_array_elements(items) FROM public.transactions WHERE id = p_transaction_id)
  LOOP
    IF item_record -> 'product' ->> 'materials' IS NOT NULL THEN
      FOR material_record IN (SELECT jsonb_array_elements(item_record -> 'product' -> 'materials'))
      LOOP
        material_id_uuid := (material_record ->> 'materialId')::uuid;
        quantity_to_deduct := (material_record ->> 'quantity')::numeric * (item_record ->> 'quantity')::numeric;

        UPDATE public.materials
        SET stock = stock - quantity_to_deduct
        WHERE id = material_id_uuid;
      END LOOP;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_material_stock(material_id uuid, quantity_to_add numeric)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.materials
  SET stock = stock + quantity_to_add
  WHERE id = material_id;
END;
$$;


-- ============================================
-- Migration 2: 0001_menonaktifkan_row_level_security_untuk_semua_tabel_.sql
-- ============================================

ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.products DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_advances DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.advance_repayments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings DISABLE ROW LEVEL SECURITY;


-- ============================================
-- Migration 3: 0002_create_user_role_function.sql
-- ============================================

-- Create function to get current user role
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Get the role from profiles table
  SELECT role INTO user_role
  FROM public.profiles
  WHERE id = auth.uid();
  
  RETURN COALESCE(user_role, 'guest');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- Migration 4: 0003_add_ppn_columns_to_transactions.sql
-- ============================================

-- Add PPN and subtotal columns to transactions table
ALTER TABLE public.transactions 
ADD COLUMN subtotal NUMERIC DEFAULT 0,
ADD COLUMN ppn_enabled BOOLEAN DEFAULT false,
ADD COLUMN ppn_percentage NUMERIC DEFAULT 11,
ADD COLUMN ppn_amount NUMERIC DEFAULT 0;

-- Update existing records to set subtotal equal to total for backward compatibility
UPDATE public.transactions SET subtotal = total WHERE subtotal = 0;


-- ============================================
-- Migration 5: 0004_add_rls_management_functions.sql
-- ============================================

-- Create functions for RLS management

-- Function to get RLS status for all tables
CREATE OR REPLACE FUNCTION get_rls_status()
RETURNS TABLE (
  schema_name text,
  table_name text,
  rls_enabled boolean
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT 
    schemaname::text as schema_name,
    tablename::text as table_name,
    rowsecurity as rls_enabled
  FROM pg_tables 
  WHERE schemaname = 'public'
  ORDER BY tablename;
$$;

-- Function to enable RLS on a specific table
CREATE OR REPLACE FUNCTION enable_rls(table_name text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Check if user has permission (only owner role)
  IF NOT EXISTS (
    SELECT 1 FROM auth.users 
    WHERE id = auth.uid() 
    AND raw_user_meta_data->>'role' = 'owner'
  ) THEN
    RAISE EXCEPTION 'Only owner can manage RLS settings';
  END IF;

  -- Enable RLS on the specified table
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
  
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to enable RLS on table %: %', table_name, SQLERRM;
END;
$$;

-- Function to disable RLS on a specific table
CREATE OR REPLACE FUNCTION disable_rls(table_name text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Check if user has permission (only owner role)
  IF NOT EXISTS (
    SELECT 1 FROM auth.users 
    WHERE id = auth.uid() 
    AND raw_user_meta_data->>'role' = 'owner'
  ) THEN
    RAISE EXCEPTION 'Only owner can manage RLS settings';
  END IF;

  -- Disable RLS on the specified table
  EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', table_name);
  
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to disable RLS on table %: %', table_name, SQLERRM;
END;
$$;

-- Function to get RLS policies
CREATE OR REPLACE FUNCTION get_rls_policies(table_name text DEFAULT NULL)
RETURNS TABLE (
  schema_name text,
  table_name text,
  policy_name text,
  cmd text,
  roles text,
  qual text
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT 
    schemaname::text as schema_name,
    tablename::text as table_name,
    policyname::text as policy_name,
    cmd::text,
    array_to_string(roles, ', ')::text as roles,
    qual::text
  FROM pg_policies 
  WHERE schemaname = 'public'
    AND (table_name IS NULL OR tablename = table_name)
  ORDER BY tablename, policyname;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_rls_status() TO authenticated;
GRANT EXECUTE ON FUNCTION enable_rls(text) TO authenticated;
GRANT EXECUTE ON FUNCTION disable_rls(text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_rls_policies(text) TO authenticated;


-- ============================================
-- Migration 6: 0005_create_role_permissions_table.sql
-- ============================================

-- Create role_permissions table
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  role_id TEXT NOT NULL,
  permissions JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create unique index on role_id
CREATE UNIQUE INDEX IF NOT EXISTS role_permissions_role_id_idx ON public.role_permissions(role_id);

-- Enable RLS
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users to read
CREATE POLICY "Allow authenticated users to read role permissions" ON public.role_permissions
  FOR SELECT TO authenticated USING (true);

-- Create policy for owners to manage role permissions
CREATE POLICY "Allow owners to manage role permissions" ON public.role_permissions
  FOR ALL TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE id = auth.uid() 
      AND raw_user_meta_data->>'role' = 'owner'
    )
  );

-- Insert default role permissions if they don't exist
INSERT INTO public.role_permissions (role_id, permissions) 
VALUES 
  ('owner', '{
    "products_view": true, "products_create": true, "products_edit": true, "products_delete": true,
    "materials_view": true, "materials_create": true, "materials_edit": true, "materials_delete": true,
    "pos_access": true,
    "transactions_view": true, "transactions_create": true, "transactions_edit": true, "transactions_delete": true,
    "quotations_view": true, "quotations_create": true, "quotations_edit": true,
    "customers_view": true, "customers_create": true, "customers_edit": true, "customers_delete": true,
    "employees_view": true, "employees_create": true, "employees_edit": true, "employees_delete": true,
    "accounts_view": true, "accounts_create": true, "accounts_edit": true,
    "receivables_view": true,
    "expenses_view": true, "expenses_create": true,
    "advances_view": true, "advances_create": true,
    "financial_reports": true,
    "stock_reports": true, "transaction_reports": true, "attendance_reports": true,
    "settings_access": true, "role_management": true, "attendance_access": true
  }'),
  ('admin', '{
    "products_view": true, "products_create": true, "products_edit": true, "products_delete": true,
    "materials_view": true, "materials_create": true, "materials_edit": true, "materials_delete": true,
    "pos_access": true,
    "transactions_view": true, "transactions_create": true, "transactions_edit": true, "transactions_delete": true,
    "quotations_view": true, "quotations_create": true, "quotations_edit": true,
    "customers_view": true, "customers_create": true, "customers_edit": true, "customers_delete": true,
    "employees_view": true, "employees_create": true, "employees_edit": true, "employees_delete": true,
    "accounts_view": true, "accounts_create": true, "accounts_edit": true,
    "receivables_view": true,
    "expenses_view": true, "expenses_create": true,
    "advances_view": true, "advances_create": true,
    "financial_reports": true,
    "stock_reports": true, "transaction_reports": true, "attendance_reports": true,
    "settings_access": true, "role_management": false, "attendance_access": true
  }'),
  ('supervisor', '{
    "products_view": true, "products_create": true, "products_edit": true, "products_delete": false,
    "materials_view": true, "materials_create": true, "materials_edit": true, "materials_delete": false,
    "pos_access": true,
    "transactions_view": true, "transactions_create": true, "transactions_edit": true, "transactions_delete": false,
    "quotations_view": true, "quotations_create": true, "quotations_edit": true,
    "customers_view": true, "customers_create": true, "customers_edit": true, "customers_delete": false,
    "employees_view": true, "employees_create": false, "employees_edit": false, "employees_delete": false,
    "accounts_view": true, "accounts_create": false, "accounts_edit": false,
    "receivables_view": true,
    "expenses_view": true, "expenses_create": true,
    "advances_view": true, "advances_create": true,
    "financial_reports": true,
    "stock_reports": true, "transaction_reports": true, "attendance_reports": true,
    "settings_access": false, "role_management": false, "attendance_access": true
  }'),
  ('cashier', '{
    "products_view": true, "products_create": true, "products_edit": true, "products_delete": false,
    "materials_view": true, "materials_create": false, "materials_edit": false, "materials_delete": false,
    "pos_access": true,
    "transactions_view": true, "transactions_create": true, "transactions_edit": true, "transactions_delete": false,
    "quotations_view": true, "quotations_create": true, "quotations_edit": true,
    "customers_view": true, "customers_create": true, "customers_edit": true, "customers_delete": false,
    "employees_view": false, "employees_create": false, "employees_edit": false, "employees_delete": false,
    "accounts_view": false, "accounts_create": false, "accounts_edit": false,
    "receivables_view": true,
    "expenses_view": false, "expenses_create": false,
    "advances_view": false, "advances_create": false,
    "financial_reports": false,
    "stock_reports": false, "transaction_reports": false, "attendance_reports": false,
    "settings_access": false, "role_management": false, "attendance_access": true
  }'),
  ('designer', '{
    "products_view": true, "products_create": true, "products_edit": true, "products_delete": false,
    "materials_view": true, "materials_create": false, "materials_edit": false, "materials_delete": false,
    "pos_access": false,
    "transactions_view": true, "transactions_create": false, "transactions_edit": false, "transactions_delete": false,
    "quotations_view": true, "quotations_create": true, "quotations_edit": true,
    "customers_view": true, "customers_create": false, "customers_edit": false, "customers_delete": false,
    "employees_view": false, "employees_create": false, "employees_edit": false, "employees_delete": false,
    "accounts_view": false, "accounts_create": false, "accounts_edit": false,
    "receivables_view": false,
    "expenses_view": false, "expenses_create": false,
    "advances_view": false, "advances_create": false,
    "financial_reports": false,
    "stock_reports": true, "transaction_reports": false, "attendance_reports": false,
    "settings_access": false, "role_management": false, "attendance_access": true
  }'),
  ('operator', '{
    "products_view": false, "products_create": false, "products_edit": false, "products_delete": false,
    "materials_view": false, "materials_create": false, "materials_edit": false, "materials_delete": false,
    "pos_access": false,
    "transactions_view": false, "transactions_create": false, "transactions_edit": false, "transactions_delete": false,
    "quotations_view": false, "quotations_create": false, "quotations_edit": false,
    "customers_view": false, "customers_create": false, "customers_edit": false, "customers_delete": false,
    "employees_view": false, "employees_create": false, "employees_edit": false, "employees_delete": false,
    "accounts_view": false, "accounts_create": false, "accounts_edit": false,
    "receivables_view": false,
    "expenses_view": false, "expenses_create": false,
    "advances_view": false, "advances_create": false,
    "financial_reports": false,
    "stock_reports": false, "transaction_reports": false, "attendance_reports": false,
    "settings_access": false, "role_management": false, "attendance_access": true
  }')
ON CONFLICT (role_id) DO NOTHING;


-- ============================================
-- Migration 7: 0007_create_retasi_table.sql
-- ============================================

-- Simple retasi table creation - using content from 0025_create_simple_retasi_table.sql
CREATE TABLE IF NOT EXISTS public.retasi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retasi_number TEXT NOT NULL UNIQUE,
  truck_number TEXT,
  driver_name TEXT,
  helper_name TEXT,
  departure_date DATE NOT NULL,
  departure_time TIME,
  route TEXT,
  total_items INTEGER DEFAULT 0,
  total_weight DECIMAL(10,2),
  notes TEXT,
  retasi_ke INTEGER NOT NULL DEFAULT 1,
  is_returned BOOLEAN DEFAULT FALSE,
  returned_items_count INTEGER DEFAULT 0,
  error_items_count INTEGER DEFAULT 0,
  return_notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.retasi ENABLE ROW LEVEL SECURITY;

-- Create RLS policies - allow all operations for authenticated users
CREATE POLICY "retasi_access" ON public.retasi
FOR ALL USING (auth.uid() IS NOT NULL);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_retasi_departure_date ON public.retasi(departure_date);
CREATE INDEX IF NOT EXISTS idx_retasi_driver_date ON public.retasi(driver_name, departure_date);
CREATE INDEX IF NOT EXISTS idx_retasi_returned ON public.retasi(is_returned);

-- Create function to get next retasi counter for driver per day
CREATE OR REPLACE FUNCTION get_next_retasi_counter(driver TEXT, target_date DATE DEFAULT CURRENT_DATE)
RETURNS INTEGER AS $$
DECLARE
  counter INTEGER;
BEGIN
  -- Get the highest retasi_ke for the driver on the specific date
  SELECT COALESCE(MAX(retasi_ke), 0) + 1
  INTO counter
  FROM public.retasi
  WHERE driver_name = driver 
    AND departure_date = target_date;
  
  RETURN counter;
END;
$$ LANGUAGE plpgsql;

-- Create function to check if driver has unreturned retasi
CREATE OR REPLACE FUNCTION driver_has_unreturned_retasi(driver TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  count_unreturned INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO count_unreturned
  FROM public.retasi
  WHERE driver_name = driver 
    AND is_returned = FALSE;
  
  RETURN count_unreturned > 0;
END;
$$ LANGUAGE plpgsql;

-- Create function to generate retasi number
CREATE OR REPLACE FUNCTION generate_retasi_number()
RETURNS TEXT AS $$
DECLARE
  new_number TEXT;
  counter INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(retasi_number FROM 12 FOR 3) AS INTEGER)), 0) + 1
  INTO counter
  FROM public.retasi
  WHERE retasi_number LIKE 'RET-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-%';
  
  new_number := 'RET-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD(counter::TEXT, 3, '0');
  
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-set retasi_ke and number before insert
CREATE OR REPLACE FUNCTION set_retasi_ke_and_number()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-generate retasi number if not provided
  IF NEW.retasi_number IS NULL OR NEW.retasi_number = '' THEN
    NEW.retasi_number := generate_retasi_number();
  END IF;
  
  -- Auto-set retasi_ke based on driver and date
  IF NEW.driver_name IS NOT NULL THEN
    NEW.retasi_ke := get_next_retasi_counter(NEW.driver_name, NEW.departure_date);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_retasi_ke_and_number
  BEFORE INSERT ON public.retasi
  FOR EACH ROW
  EXECUTE FUNCTION set_retasi_ke_and_number();

-- Create function to mark retasi as returned
CREATE OR REPLACE FUNCTION mark_retasi_returned(
  retasi_id UUID,
  returned_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.retasi 
  SET 
    is_returned = TRUE,
    returned_items_count = returned_count,
    error_items_count = error_count,
    return_notes = notes,
    updated_at = NOW()
  WHERE id = retasi_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Create updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create updated_at trigger
CREATE TRIGGER update_retasi_updated_at 
  BEFORE UPDATE ON public.retasi 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Success message
SELECT 'Simple retasi table created successfully!' as status;


-- ============================================
-- Migration 8: 0008_add_customer_location_and_photo.sql
-- ============================================

-- Add location and photo columns to customers table (with IF NOT EXISTS)
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS latitude NUMERIC,
ADD COLUMN IF NOT EXISTS longitude NUMERIC,
ADD COLUMN IF NOT EXISTS full_address TEXT,
ADD COLUMN IF NOT EXISTS store_photo_url TEXT,
ADD COLUMN IF NOT EXISTS store_photo_drive_id TEXT;


-- ============================================
-- Migration 9: 0011_add_material_type_and_stock_movements.sql
-- ============================================

-- Add type field to materials table
ALTER TABLE public.materials 
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'Stock' CHECK (type IN ('Stock', 'Beli'));

-- Add comment for the new column
COMMENT ON COLUMN public.materials.type IS 'Jenis bahan: Stock (produksi menurunkan stock), Beli (produksi menambah stock)';

-- Update existing materials to have default type
UPDATE public.materials 
SET type = 'Stock'
WHERE type IS NULL;

-- Create material_stock_movements table to track all material stock changes
CREATE TABLE IF NOT EXISTS public.material_stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL,
  material_name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('IN', 'OUT', 'ADJUSTMENT')),
  reason TEXT NOT NULL CHECK (reason IN ('PURCHASE', 'PRODUCTION_CONSUMPTION', 'PRODUCTION_ACQUISITION', 'ADJUSTMENT', 'RETURN')),
  quantity NUMERIC NOT NULL,
  previous_stock NUMERIC NOT NULL,
  new_stock NUMERIC NOT NULL,
  notes TEXT,
  reference_id TEXT,
  reference_type TEXT,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Foreign key constraints
  CONSTRAINT fk_material_stock_movement_material 
    FOREIGN KEY (material_id) 
    REFERENCES public.materials(id) 
    ON DELETE CASCADE,
    
  CONSTRAINT fk_material_stock_movement_user 
    FOREIGN KEY (user_id) 
    REFERENCES public.profiles(id) 
    ON DELETE CASCADE,
    
  -- Ensure positive quantity
  CONSTRAINT positive_quantity CHECK (quantity > 0)
);

-- Enable Row Level Security
ALTER TABLE public.material_stock_movements ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users to view material stock movements
CREATE POLICY "Authenticated users can view material stock movements" 
ON public.material_stock_movements FOR SELECT 
USING (auth.role() = 'authenticated');

-- Create policy for authenticated users to insert material stock movements
CREATE POLICY "Authenticated users can create material stock movements" 
ON public.material_stock_movements FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_material_stock_movements_material ON public.material_stock_movements(material_id);
CREATE INDEX IF NOT EXISTS idx_material_stock_movements_user ON public.material_stock_movements(user_id);
CREATE INDEX IF NOT EXISTS idx_material_stock_movements_created_at ON public.material_stock_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_stock_movements_reference ON public.material_stock_movements(reference_id, reference_type);
CREATE INDEX IF NOT EXISTS idx_material_stock_movements_type_reason ON public.material_stock_movements(type, reason);

-- Add comments to material_stock_movements table
COMMENT ON TABLE public.material_stock_movements IS 'History of all material stock movements and changes';
COMMENT ON COLUMN public.material_stock_movements.type IS 'Type of movement: IN (stock bertambah), OUT (stock berkurang), ADJUSTMENT (penyesuaian)';
COMMENT ON COLUMN public.material_stock_movements.reason IS 'Reason for movement: PURCHASE, PRODUCTION_CONSUMPTION, PRODUCTION_ACQUISITION, ADJUSTMENT, RETURN';
COMMENT ON COLUMN public.material_stock_movements.quantity IS 'Quantity moved (always positive)';
COMMENT ON COLUMN public.material_stock_movements.previous_stock IS 'Stock before this movement';
COMMENT ON COLUMN public.material_stock_movements.new_stock IS 'Stock after this movement';
COMMENT ON COLUMN public.material_stock_movements.reference_id IS 'ID of related record (transaction, purchase order, etc)';
COMMENT ON COLUMN public.material_stock_movements.reference_type IS 'Type of reference (transaction, purchase_order, etc)';


-- ============================================
-- Migration 10: 0012_add_payment_history_table.sql
-- ============================================

-- Add payment_history table to track detailed payment records for receivables
CREATE TABLE IF NOT EXISTS public.payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id TEXT NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  remaining_amount NUMERIC NOT NULL CHECK (remaining_amount >= 0),
  payment_method TEXT DEFAULT 'Tunai',
  account_id TEXT REFERENCES public.accounts(id),
  account_name TEXT,
  notes TEXT,
  recorded_by UUID REFERENCES public.profiles(id),
  recorded_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;

-- Create policy for payment_history
DROP POLICY IF EXISTS "Authenticated users can manage payment history" ON public.payment_history;
CREATE POLICY "Authenticated users can manage payment history" ON public.payment_history
FOR ALL USING (auth.role() = 'authenticated');

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_payment_history_transaction_id ON public.payment_history(transaction_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_payment_date ON public.payment_history(payment_date);

-- Function to automatically update payment history when receivable is paid
CREATE OR REPLACE FUNCTION public.record_payment_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only trigger if paid_amount increased
  IF NEW.paid_amount > OLD.paid_amount THEN
    INSERT INTO public.payment_history (
      transaction_id,
      amount,
      payment_date,
      remaining_amount,
      recorded_by_name
    ) VALUES (
      NEW.id,
      NEW.paid_amount - OLD.paid_amount,
      NOW(),
      NEW.total - NEW.paid_amount,
      'System Auto-Record'
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger to automatically record payment history
DROP TRIGGER IF EXISTS on_receivable_payment ON public.transactions;
CREATE TRIGGER on_receivable_payment
  AFTER UPDATE OF paid_amount ON public.transactions
  FOR EACH ROW
  WHEN (NEW.paid_amount IS DISTINCT FROM OLD.paid_amount)
  EXECUTE FUNCTION public.record_payment_history();

-- Function to pay receivable with proper history tracking
CREATE OR REPLACE FUNCTION public.pay_receivable_with_history(
  p_transaction_id TEXT,
  p_amount NUMERIC,
  p_account_id TEXT DEFAULT NULL,
  p_account_name TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_recorded_by UUID DEFAULT NULL,
  p_recorded_by_name TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transaction RECORD;
  v_remaining_amount NUMERIC;
BEGIN
  -- Get current transaction
  SELECT * INTO v_transaction FROM public.transactions WHERE id = p_transaction_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;
  
  -- Calculate remaining amount after this payment
  v_remaining_amount := v_transaction.total - (v_transaction.paid_amount + p_amount);
  
  IF v_remaining_amount < 0 THEN
    RAISE EXCEPTION 'Payment amount exceeds remaining balance';
  END IF;
  
  -- Update transaction
  UPDATE public.transactions 
  SET 
    paid_amount = paid_amount + p_amount,
    payment_status = CASE 
      WHEN paid_amount + p_amount >= total THEN 'Lunas'
      ELSE 'Belum Lunas'
    END
  WHERE id = p_transaction_id;
  
  -- Record payment history
  INSERT INTO public.payment_history (
    transaction_id,
    amount,
    payment_date,
    remaining_amount,
    account_id,
    account_name,
    notes,
    recorded_by,
    recorded_by_name
  ) VALUES (
    p_transaction_id,
    p_amount,
    NOW(),
    v_remaining_amount,
    p_account_id,
    p_account_name,
    p_notes,
    p_recorded_by,
    p_recorded_by_name
  );
END;
$$;


-- ============================================
-- Migration 11: 0014_create_balance_reconciliation_functions.sql
-- ============================================

-- CREATE BALANCE RECONCILIATION FUNCTIONS FOR OWNER ACCESS
-- This script creates functions to allow owners to reconcile account balances directly from the app

-- ========================================
-- 1. CREATE BALANCE RECONCILIATION FUNCTION
-- ========================================

CREATE OR REPLACE FUNCTION reconcile_account_balance(
  p_account_id TEXT,
  p_new_balance NUMERIC,
  p_reason TEXT,
  p_user_id UUID,
  p_user_name TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  old_balance NUMERIC,
  new_balance NUMERIC,
  adjustment_amount NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_balance NUMERIC;
  v_adjustment NUMERIC;
  v_account_name TEXT;
BEGIN
  -- Check if user is owner
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = p_user_id AND role = 'owner'
  ) THEN
    RETURN QUERY SELECT 
      false as success,
      'Access denied. Only owners can reconcile account balances.' as message,
      0::NUMERIC as old_balance,
      0::NUMERIC as new_balance,
      0::NUMERIC as adjustment_amount;
    RETURN;
  END IF;

  -- Get current account info
  SELECT current_balance, name INTO v_old_balance, v_account_name
  FROM accounts 
  WHERE id = p_account_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT 
      false as success,
      'Account not found.' as message,
      0::NUMERIC as old_balance,
      0::NUMERIC as new_balance,
      0::NUMERIC as adjustment_amount;
    RETURN;
  END IF;

  -- Calculate adjustment
  v_adjustment := p_new_balance - v_old_balance;

  -- Update account balance
  UPDATE accounts 
  SET 
    current_balance = p_new_balance,
    updated_at = NOW()
  WHERE id = p_account_id;

  -- Log the reconciliation in cash_history table
  INSERT INTO cash_history (
    account_id,
    transaction_type,
    amount,
    description,
    reference_number,
    created_by,
    created_by_name,
    source_type
  ) VALUES (
    p_account_id,
    CASE WHEN v_adjustment >= 0 THEN 'income'::TEXT ELSE 'expense'::TEXT END,
    ABS(v_adjustment),
    COALESCE(p_reason, 'Balance reconciliation by owner'),
    'RECON-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS'),
    p_user_id,
    p_user_name,
    'reconciliation'
  );

  RETURN QUERY SELECT 
    true as success,
    'Account balance successfully reconciled from ' || v_old_balance::TEXT || ' to ' || p_new_balance::TEXT as message,
    v_old_balance as old_balance,
    p_new_balance as new_balance,
    v_adjustment as adjustment_amount;
END;
$$;

-- ========================================
-- 2. GET ACCOUNT BALANCE ANALYSIS FUNCTION
-- ========================================

CREATE OR REPLACE FUNCTION get_account_balance_analysis(p_account_id TEXT)
RETURNS TABLE (
  account_id TEXT,
  account_name TEXT,
  account_type TEXT,
  current_balance NUMERIC,
  calculated_balance NUMERIC,
  difference NUMERIC,
  transaction_breakdown JSONB,
  needs_reconciliation BOOLEAN
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_account RECORD;
  v_pos_sales NUMERIC := 0;
  v_receivables NUMERIC := 0;
  v_cash_income NUMERIC := 0;
  v_cash_expense NUMERIC := 0;
  v_expenses NUMERIC := 0;
  v_advances NUMERIC := 0;
  v_calculated NUMERIC;
BEGIN
  -- Get account info
  SELECT id, name, account_type, current_balance, initial_balance
  INTO v_account
  FROM accounts 
  WHERE id = p_account_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Calculate POS sales
  SELECT COALESCE(SUM(total), 0) INTO v_pos_sales
  FROM transactions 
  WHERE payment_account = p_account_id 
  AND payment_status = 'Lunas';

  -- Calculate receivables payments (if table exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transaction_payments') THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_receivables
    FROM transaction_payments 
    WHERE account_id = p_account_id 
    AND status = 'active';
  END IF;

  -- Calculate cash history
  SELECT 
    COALESCE(SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END), 0)
  INTO v_cash_income, v_cash_expense
  FROM cash_history 
  WHERE account_id = p_account_id;

  -- Calculate expenses
  SELECT COALESCE(SUM(amount), 0) INTO v_expenses
  FROM expenses 
  WHERE account_id = p_account_id 
  AND status = 'approved';

  -- Calculate advances
  SELECT COALESCE(SUM(amount), 0) INTO v_advances
  FROM employee_advances 
  WHERE account_id = p_account_id 
  AND status = 'approved';

  -- Calculate total
  v_calculated := COALESCE(v_account.initial_balance, 0) + v_pos_sales + v_receivables + v_cash_income - v_cash_expense - v_expenses - v_advances;

  RETURN QUERY SELECT 
    p_account_id,
    v_account.name,
    v_account.account_type,
    v_account.current_balance,
    v_calculated,
    (v_account.current_balance - v_calculated),
    json_build_object(
      'initial_balance', COALESCE(v_account.initial_balance, 0),
      'pos_sales', v_pos_sales,
      'receivables_payments', v_receivables,
      'cash_income', v_cash_income,
      'cash_expense', v_cash_expense,
      'expenses', v_expenses,
      'advances', v_advances
    )::JSONB,
    (ABS(v_account.current_balance - v_calculated) > 1000);
END;
$$;

-- ========================================
-- 3. SET INITIAL BALANCE FUNCTION
-- ========================================

CREATE OR REPLACE FUNCTION set_account_initial_balance(
  p_account_id TEXT,
  p_initial_balance NUMERIC,
  p_reason TEXT,
  p_user_id UUID,
  p_user_name TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  old_initial_balance NUMERIC,
  new_initial_balance NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_initial NUMERIC;
  v_account_name TEXT;
BEGIN
  -- Check if user is owner
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = p_user_id AND role = 'owner'
  ) THEN
    RETURN QUERY SELECT 
      false as success,
      'Access denied. Only owners can set initial balances.' as message,
      0::NUMERIC as old_initial_balance,
      0::NUMERIC as new_initial_balance;
    RETURN;
  END IF;

  -- Get current initial balance
  SELECT initial_balance, name INTO v_old_initial, v_account_name
  FROM accounts 
  WHERE id = p_account_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT 
      false as success,
      'Account not found.' as message,
      0::NUMERIC as old_initial_balance,
      0::NUMERIC as new_initial_balance;
    RETURN;
  END IF;

  -- Update initial balance
  UPDATE accounts 
  SET 
    initial_balance = p_initial_balance,
    updated_at = NOW()
  WHERE id = p_account_id;

  -- Log the change in cash_history
  INSERT INTO cash_history (
    account_id,
    transaction_type,
    amount,
    description,
    reference_number,
    created_by,
    created_by_name,
    source_type
  ) VALUES (
    p_account_id,
    'income',
    p_initial_balance,
    'Initial balance set: ' || COALESCE(p_reason, 'Initial balance setup'),
    'INIT-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS'),
    p_user_id,
    p_user_name,
    'initial_balance'
  );

  RETURN QUERY SELECT 
    true as success,
    'Initial balance set for ' || v_account_name || ' from ' || COALESCE(v_old_initial::TEXT, 'null') || ' to ' || p_initial_balance::TEXT as message,
    v_old_initial as old_initial_balance,
    p_initial_balance as new_initial_balance;
END;
$$;

-- ========================================
-- 4. CREATE BALANCE ADJUSTMENT LOG TABLE
-- ========================================

CREATE TABLE IF NOT EXISTS balance_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('reconciliation', 'initial_balance', 'correction')),
  old_balance NUMERIC,
  new_balance NUMERIC,
  adjustment_amount NUMERIC,
  reason TEXT NOT NULL,
  reference_number TEXT,
  adjusted_by UUID REFERENCES profiles(id),
  adjusted_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected'))
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_balance_adjustments_account_id ON balance_adjustments(account_id);
CREATE INDEX IF NOT EXISTS idx_balance_adjustments_created_at ON balance_adjustments(created_at);
CREATE INDEX IF NOT EXISTS idx_balance_adjustments_status ON balance_adjustments(status);

-- Enable RLS
ALTER TABLE balance_adjustments ENABLE ROW LEVEL SECURITY;

-- Create policy for owners only
CREATE POLICY "Only owners can manage balance adjustments" 
ON balance_adjustments FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'owner'
  )
);

-- ========================================
-- 5. GET ALL ACCOUNTS WITH BALANCE ANALYSIS
-- ========================================

CREATE OR REPLACE FUNCTION get_all_accounts_balance_analysis()
RETURNS TABLE (
  account_id TEXT,
  account_name TEXT,
  account_type TEXT,
  current_balance NUMERIC,
  calculated_balance NUMERIC,
  difference NUMERIC,
  needs_reconciliation BOOLEAN,
  last_updated TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    analysis.account_id,
    analysis.account_name,
    analysis.account_type,
    analysis.current_balance,
    analysis.calculated_balance,
    analysis.difference,
    analysis.needs_reconciliation,
    acc.updated_at
  FROM accounts acc,
  LATERAL get_account_balance_analysis(acc.id) analysis
  ORDER BY ABS(analysis.difference) DESC;
END;
$$;


-- ============================================
-- Migration 12: 0015_comprehensive_balance_reconciliation.sql
-- ============================================

-- COMPREHENSIVE BALANCE RECONCILIATION MIGRATION
-- This migration adapts to the current schema and creates all necessary components

-- ========================================
-- 1. UPDATE ACCOUNTS TABLE SCHEMA
-- ========================================

-- Add missing columns to accounts table if they don't exist
ALTER TABLE accounts 
ADD COLUMN IF NOT EXISTS current_balance NUMERIC DEFAULT 0;

ALTER TABLE accounts 
ADD COLUMN IF NOT EXISTS initial_balance NUMERIC DEFAULT 0;

ALTER TABLE accounts 
ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'cash';

ALTER TABLE accounts 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Update current_balance from balance column if it exists
UPDATE accounts 
SET current_balance = balance 
WHERE current_balance IS NULL OR current_balance = 0;

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_accounts_updated_at ON accounts;
CREATE TRIGGER update_accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- 2. CREATE CASH_HISTORY TABLE
-- ========================================

CREATE TABLE IF NOT EXISTS cash_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('income', 'expense')),
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  description TEXT NOT NULL,
  reference_number TEXT,
  created_by UUID REFERENCES profiles(id),
  created_by_name TEXT,
  source_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for cash_history
CREATE INDEX IF NOT EXISTS idx_cash_history_account_id ON cash_history(account_id);
CREATE INDEX IF NOT EXISTS idx_cash_history_created_at ON cash_history(created_at);
CREATE INDEX IF NOT EXISTS idx_cash_history_type ON cash_history(transaction_type);

-- Enable RLS for cash_history
ALTER TABLE cash_history ENABLE ROW LEVEL SECURITY;

-- Create policy for cash_history (owners and admins can manage)
CREATE POLICY "Owners and admins can manage cash history" 
ON cash_history FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role IN ('owner', 'admin')
  )
);

-- ========================================
-- 3. CREATE BALANCE RECONCILIATION FUNCTION
-- ========================================

CREATE OR REPLACE FUNCTION reconcile_account_balance(
  p_account_id TEXT,
  p_new_balance NUMERIC,
  p_reason TEXT,
  p_user_id UUID,
  p_user_name TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  old_balance NUMERIC,
  new_balance NUMERIC,
  adjustment_amount NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_balance NUMERIC;
  v_adjustment NUMERIC;
  v_account_name TEXT;
BEGIN
  -- Check if user is owner
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = p_user_id AND role = 'owner'
  ) THEN
    RETURN QUERY SELECT 
      false as success,
      'Access denied. Only owners can reconcile account balances.' as message,
      0::NUMERIC as old_balance,
      0::NUMERIC as new_balance,
      0::NUMERIC as adjustment_amount;
    RETURN;
  END IF;

  -- Get current account info
  SELECT current_balance, name INTO v_old_balance, v_account_name
  FROM accounts 
  WHERE id = p_account_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT 
      false as success,
      'Account not found.' as message,
      0::NUMERIC as old_balance,
      0::NUMERIC as new_balance,
      0::NUMERIC as adjustment_amount;
    RETURN;
  END IF;

  -- Calculate adjustment
  v_adjustment := p_new_balance - v_old_balance;

  -- Update account balance (both current_balance and balance for compatibility)
  UPDATE accounts 
  SET 
    current_balance = p_new_balance,
    balance = p_new_balance,
    updated_at = NOW()
  WHERE id = p_account_id;

  -- Log the reconciliation in cash_history table
  INSERT INTO cash_history (
    account_id,
    transaction_type,
    amount,
    description,
    reference_number,
    created_by,
    created_by_name,
    source_type
  ) VALUES (
    p_account_id,
    CASE WHEN v_adjustment >= 0 THEN 'income'::TEXT ELSE 'expense'::TEXT END,
    ABS(v_adjustment),
    COALESCE(p_reason, 'Balance reconciliation by owner'),
    'RECON-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS'),
    p_user_id,
    p_user_name,
    'reconciliation'
  );

  RETURN QUERY SELECT 
    true as success,
    'Account balance successfully reconciled from ' || v_old_balance::TEXT || ' to ' || p_new_balance::TEXT as message,
    v_old_balance as old_balance,
    p_new_balance as new_balance,
    v_adjustment as adjustment_amount;
END;
$$;

-- ========================================
-- 4. GET ACCOUNT BALANCE ANALYSIS FUNCTION
-- ========================================

CREATE OR REPLACE FUNCTION get_account_balance_analysis(p_account_id TEXT)
RETURNS TABLE (
  account_id TEXT,
  account_name TEXT,
  account_type TEXT,
  current_balance NUMERIC,
  calculated_balance NUMERIC,
  difference NUMERIC,
  transaction_breakdown JSONB,
  needs_reconciliation BOOLEAN
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_account RECORD;
  v_pos_sales NUMERIC := 0;
  v_receivables NUMERIC := 0;
  v_cash_income NUMERIC := 0;
  v_cash_expense NUMERIC := 0;
  v_expenses NUMERIC := 0;
  v_advances NUMERIC := 0;
  v_calculated NUMERIC;
BEGIN
  -- Get account info
  SELECT id, name, COALESCE(account_type, type) as account_type, 
         current_balance, initial_balance
  INTO v_account
  FROM accounts 
  WHERE id = p_account_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Calculate POS sales (check if payment_account column exists in transactions)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' AND column_name = 'payment_account'
  ) THEN
    SELECT COALESCE(SUM(total), 0) INTO v_pos_sales
    FROM transactions 
    WHERE payment_account = p_account_id 
    AND payment_status = 'Lunas';
  END IF;

  -- Calculate receivables payments (if table exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transaction_payments') THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_receivables
    FROM transaction_payments 
    WHERE account_id = p_account_id 
    AND status = 'active';
  END IF;

  -- Calculate cash history
  SELECT 
    COALESCE(SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END), 0)
  INTO v_cash_income, v_cash_expense
  FROM cash_history 
  WHERE account_id = p_account_id;

  -- Calculate expenses (if table exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'expenses') THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_expenses
    FROM expenses 
    WHERE account_id = p_account_id 
    AND status = 'approved';
  END IF;

  -- Calculate advances (if table exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'employee_advances') THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_advances
    FROM employee_advances 
    WHERE account_id = p_account_id 
    AND status = 'approved';
  END IF;

  -- Calculate total
  v_calculated := COALESCE(v_account.initial_balance, 0) + v_pos_sales + v_receivables + v_cash_income - v_cash_expense - v_expenses - v_advances;

  RETURN QUERY SELECT 
    p_account_id,
    v_account.name,
    v_account.account_type,
    v_account.current_balance,
    v_calculated,
    (v_account.current_balance - v_calculated),
    json_build_object(
      'initial_balance', COALESCE(v_account.initial_balance, 0),
      'pos_sales', v_pos_sales,
      'receivables_payments', v_receivables,
      'cash_income', v_cash_income,
      'cash_expense', v_cash_expense,
      'expenses', v_expenses,
      'advances', v_advances
    )::JSONB,
    (ABS(v_account.current_balance - v_calculated) > 1000);
END;
$$;

-- ========================================
-- 5. SET INITIAL BALANCE FUNCTION
-- ========================================

CREATE OR REPLACE FUNCTION set_account_initial_balance(
  p_account_id TEXT,
  p_initial_balance NUMERIC,
  p_reason TEXT,
  p_user_id UUID,
  p_user_name TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  old_initial_balance NUMERIC,
  new_initial_balance NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_initial NUMERIC;
  v_account_name TEXT;
BEGIN
  -- Check if user is owner
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = p_user_id AND role = 'owner'
  ) THEN
    RETURN QUERY SELECT 
      false as success,
      'Access denied. Only owners can set initial balances.' as message,
      0::NUMERIC as old_initial_balance,
      0::NUMERIC as new_initial_balance;
    RETURN;
  END IF;

  -- Get current initial balance
  SELECT initial_balance, name INTO v_old_initial, v_account_name
  FROM accounts 
  WHERE id = p_account_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT 
      false as success,
      'Account not found.' as message,
      0::NUMERIC as old_initial_balance,
      0::NUMERIC as new_initial_balance;
    RETURN;
  END IF;

  -- Update initial balance
  UPDATE accounts 
  SET 
    initial_balance = p_initial_balance,
    updated_at = NOW()
  WHERE id = p_account_id;

  -- Log the change in cash_history
  INSERT INTO cash_history (
    account_id,
    transaction_type,
    amount,
    description,
    reference_number,
    created_by,
    created_by_name,
    source_type
  ) VALUES (
    p_account_id,
    'income',
    p_initial_balance,
    'Initial balance set: ' || COALESCE(p_reason, 'Initial balance setup'),
    'INIT-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS'),
    p_user_id,
    p_user_name,
    'initial_balance'
  );

  RETURN QUERY SELECT 
    true as success,
    'Initial balance set for ' || v_account_name || ' from ' || COALESCE(v_old_initial::TEXT, 'null') || ' to ' || p_initial_balance::TEXT as message,
    v_old_initial as old_initial_balance,
    p_initial_balance as new_initial_balance;
END;
$$;

-- ========================================
-- 6. CREATE BALANCE ADJUSTMENT LOG TABLE
-- ========================================

CREATE TABLE IF NOT EXISTS balance_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('reconciliation', 'initial_balance', 'correction')),
  old_balance NUMERIC,
  new_balance NUMERIC,
  adjustment_amount NUMERIC,
  reason TEXT NOT NULL,
  reference_number TEXT,
  adjusted_by UUID REFERENCES profiles(id),
  adjusted_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected'))
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_balance_adjustments_account_id ON balance_adjustments(account_id);
CREATE INDEX IF NOT EXISTS idx_balance_adjustments_created_at ON balance_adjustments(created_at);
CREATE INDEX IF NOT EXISTS idx_balance_adjustments_status ON balance_adjustments(status);

-- Enable RLS
ALTER TABLE balance_adjustments ENABLE ROW LEVEL SECURITY;

-- Create policy for owners only
CREATE POLICY "Only owners can manage balance adjustments" 
ON balance_adjustments FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'owner'
  )
);

-- ========================================
-- 7. GET ALL ACCOUNTS WITH BALANCE ANALYSIS
-- ========================================

CREATE OR REPLACE FUNCTION get_all_accounts_balance_analysis()
RETURNS TABLE (
  account_id TEXT,
  account_name TEXT,
  account_type TEXT,
  current_balance NUMERIC,
  calculated_balance NUMERIC,
  difference NUMERIC,
  needs_reconciliation BOOLEAN,
  last_updated TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    analysis.account_id,
    analysis.account_name,
    analysis.account_type,
    analysis.current_balance,
    analysis.calculated_balance,
    analysis.difference,
    analysis.needs_reconciliation,
    acc.updated_at
  FROM accounts acc,
  LATERAL get_account_balance_analysis(acc.id) analysis
  ORDER BY ABS(analysis.difference) DESC;
END;
$$;

-- ========================================
-- 8. CREATE HELPER FUNCTION FOR MANUAL TESTING
-- ========================================

CREATE OR REPLACE FUNCTION test_balance_reconciliation_functions()
RETURNS TABLE (
  test_name TEXT,
  status TEXT,
  message TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_account_id TEXT;
  v_test_user_id UUID;
BEGIN
  -- Get first account for testing
  SELECT id INTO v_account_id FROM accounts LIMIT 1;
  
  -- Get first owner user for testing
  SELECT id INTO v_test_user_id FROM profiles WHERE role = 'owner' LIMIT 1;
  
  -- Test 1: Check if get_all_accounts_balance_analysis works
  BEGIN
    PERFORM * FROM get_all_accounts_balance_analysis() LIMIT 1;
    RETURN QUERY SELECT 
      'get_all_accounts_balance_analysis' as test_name,
      'SUCCESS' as status,
      'Function exists and executes successfully' as message;
  EXCEPTION WHEN others THEN
    RETURN QUERY SELECT 
      'get_all_accounts_balance_analysis' as test_name,
      'FAILED' as status,
      SQLERRM as message;
  END;
  
  -- Test 2: Check if get_account_balance_analysis works
  IF v_account_id IS NOT NULL THEN
    BEGIN
      PERFORM * FROM get_account_balance_analysis(v_account_id) LIMIT 1;
      RETURN QUERY SELECT 
        'get_account_balance_analysis' as test_name,
        'SUCCESS' as status,
        'Function exists and executes successfully' as message;
    EXCEPTION WHEN others THEN
      RETURN QUERY SELECT 
        'get_account_balance_analysis' as test_name,
        'FAILED' as status,
        SQLERRM as message;
    END;
  END IF;
  
  -- Test 3: Check if balance_adjustments table exists
  BEGIN
    PERFORM 1 FROM balance_adjustments LIMIT 1;
    RETURN QUERY SELECT 
      'balance_adjustments_table' as test_name,
      'SUCCESS' as status,
      'Table exists and accessible' as message;
  EXCEPTION WHEN others THEN
    RETURN QUERY SELECT 
      'balance_adjustments_table' as test_name,
      'FAILED' as status,
      SQLERRM as message;
  END;
  
  -- Test 4: Check if cash_history table exists
  BEGIN
    PERFORM 1 FROM cash_history LIMIT 1;
    RETURN QUERY SELECT 
      'cash_history_table' as test_name,
      'SUCCESS' as status,
      'Table exists and accessible' as message;
  EXCEPTION WHEN others THEN
    RETURN QUERY SELECT 
      'cash_history_table' as test_name,
      'FAILED' as status,
      SQLERRM as message;
  END;
  
END;
$$;


-- ============================================
-- Migration 13: 0016_deploy_reconciliation_functions_immediate.sql
-- ============================================

-- DEPLOY RECONCILIATION FUNCTIONS IMMEDIATELY
-- Created for Quick Fix feature deployment

-- ========================================
-- 1. CREATE CASH_HISTORY TABLE
-- ========================================

CREATE TABLE IF NOT EXISTS cash_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('income', 'expense')),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL,
  reference_number TEXT,
  source_type TEXT DEFAULT 'manual',
  created_by UUID REFERENCES profiles(id),
  created_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE cash_history ENABLE ROW LEVEL SECURITY;

-- Create policy
CREATE POLICY "Authenticated users can manage cash history" 
ON cash_history FOR ALL 
USING (auth.role() = 'authenticated');

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_cash_history_account_id ON cash_history(account_id);
CREATE INDEX IF NOT EXISTS idx_cash_history_created_at ON cash_history(created_at);

-- ========================================
-- 2. ADD MISSING COLUMNS TO ACCOUNTS
-- ========================================

-- Add initial_balance column if it doesn't exist
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS initial_balance NUMERIC DEFAULT 0;

-- Update column names for consistency (rename balance to current_balance)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS current_balance NUMERIC;

-- Copy existing balance to current_balance if current_balance is null
UPDATE accounts 
SET current_balance = balance 
WHERE current_balance IS NULL;

-- Add account_type column if it doesn't exist (map existing 'type' column)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS account_type TEXT;

-- Copy existing type to account_type if account_type is null
UPDATE accounts 
SET account_type = type 
WHERE account_type IS NULL;

-- ========================================
-- 3. RECONCILIATION FUNCTIONS
-- ========================================

-- Function to get account balance analysis
CREATE OR REPLACE FUNCTION get_account_balance_analysis(p_account_id TEXT)
RETURNS TABLE (
  account_id TEXT,
  account_name TEXT,
  account_type TEXT,
  current_balance NUMERIC,
  calculated_balance NUMERIC,
  difference NUMERIC,
  needs_reconciliation BOOLEAN
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_account RECORD;
  v_pos_sales NUMERIC := 0;
  v_cash_income NUMERIC := 0;
  v_cash_expense NUMERIC := 0;
  v_expenses NUMERIC := 0;
  v_advances NUMERIC := 0;
  v_calculated NUMERIC;
BEGIN
  -- Get account info
  SELECT id, name, COALESCE(account_type, type) as account_type, current_balance, initial_balance
  INTO v_account
  FROM accounts 
  WHERE id = p_account_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Calculate POS sales (using payment_account column in transactions)
  SELECT COALESCE(SUM(total), 0) INTO v_pos_sales
  FROM transactions 
  WHERE payment_account = p_account_id 
  AND payment_status = 'Lunas';

  -- Calculate cash history
  SELECT 
    COALESCE(SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END), 0)
  INTO v_cash_income, v_cash_expense
  FROM cash_history 
  WHERE account_id = p_account_id;

  -- Calculate expenses
  SELECT COALESCE(SUM(amount), 0) INTO v_expenses
  FROM expenses 
  WHERE account_id = p_account_id 
  AND status = 'approved';

  -- Calculate advances
  SELECT COALESCE(SUM(amount), 0) INTO v_advances
  FROM employee_advances 
  WHERE account_id = p_account_id 
  AND status = 'approved';

  -- Calculate total
  v_calculated := COALESCE(v_account.initial_balance, 0) + v_pos_sales + v_cash_income - v_cash_expense - v_expenses - v_advances;

  RETURN QUERY SELECT 
    p_account_id,
    v_account.name,
    v_account.account_type,
    v_account.current_balance,
    v_calculated,
    (v_account.current_balance - v_calculated),
    (ABS(v_account.current_balance - v_calculated) > 1000);
END;
$$;

-- Function to get all accounts analysis
CREATE OR REPLACE FUNCTION get_all_accounts_balance_analysis()
RETURNS TABLE (
  account_id TEXT,
  account_name TEXT,
  account_type TEXT,
  current_balance NUMERIC,
  calculated_balance NUMERIC,
  difference NUMERIC,
  needs_reconciliation BOOLEAN,
  last_updated TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    analysis.account_id,
    analysis.account_name,
    analysis.account_type,
    analysis.current_balance,
    analysis.calculated_balance,
    analysis.difference,
    analysis.needs_reconciliation,
    COALESCE(acc.updated_at, acc.created_at, NOW()) as last_updated
  FROM accounts acc,
  LATERAL get_account_balance_analysis(acc.id) analysis
  ORDER BY ABS(analysis.difference) DESC;
END;
$$;

-- Function to reconcile account balance (OWNER ONLY)
CREATE OR REPLACE FUNCTION reconcile_account_balance(
  p_account_id TEXT,
  p_new_balance NUMERIC,
  p_reason TEXT,
  p_user_id UUID,
  p_user_name TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  old_balance NUMERIC,
  new_balance NUMERIC,
  adjustment_amount NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_balance NUMERIC;
  v_adjustment NUMERIC;
  v_account_name TEXT;
BEGIN
  -- Check if user is owner
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = p_user_id AND role = 'owner'
  ) THEN
    RETURN QUERY SELECT 
      false as success,
      'Access denied. Only owners can reconcile account balances.' as message,
      0::NUMERIC as old_balance,
      0::NUMERIC as new_balance,
      0::NUMERIC as adjustment_amount;
    RETURN;
  END IF;

  -- Get current account info
  SELECT current_balance, name INTO v_old_balance, v_account_name
  FROM accounts 
  WHERE id = p_account_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT 
      false as success,
      'Account not found.' as message,
      0::NUMERIC as old_balance,
      0::NUMERIC as new_balance,
      0::NUMERIC as adjustment_amount;
    RETURN;
  END IF;

  -- Calculate adjustment
  v_adjustment := p_new_balance - v_old_balance;

  -- Update account balance
  UPDATE accounts 
  SET 
    current_balance = p_new_balance,
    updated_at = NOW()
  WHERE id = p_account_id;

  -- Log the reconciliation in cash_history table
  INSERT INTO cash_history (
    account_id,
    transaction_type,
    amount,
    description,
    reference_number,
    created_by,
    created_by_name,
    source_type
  ) VALUES (
    p_account_id,
    CASE WHEN v_adjustment >= 0 THEN 'income'::TEXT ELSE 'expense'::TEXT END,
    ABS(v_adjustment),
    COALESCE(p_reason, 'Balance reconciliation by owner'),
    'RECON-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS'),
    p_user_id,
    p_user_name,
    'reconciliation'
  );

  RETURN QUERY SELECT 
    true as success,
    'Account balance successfully reconciled from ' || v_old_balance::TEXT || ' to ' || p_new_balance::TEXT as message,
    v_old_balance as old_balance,
    p_new_balance as new_balance,
    v_adjustment as adjustment_amount;
END;
$$;

-- Function to set initial balance (OWNER ONLY)
CREATE OR REPLACE FUNCTION set_account_initial_balance(
  p_account_id TEXT,
  p_initial_balance NUMERIC,
  p_reason TEXT,
  p_user_id UUID,
  p_user_name TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  old_initial_balance NUMERIC,
  new_initial_balance NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_initial NUMERIC;
  v_account_name TEXT;
BEGIN
  -- Check if user is owner
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = p_user_id AND role = 'owner'
  ) THEN
    RETURN QUERY SELECT 
      false as success,
      'Access denied. Only owners can set initial balances.' as message,
      0::NUMERIC as old_initial_balance,
      0::NUMERIC as new_initial_balance;
    RETURN;
  END IF;

  -- Get current initial balance
  SELECT initial_balance, name INTO v_old_initial, v_account_name
  FROM accounts 
  WHERE id = p_account_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT 
      false as success,
      'Account not found.' as message,
      0::NUMERIC as old_initial_balance,
      0::NUMERIC as new_initial_balance;
    RETURN;
  END IF;

  -- Update initial balance
  UPDATE accounts 
  SET 
    initial_balance = p_initial_balance,
    updated_at = NOW()
  WHERE id = p_account_id;

  -- Log the change in cash_history
  INSERT INTO cash_history (
    account_id,
    transaction_type,
    amount,
    description,
    reference_number,
    created_by,
    created_by_name,
    source_type
  ) VALUES (
    p_account_id,
    'income',
    p_initial_balance,
    'Initial balance set: ' || COALESCE(p_reason, 'Initial balance setup'),
    'INIT-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS'),
    p_user_id,
    p_user_name,
    'initial_balance'
  );

  RETURN QUERY SELECT 
    true as success,
    'Initial balance set for ' || v_account_name || ' from ' || COALESCE(v_old_initial::TEXT, 'null') || ' to ' || p_initial_balance::TEXT as message,
    v_old_initial as old_initial_balance,
    p_initial_balance as new_initial_balance;
END;
$$;


-- ============================================
-- Migration 14: 0017_update_retasi_with_counter_system.sql
-- ============================================

-- Update retasi table: remove status, add retasi_ke and returned_items fields
ALTER TABLE public.retasi 
DROP COLUMN IF EXISTS status,
ADD COLUMN IF NOT EXISTS retasi_ke INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS is_returned BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS returned_items_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS error_items_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS return_notes TEXT;

-- Create function to get next retasi counter for driver per day
CREATE OR REPLACE FUNCTION get_next_retasi_counter(driver TEXT, target_date DATE DEFAULT CURRENT_DATE)
RETURNS INTEGER AS $$
DECLARE
  counter INTEGER;
BEGIN
  -- Get the highest retasi_ke for the driver on the specific date
  SELECT COALESCE(MAX(retasi_ke), 0) + 1
  INTO counter
  FROM public.retasi
  WHERE driver_name = driver 
    AND departure_date = target_date;
  
  RETURN counter;
END;
$$ LANGUAGE plpgsql;

-- Create function to check if driver has unreturned retasi
CREATE OR REPLACE FUNCTION driver_has_unreturned_retasi(driver TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  count_unreturned INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO count_unreturned
  FROM public.retasi
  WHERE driver_name = driver 
    AND is_returned = FALSE;
  
  RETURN count_unreturned > 0;
END;
$$ LANGUAGE plpgsql;

-- Update the retasi number generation function to include retasi_ke
CREATE OR REPLACE FUNCTION generate_retasi_number()
RETURNS TEXT AS $$
DECLARE
  new_number TEXT;
  counter INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(retasi_number FROM 12 FOR 3) AS INTEGER)), 0) + 1
  INTO counter
  FROM public.retasi
  WHERE retasi_number LIKE 'RET-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-%';
  
  new_number := 'RET-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD(counter::TEXT, 3, '0');
  
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-set retasi_ke before insert
CREATE OR REPLACE FUNCTION set_retasi_ke()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-generate retasi number if not provided
  IF NEW.retasi_number IS NULL OR NEW.retasi_number = '' THEN
    NEW.retasi_number := generate_retasi_number();
  END IF;
  
  -- Auto-set retasi_ke based on driver and date
  IF NEW.driver_name IS NOT NULL THEN
    NEW.retasi_ke := get_next_retasi_counter(NEW.driver_name, NEW.departure_date);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Replace the old trigger
DROP TRIGGER IF EXISTS trigger_set_retasi_number ON public.retasi;
CREATE TRIGGER trigger_set_retasi_ke_and_number
  BEFORE INSERT ON public.retasi
  FOR EACH ROW
  EXECUTE FUNCTION set_retasi_ke();

-- Create function to mark retasi as returned
CREATE OR REPLACE FUNCTION mark_retasi_returned(
  retasi_id UUID,
  returned_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.retasi 
  SET 
    is_returned = TRUE,
    returned_items_count = returned_count,
    error_items_count = error_count,
    return_notes = notes,
    updated_at = NOW()
  WHERE id = retasi_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_retasi_driver_date ON public.retasi(driver_name, departure_date);
CREATE INDEX IF NOT EXISTS idx_retasi_returned ON public.retasi(is_returned);

-- Update existing retasi records to have retasi_ke = 1 if not set
UPDATE public.retasi 
SET retasi_ke = 1 
WHERE retasi_ke IS NULL;

-- Success message
SELECT 'Retasi counter system updated successfully!' as status;


-- ============================================
-- Migration 15: 0018_memperbaiki_aturan_keamanan_untuk_edit_data_karyawan.sql
-- ============================================

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

CREATE POLICY "Admins can update all profiles"
ON public.profiles
FOR UPDATE
USING (public.get_current_user_role() IN ('admin', 'owner'))
WITH CHECK (public.get_current_user_role() IN ('admin', 'owner'));


-- ============================================
-- Migration 16: 001_create_transaction_payment_tracking.sql
-- ============================================

-- CREATE SIMPLE TRANSACTION PAYMENT TRACKING SYSTEM
-- Transaction sebagai parent data - menggunakan kolom minimal yang pasti ada

-- ========================================
-- STEP 1: CREATE PAYMENT TRACKING TABLE
-- ========================================

CREATE TABLE IF NOT EXISTS public.transaction_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Transaction Reference (PARENT)
  transaction_id TEXT NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  
  -- Payment Details
  payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'bank_transfer', 'check', 'digital_wallet')),
  
  -- Account Information
  account_id TEXT REFERENCES public.accounts(id),
  account_name TEXT NOT NULL,
  
  -- Payment Description
  description TEXT NOT NULL,
  notes TEXT,
  reference_number TEXT,
  
  -- User Tracking
  paid_by_user_id UUID REFERENCES public.profiles(id),
  paid_by_user_name TEXT NOT NULL,
  paid_by_user_role TEXT,
  
  -- Audit Trail
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id),
  
  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'deleted')),
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES public.profiles(id),
  cancelled_reason TEXT
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_transaction_payments_transaction_id ON public.transaction_payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_payments_date ON public.transaction_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_transaction_payments_status ON public.transaction_payments(status);

-- ========================================
-- STEP 2: PAYMENT STATUS FUNCTION
-- ========================================

CREATE OR REPLACE FUNCTION public.calculate_transaction_payment_status(
  p_transaction_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  transaction_total NUMERIC;
  total_paid NUMERIC;
BEGIN
  -- Get transaction total
  SELECT total INTO transaction_total FROM transactions WHERE id = p_transaction_id;
  IF transaction_total IS NULL THEN RETURN 'unknown'; END IF;
  
  -- Calculate total payments (active only)
  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM transaction_payments 
  WHERE transaction_id = p_transaction_id AND status = 'active';
  
  -- Return status
  IF total_paid = 0 THEN RETURN 'unpaid';
  ELSIF total_paid >= transaction_total THEN RETURN 'paid';
  ELSE RETURN 'partial';
  END IF;
END;
$$;

-- ========================================
-- STEP 3: SIMPLE TRANSACTION DETAIL VIEW
-- ========================================

CREATE OR REPLACE VIEW public.transaction_detail_report AS
WITH payment_summary AS (
  SELECT 
    tp.transaction_id,
    COUNT(*) as payment_count,
    SUM(tp.amount) as total_paid,
    MIN(tp.payment_date) as first_payment_date,
    MAX(tp.payment_date) as last_payment_date,
    ARRAY_AGG(
      JSON_BUILD_OBJECT(
        'id', tp.id,
        'payment_date', tp.payment_date,
        'amount', tp.amount,
        'payment_method', tp.payment_method,
        'account_name', tp.account_name,
        'description', tp.description,
        'notes', tp.notes,
        'reference_number', tp.reference_number,
        'paid_by_user_name', tp.paid_by_user_name,
        'paid_by_user_role', tp.paid_by_user_role,
        'created_at', tp.created_at,
        'status', tp.status
      ) ORDER BY tp.payment_date DESC
    ) as payment_details
  FROM transaction_payments tp
  WHERE tp.status = 'active'
  GROUP BY tp.transaction_id
)
SELECT 
  -- Transaction Basic Info (minimal columns yang pasti ada)
  t.id as transaction_id,
  t.created_at as transaction_date,
  t.customer_name,
  COALESCE(c.phone, '') as customer_phone,
  COALESCE(c.address, '') as customer_address,
  '' as transaction_description,  -- Empty placeholder
  '' as transaction_notes,        -- Empty placeholder
  
  -- Financial Summary (kolom yang pasti ada)
  (t.total - t.paid_amount) as subtotal,
  0 as discount,  -- Default 0 jika tidak ada
  0 as ppn_amount,  -- Tidak ada kolom ppn_amount di tabel
  t.total as transaction_total,
  t.paid_amount as legacy_paid_amount,
  
  -- Payment Information
  COALESCE(ps.payment_count, 0) as payment_count,
  COALESCE(ps.total_paid, 0) as total_paid,
  (t.total - COALESCE(ps.total_paid, 0)) as remaining_balance,
  ps.first_payment_date,
  ps.last_payment_date,
  
  -- Payment Status
  calculate_transaction_payment_status(t.id) as payment_status,
  CASE 
    WHEN calculate_transaction_payment_status(t.id) = 'unpaid' THEN 'Belum Bayar'
    WHEN calculate_transaction_payment_status(t.id) = 'partial' THEN 'Bayar Partial'
    WHEN calculate_transaction_payment_status(t.id) = 'paid' THEN 'Lunas'
    ELSE 'Unknown'
  END as payment_status_label,
  
  -- Payment Details JSON
  ps.payment_details,
  
  -- Transaction Items (dari JSONB kolom items)
  t.items as transaction_items,
  
  -- Audit Info
  t.cashier_name as transaction_created_by,
  t.created_at as transaction_created_at,
  t.created_at as transaction_updated_at
  
FROM transactions t
LEFT JOIN payment_summary ps ON t.id = ps.transaction_id
LEFT JOIN customers c ON t.customer_id = c.id
ORDER BY t.created_at DESC;

-- ========================================
-- STEP 4: PAYMENT RECORDING FUNCTION
-- ========================================

CREATE OR REPLACE FUNCTION public.record_receivable_payment(
  p_transaction_id TEXT,
  p_amount NUMERIC,
  p_payment_method TEXT DEFAULT 'cash',
  p_account_id TEXT DEFAULT NULL,
  p_account_name TEXT DEFAULT 'Kas',
  p_description TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_reference_number TEXT DEFAULT NULL,
  p_paid_by_user_id UUID DEFAULT NULL,
  p_paid_by_user_name TEXT DEFAULT 'System',
  p_paid_by_user_role TEXT DEFAULT 'staff'
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  payment_id UUID;
  transaction_total NUMERIC;
  current_paid NUMERIC;
  new_payment_description TEXT;
BEGIN
  -- Validate transaction exists
  SELECT total INTO transaction_total FROM transactions WHERE id = p_transaction_id;
  IF transaction_total IS NULL THEN
    RAISE EXCEPTION 'Transaction not found: %', p_transaction_id;
  END IF;
  
  -- Calculate current paid amount
  SELECT COALESCE(SUM(amount), 0) INTO current_paid
  FROM transaction_payments 
  WHERE transaction_id = p_transaction_id AND status = 'active';
  
  -- Validate payment amount
  IF (current_paid + p_amount) > transaction_total THEN
    RAISE EXCEPTION 'Payment amount exceeds remaining balance';
  END IF;
  
  -- Generate description
  new_payment_description := COALESCE(p_description, 'Pembayaran piutang - ' || 
    CASE 
      WHEN (current_paid + p_amount) >= transaction_total THEN 'Pelunasan'
      ELSE 'Pembayaran ke-' || ((SELECT COUNT(*) FROM transaction_payments WHERE transaction_id = p_transaction_id AND status = 'active') + 1)
    END
  );
  
  -- Insert payment record
  INSERT INTO transaction_payments (
    transaction_id, amount, payment_method, account_id, account_name,
    description, notes, reference_number,
    paid_by_user_id, paid_by_user_name, paid_by_user_role, created_by
  ) VALUES (
    p_transaction_id, p_amount, p_payment_method, p_account_id, p_account_name,
    new_payment_description, p_notes, p_reference_number,
    p_paid_by_user_id, p_paid_by_user_name, p_paid_by_user_role, p_paid_by_user_id
  )
  RETURNING id INTO payment_id;
  
  -- Update transaction
  UPDATE transactions 
  SET 
    paid_amount = current_paid + p_amount,
    payment_status = CASE 
      WHEN current_paid + p_amount >= total THEN 'Lunas'::text
      ELSE 'Belum Lunas'::text
    END
  WHERE id = p_transaction_id;
  
  RETURN payment_id;
END;
$$;

-- ========================================
-- STEP 5: DELETE FUNCTIONS
-- ========================================

-- Cascading delete
CREATE OR REPLACE FUNCTION public.delete_transaction_cascade(
  p_transaction_id TEXT,
  p_deleted_by UUID DEFAULT NULL,
  p_reason TEXT DEFAULT 'Manual deletion'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  -- Soft delete payments
  UPDATE transaction_payments 
  SET status = 'deleted', cancelled_at = NOW(), cancelled_by = p_deleted_by,
      cancelled_reason = 'Transaction deleted: ' || p_reason
  WHERE transaction_id = p_transaction_id AND status = 'active';
  
  -- Delete main transaction (items are stored as JSONB, no separate table)
  DELETE FROM transactions WHERE id = p_transaction_id;
  
  RETURN TRUE;
END;
$$;

-- Cancel payment
CREATE OR REPLACE FUNCTION public.cancel_transaction_payment(
  p_payment_id UUID,
  p_cancelled_by UUID DEFAULT NULL,
  p_reason TEXT DEFAULT 'Payment cancelled'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  transaction_id_var TEXT;
  payment_amount NUMERIC;
  new_paid_amount NUMERIC;
BEGIN
  -- Get payment info
  SELECT transaction_id, amount INTO transaction_id_var, payment_amount
  FROM transaction_payments WHERE id = p_payment_id AND status = 'active';
  
  IF transaction_id_var IS NULL THEN
    RAISE EXCEPTION 'Payment not found or already cancelled';
  END IF;
  
  -- Cancel payment
  UPDATE transaction_payments 
  SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = p_cancelled_by, cancelled_reason = p_reason
  WHERE id = p_payment_id;
  
  -- Update transaction
  SELECT COALESCE(SUM(amount), 0) INTO new_paid_amount
  FROM transaction_payments WHERE transaction_id = transaction_id_var AND status = 'active';
  
  UPDATE transactions 
  SET paid_amount = new_paid_amount,
      payment_status = CASE WHEN new_paid_amount >= total THEN 'Lunas'::text ELSE 'Belum Lunas'::text END
  WHERE id = transaction_id_var;
  
  RETURN TRUE;
END;
$$;

-- Enable RLS on new table
ALTER TABLE public.transaction_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage transaction payments" ON public.transaction_payments FOR ALL USING (auth.role() = 'authenticated');


-- ============================================
-- Migration 17: 0020_create_roles_table.sql
-- ============================================

-- Create roles table for dynamic role management
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  permissions JSONB DEFAULT '{}',
  is_system_role BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Everyone can view active roles" ON public.roles
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins and owners can manage roles" ON public.roles
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users u
      JOIN public.profiles p ON u.id = p.id
      WHERE u.id = auth.uid() 
      AND p.role IN ('admin', 'owner')
    )
  );

-- Insert default system roles
INSERT INTO public.roles (name, display_name, description, permissions, is_system_role, is_active) VALUES
('owner', 'Owner', 'Pemilik perusahaan dengan akses penuh', '{"all": true}', true, true),
('admin', 'Administrator', 'Administrator sistem dengan akses luas', '{"manage_users": true, "manage_products": true, "manage_transactions": true, "view_reports": true}', true, true),
('supervisor', 'Supervisor', 'Supervisor operasional', '{"manage_products": true, "manage_transactions": true, "view_reports": true}', true, true),
('cashier', 'Kasir', 'Kasir untuk transaksi penjualan', '{"create_transactions": true, "manage_customers": true}', true, true),
('designer', 'Desainer', 'Desainer produk dan quotation', '{"create_quotations": true, "manage_products": true}', true, true),
('operator', 'Operator', 'Operator produksi', '{"view_products": true, "update_production": true}', true, true)
ON CONFLICT (name) DO NOTHING;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_roles_name ON public.roles(name);
CREATE INDEX IF NOT EXISTS idx_roles_active ON public.roles(is_active);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON public.roles 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE public.roles IS 'Table untuk menyimpan role/jabatan yang bisa dikelola secara dinamis';
COMMENT ON COLUMN public.roles.name IS 'Nama unik role (lowercase, untuk sistem)';
COMMENT ON COLUMN public.roles.display_name IS 'Nama tampilan role (untuk UI)';
COMMENT ON COLUMN public.roles.permissions IS 'JSON object berisi permission untuk role ini';
COMMENT ON COLUMN public.roles.is_system_role IS 'Apakah ini system role yang tidak bisa dihapus';
COMMENT ON COLUMN public.roles.is_active IS 'Status aktif role';


-- ============================================
-- Migration 18: 0021_membuat_tabel_dan_tipe_data_untuk_fitur_absensi_.sql
-- ============================================

-- Membuat tipe data baru untuk status absensi
CREATE TYPE attendance_status AS ENUM ('Hadir', 'Pulang');

-- Membuat tabel untuk menyimpan catatan absensi
CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  check_in_time TIMESTAMPTZ NOT NULL,
  check_out_time TIMESTAMPTZ,
  status attendance_status NOT NULL,
  location_check_in TEXT,
  location_check_out TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mengaktifkan Row Level Security
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- Kebijakan: Pengguna hanya bisa memasukkan data absensi untuk dirinya sendiri
CREATE POLICY "Users can insert their own attendance"
ON public.attendance FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Kebijakan: Pengguna hanya bisa melihat data absensinya sendiri
CREATE POLICY "Users can view their own attendance"
ON public.attendance FOR SELECT
USING (auth.uid() = user_id);

-- Kebijakan: Pengguna hanya bisa mengupdate data absensinya sendiri (untuk clock-out)
CREATE POLICY "Users can update their own attendance"
ON public.attendance FOR UPDATE
USING (auth.uid() = user_id);

-- Kebijakan: Admin/Owner bisa melihat semua data absensi
CREATE POLICY "Admins and owners can view all attendance"
ON public.attendance FOR SELECT
USING (get_current_user_role() IN ('admin', 'owner'));


-- ============================================
-- Migration 19: 0022_menambahkan_kolom_initial_balance_pada_tabel_accounts.sql
-- ============================================

-- Add initial_balance column to accounts table
-- This separates the initial balance (set by owner) from current balance (calculated)

-- Add the new column
ALTER TABLE public.accounts ADD COLUMN initial_balance NUMERIC DEFAULT 0;

-- Update existing accounts to set initial_balance equal to current balance
-- This preserves existing data during migration
UPDATE public.accounts SET initial_balance = balance;

-- Make initial_balance NOT NULL after setting values
ALTER TABLE public.accounts ALTER COLUMN initial_balance SET NOT NULL;

-- Add comment to explain the columns
COMMENT ON COLUMN public.accounts.initial_balance IS 'Saldo awal yang diinput oleh owner, tidak berubah kecuali diupdate manual';
COMMENT ON COLUMN public.accounts.balance IS 'Saldo saat ini yang dihitung dari initial_balance + semua transaksi';


-- ============================================
-- Migration 20: 0023_membuat_tabel_account_transfers.sql
-- ============================================

-- Create account transfers table to track transfer history
CREATE TABLE public.account_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_account_id TEXT NOT NULL,
  to_account_id TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  description TEXT NOT NULL,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Foreign key constraints
  CONSTRAINT fk_from_account 
    FOREIGN KEY (from_account_id) 
    REFERENCES public.accounts(id) 
    ON DELETE CASCADE,
    
  CONSTRAINT fk_to_account 
    FOREIGN KEY (to_account_id) 
    REFERENCES public.accounts(id) 
    ON DELETE CASCADE,
    
  CONSTRAINT fk_user 
    FOREIGN KEY (user_id) 
    REFERENCES public.users(id) 
    ON DELETE CASCADE,
    
  -- Ensure positive transfer amount
  CONSTRAINT positive_amount CHECK (amount > 0),
  
  -- Ensure different accounts
  CONSTRAINT different_accounts CHECK (from_account_id != to_account_id)
);

-- Enable Row Level Security
ALTER TABLE public.account_transfers ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users to view transfers
CREATE POLICY "Authenticated users can view account transfers" 
ON public.account_transfers FOR SELECT 
USING (auth.role() = 'authenticated');

-- Create policy for authenticated users to insert transfers
CREATE POLICY "Authenticated users can create account transfers" 
ON public.account_transfers FOR INSERT 
USING (auth.role() = 'authenticated');

-- Create indexes for better performance
CREATE INDEX idx_account_transfers_from_account ON public.account_transfers(from_account_id);
CREATE INDEX idx_account_transfers_to_account ON public.account_transfers(to_account_id);
CREATE INDEX idx_account_transfers_user ON public.account_transfers(user_id);
CREATE INDEX idx_account_transfers_created_at ON public.account_transfers(created_at DESC);

-- Add comments
COMMENT ON TABLE public.account_transfers IS 'History of transfers between accounts';
COMMENT ON COLUMN public.account_transfers.from_account_id IS 'Source account ID';
COMMENT ON COLUMN public.account_transfers.to_account_id IS 'Destination account ID';
COMMENT ON COLUMN public.account_transfers.amount IS 'Transfer amount';
COMMENT ON COLUMN public.account_transfers.description IS 'Transfer description/purpose';
COMMENT ON COLUMN public.account_transfers.user_id IS 'User who performed the transfer';
COMMENT ON COLUMN public.account_transfers.user_name IS 'Name of user who performed the transfer';


-- ============================================
-- Migration 21: 0024_add_product_type_and_stock_fields.sql
-- ============================================

-- Add new fields to products table for stock management and product types
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'Stock' CHECK (type IN ('Stock', 'Beli')),
ADD COLUMN IF NOT EXISTS current_stock NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS min_stock NUMERIC DEFAULT 0;

-- Add comments for new columns
COMMENT ON COLUMN public.products.type IS 'Jenis barang: Stock (produksi menurunkan stock), Beli (produksi menambah stock)';
COMMENT ON COLUMN public.products.current_stock IS 'Stock saat ini';
COMMENT ON COLUMN public.products.min_stock IS 'Stock minimum untuk alert';

-- Create stock_movements table to track all stock changes
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('IN', 'OUT', 'ADJUSTMENT')),
  reason TEXT NOT NULL CHECK (reason IN ('PURCHASE', 'PRODUCTION', 'SALES', 'ADJUSTMENT', 'RETURN')),
  quantity NUMERIC NOT NULL,
  previous_stock NUMERIC NOT NULL,
  new_stock NUMERIC NOT NULL,
  notes TEXT,
  reference_id TEXT,
  reference_type TEXT,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Foreign key constraints
  CONSTRAINT fk_stock_movement_product 
    FOREIGN KEY (product_id) 
    REFERENCES public.products(id) 
    ON DELETE CASCADE,
    
  CONSTRAINT fk_stock_movement_user 
    FOREIGN KEY (user_id) 
    REFERENCES public.users(id) 
    ON DELETE CASCADE,
    
  -- Ensure positive quantity
  CONSTRAINT positive_quantity CHECK (quantity > 0)
);

-- Enable Row Level Security
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users to view stock movements
CREATE POLICY IF NOT EXISTS "Authenticated users can view stock movements" 
ON public.stock_movements FOR SELECT 
USING (auth.role() = 'authenticated');

-- Create policy for authenticated users to insert stock movements
CREATE POLICY IF NOT EXISTS "Authenticated users can create stock movements" 
ON public.stock_movements FOR INSERT 
USING (auth.role() = 'authenticated');

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_user ON public.stock_movements(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON public.stock_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference ON public.stock_movements(reference_id, reference_type);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type_reason ON public.stock_movements(type, reason);

-- Add comments to stock_movements table
COMMENT ON TABLE public.stock_movements IS 'History of all stock movements and changes';
COMMENT ON COLUMN public.stock_movements.type IS 'Type of movement: IN (stock bertambah), OUT (stock berkurang), ADJUSTMENT (penyesuaian)';
COMMENT ON COLUMN public.stock_movements.reason IS 'Reason for movement: PURCHASE, PRODUCTION, SALES, ADJUSTMENT, RETURN';
COMMENT ON COLUMN public.stock_movements.quantity IS 'Quantity moved (always positive)';
COMMENT ON COLUMN public.stock_movements.previous_stock IS 'Stock before this movement';
COMMENT ON COLUMN public.stock_movements.new_stock IS 'Stock after this movement';
COMMENT ON COLUMN public.stock_movements.reference_id IS 'ID of related record (transaction, purchase order, etc)';
COMMENT ON COLUMN public.stock_movements.reference_type IS 'Type of reference (transaction, purchase_order, etc)';

-- Update existing products to have default values for new fields
UPDATE public.products 
SET 
  type = 'Stock',
  current_stock = 0,
  min_stock = 0
WHERE type IS NULL OR current_stock IS NULL OR min_stock IS NULL;


-- ============================================
-- Migration 22: 0025_create_simple_retasi_table.sql
-- ============================================

-- Simple retasi table creation
CREATE TABLE IF NOT EXISTS public.retasi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retasi_number TEXT NOT NULL UNIQUE,
  truck_number TEXT,
  driver_name TEXT,
  helper_name TEXT,
  departure_date DATE NOT NULL,
  departure_time TIME,
  route TEXT,
  total_items INTEGER DEFAULT 0,
  total_weight DECIMAL(10,2),
  notes TEXT,
  retasi_ke INTEGER NOT NULL DEFAULT 1,
  is_returned BOOLEAN DEFAULT FALSE,
  returned_items_count INTEGER DEFAULT 0,
  error_items_count INTEGER DEFAULT 0,
  return_notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.retasi ENABLE ROW LEVEL SECURITY;

-- Create RLS policies - allow all operations for authenticated users
CREATE POLICY "retasi_access" ON public.retasi
FOR ALL USING (auth.uid() IS NOT NULL);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_retasi_departure_date ON public.retasi(departure_date);
CREATE INDEX IF NOT EXISTS idx_retasi_driver_date ON public.retasi(driver_name, departure_date);
CREATE INDEX IF NOT EXISTS idx_retasi_returned ON public.retasi(is_returned);

-- Create function to get next retasi counter for driver per day
CREATE OR REPLACE FUNCTION get_next_retasi_counter(driver TEXT, target_date DATE DEFAULT CURRENT_DATE)
RETURNS INTEGER AS $$
DECLARE
  counter INTEGER;
BEGIN
  -- Get the highest retasi_ke for the driver on the specific date
  SELECT COALESCE(MAX(retasi_ke), 0) + 1
  INTO counter
  FROM public.retasi
  WHERE driver_name = driver 
    AND departure_date = target_date;
  
  RETURN counter;
END;
$$ LANGUAGE plpgsql;

-- Create function to check if driver has unreturned retasi
CREATE OR REPLACE FUNCTION driver_has_unreturned_retasi(driver TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  count_unreturned INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO count_unreturned
  FROM public.retasi
  WHERE driver_name = driver 
    AND is_returned = FALSE;
  
  RETURN count_unreturned > 0;
END;
$$ LANGUAGE plpgsql;

-- Create function to generate retasi number
CREATE OR REPLACE FUNCTION generate_retasi_number()
RETURNS TEXT AS $$
DECLARE
  new_number TEXT;
  counter INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(retasi_number FROM 12 FOR 3) AS INTEGER)), 0) + 1
  INTO counter
  FROM public.retasi
  WHERE retasi_number LIKE 'RET-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-%';
  
  new_number := 'RET-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD(counter::TEXT, 3, '0');
  
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-set retasi_ke and number before insert
CREATE OR REPLACE FUNCTION set_retasi_ke_and_number()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-generate retasi number if not provided
  IF NEW.retasi_number IS NULL OR NEW.retasi_number = '' THEN
    NEW.retasi_number := generate_retasi_number();
  END IF;
  
  -- Auto-set retasi_ke based on driver and date
  IF NEW.driver_name IS NOT NULL THEN
    NEW.retasi_ke := get_next_retasi_counter(NEW.driver_name, NEW.departure_date);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_retasi_ke_and_number
  BEFORE INSERT ON public.retasi
  FOR EACH ROW
  EXECUTE FUNCTION set_retasi_ke_and_number();

-- Create function to mark retasi as returned
CREATE OR REPLACE FUNCTION mark_retasi_returned(
  retasi_id UUID,
  returned_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.retasi 
  SET 
    is_returned = TRUE,
    returned_items_count = returned_count,
    error_items_count = error_count,
    return_notes = notes,
    updated_at = NOW()
  WHERE id = retasi_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Create updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create updated_at trigger
CREATE TRIGGER update_retasi_updated_at 
  BEFORE UPDATE ON public.retasi 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Success message
SELECT 'Simple retasi table created successfully!' as status;


-- ============================================
-- Migration 23: 0026_create_production_tables.sql
-- ============================================

-- Create production_records table
CREATE TABLE production_records (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ref VARCHAR(50) NOT NULL UNIQUE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
    note TEXT,
    consume_bom BOOLEAN NOT NULL DEFAULT true,
    created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create product_materials table for BOM (Bill of Materials)
CREATE TABLE product_materials (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    quantity DECIMAL(10,4) NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, material_id)
);

-- Add updated_at trigger for production_records
CREATE OR REPLACE FUNCTION update_production_records_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_production_records_updated_at
    BEFORE UPDATE ON production_records
    FOR EACH ROW
    EXECUTE FUNCTION update_production_records_updated_at();

-- Add updated_at trigger for product_materials
CREATE OR REPLACE FUNCTION update_product_materials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_product_materials_updated_at
    BEFORE UPDATE ON product_materials
    FOR EACH ROW
    EXECUTE FUNCTION update_product_materials_updated_at();

-- Enable RLS for production_records
ALTER TABLE production_records ENABLE ROW LEVEL SECURITY;

-- RLS policies for production_records
CREATE POLICY "Users can view all production records" ON production_records
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert production records" ON production_records
    FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own production records" ON production_records
    FOR UPDATE USING (auth.uid() = created_by);

-- Enable RLS for product_materials
ALTER TABLE product_materials ENABLE ROW LEVEL SECURITY;

-- RLS policies for product_materials
CREATE POLICY "Users can view all product materials" ON product_materials
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admin and owner can manage product materials" ON product_materials
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role IN ('admin', 'owner')
        )
    );

-- Add indexes for better performance
CREATE INDEX idx_production_records_product_id ON production_records(product_id);
CREATE INDEX idx_production_records_created_by ON production_records(created_by);
CREATE INDEX idx_production_records_created_at ON production_records(created_at);
CREATE INDEX idx_product_materials_product_id ON product_materials(product_id);
CREATE INDEX idx_product_materials_material_id ON product_materials(material_id);


-- ============================================
-- Migration 24: 0027_create_cash_history_table.sql
-- ============================================

-- Create cash_history table for tracking all cash transactions
CREATE TABLE public.cash_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id text REFERENCES public.accounts(id) ON DELETE CASCADE NOT NULL,
  account_name text NOT NULL,
  type text NOT NULL CHECK (type IN (
    'orderan',
    'kas_masuk_manual',
    'kas_keluar_manual',
    'panjar_pengambilan',
    'panjar_pelunasan',
    'pengeluaran',
    'pembayaran_po',
    'pembayaran_piutang',
    'transfer_masuk',
    'transfer_keluar'
  )),
  amount numeric NOT NULL,
  description text NOT NULL,
  reference_id text,
  reference_name text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes for better query performance
CREATE INDEX idx_cash_history_account_id ON public.cash_history(account_id);
CREATE INDEX idx_cash_history_type ON public.cash_history(type);
CREATE INDEX idx_cash_history_created_at ON public.cash_history(created_at);
CREATE INDEX idx_cash_history_user_id ON public.cash_history(user_id);

-- Enable RLS (Row Level Security)
ALTER TABLE public.cash_history ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Enable read access for authenticated users" ON public.cash_history
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users" ON public.cash_history
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Trigger for updating updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_cash_history_updated_at BEFORE UPDATE ON public.cash_history
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================
-- Migration 25: 0028_create_sample_payment_accounts.sql
-- ============================================

-- Insert sample payment accounts if they don't exist
INSERT INTO public.accounts (id, name, type, balance, initial_balance, is_payment_account, created_at)
VALUES 
  ('acc-cash-001', 'Kas Tunai', 'Aset', 0, 0, true, NOW()),
  ('acc-bank-001', 'Bank BCA', 'Aset', 0, 0, true, NOW()),
  ('acc-bank-002', 'Bank Mandiri', 'Aset', 0, 0, true, NOW())
ON CONFLICT (id) DO NOTHING;


-- ============================================
-- Migration 26: 0028_fix_employee_edit_permissions.sql
-- ============================================

-- =====================================================
-- FIX EMPLOYEE EDIT PERMISSIONS FOR OWNER AND ADMIN
-- =====================================================

-- Drop existing policies on profiles table
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

-- Ensure get_current_user_role function exists and works correctly
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT AS $$
BEGIN
  RETURN (
    SELECT role 
    FROM public.profiles 
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure is_owner function exists
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'owner'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure is_admin function exists
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'owner')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- NEW PROFILES POLICIES - SIMPLIFIED AND CLEAR
-- =====================================================

-- Policy 1: Users can view their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
FOR SELECT USING (id = auth.uid());

-- Policy 2: Admin and Owner can view all profiles
CREATE POLICY "Admin can view all profiles" ON public.profiles
FOR SELECT USING (public.is_admin());

-- Policy 3: Users can update their own basic profile info (not role)
CREATE POLICY "Users can update own profile" ON public.profiles
FOR UPDATE USING (
  id = auth.uid()
) WITH CHECK (
  id = auth.uid() AND
  -- Prevent users from changing their own role
  (role IS NULL OR role = (SELECT role FROM public.profiles WHERE id = auth.uid()))
);

-- Policy 4: Admin and Owner can update any profile including roles
CREATE POLICY "Admin can update all profiles" ON public.profiles
FOR UPDATE USING (
  public.is_admin()
) WITH CHECK (
  public.is_admin()
);

-- Policy 5: Admin and Owner can insert new profiles
CREATE POLICY "Admin can insert profiles" ON public.profiles
FOR INSERT WITH CHECK (public.is_admin());

-- Policy 6: Only Owner can delete profiles (safety measure)
CREATE POLICY "Owner can delete profiles" ON public.profiles
FOR DELETE USING (public.is_owner());

-- =====================================================
-- GRANT NECESSARY PERMISSIONS
-- =====================================================

-- Ensure authenticated users can access profiles table
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT DELETE ON public.profiles TO authenticated;

-- Ensure the functions can be called by authenticated users
GRANT EXECUTE ON FUNCTION public.get_current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;


-- ============================================
-- Migration 27: 0029_add_galon_titip_and_barang_laku.sql
-- ============================================

-- Add jumlah_galon_titip column to customers table
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS jumlah_galon_titip INTEGER DEFAULT 0;

-- Add barang_laku column to retasi table  
ALTER TABLE retasi 
ADD COLUMN IF NOT EXISTS barang_laku INTEGER DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN customers.jumlah_galon_titip IS 'Jumlah galon yang dititip di pelanggan';
COMMENT ON COLUMN retasi.barang_laku IS 'Jumlah barang yang laku terjual dari retasi';


-- ============================================
-- Migration 28: 0029_ensure_material_name_column.sql
-- ============================================

-- =====================================================
-- ENSURE MATERIAL_NAME COLUMN EXISTS IN MATERIAL_STOCK_MOVEMENTS
-- =====================================================

-- Add material_name column if it doesn't exist
ALTER TABLE public.material_stock_movements 
ADD COLUMN IF NOT EXISTS material_name TEXT;

-- Set NOT NULL constraint only if column was just added and is currently nullable
UPDATE public.material_stock_movements 
SET material_name = 'Unknown Material' 
WHERE material_name IS NULL;

-- Make the column NOT NULL after populating it
ALTER TABLE public.material_stock_movements 
ALTER COLUMN material_name SET NOT NULL;


-- ============================================
-- Migration 29: 0030_add_production_errors_table.sql
-- ============================================

-- Create production_errors table for tracking material errors during production
CREATE TABLE IF NOT EXISTS public.production_errors (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ref VARCHAR(50) NOT NULL UNIQUE,
    material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
    quantity DECIMAL(10,2) NOT NULL CHECK (quantity > 0),
    note TEXT,
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_production_errors_material_id ON public.production_errors(material_id);
CREATE INDEX IF NOT EXISTS idx_production_errors_created_by ON public.production_errors(created_by);
CREATE INDEX IF NOT EXISTS idx_production_errors_created_at ON public.production_errors(created_at);
CREATE INDEX IF NOT EXISTS idx_production_errors_ref ON public.production_errors(ref);

-- Enable RLS (Row Level Security)
ALTER TABLE public.production_errors ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow authenticated users to view production errors" ON public.production_errors
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to insert production errors" ON public.production_errors
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Allow owners and admins to delete production errors" ON public.production_errors
    FOR DELETE TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() 
            AND role IN ('owner', 'admin')
        )
    );

-- Grant permissions
GRANT SELECT, INSERT, DELETE ON public.production_errors TO authenticated;

-- Add comment for documentation
COMMENT ON TABLE public.production_errors IS 'Records of material errors/defects during production process';
COMMENT ON COLUMN public.production_errors.ref IS 'Unique reference code for the error record (e.g., ERR-250122-001)';
COMMENT ON COLUMN public.production_errors.material_id IS 'Reference to the material that had errors';
COMMENT ON COLUMN public.production_errors.quantity IS 'Quantity of material that was defective/error';
COMMENT ON COLUMN public.production_errors.note IS 'Description of the error or defect';
COMMENT ON COLUMN public.production_errors.created_by IS 'User who recorded the error';


-- ============================================
-- Migration 30: 0030_fix_transactions_missing_columns.sql
-- ============================================

-- Fix missing columns in transactions table
-- Migration: 0030_fix_transactions_missing_columns.sql
-- Date: 2025-01-19

-- Add missing columns to transactions table
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS is_office_sale BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS subtotal NUMERIC,
ADD COLUMN IF NOT EXISTS ppn_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS ppn_mode TEXT CHECK (ppn_mode IN ('include', 'exclude')),
ADD COLUMN IF NOT EXISTS ppn_percentage NUMERIC DEFAULT 11,
ADD COLUMN IF NOT EXISTS ppn_amount NUMERIC DEFAULT 0;

-- Add comments for new columns
COMMENT ON COLUMN public.transactions.is_office_sale IS 'Menandakan apakah produk laku kantor (true) atau perlu diantar (false)';
COMMENT ON COLUMN public.transactions.due_date IS 'Tanggal jatuh tempo untuk pembayaran kredit';
COMMENT ON COLUMN public.transactions.subtotal IS 'Total sebelum PPN dan setelah diskon';
COMMENT ON COLUMN public.transactions.ppn_enabled IS 'Apakah PPN diaktifkan untuk transaksi ini';
COMMENT ON COLUMN public.transactions.ppn_mode IS 'Mode PPN: include (sudah termasuk) atau exclude (belum termasuk)';
COMMENT ON COLUMN public.transactions.ppn_percentage IS 'Persentase PPN yang digunakan (default 11%)';
COMMENT ON COLUMN public.transactions.ppn_amount IS 'Jumlah PPN dalam rupiah';

-- Create index for is_office_sale for faster delivery filtering
CREATE INDEX IF NOT EXISTS idx_transactions_is_office_sale ON public.transactions(is_office_sale);
CREATE INDEX IF NOT EXISTS idx_transactions_due_date ON public.transactions(due_date);
CREATE INDEX IF NOT EXISTS idx_transactions_ppn_enabled ON public.transactions(ppn_enabled);

-- Update existing transactions to set default values for new columns
-- Set is_office_sale = false for all existing transactions (they should be eligible for delivery)
UPDATE public.transactions 
SET 
  is_office_sale = false,
  ppn_enabled = false,
  ppn_percentage = 11,
  ppn_amount = 0
WHERE is_office_sale IS NULL 
   OR ppn_enabled IS NULL 
   OR ppn_percentage IS NULL 
   OR ppn_amount IS NULL;

-- For existing transactions, calculate subtotal from total (assuming no PPN was used before)
UPDATE public.transactions 
SET subtotal = total
WHERE subtotal IS NULL;

-- Success message
SELECT 'Kolom missing di tabel transactions berhasil ditambahkan!' as status;


-- ============================================
-- Migration 31: 0031_add_commission_tables.sql
-- ============================================

-- Create commission_rules table
CREATE TABLE commission_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_sku TEXT,
  role TEXT NOT NULL CHECK (role IN ('sales', 'driver', 'helper')),
  rate_per_qty DECIMAL(15,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(product_id, role)
);

-- Create commission_entries table
CREATE TABLE commission_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('sales', 'driver', 'helper')),
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_sku TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  rate_per_qty DECIMAL(15,2) NOT NULL DEFAULT 0,
  amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  transaction_id TEXT,
  delivery_id TEXT,
  ref TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for better performance
CREATE INDEX idx_commission_rules_product_role ON commission_rules(product_id, role);
CREATE INDEX idx_commission_entries_user ON commission_entries(user_id);
CREATE INDEX idx_commission_entries_role ON commission_entries(role);
CREATE INDEX idx_commission_entries_date ON commission_entries(created_at);
CREATE INDEX idx_commission_entries_transaction ON commission_entries(transaction_id);
CREATE INDEX idx_commission_entries_delivery ON commission_entries(delivery_id);

-- Enable RLS
ALTER TABLE commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policies for commission_rules
CREATE POLICY "Anyone can view commission rules" ON commission_rules
  FOR SELECT USING (true);

CREATE POLICY "Admin/Owner/Cashier can manage commission rules" ON commission_rules
  FOR ALL USING (
    auth.jwt() ->> 'user_role' IN ('admin', 'owner', 'cashier')
  );

-- RLS Policies for commission_entries  
CREATE POLICY "Anyone can view commission entries" ON commission_entries
  FOR SELECT USING (true);

CREATE POLICY "System can insert commission entries" ON commission_entries
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admin/Owner can manage commission entries" ON commission_entries
  FOR ALL USING (
    auth.jwt() ->> 'user_role' IN ('admin', 'owner')
  );

-- Function to automatically populate product info in commission rules
CREATE OR REPLACE FUNCTION populate_commission_product_info()
RETURNS TRIGGER AS $$
BEGIN
  -- Try to get product info from products table
  SELECT p.name, p.sku 
  INTO NEW.product_name, NEW.product_sku
  FROM products p 
  WHERE p.id = NEW.product_id;
  
  -- If not found, keep the provided values
  IF NEW.product_name IS NULL THEN
    NEW.product_name = COALESCE(NEW.product_name, NEW.product_id);
  END IF;
  
  NEW.updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for commission_rules
CREATE TRIGGER trigger_populate_commission_product_info
  BEFORE INSERT OR UPDATE ON commission_rules
  FOR EACH ROW
  EXECUTE FUNCTION populate_commission_product_info();

-- Function to calculate commission amount
CREATE OR REPLACE FUNCTION calculate_commission_amount()
RETURNS TRIGGER AS $$
BEGIN
  NEW.amount = NEW.quantity * NEW.rate_per_qty;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for commission_entries
CREATE TRIGGER trigger_calculate_commission_amount
  BEFORE INSERT OR UPDATE ON commission_entries
  FOR EACH ROW
  EXECUTE FUNCTION calculate_commission_amount();

-- Sample data for testing (optional)
/*
INSERT INTO commission_rules (product_id, product_name, product_sku, role, rate_per_qty) VALUES
('sample-product-1', 'Sample Product 1', 'SP001', 'sales', 1000),
('sample-product-1', 'Sample Product 1', 'SP001', 'driver', 500),
('sample-product-1', 'Sample Product 1', 'SP001', 'helper', 300),
('sample-product-2', 'Sample Product 2', 'SP002', 'sales', 1500),
('sample-product-2', 'Sample Product 2', 'SP002', 'driver', 750),
('sample-product-2', 'Sample Product 2', 'SP002', 'helper', 450);
*/


-- ============================================
-- Migration 32: 0031_add_user_input_to_production_records.sql
-- ============================================

-- Add user input tracking to production_records table
ALTER TABLE public.production_records 
ADD COLUMN user_input_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN user_input_name text;

-- Allow product_id to be null for damaged material records
ALTER TABLE public.production_records 
ALTER COLUMN product_id DROP NOT NULL;

-- Create index for better query performance  
CREATE INDEX idx_production_records_user_input_id ON public.production_records(user_input_id);

-- Update existing records to use created_by as user_input_id and user_input_name
UPDATE public.production_records 
SET user_input_id = created_by,
    user_input_name = 'Unknown User'
WHERE user_input_id IS NULL;


-- ============================================
-- Migration 33: 0032_fix_profiles_rls_policies.sql
-- ============================================

-- Fix RLS policies for profiles table (Employee CRUD)
-- Migration: 0032_fix_profiles_rls_policies.sql  
-- Date: 2025-01-19

-- First, let's check and drop existing policies that might conflict
DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;

-- Create comprehensive RLS policies for profiles table

-- 1. SELECT Policy - All authenticated users can view profiles
CREATE POLICY "Authenticated users can view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

-- 2. INSERT Policy - Only allow system/auth to create profiles, or admins/owners
CREATE POLICY "System and admins can create profiles" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Allow users to create their own profile (from auth trigger)
    auth.uid() = id OR
    -- Allow admins and owners to create profiles for others
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() 
      AND p.role IN ('owner', 'admin')
      AND p.status = 'Aktif'
    )
  );

-- 3. UPDATE Policy - Users can update their own profile, admins/owners can update any
CREATE POLICY "Users can update own profile, admins can update any" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    -- Users can update their own profile
    auth.uid() = id OR
    -- Admins and owners can update any profile
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() 
      AND p.role IN ('owner', 'admin')
      AND p.status = 'Aktif'
    )
  )
  WITH CHECK (
    -- Same conditions for the updated data
    auth.uid() = id OR
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() 
      AND p.role IN ('owner', 'admin')
      AND p.status = 'Aktif'
    )
  );

-- 4. DELETE Policy - Only admins and owners can delete profiles (MISSING POLICY!)
CREATE POLICY "Only admins and owners can delete profiles" ON public.profiles
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() 
      AND p.role IN ('owner', 'admin')
      AND p.status = 'Aktif'
    )
    -- Prevent deleting yourself (safety measure)
    AND id != auth.uid()
    -- Prevent admins from deleting owners (hierarchy protection)
    AND NOT (
      role = 'owner' AND 
      EXISTS (
        SELECT 1 FROM public.profiles p2
        WHERE p2.id = auth.uid() AND p2.role = 'admin'
      )
    )
  );

-- Drop existing view first to avoid data type conflicts
DROP VIEW IF EXISTS public.employees_view;

-- Create a more flexible employees view that works with RLS
CREATE OR REPLACE VIEW public.employees_view AS
SELECT
    p.id,
    p.full_name,
    p.email,
    COALESCE(r.display_name, p.role) as role_name,
    p.role,
    p.phone,
    p.address,
    p.status,
    p.updated_at
FROM public.profiles p
LEFT JOIN public.roles r ON r.name = p.role
WHERE p.status != 'Nonaktif' OR p.status IS NULL;

-- Grant access to the view
GRANT SELECT ON public.employees_view TO authenticated;

-- Create helper function to check if user can manage employees
CREATE OR REPLACE FUNCTION public.can_manage_employees(user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = user_id 
    AND p.role IN ('owner', 'admin')
    AND p.status = 'Aktif'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the helper function
GRANT EXECUTE ON FUNCTION public.can_manage_employees(UUID) TO authenticated;

-- Create helper function for safe employee deletion (marks as inactive instead of hard delete)
CREATE OR REPLACE FUNCTION public.deactivate_employee(employee_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if current user can manage employees
  IF NOT public.can_manage_employees() THEN
    RAISE EXCEPTION 'Unauthorized: Only admins and owners can deactivate employees';
  END IF;
  
  -- Check if trying to deactivate self
  IF employee_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot deactivate your own account';
  END IF;
  
  -- Check if admin trying to deactivate owner
  IF EXISTS (
    SELECT 1 FROM public.profiles p1, public.profiles p2
    WHERE p1.id = auth.uid() AND p1.role = 'admin'
    AND p2.id = employee_id AND p2.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Admins cannot deactivate owners';
  END IF;
  
  -- Deactivate the employee
  UPDATE public.profiles 
  SET status = 'Tidak Aktif', updated_at = NOW()
  WHERE id = employee_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the deactivation function
GRANT EXECUTE ON FUNCTION public.deactivate_employee(UUID) TO authenticated;

-- Add trigger to update updated_at on profiles
CREATE OR REPLACE FUNCTION public.update_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger if it doesn't exist
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at 
  BEFORE UPDATE ON public.profiles 
  FOR EACH ROW 
  EXECUTE FUNCTION public.update_profiles_updated_at();

-- Success message
SELECT 'RLS policies untuk profiles berhasil diperbaiki! DELETE policy sudah ditambahkan.' as status;


-- ============================================
-- Migration 34: 0033_update_transaction_status_system.sql
-- ============================================

-- Update transaction status system with auto-update functionality
-- Migration: 0033_update_transaction_status_system.sql
-- Date: 2025-01-19

-- Update transaction status enum to include new statuses
ALTER TYPE transaction_status DROP CONSTRAINT IF EXISTS transaction_status_check;

-- Create new status check constraint
ALTER TABLE public.transactions 
ADD CONSTRAINT transaction_status_check CHECK (
  status IN (
    'Pesanan Masuk',     -- Order baru dibuat
    'Siap Antar',        -- Produksi selesai, siap diantar
    'Diantar Sebagian',  -- Sebagian sudah diantar
    'Selesai',           -- Semua sudah berhasil diantar
    'Dibatalkan'         -- Order dibatalkan
  )
);

-- Create function to auto-update transaction status based on delivery progress
CREATE OR REPLACE FUNCTION update_transaction_status_from_delivery()
RETURNS TRIGGER AS $$
DECLARE
  transaction_id TEXT;
  total_items INTEGER;
  delivered_items INTEGER;
  cancelled_deliveries INTEGER;
BEGIN
  -- Get transaction ID from delivery
  transaction_id := COALESCE(NEW.transaction_id, OLD.transaction_id);
  
  IF transaction_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  -- Count total items in transaction (from transaction items)
  SELECT COALESCE(jsonb_array_length(items), 0)
  INTO total_items
  FROM public.transactions 
  WHERE id = transaction_id;
  
  -- Count delivered items from all deliveries for this transaction
  SELECT 
    COALESCE(SUM(CASE WHEN d.status = 'delivered' THEN di.quantity_delivered ELSE 0 END), 0),
    COUNT(CASE WHEN d.status = 'cancelled' THEN 1 END)
  INTO delivered_items, cancelled_deliveries
  FROM public.deliveries d
  LEFT JOIN public.delivery_items di ON d.id = di.delivery_id  
  WHERE d.transaction_id = transaction_id;
  
  -- Update transaction status based on delivery progress
  IF cancelled_deliveries > 0 AND delivered_items = 0 THEN
    -- All deliveries cancelled, no items delivered
    UPDATE public.transactions 
    SET status = 'Dibatalkan' 
    WHERE id = transaction_id AND status != 'Dibatalkan';
    
  ELSIF delivered_items = 0 THEN
    -- No items delivered yet, but delivery exists
    UPDATE public.transactions 
    SET status = 'Siap Antar' 
    WHERE id = transaction_id AND status NOT IN ('Siap Antar', 'Diantar Sebagian', 'Selesai');
    
  ELSIF delivered_items > 0 AND delivered_items < total_items THEN
    -- Partial delivery completed
    UPDATE public.transactions 
    SET status = 'Diantar Sebagian' 
    WHERE id = transaction_id AND status != 'Diantar Sebagian';
    
  ELSIF delivered_items >= total_items THEN
    -- All items delivered
    UPDATE public.transactions 
    SET status = 'Selesai' 
    WHERE id = transaction_id AND status != 'Selesai';
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger for delivery status changes
CREATE TRIGGER trigger_update_transaction_status_from_delivery
  AFTER INSERT OR UPDATE OR DELETE ON public.deliveries
  FOR EACH ROW
  EXECUTE FUNCTION update_transaction_status_from_delivery();

-- Create trigger for delivery item changes  
CREATE TRIGGER trigger_update_transaction_status_from_delivery_items
  AFTER INSERT OR UPDATE OR DELETE ON public.delivery_items
  FOR EACH ROW
  EXECUTE FUNCTION update_transaction_status_from_delivery();

-- Function to auto-update payment status based on paid amount
CREATE OR REPLACE FUNCTION update_payment_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-update payment status based on paid amount vs total
  IF NEW.paid_amount >= NEW.total THEN
    NEW.payment_status := 'Lunas';
  ELSIF NEW.paid_amount > 0 THEN
    NEW.payment_status := 'Belum Lunas';
  ELSE
    -- Keep existing payment_status if no payment yet
    -- Could be 'Kredit' or 'Belum Lunas'
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for payment status auto-update
CREATE TRIGGER trigger_update_payment_status
  BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_payment_status();

-- Create indexes for better filtering performance
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_payment_status ON public.transactions(payment_status);
CREATE INDEX IF NOT EXISTS idx_transactions_order_date ON public.transactions(order_date);
CREATE INDEX IF NOT EXISTS idx_transactions_customer_id ON public.transactions(customer_id);

-- Create view for transaction summary with delivery info
CREATE OR REPLACE VIEW transaction_summary AS
SELECT 
  t.*,
  c.name as customer_name,
  c.phone as customer_phone,
  c.address as customer_address,
  -- Delivery summary
  COUNT(d.id) as total_deliveries,
  COUNT(CASE WHEN d.status = 'pending' THEN 1 END) as pending_deliveries,
  COUNT(CASE WHEN d.status = 'in_transit' THEN 1 END) as in_transit_deliveries,
  COUNT(CASE WHEN d.status = 'delivered' THEN 1 END) as completed_deliveries,
  COUNT(CASE WHEN d.status = 'cancelled' THEN 1 END) as cancelled_deliveries,
  -- Payment calculation
  ROUND((t.paid_amount * 100.0 / NULLIF(t.total, 0)), 2) as payment_percentage,
  (t.total - t.paid_amount) as remaining_amount
FROM public.transactions t
LEFT JOIN public.customers c ON t.customer_id = c.id
LEFT JOIN public.deliveries d ON t.id = d.transaction_id
GROUP BY t.id, c.name, c.phone, c.address;

-- Grant access to the view
GRANT SELECT ON public.transaction_summary TO authenticated;

-- Success message
SELECT 'Transaction status system updated with auto-status and comprehensive filtering!' as status;


-- ============================================
-- Migration 35: 0034_create_deliveries_table.sql
-- ============================================

-- Create deliveries table untuk sistem pengantaran partial
CREATE TABLE deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  delivery_number SERIAL NOT NULL, -- Auto increment untuk urutan pengantaran per transaksi
  delivery_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  photo_url TEXT, -- URL foto laporan pengantaran dari Google Drive
  photo_drive_id TEXT, -- ID file di Google Drive untuk backup reference
  notes TEXT, -- Catatan pengantaran
  delivered_by TEXT, -- Nama driver/pengantar
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create delivery_items table untuk track item yang diantar per pengantaran
CREATE TABLE delivery_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL, -- Store product name untuk history
  quantity_delivered INTEGER NOT NULL CHECK (quantity_delivered > 0),
  unit TEXT NOT NULL, -- Satuan produk
  width DECIMAL, -- Dimensi jika ada
  height DECIMAL, -- Dimensi jika ada
  notes TEXT, -- Catatan spesifik untuk item ini
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes untuk performance
CREATE INDEX idx_deliveries_transaction_id ON deliveries(transaction_id);
CREATE INDEX idx_deliveries_delivery_date ON deliveries(delivery_date);
CREATE INDEX idx_delivery_items_delivery_id ON delivery_items(delivery_id);
CREATE INDEX idx_delivery_items_product_id ON delivery_items(product_id);

-- Enable RLS
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_items ENABLE ROW LEVEL SECURITY;

-- RLS policies untuk deliveries
CREATE POLICY "Enable read access for authenticated users" ON deliveries
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users" ON deliveries
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users" ON deliveries
  FOR UPDATE USING (auth.role() = 'authenticated');

-- RLS policies untuk delivery_items
CREATE POLICY "Enable read access for authenticated users" ON delivery_items
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users" ON delivery_items
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users" ON delivery_items
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Function untuk update status transaksi berdasarkan delivery progress
CREATE OR REPLACE FUNCTION update_transaction_delivery_status()
RETURNS TRIGGER AS $$
DECLARE
  transaction_record RECORD;
  total_ordered INTEGER;
  total_delivered INTEGER;
  item_record RECORD;
BEGIN
  -- Get transaction details
  SELECT * INTO transaction_record 
  FROM transactions 
  WHERE id = (
    SELECT transaction_id 
    FROM deliveries 
    WHERE id = COALESCE(NEW.delivery_id, OLD.delivery_id)
  );
  
  -- Skip jika transaksi adalah laku kantor
  IF transaction_record.is_office_sale = true THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  -- Calculate total quantity ordered vs delivered untuk setiap item
  FOR item_record IN 
    SELECT 
      ti.product_id,
      ti.quantity as ordered_quantity,
      COALESCE(SUM(di.quantity_delivered), 0) as delivered_quantity
    FROM transactions t
    JOIN LATERAL jsonb_to_recordset(t.items) AS ti(
      product jsonb,
      quantity integer
    ) ON true
    JOIN LATERAL (SELECT (ti.product->>'id')::uuid as product_id) p ON true
    LEFT JOIN deliveries d ON d.transaction_id = t.id
    LEFT JOIN delivery_items di ON di.delivery_id = d.id AND di.product_id = p.product_id
    WHERE t.id = transaction_record.id
    GROUP BY ti.product_id, ti.quantity
  LOOP
    -- Jika ada item yang belum selesai diantar
    IF item_record.delivered_quantity < item_record.ordered_quantity THEN
      -- Jika sudah ada pengantaran tapi belum lengkap
      IF item_record.delivered_quantity > 0 THEN
        UPDATE transactions 
        SET status = 'Diantar Sebagian'
        WHERE id = transaction_record.id;
        RETURN COALESCE(NEW, OLD);
      ELSE
        -- Belum ada pengantaran sama sekali, tetap 'Siap Antar'
        RETURN COALESCE(NEW, OLD);
      END IF;
    END IF;
  END LOOP;
  
  -- Jika sampai sini, berarti semua item sudah diantar lengkap
  UPDATE transactions 
  SET status = 'Selesai'
  WHERE id = transaction_record.id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger untuk auto-update status transaksi
CREATE TRIGGER delivery_items_status_trigger
  AFTER INSERT OR UPDATE OR DELETE ON delivery_items
  FOR EACH ROW
  EXECUTE FUNCTION update_transaction_delivery_status();

-- Function untuk mendapatkan delivery summary per transaksi
CREATE OR REPLACE FUNCTION get_delivery_summary(transaction_id_param TEXT)
RETURNS TABLE (
  product_id UUID,
  product_name TEXT,
  ordered_quantity INTEGER,
  delivered_quantity INTEGER,
  remaining_quantity INTEGER,
  unit TEXT,
  width DECIMAL,
  height DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.product_id,
    p.product_name,
    p.ordered_quantity::INTEGER,
    COALESCE(di_summary.delivered_quantity, 0)::INTEGER,
    (p.ordered_quantity - COALESCE(di_summary.delivered_quantity, 0))::INTEGER,
    p.unit,
    p.width,
    p.height
  FROM (
    SELECT 
      (ti.product->>'id')::uuid as product_id,
      ti.product->>'name' as product_name,
      ti.quantity as ordered_quantity,
      ti.unit as unit,
      ti.width as width,
      ti.height as height
    FROM transactions t
    JOIN LATERAL jsonb_to_recordset(t.items) AS ti(
      product jsonb,
      quantity integer,
      unit text,
      width decimal,
      height decimal
    ) ON true
    WHERE t.id = transaction_id_param
  ) p
  LEFT JOIN (
    SELECT 
      di.product_id,
      SUM(di.quantity_delivered) as delivered_quantity
    FROM deliveries d
    JOIN delivery_items di ON di.delivery_id = d.id
    WHERE d.transaction_id = transaction_id_param
    GROUP BY di.product_id
  ) di_summary ON di_summary.product_id = p.product_id;
END;
$$ LANGUAGE plpgsql;

-- Function untuk mendapatkan transaksi yang siap untuk diantar (exclude laku kantor)
CREATE OR REPLACE FUNCTION get_transactions_ready_for_delivery()
RETURNS TABLE (
  id TEXT,
  customer_name TEXT,
  order_date TIMESTAMPTZ,
  items JSONB,
  total DECIMAL,
  status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.customer_name,
    t.order_date,
    t.items,
    t.total,
    t.status
  FROM transactions t
  WHERE t.status IN ('Siap Antar', 'Diantar Sebagian')
    AND (t.is_office_sale IS NULL OR t.is_office_sale = false)
  ORDER BY t.order_date ASC;
END;
$$ LANGUAGE plpgsql;


-- ============================================
-- Migration 36: 0035_add_supplier_fields_to_purchase_orders.sql
-- ============================================

-- Add supplier fields to purchase_orders table
ALTER TABLE purchase_orders 
ADD COLUMN IF NOT EXISTS unit_price DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS supplier_name TEXT,
ADD COLUMN IF NOT EXISTS supplier_contact TEXT,
ADD COLUMN IF NOT EXISTS expected_delivery_date TIMESTAMPTZ;

-- Update existing records to have total_cost if missing (calculate from quantity * estimated unit price from materials)
UPDATE purchase_orders 
SET total_cost = COALESCE(total_cost, (
  SELECT COALESCE(po.quantity * m.price_per_unit, 0)
  FROM materials m 
  WHERE m.id = purchase_orders.material_id
))
WHERE total_cost IS NULL;

-- Add index for supplier queries
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_name ON purchase_orders(supplier_name);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_expected_delivery_date ON purchase_orders(expected_delivery_date);


-- ============================================
-- Migration 37: 0035_update_transactions_for_delivery.sql
-- ============================================

-- Add is_office_sale column jika belum ada
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' 
    AND column_name = 'is_office_sale'
  ) THEN
    ALTER TABLE transactions ADD COLUMN is_office_sale BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Update existing transactions yang mungkin sudah ada
-- Default semua ke FALSE kecuali yang explicit di-set sebagai office sale

-- Add index untuk performance query delivery
CREATE INDEX IF NOT EXISTS idx_transactions_delivery_status 
ON transactions(status, is_office_sale) 
WHERE status IN ('Siap Antar', 'Diantar Sebagian');

-- Add index untuk order_date untuk sorting delivery queue
CREATE INDEX IF NOT EXISTS idx_transactions_order_date ON transactions(order_date);

-- Update function untuk memastikan status delivery logic correct
CREATE OR REPLACE FUNCTION validate_transaction_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Jika transaksi adalah laku kantor, tidak boleh masuk ke delivery flow
  IF NEW.is_office_sale = true AND NEW.status IN ('Siap Antar', 'Diantar Sebagian') THEN
    -- Auto change ke 'Selesai' untuk laku kantor
    NEW.status := 'Selesai';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger untuk validate status transition
CREATE OR REPLACE TRIGGER transaction_status_validation
  BEFORE UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION validate_transaction_status_transition();


-- ============================================
-- Migration 38: 0036_update_deliveries_with_employee_references.sql
-- ============================================

-- Update deliveries table to use employee references instead of free text
-- Drop old text field and add employee references

ALTER TABLE deliveries 
DROP COLUMN IF EXISTS delivered_by;

-- Add driver and helper employee references
ALTER TABLE deliveries 
ADD COLUMN driver_id UUID REFERENCES employees(id),
ADD COLUMN helper_id UUID REFERENCES employees(id);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_deliveries_driver_id ON deliveries(driver_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_helper_id ON deliveries(helper_id);

-- Update function untuk update status transaksi berdasarkan delivery progress
-- (Re-create function to handle new column structure)
CREATE OR REPLACE FUNCTION update_transaction_delivery_status()
RETURNS TRIGGER AS $$
DECLARE
  transaction_record RECORD;
  total_ordered INTEGER;
  total_delivered INTEGER;
  item_record RECORD;
BEGIN
  -- Get transaction details
  SELECT * INTO transaction_record 
  FROM transactions 
  WHERE id = (
    SELECT transaction_id 
    FROM deliveries 
    WHERE id = COALESCE(NEW.delivery_id, OLD.delivery_id)
  );
  
  -- Skip jika transaksi adalah laku kantor
  IF transaction_record.is_office_sale = true THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  -- Calculate total quantity ordered vs delivered untuk setiap item
  FOR item_record IN 
    SELECT 
      ti.product_id,
      ti.quantity as ordered_quantity,
      COALESCE(SUM(di.quantity_delivered), 0) as delivered_quantity
    FROM transactions t
    JOIN LATERAL jsonb_to_recordset(t.items) AS ti(
      product jsonb,
      quantity integer
    ) ON true
    JOIN LATERAL (SELECT (ti.product->>'id')::uuid as product_id) p ON true
    LEFT JOIN deliveries d ON d.transaction_id = t.id
    LEFT JOIN delivery_items di ON di.delivery_id = d.id AND di.product_id = p.product_id
    WHERE t.id = transaction_record.id
    GROUP BY ti.product_id, ti.quantity
  LOOP
    -- Jika ada item yang belum selesai diantar
    IF item_record.delivered_quantity < item_record.ordered_quantity THEN
      -- Jika sudah ada pengantaran tapi belum lengkap
      IF item_record.delivered_quantity > 0 THEN
        UPDATE transactions 
        SET status = 'Diantar Sebagian'
        WHERE id = transaction_record.id;
        RETURN COALESCE(NEW, OLD);
      ELSE
        -- Belum ada pengantaran sama sekali, tetap 'Siap Antar'
        RETURN COALESCE(NEW, OLD);
      END IF;
    END IF;
  END LOOP;
  
  -- Jika sampai sini, berarti semua item sudah diantar lengkap
  UPDATE transactions 
  SET status = 'Selesai'
  WHERE id = transaction_record.id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Function untuk mendapatkan delivery summary dengan employee names
CREATE OR REPLACE FUNCTION get_delivery_with_employees(delivery_id_param UUID)
RETURNS TABLE (
  id UUID,
  transaction_id TEXT,
  delivery_number INTEGER,
  delivery_date TIMESTAMPTZ,
  photo_url TEXT,
  photo_drive_id TEXT,
  notes TEXT,
  driver_name TEXT,
  helper_name TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.id,
    d.transaction_id,
    d.delivery_number,
    d.delivery_date,
    d.photo_url,
    d.photo_drive_id,
    d.notes,
    driver.name as driver_name,
    helper.name as helper_name,
    d.created_at,
    d.updated_at
  FROM deliveries d
  LEFT JOIN employees driver ON d.driver_id = driver.id
  LEFT JOIN employees helper ON d.helper_id = helper.id
  WHERE d.id = delivery_id_param;
END;
$$ LANGUAGE plpgsql;

-- Function untuk mendapatkan karyawan dengan role supir atau helper
CREATE OR REPLACE FUNCTION get_delivery_employees()
RETURNS TABLE (
  id UUID,
  name TEXT,
  position TEXT,
  role TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.name,
    e.position,
    e.role
  FROM employees e
  WHERE e.role IN ('supir', 'helper')
    AND e.status = 'active'
  ORDER BY e.role, e.name;
END;
$$ LANGUAGE plpgsql;


-- ============================================
-- Migration 39: 0037_cleanup_transaction_delivery_fields.sql
-- ============================================

-- Cleanup any legacy delivery-related fields in transactions table
-- This migration ensures old delivery note data is properly cleaned up

-- Check and remove any legacy delivery_note columns if they exist
DO $$
BEGIN
  -- Remove delivery_note column if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' 
    AND column_name = 'delivery_note'
  ) THEN
    ALTER TABLE transactions DROP COLUMN delivery_note;
    RAISE NOTICE 'Removed delivery_note column from transactions table';
  END IF;
  
  -- Remove delivery_notes column if it exists (plural form)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' 
    AND column_name = 'delivery_notes'
  ) THEN
    ALTER TABLE transactions DROP COLUMN delivery_notes;
    RAISE NOTICE 'Removed delivery_notes column from transactions table';
  END IF;
  
  -- Remove surat_jalan column if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' 
    AND column_name = 'surat_jalan'
  ) THEN
    ALTER TABLE transactions DROP COLUMN surat_jalan;
    RAISE NOTICE 'Removed surat_jalan column from transactions table';
  END IF;
  
  -- Remove any other legacy delivery fields
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' 
    AND column_name = 'delivery_info'
  ) THEN
    ALTER TABLE transactions DROP COLUMN delivery_info;
    RAISE NOTICE 'Removed delivery_info column from transactions table';
  END IF;
END $$;

-- Ensure transactions table has proper structure for new delivery system
-- The delivery information is now properly handled by:
-- 1. deliveries table - for delivery metadata
-- 2. delivery_items table - for specific items delivered
-- 3. Transaction status 'Siap Antar', 'Diantar Sebagian', 'Selesai' for tracking

-- Add comment to document the change
COMMENT ON TABLE transactions IS 'Transaction data. Delivery information is now handled separately in deliveries and delivery_items tables as of migration 0034.';

-- Verify cleanup
DO $$
DECLARE
  col_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO col_count 
  FROM information_schema.columns 
  WHERE table_name = 'transactions' 
  AND column_name LIKE '%delivery%';
  
  IF col_count = 0 THEN
    RAISE NOTICE 'Cleanup successful: No delivery-related columns found in transactions table';
  ELSE
    RAISE NOTICE 'Warning: % delivery-related columns still exist in transactions table', col_count;
  END IF;
END $$;


-- ============================================
-- Migration 40: 0037_create_audit_log_system.sql
-- ============================================

-- PHASE 1: AUDIT LOGGING SYSTEM
-- Migration: 0037_create_audit_log_system.sql
-- Date: 2025-01-20
-- Purpose: Create comprehensive audit logging for sensitive operations

-- Create audit_logs table untuk track sensitive operations
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL, -- INSERT, UPDATE, DELETE
  record_id TEXT NOT NULL, -- ID of the affected record
  old_data JSONB, -- Previous data (for UPDATE/DELETE)
  new_data JSONB, -- New data (for INSERT/UPDATE)
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT,
  user_role TEXT,
  ip_address INET,
  user_agent TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  additional_info JSONB -- Extra metadata
);

-- Add indexes for performance
CREATE INDEX idx_audit_logs_table_name ON public.audit_logs(table_name);
CREATE INDEX idx_audit_logs_operation ON public.audit_logs(operation);  
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_timestamp ON public.audit_logs(timestamp);
CREATE INDEX idx_audit_logs_record_id ON public.audit_logs(record_id);

-- Enable RLS on audit logs (only admins can view)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins and owners can view audit logs
CREATE POLICY "Only admins and owners can view audit logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() 
      AND p.role IN ('owner', 'admin')
      AND p.status = 'Aktif'
    )
  );

-- Create audit log function
CREATE OR REPLACE FUNCTION public.create_audit_log(
  p_table_name TEXT,
  p_operation TEXT,
  p_record_id TEXT,
  p_old_data JSONB DEFAULT NULL,
  p_new_data JSONB DEFAULT NULL,
  p_additional_info JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  audit_id UUID;
  current_user_profile RECORD;
BEGIN
  -- Get current user profile for context
  SELECT p.role, p.full_name, u.email INTO current_user_profile
  FROM auth.users u
  LEFT JOIN public.profiles p ON u.id = p.id
  WHERE u.id = auth.uid();
  
  -- Insert audit log
  INSERT INTO public.audit_logs (
    table_name,
    operation,
    record_id,
    old_data,
    new_data,
    user_id,
    user_email,
    user_role,
    additional_info
  ) VALUES (
    p_table_name,
    p_operation,
    p_record_id,
    p_old_data,
    p_new_data,
    auth.uid(),
    current_user_profile.email,
    current_user_profile.role,
    p_additional_info
  ) RETURNING id INTO audit_id;
  
  RETURN audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create performance monitoring table
CREATE TABLE public.performance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_name TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  table_name TEXT,
  record_count INTEGER,
  query_type TEXT, -- SELECT, INSERT, UPDATE, DELETE
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB
);

-- Add indexes for performance monitoring
CREATE INDEX idx_performance_logs_operation ON public.performance_logs(operation_name);
CREATE INDEX idx_performance_logs_timestamp ON public.performance_logs(timestamp);
CREATE INDEX idx_performance_logs_duration ON public.performance_logs(duration_ms);

-- Performance logging function
CREATE OR REPLACE FUNCTION public.log_performance(
  p_operation_name TEXT,
  p_duration_ms INTEGER,
  p_table_name TEXT DEFAULT NULL,
  p_record_count INTEGER DEFAULT NULL,
  p_query_type TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO public.performance_logs (
    operation_name,
    duration_ms,
    user_id,
    table_name,
    record_count,
    query_type,
    metadata
  ) VALUES (
    p_operation_name,
    p_duration_ms,
    auth.uid(),
    p_table_name,
    p_record_count,
    p_query_type,
    p_metadata
  ) RETURNING id INTO log_id;
  
  RETURN log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create audit triggers for sensitive tables
-- Profiles audit trigger (most critical)
CREATE OR REPLACE FUNCTION public.audit_profiles_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.create_audit_log(
      'profiles',
      'DELETE',
      OLD.id::TEXT,
      row_to_json(OLD)::JSONB,
      NULL,
      jsonb_build_object('deleted_user_name', OLD.full_name)
    );
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.create_audit_log(
      'profiles',
      'UPDATE',
      NEW.id::TEXT,
      row_to_json(OLD)::JSONB,
      row_to_json(NEW)::JSONB,
      jsonb_build_object('updated_fields', (
        SELECT jsonb_object_agg(key, value)
        FROM jsonb_each(row_to_json(NEW)::JSONB)
        WHERE value != (row_to_json(OLD)::JSONB ->> key)::JSONB
      ))
    );
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM public.create_audit_log(
      'profiles',
      'INSERT',
      NEW.id::TEXT,
      NULL,
      row_to_json(NEW)::JSONB,
      jsonb_build_object('new_user_name', NEW.full_name)
    );
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create audit trigger for profiles
DROP TRIGGER IF EXISTS audit_profiles_trigger ON public.profiles;
CREATE TRIGGER audit_profiles_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_profiles_changes();

-- Transactions audit trigger (financial operations)
CREATE OR REPLACE FUNCTION public.audit_transactions_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.create_audit_log(
      'transactions',
      'DELETE',
      OLD.id,
      row_to_json(OLD)::JSONB,
      NULL,
      jsonb_build_object(
        'transaction_total', OLD.total,
        'customer_name', OLD.customer_name
      )
    );
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only log significant updates
    IF OLD.total != NEW.total OR OLD.payment_status != NEW.payment_status OR OLD.status != NEW.status THEN
      PERFORM public.create_audit_log(
        'transactions',
        'UPDATE',
        NEW.id,
        row_to_json(OLD)::JSONB,
        row_to_json(NEW)::JSONB,
        jsonb_build_object(
          'customer_name', NEW.customer_name,
          'old_total', OLD.total,
          'new_total', NEW.total,
          'old_status', OLD.status,
          'new_status', NEW.status
        )
      );
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM public.create_audit_log(
      'transactions',
      'INSERT',
      NEW.id,
      NULL,
      row_to_json(NEW)::JSONB,
      jsonb_build_object(
        'customer_name', NEW.customer_name,
        'total_amount', NEW.total
      )
    );
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create audit trigger for transactions
DROP TRIGGER IF EXISTS audit_transactions_trigger ON public.transactions;
CREATE TRIGGER audit_transactions_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.audit_transactions_changes();

-- Grant permissions
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_audit_log TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_performance TO authenticated;

-- Create view for audit summary (performance optimized)
CREATE OR REPLACE VIEW public.audit_summary AS
SELECT 
  table_name,
  operation,
  COUNT(*) as operation_count,
  DATE_TRUNC('day', timestamp) as date,
  array_agg(DISTINCT user_role) as user_roles
FROM public.audit_logs 
WHERE timestamp >= NOW() - INTERVAL '30 days'
GROUP BY table_name, operation, DATE_TRUNC('day', timestamp)
ORDER BY date DESC;

-- Grant access to the view
GRANT SELECT ON public.audit_summary TO authenticated;

-- Success message
SELECT 'Audit logging system berhasil dibuat! Phase 1 security implementation complete.' as status;


-- ============================================
-- Migration 41: 0038_create_pricing_tables.sql
-- ============================================

-- Create stock pricing table
CREATE TABLE IF NOT EXISTS stock_pricings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  min_stock INTEGER NOT NULL,
  max_stock INTEGER NULL,
  price DECIMAL(15,2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create bonus pricing table
CREATE TABLE IF NOT EXISTS bonus_pricings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  min_quantity INTEGER NOT NULL,
  max_quantity INTEGER NULL,
  bonus_quantity INTEGER NOT NULL DEFAULT 0,
  bonus_type TEXT NOT NULL CHECK (bonus_type IN ('quantity', 'percentage', 'fixed_discount')),
  bonus_value DECIMAL(15,2) NOT NULL DEFAULT 0,
  description TEXT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_stock_pricings_product_id ON stock_pricings(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_pricings_active ON stock_pricings(is_active);
CREATE INDEX IF NOT EXISTS idx_stock_pricings_stock_range ON stock_pricings(min_stock, max_stock);

CREATE INDEX IF NOT EXISTS idx_bonus_pricings_product_id ON bonus_pricings(product_id);
CREATE INDEX IF NOT EXISTS idx_bonus_pricings_active ON bonus_pricings(is_active);
CREATE INDEX IF NOT EXISTS idx_bonus_pricings_qty_range ON bonus_pricings(min_quantity, max_quantity);

-- Update triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_stock_pricings_updated_at BEFORE UPDATE ON stock_pricings FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_bonus_pricings_updated_at BEFORE UPDATE ON bonus_pricings FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE stock_pricings IS 'Pricing rules based on product stock levels';
COMMENT ON TABLE bonus_pricings IS 'Bonus rules based on purchase quantity';

COMMENT ON COLUMN stock_pricings.min_stock IS 'Minimum stock level for this pricing rule';
COMMENT ON COLUMN stock_pricings.max_stock IS 'Maximum stock level for this pricing rule (NULL means no upper limit)';
COMMENT ON COLUMN stock_pricings.price IS 'Price to use when stock is within the range';

COMMENT ON COLUMN bonus_pricings.min_quantity IS 'Minimum quantity for this bonus rule';
COMMENT ON COLUMN bonus_pricings.max_quantity IS 'Maximum quantity for this bonus rule (NULL means no upper limit)';
COMMENT ON COLUMN bonus_pricings.bonus_type IS 'Type of bonus: quantity (free items), percentage (% discount), fixed_discount (fixed amount discount)';
COMMENT ON COLUMN bonus_pricings.bonus_value IS 'Value of bonus depending on type: quantity in pieces, percentage (0-100), or fixed discount amount';


-- ============================================
-- Migration 42: 0038_optimize_database_performance.sql
-- ============================================

-- PERFORMANCE OPTIMIZATION MIGRATION
-- Migration: 0038_optimize_database_performance.sql
-- Date: 2025-01-20
-- Purpose: Fix slow loading issues with better indexes and optimized queries

-- Add critical missing indexes for better performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_customer_id ON public.transactions(customer_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_status ON public.transactions(status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_payment_status ON public.transactions(payment_status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_order_date ON public.transactions(order_date);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_cashier_id ON public.transactions(cashier_id);

-- Optimize profiles table queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_status ON public.profiles(status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- Optimize customers table
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_name ON public.customers(name);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_created_at ON public.customers("createdAt");

-- Optimize products and materials
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_category ON public.products(category);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_name ON public.products(name);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_materials_name ON public.materials(name);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_materials_stock ON public.materials(stock);

-- Optimize accounts table
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_accounts_type ON public.accounts(type);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_accounts_is_payment_account ON public.accounts(is_payment_account);

-- Create optimized view for transactions with customer data (reduce JOIN overhead)
CREATE OR REPLACE VIEW public.transactions_with_customer AS
SELECT 
  t.*,
  c.name as customer_display_name,
  c.phone as customer_phone,
  c.address as customer_address,
  p.full_name as cashier_display_name
FROM public.transactions t
LEFT JOIN public.customers c ON t.customer_id = c.id
LEFT JOIN public.profiles p ON t.cashier_id = p.id;

-- Create optimized view for dashboard queries
CREATE OR REPLACE VIEW public.dashboard_summary AS
WITH recent_transactions AS (
  SELECT 
    COUNT(*) as total_transactions,
    SUM(total) as total_revenue,
    COUNT(CASE WHEN payment_status = 'Lunas' THEN 1 END) as paid_transactions,
    COUNT(CASE WHEN payment_status = 'Belum Lunas' THEN 1 END) as unpaid_transactions
  FROM public.transactions 
  WHERE order_date >= CURRENT_DATE - INTERVAL '30 days'
),
stock_summary AS (
  SELECT 
    COUNT(*) as total_products,
    COUNT(CASE WHEN (specifications->>'stock')::numeric <= min_order THEN 1 END) as low_stock_products
  FROM public.products
),
customer_summary AS (
  SELECT COUNT(*) as total_customers
  FROM public.customers
)
SELECT 
  rt.*,
  ss.total_products,
  ss.low_stock_products,
  cs.total_customers
FROM recent_transactions rt, stock_summary ss, customer_summary cs;

-- Create function for fast transaction search (with pagination)
CREATE OR REPLACE FUNCTION public.search_transactions(
  search_term TEXT DEFAULT '',
  limit_count INTEGER DEFAULT 50,
  offset_count INTEGER DEFAULT 0,
  status_filter TEXT DEFAULT NULL
)
RETURNS TABLE (
  id TEXT,
  customer_name TEXT,
  customer_display_name TEXT,
  cashier_name TEXT,
  total NUMERIC,
  paid_amount NUMERIC,
  payment_status TEXT,
  status TEXT,
  order_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.customer_name,
    c.name as customer_display_name,
    p.full_name as cashier_name,
    t.total,
    t.paid_amount,
    t.payment_status,
    t.status,
    t.order_date,
    t.created_at
  FROM public.transactions t
  LEFT JOIN public.customers c ON t.customer_id = c.id
  LEFT JOIN public.profiles p ON t.cashier_id = p.id
  WHERE 
    (search_term = '' OR 
     t.customer_name ILIKE '%' || search_term || '%' OR
     t.id ILIKE '%' || search_term || '%' OR
     c.name ILIKE '%' || search_term || '%')
    AND (status_filter IS NULL OR t.status = status_filter)
  ORDER BY t.order_date DESC
  LIMIT limit_count
  OFFSET offset_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- Create function for fast product search with stock info
CREATE OR REPLACE FUNCTION public.search_products_with_stock(
  search_term TEXT DEFAULT '',
  category_filter TEXT DEFAULT NULL,
  limit_count INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  category TEXT,
  base_price NUMERIC,
  unit TEXT,
  current_stock NUMERIC,
  min_order INTEGER,
  is_low_stock BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.name,
    p.category,
    p.base_price,
    p.unit,
    COALESCE((p.specifications->>'stock')::NUMERIC, 0) as current_stock,
    p.min_order,
    COALESCE((p.specifications->>'stock')::NUMERIC, 0) <= p.min_order as is_low_stock
  FROM public.products p
  WHERE 
    (search_term = '' OR p.name ILIKE '%' || search_term || '%')
    AND (category_filter IS NULL OR p.category = category_filter)
  ORDER BY p.name
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- Create optimized customer search function
CREATE OR REPLACE FUNCTION public.search_customers(
  search_term TEXT DEFAULT '',
  limit_count INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  phone TEXT,
  address TEXT,
  order_count INTEGER,
  last_order_date TIMESTAMPTZ,
  total_spent NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    c.phone,
    c.address,
    c."orderCount",
    MAX(t.order_date) as last_order_date,
    COALESCE(SUM(t.total), 0) as total_spent
  FROM public.customers c
  LEFT JOIN public.transactions t ON c.id = t.customer_id
  WHERE 
    (search_term = '' OR 
     c.name ILIKE '%' || search_term || '%' OR
     c.phone ILIKE '%' || search_term || '%')
  GROUP BY c.id, c.name, c.phone, c.address, c."orderCount"
  ORDER BY c.name
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- Create materialized view for frequently accessed data (refresh daily)
CREATE MATERIALIZED VIEW public.daily_stats AS
SELECT 
  CURRENT_DATE as date,
  COUNT(*) as total_transactions,
  SUM(total) as total_revenue,
  COUNT(DISTINCT customer_id) as unique_customers,
  AVG(total) as avg_transaction_value
FROM public.transactions 
WHERE DATE(order_date) = CURRENT_DATE;

-- Create indexes on materialized view
CREATE INDEX idx_daily_stats_date ON public.daily_stats(date);

-- Function to refresh materialized view (call this daily via cron)
CREATE OR REPLACE FUNCTION public.refresh_daily_stats()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW public.daily_stats;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions on new views and functions
GRANT SELECT ON public.transactions_with_customer TO authenticated;
GRANT SELECT ON public.dashboard_summary TO authenticated;
GRANT SELECT ON public.daily_stats TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_transactions TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_products_with_stock TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_customers TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_daily_stats TO authenticated;

-- Create cleanup function for old audit logs (prevent table bloat)
CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.audit_logs 
  WHERE timestamp < NOW() - INTERVAL '90 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Log the cleanup operation
  PERFORM public.create_audit_log(
    'audit_logs',
    'CLEANUP',
    'system',
    NULL,
    jsonb_build_object('deleted_count', deleted_count),
    jsonb_build_object('operation', 'automatic_cleanup')
  );
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Grant permission for cleanup function
GRANT EXECUTE ON FUNCTION public.cleanup_old_audit_logs TO authenticated;

-- Success message
SELECT 'Database performance optimization complete! Indexes added, views created, search functions optimized.' as status;


-- ============================================
-- Migration 43: 0039_fix_commission_trigger.sql
-- ============================================

-- Fix commission trigger - remove sku reference since it doesn't exist in products table
CREATE OR REPLACE FUNCTION populate_commission_product_info()
RETURNS TRIGGER AS $$
BEGIN
  -- Try to get product info from products table (remove sku reference)
  SELECT p.name 
  INTO NEW.product_name
  FROM products p 
  WHERE p.id = NEW.product_id;
  
  -- Set product_sku to product_id since sku column doesn't exist in products
  NEW.product_sku = NEW.product_id;
  
  -- If product name not found, use product_id as fallback
  IF NEW.product_name IS NULL THEN
    NEW.product_name = COALESCE(NEW.product_name, NEW.product_id);
  END IF;
  
  NEW.updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================
-- Migration 44: 0039_fix_products_category_constraint.sql
-- ============================================

-- Fix products category constraint issue  
-- Migration: 0039_fix_products_category_constraint.sql
-- Date: 2025-01-20
-- Purpose: Remove NOT NULL constraint from category since it's not used in the system

-- Option 1: Make category nullable (recommended since you don't use it)
ALTER TABLE public.products 
ALTER COLUMN category DROP NOT NULL;

-- Option 2: Set a simple default for any existing data
ALTER TABLE public.products 
ALTER COLUMN category SET DEFAULT 'Umum';

-- Update any existing records to have a default category
UPDATE public.products 
SET category = 'Umum' 
WHERE category IS NULL OR category = '';

-- Success message
SELECT 'Products category constraint removed! Category is now optional.' as status;


-- ============================================
-- Migration 45: 0040_debug_and_fix_products_insert.sql
-- ============================================

-- Debug and fix products insert issue
-- Migration: 0040_debug_and_fix_products_insert.sql  
-- Date: 2025-01-20
-- Purpose: Additional fixes and debugging for products table

-- First, let's see current table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'products' 
ORDER BY ordinal_position;

-- Make category nullable AND set default (belt and suspenders approach)
ALTER TABLE public.products 
ALTER COLUMN category DROP NOT NULL;

ALTER TABLE public.products 
ALTER COLUMN category SET DEFAULT 'Umum';

-- Update any existing records with null/empty category
UPDATE public.products 
SET category = COALESCE(NULLIF(category, ''), 'Umum')
WHERE category IS NULL OR category = '';

-- Let's also check if there might be a missing 'type' column that the app expects
-- If the app is looking for 'type' but database has 'category', we need to align

-- Add type column if it doesn't exist (the app seems to use 'type')
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'type'
  ) THEN
    ALTER TABLE public.products ADD COLUMN type TEXT DEFAULT 'Produksi';
    
    -- Copy category to type for existing records
    UPDATE public.products SET type = COALESCE(category, 'Produksi');
  END IF;
END $$;

-- Also ensure current_stock, min_stock columns exist (app seems to expect these)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'current_stock'
  ) THEN
    ALTER TABLE public.products ADD COLUMN current_stock NUMERIC DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'min_stock'
  ) THEN
    ALTER TABLE public.products ADD COLUMN min_stock NUMERIC DEFAULT 0;
  END IF;
END $$;

-- Show final table structure for verification
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'products' 
ORDER BY ordinal_position;

-- Success message
SELECT 'Products table structure fixed! Category is now nullable with default, type column added if needed.' as status;


-- ============================================
-- Migration 46: 0040_fix_commission_types.sql
-- ============================================

-- Fix commission table types to match products table
-- Change product_id from TEXT to UUID to match products.id

-- First, remove the trigger temporarily
DROP TRIGGER IF EXISTS trigger_populate_commission_product_info ON commission_rules;

-- Drop the existing function
DROP FUNCTION IF EXISTS populate_commission_product_info();

-- Alter commission_rules table to use UUID for product_id
ALTER TABLE commission_rules 
ALTER COLUMN product_id TYPE UUID USING product_id::uuid;

-- Alter commission_entries table to use UUID for product_id
ALTER TABLE commission_entries 
ALTER COLUMN product_id TYPE UUID USING product_id::uuid;

-- Recreate the trigger function with proper types
CREATE OR REPLACE FUNCTION populate_commission_product_info()
RETURNS TRIGGER AS $$
BEGIN
  -- Try to get product info from products table
  SELECT p.name 
  INTO NEW.product_name
  FROM products p 
  WHERE p.id = NEW.product_id;
  
  -- Set product_sku to product_id as text since sku column doesn't exist in products
  NEW.product_sku = NEW.product_id::text;
  
  -- If product name not found, use product_id as fallback
  IF NEW.product_name IS NULL THEN
    NEW.product_name = COALESCE(NEW.product_name, NEW.product_id::text);
  END IF;
  
  NEW.updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER trigger_populate_commission_product_info
  BEFORE INSERT OR UPDATE ON commission_rules
  FOR EACH ROW
  EXECUTE FUNCTION populate_commission_product_info();


-- ============================================
-- Migration 47: 0041_remove_sku_fix_rls.sql
-- ============================================

-- Remove SKU fields and fix RLS policy for commission system

-- First, drop the trigger temporarily
DROP TRIGGER IF EXISTS trigger_populate_commission_product_info ON commission_rules;
DROP FUNCTION IF EXISTS populate_commission_product_info();

-- Remove product_sku columns since we don't need them
ALTER TABLE commission_rules DROP COLUMN IF EXISTS product_sku;
ALTER TABLE commission_entries DROP COLUMN IF EXISTS product_sku;

-- Create simplified trigger function without SKU
CREATE OR REPLACE FUNCTION populate_commission_product_info()
RETURNS TRIGGER AS $$
BEGIN
  -- Try to get product name from products table
  SELECT p.name 
  INTO NEW.product_name
  FROM products p 
  WHERE p.id = NEW.product_id;
  
  -- If product name not found, use product_id as fallback
  IF NEW.product_name IS NULL THEN
    NEW.product_name = COALESCE(NEW.product_name, NEW.product_id::text);
  END IF;
  
  NEW.updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER trigger_populate_commission_product_info
  BEFORE INSERT OR UPDATE ON commission_rules
  FOR EACH ROW
  EXECUTE FUNCTION populate_commission_product_info();

-- Fix RLS policies for commission_rules
DROP POLICY IF EXISTS "Admin/Owner/Cashier can manage commission rules" ON commission_rules;
DROP POLICY IF EXISTS "Anyone can view commission rules" ON commission_rules;

-- More permissive RLS policies
CREATE POLICY "Anyone can view commission rules" ON commission_rules
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage commission rules" ON commission_rules
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Fix RLS policies for commission_entries
DROP POLICY IF EXISTS "Admin/Owner can manage commission entries" ON commission_entries;
DROP POLICY IF EXISTS "System can insert commission entries" ON commission_entries;
DROP POLICY IF EXISTS "Anyone can view commission entries" ON commission_entries;

-- More permissive RLS policies for commission_entries
CREATE POLICY "Anyone can view commission entries" ON commission_entries
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert commission entries" ON commission_entries
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can manage commission entries" ON commission_entries
  FOR ALL USING (auth.uid() IS NOT NULL);


-- ============================================
-- Migration 48: 0041_remove_unused_category_column.sql
-- ============================================

-- Remove unused category column from products table
-- Migration: 0041_remove_unused_category_column.sql
-- Date: 2025-01-20
-- Purpose: Remove category column since it's not used in the application

-- Step 1: Drop the category column (it's not used in the app)
ALTER TABLE public.products DROP COLUMN IF EXISTS category;

-- Step 2: Ensure type column exists (this is what the app uses)
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'Produksi';

-- Step 3: Ensure stock columns exist (app expects these)
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS current_stock NUMERIC DEFAULT 0;

ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS min_stock NUMERIC DEFAULT 0;

-- Step 4: Update any existing products to have proper type if NULL
UPDATE public.products 
SET type = COALESCE(NULLIF(type, ''), 'Produksi') 
WHERE type IS NULL OR type = '';

-- Success message
SELECT 'Category column removed successfully! Products table now aligned with app requirements.' as status;


-- ============================================
-- Migration 49: 0042_fix_production_records_product_id_constraint.sql
-- ============================================

-- Fix production_records table to allow NULL product_id for error records
-- This allows recording damaged materials without requiring a product reference

ALTER TABLE production_records 
ALTER COLUMN product_id DROP NOT NULL;

-- Update the foreign key constraint to handle NULL values properly
-- The existing constraint will work fine with NULL values

-- Add a check constraint to ensure data integrity:
-- - If product_id is NULL, quantity should be negative (indicating material loss/damage)
-- - If product_id is not NULL, quantity should be positive (normal production)
ALTER TABLE production_records 
ADD CONSTRAINT check_production_record_logic 
CHECK (
  (product_id IS NULL AND quantity <= 0) OR 
  (product_id IS NOT NULL AND quantity >= 0)
);

-- Add an index for better performance on queries filtering by product_id
-- This handles both NULL and non-NULL values efficiently
CREATE INDEX IF NOT EXISTS idx_production_records_product_id_nullable 
ON production_records(product_id) 
WHERE product_id IS NOT NULL;

-- Add an index for error records (NULL product_id)
CREATE INDEX IF NOT EXISTS idx_production_records_error_entries 
ON production_records(created_at) 
WHERE product_id IS NULL;


-- ============================================
-- Migration 50: 0043_add_production_error_reason.sql
-- ============================================

-- Add PRODUCTION_ERROR and PRODUCTION_DELETE_RESTORE reasons to material_stock_movements constraint
-- This allows recording material losses due to production errors and restoring stock when deleting production records

-- Drop the existing constraint
ALTER TABLE public.material_stock_movements 
DROP CONSTRAINT material_stock_movements_reason_check;

-- Add the updated constraint with new production-related reasons
ALTER TABLE public.material_stock_movements 
ADD CONSTRAINT material_stock_movements_reason_check 
CHECK (reason IN ('PURCHASE', 'PRODUCTION_CONSUMPTION', 'PRODUCTION_ACQUISITION', 'ADJUSTMENT', 'RETURN', 'PRODUCTION_ERROR', 'PRODUCTION_DELETE_RESTORE'));

-- Update comment to reflect the new reasons
COMMENT ON COLUMN public.material_stock_movements.reason IS 'Reason for movement: PURCHASE, PRODUCTION_CONSUMPTION, PRODUCTION_ACQUISITION, ADJUSTMENT, RETURN, PRODUCTION_ERROR, PRODUCTION_DELETE_RESTORE';


-- ============================================
-- Migration 51: 0044_create_update_remaining_amount_function.sql
-- ============================================

-- Create function to update remaining amount in employee_advances table
CREATE OR REPLACE FUNCTION public.update_remaining_amount(p_advance_id TEXT)
RETURNS void AS $$
DECLARE
  v_total_repaid NUMERIC := 0;
  v_original_amount NUMERIC := 0;
  v_new_remaining NUMERIC := 0;
BEGIN
  -- Get the original advance amount
  SELECT amount INTO v_original_amount
  FROM public.employee_advances 
  WHERE id = p_advance_id;
  
  IF v_original_amount IS NULL THEN
    RAISE EXCEPTION 'Advance with ID % not found', p_advance_id;
  END IF;
  
  -- Calculate total repaid amount for this advance
  SELECT COALESCE(SUM(amount), 0) INTO v_total_repaid
  FROM public.advance_repayments 
  WHERE advance_id = p_advance_id;
  
  -- Calculate new remaining amount
  v_new_remaining := v_original_amount - v_total_repaid;
  
  -- Ensure remaining amount doesn't go below 0
  IF v_new_remaining < 0 THEN
    v_new_remaining := 0;
  END IF;
  
  -- Update the remaining amount
  UPDATE public.employee_advances 
  SET remaining_amount = v_new_remaining
  WHERE id = p_advance_id;
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.update_remaining_amount(TEXT) TO authenticated;


-- ============================================
-- Migration 52: 0045_add_sales_columns_to_transactions.sql
-- ============================================

-- Add sales_id and sales_name columns to transactions table
-- Migration: 0045_add_sales_columns_to_transactions.sql
-- Date: 2025-09-06
-- Purpose: Support commission tracking for sales persons

-- Add sales columns to transactions table
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS sales_id UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS sales_name TEXT;

-- Add comments for new columns
COMMENT ON COLUMN public.transactions.sales_id IS 'ID of the sales person responsible for this transaction';
COMMENT ON COLUMN public.transactions.sales_name IS 'Name of the sales person responsible for this transaction';

-- Create index for sales_id for faster commission queries
CREATE INDEX IF NOT EXISTS idx_transactions_sales_id ON public.transactions(sales_id);

-- Success message
SELECT 'Kolom sales_id dan sales_name berhasil ditambahkan ke tabel transactions!' as status;


-- ============================================
-- Migration 53: 0046_fix_delivery_number_per_transaction.sql
-- ============================================

-- Fix delivery number to be per-transaction instead of global
-- This will make delivery numbers start from 1 for each transaction

-- First, update existing delivery numbers to be per-transaction
WITH delivery_with_row_number AS (
  SELECT 
    id,
    transaction_id,
    ROW_NUMBER() OVER (PARTITION BY transaction_id ORDER BY created_at ASC) as new_delivery_number
  FROM deliveries
  ORDER BY transaction_id, created_at
)
UPDATE deliveries 
SET delivery_number = delivery_with_row_number.new_delivery_number
FROM delivery_with_row_number 
WHERE deliveries.id = delivery_with_row_number.id;

-- Create function to generate delivery number per transaction
CREATE OR REPLACE FUNCTION generate_delivery_number()
RETURNS TRIGGER AS $$
DECLARE
  next_number INTEGER;
BEGIN
  -- Get the next delivery number for this transaction
  SELECT COALESCE(MAX(delivery_number), 0) + 1 
  INTO next_number
  FROM deliveries 
  WHERE transaction_id = NEW.transaction_id;
  
  -- Set the delivery number
  NEW.delivery_number = next_number;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing sequence and column default
ALTER TABLE deliveries ALTER COLUMN delivery_number DROP DEFAULT;
DROP SEQUENCE IF EXISTS deliveries_delivery_number_seq;

-- Create trigger to auto-generate delivery number per transaction
DROP TRIGGER IF EXISTS set_delivery_number_trigger ON deliveries;
CREATE TRIGGER set_delivery_number_trigger
  BEFORE INSERT ON deliveries
  FOR EACH ROW
  EXECUTE FUNCTION generate_delivery_number();

-- Add constraint to ensure delivery_number is positive
ALTER TABLE deliveries ADD CONSTRAINT delivery_number_positive CHECK (delivery_number > 0);

-- Create unique constraint for delivery_number per transaction (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'deliveries_transaction_delivery_number_key'
    AND table_name = 'deliveries'
  ) THEN
    ALTER TABLE deliveries ADD CONSTRAINT deliveries_transaction_delivery_number_key 
    UNIQUE (transaction_id, delivery_number);
  END IF;
END $$;


-- ============================================
-- Migration 54: 0100_add_expense_account_mapping.sql
-- ============================================

-- Add expense account mapping columns to expenses table
ALTER TABLE public.expenses 
ADD COLUMN IF NOT EXISTS expense_account_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS expense_account_name VARCHAR(100);

-- Add reference to accounts table for expense account
ALTER TABLE public.expenses 
ADD CONSTRAINT fk_expenses_expense_account 
FOREIGN KEY (expense_account_id) REFERENCES public.accounts(id);


-- ============================================
-- Migration 55: 0101_create_suppliers_table.sql
-- ============================================

-- ========================================
-- CREATE SUPPLIERS TABLE
-- ========================================
-- Purpose: Create suppliers master data table

-- Create suppliers table
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  contact_person VARCHAR(100),
  phone VARCHAR(20),
  email VARCHAR(100),
  address TEXT,
  city VARCHAR(50),
  postal_code VARCHAR(10),
  payment_terms VARCHAR(50) DEFAULT 'Cash', -- Cash, Net 30, Net 60, etc.
  tax_number VARCHAR(50), -- NPWP
  bank_account VARCHAR(100),
  bank_name VARCHAR(50),
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_suppliers_code ON public.suppliers(code);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON public.suppliers(name);
CREATE INDEX IF NOT EXISTS idx_suppliers_is_active ON public.suppliers(is_active);

-- Enable RLS
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Authenticated users can view suppliers" ON public.suppliers
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage suppliers" ON public.suppliers
  FOR ALL USING (auth.role() = 'authenticated');

-- Create supplier_materials table for price tracking per supplier
CREATE TABLE IF NOT EXISTS public.supplier_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  supplier_price NUMERIC NOT NULL CHECK (supplier_price > 0),
  unit VARCHAR(20) NOT NULL,
  min_order_qty INTEGER DEFAULT 1,
  lead_time_days INTEGER DEFAULT 7,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(supplier_id, material_id)
);

-- Create indexes for supplier_materials
CREATE INDEX IF NOT EXISTS idx_supplier_materials_supplier_id ON public.supplier_materials(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_materials_material_id ON public.supplier_materials(material_id);

-- Enable RLS for supplier_materials
ALTER TABLE public.supplier_materials ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for supplier_materials
CREATE POLICY "Authenticated users can view supplier materials" ON public.supplier_materials
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage supplier materials" ON public.supplier_materials
  FOR ALL USING (auth.role() = 'authenticated');

-- Add supplier_id to purchase_orders table
ALTER TABLE public.purchase_orders 
ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id),
ADD COLUMN IF NOT EXISTS quoted_price NUMERIC;

-- Create function to auto-generate supplier code
CREATE OR REPLACE FUNCTION generate_supplier_code()
RETURNS VARCHAR(20)
LANGUAGE plpgsql
AS $$
DECLARE
  new_code VARCHAR(20);
  counter INTEGER;
BEGIN
  -- Get the current max number from existing codes
  SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM 4) AS INTEGER)), 0) + 1
  INTO counter
  FROM suppliers
  WHERE code ~ '^SUP[0-9]+$';
  
  -- Generate new code
  new_code := 'SUP' || LPAD(counter::TEXT, 4, '0');
  
  RETURN new_code;
END;
$$;

-- Create trigger to auto-generate supplier code if not provided
CREATE OR REPLACE FUNCTION set_supplier_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    NEW.code := generate_supplier_code();
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_set_supplier_code
  BEFORE INSERT OR UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION set_supplier_code();

-- Insert sample suppliers
INSERT INTO public.suppliers (code, name, contact_person, phone, email, address, city, payment_terms) VALUES
('SUP0001', 'PT. Bahan Bangunan Jaya', 'Budi Santoso', '021-1234567', 'budi@bahanbangunanjaya.com', 'Jl. Industri No. 123', 'Jakarta', 'Net 30'),
('SUP0002', 'CV. Material Prima', 'Sari Dewi', '021-2345678', 'sari@materialprima.co.id', 'Jl. Gudang No. 456', 'Tangerang', 'Cash'),
('SUP0003', 'Toko Besi Berkah', 'Ahmad Rahman', '021-3456789', 'ahmad@besibekah.com', 'Jl. Logam No. 789', 'Bekasi', 'Net 14')
ON CONFLICT (code) DO NOTHING;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Suppliers table and integration created successfully!';
  RAISE NOTICE '';
  RAISE NOTICE '📊 TABLES CREATED:';
  RAISE NOTICE '   - suppliers: Master data supplier';
  RAISE NOTICE '   - supplier_materials: Price tracking per supplier';
  RAISE NOTICE '';
  RAISE NOTICE '🔗 INTEGRATIONS:';
  RAISE NOTICE '   - Added supplier_id to purchase_orders';
  RAISE NOTICE '   - Added quoted_price for manual price input';
  RAISE NOTICE '';
  RAISE NOTICE '📝 SAMPLE DATA:';
  RAISE NOTICE '   - 3 sample suppliers inserted';
  RAISE NOTICE '   - Auto-generated supplier codes (SUP0001, etc.)';
END $$;


-- ============================================
-- Migration 56: 0102_add_expedition_to_po.sql
-- ============================================

-- Add expedition field to purchase orders table
ALTER TABLE public.purchase_orders 
ADD COLUMN expedition VARCHAR(100);

-- Add index for better query performance
CREATE INDEX idx_purchase_orders_expedition ON public.purchase_orders(expedition);

-- Update existing rows to have null expedition
UPDATE public.purchase_orders SET expedition = NULL WHERE expedition IS NULL;


-- ============================================
-- Migration 57: 0103_add_po_receipt_fields.sql
-- ============================================

-- Add fields for purchase order receipt tracking
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_date timestamptz;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS delivery_note_photo text;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_by text;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_quantity numeric;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS expedition_receiver text;


-- ============================================
-- Migration 58: 0104_create_accounts_payable.sql
-- ============================================

-- Create accounts payable table
CREATE TABLE IF NOT EXISTS accounts_payable (
    id text PRIMARY KEY,
    purchase_order_id text REFERENCES purchase_orders(id) ON DELETE CASCADE,
    supplier_name text NOT NULL,
    amount numeric NOT NULL,
    due_date timestamptz,
    description text NOT NULL,
    status text NOT NULL DEFAULT 'Outstanding' CHECK (status IN ('Outstanding', 'Paid', 'Partial')),
    created_at timestamptz DEFAULT now(),
    paid_at timestamptz,
    paid_amount numeric DEFAULT 0,
    payment_account_id text REFERENCES accounts(id),
    notes text
);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_accounts_payable_po_id ON accounts_payable(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_accounts_payable_status ON accounts_payable(status);
CREATE INDEX IF NOT EXISTS idx_accounts_payable_created_at ON accounts_payable(created_at);


-- ============================================
-- Migration 59: 0105_create_payroll_system.sql
-- ============================================

-- ========================================
-- PAYROLL SYSTEM TABLES
-- ========================================
-- File: 0105_create_payroll_system.sql
-- Purpose: Create separate tables for employee salary management
-- Date: 2025-01-19

-- Step 1: Create employee_salaries table (Salary Configuration)
CREATE TABLE IF NOT EXISTS public.employee_salaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Salary Configuration
  base_salary DECIMAL(15,2) DEFAULT 0 NOT NULL,
  commission_rate DECIMAL(5,2) DEFAULT 0 NOT NULL,
  payroll_type VARCHAR(20) DEFAULT 'monthly' NOT NULL,
  commission_type VARCHAR(20) DEFAULT 'none' NOT NULL,

  -- Validity Period
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_until DATE NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,

  -- Metadata
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  notes TEXT,

  -- Constraints
  CONSTRAINT valid_commission_rate CHECK (commission_rate >= 0 AND commission_rate <= 100),
  CONSTRAINT valid_base_salary CHECK (base_salary >= 0),
  CONSTRAINT valid_payroll_type CHECK (payroll_type IN ('monthly', 'commission_only', 'mixed')),
  CONSTRAINT valid_commission_type CHECK (commission_type IN ('percentage', 'fixed_amount', 'none')),
  CONSTRAINT valid_effective_period CHECK (effective_until IS NULL OR effective_until >= effective_from)
);

-- Step 2: Create payroll_records table (Monthly Payroll Transactions)
CREATE TABLE IF NOT EXISTS public.payroll_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  salary_config_id UUID REFERENCES public.employee_salaries(id) ON DELETE SET NULL,

  -- Period
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Salary Components
  base_salary_amount DECIMAL(15,2) DEFAULT 0 NOT NULL,
  commission_amount DECIMAL(15,2) DEFAULT 0 NOT NULL,
  bonus_amount DECIMAL(15,2) DEFAULT 0 NOT NULL,
  deduction_amount DECIMAL(15,2) DEFAULT 0 NOT NULL,

  -- Totals (computed fields)
  gross_salary DECIMAL(15,2) GENERATED ALWAYS AS (
    base_salary_amount + commission_amount + bonus_amount
  ) STORED,
  net_salary DECIMAL(15,2) GENERATED ALWAYS AS (
    base_salary_amount + commission_amount + bonus_amount - deduction_amount
  ) STORED,

  -- Status and Payment
  status VARCHAR(20) DEFAULT 'draft' NOT NULL,
  payment_date DATE NULL,
  payment_account_id UUID REFERENCES public.accounts(id),

  -- Integration with cash_history
  cash_history_id UUID NULL,

  -- Metadata
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  notes TEXT,

  -- Constraints
  CONSTRAINT valid_period_year CHECK (period_year >= 2020 AND period_year <= 2100),
  CONSTRAINT valid_period_month CHECK (period_month >= 1 AND period_month <= 12),
  CONSTRAINT valid_status CHECK (status IN ('draft', 'approved', 'paid')),
  CONSTRAINT valid_amounts CHECK (
    base_salary_amount >= 0 AND
    commission_amount >= 0 AND
    bonus_amount >= 0 AND
    deduction_amount >= 0
  ),
  CONSTRAINT valid_period_dates CHECK (period_end >= period_start),

  -- Unique constraint: one payroll record per employee per month
  UNIQUE(employee_id, period_year, period_month)
);

-- Step 3: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_employee_salaries_employee_id ON public.employee_salaries(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_salaries_active ON public.employee_salaries(employee_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_employee_salaries_effective_period ON public.employee_salaries(effective_from, effective_until);

CREATE INDEX IF NOT EXISTS idx_payroll_records_employee_id ON public.payroll_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_records_period ON public.payroll_records(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_payroll_records_status ON public.payroll_records(status);
CREATE INDEX IF NOT EXISTS idx_payroll_records_payment_date ON public.payroll_records(payment_date) WHERE payment_date IS NOT NULL;

-- Step 4: Create updated_at triggers
CREATE OR REPLACE FUNCTION public.update_payroll_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_employee_salaries_updated_at
  BEFORE UPDATE ON public.employee_salaries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_payroll_updated_at();

CREATE TRIGGER update_payroll_records_updated_at
  BEFORE UPDATE ON public.payroll_records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_payroll_updated_at();

-- Step 5: Row Level Security (RLS) Policies
ALTER TABLE public.employee_salaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;

-- RLS for employee_salaries
CREATE POLICY "Admin and owner can view all employee salaries" ON public.employee_salaries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('owner', 'admin')
      AND p.status = 'Aktif'
    )
  );

CREATE POLICY "Admin and owner can manage employee salaries" ON public.employee_salaries
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('owner', 'admin')
      AND p.status = 'Aktif'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('owner', 'admin')
      AND p.status = 'Aktif'
    )
  );

-- RLS for payroll_records
CREATE POLICY "Admin and owner can view all payroll records" ON public.payroll_records
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('owner', 'admin')
      AND p.status = 'Aktif'
    )
  );

CREATE POLICY "Admin and owner can manage payroll records" ON public.payroll_records
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('owner', 'admin')
      AND p.status = 'Aktif'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('owner', 'admin')
      AND p.status = 'Aktif'
    )
  );

-- Step 6: Create helper functions
CREATE OR REPLACE FUNCTION public.get_active_salary_config(emp_id UUID, check_date DATE DEFAULT CURRENT_DATE)
RETURNS public.employee_salaries AS $$
DECLARE
  result public.employee_salaries;
BEGIN
  SELECT * INTO result
  FROM public.employee_salaries
  WHERE employee_id = emp_id
    AND is_active = true
    AND effective_from <= check_date
    AND (effective_until IS NULL OR effective_until >= check_date)
  ORDER BY effective_from DESC
  LIMIT 1;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.calculate_commission_for_period(
  emp_id UUID,
  start_date DATE,
  end_date DATE
)
RETURNS DECIMAL(15,2) AS $$
DECLARE
  salary_config public.employee_salaries;
  total_commission DECIMAL(15,2) := 0;
  commission_base DECIMAL(15,2) := 0;
BEGIN
  -- Get active salary configuration
  SELECT * INTO salary_config FROM public.get_active_salary_config(emp_id, start_date);

  IF salary_config IS NULL OR salary_config.commission_rate = 0 THEN
    RETURN 0;
  END IF;

  -- Calculate commission base from various sources
  -- 1. From deliveries (for drivers/helpers)
  SELECT COALESCE(SUM(d.total_amount), 0) INTO commission_base
  FROM deliveries d
  WHERE (d.driver_id = emp_id OR d.helper_id = emp_id)
    AND d.delivery_date >= start_date
    AND d.delivery_date <= end_date
    AND d.status = 'completed';

  -- 2. From sales transactions (for sales staff) - can be added later
  -- Add more commission sources here as needed

  -- Calculate commission based on type
  IF salary_config.commission_type = 'percentage' THEN
    total_commission := commission_base * (salary_config.commission_rate / 100);
  ELSIF salary_config.commission_type = 'fixed_amount' THEN
    total_commission := salary_config.commission_rate; -- Fixed amount per month
  END IF;

  RETURN total_commission;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 7: Create views for easier querying
CREATE OR REPLACE VIEW public.employee_salary_summary AS
SELECT
  es.id as salary_config_id,
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
  es.created_at,
  es.notes
FROM public.employee_salaries es
JOIN public.profiles p ON p.id = es.employee_id
WHERE p.status != 'Nonaktif';

CREATE OR REPLACE VIEW public.payroll_summary AS
SELECT
  pr.id as payroll_id,
  pr.employee_id,
  p.full_name as employee_name,
  p.role as employee_role,
  pr.period_year,
  pr.period_month,
  TO_CHAR(DATE(pr.period_year || '-' || pr.period_month || '-01'), 'Month YYYY') as period_display,
  pr.base_salary_amount,
  pr.commission_amount,
  pr.bonus_amount,
  pr.deduction_amount,
  pr.gross_salary,
  pr.net_salary,
  pr.status,
  pr.payment_date,
  a.name as payment_account_name,
  pr.created_at,
  pr.notes
FROM public.payroll_records pr
JOIN public.profiles p ON p.id = pr.employee_id
LEFT JOIN public.accounts a ON a.id = pr.payment_account_id
WHERE p.status != 'Nonaktif'
ORDER BY pr.period_year DESC, pr.period_month DESC, p.full_name;

-- Grant permissions on views
GRANT SELECT ON public.employee_salary_summary TO authenticated;
GRANT SELECT ON public.payroll_summary TO authenticated;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION public.get_active_salary_config(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_commission_for_period(UUID, DATE, DATE) TO authenticated;

-- Step 8: Insert sample data for testing (optional)
-- This will be done through the UI, but can be uncommented for testing

/*
-- Sample salary configurations
INSERT INTO public.employee_salaries (employee_id, base_salary, commission_rate, payroll_type, commission_type, notes)
SELECT
  id as employee_id,
  CASE
    WHEN role IN ('driver', 'helper') THEN 3000000
    WHEN role IN ('admin', 'cashier') THEN 4000000
    WHEN role = 'sales' THEN 2000000
    ELSE 3500000
  END as base_salary,
  CASE
    WHEN role IN ('driver', 'helper') THEN 5
    WHEN role = 'sales' THEN 10
    ELSE 0
  END as commission_rate,
  CASE
    WHEN role = 'sales' THEN 'mixed'
    WHEN role IN ('driver', 'helper') THEN 'mixed'
    ELSE 'monthly'
  END as payroll_type,
  CASE
    WHEN role IN ('driver', 'helper', 'sales') THEN 'percentage'
    ELSE 'none'
  END as commission_type,
  'Initial salary configuration' as notes
FROM public.profiles
WHERE status = 'Aktif' AND role IS NOT NULL;
*/

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Payroll system tables created successfully!';
  RAISE NOTICE '📊 Tables: employee_salaries, payroll_records';
  RAISE NOTICE '🔒 RLS policies applied';
  RAISE NOTICE '📈 Views: employee_salary_summary, payroll_summary';
  RAISE NOTICE '⚙️ Functions: get_active_salary_config, calculate_commission_for_period';
END $$;


-- ============================================
-- Migration 60: 0106_add_advance_payroll_integration.sql
-- ============================================

-- ========================================
-- ADVANCE-PAYROLL INTEGRATION
-- ========================================
-- File: 0106_add_advance_payroll_integration.sql
-- Purpose: Integrate employee advances with payroll system
-- Date: 2025-01-19

-- Step 1: Create function to calculate outstanding advances for an employee
CREATE OR REPLACE FUNCTION public.get_outstanding_advances(emp_id UUID, up_to_date DATE DEFAULT CURRENT_DATE)
RETURNS DECIMAL(15,2) AS $$
DECLARE
  total_advances DECIMAL(15,2) := 0;
  total_repayments DECIMAL(15,2) := 0;
  outstanding DECIMAL(15,2) := 0;
BEGIN
  -- Calculate total advances up to the specified date
  SELECT COALESCE(SUM(amount), 0) INTO total_advances
  FROM public.employee_advances
  WHERE employee_id = emp_id
    AND date <= up_to_date;

  -- Calculate total repayments up to the specified date
  SELECT COALESCE(SUM(ar.amount), 0) INTO total_repayments
  FROM public.advance_repayments ar
  JOIN public.employee_advances ea ON ea.id = ar.advance_id
  WHERE ea.employee_id = emp_id
    AND ar.date <= up_to_date;

  -- Calculate outstanding amount
  outstanding := total_advances - total_repayments;

  -- Return 0 if negative (overpaid)
  RETURN GREATEST(outstanding, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 2: Create function to auto-calculate payroll with advance deduction
CREATE OR REPLACE FUNCTION public.calculate_payroll_with_advances(
  emp_id UUID,
  period_year INTEGER,
  period_month INTEGER
)
RETURNS JSONB AS $$
DECLARE
  salary_config public.employee_salaries;
  period_start DATE;
  period_end DATE;
  base_salary DECIMAL(15,2) := 0;
  commission_amount DECIMAL(15,2) := 0;
  outstanding_advances DECIMAL(15,2) := 0;
  advance_deduction DECIMAL(15,2) := 0;
  bonus_amount DECIMAL(15,2) := 0;
  total_deduction DECIMAL(15,2) := 0;
  gross_salary DECIMAL(15,2) := 0;
  net_salary DECIMAL(15,2) := 0;
  result JSONB;
BEGIN
  -- Calculate period dates
  period_start := DATE(period_year || '-' || period_month || '-01');
  period_end := (period_start + INTERVAL '1 month - 1 day')::DATE;

  -- Get active salary configuration
  SELECT * INTO salary_config FROM public.get_active_salary_config(emp_id, period_start);

  IF salary_config IS NULL THEN
    RAISE EXCEPTION 'No active salary configuration found for employee';
  END IF;

  -- Calculate base salary
  IF salary_config.payroll_type IN ('monthly', 'mixed') THEN
    base_salary := salary_config.base_salary;
  END IF;

  -- Calculate commission
  IF salary_config.payroll_type IN ('commission_only', 'mixed') AND salary_config.commission_rate > 0 THEN
    commission_amount := public.calculate_commission_for_period(emp_id, period_start, period_end);
  END IF;

  -- Calculate outstanding advances (up to end of payroll period)
  outstanding_advances := public.get_outstanding_advances(emp_id, period_end);

  -- Calculate gross salary
  gross_salary := base_salary + commission_amount + bonus_amount;

  -- Calculate advance deduction (don't deduct more than net salary)
  advance_deduction := LEAST(outstanding_advances, gross_salary);
  total_deduction := advance_deduction;

  -- Calculate net salary
  net_salary := gross_salary - total_deduction;

  -- Build result JSON
  result := jsonb_build_object(
    'employeeId', emp_id,
    'periodYear', period_year,
    'periodMonth', period_month,
    'periodStart', period_start,
    'periodEnd', period_end,
    'baseSalary', base_salary,
    'commissionAmount', commission_amount,
    'bonusAmount', bonus_amount,
    'outstandingAdvances', outstanding_advances,
    'advanceDeduction', advance_deduction,
    'totalDeduction', total_deduction,
    'grossSalary', gross_salary,
    'netSalary', net_salary,
    'salaryConfigId', salary_config.id,
    'payrollType', salary_config.payroll_type
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 3: Create function to automatically repay advances when salary is paid
CREATE OR REPLACE FUNCTION public.process_advance_repayment_from_salary(
  payroll_record_id UUID,
  advance_deduction_amount DECIMAL(15,2)
)
RETURNS VOID AS $$
DECLARE
  payroll_record RECORD;
  remaining_deduction DECIMAL(15,2);
  advance_record RECORD;
  repayment_amount DECIMAL(15,2);
BEGIN
  -- Get payroll record details
  SELECT pr.*, p.full_name as employee_name
  INTO payroll_record
  FROM public.payroll_records pr
  JOIN public.profiles p ON p.id = pr.employee_id
  WHERE pr.id = payroll_record_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll record not found';
  END IF;

  remaining_deduction := advance_deduction_amount;

  -- Process advances in chronological order (FIFO)
  FOR advance_record IN
    SELECT ea.*, (ea.amount - COALESCE(SUM(ar.amount), 0)) as remaining_amount
    FROM public.employee_advances ea
    LEFT JOIN public.advance_repayments ar ON ar.advance_id = ea.id
    WHERE ea.employee_id = payroll_record.employee_id
      AND ea.date <= payroll_record.period_end
    GROUP BY ea.id, ea.amount, ea.date, ea.employee_id, ea.employee_name, ea.notes, ea.created_at, ea.account_id, ea.account_name
    HAVING (ea.amount - COALESCE(SUM(ar.amount), 0)) > 0
    ORDER BY ea.date ASC
  LOOP
    -- Calculate repayment amount for this advance
    repayment_amount := LEAST(remaining_deduction, advance_record.remaining_amount);

    -- Create repayment record
    INSERT INTO public.advance_repayments (
      id,
      advance_id,
      amount,
      date,
      recorded_by,
      notes
    ) VALUES (
      'rep-' || extract(epoch from now())::bigint || '-' || substring(advance_record.id from 5),
      advance_record.id,
      repayment_amount,
      payroll_record.payment_date,
      payroll_record.created_by,
      'Pemotongan gaji ' || TO_CHAR(DATE(payroll_record.period_year || '-' || payroll_record.period_month || '-01'), 'Month YYYY')
    );

    -- Update remaining deduction
    remaining_deduction := remaining_deduction - repayment_amount;

    -- Update remaining amount using RPC
    PERFORM public.update_remaining_amount(advance_record.id);

    -- Exit if all deduction is processed
    IF remaining_deduction <= 0 THEN
      EXIT;
    END IF;
  END LOOP;

  -- Update account balances for the repayments
  -- Decrease panjar karyawan account (1220)
  PERFORM public.update_account_balance('acc-1220', -advance_deduction_amount);

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Create trigger to auto-process advance repayments when payroll is paid
CREATE OR REPLACE FUNCTION public.trigger_process_advance_repayment()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process when payroll status changes to 'paid' and there are deductions
  IF NEW.status = 'paid' AND OLD.status != 'paid' AND NEW.deduction_amount > 0 THEN
    -- Process advance repayments
    PERFORM public.process_advance_repayment_from_salary(NEW.id, NEW.deduction_amount);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS payroll_advance_repayment_trigger ON public.payroll_records;
CREATE TRIGGER payroll_advance_repayment_trigger
  AFTER UPDATE ON public.payroll_records
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_process_advance_repayment();

-- Step 5: Add advance-related columns to payroll views
CREATE OR REPLACE VIEW public.payroll_summary AS
SELECT
  pr.id as payroll_id,
  pr.employee_id,
  p.full_name as employee_name,
  p.role as employee_role,
  pr.salary_config_id,
  pr.period_year,
  pr.period_month,
  pr.period_start,
  pr.period_end,
  TO_CHAR(DATE(pr.period_year || '-' || pr.period_month || '-01'), 'Month YYYY') as period_display,
  pr.base_salary_amount,
  pr.commission_amount,
  pr.bonus_amount,
  pr.deduction_amount,
  -- Calculate advance-related info
  public.get_outstanding_advances(pr.employee_id, pr.period_end) as outstanding_advances,
  pr.gross_salary,
  pr.net_salary,
  pr.status,
  pr.payment_date,
  pr.payment_account_id,
  a.name as payment_account_name,
  pr.cash_history_id,
  pr.created_by,
  pr.created_at,
  pr.updated_at,
  pr.notes
FROM public.payroll_records pr
JOIN public.profiles p ON p.id = pr.employee_id
LEFT JOIN public.accounts a ON a.id = pr.payment_account_id
WHERE p.status != 'Nonaktif'
ORDER BY pr.period_year DESC, pr.period_month DESC, p.full_name;

-- Step 6: Grant permissions
GRANT EXECUTE ON FUNCTION public.get_outstanding_advances(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_payroll_with_advances(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_advance_repayment_from_salary(UUID, DECIMAL) TO authenticated;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Advance-Payroll integration created successfully!';
  RAISE NOTICE '🔗 Functions: get_outstanding_advances, calculate_payroll_with_advances';
  RAISE NOTICE '⚡ Auto-repayment trigger added to payroll_records';
  RAISE NOTICE '📊 Updated payroll_summary view with advance info';
END $$;


-- ============================================
-- Migration 61: 0107_integrate_commission_reports.sql
-- ============================================

-- ========================================
-- COMMISSION REPORTS INTEGRATION
-- ========================================
-- File: 0107_integrate_commission_reports.sql
-- Purpose: Integrate commission reports with payroll system
-- Date: 2025-01-19

-- Step 1: Create view to combine delivery commissions and payroll commissions
CREATE OR REPLACE VIEW public.unified_commission_report AS
WITH delivery_commissions AS (
  -- Get commissions from deliveries (existing system)
  SELECT
    d.driver_id as employee_id,
    p1.full_name as employee_name,
    p1.role as employee_role,
    'delivery' as commission_source,
    d.delivery_date as commission_date,
    EXTRACT(YEAR FROM d.delivery_date) as commission_year,
    EXTRACT(MONTH FROM d.delivery_date) as commission_month,
    d.total_amount as base_amount,
    COALESCE(
      CASE
        WHEN es.commission_type = 'percentage' THEN d.total_amount * (es.commission_rate / 100)
        WHEN es.commission_type = 'fixed_amount' THEN es.commission_rate
        ELSE 0
      END, 0
    ) as commission_amount,
    es.commission_rate,
    es.commission_type,
    d.id as reference_id,
    'Delivery #' || d.id as reference_name,
    d.created_at
  FROM deliveries d
  JOIN profiles p1 ON p1.id = d.driver_id
  LEFT JOIN employee_salaries es ON es.employee_id = d.driver_id
    AND es.is_active = true
    AND d.delivery_date BETWEEN es.effective_from AND COALESCE(es.effective_until, '9999-12-31')
  WHERE d.status = 'completed'

  UNION ALL

  -- Helper commissions
  SELECT
    d.helper_id as employee_id,
    p2.full_name as employee_name,
    p2.role as employee_role,
    'delivery' as commission_source,
    d.delivery_date as commission_date,
    EXTRACT(YEAR FROM d.delivery_date) as commission_year,
    EXTRACT(MONTH FROM d.delivery_date) as commission_month,
    d.total_amount as base_amount,
    COALESCE(
      CASE
        WHEN es.commission_type = 'percentage' THEN d.total_amount * (es.commission_rate / 100)
        WHEN es.commission_type = 'fixed_amount' THEN es.commission_rate
        ELSE 0
      END, 0
    ) as commission_amount,
    es.commission_rate,
    es.commission_type,
    d.id as reference_id,
    'Delivery #' || d.id as reference_name,
    d.created_at
  FROM deliveries d
  JOIN profiles p2 ON p2.id = d.helper_id
  LEFT JOIN employee_salaries es ON es.employee_id = d.helper_id
    AND es.is_active = true
    AND d.delivery_date BETWEEN es.effective_from AND COALESCE(es.effective_until, '9999-12-31')
  WHERE d.status = 'completed' AND d.helper_id IS NOT NULL
),
payroll_commissions AS (
  -- Get commissions from payroll records (new system)
  SELECT
    pr.employee_id,
    p.full_name as employee_name,
    p.role as employee_role,
    'payroll' as commission_source,
    DATE(pr.period_year || '-' || pr.period_month || '-15') as commission_date, -- Mid-month for payroll
    pr.period_year as commission_year,
    pr.period_month as commission_month,
    (pr.base_salary_amount + pr.bonus_amount) as base_amount, -- Base for commission calculation
    pr.commission_amount,
    es.commission_rate,
    es.commission_type,
    pr.id as reference_id,
    'Payroll ' || TO_CHAR(DATE(pr.period_year || '-' || pr.period_month || '-01'), 'Month YYYY') as reference_name,
    pr.created_at
  FROM payroll_records pr
  JOIN profiles p ON p.id = pr.employee_id
  LEFT JOIN employee_salaries es ON es.id = pr.salary_config_id
  WHERE pr.commission_amount > 0
)
SELECT
  employee_id,
  employee_name,
  employee_role,
  commission_source,
  commission_date,
  commission_year,
  commission_month,
  base_amount,
  commission_amount,
  commission_rate,
  commission_type,
  reference_id,
  reference_name,
  created_at,
  -- Additional computed fields
  CASE
    WHEN commission_source = 'delivery' THEN 'Komisi Pengantaran'
    WHEN commission_source = 'payroll' THEN 'Komisi Gaji'
    ELSE 'Komisi Lain'
  END as commission_source_display,
  TO_CHAR(commission_date, 'Month YYYY') as period_display
FROM delivery_commissions
WHERE commission_amount > 0

UNION ALL

SELECT
  employee_id,
  employee_name,
  employee_role,
  commission_source,
  commission_date,
  commission_year,
  commission_month,
  base_amount,
  commission_amount,
  commission_rate,
  commission_type,
  reference_id,
  reference_name,
  created_at,
  CASE
    WHEN commission_source = 'delivery' THEN 'Komisi Pengantaran'
    WHEN commission_source = 'payroll' THEN 'Komisi Gaji'
    ELSE 'Komisi Lain'
  END as commission_source_display,
  TO_CHAR(commission_date, 'Month YYYY') as period_display
FROM payroll_commissions
WHERE commission_amount > 0

ORDER BY commission_date DESC, employee_name ASC;

-- Step 2: Create function to get commission summary by employee and period
CREATE OR REPLACE FUNCTION public.get_commission_summary(
  emp_id UUID DEFAULT NULL,
  start_date DATE DEFAULT NULL,
  end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  employee_id UUID,
  employee_name TEXT,
  employee_role TEXT,
  total_commission DECIMAL(15,2),
  delivery_commission DECIMAL(15,2),
  payroll_commission DECIMAL(15,2),
  commission_count INTEGER,
  period_start DATE,
  period_end DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ucr.employee_id,
    ucr.employee_name,
    ucr.employee_role,
    SUM(ucr.commission_amount) as total_commission,
    SUM(CASE WHEN ucr.commission_source = 'delivery' THEN ucr.commission_amount ELSE 0 END) as delivery_commission,
    SUM(CASE WHEN ucr.commission_source = 'payroll' THEN ucr.commission_amount ELSE 0 END) as payroll_commission,
    COUNT(*)::INTEGER as commission_count,
    COALESCE(start_date, MIN(ucr.commission_date)) as period_start,
    COALESCE(end_date, MAX(ucr.commission_date)) as period_end
  FROM public.unified_commission_report ucr
  WHERE
    (emp_id IS NULL OR ucr.employee_id = emp_id)
    AND (start_date IS NULL OR ucr.commission_date >= start_date)
    AND (end_date IS NULL OR ucr.commission_date <= end_date)
  GROUP BY ucr.employee_id, ucr.employee_name, ucr.employee_role
  ORDER BY total_commission DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 3: Create function to sync commissions from payroll to commission entries
CREATE OR REPLACE FUNCTION public.sync_payroll_commissions_to_entries()
RETURNS INTEGER AS $$
DECLARE
  synced_count INTEGER := 0;
  payroll_record RECORD;
BEGIN
  -- Loop through payroll records with commissions that haven't been synced
  FOR payroll_record IN
    SELECT
      pr.*,
      p.full_name as employee_name,
      p.role as employee_role
    FROM payroll_records pr
    JOIN profiles p ON p.id = pr.employee_id
    WHERE pr.commission_amount > 0
      AND pr.status = 'paid'
      AND NOT EXISTS (
        SELECT 1 FROM commission_entries ce
        WHERE ce.source_id = pr.id AND ce.source_type = 'payroll'
      )
  LOOP
    -- Insert commission entry for the payroll commission
    INSERT INTO commission_entries (
      id,
      user_id,
      user_name,
      role,
      amount,
      quantity,
      product_name,
      delivery_id,
      source_type,
      source_id,
      created_at
    ) VALUES (
      'comm-payroll-' || payroll_record.id,
      payroll_record.employee_id,
      payroll_record.employee_name,
      payroll_record.employee_role,
      payroll_record.commission_amount,
      1, -- Quantity 1 for payroll commission
      'Komisi Gaji ' || TO_CHAR(DATE(payroll_record.period_year || '-' || payroll_record.period_month || '-01'), 'Month YYYY'),
      NULL, -- No delivery_id for payroll commissions
      'payroll',
      payroll_record.id,
      payroll_record.created_at
    );

    synced_count := synced_count + 1;
  END LOOP;

  RETURN synced_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Create trigger to auto-sync commissions when payroll is paid
CREATE OR REPLACE FUNCTION public.trigger_sync_payroll_commission()
RETURNS TRIGGER AS $$
BEGIN
  -- When payroll status changes to 'paid' and has commission amount
  IF NEW.status = 'paid' AND OLD.status != 'paid' AND NEW.commission_amount > 0 THEN
    -- Check if commission entry doesn't already exist
    IF NOT EXISTS (
      SELECT 1 FROM commission_entries ce
      WHERE ce.source_id = NEW.id AND ce.source_type = 'payroll'
    ) THEN
      -- Get employee info
      DECLARE
        emp_name TEXT;
        emp_role TEXT;
      BEGIN
        SELECT p.full_name, p.role INTO emp_name, emp_role
        FROM profiles p WHERE p.id = NEW.employee_id;

        -- Insert commission entry
        INSERT INTO commission_entries (
          id,
          user_id,
          user_name,
          role,
          amount,
          quantity,
          product_name,
          delivery_id,
          source_type,
          source_id,
          created_at
        ) VALUES (
          'comm-payroll-' || NEW.id,
          NEW.employee_id,
          emp_name,
          emp_role,
          NEW.commission_amount,
          1,
          'Komisi Gaji ' || TO_CHAR(DATE(NEW.period_year || '-' || NEW.period_month || '-01'), 'Month YYYY'),
          NULL,
          'payroll',
          NEW.id,
          NOW()
        );
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS payroll_commission_sync_trigger ON public.payroll_records;
CREATE TRIGGER payroll_commission_sync_trigger
  AFTER UPDATE ON public.payroll_records
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_sync_payroll_commission();

-- Step 5: Grant permissions
GRANT SELECT ON public.unified_commission_report TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_commission_summary(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_payroll_commissions_to_entries() TO authenticated;

-- Step 6: Sync existing payroll commissions (one-time operation)
-- This will be commented out after first run
/*
SELECT public.sync_payroll_commissions_to_entries();
*/

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Commission reports integration completed!';
  RAISE NOTICE '📊 View: unified_commission_report (combines delivery + payroll commissions)';
  RAISE NOTICE '📈 Function: get_commission_summary for aggregated reports';
  RAISE NOTICE '🔄 Auto-sync trigger for payroll commissions';
  RAISE NOTICE '⚡ Run sync_payroll_commissions_to_entries() to sync existing data';
END $$;


-- ============================================
-- Migration 62: 0108_add_retasi_to_transactions.sql
-- ============================================

-- Add retasi columns to transactions table
-- This allows linking driver transactions to their active retasi

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS retasi_id uuid REFERENCES retasi(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS retasi_number text;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_transactions_retasi_id ON transactions(retasi_id);
CREATE INDEX IF NOT EXISTS idx_transactions_retasi_number ON transactions(retasi_number);

-- Add comment to explain the purpose
COMMENT ON COLUMN transactions.retasi_id IS 'Reference to retasi table - links driver transactions to their active retasi';
COMMENT ON COLUMN transactions.retasi_number IS 'Retasi number for display purposes (e.g., RET-20251213-001)';



-- ============================================
-- Migration 63: 0114_add_interest_to_accounts_payable.sql
-- ============================================

-- Add interest rate fields to accounts_payable table
ALTER TABLE accounts_payable
ADD COLUMN IF NOT EXISTS interest_rate numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS interest_type text DEFAULT 'flat' CHECK (interest_type IN ('flat', 'per_month', 'per_year')),
ADD COLUMN IF NOT EXISTS creditor_type text DEFAULT 'supplier' CHECK (creditor_type IN ('supplier', 'bank', 'credit_card', 'other'));

-- Add comment for clarity
COMMENT ON COLUMN accounts_payable.interest_rate IS 'Interest rate in percentage (e.g., 5 for 5%)';
COMMENT ON COLUMN accounts_payable.interest_type IS 'Type of interest calculation: flat (one-time), per_month (monthly), per_year (annual)';
COMMENT ON COLUMN accounts_payable.creditor_type IS 'Type of creditor: supplier, bank, credit_card, or other';



-- ============================================
-- Migration 64: 0115_create_assets_and_maintenance_system.sql
-- ============================================

-- =====================================================
-- ASSET AND MAINTENANCE MANAGEMENT SYSTEM
-- =====================================================
-- This migration creates tables for:
-- 1. Assets (physical assets like equipment, vehicles, etc.)
-- 2. Maintenance records (scheduled and completed maintenance)
-- 3. Notifications system (for maintenance reminders and other alerts)
-- =====================================================

-- =====================================================
-- 1. ASSETS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    asset_name TEXT NOT NULL,
    asset_code TEXT UNIQUE NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('equipment', 'vehicle', 'building', 'furniture', 'computer', 'other')),
    description TEXT,

    -- Purchase Information
    purchase_date DATE NOT NULL,
    purchase_price NUMERIC(15, 2) NOT NULL DEFAULT 0,
    supplier_name TEXT,

    -- Asset Details
    brand TEXT,
    model TEXT,
    serial_number TEXT,
    location TEXT,

    -- Depreciation
    useful_life_years INTEGER DEFAULT 5,
    salvage_value NUMERIC(15, 2) DEFAULT 0,
    depreciation_method TEXT DEFAULT 'straight_line' CHECK (depreciation_method IN ('straight_line', 'declining_balance')),

    -- Status
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'retired', 'sold')),
    condition TEXT DEFAULT 'good' CHECK (condition IN ('excellent', 'good', 'fair', 'poor')),

    -- Financial Integration
    account_id TEXT REFERENCES accounts(id),
    current_value NUMERIC(15, 2),

    -- Additional Info
    warranty_expiry DATE,
    insurance_expiry DATE,
    notes TEXT,
    photo_url TEXT,

    -- Metadata
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_location ON assets(location);
CREATE INDEX IF NOT EXISTS idx_assets_purchase_date ON assets(purchase_date);

-- =====================================================
-- 2. MAINTENANCE RECORDS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS asset_maintenance (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,

    -- Maintenance Type
    maintenance_type TEXT NOT NULL CHECK (maintenance_type IN ('preventive', 'corrective', 'inspection', 'calibration', 'other')),
    title TEXT NOT NULL,
    description TEXT,

    -- Schedule Information
    scheduled_date DATE NOT NULL,
    completed_date DATE,
    next_maintenance_date DATE,

    -- Frequency (for recurring maintenance)
    is_recurring BOOLEAN DEFAULT FALSE,
    recurrence_interval INTEGER, -- in days
    recurrence_unit TEXT CHECK (recurrence_unit IN ('days', 'weeks', 'months', 'years')),

    -- Status
    status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled', 'overdue')),
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),

    -- Cost Information
    estimated_cost NUMERIC(15, 2) DEFAULT 0,
    actual_cost NUMERIC(15, 2) DEFAULT 0,
    payment_account_id TEXT REFERENCES accounts(id),

    -- Service Provider
    service_provider TEXT,
    technician_name TEXT,

    -- Parts Used
    parts_replaced TEXT, -- JSON array of parts
    labor_hours NUMERIC(8, 2),

    -- Result
    work_performed TEXT,
    findings TEXT,
    recommendations TEXT,

    -- Attachments
    attachments TEXT, -- JSON array of file URLs

    -- Notification
    notify_before_days INTEGER DEFAULT 7, -- Notify X days before due date
    notification_sent BOOLEAN DEFAULT FALSE,

    -- Metadata
    created_by UUID REFERENCES auth.users(id),
    completed_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for maintenance
CREATE INDEX IF NOT EXISTS idx_maintenance_asset ON asset_maintenance(asset_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_status ON asset_maintenance(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_scheduled_date ON asset_maintenance(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_priority ON asset_maintenance(priority);
CREATE INDEX IF NOT EXISTS idx_maintenance_type ON asset_maintenance(maintenance_type);

-- =====================================================
-- 3. NOTIFICATIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,

    -- Notification Details
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN (
        'maintenance_due',
        'maintenance_overdue',
        'warranty_expiry',
        'insurance_expiry',
        'purchase_order_created',
        'purchase_order_received',
        'production_completed',
        'advance_request',
        'payroll_processed',
        'debt_payment',
        'low_stock',
        'transaction_created',
        'delivery_scheduled',
        'system_alert',
        'other'
    )),

    -- Reference Information
    reference_type TEXT, -- 'asset', 'maintenance', 'purchase_order', 'transaction', etc.
    reference_id TEXT,
    reference_url TEXT, -- Deep link to the relevant page

    -- Priority
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

    -- Status
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,

    -- Target User
    user_id UUID REFERENCES auth.users(id),

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ -- Auto-delete after expiry
);

-- Indexes for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_reference ON notifications(reference_type, reference_id);

-- =====================================================
-- 4. FUNCTIONS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_assets_updated_at
    BEFORE UPDATE ON assets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_maintenance_updated_at
    BEFORE UPDATE ON asset_maintenance
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate asset current value (depreciation)
CREATE OR REPLACE FUNCTION calculate_asset_current_value(
    p_asset_id TEXT
)
RETURNS NUMERIC AS $$
DECLARE
    v_purchase_price NUMERIC;
    v_purchase_date DATE;
    v_useful_life_years INTEGER;
    v_salvage_value NUMERIC;
    v_depreciation_method TEXT;
    v_years_elapsed NUMERIC;
    v_current_value NUMERIC;
BEGIN
    -- Get asset details
    SELECT
        purchase_price,
        purchase_date,
        useful_life_years,
        salvage_value,
        depreciation_method
    INTO
        v_purchase_price,
        v_purchase_date,
        v_useful_life_years,
        v_salvage_value,
        v_depreciation_method
    FROM assets
    WHERE id = p_asset_id;

    -- Calculate years elapsed
    v_years_elapsed := EXTRACT(YEAR FROM AGE(CURRENT_DATE, v_purchase_date)) +
                      (EXTRACT(MONTH FROM AGE(CURRENT_DATE, v_purchase_date)) / 12.0);

    -- Calculate depreciation based on method
    IF v_depreciation_method = 'straight_line' THEN
        -- Straight-line depreciation
        v_current_value := v_purchase_price -
                          ((v_purchase_price - v_salvage_value) / v_useful_life_years * v_years_elapsed);
    ELSE
        -- Declining balance (double declining)
        v_current_value := v_purchase_price * POWER(1 - (2.0 / v_useful_life_years), v_years_elapsed);
    END IF;

    -- Ensure value doesn't go below salvage value
    IF v_current_value < v_salvage_value THEN
        v_current_value := v_salvage_value;
    END IF;

    RETURN GREATEST(v_current_value, 0);
END;
$$ LANGUAGE plpgsql;

-- Function to check and update overdue maintenance
CREATE OR REPLACE FUNCTION update_overdue_maintenance()
RETURNS void AS $$
BEGIN
    -- Update status to overdue for scheduled maintenance past due date
    UPDATE asset_maintenance
    SET status = 'overdue'
    WHERE status = 'scheduled'
      AND scheduled_date < CURRENT_DATE;

    -- Create notifications for overdue maintenance (if not already sent)
    INSERT INTO notifications (id, title, message, type, reference_type, reference_id, reference_url, priority, user_id)
    SELECT
        'NOTIF-OVERDUE-' || am.id || '-' || EXTRACT(EPOCH FROM NOW())::TEXT,
        'Maintenance Overdue: ' || a.asset_name,
        'Maintenance "' || am.title || '" for asset "' || a.asset_name || '" is overdue since ' || am.scheduled_date::TEXT,
        'maintenance_overdue',
        'maintenance',
        am.id,
        '/maintenance',
        'high',
        am.created_by
    FROM asset_maintenance am
    JOIN assets a ON am.asset_id = a.id
    WHERE am.status = 'overdue'
      AND am.notification_sent = FALSE;

    -- Mark notifications as sent
    UPDATE asset_maintenance
    SET notification_sent = TRUE
    WHERE status = 'overdue'
      AND notification_sent = FALSE;
END;
$$ LANGUAGE plpgsql;

-- Function to create maintenance reminder notifications
CREATE OR REPLACE FUNCTION create_maintenance_reminders()
RETURNS void AS $$
BEGIN
    -- Create notifications for upcoming maintenance
    INSERT INTO notifications (id, title, message, type, reference_type, reference_id, reference_url, priority, user_id)
    SELECT
        'NOTIF-REMINDER-' || am.id || '-' || EXTRACT(EPOCH FROM NOW())::TEXT,
        'Upcoming Maintenance: ' || a.asset_name,
        'Maintenance "' || am.title || '" for asset "' || a.asset_name || '" is scheduled for ' || am.scheduled_date::TEXT,
        'maintenance_due',
        'maintenance',
        am.id,
        '/maintenance',
        CASE
            WHEN am.priority = 'critical' THEN 'urgent'
            WHEN am.priority = 'high' THEN 'high'
            ELSE 'normal'
        END,
        am.created_by
    FROM asset_maintenance am
    JOIN assets a ON am.asset_id = a.id
    WHERE am.status = 'scheduled'
      AND am.scheduled_date <= CURRENT_DATE + (am.notify_before_days || ' days')::INTERVAL
      AND am.scheduled_date >= CURRENT_DATE
      AND am.notification_sent = FALSE;

    -- Mark notifications as sent
    UPDATE asset_maintenance
    SET notification_sent = TRUE
    WHERE status = 'scheduled'
      AND scheduled_date <= CURRENT_DATE + (notify_before_days || ' days')::INTERVAL
      AND scheduled_date >= CURRENT_DATE
      AND notification_sent = FALSE;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 5. TRIGGER FUNCTIONS FOR AUTO NOTIFICATIONS
-- =====================================================

-- Trigger function for new purchase orders
CREATE OR REPLACE FUNCTION notify_purchase_order_created()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO notifications (id, title, message, type, reference_type, reference_id, reference_url, priority)
    VALUES (
        'NOTIF-PO-' || NEW.id || '-' || EXTRACT(EPOCH FROM NOW())::TEXT,
        'New Purchase Order Created',
        'PO #' || NEW.id || ' for supplier ' || COALESCE(NEW.supplier_name, 'Unknown') || ' - ' ||
        'Total: Rp ' || TO_CHAR(NEW.total, 'FM999,999,999,999'),
        'purchase_order_created',
        'purchase_order',
        NEW.id,
        '/purchase-orders/' || NEW.id,
        'normal'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for production completion
CREATE OR REPLACE FUNCTION notify_production_completed()
RETURNS TRIGGER AS $$
DECLARE
    v_product_name TEXT;
BEGIN
    -- Only notify when status changes to completed
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        -- Get product name
        SELECT name INTO v_product_name FROM products WHERE id = NEW.product_id;

        INSERT INTO notifications (id, title, message, type, reference_type, reference_id, reference_url, priority)
        VALUES (
            'NOTIF-PROD-' || NEW.id || '-' || EXTRACT(EPOCH FROM NOW())::TEXT,
            'Production Completed',
            'Production of ' || COALESCE(v_product_name, 'Unknown Product') || ' completed. Quantity: ' || NEW.quantity_produced,
            'production_completed',
            'production',
            NEW.id,
            '/production',
            'normal'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for debt payment
CREATE OR REPLACE FUNCTION notify_debt_payment()
RETURNS TRIGGER AS $$
BEGIN
    -- Only notify for debt payment type
    IF NEW.type = 'pembayaran_utang' THEN
        INSERT INTO notifications (id, title, message, type, reference_type, reference_id, reference_url, priority)
        VALUES (
            'NOTIF-DEBT-' || NEW.id || '-' || EXTRACT(EPOCH FROM NOW())::TEXT,
            'Debt Payment Recorded',
            'Payment of Rp ' || TO_CHAR(NEW.amount, 'FM999,999,999,999') || ' for ' || COALESCE(NEW.description, 'debt payment'),
            'debt_payment',
            'accounts_payable',
            NEW.reference_id,
            '/accounts-payable',
            'normal'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for payroll processing
CREATE OR REPLACE FUNCTION notify_payroll_processed()
RETURNS TRIGGER AS $$
BEGIN
    -- Only notify for payroll payment type
    IF NEW.type = 'pembayaran_gaji' THEN
        INSERT INTO notifications (id, title, message, type, reference_type, reference_id, reference_url, priority)
        VALUES (
            'NOTIF-PAYROLL-' || NEW.id || '-' || EXTRACT(EPOCH FROM NOW())::TEXT,
            'Payroll Payment Processed',
            'Salary payment of Rp ' || TO_CHAR(NEW.amount, 'FM999,999,999,999') || ' for ' || COALESCE(NEW.reference_name, 'employee'),
            'payroll_processed',
            'payroll',
            NEW.reference_id,
            '/payroll',
            'normal'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 6. CREATE TRIGGERS
-- =====================================================

-- Purchase order notifications
DROP TRIGGER IF EXISTS trigger_notify_purchase_order ON purchase_orders;
CREATE TRIGGER trigger_notify_purchase_order
    AFTER INSERT ON purchase_orders
    FOR EACH ROW
    EXECUTE FUNCTION notify_purchase_order_created();

-- Production notifications
DROP TRIGGER IF EXISTS trigger_notify_production ON production_records;
CREATE TRIGGER trigger_notify_production
    AFTER INSERT OR UPDATE ON production_records
    FOR EACH ROW
    EXECUTE FUNCTION notify_production_completed();

-- Cash history notifications (for debt and payroll)
DROP TRIGGER IF EXISTS trigger_notify_cash_history ON cash_history;
CREATE TRIGGER trigger_notify_cash_history
    AFTER INSERT ON cash_history
    FOR EACH ROW
    EXECUTE FUNCTION notify_debt_payment();

DROP TRIGGER IF EXISTS trigger_notify_payroll ON cash_history;
CREATE TRIGGER trigger_notify_payroll
    AFTER INSERT ON cash_history
    FOR EACH ROW
    EXECUTE FUNCTION notify_payroll_processed();

-- =====================================================
-- 7. COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE assets IS 'Stores all company physical assets including equipment, vehicles, buildings, etc.';
COMMENT ON TABLE asset_maintenance IS 'Tracks all maintenance activities for assets - scheduled, in-progress, and completed';
COMMENT ON TABLE notifications IS 'Central notification system for all app activities and alerts';

COMMENT ON COLUMN assets.depreciation_method IS 'straight_line or declining_balance depreciation calculation method';
COMMENT ON COLUMN assets.current_value IS 'Auto-calculated current value after depreciation';
COMMENT ON COLUMN asset_maintenance.is_recurring IS 'If true, will auto-create next maintenance record when completed';
COMMENT ON COLUMN asset_maintenance.notify_before_days IS 'Number of days before scheduled date to send reminder notification';
COMMENT ON COLUMN notifications.expires_at IS 'Notifications will auto-delete after this date to keep table clean';

-- =====================================================
-- 8. SAMPLE DATA (OPTIONAL)
-- =====================================================

-- Insert sample asset categories reference
-- Users can refer to these when creating assets
COMMENT ON COLUMN assets.category IS 'Asset categories: equipment, vehicle, building, furniture, computer, other';



-- ============================================
-- Migration 65: 0116_create_zakat_and_charity_system.sql
-- ============================================

-- =====================================================
-- ZAKAT AND CHARITY MANAGEMENT SYSTEM
-- =====================================================
-- This migration creates tables for:
-- 1. Zakat & Sedekah records
-- 2. Nishab reference values
-- =====================================================

-- =====================================================
-- 1. ZAKAT AND CHARITY RECORDS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS zakat_records (
    id TEXT PRIMARY KEY,

    -- Type
    type TEXT NOT NULL CHECK (type IN (
        'zakat_mal',
        'zakat_fitrah',
        'zakat_penghasilan',
        'zakat_perdagangan',
        'zakat_emas',
        'sedekah',
        'infaq',
        'wakaf',
        'qurban',
        'other'
    )),
    category TEXT NOT NULL CHECK (category IN ('zakat', 'charity')),

    -- Details
    title TEXT NOT NULL,
    description TEXT,
    recipient TEXT, -- Person or institution receiving
    recipient_type TEXT CHECK (recipient_type IN ('individual', 'mosque', 'orphanage', 'institution', 'other')),

    -- Amount
    amount NUMERIC(15, 2) NOT NULL,
    nishab_amount NUMERIC(15, 2), -- Minimum amount for zakat obligation
    percentage_rate NUMERIC(5, 2) DEFAULT 2.5, -- Usually 2.5% for zakat mal

    -- Payment Info
    payment_date DATE NOT NULL,
    payment_account_id TEXT REFERENCES accounts(id),
    payment_method TEXT CHECK (payment_method IN ('cash', 'transfer', 'check', 'other')),

    -- Status
    status TEXT DEFAULT 'paid' CHECK (status IN ('pending', 'paid', 'cancelled')),

    -- Reference
    cash_history_id TEXT, -- Link to cash_history table
    receipt_number TEXT,

    -- Calculation Details (for zakat)
    calculation_basis TEXT, -- What was this zakat calculated from
    calculation_notes TEXT,

    -- Additional Info
    is_anonymous BOOLEAN DEFAULT FALSE,
    notes TEXT,
    attachment_url TEXT, -- Receipt or proof

    -- Islamic Calendar
    hijri_year TEXT,
    hijri_month TEXT,

    -- Metadata
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for zakat records
CREATE INDEX IF NOT EXISTS idx_zakat_type ON zakat_records(type);
CREATE INDEX IF NOT EXISTS idx_zakat_category ON zakat_records(category);
CREATE INDEX IF NOT EXISTS idx_zakat_payment_date ON zakat_records(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_zakat_recipient ON zakat_records(recipient);
CREATE INDEX IF NOT EXISTS idx_zakat_status ON zakat_records(status);
CREATE INDEX IF NOT EXISTS idx_zakat_hijri_year ON zakat_records(hijri_year);

-- =====================================================
-- 2. NISHAB REFERENCE TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS nishab_reference (
    id SERIAL PRIMARY KEY,

    -- Precious Metal Prices (per gram in IDR)
    gold_price NUMERIC(15, 2) NOT NULL,
    silver_price NUMERIC(15, 2) NOT NULL,

    -- Nishab Standards
    gold_nishab NUMERIC(8, 2) DEFAULT 85, -- 85 grams
    silver_nishab NUMERIC(8, 2) DEFAULT 595, -- 595 grams

    -- Zakat Rate
    zakat_rate NUMERIC(5, 2) DEFAULT 2.5, -- 2.5%

    -- Metadata
    effective_date DATE NOT NULL,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT
);

-- Index for nishab reference
CREATE INDEX IF NOT EXISTS idx_nishab_effective_date ON nishab_reference(effective_date DESC);

-- =====================================================
-- 3. FUNCTIONS
-- =====================================================

-- Function to update updated_at timestamp for zakat records
CREATE TRIGGER update_zakat_records_updated_at
    BEFORE UPDATE ON zakat_records
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to get current nishab values
CREATE OR REPLACE FUNCTION get_current_nishab()
RETURNS TABLE (
    gold_price NUMERIC,
    silver_price NUMERIC,
    gold_nishab NUMERIC,
    silver_nishab NUMERIC,
    zakat_rate NUMERIC,
    gold_nishab_value NUMERIC,
    silver_nishab_value NUMERIC
) AS $$
DECLARE
    v_gold_price NUMERIC;
    v_silver_price NUMERIC;
    v_gold_nishab NUMERIC;
    v_silver_nishab NUMERIC;
    v_zakat_rate NUMERIC;
BEGIN
    -- Get the most recent nishab values
    SELECT
        nr.gold_price,
        nr.silver_price,
        nr.gold_nishab,
        nr.silver_nishab,
        nr.zakat_rate
    INTO
        v_gold_price,
        v_silver_price,
        v_gold_nishab,
        v_silver_nishab,
        v_zakat_rate
    FROM nishab_reference nr
    WHERE nr.effective_date <= CURRENT_DATE
    ORDER BY nr.effective_date DESC
    LIMIT 1;

    -- If no record found, return default values
    IF v_gold_price IS NULL THEN
        v_gold_price := 1000000; -- Default Rp 1,000,000 per gram
        v_silver_price := 15000; -- Default Rp 15,000 per gram
        v_gold_nishab := 85;
        v_silver_nishab := 595;
        v_zakat_rate := 2.5;
    END IF;

    RETURN QUERY SELECT
        v_gold_price,
        v_silver_price,
        v_gold_nishab,
        v_silver_nishab,
        v_zakat_rate,
        v_gold_price * v_gold_nishab AS gold_nishab_value,
        v_silver_price * v_silver_nishab AS silver_nishab_value;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate zakat amount
CREATE OR REPLACE FUNCTION calculate_zakat_amount(
    p_asset_value NUMERIC,
    p_nishab_type TEXT DEFAULT 'gold' -- 'gold' or 'silver'
)
RETURNS TABLE (
    asset_value NUMERIC,
    nishab_value NUMERIC,
    is_obligatory BOOLEAN,
    zakat_amount NUMERIC,
    rate NUMERIC
) AS $$
DECLARE
    v_nishab_value NUMERIC;
    v_zakat_rate NUMERIC;
    v_is_obligatory BOOLEAN;
    v_zakat_amount NUMERIC;
BEGIN
    -- Get current nishab
    SELECT
        CASE
            WHEN p_nishab_type = 'silver' THEN cn.silver_nishab_value
            ELSE cn.gold_nishab_value
        END,
        cn.zakat_rate
    INTO
        v_nishab_value,
        v_zakat_rate
    FROM get_current_nishab() cn;

    -- Check if zakat is obligatory
    v_is_obligatory := p_asset_value >= v_nishab_value;

    -- Calculate zakat amount
    IF v_is_obligatory THEN
        v_zakat_amount := p_asset_value * (v_zakat_rate / 100);
    ELSE
        v_zakat_amount := 0;
    END IF;

    RETURN QUERY SELECT
        p_asset_value,
        v_nishab_value,
        v_is_obligatory,
        v_zakat_amount,
        v_zakat_rate;
END;
$$ LANGUAGE plpgsql;

-- Function to create cash history entry for zakat/charity payment
CREATE OR REPLACE FUNCTION create_zakat_cash_entry()
RETURNS TRIGGER AS $$
DECLARE
    v_account_name TEXT;
    v_cash_history_id TEXT;
BEGIN
    -- Only create cash entry if status is 'paid' and payment account is specified
    IF NEW.status = 'paid' AND NEW.payment_account_id IS NOT NULL AND NEW.cash_history_id IS NULL THEN
        -- Get account name
        SELECT name INTO v_account_name FROM accounts WHERE id = NEW.payment_account_id;

        -- Generate cash history ID
        v_cash_history_id := 'CH-ZAKAT-' || NEW.id || '-' || EXTRACT(EPOCH FROM NOW())::TEXT;

        -- Insert into cash_history
        INSERT INTO cash_history (
            id,
            account_id,
            account_name,
            amount,
            type,
            description,
            reference_type,
            reference_id,
            reference_name,
            created_at
        ) VALUES (
            v_cash_history_id,
            NEW.payment_account_id,
            v_account_name,
            NEW.amount,
            CASE
                WHEN NEW.category = 'zakat' THEN 'zakat'
                ELSE 'sedekah'
            END,
            NEW.title || COALESCE(' - ' || NEW.description, ''),
            CASE
                WHEN NEW.category = 'zakat' THEN 'zakat'
                ELSE 'charity'
            END,
            NEW.id,
            NEW.title,
            NEW.payment_date
        );

        -- Update the zakat record with cash_history_id
        NEW.cash_history_id := v_cash_history_id;

        -- Update account balance
        UPDATE accounts
        SET balance = balance - NEW.amount
        WHERE id = NEW.payment_account_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to create cash entry
DROP TRIGGER IF EXISTS trigger_create_zakat_cash_entry ON zakat_records;
CREATE TRIGGER trigger_create_zakat_cash_entry
    BEFORE INSERT OR UPDATE ON zakat_records
    FOR EACH ROW
    EXECUTE FUNCTION create_zakat_cash_entry();

-- =====================================================
-- 4. INSERT DEFAULT NISHAB VALUES
-- =====================================================

-- Insert current nishab reference (prices as of common market rates)
INSERT INTO nishab_reference (
    gold_price,
    silver_price,
    gold_nishab,
    silver_nishab,
    zakat_rate,
    effective_date,
    notes
) VALUES (
    1100000, -- Rp 1,100,000 per gram gold (approximate)
    15000,   -- Rp 15,000 per gram silver (approximate)
    85,      -- 85 grams gold
    595,     -- 595 grams silver
    2.5,     -- 2.5% zakat rate
    CURRENT_DATE,
    'Initial nishab values - please update with current market prices'
) ON CONFLICT DO NOTHING;

-- =====================================================
-- 5. COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE zakat_records IS 'Stores all zakat and charity (sedekah, infaq, wakaf) transactions';
COMMENT ON TABLE nishab_reference IS 'Reference values for calculating zakat obligations based on gold/silver prices';

COMMENT ON COLUMN zakat_records.category IS 'zakat or charity - main classification';
COMMENT ON COLUMN zakat_records.type IS 'Specific type like zakat_mal, zakat_fitrah, sedekah, etc.';
COMMENT ON COLUMN zakat_records.nishab_amount IS 'Minimum threshold amount for zakat obligation';
COMMENT ON COLUMN zakat_records.percentage_rate IS 'Zakat rate, usually 2.5% for mal';
COMMENT ON COLUMN zakat_records.is_anonymous IS 'If true, donor name will not be disclosed';
COMMENT ON COLUMN zakat_records.hijri_year IS 'Islamic calendar year (e.g., 1445H)';
COMMENT ON COLUMN zakat_records.hijri_month IS 'Islamic calendar month (e.g., Ramadan, Syawal)';

COMMENT ON FUNCTION calculate_zakat_amount IS 'Calculate zakat obligation based on asset value and nishab threshold';
COMMENT ON FUNCTION get_current_nishab IS 'Get current nishab values for zakat calculation';



-- ============================================
-- Migration 66: 9001_test_chart_of_accounts_enhancement.sql
-- ============================================

-- ========================================
-- TEST CHART OF ACCOUNTS ENHANCEMENT
-- ========================================
-- File: 9001_test_chart_of_accounts_enhancement.sql
-- Purpose: Add CoA structure to existing accounts table
-- Status: TESTING ONLY - DO NOT APPLY TO PRODUCTION

-- Step 1: Add new columns for Chart of Accounts structure
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS code VARCHAR(10);
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS parent_id TEXT;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS normal_balance VARCHAR(10) DEFAULT 'DEBIT';
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS is_header BOOLEAN DEFAULT false;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Step 2: Add constraints and indexes
ALTER TABLE public.accounts ADD CONSTRAINT accounts_code_unique UNIQUE (code);
ALTER TABLE public.accounts ADD CONSTRAINT accounts_normal_balance_check 
  CHECK (normal_balance IN ('DEBIT', 'CREDIT'));
ALTER TABLE public.accounts ADD CONSTRAINT accounts_level_check 
  CHECK (level >= 1 AND level <= 4);

-- Add foreign key for parent relationship
ALTER TABLE public.accounts ADD CONSTRAINT accounts_parent_fk 
  FOREIGN KEY (parent_id) REFERENCES public.accounts(id) 
  ON DELETE RESTRICT;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_accounts_code ON public.accounts(code);
CREATE INDEX IF NOT EXISTS idx_accounts_parent ON public.accounts(parent_id);
CREATE INDEX IF NOT EXISTS idx_accounts_level ON public.accounts(level);
CREATE INDEX IF NOT EXISTS idx_accounts_sort_order ON public.accounts(sort_order);

-- Step 3: Add comments for documentation
COMMENT ON COLUMN public.accounts.code IS 'Kode akun standar (1000, 1100, 1110, dst)';
COMMENT ON COLUMN public.accounts.parent_id IS 'ID parent account untuk hierarki';
COMMENT ON COLUMN public.accounts.level IS 'Level hierarki: 1=Header, 2=Sub-header, 3=Detail, 4=Sub-detail';
COMMENT ON COLUMN public.accounts.normal_balance IS 'Saldo normal: DEBIT atau CREDIT';
COMMENT ON COLUMN public.accounts.is_header IS 'Apakah ini header account (tidak bisa digunakan untuk transaksi)';
COMMENT ON COLUMN public.accounts.is_active IS 'Status aktif account';
COMMENT ON COLUMN public.accounts.sort_order IS 'Urutan tampilan dalam laporan';

-- Step 4: Update existing account types to be more specific
-- This will help us map to standard CoA later
UPDATE public.accounts SET 
  type = CASE 
    WHEN type = 'Aset' THEN 'ASET'
    WHEN type = 'Kewajiban' THEN 'KEWAJIBAN' 
    WHEN type = 'Modal' THEN 'MODAL'
    WHEN type = 'Pendapatan' THEN 'PENDAPATAN'
    WHEN type = 'Beban' THEN 'BEBAN'
    ELSE type
  END;

-- Step 5: Insert Chart of Accounts structure (Header accounts only for testing)
-- We'll start with basic structure

-- 1000 - ASET (Header)
INSERT INTO public.accounts (id, code, name, type, level, is_header, normal_balance, balance, initial_balance, is_payment_account, sort_order, created_at)
VALUES ('acc-1000', '1000', 'ASET', 'ASET', 1, true, 'DEBIT', 0, 0, false, 1000, NOW())
ON CONFLICT (id) DO NOTHING;

-- 1100 - Kas dan Setara Kas (Sub-header)
INSERT INTO public.accounts (id, code, name, type, parent_id, level, is_header, normal_balance, balance, initial_balance, is_payment_account, sort_order, created_at)
VALUES ('acc-1100', '1100', 'Kas dan Setara Kas', 'ASET', 'acc-1000', 2, true, 'DEBIT', 0, 0, false, 1100, NOW())
ON CONFLICT (id) DO NOTHING;

-- 1200 - Piutang (Sub-header) 
INSERT INTO public.accounts (id, code, name, type, parent_id, level, is_header, normal_balance, balance, initial_balance, is_payment_account, sort_order, created_at)
VALUES ('acc-1200', '1200', 'Piutang', 'ASET', 'acc-1000', 2, true, 'DEBIT', 0, 0, false, 1200, NOW())
ON CONFLICT (id) DO NOTHING;

-- 2000 - KEWAJIBAN (Header)
INSERT INTO public.accounts (id, code, name, type, level, is_header, normal_balance, balance, initial_balance, is_payment_account, sort_order, created_at)
VALUES ('acc-2000', '2000', 'KEWAJIBAN', 'KEWAJIBAN', 1, true, 'CREDIT', 0, 0, false, 2000, NOW())
ON CONFLICT (id) DO NOTHING;

-- 3000 - MODAL (Header)  
INSERT INTO public.accounts (id, code, name, type, level, is_header, normal_balance, balance, initial_balance, is_payment_account, sort_order, created_at)
VALUES ('acc-3000', '3000', 'MODAL', 'MODAL', 1, true, 'CREDIT', 0, 0, false, 3000, NOW())
ON CONFLICT (id) DO NOTHING;

-- 4000 - PENDAPATAN (Header)
INSERT INTO public.accounts (id, code, name, type, level, is_header, normal_balance, balance, initial_balance, is_payment_account, sort_order, created_at)
VALUES ('acc-4000', '4000', 'PENDAPATAN', 'PENDAPATAN', 1, true, 'CREDIT', 0, 0, false, 4000, NOW())
ON CONFLICT (id) DO NOTHING;

-- 6000 - BEBAN (Header)
INSERT INTO public.accounts (id, code, name, type, level, is_header, normal_balance, balance, initial_balance, is_payment_account, sort_order, created_at)
VALUES ('acc-6000', '6000', 'BEBAN', 'BEBAN', 1, true, 'DEBIT', 0, 0, false, 6000, NOW())
ON CONFLICT (id) DO NOTHING;

-- Step 6: Create sample detail accounts under Kas dan Setara Kas
-- 1110 - Kas Tunai
INSERT INTO public.accounts (id, code, name, type, parent_id, level, is_header, normal_balance, balance, initial_balance, is_payment_account, sort_order, created_at)
VALUES ('acc-1110', '1110', 'Kas Tunai', 'ASET', 'acc-1100', 3, false, 'DEBIT', 0, 0, true, 1110, NOW())
ON CONFLICT (id) DO NOTHING;

-- 1111 - Bank BCA  
INSERT INTO public.accounts (id, code, name, type, parent_id, level, is_header, normal_balance, balance, initial_balance, is_payment_account, sort_order, created_at)
VALUES ('acc-1111', '1111', 'Bank BCA', 'ASET', 'acc-1100', 3, false, 'DEBIT', 0, 0, true, 1111, NOW())
ON CONFLICT (id) DO NOTHING;

-- 1112 - Bank Mandiri
INSERT INTO public.accounts (id, code, name, type, parent_id, level, is_header, normal_balance, balance, initial_balance, is_payment_account, sort_order, created_at)
VALUES ('acc-1112', '1112', 'Bank Mandiri', 'ASET', 'acc-1100', 3, false, 'DEBIT', 0, 0, true, 1112, NOW())
ON CONFLICT (id) DO NOTHING;

-- Step 7: Create view for hierarchical account display
CREATE OR REPLACE VIEW public.accounts_hierarchy AS 
WITH RECURSIVE account_tree AS (
  -- Base case: root accounts (level 1)
  SELECT 
    id, code, name, type, parent_id, level, is_header, is_active,
    normal_balance, balance, initial_balance, is_payment_account, sort_order,
    name as full_path,
    ARRAY[sort_order] as path_array
  FROM public.accounts 
  WHERE parent_id IS NULL AND is_active = true
  
  UNION ALL
  
  -- Recursive case: child accounts
  SELECT 
    a.id, a.code, a.name, a.type, a.parent_id, a.level, a.is_header, a.is_active,
    a.normal_balance, a.balance, a.initial_balance, a.is_payment_account, a.sort_order,
    at.full_path || ' > ' || a.name as full_path,
    at.path_array || a.sort_order as path_array
  FROM public.accounts a
  JOIN account_tree at ON a.parent_id = at.id
  WHERE a.is_active = true
)
SELECT 
  id, code, name, type, parent_id, level, is_header, is_active,
  normal_balance, balance, initial_balance, is_payment_account, sort_order,
  full_path,
  REPEAT('  ', level - 1) || name as indented_name
FROM account_tree
ORDER BY path_array;

-- Add RLS policy for new view
ALTER VIEW public.accounts_hierarchy SET (security_invoker = true);

-- Step 8: Create function to get account balance including children
CREATE OR REPLACE FUNCTION public.get_account_balance_with_children(account_id TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  total_balance NUMERIC := 0;
BEGIN
  -- Get sum of all child account balances
  WITH RECURSIVE account_tree AS (
    SELECT id, balance FROM public.accounts WHERE id = account_id
    UNION ALL
    SELECT a.id, a.balance 
    FROM public.accounts a
    JOIN account_tree at ON a.parent_id = at.id
  )
  SELECT COALESCE(SUM(balance), 0) INTO total_balance
  FROM account_tree
  WHERE id != account_id OR NOT EXISTS(
    SELECT 1 FROM public.accounts WHERE parent_id = account_id
  );
  
  RETURN total_balance;
END;
$$;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Chart of Accounts enhancement completed successfully!';
  RAISE NOTICE '📊 Added: code, parent_id, level, normal_balance, is_header, is_active, sort_order columns';
  RAISE NOTICE '🌳 Created: accounts_hierarchy view for tree display';
  RAISE NOTICE '🧮 Created: get_account_balance_with_children() function';
  RAISE NOTICE '📁 Inserted: Basic CoA structure (1000-ASET, 2000-KEWAJIBAN, etc.)';
END $$;


-- ============================================
-- Migration 67: 9002_test_coa_data_demo.sql
-- ============================================

-- ========================================
-- TEST CoA DATA & DEMO QUERIES  
-- ========================================
-- File: 9002_test_coa_data_demo.sql
-- Purpose: Insert test data and create demo queries for CoA testing

-- Step 1: Create some sample detail accounts for testing
-- 1210 - Piutang Usaha
INSERT INTO public.accounts (id, code, name, type, parent_id, level, is_header, normal_balance, balance, initial_balance, is_payment_account, sort_order, created_at)
VALUES ('acc-1210', '1210', 'Piutang Usaha', 'ASET', 'acc-1200', 3, false, 'DEBIT', 5000000, 0, false, 1210, NOW())
ON CONFLICT (id) DO NOTHING;

-- 2100 - Utang Usaha
INSERT INTO public.accounts (id, code, name, type, parent_id, level, is_header, normal_balance, balance, initial_balance, is_payment_account, sort_order, created_at)
VALUES ('acc-2100', '2100', 'Utang Usaha', 'KEWAJIBAN', 'acc-2000', 2, false, 'CREDIT', 2000000, 0, false, 2100, NOW())
ON CONFLICT (id) DO NOTHING;

-- 3100 - Modal Pemilik
INSERT INTO public.accounts (id, code, name, type, parent_id, level, is_header, normal_balance, balance, initial_balance, is_payment_account, sort_order, created_at)
VALUES ('acc-3100', '3100', 'Modal Pemilik', 'MODAL', 'acc-3000', 2, false, 'CREDIT', 50000000, 50000000, false, 3100, NOW())
ON CONFLICT (id) DO NOTHING;

-- 4100 - Pendapatan Penjualan  
INSERT INTO public.accounts (id, code, name, type, parent_id, level, is_header, normal_balance, balance, initial_balance, is_payment_account, sort_order, created_at)
VALUES ('acc-4100', '4100', 'Pendapatan Penjualan', 'PENDAPATAN', 'acc-4000', 2, false, 'CREDIT', 15000000, 0, false, 4100, NOW())
ON CONFLICT (id) DO NOTHING;

-- 6100 - Beban Gaji
INSERT INTO public.accounts (id, code, name, type, parent_id, level, is_header, normal_balance, balance, initial_balance, is_payment_account, sort_order, created_at)
VALUES ('acc-6100', '6100', 'Beban Gaji', 'BEBAN', 'acc-6000', 2, false, 'DEBIT', 3000000, 0, false, 6100, NOW())
ON CONFLICT (id) DO NOTHING;

-- 6200 - Beban Listrik
INSERT INTO public.accounts (id, code, name, type, parent_id, level, is_header, normal_balance, balance, initial_balance, is_payment_account, sort_order, created_at)
VALUES ('acc-6200', '6200', 'Beban Listrik', 'BEBAN', 'acc-6000', 2, false, 'DEBIT', 500000, 0, false, 6200, NOW())
ON CONFLICT (id) DO NOTHING;

-- Step 2: Update sample detail accounts with some test balances
UPDATE public.accounts SET balance = 1000000, initial_balance = 1000000 WHERE code = '1110'; -- Kas Tunai
UPDATE public.accounts SET balance = 25000000, initial_balance = 25000000 WHERE code = '1111'; -- Bank BCA  
UPDATE public.accounts SET balance = 10000000, initial_balance = 10000000 WHERE code = '1112'; -- Bank Mandiri

-- Step 3: Create demo queries as stored functions for easy testing

-- Function to show hierarchical chart of accounts
CREATE OR REPLACE FUNCTION public.demo_show_chart_of_accounts()
RETURNS TABLE (
  level_indent TEXT,
  code VARCHAR,
  account_name TEXT,
  account_type TEXT,
  normal_bal VARCHAR,
  current_balance NUMERIC,
  is_header_account BOOLEAN
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    REPEAT('  ', a.level - 1) || 
    CASE 
      WHEN a.is_header THEN '📁 '
      ELSE '💰 '
    END as level_indent,
    a.code,
    a.name as account_name,
    a.type as account_type,
    a.normal_balance as normal_bal,
    a.balance as current_balance,
    a.is_header as is_header_account
  FROM public.accounts a
  WHERE a.is_active = true
    AND (a.code IS NOT NULL OR a.id LIKE 'acc-%')
  ORDER BY a.sort_order, a.code;
END;
$$;

-- Function to show trial balance
CREATE OR REPLACE FUNCTION public.demo_trial_balance()
RETURNS TABLE (
  code VARCHAR,
  account_name TEXT,
  debit_balance NUMERIC,
  credit_balance NUMERIC
)
LANGUAGE plpgsql  
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.code,
    a.name as account_name,
    CASE 
      WHEN a.normal_balance = 'DEBIT' AND a.balance >= 0 THEN a.balance
      WHEN a.normal_balance = 'DEBIT' AND a.balance < 0 THEN 0
      WHEN a.normal_balance = 'CREDIT' AND a.balance < 0 THEN ABS(a.balance)
      ELSE 0
    END as debit_balance,
    CASE 
      WHEN a.normal_balance = 'CREDIT' AND a.balance >= 0 THEN a.balance  
      WHEN a.normal_balance = 'CREDIT' AND a.balance < 0 THEN 0
      WHEN a.normal_balance = 'DEBIT' AND a.balance < 0 THEN ABS(a.balance)
      ELSE 0
    END as credit_balance
  FROM public.accounts a
  WHERE a.is_active = true 
    AND a.is_header = false
    AND a.code IS NOT NULL
    AND a.balance != 0
  ORDER BY a.code;
END;
$$;

-- Function to show balance sheet structure  
CREATE OR REPLACE FUNCTION public.demo_balance_sheet()
RETURNS TABLE (
  section TEXT,
  code VARCHAR,
  account_name TEXT,
  amount NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  -- ASET
  SELECT 
    'ASET' as section,
    a.code,
    a.name as account_name,
    a.balance as amount
  FROM public.accounts a
  WHERE a.type = 'ASET' 
    AND a.is_header = false
    AND a.is_active = true
    AND a.code IS NOT NULL
  
  UNION ALL
  
  -- KEWAJIBAN
  SELECT 
    'KEWAJIBAN' as section,
    a.code,
    a.name as account_name, 
    a.balance as amount
  FROM public.accounts a
  WHERE a.type = 'KEWAJIBAN'
    AND a.is_header = false
    AND a.is_active = true
    AND a.code IS NOT NULL
    
  UNION ALL
  
  -- MODAL
  SELECT 
    'MODAL' as section,
    a.code,
    a.name as account_name,
    a.balance as amount  
  FROM public.accounts a
  WHERE a.type = 'MODAL'
    AND a.is_header = false
    AND a.is_active = true
    AND a.code IS NOT NULL
    
  ORDER BY section, code;
END;
$$;

-- Success message with instructions
DO $$
BEGIN
  RAISE NOTICE '🎯 Test data and demo functions created successfully!';
  RAISE NOTICE '';
  RAISE NOTICE '📊 DEMO FUNCTIONS AVAILABLE:';
  RAISE NOTICE '   SELECT * FROM demo_show_chart_of_accounts();';
  RAISE NOTICE '   SELECT * FROM demo_trial_balance();';  
  RAISE NOTICE '   SELECT * FROM demo_balance_sheet();';
  RAISE NOTICE '';
  RAISE NOTICE '🔍 SAMPLE QUERIES:';
  RAISE NOTICE '   SELECT * FROM accounts_hierarchy;';
  RAISE NOTICE '   SELECT get_account_balance_with_children(''acc-1000'');';
END $$;


-- ============================================
-- Migration 68: 9003_create_manual_journal_entries.sql
-- ============================================

-- Create manual journal entries table
CREATE TABLE IF NOT EXISTS public.manual_journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_number VARCHAR(20) UNIQUE NOT NULL,
  entry_date DATE NOT NULL,
  description TEXT NOT NULL,
  reference TEXT,
  total_amount NUMERIC NOT NULL CHECK (total_amount > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'reversed')),
  
  -- User tracking
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Posting tracking
  posted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  posted_by_name TEXT,
  posted_at TIMESTAMPTZ,
  
  -- Reversal tracking
  reversed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reversed_by_name TEXT,
  reversed_at TIMESTAMPTZ,
  reversal_reason TEXT,
  
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create manual journal entry lines table
CREATE TABLE IF NOT EXISTS public.manual_journal_entry_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id UUID NOT NULL REFERENCES public.manual_journal_entries(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  
  -- Account information
  account_id TEXT NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  account_code VARCHAR(10),
  account_name TEXT NOT NULL,
  
  -- Amount information
  debit_amount NUMERIC DEFAULT 0 CHECK (debit_amount >= 0),
  credit_amount NUMERIC DEFAULT 0 CHECK (credit_amount >= 0),
  
  -- Line details
  description TEXT,
  reference TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Ensure either debit or credit, not both
  CONSTRAINT debit_or_credit_not_both CHECK (
    (debit_amount > 0 AND credit_amount = 0) OR 
    (credit_amount > 0 AND debit_amount = 0)
  ),
  
  -- Ensure at least one amount is provided
  CONSTRAINT debit_or_credit_required CHECK (
    debit_amount > 0 OR credit_amount > 0
  ),
  
  -- Unique line number per journal
  UNIQUE (journal_id, line_number)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_manual_journal_entries_date ON public.manual_journal_entries(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_manual_journal_entries_status ON public.manual_journal_entries(status);
CREATE INDEX IF NOT EXISTS idx_manual_journal_entries_created_by ON public.manual_journal_entries(created_by);
CREATE INDEX IF NOT EXISTS idx_manual_journal_entries_journal_number ON public.manual_journal_entries(journal_number);

CREATE INDEX IF NOT EXISTS idx_manual_journal_entry_lines_journal_id ON public.manual_journal_entry_lines(journal_id);
CREATE INDEX IF NOT EXISTS idx_manual_journal_entry_lines_account_id ON public.manual_journal_entry_lines(account_id);

-- Enable Row Level Security
ALTER TABLE public.manual_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_journal_entry_lines ENABLE ROW LEVEL SECURITY;

-- RLS Policies for manual_journal_entries
CREATE POLICY "Authenticated users can view manual journal entries" 
ON public.manual_journal_entries FOR SELECT 
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can create manual journal entries" 
ON public.manual_journal_entries FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update manual journal entries" 
ON public.manual_journal_entries FOR UPDATE 
USING (auth.role() = 'authenticated');

CREATE POLICY "Only owners can delete manual journal entries" 
ON public.manual_journal_entries FOR DELETE 
USING (auth.role() = 'authenticated');

-- RLS Policies for manual_journal_entry_lines
CREATE POLICY "Authenticated users can view manual journal entry lines" 
ON public.manual_journal_entry_lines FOR SELECT 
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can create manual journal entry lines" 
ON public.manual_journal_entry_lines FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update manual journal entry lines" 
ON public.manual_journal_entry_lines FOR UPDATE 
USING (auth.role() = 'authenticated');

CREATE POLICY "Only owners can delete manual journal entry lines" 
ON public.manual_journal_entry_lines FOR DELETE 
USING (auth.role() = 'authenticated');

-- Function to generate journal number
CREATE OR REPLACE FUNCTION generate_journal_number(entry_date DATE)
RETURNS TEXT AS $$
DECLARE
  date_str TEXT;
  sequence_num INTEGER;
  journal_number TEXT;
BEGIN
  -- Format: MJE-YYYYMMDD-XXX (Manual Journal Entry)
  date_str := to_char(entry_date, 'YYYYMMDD');
  
  -- Get next sequence for this date
  SELECT COALESCE(MAX(
    CAST(
      SUBSTRING(journal_number FROM 'MJE-\d{8}-(\d+)') AS INTEGER
    )
  ), 0) + 1
  INTO sequence_num
  FROM public.manual_journal_entries
  WHERE journal_number LIKE 'MJE-' || date_str || '-%';
  
  -- Generate journal number
  journal_number := 'MJE-' || date_str || '-' || LPAD(sequence_num::TEXT, 3, '0');
  
  RETURN journal_number;
END;
$$ LANGUAGE plpgsql;

-- Function to validate journal entry balance
CREATE OR REPLACE FUNCTION validate_journal_balance(journal_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  total_debits NUMERIC;
  total_credits NUMERIC;
BEGIN
  -- Calculate total debits and credits
  SELECT 
    COALESCE(SUM(debit_amount), 0),
    COALESCE(SUM(credit_amount), 0)
  INTO total_debits, total_credits
  FROM public.manual_journal_entry_lines
  WHERE journal_id = validate_journal_balance.journal_id;
  
  -- Return true if balanced (difference less than 0.01 for rounding)
  RETURN ABS(total_debits - total_credits) < 0.01;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_manual_journal_entries_updated_at 
BEFORE UPDATE ON public.manual_journal_entries
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE public.manual_journal_entries IS 'Manual journal entries for non-cash transactions and adjustments';
COMMENT ON TABLE public.manual_journal_entry_lines IS 'Individual debit/credit lines for manual journal entries';

COMMENT ON COLUMN public.manual_journal_entries.status IS 'Entry status: draft (editable), posted (locked), reversed (cancelled)';
COMMENT ON COLUMN public.manual_journal_entries.journal_number IS 'Unique journal number in format MJE-YYYYMMDD-XXX';
COMMENT ON COLUMN public.manual_journal_entries.total_amount IS 'Total amount of the journal entry (sum of debits or credits)';

COMMENT ON COLUMN public.manual_journal_entry_lines.debit_amount IS 'Debit amount for this line (mutually exclusive with credit_amount)';
COMMENT ON COLUMN public.manual_journal_entry_lines.credit_amount IS 'Credit amount for this line (mutually exclusive with debit_amount)';
COMMENT ON COLUMN public.manual_journal_entry_lines.line_number IS 'Sequential line number within the journal entry';

