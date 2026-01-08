-- =====================================================
-- RPC Functions for table: transactions
-- Generated: 2026-01-08T22:26:17.668Z
-- Total functions: 15
-- =====================================================

-- Function: audit_transactions_changes
CREATE OR REPLACE FUNCTION public.audit_transactions_changes()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.create_audit_log(
      'transactions',
      'DELETE',
      OLD.id,
      row_to_json(OLD)::JSONB,
      NULL,
      jsonb_build_object(
        'transaction_total', OLD.total,
        'customer_name', OLD.customer_name
      )
    );
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only log significant updates
    IF OLD.total != NEW.total OR OLD.payment_status != NEW.payment_status OR OLD.status != NEW.status THEN
      PERFORM public.create_audit_log(
        'transactions',
        'UPDATE',
        NEW.id,
        row_to_json(OLD)::JSONB,
        row_to_json(NEW)::JSONB,
        jsonb_build_object(
          'customer_name', NEW.customer_name,
          'old_total', OLD.total,
          'new_total', NEW.total,
          'old_status', OLD.status,
          'new_status', NEW.status
        )
      );
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM public.create_audit_log(
      'transactions',
      'INSERT',
      NEW.id,
      NULL,
      row_to_json(NEW)::JSONB,
      jsonb_build_object(
        'customer_name', NEW.customer_name,
        'total_amount', NEW.total
      )
    );
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$function$
;


