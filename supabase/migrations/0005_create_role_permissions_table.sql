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