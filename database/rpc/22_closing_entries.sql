-- ============================================================================
-- RPC 22: Closing Entries Atomic
-- Purpose: Annual closing process in database
-- ============================================================================

-- ============================================================================
-- 1. EXECUTE CLOSING ENTRY ATOMIC
-- ============================================================================

CREATE OR REPLACE FUNCTION execute_closing_entry_atomic(
  p_branch_id UUID,
  p_year INTEGER,
  p_user_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  net_income NUMERIC,
  error_message TEXT
) AS $$
DECLARE
  v_closing_date DATE := (p_year || '-12-31')::DATE;
  v_ikhtisar_acc_id UUID;
  v_laba_ditahan_acc_id UUID;
  v_total_pendapatan NUMERIC := 0;
  v_total_beban NUMERIC := 0;
  v_net_income NUMERIC := 0;
  v_journal_id UUID;
  v_journal_lines JSONB := '[]'::JSONB;
  v_acc RECORD;
  v_line_desc TEXT;
BEGIN
  -- 1. Validasi: cek apakah tahun sudah ditutup
  IF EXISTS (SELECT 1 FROM closing_periods WHERE year = p_year AND branch_id = p_branch_id) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, format('Tahun %s sudah pernah ditutup', p_year)::TEXT;
    RETURN;
  END IF;

  -- 2. Dapatkan Akun Laba Ditahan (3200)
  SELECT id INTO v_laba_ditahan_acc_id FROM accounts
  WHERE branch_id = p_branch_id AND (code = '3200' OR name ILIKE '%Laba Ditahan%') AND is_header = FALSE
  LIMIT 1;

  IF v_laba_ditahan_acc_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, 'Akun Laba Ditahan (3200) tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- 3. Dapatkan atau buat Akun Ikhtisar Laba Rugi (3300)
  SELECT id INTO v_ikhtisar_acc_id FROM accounts
  WHERE branch_id = p_branch_id AND (code = '3300' OR name ILIKE '%Ikhtisar Laba Rugi%') AND is_header = FALSE
  LIMIT 1;

  IF v_ikhtisar_acc_id IS NULL THEN
    INSERT INTO accounts (
      branch_id, code, name, type, is_header, is_active, balance, initial_balance, level, normal_balance
    ) VALUES (
      p_branch_id, '3300', 'Ikhtisar Laba Rugi', 'Modal', FALSE, TRUE, 0, 0, 3, 'CREDIT'
    ) RETURNING id INTO v_ikhtisar_acc_id;
  END IF;

  -- 4. Hitung Saldo Pendapatan & Beban dari Jurnal Posted
  -- Pendapatan (Saldo Normal Kredit)
  FOR v_acc IN 
    SELECT a.id, a.code, a.name, COALESCE(SUM(l.debit_amount - l.credit_amount), 0) as net_balance
    FROM accounts a
    JOIN journal_entry_lines l ON l.account_id = a.id
    JOIN journal_entries j ON j.id = l.journal_entry_id
    WHERE a.branch_id = p_branch_id 
      AND a.type = 'Pendapatan'
      AND j.status = 'posted' AND j.is_voided = FALSE
      AND j.entry_date BETWEEN (p_year || '-01-01')::DATE AND v_closing_date
    GROUP BY a.id, a.code, a.name
    HAVING SUM(l.debit_amount - l.credit_amount) != 0
  LOOP
    -- Pendapatan biasanya bersaldo kredit (negatif di p-net_balance jika debit - credit)
    -- Tutup Pendapatan: Debit Akun Pendapatan, Credit Ikhtisar
    v_total_pendapatan := v_total_pendapatan + ABS(v_acc.net_balance);
    
    v_journal_lines := v_journal_lines || jsonb_build_object(
      'account_id', v_acc.id,
      'debit_amount', ABS(v_acc.net_balance),
      'credit_amount', 0,
      'description', format('Tutup %s ke Ikhtisar Laba Rugi', v_acc.name)
    );
  END LOOP;

  IF v_total_pendapatan > 0 THEN
    v_journal_lines := v_journal_lines || jsonb_build_object(
      'account_id', v_ikhtisar_acc_id,
      'debit_amount', 0,
      'credit_amount', v_total_pendapatan,
      'description', 'Tutup Total Pendapatan ke Ikhtisar Laba Rugi'
    );
  END IF;

  -- Beban (Saldo Normal Debit)
  FOR v_acc IN 
    SELECT a.id, a.code, a.name, COALESCE(SUM(l.debit_amount - l.credit_amount), 0) as net_balance
    FROM accounts a
    JOIN journal_entry_lines l ON l.account_id = a.id
    JOIN journal_entries j ON j.id = l.journal_entry_id
    WHERE a.branch_id = p_branch_id 
      AND a.type = 'Beban'
      AND j.status = 'posted' AND j.is_voided = FALSE
      AND j.entry_date BETWEEN (p_year || '-01-01')::DATE AND v_closing_date
    GROUP BY a.id, a.code, a.name
    HAVING SUM(l.debit_amount - l.credit_amount) != 0
  LOOP
    -- Beban biasanya bersaldo debit (positif)
    -- Tutup Beban: Debit Ikhtisar, Credit Akun Beban
    v_total_beban := v_total_beban + ABS(v_acc.net_balance);
    
    v_journal_lines := v_journal_lines || jsonb_build_object(
      'account_id', v_acc.id,
      'debit_amount', 0,
      'credit_amount', ABS(v_acc.net_balance),
      'description', format('Tutup %s ke Ikhtisar Laba Rugi', v_acc.name)
    );
  END LOOP;

  IF v_total_beban > 0 THEN
    v_journal_lines := v_journal_lines || jsonb_build_object(
      'account_id', v_ikhtisar_acc_id,
      'debit_amount', v_total_beban,
      'credit_amount', 0,
      'description', 'Tutup Total Beban ke Ikhtisar Laba Rugi'
    );
  END IF;

  v_net_income := v_total_pendapatan - v_total_beban;

  IF v_net_income = 0 AND jsonb_array_length(v_journal_lines) = 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, 'Tidak ada saldo pendapatan/beban untuk ditutup'::TEXT;
    RETURN;
  END IF;

  -- 5. Tutup Ikhtisar ke Laba Ditahan
  IF v_net_income > 0 THEN
    -- LABA: Dr. Ikhtisar, Cr. Laba Ditahan
    v_journal_lines := v_journal_lines || jsonb_build_object(
      'account_id', v_ikhtisar_acc_id,
      'debit_amount', v_net_income,
      'credit_amount', 0,
      'description', 'Tutup Laba Bersih ke Laba Ditahan'
    );
    v_journal_lines := v_journal_lines || jsonb_build_object(
      'account_id', v_laba_ditahan_acc_id,
      'debit_amount', 0,
      'credit_amount', v_net_income,
      'description', format('Penerimaan Laba Bersih Tahun %s', p_year)
    );
  ELSIF v_net_income < 0 THEN
    -- RUGI: Dr. Laba Ditahan, Cr. Ikhtisar
    v_journal_lines := v_journal_lines || jsonb_build_object(
      'account_id', v_laba_ditahan_acc_id,
      'debit_amount', ABS(v_net_income),
      'credit_amount', 0,
      'description', format('Pengurangan akibat Rugi Bersih Tahun %s', p_year)
    );
    v_journal_lines := v_journal_lines || jsonb_build_object(
      'account_id', v_ikhtisar_acc_id,
      'debit_amount', 0,
      'credit_amount', ABS(v_net_income),
      'description', 'Tutup Rugi Bersih ke Laba Ditahan'
    );
  END IF;

  -- 6. Buat Jurnal Penutup
  SELECT journal_id INTO v_journal_id
  FROM create_journal_atomic(
    p_branch_id,
    v_closing_date,
    format('Jurnal Penutup Tahun %s', p_year),
    'closing',
    p_year::TEXT,
    v_journal_lines,
    TRUE -- auto post
  );

  -- 7. Simpan di closing_periods
  INSERT INTO closing_periods (
    year, branch_id, closed_at, closed_by, journal_entry_id, net_income
  ) VALUES (
    p_year, p_branch_id, NOW(), p_user_id, v_journal_id, v_net_income
  );

  RETURN QUERY SELECT TRUE, v_journal_id, v_net_income, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. VOID CLOSING ENTRY ATOMIC
