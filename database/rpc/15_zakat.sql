-- ============================================================================
-- RPC 15: Zakat Atomic Functions
-- Purpose: Manage zakat payments with proper journal entries
-- - Pay zakat: Dr. Beban Zakat, Cr. Kas
-- ============================================================================

-- ============================================================================
-- 1. CREATE ZAKAT PAYMENT ATOMIC
-- Pembayaran zakat dengan jurnal otomatis
-- ============================================================================

CREATE OR REPLACE FUNCTION create_zakat_payment_atomic(
  p_zakat JSONB,
  p_branch_id UUID,
  p_created_by UUID DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  zakat_id UUID,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_zakat_id UUID;
  v_journal_id UUID;
  v_amount NUMERIC;
  v_zakat_type TEXT;
  v_payment_date DATE;
  v_recipient TEXT;
  v_notes TEXT;
  v_payment_account_id UUID;

  v_kas_account_id UUID;
  v_beban_zakat_id UUID;
  v_entry_number TEXT;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  -- ==================== PARSE DATA ====================

  v_zakat_id := COALESCE((p_zakat->>'id')::UUID, gen_random_uuid());
  v_amount := COALESCE((p_zakat->>'amount')::NUMERIC, 0);
  v_zakat_type := COALESCE(p_zakat->>'zakat_type', 'maal'); -- maal, fitrah, profesi
  v_payment_date := COALESCE((p_zakat->>'payment_date')::DATE, CURRENT_DATE);
  v_recipient := COALESCE(p_zakat->>'recipient', 'Lembaga Amil Zakat');
  v_notes := p_zakat->>'notes';
  v_payment_account_id := (p_zakat->>'payment_account_id')::UUID;

  IF v_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Amount must be positive'::TEXT;
    RETURN;
  END IF;

  -- ==================== GET ACCOUNT IDS ====================

  -- Kas account
  IF v_payment_account_id IS NOT NULL THEN
    v_kas_account_id := v_payment_account_id;
  ELSE
    SELECT id INTO v_kas_account_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '1110' AND is_active = TRUE LIMIT 1;
  END IF;

  -- Beban Zakat (6xxx - Beban Operasional, atau buat khusus 6500)
  SELECT id INTO v_beban_zakat_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '6500' AND is_active = TRUE LIMIT 1;

  -- Fallback: cari akun dengan nama mengandung "Zakat"
  IF v_beban_zakat_id IS NULL THEN
    SELECT id INTO v_beban_zakat_id FROM accounts
    WHERE branch_id = p_branch_id AND name ILIKE '%zakat%' AND is_active = TRUE LIMIT 1;
  END IF;

  -- Fallback: gunakan Beban Lain-lain (8100)
  IF v_beban_zakat_id IS NULL THEN
    SELECT id INTO v_beban_zakat_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '8100' AND is_active = TRUE LIMIT 1;
  END IF;

  IF v_kas_account_id IS NULL OR v_beban_zakat_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Akun Kas atau Beban Zakat tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- ==================== INSERT ZAKAT RECORD ====================

  INSERT INTO zakat_payments (
    id,
    branch_id,
    amount,
    zakat_type,
    payment_date,
    recipient,
    notes,
    status,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    v_zakat_id,
    p_branch_id,
    v_amount,
    v_zakat_type,
    v_payment_date,
    v_recipient,
    v_notes,
    'paid',
    p_created_by,
    NOW(),
    NOW()
  );

  -- ==================== CREATE JOURNAL ENTRY ====================

  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

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
    v_payment_date,
    'Pembayaran Zakat ' || INITCAP(v_zakat_type) || ' - ' || v_recipient,
    'zakat',
    v_zakat_id::TEXT,
    'posted',
    FALSE,
    NOW(),
    NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Beban Zakat
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_beban_zakat_id,
    (SELECT name FROM accounts WHERE id = v_beban_zakat_id),
    v_amount, 0, 'Beban Zakat ' || INITCAP(v_zakat_type), 1
  );

  -- Cr. Kas
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_kas_account_id,
    (SELECT name FROM accounts WHERE id = v_kas_account_id),
    0, v_amount, 'Pengeluaran kas untuk zakat', 2
  );

  -- ==================== SUCCESS ====================

  RETURN QUERY SELECT TRUE, v_zakat_id, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 2. VOID ZAKAT PAYMENT ATOMIC
-- Batalkan pembayaran zakat dengan rollback jurnal
-- ============================================================================

CREATE OR REPLACE FUNCTION void_zakat_payment_atomic(
  p_zakat_id UUID,
  p_branch_id UUID,
  p_reason TEXT DEFAULT 'Dibatalkan',
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  journals_voided INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_zakat RECORD;
  v_journals_voided INTEGER := 0;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  -- Get zakat record
  SELECT * INTO v_zakat
  FROM zakat_payments
  WHERE id = p_zakat_id AND branch_id = p_branch_id
  FOR UPDATE;

  IF v_zakat.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Pembayaran zakat tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  IF v_zakat.status = 'cancelled' THEN
    RETURN QUERY SELECT FALSE, 0, 'Pembayaran zakat sudah dibatalkan'::TEXT;
    RETURN;
  END IF;

  -- ==================== VOID JOURNALS ====================

  UPDATE journal_entries
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_reason = p_reason,
    status = 'voided',
    updated_at = NOW()
  WHERE reference_type = 'zakat'
    AND reference_id = p_zakat_id::TEXT
    AND branch_id = p_branch_id
    AND is_voided = FALSE;

  GET DIAGNOSTICS v_journals_voided = ROW_COUNT;

  -- ==================== UPDATE STATUS ====================

  UPDATE zakat_payments
  SET
    status = 'cancelled',
    updated_at = NOW()
  WHERE id = p_zakat_id;

  -- ==================== SUCCESS ====================

  RETURN QUERY SELECT TRUE, v_journals_voided, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION create_zakat_payment_atomic(JSONB, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION void_zakat_payment_atomic(UUID, UUID, TEXT, UUID) TO authenticated;


-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION create_zakat_payment_atomic IS
  'Create zakat payment with auto journal. Dr. Beban Zakat, Cr. Kas.';
COMMENT ON FUNCTION void_zakat_payment_atomic IS
  'Void zakat payment and related journals.';
