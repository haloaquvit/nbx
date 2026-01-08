-- ============================================================================
-- RPC 15: COA Adjustments
-- Purpose: Atomic operations for COA initial balance and journal posting
-- ============================================================================
--
-- ARSITEKTUR AKUNTANSI (Single Source of Truth):
-- - Saldo Awal HANYA dicatat via jurnal opening_balance
-- - Kolom accounts.initial_balance DEPRECATED (tidak dipakai untuk perhitungan)
-- - Semua saldo dihitung MURNI dari jurnal entries
-- - Saat edit saldo awal: VOID jurnal lama, BUAT jurnal baru (audit trail)
-- ============================================================================

-- ============================================================================
-- 0. GET ACCOUNT OPENING BALANCE
-- Ambil saldo awal akun dari jurnal opening_balance (untuk display di UI)
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
  -- This handles accounts that were set before the journal-based system
  IF COALESCE(v_account.initial_balance, 0) != 0 THEN
    RETURN QUERY SELECT v_account.initial_balance, NULL::UUID, NULL::DATE, v_account.updated_at;
    RETURN;
  END IF;

  -- No opening balance found
  RETURN QUERY SELECT 0::NUMERIC, NULL::UUID, NULL::DATE, NULL::TIMESTAMPTZ;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- 1. UPDATE ACCOUNT INITIAL BALANCE ATOMIC
-- Buat jurnal opening_balance baru untuk saldo awal akun (void yang lama)
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
  v_equity_account_code TEXT;
  v_equity_account_name TEXT;
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
    -- Update accounts.initial_balance column for UI display
    UPDATE accounts SET initial_balance = 0, updated_at = NOW()
    WHERE id = p_account_id;

    RETURN QUERY SELECT TRUE, NULL::UUID, NULL::TEXT;
    RETURN;
  END IF;

  -- 6. Find "Modal Disetor" account (3100) for balancing
  -- Priority: exact code 3100 > name contains 'disetor' > any non-header 3xxx
  SELECT id, code, name INTO v_equity_account_id, v_equity_account_code, v_equity_account_name
  FROM accounts
  WHERE branch_id = p_branch_id
    AND is_active = TRUE
    AND is_header = FALSE
    AND (code = '3100' OR LOWER(name) LIKE '%disetor%')
  ORDER BY
    CASE WHEN code = '3100' THEN 1 ELSE 2 END,
    code ASC
  LIMIT 1;

  -- Fallback: any non-header equity account (3xxx)
  IF v_equity_account_id IS NULL THEN
    SELECT id, code, name INTO v_equity_account_id, v_equity_account_code, v_equity_account_name
    FROM accounts
    WHERE code LIKE '3%'
      AND branch_id = p_branch_id
      AND is_active = TRUE
      AND is_header = FALSE
    ORDER BY code ASC
    LIMIT 1;
  END IF;

  IF v_equity_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Modal (3xxx) tidak ditemukan untuk pasangan jurnal'::TEXT;
    RETURN;
  END IF;

  -- Prevent self-reference for equity accounts
  IF p_account_id = v_equity_account_id THEN
    SELECT id, code, name INTO v_equity_account_id, v_equity_account_code, v_equity_account_name
    FROM accounts
    WHERE code LIKE '3%'
      AND branch_id = p_branch_id
      AND is_active = TRUE
      AND is_header = FALSE
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
    DATE_TRUNC('year', NOW())::DATE, -- Tanggal 1 Januari tahun berjalan
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
    -- Akun Debit Normal: Debit Akun, Credit Modal
    INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, account_code, account_name, description, debit_amount, credit_amount)
    VALUES
      (v_new_journal_id, 1, p_account_id, v_account.code, v_account.name, v_description, ABS(p_new_initial_balance), 0),
      (v_new_journal_id, 2, v_equity_account_id, v_equity_account_code, v_equity_account_name, v_description, 0, ABS(p_new_initial_balance));
  ELSE
    -- Akun Credit Normal (Kewajiban/Modal/Pendapatan): Credit Akun, Debit Modal
    INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, account_code, account_name, description, debit_amount, credit_amount)
    VALUES
      (v_new_journal_id, 1, p_account_id, v_account.code, v_account.name, v_description, 0, ABS(p_new_initial_balance)),
      (v_new_journal_id, 2, v_equity_account_id, v_equity_account_code, v_equity_account_name, v_description, ABS(p_new_initial_balance), 0);
  END IF;

  -- 9. Post the journal
  UPDATE journal_entries SET status = 'posted' WHERE id = v_new_journal_id;

  -- 10. Update accounts.initial_balance column for UI display (sync with journal)
  UPDATE accounts SET initial_balance = p_new_initial_balance, updated_at = NOW()
  WHERE id = p_account_id;

  RETURN QUERY SELECT TRUE, v_new_journal_id, NULL::TEXT;

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
GRANT EXECUTE ON FUNCTION get_account_opening_balance(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_account_initial_balance_atomic(TEXT, NUMERIC, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION post_journal_atomic(UUID, UUID) TO authenticated;
