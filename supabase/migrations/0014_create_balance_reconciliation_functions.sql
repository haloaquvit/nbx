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