-- ============================================================================
-- RPC 19: Legacy Journal Functions (Migration from journalService.ts)
-- Purpose: RPC replacements for legacy frontend journal functions
-- All functions create proper double-entry journal entries
-- ============================================================================

-- ============================================================================
-- 1. CREATE MIGRATION RECEIVABLE JOURNAL RPC
-- Jurnal migrasi piutang: Dr. Piutang Usaha, Cr. Saldo Awal
-- ============================================================================

CREATE OR REPLACE FUNCTION create_migration_receivable_journal_rpc(
  p_branch_id UUID,
  p_receivable_id TEXT,
  p_receivable_date DATE,
  p_amount NUMERIC,
  p_customer_name TEXT,
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
  v_piutang_account_id UUID;
  v_saldo_awal_account_id UUID;
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

  -- GET ACCOUNT IDS
  SELECT id INTO v_piutang_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1210' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_saldo_awal_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '3100' AND is_active = TRUE LIMIT 1;

  IF v_piutang_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Piutang Usaha (1210) tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  IF v_saldo_awal_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Saldo Awal (3100) tidak ditemukan'::TEXT;
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
    gen_random_uuid(), p_branch_id, v_entry_number, p_receivable_date,
    COALESCE(p_description, 'Piutang Migrasi - ' || p_customer_name),
    'receivable', p_receivable_id, 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Piutang Usaha
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_piutang_account_id, '1210',
    (SELECT name FROM accounts WHERE id = v_piutang_account_id),
    p_amount, 0, 'Piutang migrasi - ' || p_customer_name, 1
  );

  -- Cr. Saldo Awal
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_saldo_awal_account_id, '3100',
    (SELECT name FROM accounts WHERE id = v_saldo_awal_account_id),
    0, p_amount, 'Saldo awal piutang migrasi', 2
  );

  RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 2. CREATE DEBT JOURNAL RPC (PINJAMAN BARU - KAS BERTAMBAH)
-- Jurnal hutang baru: Dr. Kas, Cr. Hutang
-- ============================================================================

CREATE OR REPLACE FUNCTION create_debt_journal_rpc(
  p_branch_id UUID,
  p_debt_id TEXT,
  p_debt_date DATE,
  p_amount NUMERIC,
  p_creditor_name TEXT,
  p_creditor_type TEXT DEFAULT 'other',
  p_description TEXT DEFAULT NULL,
  p_cash_account_id UUID DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_kas_account_id UUID;
  v_hutang_account_id UUID;
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

  -- GET KAS ACCOUNT (use provided or default 1120 Bank)
  IF p_cash_account_id IS NOT NULL THEN
    v_kas_account_id := p_cash_account_id;
  ELSE
    SELECT id INTO v_kas_account_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '1120' AND is_active = TRUE LIMIT 1;
  END IF;

  -- GET HUTANG ACCOUNT BASED ON CREDITOR TYPE
  CASE p_creditor_type
    WHEN 'bank' THEN v_hutang_code := '2120'; -- Hutang Bank
    WHEN 'supplier' THEN v_hutang_code := '2110'; -- Hutang Usaha
    ELSE v_hutang_code := '2190'; -- Hutang Lain-lain
  END CASE;

  SELECT id INTO v_hutang_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = v_hutang_code AND is_active = TRUE LIMIT 1;

  IF v_hutang_account_id IS NULL THEN
    -- Fallback to 2110
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

  -- Dr. Kas (kas bertambah karena pinjaman)
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


-- ============================================================================
-- 3. CREATE MIGRATION DEBT JOURNAL RPC (MIGRASI HUTANG - TANPA KAS)
-- Jurnal migrasi hutang: Dr. Saldo Awal, Cr. Hutang
-- ============================================================================

CREATE OR REPLACE FUNCTION create_migration_debt_journal_rpc(
  p_branch_id UUID,
  p_debt_id TEXT,
  p_debt_date DATE,
  p_amount NUMERIC,
  p_creditor_name TEXT,
  p_creditor_type TEXT DEFAULT 'other',
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
  v_saldo_awal_account_id UUID;
  v_hutang_account_id UUID;
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

  -- GET SALDO AWAL ACCOUNT
  SELECT id INTO v_saldo_awal_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '3100' AND is_active = TRUE LIMIT 1;

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

  IF v_saldo_awal_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Saldo Awal (3100) tidak ditemukan'::TEXT;
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
    COALESCE(p_description, 'Migrasi hutang dari ' || p_creditor_name),
    'payable', p_debt_id, 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Saldo Awal (penyeimbang)
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_saldo_awal_account_id, '3100',
    (SELECT name FROM accounts WHERE id = v_saldo_awal_account_id),
    p_amount, 0, 'Saldo awal hutang migrasi', 1
  );

  -- Cr. Hutang
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_hutang_account_id, v_hutang_code,
    (SELECT name FROM accounts WHERE id = v_hutang_account_id),
    0, p_amount, 'Hutang migrasi - ' || p_creditor_name, 2
  );

  RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 4. CREATE MANUAL CASH IN JOURNAL RPC
