-- ============================================================================
-- RPC 16: Commission Payment Atomic Functions
-- Purpose: Process commission payments with proper journal entries
-- - Pay commission: Dr. Beban Komisi, Cr. Kas/Hutang Komisi
-- ============================================================================

-- ============================================================================
-- 1. PAY COMMISSION ATOMIC
-- Pembayaran komisi karyawan dengan jurnal otomatis
-- ============================================================================

CREATE OR REPLACE FUNCTION pay_commission_atomic(
  p_employee_id UUID,
  p_branch_id UUID,
  p_amount NUMERIC,
  p_payment_date DATE DEFAULT CURRENT_DATE,
  p_payment_method TEXT DEFAULT 'cash',
  p_commission_ids UUID[] DEFAULT NULL, -- specific commission entries to pay
  p_notes TEXT DEFAULT NULL,
  p_paid_by UUID DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  payment_id UUID,
  journal_id UUID,
  commissions_paid INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_payment_id UUID;
  v_journal_id UUID;
  v_employee_name TEXT;
  v_kas_account_id UUID;
  v_beban_komisi_id UUID;
  v_entry_number TEXT;
  v_commissions_paid INTEGER := 0;
  v_total_pending NUMERIC;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_employee_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0, 'Employee ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0, 'Amount must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get employee name from profiles table (localhost uses profiles, not employees)
  SELECT full_name INTO v_employee_name FROM profiles WHERE id = p_employee_id;

  IF v_employee_name IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0, 'Karyawan tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- Check total pending commissions
  SELECT COALESCE(SUM(amount), 0) INTO v_total_pending
  FROM commission_entries
  WHERE user_id = p_employee_id
    AND branch_id = p_branch_id
    AND status = 'pending';

  IF v_total_pending < p_amount THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0,
      format('Jumlah pembayaran (%s) melebihi total komisi pending (%s)', p_amount, v_total_pending)::TEXT;
    RETURN;
  END IF;

  -- ==================== GET ACCOUNT IDS ====================

  SELECT id INTO v_kas_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1110' AND is_active = TRUE LIMIT 1;

  -- Beban Komisi (biasanya 6200 atau sesuai chart of accounts)
  SELECT id INTO v_beban_komisi_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '6200' AND is_active = TRUE LIMIT 1;

  -- Fallback: cari akun dengan nama mengandung "Komisi"
  IF v_beban_komisi_id IS NULL THEN
    SELECT id INTO v_beban_komisi_id FROM accounts
    WHERE branch_id = p_branch_id AND name ILIKE '%komisi%' AND type = 'expense' AND is_active = TRUE LIMIT 1;
  END IF;

  -- Fallback: gunakan Beban Gaji (6100)
  IF v_beban_komisi_id IS NULL THEN
    SELECT id INTO v_beban_komisi_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '6100' AND is_active = TRUE LIMIT 1;
  END IF;

  IF v_kas_account_id IS NULL OR v_beban_komisi_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0, 'Akun Kas atau Beban Komisi tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- ==================== UPDATE COMMISSION ENTRIES ====================

  v_payment_id := gen_random_uuid();

  IF p_commission_ids IS NOT NULL AND array_length(p_commission_ids, 1) > 0 THEN
    -- Pay specific commission entries
    UPDATE commission_entries
    SET
      status = 'paid',
      paid_at = NOW(),
      payment_id = v_payment_id,
      updated_at = NOW()
    WHERE id = ANY(p_commission_ids)
      AND user_id = p_employee_id
      AND branch_id = p_branch_id
      AND status = 'pending';

    GET DIAGNOSTICS v_commissions_paid = ROW_COUNT;
  ELSE
    -- Pay oldest pending commissions up to amount
    WITH to_pay AS (
      SELECT id, amount,
        SUM(amount) OVER (ORDER BY created_at) as running_total
      FROM commission_entries
      WHERE user_id = p_employee_id
        AND branch_id = p_branch_id
        AND status = 'pending'
      ORDER BY created_at
    )
    UPDATE commission_entries ce
    SET
      status = 'paid',
      paid_at = NOW(),
      payment_id = v_payment_id,
      updated_at = NOW()
    FROM to_pay tp
    WHERE ce.id = tp.id
      AND tp.running_total <= p_amount;

    GET DIAGNOSTICS v_commissions_paid = ROW_COUNT;
  END IF;

  -- ==================== INSERT PAYMENT RECORD ====================

  INSERT INTO commission_payments (
    id,
    employee_id,
    employee_name,
    branch_id,
    amount,
    payment_date,
    payment_method,
    notes,
    paid_by,
    created_at
  ) VALUES (
    v_payment_id,
    p_employee_id,
    v_employee_name,
    p_branch_id,
    p_amount,
    p_payment_date,
    p_payment_method,
    p_notes,
    p_paid_by,
    NOW()
  );

  -- ==================== CREATE JOURNAL ENTRY ====================

  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

  INSERT INTO journal_entries (
    id,
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
    gen_random_uuid(),
    p_branch_id,
    v_entry_number,
    p_payment_date,
    'Pembayaran Komisi - ' || v_employee_name,
    'commission_payment',
    v_payment_id::TEXT,
    'posted',
    FALSE,
    NOW(),
    NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Beban Komisi
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_beban_komisi_id,
    (SELECT name FROM accounts WHERE id = v_beban_komisi_id),
    p_amount, 0, 'Beban komisi ' || v_employee_name, 1
  );

  -- Cr. Kas
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_kas_account_id,
    (SELECT name FROM accounts WHERE id = v_kas_account_id),
    0, p_amount, 'Pengeluaran kas untuk komisi', 2
  );

  -- ==================== SUCCESS ====================

  RETURN QUERY SELECT TRUE, v_payment_id, v_journal_id, v_commissions_paid, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 2. GET PENDING COMMISSIONS
