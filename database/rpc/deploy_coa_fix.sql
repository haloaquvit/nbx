-- ============================================================================
-- DEPLOY: COA Balance Fix - Single Source of Truth (Pure Journal)
-- Date: 2026-01-08
-- Purpose:
--   1. Saldo akun dihitung MURNI dari jurnal (tanpa initial_balance)
--   2. Saldo awal dicatat via jurnal opening_balance
--   3. Edit saldo awal: void jurnal lama, buat jurnal baru (audit trail)
--   4. Tambah fungsi get_account_opening_balance untuk display di UI
-- ============================================================================

-- ============================================================================
-- PART 1: UPDATE VIEWS (Pure Journal Calculation)
-- ============================================================================

-- VIEW 1: v_account_balances - Saldo akun MURNI dari jurnal
CREATE OR REPLACE VIEW v_account_balances AS
WITH journal_movements AS (
    SELECT
        jel.account_id,
        COALESCE(SUM(jel.debit_amount), 0) as total_debit,
        COALESCE(SUM(jel.credit_amount), 0) as total_credit
    FROM journal_entry_lines jel
    INNER JOIN journal_entries je ON je.id = jel.journal_entry_id
    WHERE je.status = 'posted'
      AND je.is_voided = FALSE
    GROUP BY jel.account_id
)
SELECT
    a.id as account_id,
    a.code as account_code,
    a.name as account_name,
    a.type as account_type,
    a.parent_id,
    a.level,
    a.is_header,
    a.branch_id,
    a.initial_balance as initial_balance_deprecated,
    a.balance as stored_balance,
    COALESCE(jm.total_debit, 0) as total_debit,
    COALESCE(jm.total_credit, 0) as total_credit,
    CASE
        WHEN a.type IN ('Aset', 'Beban') THEN
            COALESCE(jm.total_debit, 0) - COALESCE(jm.total_credit, 0)
        ELSE
            COALESCE(jm.total_credit, 0) - COALESCE(jm.total_debit, 0)
    END as calculated_balance,
    CASE
        WHEN a.type IN ('Aset', 'Beban') THEN
            (COALESCE(jm.total_debit, 0) - COALESCE(jm.total_credit, 0)) - a.balance
        ELSE
            (COALESCE(jm.total_credit, 0) - COALESCE(jm.total_debit, 0)) - a.balance
    END as balance_difference
FROM accounts a
LEFT JOIN journal_movements jm ON jm.account_id = a.id
WHERE a.is_active = TRUE;

-- VIEW 2: v_account_balance_mismatches
CREATE OR REPLACE VIEW v_account_balance_mismatches AS
SELECT
    account_id,
    account_code,
    account_name,
    account_type,
    branch_id,
    initial_balance_deprecated,
    stored_balance,
    calculated_balance,
    balance_difference
FROM v_account_balances
WHERE ABS(balance_difference) > 0.01;

-- VIEW 3: v_trial_balance
CREATE OR REPLACE VIEW v_trial_balance AS
SELECT
    account_code,
    account_name,
    account_type,
    branch_id,
    CASE
        WHEN account_type IN ('Aset', 'Beban') THEN calculated_balance
        ELSE 0
    END as debit_balance,
    CASE
        WHEN account_type NOT IN ('Aset', 'Beban') THEN calculated_balance
        ELSE 0
    END as credit_balance
FROM v_account_balances
WHERE is_header = FALSE
  AND calculated_balance != 0
ORDER BY account_code;

-- ============================================================================
-- PART 2: UPDATE FUNCTIONS (Pure Journal Calculation)
-- ============================================================================

-- FUNCTION: get_account_balance
CREATE OR REPLACE FUNCTION get_account_balance(p_account_id TEXT)
RETURNS NUMERIC AS $$
DECLARE
    v_balance NUMERIC;
    v_account_type TEXT;
    v_total_debit NUMERIC;
    v_total_credit NUMERIC;
BEGIN
    SELECT type INTO v_account_type FROM accounts WHERE id = p_account_id;
    IF NOT FOUND THEN RETURN NULL; END IF;

    SELECT
        COALESCE(SUM(jel.debit_amount), 0),
        COALESCE(SUM(jel.credit_amount), 0)
    INTO v_total_debit, v_total_credit
    FROM journal_entry_lines jel
    INNER JOIN journal_entries je ON je.id = jel.journal_entry_id
    WHERE jel.account_id = p_account_id
      AND je.status = 'posted'
      AND je.is_voided = FALSE;

    IF v_account_type IN ('Aset', 'Beban') THEN
        v_balance := v_total_debit - v_total_credit;
    ELSE
        v_balance := v_total_credit - v_total_debit;
    END IF;

    RETURN v_balance;
END;
$$ LANGUAGE plpgsql STABLE;