-- Kas Masuk Manual: Dr. Kas, Cr. Pendapatan Lain-lain
-- ============================================================================

CREATE OR REPLACE FUNCTION create_manual_cash_in_journal_rpc(
  p_branch_id UUID,
  p_reference_id TEXT,
  p_transaction_date DATE,
  p_amount NUMERIC,
  p_description TEXT,
  p_cash_account_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_pendapatan_lain_account_id UUID;
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

  IF p_cash_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Cash account is required'::TEXT;
    RETURN;
  END IF;

  -- GET PENDAPATAN LAIN-LAIN ACCOUNT (4200 or 4900)
  SELECT id INTO v_pendapatan_lain_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code IN ('4200', '4900') AND is_active = TRUE
  ORDER BY code LIMIT 1;

  IF v_pendapatan_lain_account_id IS NULL THEN
    -- Create if not exists
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Pendapatan Lain-lain tidak ditemukan'::TEXT;
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
    gen_random_uuid(), p_branch_id, v_entry_number, p_transaction_date,
    'Kas Masuk: ' || p_description,
    'manual', p_reference_id, 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Kas
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, p_cash_account_id,
    (SELECT code FROM accounts WHERE id = p_cash_account_id),
    (SELECT name FROM accounts WHERE id = p_cash_account_id),
    p_amount, 0, 'Kas masuk - ' || p_description, 1
  );

  -- Cr. Pendapatan Lain-lain
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


-- ============================================================================
-- 5. CREATE MANUAL CASH OUT JOURNAL RPC
-- Kas Keluar Manual: Dr. Beban Lain-lain, Cr. Kas
-- ============================================================================

CREATE OR REPLACE FUNCTION create_manual_cash_out_journal_rpc(
  p_branch_id UUID,
  p_reference_id TEXT,
  p_transaction_date DATE,
  p_amount NUMERIC,
  p_description TEXT,
  p_cash_account_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_beban_lain_account_id UUID;
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

  IF p_cash_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Cash account is required'::TEXT;
    RETURN;
  END IF;

  -- GET BEBAN LAIN-LAIN ACCOUNT (8100 or 6900)
  SELECT id INTO v_beban_lain_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code IN ('8100', '6900') AND is_active = TRUE
  ORDER BY code LIMIT 1;

  IF v_beban_lain_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Beban Lain-lain tidak ditemukan'::TEXT;
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
    gen_random_uuid(), p_branch_id, v_entry_number, p_transaction_date,
    'Kas Keluar: ' || p_description,
    'manual', p_reference_id, 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Beban Lain-lain
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_beban_lain_account_id,
    (SELECT code FROM accounts WHERE id = v_beban_lain_account_id),
    (SELECT name FROM accounts WHERE id = v_beban_lain_account_id),
    p_amount, 0, 'Beban lain-lain - ' || p_description, 1
  );

  -- Cr. Kas
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


