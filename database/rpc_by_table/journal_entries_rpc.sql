-- =====================================================
-- RPC Functions for table: journal_entries
-- Generated: 2026-01-08T22:26:17.729Z
-- Total functions: 11
-- =====================================================

-- Function: delete_zakat_record_atomic
CREATE OR REPLACE FUNCTION public.delete_zakat_record_atomic(p_branch_id uuid, p_zakat_id text)
 RETURNS TABLE(success boolean, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Void Journals
  UPDATE journal_entries
  SET is_voided = TRUE, status = 'voided', voided_reason = 'Zakat record deleted'
  WHERE reference_id = p_zakat_id AND reference_type = 'zakat' AND is_voided = FALSE;
  -- Delete Record
  DELETE FROM zakat_records WHERE id = p_zakat_id AND branch_id = p_branch_id;
  RETURN QUERY SELECT TRUE, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, SQLERRM::TEXT;
END;
$function$
;


-- Function: generate_journal_number
CREATE OR REPLACE FUNCTION public.generate_journal_number()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
    current_year TEXT;
    next_number INTEGER;
    new_entry_number TEXT;
BEGIN
    current_year := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;
    -- Get next sequence number for this year
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(entry_number FROM 'JE-' || current_year || '-(\d+)') AS INTEGER)
    ), 0) + 1
    INTO next_number
    FROM public.journal_entries
    WHERE entry_number LIKE 'JE-' || current_year || '-%';
    -- Format: JE-2024-000001
    new_entry_number := 'JE-' || current_year || '-' || LPAD(next_number::TEXT, 6, '0');
    RETURN new_entry_number;
END;
$function$
;