-- Dapatkan daftar komisi pending untuk karyawan
-- ============================================================================

CREATE OR REPLACE FUNCTION get_pending_commissions(
  p_employee_id UUID,
  p_branch_id UUID
)
RETURNS TABLE (
  commission_id UUID,
  amount NUMERIC,
  commission_type TEXT,
  product_name TEXT,
  transaction_id TEXT,
  delivery_id UUID,
  entry_date DATE,
  created_at TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ce.id,
    ce.amount,
    ce.commission_type,
    p.name,
    ce.transaction_id,
    ce.delivery_id,
    ce.entry_date,
    ce.created_at
  FROM commission_entries ce
  LEFT JOIN products p ON p.id = ce.product_id
  WHERE ce.user_id = p_employee_id
    AND ce.branch_id = p_branch_id
    AND ce.status = 'pending'
  ORDER BY ce.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 3. GET COMMISSION SUMMARY
-- Ringkasan komisi per karyawan
-- ============================================================================

CREATE OR REPLACE FUNCTION get_commission_summary(
  p_branch_id UUID,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL
)
RETURNS TABLE (
  employee_id UUID,
  employee_name TEXT,
  role TEXT,
  total_pending NUMERIC,
  total_paid NUMERIC,
  pending_count BIGINT,
  paid_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ce.user_id,
    MAX(ce.user_name),
    MAX(ce.role),
    COALESCE(SUM(CASE WHEN ce.status = 'pending' THEN ce.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN ce.status = 'paid' THEN ce.amount ELSE 0 END), 0),
    COUNT(CASE WHEN ce.status = 'pending' THEN 1 END),
    COUNT(CASE WHEN ce.status = 'paid' THEN 1 END)
  FROM commission_entries ce
  WHERE ce.branch_id = p_branch_id
    AND (p_date_from IS NULL OR ce.entry_date >= p_date_from)
    AND (p_date_to IS NULL OR ce.entry_date <= p_date_to)
  GROUP BY ce.user_id
  ORDER BY MAX(ce.user_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION pay_commission_atomic(UUID, UUID, NUMERIC, DATE, TEXT, UUID[], TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_pending_commissions(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_commission_summary(UUID, DATE, DATE) TO authenticated;


-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION pay_commission_atomic IS
  'Pay employee commission with auto journal. Dr. Beban Komisi, Cr. Kas.';
COMMENT ON FUNCTION get_pending_commissions IS
  'Get list of pending commissions for an employee.';
COMMENT ON FUNCTION get_commission_summary IS
  'Get commission summary per employee for a branch.';
