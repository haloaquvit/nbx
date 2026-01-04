-- Migration 012: Create Initial Payable Journals from accounts_payable
-- Purpose: Generate journal entries for existing payables so COA shows correct balance
-- Date: 2026-01-04
-- UPDATED: Gunakan akun Saldo Awal (Ekuitas) bukan Kas untuk migrasi hutang lama

-- ============================================================================
-- STEP 1: CREATE JOURNALS FOR HUTANG (Migrasi Saldo Awal)
-- Debit: Saldo Awal / Modal Disetor (3100/3200) - BUKAN Kas!
-- Credit: Hutang Bank/Usaha (2xxx)
-- ============================================================================
DO $$
DECLARE
  v_payable RECORD;
  v_journal_id UUID;
  v_entry_number TEXT;
  v_account_hutang_id TEXT;
  v_account_saldo_awal_id TEXT;
  v_journal_count INTEGER := 0;
  v_total_value NUMERIC := 0;
BEGIN
  RAISE NOTICE '=== CREATING PAYABLE MIGRATION JOURNALS ===';

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
    )
  LOOP
    -- Get Hutang account for this branch based on creditor_type or supplier_name
    IF v_payable.supplier_name ILIKE '%BNI%' THEN
      SELECT id INTO v_account_hutang_id
      FROM accounts
      WHERE code = '2220' AND branch_id = v_payable.branch_id
      LIMIT 1;
    ELSIF v_payable.creditor_type = 'bank' OR v_payable.supplier_name ILIKE '%bank%' OR v_payable.supplier_name ILIKE '%BRI%' THEN
      SELECT id INTO v_account_hutang_id
      FROM accounts
      WHERE code = '2210' AND branch_id = v_payable.branch_id
      LIMIT 1;
    ELSIF v_payable.creditor_type = 'supplier' THEN
      SELECT id INTO v_account_hutang_id
      FROM accounts
      WHERE code = '2110' AND branch_id = v_payable.branch_id
      LIMIT 1;
    ELSE
      -- Default to Hutang Usaha (2110) or Hutang Bank (2210)
      SELECT id INTO v_account_hutang_id
      FROM accounts
      WHERE code = '2110' AND branch_id = v_payable.branch_id
      LIMIT 1;
    END IF;

    -- Get Saldo Awal / Modal Disetor account for this branch (Ekuitas)
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
      RAISE NOTICE 'Account Hutang not found for branch %, skipping %',
        v_payable.branch_id, v_payable.supplier_name;
      CONTINUE;
    END IF;

    IF v_account_saldo_awal_id IS NULL THEN
      RAISE NOTICE 'Account Saldo Awal/Modal not found for branch %, skipping %',
        v_payable.branch_id, v_payable.supplier_name;
      CONTINUE;
    END IF;

    v_total_value := v_total_value + v_payable.outstanding;
    v_entry_number := 'PAY-MIG-' || TO_CHAR(NOW(), 'YYMMDD') || '-' || LPAD((v_journal_count + 1)::TEXT, 3, '0');

    -- Create journal as DRAFT first
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

    -- Debit: Saldo Awal / Modal Disetor (Ekuitas) - BUKAN Kas!
    INSERT INTO journal_entry_lines (
      id, journal_entry_id, line_number, account_id, account_code, account_name,
      debit_amount, credit_amount, description, created_at
    ) VALUES (
      gen_random_uuid(), v_journal_id, 1, v_account_saldo_awal_id, '3100',
      'Modal Disetor', v_payable.outstanding, 0,
      'Saldo Awal Hutang: ' || v_payable.supplier_name, NOW()
    );

    -- Credit: Hutang
    INSERT INTO journal_entry_lines (
      id, journal_entry_id, line_number, account_id, account_code, account_name,
      debit_amount, credit_amount, description, created_at
    ) VALUES (
      gen_random_uuid(), v_journal_id, 2, v_account_hutang_id,
      CASE
        WHEN v_payable.supplier_name ILIKE '%BNI%' THEN '2220'
        WHEN v_payable.creditor_type = 'bank' OR v_payable.supplier_name ILIKE '%bank%' THEN '2210'
        ELSE '2110'
      END,
      CASE
        WHEN v_payable.supplier_name ILIKE '%BNI%' THEN 'Hutang Bank BNI'
        WHEN v_payable.creditor_type = 'bank' OR v_payable.supplier_name ILIKE '%bank%' THEN 'Hutang Bank'
        ELSE 'Hutang Usaha'
      END,
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
    RAISE NOTICE 'Created payable migration journal for % (branch %): Rp %',
      v_payable.supplier_name, v_payable.branch_id, v_payable.outstanding;
  END LOOP;

  RAISE NOTICE 'Created % payable migration journals, total value: Rp %', v_journal_count, v_total_value;
END $$;

-- ============================================================================
-- STEP 2: VERIFY RESULTS - Check Hutang account balances
-- ============================================================================
DO $$
DECLARE
  v_hutang_bank NUMERIC;
  v_hutang_bni NUMERIC;
BEGIN
  -- Calculate Hutang Bank (2210) balance
  SELECT COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0) INTO v_hutang_bank
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN accounts a ON a.id = jel.account_id
  WHERE a.code = '2210' AND je.is_voided = false AND je.status = 'posted';

  -- Calculate Hutang Bank BNI (2220) balance
  SELECT COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0) INTO v_hutang_bni
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN accounts a ON a.id = jel.account_id
  WHERE a.code = '2220' AND je.is_voided = false AND je.status = 'posted';

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '         PAYABLE JOURNAL RESULTS       ';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Saldo Hutang Bank (2210): Rp %', v_hutang_bank;
  RAISE NOTICE 'Saldo Hutang Bank BNI (2220): Rp %', v_hutang_bni;
  RAISE NOTICE '========================================';
END $$;

-- Show per-branch balances
SELECT
  b.name as branch_name,
  a.code,
  a.name as account_name,
  COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0) as saldo
FROM accounts a
LEFT JOIN journal_entry_lines jel ON jel.account_id = a.id
LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.status = 'posted' AND je.is_voided = false
LEFT JOIN branches b ON b.id = a.branch_id
WHERE a.code IN ('2210', '2220')
GROUP BY b.name, a.code, a.name
HAVING COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0) != 0
ORDER BY b.name, a.code;
