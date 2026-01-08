-- ============================================================================
-- RPC 15: COA Adjustments
-- Purpose: Atomic operations for COA initial balance and journal posting
-- ============================================================================

-- ============================================================================
-- 1. UPDATE ACCOUNT INITIAL BALANCE ATOMIC
-- Update initial balance and sync opening journal
-- ============================================================================

CREATE OR REPLACE FUNCTION update_account_initial_balance_atomic(
  p_account_id TEXT,
  p_new_initial_balance NUMERIC,
  p_branch_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_user_name TEXT DEFAULT 'System'
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_account RECORD;
  v_journal_id UUID;
  v_entry_number TEXT;
  v_old_initial NUMERIC;
  v_equity_account_id TEXT;
  v_description TEXT;
BEGIN
  -- 1. Validate inputs
  IF p_account_id IS NULL OR p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Account ID and Branch ID are required'::TEXT;
    RETURN;
  END IF;

  -- 2. Get account info
  SELECT id, code, name, type, initial_balance INTO v_account
  FROM accounts
  WHERE id = p_account_id AND branch_id = p_branch_id;

  IF v_account.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Account not found'::TEXT;
    RETURN;
  END IF;

  v_old_initial := COALESCE(v_account.initial_balance, 0);

  -- No change needed if balances are equal
  IF v_old_initial = p_new_initial_balance THEN
    -- Try to find existing journal
    SELECT id INTO v_journal_id FROM journal_entries 
    WHERE reference_id = p_account_id AND reference_type = 'opening_balance' AND branch_id = p_branch_id
    LIMIT 1;
    
    RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;
    RETURN;
  END IF;

  -- 3. Update account initial balance
  UPDATE accounts
  SET initial_balance = p_new_initial_balance,
      updated_at = NOW()
  WHERE id = p_account_id;

  -- 4. Sync opening journal
  -- Use Equity/Modal account (3xxx) for balancing opening entries
  -- Search for Modal Awal or similar
  SELECT id INTO v_equity_account_id
  FROM accounts
  WHERE code LIKE '3%' AND branch_id = p_branch_id AND is_active = TRUE
  ORDER BY code ASC
  LIMIT 1;

  IF v_equity_account_id IS NULL THEN
    -- Fallback to any active account if Modal not found (should not happen in standard COA)
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Equity account not found for balancing opening entry'::TEXT;
    RETURN;
  END IF;

  -- Find existing journal or create new
  SELECT id INTO v_journal_id 
  FROM journal_entries 
  WHERE reference_id = p_account_id AND reference_type = 'opening_balance' AND branch_id = p_branch_id;

  v_description := format('Saldo Awal: %s - %s', v_account.code, v_account.name);

  IF v_journal_id IS NOT NULL THEN
    -- Update existing journal - set to draft first to allow line updates
    UPDATE journal_entries 
    SET status = 'draft',
        total_debit = ABS(p_new_initial_balance),
        total_credit = ABS(p_new_initial_balance),
        updated_at = NOW()
    WHERE id = v_journal_id;

    -- Delete old lines
    DELETE FROM journal_entry_lines WHERE journal_entry_id = v_journal_id;
  ELSE
    -- Create new journal header
    v_entry_number := 'OB-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0');
    
    INSERT INTO journal_entries (
      entry_number,
      entry_date,
      description,
      reference_type,
      reference_id,
      branch_id,
      status,
      total_debit,
      total_credit
    ) VALUES (
      v_entry_number,
      '2024-01-01', -- Standard opening date
      v_description,
      'opening_balance',
      p_account_id,
      p_branch_id,
      'draft',
      ABS(p_new_initial_balance),
      ABS(p_new_initial_balance)
    ) RETURNING id INTO v_journal_id;
  END IF;

  -- Create lines based on account type
  -- Debit/Credit logic for opening balance
  IF p_new_initial_balance > 0 THEN
    -- Account is Debit (Aset/Beban)
    IF v_account.type IN ('Aset', 'Beban') THEN
      INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
      VALUES (v_journal_id, 1, p_account_id, v_description, p_new_initial_balance, 0),
             (v_journal_id, 2, v_equity_account_id, v_description, 0, p_new_initial_balance);
    -- Account is Credit (Liabilitas/Ekuitas/Pendapatan)
    ELSE
      INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
      VALUES (v_journal_id, 1, p_account_id, v_description, 0, p_new_initial_balance),
             (v_journal_id, 2, v_equity_account_id, v_description, p_new_initial_balance, 0);
    END IF;
  END IF;

  -- Post the journal
  UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;

  RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. POST JOURNAL ATOMIC
-- Safely change journal status to posted
-- ============================================================================

CREATE OR REPLACE FUNCTION post_journal_atomic(
  p_journal_id UUID,
  p_branch_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT
) AS $$
DECLARE
  v_journal RECORD;
BEGIN
  SELECT id, status, total_debit, total_credit INTO v_journal
  FROM journal_entries
  WHERE id = p_journal_id AND branch_id = p_branch_id;

  IF v_journal.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Journal entry not found'::TEXT;
    RETURN;
  END IF;

  IF v_journal.status = 'posted' THEN
    RETURN QUERY SELECT TRUE, 'Journal already posted'::TEXT;
    RETURN;
  END IF;

  IF v_journal.total_debit != v_journal.total_credit THEN
    RETURN QUERY SELECT FALSE, 'Journal is not balanced'::TEXT;
    RETURN;
  END IF;

  UPDATE journal_entries
  SET status = 'posted',
      updated_at = NOW()
  WHERE id = p_journal_id;

  RETURN QUERY SELECT TRUE, 'Journal posted successfully'::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- GRANTS
GRANT EXECUTE ON FUNCTION update_account_initial_balance_atomic(TEXT, NUMERIC, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION post_journal_atomic(UUID, UUID) TO authenticated;
