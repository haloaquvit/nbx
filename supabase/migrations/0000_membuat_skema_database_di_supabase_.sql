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