-- Migration 003: Cleanup Deprecated Tables & Create Normalized Views
-- Date: 2026-01-03
-- Purpose: Remove deprecated tables and create normalized views for journal entries
--
-- PERHATIAN: Jalankan di STAGING dulu sebelum production!
-- BACKUP database sebelum menjalankan migration ini!

BEGIN;

-- =============================================================================
-- STEP 1: Create Normalized Views (SEBELUM drop tables)
-- =============================================================================

-- VIEW: v_journal_entry_lines - Normalized journal lines with account info from JOIN
-- Ini menggantikan account_code & account_name yang tersimpan di lines
-- dengan data langsung dari tabel accounts (source of truth)
CREATE OR REPLACE VIEW v_journal_entry_lines AS
SELECT
  jel.id,
  jel.journal_entry_id,
  jel.line_number,
  jel.account_id,
  a.code AS account_code,
  a.name AS account_name,
  a.type AS account_type,
  jel.debit_amount,
  jel.credit_amount,
  jel.description,
  jel.created_at,
  -- Include journal header info for convenience
  je.entry_number,
  je.entry_date,
  je.status AS journal_status,
  je.is_voided,
  je.branch_id,
  je.reference_type,
  je.reference_id
FROM journal_entry_lines jel
JOIN accounts a ON a.id = jel.account_id
JOIN journal_entries je ON je.id = jel.journal_entry_id;

