-- ============================================================================
-- RPC 14: Account Management
-- Purpose: Manage Chart of Accounts (COA) atomically
-- ============================================================================

-- Drop existing functions if any
DROP FUNCTION IF EXISTS create_account(UUID, TEXT, TEXT, TEXT, NUMERIC, BOOLEAN, TEXT, UUID, BOOLEAN, INTEGER, UUID);
DROP FUNCTION IF EXISTS update_account(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, BOOLEAN, TEXT, UUID, BOOLEAN, BOOLEAN, INTEGER, UUID);
DROP FUNCTION IF EXISTS delete_account(UUID);
DROP FUNCTION IF EXISTS import_standard_coa(UUID, JSONB);

-- ============================================================================
-- 1. CREATE ACCOUNT
-- ============================================================================
CREATE OR REPLACE FUNCTION create_account(
  p_branch_id UUID,
  p_name TEXT,
  p_code TEXT,
  p_type TEXT,
  p_initial_balance NUMERIC DEFAULT 0,
  p_is_payment_account BOOLEAN DEFAULT FALSE,
  p_parent_id UUID DEFAULT NULL,
  p_level INTEGER DEFAULT 1,
  p_is_header BOOLEAN DEFAULT FALSE,
  p_sort_order INTEGER DEFAULT 0,
  p_employee_id UUID DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  account_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_account_id UUID;
  v_code_exists BOOLEAN;
BEGIN
  -- Validasi Branch
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is required';
    RETURN;
  END IF;

  -- Validasi Kode Unik dalam Branch
  IF p_code IS NOT NULL AND p_code != '' THEN
    SELECT EXISTS (
      SELECT 1 FROM accounts 
      WHERE code = p_code AND branch_id = p_branch_id AND is_active = TRUE
    ) INTO v_code_exists;
    
    IF v_code_exists THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, 'Account code already exists in this branch';
      RETURN;
    END IF;
  END IF;

  INSERT INTO accounts (
    branch_id,
    name,
    code,
    type,
    balance, -- Initial balance starts as current balance
    initial_balance,
    is_payment_account,
    parent_id,
    level,
    is_header,
    sort_order,
    employee_id,
    is_active,
    created_at,
    updated_at
  ) VALUES (
    p_branch_id,
    p_name,
    NULLIF(p_code, ''),
    p_type,
    p_initial_balance,
    p_initial_balance,
    p_is_payment_account,
    p_parent_id,
    p_level,
    p_is_header,
    p_sort_order,
    p_employee_id,
    TRUE,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_account_id;

  RETURN QUERY SELECT TRUE, v_account_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. UPDATE ACCOUNT
-- ============================================================================
CREATE OR REPLACE FUNCTION update_account(
  p_account_id UUID,
  p_branch_id UUID,
  p_name TEXT,
  p_code TEXT,
  p_type TEXT,
  p_initial_balance NUMERIC,
  p_is_payment_account BOOLEAN,
  p_parent_id UUID,
  p_level INTEGER,
  p_is_header BOOLEAN,
  p_is_active BOOLEAN,
  p_sort_order INTEGER,
  p_employee_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  account_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_code_exists BOOLEAN;
  v_current_code TEXT;
BEGIN
  -- Validasi Branch (untuk security check, pastikan akun milik branch yg benar)
  IF NOT EXISTS (SELECT 1 FROM accounts WHERE id = p_account_id AND (branch_id = p_branch_id OR branch_id IS NULL)) THEN
     RETURN QUERY SELECT FALSE, NULL::UUID, 'Account not found or access denied';
     RETURN;
  END IF;

  -- Get current code
  SELECT code INTO v_current_code FROM accounts WHERE id = p_account_id;

  -- Validasi Kode Unik (jika berubah)
  IF p_code IS NOT NULL AND p_code != '' AND (v_current_code IS NULL OR p_code != v_current_code) THEN
    SELECT EXISTS (
      SELECT 1 FROM accounts 
      WHERE code = p_code AND branch_id = p_branch_id AND id != p_account_id AND is_active = TRUE
    ) INTO v_code_exists;
    
    IF v_code_exists THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, 'Account code already exists in this branch';
      RETURN;
    END IF;
  END IF;

  UPDATE accounts
  SET
    name = COALESCE(p_name, name),
    code = NULLIF(p_code, ''),
    type = COALESCE(p_type, type),
    initial_balance = COALESCE(p_initial_balance, initial_balance),
    is_payment_account = COALESCE(p_is_payment_account, is_payment_account),
    parent_id = p_parent_id, -- Allow NULL
    level = COALESCE(p_level, level),
    is_header = COALESCE(p_is_header, is_header),
    is_active = COALESCE(p_is_active, is_active),
    sort_order = COALESCE(p_sort_order, sort_order),
    employee_id = p_employee_id, -- Allow NULL
    updated_at = NOW()
  WHERE id = p_account_id;

  RETURN QUERY SELECT TRUE, p_account_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 3. DELETE ACCOUNT
-- ============================================================================
CREATE OR REPLACE FUNCTION delete_account(
  p_account_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  error_message TEXT
) AS $$
DECLARE
  v_has_transactions BOOLEAN;
  v_has_children BOOLEAN;
BEGIN
  -- Cek Transactions
  SELECT EXISTS (
    SELECT 1 FROM journal_entry_lines WHERE account_id = p_account_id
  ) INTO v_has_transactions;

  IF v_has_transactions THEN
    RETURN QUERY SELECT FALSE, 'Cannot delete account with existing transactions. Deactivate it instead.';
    RETURN;
  END IF;

  -- Cek Children
  SELECT EXISTS (
    SELECT 1 FROM accounts WHERE parent_id = p_account_id
  ) INTO v_has_children;

  IF v_has_children THEN
    RETURN QUERY SELECT FALSE, 'Cannot delete account with sub-accounts';
    RETURN;
  END IF;

  DELETE FROM accounts WHERE id = p_account_id;

  RETURN QUERY SELECT TRUE, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. IMPORT STANDARD COA
-- ============================================================================
CREATE OR REPLACE FUNCTION import_standard_coa(
  p_branch_id UUID,
  p_items JSONB
)
RETURNS TABLE (
  success BOOLEAN,
  imported_count INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_item JSONB;
  v_count INTEGER := 0;
BEGIN
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Branch ID is required';
    RETURN;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- Insert or ignore if code exists (or update?)
    -- Logic similar to useAccounts: upsert based on some key, but here we don't have predictable IDs.
    -- We'll check by code.
    
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE branch_id = p_branch_id AND code = (v_item->>'code')) THEN
       INSERT INTO accounts (
         branch_id,
         name,
         code,
         type,
         level,
         is_header,
         sort_order,
         is_active,
         balance,
         initial_balance,
         created_at,
         updated_at
       ) VALUES (
         p_branch_id,
         v_item->>'name',
         v_item->>'code',
         v_item->>'type',
         (v_item->>'level')::INTEGER,
         (v_item->>'isHeader')::BOOLEAN,
         (v_item->>'sortOrder')::INTEGER,
         TRUE,
         0,
         0,
         NOW(),
         NOW()
       );
       v_count := v_count + 1;
    END IF;
  END LOOP;
  
  -- Second pass for parents? 
  -- Simplified: Assumes hierarchy is handled by codes or manual update later if needed.
  -- Or implemented if 'parentCode' provided.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
     IF (v_item->>'parentCode') IS NOT NULL THEN
        UPDATE accounts child
        SET parent_id = parent.id
        FROM accounts parent
        WHERE child.branch_id = p_branch_id AND child.code = (v_item->>'code')
          AND parent.branch_id = p_branch_id AND parent.code = (v_item->>'parentCode');
     END IF;
  END LOOP;

  RETURN QUERY SELECT TRUE, v_count, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0, SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grants
GRANT EXECUTE ON FUNCTION create_account(UUID, TEXT, TEXT, TEXT, NUMERIC, BOOLEAN, UUID, INTEGER, BOOLEAN, INTEGER, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_account(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, BOOLEAN, UUID, INTEGER, BOOLEAN, BOOLEAN, INTEGER, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_account(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION import_standard_coa(UUID, JSONB) TO authenticated;
