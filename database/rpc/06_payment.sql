-- ============================================================================
-- RPC 06: Payment Atomic
-- Purpose: Proses pembayaran atomic dengan:
-- - Receivable payment (terima bayar piutang)
-- - Payable payment (bayar hutang)
-- - Journal entry otomatis
-- PENTING: Semua operasi WAJIB filter by branch_id
-- ============================================================================

-- Drop existing functions
DROP FUNCTION IF EXISTS receive_payment_atomic(UUID, UUID, NUMERIC, TEXT, DATE, TEXT);
DROP FUNCTION IF EXISTS pay_supplier_atomic(UUID, UUID, NUMERIC, TEXT, DATE, TEXT);
DROP FUNCTION IF EXISTS pay_supplier_atomic(TEXT, UUID, NUMERIC, TEXT, DATE, TEXT);

-- ============================================================================
-- 1. RECEIVE PAYMENT ATOMIC
-- Terima pembayaran piutang dari customer
-- ============================================================================

CREATE OR REPLACE FUNCTION receive_payment_atomic(
  p_receivable_id TEXT,       -- TEXT because transactions.id is TEXT
  p_branch_id UUID,           -- WAJIB: identitas cabang
  p_amount NUMERIC,
  p_payment_method TEXT DEFAULT 'cash',
  p_payment_date DATE DEFAULT CURRENT_DATE,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  payment_id UUID,
  remaining_amount NUMERIC,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_payment_id UUID;
  v_receivable RECORD;
  v_remaining NUMERIC;
  v_journal_id UUID;
  v_entry_number TEXT;
  v_kas_account_id TEXT;      -- accounts.id is TEXT
  v_piutang_account_id TEXT;  -- accounts.id is TEXT
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT;
    RETURN;
  END IF;

  IF p_receivable_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID,
      'Receivable ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID,
      'Amount must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get transaction info (acting as receivable)
  SELECT
    t.id,
    t.customer_id,
    t.total,
    COALESCE(t.paid_amount, 0) as paid_amount,
    COALESCE(t.total - COALESCE(t.paid_amount, 0), 0) as remaining_amount,
    t.payment_status as status,
    c.name as customer_name
  INTO v_receivable
  FROM transactions t
  LEFT JOIN customers c ON c.id = t.customer_id
  WHERE t.id = p_receivable_id::TEXT AND t.branch_id = p_branch_id; -- Cast UUID param to TEXT for transactions.id

  IF v_receivable.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID,
      'Transaction not found in this branch'::TEXT;
    RETURN;
  END IF;

  IF v_receivable.status = 'paid' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID,
      'Transaction already fully paid'::TEXT;
    RETURN;
  END IF;

  -- Calculate new remaining
  v_remaining := GREATEST(0, v_receivable.remaining_amount - p_amount);

  -- ==================== CREATE PAYMENT RECORD ====================
  -- Using transaction_payments table
  
  INSERT INTO transaction_payments (
    transaction_id,
    branch_id,
    amount,
    payment_method,
    payment_date,
    notes,
    created_at
  ) VALUES (
    p_receivable_id::TEXT,
    p_branch_id,
    p_amount,
    p_payment_method,
    p_payment_date,
    COALESCE(p_notes, format('Payment from %s', COALESCE(v_receivable.customer_name, 'Customer'))),
    NOW()
  )
  RETURNING id INTO v_payment_id;

  -- ==================== UPDATE TRANSACTION ====================

  UPDATE transactions
  SET
    paid_amount = COALESCE(paid_amount, 0) + p_amount,
    payment_status = CASE WHEN v_remaining <= 0 THEN 'Lunas' ELSE 'Partial' END,
    updated_at = NOW()
  WHERE id = p_receivable_id::TEXT;

  -- ==================== CREATE JOURNAL ENTRY ====================

  -- Get account IDs based on payment method
  IF p_payment_method = 'transfer' THEN
    SELECT id INTO v_kas_account_id
    FROM accounts
    WHERE code = '1120' AND branch_id = p_branch_id AND is_active = TRUE
    LIMIT 1;
  ELSE
    SELECT id INTO v_kas_account_id
    FROM accounts
    WHERE code = '1110' AND branch_id = p_branch_id AND is_active = TRUE
    LIMIT 1;
  END IF;

  SELECT id INTO v_piutang_account_id
  FROM accounts
  WHERE code = '1210' AND branch_id = p_branch_id AND is_active = TRUE
  LIMIT 1;

  IF v_kas_account_id IS NOT NULL AND v_piutang_account_id IS NOT NULL THEN
    v_entry_number := 'JE-' || TO_CHAR(p_payment_date, 'YYYYMMDD') || '-' ||
      LPAD((SELECT COUNT(*) + 1 FROM journal_entries
            WHERE branch_id = p_branch_id
            AND DATE(created_at) = p_payment_date)::TEXT, 4, '0');

    INSERT INTO journal_entries (
      entry_number,
      entry_date,
      description,
      reference_type,
      reference_id,
      branch_id,
      status,
      total_debit,
      total_credit
    ) VALUES (
      v_entry_number,
      p_payment_date,
      format('Terima pembayaran piutang: %s', COALESCE(v_receivable.customer_name, 'Customer')),
      'receivable_payment',
      v_payment_id::TEXT,
      p_branch_id,
      'draft',
      p_amount,
      p_amount
    )
    RETURNING id INTO v_journal_id;

    -- Dr. Kas/Bank
    INSERT INTO journal_entry_lines (
      journal_entry_id,
      line_number,
      account_id,
      description,
      debit_amount,
      credit_amount
    ) VALUES (
      v_journal_id,
      1,
      v_kas_account_id,
      format('Terima dari %s', COALESCE(v_receivable.customer_name, 'Customer')),
      p_amount,
      0
    );

    -- Cr. Piutang Usaha
    INSERT INTO journal_entry_lines (
      journal_entry_id,
      line_number,
      account_id,
      description,
      debit_amount,
      credit_amount
    ) VALUES (
      v_journal_id,
      2,
      v_piutang_account_id,
      format('Pelunasan piutang: %s', COALESCE(v_receivable.customer_name, 'Customer')),
      0,
      p_amount
    );

    UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
  END IF;

  RETURN QUERY SELECT
    TRUE,
    v_payment_id,
    v_remaining,
    v_journal_id,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 2. PAY SUPPLIER ATOMIC
-- Bayar hutang ke supplier
-- Note: accounts_payable.id adalah TEXT, bukan UUID
-- ============================================================================

CREATE OR REPLACE FUNCTION pay_supplier_atomic(
  p_payable_id TEXT,              -- TEXT karena accounts_payable.id adalah TEXT
  p_branch_id UUID,               -- WAJIB: identitas cabang
  p_amount NUMERIC,
  p_payment_method TEXT DEFAULT 'cash',
  p_payment_date DATE DEFAULT CURRENT_DATE,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  payment_id UUID,
  remaining_amount NUMERIC,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_payment_id UUID;
  v_payable RECORD;
  v_remaining NUMERIC;
  v_new_paid_amount NUMERIC;
  v_journal_id UUID;
  v_entry_number TEXT;
  v_kas_account_id TEXT;      -- accounts.id is TEXT
  v_hutang_account_id TEXT;   -- accounts.id is TEXT
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT;
    RETURN;
  END IF;

  IF p_payable_id IS NULL OR p_payable_id = '' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID,
      'Payable ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID,
      'Amount must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get payable info (struktur sesuai tabel accounts_payable yang ada)
  SELECT
    ap.id,
    ap.supplier_name,
    ap.amount,              -- Total amount hutang
    COALESCE(ap.paid_amount, 0) as paid_amount,
    ap.status
  INTO v_payable
  FROM accounts_payable ap
  WHERE ap.id = p_payable_id AND ap.branch_id = p_branch_id;

  IF v_payable.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID,
      'Payable not found in this branch'::TEXT;
    RETURN;
  END IF;

  IF v_payable.status = 'Paid' OR v_payable.status = 'paid' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID,
      'Hutang sudah lunas'::TEXT;
    RETURN;
  END IF;

  -- Calculate new amounts
  v_new_paid_amount := v_payable.paid_amount + p_amount;
  v_remaining := GREATEST(0, v_payable.amount - v_new_paid_amount);

  -- ==================== UPDATE PAYABLE (langsung, tanpa payment record terpisah) ====================

  UPDATE accounts_payable
  SET
    paid_amount = v_new_paid_amount,
    status = CASE WHEN v_remaining <= 0 THEN 'Paid' ELSE 'Partial' END,
    paid_at = CASE WHEN v_remaining <= 0 THEN NOW() ELSE paid_at END,
    notes = COALESCE(p_notes, notes)
  WHERE id = p_payable_id;

  -- Generate a payment ID for tracking
  v_payment_id := gen_random_uuid();

  -- ==================== CREATE JOURNAL ENTRY ====================

  -- Get account IDs
  IF p_payment_method = 'transfer' THEN
    SELECT id INTO v_kas_account_id
    FROM accounts
    WHERE code = '1120' AND branch_id = p_branch_id AND is_active = TRUE
    LIMIT 1;
  ELSE
    SELECT id INTO v_kas_account_id
    FROM accounts
    WHERE code = '1110' AND branch_id = p_branch_id AND is_active = TRUE
    LIMIT 1;
  END IF;

  SELECT id INTO v_hutang_account_id
  FROM accounts
  WHERE code = '2110' AND branch_id = p_branch_id AND is_active = TRUE
  LIMIT 1;

  IF v_kas_account_id IS NOT NULL AND v_hutang_account_id IS NOT NULL THEN
    v_entry_number := 'JE-' || TO_CHAR(p_payment_date, 'YYYYMMDD') || '-' ||
      LPAD((SELECT COUNT(*) + 1 FROM journal_entries
            WHERE branch_id = p_branch_id
            AND DATE(created_at) = p_payment_date)::TEXT, 4, '0');

    INSERT INTO journal_entries (
      entry_number,
      entry_date,
      description,
      reference_type,
      reference_id,
      branch_id,
      status,
      total_debit,
      total_credit
    ) VALUES (
      v_entry_number,
      p_payment_date,
      format('Bayar hutang ke: %s', COALESCE(v_payable.supplier_name, 'Supplier')),
      'payable_payment',
      v_payment_id::TEXT,
      p_branch_id,
      'draft',
      p_amount,
      p_amount
    )
    RETURNING id INTO v_journal_id;

    -- Dr. Hutang Usaha
    INSERT INTO journal_entry_lines (
      journal_entry_id,
      line_number,
      account_id,
      description,
      debit_amount,
      credit_amount
    ) VALUES (
      v_journal_id,
      1,
      v_hutang_account_id,
      format('Bayar ke %s', COALESCE(v_payable.supplier_name, 'Supplier')),
      p_amount,
      0
    );

    -- Cr. Kas/Bank
    INSERT INTO journal_entry_lines (
      journal_entry_id,
      line_number,
      account_id,
      description,
      debit_amount,
      credit_amount
    ) VALUES (
      v_journal_id,
      2,
      v_kas_account_id,
      format('Pembayaran hutang: %s', COALESCE(v_payable.supplier_name, 'Supplier')),
      0,
      p_amount
    );

    UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
  END IF;

  RETURN QUERY SELECT
    TRUE,
    v_payment_id,
    v_remaining,
    v_journal_id,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 3. CREATE ACCOUNTS PAYABLE ATOMIC
-- Membuat hutang baru secara atomic dengan jurnal otomatis
-- ============================================================================

CREATE OR REPLACE FUNCTION create_accounts_payable_atomic(
  p_branch_id UUID,
  p_supplier_name TEXT,
  p_amount NUMERIC,
  p_due_date DATE DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_creditor_type TEXT DEFAULT 'supplier',
  p_purchase_order_id TEXT DEFAULT NULL,
  p_skip_journal BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  success BOOLEAN,
  payable_id TEXT,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_payable_id TEXT;
  v_journal_id UUID;
  v_entry_number TEXT;
  v_hutang_account_id TEXT;
  v_lawan_account_id TEXT; -- Usually Cash or Inventory depending on context
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID,
      'Branch ID is REQUIRED'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID,
      'Amount must be positive'::TEXT;
    RETURN;
  END IF;

  -- Generate Sequential ID
  v_payable_id := 'AP-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

  -- ==================== INSERT ACCOUNTS PAYABLE ====================

  INSERT INTO accounts_payable (
    id,
    branch_id,
    supplier_name,
    creditor_type,
    amount,
    due_date,
    description,
    purchase_order_id,
    status,
    paid_amount,
    created_at
  ) VALUES (
    v_payable_id,
    p_branch_id,
    p_supplier_name,
    p_creditor_type,
    p_amount,
    p_due_date,
    p_description,
    p_purchase_order_id,
    'Outstanding',
    0,
    NOW()
  );

  -- ==================== CREATE JOURNAL ENTRY ====================

  IF NOT p_skip_journal THEN
    -- Get Account IDs
    -- Default Hutang Usaha: 2110
    SELECT id INTO v_hutang_account_id FROM accounts WHERE code = '2110' AND branch_id = p_branch_id AND is_active = TRUE LIMIT 1;
    
    -- Lawan: 5110 (Pembelian) as default
    SELECT id INTO v_lawan_account_id FROM accounts WHERE code = '5110' AND branch_id = p_branch_id AND is_active = TRUE LIMIT 1;

    IF v_hutang_account_id IS NOT NULL AND v_lawan_account_id IS NOT NULL THEN
      v_entry_number := 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
        LPAD((SELECT COUNT(*) + 1 FROM journal_entries WHERE branch_id = p_branch_id AND DATE(created_at) = CURRENT_DATE)::TEXT, 4, '0');

      INSERT INTO journal_entries (
        entry_number,
        entry_date,
        description,
        reference_type,
        reference_id,
        branch_id,
        status,
        total_debit,
        total_credit
      ) VALUES (
        v_entry_number,
        CURRENT_DATE,
        COALESCE(p_description, 'Hutang Baru: ' || p_supplier_name),
        'accounts_payable',
        v_payable_id,
        p_branch_id,
        'draft',
        p_amount,
        p_amount
      )
      RETURNING id INTO v_journal_id;

      -- Dr. Lawan (Expense/Asset)
      INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
      VALUES (v_journal_id, 1, v_lawan_account_id, COALESCE(p_description, 'Hutang Baru'), p_amount, 0);

      -- Cr. Hutang Usaha
      INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
      VALUES (v_journal_id, 2, v_hutang_account_id, COALESCE(p_description, 'Hutang Baru'), 0, p_amount);

      UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
    END IF;
  END IF;

  RETURN QUERY SELECT TRUE, v_payable_id, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION receive_payment_atomic(TEXT, UUID, NUMERIC, TEXT, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION pay_supplier_atomic(TEXT, UUID, NUMERIC, TEXT, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_accounts_payable_atomic(UUID, TEXT, NUMERIC, DATE, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION receive_payment_atomic IS
  'Atomic receivable payment: update saldo + journal. WAJIB branch_id.';
COMMENT ON FUNCTION pay_supplier_atomic IS
  'Atomic payable payment: update saldo + journal. WAJIB branch_id.';
COMMENT ON FUNCTION create_accounts_payable_atomic IS
  'Atomic creation of accounts payable with optional automatic journal entry. WAJIB branch_id.';