-- Function: calculate_transaction_payment_status
CREATE OR REPLACE FUNCTION public.calculate_transaction_payment_status(p_transaction_id text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  transaction_total NUMERIC;
  total_paid NUMERIC;
BEGIN
  -- Get transaction total
  SELECT total INTO transaction_total FROM transactions WHERE id = p_transaction_id;
  IF transaction_total IS NULL THEN RETURN 'unknown'; END IF;
  
  -- Calculate total payments (active only)
  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM transaction_payments 
  WHERE transaction_id = p_transaction_id AND status = 'active';
  
  -- Return status
  IF total_paid = 0 THEN RETURN 'unpaid';
  ELSIF total_paid >= transaction_total THEN RETURN 'paid';
  ELSE RETURN 'partial';
  END IF;
END;
$function$
;


-- Function: cancel_transaction_v2
CREATE OR REPLACE FUNCTION public.cancel_transaction_v2(p_transaction_id text, p_user_id uuid, p_user_name text, p_reason text DEFAULT 'Cancelled'::text)
 RETURNS TABLE(success boolean, message text, journal_voided boolean, stock_restored boolean)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_transaction RECORD;
  v_item RECORD;
  v_journal_id UUID;
  v_restore_result RECORD;
BEGIN
  -- Get transaction
  SELECT * INTO v_transaction
  FROM transactions
  WHERE id = p_transaction_id;
  IF v_transaction IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Transaction not found'::TEXT, FALSE, FALSE;
    RETURN;
  END IF;
  IF v_transaction.is_cancelled = TRUE THEN
    RETURN QUERY SELECT FALSE, 'Transaction already cancelled'::TEXT, FALSE, FALSE;
    RETURN;
  END IF;
  -- 1. Mark transaction as cancelled
  UPDATE transactions
  SET
    is_cancelled = TRUE,
    cancelled_at = NOW(),
    cancelled_by = p_user_id,
    cancelled_by_name = p_user_name,
    cancel_reason = p_reason,
    updated_at = NOW()
  WHERE id = p_transaction_id;
  -- 2. Void related journal entry
  UPDATE journal_entries
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_by = p_user_id,
    voided_by_name = p_user_name,
    void_reason = p_reason,
    status = 'voided'
  WHERE reference_id = p_transaction_id
    AND reference_type = 'transaction'
    AND is_voided = FALSE;
  GET DIAGNOSTICS v_journal_id = ROW_COUNT;
  -- 3. Restore stock for each item (if office sale or already delivered)
  IF v_transaction.is_office_sale = TRUE THEN
    FOR v_item IN
      SELECT
        (elem->>'productId')::UUID as product_id,
        (elem->>'quantity')::NUMERIC as quantity
      FROM jsonb_array_elements(v_transaction.items) as elem
      WHERE elem->>'productId' IS NOT NULL
    LOOP
      PERFORM restore_stock_fifo_v2(
        v_item.product_id,
        v_item.quantity,
        p_transaction_id,
        'transaction',
        v_transaction.branch_id
      );
    END LOOP;
  END IF;
  RETURN QUERY SELECT TRUE, 'Transaction cancelled successfully'::TEXT, v_journal_id > 0, TRUE;
END;
$function$
;


-- Function: delete_transaction_cascade
CREATE OR REPLACE FUNCTION public.delete_transaction_cascade(p_transaction_id text, p_deleted_by uuid DEFAULT NULL::uuid, p_reason text DEFAULT 'Manual deletion'::text)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Soft delete payments
  UPDATE transaction_payments 
  SET status = 'deleted', cancelled_at = NOW(), cancelled_by = p_deleted_by,
      cancelled_reason = 'Transaction deleted: ' || p_reason
  WHERE transaction_id = p_transaction_id AND status = 'active';
  
  -- Delete main transaction (items are stored as JSONB, no separate table)
  DELETE FROM transactions WHERE id = p_transaction_id;
  
  RETURN TRUE;
END;
$function$
;


-- Function: get_delivery_summary
CREATE OR REPLACE FUNCTION public.get_delivery_summary(transaction_id_param text)
 RETURNS TABLE(product_id uuid, product_name text, ordered_quantity integer, delivered_quantity integer, remaining_quantity integer, unit text, width numeric, height numeric)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    p.product_id,
    p.product_name,
    p.ordered_quantity::INTEGER,
    COALESCE(di_summary.delivered_quantity, 0)::INTEGER,
    (p.ordered_quantity - COALESCE(di_summary.delivered_quantity, 0))::INTEGER,
    p.unit,
    p.width,
    p.height
  FROM (
    SELECT 
      (ti.product->>'id')::uuid as product_id,
      ti.product->>'name' as product_name,
      ti.quantity as ordered_quantity,
      ti.unit as unit,
      ti.width as width,
      ti.height as height
    FROM transactions t
    JOIN LATERAL jsonb_to_recordset(t.items) AS ti(
      product jsonb,
      quantity integer,
      unit text,
      width decimal,
      height decimal
    ) ON true
    WHERE t.id = transaction_id_param
  ) p
  LEFT JOIN (
    SELECT 
      di.product_id,
      SUM(di.quantity_delivered) as delivered_quantity
    FROM deliveries d
    JOIN delivery_items di ON di.delivery_id = d.id
    WHERE d.transaction_id = transaction_id_param
    GROUP BY di.product_id
  ) di_summary ON di_summary.product_id = p.product_id;
END;
$function$
;


-- Function: get_transactions_ready_for_delivery
CREATE OR REPLACE FUNCTION public.get_transactions_ready_for_delivery()
 RETURNS TABLE(id text, customer_name text, order_date timestamp with time zone, items jsonb, total numeric, status text)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.customer_name,
    t.order_date,
    t.items,
    t.total,
    t.status
  FROM transactions t
  WHERE t.status IN ('Siap Antar', 'Diantar Sebagian')
    AND (t.is_office_sale IS NULL OR t.is_office_sale = false)
  ORDER BY t.order_date ASC;
END;
$function$
;


-- Function: get_undelivered_goods_liability
CREATE OR REPLACE FUNCTION public.get_undelivered_goods_liability(p_branch_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(transaction_id text, customer_name text, transaction_total numeric, delivered_total numeric, undelivered_total numeric, status text, order_date timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH delivered_qty AS (
    SELECT 
      d.transaction_id as txn_id,
      di.product_id,
      SUM(di.quantity_delivered) as qty_delivered
    FROM deliveries d
    JOIN delivery_items di ON di.delivery_id = d.id
    WHERE (p_branch_id IS NULL OR d.branch_id = p_branch_id)
    GROUP BY d.transaction_id, di.product_id
  ),
  transaction_items AS (
    SELECT 
      t.id as txn_id,
      t.customer_name as cust_name,
      t.total as txn_total,
      t.status as txn_status,
      t.order_date as txn_date,
      (item->>'quantity')::numeric as qty_ordered,
      item->'product'->>'id' as prod_id,
      (item->>'price')::numeric as unit_price,
      item->>'isBonus' as is_bonus
    FROM transactions t
    CROSS JOIN LATERAL jsonb_array_elements(t.items) as item
    WHERE t.is_office_sale = false
    AND t.status NOT IN ('cancelled', 'Selesai', 'complete')
    AND (p_branch_id IS NULL OR t.branch_id = p_branch_id)
  ),
  undelivered AS (
    SELECT 
      ti.txn_id,
      ti.cust_name,
      ti.txn_total,
      ti.txn_status,
      ti.txn_date,
      ti.prod_id,
      COALESCE(ti.qty_ordered, 0) as qty_ordered,
      COALESCE(dq.qty_delivered, 0) as qty_delivered,
      COALESCE(ti.unit_price, 0) as unit_price,
      ti.is_bonus
    FROM transaction_items ti
    LEFT JOIN delivered_qty dq ON dq.txn_id = ti.txn_id AND dq.product_id::text = ti.prod_id
    WHERE ti.is_bonus != 'true' OR ti.is_bonus IS NULL
  )
  SELECT 
    u.txn_id::TEXT as transaction_id,
    u.cust_name::TEXT as customer_name,
    u.txn_total as transaction_total,
    SUM(u.qty_delivered * u.unit_price) as delivered_total,
    SUM((u.qty_ordered - u.qty_delivered) * u.unit_price) as undelivered_total,
    u.txn_status::TEXT as status,
    u.txn_date as order_date
  FROM undelivered u
  WHERE u.qty_ordered > u.qty_delivered
  GROUP BY u.txn_id, u.cust_name, u.txn_total, u.txn_status, u.txn_date
  HAVING SUM((u.qty_ordered - u.qty_delivered) * u.unit_price) > 0
  ORDER BY SUM((u.qty_ordered - u.qty_delivered) * u.unit_price) DESC;
END;
$function$
;


-- Function: pay_receivable
CREATE OR REPLACE FUNCTION public.pay_receivable(p_transaction_id text, p_amount numeric)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  current_paid_amount numeric;
  new_paid_amount numeric;
  total_amount numeric;
BEGIN
  SELECT paid_amount, total INTO current_paid_amount, total_amount
  FROM public.transactions
  WHERE id = p_transaction_id;
  new_paid_amount := current_paid_amount + p_amount;
  UPDATE public.transactions
  SET
    paid_amount = new_paid_amount,
    payment_status = CASE
      WHEN new_paid_amount >= total_amount THEN 'Lunas'
      ELSE 'Belum Lunas'
    END
  WHERE id = p_transaction_id;
END;
$function$
;


-- Function: pay_receivable_complete_rpc
CREATE OR REPLACE FUNCTION public.pay_receivable_complete_rpc(p_transaction_id text, p_amount numeric, p_payment_account_id text, p_notes text DEFAULT NULL::text, p_branch_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid, p_recorded_by_name text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, payment_id uuid, journal_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_transaction RECORD;
    v_payment_id UUID;
    v_journal_result RECORD;
    v_new_paid_amount NUMERIC;
    v_new_status TEXT;
BEGIN
    -- Get transaction info
    SELECT 
        t.id,
        t.total,
        t.paid_amount,
        t.payment_status,
        t.branch_id,
        t.customer_name
    INTO v_transaction
    FROM transactions t
    WHERE t.id = p_transaction_id;

    IF v_transaction.id IS NULL THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Transaction not found'::TEXT;
        RETURN;
    END IF;

    -- Use transaction's branch_id if not provided
    IF p_branch_id IS NULL THEN
        p_branch_id := v_transaction.branch_id;
    END IF;

    -- Validate amount
    IF p_amount <= 0 THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Amount must be positive'::TEXT;
        RETURN;
    END IF;

    v_new_paid_amount := COALESCE(v_transaction.paid_amount, 0) + p_amount;
    
    IF v_new_paid_amount > v_transaction.total THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Payment exceeds remaining balance'::TEXT;
        RETURN;
    END IF;

    -- Determine new payment status
    IF v_new_paid_amount >= v_transaction.total THEN
        v_new_status := 'Lunas';
    ELSIF v_new_paid_amount > 0 THEN
        v_new_status := 'Partial';
    ELSE
        v_new_status := 'Belum Lunas';
    END IF;

    -- 1. Update transaction
    UPDATE transactions
    SET 
        paid_amount = v_new_paid_amount,
        payment_status = v_new_status,
        updated_at = NOW()
    WHERE id = p_transaction_id;

    -- 2. Insert payment history
    INSERT INTO payment_history (
        transaction_id,
        branch_id,
        amount,
        remaining_amount,
        payment_method,
        account_id,
        payment_date,
        notes,
        recorded_by,
        recorded_by_name,
        created_at
    ) VALUES (
        p_transaction_id,
        p_branch_id,
        p_amount,
        (v_transaction.total - v_new_paid_amount),
        'Tunai',
        p_payment_account_id,
        NOW(),
        p_notes,
        p_user_id,
        p_recorded_by_name,
        NOW()
    ) RETURNING id INTO v_payment_id;

    -- 3. Create journal entry via RPC
    SELECT * INTO v_journal_result
    FROM create_receivable_payment_journal_rpc(
        p_branch_id,
        p_transaction_id,
        CURRENT_DATE,
        p_amount,
        v_transaction.customer_name,
        p_payment_account_id
    );

    IF NOT v_journal_result.success THEN
        RAISE EXCEPTION 'Failed to create journal: %', v_journal_result.error_message;
    END IF;

    RETURN QUERY SELECT 
        TRUE, 
        v_payment_id, 
        v_journal_result.journal_id,
        NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, SQLERRM::TEXT;
END;
$function$
;


-- Function: pay_receivable_with_history
CREATE OR REPLACE FUNCTION public.pay_receivable_with_history(p_transaction_id text, p_amount numeric, p_account_id text DEFAULT NULL::text, p_account_name text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_recorded_by text DEFAULT NULL::text, p_recorded_by_name text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_transaction RECORD;
  v_remaining_amount NUMERIC;
BEGIN
  -- Get current transaction
  SELECT * INTO v_transaction FROM public.transactions WHERE id = p_transaction_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;
  
  -- Calculate remaining amount after this payment
  v_remaining_amount := v_transaction.total - (v_transaction.paid_amount + p_amount);
  
  IF v_remaining_amount < 0 THEN
    RAISE EXCEPTION 'Payment amount exceeds remaining balance';
  END IF;
  
  -- Update transaction
  UPDATE public.transactions 
  SET 
    paid_amount = paid_amount + p_amount,
    payment_status = CASE 
      WHEN paid_amount + p_amount >= total THEN 'Lunas'
      ELSE 'Belum Lunas'
    END
  WHERE id = p_transaction_id;
  
  -- Record payment history
  INSERT INTO public.payment_history (
    transaction_id,
    amount,
    payment_date,
    remaining_amount,
    account_id,
    account_name,
    notes,
    recorded_by,
    recorded_by_name
  ) VALUES (
    p_transaction_id,
    p_amount,
    NOW(),
    v_remaining_amount,
    p_account_id,
    p_account_name,
    p_notes,
    CASE WHEN p_recorded_by IS NOT NULL AND p_recorded_by ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' 
         THEN p_recorded_by::uuid 
         ELSE NULL 
    END,
    p_recorded_by_name
  );
END;
$function$
;


-- Function: trigger_migration_delivery_journal
CREATE OR REPLACE FUNCTION public.trigger_migration_delivery_journal()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$
;


-- Function: update_transaction_atomic
CREATE OR REPLACE FUNCTION public.update_transaction_atomic(p_transaction_id text, p_transaction jsonb, p_branch_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_user_name text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, transaction_id text, journal_id uuid, changes_made text[], error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_old_transaction RECORD;
  v_new_total NUMERIC;
  v_new_paid_amount NUMERIC;
  v_changes TEXT[] := '{}';
  v_journal_id UUID;
  v_journal_lines JSONB := '[]'::JSONB;
  v_customer_name TEXT;
  v_date DATE;
  v_total_hpp NUMERIC := 0;
  v_fifo_result RECORD;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, '{}'::TEXT[],
      'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_transaction_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, '{}'::TEXT[],
      'Transaction ID is required'::TEXT;
    RETURN;
  END IF;

  -- Get existing transaction
  SELECT * INTO v_old_transaction
  FROM transactions
  WHERE id = p_transaction_id AND branch_id = p_branch_id;

  IF v_old_transaction.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, '{}'::TEXT[],
      'Transaction not found in this branch'::TEXT;
    RETURN;
  END IF;

  -- ==================== PARSE NEW DATA ====================

  v_new_total := COALESCE((p_transaction->>'total')::NUMERIC, v_old_transaction.total);
  v_new_paid_amount := COALESCE((p_transaction->>'paid_amount')::NUMERIC, v_old_transaction.paid_amount);
  v_customer_name := COALESCE(p_transaction->>'customer_name', v_old_transaction.customer_name);
  v_date := COALESCE(v_old_transaction.order_date, CURRENT_DATE);

  -- Detect changes
  IF v_new_total != v_old_transaction.total THEN
    v_changes := array_append(v_changes, 'total');
  END IF;
  IF v_new_paid_amount != v_old_transaction.paid_amount THEN
    v_changes := array_append(v_changes, 'paid_amount');
  END IF;

  -- ==================== UPDATE TRANSACTION ====================

  UPDATE transactions SET
    total = v_new_total,
    paid_amount = v_new_paid_amount,
    payment_status = CASE WHEN v_new_paid_amount >= v_new_total THEN 'Lunas' ELSE 'Belum Lunas' END,
    customer_name = v_customer_name,
    notes = COALESCE(p_transaction->>'notes', notes),
    updated_at = NOW()
  WHERE id = p_transaction_id;

  -- ==================== UPDATE JOURNAL IF AMOUNTS CHANGED ====================

  IF 'total' = ANY(v_changes) OR 'paid_amount' = ANY(v_changes) THEN
    -- Void old journal
    UPDATE journal_entries
    SET is_voided = TRUE, voided_at = NOW(), voided_reason = 'Transaction updated'
    WHERE reference_type = 'transaction'
      AND reference_id = p_transaction_id
      AND branch_id = p_branch_id
      AND is_voided = FALSE;

    -- Calculate HPP from items
    SELECT COALESCE(SUM((item->>'hppAmount')::NUMERIC), 0) INTO v_total_hpp
    FROM jsonb_array_elements(v_old_transaction.items) AS item;

    -- Build new journal lines
    v_journal_lines := '[]'::JSONB;

    -- Debit: Kas atau Piutang
    IF v_new_paid_amount >= v_new_total THEN
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', '1110',
        'debit_amount', v_new_total,
        'credit_amount', 0,
        'description', 'Penerimaan kas dari penjualan'
      );
    ELSIF v_new_paid_amount > 0 THEN
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', '1110',
        'debit_amount', v_new_paid_amount,
        'credit_amount', 0,
        'description', 'Penerimaan kas dari penjualan'
      );
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', '1210',
        'debit_amount', v_new_total - v_new_paid_amount,
        'credit_amount', 0,
        'description', 'Piutang usaha'
      );
    ELSE
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', '1210',
        'debit_amount', v_new_total,
        'credit_amount', 0,
        'description', 'Piutang usaha'
      );
    END IF;

    -- Credit: Pendapatan
    v_journal_lines := v_journal_lines || jsonb_build_object(
      'account_code', '4100',
      'debit_amount', 0,
      'credit_amount', v_new_total,
      'description', 'Pendapatan penjualan'
    );

    -- HPP entries
    IF v_total_hpp > 0 THEN
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', '5100',
        'debit_amount', v_total_hpp,
        'credit_amount', 0,
        'description', 'Harga Pokok Penjualan'
      );
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', '1310',
        'debit_amount', 0,
        'credit_amount', v_total_hpp,
        'description', 'Pengurangan persediaan'
      );
    END IF;

    -- Create new journal
    SELECT * INTO v_fifo_result FROM create_journal_atomic(
      p_branch_id,
      v_date,
      'Penjualan ke ' || COALESCE(v_customer_name, 'Umum') || ' - ' || p_transaction_id || ' (Updated)',
      'transaction',
      p_transaction_id,
      v_journal_lines,
      TRUE
    );

    IF v_fifo_result.success THEN
      v_journal_id := v_fifo_result.journal_id;
    END IF;

    v_changes := array_append(v_changes, 'journal_updated');
  END IF;

  RETURN QUERY SELECT TRUE, p_transaction_id, v_journal_id, v_changes, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, '{}'::TEXT[], SQLERRM::TEXT;