-- ============================================================================

CREATE OR REPLACE FUNCTION void_closing_entry_atomic(
  p_branch_id UUID,
  p_year INTEGER
)
RETURNS TABLE ( success BOOLEAN, error_message TEXT ) AS $$
DECLARE
  v_journal_id UUID;
BEGIN
  -- 1. Ambil data closing
  SELECT journal_entry_id INTO v_journal_id
  FROM closing_periods
  WHERE year = p_year AND branch_id = p_branch_id;

  IF v_journal_id IS NULL THEN
    RETURN QUERY SELECT FALSE, format('Tidak ada tutup buku untuk tahun %s', p_year)::TEXT;
    RETURN;
  END IF;

  -- 2. Cek apakah ada transaksi di tahun berikutnya (Opsional, tapi bagus untuk kontrol)
  -- Untuk saat ini kita biarkan void selama journal belum di-audit/lock manual
  
  -- 3. Void Journal
  UPDATE journal_entries
  SET is_voided = TRUE, status = 'voided', voided_reason = format('Pembatalan tutup buku tahun %s', p_year)
  WHERE id = v_journal_id;

  -- 4. Hapus Closing Period
  DELETE FROM closing_periods WHERE year = p_year AND branch_id = p_branch_id;

  RETURN QUERY SELECT TRUE, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 3. PREVIEW CLOSING ENTRY
