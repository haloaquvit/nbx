-- ============================================================================
-- RPC 13: Sales Journal Functions
-- Purpose: Create sales journal entries atomically
-- Replaces: createSalesJournal and createReceivablePaymentJournal from journalService
-- ============================================================================

-- ============================================================================
-- 1. CREATE SALES JOURNAL RPC
-- Creates journal entry for sales transaction
-- Dr. Kas/Piutang, Dr. HPP -> Cr. Pendapatan, Cr. Persediaan/Hutang BD
-- ============================================================================

CREATE OR REPLACE FUNCTION create_sales_journal_rpc(
  p_branch_id UUID,
  p_transaction_id TEXT,
  p_transaction_date DATE,
  p_total_amount NUMERIC,
  p_paid_amount NUMERIC DEFAULT 0,
  p_customer_name TEXT DEFAULT 'Umum',
  p_hpp_amount NUMERIC DEFAULT 0,
  p_hpp_bonus_amount NUMERIC DEFAULT 0,
  p_ppn_enabled BOOLEAN DEFAULT FALSE,
  p_ppn_amount NUMERIC DEFAULT 0,
  p_subtotal NUMERIC DEFAULT 0,
  p_is_office_sale BOOLEAN DEFAULT FALSE,
  p_payment_account_id UUID DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  entry_number TEXT,
  error_message TEXT
) AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_line_number INTEGER := 1;
  v_cash_amount NUMERIC;
  v_credit_amount NUMERIC;
  v_revenue_amount NUMERIC;
  v_total_hpp NUMERIC;

  -- Account IDs
  v_kas_account_id UUID;
  v_piutang_account_id UUID;
  v_pendapatan_account_id UUID;
  v_hpp_account_id UUID;
  v_hpp_bonus_account_id UUID;
  v_persediaan_account_id UUID;
  v_hutang_bd_account_id UUID;
  v_ppn_account_id UUID;
BEGIN
  -- Validate branch
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Branch ID is required'::TEXT;
    RETURN;
  END IF;

  -- Calculate amounts
  v_cash_amount := LEAST(p_paid_amount, p_total_amount);
  v_credit_amount := p_total_amount - v_cash_amount;
  v_revenue_amount := CASE WHEN p_ppn_enabled AND p_subtotal > 0 THEN p_subtotal ELSE p_total_amount END;
  v_total_hpp := p_hpp_amount + p_hpp_bonus_amount;

  -- Get account IDs
  -- Kas account (use payment account if specified, otherwise default 1110)
  IF p_payment_account_id IS NOT NULL THEN
    v_kas_account_id := p_payment_account_id;
  ELSE
    SELECT id INTO v_kas_account_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '1110' AND is_active = TRUE LIMIT 1;
  END IF;

  SELECT id INTO v_piutang_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1210' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_pendapatan_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '4100' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_hpp_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '5100' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_hpp_bonus_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '5210' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_persediaan_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1310' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_hutang_bd_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '2140' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_ppn_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '2130' AND is_active = TRUE LIMIT 1;

  -- Generate entry number
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

  -- Create journal entry header
  INSERT INTO journal_entries (
    id,
    branch_id,
    entry_number,
    entry_date,
    description,
    reference_type,
    reference_id,
    status,
    is_voided,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    p_branch_id,
    v_entry_number,
    p_transaction_date,
    'Penjualan ' ||
    CASE
      WHEN v_credit_amount > 0 AND v_cash_amount = 0 THEN 'Kredit'
      WHEN v_credit_amount > 0 AND v_cash_amount > 0 THEN 'Sebagian'
      ELSE 'Tunai'
    END || ' - ' || p_transaction_id || ' - ' || p_customer_name,
    'transaction',
    p_transaction_id,
    'posted',
    FALSE,
    NOW(),
    NOW()
  ) RETURNING id INTO v_journal_id;

  -- Insert journal lines

  -- 1. Dr. Kas (if cash payment)
  IF v_cash_amount > 0 AND v_kas_account_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, account_name,
      debit_amount, credit_amount, description, line_number
    ) VALUES (
      v_journal_id, v_kas_account_id,
      (SELECT name FROM accounts WHERE id = v_kas_account_id),
      v_cash_amount, 0, 'Penerimaan kas penjualan', v_line_number
    );
    v_line_number := v_line_number + 1;
  END IF;

  -- 2. Dr. Piutang (if credit)
  IF v_credit_amount > 0 AND v_piutang_account_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, account_name,
      debit_amount, credit_amount, description, line_number
    ) VALUES (
      v_journal_id, v_piutang_account_id,
      (SELECT name FROM accounts WHERE id = v_piutang_account_id),
      v_credit_amount, 0, 'Piutang usaha', v_line_number
    );
    v_line_number := v_line_number + 1;
  END IF;

  -- 3. Cr. Pendapatan
  IF v_pendapatan_account_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, account_name,
      debit_amount, credit_amount, description, line_number
    ) VALUES (
      v_journal_id, v_pendapatan_account_id,
      (SELECT name FROM accounts WHERE id = v_pendapatan_account_id),
      0, v_revenue_amount, 'Pendapatan penjualan', v_line_number
    );
    v_line_number := v_line_number + 1;
  END IF;

  -- 4. Cr. PPN Keluaran (if PPN enabled)
  IF p_ppn_enabled AND p_ppn_amount > 0 AND v_ppn_account_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, account_name,
      debit_amount, credit_amount, description, line_number
    ) VALUES (
      v_journal_id, v_ppn_account_id,
      (SELECT name FROM accounts WHERE id = v_ppn_account_id),
      0, p_ppn_amount, 'PPN Keluaran', v_line_number
    );
    v_line_number := v_line_number + 1;
  END IF;

  -- 5. Dr. HPP (regular items)
  IF p_hpp_amount > 0 AND v_hpp_account_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, account_name,
      debit_amount, credit_amount, description, line_number
    ) VALUES (
      v_journal_id, v_hpp_account_id,
      (SELECT name FROM accounts WHERE id = v_hpp_account_id),
      p_hpp_amount, 0, 'Harga Pokok Penjualan', v_line_number
    );
    v_line_number := v_line_number + 1;
  END IF;

  -- 6. Dr. HPP Bonus
  IF p_hpp_bonus_amount > 0 AND v_hpp_bonus_account_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, account_name,
      debit_amount, credit_amount, description, line_number
    ) VALUES (
      v_journal_id, v_hpp_bonus_account_id,
      (SELECT name FROM accounts WHERE id = v_hpp_bonus_account_id),
      p_hpp_bonus_amount, 0, 'HPP Bonus/Gratis', v_line_number
    );
    v_line_number := v_line_number + 1;
  END IF;

  -- 7. Cr. Persediaan or Hutang Barang Dagang
  IF v_total_hpp > 0 THEN
    IF p_is_office_sale THEN
      -- Office Sale: Cr. Persediaan (stok langsung berkurang)
      IF v_persediaan_account_id IS NOT NULL THEN
        INSERT INTO journal_entry_lines (
          journal_entry_id, account_id, account_name,
          debit_amount, credit_amount, description, line_number
        ) VALUES (
          v_journal_id, v_persediaan_account_id,
          (SELECT name FROM accounts WHERE id = v_persediaan_account_id),
          0, v_total_hpp, 'Pengurangan persediaan', v_line_number
        );
      END IF;
    ELSE
      -- Non-Office Sale: Cr. Hutang Barang Dagang (kewajiban kirim)
      IF v_hutang_bd_account_id IS NOT NULL THEN
        INSERT INTO journal_entry_lines (
          journal_entry_id, account_id, account_name,
          debit_amount, credit_amount, description, line_number
        ) VALUES (
          v_journal_id, v_hutang_bd_account_id,
          (SELECT name FROM accounts WHERE id = v_hutang_bd_account_id),
          0, v_total_hpp, 'Hutang barang dagang', v_line_number
        );
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT TRUE, v_journal_id, v_entry_number, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 2. CREATE RECEIVABLE PAYMENT JOURNAL RPC
-- Creates journal entry for receivable payment
-- Dr. Kas/Bank -> Cr. Piutang Usaha
-- ============================================================================