END;
$function$
;


-- Function: update_transaction_delivery_status
CREATE OR REPLACE FUNCTION public.update_transaction_delivery_status()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  transaction_record RECORD;
  total_ordered INTEGER;
  total_delivered INTEGER;
  item_record RECORD;
BEGIN
  -- Get transaction details
  SELECT * INTO transaction_record
  FROM transactions
  WHERE id = (
    SELECT transaction_id
    FROM deliveries
    WHERE id = COALESCE(NEW.delivery_id, OLD.delivery_id)
  );
  -- Skip jika transaksi adalah laku kantor
  IF transaction_record.is_office_sale = true THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  -- Calculate total quantity ordered vs delivered untuk setiap item
  FOR item_record IN
    SELECT
      p.product_id,  -- FIXED: use p.product_id instead of ti.product_id
      ti.quantity as ordered_quantity,
      COALESCE(SUM(di.quantity_delivered), 0) as delivered_quantity
    FROM transactions t
    JOIN LATERAL jsonb_to_recordset(t.items) AS ti(
      product jsonb,
      quantity integer
    ) ON true
    JOIN LATERAL (SELECT (ti.product->>'id')::uuid as product_id) p ON true
    LEFT JOIN deliveries d ON d.transaction_id = t.id
    LEFT JOIN delivery_items di ON di.delivery_id = d.id AND di.product_id = p.product_id
    WHERE t.id = transaction_record.id
    GROUP BY p.product_id, ti.quantity
  LOOP
    -- Jika ada item yang belum selesai diantar
    IF item_record.delivered_quantity < item_record.ordered_quantity THEN
      -- Jika sudah ada pengantaran tapi belum lengkap
      IF item_record.delivered_quantity > 0 THEN
        UPDATE transactions
        SET status = 'Diantar Sebagian'
        WHERE id = transaction_record.id;
        RETURN COALESCE(NEW, OLD);
      ELSE
        -- Belum ada pengantaran sama sekali, tetap status saat ini
        RETURN COALESCE(NEW, OLD);
      END IF;
    END IF;
  END LOOP;
  -- Jika sampai sini, berarti semua item sudah diantar lengkap
  UPDATE transactions
  SET status = 'Selesai'
  WHERE id = transaction_record.id;
  RETURN COALESCE(NEW, OLD);
