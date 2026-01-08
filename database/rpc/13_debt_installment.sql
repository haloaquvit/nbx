-- ============================================================================
-- RPC 13: Debt Installment Payment Atomic
-- Purpose: Bayar angsuran hutang secara atomic (1 transaksi DB)
-- - Update debt_installment status
-- - Update accounts_payable paid_amount
-- - Create journal entry
-- PENTING: Semua dalam 1 transaksi, rollback otomatis jika gagal
-- ============================================================================

DROP FUNCTION IF EXISTS pay_debt_installment_atomic(UUID, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION pay_debt_installment_atomic(
  p_installment_id UUID,
  p_branch_id UUID,
  p_payment_account_id TEXT,        -- Account ID for payment (e.g., 1110 for cash)
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  installment_id UUID,
  debt_id TEXT,
  journal_id UUID,
  remaining_debt NUMERIC,
  error_message TEXT
) AS $$
DECLARE
  v_installment RECORD;
  v_payable RECORD;
  v_journal_id UUID;
  v_entry_number TEXT;
  v_payment_method TEXT;
  v_payment_date DATE := CURRENT_DATE;
  v_kas_account_id TEXT;
  v_hutang_account_id TEXT;
  v_new_paid_amount NUMERIC;
  v_remaining NUMERIC;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::UUID, 0::NUMERIC,
      'Branch ID is REQUIRED'::TEXT;
    RETURN;
  END IF;

  IF p_installment_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::UUID, 0::NUMERIC,
      'Installment ID is required'::TEXT;
    RETURN;
  END IF;

  -- Get installment info
  SELECT
    di.id,
    di.debt_id,
    di.installment_number,
    di.total_amount,
    di.status,
    di.principal_amount,
    di.interest_amount
  INTO v_installment
  FROM debt_installments di
  WHERE di.id = p_installment_id;

  IF v_installment.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::UUID, 0::NUMERIC,
      'Angsuran tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  IF v_installment.status = 'paid' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::UUID, 0::NUMERIC,
      'Angsuran sudah dibayar'::TEXT;
    RETURN;
  END IF;

  -- Get payable info
  SELECT
    ap.id,
    ap.supplier_name,
    ap.amount,
    COALESCE(ap.paid_amount, 0) as paid_amount,
    ap.status,
    ap.branch_id
  INTO v_payable
  FROM accounts_payable ap
  WHERE ap.id = v_installment.debt_id AND ap.branch_id = p_branch_id;

  IF v_payable.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::UUID, 0::NUMERIC,
      'Hutang tidak ditemukan di cabang ini'::TEXT;
    RETURN;
  END IF;

  -- ==================== UPDATE INSTALLMENT ====================

  UPDATE debt_installments
  SET
    status = 'paid',
    paid_at = NOW(),
    paid_amount = v_installment.total_amount,
    payment_account_id = p_payment_account_id,
    notes = COALESCE(p_notes, notes)
  WHERE id = p_installment_id;

  -- ==================== UPDATE ACCOUNTS PAYABLE ====================

  v_new_paid_amount := v_payable.paid_amount + v_installment.total_amount;
  v_remaining := GREATEST(0, v_payable.amount - v_new_paid_amount);

  UPDATE accounts_payable
  SET
    paid_amount = v_new_paid_amount,
    status = CASE WHEN v_remaining <= 0 THEN 'Paid' ELSE 'Partial' END,
    paid_at = CASE WHEN v_remaining <= 0 THEN NOW() ELSE paid_at END
  WHERE id = v_installment.debt_id;

  -- ==================== CREATE JOURNAL ENTRY ====================

  -- Determine payment method from account ID
  v_payment_method := CASE WHEN p_payment_account_id LIKE '%1120%' THEN 'transfer' ELSE 'cash' END;

  -- Get account IDs
  IF v_payment_method = 'transfer' THEN
    SELECT id INTO v_kas_account_id
    FROM accounts
    WHERE code = '1120' AND branch_id = p_branch_id AND is_active = TRUE
    LIMIT 1;
  ELSE
    SELECT id INTO v_kas_account_id
    FROM accounts
    WHERE code = '1110' AND branch_id = p_branch_id AND is_active = TRUE
    LIMIT 1;
  END IF;

  SELECT id INTO v_hutang_account_id
  FROM accounts
  WHERE code = '2110' AND branch_id = p_branch_id AND is_active = TRUE
  LIMIT 1;

  IF v_kas_account_id IS NOT NULL AND v_hutang_account_id IS NOT NULL THEN
    v_entry_number := 'JE-' || TO_CHAR(v_payment_date, 'YYYYMMDD') || '-' ||
      LPAD((SELECT COUNT(*) + 1 FROM journal_entries
            WHERE branch_id = p_branch_id
            AND DATE(created_at) = v_payment_date)::TEXT, 4, '0');

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
      v_payment_date,
      format('Bayar angsuran #%s ke: %s%s',
        v_installment.installment_number,
        COALESCE(v_payable.supplier_name, 'Supplier'),
        CASE WHEN p_notes IS NOT NULL THEN ' - ' || p_notes ELSE '' END),
      'debt_installment',
      p_installment_id::TEXT,
      p_branch_id,
      'draft',
      v_installment.total_amount,
      v_installment.total_amount
    )
    RETURNING id INTO v_journal_id;

    -- Dr. Hutang Usaha
    INSERT INTO journal_entry_lines (
      journal_entry_id,
      line_number,
      account_id,
      account_code,
      account_name,
      description,
      debit_amount,
      credit_amount
    )
    SELECT
      v_journal_id,
      1,
      a.id,
      a.code,
      a.name,
      format('Angsuran #%s - %s', v_installment.installment_number, COALESCE(v_payable.supplier_name, 'Supplier')),
      v_installment.total_amount,
      0
    FROM accounts a WHERE a.id = v_hutang_account_id;

    -- Cr. Kas/Bank
    INSERT INTO journal_entry_lines (
      journal_entry_id,
      line_number,
      account_id,
      account_code,
      account_name,
      description,
      debit_amount,
      credit_amount
    )
    SELECT
      v_journal_id,
      2,
      a.id,
      a.code,
      a.name,
      format('Pembayaran angsuran hutang: %s', COALESCE(v_payable.supplier_name, 'Supplier')),
      0,
      v_installment.total_amount
    FROM accounts a WHERE a.id = v_kas_account_id;

    UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
  END IF;

  RETURN QUERY SELECT
    TRUE,
    p_installment_id,
    v_installment.debt_id,
    v_journal_id,
    v_remaining,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  -- Automatic rollback happens here
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::UUID, 0::NUMERIC, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION pay_debt_installment_atomic(UUID, UUID, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION pay_debt_installment_atomic IS
  'Atomic debt installment payment: update installment + payable + journal in single transaction.';
