-- Migration 018: Fix Account Balance - Pure Journal (Single Source of Truth)
-- Purpose: Hapus penggunaan initial_balance dari perhitungan saldo
--          Semua saldo harus murni dari jurnal (termasuk jurnal opening_balance)
-- Date: 2026-01-08
--
-- ARSITEKTUR AKUNTANSI YANG BENAR:
-- 1. Saldo = MURNI dari jurnal entries (tidak ada initial_balance terpisah)
-- 2. Saldo Awal dicatat sebagai jurnal dengan reference_type = 'opening_balance'
-- 3. Kolom accounts.initial_balance DEPRECATED - hanya untuk display/referensi
--
-- RUMUS SALDO (PURE JOURNAL):
-- Untuk akun DEBIT NORMAL (Aset, Beban):
--   Saldo = SUM(debit) - SUM(credit)
--
-- Untuk akun CREDIT NORMAL (Kewajiban, Modal, Pendapatan):
--   Saldo = SUM(credit) - SUM(debit)
--
-- Dimana SUM sudah TERMASUK jurnal opening_balance

-- =============================================================================
-- VIEW 1: v_account_balances - Saldo akun MURNI dari jurnal
-- =============================================================================
CREATE OR REPLACE VIEW v_account_balances AS
WITH journal_movements AS (
    -- Hitung total debit & credit per akun dari jurnal yang POSTED dan TIDAK VOIDED
    -- TERMASUK jurnal opening_balance
    SELECT
        jel.account_id,
        COALESCE(SUM(jel.debit_amount), 0) as total_debit,
        COALESCE(SUM(jel.credit_amount), 0) as total_credit
    FROM journal_entry_lines jel
    INNER JOIN journal_entries je ON je.id = jel.journal_entry_id
    WHERE je.status = 'posted'
      AND je.is_voided = FALSE
    GROUP BY jel.account_id
)
SELECT
    a.id as account_id,
    a.code as account_code,
    a.name as account_name,
    a.type as account_type,
    a.parent_id,
    a.level,
    a.is_header,
    a.branch_id,
    a.initial_balance as initial_balance_deprecated, -- DEPRECATED: hanya untuk referensi
    a.balance as stored_balance,  -- Nilai yang tersimpan di kolom (untuk perbandingan)
    COALESCE(jm.total_debit, 0) as total_debit,
    COALESCE(jm.total_credit, 0) as total_credit,
    -- Hitung saldo MURNI dari jurnal (tanpa initial_balance)
    CASE
        WHEN a.type IN ('Aset', 'Beban') THEN
            -- Akun debit normal: saldo bertambah di debit
            COALESCE(jm.total_debit, 0) - COALESCE(jm.total_credit, 0)
        ELSE
            -- Akun credit normal: saldo bertambah di credit
            COALESCE(jm.total_credit, 0) - COALESCE(jm.total_debit, 0)
    END as calculated_balance,
    -- Deteksi perbedaan antara stored vs calculated
    CASE
        WHEN a.type IN ('Aset', 'Beban') THEN
            (COALESCE(jm.total_debit, 0) - COALESCE(jm.total_credit, 0)) - a.balance
        ELSE
            (COALESCE(jm.total_credit, 0) - COALESCE(jm.total_debit, 0)) - a.balance
    END as balance_difference
FROM accounts a
LEFT JOIN journal_movements jm ON jm.account_id = a.id
WHERE a.is_active = TRUE;

-- =============================================================================
-- VIEW 2: v_account_balance_mismatches - Akun yang saldonya tidak cocok
-- =============================================================================
CREATE OR REPLACE VIEW v_account_balance_mismatches AS
SELECT
    account_id,
    account_code,
    account_name,
    account_type,
    branch_id,
    initial_balance_deprecated,
    stored_balance,
    calculated_balance,
    balance_difference
FROM v_account_balances
WHERE ABS(balance_difference) > 0.01;  -- Toleransi 1 sen untuk floating point

-- =============================================================================
-- VIEW 3: v_trial_balance - Neraca Saldo
-- =============================================================================
CREATE OR REPLACE VIEW v_trial_balance AS
SELECT
    account_code,
    account_name,
    account_type,
    branch_id,
    CASE
        WHEN account_type IN ('Aset', 'Beban') THEN calculated_balance
        ELSE 0
    END as debit_balance,
    CASE
        WHEN account_type NOT IN ('Aset', 'Beban') THEN calculated_balance
        ELSE 0
    END as credit_balance
FROM v_account_balances
WHERE is_header = FALSE
  AND calculated_balance != 0
ORDER BY account_code;

