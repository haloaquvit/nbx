-- ============================================================================
-- PATCH AMAN: FIX TYPE MISMATCH & LOGIC (TANPA RESET DATA)
-- Mengupdate fungsi process_delivery_atomic dan create_journal_atomic
-- ============================================================================

-- 1. Hapus versi fungsi yang salah (signature lama dengan UUID) untuk menghindari konflik
-- Ini HANYA menghapus 'rumus' fungsi yang error, TIDAK menghapus data transaksi/delivery.
DROP FUNCTION IF EXISTS process_delivery_atomic(UUID, UUID, UUID, DATE, TEXT);
DROP FUNCTION IF EXISTS process_delivery_atomic(UUID, JSONB, UUID, UUID, UUID, DATE, TEXT, TEXT);
DROP FUNCTION IF EXISTS process_delivery_atomic(UUID, JSONB, UUID, UUID, UUID, TIMESTAMP WITH TIME ZONE, TEXT, TEXT);

-- 2. Buat ulang fungsi process_delivery_atomic dengan parameter yang BENAR (TEXT untuk transaction_id)
CREATE OR REPLACE FUNCTION process_delivery_atomic(
  p_transaction_id TEXT,
  p_items JSONB,              -- Array: [{product_id, quantity, notes, unit, is_bonus, width, height, product_name}]
  p_branch_id UUID,           -- WAJIB: identitas cabang
  p_driver_id UUID DEFAULT NULL,
  p_helper_id UUID DEFAULT NULL,
  p_delivery_date DATE DEFAULT CURRENT_DATE,
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
  v_consume_result RECORD;
  v_total_hpp NUMERIC := 0;
  v_hpp_details TEXT := '';
  v_journal_id UUID;
  v_entry_number TEXT;
  v_hpp_account_id UUID;
  v_persediaan_id UUID;
  v_customer_name TEXT;
  v_total_ordered NUMERIC;
  v_total_delivered NUMERIC;
  v_new_status TEXT;
  v_product_id UUID;
  v_qty NUMERIC;
  v_product_name TEXT;
  v_is_bonus BOOLEAN;
  v_item_notes TEXT;
  v_unit TEXT;
  v_width NUMERIC;
  v_height NUMERIC;
  v_txn_items JSONB;
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

  -- Calculate next delivery number
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
    0, -- Will update later
    COALESCE(p_notes, format('Pengiriman ke-%s', v_delivery_number)),
    p_photo_url,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_delivery_id;

  -- ==================== PROCESS ITEMS & CONSUME STOCK ====================

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
       -- Insert Delivery Item
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

       -- Consume Stock (FIFO) - Only for Non-Office Sales
       -- Office sales deduct stock at transaction time
       IF NOT v_transaction.is_office_sale THEN
          SELECT * INTO v_consume_result
          FROM consume_inventory_fifo(
            v_product_id,
            p_branch_id,
            v_qty,
            COALESCE(v_transaction.ref, 'TR-UNKNOWN')
          );

          IF v_consume_result.success THEN
            v_total_hpp := v_total_hpp + v_consume_result.total_hpp;
            v_hpp_details := v_hpp_details || v_product_name || ' x' || v_qty || ', ';
          ELSE
            -- Log warning
            NULL;
          END IF;
       END IF;
    END IF;
  END LOOP;

  -- Update Delivery HPP Total
  UPDATE deliveries SET hpp_total = v_total_hpp WHERE id = v_delivery_id;

  -- ==================== UPDATE TRANSACTION STATUS ====================

  -- Check total ordered vs total delivered
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
    delivery_status = 'delivered', -- Legacy field
    delivered_at = NOW(),
    updated_at = NOW()
  WHERE id = p_transaction_id;

  -- ==================== CREATE HPP JOURNAL ====================
  
  IF NOT v_transaction.is_office_sale AND v_total_hpp > 0 THEN
    -- Get account IDs
    SELECT id INTO v_hpp_account_id
    FROM accounts
    WHERE code = '5100' AND branch_id = p_branch_id AND is_active = TRUE
    LIMIT 1;

    SELECT id INTO v_persediaan_id
    FROM accounts
    WHERE code = '1310' AND branch_id = p_branch_id AND is_active = TRUE
    LIMIT 1;

    IF v_hpp_account_id IS NOT NULL AND v_persediaan_id IS NOT NULL THEN
      v_entry_number := 'JE-' || TO_CHAR(p_delivery_date, 'YYYYMMDD') || '-' ||
        LPAD((SELECT COUNT(*) + 1 FROM journal_entries
              WHERE branch_id = p_branch_id
              AND DATE(created_at) = DATE(p_delivery_date))::TEXT, 4, '0');

      INSERT INTO journal_entries (
        entry_number,
        entry_date,
        description,
        reference_type,
        reference_id,
        branch_id,
        status,
        total_debit,
        total_credit
      ) VALUES (
        v_entry_number,
        p_delivery_date,
        format('HPP Pengiriman %s: %s', v_transaction.ref, v_transaction.customer_name),
        'transaction',
        v_delivery_id::TEXT,
        p_branch_id,
        'draft',
        v_total_hpp,
        v_total_hpp
      )
      RETURNING id INTO v_journal_id;

      -- Dr. HPP (5100)
      INSERT INTO journal_entry_lines (
        journal_entry_id,
        line_number,
        account_id,
        description,
        debit_amount,
        credit_amount
      ) VALUES (
        v_journal_id,
        1,
        v_hpp_account_id,
        format('HPP: %s', LEFT(v_hpp_details, 200)),
        v_total_hpp,
        0
      );

      -- Cr. Persediaan Barang Dagang (1310)
      INSERT INTO journal_entry_lines (
        journal_entry_id,
        line_number,
        account_id,
        description,
        debit_amount,
        credit_amount
      ) VALUES (
        v_journal_id,
        2,
        v_persediaan_id,
        format('Stock keluar: %s', v_transaction.ref),
        0,
        v_total_hpp
      );

      UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
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
            user_id,
            user_name,
            role,
            product_id,
            product_name,
            quantity,
            rate_per_qty,
            amount,
            transaction_id,
            delivery_id,
            ref,
            status,
            branch_id,
            created_at
          )
          SELECT 
            p_driver_id,
            (SELECT full_name FROM profiles WHERE id = p_driver_id),
            'driver',
            v_product_id,
            v_product_name,
            v_qty,
            cr.rate_per_qty,
            v_qty * cr.rate_per_qty,
            p_transaction_id,
            v_delivery_id,
            'DEL-' || v_delivery_id,
            'pending',
            p_branch_id,
            NOW()
          FROM commission_rules cr
          WHERE cr.product_id = v_product_id AND cr.role = 'driver' AND cr.rate_per_qty > 0;
        END IF;

        -- Helper Commission
        IF p_helper_id IS NOT NULL THEN
          INSERT INTO commission_entries (
            user_id,
            user_name,
            role,
            product_id,
            product_name,
            quantity,
            rate_per_qty,
            amount,
            transaction_id,
            delivery_id,
            ref,
            status,
            branch_id,
            created_at
          )
          SELECT 
            p_helper_id,
            (SELECT full_name FROM profiles WHERE id = p_helper_id),
            'helper',
            v_product_id,
            v_product_name,
            v_qty,
            cr.rate_per_qty,
            v_qty * cr.rate_per_qty,
            p_transaction_id,
            v_delivery_id,
            'DEL-' || v_delivery_id,
            'pending',
            p_branch_id,
            NOW()
          FROM commission_rules cr
          WHERE cr.product_id = v_product_id AND cr.role = 'helper' AND cr.rate_per_qty > 0;
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN QUERY SELECT
    TRUE,
    v_delivery_id,
    v_delivery_number,
    v_total_hpp,
    v_journal_id,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Update create_journal_atomic (Fix: Account lookup by CODE when ID is null)
