-- ============================================================
-- Fix Account ID Types in RPCs (UUID -> TEXT)
-- The accounts table uses TEXT ids (including 'acc-...' format),
-- but some RPCs were incorrectly enforcing UUID types.
-- ============================================================

-- 1. DROP OLD FUNCTIONS (to avoid signature conflict/overloading)
DROP FUNCTION IF EXISTS create_debt_journal_rpc(UUID, TEXT, DATE, NUMERIC, TEXT, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS create_manual_cash_in_journal_rpc(UUID, TEXT, DATE, NUMERIC, TEXT, UUID);
DROP FUNCTION IF EXISTS create_manual_cash_out_journal_rpc(UUID, TEXT, DATE, NUMERIC, TEXT, UUID);
DROP FUNCTION IF EXISTS create_transfer_journal_rpc(UUID, TEXT, DATE, NUMERIC, UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS create_material_payment_journal_rpc(UUID, TEXT, DATE, NUMERIC, UUID, TEXT, TEXT, UUID);

-- 2. CREATE_TRANSFER_JOURNAL_RPC
CREATE OR REPLACE FUNCTION create_transfer_journal_rpc(
  p_branch_id UUID,
  p_transfer_id TEXT,
  p_transfer_date DATE,
  p_amount NUMERIC,
  p_from_account_id TEXT,  -- Changed to TEXT
  p_to_account_id TEXT,    -- Changed to TEXT
  p_description TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_from_account RECORD;
  v_to_account RECORD;
BEGIN
  -- VALIDASI
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Amount must be greater than 0'::TEXT;
    RETURN;
  END IF;

  IF p_from_account_id IS NULL OR p_to_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'From and To accounts are required'::TEXT;
    RETURN;
  END IF;

  IF p_from_account_id = p_to_account_id THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Cannot transfer to same account'::TEXT;
    RETURN;
  END IF;

  -- GET ACCOUNT INFO
  SELECT id, code, name INTO v_from_account FROM accounts WHERE id = p_from_account_id;
  SELECT id, code, name INTO v_to_account FROM accounts WHERE id = p_to_account_id;

  IF v_from_account.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun asal tidak ditemukan: ' || p_from_account_id::TEXT;
    RETURN;
  END IF;

  IF v_to_account.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun tujuan tidak ditemukan: ' || p_to_account_id::TEXT;
    RETURN;
  END IF;

  -- GENERATE ENTRY NUMBER
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

  -- CREATE JOURNAL ENTRY
  INSERT INTO journal_entries (
    id, branch_id, entry_number, entry_date, description,
    reference_type, reference_id, status, is_voided, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_branch_id, v_entry_number, p_transfer_date,
    COALESCE(p_description, 'Transfer dari ' || v_from_account.name || ' ke ' || v_to_account.name),
    'transfer', p_transfer_id, 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Akun Tujuan (kas bertambah)
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, p_to_account_id, v_to_account.code, v_to_account.name,
    p_amount, 0, 'Transfer masuk dari ' || v_from_account.name, 1
  );

  -- Cr. Akun Asal (kas berkurang)
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, p_from_account_id, v_from_account.code, v_from_account.name,
    0, p_amount, 'Transfer keluar ke ' || v_to_account.name, 2
  );

  RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. CREATE_DEBT_JOURNAL_RPC
CREATE OR REPLACE FUNCTION create_debt_journal_rpc(
  p_branch_id UUID,
  p_debt_id TEXT,
  p_debt_date DATE,
  p_amount NUMERIC,
  p_creditor_name TEXT,
  p_creditor_type TEXT DEFAULT 'other',
  p_description TEXT DEFAULT NULL,
  p_cash_account_id TEXT DEFAULT NULL  -- Changed to TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_kas_account_id TEXT;  -- Changed to TEXT
  v_hutang_account_id TEXT; -- Changed to TEXT
  v_hutang_code TEXT;
BEGIN
  -- VALIDASI
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Amount must be greater than 0'::TEXT;
    RETURN;
  END IF;

  -- GET KAS ACCOUNT
  IF p_cash_account_id IS NOT NULL THEN
    v_kas_account_id := p_cash_account_id;
  ELSE
    SELECT id INTO v_kas_account_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '1120' AND is_active = TRUE LIMIT 1;
  END IF;

  -- GET HUTANG ACCOUNT BASED ON CREDITOR TYPE
  CASE p_creditor_type
    WHEN 'bank' THEN v_hutang_code := '2120';
    WHEN 'supplier' THEN v_hutang_code := '2110';
    ELSE v_hutang_code := '2190';
  END CASE;

  SELECT id INTO v_hutang_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = v_hutang_code AND is_active = TRUE LIMIT 1;

  IF v_hutang_account_id IS NULL THEN
    SELECT id INTO v_hutang_account_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '2110' AND is_active = TRUE LIMIT 1;
    v_hutang_code := '2110';
  END IF;

  IF v_kas_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Kas/Bank tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  IF v_hutang_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Hutang tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- GENERATE ENTRY NUMBER
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

  -- CREATE JOURNAL ENTRY
  INSERT INTO journal_entries (
    id, branch_id, entry_number, entry_date, description,
    reference_type, reference_id, status, is_voided, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_branch_id, v_entry_number, p_debt_date,
    COALESCE(p_description, 'Pinjaman dari ' || p_creditor_name),
    'payable', p_debt_id, 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Kas
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_kas_account_id,
    (SELECT code FROM accounts WHERE id = v_kas_account_id),
    (SELECT name FROM accounts WHERE id = v_kas_account_id),
    p_amount, 0, 'Penerimaan pinjaman dari ' || p_creditor_name, 1
  );

  -- Cr. Hutang
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_hutang_account_id, v_hutang_code,
    (SELECT name FROM accounts WHERE id = v_hutang_account_id),
    0, p_amount, 'Hutang kepada ' || p_creditor_name, 2
  );

  RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. CREATE_MANUAL_CASH_IN_JOURNAL_RPC
CREATE OR REPLACE FUNCTION create_manual_cash_in_journal_rpc(
  p_branch_id UUID,
  p_reference_id TEXT,
  p_transaction_date DATE,
  p_amount NUMERIC,
  p_description TEXT,
  p_cash_account_id TEXT  -- Changed to TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_pendapatan_lain_account_id TEXT;  -- Changed to TEXT
BEGIN
  IF p_branch_id IS NULL THEN RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is REQUIRED!'::TEXT; RETURN; END IF;
  IF p_amount <= 0 THEN RETURN QUERY SELECT FALSE, NULL::UUID, 'Amount must be greater than 0'::TEXT; RETURN; END IF;
  IF p_cash_account_id IS NULL THEN RETURN QUERY SELECT FALSE, NULL::UUID, 'Cash account is required'::TEXT; RETURN; END IF;

  SELECT id INTO v_pendapatan_lain_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code IN ('4200', '4900') AND is_active = TRUE ORDER BY code LIMIT 1;

  IF v_pendapatan_lain_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Pendapatan Lain-lain tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE((SELECT COUNT(*) + 1 FROM journal_entries WHERE branch_id = p_branch_id AND DATE(created_at) = CURRENT_DATE), 1))::TEXT, 4, '0')
  INTO v_entry_number;

  INSERT INTO journal_entries (
    id, branch_id, entry_number, entry_date, description,
    reference_type, reference_id, status, is_voided, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_branch_id, v_entry_number, p_transaction_date,
    'Kas Masuk: ' || p_description, 'manual', p_reference_id, 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;

  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, p_cash_account_id,
    (SELECT code FROM accounts WHERE id = p_cash_account_id),
    (SELECT name FROM accounts WHERE id = p_cash_account_id),
    p_amount, 0, 'Kas masuk - ' || p_description, 1
  );

  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_pendapatan_lain_account_id,
    (SELECT code FROM accounts WHERE id = v_pendapatan_lain_account_id),
    (SELECT name FROM accounts WHERE id = v_pendapatan_lain_account_id),
    0, p_amount, 'Pendapatan lain-lain', 2
  );

  RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 5. CREATE_MANUAL_CASH_OUT_JOURNAL_RPC