END;
$function$
;


-- Function: update_transaction_status_from_delivery
CREATE OR REPLACE FUNCTION public.update_transaction_status_from_delivery()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  transaction_id TEXT;
  total_items INTEGER;
  delivered_items INTEGER;
  cancelled_deliveries INTEGER;
BEGIN
  -- Get transaction ID from delivery
  transaction_id := COALESCE(NEW.transaction_id, OLD.transaction_id);
  
  IF transaction_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  -- Count total items in transaction (from transaction items)
  SELECT COALESCE(jsonb_array_length(items), 0)
  INTO total_items
  FROM public.transactions 
  WHERE id = transaction_id;
  
  -- Count delivered items from all deliveries for this transaction
  SELECT 
    COALESCE(SUM(CASE WHEN d.status = 'delivered' THEN di.quantity_delivered ELSE 0 END), 0),
    COUNT(CASE WHEN d.status = 'cancelled' THEN 1 END)
  INTO delivered_items, cancelled_deliveries
  FROM public.deliveries d
  LEFT JOIN public.delivery_items di ON d.id = di.delivery_id  
  WHERE d.transaction_id = transaction_id;
  
  -- Update transaction status based on delivery progress
  IF cancelled_deliveries > 0 AND delivered_items = 0 THEN
    -- All deliveries cancelled, no items delivered
    UPDATE public.transactions 
    SET status = 'Dibatalkan' 
    WHERE id = transaction_id AND status != 'Dibatalkan';
    
  ELSIF delivered_items = 0 THEN
    -- No items delivered yet, but delivery exists
    UPDATE public.transactions 
    SET status = 'Siap Antar' 
    WHERE id = transaction_id AND status NOT IN ('Siap Antar', 'Diantar Sebagian', 'Selesai');
    
  ELSIF delivered_items > 0 AND delivered_items < total_items THEN
    -- Partial delivery completed
    UPDATE public.transactions 
    SET status = 'Diantar Sebagian' 
    WHERE id = transaction_id AND status != 'Diantar Sebagian';
    
  ELSIF delivered_items >= total_items THEN
    -- All items delivered
    UPDATE public.transactions 
    SET status = 'Selesai' 
    WHERE id = transaction_id AND status != 'Selesai';
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$function$
;


