-- ============================================================================
-- Migration: Fix Delivery RPC to use TIMESTAMPTZ instead of DATE
-- Purpose: Preserve full timestamp (date + time) for delivery operations
-- ============================================================================

-- Drop old functions first (to avoid signature conflicts)
DROP FUNCTION IF EXISTS process_delivery_atomic(TEXT, JSONB, UUID, UUID, UUID, DATE, TEXT, TEXT);
DROP FUNCTION IF EXISTS update_delivery_atomic(UUID, UUID, JSONB, UUID, UUID, DATE, TEXT, TEXT);
DROP FUNCTION IF EXISTS process_delivery_atomic_no_stock(TEXT, JSONB, UUID, UUID, UUID, DATE, TEXT, TEXT);

-- ============================================================================
-- 1. process_delivery_atomic with TIMESTAMPTZ
-- ============================================================================
CREATE OR REPLACE FUNCTION process_delivery_atomic(
  p_transaction_id TEXT,
  p_items JSONB,
  p_branch_id UUID,
  p_driver_id UUID DEFAULT NULL,
  p_helper_id UUID DEFAULT NULL,
  p_delivery_date TIMESTAMPTZ DEFAULT NOW(),
  p_notes TEXT DEFAULT NULL,
  p_photo_url TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  delivery_id UUID,
  delivery_number INTEGER,
  total_hpp NUMERIC,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_delivery_id UUID;
  v_transaction RECORD;
  v_item JSONB;
  v_consume_result RECORD;
  v_total_hpp_real NUMERIC := 0;
  v_journal_id UUID;
  v_acc_tertahan UUID;
  v_acc_persediaan UUID;
  v_delivery_number INTEGER;
  v_product_id UUID;
  v_qty NUMERIC;
  v_product_name TEXT;
  v_is_bonus BOOLEAN;
  v_total_ordered NUMERIC;
  v_total_delivered NUMERIC;
  v_new_status TEXT;
  v_hpp_account_id UUID;
  v_entry_number TEXT;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, NULL::UUID, 'Branch ID is REQUIRED'::TEXT;
    RETURN;
  END IF;

  IF p_transaction_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, NULL::UUID, 'Transaction ID is required'::TEXT;
    RETURN;
  END IF;

  -- Get Transaction
  SELECT * INTO v_transaction FROM transactions WHERE id = p_transaction_id;

  IF v_transaction.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, NULL::UUID, 'Transaction not found'::TEXT;
    RETURN;
  END IF;

  -- ==================== CREATE DELIVERY HEADER ====================
  SELECT COALESCE(MAX(d.delivery_number), 0) + 1 INTO v_delivery_number
  FROM deliveries d
  WHERE d.transaction_id = p_transaction_id;

  INSERT INTO deliveries (
    transaction_id, delivery_number, branch_id, status,
    customer_name, customer_address, customer_phone,
    driver_id, helper_id, delivery_date, notes, photo_url,
    created_at, updated_at
  )
  VALUES (
    p_transaction_id, v_delivery_number, p_branch_id, 'delivered',
    v_transaction.customer_name, NULL, NULL,
    p_driver_id, p_helper_id, p_delivery_date,
    COALESCE(p_notes, format('Pengiriman ke-%s', v_delivery_number)), p_photo_url,
    NOW(), NOW()
  )
  RETURNING id INTO v_delivery_id;

  -- ==================== CONSUME STOCK & ITEMS ====================

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      v_product_id := (v_item->>'product_id')::UUID;
      v_qty := (v_item->>'quantity')::NUMERIC;
      v_product_name := v_item->>'product_name';
      v_is_bonus := COALESCE((v_item->>'is_bonus')::BOOLEAN, FALSE);

      IF v_qty > 0 THEN
         INSERT INTO delivery_items (
           delivery_id, product_id, product_name, quantity_delivered, unit, is_bonus, notes, width, height, created_at
         ) VALUES (
           v_delivery_id, v_product_id, v_product_name, v_qty,
           COALESCE(v_item->>'unit', 'pcs'), v_is_bonus, v_item->>'notes',
           (v_item->>'width')::NUMERIC, (v_item->>'height')::NUMERIC, NOW()
         );

         IF NOT v_transaction.is_office_sale THEN
             SELECT * INTO v_consume_result FROM consume_inventory_fifo(
               v_product_id, p_branch_id, v_qty, COALESCE(v_transaction.ref, 'TR-UNKNOWN')
             );

             IF v_consume_result.success THEN
                v_total_hpp_real := v_total_hpp_real + v_consume_result.total_hpp;
             END IF;
         END IF;
      END IF;
  END LOOP;

  UPDATE deliveries SET hpp_total = v_total_hpp_real WHERE id = v_delivery_id;

  -- ==================== UPDATE TRANSACTION STATUS ====================

  SELECT COALESCE(SUM((item->>'quantity')::NUMERIC), 0) INTO v_total_ordered
  FROM jsonb_array_elements(v_transaction.items) item
  WHERE NOT COALESCE((item->>'_isSalesMeta')::BOOLEAN, FALSE);

  SELECT COALESCE(SUM(di.quantity_delivered), 0) INTO v_total_delivered
  FROM delivery_items di
  JOIN deliveries d ON d.id = di.delivery_id
  WHERE d.transaction_id = p_transaction_id;

  IF v_total_delivered >= v_total_ordered THEN
    v_new_status := 'Selesai';
  ELSE
    v_new_status := 'Diantar Sebagian';
  END IF;

  UPDATE transactions
  SET status = v_new_status, delivery_status = 'delivered', delivered_at = NOW(), updated_at = NOW()
  WHERE id = p_transaction_id;

  -- ==================== JOURNAL ENTRY ====================

  IF NOT v_transaction.is_office_sale AND v_total_hpp_real > 0 THEN
      SELECT id INTO v_acc_tertahan FROM accounts WHERE code = '2140' AND branch_id = p_branch_id LIMIT 1;
      SELECT id INTO v_acc_persediaan FROM accounts WHERE code = '1310' AND branch_id = p_branch_id LIMIT 1;

      IF v_acc_tertahan IS NOT NULL AND v_acc_persediaan IS NOT NULL THEN
         v_entry_number := 'JE-DEL-' || TO_CHAR(p_delivery_date, 'YYYYMMDD') || '-' ||
            LPAD((SELECT COUNT(*) + 1 FROM journal_entries WHERE branch_id = p_branch_id AND DATE(created_at) = DATE(p_delivery_date))::TEXT, 4, '0');

         INSERT INTO journal_entries (
           entry_number, entry_date, description, reference_type, reference_id, branch_id, status, total_debit, total_credit
         ) VALUES (
           v_entry_number, p_delivery_date, format('Pengiriman %s', v_transaction.ref), 'transaction', v_delivery_id::TEXT, p_branch_id, 'posted', v_total_hpp_real, v_total_hpp_real
         )
         RETURNING id INTO v_journal_id;

         INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
         VALUES (v_journal_id, 1, v_acc_tertahan, 'Realisasi Pengiriman', v_total_hpp_real, 0);

         INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
         VALUES (v_journal_id, 2, v_acc_persediaan, 'Barang Keluar Gudang', 0, v_total_hpp_real);
      END IF;
  END IF;

  -- ==================== GENERATE COMMISSIONS ====================

  IF p_driver_id IS NOT NULL OR p_helper_id IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      v_product_id := (v_item->>'product_id')::UUID;
      v_qty := (v_item->>'quantity')::NUMERIC;
      v_product_name := v_item->>'product_name';
      v_is_bonus := COALESCE((v_item->>'is_bonus')::BOOLEAN, FALSE);

      IF v_qty > 0 AND NOT v_is_bonus THEN
        IF p_driver_id IS NOT NULL THEN
          INSERT INTO commission_entries (
            user_id, user_name, role, product_id, product_name, quantity, rate_per_qty, amount,
            transaction_id, delivery_id, ref, status, branch_id, created_at
          )
          SELECT
            p_driver_id, (SELECT full_name FROM profiles WHERE id = p_driver_id), 'driver',
            v_product_id, v_product_name, v_qty, cr.rate_per_qty, v_qty * cr.rate_per_qty,
            p_transaction_id, v_delivery_id, 'DEL-' || v_delivery_id, 'pending', p_branch_id, NOW()
          FROM commission_rules cr
          WHERE cr.product_id = v_product_id AND cr.role = 'driver' AND cr.rate_per_qty > 0;
        END IF;

        IF p_helper_id IS NOT NULL THEN
          INSERT INTO commission_entries (
            user_id, user_name, role, product_id, product_name, quantity, rate_per_qty, amount,
            transaction_id, delivery_id, ref, status, branch_id, created_at
          )
          SELECT
            p_helper_id, (SELECT full_name FROM profiles WHERE id = p_helper_id), 'helper',
            v_product_id, v_product_name, v_qty, cr.rate_per_qty, v_qty * cr.rate_per_qty,
            p_transaction_id, v_delivery_id, 'DEL-' || v_delivery_id, 'pending', p_branch_id, NOW()
          FROM commission_rules cr
          WHERE cr.product_id = v_product_id AND cr.role = 'helper' AND cr.rate_per_qty > 0;
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN QUERY SELECT TRUE, v_delivery_id, v_delivery_number, v_total_hpp_real, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. update_delivery_atomic with TIMESTAMPTZ
-- ============================================================================
CREATE OR REPLACE FUNCTION update_delivery_atomic(
  p_delivery_id UUID,
  p_branch_id UUID,
  p_items JSONB,
  p_driver_id UUID DEFAULT NULL,
  p_helper_id UUID DEFAULT NULL,
  p_delivery_date TIMESTAMPTZ DEFAULT NOW(),
  p_notes TEXT DEFAULT NULL,
  p_photo_url TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  delivery_id UUID,
  total_hpp NUMERIC,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_delivery RECORD;
  v_transaction RECORD;
  v_item RECORD;
  v_new_item JSONB;
  v_restore_result RECORD;
  v_consume_result RECORD;
  v_total_hpp NUMERIC := 0;
  v_hpp_details TEXT := '';
  v_journal_id UUID;
  v_entry_number TEXT;
  v_hpp_account_id UUID;
  v_persediaan_id UUID;
  v_total_ordered NUMERIC;
  v_total_delivered NUMERIC;
  v_new_status TEXT;
  v_product_id UUID;
  v_qty NUMERIC;
  v_product_name TEXT;
  v_is_bonus BOOLEAN;
BEGIN
  -- 1. Validasi & Get current delivery
  SELECT * INTO v_delivery FROM deliveries WHERE id = p_delivery_id AND branch_id = p_branch_id;
  IF v_delivery.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID, 'Data pengiriman tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- 2. Restore Original Stock (FIFO)
  FOR v_item IN
    SELECT product_id, quantity_delivered as quantity, product_name
    FROM delivery_items
    WHERE delivery_id = p_delivery_id AND quantity_delivered > 0
  LOOP
    PERFORM restore_inventory_fifo(
      v_item.product_id,
      p_branch_id,
      v_item.quantity,
      0,
      format('update_delivery_rollback_%s', p_delivery_id)
    );
  END LOOP;

  -- 3. Void Old Journal & Commissions
  UPDATE journal_entries SET is_voided = TRUE, voided_reason = 'Delivery updated'
  WHERE reference_id = p_delivery_id::TEXT AND reference_type = 'payroll' AND branch_id = p_branch_id AND is_voided = FALSE;

  UPDATE journal_entries SET is_voided = TRUE, voided_reason = 'Delivery updated'
  WHERE reference_id = p_delivery_id::TEXT AND reference_type = 'adjustment' AND branch_id = p_branch_id AND is_voided = FALSE;

  DELETE FROM commission_entries WHERE delivery_id = p_delivery_id;

  -- 4. Update Delivery Header
  UPDATE deliveries
  SET
    driver_id = p_driver_id,
    helper_id = p_helper_id,
    delivery_date = p_delivery_date,
    notes = p_notes,
    photo_url = COALESCE(p_photo_url, photo_url),
    updated_at = NOW()
  WHERE id = p_delivery_id;

  -- 5. Refresh items
  DELETE FROM delivery_items WHERE delivery_id = p_delivery_id;

  FOR v_new_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_new_item->>'product_id')::UUID;
    v_qty := (v_new_item->>'quantity')::NUMERIC;
    v_product_name := v_new_item->>'product_name';
    v_is_bonus := COALESCE((v_new_item->>'is_bonus')::BOOLEAN, FALSE);

    IF v_qty > 0 THEN
      INSERT INTO delivery_items (
        delivery_id, product_id, product_name, quantity_delivered, unit,
        is_bonus, width, height, notes, created_at
      ) VALUES (
        p_delivery_id, v_product_id, v_product_name, v_qty, v_new_item->>'unit',
        v_is_bonus, (v_new_item->>'width')::NUMERIC, (v_new_item->>'height')::NUMERIC, v_new_item->>'notes', NOW()
      );

      IF NOT v_is_bonus THEN
        SELECT * INTO v_consume_result FROM consume_inventory_fifo_v3(
          v_product_id, p_branch_id, v_qty, format('delivery_update_%s', p_delivery_id)
        );

        IF NOT v_consume_result.success THEN
          RAISE EXCEPTION '%', v_consume_result.error_message;
        END IF;

        v_total_hpp := v_total_hpp + v_consume_result.total_hpp;
        v_hpp_details := v_hpp_details || v_product_name || ' x' || v_qty || ', ';
      END IF;
    END IF;
  END LOOP;

  -- 6. Update HPP Total on Delivery
  UPDATE deliveries SET hpp_total = v_total_hpp WHERE id = p_delivery_id;

  -- 7. Update Transaction Status
  SELECT * INTO v_transaction FROM transactions WHERE id::TEXT = v_delivery.transaction_id;

  SELECT COALESCE(SUM((item->>'quantity')::NUMERIC), 0) INTO v_total_ordered
  FROM jsonb_array_elements(v_transaction.items) item
  WHERE NOT COALESCE((item->>'_isSalesMeta')::BOOLEAN, FALSE);

  SELECT COALESCE(SUM(di.quantity_delivered), 0) INTO v_total_delivered
  FROM delivery_items di
  JOIN deliveries d ON d.id = di.delivery_id
  WHERE d.transaction_id = v_delivery.transaction_id;

  IF v_total_delivered >= v_total_ordered AND v_total_delivered > 0 THEN
    v_new_status := 'Selesai';
  ELSIF v_total_delivered > 0 THEN
    v_new_status := 'Diantar Sebagian';
  ELSE
    v_new_status := 'Pesanan Masuk';
  END IF;

  UPDATE transactions SET status = v_new_status, updated_at = NOW() WHERE id = v_transaction.id;

  -- 8. Create NEW HPP Journal
  IF NOT v_transaction.is_office_sale AND v_total_hpp > 0 THEN
    SELECT id INTO v_hpp_account_id FROM accounts WHERE code = '5100' AND branch_id = p_branch_id AND is_active = TRUE LIMIT 1;
    SELECT id INTO v_persediaan_id FROM accounts WHERE code = '1310' AND branch_id = p_branch_id AND is_active = TRUE LIMIT 1;

    IF v_hpp_account_id IS NOT NULL AND v_persediaan_id IS NOT NULL THEN
      v_entry_number := 'JE-' || TO_CHAR(p_delivery_date, 'YYYYMMDD') || '-' ||
        LPAD((SELECT COUNT(*) + 1 FROM journal_entries WHERE branch_id = p_branch_id AND DATE(created_at) = DATE(p_delivery_date))::TEXT, 4, '0');

      INSERT INTO journal_entries (
        entry_number, entry_date, description, reference_type, reference_id, branch_id, status, total_debit, total_credit
      ) VALUES (
        v_entry_number, NOW(), format('HPP Pengiriman %s (update)', v_transaction.ref), 'adjustment', p_delivery_id::TEXT, p_branch_id, 'posted', v_total_hpp, v_total_hpp
      ) RETURNING id INTO v_journal_id;

      INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
      VALUES
        (v_journal_id, 1, v_hpp_account_id, format('COGS: %s', v_transaction.ref), v_total_hpp, 0),
        (v_journal_id, 2, v_persediaan_id, format('Stock keluar: %s', v_transaction.ref), 0, v_total_hpp);
    END IF;
  END IF;

  -- 9. Re-generate Commissions
  IF p_driver_id IS NOT NULL OR p_helper_id IS NOT NULL THEN
    FOR v_new_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      v_product_id := (v_new_item->>'product_id')::UUID;
      v_qty := (v_new_item->>'quantity')::NUMERIC;
      v_is_bonus := COALESCE((v_new_item->>'is_bonus')::BOOLEAN, FALSE);

      IF v_qty > 0 AND NOT v_is_bonus THEN
        IF p_driver_id IS NOT NULL THEN
          INSERT INTO commission_entries (user_id, user_name, role, product_id, quantity, rate_per_qty, amount, delivery_id, status, branch_id, created_at)
          SELECT p_driver_id, (SELECT name FROM profiles WHERE id = p_driver_id), 'driver', v_product_id, v_qty, cr.rate_per_qty, v_qty * cr.rate_per_qty, p_delivery_id, 'pending', p_branch_id, NOW()
          FROM commission_rules cr WHERE cr.product_id = v_product_id AND cr.role = 'driver' AND cr.rate_per_qty > 0;
        END IF;

        IF p_helper_id IS NOT NULL THEN
          INSERT INTO commission_entries (user_id, user_name, role, product_id, quantity, rate_per_qty, amount, delivery_id, status, branch_id, created_at)
          SELECT p_helper_id, (SELECT name FROM profiles WHERE id = p_helper_id), 'helper', v_product_id, v_qty, cr.rate_per_qty, v_qty * cr.rate_per_qty, p_delivery_id, 'pending', p_branch_id, NOW()
          FROM commission_rules cr WHERE cr.product_id = v_product_id AND cr.role = 'helper' AND cr.rate_per_qty > 0;
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN QUERY SELECT TRUE, p_delivery_id, v_total_hpp, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 3. process_delivery_atomic_no_stock with TIMESTAMPTZ
-- ============================================================================
CREATE OR REPLACE FUNCTION process_delivery_atomic_no_stock(
  p_transaction_id TEXT,
  p_items JSONB,
  p_branch_id UUID,
  p_driver_id UUID DEFAULT NULL,
  p_helper_id UUID DEFAULT NULL,
  p_delivery_date TIMESTAMPTZ DEFAULT NOW(),
  p_notes TEXT DEFAULT NULL,
  p_photo_url TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  delivery_id UUID,
  delivery_number INTEGER,
  total_hpp NUMERIC,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_delivery_id UUID;
  v_delivery_number INTEGER;
  v_transaction RECORD;
  v_item JSONB;
  v_total_hpp NUMERIC := 0;
  v_product_id UUID;
  v_qty NUMERIC;
  v_product_name TEXT;
  v_is_bonus BOOLEAN;
  v_item_notes TEXT;
  v_unit TEXT;
  v_width NUMERIC;
  v_height NUMERIC;
  v_total_ordered NUMERIC;
  v_total_delivered NUMERIC;
  v_new_status TEXT;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, NULL::UUID,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT;
    RETURN;
  END IF;

  IF p_transaction_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, NULL::UUID,
      'Transaction ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, NULL::UUID,
      'No items to deliver'::TEXT;
    RETURN;
  END IF;

  -- Get transaction info
  SELECT
    t.id,
    t.ref,
    t.branch_id,
    t.customer_id,
    t.customer_name,
    t.items,
    t.status,
    t.is_office_sale,
    c.address as customer_address,
    c.phone as customer_phone
  INTO v_transaction
  FROM transactions t
  LEFT JOIN customers c ON c.id = t.customer_id
  WHERE t.id = p_transaction_id AND t.branch_id = p_branch_id;

  IF v_transaction.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, NULL::UUID,
      'Transaction not found in this branch'::TEXT;
    RETURN;
  END IF;

  -- ==================== CREATE DELIVERY HEADER ====================

  SELECT COALESCE(MAX(d.delivery_number), 0) + 1 INTO v_delivery_number
  FROM deliveries d
  WHERE d.transaction_id = p_transaction_id;

  INSERT INTO deliveries (
    transaction_id,
    delivery_number,
    branch_id,
    customer_name,
    customer_address,
    customer_phone,
    driver_id,
    helper_id,
    delivery_date,
    status,
    hpp_total,
    notes,
    photo_url,
    created_at,
    updated_at
  ) VALUES (
    p_transaction_id,
    v_delivery_number,
    p_branch_id,
    v_transaction.customer_name,
    v_transaction.customer_address,
    v_transaction.customer_phone,
    p_driver_id,
    p_helper_id,
    p_delivery_date,
    'delivered',
    0,
    COALESCE(p_notes, format('Pengiriman ke-%s (Migrasi)', v_delivery_number)),
    p_photo_url,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_delivery_id;

  -- ==================== PROCESS ITEMS (NO STOCK DEDUCTION) ====================

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_product_name := v_item->>'product_name';
    v_is_bonus := COALESCE((v_item->>'is_bonus')::BOOLEAN, FALSE);
    v_item_notes := v_item->>'notes';
    v_unit := v_item->>'unit';
    v_width := (v_item->>'width')::NUMERIC;
    v_height := (v_item->>'height')::NUMERIC;

    IF v_qty > 0 THEN
       INSERT INTO delivery_items (
         delivery_id,
         product_id,
         product_name,
         quantity_delivered,
         unit,
         is_bonus,
         width,
         height,
         notes,
         created_at
       ) VALUES (
         v_delivery_id,
         v_product_id,
         v_product_name,
         v_qty,
         COALESCE(v_unit, 'pcs'),
         v_is_bonus,
         v_width,
         v_height,
         v_item_notes,
         NOW()
       );
    END IF;
  END LOOP;

  -- ==================== UPDATE TRANSACTION STATUS ====================

  SELECT
    COALESCE(SUM(
      CASE WHEN (item->>'_isSalesMeta')::BOOLEAN THEN 0
      ELSE (item->>'quantity')::NUMERIC END
    ), 0)
  INTO v_total_ordered
  FROM jsonb_array_elements(v_transaction.items) item;

  SELECT
    COALESCE(SUM(di.quantity_delivered), 0)
  INTO v_total_delivered
  FROM delivery_items di
  JOIN deliveries d ON d.id = di.delivery_id
  WHERE d.transaction_id = p_transaction_id;

  IF v_total_delivered >= v_total_ordered THEN
    v_new_status := 'Selesai';
  ELSE
    v_new_status := 'Diantar Sebagian';
  END IF;

  UPDATE transactions
  SET
    status = v_new_status,
    delivery_status = 'delivered',
    delivered_at = NOW(),
    updated_at = NOW()
  WHERE id = p_transaction_id;

  RETURN QUERY SELECT
    TRUE,
    v_delivery_id,
    v_delivery_number,
    0::NUMERIC,
    NULL::UUID,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT EXECUTE ON FUNCTION process_delivery_atomic(TEXT, JSONB, UUID, UUID, UUID, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION process_delivery_atomic(TEXT, JSONB, UUID, UUID, UUID, TIMESTAMPTZ, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION update_delivery_atomic(UUID, UUID, JSONB, UUID, UUID, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_delivery_atomic(UUID, UUID, JSONB, UUID, UUID, TIMESTAMPTZ, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION process_delivery_atomic_no_stock(TEXT, JSONB, UUID, UUID, UUID, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- Done
-- ============================================================================
SELECT 'Delivery RPC functions updated to use TIMESTAMPTZ' as status;