CREATE OR REPLACE FUNCTION create_manual_cash_out_journal_rpc(
  p_branch_id UUID,
  p_reference_id TEXT,
  p_transaction_date DATE,
  p_amount NUMERIC,
  p_description TEXT,
  p_cash_account_id TEXT  -- Changed to TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_beban_lain_account_id TEXT;  -- Changed to TEXT
BEGIN
  IF p_branch_id IS NULL THEN RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is REQUIRED!'::TEXT; RETURN; END IF;
  IF p_amount <= 0 THEN RETURN QUERY SELECT FALSE, NULL::UUID, 'Amount must be greater than 0'::TEXT; RETURN; END IF;
  IF p_cash_account_id IS NULL THEN RETURN QUERY SELECT FALSE, NULL::UUID, 'Cash account is required'::TEXT; RETURN; END IF;

  SELECT id INTO v_beban_lain_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code IN ('8100', '6900') AND is_active = TRUE ORDER BY code LIMIT 1;

  IF v_beban_lain_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Beban Lain-lain tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE((SELECT COUNT(*) + 1 FROM journal_entries WHERE branch_id = p_branch_id AND DATE(created_at) = CURRENT_DATE), 1))::TEXT, 4, '0')
  INTO v_entry_number;

  INSERT INTO journal_entries (
    id, branch_id, entry_number, entry_date, description,
    reference_type, reference_id, status, is_voided, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_branch_id, v_entry_number, p_transaction_date,
    'Kas Keluar: ' || p_description, 'manual', p_reference_id, 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;

  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_beban_lain_account_id,
    (SELECT code FROM accounts WHERE id = v_beban_lain_account_id),
    (SELECT name FROM accounts WHERE id = v_beban_lain_account_id),
    p_amount, 0, 'Beban lain-lain - ' || p_description, 1
  );

  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, p_cash_account_id,
    (SELECT code FROM accounts WHERE id = p_cash_account_id),
    (SELECT name FROM accounts WHERE id = p_cash_account_id),
    0, p_amount, 'Kas keluar - ' || p_description, 2
  );

  RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. CREATE_MATERIAL_PAYMENT_JOURNAL_RPC