-- =============================================================================
-- FUNCTION: get_account_balance - Ambil saldo akun MURNI dari jurnal
-- =============================================================================
CREATE OR REPLACE FUNCTION get_account_balance(p_account_id TEXT)
RETURNS NUMERIC AS $$
DECLARE
    v_balance NUMERIC;
    v_account_type TEXT;
    v_total_debit NUMERIC;
    v_total_credit NUMERIC;
BEGIN
    -- Get account type
    SELECT type
    INTO v_account_type
    FROM accounts
    WHERE id = p_account_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Calculate PURELY from journal (termasuk opening_balance journal)
    SELECT
        COALESCE(SUM(jel.debit_amount), 0),
        COALESCE(SUM(jel.credit_amount), 0)
    INTO v_total_debit, v_total_credit
    FROM journal_entry_lines jel
    INNER JOIN journal_entries je ON je.id = jel.journal_entry_id
    WHERE jel.account_id = p_account_id
      AND je.status = 'posted'
      AND je.is_voided = FALSE;

    -- Calculate balance based on account type (PURE JOURNAL)
    IF v_account_type IN ('Aset', 'Beban') THEN
        v_balance := v_total_debit - v_total_credit;
    ELSE
        v_balance := v_total_credit - v_total_debit;
    END IF;

    RETURN v_balance;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- FUNCTION: get_account_balance_at_date - Saldo akun pada tanggal tertentu
-- =============================================================================
CREATE OR REPLACE FUNCTION get_account_balance_at_date(
    p_account_id TEXT,
    p_as_of_date DATE
)
RETURNS NUMERIC AS $$
DECLARE
    v_balance NUMERIC;
    v_account_type TEXT;
    v_total_debit NUMERIC;
    v_total_credit NUMERIC;
BEGIN
    -- Get account type
    SELECT type
    INTO v_account_type
    FROM accounts
    WHERE id = p_account_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Calculate PURELY from journal up to date
    SELECT
        COALESCE(SUM(jel.debit_amount), 0),
        COALESCE(SUM(jel.credit_amount), 0)
    INTO v_total_debit, v_total_credit
    FROM journal_entry_lines jel
    INNER JOIN journal_entries je ON je.id = jel.journal_entry_id
    WHERE jel.account_id = p_account_id
      AND je.status = 'posted'
      AND je.is_voided = FALSE
      AND je.entry_date <= p_as_of_date;

    -- Calculate balance based on account type (PURE JOURNAL)
    IF v_account_type IN ('Aset', 'Beban') THEN
        v_balance := v_total_debit - v_total_credit;
    ELSE
        v_balance := v_total_credit - v_total_debit;
    END IF;

    RETURN v_balance;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- FUNCTION: sync_account_balances - Sinkronisasi accounts.balance dengan jurnal
-- =============================================================================
CREATE OR REPLACE FUNCTION sync_account_balances()
RETURNS TABLE(
    account_id TEXT,
    account_code VARCHAR(10),
    account_name TEXT,
    old_balance NUMERIC,
    new_balance NUMERIC,
    difference NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH updated AS (
        UPDATE accounts a
        SET balance = vab.calculated_balance,
            updated_at = NOW()
        FROM v_account_balances vab
        WHERE a.id = vab.account_id
          AND ABS(a.balance - vab.calculated_balance) > 0.01
        RETURNING
            a.id,
            a.code,
            a.name,
            vab.stored_balance as old_bal,
            vab.calculated_balance as new_bal
    )
    SELECT
        u.id,
        u.code,
        u.name,
        u.old_bal,
        u.new_bal,
        u.new_bal - u.old_bal as diff
    FROM updated u;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- GRANT PERMISSIONS
-- =============================================================================
GRANT SELECT ON v_account_balances TO authenticated;
GRANT SELECT ON v_account_balance_mismatches TO authenticated;
GRANT SELECT ON v_trial_balance TO authenticated;
GRANT EXECUTE ON FUNCTION get_account_balance(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_account_balance_at_date(TEXT, DATE) TO authenticated;

-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON VIEW v_account_balances IS 'Account balance PURELY from journal entries - Single Source of Truth. initial_balance column is DEPRECATED.';
COMMENT ON VIEW v_account_balance_mismatches IS 'Accounts where stored balance differs from calculated balance';
COMMENT ON VIEW v_trial_balance IS 'Trial balance report showing all account balances';
COMMENT ON FUNCTION get_account_balance IS 'Get current balance for an account calculated PURELY from journals';
COMMENT ON FUNCTION get_account_balance_at_date IS 'Get account balance as of a specific date calculated PURELY from journals';
COMMENT ON FUNCTION sync_account_balances IS 'Sync accounts.balance column with calculated values from journals';
