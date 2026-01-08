-- ============================================================================
-- RPC 10: Migration Transaction
-- Purpose: Import transaksi historis dari sistem lama
-- PENTING:
-- - TIDAK memotong stok (karena sudah diantar di sistem lama)
-- - TIDAK mencatat komisi (karena sudah dicatat di sistem lama)
-- - TIDAK mempengaruhi kas saat input
-- - TIDAK mempengaruhi pendapatan saat input (dicatat saat pengiriman nanti)
-- - Mencatat piutang dan modal barang dagang tertahan (2140)
-- - Sisa barang yang belum terkirim akan masuk ke daftar pengiriman
-- ============================================================================

DROP FUNCTION IF EXISTS create_migration_transaction(TEXT, UUID, TEXT, DATE, JSONB, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION create_migration_transaction(
  p_transaction_id TEXT,
  p_customer_id UUID,
  p_customer_name TEXT,
  p_order_date DATE,
  p_items JSONB,                      -- includes delivered_qty per item
  p_total NUMERIC,                    -- total transaction value
  p_delivered_value NUMERIC,          -- value of delivered items
  p_paid_amount NUMERIC DEFAULT 0,    -- amount already paid in old system
  p_payment_account_id TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_cashier_id TEXT DEFAULT NULL,
  p_cashier_name TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  transaction_id TEXT,
  journal_id UUID,
  delivery_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_journal_id UUID;
  v_delivery_id UUID;
  v_entry_number TEXT;
  v_piutang_account_id TEXT;
  v_modal_tertahan_account_id TEXT;
  v_kas_account_id TEXT;
  v_payment_status TEXT;
  v_transaction_notes TEXT;
  v_remaining_value NUMERIC;
  v_item JSONB;
  v_has_remaining_delivery BOOLEAN := FALSE;
  v_remaining_items JSONB := '[]'::JSONB;
  v_transaction_items JSONB := '[]'::JSONB;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, NULL::UUID,
      'Branch ID is REQUIRED'::TEXT;
    RETURN;
  END IF;

  IF p_customer_name IS NULL OR p_customer_name = '' THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, NULL::UUID,
      'Customer name is required'::TEXT;
    RETURN;
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, NULL::UUID,
      'At least one item is required'::TEXT;
    RETURN;
  END IF;

  IF p_total <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, NULL::UUID,
      'Total must be positive'::TEXT;
    RETURN;
  END IF;

  -- ==================== LOOKUP ACCOUNTS ====================

  -- Find Piutang Dagang account (1130)
  SELECT id INTO v_piutang_account_id
  FROM accounts
  WHERE (
    LOWER(name) LIKE '%piutang%dagang%' OR
    LOWER(name) LIKE '%piutang%usaha%' OR
    code = '1130'
  )
  AND is_header = FALSE
  LIMIT 1;

  IF v_piutang_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, NULL::UUID,
      'Akun Piutang Dagang tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- Find Modal Barang Dagang Tertahan account (2140)
  SELECT id INTO v_modal_tertahan_account_id
  FROM accounts
  WHERE (
    LOWER(name) LIKE '%modal%barang%tertahan%' OR
    LOWER(name) LIKE '%modal%dagang%tertahan%' OR
    code = '2140'
  )
  AND is_header = FALSE
  LIMIT 1;

  -- If not found, create it
  IF v_modal_tertahan_account_id IS NULL THEN
    INSERT INTO accounts (id, code, name, type, parent_id, is_header, balance, is_active, description)
    VALUES (
      '2140',
      '2140',
      'Modal Barang Dagang Tertahan',
      'liability',
      '2100', -- Assuming 2100 is Kewajiban Jangka Pendek header
      FALSE,
      0,
      TRUE,
      'Modal untuk barang yang sudah dijual tapi belum dikirim dari migrasi sistem lama'
    )
    ON CONFLICT (id) DO NOTHING;

    v_modal_tertahan_account_id := '2140';
  END IF;

  -- ==================== CALCULATE VALUES ====================

  -- Calculate remaining value (undelivered items)
  v_remaining_value := p_total - p_delivered_value;

  -- ==================== DETERMINE PAYMENT STATUS ====================

  IF p_paid_amount >= p_total THEN
    v_payment_status := 'Lunas';
  ELSE
    v_payment_status := 'Belum Lunas';
  END IF;

  -- ==================== BUILD TRANSACTION ITEMS ====================

  -- Process items and build remaining items for delivery
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    DECLARE
      v_qty INT := (v_item->>'quantity')::INT;
      v_delivered INT := COALESCE((v_item->>'delivered_qty')::INT, 0);
      v_remaining INT := v_qty - v_delivered;
      v_price NUMERIC := (v_item->>'price')::NUMERIC;
    BEGIN
      -- Add to transaction items with delivered info
      v_transaction_items := v_transaction_items || jsonb_build_object(
        'product_id', v_item->>'product_id',
        'product_name', v_item->>'product_name',
        'quantity', v_qty,
        'delivered_qty', v_delivered,
        'remaining_qty', v_remaining,
        'price', v_price,
        'unit', v_item->>'unit',
        'subtotal', v_qty * v_price,
        'is_migration', true
      );

      -- If there's remaining, mark for delivery
      IF v_remaining > 0 THEN
        v_has_remaining_delivery := TRUE;
        v_remaining_items := v_remaining_items || jsonb_build_object(
          'product_id', v_item->>'product_id',
          'product_name', v_item->>'product_name',
          'quantity', v_remaining,
          'price', v_price,
          'unit', v_item->>'unit'
        );
      END IF;
    END;
  END LOOP;

  -- ==================== BUILD NOTES ====================

  v_transaction_notes := '[MIGRASI] ';
  IF p_notes IS NOT NULL AND p_notes != '' THEN
    v_transaction_notes := v_transaction_notes || p_notes;
  ELSE
    v_transaction_notes := v_transaction_notes || 'Import data dari sistem lama';
  END IF;

  -- ==================== INSERT TRANSACTION ====================

  INSERT INTO transactions (
    id,
    customer_id,
    customer_name,
    cashier_id,
    cashier_name,
    order_date,
    items,
    total,
    subtotal,
    paid_amount,
    payment_status,
    payment_account_id,
    status,
    notes,
    branch_id,
    ppn_enabled,
    ppn_percentage,
    ppn_amount,
    created_at,
    updated_at
  ) VALUES (
    p_transaction_id,
    p_customer_id,
    p_customer_name,
    p_cashier_id,
    p_cashier_name,
    p_order_date,
    v_transaction_items,
    p_total,
    p_total, -- subtotal = total (no PPN for migration)
    p_paid_amount,
    v_payment_status,
    p_payment_account_id,
    CASE WHEN v_has_remaining_delivery THEN 'Dalam Pengiriman' ELSE 'Selesai' END,
    v_transaction_notes,
    p_branch_id,
    FALSE, -- No PPN
    0,
    0,
    NOW(),
    NOW()
  );

  -- ==================== CREATE JOURNAL ENTRY ====================

  -- Generate entry number
  v_entry_number := 'JE-MIG-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
                    LPAD((EXTRACT(EPOCH FROM NOW())::BIGINT % 10000)::TEXT, 4, '0');

  INSERT INTO journal_entries (
    entry_number,
    entry_date,
    description,
    reference_type,
    reference_id,
    is_posted,
    branch_id,
    created_by,
    created_at
  ) VALUES (
    v_entry_number,
    p_order_date,
    format('[MIGRASI] Penjualan - %s', p_customer_name),
    'migration_transaction',
    p_transaction_id,
    TRUE,
    p_branch_id,
    p_cashier_name,
    NOW()
  )
  RETURNING id INTO v_journal_id;

  -- ==================== JOURNAL LINE ITEMS ====================

  -- Jurnal migrasi:
  -- TIDAK mempengaruhi kas saat input
  -- TIDAK mempengaruhi pendapatan saat input
  --
  -- Untuk barang yang SUDAH dikirim (delivered):
  --   Debit: Piutang Dagang (delivered_value)
  --   Credit: Modal Barang Dagang Tertahan (delivered_value)
  --   (Pendapatan akan tercatat saat pembayaran piutang normal)
  --
  -- Untuk barang yang BELUM dikirim (remaining):
  --   Akan masuk ke daftar pengiriman, jurnal dicatat saat pengiriman
  --
  -- Jika ada pembayaran (paid_amount > 0):
  --   Jurnal terpisah untuk penerimaan kas
  --   Debit: Kas (paid_amount)
  --   Credit: Piutang Dagang (paid_amount)

  -- Journal for delivered items (Piutang vs Modal Tertahan)
  IF p_delivered_value > 0 THEN
    -- Debit: Piutang Dagang
    INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_journal_id, v_piutang_account_id, p_delivered_value, 0,
      format('Piutang penjualan migrasi - %s (barang sudah terkirim)', p_customer_name));

    -- Credit: Modal Barang Dagang Tertahan
    INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_journal_id, v_modal_tertahan_account_id, 0, p_delivered_value,
      format('Modal barang tertahan migrasi - %s', p_customer_name));
  END IF;

  -- Journal for remaining items (belum dikirim)
  IF v_remaining_value > 0 THEN
    -- Debit: Piutang Dagang (untuk nilai barang yang belum dikirim)
    INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_journal_id, v_piutang_account_id, v_remaining_value, 0,
      format('Piutang penjualan migrasi - %s (barang belum terkirim)', p_customer_name));

    -- Credit: Modal Barang Dagang Tertahan
    INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_journal_id, v_modal_tertahan_account_id, 0, v_remaining_value,
      format('Modal barang tertahan migrasi - %s (belum dikirim)', p_customer_name));
  END IF;

  -- ==================== JOURNAL FOR PAYMENT (if any) ====================

  IF p_paid_amount > 0 AND p_payment_account_id IS NOT NULL THEN
    DECLARE
      v_payment_journal_id UUID;
      v_payment_entry_number TEXT;
    BEGIN
      v_payment_entry_number := 'JE-MIG-PAY-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
                                LPAD((EXTRACT(EPOCH FROM NOW())::BIGINT % 10000)::TEXT, 4, '0');

      INSERT INTO journal_entries (
        entry_number,
        entry_date,
        description,
        reference_type,
        reference_id,
        is_posted,
        branch_id,
        created_by,
        created_at
      ) VALUES (
        v_payment_entry_number,
        p_order_date,
        format('[MIGRASI] Penerimaan Pembayaran - %s', p_customer_name),
        'migration_payment',
        p_transaction_id,
        TRUE,
        p_branch_id,
        p_cashier_name,
        NOW()
      )
      RETURNING id INTO v_payment_journal_id;

      -- Debit: Kas/Bank
      INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit, description)
      VALUES (v_payment_journal_id, p_payment_account_id, p_paid_amount, 0,
        format('Penerimaan pembayaran migrasi dari %s', p_customer_name));

      -- Credit: Piutang Dagang
      INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit, description)
      VALUES (v_payment_journal_id, v_piutang_account_id, 0, p_paid_amount,
        format('Pelunasan piutang migrasi %s', p_customer_name));
    END;
  END IF;

  -- ==================== CREATE PENDING DELIVERY (if remaining) ====================

  IF v_has_remaining_delivery THEN
    v_delivery_id := gen_random_uuid();

    INSERT INTO deliveries (
      id,
      transaction_id,
      customer_id,
      customer_name,
      items,
      status,
      notes,
      branch_id,
      created_at,
      updated_at
    ) VALUES (
      v_delivery_id,
      p_transaction_id,
      p_customer_id,
      p_customer_name,
      v_remaining_items,
      'Menunggu',
      '[MIGRASI] Sisa pengiriman dari sistem lama',
      p_branch_id,
      NOW(),
      NOW()
    );

    RAISE NOTICE '[Migration] Delivery % created for remaining items from transaction %',
      v_delivery_id, p_transaction_id;
  END IF;

  -- ==================== LOG ====================

  RAISE NOTICE '[Migration] Transaction % created for % (Total: %, Delivered: %, Remaining: %, Paid: %)',
    p_transaction_id, p_customer_name, p_total, p_delivered_value, v_remaining_value, p_paid_amount;

  RETURN QUERY SELECT TRUE, p_transaction_id, v_journal_id, v_delivery_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION create_migration_transaction(TEXT, UUID, TEXT, DATE, JSONB, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION create_migration_transaction IS
  'Import transaksi historis tanpa potong stok dan tanpa komisi.
   - Tidak mempengaruhi kas atau pendapatan saat input
   - Mencatat jurnal: Piutang vs Modal Barang Dagang Tertahan (2140)
   - Sisa barang belum terkirim masuk ke daftar pengiriman
   - Pembayaran dicatat sebagai jurnal terpisah';
