-- =====================================================
-- RPC Functions for table: deliveries
-- Generated: 2026-01-08T22:26:17.731Z
-- Total functions: 7
-- =====================================================

-- Function: generate_delivery_number
CREATE OR REPLACE FUNCTION public.generate_delivery_number()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  next_number INTEGER;
BEGIN
  -- Get the next delivery number for this transaction
  SELECT COALESCE(MAX(delivery_number), 0) + 1 
  INTO next_number
  FROM deliveries 
  WHERE transaction_id = NEW.transaction_id;
  
  -- Set the delivery number
  NEW.delivery_number = next_number;
  
  RETURN NEW;
END;
$function$
;


-- Function: get_delivery_with_employees
CREATE OR REPLACE FUNCTION public.get_delivery_with_employees(delivery_id_param uuid)
 RETURNS TABLE(id uuid, transaction_id text, delivery_number integer, delivery_date timestamp with time zone, photo_url text, photo_drive_id text, notes text, driver_name text, helper_name text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    d.id,
    d.transaction_id,
    d.delivery_number,
    d.delivery_date,
    d.photo_url,
    d.photo_drive_id,
    d.notes,
    driver.name as driver_name,
    helper.name as helper_name,
    d.created_at,
    d.updated_at
  FROM deliveries d
  LEFT JOIN employees driver ON d.driver_id = driver.id
  LEFT JOIN employees helper ON d.helper_id = helper.id
  WHERE d.id = delivery_id_param;
END;
$function$
;


-- Function: insert_delivery
CREATE OR REPLACE FUNCTION public.insert_delivery(p_transaction_id text, p_delivery_number integer, p_customer_name text, p_customer_address text DEFAULT ''::text, p_customer_phone text DEFAULT ''::text, p_delivery_date timestamp with time zone DEFAULT now(), p_photo_url text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_driver_id uuid DEFAULT NULL::uuid, p_helper_id uuid DEFAULT NULL::uuid, p_branch_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, transaction_id text, delivery_number integer, customer_name text, customer_address text, customer_phone text, delivery_date timestamp with time zone, photo_url text, notes text, driver_id uuid, helper_id uuid, branch_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO deliveries (
    transaction_id,
    delivery_number,
    customer_name,
    customer_address,
    customer_phone,
    delivery_date,
    photo_url,
    notes,
    driver_id,
    helper_id,
    branch_id
  )
  VALUES (
    p_transaction_id,
    p_delivery_number,
    p_customer_name,
    p_customer_address,
    p_customer_phone,
    p_delivery_date,
    p_photo_url,
    p_notes,
    p_driver_id,
    p_helper_id,
    p_branch_id
  )
  RETURNING deliveries.id INTO new_id;
  -- Return full row
  RETURN QUERY
  SELECT
    d.id,
    d.transaction_id,
    d.delivery_number,
    d.customer_name,
    d.customer_address,
    d.customer_phone,
    d.delivery_date,
    d.photo_url,
    d.notes,
    d.driver_id,
    d.helper_id,
    d.branch_id,
    d.created_at,
    d.updated_at
  FROM deliveries d
  WHERE d.id = new_id;
END;
$function$
;


-- Function: process_delivery_atomic
CREATE OR REPLACE FUNCTION public.process_delivery_atomic(p_transaction_id text, p_items jsonb, p_branch_id uuid, p_driver_id uuid DEFAULT NULL::uuid, p_helper_id uuid DEFAULT NULL::uuid, p_delivery_date timestamp with time zone DEFAULT now(), p_notes text DEFAULT NULL::text, p_photo_url text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, delivery_id uuid, delivery_number integer, total_hpp numeric, journal_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;


-- Function: process_delivery_atomic_no_stock
CREATE OR REPLACE FUNCTION public.process_delivery_atomic_no_stock(p_transaction_id text, p_items jsonb, p_branch_id uuid, p_driver_id uuid DEFAULT NULL::uuid, p_helper_id uuid DEFAULT NULL::uuid, p_delivery_date timestamp with time zone DEFAULT now(), p_notes text DEFAULT NULL::text, p_photo_url text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, delivery_id uuid, delivery_number integer, total_hpp numeric, journal_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
  v_item_type TEXT;
  v_material_id UUID;
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
    0, -- HPP is 0 for legacy data migration
    COALESCE(p_notes, format('Pengiriman ke-%s (Migrasi)', v_delivery_number)),
    p_photo_url,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_delivery_id;

  -- ==================== PROCESS ITEMS (NO STOCK DEDUCTION) ====================

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := NULL;
    v_material_id := NULL;
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_product_name := v_item->>'product_name';
    v_is_bonus := COALESCE((v_item->>'is_bonus')::BOOLEAN, FALSE);
    v_item_notes := v_item->>'notes';
    v_unit := v_item->>'unit';
    v_width := (v_item->>'width')::NUMERIC;
    v_height := (v_item->>'height')::NUMERIC;
    v_item_type := v_item->>'item_type';

    -- Determine if this is a material or product based on ID prefix
    IF (v_item->>'product_id') LIKE 'material-%' THEN
      v_material_id := (v_item->>'material_id')::UUID;
    ELSE
      v_product_id := (v_item->>'product_id')::UUID;
    END IF;

    IF v_qty > 0 THEN
       -- Insert Delivery Item ONLY
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

  -- NOTE: NO JOURNAL ENTRY CREATED
  -- NOTE: NO COMMISSION ENTRY CREATED

  RETURN QUERY SELECT
    TRUE,
    v_delivery_id,
    v_delivery_number,
    0::NUMERIC, -- Total HPP is 0
    NULL::UUID, -- No Journal
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, NULL::UUID, SQLERRM::TEXT;
END;
$function$
;


-- Function: process_delivery_atomic_no_stock
CREATE OR REPLACE FUNCTION public.process_delivery_atomic_no_stock(p_transaction_id text, p_items jsonb, p_branch_id uuid, p_driver_id uuid DEFAULT NULL::uuid, p_helper_id uuid DEFAULT NULL::uuid, p_delivery_date date DEFAULT CURRENT_DATE, p_notes text DEFAULT NULL::text, p_photo_url text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, delivery_id uuid, delivery_number integer, total_hpp numeric, journal_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
    0, -- HPP is 0 for legacy data migration
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
       -- Insert Delivery Item ONLY
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
  -- NOTE: NO JOURNAL ENTRY CREATED
  -- NOTE: NO COMMISSION ENTRY CREATED
  RETURN QUERY SELECT
    TRUE,
    v_delivery_id,
    v_delivery_number,
    0::NUMERIC, -- Total HPP is 0
    NULL::UUID, -- No Journal
    NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, NULL::UUID, SQLERRM::TEXT;
END;
$function$
;


-- Function: void_transaction_atomic
CREATE OR REPLACE FUNCTION public.void_transaction_atomic(p_transaction_id text, p_branch_id uuid, p_reason text DEFAULT 'Cancelled'::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(success boolean, items_restored integer, journals_voided integer, commissions_deleted integer, deliveries_deleted integer, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_transaction RECORD;
  v_items_restored INTEGER := 0;
  v_journals_voided INTEGER := 0;
  v_commissions_deleted INTEGER := 0;
  v_deliveries_deleted INTEGER := 0;
  v_item RECORD;
  v_batch RECORD;
  v_restore_qty NUMERIC;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0, 0, 0, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  -- Get transaction with row lock
  SELECT * INTO v_transaction
  FROM transactions
  WHERE id = p_transaction_id AND branch_id = p_branch_id
  FOR UPDATE;

  IF v_transaction.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0, 0, 0, 'Transaction not found'::TEXT;
    RETURN;
  END IF;

  -- ==================== RESTORE INVENTORY ====================

  -- IF Office Sale (immediate consume) OR already delivered (consume via delivery)
  IF v_transaction.is_office_sale OR v_transaction.delivery_status = 'Delivered' THEN
    -- Parse items from JSONB
    FOR v_item IN 
      SELECT 
        (elem->>'productId')::UUID as product_id,
        (elem->>'quantity')::NUMERIC as quantity
      FROM jsonb_array_elements(v_transaction.items) as elem
      WHERE (elem->>'productId') IS NOT NULL
    LOOP
      v_restore_qty := v_item.quantity;

      -- Restore to batches in LIFO order (newest first)
      FOR v_batch IN
        SELECT id, remaining_quantity, initial_quantity
        FROM inventory_batches
        WHERE product_id = v_item.product_id
          AND branch_id = p_branch_id
          AND remaining_quantity < initial_quantity
        ORDER BY batch_date DESC, created_at DESC
        FOR UPDATE
      LOOP
        EXIT WHEN v_restore_qty <= 0;

        DECLARE
          v_can_restore NUMERIC;
        BEGIN
          v_can_restore := LEAST(v_restore_qty, v_batch.initial_quantity - v_batch.remaining_quantity);

          UPDATE inventory_batches
          SET
            remaining_quantity = remaining_quantity + v_can_restore,
            updated_at = NOW()
          WHERE id = v_batch.id;

          v_restore_qty := v_restore_qty - v_can_restore;
        END;
      END LOOP;

      -- If still have qty to restore, create new batch
      IF v_restore_qty > 0 THEN
        INSERT INTO inventory_batches (
          product_id,
          branch_id,
          initial_quantity,
          remaining_quantity,
          unit_cost,
          batch_date,
          notes
        ) VALUES (
          v_item.product_id,
          p_branch_id,
          v_restore_qty,
          v_restore_qty,
          0,
          NOW(),
          format('Restored from void: %s', v_transaction.id)
        );
      END IF;
      
      v_items_restored := v_items_restored + 1;
    END LOOP;
  END IF;

  -- ==================== VOID JOURNALS ====================

  UPDATE journal_entries
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_reason = p_reason,
    status = 'voided',
    updated_at = NOW()
  WHERE reference_type = 'transaction'
    AND reference_id = p_transaction_id
    AND branch_id = p_branch_id
    AND is_voided = FALSE;

  GET DIAGNOSTICS v_journals_voided = ROW_COUNT;

  -- Void related delivery journals
  UPDATE journal_entries
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_reason = 'Transaction voided: ' || p_reason,
    status = 'voided',
    updated_at = NOW()
  WHERE reference_type = 'delivery'
    AND reference_id IN (SELECT id::TEXT FROM deliveries WHERE transaction_id = p_transaction_id)
    AND branch_id = p_branch_id
    AND is_voided = FALSE;

  -- ==================== DELETE COMMISSIONS ====================

  DELETE FROM commission_entries
  WHERE transaction_id = p_transaction_id AND branch_id = p_branch_id;

  GET DIAGNOSTICS v_commissions_deleted = ROW_COUNT;

  -- ==================== DELETE DELIVERIES ====================

  DELETE FROM delivery_items
  WHERE delivery_id IN (SELECT id FROM deliveries WHERE transaction_id = p_transaction_id);

  DELETE FROM deliveries
  WHERE transaction_id = p_transaction_id AND branch_id = p_branch_id;

  GET DIAGNOSTICS v_deliveries_deleted = ROW_COUNT;

  -- ==================== DELETE STOCK MOVEMENTS ====================

  DELETE FROM product_stock_movements
  WHERE reference_id = p_transaction_id AND reference_type IN ('transaction', 'delivery', 'fifo_consume');

  -- ==================== CANCEL RECEIVABLES ====================
  
  UPDATE receivables
  SET status = 'cancelled', updated_at = NOW()
  WHERE transaction_id = p_transaction_id AND branch_id = p_branch_id;

  -- ==================== DELETE TRANSACTION ====================

  -- Hard delete the transaction (not soft delete)
  DELETE FROM transactions
  WHERE id = p_transaction_id AND branch_id = p_branch_id;

  -- ==================== SUCCESS ====================

  RETURN QUERY SELECT
    TRUE,
    v_items_restored,
    v_journals_voided,
    v_commissions_deleted,
    v_deliveries_deleted,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0, 0, 0, 0, SQLERRM::TEXT;
END;

$function$
;