-- FUNCTION: get_account_balance_at_date
CREATE OR REPLACE FUNCTION get_account_balance_at_date(
    p_account_id TEXT,
    p_as_of_date DATE
)
RETURNS NUMERIC AS $$
DECLARE
    v_balance NUMERIC;
    v_account_type TEXT;
    v_total_debit NUMERIC;
    v_total_credit NUMERIC;
BEGIN
    SELECT type INTO v_account_type FROM accounts WHERE id = p_account_id;
    IF NOT FOUND THEN RETURN NULL; END IF;

    SELECT
        COALESCE(SUM(jel.debit_amount), 0),
        COALESCE(SUM(jel.credit_amount), 0)
    INTO v_total_debit, v_total_credit
    FROM journal_entry_lines jel
    INNER JOIN journal_entries je ON je.id = jel.journal_entry_id
    WHERE jel.account_id = p_account_id
      AND je.status = 'posted'
      AND je.is_voided = FALSE
      AND je.entry_date <= p_as_of_date;

    IF v_account_type IN ('Aset', 'Beban') THEN
        v_balance := v_total_debit - v_total_credit;
    ELSE
        v_balance := v_total_credit - v_total_debit;
    END IF;

    RETURN v_balance;
END;
$$ LANGUAGE plpgsql STABLE;

