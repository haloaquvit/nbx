-- Drop existing functions generically to avoid ambiguity
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Drop create_employee_advance_atomic
  FOR r IN SELECT oid::regprocedure AS func_signature
           FROM pg_proc
           WHERE proname = 'create_employee_advance_atomic'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE';
  END LOOP;

  -- Drop repay_employee_advance_atomic
  FOR r IN SELECT oid::regprocedure AS func_signature
           FROM pg_proc
           WHERE proname = 'repay_employee_advance_atomic'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE';
  END LOOP;

  -- Drop void_employee_advance_atomic
  FOR r IN SELECT oid::regprocedure AS func_signature
           FROM pg_proc
           WHERE proname = 'void_employee_advance_atomic'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE';
  END LOOP;
END $$;

-- ============================================================================
-- 1. CREATE EMPLOYEE ADVANCE ATOMIC
-- Kasbon karyawan dengan jurnal otomatis
-- ============================================================================

CREATE OR REPLACE FUNCTION create_employee_advance_atomic(
  p_advance JSONB,
  p_branch_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  advance_id UUID,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_advance_id UUID;
  v_journal_id UUID;
  v_employee_id UUID;
  v_employee_name TEXT;
  v_amount NUMERIC;
  v_advance_date DATE;
  v_reason TEXT;
  v_payment_account_id TEXT;

  v_kas_account_id TEXT;
  v_piutang_karyawan_id TEXT;
  v_entry_number TEXT;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  -- Permission check
  IF auth.uid() IS NOT NULL THEN
    IF NOT check_user_permission(auth.uid(), 'advances_manage') THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Tidak memiliki akses untuk membuat kasbon'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- ==================== PARSE DATA ====================

  v_advance_id := COALESCE((p_advance->>'id')::UUID, gen_random_uuid());
  v_employee_id := (p_advance->>'employee_id')::UUID;
  v_employee_name := p_advance->>'employee_name';
  v_amount := COALESCE((p_advance->>'amount')::NUMERIC, 0);
  v_advance_date := COALESCE((p_advance->>'advance_date')::DATE, CURRENT_DATE);
  v_reason := COALESCE(p_advance->>'reason', 'Kasbon karyawan');
  v_payment_account_id := (p_advance->>'payment_account_id'); -- No cast to UUID, it's TEXT

  IF v_employee_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Employee ID is required'::TEXT;
    RETURN;
  END IF;

  IF v_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Amount must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get employee name if not provided (localhost uses profiles, not employees)
  IF v_employee_name IS NULL THEN
    SELECT full_name INTO v_employee_name FROM profiles WHERE id = v_employee_id;
  END IF;

  -- ==================== GET ACCOUNT IDS ====================

  -- Kas account
  IF v_payment_account_id IS NOT NULL THEN
    v_kas_account_id := v_payment_account_id;
  ELSE
    SELECT id INTO v_kas_account_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '1110' AND is_active = TRUE LIMIT 1;
  END IF;

  -- Piutang Karyawan (1230 atau sesuai chart of accounts)
  SELECT id INTO v_piutang_karyawan_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1230' AND is_active = TRUE LIMIT 1;

  -- Fallback: cari akun dengan nama mengandung "Piutang Karyawan"
  IF v_piutang_karyawan_id IS NULL THEN
    SELECT id INTO v_piutang_karyawan_id FROM accounts
    WHERE branch_id = p_branch_id AND name ILIKE '%piutang karyawan%' AND is_active = TRUE LIMIT 1;
  END IF;

  IF v_kas_account_id IS NULL OR v_piutang_karyawan_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Akun Kas atau Piutang Karyawan tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- ==================== INSERT ADVANCE RECORD ====================

  INSERT INTO employee_advances (
    id,
    branch_id,
    employee_id,
    employee_name,
    amount,
    remaining_amount,
    date,      -- Correct column name
    notes,     -- Map reason to notes
    status,
    created_at, -- No created_by column in schema output, let's omit or check if it exists differently? schema said no created_by
    account_id  -- Map payment account
  ) VALUES (
    v_advance_id::TEXT, -- Cast to TEXT as ID in table is TEXT
    p_branch_id,
    v_employee_id,
    v_employee_name,
    v_amount,
    v_amount, 
    v_advance_date,
    v_reason,
    'active',
    NOW(),
    v_payment_account_id
  );

  -- ==================== CREATE JOURNAL ENTRY ====================

  -- Generate entry number
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

  -- Create journal header
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
    v_advance_date,
    'Kasbon Karyawan - ' || v_employee_name || ' - ' || v_reason,
    'advance',
    v_advance_id::TEXT,
    'posted',
    FALSE,
    NOW(),
    NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Piutang Karyawan
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_piutang_karyawan_id,
    (SELECT name FROM accounts WHERE id = v_piutang_karyawan_id),
    v_amount, 0, 'Kasbon ' || v_employee_name, 1
  );

  -- Cr. Kas
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_kas_account_id,
    (SELECT name FROM accounts WHERE id = v_kas_account_id),
    0, v_amount, 'Pengeluaran kas untuk kasbon', 2
  );

  -- ==================== SUCCESS ====================

  RETURN QUERY SELECT TRUE, v_advance_id, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 2. REPAY EMPLOYEE ADVANCE ATOMIC
-- Pembayaran/cicilan kasbon dengan jurnal otomatis
-- ============================================================================