-- Function: void_payment_history_rpc
CREATE OR REPLACE FUNCTION public.void_payment_history_rpc(p_payment_id uuid, p_branch_id uuid, p_reason text DEFAULT 'Pembayaran dibatalkan'::text)
 RETURNS TABLE(success boolean, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_payment RECORD;
    v_transaction RECORD;
BEGIN
    -- Validasi branch_id
    IF p_branch_id IS NULL THEN
        RETURN QUERY SELECT FALSE, 'Branch ID is required'::TEXT;
        RETURN;
    END IF;

    -- Get payment info
    SELECT 
        ph.id,
        ph.transaction_id,
        ph.amount,
        ph.branch_id,
        ph.payment_date
    INTO v_payment
    FROM payment_history ph
    WHERE ph.id = p_payment_id
      AND ph.branch_id = p_branch_id;

    IF v_payment.id IS NULL THEN
        RETURN QUERY SELECT FALSE, 'Payment not found in this branch'::TEXT;
        RETURN;
    END IF;

    -- Get transaction info
    SELECT 
        t.id,
        t.total,
        t.paid_amount,
        t.payment_status
    INTO v_transaction
    FROM transactions t
    WHERE t.id = v_payment.transaction_id;

    IF v_transaction.id IS NULL THEN
        RETURN QUERY SELECT FALSE, 'Transaction not found'::TEXT;
        RETURN;
    END IF;

    -- Update transaction: reduce paid_amount
    UPDATE transactions
    SET 
        paid_amount = GREATEST(0, COALESCE(paid_amount, 0) - v_payment.amount),
        payment_status = CASE 
            WHEN GREATEST(0, COALESCE(paid_amount, 0) - v_payment.amount) >= total THEN 'Lunas'
            WHEN GREATEST(0, COALESCE(paid_amount, 0) - v_payment.amount) > 0 THEN 'Partial'
            ELSE 'Belum Lunas'
        END,
        updated_at = NOW()
    WHERE id = v_payment.transaction_id;

    -- Delete payment history record
    DELETE FROM payment_history
    WHERE id = p_payment_id;

    -- Void related journal entry if exists
    UPDATE journal_entries
    SET 
        is_voided = TRUE,
        voided_at = NOW(),
        void_reason = p_reason
    WHERE reference_type = 'receivable_payment'
      AND reference_id = p_payment_id::TEXT
      AND branch_id = p_branch_id;

    RETURN QUERY SELECT TRUE, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT FALSE, SQLERRM::TEXT;
END;
$function$
;


