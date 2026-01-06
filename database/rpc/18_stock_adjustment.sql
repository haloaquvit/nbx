-- ============================================================================
-- RPC 18: Stock Adjustment Atomic Functions
-- Purpose: Handle stock adjustments (products & materials) with journal entries
-- - Adjustment IN: Dr. Persediaan, Cr. Selisih Stok
-- - Adjustment OUT: Dr. Selisih Stok, Cr. Persediaan
-- ============================================================================

-- ============================================================================
-- 1. PRODUCT STOCK ADJUSTMENT ATOMIC
-- Penyesuaian stok produk dengan jurnal otomatis
-- ============================================================================

CREATE OR REPLACE FUNCTION create_product_stock_adjustment_atomic(
  p_product_id UUID,
  p_branch_id UUID,
  p_quantity_change NUMERIC, -- positive = add, negative = reduce
  p_reason TEXT DEFAULT 'Stock Adjustment',
  p_unit_cost NUMERIC DEFAULT 0
)
RETURNS TABLE (
  success BOOLEAN,
  adjustment_id UUID,
  journal_id UUID,
  new_stock NUMERIC,
  error_message TEXT
) AS $$
DECLARE
  v_adjustment_id UUID;
  v_journal_id UUID;
  v_product_name TEXT;
  v_current_stock NUMERIC;
  v_new_stock NUMERIC;
  v_adjustment_value NUMERIC;
  v_persediaan_account_id UUID;
  v_selisih_account_id UUID;
  v_entry_number TEXT;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_product_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, 'Product ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_quantity_change = 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, 'Quantity change cannot be zero'::TEXT;
    RETURN;
  END IF;

  -- Get product info
  SELECT name, COALESCE(current_stock, 0) INTO v_product_name, v_current_stock
  FROM products WHERE id = p_product_id;

  IF v_product_name IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, 'Produk tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- Calculate new stock (cannot go negative)
  v_new_stock := v_current_stock + p_quantity_change;
  IF v_new_stock < 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC,
      format('Stok tidak cukup. Stok saat ini: %s, pengurangan: %s', v_current_stock, ABS(p_quantity_change))::TEXT;
    RETURN;
  END IF;

  -- Calculate adjustment value
  v_adjustment_value := ABS(p_quantity_change) * COALESCE(p_unit_cost, 0);

  -- ==================== GET ACCOUNT IDS ====================

  SELECT id INTO v_persediaan_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1310' AND is_active = TRUE LIMIT 1;

  -- Selisih Stok account (usually 8100 or specific)
  SELECT id INTO v_selisih_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '8100' AND is_active = TRUE LIMIT 1;

  -- ==================== UPDATE PRODUCT STOCK ====================

  UPDATE products
  SET current_stock = v_new_stock, updated_at = NOW()
  WHERE id = p_product_id;

  v_adjustment_id := gen_random_uuid();

  -- ==================== CREATE INVENTORY BATCH (if adding stock) ====================

  IF p_quantity_change > 0 THEN
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
      p_product_id,
      p_branch_id,
      p_quantity_change,
      p_quantity_change,
      COALESCE(p_unit_cost, 0),
      CURRENT_DATE,
      'adjustment',
      v_adjustment_id::TEXT,
      p_reason,
      NOW()
    );
  ELSE
    -- For reduction, consume from FIFO batches
    PERFORM consume_inventory_fifo(
      p_product_id,
      p_branch_id,
      ABS(p_quantity_change),
      'ADJ-' || v_adjustment_id::TEXT
    );
  END IF;

  -- ==================== CREATE STOCK MOVEMENT RECORD ====================

  INSERT INTO product_stock_movements (
    id,
    product_id,
    branch_id,
    type,
    quantity,
    reference_type,
    reference_id,
    notes,
    user_id,
    created_at
  ) VALUES (
    v_adjustment_id,
    p_product_id,
    p_branch_id,
    CASE WHEN p_quantity_change > 0 THEN 'adjustment_in' ELSE 'adjustment_out' END,
    ABS(p_quantity_change),
    'adjustment',
    v_adjustment_id::TEXT,
    p_reason,
    auth.uid(),
    NOW()
  );

  -- ==================== CREATE JOURNAL ENTRY (if value > 0) ====================

  IF v_adjustment_value > 0 AND v_persediaan_account_id IS NOT NULL AND v_selisih_account_id IS NOT NULL THEN
    SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
      (COALESCE(
        (SELECT COUNT(*) + 1 FROM journal_entries
         WHERE branch_id = p_branch_id
         AND DATE(created_at) = CURRENT_DATE),
        1
      ))::TEXT, 4, '0')
    INTO v_entry_number;

    INSERT INTO journal_entries (
      id, branch_id, entry_number, entry_date, description,
      reference_type, reference_id, status, is_voided, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), p_branch_id, v_entry_number, CURRENT_DATE,
      'Penyesuaian Stok - ' || v_product_name || ' - ' || p_reason,
      'adjustment', v_adjustment_id::TEXT, 'posted', FALSE, NOW(), NOW()
    ) RETURNING id INTO v_journal_id;

    IF p_quantity_change > 0 THEN
      -- Stock IN: Dr. Persediaan, Cr. Selisih
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_name, debit_amount, credit_amount, description, line_number)
      VALUES (v_journal_id, v_persediaan_account_id, (SELECT name FROM accounts WHERE id = v_persediaan_account_id), v_adjustment_value, 0, 'Penambahan persediaan', 1);

      INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_name, debit_amount, credit_amount, description, line_number)
      VALUES (v_journal_id, v_selisih_account_id, (SELECT name FROM accounts WHERE id = v_selisih_account_id), 0, v_adjustment_value, 'Selisih stok', 2);
    ELSE
      -- Stock OUT: Dr. Selisih, Cr. Persediaan
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_name, debit_amount, credit_amount, description, line_number)
      VALUES (v_journal_id, v_selisih_account_id, (SELECT name FROM accounts WHERE id = v_selisih_account_id), v_adjustment_value, 0, 'Selisih stok', 1);

      INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_name, debit_amount, credit_amount, description, line_number)
      VALUES (v_journal_id, v_persediaan_account_id, (SELECT name FROM accounts WHERE id = v_persediaan_account_id), 0, v_adjustment_value, 'Pengurangan persediaan', 2);
    END IF;
  END IF;

  RETURN QUERY SELECT TRUE, v_adjustment_id, v_journal_id, v_new_stock, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 2. MATERIAL STOCK ADJUSTMENT ATOMIC
