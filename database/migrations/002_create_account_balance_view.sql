-- Migration 002: Create VIEW for derived account balance
-- Purpose: Make accounts.balance derived from journal entries instead of trigger-updated column
-- Date: 2026-01-03
--
-- ARSITEKTUR AKUNTANSI YANG BENAR:
-- 1. accounts.balance = COMPUTED (hasil hitung dari jurnal)
-- 2. accounts.initial_balance = READONLY (hanya set di awal, edit via adjustment journal)
-- 3. journal_entries + journal_entry_lines = SUMBER KEBENARAN SALDO
--
-- RUMUS SALDO:
-- Untuk akun DEBIT NORMAL (Aset, Beban):
--   Saldo = initial_balance + SUM(debit) - SUM(credit)
--
-- Untuk akun CREDIT NORMAL (Kewajiban, Modal, Pendapatan):
--   Saldo = initial_balance + SUM(credit) - SUM(debit)

-- =============================================================================
-- VIEW 1: v_account_balances - Saldo akun yang dihitung dari jurnal
-- =============================================================================
CREATE OR REPLACE VIEW v_account_balances AS
WITH journal_movements AS (
    -- Hitung total debit & credit per akun dari jurnal yang POSTED dan TIDAK VOIDED
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
    a.initial_balance,
    a.balance as stored_balance,  -- Nilai yang tersimpan di kolom (untuk perbandingan)
    COALESCE(jm.total_debit, 0) as total_debit,
    COALESCE(jm.total_credit, 0) as total_credit,
    -- Hitung saldo berdasarkan tipe akun
    CASE
        WHEN a.type IN ('Aset', 'Beban') THEN
            -- Akun debit normal: saldo bertambah di debit
            a.initial_balance + COALESCE(jm.total_debit, 0) - COALESCE(jm.total_credit, 0)
        ELSE
            -- Akun credit normal: saldo bertambah di credit
            a.initial_balance + COALESCE(jm.total_credit, 0) - COALESCE(jm.total_debit, 0)
    END as calculated_balance,
    -- Deteksi perbedaan antara stored vs calculated
    CASE
        WHEN a.type IN ('Aset', 'Beban') THEN
            (a.initial_balance + COALESCE(jm.total_debit, 0) - COALESCE(jm.total_credit, 0)) - a.balance
        ELSE
            (a.initial_balance + COALESCE(jm.total_credit, 0) - COALESCE(jm.total_debit, 0)) - a.balance
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
    initial_balance,
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
-- FUNCTION: get_account_balance - Ambil saldo akun yang benar
-- =============================================================================
CREATE OR REPLACE FUNCTION get_account_balance(p_account_id TEXT)
RETURNS NUMERIC AS $$
DECLARE
    v_balance NUMERIC;
    v_account_type TEXT;
    v_initial_balance NUMERIC;
    v_total_debit NUMERIC;
    v_total_credit NUMERIC;
BEGIN
    -- Get account info
    SELECT type, initial_balance
    INTO v_account_type, v_initial_balance
    FROM accounts
    WHERE id = p_account_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Calculate from journal
    SELECT
        COALESCE(SUM(jel.debit_amount), 0),
        COALESCE(SUM(jel.credit_amount), 0)
    INTO v_total_debit, v_total_credit
    FROM journal_entry_lines jel
    INNER JOIN journal_entries je ON je.id = jel.journal_entry_id
    WHERE jel.account_id = p_account_id
      AND je.status = 'posted'
      AND je.is_voided = FALSE;

    -- Calculate balance based on account type
    IF v_account_type IN ('Aset', 'Beban') THEN
        v_balance := v_initial_balance + v_total_debit - v_total_credit;
    ELSE
        v_balance := v_initial_balance + v_total_credit - v_total_debit;
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
    v_initial_balance NUMERIC;
    v_total_debit NUMERIC;
    v_total_credit NUMERIC;
BEGIN
    -- Get account info
    SELECT type, initial_balance
    INTO v_account_type, v_initial_balance
    FROM accounts
    WHERE id = p_account_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Calculate from journal up to date
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

    -- Calculate balance based on account type
    IF v_account_type IN ('Aset', 'Beban') THEN
        v_balance := v_initial_balance + v_total_debit - v_total_credit;
    ELSE
        v_balance := v_initial_balance + v_total_credit - v_total_debit;
    END IF;

    RETURN v_balance;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- FUNCTION: sync_account_balances - Sinkronisasi accounts.balance dengan jurnal
-- Gunakan ini untuk memperbaiki data yang sudah ada
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
-- sync_account_balances hanya untuk admin (tidak di-grant ke authenticated)

-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON VIEW v_account_balances IS 'Derived account balance from journal entries - source of truth';
COMMENT ON VIEW v_account_balance_mismatches IS 'Accounts where stored balance differs from calculated balance';
COMMENT ON VIEW v_trial_balance IS 'Trial balance report showing all account balances';
COMMENT ON FUNCTION get_account_balance IS 'Get current balance for an account calculated from journals';
COMMENT ON FUNCTION get_account_balance_at_date IS 'Get account balance as of a specific date';
COMMENT ON FUNCTION sync_account_balances IS 'Sync accounts.balance column with calculated values from journals';