CREATE OR REPLACE FUNCTION create_receivable_payment_journal_rpc(
  p_branch_id UUID,
  p_transaction_id TEXT,
  p_payment_date DATE,
  p_amount NUMERIC,
  p_customer_name TEXT DEFAULT 'Pelanggan',
  p_payment_account_id UUID DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  entry_number TEXT,
  error_message TEXT
) AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_kas_account_id UUID;
  v_piutang_account_id UUID;
BEGIN
  -- Validate
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Branch ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Amount must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get account IDs
  IF p_payment_account_id IS NOT NULL THEN
    v_kas_account_id := p_payment_account_id;
  ELSE
    SELECT id INTO v_kas_account_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '1110' AND is_active = TRUE LIMIT 1;
  END IF;

  SELECT id INTO v_piutang_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1210' AND is_active = TRUE LIMIT 1;

  IF v_kas_account_id IS NULL OR v_piutang_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Required accounts not found'::TEXT;
    RETURN;
  END IF;

  -- Generate entry number
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

  -- Create journal entry header
  INSERT INTO journal_entries (
    id,
    branch_id,
    entry_number,
    entry_date,
    description,
    reference_type,
    reference_id,
    status,
    is_voided,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    p_branch_id,
    v_entry_number,
    p_payment_date,
    'Pembayaran Piutang - ' || p_transaction_id || ' - ' || p_customer_name,
    'receivable',
    p_transaction_id,
    'posted',
    FALSE,
    NOW(),
    NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Kas
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_kas_account_id,
    (SELECT name FROM accounts WHERE id = v_kas_account_id),
    p_amount, 0, 'Penerimaan kas pembayaran piutang', 1
  );

  -- Cr. Piutang
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_piutang_account_id,
    (SELECT name FROM accounts WHERE id = v_piutang_account_id),
    0, p_amount, 'Pelunasan piutang usaha', 2
  );

  RETURN QUERY SELECT TRUE, v_journal_id, v_entry_number, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION create_sales_journal_rpc(UUID, TEXT, DATE, NUMERIC, NUMERIC, TEXT, NUMERIC, NUMERIC, BOOLEAN, NUMERIC, NUMERIC, BOOLEAN, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_receivable_payment_journal_rpc(UUID, TEXT, DATE, NUMERIC, TEXT, UUID) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION create_sales_journal_rpc IS
  'Create sales journal entry atomically. Handles cash/credit split, HPP, PPN, and office sale logic.';
COMMENT ON FUNCTION create_receivable_payment_journal_rpc IS
  'Create receivable payment journal entry. Dr. Kas, Cr. Piutang.';
