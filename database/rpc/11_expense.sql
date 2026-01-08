-- ============================================================================
-- RPC 11: Expense Atomic
-- Purpose: Proses pengeluaran/expense atomic dengan:
-- - Create expense record
-- - Auto-generate journal (Dr. Beban, Cr. Kas)
-- PENTING: Semua operasi WAJIB filter by branch_id
-- ============================================================================

-- Drop existing functions
DROP FUNCTION IF EXISTS create_expense_atomic(JSONB, UUID);
DROP FUNCTION IF EXISTS update_expense_atomic(TEXT, JSONB, UUID);
DROP FUNCTION IF EXISTS delete_expense_atomic(TEXT, UUID);

-- ============================================================================
-- 1. CREATE EXPENSE ATOMIC
-- Membuat expense dengan auto journal
-- Journal: Dr. Beban (expense account), Cr. Kas (payment account)
-- ============================================================================

CREATE OR REPLACE FUNCTION create_expense_atomic(
  p_expense JSONB,          -- {description, amount, category, date, account_id, expense_account_id, expense_account_name}
  p_branch_id UUID          -- WAJIB
)
RETURNS TABLE (
  success BOOLEAN,
  expense_id TEXT,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_expense_id TEXT;
  v_description TEXT;
  v_amount NUMERIC;
  v_category TEXT;
  v_date TIMESTAMPTZ;  -- Changed from DATE to TIMESTAMPTZ to preserve time
  v_cash_account_id TEXT;  -- accounts.id is TEXT not UUID
  v_expense_account_id TEXT;  -- accounts.id is TEXT not UUID
  v_expense_account_name TEXT;
  v_journal_id UUID;
  v_journal_lines JSONB := '[]'::JSONB;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID,
      'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_expense IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID,
      'Expense data is required'::TEXT;
    RETURN;
  END IF;

  -- ==================== PARSE DATA ====================

  v_description := COALESCE(p_expense->>'description', 'Pengeluaran');
  v_amount := COALESCE((p_expense->>'amount')::NUMERIC, 0);
  v_category := COALESCE(p_expense->>'category', 'Beban Umum');
  v_date := COALESCE((p_expense->>'date')::TIMESTAMPTZ, NOW());  -- Parse as TIMESTAMPTZ to preserve time
  v_cash_account_id := p_expense->>'account_id';  -- TEXT, no cast needed
  v_expense_account_id := p_expense->>'expense_account_id';  -- TEXT, no cast needed
  v_expense_account_name := p_expense->>'expense_account_name';

  IF v_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID,
      'Amount must be greater than 0'::TEXT;
    RETURN;
  END IF;

  -- ==================== FIND ACCOUNTS ====================

  -- Find expense account by ID or fallback to category-based search
  IF v_expense_account_id IS NULL THEN
    -- Search by category name
    SELECT id INTO v_expense_account_id
    FROM accounts
    WHERE branch_id = p_branch_id
      AND is_active = TRUE
      AND is_header = FALSE
      AND (
        code LIKE '6%'  -- Expense accounts
        OR type IN ('Beban', 'Expense')
      )
      AND (
        LOWER(name) LIKE '%' || LOWER(v_category) || '%'
        OR name ILIKE '%beban umum%'
      )
    ORDER BY
      CASE WHEN LOWER(name) LIKE '%' || LOWER(v_category) || '%' THEN 1 ELSE 2 END,
      code
    LIMIT 1;

    -- Fallback to default expense account (6200 - Beban Operasional or 6100)
    IF v_expense_account_id IS NULL THEN
      SELECT id INTO v_expense_account_id
      FROM accounts
      WHERE branch_id = p_branch_id
        AND is_active = TRUE
        AND is_header = FALSE
        AND code IN ('6200', '6100', '6000')
      ORDER BY code
      LIMIT 1;
    END IF;
  END IF;

  -- Find cash/payment account
  IF v_cash_account_id IS NULL THEN
    SELECT id INTO v_cash_account_id
    FROM accounts
    WHERE branch_id = p_branch_id
      AND is_active = TRUE
      AND is_payment_account = TRUE
      AND code LIKE '11%'
    ORDER BY code
    LIMIT 1;
  END IF;

  -- Validate accounts found
  IF v_expense_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID,
      'Akun beban tidak ditemukan. Pastikan ada akun dengan kode 6xxx.'::TEXT;
    RETURN;
  END IF;

  IF v_cash_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID,
      'Akun kas tidak ditemukan. Pastikan ada akun payment dengan kode 11xx.'::TEXT;
    RETURN;
  END IF;

  -- ==================== GENERATE EXPENSE ID ====================

  v_expense_id := 'exp-' || EXTRACT(EPOCH FROM NOW())::BIGINT::TEXT ||
                  '-' || LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0');

  -- ==================== CREATE EXPENSE RECORD ====================

  INSERT INTO expenses (
    id,
    description,
    amount,
    category,
    date,
    account_id,
    expense_account_id,
    expense_account_name,
    branch_id,
    created_at
  ) VALUES (
    v_expense_id,
    v_description,
    v_amount,
    v_category,
    v_date,
    v_cash_account_id,
    v_expense_account_id,
    v_expense_account_name,
    p_branch_id,
    NOW()
  );

  -- ==================== CREATE JOURNAL ====================

  -- Debit: Beban (expense account)
  v_journal_lines := v_journal_lines || jsonb_build_object(
    'account_id', v_expense_account_id,
    'debit_amount', v_amount,
    'credit_amount', 0,
    'description', v_category || ': ' || v_description
  );

  -- Credit: Kas (payment account)
  v_journal_lines := v_journal_lines || jsonb_build_object(
    'account_id', v_cash_account_id,
    'debit_amount', 0,
    'credit_amount', v_amount,
    'description', 'Pengeluaran kas'
  );

  SELECT cja.journal_id INTO v_journal_id FROM create_journal_atomic(
    p_branch_id,
    v_date,
    format('Pengeluaran - %s', v_description),
    'expense',
    v_expense_id,
    v_journal_lines,
    TRUE
  ) AS cja;

  -- ==================== SUCCESS ====================

  RETURN QUERY SELECT TRUE, v_expense_id, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 2. UPDATE EXPENSE ATOMIC
-- Update expense dan update journal lines
-- ============================================================================

CREATE OR REPLACE FUNCTION update_expense_atomic(
  p_expense_id TEXT,
  p_expense JSONB,          -- {description, amount, category, date, account_id}
  p_branch_id UUID          -- WAJIB
)
RETURNS TABLE (
  success BOOLEAN,
  journal_updated BOOLEAN,
  error_message TEXT
) AS $$
DECLARE
  v_old_expense RECORD;
  v_new_amount NUMERIC;
  v_new_cash_account_id TEXT;  -- accounts.id is TEXT not UUID
  v_journal_id UUID;
  v_expense_account_id TEXT;  -- accounts.id is TEXT not UUID
  v_amount_changed BOOLEAN;
  v_account_changed BOOLEAN;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, FALSE,
      'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  -- Get existing expense
  SELECT * INTO v_old_expense
  FROM expenses
  WHERE id = p_expense_id AND branch_id = p_branch_id;

  IF v_old_expense.id IS NULL THEN
    RETURN QUERY SELECT FALSE, FALSE,
      'Expense not found in this branch'::TEXT;
    RETURN;
  END IF;

  -- ==================== PARSE DATA ====================

  v_new_amount := COALESCE((p_expense->>'amount')::NUMERIC, v_old_expense.amount);
  v_new_cash_account_id := COALESCE(p_expense->>'account_id', v_old_expense.account_id);  -- TEXT, no cast

  v_amount_changed := v_new_amount != v_old_expense.amount;
  v_account_changed := v_new_cash_account_id IS DISTINCT FROM v_old_expense.account_id;

  -- ==================== UPDATE EXPENSE ====================

  UPDATE expenses SET
    description = COALESCE(p_expense->>'description', description),
    amount = v_new_amount,
    category = COALESCE(p_expense->>'category', category),
    date = COALESCE((p_expense->>'date')::DATE, date),
    account_id = v_new_cash_account_id,
    updated_at = NOW()
  WHERE id = p_expense_id;

  -- ==================== UPDATE JOURNAL IF NEEDED ====================

  IF v_amount_changed OR v_account_changed THEN
    -- Find existing journal
    SELECT id INTO v_journal_id
    FROM journal_entries
    WHERE reference_id = p_expense_id
      AND reference_type = 'expense'
      AND branch_id = p_branch_id
      AND is_voided = FALSE
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_journal_id IS NOT NULL THEN
      -- Get expense account from current expense
      v_expense_account_id := v_old_expense.expense_account_id;

      IF v_expense_account_id IS NULL THEN
        -- Fallback: find default expense account
        SELECT id INTO v_expense_account_id
        FROM accounts
        WHERE branch_id = p_branch_id
          AND is_active = TRUE
          AND code LIKE '6%'
        ORDER BY code
        LIMIT 1;
      END IF;

      IF v_expense_account_id IS NOT NULL AND v_new_cash_account_id IS NOT NULL THEN
        -- Delete old lines
        DELETE FROM journal_entry_lines WHERE journal_entry_id = v_journal_id;

        -- Insert new lines
        INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, debit_amount, credit_amount, description)
        VALUES
          (v_journal_id, 1, v_expense_account_id, v_new_amount, 0, 'Beban pengeluaran (edit)'),
          (v_journal_id, 2, v_new_cash_account_id, 0, v_new_amount, 'Pengeluaran kas (edit)');

        -- Update journal totals
        UPDATE journal_entries SET
          total_debit = v_new_amount,
          total_credit = v_new_amount,
          updated_at = NOW()
        WHERE id = v_journal_id;

        RETURN QUERY SELECT TRUE, TRUE, NULL::TEXT;
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT TRUE, FALSE, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, FALSE, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 3. DELETE EXPENSE ATOMIC
-- Delete expense dan void journal
-- ============================================================================

