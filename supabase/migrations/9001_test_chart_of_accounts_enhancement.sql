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