-- Penyesuaian stok bahan dengan jurnal otomatis
-- ============================================================================

CREATE OR REPLACE FUNCTION create_material_stock_adjustment_atomic(
  p_material_id UUID,
  p_branch_id UUID,
  p_quantity_change NUMERIC,
  p_reason TEXT DEFAULT 'Stock Adjustment',
  p_unit_cost NUMERIC DEFAULT 0
)
RETURNS TABLE (
  success BOOLEAN,
  adjustment_id UUID,
  journal_id UUID,
  new_stock NUMERIC,
  error_message TEXT
) AS $$
DECLARE
  v_adjustment_id UUID;
  v_journal_id UUID;
  v_material_name TEXT;
  v_current_stock NUMERIC;
  v_new_stock NUMERIC;
  v_adjustment_value NUMERIC;
  v_bahan_baku_account_id UUID;
  v_selisih_account_id UUID;
  v_entry_number TEXT;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_material_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, 'Material ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_quantity_change = 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, 'Quantity change cannot be zero'::TEXT;
    RETURN;
  END IF;

  -- Get material info
  SELECT name, COALESCE(stock, 0) INTO v_material_name, v_current_stock
  FROM materials WHERE id = p_material_id;

  IF v_material_name IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, 'Material tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  v_new_stock := v_current_stock + p_quantity_change;
  IF v_new_stock < 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC,
      format('Stok tidak cukup. Stok saat ini: %s', v_current_stock)::TEXT;
    RETURN;
  END IF;

  v_adjustment_value := ABS(p_quantity_change) * COALESCE(p_unit_cost, 0);

  -- ==================== GET ACCOUNT IDS ====================

  SELECT id INTO v_bahan_baku_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1320' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_selisih_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '8100' AND is_active = TRUE LIMIT 1;

  -- ==================== UPDATE MATERIAL STOCK ====================

  UPDATE materials
  SET stock = v_new_stock, updated_at = NOW()
  WHERE id = p_material_id;

  v_adjustment_id := gen_random_uuid();

  -- ==================== CREATE/CONSUME MATERIAL BATCH ====================

  IF p_quantity_change > 0 THEN
    INSERT INTO material_batches (
      material_id, branch_id, initial_quantity, remaining_quantity,
      unit_cost, batch_date, reference_type, reference_id, notes, created_at
    ) VALUES (
      p_material_id, p_branch_id, p_quantity_change, p_quantity_change,
      COALESCE(p_unit_cost, 0), CURRENT_DATE, 'adjustment', v_adjustment_id::TEXT, p_reason, NOW()
    );
  ELSE
    PERFORM consume_material_fifo(
      p_material_id, p_branch_id, ABS(p_quantity_change),
      'adjustment', 'ADJ-' || v_adjustment_id::TEXT
    );
  END IF;

  -- ==================== CREATE STOCK MOVEMENT RECORD ====================

  INSERT INTO material_stock_movements (
    id, material_id, branch_id, type, quantity,
    reference_type, reference_id, notes, user_id, created_at
  ) VALUES (
    v_adjustment_id, p_material_id, p_branch_id,
    CASE WHEN p_quantity_change > 0 THEN 'adjustment_in' ELSE 'adjustment_out' END,
    ABS(p_quantity_change), 'adjustment', v_adjustment_id::TEXT, p_reason, auth.uid(), NOW()
  );

  -- ==================== CREATE JOURNAL ENTRY ====================

  IF v_adjustment_value > 0 AND v_bahan_baku_account_id IS NOT NULL AND v_selisih_account_id IS NOT NULL THEN
    SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
      (COALESCE((SELECT COUNT(*) + 1 FROM journal_entries WHERE branch_id = p_branch_id AND DATE(created_at) = CURRENT_DATE), 1))::TEXT, 4, '0')
    INTO v_entry_number;

    INSERT INTO journal_entries (id, branch_id, entry_number, entry_date, description, reference_type, reference_id, status, is_voided, created_at, updated_at)
    VALUES (gen_random_uuid(), p_branch_id, v_entry_number, CURRENT_DATE, 'Penyesuaian Stok Bahan - ' || v_material_name || ' - ' || p_reason, 'adjustment', v_adjustment_id::TEXT, 'posted', FALSE, NOW(), NOW())
    RETURNING id INTO v_journal_id;

    IF p_quantity_change > 0 THEN
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_name, debit_amount, credit_amount, description, line_number)
      VALUES (v_journal_id, v_bahan_baku_account_id, (SELECT name FROM accounts WHERE id = v_bahan_baku_account_id), v_adjustment_value, 0, 'Penambahan bahan baku', 1);
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_name, debit_amount, credit_amount, description, line_number)
      VALUES (v_journal_id, v_selisih_account_id, (SELECT name FROM accounts WHERE id = v_selisih_account_id), 0, v_adjustment_value, 'Selisih stok', 2);
    ELSE
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_name, debit_amount, credit_amount, description, line_number)
      VALUES (v_journal_id, v_selisih_account_id, (SELECT name FROM accounts WHERE id = v_selisih_account_id), v_adjustment_value, 0, 'Selisih stok', 1);
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_name, debit_amount, credit_amount, description, line_number)
      VALUES (v_journal_id, v_bahan_baku_account_id, (SELECT name FROM accounts WHERE id = v_bahan_baku_account_id), 0, v_adjustment_value, 'Pengurangan bahan baku', 2);
    END IF;
  END IF;

  RETURN QUERY SELECT TRUE, v_adjustment_id, v_journal_id, v_new_stock, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 3. TAX PAYMENT ATOMIC
