-- ========================================
-- CREATE EXPENSE ACCOUNTS MAPPING
-- ========================================
-- Purpose: Create expense accounts in 6000 series and mapping for categories

-- Step 1: Create detail expense accounts under 6000 BEBAN header
-- 6100 - Beban Gaji
INSERT INTO public.accounts (id, code, name, type, parent_id, level, is_header, normal_balance, balance, initial_balance, is_payment_account, sort_order, created_at)
VALUES ('acc-6100', '6100', 'Beban Gaji', 'BEBAN', 'acc-6000', 2, false, 'DEBIT', 0, 0, false, 6100, NOW())
ON CONFLICT (id) DO UPDATE SET 
  name = 'Beban Gaji',
  type = 'BEBAN',
  parent_id = 'acc-6000';

-- 6200 - Beban Operasional
INSERT INTO public.accounts (id, code, name, type, parent_id, level, is_header, normal_balance, balance, initial_balance, is_payment_account, sort_order, created_at)
VALUES ('acc-6200', '6200', 'Beban Operasional', 'BEBAN', 'acc-6000', 2, false, 'DEBIT', 0, 0, false, 6200, NOW())
ON CONFLICT (id) DO UPDATE SET 
  name = 'Beban Operasional',
  type = 'BEBAN',
  parent_id = 'acc-6000';

-- 6300 - Beban Administrasi
INSERT INTO public.accounts (id, code, name, type, parent_id, level, is_header, normal_balance, balance, initial_balance, is_payment_account, sort_order, created_at)
VALUES ('acc-6300', '6300', 'Beban Administrasi', 'BEBAN', 'acc-6000', 2, false, 'DEBIT', 0, 0, false, 6300, NOW())
ON CONFLICT (id) DO UPDATE SET 
  name = 'Beban Administrasi',
  type = 'BEBAN',
  parent_id = 'acc-6000';

-- 6400 - Beban Listrik
INSERT INTO public.accounts (id, code, name, type, parent_id, level, is_header, normal_balance, balance, initial_balance, is_payment_account, sort_order, created_at)
VALUES ('acc-6400', '6400', 'Beban Listrik', 'BEBAN', 'acc-6000', 2, false, 'DEBIT', 0, 0, false, 6400, NOW())
ON CONFLICT (id) DO UPDATE SET 
  name = 'Beban Listrik',
  type = 'BEBAN',
  parent_id = 'acc-6000';

-- 6500 - Beban Transportasi
INSERT INTO public.accounts (id, code, name, type, parent_id, level, is_header, normal_balance, balance, initial_balance, is_payment_account, sort_order, created_at)
VALUES ('acc-6500', '6500', 'Beban Transportasi', 'BEBAN', 'acc-6000', 2, false, 'DEBIT', 0, 0, false, 6500, NOW())
ON CONFLICT (id) DO UPDATE SET 
  name = 'Beban Transportasi',
  type = 'BEBAN',
  parent_id = 'acc-6000';

-- 6600 - Beban Komunikasi
INSERT INTO public.accounts (id, code, name, type, parent_id, level, is_header, normal_balance, balance, initial_balance, is_payment_account, sort_order, created_at)
VALUES ('acc-6600', '6600', 'Beban Komunikasi', 'BEBAN', 'acc-6000', 2, false, 'DEBIT', 0, 0, false, 6600, NOW())
ON CONFLICT (id) DO UPDATE SET 
  name = 'Beban Komunikasi',
  type = 'BEBAN',
  parent_id = 'acc-6000';

-- 6700 - Beban Pemeliharaan
INSERT INTO public.accounts (id, code, name, type, parent_id, level, is_header, normal_balance, balance, initial_balance, is_payment_account, sort_order, created_at)
VALUES ('acc-6700', '6700', 'Beban Pemeliharaan', 'BEBAN', 'acc-6000', 2, false, 'DEBIT', 0, 0, false, 6700, NOW())
ON CONFLICT (id) DO UPDATE SET 
  name = 'Beban Pemeliharaan',
  type = 'BEBAN',
  parent_id = 'acc-6000';

-- 6800 - Beban Komisi (for sales commission)
INSERT INTO public.accounts (id, code, name, type, parent_id, level, is_header, normal_balance, balance, initial_balance, is_payment_account, sort_order, created_at)
VALUES ('acc-6800', '6800', 'Beban Komisi', 'BEBAN', 'acc-6000', 2, false, 'DEBIT', 0, 0, false, 6800, NOW())
ON CONFLICT (id) DO UPDATE SET 
  name = 'Beban Komisi',
  type = 'BEBAN',
  parent_id = 'acc-6000';

