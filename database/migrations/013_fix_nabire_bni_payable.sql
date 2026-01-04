-- Migration 013: Fix Nabire Bank BNI Payable
-- Create missing account and journal for Bank BNI
-- Date: 2026-01-04

-- Step 1: Create Hutang Bank BNI account for Kantor Pusat if not exists
INSERT INTO accounts (id, code, name, type, balance, initial_balance, is_payment_account, branch_id, level, is_header, is_active, sort_order, created_at)
SELECT
  'acc-' || EXTRACT(EPOCH FROM NOW())::bigint || '-2220',
  '2220',
  'Hutang Bank BNI',
  'Kewajiban',
  0,
  0,
  false,
  '00000000-0000-0000-0000-000000000001',
  3,
  false,
  true,
  2220,
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM accounts WHERE code = '2220' AND branch_id = '00000000-0000-0000-0000-000000000001'
);

-- Step 2: Create journal for Bank BNI payable
DO $$
DECLARE
  v_journal_id UUID;
  v_account_hutang_id TEXT;
  v_account_kas_id TEXT;
  v_payable_id TEXT;
BEGIN
  -- Get the Bank BNI payable that wasn't processed
  SELECT id INTO v_payable_id
  FROM accounts_payable
  WHERE supplier_name ILIKE '%BNI%'
  AND branch_id = '00000000-0000-0000-0000-000000000001'
  AND NOT EXISTS (
    SELECT 1 FROM journal_entries je
    WHERE je.reference_type = 'payable'
    AND je.reference_id = accounts_payable.id::text
  )
  LIMIT 1;

  IF v_payable_id IS NULL THEN
    RAISE NOTICE 'No pending Bank BNI payable found';
    RETURN;
  END IF;

  -- Get accounts
  SELECT id INTO v_account_hutang_id
  FROM accounts WHERE code = '2220' AND branch_id = '00000000-0000-0000-0000-000000000001' LIMIT 1;

  SELECT id INTO v_account_kas_id
  FROM accounts WHERE code = '1110' AND branch_id = '00000000-0000-0000-0000-000000000001' LIMIT 1;

  IF v_account_hutang_id IS NULL THEN
    RAISE NOTICE 'Hutang Bank BNI account (2220) not found';
    RETURN;
  END IF;

  IF v_account_kas_id IS NULL THEN
    RAISE NOTICE 'Kas account (1110) not found';
    RETURN;
  END IF;

  -- Create journal as draft
  INSERT INTO journal_entries (
    id, entry_number, entry_date, description,
    reference_type, reference_id, status, is_voided,
    branch_id, created_at
  ) VALUES (
    gen_random_uuid(),
    'PAY-ADJ-' || TO_CHAR(NOW(), 'YYMMDD') || '-BNI',
    NOW(),
    'Saldo Awal Hutang: Bank BNI (Rp 2000000000)',
    'payable',
    v_payable_id,
    'draft',
    false,
    '00000000-0000-0000-0000-000000000001',
    NOW()
  ) RETURNING id INTO v_journal_id;

  -- Debit Kas
  INSERT INTO journal_entry_lines (
    id, journal_entry_id, line_number, account_id, account_code, account_name,
    debit_amount, credit_amount, description, created_at
  ) VALUES (
    gen_random_uuid(), v_journal_id, 1, v_account_kas_id, '1110', 'Kas',
    2000000000, 0, 'Penerimaan Pinjaman: Bank BNI', NOW()
  );

  -- Credit Hutang Bank BNI
  INSERT INTO journal_entry_lines (
    id, journal_entry_id, line_number, account_id, account_code, account_name,
    debit_amount, credit_amount, description, created_at
  ) VALUES (
    gen_random_uuid(), v_journal_id, 2, v_account_hutang_id, '2220', 'Hutang Bank BNI',
    0, 2000000000, 'Hutang: Bank BNI', NOW()
  );

  -- Update to posted
  UPDATE journal_entries
  SET status = 'posted', total_debit = 2000000000, total_credit = 2000000000
  WHERE id = v_journal_id;

  RAISE NOTICE 'Created Bank BNI payable journal: %', v_journal_id;
END $$;

-- Verify result
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
ORDER BY b.name, a.code;