-- Pembayaran/setor pajak dengan jurnal otomatis
-- ============================================================================

CREATE OR REPLACE FUNCTION create_tax_payment_atomic(
  p_branch_id UUID,
  p_period TEXT, -- YYYY-MM
  p_ppn_masukan_used NUMERIC DEFAULT 0,
  p_ppn_keluaran_paid NUMERIC DEFAULT 0,
  p_payment_account_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  payment_id UUID,
  journal_id UUID,
  net_payment NUMERIC,
  error_message TEXT
) AS $$
DECLARE
  v_payment_id UUID;
  v_journal_id UUID;
  v_net_payment NUMERIC;
  v_kas_account_id UUID;
  v_ppn_masukan_id UUID;
  v_ppn_keluaran_id UUID;
  v_entry_number TEXT;
  v_line_number INTEGER := 1;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  v_net_payment := p_ppn_keluaran_paid - p_ppn_masukan_used;

  IF v_net_payment <= 0 AND p_ppn_keluaran_paid = 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, 'Tidak ada pajak untuk disetor'::TEXT;
    RETURN;
  END IF;

  -- ==================== GET ACCOUNT IDS ====================

  IF p_payment_account_id IS NOT NULL THEN
    v_kas_account_id := p_payment_account_id;
  ELSE
    SELECT id INTO v_kas_account_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '1110' AND is_active = TRUE LIMIT 1;
  END IF;

  SELECT id INTO v_ppn_masukan_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1230' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_ppn_keluaran_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '2130' AND is_active = TRUE LIMIT 1;

  v_payment_id := gen_random_uuid();

  -- ==================== INSERT TAX PAYMENT RECORD ====================

  INSERT INTO tax_payments (
    id, branch_id, period, ppn_masukan_used, ppn_keluaran_paid,
    net_payment, payment_account_id, notes, created_by, created_at
  ) VALUES (
    v_payment_id, p_branch_id, p_period, p_ppn_masukan_used, p_ppn_keluaran_paid,
    v_net_payment, p_payment_account_id, p_notes, auth.uid(), NOW()
  );

  -- ==================== CREATE JOURNAL ENTRY ====================

  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE((SELECT COUNT(*) + 1 FROM journal_entries WHERE branch_id = p_branch_id AND DATE(created_at) = CURRENT_DATE), 1))::TEXT, 4, '0')
  INTO v_entry_number;

  INSERT INTO journal_entries (id, branch_id, entry_number, entry_date, description, reference_type, reference_id, status, is_voided, created_at, updated_at)
  VALUES (gen_random_uuid(), p_branch_id, v_entry_number, CURRENT_DATE, 'Setor Pajak Periode ' || p_period, 'tax_payment', v_payment_id::TEXT, 'posted', FALSE, NOW(), NOW())
  RETURNING id INTO v_journal_id;

  -- Dr. PPN Keluaran (mengurangi kewajiban)
  IF p_ppn_keluaran_paid > 0 AND v_ppn_keluaran_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_name, debit_amount, credit_amount, description, line_number)
    VALUES (v_journal_id, v_ppn_keluaran_id, (SELECT name FROM accounts WHERE id = v_ppn_keluaran_id), p_ppn_keluaran_paid, 0, 'Setor PPN Keluaran', v_line_number);
    v_line_number := v_line_number + 1;
  END IF;

  -- Cr. PPN Masukan (menggunakan kredit pajak)
  IF p_ppn_masukan_used > 0 AND v_ppn_masukan_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_name, debit_amount, credit_amount, description, line_number)
    VALUES (v_journal_id, v_ppn_masukan_id, (SELECT name FROM accounts WHERE id = v_ppn_masukan_id), 0, p_ppn_masukan_used, 'Kompensasi PPN Masukan', v_line_number);
    v_line_number := v_line_number + 1;
  END IF;

  -- Cr. Kas (pembayaran netto)
  IF v_net_payment > 0 AND v_kas_account_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_name, debit_amount, credit_amount, description, line_number)
    VALUES (v_journal_id, v_kas_account_id, (SELECT name FROM accounts WHERE id = v_kas_account_id), 0, v_net_payment, 'Pembayaran pajak', v_line_number);
  END IF;

  RETURN QUERY SELECT TRUE, v_payment_id, v_journal_id, v_net_payment, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION create_product_stock_adjustment_atomic(UUID, UUID, NUMERIC, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION create_material_stock_adjustment_atomic(UUID, UUID, NUMERIC, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION create_tax_payment_atomic(UUID, TEXT, NUMERIC, NUMERIC, UUID, TEXT) TO authenticated;


-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION create_product_stock_adjustment_atomic IS 'Adjust product stock with FIFO batch and journal entry.';
COMMENT ON FUNCTION create_material_stock_adjustment_atomic IS 'Adjust material stock with FIFO batch and journal entry.';
COMMENT ON FUNCTION create_tax_payment_atomic IS 'Process tax payment with proper PPN journal entries.';