-- FUNCTION: sync_account_balances
CREATE OR REPLACE FUNCTION sync_account_balances()
RETURNS TABLE(
    account_id TEXT,
    account_code VARCHAR(10),
    account_name TEXT,
    old_balance NUMERIC,
    new_balance NUMERIC,
    difference NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH updated AS (
        UPDATE accounts a
        SET balance = vab.calculated_balance,
            updated_at = NOW()
        FROM v_account_balances vab
        WHERE a.id = vab.account_id
          AND ABS(a.balance - vab.calculated_balance) > 0.01
        RETURNING
            a.id, a.code, a.name,
            vab.stored_balance as old_bal,
            vab.calculated_balance as new_bal
    )
    SELECT u.id, u.code, u.name, u.old_bal, u.new_bal, u.new_bal - u.old_bal as diff
    FROM updated u;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 3: NEW FUNCTION - get_account_opening_balance
-- With fallback to accounts.initial_balance for legacy data
-- ============================================================================

CREATE OR REPLACE FUNCTION get_account_opening_balance(
  p_account_id TEXT,
  p_branch_id UUID
)
RETURNS TABLE (
  opening_balance NUMERIC,
  journal_id UUID,
  journal_date DATE,
  last_updated TIMESTAMPTZ
) AS $$
DECLARE
  v_account RECORD;
  v_journal_balance NUMERIC;
  v_journal_id UUID;
  v_journal_date DATE;
  v_journal_updated TIMESTAMPTZ;
BEGIN
  -- Get account info
  SELECT id, type, initial_balance, updated_at INTO v_account
  FROM accounts
  WHERE id = p_account_id AND branch_id = p_branch_id;

  IF v_account.id IS NULL THEN
    RETURN QUERY SELECT 0::NUMERIC, NULL::UUID, NULL::DATE, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Try to get opening balance from journal first (Single Source of Truth)
  SELECT
    CASE
      WHEN v_account.type IN ('Aset', 'Beban') THEN jel.debit_amount
      ELSE jel.credit_amount
    END,
    je.id,
    je.entry_date,
    je.updated_at
  INTO v_journal_balance, v_journal_id, v_journal_date, v_journal_updated
  FROM journal_entries je
  INNER JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  WHERE je.reference_id = p_account_id
    AND je.reference_type = 'opening_balance'
    AND je.branch_id = p_branch_id
    AND je.is_voided = FALSE
    AND jel.account_id = p_account_id
  ORDER BY je.created_at DESC
  LIMIT 1;

  -- If journal found, return journal data
  IF v_journal_id IS NOT NULL THEN
    RETURN QUERY SELECT v_journal_balance, v_journal_id, v_journal_date, v_journal_updated;
    RETURN;
  END IF;

  -- Fallback: return initial_balance from accounts column (for legacy data)
  IF COALESCE(v_account.initial_balance, 0) != 0 THEN
    RETURN QUERY SELECT v_account.initial_balance, NULL::UUID, NULL::DATE, v_account.updated_at;
    RETURN;
  END IF;

  -- No opening balance found
  RETURN QUERY SELECT 0::NUMERIC, NULL::UUID, NULL::DATE, NULL::TIMESTAMPTZ;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- PART 4: UPDATE update_account_initial_balance_atomic
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
  v_old_journal_id UUID;
  v_new_journal_id UUID;
  v_entry_number TEXT;
  v_current_journal_amount NUMERIC;
  v_equity_account_id TEXT;
  v_description TEXT;
BEGIN
  -- 1. Validate inputs
  IF p_account_id IS NULL OR p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Account ID and Branch ID are required'::TEXT;
    RETURN;
  END IF;

  -- 2. Get account info
  SELECT id, code, name, type INTO v_account
  FROM accounts
  WHERE id = p_account_id AND branch_id = p_branch_id;

  IF v_account.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Account not found'::TEXT;
    RETURN;
  END IF;

  -- 3. Cek jurnal saldo awal existing
  SELECT je.id, je.total_debit INTO v_old_journal_id, v_current_journal_amount
  FROM journal_entries je
  WHERE je.reference_id = p_account_id
    AND je.reference_type = 'opening_balance'
    AND je.branch_id = p_branch_id
    AND je.is_voided = FALSE
  ORDER BY je.created_at DESC
  LIMIT 1;

  v_current_journal_amount := COALESCE(v_current_journal_amount, 0);

  -- No change needed if journal amount equals new balance
  IF v_old_journal_id IS NOT NULL AND v_current_journal_amount = ABS(p_new_initial_balance) THEN
    RETURN QUERY SELECT TRUE, v_old_journal_id, NULL::TEXT;
    RETURN;
  END IF;

  -- 4. VOID existing opening balance journal (audit trail)
  IF v_old_journal_id IS NOT NULL THEN
    UPDATE journal_entries
    SET is_voided = TRUE,
        voided_at = NOW(),
        voided_by = p_user_id,
        updated_at = NOW()
    WHERE id = v_old_journal_id;
  END IF;

  -- 5. Handle saldo awal = 0: just void, don't create new journal
  IF p_new_initial_balance = 0 THEN
    RETURN QUERY SELECT TRUE, NULL::UUID, NULL::TEXT;
    RETURN;
  END IF;

  -- 6. Find equity/modal account for balancing (3xxx)
  SELECT id INTO v_equity_account_id
  FROM accounts
  WHERE code LIKE '3%' AND branch_id = p_branch_id AND is_active = TRUE
  ORDER BY code ASC
  LIMIT 1;

  IF v_equity_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Modal (3xxx) tidak ditemukan untuk pasangan jurnal'::TEXT;
    RETURN;
  END IF;

  -- Prevent self-reference for equity accounts
  IF p_account_id = v_equity_account_id THEN
    SELECT id INTO v_equity_account_id
    FROM accounts
    WHERE code LIKE '3%'
      AND branch_id = p_branch_id
      AND is_active = TRUE
      AND id != p_account_id
    ORDER BY code ASC
    LIMIT 1;

    IF v_equity_account_id IS NULL THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, 'Tidak ada akun Modal lain untuk pasangan jurnal saldo awal Modal'::TEXT;
      RETURN;
    END IF;
  END IF;

  v_description := format('Saldo Awal: %s - %s', v_account.code, v_account.name);

  -- 7. Create NEW journal (always new, for audit trail)
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
    total_credit,
    created_by
  ) VALUES (
    v_entry_number,
    DATE_TRUNC('year', NOW())::DATE,
    v_description,
    'opening_balance',
    p_account_id,
    p_branch_id,
    'draft',
    ABS(p_new_initial_balance),
    ABS(p_new_initial_balance),
    p_user_id
  ) RETURNING id INTO v_new_journal_id;

  -- 8. Create journal lines based on account type
  IF v_account.type IN ('Aset', 'Beban') THEN
    INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
    VALUES
      (v_new_journal_id, 1, p_account_id, v_description, ABS(p_new_initial_balance), 0),
      (v_new_journal_id, 2, v_equity_account_id, v_description, 0, ABS(p_new_initial_balance));
  ELSE
    INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
    VALUES
      (v_new_journal_id, 1, p_account_id, v_description, 0, ABS(p_new_initial_balance)),
      (v_new_journal_id, 2, v_equity_account_id, v_description, ABS(p_new_initial_balance), 0);
  END IF;

  -- 9. Post the journal
  UPDATE journal_entries SET status = 'posted' WHERE id = v_new_journal_id;

  RETURN QUERY SELECT TRUE, v_new_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 5: GRANTS
-- ============================================================================

GRANT SELECT ON v_account_balances TO authenticated;
GRANT SELECT ON v_account_balance_mismatches TO authenticated;
GRANT SELECT ON v_trial_balance TO authenticated;
GRANT EXECUTE ON FUNCTION get_account_balance(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_account_balance_at_date(TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_account_opening_balance(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_account_initial_balance_atomic(TEXT, NUMERIC, UUID, UUID, TEXT) TO authenticated;

-- ============================================================================
-- DONE
-- ============================================================================
SELECT 'COA Balance Fix deployed successfully!' as status;