-- Function: get_next_journal_number
CREATE OR REPLACE FUNCTION public.get_next_journal_number(p_prefix text DEFAULT 'JU'::text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_date_part TEXT;
  v_last_number INTEGER;
  v_new_number TEXT;
BEGIN
  v_date_part := TO_CHAR(NOW(), 'YYMMDD');
  -- Get the last journal number with this prefix and date
  SELECT COALESCE(
    MAX(
      CASE
        WHEN entry_number ~ ('^' || p_prefix || '-' || v_date_part || '-[0-9]+$')
        THEN SUBSTRING(entry_number FROM '[0-9]+$')::INTEGER
        ELSE 0
      END
    ),
    0
  ) INTO v_last_number
  FROM journal_entries
  WHERE entry_number LIKE p_prefix || '-' || v_date_part || '-%';
  v_new_number := p_prefix || '-' || v_date_part || '-' || LPAD((v_last_number + 1)::TEXT, 3, '0');
  RETURN v_new_number;
END;
$function$
;


-- Function: insert_journal_entry
CREATE OR REPLACE FUNCTION public.insert_journal_entry(p_entry_number text, p_entry_date date, p_description text, p_reference_type text, p_reference_id text DEFAULT NULL::text, p_status text DEFAULT 'draft'::text, p_total_debit numeric DEFAULT 0, p_total_credit numeric DEFAULT 0, p_branch_id uuid DEFAULT NULL::uuid, p_created_by uuid DEFAULT NULL::uuid, p_approved_by uuid DEFAULT NULL::uuid, p_approved_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(id uuid, entry_number text, entry_date date, description text, reference_type text, reference_id text, status text, total_debit numeric, total_credit numeric, branch_id uuid, created_by uuid, approved_by uuid, approved_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO journal_entries (
    entry_number,
    entry_date,
    description,
    reference_type,
    reference_id,
    status,
    total_debit,
    total_credit,
    branch_id,
    created_by,
    approved_by,
    approved_at
  )
  VALUES (
    p_entry_number,
    p_entry_date,
    p_description,
    p_reference_type,
    p_reference_id,
    p_status,
    p_total_debit,
    p_total_credit,
    p_branch_id,
    p_created_by,
    p_approved_by,
    p_approved_at
  )
  RETURNING journal_entries.id INTO new_id;
  RETURN QUERY
  SELECT
    j.id,
    j.entry_number,
    j.entry_date,
    j.description,
    j.reference_type,
    j.reference_id,
    j.status,
    j.total_debit,
    j.total_credit,
    j.branch_id,
    j.created_by,
    j.approved_by,
    j.approved_at,
    j.created_at
  FROM journal_entries j
  WHERE j.id = new_id;
END;
$function$
;


-- Function: post_journal_atomic
CREATE OR REPLACE FUNCTION public.post_journal_atomic(p_journal_id uuid, p_branch_id uuid)
 RETURNS TABLE(success boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_journal RECORD;
BEGIN
  SELECT id, status, total_debit, total_credit INTO v_journal
  FROM journal_entries
  WHERE id = p_journal_id AND branch_id = p_branch_id;

  IF v_journal.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Journal entry not found'::TEXT;
    RETURN;
  END IF;

  IF v_journal.status = 'posted' THEN
    RETURN QUERY SELECT TRUE, 'Journal already posted'::TEXT;
    RETURN;
  END IF;

  IF v_journal.total_debit != v_journal.total_credit THEN
    RETURN QUERY SELECT FALSE, 'Journal is not balanced'::TEXT;
    RETURN;
  END IF;

  UPDATE journal_entries
  SET status = 'posted',
      updated_at = NOW()
  WHERE id = p_journal_id;

  RETURN QUERY SELECT TRUE, 'Journal posted successfully'::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, SQLERRM::TEXT;
END;
$function$
;


-- Function: prevent_posted_journal_lines_update
CREATE OR REPLACE FUNCTION public.prevent_posted_journal_lines_update()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_journal_status TEXT;
  v_is_voided BOOLEAN;
BEGIN
  -- Get parent journal status
  SELECT status, is_voided
  INTO v_journal_status, v_is_voided
  FROM journal_entries
  WHERE id = COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
  -- Allow changes if journal is draft
  IF v_journal_status = 'draft' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  -- Allow deletes if journal is being voided
  IF v_is_voided = TRUE THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  -- Prevent changes on posted journal lines
  IF v_journal_status = 'posted' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Cannot delete lines from posted journal. Void the journal instead.';
    ELSIF TG_OP = 'UPDATE' THEN
      IF OLD.debit_amount IS DISTINCT FROM NEW.debit_amount
         OR OLD.credit_amount IS DISTINCT FROM NEW.credit_amount
         OR OLD.account_id IS DISTINCT FROM NEW.account_id THEN
        RAISE EXCEPTION 'Cannot update lines in posted journal. Void the journal instead.';
      END IF;
    ELSIF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'Cannot add lines to posted journal. Void and create new instead.';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$
;


-- Function: process_laku_kantor_atomic
CREATE OR REPLACE FUNCTION public.process_laku_kantor_atomic(p_transaction_id text, p_branch_id uuid)
 RETURNS TABLE(success boolean, total_hpp numeric, journal_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_transaction RECORD;
  v_item RECORD;
  v_consume_result RECORD;
  v_total_hpp NUMERIC := 0;
  v_hpp_details TEXT := '';
  v_journal_id UUID;
  v_entry_number TEXT;
  v_hpp_account_id UUID;
  v_persediaan_id UUID;
BEGIN
  -- ==================== VALIDASI ====================
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, NULL::UUID,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT;
    RETURN;
  END IF;
  IF p_transaction_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, NULL::UUID,
      'Transaction ID is required'::TEXT;
    RETURN;
  END IF;
  -- Get transaction info
  SELECT
    t.id,
    t.ref,
    t.branch_id,
    t.customer_id,
    c.name as customer_name,
    t.is_laku_kantor
  INTO v_transaction
  FROM transactions t
  LEFT JOIN customers c ON c.id = t.customer_id
  WHERE t.id = p_transaction_id AND t.branch_id = p_branch_id;
  IF v_transaction.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, NULL::UUID,
      'Transaction not found in this branch'::TEXT;
    RETURN;
  END IF;
  -- ==================== CONSUME INVENTORY (FIFO) ====================
  FOR v_item IN
    SELECT
      ti.product_id,
      ti.quantity,
      p.name as product_name
    FROM transaction_items ti
    JOIN products p ON p.id = ti.product_id
    WHERE ti.transaction_id = p_transaction_id
      AND ti.quantity > 0
  LOOP
    SELECT * INTO v_consume_result
    FROM consume_inventory_fifo(
      v_item.product_id,
      p_branch_id,
      v_item.quantity,
      v_transaction.ref
    );
    IF NOT v_consume_result.success THEN
      RETURN QUERY SELECT FALSE, 0::NUMERIC, NULL::UUID,
        format('Gagal consume stok %s: %s', v_item.product_name, v_consume_result.error_message);
      RETURN;
    END IF;
    v_total_hpp := v_total_hpp + v_consume_result.total_hpp;
    v_hpp_details := v_hpp_details || v_item.product_name || ' x' || v_item.quantity || ', ';
  END LOOP;
  -- ==================== UPDATE TRANSACTION ====================
  UPDATE transactions
  SET
    delivery_status = 'delivered',
    delivered_at = NOW(),
    updated_at = NOW()
  WHERE id = p_transaction_id;
  -- ==================== CREATE HPP JOURNAL ====================
  IF v_total_hpp > 0 THEN
    SELECT id INTO v_hpp_account_id
    FROM accounts
    WHERE code = '5100' AND branch_id = p_branch_id AND is_active = TRUE
    LIMIT 1;
    SELECT id INTO v_persediaan_id
    FROM accounts
    WHERE code = '1310' AND branch_id = p_branch_id AND is_active = TRUE
    LIMIT 1;
    IF v_hpp_account_id IS NOT NULL AND v_persediaan_id IS NOT NULL THEN
      v_entry_number := 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
        LPAD((SELECT COUNT(*) + 1 FROM journal_entries
              WHERE branch_id = p_branch_id
              AND DATE(created_at) = CURRENT_DATE)::TEXT, 4, '0');
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
        NOW(),
        format('HPP Laku Kantor %s: %s', v_transaction.ref, COALESCE(v_transaction.customer_name, 'Customer')),
        'transaction',
        p_transaction_id::TEXT,
        p_branch_id,
        'draft',
        v_total_hpp,
        v_total_hpp
      )
      RETURNING id INTO v_journal_id;
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
        format('HPP Laku Kantor: %s', RTRIM(v_hpp_details, ', ')),
        v_total_hpp,
        0
      );
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
  RETURN QUERY SELECT
    TRUE,
    v_total_hpp,
    v_journal_id,
    NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0::NUMERIC, NULL::UUID, SQLERRM::TEXT;
END;
$function$
;


-- Function: update_delivery_atomic
CREATE OR REPLACE FUNCTION public.update_delivery_atomic(p_delivery_id uuid, p_branch_id uuid, p_items jsonb, p_driver_id uuid DEFAULT NULL::uuid, p_helper_id uuid DEFAULT NULL::uuid, p_delivery_date timestamp with time zone DEFAULT now(), p_notes text DEFAULT NULL::text, p_photo_url text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, delivery_id uuid, total_hpp numeric, journal_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
  v_counter_int INTEGER;
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
        SELECT * INTO v_consume_result FROM consume_inventory_fifo(
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
      -- Initialize counter based on entry_date/NOW()
      -- Since this is update, we use NOW() as entry_date in the original code, but description uses v_transaction.ref
      -- We'll stick to NOW() for entry_date as per original logic for updates
      SELECT COUNT(*) INTO v_counter_int 
      FROM journal_entries 
      WHERE branch_id = p_branch_id AND DATE(entry_date) = DATE(p_delivery_date);
         
      LOOP
        v_counter_int := v_counter_int + 1;
        v_entry_number := 'JE-' || TO_CHAR(p_delivery_date, 'YYYYMMDD') || '-' ||
            LPAD(v_counter_int::TEXT, 4, '0');

        BEGIN
          INSERT INTO journal_entries (
            entry_number, entry_date, description, reference_type, reference_id, branch_id, status, total_debit, total_credit
          ) VALUES (
            v_entry_number, NOW(), format('HPP Pengiriman %s (update)', v_transaction.ref), 'adjustment', p_delivery_id::TEXT, p_branch_id, 'posted', v_total_hpp, v_total_hpp
          ) RETURNING id INTO v_journal_id;
          
          EXIT; 
        EXCEPTION WHEN unique_violation THEN
          -- Retry
        END;
      END LOOP;

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
$function$
;


-- Function: void_journal_by_reference
CREATE OR REPLACE FUNCTION public.void_journal_by_reference(p_reference_id text, p_reference_type text, p_user_id uuid DEFAULT NULL::uuid, p_user_name text DEFAULT NULL::text, p_reason text DEFAULT 'Cancelled'::text)
 RETURNS TABLE(success boolean, journals_voided integer, message text)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_count INTEGER := 0;
BEGIN
  UPDATE journal_entries
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_by = p_user_id,
    voided_by_name = COALESCE(p_user_name, 'System'),
    void_reason = p_reason,
    status = 'voided'
  WHERE reference_id = p_reference_id
    AND reference_type = p_reference_type
    AND (is_voided = FALSE OR is_voided IS NULL);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    RETURN QUERY SELECT TRUE, v_count, format('Voided %s journal(s) for %s: %s', v_count, p_reference_type, p_reference_id)::TEXT;
  ELSE
    RETURN QUERY SELECT FALSE, 0, format('No journals found for %s: %s', p_reference_type, p_reference_id)::TEXT;
  END IF;
END;
$function$
;


-- Function: void_journal_entry
CREATE OR REPLACE FUNCTION public.void_journal_entry(p_journal_id uuid, p_branch_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_journal RECORD;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT;
    RETURN;
  END IF;

  IF p_journal_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Journal ID is required'::TEXT;
    RETURN;
  END IF;

  -- Get journal
  SELECT * INTO v_journal
  FROM journal_entries
  WHERE id = p_journal_id AND branch_id = p_branch_id;

  IF v_journal.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Journal not found in this branch'::TEXT;
    RETURN;
  END IF;

  IF v_journal.is_voided = TRUE THEN
    RETURN QUERY SELECT FALSE, 'Journal already voided'::TEXT;
    RETURN;
  END IF;

  -- ==================== VOID JOURNAL ====================

  UPDATE journal_entries
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_reason = COALESCE(p_reason, 'Voided via RPC'),
    updated_at = NOW()
  WHERE id = p_journal_id;

  RETURN QUERY SELECT TRUE, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE AS success, SQLERRM::TEXT AS error_message;
END;
$function$
;


-- Function: void_zakat_payment_atomic
CREATE OR REPLACE FUNCTION public.void_zakat_payment_atomic(p_zakat_id uuid, p_branch_id uuid, p_reason text DEFAULT 'Dibatalkan'::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(success boolean, journals_voided integer, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_zakat RECORD;
  v_journals_voided INTEGER := 0;
BEGIN
  -- ==================== VALIDASI ====================
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;
  -- Get zakat record
  SELECT * INTO v_zakat
  FROM zakat_payments
  WHERE id = p_zakat_id AND branch_id = p_branch_id
  FOR UPDATE;
  IF v_zakat.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Pembayaran zakat tidak ditemukan'::TEXT;
    RETURN;
  END IF;
  IF v_zakat.status = 'cancelled' THEN
    RETURN QUERY SELECT FALSE, 0, 'Pembayaran zakat sudah dibatalkan'::TEXT;
    RETURN;
  END IF;
  -- ==================== VOID JOURNALS ====================
  UPDATE journal_entries
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_reason = p_reason,
    status = 'voided',
    updated_at = NOW()
  WHERE reference_type = 'zakat'
    AND reference_id = p_zakat_id::TEXT
    AND branch_id = p_branch_id
    AND is_voided = FALSE;
  GET DIAGNOSTICS v_journals_voided = ROW_COUNT;
  -- ==================== UPDATE STATUS ====================
  UPDATE zakat_payments
  SET
    status = 'cancelled',
    updated_at = NOW()
  WHERE id = p_zakat_id;
  -- ==================== SUCCESS ====================
  RETURN QUERY SELECT TRUE, v_journals_voided, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0, SQLERRM::TEXT;
END;
$function$
;


