-- ============================================================================
-- RPC 18: Payroll Management Atomic
-- Purpose: Update payroll record dan penyesuaian jurnal secara atomik
-- ============================================================================

CREATE OR REPLACE FUNCTION update_payroll_record_atomic(
  p_payroll_id UUID,
  p_branch_id UUID,
  p_base_salary NUMERIC,
  p_commission NUMERIC,
  p_bonus NUMERIC,
  p_advance_deduction NUMERIC,
  p_salary_deduction NUMERIC,
  p_notes TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  net_salary NUMERIC,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_old_record RECORD;
  v_new_net_salary NUMERIC;
  v_new_gross_salary NUMERIC;
  v_new_total_deductions NUMERIC;
  v_journal_id UUID;
  v_beban_gaji_account UUID;
  v_panjar_account UUID;
  v_payment_account_id UUID;
  v_journal_lines JSONB := '[]'::JSONB;
BEGIN
  -- 1. Get Old Record
  SELECT * INTO v_old_record FROM payroll_records 
  WHERE id = p_payroll_id AND branch_id = p_branch_id;
  
  IF v_old_record.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, NULL::UUID, 'Data gaji tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- 2. Calculate New Amounts
  v_new_gross_salary := COALESCE(p_base_salary, v_old_record.base_salary) + 
                        COALESCE(p_commission, v_old_record.total_commission) + 
                        COALESCE(p_bonus, v_old_record.total_bonus);
  
  v_new_total_deductions := COALESCE(p_advance_deduction, v_old_record.advance_deduction) + 
                           COALESCE(p_salary_deduction, v_old_record.salary_deduction);
  
  v_new_net_salary := v_new_gross_salary - v_new_total_deductions;

  -- 3. Update Record
  UPDATE payroll_records
  SET
    base_salary = COALESCE(p_base_salary, base_salary),
    total_commission = COALESCE(p_commission, total_commission),
    total_bonus = COALESCE(p_bonus, total_bonus),
    advance_deduction = COALESCE(p_advance_deduction, advance_deduction),
    salary_deduction = COALESCE(p_salary_deduction, salary_deduction),
    total_deductions = v_new_total_deductions,
    net_salary = v_new_net_salary,
    notes = COALESCE(p_notes, notes),
    updated_at = NOW()
  WHERE id = p_payroll_id;

  -- 4. Handle Journal Update if Status is 'paid'
  IF v_old_record.status = 'paid' THEN
    -- Find existing journal
    SELECT id INTO v_journal_id FROM journal_entries 
    WHERE reference_id = p_payroll_id::TEXT AND reference_type = 'payroll' AND branch_id = p_branch_id
    ORDER BY created_at DESC LIMIT 1;

    IF v_journal_id IS NOT NULL THEN
      -- Get Accounts
      SELECT id INTO v_beban_gaji_account FROM accounts WHERE branch_id = p_branch_id AND code = '6110' LIMIT 1;
      SELECT id INTO v_panjar_account FROM accounts WHERE branch_id = p_branch_id AND code = '1260' LIMIT 1;
      v_payment_account_id := v_old_record.payment_account_id;

      -- Debit: Beban Gaji (gross)
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_id', v_beban_gaji_account,
        'debit_amount', v_new_gross_salary,
        'credit_amount', 0,
        'description', 'Beban gaji (updated)'
      );

      -- Credit: Kas (net)
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_id', v_payment_account_id,
        'debit_amount', 0,
        'credit_amount', v_new_net_salary,
        'description', 'Pembayaran gaji (updated)'
      );

      -- Credit: Panjar (deductions)
      IF COALESCE(p_advance_deduction, v_old_record.advance_deduction) > 0 AND v_panjar_account IS NOT NULL THEN
        v_journal_lines := v_journal_lines || jsonb_build_object(
          'account_id', v_panjar_account,
          'debit_amount', 0,
          'credit_amount', COALESCE(p_advance_deduction, v_old_record.advance_deduction),
          'description', 'Potongan panjar (updated)'
        );
      END IF;

      -- Delete old lines and insert new ones
      DELETE FROM journal_entry_lines WHERE journal_entry_id = v_journal_id;
      
      INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
      SELECT v_journal_id, row_number() OVER (), (line->>'account_id')::UUID, line->>'description', (line->>'debit_amount')::NUMERIC, (line->>'credit_amount')::NUMERIC
      FROM jsonb_array_elements(v_journal_lines) AS line;

      -- Update header totals
      UPDATE journal_entries 
      SET total_debit = v_new_gross_salary, 
          total_credit = v_new_gross_salary,
          updated_at = NOW()
      WHERE id = v_journal_id;
    END IF;
  END IF;

  RETURN QUERY SELECT TRUE, v_new_net_salary, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0::NUMERIC, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- GRANT
GRANT EXECUTE ON FUNCTION update_payroll_record_atomic(UUID, UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT) TO authenticated;
