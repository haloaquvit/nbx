-- ============================================================================
-- RPC 23: Zakat Management Atomic
-- Purpose: Atomic operations for Zakat records with journal integration
-- ============================================================================

-- ============================================================================
-- 1. UPSERT ZAKAT RECORD ATOMIC
-- ============================================================================

CREATE OR REPLACE FUNCTION upsert_zakat_record_atomic(
  p_branch_id UUID,
  p_zakat_id TEXT,
  p_data JSONB
)
RETURNS TABLE (
  success BOOLEAN,
  zakat_id TEXT,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_zakat_id TEXT := p_zakat_id;
  v_journal_id UUID;
  v_beban_acc_id UUID;
  v_payment_acc_id UUID;
  v_amount NUMERIC;
  v_date DATE;
  v_journal_lines JSONB;
  v_category TEXT;
  v_title TEXT;
BEGIN
  -- ==================== VALIDASI & EKSTRAKSI ====================
  
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, 'Branch ID is REQUIRED'::TEXT;
    RETURN;
  END IF;

  v_amount := (p_data->>'amount')::NUMERIC;
  v_date := (p_data->>'payment_date')::DATE;
  v_payment_acc_id := (p_data->>'payment_account_id')::UUID;
  v_category := p_data->>'category';
  v_title := p_data->>'title';

  IF v_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, 'Amount must be positive'::TEXT;
    RETURN;
  END IF;

  -- Cari atau buat akun Beban Zakat/Sosial (6260-ish)
  -- Jika tidak ada, fallback ke Beban Umum (6200)
  SELECT id INTO v_beban_acc_id
  FROM accounts
  WHERE branch_id = p_branch_id
    AND (name ILIKE '%Beban Zakat%' OR name ILIKE '%Beban Sosial%' OR name ILIKE '%Beban Sumbangan%')
    AND is_header = FALSE
  LIMIT 1;

  IF v_beban_acc_id IS NULL THEN
    -- Fallback ke Beban Umum & Administrasi
    SELECT id INTO v_beban_acc_id
    FROM accounts
    WHERE branch_id = p_branch_id
      AND (code = '6200' OR name ILIKE '%Beban Umum%')
      AND is_header = FALSE
    LIMIT 1;
  END IF;

  IF v_beban_acc_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, 'Akun Beban (6200) tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- ==================== UPSERT ZAKAT RECORD ====================
  
  IF v_zakat_id IS NULL THEN
    v_zakat_id := 'ZAKAT-' || TO_CHAR(v_date, 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0');
  END IF;

  INSERT INTO zakat_records (
    id,
    type,
    category,
    title,
    description,
    recipient,
    recipient_type,
    amount,
    nishab_amount,
    percentage_rate,
    payment_date,
    payment_account_id,
    payment_method,
    status,
    receipt_number,
    calculation_basis,
    calculation_notes,
    is_anonymous,
    notes,
    attachment_url,
    hijri_year,
    hijri_month,
    created_by,
    branch_id,
    created_at,
    updated_at
  ) VALUES (
    v_zakat_id,
    p_data->>'type',
    v_category,
    v_title,
    p_data->>'description',
    p_data->>'recipient',
    p_data->>'recipient_type',
    v_amount,
    (p_data->>'nishab_amount')::NUMERIC,
    (p_data->>'percentage_rate')::NUMERIC,
    v_date,
    v_payment_acc_id,
    p_data->>'payment_method',
    'paid',
    p_data->>'receipt_number',
    p_data->>'calculation_basis',
    p_data->>'calculation_notes',
    (p_data->>'is_anonymous')::BOOLEAN,
    p_data->>'notes',
    p_data->>'attachment_url',
    (p_data->>'hijri_year')::INTEGER,
    p_data->>'hijri_month',
    auth.uid(),
    p_branch_id,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    type = EXCLUDED.type,
    category = EXCLUDED.category,
    title = EXCLUDED.title,
    amount = EXCLUDED.amount,
    payment_date = EXCLUDED.payment_date,
    payment_account_id = EXCLUDED.payment_account_id,
    updated_at = NOW();

  -- ==================== CREATE JOURNAL ====================
  
  -- Void existing journal if updating
  UPDATE journal_entries 
  SET is_voided = TRUE, status = 'voided', voided_reason = 'Updated zakat record'
  WHERE reference_id = v_zakat_id AND reference_type = 'zakat' AND is_voided = FALSE;

  -- Dr. Beban Zakat/Umum
  --   Cr. Kas/Bank
  v_journal_lines := jsonb_build_array(
    jsonb_build_object(
      'account_id', v_beban_acc_id,
      'debit_amount', v_amount,
      'credit_amount', 0,
      'description', format('%s: %s', INITCAP(v_category), v_title)
    ),
    jsonb_build_object(
      'account_id', v_payment_acc_id,
      'debit_amount', 0,
      'credit_amount', v_amount,
      'description', format('Pembayaran %s (%s)', v_category, v_zakat_id)
    )
  );

  SELECT journal_id INTO v_journal_id
  FROM create_journal_atomic(
    p_branch_id,
    v_date,
    format('Pembayaran %s - %s', INITCAP(v_category), v_title),
    'zakat',
    v_zakat_id,
    v_journal_lines,
    TRUE -- auto post
  );

  -- Link journal to zakat record
  UPDATE zakat_records SET journal_entry_id = v_journal_id WHERE id = v_zakat_id;

  RETURN QUERY SELECT TRUE, v_zakat_id, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. DELETE ZAKAT RECORD ATOMIC
-- ============================================================================

CREATE OR REPLACE FUNCTION delete_zakat_record_atomic(
  p_branch_id UUID,
  p_zakat_id TEXT
)
RETURNS TABLE ( success BOOLEAN, error_message TEXT ) AS $$
BEGIN
  -- Void Journals
  UPDATE journal_entries
  SET is_voided = TRUE, status = 'voided', voided_reason = 'Zakat record deleted'
  WHERE reference_id = p_zakat_id AND reference_type = 'zakat' AND is_voided = FALSE;

  -- Delete Record
  DELETE FROM zakat_records WHERE id = p_zakat_id AND branch_id = p_branch_id;

  RETURN QUERY SELECT TRUE, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION upsert_zakat_record_atomic(UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_zakat_record_atomic(UUID, TEXT) TO authenticated;