CREATE OR REPLACE FUNCTION create_material_payment_journal_rpc(
  p_branch_id UUID,
  p_reference_id TEXT,
  p_transaction_date DATE,
  p_amount NUMERIC,
  p_material_id UUID,
  p_material_name TEXT,
  p_description TEXT,
  p_cash_account_id TEXT  -- Changed to TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_beban_bahan_account_id TEXT;  -- Changed to TEXT
BEGIN
  IF p_branch_id IS NULL THEN RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is REQUIRED!'::TEXT; RETURN; END IF;
  IF p_amount <= 0 THEN RETURN QUERY SELECT FALSE, NULL::UUID, 'Amount must be greater than 0'::TEXT; RETURN; END IF;
  IF p_cash_account_id IS NULL THEN RETURN QUERY SELECT FALSE, NULL::UUID, 'Cash account is required'::TEXT; RETURN; END IF;

  SELECT id INTO v_beban_bahan_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code IN ('5300', '6300', '6310') AND is_active = TRUE ORDER BY code LIMIT 1;

  IF v_beban_bahan_account_id IS NULL THEN
    SELECT id INTO v_beban_bahan_account_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '6100' AND is_active = TRUE LIMIT 1;
  END IF;

  IF v_beban_bahan_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Beban Bahan Baku tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE((SELECT COUNT(*) + 1 FROM journal_entries WHERE branch_id = p_branch_id AND DATE(created_at) = CURRENT_DATE), 1))::TEXT, 4, '0')
  INTO v_entry_number;

  INSERT INTO journal_entries (
    id, branch_id, entry_number, entry_date, description,
    reference_type, reference_id, status, is_voided, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_branch_id, v_entry_number, p_transaction_date,
    COALESCE(p_description, 'Pembayaran bahan - ' || p_material_name),
    'expense', p_reference_id, 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;

  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_beban_bahan_account_id,
    (SELECT code FROM accounts WHERE id = v_beban_bahan_account_id),
    (SELECT name FROM accounts WHERE id = v_beban_bahan_account_id),
    p_amount, 0, 'Beban bahan - ' || p_material_name, 1
  );

  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, p_cash_account_id,
    (SELECT code FROM accounts WHERE id = p_cash_account_id),
    (SELECT name FROM accounts WHERE id = p_cash_account_id),
    0, p_amount, 'Pembayaran bahan ' || p_material_name, 2
  );

  RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Fix create_journal_atomic (remove UUID cast)