-- VIEW: v_account_balances - Saldo akun yang dihitung dari jurnal
CREATE OR REPLACE VIEW v_account_balances AS
WITH journal_movements AS (
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
    a.balance as stored_balance,
    COALESCE(jm.total_debit, 0) as total_debit,
    COALESCE(jm.total_credit, 0) as total_credit,
    CASE
        WHEN a.type IN ('Aset', 'Beban') THEN
            a.initial_balance + COALESCE(jm.total_debit, 0) - COALESCE(jm.total_credit, 0)
        ELSE
            a.initial_balance + COALESCE(jm.total_credit, 0) - COALESCE(jm.total_debit, 0)
    END as calculated_balance,
    CASE
        WHEN a.type IN ('Aset', 'Beban') THEN
            (a.initial_balance + COALESCE(jm.total_debit, 0) - COALESCE(jm.total_credit, 0)) - a.balance
        ELSE
            (a.initial_balance + COALESCE(jm.total_credit, 0) - COALESCE(jm.total_debit, 0)) - a.balance
    END as balance_difference
FROM accounts a
LEFT JOIN journal_movements jm ON jm.account_id = a.id
WHERE a.is_active = TRUE;

-- VIEW: v_account_balance_mismatches - Akun yang saldonya tidak cocok
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
WHERE ABS(balance_difference) > 0.01;

-- VIEW: v_trial_balance - Neraca Saldo
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
-- STEP 2: Create Helper Functions
-- =============================================================================

-- FUNCTION: get_account_balance
CREATE OR REPLACE FUNCTION get_account_balance(p_account_id TEXT)
RETURNS NUMERIC AS $$
DECLARE
    v_balance NUMERIC;
    v_account_type TEXT;
    v_initial_balance NUMERIC;
    v_total_debit NUMERIC;
    v_total_credit NUMERIC;
BEGIN
    SELECT type, initial_balance
    INTO v_account_type, v_initial_balance
    FROM accounts
    WHERE id = p_account_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT
        COALESCE(SUM(jel.debit_amount), 0),
        COALESCE(SUM(jel.credit_amount), 0)
    INTO v_total_debit, v_total_credit
    FROM journal_entry_lines jel
    INNER JOIN journal_entries je ON je.id = jel.journal_entry_id
    WHERE jel.account_id = p_account_id
      AND je.status = 'posted'
      AND je.is_voided = FALSE;

    IF v_account_type IN ('Aset', 'Beban') THEN
        v_balance := v_initial_balance + v_total_debit - v_total_credit;
    ELSE
        v_balance := v_initial_balance + v_total_credit - v_total_debit;
    END IF;

    RETURN v_balance;
END;
$$ LANGUAGE plpgsql STABLE;

-- FUNCTION: get_account_balance_at_date
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
    SELECT type, initial_balance
    INTO v_account_type, v_initial_balance
    FROM accounts
    WHERE id = p_account_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

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

    IF v_account_type IN ('Aset', 'Beban') THEN
        v_balance := v_initial_balance + v_total_debit - v_total_credit;
    ELSE
        v_balance := v_initial_balance + v_total_credit - v_total_debit;
    END IF;

    RETURN v_balance;
END;
$$ LANGUAGE plpgsql STABLE;

-- FUNCTION: sync_account_balances
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
-- STEP 3: Grant Permissions
-- =============================================================================

GRANT SELECT ON v_journal_entry_lines TO authenticated;
GRANT SELECT ON v_journal_entry_lines TO anon;
GRANT SELECT ON v_account_balances TO authenticated;
GRANT SELECT ON v_account_balance_mismatches TO authenticated;
GRANT SELECT ON v_trial_balance TO authenticated;
GRANT EXECUTE ON FUNCTION get_account_balance(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_account_balance_at_date(TEXT, DATE) TO authenticated;

-- =============================================================================
-- STEP 4: Normalize existing journal_entry_lines data
-- =============================================================================

-- Update account_name dan account_code agar konsisten dengan accounts table
UPDATE journal_entry_lines jel
SET
  account_name = a.name,
  account_code = a.code
FROM accounts a
WHERE jel.account_id = a.id
  AND (jel.account_name IS DISTINCT FROM a.name OR jel.account_code IS DISTINCT FROM a.code);

-- =============================================================================
-- STEP 5: Sync account balances
-- =============================================================================

-- Jalankan sync untuk memperbaiki saldo yang mismatch
SELECT * FROM sync_account_balances();

-- =============================================================================
-- STEP 6: Drop Deprecated Tables (YANG AMAN)
-- =============================================================================

-- Tables yang PASTI deprecated dan tidak ada data penting
DROP TABLE IF EXISTS manual_journal_entry_lines CASCADE;
DROP TABLE IF EXISTS manual_journal_entries CASCADE;
DROP TABLE IF EXISTS balance_adjustments CASCADE;
DROP TABLE IF EXISTS accounts_balance_backup CASCADE;
DROP TABLE IF EXISTS daily_stats CASCADE;

-- =============================================================================
-- STEP 7: Soft-deprecate tables (RENAME untuk backup)
-- Uncomment jika ingin soft-delete dulu sebelum hard delete
-- =============================================================================

-- ALTER TABLE IF EXISTS cash_history RENAME TO _deprecated_cash_history;
-- ALTER TABLE IF EXISTS transaction_payments RENAME TO _deprecated_transaction_payments;
-- ALTER TABLE IF EXISTS user_roles RENAME TO _deprecated_user_roles;

-- =============================================================================
-- STEP 8: Add comments for documentation
-- =============================================================================

COMMENT ON VIEW v_journal_entry_lines IS 'Normalized journal lines - account info from accounts table (source of truth)';
COMMENT ON VIEW v_account_balances IS 'Derived account balance from journal entries - source of truth';
COMMENT ON VIEW v_account_balance_mismatches IS 'Accounts where stored balance differs from calculated balance';
COMMENT ON VIEW v_trial_balance IS 'Trial balance report showing all account balances';
COMMENT ON FUNCTION get_account_balance IS 'Get current balance for an account calculated from journals';
COMMENT ON FUNCTION get_account_balance_at_date IS 'Get account balance as of a specific date';
COMMENT ON FUNCTION sync_account_balances IS 'Sync accounts.balance column with calculated values from journals';

COMMIT;

-- =============================================================================
-- POST-MIGRATION VERIFICATION
-- =============================================================================
-- Jalankan query berikut untuk verifikasi:
--
-- 1. Cek views sudah ada:
--    SELECT viewname FROM pg_views WHERE schemaname = 'public' AND viewname LIKE 'v_%';
--
-- 2. Cek tidak ada mismatch:
--    SELECT COUNT(*) FROM v_account_balance_mismatches;
--
-- 3. Cek trial balance seimbang:
--    SELECT SUM(debit_balance) as total_debit, SUM(credit_balance) as total_credit FROM v_trial_balance;
--
-- 4. Cek deprecated tables sudah di-drop:
--    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN
--    ('manual_journal_entries', 'manual_journal_entry_lines', 'balance_adjustments', 'accounts_balance_backup', 'daily_stats');
