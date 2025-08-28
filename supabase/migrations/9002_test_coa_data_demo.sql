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