CREATE OR REPLACE FUNCTION create_journal_atomic(
  p_entry_date TIMESTAMP,
  p_description TEXT,
  p_reference_type TEXT,
  p_branch_id UUID,
  p_lines JSONB,
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
  IF p_branch_id IS NULL THEN RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Branch ID is required'::TEXT; RETURN; END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Journal lines are required'::TEXT; RETURN; END IF;

  FOR v_line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
    account_id TEXT,
    debit_amount NUMERIC,
    credit_amount NUMERIC
  ) LOOP
    v_total_debit := v_total_debit + COALESCE(v_line.debit_amount, 0);
    v_total_credit := v_total_credit + COALESCE(v_line.credit_amount, 0);
  END LOOP;

  IF ABS(v_total_debit - v_total_credit) > 0.01 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, format('Journal not balanced: Debit %s, Credit %s', v_total_debit, v_total_credit)::TEXT;
    RETURN;
  END IF;

  DECLARE
    v_period_closed BOOLEAN;
  BEGIN
    SELECT EXISTS(SELECT 1 FROM closing_periods WHERE branch_id = p_branch_id AND year = EXTRACT(YEAR FROM p_entry_date)) INTO v_period_closed;
    IF v_period_closed THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, format('Period %s is closed', EXTRACT(YEAR FROM p_entry_date))::TEXT;
      RETURN;
    END IF;
  END;

  v_entry_number := 'JE-' || TO_CHAR(p_entry_date, 'YYYYMMDD') || '-' ||
    LPAD((SELECT COUNT(*) + 1 FROM journal_entries WHERE branch_id = p_branch_id AND DATE(created_at) = DATE(p_entry_date))::TEXT, 4, '0') ||
    LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0');

  INSERT INTO journal_entries (
    entry_number, entry_date, description, reference_type, reference_id, branch_id, status, total_debit, total_credit
  ) VALUES (
    v_entry_number, p_entry_date, p_description, p_reference_type, p_reference_id, p_branch_id, 'draft', v_total_debit, v_total_credit
  ) RETURNING id INTO v_journal_id;

  v_line_number := 0;
  FOR v_line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
    account_id TEXT,
    account_code TEXT,
    debit_amount NUMERIC,
    credit_amount NUMERIC,
    description TEXT
  ) LOOP
    v_line_number := v_line_number + 1;
    INSERT INTO journal_entry_lines (
      journal_entry_id, line_number, account_id, description, debit_amount, credit_amount
    ) VALUES (
      v_journal_id,
      v_line_number,
      CASE
        WHEN v_line.account_id IS NOT NULL THEN v_line.account_id  -- REMOVED CONST::UUID casting
        ELSE (SELECT id FROM accounts WHERE code = v_line.account_code AND branch_id = p_branch_id LIMIT 1)
      END,
      v_line.description,
      COALESCE(v_line.debit_amount, 0),
      COALESCE(v_line.credit_amount, 0)
    );
  END LOOP;

  IF p_auto_post THEN
    UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
  END IF;

  RETURN QUERY SELECT TRUE, v_journal_id, v_entry_number, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql;

-- GRANTS
GRANT EXECUTE ON FUNCTION create_debt_journal_rpc(UUID, TEXT, DATE, NUMERIC, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_manual_cash_in_journal_rpc(UUID, TEXT, DATE, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_manual_cash_out_journal_rpc(UUID, TEXT, DATE, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_transfer_journal_rpc(UUID, TEXT, DATE, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_material_payment_journal_rpc(UUID, TEXT, DATE, NUMERIC, UUID, TEXT, TEXT, TEXT) TO authenticated;
