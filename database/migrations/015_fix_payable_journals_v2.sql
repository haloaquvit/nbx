-- Migration 015: Fix Payable Journals v2
-- Date: 2026-01-04
-- Purpose:
-- 1. Add missing PPN Masukan (1230) using correct column name (type, not account_type)
-- 2. VOID incorrect journals (not delete, because trigger prevents deletion)
-- 3. Recreate with correct journal (Debit Saldo Awal 3100, Credit Hutang)

-- ============================================================================
-- STEP 0: ADD MISSING ACCOUNTS (PPN Masukan 1230) FOR ALL BRANCHES
-- ============================================================================
DO $$
DECLARE
  v_branch RECORD;
  v_count INTEGER := 0;
BEGIN
  RAISE NOTICE '=== ADDING MISSING PPN MASUKAN ACCOUNT (1230) ===';

  FOR v_branch IN SELECT id, name FROM branches
  LOOP
    -- Check if account 1230 exists for this branch
    IF NOT EXISTS (
      SELECT 1 FROM accounts WHERE code = '1230' AND branch_id = v_branch.id
    ) THEN
      -- Use 'type' column (not 'account_type') based on actual schema
      INSERT INTO accounts (id, code, name, type, is_active, branch_id, created_at, balance, initial_balance)
      VALUES (
        gen_random_uuid()::text,
        '1230',
        'PPN Masukan',
        'Aset',
        true,
        v_branch.id,
        NOW(),
        0,
        0
      );
      v_count := v_count + 1;
      RAISE NOTICE 'Created account 1230 (PPN Masukan) for branch: %', v_branch.name;
    ELSE
      RAISE NOTICE 'Account 1230 already exists for branch: %', v_branch.name;
    END IF;
  END LOOP;

  RAISE NOTICE 'Created % new PPN Masukan accounts', v_count;
END $$;

-- ============================================================================
-- STEP 1: VOID INCORRECT PAYABLE JOURNALS (those that debited Kas/1110)
-- We cannot delete because of trigger, so we mark as voided
-- ============================================================================
DO $$
DECLARE
  v_voided_count INTEGER := 0;
  v_journal RECORD;
BEGIN
  RAISE NOTICE '=== VOIDING INCORRECT PAYABLE JOURNALS ===';

  -- Find journals that incorrectly debited Kas (1110) for payable reference
  FOR v_journal IN
    SELECT DISTINCT je.id, je.entry_number, je.description
    FROM journal_entries je
    JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
    WHERE je.reference_type = 'payable'
      AND jel.account_code = '1110'  -- Kas
      AND jel.debit_amount > 0
      AND je.description LIKE '%Saldo Awal Hutang%'
      AND je.is_voided = false
  LOOP
    -- Void the journal instead of deleting
    UPDATE journal_entries
    SET is_voided = true,
        status = 'voided',
        description = '[VOIDED - Wrong entry] ' || description
    WHERE id = v_journal.id;

    v_voided_count := v_voided_count + 1;
    RAISE NOTICE 'Voided incorrect journal: % - %', v_journal.entry_number, v_journal.description;
  END LOOP;

  RAISE NOTICE 'Voided % incorrect payable journals', v_voided_count;
END $$;

-- ============================================================================
-- STEP 2: CREATE CORRECT PAYABLE JOURNALS FOR REMAINING PAYABLES
-- Debit: Modal Disetor (3100) - NOT Kas!
-- Credit: Hutang Bank/Usaha (2xxx)
-- ============================================================================
DO $$
DECLARE
  v_payable RECORD;
  v_journal_id UUID;
  v_entry_number TEXT;
  v_account_hutang_id TEXT;
  v_account_saldo_awal_id TEXT;
  v_hutang_code TEXT;
  v_hutang_name TEXT;
  v_journal_count INTEGER := 0;
  v_total_value NUMERIC := 0;