CREATE OR REPLACE FUNCTION repay_employee_advance_atomic(
  p_advance_id UUID,
  p_branch_id UUID,
  p_amount NUMERIC,
  p_payment_date DATE DEFAULT CURRENT_DATE,
  p_payment_method TEXT DEFAULT 'cash',
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  payment_id UUID,
  journal_id UUID,
  remaining_amount NUMERIC,
  is_fully_paid BOOLEAN,
  error_message TEXT
) AS $$
DECLARE
  v_advance RECORD;
  v_payment_id UUID;
  v_journal_id UUID;
  v_kas_account_id TEXT;
  v_piutang_karyawan_id TEXT;
  v_entry_number TEXT;
  v_new_remaining NUMERIC;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, FALSE, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, FALSE, 'Amount must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get advance record
  SELECT * INTO v_advance
  FROM employee_advances
  WHERE id = p_advance_id AND branch_id = p_branch_id
  FOR UPDATE;

  IF v_advance.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, FALSE, 'Kasbon tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  IF v_advance.status = 'paid' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, FALSE, 'Kasbon sudah lunas'::TEXT;
    RETURN;
  END IF;

  IF p_amount > v_advance.remaining_amount THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, FALSE,
      format('Jumlah pembayaran (%s) melebihi sisa kasbon (%s)', p_amount, v_advance.remaining_amount)::TEXT;
    RETURN;
  END IF;

  -- ==================== GET ACCOUNT IDS ====================

  SELECT id INTO v_kas_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1110' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_piutang_karyawan_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1230' AND is_active = TRUE LIMIT 1;

  IF v_piutang_karyawan_id IS NULL THEN
    SELECT id INTO v_piutang_karyawan_id FROM accounts
    WHERE branch_id = p_branch_id AND name ILIKE '%piutang karyawan%' AND is_active = TRUE LIMIT 1;
  END IF;

  -- ==================== CALCULATE NEW REMAINING ====================

  v_new_remaining := v_advance.remaining_amount - p_amount;
  v_payment_id := gen_random_uuid();

  -- ==================== UPDATE ADVANCE RECORD ====================

  UPDATE employee_advances
  SET
    remaining_amount = v_new_remaining,
    status = CASE WHEN v_new_remaining <= 0 THEN 'paid' ELSE 'active' END,
    updated_at = NOW()
  WHERE id = p_advance_id;

  -- ==================== INSERT PAYMENT RECORD ====================

  INSERT INTO employee_advance_payments (
    id,
    advance_id,
    branch_id,
    amount,
    payment_date,
    payment_method,
    notes,
    created_by,
    created_at
  ) VALUES (
    v_payment_id,
    p_advance_id,
    p_branch_id,
    p_amount,
    p_payment_date,
    p_payment_method,
    p_notes,
    auth.uid(),
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
    'Pembayaran Kasbon - ' || v_advance.employee_name,
    'advance_payment',
    v_payment_id::TEXT,
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
    p_amount, 0, 'Penerimaan pembayaran kasbon', 1
  );

  -- Cr. Piutang Karyawan
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_piutang_karyawan_id,
    (SELECT name FROM accounts WHERE id = v_piutang_karyawan_id),
    0, p_amount, 'Pelunasan piutang karyawan', 2
  );

  -- ==================== SUCCESS ====================

  RETURN QUERY SELECT TRUE, v_payment_id, v_journal_id, v_new_remaining, (v_new_remaining <= 0), NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, FALSE, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 3. VOID EMPLOYEE ADVANCE ATOMIC
-- Batalkan kasbon dengan rollback jurnal
-- ============================================================================

CREATE OR REPLACE FUNCTION void_employee_advance_atomic(
  p_advance_id UUID,
  p_branch_id UUID,
  p_reason TEXT DEFAULT 'Dibatalkan'
)
RETURNS TABLE (
  success BOOLEAN,
  journals_voided INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_advance RECORD;
  v_journals_voided INTEGER := 0;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  -- Get advance
  SELECT * INTO v_advance
  FROM employee_advances
  WHERE id = p_advance_id::TEXT AND branch_id = p_branch_id
  FOR UPDATE;

  IF v_advance.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Kasbon tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- Cannot void if there are payments
  IF v_advance.remaining_amount < v_advance.amount THEN
    RETURN QUERY SELECT FALSE, 0, 'Tidak bisa membatalkan kasbon yang sudah ada pembayaran'::TEXT;
    RETURN;
  END IF;

  -- ==================== VOID JOURNALS ====================

  UPDATE journal_entries
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_reason = p_reason,
    status = 'voided',
    updated_at = NOW()
  WHERE reference_type = 'advance'
    AND reference_id = p_advance_id::TEXT
    AND branch_id = p_branch_id
    AND is_voided = FALSE;

  GET DIAGNOSTICS v_journals_voided = ROW_COUNT;

  -- ==================== UPDATE ADVANCE STATUS ====================

  UPDATE employee_advances
  SET
    status = 'cancelled'
    -- updated_at doesn't exist in schema, removing it
  WHERE id = p_advance_id::TEXT;

  -- ==================== SUCCESS ====================

  RETURN QUERY SELECT TRUE, v_journals_voided, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION create_employee_advance_atomic(JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION repay_employee_advance_atomic(UUID, UUID, NUMERIC, DATE, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION void_employee_advance_atomic(UUID, UUID, TEXT) TO authenticated;


-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION create_employee_advance_atomic IS
  'Create employee advance (kasbon) with auto journal. Dr. Piutang Karyawan, Cr. Kas.';
COMMENT ON FUNCTION repay_employee_advance_atomic IS
  'Repay employee advance with auto journal. Dr. Kas, Cr. Piutang Karyawan.';
COMMENT ON FUNCTION void_employee_advance_atomic IS
  'Void employee advance and related journals. Only if no payments made.';