-- ============================================================================

CREATE OR REPLACE FUNCTION preview_closing_entry(
  p_branch_id UUID,
  p_year INTEGER
)
RETURNS TABLE (
  total_pendapatan NUMERIC,
  total_beban NUMERIC,
  laba_rugi_bersih NUMERIC,
  pendapatan_accounts JSONB,
  beban_accounts JSONB
) AS $$
DECLARE
  v_closing_date DATE := (p_year || '-12-31')::DATE;
  v_total_pendapatan NUMERIC := 0;
  v_total_beban NUMERIC := 0;
  v_pendapatan_json JSONB := '[]'::JSONB;
  v_beban_json JSONB := '[]'::JSONB;
  v_acc RECORD;
BEGIN
  -- Pendapatan
  FOR v_acc IN 
    SELECT a.id, a.code, a.name, ABS(SUM(l.debit_amount - l.credit_amount)) as balance
    FROM accounts a
    JOIN journal_entry_lines l ON l.account_id = a.id
    JOIN journal_entries j ON j.id = l.journal_entry_id
    WHERE a.branch_id = p_branch_id 
      AND a.type = 'Pendapatan'
      AND j.status = 'posted' AND j.is_voided = FALSE
      AND j.entry_date BETWEEN (p_year || '-01-01')::DATE AND v_closing_date
    GROUP BY a.id, a.code, a.name
    HAVING SUM(l.debit_amount - l.credit_amount) != 0
  LOOP
    v_total_pendapatan := v_total_pendapatan + v_acc.balance;
    v_pendapatan_json := v_pendapatan_json || jsonb_build_object(
      'id', v_acc.id,
      'code', v_acc.code,
      'name', v_acc.name,
      'balance', v_acc.balance
    );
  END LOOP;

  -- Beban
  FOR v_acc IN 
    SELECT a.id, a.code, a.name, ABS(SUM(l.debit_amount - l.credit_amount)) as balance
    FROM accounts a
    JOIN journal_entry_lines l ON l.account_id = a.id
    JOIN journal_entries j ON j.id = l.journal_entry_id
    WHERE a.branch_id = p_branch_id 
      AND a.type = 'Beban'
      AND j.status = 'posted' AND j.is_voided = FALSE
      AND j.entry_date BETWEEN (p_year || '-01-01')::DATE AND v_closing_date
    GROUP BY a.id, a.code, a.name
    HAVING SUM(l.debit_amount - l.credit_amount) != 0
  LOOP
    v_total_beban := v_total_beban + v_acc.balance;
    v_beban_json := v_beban_json || jsonb_build_object(
      'id', v_acc.id,
      'code', v_acc.code,
      'name', v_acc.name,
      'balance', v_acc.balance
    );
  END LOOP;

  RETURN QUERY SELECT 
    v_total_pendapatan, 
    v_total_beban, 
    v_total_pendapatan - v_total_beban,
    v_pendapatan_json,
    v_beban_json;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION execute_closing_entry_atomic(UUID, INTEGER, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION void_closing_entry_atomic(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION preview_closing_entry(UUID, INTEGER) TO authenticated;
