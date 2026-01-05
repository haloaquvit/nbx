-- ============================================================================
-- RPC 17: Retasi (Driver Return) Atomic Functions
-- Purpose: Process driver returns with proper stock and journal entries
-- - Retasi: Driver returns unsold items, refunds customer payments
-- ============================================================================

-- ============================================================================
-- 1. PROCESS RETASI ATOMIC
-- Proses pengembalian barang dari driver dengan journal
-- ============================================================================

CREATE OR REPLACE FUNCTION process_retasi_atomic(
  p_retasi JSONB,
  p_items JSONB, -- Array of returned items
  p_branch_id UUID,
  p_driver_id UUID,
  p_driver_name TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  retasi_id UUID,
  journal_id UUID,
  items_returned INTEGER,
  total_amount NUMERIC,
  error_message TEXT
) AS $$
DECLARE
  v_retasi_id UUID;
  v_journal_id UUID;
  v_transaction_id TEXT;
  v_delivery_id UUID;
  v_customer_name TEXT;
  v_return_date DATE;
  v_reason TEXT;
  v_total_amount NUMERIC := 0;
  v_items_returned INTEGER := 0;

  v_item JSONB;
  v_product_id UUID;
  v_product_name TEXT;
  v_quantity NUMERIC;
  v_price NUMERIC;
  v_item_total NUMERIC;

  v_kas_account_id UUID;
  v_pendapatan_account_id UUID;
  v_persediaan_account_id UUID;
  v_hpp_account_id UUID;
  v_entry_number TEXT;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0, 0::NUMERIC, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_driver_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0, 0::NUMERIC, 'Driver ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0, 0::NUMERIC, 'Items are required'::TEXT;
    RETURN;
  END IF;

  -- ==================== PARSE DATA ====================

  v_retasi_id := COALESCE((p_retasi->>'id')::UUID, gen_random_uuid());
  v_transaction_id := p_retasi->>'transaction_id';
  v_delivery_id := (p_retasi->>'delivery_id')::UUID;
  v_customer_name := COALESCE(p_retasi->>'customer_name', 'Pelanggan');
  v_return_date := COALESCE((p_retasi->>'return_date')::DATE, CURRENT_DATE);
  v_reason := COALESCE(p_retasi->>'reason', 'Barang tidak terjual');

  -- Get driver name if not provided (localhost uses profiles, not employees)
  IF p_driver_name IS NULL THEN
    SELECT full_name INTO p_driver_name FROM profiles WHERE id = p_driver_id;
  END IF;

  -- ==================== GET ACCOUNT IDS ====================

  SELECT id INTO v_kas_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1110' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_pendapatan_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '4100' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_persediaan_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1310' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_hpp_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '5100' AND is_active = TRUE LIMIT 1;

  -- ==================== PROCESS ITEMS & RESTORE STOCK ====================

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_product_name := v_item->>'product_name';
    v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 0);
    v_price := COALESCE((v_item->>'price')::NUMERIC, 0);

    IF v_product_id IS NOT NULL AND v_quantity > 0 THEN
      v_item_total := v_quantity * v_price;
      v_total_amount := v_total_amount + v_item_total;

      -- Restore stock to inventory batches
      -- Create new batch for returned items
      INSERT INTO inventory_batches (
        product_id,
        branch_id,
        initial_quantity,
        remaining_quantity,
        unit_cost,
        batch_date,
        reference_type,
        reference_id,
        notes,
        created_at
      ) VALUES (
        v_product_id,
        p_branch_id,
        v_quantity,
        v_quantity,
        COALESCE((v_item->>'cost_price')::NUMERIC, 0),
        v_return_date,
        'retasi',
        v_retasi_id::TEXT,
        'Retasi dari ' || p_driver_name || ': ' || v_reason,
        NOW()
      );

      v_items_returned := v_items_returned + 1;
    END IF;
  END LOOP;

  -- ==================== INSERT RETASI RECORD ====================

  INSERT INTO retasi (
    id,
    branch_id,
    transaction_id,
    delivery_id,
    driver_id,
    driver_name,
    customer_name,
    return_date,
    items,
    total_amount,
    reason,
    status,
    created_at,
    updated_at
  ) VALUES (
    v_retasi_id,
    p_branch_id,
    v_transaction_id,
    v_delivery_id,
    p_driver_id,
    p_driver_name,
    v_customer_name,
    v_return_date,
    p_items,
    v_total_amount,
    v_reason,
    'completed',
    NOW(),
    NOW()
  );

  -- ==================== CREATE REVERSAL JOURNAL ====================
  -- Jurnal balik untuk retasi:
  -- Dr. Persediaan (barang kembali)
  -- Dr. Pendapatan (batal pendapatan)
  --   Cr. HPP (batal HPP)
  --   Cr. Kas/Piutang (kembalikan uang/kurangi piutang)

  IF v_total_amount > 0 THEN
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
      v_return_date,
      'Retasi - ' || p_driver_name || ' - ' || v_customer_name || ' - ' || v_reason,
      'retasi',
      v_retasi_id::TEXT,
      'posted',
      FALSE,
      NOW(),
      NOW()
    ) RETURNING id INTO v_journal_id;

    -- Dr. Persediaan (barang kembali ke stok)
    IF v_persediaan_account_id IS NOT NULL THEN
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, account_name,
        debit_amount, credit_amount, description, line_number
      ) VALUES (
        v_journal_id, v_persediaan_account_id,
        (SELECT name FROM accounts WHERE id = v_persediaan_account_id),
        v_total_amount * 0.7, 0, 'Barang retasi kembali ke persediaan', 1
      );
    END IF;

    -- Dr. Pendapatan (batal pendapatan) - reverse credit
    IF v_pendapatan_account_id IS NOT NULL THEN
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, account_name,
        debit_amount, credit_amount, description, line_number
      ) VALUES (
        v_journal_id, v_pendapatan_account_id,
        (SELECT name FROM accounts WHERE id = v_pendapatan_account_id),
        v_total_amount, 0, 'Pembatalan pendapatan retasi', 2
      );
    END IF;

    -- Cr. HPP (batal HPP) - reverse debit
    IF v_hpp_account_id IS NOT NULL THEN
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, account_name,
        debit_amount, credit_amount, description, line_number
      ) VALUES (
        v_journal_id, v_hpp_account_id,
        (SELECT name FROM accounts WHERE id = v_hpp_account_id),
        0, v_total_amount * 0.7, 'Pembatalan HPP retasi', 3
      );
    END IF;

    -- Cr. Kas (kembalikan uang / kurangi piutang)
    IF v_kas_account_id IS NOT NULL THEN
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, account_name,
        debit_amount, credit_amount, description, line_number
      ) VALUES (
        v_journal_id, v_kas_account_id,
        (SELECT name FROM accounts WHERE id = v_kas_account_id),
        0, v_total_amount, 'Pengembalian kas retasi', 4
      );
    END IF;
  END IF;

  -- ==================== UPDATE TRANSACTION IF EXISTS ====================

  IF v_transaction_id IS NOT NULL THEN
    -- Update transaction to reflect return
    UPDATE transactions
    SET
      notes = COALESCE(notes, '') || ' | Retasi: ' || v_reason,
      updated_at = NOW()
    WHERE id = v_transaction_id AND branch_id = p_branch_id;
  END IF;

  -- ==================== SUCCESS ====================

  RETURN QUERY SELECT TRUE, v_retasi_id, v_journal_id, v_items_returned, v_total_amount, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0, 0::NUMERIC, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 2. VOID RETASI ATOMIC
