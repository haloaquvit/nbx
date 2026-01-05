-- Migration: Fix Account ID types from UUID to TEXT in RPCs
-- Purpose: Support 'acc-timestamp' format for account IDs which are not UUIDs

-- 1. Fix create_journal_atomic (remove UUID cast)
CREATE OR REPLACE FUNCTION create_journal_atomic(
  p_entry_date TIMESTAMP,
  p_description TEXT,
  p_reference_type TEXT,
  p_branch_id UUID,
  p_lines JSONB,  -- Array of {account_id, account_code, debit_amount, credit_amount, description}
  p_reference_id TEXT DEFAULT NULL,
  p_auto_post BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  entry_number TEXT,
  error_message TEXT
) AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_total_debit NUMERIC := 0;
  v_total_credit NUMERIC := 0;
  v_line RECORD;
  v_line_number INTEGER := 0;
BEGIN
  -- Validate branch
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Branch ID is required'::TEXT;
    RETURN;
  END IF;

  -- Validate lines
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Journal lines are required'::TEXT;
    RETURN;
  END IF;

  -- Calculate totals
  FOR v_line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
    account_id TEXT,
    debit_amount NUMERIC,
    credit_amount NUMERIC,
    description TEXT
  )
  LOOP
    v_total_debit := v_total_debit + COALESCE(v_line.debit_amount, 0);
    v_total_credit := v_total_credit + COALESCE(v_line.credit_amount, 0);
  END LOOP;

  -- Validate balance
  IF ABS(v_total_debit - v_total_credit) > 0.01 THEN
    RETURN QUERY SELECT
      FALSE,
      NULL::UUID,
      NULL::TEXT,
      format('Journal not balanced: Debit %s, Credit %s', v_total_debit, v_total_credit)::TEXT;
    RETURN;
  END IF;

  -- Check period closed
  DECLARE
    v_period_closed BOOLEAN;
  BEGIN
    SELECT EXISTS(
      SELECT 1 FROM closing_periods
      WHERE branch_id = p_branch_id
        AND year = EXTRACT(YEAR FROM p_entry_date)
    ) INTO v_period_closed;

    IF v_period_closed THEN
      RETURN QUERY SELECT
        FALSE,
        NULL::UUID,
        NULL::TEXT,
        format('Period %s is closed', EXTRACT(YEAR FROM p_entry_date))::TEXT;
      RETURN;
    END IF;
  END;

  -- Generate entry number
  v_entry_number := 'JE-' || TO_CHAR(p_entry_date, 'YYYYMMDD') || '-' ||
    LPAD((SELECT COUNT(*) + 1 FROM journal_entries WHERE branch_id = p_branch_id AND DATE(created_at) = DATE(p_entry_date))::TEXT, 4, '0') ||
    LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0');

  -- Create journal header as draft first
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
    p_entry_date,
    p_description,
    p_reference_type,
    p_reference_id,
    p_branch_id,
    'draft',
    v_total_debit,
    v_total_credit
  )
  RETURNING id INTO v_journal_id;

  -- Create journal lines
  v_line_number := 0;
  FOR v_line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
    account_id TEXT,
    account_code TEXT,
    debit_amount NUMERIC,
    credit_amount NUMERIC,
    description TEXT
  )
  LOOP
    v_line_number := v_line_number + 1;
    INSERT INTO journal_entry_lines (
      journal_entry_id,
      line_number,
      account_id,
      description,
      debit_amount,
      credit_amount
    ) VALUES (
      v_journal_id,
      v_line_number,
      CASE
        WHEN v_line.account_id IS NOT NULL THEN v_line.account_id -- WAS ::UUID, removed cast
        ELSE (SELECT id FROM accounts WHERE code = v_line.account_code AND branch_id = p_branch_id LIMIT 1)
      END,
      v_line.description,
      COALESCE(v_line.debit_amount, 0),
      COALESCE(v_line.credit_amount, 0)
    );
  END LOOP;

  -- Post the journal
  IF p_auto_post THEN
    UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
  END IF;

  RETURN QUERY SELECT TRUE, v_journal_id, v_entry_number, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Drop and Recreate create_receivable_payment_journal_rpc (Use TEXT for accounts)

DROP FUNCTION IF EXISTS create_receivable_payment_journal_rpc(UUID, TEXT, DATE, NUMERIC, TEXT, UUID);

CREATE OR REPLACE FUNCTION create_receivable_payment_journal_rpc(
  p_branch_id UUID,
  p_transaction_id TEXT,
  p_payment_date DATE,
  p_amount NUMERIC,
  p_customer_name TEXT DEFAULT 'Pelanggan',
  p_payment_account_id TEXT DEFAULT NULL -- Changed from UUID to TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  entry_number TEXT,
  error_message TEXT
) AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_kas_account_id TEXT; -- Changed from UUID
  v_piutang_account_id TEXT; -- Changed from UUID
BEGIN
  -- Validate
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Branch ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Amount must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get account IDs
  IF p_payment_account_id IS NOT NULL THEN
    v_kas_account_id := p_payment_account_id;
  ELSE
    SELECT id INTO v_kas_account_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '1110' AND is_active = TRUE LIMIT 1;
  END IF;

  SELECT id INTO v_piutang_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1210' AND is_active = TRUE LIMIT 1;

  IF v_kas_account_id IS NULL OR v_piutang_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Required accounts not found'::TEXT;
    RETURN;
  END IF;

  -- Generate entry number
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

  -- Create journal entry header
  INSERT INTO journal_entries (
    branch_id,
    entry_number,
    entry_date,
    description,
    reference_type,
    reference_id,
    status,
    is_voided,
    created_at,
    updated_at
  ) VALUES (
    p_branch_id,
    v_entry_number,
    p_payment_date,
    'Pembayaran Piutang - ' || p_transaction_id || ' - ' || p_customer_name,
    'receivable',
    p_transaction_id,
    'posted',
    FALSE,
    NOW(),
    NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Kas
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_kas_account_id,
    (SELECT name FROM accounts WHERE id = v_kas_account_id),
    p_amount, 0, 'Penerimaan kas pembayaran piutang', 1
  );

  -- Cr. Piutang
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_piutang_account_id,
    (SELECT name FROM accounts WHERE id = v_piutang_account_id),
    0, p_amount, 'Pelunasan piutang usaha', 2
  );

  RETURN QUERY SELECT TRUE, v_journal_id, v_entry_number, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION create_journal_atomic(TIMESTAMP, TEXT, TEXT, UUID, JSONB, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION create_receivable_payment_journal_rpc(UUID, TEXT, DATE, NUMERIC, TEXT, TEXT) TO authenticated;
