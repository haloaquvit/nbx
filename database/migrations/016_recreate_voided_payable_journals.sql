-- Migration 016: Recreate Payable Journals for Voided Entries
-- Date: 2026-01-04
-- Purpose: Create correct journals for payables that had their journals voided

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
  v_seq INTEGER;
BEGIN
  RAISE NOTICE '=== CREATING CORRECT PAYABLE MIGRATION JOURNALS ===';

  -- Get next sequence number
  SELECT COALESCE(MAX(SUBSTRING(entry_number FROM '[0-9]+$')::INTEGER), 0) + 1 INTO v_seq
  FROM journal_entries
  WHERE entry_number LIKE 'PAY-MIG-' || TO_CHAR(NOW(), 'YYMMDD') || '-%';

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
    v_entry_number := 'PAY-MIG-' || TO_CHAR(NOW(), 'YYMMDD') || '-' || LPAD(v_seq::TEXT, 3, '0');
    v_seq := v_seq + 1;

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
    RAISE NOTICE 'Created payable journal % for % (branch %): Rp %',
      v_entry_number, v_payable.supplier_name, v_payable.branch_id, v_payable.outstanding;
  END LOOP;

  RAISE NOTICE 'Created % payable migration journals, total value: Rp %', v_journal_count, v_total_value;
END $$;

-- Verify results
DO $$
DECLARE
  v_hutang_usaha NUMERIC;
  v_hutang_bank NUMERIC;
  v_hutang_bni NUMERIC;
  v_modal NUMERIC;
BEGIN
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

-- Show hutang per branch
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