-- 6900 - Beban Lain-lain
INSERT INTO public.accounts (id, code, name, type, parent_id, level, is_header, normal_balance, balance, initial_balance, is_payment_account, sort_order, created_at)
VALUES ('acc-6900', '6900', 'Beban Lain-lain', 'BEBAN', 'acc-6000', 2, false, 'DEBIT', 0, 0, false, 6900, NOW())
ON CONFLICT (id) DO UPDATE SET 
  name = 'Beban Lain-lain',
  type = 'BEBAN',
  parent_id = 'acc-6000';

-- Step 2: Create expense category mapping table
CREATE TABLE IF NOT EXISTS public.expense_category_mapping (
  id SERIAL PRIMARY KEY,
  category_name VARCHAR(100) NOT NULL UNIQUE,
  account_id VARCHAR(50) NOT NULL REFERENCES public.accounts(id),
  account_code VARCHAR(20) NOT NULL,
  account_name VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for expense category mapping
ALTER TABLE public.expense_category_mapping ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view expense category mapping" ON public.expense_category_mapping FOR SELECT USING (auth.role() = 'authenticated');

-- Step 3: Insert category mappings
INSERT INTO public.expense_category_mapping (category_name, account_id, account_code, account_name) VALUES
('Gaji', 'acc-6100', '6100', 'Beban Gaji'),
('Operasional', 'acc-6200', '6200', 'Beban Operasional'), 
('Administrasi', 'acc-6300', '6300', 'Beban Administrasi'),
('Listrik', 'acc-6400', '6400', 'Beban Listrik'),
('Transportasi', 'acc-6500', '6500', 'Beban Transportasi'),
('Komunikasi', 'acc-6600', '6600', 'Beban Komunikasi'),
('Pemeliharaan', 'acc-6700', '6700', 'Beban Pemeliharaan'),
('Komisi', 'acc-6800', '6800', 'Beban Komisi'),
('Lain-lain', 'acc-6900', '6900', 'Beban Lain-lain'),
-- Additional mappings for common categories
('Panjar Karyawan', 'acc-6100', '6100', 'Beban Gaji'),
('Pembayaran PO', 'acc-6200', '6200', 'Beban Operasional'),
('Penghapusan Piutang', 'acc-6900', '6900', 'Beban Lain-lain')
ON CONFLICT (category_name) DO UPDATE SET
  account_id = EXCLUDED.account_id,
  account_code = EXCLUDED.account_code,
  account_name = EXCLUDED.account_name;

-- Step 4: Create function to get account for expense category
CREATE OR REPLACE FUNCTION public.get_expense_account_for_category(category_name TEXT)
RETURNS TABLE (
  account_id VARCHAR(50),
  account_code VARCHAR(20), 
  account_name VARCHAR(100)
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ecm.account_id,
    ecm.account_code,
    ecm.account_name
  FROM public.expense_category_mapping ecm
  WHERE ecm.category_name = get_expense_account_for_category.category_name
  LIMIT 1;
  
  -- If no mapping found, return default to Beban Lain-lain
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT 
      'acc-6900'::VARCHAR(50) as account_id,
      '6900'::VARCHAR(20) as account_code,
      'Beban Lain-lain'::VARCHAR(100) as account_name;
  END IF;
END;
$$;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Expense accounts and category mapping created successfully!';
  RAISE NOTICE '';
  RAISE NOTICE '📊 EXPENSE ACCOUNTS CREATED:';
  RAISE NOTICE '   6100 - Beban Gaji';
  RAISE NOTICE '   6200 - Beban Operasional';  
  RAISE NOTICE '   6300 - Beban Administrasi';
  RAISE NOTICE '   6400 - Beban Listrik';
  RAISE NOTICE '   6500 - Beban Transportasi';
  RAISE NOTICE '   6600 - Beban Komunikasi';
  RAISE NOTICE '   6700 - Beban Pemeliharaan';
  RAISE NOTICE '   6800 - Beban Komisi';
  RAISE NOTICE '   6900 - Beban Lain-lain';
  RAISE NOTICE '';
  RAISE NOTICE '🔍 TEST FUNCTION:';
  RAISE NOTICE '   SELECT * FROM get_expense_account_for_category(''Operasional'');';
END $$;