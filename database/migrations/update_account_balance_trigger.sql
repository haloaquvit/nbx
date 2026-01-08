-- Migration: Add Triggers for Automatic Account Balance Updates
-- 1. Function to update single account balance safely
-- 2. Trigger on journal_entry_lines (Insert/Update/Delete)
-- 3. Trigger on journal_entries (Void/Unvoid)

-- Helper function to calculate balance impacts
CREATE OR REPLACE FUNCTION calculate_balance_delta(
    p_account_id TEXT,
    p_debit NUMERIC,
    p_credit NUMERIC
) RETURNS NUMERIC AS $$
DECLARE
    v_type TEXT;
    v_delta NUMERIC;
BEGIN
    SELECT type INTO v_type FROM accounts WHERE id = p_account_id;
    
    -- Default to Aset logic if type not found (safe fallback)
    v_type := COALESCE(v_type, 'Aset');

    IF v_type IN ('Aset', 'Beban') THEN
        v_delta := p_debit - p_credit;
    ELSE
        -- Kewajiban, Modal, Pendapatan: Credit increases balance
        v_delta := p_credit - p_debit;
    END IF;

    RETURN v_delta;
END;
$$ LANGUAGE plpgsql;

-- Trigger Function for Line Changes
CREATE OR REPLACE FUNCTION tf_update_balance_on_line_change()
RETURNS TRIGGER AS $$
DECLARE
    v_is_voided BOOLEAN;
    v_delta NUMERIC;
BEGIN
    -- Check parent journal status first
    -- If INSERT/UPDATE: Check NEW parent
    -- If DELETE: Check OLD parent
    IF TG_OP = 'DELETE' THEN
        SELECT is_voided INTO v_is_voided FROM journal_entries WHERE id = OLD.journal_entry_id;
    ELSE
        SELECT is_voided INTO v_is_voided FROM journal_entries WHERE id = NEW.journal_entry_id;
    END IF;

    -- If journal is voided, lines don't affect active balance. Do nothing.
    IF v_is_voided THEN
        RETURN NULL;
    END IF;

    IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
        -- Reverse OLD impact
        v_delta := calculate_balance_delta(OLD.account_id, OLD.debit_amount, OLD.credit_amount);
        UPDATE accounts SET balance = COALESCE(balance, 0) - v_delta WHERE id = OLD.account_id;
    END IF;

    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        -- Apply NEW impact
        v_delta := calculate_balance_delta(NEW.account_id, NEW.debit_amount, NEW.credit_amount);
        UPDATE accounts SET balance = COALESCE(balance, 0) + v_delta WHERE id = NEW.account_id;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger Function for Journal Header Changes (Voiding)
CREATE OR REPLACE FUNCTION tf_update_balance_on_journal_change()
RETURNS TRIGGER AS $$
DECLARE
    r_line RECORD;
    v_delta NUMERIC;
BEGIN
    -- Only care if is_voided changed
    IF OLD.is_voided = NEW.is_voided THEN
        RETURN NULL;
    END IF;

    -- If BECOMING VOIDED (False -> True): Remove impact of all lines
    IF NEW.is_voided = TRUE THEN
        FOR r_line IN SELECT * FROM journal_entry_lines WHERE journal_entry_id = NEW.id LOOP
            v_delta := calculate_balance_delta(r_line.account_id, r_line.debit_amount, r_line.credit_amount);
            UPDATE accounts SET balance = COALESCE(balance, 0) - v_delta WHERE id = r_line.account_id;
        END LOOP;
    END IF;

    -- If BECOMING ACTIVE (True -> False): Add impact of all lines
    IF NEW.is_voided = FALSE THEN
        FOR r_line IN SELECT * FROM journal_entry_lines WHERE journal_entry_id = NEW.id LOOP
            v_delta := calculate_balance_delta(r_line.account_id, r_line.debit_amount, r_line.credit_amount);
            UPDATE accounts SET balance = COALESCE(balance, 0) + v_delta WHERE id = r_line.account_id;
        END LOOP;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply Triggers
DROP TRIGGER IF EXISTS trg_balance_line_change ON journal_entry_lines;
CREATE TRIGGER trg_balance_line_change
AFTER INSERT OR UPDATE OR DELETE ON journal_entry_lines
FOR EACH ROW EXECUTE FUNCTION tf_update_balance_on_line_change();

DROP TRIGGER IF EXISTS trg_balance_journal_change ON journal_entries;
CREATE TRIGGER trg_balance_journal_change
AFTER UPDATE OF is_voided ON journal_entries
FOR EACH ROW EXECUTE FUNCTION tf_update_balance_on_journal_change();

-- One-time Full Sync to ensure integrity at start
DO $$
DECLARE
    r_acc RECORD;
    v_calc_balance NUMERIC;
BEGIN
    RAISE NOTICE 'Starting One-time Full Balance Sync...';
    FOR r_acc IN SELECT id FROM accounts LOOP
        
        -- Calculate clean balance from non-voided lines (Pure Journal Sum)
        -- NOTE: initial_balance is ignored because it is already represented by an 'opening_balance' journal entry.
        SELECT COALESCE(SUM(
            CASE 
                WHEN a.type IN ('Aset', 'Beban') THEN (jel.debit_amount - jel.credit_amount)
                ELSE (jel.credit_amount - jel.debit_amount)
            END
        ), 0)
        INTO v_calc_balance
        FROM accounts a
        LEFT JOIN journal_entry_lines jel ON a.id = jel.account_id
        LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id
        WHERE a.id = r_acc.id AND (je.is_voided IS FALSE OR je.is_voided IS NULL)
        GROUP BY a.id, a.type;

        -- Update
        UPDATE accounts SET balance = v_calc_balance WHERE id = r_acc.id;
        
    END LOOP;
    RAISE NOTICE 'Sync Complete.';
END $$;
