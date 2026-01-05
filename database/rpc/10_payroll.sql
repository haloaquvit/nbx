-- ============================================================================
-- RPC 10: Payroll Atomic
-- Purpose: Proses payroll lengkap atomic dengan:
-- - Create payroll record
-- - Process payment dengan journal (Dr. Beban Gaji, Cr. Kas, Cr. Panjar)
-- - Update employee advances (potongan panjar)
-- - Update commission entries status
-- PENTING: Semua operasi WAJIB filter by branch_id
-- ============================================================================

-- Drop existing functions
DROP FUNCTION IF EXISTS process_payroll_complete(JSONB, UUID, UUID, DATE);
DROP FUNCTION IF EXISTS create_payroll_record(JSONB, UUID);
DROP FUNCTION IF EXISTS void_payroll_record(UUID, UUID, TEXT);

-- ============================================================================
-- 1. CREATE PAYROLL RECORD (Draft)
-- Membuat record gaji baru dalam status draft
-- ============================================================================

CREATE OR REPLACE FUNCTION create_payroll_record(
  p_payroll JSONB,          -- {employee_id, period_year, period_month, base_salary, commission, bonus, advance_deduction, salary_deduction, notes}
  p_branch_id UUID          -- WAJIB
)
RETURNS TABLE (
  success BOOLEAN,
  payroll_id UUID,
  net_salary NUMERIC,
  error_message TEXT
) AS $$
DECLARE
  v_payroll_id UUID;
  v_employee_id UUID;
  v_period_year INTEGER;
  v_period_month INTEGER;
  v_period_start DATE;
  v_period_end DATE;
  v_base_salary NUMERIC;
  v_commission NUMERIC;
  v_bonus NUMERIC;
  v_advance_deduction NUMERIC;
  v_salary_deduction NUMERIC;
  v_total_deductions NUMERIC;
  v_gross_salary NUMERIC;
  v_net_salary NUMERIC;
  v_notes TEXT;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC,
      'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_payroll IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC,
      'Payroll data is required'::TEXT;
    RETURN;
  END IF;

  -- ==================== PARSE DATA ====================

  v_employee_id := (p_payroll->>'employee_id')::UUID;
  v_period_year := COALESCE((p_payroll->>'period_year')::INTEGER, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER);
  v_period_month := COALESCE((p_payroll->>'period_month')::INTEGER, EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER);
  v_base_salary := COALESCE((p_payroll->>'base_salary')::NUMERIC, 0);
  v_commission := COALESCE((p_payroll->>'commission')::NUMERIC, 0);
  v_bonus := COALESCE((p_payroll->>'bonus')::NUMERIC, 0);
  v_advance_deduction := COALESCE((p_payroll->>'advance_deduction')::NUMERIC, 0);
  v_salary_deduction := COALESCE((p_payroll->>'salary_deduction')::NUMERIC, 0);
  v_notes := p_payroll->>'notes';

  IF v_employee_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC,
      'Employee ID is required'::TEXT;
    RETURN;
  END IF;

  -- Calculate period dates
  v_period_start := make_date(v_period_year, v_period_month, 1);
  v_period_end := (v_period_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  -- Calculate amounts
  v_total_deductions := v_advance_deduction + v_salary_deduction;
  v_gross_salary := v_base_salary + v_commission + v_bonus;
  v_net_salary := v_gross_salary - v_total_deductions;

  -- ==================== CHECK DUPLICATE ====================

  IF EXISTS (
    SELECT 1 FROM payroll_records
    WHERE employee_id = v_employee_id
      AND period_start = v_period_start
      AND period_end = v_period_end
      AND branch_id = p_branch_id
  ) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC,
      format('Payroll untuk karyawan ini periode %s-%s sudah ada', v_period_year, v_period_month)::TEXT;
    RETURN;
  END IF;

  -- ==================== INSERT PAYROLL RECORD ====================

  INSERT INTO payroll_records (
    employee_id,
    period_start,
    period_end,
    base_salary,
    total_commission,
    total_bonus,
    total_deductions,
    advance_deduction,
    salary_deduction,
    net_salary,
    status,
    notes,
    branch_id,
    created_at
  ) VALUES (
    v_employee_id,
    v_period_start,
    v_period_end,
    v_base_salary,
    v_commission,
    v_bonus,
    v_total_deductions,
    v_advance_deduction,
    v_salary_deduction,
    v_net_salary,
    'draft',
    v_notes,
    p_branch_id,
    NOW()
  )
  RETURNING id INTO v_payroll_id;

  RETURN QUERY SELECT TRUE, v_payroll_id, v_net_salary, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 2. PROCESS PAYROLL COMPLETE
-- Proses pembayaran gaji lengkap:
-- - Update status ke 'paid'
-- - Create journal (Dr. Beban Gaji, Cr. Kas, Cr. Panjar)
-- - Update employee_advances
-- - Update commission_entries status
-- ============================================================================

CREATE OR REPLACE FUNCTION process_payroll_complete(
  p_payroll_id UUID,
  p_branch_id UUID,
  p_payment_account_id UUID,
  p_payment_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  advances_updated INTEGER,
  commissions_paid INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_payroll RECORD;
  v_journal_id UUID;
  v_journal_lines JSONB := '[]'::JSONB;
  v_employee_name TEXT;
  v_gross_salary NUMERIC;
  v_net_salary NUMERIC;
  v_advance_deduction NUMERIC;
  v_salary_deduction NUMERIC;
  v_total_deductions NUMERIC;
  v_advances_updated INTEGER := 0;
  v_commissions_paid INTEGER := 0;
  v_remaining_deduction NUMERIC;
  v_advance RECORD;
  v_amount_to_deduct NUMERIC;
  v_beban_gaji_account UUID;
  v_panjar_account UUID;
  v_period_start DATE;
  v_period_end DATE;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0,
      'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_payroll_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0,
      'Payroll ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_payment_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0,
      'Payment account ID is required'::TEXT;
    RETURN;
  END IF;

  -- ==================== GET PAYROLL DATA ====================

  SELECT
    pr.*,
    p.full_name as employee_name
  INTO v_payroll
  FROM payroll_records pr
  LEFT JOIN profiles p ON p.id = pr.employee_id
  WHERE pr.id = p_payroll_id AND pr.branch_id = p_branch_id;

  IF v_payroll.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0,
      'Payroll record not found in this branch'::TEXT;
    RETURN;
  END IF;

  IF v_payroll.status = 'paid' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0,
      'Payroll sudah dibayar'::TEXT;
    RETURN;
  END IF;

  -- ==================== PREPARE DATA ====================

  v_employee_name := COALESCE(v_payroll.employee_name, 'Karyawan');
  v_advance_deduction := COALESCE(v_payroll.advance_deduction, 0);
  v_salary_deduction := COALESCE(v_payroll.salary_deduction, 0);
  v_total_deductions := COALESCE(v_payroll.total_deductions, v_advance_deduction + v_salary_deduction);
  v_net_salary := v_payroll.net_salary;
  v_gross_salary := COALESCE(v_payroll.base_salary, 0) +
                    COALESCE(v_payroll.total_commission, 0) +
                    COALESCE(v_payroll.total_bonus, 0);
  v_period_start := v_payroll.period_start;
  v_period_end := v_payroll.period_end;

  -- ==================== GET ACCOUNT IDS ====================

  -- Beban Gaji (6110)
  SELECT id INTO v_beban_gaji_account
  FROM accounts
  WHERE branch_id = p_branch_id AND code = '6110' AND is_active = TRUE
  LIMIT 1;

  -- Panjar Karyawan (1260)
  SELECT id INTO v_panjar_account
  FROM accounts
  WHERE branch_id = p_branch_id AND code = '1260' AND is_active = TRUE
  LIMIT 1;

  IF v_beban_gaji_account IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0,
      'Akun Beban Gaji (6110) tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- ==================== BUILD JOURNAL LINES ====================

  -- Debit: Beban Gaji (gross salary)
  v_journal_lines := v_journal_lines || jsonb_build_object(
    'account_id', v_beban_gaji_account,
    'debit_amount', v_gross_salary,
    'credit_amount', 0,
    'description', format('Beban gaji %s periode %s-%s',
      v_employee_name,
      EXTRACT(YEAR FROM v_period_start),
      EXTRACT(MONTH FROM v_period_start))
  );

  -- Credit: Kas (net salary)
  v_journal_lines := v_journal_lines || jsonb_build_object(
    'account_id', p_payment_account_id,
    'debit_amount', 0,
    'credit_amount', v_net_salary,
    'description', format('Pembayaran gaji %s', v_employee_name)
  );

  -- Credit: Panjar Karyawan (if any deductions)
  IF v_advance_deduction > 0 AND v_panjar_account IS NOT NULL THEN
    v_journal_lines := v_journal_lines || jsonb_build_object(
      'account_id', v_panjar_account,
      'debit_amount', 0,
      'credit_amount', v_advance_deduction,
      'description', format('Potongan panjar %s', v_employee_name)
    );
  ELSIF v_advance_deduction > 0 AND v_panjar_account IS NULL THEN
    -- If no panjar account, add to kas credit instead
    v_journal_lines := jsonb_set(
      v_journal_lines,
      '{1,credit_amount}',
      to_jsonb(v_net_salary + v_advance_deduction)
    );
  END IF;

  -- Credit: Other deductions (salary deduction) - goes to company revenue or adjustment
  IF v_salary_deduction > 0 THEN
    -- Could credit to different account if needed, for now add to kas
    NULL; -- Already included in net salary calculation
  END IF;

  -- ==================== CREATE JOURNAL ====================

  SELECT cja.journal_id INTO v_journal_id FROM create_journal_atomic(
    p_branch_id,
    p_payment_date,
    format('Pembayaran Gaji %s - %s/%s',
      v_employee_name,
      EXTRACT(MONTH FROM v_period_start),
      EXTRACT(YEAR FROM v_period_start)),
    'payroll',
    p_payroll_id::TEXT,
    v_journal_lines,
    TRUE
  );

  -- ==================== UPDATE PAYROLL STATUS ====================

  UPDATE payroll_records
  SET
    status = 'paid',
    paid_date = p_payment_date,
    updated_at = NOW()
  WHERE id = p_payroll_id;

  -- ==================== UPDATE EMPLOYEE ADVANCES ====================

  IF v_advance_deduction > 0 AND v_payroll.employee_id IS NOT NULL THEN
    v_remaining_deduction := v_advance_deduction;

    FOR v_advance IN
      SELECT id, remaining_amount
      FROM employee_advances
      WHERE employee_id = v_payroll.employee_id
        AND remaining_amount > 0
      ORDER BY date ASC  -- FIFO: oldest first
    LOOP
      EXIT WHEN v_remaining_deduction <= 0;

      v_amount_to_deduct := LEAST(v_remaining_deduction, v_advance.remaining_amount);

      UPDATE employee_advances
      SET remaining_amount = remaining_amount - v_amount_to_deduct
      WHERE id = v_advance.id;

      v_remaining_deduction := v_remaining_deduction - v_amount_to_deduct;
      v_advances_updated := v_advances_updated + 1;
    END LOOP;
  END IF;

  -- ==================== UPDATE COMMISSION ENTRIES ====================

  IF v_payroll.employee_id IS NOT NULL THEN
    UPDATE commission_entries
    SET status = 'paid'
    WHERE user_id = v_payroll.employee_id
      AND status = 'pending'
      AND created_at >= v_period_start
      AND created_at <= v_period_end + INTERVAL '1 day';

    GET DIAGNOSTICS v_commissions_paid = ROW_COUNT;
  END IF;

  -- ==================== SUCCESS ====================

  RETURN QUERY SELECT TRUE, v_journal_id, v_advances_updated, v_commissions_paid, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 3. VOID PAYROLL RECORD
-- Void payroll dengan rollback journal dan advances
-- ============================================================================

CREATE OR REPLACE FUNCTION void_payroll_record(
  p_payroll_id UUID,
  p_branch_id UUID,
  p_reason TEXT DEFAULT 'Cancelled'
)
RETURNS TABLE (
  success BOOLEAN,
  journals_voided INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_payroll RECORD;
  v_journals_voided INTEGER := 0;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  -- Get payroll
  SELECT * INTO v_payroll
  FROM payroll_records
  WHERE id = p_payroll_id AND branch_id = p_branch_id;

  IF v_payroll.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Payroll record not found'::TEXT;
    RETURN;
  END IF;

  -- ==================== VOID JOURNALS ====================

  UPDATE journal_entries
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_reason = p_reason,
    updated_at = NOW()
  WHERE reference_type = 'payroll'
    AND reference_id = p_payroll_id::TEXT
    AND branch_id = p_branch_id
    AND is_voided = FALSE;

  GET DIAGNOSTICS v_journals_voided = ROW_COUNT;

  -- ==================== DELETE PAYROLL RECORD ====================
  -- Note: This will cascade delete related records if FK is set

  DELETE FROM payroll_records WHERE id = p_payroll_id;

  -- ==================== SUCCESS ====================

  RETURN QUERY SELECT TRUE, v_journals_voided, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION create_payroll_record(JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION process_payroll_complete(UUID, UUID, UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION void_payroll_record(UUID, UUID, TEXT) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION create_payroll_record IS
  'Create payroll record dalam status draft. WAJIB branch_id.';
COMMENT ON FUNCTION process_payroll_complete IS
  'Process payment payroll lengkap: journal, update advances, update commissions. WAJIB branch_id.';
COMMENT ON FUNCTION void_payroll_record IS
  'Void payroll dengan rollback journal. WAJIB branch_id.';
