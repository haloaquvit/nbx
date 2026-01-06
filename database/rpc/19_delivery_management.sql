-- ============================================================================
-- RPC 19: Delivery Management Atomic
-- Purpose: Update delivery secara atomik (Correct FIFO + Jurnal + Komisi)
-- ============================================================================

CREATE OR REPLACE FUNCTION update_delivery_atomic(
  p_delivery_id UUID,
  p_branch_id UUID,
  p_items JSONB,              -- [{product_id, quantity, is_bonus, notes, width, height, unit, product_name}]
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

  -- Get transaction to check is_office_sale
  SELECT * INTO v_transaction FROM transactions WHERE id::TEXT = v_delivery.transaction_id;

  -- 2. Restore Original Stock (FIFO)
  -- Kita kembalikan stok dari pengiriman lama sebelum memproses yang baru
  -- HANYA jika bukan laku kantor (karena laku kantor potong di transaksi)
  IF NOT COALESCE(v_transaction.is_office_sale, FALSE) THEN
    FOR v_item IN
      SELECT product_id, quantity_delivered as quantity, product_name
      FROM delivery_items
      WHERE delivery_id = p_delivery_id AND quantity_delivered > 0
    LOOP
      PERFORM restore_inventory_fifo(
        v_item.product_id,
        p_branch_id,
        v_item.quantity,
        0, -- Unit cost (will use estimates or specific batch if found)
        format('update_delivery_rollback_%s', p_delivery_id)
      );
    END LOOP;
  END IF;

  -- 3. Void Old Journal & Commissions
  UPDATE journal_entries SET is_voided = TRUE, voided_reason = 'Delivery updated' 
  WHERE reference_id = p_delivery_id::TEXT AND reference_type = 'payroll' AND branch_id = p_branch_id AND is_voided = FALSE;
  
  -- HPP Journal also needs to be voided
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

  -- 5. Refresh items: Delete old items and Process new items
  DELETE FROM delivery_items WHERE delivery_id = p_delivery_id;

  FOR v_new_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_new_item->>'product_id')::UUID;
    v_qty := (v_new_item->>'quantity')::NUMERIC;
    v_product_name := v_new_item->>'product_name';
    v_is_bonus := COALESCE((v_new_item->>'is_bonus')::BOOLEAN, FALSE);

    IF v_qty > 0 THEN
      -- Insert new delivery item
      INSERT INTO delivery_items (
        delivery_id, product_id, product_name, quantity_delivered, unit, 
        is_bonus, width, height, notes, created_at
      ) VALUES (
        p_delivery_id, v_product_id, v_product_name, v_qty, v_new_item->>'unit',
        v_is_bonus, (v_new_item->>'width')::NUMERIC, (v_new_item->>'height')::NUMERIC, v_new_item->>'notes', NOW()
      );

      -- Consume Stock (FIFO) - Only if not office sale (already consumed)
      IF NOT COALESCE(v_transaction.is_office_sale, FALSE) THEN
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
  -- Get total ordered from transaction
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
        -- Driver
        IF p_driver_id IS NOT NULL THEN
          INSERT INTO commission_entries (user_id, user_name, role, product_id, quantity, rate_per_qty, amount, delivery_id, status, branch_id, created_at)
          SELECT p_driver_id, (SELECT name FROM profiles WHERE id = p_driver_id), 'driver', v_product_id, v_qty, cr.rate_per_qty, v_qty * cr.rate_per_qty, p_delivery_id, 'pending', p_branch_id, NOW()
          FROM commission_rules cr WHERE cr.product_id = v_product_id AND cr.role = 'driver' AND cr.rate_per_qty > 0;
        END IF;

        -- Helper
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

-- GRANT
GRANT EXECUTE ON FUNCTION update_delivery_atomic(UUID, UUID, JSONB, UUID, UUID, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;