BEGIN
  RAISE NOTICE '=== CREATING CORRECT PAYABLE MIGRATION JOURNALS ===';

  FOR v_payable IN
    SELECT
      ap.id,
      ap.supplier_name,
      ap.amount,
      ap.paid_amount,
      (ap.amount - COALESCE(ap.paid_amount, 0)) as outstanding,
      ap.branch_id,
      ap.creditor_type,
      ap.description,
      ap.created_at
    FROM accounts_payable ap
    WHERE (ap.amount - COALESCE(ap.paid_amount, 0)) > 0
    AND NOT EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.reference_type = 'payable'
      AND je.reference_id = ap.id::text
      AND je.status = 'posted'
      AND je.is_voided = false
    )
  LOOP
    -- Determine hutang account code based on creditor type/name
    IF v_payable.supplier_name ILIKE '%BNI%' THEN
      v_hutang_code := '2220';
      v_hutang_name := 'Hutang Bank BNI';
    ELSIF v_payable.creditor_type = 'bank' OR v_payable.supplier_name ILIKE '%bank%' OR v_payable.supplier_name ILIKE '%BRI%' THEN
      v_hutang_code := '2210';
      v_hutang_name := 'Hutang Bank';
    ELSIF v_payable.creditor_type = 'supplier' THEN
      v_hutang_code := '2110';
      v_hutang_name := 'Hutang Usaha';
    ELSE
      v_hutang_code := '2110';
      v_hutang_name := 'Hutang Usaha';
    END IF;

    -- Get Hutang account
    SELECT id INTO v_account_hutang_id
    FROM accounts
    WHERE code = v_hutang_code AND branch_id = v_payable.branch_id
    LIMIT 1;

    -- Get Saldo Awal / Modal Disetor account (Ekuitas)
    SELECT id INTO v_account_saldo_awal_id
    FROM accounts
    WHERE code = '3100' AND branch_id = v_payable.branch_id
    LIMIT 1;

    -- Fallback to 3200 if 3100 not found
    IF v_account_saldo_awal_id IS NULL THEN
      SELECT id INTO v_account_saldo_awal_id
      FROM accounts
      WHERE code = '3200' AND branch_id = v_payable.branch_id
      LIMIT 1;
    END IF;

    IF v_account_hutang_id IS NULL THEN
      RAISE NOTICE 'Account % not found for branch %, skipping %',
        v_hutang_code, v_payable.branch_id, v_payable.supplier_name;
      CONTINUE;
    END IF;

    IF v_account_saldo_awal_id IS NULL THEN
      RAISE NOTICE 'Account Modal Disetor (3100) not found for branch %, skipping %',
        v_payable.branch_id, v_payable.supplier_name;
      CONTINUE;
    END IF;

    v_total_value := v_total_value + v_payable.outstanding;
    v_entry_number := 'PAY-MIG-' || TO_CHAR(NOW(), 'YYMMDD') || '-' || LPAD((v_journal_count + 1)::TEXT, 3, '0');

    -- Create journal as DRAFT first (to avoid trigger issues)
    INSERT INTO journal_entries (
      id, entry_number, entry_date, description,
      reference_type, reference_id, status, is_voided,
      branch_id, created_at
    ) VALUES (
      gen_random_uuid(),
      v_entry_number,
      COALESCE(v_payable.created_at::date, NOW()::date),
      'Saldo Awal Hutang: ' || v_payable.supplier_name || ' (Rp ' || v_payable.outstanding || ')',
      'payable',
      v_payable.id::text,
      'draft',
      false,
      v_payable.branch_id,
      NOW()
    ) RETURNING id INTO v_journal_id;

    -- Debit: Modal Disetor (Ekuitas) - line 1
    INSERT INTO journal_entry_lines (
      id, journal_entry_id, line_number, account_id, account_code, account_name,
      debit_amount, credit_amount, description, created_at
    ) VALUES (
      gen_random_uuid(), v_journal_id, 1, v_account_saldo_awal_id, '3100',
      'Modal Disetor', v_payable.outstanding, 0,
      'Saldo Awal Hutang: ' || v_payable.supplier_name, NOW()
    );

    -- Credit: Hutang - line 2
    INSERT INTO journal_entry_lines (
      id, journal_entry_id, line_number, account_id, account_code, account_name,
      debit_amount, credit_amount, description, created_at
    ) VALUES (
      gen_random_uuid(), v_journal_id, 2, v_account_hutang_id,
      v_hutang_code, v_hutang_name,
      0, v_payable.outstanding,
      'Hutang: ' || v_payable.supplier_name, NOW()
    );

    -- Update to posted
    UPDATE journal_entries
    SET status = 'posted',
        total_debit = v_payable.outstanding,
        total_credit = v_payable.outstanding
    WHERE id = v_journal_id;

    v_journal_count := v_journal_count + 1;
    RAISE NOTICE 'Created payable journal for % (branch %): Rp %',
      v_payable.supplier_name, v_payable.branch_id, v_payable.outstanding;
  END LOOP;

  RAISE NOTICE 'Created % payable migration journals, total value: Rp %', v_journal_count, v_total_value;
END $$;

-- ============================================================================
-- STEP 3: VERIFY RESULTS
-- ============================================================================
DO $$
DECLARE
  v_hutang_usaha NUMERIC;
  v_hutang_bank NUMERIC;
  v_hutang_bni NUMERIC;
  v_modal NUMERIC;
BEGIN
  -- Calculate balances (exclude voided journals)
  SELECT COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0) INTO v_hutang_usaha
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN accounts a ON a.id = jel.account_id
  WHERE a.code = '2110' AND je.is_voided = false AND je.status = 'posted';

  SELECT COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0) INTO v_hutang_bank
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN accounts a ON a.id = jel.account_id
  WHERE a.code = '2210' AND je.is_voided = false AND je.status = 'posted';

  SELECT COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0) INTO v_hutang_bni
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN accounts a ON a.id = jel.account_id
  WHERE a.code = '2220' AND je.is_voided = false AND je.status = 'posted';

  SELECT COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0) INTO v_modal
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN accounts a ON a.id = jel.account_id
  WHERE a.code = '3100' AND je.is_voided = false AND je.status = 'posted';

  RAISE NOTICE '';
  RAISE NOTICE '======================================';
  RAISE NOTICE '     PAYABLE JOURNAL RESULTS         ';
  RAISE NOTICE '======================================';
  RAISE NOTICE 'Hutang Usaha (2110): Rp %', v_hutang_usaha;
  RAISE NOTICE 'Hutang Bank (2210): Rp %', v_hutang_bank;
  RAISE NOTICE 'Hutang Bank BNI (2220): Rp %', v_hutang_bni;
  RAISE NOTICE 'Modal Disetor (3100): Rp %', v_modal;
  RAISE NOTICE '======================================';
END $$;

-- Show payable journals per branch
SELECT
  b.name as branch_name,
  a.code,
  a.name as account_name,
  COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0) as saldo
FROM accounts a
LEFT JOIN journal_entry_lines jel ON jel.account_id = a.id
LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.status = 'posted' AND je.is_voided = false
LEFT JOIN branches b ON b.id = a.branch_id
WHERE a.code IN ('2110', '2210', '2220')
GROUP BY b.name, a.code, a.name
HAVING COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0) != 0
ORDER BY b.name, a.code;

-- List voided journals for audit
SELECT entry_number, description, status, is_voided
FROM journal_entries
WHERE is_voided = true
AND reference_type = 'payable'
ORDER BY created_at DESC
LIMIT 10;
