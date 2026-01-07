-- ============================================================================
-- RPC 05: Delivery Management (Atomic)
-- Purpose: Create delivery, consume stock (FIFO), generate HPP journal, commissions
-- Updated: Uses "Modal Barang Dagang Tertahan" flow (Accrual)
-- ============================================================================

-- Function to process delivery atomically
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
  v_total_hpp_real NUMERIC := 0; -- Based on REAL FIFO at delivery moment
  v_journal_id UUID;
  v_acc_tertahan TEXT;  -- Changed from UUID to TEXT for compatibility
  v_acc_persediaan TEXT;  -- Changed from UUID to TEXT for compatibility
  v_delivery_number INTEGER;
  v_product_id UUID;
  v_qty NUMERIC;
  v_product_name TEXT;
  v_is_bonus BOOLEAN;
  v_total_ordered NUMERIC;
  v_total_delivered NUMERIC;
  v_new_status TEXT;
  v_hpp_account_id TEXT;  -- Changed from UUID to TEXT for compatibility
  v_entry_number TEXT;
  v_counter_int INTEGER;
  v_item_type TEXT;
  v_material_id UUID;
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
  -- Fix: Explicit alias d.delivery_number to avoid ambiguity with output column 'delivery_number'
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
    v_transaction.customer_name, NULL, NULL, -- Assuming txn has these or can be null
    p_driver_id, p_helper_id, p_delivery_date, 
    COALESCE(p_notes, format('Pengiriman ke-%s', v_delivery_number)), p_photo_url,
    NOW(), NOW()
  )
  RETURNING id INTO v_delivery_id;

  -- ==================== CONSUME STOCK & ITEMS ====================

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_product_id := NULL;
        v_material_id := NULL;
        v_qty := (v_item->>'quantity')::NUMERIC;
        v_product_name := v_item->>'product_name';
        v_is_bonus := COALESCE((v_item->>'is_bonus')::BOOLEAN, FALSE);
        v_item_type := v_item->>'item_type'; -- 'product' or 'material'

        -- Determine if this is a material or product based on ID prefix
        IF (v_item->>'product_id') LIKE 'material-%' THEN
          -- This is a material item
          v_material_id := (v_item->>'material_id')::UUID;
        ELSE
          -- This is a regular product
          v_product_id := (v_item->>'product_id')::UUID;
        END IF;

        IF v_qty > 0 THEN
           -- Insert Item
           INSERT INTO delivery_items (
             delivery_id, product_id, product_name, quantity_delivered, unit, is_bonus, notes, width, height, created_at
           ) VALUES (
             v_delivery_id, v_product_id, v_product_name, v_qty, 
             COALESCE(v_item->>'unit', 'pcs'), v_is_bonus, v_item->>'notes', 
             (v_item->>'width')::NUMERIC, (v_item->>'height')::NUMERIC, NOW()
           );
           
           -- Consume Stock (FIFO) - Only if not office sale (already consumed)
           -- Check logic: Office sale consumes at transaction time.
           IF NOT v_transaction.is_office_sale THEN
               IF v_material_id IS NOT NULL THEN
                 -- This is a material - use consume_material_fifo
                 SELECT * INTO v_consume_result FROM consume_material_fifo(
                   v_material_id, p_branch_id, v_qty, COALESCE(v_transaction.ref, 'TR-UNKNOWN'), 'delivery'
                 );
                 
                 IF NOT v_consume_result.success THEN
                    RAISE EXCEPTION 'Gagal potong stok material: %', v_consume_result.error_message;
                 END IF;
                 
                 v_total_hpp_real := v_total_hpp_real + COALESCE(v_consume_result.total_cost, 0);
               ELSIF v_product_id IS NOT NULL THEN
                 -- This is a regular product - use consume_inventory_fifo
                 SELECT * INTO v_consume_result FROM consume_inventory_fifo(
                   v_product_id, p_branch_id, v_qty, COALESCE(v_transaction.ref, 'TR-UNKNOWN')
                 );
                 
                 IF NOT v_consume_result.success THEN
                    RAISE EXCEPTION 'Gagal potong stok produk: %', v_consume_result.error_message;
                 END IF;
                 
                 v_total_hpp_real := v_total_hpp_real + v_consume_result.total_hpp;
               END IF;
           END IF;
        END IF;
    END LOOP;

  -- Update Delivery HPP
  UPDATE deliveries SET hpp_total = v_total_hpp_real WHERE id = v_delivery_id;

  -- ==================== UPDATE TRANSACTION STATUS ====================
  
  -- Check total ordered vs total delivered
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
  -- Logic: Modal Tertahan (2140) vs Persediaan (1310)
  -- This clears the "Modal Tertahan" liability created during Invoice.
  
  IF NOT v_transaction.is_office_sale AND v_total_hpp_real > 0 THEN
      SELECT id INTO v_acc_tertahan FROM accounts WHERE code = '2140' AND branch_id = p_branch_id LIMIT 1;
      SELECT id INTO v_acc_persediaan FROM accounts WHERE code = '1310' AND branch_id = p_branch_id LIMIT 1;

      IF v_acc_tertahan IS NOT NULL AND v_acc_persediaan IS NOT NULL THEN
         -- Initialize counter based on entry_date, not created_at, to support backdating properly and avoid conflicts
         SELECT COUNT(*) INTO v_counter_int 
         FROM journal_entries 
         WHERE branch_id = p_branch_id AND DATE(entry_date) = DATE(p_delivery_date);
         
         LOOP
            v_counter_int := v_counter_int + 1;
            v_entry_number := 'JE-DEL-' || TO_CHAR(p_delivery_date, 'YYYYMMDD') || '-' ||
               LPAD(v_counter_int::TEXT, 4, '0');

            BEGIN
                INSERT INTO journal_entries (
                  entry_number, entry_date, description, reference_type, reference_id, branch_id, status, total_debit, total_credit
                ) VALUES (
                  v_entry_number, p_delivery_date, format('Pengiriman %s', v_transaction.ref), 'transaction', v_delivery_id::TEXT, p_branch_id, 'posted', v_total_hpp_real, v_total_hpp_real
                )
                RETURNING id INTO v_journal_id;
                
                EXIT; -- Insert successful
            EXCEPTION WHEN unique_violation THEN
                -- Try next number
                -- Loop will continue and increment v_counter_int
            END;
         END LOOP;

         -- Dr. Modal Barang Dagang Tertahan (Mengurangi Hutang Barang)
         INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
         VALUES (v_journal_id, 1, v_acc_tertahan, 'Realisasi Pengiriman', v_total_hpp_real, 0);

         -- Cr. Persediaan Barang Jadi (Stok Fisik Keluar)
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

      -- Skip bonus items
      IF v_qty > 0 AND NOT v_is_bonus THEN
        -- Driver Commission
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

        -- Helper Commission
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

GRANT EXECUTE ON FUNCTION process_delivery_atomic(TEXT, JSONB, UUID, UUID, UUID, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;
