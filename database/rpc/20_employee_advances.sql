-- ============================================================================
-- RPC 20: Employee Advances Atomic
-- Purpose: Atomic operations for employee advances with journal integration
-- ============================================================================

-- ============================================================================
-- 1. CREATE EMPLOYEE ADVANCE ATOMIC
-- ============================================================================

CREATE OR REPLACE FUNCTION create_employee_advance_atomic(
  p_branch_id UUID,
  p_employee_id UUID,
  p_employee_name TEXT,
  p_amount NUMERIC,
  p_date DATE,
  p_notes TEXT,
  p_payment_account_id UUID,
  p_created_by UUID DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  advance_id TEXT,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_advance_id TEXT;
  v_journal_id UUID;
  v_piutang_acc_id UUID;
  v_journal_lines JSONB;
BEGIN
  -- ==================== VALIDASI ====================
  
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, 'Branch ID is REQUIRED'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, 'Amount must be positive'::TEXT;
    RETURN;
  END IF;

  -- Cari akun Piutang Karyawan (1220)
  SELECT id INTO v_piutang_acc_id
  FROM accounts
  WHERE branch_id = p_branch_id
    AND (code = '1220' OR name ILIKE '%Piutang Karyawan%' OR name ILIKE '%Kasbon%')
    AND is_header = FALSE
  LIMIT 1;

  IF v_piutang_acc_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, 'Akun Piutang Karyawan (1220) tidak ditemukan di branch ini'::TEXT;
    RETURN;
  END IF;

  -- ==================== CREATE ADVANCE RECORD ====================
  
  v_advance_id := 'ADV-' || TO_CHAR(p_date, 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

  INSERT INTO employee_advances (
    id,
    branch_id,
    employee_id,
    employee_name,
    amount,
    remaining_amount,
    date,
    notes,
    account_id,
    account_name,
    created_by,
    created_at
  ) VALUES (
    v_advance_id,
    p_branch_id,
    p_employee_id,
    p_employee_name,
    p_amount,
    p_amount, -- Initial remaining = amount
    p_date,
    p_notes,
    p_payment_account_id,
    (SELECT name FROM accounts WHERE id = p_payment_account_id),
    p_created_by,
    NOW()
  );

  -- ==================== CREATE JOURNAL ====================
  
  -- Dr. Piutang Karyawan
  --   Cr. Kas/Bank
  v_journal_lines := jsonb_build_array(
    jsonb_build_object(
      'account_id', v_piutang_acc_id,
      'debit_amount', p_amount,
      'credit_amount', 0,
      'description', format('Panjar Karyawan: %s', p_employee_name)
    ),
    jsonb_build_object(
      'account_id', p_payment_account_id,
      'debit_amount', 0,
      'credit_amount', p_amount,
      'description', format('Pembayaran panjar ke %s', p_employee_name)
    )
  );

  SELECT journal_id INTO v_journal_id
  FROM create_journal_atomic(
    p_branch_id,
    p_date,
    format('Panjar Karyawan - %s (%s)', p_employee_name, v_advance_id),
    'advance',
    v_advance_id,
    v_journal_lines,
    TRUE -- auto post
  );

  IF v_journal_id IS NULL THEN
    RAISE EXCEPTION 'Gagal membuat jurnal panjar';
  END IF;

  RETURN QUERY SELECT TRUE, v_advance_id, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. REPAY EMPLOYEE ADVANCE ATOMIC
-- ============================================================================

CREATE OR REPLACE FUNCTION repay_employee_advance_atomic(
  p_branch_id UUID,
  p_advance_id TEXT,
  p_amount NUMERIC,
  p_date DATE,
  p_payment_account_id UUID,
  p_recorded_by TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  repayment_id TEXT,
  journal_id UUID,
  remaining_amount NUMERIC,
  error_message TEXT
) AS $$
DECLARE
  v_repayment_id TEXT;
  v_journal_id UUID;
  v_advance_record RECORD;
  v_piutang_acc_id UUID;
  v_journal_lines JSONB;
  v_new_remaining NUMERIC;
BEGIN
  -- ==================== VALIDASI ====================
  
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, 0::NUMERIC, 'Branch ID is REQUIRED'::TEXT;
    RETURN;
  END IF;

  -- Get advance record with row lock
  SELECT * INTO v_advance_record
  FROM employee_advances
  WHERE id = p_advance_id AND branch_id = p_branch_id
  FOR UPDATE;

  IF v_advance_record.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, 0::NUMERIC, 'Data panjar tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  IF p_amount > v_advance_record.remaining_amount THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, v_advance_record.remaining_amount, 
      format('Jumlah pelunasan (%s) melebihi sisa panjar (%s)', p_amount, v_advance_record.remaining_amount)::TEXT;
    RETURN;
  END IF;

  -- Cari akun Piutang Karyawan
  SELECT id INTO v_piutang_acc_id
  FROM accounts
  WHERE branch_id = p_branch_id
    AND (code = '1220' OR name ILIKE '%Piutang Karyawan%' OR name ILIKE '%Kasbon%')
  LIMIT 1;

  -- ==================== CREATE REPAYMENT RECORD ====================
  
  v_repayment_id := 'REP-' || TO_CHAR(p_date, 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

  INSERT INTO advance_repayments (
    id,
    advance_id,
    amount,
    date,
    recorded_by,
    created_at
  ) VALUES (
    v_repayment_id,
    p_advance_id,
    p_amount,
    p_date,
    p_recorded_by,
    NOW()
  );

  -- Update remaining amount
  UPDATE employee_advances
  SET 
    remaining_amount = remaining_amount - p_amount,
    updated_at = NOW()
  WHERE id = p_advance_id
  RETURNING remaining_amount INTO v_new_remaining;

  -- ==================== CREATE JOURNAL ====================
  
  -- Dr. Kas/Bank
  --   Cr. Piutang Karyawan
  v_journal_lines := jsonb_build_array(
    jsonb_build_object(
      'account_id', p_payment_account_id,
      'debit_amount', p_amount,
      'credit_amount', 0,
      'description', format('Pelunasan panjar: %s', v_advance_record.employee_name)
    ),
    jsonb_build_object(
      'account_id', v_piutang_acc_id,
      'debit_amount', 0,
      'credit_amount', p_amount,
      'description', format('Pengurangan piutang karyawan (%s)', p_advance_id)
    )
  );

  SELECT journal_id INTO v_journal_id
  FROM create_journal_atomic(
    p_branch_id,
    p_date,
    format('Pelunasan Panjar - %s (%s)', v_advance_record.employee_name, v_repayment_id),
    'advance',
    v_repayment_id,
    v_journal_lines,
    TRUE
  );

  RETURN QUERY SELECT TRUE, v_repayment_id, v_journal_id, v_new_remaining, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, 0::NUMERIC, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 3. VOID EMPLOYEE ADVANCE ATOMIC
-- ============================================================================

CREATE OR REPLACE FUNCTION void_employee_advance_atomic(
  p_branch_id UUID,
  p_advance_id TEXT,
  p_reason TEXT DEFAULT 'Cancelled'
)
RETURNS TABLE (
  success BOOLEAN,
  journals_voided INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_journals_voided INTEGER := 0;
  v_advance_record RECORD;
BEGIN
  -- ==================== VALIDASI ====================

  SELECT * INTO v_advance_record
  FROM employee_advances
  WHERE id = p_advance_id AND branch_id = p_branch_id
  FOR UPDATE;

  IF v_advance_record.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Data panjar tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- ==================== VOID JOURNALS ====================

  -- Void advance journal and all repayment journals
  UPDATE journal_entries
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_reason = p_reason,
    status = 'voided',
    updated_at = NOW()
  WHERE branch_id = p_branch_id
    AND reference_type = 'advance'
    AND (reference_id = p_advance_id OR reference_id IN (SELECT id FROM advance_repayments WHERE advance_id = p_advance_id))
    AND is_voided = FALSE;

  GET DIAGNOSTICS v_journals_voided = ROW_COUNT;

  -- ==================== DELETE RECORDS ====================
  
  -- Hard delete repayments first
  DELETE FROM advance_repayments WHERE advance_id = p_advance_id;

  -- Hard delete the advance
  DELETE FROM employee_advances WHERE id = p_advance_id AND branch_id = p_branch_id;

  RETURN QUERY SELECT TRUE, v_journals_voided, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANTS & COMMENTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION create_employee_advance_atomic(UUID, UUID, TEXT, NUMERIC, DATE, TEXT, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION repay_employee_advance_atomic(UUID, TEXT, NUMERIC, DATE, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION void_employee_advance_atomic(UUID, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION create_employee_advance_atomic IS 'Pemberian panjar karyawan secara atomik dengan jurnal.';
COMMENT ON FUNCTION repay_employee_advance_atomic IS 'Pelunasan panjar karyawan secara atomik dengan jurnal.';
COMMENT ON FUNCTION void_employee_advance_atomic IS 'Pembatalan panjar karyawan secara atomik (void jurnal + hapus data).';
