-- ============================================================================
-- RPC 11: Migration Delivery Journal
-- Purpose: Jurnal tambahan saat pengiriman barang dari transaksi migrasi
--
-- Saat barang dari transaksi migrasi dikirim:
-- 1. Modal Barang Dagang Tertahan (2140) → Pendapatan Penjualan
-- 2. HPP → Persediaan (sudah ditangani oleh process_delivery_atomic)
-- ============================================================================

DROP FUNCTION IF EXISTS process_migration_delivery_journal(UUID, NUMERIC, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION process_migration_delivery_journal(
  p_delivery_id UUID,
  p_delivery_value NUMERIC,      -- Nilai barang yang dikirim
  p_branch_id UUID,
  p_customer_name TEXT,
  p_transaction_id TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_modal_tertahan_id TEXT;
  v_pendapatan_id TEXT;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is REQUIRED'::TEXT;
    RETURN;
  END IF;

  IF p_delivery_value <= 0 THEN
    RETURN QUERY SELECT TRUE, NULL::UUID, 'No journal needed for zero value'::TEXT;
    RETURN;
  END IF;

  -- ==================== LOOKUP ACCOUNTS ====================

  -- Find Modal Barang Dagang Tertahan (2140)
  SELECT id INTO v_modal_tertahan_id
  FROM accounts
  WHERE (
    LOWER(name) LIKE '%modal%barang%tertahan%' OR
    LOWER(name) LIKE '%modal%dagang%tertahan%' OR
    code = '2140'
  )
  AND is_header = FALSE
  LIMIT 1;

  IF v_modal_tertahan_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Modal Barang Dagang Tertahan (2140) tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- Find Pendapatan Penjualan (4100)
  SELECT id INTO v_pendapatan_id
  FROM accounts
  WHERE (
    LOWER(name) LIKE '%pendapatan%penjualan%' OR
    LOWER(name) LIKE '%penjualan%' OR
    code = '4100'
  )
  AND is_header = FALSE
  AND type = 'revenue'
  LIMIT 1;

  IF v_pendapatan_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Pendapatan Penjualan tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- ==================== CREATE JOURNAL ENTRY ====================

  v_entry_number := 'JE-MIG-DEL-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
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
    CURRENT_DATE,
    format('[MIGRASI] Pengiriman Barang - %s', p_customer_name),
    'migration_delivery',
    p_delivery_id::TEXT,
    TRUE,
    p_branch_id,
    'System',
    NOW()
  )
  RETURNING id INTO v_journal_id;

  -- ==================== JOURNAL LINE ITEMS ====================

  -- Jurnal pengiriman migrasi:
  -- Dr Modal Barang Dagang Tertahan (2140)
  --    Cr Pendapatan Penjualan (4100)
  --
  -- Ini mengubah "utang sistem" → "penjualan sah"

  -- Debit: Modal Barang Dagang Tertahan
  INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit, description)
  VALUES (v_journal_id, v_modal_tertahan_id, p_delivery_value, 0,
    format('Pengiriman migrasi - %s', p_customer_name));

  -- Credit: Pendapatan Penjualan
  INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit, description)
  VALUES (v_journal_id, v_pendapatan_id, 0, p_delivery_value,
    format('Pendapatan penjualan migrasi - %s', p_customer_name));

  -- ==================== LOG ====================

  RAISE NOTICE '[Migration Delivery] Journal created for delivery % (Value: %)',
    p_delivery_id, p_delivery_value;

  RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- TRIGGER: Auto-call migration journal after delivery
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_migration_delivery_journal()
RETURNS TRIGGER AS $$
DECLARE
  v_transaction RECORD;
  v_is_migration BOOLEAN := FALSE;
  v_delivery_value NUMERIC := 0;
  v_item RECORD;
  v_result RECORD;
BEGIN
  -- Check if this delivery is for a migration transaction
  SELECT
    t.id,
    t.customer_name,
    t.notes,
    t.branch_id,
    t.items
  INTO v_transaction
  FROM transactions t
  WHERE t.id = NEW.transaction_id;

  -- Check if it's a migration transaction (notes contains [MIGRASI])
  IF v_transaction.notes IS NOT NULL AND v_transaction.notes LIKE '%[MIGRASI]%' THEN
    v_is_migration := TRUE;
  END IF;

  -- If migration, calculate delivery value and create journal
  IF v_is_migration THEN
    -- Calculate value of delivered items
    SELECT COALESCE(SUM(
      di.quantity_delivered * COALESCE(
        (SELECT (item->>'price')::NUMERIC
         FROM jsonb_array_elements(v_transaction.items) item
         WHERE item->>'product_id' = di.product_id::TEXT
         LIMIT 1
        ), 0)
    ), 0)
    INTO v_delivery_value
    FROM delivery_items di
    WHERE di.delivery_id = NEW.id;

    -- Create migration delivery journal
    IF v_delivery_value > 0 THEN
      SELECT * INTO v_result
      FROM process_migration_delivery_journal(
        NEW.id,
        v_delivery_value,
        v_transaction.branch_id,
        v_transaction.customer_name,
        v_transaction.id::TEXT
      );

      IF NOT v_result.success THEN
        RAISE WARNING 'Failed to create migration delivery journal: %', v_result.error_message;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_migration_delivery_journal ON deliveries;

-- Create trigger (fires after delivery is inserted with status = 'delivered')
CREATE TRIGGER trg_migration_delivery_journal
  AFTER INSERT ON deliveries
  FOR EACH ROW
  WHEN (NEW.status = 'delivered')
  EXECUTE FUNCTION trigger_migration_delivery_journal();

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION process_migration_delivery_journal(UUID, NUMERIC, UUID, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION process_migration_delivery_journal IS
  'Jurnal pengiriman untuk transaksi migrasi:
   - Dr Modal Barang Dagang Tertahan (2140)
   - Cr Pendapatan Penjualan (4100)
   Ini mengubah "utang sistem" menjadi "penjualan sah"';

COMMENT ON TRIGGER trg_migration_delivery_journal ON deliveries IS
  'Trigger otomatis untuk membuat jurnal saat barang dari transaksi migrasi dikirim';