CREATE OR REPLACE FUNCTION delete_expense_atomic(
  p_expense_id TEXT,
  p_branch_id UUID          -- WAJIB
)
RETURNS TABLE (
  success BOOLEAN,
  journals_voided INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_journals_voided INTEGER := 0;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  -- Check expense exists
  IF NOT EXISTS (
    SELECT 1 FROM expenses WHERE id = p_expense_id AND branch_id = p_branch_id
  ) THEN
    RETURN QUERY SELECT FALSE, 0, 'Expense not found'::TEXT;
    RETURN;
  END IF;

  -- ==================== VOID JOURNALS ====================

  UPDATE journal_entries
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_reason = 'Expense deleted',
    status = 'voided',
    updated_at = NOW()
  WHERE reference_id = p_expense_id
    AND reference_type = 'expense'
    AND branch_id = p_branch_id
    AND is_voided = FALSE;

  GET DIAGNOSTICS v_journals_voided = ROW_COUNT;

  -- ==================== DELETE EXPENSE ====================

  DELETE FROM expenses WHERE id = p_expense_id AND branch_id = p_branch_id;

  RETURN QUERY SELECT TRUE, v_journals_voided, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION create_expense_atomic(JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_expense_atomic(TEXT, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_expense_atomic(TEXT, UUID) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION create_expense_atomic IS
  'Create expense dengan auto journal (Dr. Beban, Cr. Kas). WAJIB branch_id.';
COMMENT ON FUNCTION update_expense_atomic IS
  'Update expense dan update journal jika amount/account berubah. WAJIB branch_id.';
COMMENT ON FUNCTION delete_expense_atomic IS
  'Delete expense dan void journal terkait. WAJIB branch_id.';