CREATE OR REPLACE FUNCTION create_journal_atomic(
  p_entry_date TIMESTAMP,
  p_description TEXT,
  p_reference_type TEXT,
  p_branch_id UUID,
  p_lines JSONB,  -- Array of {account_id, account_code, debit_amount, credit_amount, description}
  p_reference_id TEXT DEFAULT NULL,
  p_auto_post BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (
  success BOOLEAN,
  journal_id UUID,
  entry_number TEXT,
  error_message TEXT
) AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_total_debit NUMERIC := 0;
  v_total_credit NUMERIC := 0;
  v_line RECORD;
  v_line_number INTEGER := 0;
BEGIN
  -- Validate branch
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Branch ID is required'::TEXT;
    RETURN;
  END IF;

  -- Validate lines
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Journal lines are required'::TEXT;
    RETURN;
  END IF;

  -- Calculate totals
  FOR v_line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
    account_id TEXT,
    debit_amount NUMERIC,
    credit_amount NUMERIC,
    description TEXT
  )
  LOOP
    v_total_debit := v_total_debit + COALESCE(v_line.debit_amount, 0);
    v_total_credit := v_total_credit + COALESCE(v_line.credit_amount, 0);
  END LOOP;

  -- Validate balance
  IF ABS(v_total_debit - v_total_credit) > 0.01 THEN
    RETURN QUERY SELECT
      FALSE,
      NULL::UUID,
      NULL::TEXT,
      format('Journal not balanced: Debit %s, Credit %s', v_total_debit, v_total_credit)::TEXT;
    RETURN;
  END IF;

  -- Check period closed
  DECLARE
    v_period_closed BOOLEAN;
  BEGIN
    SELECT EXISTS(
      SELECT 1 FROM closing_periods
      WHERE branch_id = p_branch_id
        AND year = EXTRACT(YEAR FROM p_entry_date)
    ) INTO v_period_closed;

    IF v_period_closed THEN
      RETURN QUERY SELECT
        FALSE,
        NULL::UUID,
        NULL::TEXT,
        format('Period %s is closed', EXTRACT(YEAR FROM p_entry_date))::TEXT;
      RETURN;
    END IF;
  END;

  -- Generate entry number
  v_entry_number := 'JE-' || TO_CHAR(p_entry_date, 'YYYYMMDD') || '-' ||
    LPAD((SELECT COUNT(*) + 1 FROM journal_entries WHERE branch_id = p_branch_id AND DATE(created_at) = DATE(p_entry_date))::TEXT, 4, '0') ||
    LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0');

  -- Create journal header as draft first (trigger blocks lines on posted)
  INSERT INTO journal_entries (
    entry_number,
    entry_date,
    description,
    reference_type,
    reference_id,
    branch_id,
    status,
    total_debit,
    total_credit
  ) VALUES (
    v_entry_number,
    p_entry_date,
    p_description,
    p_reference_type,
    p_reference_id,
    p_branch_id,
    'draft',
    v_total_debit,
    v_total_credit
  )
  RETURNING id INTO v_journal_id;

  -- Create journal lines
  v_line_number := 0;
  FOR v_line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
    account_id TEXT,
    account_code TEXT,
    debit_amount NUMERIC,
    credit_amount NUMERIC,
    description TEXT
  )
  LOOP
    v_line_number := v_line_number + 1;
    INSERT INTO journal_entry_lines (
      journal_entry_id,
      line_number,
      account_id,
      description,
      debit_amount,
      credit_amount
    ) VALUES (
      v_journal_id,
      v_line_number,
      CASE
        WHEN v_line.account_id IS NOT NULL THEN v_line.account_id::UUID
        ELSE (SELECT id FROM accounts WHERE code = v_line.account_code AND branch_id = p_branch_id LIMIT 1)
      END,
      v_line.description,
      COALESCE(v_line.debit_amount, 0),
      COALESCE(v_line.credit_amount, 0)
    );
  END LOOP;

  -- Post the journal if auto_post is true
  IF p_auto_post THEN
    UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
  END IF;

  RETURN QUERY SELECT TRUE, v_journal_id, v_entry_number, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql;