-- ============================================================================
-- 6. CREATE TRANSFER JOURNAL RPC
-- Transfer antar kas: Dr. Akun Tujuan, Cr. Akun Asal
-- ============================================================================

CREATE OR REPLACE FUNCTION create_transfer_journal_rpc(
  p_branch_id UUID,
  p_transfer_id TEXT,
  p_transfer_date DATE,
  p_amount NUMERIC,
  p_from_account_id UUID,
  p_to_account_id UUID,
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
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun asal tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  IF v_to_account.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun tujuan tidak ditemukan'::TEXT;
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


-- ============================================================================
-- 7. CREATE MATERIAL PAYMENT JOURNAL RPC
-- Pembayaran tagihan bahan: Dr. Beban Bahan, Cr. Kas
-- ============================================================================

CREATE OR REPLACE FUNCTION create_material_payment_journal_rpc(
  p_branch_id UUID,
  p_reference_id TEXT,
  p_transaction_date DATE,
  p_amount NUMERIC,
  p_material_id UUID,
  p_material_name TEXT,
  p_description TEXT,
  p_cash_account_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_beban_bahan_account_id UUID;
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

  IF p_cash_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Cash account is required'::TEXT;
    RETURN;
  END IF;

  -- GET BEBAN BAHAN BAKU ACCOUNT (5300 or 6300)
  SELECT id INTO v_beban_bahan_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code IN ('5300', '6300', '6310') AND is_active = TRUE
  ORDER BY code LIMIT 1;

  IF v_beban_bahan_account_id IS NULL THEN
    -- Fallback to generic expense
    SELECT id INTO v_beban_bahan_account_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '6100' AND is_active = TRUE LIMIT 1;
  END IF;

  IF v_beban_bahan_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Beban Bahan Baku tidak ditemukan'::TEXT;
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
    gen_random_uuid(), p_branch_id, v_entry_number, p_transaction_date,
    COALESCE(p_description, 'Pembayaran bahan - ' || p_material_name),
    'expense', p_reference_id, 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Beban Bahan Baku
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_beban_bahan_account_id,
    (SELECT code FROM accounts WHERE id = v_beban_bahan_account_id),
    (SELECT name FROM accounts WHERE id = v_beban_bahan_account_id),
    p_amount, 0, 'Beban bahan - ' || p_material_name, 1
  );

  -- Cr. Kas
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


-- ============================================================================
-- 8. CREATE INVENTORY OPENING BALANCE JOURNAL RPC
-- Jurnal saldo awal persediaan: Dr. Persediaan, Cr. Laba Ditahan
-- ============================================================================

CREATE OR REPLACE FUNCTION create_inventory_opening_balance_journal_rpc(
  p_branch_id UUID,
  p_products_value NUMERIC DEFAULT 0,
  p_materials_value NUMERIC DEFAULT 0,
  p_opening_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_persediaan_barang_id UUID;
  v_persediaan_bahan_id UUID;
  v_laba_ditahan_id UUID;
  v_total_amount NUMERIC;
  v_line_number INTEGER := 1;
BEGIN
  -- VALIDASI
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  v_total_amount := COALESCE(p_products_value, 0) + COALESCE(p_materials_value, 0);

  IF v_total_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Total value must be greater than 0'::TEXT;
    RETURN;
  END IF;

  -- GET ACCOUNT IDS
  SELECT id INTO v_persediaan_barang_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1310' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_persediaan_bahan_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1320' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_laba_ditahan_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '3200' AND is_active = TRUE LIMIT 1;

  IF v_laba_ditahan_id IS NULL THEN
    -- Fallback to Modal Disetor
    SELECT id INTO v_laba_ditahan_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '3100' AND is_active = TRUE LIMIT 1;
  END IF;

  IF v_laba_ditahan_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Laba Ditahan/Modal tidak ditemukan'::TEXT;
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
    gen_random_uuid(), p_branch_id, v_entry_number, p_opening_date,
    'Saldo Awal Persediaan',
    'opening', 'INVENTORY-OPENING', 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Persediaan Barang Dagang (if > 0)
  IF p_products_value > 0 AND v_persediaan_barang_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, account_code, account_name,
      debit_amount, credit_amount, description, line_number
    ) VALUES (
      v_journal_id, v_persediaan_barang_id, '1310',
      (SELECT name FROM accounts WHERE id = v_persediaan_barang_id),
      p_products_value, 0, 'Saldo awal persediaan barang dagang', v_line_number
    );
    v_line_number := v_line_number + 1;
  END IF;

  -- Dr. Persediaan Bahan Baku (if > 0)
  IF p_materials_value > 0 AND v_persediaan_bahan_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, account_code, account_name,
      debit_amount, credit_amount, description, line_number
    ) VALUES (
      v_journal_id, v_persediaan_bahan_id, '1320',
      (SELECT name FROM accounts WHERE id = v_persediaan_bahan_id),
      p_materials_value, 0, 'Saldo awal persediaan bahan baku', v_line_number
    );
    v_line_number := v_line_number + 1;
  END IF;

  -- Cr. Laba Ditahan (penyeimbang)
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_laba_ditahan_id,
    (SELECT code FROM accounts WHERE id = v_laba_ditahan_id),
    (SELECT name FROM accounts WHERE id = v_laba_ditahan_id),
    0, v_total_amount, 'Penyeimbang saldo awal persediaan', v_line_number
  );

  RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 9. CREATE ALL OPENING BALANCE JOURNAL RPC
