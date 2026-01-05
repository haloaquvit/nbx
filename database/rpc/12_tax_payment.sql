-- ============================================================================
-- RPC 12: Tax Payment (PPN/VAT)
-- Purpose: Mencatat pembayaran pajak PPN dengan jurnal yang benar
-- ============================================================================

-- Drop old function with old signature
DROP FUNCTION IF EXISTS pay_tax_atomic(UUID, NUMERIC, NUMERIC, TEXT, DATE, TEXT, TEXT);
DROP FUNCTION IF EXISTS create_tax_payment_atomic(UUID, TEXT, NUMERIC, NUMERIC, TEXT, TEXT);

CREATE OR REPLACE FUNCTION create_tax_payment_atomic(
  p_branch_id UUID,
  p_period TEXT,                        -- Periode pajak (e.g., '2024-01' or 'Januari 2024')
  p_ppn_masukan_used NUMERIC,           -- PPN yang bisa dikreditkan (asset)
  p_ppn_keluaran_paid NUMERIC,          -- PPN yang harus dibayar (liability)
  p_payment_account_id TEXT,            -- Akun kas/bank untuk pembayaran
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  net_payment NUMERIC,
  error_message TEXT
) AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_reference_id TEXT;
  v_ppn_keluaran_account_id TEXT;
  v_ppn_masukan_account_id TEXT;
  v_net_payment NUMERIC;
  v_description TEXT;
  v_payment_date DATE := CURRENT_DATE;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, 'Branch ID is REQUIRED'::TEXT;
    RETURN;
  END IF;

  IF p_ppn_keluaran_paid <= 0 AND p_ppn_masukan_used <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, 'Jumlah PPN harus lebih dari 0'::TEXT;
    RETURN;
  END IF;

  IF p_payment_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, 'Akun pembayaran harus dipilih'::TEXT;
    RETURN;
  END IF;

  -- ==================== LOOKUP ACCOUNTS ====================

  -- Find PPN Keluaran account (2130)
  SELECT id INTO v_ppn_keluaran_account_id
  FROM accounts
  WHERE (
    LOWER(name) LIKE '%ppn%keluaran%' OR
    code = '2130'
  )
  AND is_header = FALSE
  AND branch_id = p_branch_id
  LIMIT 1;

  IF v_ppn_keluaran_account_id IS NULL THEN
    -- Try without branch filter (global accounts)
    SELECT id INTO v_ppn_keluaran_account_id
    FROM accounts
    WHERE (
      LOWER(name) LIKE '%ppn%keluaran%' OR
      code = '2130'
    )
    AND is_header = FALSE
    LIMIT 1;
  END IF;

  IF v_ppn_keluaran_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, 'Akun PPN Keluaran (2130) tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- Find PPN Masukan account (1230)
  SELECT id INTO v_ppn_masukan_account_id
  FROM accounts
  WHERE (
    LOWER(name) LIKE '%ppn%masukan%' OR
    code = '1230'
  )
  AND is_header = FALSE
  AND branch_id = p_branch_id
  LIMIT 1;

  IF v_ppn_masukan_account_id IS NULL THEN
    -- Try without branch filter (global accounts)
    SELECT id INTO v_ppn_masukan_account_id
    FROM accounts
    WHERE (
      LOWER(name) LIKE '%ppn%masukan%' OR
      code = '1230'
    )
    AND is_header = FALSE
    LIMIT 1;
  END IF;

  IF v_ppn_masukan_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, 'Akun PPN Masukan (1230) tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- ==================== CALCULATE NET PAYMENT ====================

  -- Net payment = PPN Keluaran - PPN Masukan
  -- Jika positif, kita bayar ke negara
  -- Jika negatif, kita punya lebih bayar (kredit)
  v_net_payment := COALESCE(p_ppn_keluaran_paid, 0) - COALESCE(p_ppn_masukan_used, 0);

  -- ==================== BUILD DESCRIPTION & REFERENCE ====================

  v_description := 'Pembayaran PPN';
  IF p_period IS NOT NULL THEN
    v_description := v_description || ' periode ' || p_period;
  END IF;

  -- Create reference_id in format TAX-YYYYMM-xxx for period parsing
  -- Extract YYYYMM from period (handles both "2024-01" and "Januari 2024" formats)
  DECLARE
    v_year_month TEXT;
  BEGIN
    -- Try to match YYYY-MM format
    IF p_period ~ '^\d{4}-\d{2}$' THEN
      v_year_month := REPLACE(p_period, '-', '');
    ELSE
      -- Default to current month
      v_year_month := TO_CHAR(v_payment_date, 'YYYYMM');
    END IF;

    v_reference_id := 'TAX-' || v_year_month || '-' ||
                      LPAD((EXTRACT(EPOCH FROM NOW())::BIGINT % 10000)::TEXT, 4, '0');
  END;

  -- ==================== CREATE JOURNAL ENTRY ====================

  v_entry_number := 'JE-TAX-' || TO_CHAR(v_payment_date, 'YYYYMMDD') || '-' ||
                    LPAD((EXTRACT(EPOCH FROM NOW())::BIGINT % 10000)::TEXT, 4, '0');

  INSERT INTO journal_entries (
    entry_number,
    entry_date,
    description,
    reference_type,
    reference_id,
    is_posted,
    status,
    branch_id,
    created_by,
    created_at
  ) VALUES (
    v_entry_number,
    v_payment_date,
    CASE WHEN p_notes IS NOT NULL AND p_notes != ''
      THEN v_description || ' - ' || p_notes
      ELSE v_description
    END,
    'tax_payment',
    v_reference_id,
    TRUE,
    'posted',
    p_branch_id,
    'System',
    NOW()
  )
  RETURNING id INTO v_journal_id;

  -- ==================== JOURNAL LINE ITEMS ====================

  -- Jurnal Pembayaran PPN:
  -- Untuk mengOffset PPN Keluaran (liability) dan PPN Masukan (asset)
  --
  -- Dr PPN Keluaran (2130) - menghapus kewajiban
  -- Cr PPN Masukan (1230) - menghapus hak kredit
  -- Cr Kas - selisihnya (net payment)

  -- 1. Debit PPN Keluaran (mengurangi liability)
  IF p_ppn_keluaran_paid > 0 THEN
    INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_journal_id, v_ppn_keluaran_account_id, p_ppn_keluaran_paid, 0,
      'Offset PPN Keluaran periode ' || COALESCE(p_period, ''));
  END IF;

  -- 2. Credit PPN Masukan (mengurangi asset/hak kredit)
  IF p_ppn_masukan_used > 0 THEN
    INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_journal_id, v_ppn_masukan_account_id, 0, p_ppn_masukan_used,
      'Offset PPN Masukan periode ' || COALESCE(p_period, ''));
  END IF;

  -- 3. Kas - selisih pembayaran
  IF v_net_payment > 0 THEN
    -- Kita bayar ke negara (Credit Kas)
    INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_journal_id, p_payment_account_id, 0, v_net_payment,
      'Pembayaran PPN ke negara periode ' || COALESCE(p_period, ''));
  ELSIF v_net_payment < 0 THEN
    -- Lebih bayar - record as Debit to Kas (refund or carry forward)
    INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_journal_id, p_payment_account_id, ABS(v_net_payment), 0,
      'Lebih bayar PPN periode ' || COALESCE(p_period, ''));
  END IF;

  -- ==================== UPDATE ACCOUNT BALANCES ====================

  -- Update PPN Keluaran balance (liability decreases = subtract from balance)
  IF p_ppn_keluaran_paid > 0 THEN
    UPDATE accounts
    SET balance = COALESCE(balance, 0) - p_ppn_keluaran_paid,
        updated_at = NOW()
    WHERE id = v_ppn_keluaran_account_id;
  END IF;

  -- Update PPN Masukan balance (asset decreases = subtract from balance)
  IF p_ppn_masukan_used > 0 THEN
    UPDATE accounts
    SET balance = COALESCE(balance, 0) - p_ppn_masukan_used,
        updated_at = NOW()
    WHERE id = v_ppn_masukan_account_id;
  END IF;

  -- Update Kas/Bank balance
  IF v_net_payment > 0 THEN
    -- Payment to government: decrease cash
    UPDATE accounts
    SET balance = COALESCE(balance, 0) - v_net_payment,
        updated_at = NOW()
    WHERE id = p_payment_account_id;
  ELSIF v_net_payment < 0 THEN
    -- Overpayment refund: increase cash
    UPDATE accounts
    SET balance = COALESCE(balance, 0) + ABS(v_net_payment),
        updated_at = NOW()
    WHERE id = p_payment_account_id;
  END IF;

  -- ==================== LOG ====================

  RAISE NOTICE '[Tax Payment] Journal % created. PPN Keluaran: %, PPN Masukan: %, Net: %',
    v_entry_number, p_ppn_keluaran_paid, p_ppn_masukan_used, v_net_payment;

  RETURN QUERY SELECT TRUE, v_journal_id, v_net_payment, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION create_tax_payment_atomic(UUID, TEXT, NUMERIC, NUMERIC, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION create_tax_payment_atomic IS
  'Mencatat pembayaran pajak PPN dengan jurnal:
   - Dr PPN Keluaran (2130) - offset liability
   - Cr PPN Masukan (1230) - offset asset/kredit
   - Cr Kas - pembayaran selisih ke negara
   Parameters:
   - p_branch_id: Branch UUID
   - p_period: Tax period (e.g., "2024-01")
   - p_ppn_masukan_used: PPN input tax credit used
   - p_ppn_keluaran_paid: PPN output tax liability paid
   - p_payment_account_id: Cash/Bank account for payment
   - p_notes: Optional notes';