-- Batalkan retasi dengan rollback stok dan jurnal
-- ============================================================================

CREATE OR REPLACE FUNCTION void_retasi_atomic(
  p_retasi_id UUID,
  p_branch_id UUID,
  p_reason TEXT DEFAULT 'Dibatalkan',
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  batches_removed INTEGER,
  journals_voided INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_retasi RECORD;
  v_batches_removed INTEGER := 0;
  v_journals_voided INTEGER := 0;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  -- Get retasi record
  SELECT * INTO v_retasi
  FROM retasi
  WHERE id = p_retasi_id AND branch_id = p_branch_id
  FOR UPDATE;

  IF v_retasi.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0, 'Retasi tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  IF v_retasi.status = 'cancelled' THEN
    RETURN QUERY SELECT FALSE, 0, 0, 'Retasi sudah dibatalkan'::TEXT;
    RETURN;
  END IF;

  -- ==================== REMOVE INVENTORY BATCHES ====================

  DELETE FROM inventory_batches
  WHERE reference_type = 'retasi'
    AND reference_id = p_retasi_id::TEXT
    AND branch_id = p_branch_id;

  GET DIAGNOSTICS v_batches_removed = ROW_COUNT;

  -- ==================== VOID JOURNALS ====================

  UPDATE journal_entries
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_reason = p_reason,
    status = 'voided',
    updated_at = NOW()
  WHERE reference_type = 'retasi'
    AND reference_id = p_retasi_id::TEXT
    AND branch_id = p_branch_id
    AND is_voided = FALSE;

  GET DIAGNOSTICS v_journals_voided = ROW_COUNT;

  -- ==================== UPDATE STATUS ====================

  UPDATE retasi
  SET
    status = 'cancelled',
    updated_at = NOW()
  WHERE id = p_retasi_id;

  -- ==================== SUCCESS ====================

  RETURN QUERY SELECT TRUE, v_batches_removed, v_journals_voided, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0, 0, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION process_retasi_atomic(JSONB, JSONB, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION void_retasi_atomic(UUID, UUID, TEXT, UUID) TO authenticated;


-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION process_retasi_atomic IS
  'Process driver return (retasi) with stock restore and reversal journal.';
COMMENT ON FUNCTION void_retasi_atomic IS
  'Void retasi, remove restored batches and void journals.';