-- Jurnal saldo awal untuk semua akun dengan initial_balance
-- ============================================================================

CREATE OR REPLACE FUNCTION create_all_opening_balance_journal_rpc(
  p_branch_id UUID,
  p_opening_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  accounts_processed INTEGER,
  total_debit NUMERIC,
  error_message TEXT
) AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_laba_ditahan_id UUID;
  v_account RECORD;
  v_total_debit NUMERIC := 0;
  v_total_credit NUMERIC := 0;
  v_line_number INTEGER := 1;
  v_accounts_processed INTEGER := 0;
BEGIN
  -- VALIDASI
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  -- GET LABA DITAHAN ACCOUNT
  SELECT id INTO v_laba_ditahan_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '3200' AND is_active = TRUE LIMIT 1;

  IF v_laba_ditahan_id IS NULL THEN
    SELECT id INTO v_laba_ditahan_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '3100' AND is_active = TRUE LIMIT 1;
  END IF;

  IF v_laba_ditahan_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, 'Akun Laba Ditahan tidak ditemukan'::TEXT;
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
    gen_random_uuid(), p_branch_id, v_entry_number, p_opening_date,
    'Saldo Awal Semua Akun',
    'opening', 'ALL-OPENING', 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;

  -- LOOP THROUGH ALL ACCOUNTS WITH INITIAL BALANCE
  FOR v_account IN
    SELECT id, code, name, type, initial_balance, normal_balance
    FROM accounts
    WHERE branch_id = p_branch_id
      AND initial_balance IS NOT NULL
      AND initial_balance <> 0
      AND code NOT IN ('1310', '1320') -- Exclude inventory (handled separately)
      AND is_active = TRUE
    ORDER BY code
  LOOP
    -- Determine debit/credit based on account type and normal balance
    IF v_account.type IN ('Aset', 'Beban') OR v_account.normal_balance = 'DEBIT' THEN
      -- Debit entry for asset/expense accounts
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, account_code, account_name,
        debit_amount, credit_amount, description, line_number
      ) VALUES (
        v_journal_id, v_account.id, v_account.code, v_account.name,
        ABS(v_account.initial_balance), 0, 'Saldo awal ' || v_account.name, v_line_number
      );
      v_total_debit := v_total_debit + ABS(v_account.initial_balance);
    ELSE
      -- Credit entry for liability/equity/revenue accounts
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, account_code, account_name,
        debit_amount, credit_amount, description, line_number
      ) VALUES (
        v_journal_id, v_account.id, v_account.code, v_account.name,
        0, ABS(v_account.initial_balance), 'Saldo awal ' || v_account.name, v_line_number
      );
      v_total_credit := v_total_credit + ABS(v_account.initial_balance);
    END IF;

    v_line_number := v_line_number + 1;
    v_accounts_processed := v_accounts_processed + 1;
  END LOOP;

  -- ADD BALANCING ENTRY TO LABA DITAHAN
  IF v_total_debit <> v_total_credit THEN
    IF v_total_debit > v_total_credit THEN
      -- Need more credit
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, account_code, account_name,
        debit_amount, credit_amount, description, line_number
      ) VALUES (
        v_journal_id, v_laba_ditahan_id,
        (SELECT code FROM accounts WHERE id = v_laba_ditahan_id),
        (SELECT name FROM accounts WHERE id = v_laba_ditahan_id),
        0, v_total_debit - v_total_credit, 'Penyeimbang saldo awal', v_line_number
      );
    ELSE
      -- Need more debit
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, account_code, account_name,
        debit_amount, credit_amount, description, line_number
      ) VALUES (
        v_journal_id, v_laba_ditahan_id,
        (SELECT code FROM accounts WHERE id = v_laba_ditahan_id),
        (SELECT name FROM accounts WHERE id = v_laba_ditahan_id),
        v_total_credit - v_total_debit, 0, 'Penyeimbang saldo awal', v_line_number
      );
    END IF;
  END IF;

  RETURN QUERY SELECT TRUE, v_journal_id, v_accounts_processed, v_total_debit, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION create_migration_receivable_journal_rpc(UUID, TEXT, DATE, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_debt_journal_rpc(UUID, TEXT, DATE, NUMERIC, TEXT, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_migration_debt_journal_rpc(UUID, TEXT, DATE, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_manual_cash_in_journal_rpc(UUID, TEXT, DATE, NUMERIC, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_manual_cash_out_journal_rpc(UUID, TEXT, DATE, NUMERIC, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_transfer_journal_rpc(UUID, TEXT, DATE, NUMERIC, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_material_payment_journal_rpc(UUID, TEXT, DATE, NUMERIC, UUID, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_inventory_opening_balance_journal_rpc(UUID, NUMERIC, NUMERIC, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION create_all_opening_balance_journal_rpc(UUID, DATE) TO authenticated;


-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION create_migration_receivable_journal_rpc IS 'Create migration journal for receivable: Dr. Piutang, Cr. Saldo Awal';
COMMENT ON FUNCTION create_debt_journal_rpc IS 'Create journal for new debt/loan: Dr. Kas, Cr. Hutang';
COMMENT ON FUNCTION create_migration_debt_journal_rpc IS 'Create migration journal for debt: Dr. Saldo Awal, Cr. Hutang';
COMMENT ON FUNCTION create_manual_cash_in_journal_rpc IS 'Create journal for manual cash in: Dr. Kas, Cr. Pendapatan Lain';
COMMENT ON FUNCTION create_manual_cash_out_journal_rpc IS 'Create journal for manual cash out: Dr. Beban Lain, Cr. Kas';
COMMENT ON FUNCTION create_transfer_journal_rpc IS 'Create journal for inter-account transfer: Dr. To, Cr. From';
COMMENT ON FUNCTION create_material_payment_journal_rpc IS 'Create journal for material bill payment: Dr. Beban Bahan, Cr. Kas';
COMMENT ON FUNCTION create_inventory_opening_balance_journal_rpc IS 'Create opening balance journal for inventory';
COMMENT ON FUNCTION create_all_opening_balance_journal_rpc IS 'Create opening balance journal for all accounts with initial_balance';
