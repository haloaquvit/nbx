BEGIN RETURN has_permission('products_create'); END;
$$;


ALTER FUNCTION public.can_create_products() OWNER TO postgres;

--
-- Name: can_create_quotations(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_create_quotations() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('quotations_create'); END;
$$;


ALTER FUNCTION public.can_create_quotations() OWNER TO postgres;

--
-- Name: can_create_transactions(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_create_transactions() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('transactions_create'); END;
$$;


ALTER FUNCTION public.can_create_transactions() OWNER TO postgres;

--
-- Name: can_delete_customers(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_delete_customers() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('customers_delete'); END;
$$;


ALTER FUNCTION public.can_delete_customers() OWNER TO postgres;

--
-- Name: can_delete_employees(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_delete_employees() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('employees_delete'); END;
$$;


ALTER FUNCTION public.can_delete_employees() OWNER TO postgres;

--
-- Name: can_delete_materials(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_delete_materials() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('materials_delete'); END;
$$;


ALTER FUNCTION public.can_delete_materials() OWNER TO postgres;

--
-- Name: can_delete_products(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_delete_products() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('products_delete'); END;
$$;


ALTER FUNCTION public.can_delete_products() OWNER TO postgres;

--
-- Name: can_delete_transactions(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_delete_transactions() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('transactions_delete'); END;
$$;


ALTER FUNCTION public.can_delete_transactions() OWNER TO postgres;

--
-- Name: can_edit_accounts(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_edit_accounts() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('accounts_edit'); END;
$$;


ALTER FUNCTION public.can_edit_accounts() OWNER TO postgres;

--
-- Name: can_edit_customers(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_edit_customers() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('customers_edit'); END;
$$;


ALTER FUNCTION public.can_edit_customers() OWNER TO postgres;

--
-- Name: can_edit_employees(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_edit_employees() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('employees_edit'); END;
$$;


ALTER FUNCTION public.can_edit_employees() OWNER TO postgres;

--
-- Name: can_edit_materials(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_edit_materials() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('materials_edit'); END;
$$;


ALTER FUNCTION public.can_edit_materials() OWNER TO postgres;

--
-- Name: can_edit_products(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_edit_products() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('products_edit'); END;
$$;


ALTER FUNCTION public.can_edit_products() OWNER TO postgres;

--
-- Name: can_edit_quotations(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_edit_quotations() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('quotations_edit'); END;
$$;


ALTER FUNCTION public.can_edit_quotations() OWNER TO postgres;

--
-- Name: can_edit_transactions(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_edit_transactions() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('transactions_edit'); END;
$$;


ALTER FUNCTION public.can_edit_transactions() OWNER TO postgres;

--
-- Name: can_manage_roles(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_manage_roles() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('role_management'); END;
$$;


ALTER FUNCTION public.can_manage_roles() OWNER TO postgres;

--
-- Name: can_view_accounts(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_view_accounts() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('accounts_view'); END;
$$;


ALTER FUNCTION public.can_view_accounts() OWNER TO postgres;

--
-- Name: can_view_advances(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_view_advances() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('advances_view'); END;
$$;


ALTER FUNCTION public.can_view_advances() OWNER TO postgres;

--
-- Name: can_view_customers(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_view_customers() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('customers_view'); END;
$$;


ALTER FUNCTION public.can_view_customers() OWNER TO postgres;

--
-- Name: can_view_employees(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_view_employees() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('employees_view'); END;
$$;


ALTER FUNCTION public.can_view_employees() OWNER TO postgres;

--
-- Name: can_view_expenses(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_view_expenses() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('expenses_view'); END;
$$;


ALTER FUNCTION public.can_view_expenses() OWNER TO postgres;

--
-- Name: can_view_financial_reports(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_view_financial_reports() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('financial_reports'); END;
$$;


ALTER FUNCTION public.can_view_financial_reports() OWNER TO postgres;

--
-- Name: can_view_materials(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_view_materials() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('materials_view'); END;
$$;


ALTER FUNCTION public.can_view_materials() OWNER TO postgres;

--
-- Name: can_view_products(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_view_products() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('products_view'); END;
$$;


ALTER FUNCTION public.can_view_products() OWNER TO postgres;

--
-- Name: can_view_quotations(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_view_quotations() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('quotations_view'); END;
$$;


ALTER FUNCTION public.can_view_quotations() OWNER TO postgres;

--
-- Name: can_view_receivables(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_view_receivables() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('receivables_view'); END;
$$;


ALTER FUNCTION public.can_view_receivables() OWNER TO postgres;

--
-- Name: can_view_stock_reports(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_view_stock_reports() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('stock_reports'); END;
$$;


ALTER FUNCTION public.can_view_stock_reports() OWNER TO postgres;

--
-- Name: can_view_transactions(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_view_transactions() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('transactions_view'); END;
$$;


ALTER FUNCTION public.can_view_transactions() OWNER TO postgres;

--
-- Name: cancel_transaction_payment(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.cancel_transaction_payment(p_payment_id uuid, p_cancelled_by uuid DEFAULT NULL::uuid, p_reason text DEFAULT 'Payment cancelled'::text) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
  transaction_id_var TEXT;
  payment_amount NUMERIC;
  new_paid_amount NUMERIC;
BEGIN
  -- Get payment info
  SELECT transaction_id, amount INTO transaction_id_var, payment_amount
  FROM transaction_payments WHERE id = p_payment_id AND status = 'active';
  
  IF transaction_id_var IS NULL THEN
    RAISE EXCEPTION 'Payment not found or already cancelled';
  END IF;
  
  -- Cancel payment
  UPDATE transaction_payments 
  SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = p_cancelled_by, cancelled_reason = p_reason
  WHERE id = p_payment_id;
  
  -- Update transaction
  SELECT COALESCE(SUM(amount), 0) INTO new_paid_amount
  FROM transaction_payments WHERE transaction_id = transaction_id_var AND status = 'active';
  
  UPDATE transactions 
  SET paid_amount = new_paid_amount,
      payment_status = CASE WHEN new_paid_amount >= total THEN 'Lunas'::text ELSE 'Belum Lunas'::text END
  WHERE id = transaction_id_var;
  
  RETURN TRUE;
END;
$$;


ALTER FUNCTION public.cancel_transaction_payment(p_payment_id uuid, p_cancelled_by uuid, p_reason text) OWNER TO postgres;

--
-- Name: cancel_transaction_v2(text, uuid, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.cancel_transaction_v2(p_transaction_id text, p_user_id uuid, p_user_name text, p_reason text DEFAULT 'Cancelled'::text) RETURNS TABLE(success boolean, message text, journal_voided boolean, stock_restored boolean)
    LANGUAGE plpgsql
    AS $$
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
$$;


ALTER FUNCTION public.cancel_transaction_v2(p_transaction_id text, p_user_id uuid, p_user_name text, p_reason text) OWNER TO postgres;

--
-- Name: FUNCTION cancel_transaction_v2(p_transaction_id text, p_user_id uuid, p_user_name text, p_reason text); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.cancel_transaction_v2(p_transaction_id text, p_user_id uuid, p_user_name text, p_reason text) IS 'Soft delete transaction, void journal, and restore stock';


--
-- Name: check_user_permission(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_user_permission(p_user_id uuid, p_permission text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_role TEXT;
  v_has_permission BOOLEAN := FALSE;
BEGIN
  -- Jika user_id NULL, return FALSE
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Get user role from profiles table (localhost uses profiles, not employees)
  SELECT role INTO v_role
  FROM profiles
  WHERE id = p_user_id AND status = 'Aktif';

  -- Jika user tidak ditemukan atau tidak aktif
  IF v_role IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Owner SELALU punya akses penuh
  IF v_role = 'owner' THEN
    RETURN TRUE;
  END IF;

  -- Admin punya semua akses kecuali role_management
  IF v_role = 'admin' AND p_permission != 'role_management' THEN
    RETURN TRUE;
  END IF;

  -- Cek dari role_permissions table
  SELECT (permissions->>p_permission)::BOOLEAN INTO v_has_permission
  FROM role_permissions
  WHERE role_id = v_role;

  RETURN COALESCE(v_has_permission, FALSE);
END;
$$;


ALTER FUNCTION public.check_user_permission(p_user_id uuid, p_permission text) OWNER TO postgres;

--
-- Name: FUNCTION check_user_permission(p_user_id uuid, p_permission text); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.check_user_permission(p_user_id uuid, p_permission text) IS 'Check if user has specific granular permission. Owner always TRUE, Admin TRUE except role_management.';


--
-- Name: check_user_permission_all(uuid, text[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_user_permission_all(p_user_id uuid, p_permissions text[]) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_permission TEXT;
BEGIN
  FOREACH v_permission IN ARRAY p_permissions
  LOOP
    IF NOT check_user_permission(p_user_id, v_permission) THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  RETURN TRUE;
END;
$$;


ALTER FUNCTION public.check_user_permission_all(p_user_id uuid, p_permissions text[]) OWNER TO postgres;

--
-- Name: FUNCTION check_user_permission_all(p_user_id uuid, p_permissions text[]); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.check_user_permission_all(p_user_id uuid, p_permissions text[]) IS 'Check if user has ALL of the specified permissions.';


--
-- Name: check_user_permission_any(uuid, text[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_user_permission_any(p_user_id uuid, p_permissions text[]) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_permission TEXT;
BEGIN
  FOREACH v_permission IN ARRAY p_permissions
  LOOP
    IF check_user_permission(p_user_id, v_permission) THEN
      RETURN TRUE;
    END IF;
  END LOOP;

  RETURN FALSE;
END;
$$;


ALTER FUNCTION public.check_user_permission_any(p_user_id uuid, p_permissions text[]) OWNER TO postgres;

--
-- Name: FUNCTION check_user_permission_any(p_user_id uuid, p_permissions text[]); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.check_user_permission_any(p_user_id uuid, p_permissions text[]) IS 'Check if user has ANY of the specified permissions.';


--
-- Name: cleanup_old_audit_logs(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.cleanup_old_audit_logs() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.audit_logs 
  WHERE timestamp < NOW() - INTERVAL '90 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Log the cleanup operation
  PERFORM public.create_audit_log(
    'audit_logs',
    'CLEANUP',
    'system',
    NULL,
    jsonb_build_object('deleted_count', deleted_count),
    jsonb_build_object('operation', 'automatic_cleanup')
  );
  
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION public.cleanup_old_audit_logs() OWNER TO postgres;

--
-- Name: consume_inventory_fifo(uuid, uuid, numeric, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.consume_inventory_fifo(p_product_id uuid, p_branch_id uuid, p_quantity numeric, p_reference_id text DEFAULT NULL::text) RETURNS TABLE(success boolean, total_hpp numeric, batches_consumed jsonb, error_message text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_batch RECORD;
  v_remaining NUMERIC := p_quantity;
  v_total_hpp NUMERIC := 0;
  v_consumed JSONB := '[]'::JSONB;
  v_deduct_qty NUMERIC;
  v_available_stock NUMERIC;
  v_product_name TEXT;
  v_is_material BOOLEAN := FALSE;
BEGIN
  -- Validasi Basic
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, 'Branch ID is REQUIRED'::TEXT;
    RETURN;
  END IF;

  -- 1. Cek Product
  SELECT name INTO v_product_name FROM products WHERE id = p_product_id;

  -- Jika bukan produk, cek Material
  IF v_product_name IS NULL THEN
     -- Cek keberadaan material
     PERFORM 1 FROM materials WHERE id = p_product_id;
     
     IF FOUND THEN
       -- DELEGATE KE FUNCTION MATERIAL FIFO YANG SUDAH ADA
       -- Panggil consume_material_fifo(id, branch, qty, ref_id, ref_type='delivery')
       RETURN QUERY 
         SELECT * FROM consume_material_fifo(p_product_id, p_branch_id, p_quantity, p_reference_id, 'delivery');
       RETURN;
     ELSE
       -- Tidak ditemukan di Products maupun Materials
       RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, 'Item not found in Products or Materials'::TEXT;
       RETURN;
     END IF;
  END IF;

  -- 3. Logic FIFO Normal (Products) - Tetap gunakan logic original untuk produk
  -- Cek stok
  SELECT COALESCE(SUM(remaining_quantity), 0) INTO v_available_stock
  FROM inventory_batches
  WHERE product_id = p_product_id AND branch_id = p_branch_id AND remaining_quantity > 0;

  IF v_available_stock < p_quantity THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB,
      format('Stok tidak cukup untuk %s. Tersedia: %s, Diminta: %s', v_product_name, v_available_stock, p_quantity)::TEXT;
    RETURN;
  END IF;

  -- Loop Batches
  FOR v_batch IN
    SELECT id, remaining_quantity, unit_cost 
    FROM inventory_batches
    WHERE product_id = p_product_id AND branch_id = p_branch_id AND remaining_quantity > 0
    ORDER BY batch_date ASC, created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_deduct_qty := LEAST(v_batch.remaining_quantity, v_remaining);
    
    UPDATE inventory_batches
    SET remaining_quantity = remaining_quantity - v_deduct_qty, updated_at = NOW()
    WHERE id = v_batch.id;

    v_total_hpp := v_total_hpp + (v_deduct_qty * COALESCE(v_batch.unit_cost, 0));
    v_consumed := v_consumed || jsonb_build_object('batch_id', v_batch.id, 'qty', v_deduct_qty);
    v_remaining := v_remaining - v_deduct_qty;
  END LOOP;

  -- Log Movement Products
  INSERT INTO product_stock_movements (
    product_id, branch_id, movement_type, quantity, reference_id, reference_type, unit_cost, notes, created_at
  ) VALUES (
    p_product_id, p_branch_id, 'OUT', p_quantity, p_reference_id, 'fifo_consume',
    CASE WHEN p_quantity > 0 THEN v_total_hpp / p_quantity ELSE 0 END,
    'Delivery FIFO', NOW()
  );

  RETURN QUERY SELECT TRUE, v_total_hpp, v_consumed, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, SQLERRM::TEXT;
END;
$$;


ALTER FUNCTION public.consume_inventory_fifo(p_product_id uuid, p_branch_id uuid, p_quantity numeric, p_reference_id text) OWNER TO postgres;

--
-- Name: consume_inventory_fifo_v3(uuid, uuid, numeric, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.consume_inventory_fifo_v3(p_product_id uuid, p_branch_id uuid, p_quantity numeric, p_reference_id text DEFAULT NULL::text) RETURNS TABLE(success boolean, total_hpp numeric, batches_consumed jsonb, error_message text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_batch RECORD;
  v_remaining NUMERIC := p_quantity;
  v_total_hpp NUMERIC := 0;
  v_consumed JSONB := '[]'::JSONB;
  v_deduct_qty NUMERIC;
  v_available_stock NUMERIC;
  v_product_name TEXT;
BEGIN
  -- ==================== VALIDASI ====================

  -- Validasi branch_id WAJIB
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT;
    RETURN;
  END IF;

  IF p_product_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB,
      'Product ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_quantity <= 0 THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB,
      'Quantity must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get product name untuk logging
  SELECT name INTO v_product_name
  FROM products WHERE id = p_product_id;

  IF v_product_name IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB,
      'Product not found'::TEXT;
    RETURN;
  END IF;

  -- ==================== CEK STOK ====================

  -- Cek available stock HANYA di branch ini
  SELECT COALESCE(SUM(remaining_quantity), 0)
  INTO v_available_stock
  FROM inventory_batches
  WHERE product_id = p_product_id
    AND branch_id = p_branch_id      -- WAJIB filter branch
    AND remaining_quantity > 0;

  IF v_available_stock < p_quantity THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB,
      format('Stok tidak cukup untuk %s. Tersedia: %s, Diminta: %s',
        v_product_name, v_available_stock, p_quantity)::TEXT;
    RETURN;
  END IF;

  -- ==================== CONSUME FIFO ====================

  -- Loop through batches in FIFO order (oldest first)
  FOR v_batch IN
    SELECT id, remaining_quantity, unit_cost, batch_date, notes
    FROM inventory_batches
    WHERE product_id = p_product_id
      AND branch_id = p_branch_id    -- WAJIB filter branch
      AND remaining_quantity > 0
    ORDER BY batch_date ASC, created_at ASC
    FOR UPDATE                       -- Lock rows
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_deduct_qty := LEAST(v_batch.remaining_quantity, v_remaining);

    -- Update batch
    UPDATE inventory_batches
    SET remaining_quantity = remaining_quantity - v_deduct_qty,
        updated_at = NOW()
    WHERE id = v_batch.id;

    -- Calculate HPP
    v_total_hpp := v_total_hpp + (v_deduct_qty * COALESCE(v_batch.unit_cost, 0));

    -- Track consumed batches
    v_consumed := v_consumed || jsonb_build_object(
      'batch_id', v_batch.id,
      'quantity', v_deduct_qty,
      'unit_cost', COALESCE(v_batch.unit_cost, 0),
      'subtotal', v_deduct_qty * COALESCE(v_batch.unit_cost, 0)
    );

    v_remaining := v_remaining - v_deduct_qty;
  END LOOP;

  -- ==================== LOGGING ====================

  -- Log consumption untuk audit
  INSERT INTO product_stock_movements (
    product_id,
    branch_id,
    movement_type,
    quantity,
    reference_id,
    reference_type,
    unit_cost,
    notes,
    created_at
  ) VALUES (
    p_product_id,
    p_branch_id,
    'OUT',
    p_quantity,
    p_reference_id,
    'fifo_consume',
    CASE WHEN p_quantity > 0 THEN v_total_hpp / p_quantity ELSE 0 END,
    format('FIFO consume: %s batches, HPP %s', jsonb_array_length(v_consumed), v_total_hpp),
    NOW()
  );

  RETURN QUERY SELECT TRUE, v_total_hpp, v_consumed, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, SQLERRM::TEXT;
END;
$$;


ALTER FUNCTION public.consume_inventory_fifo_v3(p_product_id uuid, p_branch_id uuid, p_quantity numeric, p_reference_id text) OWNER TO postgres;

--
-- Name: consume_material_fifo(uuid, uuid, numeric, text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.consume_material_fifo(p_material_id uuid, p_branch_id uuid, p_quantity numeric, p_reference_id text DEFAULT NULL::text, p_reference_type text DEFAULT 'production'::text, p_reason text DEFAULT 'OUT'::text) RETURNS TABLE(success boolean, total_cost numeric, batches_consumed jsonb, error_message text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_batch RECORD;
  v_remaining NUMERIC := p_quantity;
  v_total_cost NUMERIC := 0;
  v_consumed JSONB := '[]'::JSONB;
  v_deduct_qty NUMERIC;
  v_available_stock NUMERIC;
  v_material_name TEXT;
  v_cost_to_use NUMERIC;
BEGIN
  IF p_branch_id IS NULL THEN RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, 'Branch ID is REQUIRED'::TEXT; RETURN; END IF;
  IF p_material_id IS NULL THEN RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, 'Material ID is required'::TEXT; RETURN; END IF;
  IF p_quantity <= 0 THEN RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, 'Quantity must be positive'::TEXT; RETURN; END IF;

  SELECT name INTO v_material_name FROM materials WHERE id = p_material_id;
  IF v_material_name IS NULL THEN RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, 'Material not found'::TEXT; RETURN; END IF;

  SELECT COALESCE(SUM(remaining_quantity), 0) INTO v_available_stock
  FROM inventory_batches
  WHERE material_id = p_material_id AND (branch_id = p_branch_id OR branch_id IS NULL) AND remaining_quantity > 0;

  IF v_available_stock < p_quantity THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, format('Stok material tidak cukup: %s < %s', v_available_stock, p_quantity)::TEXT;
    RETURN;
  END IF;

  FOR v_batch IN
    SELECT id, remaining_quantity, unit_cost FROM inventory_batches
    WHERE material_id = p_material_id AND (branch_id = p_branch_id OR branch_id IS NULL) AND remaining_quantity > 0
    ORDER BY batch_date ASC, created_at ASC FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_deduct_qty := LEAST(v_batch.remaining_quantity, v_remaining);

    v_cost_to_use := COALESCE(v_batch.unit_cost, 0);
    IF v_cost_to_use = 0 THEN
      SELECT COALESCE(price_per_unit, 0) INTO v_cost_to_use FROM materials WHERE id = p_material_id;
    END IF;

    UPDATE inventory_batches SET remaining_quantity = remaining_quantity - v_deduct_qty, updated_at = NOW() WHERE id = v_batch.id;

    v_total_cost := v_total_cost + (v_deduct_qty * v_cost_to_use);
    v_consumed := v_consumed || jsonb_build_object('batch_id', v_batch.id, 'quantity', v_deduct_qty, 'unit_cost', v_cost_to_use);

    BEGIN
      INSERT INTO inventory_batch_consumptions (
        batch_id, quantity_consumed, consumed_at, reference_id, reference_type, unit_cost, total_cost
      ) VALUES (
        v_batch.id, v_deduct_qty, NOW(), p_reference_id, p_reference_type, v_cost_to_use, v_deduct_qty * v_cost_to_use
      );
    EXCEPTION WHEN undefined_table THEN NULL; END;

    v_remaining := v_remaining - v_deduct_qty;
  END LOOP;

  INSERT INTO material_stock_movements (
    material_id, material_name, type, reason, quantity, previous_stock, new_stock, 
    reference_id, reference_type, notes, branch_id, created_at
  ) VALUES (
    p_material_id, v_material_name, 'OUT', p_reason, p_quantity, 
    v_available_stock, v_available_stock - p_quantity, p_reference_id, p_reference_type, 
    format('FIFO consume: %s batches', jsonb_array_length(v_consumed)), p_branch_id, NOW()
  );

  UPDATE materials SET stock = GREATEST(0, stock - p_quantity), updated_at = NOW() WHERE id = p_material_id;

  RETURN QUERY SELECT TRUE, v_total_cost, v_consumed, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, SQLERRM::TEXT;
END;
$$;


ALTER FUNCTION public.consume_material_fifo(p_material_id uuid, p_branch_id uuid, p_quantity numeric, p_reference_id text, p_reference_type text, p_reason text) OWNER TO postgres;

--
-- Name: consume_material_fifo_v2(uuid, numeric, text, text, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.consume_material_fifo_v2(p_material_id uuid, p_quantity numeric, p_reference_id text, p_reference_type text, p_branch_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid, p_user_name text DEFAULT NULL::text) RETURNS TABLE(success boolean, total_cost numeric, quantity_consumed numeric, batches_consumed jsonb, error_message text)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_batch RECORD;
  v_remaining NUMERIC := p_quantity;
  v_total_cost NUMERIC := 0;
  v_consumed JSONB := '[]'::JSONB;
  v_deduct_qty NUMERIC;
  v_material_name TEXT;
  v_available_stock NUMERIC;
BEGIN
  -- Validate input
  IF p_material_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, 0::NUMERIC, '[]'::JSONB, 'Material ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_quantity <= 0 THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, 0::NUMERIC, '[]'::JSONB, 'Quantity must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get material info
  SELECT name INTO v_material_name
  FROM materials WHERE id = p_material_id;

  IF v_material_name IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, 0::NUMERIC, '[]'::JSONB, 'Material not found'::TEXT;
    RETURN;
  END IF;

  -- Check available stock from batches
  SELECT COALESCE(SUM(remaining_quantity), 0) INTO v_available_stock
  FROM inventory_batches
  WHERE material_id = p_material_id
    AND remaining_quantity > 0
    AND (p_branch_id IS NULL OR branch_id = p_branch_id OR branch_id IS NULL);

  IF v_available_stock < p_quantity THEN
    RETURN QUERY SELECT
      FALSE,
      0::NUMERIC,
      0::NUMERIC,
      '[]'::JSONB,
      format('Insufficient stock: need %s, available %s', p_quantity, v_available_stock)::TEXT;
    RETURN;
  END IF;

  -- Consume from batches using FIFO (oldest first)
  FOR v_batch IN
    SELECT
      id,
      remaining_quantity,
      unit_cost,
      batch_date,
      notes
    FROM inventory_batches
    WHERE material_id = p_material_id
      AND remaining_quantity > 0
      AND (p_branch_id IS NULL OR branch_id = p_branch_id OR branch_id IS NULL)
    ORDER BY batch_date ASC, created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_deduct_qty := LEAST(v_batch.remaining_quantity, v_remaining);

    -- Update batch remaining quantity
    UPDATE inventory_batches
    SET
      remaining_quantity = remaining_quantity - v_deduct_qty,
      updated_at = NOW()
    WHERE id = v_batch.id;

    -- Track consumption for inventory_batch_consumptions table
    INSERT INTO inventory_batch_consumptions (
      batch_id,
      quantity_consumed,
      consumed_at,
      reference_id,
      reference_type,
      unit_cost_at_consumption
    ) VALUES (
      v_batch.id,
      v_deduct_qty,
      NOW(),
      p_reference_id,
      p_reference_type,
      COALESCE(v_batch.unit_cost, 0)
    );

    v_total_cost := v_total_cost + (v_deduct_qty * COALESCE(v_batch.unit_cost, 0));

    v_consumed := v_consumed || jsonb_build_object(
      'batch_id', v_batch.id,
      'quantity', v_deduct_qty,
      'unit_cost', COALESCE(v_batch.unit_cost, 0),
      'subtotal', v_deduct_qty * COALESCE(v_batch.unit_cost, 0)
    );

    v_remaining := v_remaining - v_deduct_qty;
  END LOOP;

  -- Log to material_stock_movements for audit trail
  INSERT INTO material_stock_movements (
    material_id,
    material_name,
    type,
    reason,
    quantity,
    previous_stock,
    new_stock,
    reference_id,
    reference_type,
    user_id,
    user_name,
    notes,
    branch_id
  ) VALUES (
    p_material_id,
    v_material_name,
    'OUT',
    'PRODUCTION_CONSUMPTION',
    p_quantity,
    v_available_stock,
    v_available_stock - p_quantity,
    p_reference_id,
    p_reference_type,
    p_user_id,
    COALESCE(p_user_name, 'System'),
    format('FIFO v2 consume: %s batches, total cost %s', jsonb_array_length(v_consumed), v_total_cost),
    p_branch_id
  );

  -- NOTE: We do NOT update materials.stock anymore
  -- Stock is derived from v_material_current_stock view

  RETURN QUERY SELECT TRUE, v_total_cost, p_quantity - v_remaining, v_consumed, NULL::TEXT;
END;
$$;


ALTER FUNCTION public.consume_material_fifo_v2(p_material_id uuid, p_quantity numeric, p_reference_id text, p_reference_type text, p_branch_id uuid, p_user_id uuid, p_user_name text) OWNER TO postgres;

--
-- Name: consume_stock_fifo_v2(uuid, numeric, text, text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.consume_stock_fifo_v2(p_product_id uuid, p_quantity numeric, p_reference_id text, p_reference_type text, p_branch_id uuid DEFAULT NULL::uuid) RETURNS TABLE(success boolean, total_hpp numeric, batches_consumed jsonb, remaining_to_consume numeric, error_message text)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_batch RECORD;
  v_remaining NUMERIC := p_quantity;
  v_total_hpp NUMERIC := 0;
  v_consumed JSONB := '[]'::JSONB;
  v_deduct_qty NUMERIC;
  v_available_stock NUMERIC;
BEGIN
  IF p_product_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, p_quantity, 'Product ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_quantity <= 0 THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, '[]'::JSONB, 0::NUMERIC, 'Quantity must be positive'::TEXT;
    RETURN;
  END IF;

  SELECT COALESCE(SUM(remaining_quantity), 0)
  INTO v_available_stock
  FROM inventory_batches
  WHERE product_id = p_product_id
    AND remaining_quantity > 0
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  IF v_available_stock < p_quantity THEN
    RETURN QUERY SELECT
      FALSE,
      0::NUMERIC,
      '[]'::JSONB,
      p_quantity,
      format('Insufficient stock. Available: %s, Requested: %s', v_available_stock, p_quantity)::TEXT;
    RETURN;
  END IF;

  FOR v_batch IN
    SELECT
      id,
      remaining_quantity,
      unit_cost,
      batch_date,
      notes
    FROM inventory_batches
    WHERE product_id = p_product_id
      AND remaining_quantity > 0
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    ORDER BY batch_date ASC, created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_deduct_qty := LEAST(v_batch.remaining_quantity, v_remaining);

    UPDATE inventory_batches
    SET
      remaining_quantity = remaining_quantity - v_deduct_qty,
      updated_at = NOW()
    WHERE id = v_batch.id;

    v_total_hpp := v_total_hpp + (v_deduct_qty * COALESCE(v_batch.unit_cost, 0));

    v_consumed := v_consumed || jsonb_build_object(
      'batch_id', v_batch.id,
      'quantity', v_deduct_qty,
      'unit_cost', COALESCE(v_batch.unit_cost, 0),
      'subtotal', v_deduct_qty * COALESCE(v_batch.unit_cost, 0),
      'batch_date', v_batch.batch_date,
      'notes', v_batch.notes
    );

    v_remaining := v_remaining - v_deduct_qty;
  END LOOP;

  INSERT INTO inventory_batch_consumptions (
    product_id,
    reference_id,
    reference_type,
    quantity_consumed,
    total_hpp,
    batches_detail,
    created_at
  ) VALUES (
    p_product_id,
    p_reference_id,
    p_reference_type,
    p_quantity - v_remaining,
    v_total_hpp,
    v_consumed,
    NOW()
  ) ON CONFLICT DO NOTHING;

  UPDATE products
  SET
    current_stock = current_stock - (p_quantity - v_remaining),
    updated_at = NOW()
  WHERE id = p_product_id;

  RETURN QUERY SELECT
    TRUE,
    v_total_hpp,
    v_consumed,
    v_remaining,
    NULL::TEXT;
END;
$$;


ALTER FUNCTION public.consume_stock_fifo_v2(p_product_id uuid, p_quantity numeric, p_reference_id text, p_reference_type text, p_branch_id uuid) OWNER TO postgres;

--
-- Name: create_account(uuid, text, text, text, numeric, boolean, uuid, integer, boolean, integer, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_account(p_branch_id uuid, p_name text, p_code text, p_type text, p_initial_balance numeric DEFAULT 0, p_is_payment_account boolean DEFAULT false, p_parent_id uuid DEFAULT NULL::uuid, p_level integer DEFAULT 1, p_is_header boolean DEFAULT false, p_sort_order integer DEFAULT 0, p_employee_id uuid DEFAULT NULL::uuid) RETURNS TABLE(success boolean, account_id uuid, error_message text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_account_id UUID;
  v_code_exists BOOLEAN;
BEGIN
  -- Validasi Branch
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is required';
    RETURN;
  END IF;

  -- Validasi Kode Unik dalam Branch
  IF p_code IS NOT NULL AND p_code != '' THEN
    SELECT EXISTS (
      SELECT 1 FROM accounts 
      WHERE code = p_code AND branch_id = p_branch_id AND is_active = TRUE
    ) INTO v_code_exists;
    
    IF v_code_exists THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, 'Account code already exists in this branch';
      RETURN;
    END IF;
  END IF;

  INSERT INTO accounts (
    branch_id,
    name,
    code,
    type,
    balance, -- Initial balance starts as current balance
    initial_balance,
    is_payment_account,
    parent_id,
    level,
    is_header,
    sort_order,
    employee_id,
    is_active,
    created_at,
    updated_at
  ) VALUES (
    p_branch_id,
    p_name,
    NULLIF(p_code, ''),
    p_type,
    p_initial_balance,
    p_initial_balance,
    p_is_payment_account,
    p_parent_id,
    p_level,
    p_is_header,
    p_sort_order,
    p_employee_id,
    TRUE,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_account_id;

  RETURN QUERY SELECT TRUE, v_account_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM;
END;
$$;


ALTER FUNCTION public.create_account(p_branch_id uuid, p_name text, p_code text, p_type text, p_initial_balance numeric, p_is_payment_account boolean, p_parent_id uuid, p_level integer, p_is_header boolean, p_sort_order integer, p_employee_id uuid) OWNER TO postgres;

--
-- Name: create_accounts_payable_atomic(uuid, text, numeric, date, text, text, text, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_accounts_payable_atomic(p_branch_id uuid, p_supplier_name text, p_amount numeric, p_due_date date DEFAULT NULL::date, p_description text DEFAULT NULL::text, p_creditor_type text DEFAULT 'supplier'::text, p_purchase_order_id text DEFAULT NULL::text, p_skip_journal boolean DEFAULT false) RETURNS TABLE(success boolean, payable_id text, journal_id uuid, error_message text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_payable_id TEXT;
  v_journal_id UUID;
  v_entry_number TEXT;
  v_hutang_account_id TEXT;
  v_lawan_account_id TEXT; -- Usually Cash or Inventory depending on context
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID,
      'Branch ID is REQUIRED'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID,
      'Amount must be positive'::TEXT;
    RETURN;
  END IF;

  -- Generate Sequential ID
  v_payable_id := 'AP-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

  -- ==================== INSERT ACCOUNTS PAYABLE ====================

  INSERT INTO accounts_payable (
    id,
    branch_id,
    supplier_name,
    creditor_type,
    amount,
    due_date,
    description,
    purchase_order_id,
    status,
    paid_amount,
    created_at
  ) VALUES (
    v_payable_id,
    p_branch_id,
    p_supplier_name,
    p_creditor_type,
    p_amount,
    p_due_date,
    p_description,
    p_purchase_order_id,
    'Outstanding',
    0,
    NOW()
  );

  -- ==================== CREATE JOURNAL ENTRY ====================

  IF NOT p_skip_journal THEN
    -- Get Account IDs
    -- Default Hutang Usaha: 2110
    SELECT id INTO v_hutang_account_id FROM accounts WHERE code = '2110' AND branch_id = p_branch_id AND is_active = TRUE LIMIT 1;
    
    -- Lawan: 5110 (Pembelian) as default
    SELECT id INTO v_lawan_account_id FROM accounts WHERE code = '5110' AND branch_id = p_branch_id AND is_active = TRUE LIMIT 1;

    IF v_hutang_account_id IS NOT NULL AND v_lawan_account_id IS NOT NULL THEN
      v_entry_number := 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
        LPAD((SELECT COUNT(*) + 1 FROM journal_entries WHERE branch_id = p_branch_id AND DATE(created_at) = CURRENT_DATE)::TEXT, 4, '0');

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
        CURRENT_DATE,
        COALESCE(p_description, 'Hutang Baru: ' || p_supplier_name),
        'accounts_payable',
        v_payable_id,
        p_branch_id,
        'draft',
        p_amount,
        p_amount
      )
      RETURNING id INTO v_journal_id;

      -- Dr. Lawan (Expense/Asset)
      INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
      VALUES (v_journal_id, 1, v_lawan_account_id, COALESCE(p_description, 'Hutang Baru'), p_amount, 0);

      -- Cr. Hutang Usaha
      INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
      VALUES (v_journal_id, 2, v_hutang_account_id, COALESCE(p_description, 'Hutang Baru'), 0, p_amount);

      UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
    END IF;
  END IF;

  RETURN QUERY SELECT TRUE, v_payable_id, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, SQLERRM::TEXT;
END;
$$;


ALTER FUNCTION public.create_accounts_payable_atomic(p_branch_id uuid, p_supplier_name text, p_amount numeric, p_due_date date, p_description text, p_creditor_type text, p_purchase_order_id text, p_skip_journal boolean) OWNER TO postgres;

--
-- Name: FUNCTION create_accounts_payable_atomic(p_branch_id uuid, p_supplier_name text, p_amount numeric, p_due_date date, p_description text, p_creditor_type text, p_purchase_order_id text, p_skip_journal boolean); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.create_accounts_payable_atomic(p_branch_id uuid, p_supplier_name text, p_amount numeric, p_due_date date, p_description text, p_creditor_type text, p_purchase_order_id text, p_skip_journal boolean) IS 'Atomic creation of accounts payable with optional automatic journal entry. WAJIB branch_id.';


--
-- Name: create_all_opening_balance_journal_rpc(uuid, date); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_all_opening_balance_journal_rpc(p_branch_id uuid, p_opening_date date DEFAULT CURRENT_DATE) RETURNS TABLE(success boolean, journal_id uuid, accounts_processed integer, total_debit numeric, error_message text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_laba_ditahan_id UUID;
  v_account RECORD;
  v_total_debit NUMERIC := 0;
  v_total_credit NUMERIC := 0;
  v_line_number INTEGER := 1;
  v_accounts_processed INTEGER := 0;
BEGIN
  -- VALIDASI
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  -- GET LABA DITAHAN ACCOUNT
  SELECT id INTO v_laba_ditahan_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '3200' AND is_active = TRUE LIMIT 1;

  IF v_laba_ditahan_id IS NULL THEN
    SELECT id INTO v_laba_ditahan_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '3100' AND is_active = TRUE LIMIT 1;
  END IF;

  IF v_laba_ditahan_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, 'Akun Laba Ditahan tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- GENERATE ENTRY NUMBER
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

  -- CREATE JOURNAL ENTRY
  INSERT INTO journal_entries (
    id, branch_id, entry_number, entry_date, description,
    reference_type, reference_id, status, is_voided, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_branch_id, v_entry_number, p_opening_date,
    'Saldo Awal Semua Akun',
    'opening', 'ALL-OPENING', 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;

  -- LOOP THROUGH ALL ACCOUNTS WITH INITIAL BALANCE
  FOR v_account IN
    SELECT id, code, name, type, initial_balance, normal_balance
    FROM accounts
    WHERE branch_id = p_branch_id
      AND initial_balance IS NOT NULL
      AND initial_balance <> 0
      AND code NOT IN ('1310', '1320') -- Exclude inventory (handled separately)
      AND is_active = TRUE
    ORDER BY code
  LOOP
    -- Determine debit/credit based on account type and normal balance
    IF v_account.type IN ('Aset', 'Beban') OR v_account.normal_balance = 'DEBIT' THEN
      -- Debit entry for asset/expense accounts
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, account_code, account_name,
        debit_amount, credit_amount, description, line_number
      ) VALUES (
        v_journal_id, v_account.id, v_account.code, v_account.name,
        ABS(v_account.initial_balance), 0, 'Saldo awal ' || v_account.name, v_line_number
      );
      v_total_debit := v_total_debit + ABS(v_account.initial_balance);
    ELSE
      -- Credit entry for liability/equity/revenue accounts
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, account_code, account_name,
        debit_amount, credit_amount, description, line_number
      ) VALUES (
        v_journal_id, v_account.id, v_account.code, v_account.name,
        0, ABS(v_account.initial_balance), 'Saldo awal ' || v_account.name, v_line_number
      );
      v_total_credit := v_total_credit + ABS(v_account.initial_balance);
    END IF;

    v_line_number := v_line_number + 1;
    v_accounts_processed := v_accounts_processed + 1;
  END LOOP;

  -- ADD BALANCING ENTRY TO LABA DITAHAN
  IF v_total_debit <> v_total_credit THEN
    IF v_total_debit > v_total_credit THEN
      -- Need more credit
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, account_code, account_name,
        debit_amount, credit_amount, description, line_number
      ) VALUES (
        v_journal_id, v_laba_ditahan_id,
        (SELECT code FROM accounts WHERE id = v_laba_ditahan_id),
        (SELECT name FROM accounts WHERE id = v_laba_ditahan_id),
        0, v_total_debit - v_total_credit, 'Penyeimbang saldo awal', v_line_number
      );
    ELSE
      -- Need more debit
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, account_code, account_name,
        debit_amount, credit_amount, description, line_number
      ) VALUES (
        v_journal_id, v_laba_ditahan_id,
        (SELECT code FROM accounts WHERE id = v_laba_ditahan_id),
        (SELECT name FROM accounts WHERE id = v_laba_ditahan_id),
        v_total_credit - v_total_debit, 0, 'Penyeimbang saldo awal', v_line_number
      );
    END IF;
  END IF;

  RETURN QUERY SELECT TRUE, v_journal_id, v_accounts_processed, v_total_debit, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, SQLERRM::TEXT;
END;
$$;


ALTER FUNCTION public.create_all_opening_balance_journal_rpc(p_branch_id uuid, p_opening_date date) OWNER TO postgres;

--
-- Name: FUNCTION create_all_opening_balance_journal_rpc(p_branch_id uuid, p_opening_date date); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.create_all_opening_balance_journal_rpc(p_branch_id uuid, p_opening_date date) IS 'Create opening balance journal for all accounts with initial_balance';


--
-- Name: create_asset_atomic(jsonb, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_asset_atomic(p_asset jsonb, p_branch_id uuid) RETURNS TABLE(success boolean, asset_id uuid, journal_id uuid, error_message text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_asset_id UUID;
  v_name TEXT;
  v_code TEXT;
  v_category TEXT;
  v_purchase_date DATE;
  v_purchase_price NUMERIC;
  v_useful_life_years INTEGER;
  v_salvage_value NUMERIC;
  v_depreciation_method TEXT;
  v_source TEXT;  -- 'cash', 'credit', 'migration'
  v_asset_account_id UUID;
  v_cash_account_id UUID;
  v_hutang_account_id UUID;
  v_journal_id UUID;
  v_journal_lines JSONB := '[]'::JSONB;
  v_category_mapping JSONB;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID,
      'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_asset IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID,
      'Asset data is required'::TEXT;
    RETURN;
  END IF;

  -- ==================== PARSE DATA ====================

  v_name := COALESCE(p_asset->>'name', p_asset->>'asset_name', 'Aset Tetap');
  v_code := COALESCE(p_asset->>'code', p_asset->>'asset_code');
  v_category := COALESCE(p_asset->>'category', 'other');
  v_purchase_date := COALESCE((p_asset->>'purchase_date')::DATE, CURRENT_DATE);
  v_purchase_price := COALESCE((p_asset->>'purchase_price')::NUMERIC, 0);
  v_useful_life_years := COALESCE((p_asset->>'useful_life_years')::INTEGER, 5);
  v_salvage_value := COALESCE((p_asset->>'salvage_value')::NUMERIC, 0);
  v_depreciation_method := COALESCE(p_asset->>'depreciation_method', 'straight_line');
  v_source := COALESCE(p_asset->>'source', 'cash');

  IF v_name IS NULL OR v_name = '' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID,
      'Asset name is required'::TEXT;
    RETURN;
  END IF;

  -- ==================== MAP CATEGORY TO ACCOUNT ====================

  -- Category to account code mapping
  v_category_mapping := '{
    "vehicle": {"codes": ["1410"], "names": ["kendaraan"]},
    "equipment": {"codes": ["1420"], "names": ["peralatan", "mesin"]},
    "building": {"codes": ["1440"], "names": ["bangunan", "gedung"]},
    "furniture": {"codes": ["1450"], "names": ["furniture", "inventaris"]},
    "computer": {"codes": ["1460"], "names": ["komputer", "laptop"]},
    "other": {"codes": ["1490"], "names": ["aset lain"]}
  }'::JSONB;

  -- Find asset account by category
  DECLARE
    v_mapping JSONB := v_category_mapping->v_category;
    v_search_code TEXT;
    v_search_name TEXT;
  BEGIN
    IF v_mapping IS NOT NULL THEN
      -- Try by code first
      FOR v_search_code IN SELECT jsonb_array_elements_text(v_mapping->'codes')
      LOOP
        SELECT id INTO v_asset_account_id
        FROM accounts
        WHERE branch_id = p_branch_id
          AND code = v_search_code
          AND is_active = TRUE
        LIMIT 1;
        EXIT WHEN v_asset_account_id IS NOT NULL;
      END LOOP;

      -- Try by name if not found
      IF v_asset_account_id IS NULL THEN
        FOR v_search_name IN SELECT jsonb_array_elements_text(v_mapping->'names')
        LOOP
          SELECT id INTO v_asset_account_id
          FROM accounts
          WHERE branch_id = p_branch_id
            AND LOWER(name) LIKE '%' || v_search_name || '%'
            AND is_active = TRUE
            AND is_header = FALSE
          LIMIT 1;
          EXIT WHEN v_asset_account_id IS NOT NULL;
        END LOOP;
      END IF;
    END IF;

    -- Fallback to any fixed asset account
    IF v_asset_account_id IS NULL THEN
      SELECT id INTO v_asset_account_id
      FROM accounts
      WHERE branch_id = p_branch_id
        AND code LIKE '14%'
        AND is_active = TRUE
        AND is_header = FALSE
      ORDER BY code
      LIMIT 1;
    END IF;
  END;

  -- Find cash account
  SELECT id INTO v_cash_account_id
  FROM accounts
  WHERE branch_id = p_branch_id
    AND is_active = TRUE
    AND is_payment_account = TRUE
    AND code LIKE '11%'
  ORDER BY code
  LIMIT 1;

  -- Find hutang account (for credit purchases)
  SELECT id INTO v_hutang_account_id
  FROM accounts
  WHERE branch_id = p_branch_id
    AND code IN ('2100', '2110')
    AND is_active = TRUE
  LIMIT 1;

  -- Validate asset account found
  IF v_asset_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID,
      'Akun aset tetap tidak ditemukan. Pastikan ada akun dengan kode 14xx.'::TEXT;
    RETURN;
  END IF;

  -- ==================== GENERATE ASSET ID ====================

  v_asset_id := gen_random_uuid();

  -- Generate code if not provided
  IF v_code IS NULL OR v_code = '' THEN
    v_code := 'AST-' || TO_CHAR(v_purchase_date, 'YYYYMM') || '-' ||
              LPAD((SELECT COUNT(*) + 1 FROM assets WHERE branch_id = p_branch_id)::TEXT, 4, '0');
  END IF;

  -- ==================== CREATE ASSET RECORD ====================

  INSERT INTO assets (
    id,
    name,
    code,
    asset_code,
    category,
    purchase_date,
    purchase_price,
    current_value,
    useful_life_years,
    salvage_value,
    depreciation_method,
    location,
    brand,
    model,
    serial_number,
    supplier_name,
    notes,
    status,
    condition,
    account_id,
    branch_id,
    created_at
  ) VALUES (
    v_asset_id,
    v_name,
    v_code,
    v_code,
    v_category,
    v_purchase_date,
    v_purchase_price,
    v_purchase_price,  -- current_value starts at purchase_price
    v_useful_life_years,
    v_salvage_value,
    v_depreciation_method,
    p_asset->>'location',
    COALESCE(p_asset->>'brand', v_name),
    p_asset->>'model',
    p_asset->>'serial_number',
    p_asset->>'supplier_name',
    p_asset->>'notes',
    COALESCE(p_asset->>'status', 'active'),
    COALESCE(p_asset->>'condition', 'good'),
    v_asset_account_id,
    p_branch_id,
    NOW()
  );

  -- ==================== CREATE JOURNAL (if not migration) ====================

  IF v_purchase_price > 0 AND v_source != 'migration' THEN
    -- Debit: Aset Tetap
    v_journal_lines := v_journal_lines || jsonb_build_object(
      'account_id', v_asset_account_id,
      'debit_amount', v_purchase_price,
      'credit_amount', 0,
      'description', format('Pembelian %s', v_name)
    );

    -- Credit: Kas atau Hutang
    IF v_source = 'credit' AND v_hutang_account_id IS NOT NULL THEN
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_id', v_hutang_account_id,
        'debit_amount', 0,
        'credit_amount', v_purchase_price,
        'description', 'Hutang pembelian aset'
      );
    ELSIF v_cash_account_id IS NOT NULL THEN
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_id', v_cash_account_id,
        'debit_amount', 0,
        'credit_amount', v_purchase_price,
        'description', 'Pembayaran tunai aset'
      );
    ELSE
      RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID,
        'Akun pembayaran tidak ditemukan'::TEXT;
      RETURN;
    END IF;

    SELECT cja.journal_id INTO v_journal_id FROM create_journal_atomic(
      p_branch_id,
      v_purchase_date,
      format('Pembelian Aset - %s', v_name),
      'asset',
      v_asset_id::TEXT,
      v_journal_lines,
      TRUE
    );
  END IF;

  -- ==================== SUCCESS ====================

  RETURN QUERY SELECT TRUE, v_asset_id, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, SQLERRM::TEXT;
END;
$$;


ALTER FUNCTION public.create_asset_atomic(p_asset jsonb, p_branch_id uuid) OWNER TO postgres;

--
-- Name: FUNCTION create_asset_atomic(p_asset jsonb, p_branch_id uuid); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.create_asset_atomic(p_asset jsonb, p_branch_id uuid) IS 'Create asset dengan auto journal pembelian. WAJIB branch_id.';


--
-- Name: create_audit_log(text, text, text, jsonb, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_audit_log(p_table_name text, p_operation text, p_record_id text, p_old_data jsonb DEFAULT NULL::jsonb, p_new_data jsonb DEFAULT NULL::jsonb, p_additional_info jsonb DEFAULT NULL::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  audit_id UUID;
  current_user_id UUID;
  current_user_role TEXT;
  current_user_email TEXT;
  current_user_name TEXT;
BEGIN
  -- Get current user from JWT claims (PostgREST compatible)
  BEGIN
    current_user_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    current_user_id := NULL;
  END;
  
  -- Get user info from profiles table (not auth.users)
  IF current_user_id IS NOT NULL THEN
    SELECT p.role, p.email, p.full_name INTO current_user_role, current_user_email, current_user_name
    FROM public.profiles p
    WHERE p.id = current_user_id;
  ELSE
    -- Fallback to JWT role claim
    BEGIN
      current_user_role := current_setting('request.jwt.claims', true)::json->>'role';
    EXCEPTION WHEN OTHERS THEN
      current_user_role := 'unknown';
    END;
  END IF;
  
  -- Insert audit log
  INSERT INTO public.audit_logs (
    table_name,
    operation,
    record_id,
    old_data,
    new_data,
    user_id,
    user_email,
    user_role,
    additional_info
  ) VALUES (
    p_table_name,
    p_operation,
    p_record_id,
    p_old_data,
    p_new_data,
    current_user_id,
    COALESCE(current_user_email, 'system'),
    COALESCE(current_user_role, 'unknown'),
    p_additional_info
  ) RETURNING id INTO audit_id;
  
  RETURN audit_id;
END;
$$;


ALTER FUNCTION public.create_audit_log(p_table_name text, p_operation text, p_record_id text, p_old_data jsonb, p_new_data jsonb, p_additional_info jsonb) OWNER TO postgres;

--
-- Name: create_debt_journal_rpc(uuid, text, date, numeric, text, text, text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_debt_journal_rpc(p_branch_id uuid, p_debt_id text, p_debt_date date, p_amount numeric, p_creditor_name text, p_creditor_type text DEFAULT 'other'::text, p_description text DEFAULT NULL::text, p_cash_account_id uuid DEFAULT NULL::uuid) RETURNS TABLE(success boolean, journal_id uuid, error_message text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_kas_account_id UUID;
  v_hutang_account_id UUID;
  v_hutang_code TEXT;
BEGIN
  -- VALIDASI
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Amount must be greater than 0'::TEXT;
    RETURN;
  END IF;

  -- GET KAS ACCOUNT (use provided or default 1120 Bank)
  IF p_cash_account_id IS NOT NULL THEN
    v_kas_account_id := p_cash_account_id;
  ELSE
    SELECT id INTO v_kas_account_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '1120' AND is_active = TRUE LIMIT 1;
  END IF;

  -- GET HUTANG ACCOUNT BASED ON CREDITOR TYPE
  CASE p_creditor_type
    WHEN 'bank' THEN v_hutang_code := '2120'; -- Hutang Bank
    WHEN 'supplier' THEN v_hutang_code := '2110'; -- Hutang Usaha
    ELSE v_hutang_code := '2190'; -- Hutang Lain-lain
  END CASE;

  SELECT id INTO v_hutang_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = v_hutang_code AND is_active = TRUE LIMIT 1;

  IF v_hutang_account_id IS NULL THEN
    -- Fallback to 2110
    SELECT id INTO v_hutang_account_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '2110' AND is_active = TRUE LIMIT 1;
    v_hutang_code := '2110';
  END IF;

  IF v_kas_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Kas/Bank tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  IF v_hutang_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Hutang tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- GENERATE ENTRY NUMBER
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

  -- CREATE JOURNAL ENTRY
  INSERT INTO journal_entries (
    id, branch_id, entry_number, entry_date, description,
    reference_type, reference_id, status, is_voided, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_branch_id, v_entry_number, p_debt_date,
    COALESCE(p_description, 'Pinjaman dari ' || p_creditor_name),
    'payable', p_debt_id, 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Kas (kas bertambah karena pinjaman)
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_kas_account_id,
    (SELECT code FROM accounts WHERE id = v_kas_account_id),
    (SELECT name FROM accounts WHERE id = v_kas_account_id),
    p_amount, 0, 'Penerimaan pinjaman dari ' || p_creditor_name, 1
  );

  -- Cr. Hutang
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_hutang_account_id, v_hutang_code,
    (SELECT name FROM accounts WHERE id = v_hutang_account_id),
    0, p_amount, 'Hutang kepada ' || p_creditor_name, 2
  );

  RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$;


ALTER FUNCTION public.create_debt_journal_rpc(p_branch_id uuid, p_debt_id text, p_debt_date date, p_amount numeric, p_creditor_name text, p_creditor_type text, p_description text, p_cash_account_id uuid) OWNER TO postgres;

--
-- Name: FUNCTION create_debt_journal_rpc(p_branch_id uuid, p_debt_id text, p_debt_date date, p_amount numeric, p_creditor_name text, p_creditor_type text, p_description text, p_cash_account_id uuid); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.create_debt_journal_rpc(p_branch_id uuid, p_debt_id text, p_debt_date date, p_amount numeric, p_creditor_name text, p_creditor_type text, p_description text, p_cash_account_id uuid) IS 'Create journal for new debt/loan: Dr. Kas, Cr. Hutang';


--
-- Name: create_employee_advance_atomic(jsonb, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_employee_advance_atomic(p_advance jsonb, p_branch_id uuid) RETURNS TABLE(success boolean, advance_id uuid, journal_id uuid, error_message text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_advance_id UUID;
  v_journal_id UUID;
  v_employee_id UUID;
  v_employee_name TEXT;
  v_amount NUMERIC;
  v_advance_date DATE;
  v_reason TEXT;
  v_payment_account_id UUID;

  v_kas_account_id UUID;
  v_piutang_karyawan_id UUID;
  v_entry_number TEXT;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  -- Permission check
  IF auth.uid() IS NOT NULL THEN
    IF NOT check_user_permission(auth.uid(), 'advances_manage') THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Tidak memiliki akses untuk membuat kasbon'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- ==================== PARSE DATA ====================

  v_advance_id := COALESCE((p_advance->>'id')::UUID, gen_random_uuid());
  v_employee_id := (p_advance->>'employee_id')::UUID;
  v_employee_name := p_advance->>'employee_name';
  v_amount := COALESCE((p_advance->>'amount')::NUMERIC, 0);
  v_advance_date := COALESCE((p_advance->>'advance_date')::DATE, CURRENT_DATE);
  v_reason := COALESCE(p_advance->>'reason', 'Kasbon karyawan');
  v_payment_account_id := (p_advance->>'payment_account_id')::UUID;

  IF v_employee_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Employee ID is required'::TEXT;
    RETURN;
  END IF;

  IF v_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Amount must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get employee name if not provided (localhost uses profiles, not employees)
  IF v_employee_name IS NULL THEN
    SELECT full_name INTO v_employee_name FROM profiles WHERE id = v_employee_id;
  END IF;

  -- ==================== GET ACCOUNT IDS ====================

  -- Kas account
  IF v_payment_account_id IS NOT NULL THEN
    v_kas_account_id := v_payment_account_id;
  ELSE
    SELECT id INTO v_kas_account_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '1110' AND is_active = TRUE LIMIT 1;
  END IF;

  -- Piutang Karyawan (1230 atau sesuai chart of accounts)
  SELECT id INTO v_piutang_karyawan_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1230' AND is_active = TRUE LIMIT 1;

  -- Fallback: cari akun dengan nama mengandung "Piutang Karyawan"
  IF v_piutang_karyawan_id IS NULL THEN
    SELECT id INTO v_piutang_karyawan_id FROM accounts
    WHERE branch_id = p_branch_id AND name ILIKE '%piutang karyawan%' AND is_active = TRUE LIMIT 1;
  END IF;

  IF v_kas_account_id IS NULL OR v_piutang_karyawan_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Akun Kas atau Piutang Karyawan tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- ==================== INSERT ADVANCE RECORD ====================

  INSERT INTO employee_advances (
    id,
    branch_id,
    employee_id,
    employee_name,
    amount,
    remaining_amount,
    advance_date,
    reason,
    status,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    v_advance_id,
    p_branch_id,
    v_employee_id,
    v_employee_name,
    v_amount,
    v_amount, -- remaining = full amount initially
    v_advance_date,
    v_reason,
    'active',
    auth.uid(),
    NOW(),
    NOW()
  );

  -- ==================== CREATE JOURNAL ENTRY ====================

  -- Generate entry number
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

  -- Create journal header
  INSERT INTO journal_entries (
    id,
    branch_id,
    entry_number,
    entry_date,
    description,
    reference_type,
    reference_id,
    status,
    is_voided,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    p_branch_id,
    v_entry_number,
    v_advance_date,
    'Kasbon Karyawan - ' || v_employee_name || ' - ' || v_reason,
    'advance',
    v_advance_id::TEXT,
    'posted',
    FALSE,
    NOW(),
    NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Piutang Karyawan
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_piutang_karyawan_id,
    (SELECT name FROM accounts WHERE id = v_piutang_karyawan_id),
    v_amount, 0, 'Kasbon ' || v_employee_name, 1
  );

  -- Cr. Kas
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_kas_account_id,
    (SELECT name FROM accounts WHERE id = v_kas_account_id),
    0, v_amount, 'Pengeluaran kas untuk kasbon', 2
  );

  -- ==================== SUCCESS ====================

  RETURN QUERY SELECT TRUE, v_advance_id, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, SQLERRM::TEXT;
END;
$$;


ALTER FUNCTION public.create_employee_advance_atomic(p_advance jsonb, p_branch_id uuid) OWNER TO postgres;

--
-- Name: create_expense_atomic(jsonb, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_expense_atomic(p_expense jsonb, p_branch_id uuid) RETURNS TABLE(success boolean, expense_id text, journal_id uuid, error_message text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_expense_id TEXT;
  v_description TEXT;
  v_amount NUMERIC;
  v_category TEXT;
  v_date DATE;
  v_cash_account_id TEXT;  -- accounts.id is TEXT not UUID
  v_expense_account_id TEXT;  -- accounts.id is TEXT not UUID
  v_expense_account_name TEXT;
  v_journal_id UUID;
  v_journal_lines JSONB := '[]'::JSONB;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID,
      'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_expense IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID,
      'Expense data is required'::TEXT;
    RETURN;
  END IF;

  -- ==================== PARSE DATA ====================

  v_description := COALESCE(p_expense->>'description', 'Pengeluaran');
  v_amount := COALESCE((p_expense->>'amount')::NUMERIC, 0);
  v_category := COALESCE(p_expense->>'category', 'Beban Umum');
  v_date := COALESCE((p_expense->>'date')::DATE, CURRENT_DATE);
  v_cash_account_id := p_expense->>'account_id';  -- TEXT, no cast needed
  v_expense_account_id := p_expense->>'expense_account_id';  -- TEXT, no cast needed
  v_expense_account_name := p_expense->>'expense_account_name';

  IF v_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID,
      'Amount must be greater than 0'::TEXT;
    RETURN;
  END IF;

  -- ==================== FIND ACCOUNTS ====================

  -- Find expense account by ID or fallback to category-based search
  IF v_expense_account_id IS NULL THEN
    -- Search by category name
    SELECT id INTO v_expense_account_id
    FROM accounts
    WHERE branch_id = p_branch_id
      AND is_active = TRUE
      AND is_header = FALSE
      AND (
        code LIKE '6%'  -- Expense accounts
        OR type IN ('Beban', 'Expense')
      )
      AND (
        LOWER(name) LIKE '%' || LOWER(v_category) || '%'
        OR name ILIKE '%beban umum%'
      )
    ORDER BY
      CASE WHEN LOWER(name) LIKE '%' || LOWER(v_category) || '%' THEN 1 ELSE 2 END,
      code
    LIMIT 1;

    -- Fallback to default expense account (6200 - Beban Operasional or 6100)
    IF v_expense_account_id IS NULL THEN
      SELECT id INTO v_expense_account_id
      FROM accounts
      WHERE branch_id = p_branch_id
        AND is_active = TRUE
        AND is_header = FALSE
        AND code IN ('6200', '6100', '6000')
      ORDER BY code
      LIMIT 1;
    END IF;
  END IF;

  -- Find cash/payment account
  IF v_cash_account_id IS NULL THEN
    SELECT id INTO v_cash_account_id
    FROM accounts
    WHERE branch_id = p_branch_id
      AND is_active = TRUE
      AND is_payment_account = TRUE
      AND code LIKE '11%'
    ORDER BY code
    LIMIT 1;
  END IF;

  -- Validate accounts found
  IF v_expense_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID,
      'Akun beban tidak ditemukan. Pastikan ada akun dengan kode 6xxx.'::TEXT;
    RETURN;
  END IF;

  IF v_cash_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID,
      'Akun kas tidak ditemukan. Pastikan ada akun payment dengan kode 11xx.'::TEXT;
    RETURN;
  END IF;

  -- ==================== GENERATE EXPENSE ID ====================

  v_expense_id := 'exp-' || EXTRACT(EPOCH FROM NOW())::BIGINT::TEXT ||
                  '-' || LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0');

  -- ==================== CREATE EXPENSE RECORD ====================

  INSERT INTO expenses (
    id,
    description,
    amount,
    category,
    date,
    account_id,
    expense_account_id,
    expense_account_name,
    branch_id,
    created_at
  ) VALUES (
    v_expense_id,
    v_description,
    v_amount,
    v_category,
    v_date,
    v_cash_account_id,
    v_expense_account_id,
    v_expense_account_name,
    p_branch_id,
    NOW()
  );

  -- ==================== CREATE JOURNAL ====================

  -- Debit: Beban (expense account)
  v_journal_lines := v_journal_lines || jsonb_build_object(
    'account_id', v_expense_account_id,
    'debit_amount', v_amount,
    'credit_amount', 0,
    'description', v_category || ': ' || v_description
  );

  -- Credit: Kas (payment account)
  v_journal_lines := v_journal_lines || jsonb_build_object(
    'account_id', v_cash_account_id,
    'debit_amount', 0,
    'credit_amount', v_amount,
    'description', 'Pengeluaran kas'
  );

  SELECT cja.journal_id INTO v_journal_id FROM create_journal_atomic(
    p_branch_id,
    v_date,
    format('Pengeluaran - %s', v_description),
    'expense',
    v_expense_id,
    v_journal_lines,
    TRUE
  ) AS cja;

  -- ==================== SUCCESS ====================

  RETURN QUERY SELECT TRUE, v_expense_id, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, SQLERRM::TEXT;
END;
$$;


ALTER FUNCTION public.create_expense_atomic(p_expense jsonb, p_branch_id uuid) OWNER TO postgres;

--
-- Name: FUNCTION create_expense_atomic(p_expense jsonb, p_branch_id uuid); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.create_expense_atomic(p_expense jsonb, p_branch_id uuid) IS 'Create expense dengan auto journal (Dr. Beban, Cr. Kas). WAJIB branch_id.';


--
-- Name: create_inventory_opening_balance_journal_rpc(uuid, numeric, numeric, date); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_inventory_opening_balance_journal_rpc(p_branch_id uuid, p_products_value numeric DEFAULT 0, p_materials_value numeric DEFAULT 0, p_opening_date date DEFAULT CURRENT_DATE) RETURNS TABLE(success boolean, journal_id uuid, error_message text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_persediaan_barang_id UUID;
  v_persediaan_bahan_id UUID;
  v_laba_ditahan_id UUID;
  v_total_amount NUMERIC;
  v_line_number INTEGER := 1;
BEGIN
  -- VALIDASI
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  v_total_amount := COALESCE(p_products_value, 0) + COALESCE(p_materials_value, 0);

  IF v_total_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Total value must be greater than 0'::TEXT;
    RETURN;
  END IF;

  -- GET ACCOUNT IDS
  SELECT id INTO v_persediaan_barang_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1310' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_persediaan_bahan_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1320' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_laba_ditahan_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '3200' AND is_active = TRUE LIMIT 1;

  IF v_laba_ditahan_id IS NULL THEN
    -- Fallback to Modal Disetor
    SELECT id INTO v_laba_ditahan_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '3100' AND is_active = TRUE LIMIT 1;
  END IF;

  IF v_laba_ditahan_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Laba Ditahan/Modal tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- GENERATE ENTRY NUMBER
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

  -- CREATE JOURNAL ENTRY
  INSERT INTO journal_entries (
    id, branch_id, entry_number, entry_date, description,
    reference_type, reference_id, status, is_voided, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_branch_id, v_entry_number, p_opening_date,
    'Saldo Awal Persediaan',
    'opening', 'INVENTORY-OPENING', 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Persediaan Barang Dagang (if > 0)
  IF p_products_value > 0 AND v_persediaan_barang_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, account_code, account_name,
      debit_amount, credit_amount, description, line_number
    ) VALUES (
      v_journal_id, v_persediaan_barang_id, '1310',
      (SELECT name FROM accounts WHERE id = v_persediaan_barang_id),
      p_products_value, 0, 'Saldo awal persediaan barang dagang', v_line_number
    );
    v_line_number := v_line_number + 1;
  END IF;

  -- Dr. Persediaan Bahan Baku (if > 0)
  IF p_materials_value > 0 AND v_persediaan_bahan_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, account_code, account_name,
      debit_amount, credit_amount, description, line_number
    ) VALUES (
      v_journal_id, v_persediaan_bahan_id, '1320',
      (SELECT name FROM accounts WHERE id = v_persediaan_bahan_id),
      p_materials_value, 0, 'Saldo awal persediaan bahan baku', v_line_number
    );
    v_line_number := v_line_number + 1;
  END IF;

  -- Cr. Laba Ditahan (penyeimbang)
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_laba_ditahan_id,
    (SELECT code FROM accounts WHERE id = v_laba_ditahan_id),
    (SELECT name FROM accounts WHERE id = v_laba_ditahan_id),
    0, v_total_amount, 'Penyeimbang saldo awal persediaan', v_line_number
  );

  RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$;


ALTER FUNCTION public.create_inventory_opening_balance_journal_rpc(p_branch_id uuid, p_products_value numeric, p_materials_value numeric, p_opening_date date) OWNER TO postgres;

--
-- Name: FUNCTION create_inventory_opening_balance_journal_rpc(p_branch_id uuid, p_products_value numeric, p_materials_value numeric, p_opening_date date); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.create_inventory_opening_balance_journal_rpc(p_branch_id uuid, p_products_value numeric, p_materials_value numeric, p_opening_date date) IS 'Create opening balance journal for inventory';


--
-- Name: create_journal_atomic(uuid, date, text, text, text, jsonb, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_journal_atomic(p_branch_id uuid, p_entry_date date, p_description text, p_reference_type text DEFAULT NULL::text, p_reference_id text DEFAULT NULL::text, p_lines jsonb DEFAULT '[]'::jsonb, p_auto_post boolean DEFAULT true) RETURNS TABLE(success boolean, journal_id uuid, entry_number text, error_message text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_total_debit NUMERIC := 0;
  v_total_credit NUMERIC := 0;
  v_line RECORD;
  v_line_number INTEGER := 0;
  v_period_closed BOOLEAN := FALSE;
BEGIN
  -- ==================== VALIDASI ====================

  -- Validasi branch_id WAJIB
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE AS success, NULL::UUID AS journal_id, NULL::TEXT AS entry_number,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT AS error_message;
    RETURN;
  END IF;

  -- Validasi lines tidak kosong
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RETURN QUERY SELECT FALSE AS success, NULL::UUID AS journal_id, NULL::TEXT AS entry_number,
      'Journal lines are required'::TEXT AS error_message;
    RETURN;
  END IF;

  -- Validasi minimal 2 lines
  IF jsonb_array_length(p_lines) < 2 THEN
    RETURN QUERY SELECT FALSE AS success, NULL::UUID AS journal_id, NULL::TEXT AS entry_number,
      'Minimal 2 journal lines required (double-entry)'::TEXT AS error_message;
    RETURN;
  END IF;

  -- ==================== CEK PERIOD LOCK ====================

  -- Cek apakah periode sudah ditutup
  BEGIN
    SELECT EXISTS (
      SELECT 1 FROM closing_entries
      WHERE branch_id = p_branch_id
        AND closing_type = 'year_end'
        AND status = 'posted'
        AND closing_date >= p_entry_date
    ) INTO v_period_closed;
  EXCEPTION WHEN undefined_table THEN
    v_period_closed := FALSE;
  END;

  IF v_period_closed THEN
    RETURN QUERY SELECT FALSE AS success, NULL::UUID AS journal_id, NULL::TEXT AS entry_number,
      format('Periode %s sudah ditutup. Tidak dapat membuat jurnal.', p_entry_date)::TEXT AS error_message;
    RETURN;
  END IF;

  -- ==================== VALIDASI LINES ====================

  -- Hitung total dan validasi accounts
  FOR v_line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
    account_id TEXT,
    account_code TEXT,
    debit_amount NUMERIC,
    credit_amount NUMERIC,
    description TEXT
  )
  LOOP
    -- Validasi account exists
    IF v_line.account_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM accounts
        WHERE id = v_line.account_id
          AND branch_id = p_branch_id
          AND is_active = TRUE
      ) THEN
        RETURN QUERY SELECT FALSE AS success, NULL::UUID AS journal_id, NULL::TEXT AS entry_number,
          format('Account ID %s tidak ditemukan di branch ini', v_line.account_id)::TEXT AS error_message;
        RETURN;
      END IF;
    ELSIF v_line.account_code IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM accounts
        WHERE code = v_line.account_code
          AND branch_id = p_branch_id
          AND is_active = TRUE
      ) THEN
        RETURN QUERY SELECT FALSE AS success, NULL::UUID AS journal_id, NULL::TEXT AS entry_number,
          format('Account code %s tidak ditemukan di branch ini', v_line.account_code)::TEXT AS error_message;
        RETURN;
      END IF;
    ELSE
      RETURN QUERY SELECT FALSE AS success, NULL::UUID AS journal_id, NULL::TEXT AS entry_number,
        'Setiap line harus memiliki account_id atau account_code'::TEXT AS error_message;
      RETURN;
    END IF;

    v_total_debit := v_total_debit + COALESCE(v_line.debit_amount, 0);
    v_total_credit := v_total_credit + COALESCE(v_line.credit_amount, 0);
  END LOOP;

  -- ==================== VALIDASI BALANCE ====================

  IF v_total_debit != v_total_credit THEN
    RETURN QUERY SELECT FALSE AS success, NULL::UUID AS journal_id, NULL::TEXT AS entry_number,
      format('Jurnal tidak balance! Debit: %s, Credit: %s', v_total_debit, v_total_credit)::TEXT AS error_message;
    RETURN;
  END IF;

  IF v_total_debit = 0 THEN
    RETURN QUERY SELECT FALSE AS success, NULL::UUID AS journal_id, NULL::TEXT AS entry_number,
      'Total debit/credit tidak boleh 0'::TEXT AS error_message;
    RETURN;
  END IF;

  -- ==================== GENERATE ENTRY NUMBER ====================

  v_entry_number := 'JE-' || TO_CHAR(p_entry_date, 'YYYYMMDD') || '-' ||
    LPAD((SELECT COUNT(*) + 1 FROM journal_entries
          WHERE branch_id = p_branch_id
          AND DATE(created_at) = DATE(p_entry_date))::TEXT, 4, '0') ||
    LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0');

  -- ==================== CREATE JOURNAL HEADER ====================

  -- Create as draft first (trigger may block lines on posted)
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

  -- ==================== CREATE JOURNAL LINES ====================

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
      account_code,
      description,
      debit_amount,
      credit_amount
    ) VALUES (
      v_journal_id,
      v_line_number,
      CASE
        WHEN v_line.account_id IS NOT NULL THEN v_line.account_id  -- accounts.id is TEXT
        ELSE (SELECT id FROM accounts WHERE code = v_line.account_code AND branch_id = p_branch_id LIMIT 1)
      END,
      COALESCE(v_line.account_code,
        (SELECT code FROM accounts WHERE id = v_line.account_id LIMIT 1)),
      COALESCE(v_line.description, p_description),
      COALESCE(v_line.debit_amount, 0),
      COALESCE(v_line.credit_amount, 0)
    );
  END LOOP;

  -- ==================== POST JOURNAL ====================

  IF p_auto_post THEN
    UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
  END IF;

  RETURN QUERY SELECT TRUE AS success, v_journal_id AS journal_id, v_entry_number AS entry_number, NULL::TEXT AS error_message;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE AS success, NULL::UUID AS journal_id, NULL::TEXT AS entry_number, SQLERRM::TEXT AS error_message;
END;
$$;


ALTER FUNCTION public.create_journal_atomic(p_branch_id uuid, p_entry_date date, p_description text, p_reference_type text, p_reference_id text, p_lines jsonb, p_auto_post boolean) OWNER TO postgres;

--
-- Name: FUNCTION create_journal_atomic(p_branch_id uuid, p_entry_date date, p_description text, p_reference_type text, p_reference_id text, p_lines jsonb, p_auto_post boolean); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.create_journal_atomic(p_branch_id uuid, p_entry_date date, p_description text, p_reference_type text, p_reference_id text, p_lines jsonb, p_auto_post boolean) IS 'Create journal entry atomic dengan validasi balance. WAJIB branch_id.';


--
-- Name: create_maintenance_reminders(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_maintenance_reminders() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Create notifications for upcoming maintenance
    INSERT INTO notifications (id, title, message, type, reference_type, reference_id, reference_url, priority, user_id)
    SELECT
        'NOTIF-REMINDER-' || am.id || '-' || EXTRACT(EPOCH FROM NOW())::TEXT,
        'Upcoming Maintenance: ' || a.asset_name,
        'Maintenance "' || am.title || '" for asset "' || a.asset_name || '" is scheduled for ' || am.scheduled_date::TEXT,
        'maintenance_due',
        'maintenance',
        am.id,
        '/maintenance',
        CASE
            WHEN am.priority = 'critical' THEN 'urgent'
            WHEN am.priority = 'high' THEN 'high'
            ELSE 'normal'
        END,
        am.created_by
    FROM asset_maintenance am
    JOIN assets a ON am.asset_id = a.id
    WHERE am.status = 'scheduled'
      AND am.scheduled_date <= CURRENT_DATE + (am.notify_before_days || ' days')::INTERVAL
      AND am.scheduled_date >= CURRENT_DATE
      AND am.notification_sent = FALSE;

    -- Mark notifications as sent
    UPDATE asset_maintenance
    SET notification_sent = TRUE
    WHERE status = 'scheduled'
      AND scheduled_date <= CURRENT_DATE + (notify_before_days || ' days')::INTERVAL
      AND scheduled_date >= CURRENT_DATE
      AND notification_sent = FALSE;
END;
$$;


ALTER FUNCTION public.create_maintenance_reminders() OWNER TO postgres;

--
-- Name: create_manual_cash_in_journal_rpc(uuid, text, date, numeric, text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_manual_cash_in_journal_rpc(p_branch_id uuid, p_reference_id text, p_transaction_date date, p_amount numeric, p_description text, p_cash_account_id uuid) RETURNS TABLE(success boolean, journal_id uuid, error_message text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_pendapatan_lain_account_id UUID;
BEGIN
  -- VALIDASI
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Amount must be greater than 0'::TEXT;
    RETURN;
  END IF;

  IF p_cash_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Cash account is required'::TEXT;
    RETURN;
  END IF;

  -- GET PENDAPATAN LAIN-LAIN ACCOUNT (4200 or 4900)
  SELECT id INTO v_pendapatan_lain_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code IN ('4200', '4900') AND is_active = TRUE
  ORDER BY code LIMIT 1;

  IF v_pendapatan_lain_account_id IS NULL THEN
    -- Create if not exists
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Pendapatan Lain-lain tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- GENERATE ENTRY NUMBER
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

  -- CREATE JOURNAL ENTRY
  INSERT INTO journal_entries (
    id, branch_id, entry_number, entry_date, description,
    reference_type, reference_id, status, is_voided, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_branch_id, v_entry_number, p_transaction_date,
    'Kas Masuk: ' || p_description,
    'manual', p_reference_id, 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Kas
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, p_cash_account_id,
    (SELECT code FROM accounts WHERE id = p_cash_account_id),
    (SELECT name FROM accounts WHERE id = p_cash_account_id),
    p_amount, 0, 'Kas masuk - ' || p_description, 1
  );

  -- Cr. Pendapatan Lain-lain
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_pendapatan_lain_account_id,
    (SELECT code FROM accounts WHERE id = v_pendapatan_lain_account_id),
    (SELECT name FROM accounts WHERE id = v_pendapatan_lain_account_id),
    0, p_amount, 'Pendapatan lain-lain', 2
  );

  RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$;


ALTER FUNCTION public.create_manual_cash_in_journal_rpc(p_branch_id uuid, p_reference_id text, p_transaction_date date, p_amount numeric, p_description text, p_cash_account_id uuid) OWNER TO postgres;

--
-- Name: FUNCTION create_manual_cash_in_journal_rpc(p_branch_id uuid, p_reference_id text, p_transaction_date date, p_amount numeric, p_description text, p_cash_account_id uuid); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.create_manual_cash_in_journal_rpc(p_branch_id uuid, p_reference_id text, p_transaction_date date, p_amount numeric, p_description text, p_cash_account_id uuid) IS 'Create journal for manual cash in: Dr. Kas, Cr. Pendapatan Lain';


--
-- Name: create_manual_cash_out_journal_rpc(uuid, text, date, numeric, text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_manual_cash_out_journal_rpc(p_branch_id uuid, p_reference_id text, p_transaction_date date, p_amount numeric, p_description text, p_cash_account_id uuid) RETURNS TABLE(success boolean, journal_id uuid, error_message text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_beban_lain_account_id UUID;
BEGIN
  -- VALIDASI
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Amount must be greater than 0'::TEXT;
    RETURN;
  END IF;

  IF p_cash_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Cash account is required'::TEXT;
    RETURN;
  END IF;

  -- GET BEBAN LAIN-LAIN ACCOUNT (8100 or 6900)
  SELECT id INTO v_beban_lain_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code IN ('8100', '6900') AND is_active = TRUE
  ORDER BY code LIMIT 1;

  IF v_beban_lain_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Beban Lain-lain tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- GENERATE ENTRY NUMBER
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

  -- CREATE JOURNAL ENTRY
  INSERT INTO journal_entries (
    id, branch_id, entry_number, entry_date, description,
    reference_type, reference_id, status, is_voided, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_branch_id, v_entry_number, p_transaction_date,
    'Kas Keluar: ' || p_description,
    'manual', p_reference_id, 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Beban Lain-lain
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_beban_lain_account_id,
    (SELECT code FROM accounts WHERE id = v_beban_lain_account_id),
    (SELECT name FROM accounts WHERE id = v_beban_lain_account_id),
    p_amount, 0, 'Beban lain-lain - ' || p_description, 1
  );

  -- Cr. Kas
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, p_cash_account_id,
    (SELECT code FROM accounts WHERE id = p_cash_account_id),
    (SELECT name FROM accounts WHERE id = p_cash_account_id),
    0, p_amount, 'Kas keluar - ' || p_description, 2
  );

  RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$;


ALTER FUNCTION public.create_manual_cash_out_journal_rpc(p_branch_id uuid, p_reference_id text, p_transaction_date date, p_amount numeric, p_description text, p_cash_account_id uuid) OWNER TO postgres;

--
-- Name: FUNCTION create_manual_cash_out_journal_rpc(p_branch_id uuid, p_reference_id text, p_transaction_date date, p_amount numeric, p_description text, p_cash_account_id uuid); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.create_manual_cash_out_journal_rpc(p_branch_id uuid, p_reference_id text, p_transaction_date date, p_amount numeric, p_description text, p_cash_account_id uuid) IS 'Create journal for manual cash out: Dr. Beban Lain, Cr. Kas';


--
-- Name: create_material_payment_journal_rpc(uuid, text, date, numeric, uuid, text, text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_material_payment_journal_rpc(p_branch_id uuid, p_reference_id text, p_transaction_date date, p_amount numeric, p_material_id uuid, p_material_name text, p_description text, p_cash_account_id uuid) RETURNS TABLE(success boolean, journal_id uuid, error_message text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_beban_bahan_account_id UUID;
BEGIN
  -- VALIDASI
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Amount must be greater than 0'::TEXT;
    RETURN;
  END IF;

  IF p_cash_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Cash account is required'::TEXT;
    RETURN;
  END IF;

  -- GET BEBAN BAHAN BAKU ACCOUNT (5300 or 6300)
  SELECT id INTO v_beban_bahan_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code IN ('5300', '6300', '6310') AND is_active = TRUE
  ORDER BY code LIMIT 1;

  IF v_beban_bahan_account_id IS NULL THEN
    -- Fallback to generic expense
    SELECT id INTO v_beban_bahan_account_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '6100' AND is_active = TRUE LIMIT 1;
  END IF;

  IF v_beban_bahan_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Beban Bahan Baku tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- GENERATE ENTRY NUMBER
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

  -- CREATE JOURNAL ENTRY
  INSERT INTO journal_entries (
    id, branch_id, entry_number, entry_date, description,
    reference_type, reference_id, status, is_voided, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_branch_id, v_entry_number, p_transaction_date,
    COALESCE(p_description, 'Pembayaran bahan - ' || p_material_name),
    'expense', p_reference_id, 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Beban Bahan Baku
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_beban_bahan_account_id,
    (SELECT code FROM accounts WHERE id = v_beban_bahan_account_id),
    (SELECT name FROM accounts WHERE id = v_beban_bahan_account_id),
    p_amount, 0, 'Beban bahan - ' || p_material_name, 1
  );

  -- Cr. Kas
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, p_cash_account_id,
    (SELECT code FROM accounts WHERE id = p_cash_account_id),
    (SELECT name FROM accounts WHERE id = p_cash_account_id),
    0, p_amount, 'Pembayaran bahan ' || p_material_name, 2
  );

  RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$;


ALTER FUNCTION public.create_material_payment_journal_rpc(p_branch_id uuid, p_reference_id text, p_transaction_date date, p_amount numeric, p_material_id uuid, p_material_name text, p_description text, p_cash_account_id uuid) OWNER TO postgres;

--
-- Name: FUNCTION create_material_payment_journal_rpc(p_branch_id uuid, p_reference_id text, p_transaction_date date, p_amount numeric, p_material_id uuid, p_material_name text, p_description text, p_cash_account_id uuid); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.create_material_payment_journal_rpc(p_branch_id uuid, p_reference_id text, p_transaction_date date, p_amount numeric, p_material_id uuid, p_material_name text, p_description text, p_cash_account_id uuid) IS 'Create journal for material bill payment: Dr. Beban Bahan, Cr. Kas';


--
-- Name: create_material_stock_adjustment_atomic(uuid, uuid, numeric, text, numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_material_stock_adjustment_atomic(p_material_id uuid, p_branch_id uuid, p_quantity_change numeric, p_reason text DEFAULT 'Stock Adjustment'::text, p_unit_cost numeric DEFAULT 0) RETURNS TABLE(success boolean, adjustment_id uuid, journal_id uuid, new_stock numeric, error_message text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
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
    id, material_id, branch_id, movement_type, quantity,
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
$$;


ALTER FUNCTION public.create_material_stock_adjustment_atomic(p_material_id uuid, p_branch_id uuid, p_quantity_change numeric, p_reason text, p_unit_cost numeric) OWNER TO postgres;

--
-- Name: create_migration_debt_journal_rpc(uuid, text, date, numeric, text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_migration_debt_journal_rpc(p_branch_id uuid, p_debt_id text, p_debt_date date, p_amount numeric, p_creditor_name text, p_creditor_type text DEFAULT 'other'::text, p_description text DEFAULT NULL::text) RETURNS TABLE(success boolean, journal_id uuid, error_message text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_saldo_awal_account_id UUID;
  v_hutang_account_id UUID;
  v_hutang_code TEXT;
BEGIN
  -- VALIDASI
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Amount must be greater than 0'::TEXT;
    RETURN;
  END IF;

  -- GET SALDO AWAL ACCOUNT
  SELECT id INTO v_saldo_awal_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '3100' AND is_active = TRUE LIMIT 1;

  -- GET HUTANG ACCOUNT BASED ON CREDITOR TYPE
  CASE p_creditor_type
    WHEN 'bank' THEN v_hutang_code := '2120';
    WHEN 'supplier' THEN v_hutang_code := '2110';
    ELSE v_hutang_code := '2190';
  END CASE;

  SELECT id INTO v_hutang_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = v_hutang_code AND is_active = TRUE LIMIT 1;

  IF v_hutang_account_id IS NULL THEN
    SELECT id INTO v_hutang_account_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '2110' AND is_active = TRUE LIMIT 1;
    v_hutang_code := '2110';
  END IF;

  IF v_saldo_awal_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Saldo Awal (3100) tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  IF v_hutang_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Hutang tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- GENERATE ENTRY NUMBER
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

  -- CREATE JOURNAL ENTRY
  INSERT INTO journal_entries (
    id, branch_id, entry_number, entry_date, description,
    reference_type, reference_id, status, is_voided, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_branch_id, v_entry_number, p_debt_date,
    COALESCE(p_description, 'Migrasi hutang dari ' || p_creditor_name),
    'payable', p_debt_id, 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Saldo Awal (penyeimbang)
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_saldo_awal_account_id, '3100',
    (SELECT name FROM accounts WHERE id = v_saldo_awal_account_id),
    p_amount, 0, 'Saldo awal hutang migrasi', 1
  );

  -- Cr. Hutang
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_hutang_account_id, v_hutang_code,
    (SELECT name FROM accounts WHERE id = v_hutang_account_id),
    0, p_amount, 'Hutang migrasi - ' || p_creditor_name, 2
  );

  RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$;


ALTER FUNCTION public.create_migration_debt_journal_rpc(p_branch_id uuid, p_debt_id text, p_debt_date date, p_amount numeric, p_creditor_name text, p_creditor_type text, p_description text) OWNER TO postgres;

--
-- Name: FUNCTION create_migration_debt_journal_rpc(p_branch_id uuid, p_debt_id text, p_debt_date date, p_amount numeric, p_creditor_name text, p_creditor_type text, p_description text); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.create_migration_debt_journal_rpc(p_branch_id uuid, p_debt_id text, p_debt_date date, p_amount numeric, p_creditor_name text, p_creditor_type text, p_description text) IS 'Create migration journal for debt: Dr. Saldo Awal, Cr. Hutang';


--
-- Name: create_migration_receivable_journal_rpc(uuid, text, date, numeric, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_migration_receivable_journal_rpc(p_branch_id uuid, p_receivable_id text, p_receivable_date date, p_amount numeric, p_customer_name text, p_description text DEFAULT NULL::text) RETURNS TABLE(success boolean, journal_id uuid, error_message text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_piutang_account_id UUID;
  v_saldo_awal_account_id UUID;
BEGIN
  -- VALIDASI
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Amount must be greater than 0'::TEXT;
    RETURN;
  END IF;

  -- GET ACCOUNT IDS
  SELECT id INTO v_piutang_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1210' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_saldo_awal_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '3100' AND is_active = TRUE LIMIT 1;

  IF v_piutang_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Piutang Usaha (1210) tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  IF v_saldo_awal_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Saldo Awal (3100) tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- GENERATE ENTRY NUMBER
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

  -- CREATE JOURNAL ENTRY
  INSERT INTO journal_entries (
    id, branch_id, entry_number, entry_date, description,
    reference_type, reference_id, status, is_voided, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_branch_id, v_entry_number, p_receivable_date,
    COALESCE(p_description, 'Piutang Migrasi - ' || p_customer_name),
    'receivable', p_receivable_id, 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Piutang Usaha
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_piutang_account_id, '1210',
    (SELECT name FROM accounts WHERE id = v_piutang_account_id),
    p_amount, 0, 'Piutang migrasi - ' || p_customer_name, 1
  );

  -- Cr. Saldo Awal
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_saldo_awal_account_id, '3100',
    (SELECT name FROM accounts WHERE id = v_saldo_awal_account_id),
    0, p_amount, 'Saldo awal piutang migrasi', 2
  );

  RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$;


ALTER FUNCTION public.create_migration_receivable_journal_rpc(p_branch_id uuid, p_receivable_id text, p_receivable_date date, p_amount numeric, p_customer_name text, p_description text) OWNER TO postgres;

--
-- Name: FUNCTION create_migration_receivable_journal_rpc(p_branch_id uuid, p_receivable_id text, p_receivable_date date, p_amount numeric, p_customer_name text, p_description text); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.create_migration_receivable_journal_rpc(p_branch_id uuid, p_receivable_id text, p_receivable_date date, p_amount numeric, p_customer_name text, p_description text) IS 'Create migration journal for receivable: Dr. Piutang, Cr. Saldo Awal';


--
-- Name: create_migration_transaction(text, uuid, text, date, jsonb, numeric, numeric, numeric, text, text, uuid, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_migration_transaction(p_transaction_id text, p_customer_id uuid, p_customer_name text, p_order_date date, p_items jsonb, p_total numeric, p_delivered_value numeric, p_paid_amount numeric DEFAULT 0, p_payment_account_id text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_branch_id uuid DEFAULT NULL::uuid, p_cashier_id text DEFAULT NULL::text, p_cashier_name text DEFAULT NULL::text) RETURNS TABLE(success boolean, transaction_id text, journal_id uuid, delivery_id uuid, error_message text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION public.create_migration_transaction(p_transaction_id text, p_customer_id uuid, p_customer_name text, p_order_date date, p_items jsonb, p_total numeric, p_delivered_value numeric, p_paid_amount numeric, p_payment_account_id text, p_notes text, p_branch_id uuid, p_cashier_id text, p_cashier_name text) OWNER TO postgres;

--
-- Name: FUNCTION create_migration_transaction(p_transaction_id text, p_customer_id uuid, p_customer_name text, p_order_date date, p_items jsonb, p_total numeric, p_delivered_value numeric, p_paid_amount numeric, p_payment_account_id text, p_notes text, p_branch_id uuid, p_cashier_id text, p_cashier_name text); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.create_migration_transaction(p_transaction_id text, p_customer_id uuid, p_customer_name text, p_order_date date, p_items jsonb, p_total numeric, p_delivered_value numeric, p_paid_amount numeric, p_payment_account_id text, p_notes text, p_branch_id uuid, p_cashier_id text, p_cashier_name text) IS 'Import transaksi historis tanpa potong stok dan tanpa komisi.
   - Tidak mempengaruhi kas atau pendapatan saat input
   - Mencatat jurnal: Piutang vs Modal Barang Dagang Tertahan (2140)
   - Sisa barang belum terkirim masuk ke daftar pengiriman
   - Pembayaran dicatat sebagai jurnal terpisah';


--
-- Name: create_payroll_record(jsonb, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_payroll_record(p_payroll jsonb, p_branch_id uuid) RETURNS TABLE(success boolean, payroll_id uuid, net_salary numeric, error_message text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_payroll_id UUID;
  v_employee_id UUID;
  v_period_year INTEGER;
  v_period_month INTEGER;
  v_period_start DATE;
  v_period_end DATE;
  v_base_salary NUMERIC;
  v_commission NUMERIC;
  v_bonus NUMERIC;
  v_advance_deduction NUMERIC;
  v_salary_deduction NUMERIC;
  v_total_deductions NUMERIC;
  v_gross_salary NUMERIC;
  v_net_salary NUMERIC;
  v_notes TEXT;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC,
      'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_payroll IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC,
      'Payroll data is required'::TEXT;
    RETURN;
  END IF;

  -- ==================== PARSE DATA ====================

  v_employee_id := (p_payroll->>'employee_id')::UUID;
  v_period_year := COALESCE((p_payroll->>'period_year')::INTEGER, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER);
  v_period_month := COALESCE((p_payroll->>'period_month')::INTEGER, EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER);
  v_base_salary := COALESCE((p_payroll->>'base_salary')::NUMERIC, 0);
  v_commission := COALESCE((p_payroll->>'commission')::NUMERIC, 0);
  v_bonus := COALESCE((p_payroll->>'bonus')::NUMERIC, 0);
  v_advance_deduction := COALESCE((p_payroll->>'advance_deduction')::NUMERIC, 0);
  v_salary_deduction := COALESCE((p_payroll->>'salary_deduction')::NUMERIC, 0);
  v_notes := p_payroll->>'notes';

  IF v_employee_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC,
      'Employee ID is required'::TEXT;
    RETURN;
  END IF;

  -- Calculate period dates
  v_period_start := make_date(v_period_year, v_period_month, 1);
  v_period_end := (v_period_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  -- Calculate amounts
  v_total_deductions := v_advance_deduction + v_salary_deduction;
  v_gross_salary := v_base_salary + v_commission + v_bonus;
  v_net_salary := v_gross_salary - v_total_deductions;

  -- ==================== CHECK DUPLICATE ====================

  IF EXISTS (
    SELECT 1 FROM payroll_records
    WHERE employee_id = v_employee_id
      AND period_start = v_period_start
      AND period_end = v_period_end
      AND branch_id = p_branch_id
  ) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC,
      format('Payroll untuk karyawan ini periode %s-%s sudah ada', v_period_year, v_period_month)::TEXT;
    RETURN;
  END IF;

  -- ==================== INSERT PAYROLL RECORD ====================

  INSERT INTO payroll_records (
    employee_id,
    period_start,
    period_end,
    base_salary,
    total_commission,
    total_bonus,
    total_deductions,
    advance_deduction,
    salary_deduction,
    net_salary,
    status,
    notes,
    branch_id,
    created_at
  ) VALUES (
    v_employee_id,
    v_period_start,
    v_period_end,
    v_base_salary,
    v_commission,
    v_bonus,
    v_total_deductions,
    v_advance_deduction,
    v_salary_deduction,
    v_net_salary,
    'draft',
    v_notes,
    p_branch_id,
    NOW()
  )
  RETURNING id INTO v_payroll_id;

  RETURN QUERY SELECT TRUE, v_payroll_id, v_net_salary, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, SQLERRM::TEXT;
END;
$$;


ALTER FUNCTION public.create_payroll_record(p_payroll jsonb, p_branch_id uuid) OWNER TO postgres;

--
-- Name: FUNCTION create_payroll_record(p_payroll jsonb, p_branch_id uuid); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.create_payroll_record(p_payroll jsonb, p_branch_id uuid) IS 'Create payroll record dalam status draft. WAJIB branch_id.';


--
-- Name: create_product_stock_adjustment_atomic(uuid, uuid, numeric, text, numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_product_stock_adjustment_atomic(p_product_id uuid, p_branch_id uuid, p_quantity_change numeric, p_reason text DEFAULT 'Stock Adjustment'::text, p_unit_cost numeric DEFAULT 0) RETURNS TABLE(success boolean, adjustment_id uuid, journal_id uuid, new_stock numeric, error_message text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
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
    movement_type,
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
$$;


ALTER FUNCTION public.create_product_stock_adjustment_atomic(p_product_id uuid, p_branch_id uuid, p_quantity_change numeric, p_reason text, p_unit_cost numeric) OWNER TO postgres;

--
-- Name: create_purchase_order_atomic(jsonb, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_purchase_order_atomic(p_po_header jsonb, p_po_items jsonb, p_branch_id uuid) RETURNS TABLE(success boolean, po_id text, error_message text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_po_id TEXT;
  v_item JSONB;
BEGIN
  -- Validate required fields
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, 'Branch ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_po_header->>'supplier_id' IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, 'Supplier ID is required'::TEXT;
    RETURN;
  END IF;

  -- Generate PO ID if not provided
  v_po_id := p_po_header->>'id';
  IF v_po_id IS NULL THEN
    v_po_id := 'PO-' || EXTRACT(EPOCH FROM NOW())::TEXT;
  END IF;

  -- Insert Header
  INSERT INTO purchase_orders (
    id,
    po_number,
    status,
    requested_by,
    supplier_id,
    supplier_name,
    total_cost,
    subtotal,
    include_ppn,
    ppn_mode,
    ppn_amount,
    expedition,
    order_date,
    expected_delivery_date,
    notes,
    branch_id,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    v_po_id,
    p_po_header->>'po_number',
    'Pending',
    COALESCE(p_po_header->>'requested_by', 'System'),
    (p_po_header->>'supplier_id')::UUID,
    p_po_header->>'supplier_name',
    (p_po_header->>'total_cost')::NUMERIC,
    (p_po_header->>'subtotal')::NUMERIC,
    COALESCE((p_po_header->>'include_ppn')::BOOLEAN, FALSE),
    COALESCE(p_po_header->>'ppn_mode', 'exclude'),
    COALESCE((p_po_header->>'ppn_amount')::NUMERIC, 0),
    p_po_header->>'expedition',
    COALESCE((p_po_header->>'order_date')::TIMESTAMP, NOW()),
    (p_po_header->>'expected_delivery_date')::TIMESTAMP,
    p_po_header->>'notes',
    p_branch_id,
    auth.uid(),  -- Use auth.uid() instead of frontend-passed value
    NOW(),
    NOW()
  );

  -- Insert Items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_po_items)
  LOOP
    INSERT INTO purchase_order_items (
      purchase_order_id,
      material_id,
      product_id,
      material_name,
      product_name,
      item_type,
      quantity,
      unit_price,
      unit,
      subtotal,
      notes
    ) VALUES (
      v_po_id,
      (v_item->>'material_id')::UUID,
      (v_item->>'product_id')::UUID,
      v_item->>'material_name',
      v_item->>'product_name',
      COALESCE(v_item->>'item_type', CASE WHEN v_item->>'material_id' IS NOT NULL THEN 'material' ELSE 'product' END),
      (v_item->>'quantity')::NUMERIC,
      (v_item->>'unit_price')::NUMERIC,
      v_item->>'unit',
      COALESCE((v_item->>'subtotal')::NUMERIC, (v_item->>'quantity')::NUMERIC * (v_item->>'unit_price')::NUMERIC),
      v_item->>'notes'
    );
  END LOOP;

  RETURN QUERY SELECT TRUE, v_po_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::TEXT, SQLERRM::TEXT;
END;
$$;


ALTER FUNCTION public.create_purchase_order_atomic(p_po_header jsonb, p_po_items jsonb, p_branch_id uuid) OWNER TO postgres;

--
-- Name: create_receivable_payment_journal_rpc(uuid, text, date, numeric, text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_receivable_payment_journal_rpc(p_branch_id uuid, p_transaction_id text, p_payment_date date, p_amount numeric, p_customer_name text DEFAULT 'Pelanggan'::text, p_payment_account_id uuid DEFAULT NULL::uuid) RETURNS TABLE(success boolean, journal_id uuid, entry_number text, error_message text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_kas_account_id UUID;
  v_piutang_account_id UUID;
BEGIN
  -- Validate
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Branch ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Amount must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get account IDs
  IF p_payment_account_id IS NOT NULL THEN
    v_kas_account_id := p_payment_account_id;
  ELSE
    SELECT id INTO v_kas_account_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '1110' AND is_active = TRUE LIMIT 1;
  END IF;

  SELECT id INTO v_piutang_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1210' AND is_active = TRUE LIMIT 1;

  IF v_kas_account_id IS NULL OR v_piutang_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Required accounts not found'::TEXT;
    RETURN;
  END IF;

  -- Generate entry number
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

  -- Create journal entry header
  INSERT INTO journal_entries (
    id,
    branch_id,
    entry_number,
    entry_date,
    description,
    reference_type,
    reference_id,
    status,
    is_voided,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    p_branch_id,
    v_entry_number,
    p_payment_date,
    'Pembayaran Piutang - ' || p_transaction_id || ' - ' || p_customer_name,
    'receivable',
    p_transaction_id,
    'posted',
    FALSE,
    NOW(),
    NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Kas
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_kas_account_id,
    (SELECT name FROM accounts WHERE id = v_kas_account_id),
    p_amount, 0, 'Penerimaan kas pembayaran piutang', 1
  );

  -- Cr. Piutang
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_piutang_account_id,
    (SELECT name FROM accounts WHERE id = v_piutang_account_id),
    0, p_amount, 'Pelunasan piutang usaha', 2
  );

  RETURN QUERY SELECT TRUE, v_journal_id, v_entry_number, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, SQLERRM::TEXT;
END;
$$;


ALTER FUNCTION public.create_receivable_payment_journal_rpc(p_branch_id uuid, p_transaction_id text, p_payment_date date, p_amount numeric, p_customer_name text, p_payment_account_id uuid) OWNER TO postgres;

--
-- Name: FUNCTION create_receivable_payment_journal_rpc(p_branch_id uuid, p_transaction_id text, p_payment_date date, p_amount numeric, p_customer_name text, p_payment_account_id uuid); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.create_receivable_payment_journal_rpc(p_branch_id uuid, p_transaction_id text, p_payment_date date, p_amount numeric, p_customer_name text, p_payment_account_id uuid) IS 'Create receivable payment journal entry. Dr. Kas, Cr. Piutang.';


--
-- Name: create_retasi_atomic(uuid, text, text, text, text, date, text, text, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_retasi_atomic(p_branch_id uuid, p_driver_name text, p_helper_name text DEFAULT NULL::text, p_truck_number text DEFAULT NULL::text, p_route text DEFAULT NULL::text, p_departure_date date DEFAULT CURRENT_DATE, p_departure_time text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_items jsonb DEFAULT '[]'::jsonb, p_created_by uuid DEFAULT NULL::uuid) RETURNS TABLE(success boolean, retasi_id uuid, retasi_number text, retasi_ke integer, error_message text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_retasi_id UUID := gen_random_uuid();
  v_retasi_number TEXT;
  v_retasi_ke INTEGER;
  v_item RECORD;
BEGIN
  -- ==================== VALIDASI ====================
  
  -- Check if driver has active retasi
  IF EXISTS (
    SELECT 1 FROM retasi 
    WHERE driver_name = p_driver_name 
      AND is_returned = FALSE
      AND (branch_id = p_branch_id OR branch_id IS NULL)
  ) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::INTEGER, 
      format('Supir %s masih memiliki retasi yang belum dikembalikan', p_driver_name)::TEXT;
    RETURN;
  END IF;

  -- Generate Retasi Number: RET-YYYYMMDD-HHMISS
  v_retasi_number := 'RET-' || TO_CHAR(p_departure_date, 'YYYYMMDD') || '-' || TO_CHAR(NOW(), 'HH24MISS');

  -- Count retasi_ke for today
  SELECT COALESCE(COUNT(*), 0) + 1 INTO v_retasi_ke
  FROM retasi
  WHERE driver_name = p_driver_name
    AND departure_date = p_departure_date
    AND (branch_id = p_branch_id OR branch_id IS NULL);

  -- ==================== INSERT RETASI ====================
  
  INSERT INTO retasi (
    id,
    branch_id,
    retasi_number,
    truck_number,
    driver_name,
    helper_name,
    departure_date,
    departure_time,
    route,
    notes,
    retasi_ke,
    is_returned,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    v_retasi_id,
    p_branch_id,
    v_retasi_number,
    p_truck_number,
    p_driver_name,
    p_helper_name,
    p_departure_date,
    CASE WHEN p_departure_time IS NOT NULL AND p_departure_time != ''
         THEN p_departure_time::TIME
         ELSE NULL
    END,
    p_route,
    p_notes,
    v_retasi_ke,
    FALSE,
    p_created_by,
    NOW(),
    NOW()
  );

  -- ==================== INSERT ITEMS ====================
  
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
    product_id UUID, 
    product_name TEXT, 
    quantity NUMERIC, 
    weight NUMERIC, 
    notes TEXT
  ) LOOP
    INSERT INTO retasi_items (
      retasi_id,
      product_id,
      product_name,
      quantity,
      weight,
      notes,
      created_at
    ) VALUES (
      v_retasi_id,
      v_item.product_id,
      v_item.product_name,
      v_item.quantity,
      v_item.weight,
      v_item.notes,
      NOW()
    );
  END LOOP;

  RETURN QUERY SELECT TRUE, v_retasi_id, v_retasi_number, v_retasi_ke, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::INTEGER, SQLERRM::TEXT;
END;
$$;


ALTER FUNCTION public.create_retasi_atomic(p_branch_id uuid, p_driver_name text, p_helper_name text, p_truck_number text, p_route text, p_departure_date date, p_departure_time text, p_notes text, p_items jsonb, p_created_by uuid) OWNER TO postgres;

--
-- Name: FUNCTION create_retasi_atomic(p_branch_id uuid, p_driver_name text, p_helper_name text, p_truck_number text, p_route text, p_departure_date date, p_departure_time text, p_notes text, p_items jsonb, p_created_by uuid); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.create_retasi_atomic(p_branch_id uuid, p_driver_name text, p_helper_name text, p_truck_number text, p_route text, p_departure_date date, p_departure_time text, p_notes text, p_items jsonb, p_created_by uuid) IS 'Membuat keberangkatan retasi (loading truck) secara atomik.';


--
-- Name: create_sales_journal_rpc(uuid, text, date, numeric, numeric, text, numeric, numeric, boolean, numeric, numeric, boolean, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_sales_journal_rpc(p_branch_id uuid, p_transaction_id text, p_transaction_date date, p_total_amount numeric, p_paid_amount numeric DEFAULT 0, p_customer_name text DEFAULT 'Umum'::text, p_hpp_amount numeric DEFAULT 0, p_hpp_bonus_amount numeric DEFAULT 0, p_ppn_enabled boolean DEFAULT false, p_ppn_amount numeric DEFAULT 0, p_subtotal numeric DEFAULT 0, p_is_office_sale boolean DEFAULT false, p_payment_account_id uuid DEFAULT NULL::uuid) RETURNS TABLE(success boolean, journal_id uuid, entry_number text, error_message text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_line_number INTEGER := 1;
  v_cash_amount NUMERIC;
  v_credit_amount NUMERIC;
  v_revenue_amount NUMERIC;
  v_total_hpp NUMERIC;

  -- Account IDs
  v_kas_account_id UUID;
  v_piutang_account_id UUID;
  v_pendapatan_account_id UUID;
  v_hpp_account_id UUID;
  v_hpp_bonus_account_id UUID;
  v_persediaan_account_id UUID;
  v_hutang_bd_account_id UUID;
  v_ppn_account_id UUID;
BEGIN
  -- Validate branch
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Branch ID is required'::TEXT;
    RETURN;
  END IF;

  -- Calculate amounts
  v_cash_amount := LEAST(p_paid_amount, p_total_amount);
  v_credit_amount := p_total_amount - v_cash_amount;
  v_revenue_amount := CASE WHEN p_ppn_enabled AND p_subtotal > 0 THEN p_subtotal ELSE p_total_amount END;
  v_total_hpp := p_hpp_amount + p_hpp_bonus_amount;

  -- Get account IDs
  -- Kas account (use payment account if specified, otherwise default 1110)
  IF p_payment_account_id IS NOT NULL THEN
    v_kas_account_id := p_payment_account_id;
  ELSE
    SELECT id INTO v_kas_account_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '1110' AND is_active = TRUE LIMIT 1;
  END IF;

  SELECT id INTO v_piutang_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1210' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_pendapatan_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '4100' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_hpp_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '5100' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_hpp_bonus_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '5210' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_persediaan_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1310' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_hutang_bd_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '2140' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_ppn_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '2130' AND is_active = TRUE LIMIT 1;

  -- Generate entry number
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

  -- Create journal entry header
  INSERT INTO journal_entries (
    id,
    branch_id,
    entry_number,
    entry_date,
    description,
    reference_type,
    reference_id,
    status,
    is_voided,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    p_branch_id,
    v_entry_number,
    p_transaction_date,
    'Penjualan ' ||
    CASE
      WHEN v_credit_amount > 0 AND v_cash_amount = 0 THEN 'Kredit'
      WHEN v_credit_amount > 0 AND v_cash_amount > 0 THEN 'Sebagian'
      ELSE 'Tunai'
    END || ' - ' || p_transaction_id || ' - ' || p_customer_name,
    'transaction',
    p_transaction_id,
    'posted',
    FALSE,
    NOW(),
    NOW()
  ) RETURNING id INTO v_journal_id;

  -- Insert journal lines

  -- 1. Dr. Kas (if cash payment)
  IF v_cash_amount > 0 AND v_kas_account_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, account_name,
      debit_amount, credit_amount, description, line_number
    ) VALUES (
      v_journal_id, v_kas_account_id,
      (SELECT name FROM accounts WHERE id = v_kas_account_id),
      v_cash_amount, 0, 'Penerimaan kas penjualan', v_line_number
    );
    v_line_number := v_line_number + 1;
  END IF;

  -- 2. Dr. Piutang (if credit)
  IF v_credit_amount > 0 AND v_piutang_account_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, account_name,
      debit_amount, credit_amount, description, line_number
    ) VALUES (
      v_journal_id, v_piutang_account_id,
      (SELECT name FROM accounts WHERE id = v_piutang_account_id),
      v_credit_amount, 0, 'Piutang usaha', v_line_number
    );
    v_line_number := v_line_number + 1;
  END IF;

  -- 3. Cr. Pendapatan
  IF v_pendapatan_account_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, account_name,
      debit_amount, credit_amount, description, line_number
    ) VALUES (
      v_journal_id, v_pendapatan_account_id,
      (SELECT name FROM accounts WHERE id = v_pendapatan_account_id),
      0, v_revenue_amount, 'Pendapatan penjualan', v_line_number
    );
    v_line_number := v_line_number + 1;
  END IF;

  -- 4. Cr. PPN Keluaran (if PPN enabled)
  IF p_ppn_enabled AND p_ppn_amount > 0 AND v_ppn_account_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, account_name,
      debit_amount, credit_amount, description, line_number
    ) VALUES (
      v_journal_id, v_ppn_account_id,
      (SELECT name FROM accounts WHERE id = v_ppn_account_id),
      0, p_ppn_amount, 'PPN Keluaran', v_line_number
    );
    v_line_number := v_line_number + 1;
  END IF;

  -- 5. Dr. HPP (regular items)
  IF p_hpp_amount > 0 AND v_hpp_account_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, account_name,
      debit_amount, credit_amount, description, line_number
    ) VALUES (
      v_journal_id, v_hpp_account_id,
      (SELECT name FROM accounts WHERE id = v_hpp_account_id),
      p_hpp_amount, 0, 'Harga Pokok Penjualan', v_line_number
    );
    v_line_number := v_line_number + 1;
  END IF;

  -- 6. Dr. HPP Bonus
  IF p_hpp_bonus_amount > 0 AND v_hpp_bonus_account_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, account_name,
      debit_amount, credit_amount, description, line_number
    ) VALUES (
      v_journal_id, v_hpp_bonus_account_id,
      (SELECT name FROM accounts WHERE id = v_hpp_bonus_account_id),
      p_hpp_bonus_amount, 0, 'HPP Bonus/Gratis', v_line_number
    );
    v_line_number := v_line_number + 1;
  END IF;

  -- 7. Cr. Persediaan or Hutang Barang Dagang
  IF v_total_hpp > 0 THEN
    IF p_is_office_sale THEN
      -- Office Sale: Cr. Persediaan (stok langsung berkurang)
      IF v_persediaan_account_id IS NOT NULL THEN
        INSERT INTO journal_entry_lines (
          journal_entry_id, account_id, account_name,
          debit_amount, credit_amount, description, line_number
        ) VALUES (
          v_journal_id, v_persediaan_account_id,
          (SELECT name FROM accounts WHERE id = v_persediaan_account_id),
          0, v_total_hpp, 'Pengurangan persediaan', v_line_number
        );
      END IF;
    ELSE
      -- Non-Office Sale: Cr. Hutang Barang Dagang (kewajiban kirim)
      IF v_hutang_bd_account_id IS NOT NULL THEN
        INSERT INTO journal_entry_lines (
          journal_entry_id, account_id, account_name,
          debit_amount, credit_amount, description, line_number
        ) VALUES (
          v_journal_id, v_hutang_bd_account_id,
          (SELECT name FROM accounts WHERE id = v_hutang_bd_account_id),
          0, v_total_hpp, 'Hutang barang dagang', v_line_number
        );
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT TRUE, v_journal_id, v_entry_number, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, SQLERRM::TEXT;
END;
$$;


ALTER FUNCTION public.create_sales_journal_rpc(p_branch_id uuid, p_transaction_id text, p_transaction_date date, p_total_amount numeric, p_paid_amount numeric, p_customer_name text, p_hpp_amount numeric, p_hpp_bonus_amount numeric, p_ppn_enabled boolean, p_ppn_amount numeric, p_subtotal numeric, p_is_office_sale boolean, p_payment_account_id uuid) OWNER TO postgres;

--
-- Name: FUNCTION create_sales_journal_rpc(p_branch_id uuid, p_transaction_id text, p_transaction_date date, p_total_amount numeric, p_paid_amount numeric, p_customer_name text, p_hpp_amount numeric, p_hpp_bonus_amount numeric, p_ppn_enabled boolean, p_ppn_amount numeric, p_subtotal numeric, p_is_office_sale boolean, p_payment_account_id uuid); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.create_sales_journal_rpc(p_branch_id uuid, p_transaction_id text, p_transaction_date date, p_total_amount numeric, p_paid_amount numeric, p_customer_name text, p_hpp_amount numeric, p_hpp_bonus_amount numeric, p_ppn_enabled boolean, p_ppn_amount numeric, p_subtotal numeric, p_is_office_sale boolean, p_payment_account_id uuid) IS 'Create sales journal entry atomically. Handles cash/credit split, HPP, PPN, and office sale logic.';


--
-- Name: create_tax_payment_atomic(uuid, text, numeric, numeric, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_tax_payment_atomic(p_branch_id uuid, p_period text, p_ppn_masukan_used numeric, p_ppn_keluaran_paid numeric, p_payment_account_id text, p_notes text DEFAULT NULL::text) RETURNS TABLE(success boolean, journal_id uuid, net_payment numeric, error_message text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $_$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_reference_id TEXT;
  v_ppn_keluaran_account_id TEXT;
  v_ppn_masukan_account_id TEXT;
  v_net_payment NUMERIC;
  v_description TEXT;
  v_payment_date DATE := CURRENT_DATE;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, 'Branch ID is REQUIRED'::TEXT;
    RETURN;
  END IF;

  IF p_ppn_keluaran_paid <= 0 AND p_ppn_masukan_used <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, 'Jumlah PPN harus lebih dari 0'::TEXT;
    RETURN;
  END IF;

  IF p_payment_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, 'Akun pembayaran harus dipilih'::TEXT;
    RETURN;
  END IF;

  -- ==================== LOOKUP ACCOUNTS ====================

  -- Find PPN Keluaran account (2130)
  SELECT id INTO v_ppn_keluaran_account_id
  FROM accounts
  WHERE (
    LOWER(name) LIKE '%ppn%keluaran%' OR
    code = '2130'
  )
  AND is_header = FALSE
  AND branch_id = p_branch_id
  LIMIT 1;

  IF v_ppn_keluaran_account_id IS NULL THEN
    -- Try without branch filter (global accounts)
    SELECT id INTO v_ppn_keluaran_account_id
    FROM accounts
    WHERE (
      LOWER(name) LIKE '%ppn%keluaran%' OR
      code = '2130'
    )
    AND is_header = FALSE
    LIMIT 1;
  END IF;

  IF v_ppn_keluaran_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, 'Akun PPN Keluaran (2130) tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- Find PPN Masukan account (1230)
  SELECT id INTO v_ppn_masukan_account_id
  FROM accounts
  WHERE (
    LOWER(name) LIKE '%ppn%masukan%' OR
    code = '1230'
  )
  AND is_header = FALSE
  AND branch_id = p_branch_id
  LIMIT 1;

  IF v_ppn_masukan_account_id IS NULL THEN
    -- Try without branch filter (global accounts)
    SELECT id INTO v_ppn_masukan_account_id
    FROM accounts
    WHERE (
      LOWER(name) LIKE '%ppn%masukan%' OR
      code = '1230'
    )
    AND is_header = FALSE
    LIMIT 1;
  END IF;

  IF v_ppn_masukan_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, 'Akun PPN Masukan (1230) tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- ==================== CALCULATE NET PAYMENT ====================

  -- Net payment = PPN Keluaran - PPN Masukan
  -- Jika positif, kita bayar ke negara
  -- Jika negatif, kita punya lebih bayar (kredit)
  v_net_payment := COALESCE(p_ppn_keluaran_paid, 0) - COALESCE(p_ppn_masukan_used, 0);

  -- ==================== BUILD DESCRIPTION & REFERENCE ====================

  v_description := 'Pembayaran PPN';
  IF p_period IS NOT NULL THEN
    v_description := v_description || ' periode ' || p_period;
  END IF;

  -- Create reference_id in format TAX-YYYYMM-xxx for period parsing
  -- Extract YYYYMM from period (handles both "2024-01" and "Januari 2024" formats)
  DECLARE
    v_year_month TEXT;
  BEGIN
    -- Try to match YYYY-MM format
    IF p_period ~ '^\d{4}-\d{2}$' THEN
      v_year_month := REPLACE(p_period, '-', '');
    ELSE
      -- Default to current month
      v_year_month := TO_CHAR(v_payment_date, 'YYYYMM');
    END IF;

    v_reference_id := 'TAX-' || v_year_month || '-' ||
                      LPAD((EXTRACT(EPOCH FROM NOW())::BIGINT % 10000)::TEXT, 4, '0');
  END;

  -- ==================== CREATE JOURNAL ENTRY ====================

  v_entry_number := 'JE-TAX-' || TO_CHAR(v_payment_date, 'YYYYMMDD') || '-' ||
                    LPAD((EXTRACT(EPOCH FROM NOW())::BIGINT % 10000)::TEXT, 4, '0');

  INSERT INTO journal_entries (
    entry_number,
    entry_date,
    description,
    reference_type,
    reference_id,
    is_posted,
    status,
    branch_id,
    created_by,
    created_at
  ) VALUES (
    v_entry_number,
    v_payment_date,
    CASE WHEN p_notes IS NOT NULL AND p_notes != ''
      THEN v_description || ' - ' || p_notes
      ELSE v_description
    END,
    'tax_payment',
    v_reference_id,
    TRUE,
    'posted',
    p_branch_id,
    'System',
    NOW()
  )
  RETURNING id INTO v_journal_id;

  -- ==================== JOURNAL LINE ITEMS ====================

  -- Jurnal Pembayaran PPN:
  -- Untuk mengOffset PPN Keluaran (liability) dan PPN Masukan (asset)
  --
  -- Dr PPN Keluaran (2130) - menghapus kewajiban
  -- Cr PPN Masukan (1230) - menghapus hak kredit
  -- Cr Kas - selisihnya (net payment)

  -- 1. Debit PPN Keluaran (mengurangi liability)
  IF p_ppn_keluaran_paid > 0 THEN
    INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_journal_id, v_ppn_keluaran_account_id, p_ppn_keluaran_paid, 0,
      'Offset PPN Keluaran periode ' || COALESCE(p_period, ''));
  END IF;

  -- 2. Credit PPN Masukan (mengurangi asset/hak kredit)
  IF p_ppn_masukan_used > 0 THEN
    INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_journal_id, v_ppn_masukan_account_id, 0, p_ppn_masukan_used,
      'Offset PPN Masukan periode ' || COALESCE(p_period, ''));
  END IF;

  -- 3. Kas - selisih pembayaran
  IF v_net_payment > 0 THEN
    -- Kita bayar ke negara (Credit Kas)
    INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_journal_id, p_payment_account_id, 0, v_net_payment,
      'Pembayaran PPN ke negara periode ' || COALESCE(p_period, ''));
  ELSIF v_net_payment < 0 THEN
    -- Lebih bayar - record as Debit to Kas (refund or carry forward)
    INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_journal_id, p_payment_account_id, ABS(v_net_payment), 0,
      'Lebih bayar PPN periode ' || COALESCE(p_period, ''));
  END IF;

  -- ==================== UPDATE ACCOUNT BALANCES ====================

  -- Update PPN Keluaran balance (liability decreases = subtract from balance)
  IF p_ppn_keluaran_paid > 0 THEN
    UPDATE accounts
    SET balance = COALESCE(balance, 0) - p_ppn_keluaran_paid,
        updated_at = NOW()
    WHERE id = v_ppn_keluaran_account_id;
  END IF;

  -- Update PPN Masukan balance (asset decreases = subtract from balance)
  IF p_ppn_masukan_used > 0 THEN
    UPDATE accounts
    SET balance = COALESCE(balance, 0) - p_ppn_masukan_used,
        updated_at = NOW()
    WHERE id = v_ppn_masukan_account_id;
  END IF;

  -- Update Kas/Bank balance
  IF v_net_payment > 0 THEN
    -- Payment to government: decrease cash
    UPDATE accounts
    SET balance = COALESCE(balance, 0) - v_net_payment,
        updated_at = NOW()
    WHERE id = p_payment_account_id;
  ELSIF v_net_payment < 0 THEN
    -- Overpayment refund: increase cash
    UPDATE accounts
    SET balance = COALESCE(balance, 0) + ABS(v_net_payment),
        updated_at = NOW()
    WHERE id = p_payment_account_id;
  END IF;

  -- ==================== LOG ====================

  RAISE NOTICE '[Tax Payment] Journal % created. PPN Keluaran: %, PPN Masukan: %, Net: %',
    v_entry_number, p_ppn_keluaran_paid, p_ppn_masukan_used, v_net_payment;

  RETURN QUERY SELECT TRUE, v_journal_id, v_net_payment, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, SQLERRM::TEXT;
END;
$_$;


ALTER FUNCTION public.create_tax_payment_atomic(p_branch_id uuid, p_period text, p_ppn_masukan_used numeric, p_ppn_keluaran_paid numeric, p_payment_account_id text, p_notes text) OWNER TO postgres;

--
-- Name: create_transaction_atomic(jsonb, jsonb, uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_transaction_atomic(p_transaction jsonb, p_items jsonb, p_branch_id uuid, p_cashier_id uuid DEFAULT NULL::uuid, p_cashier_name text DEFAULT NULL::text, p_quotation_id text DEFAULT NULL::text) RETURNS TABLE(success boolean, transaction_id text, total_hpp numeric, total_hpp_bonus numeric, journal_id uuid, items_count integer, error_message text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_transaction_id TEXT;
  v_customer_id UUID;
  v_customer_name TEXT;
  v_total NUMERIC;
  v_paid_amount NUMERIC;
  v_payment_method TEXT;
  v_is_office_sale BOOLEAN;
  v_date DATE;
  v_notes TEXT;
  v_sales_id UUID;
  v_sales_name TEXT;

  v_item JSONB;
  v_product_id UUID;
  v_product_name TEXT;
  v_quantity NUMERIC;
  v_price NUMERIC;
  v_discount NUMERIC;
  v_is_bonus BOOLEAN;
  v_cost_price NUMERIC;
  v_unit TEXT;
  v_width NUMERIC;
  v_height NUMERIC;

  v_total_hpp NUMERIC := 0;
  v_total_hpp_bonus NUMERIC := 0;
  v_fifo_result RECORD;
  v_item_hpp NUMERIC;
  v_items_inserted INTEGER := 0;

  v_journal_id UUID;
  v_kas_account_id TEXT;  -- accounts.id is TEXT not UUID
  v_piutang_account_id TEXT;
  v_pendapatan_account_id TEXT;
  v_hpp_account_id TEXT;
  v_hpp_bonus_account_id TEXT;
  v_persediaan_account_id TEXT;

  v_journal_lines JSONB := '[]'::JSONB;
  v_items_array JSONB := '[]'::JSONB;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, 0::NUMERIC, 0::NUMERIC, NULL::UUID, 0,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT;
    RETURN;
  END IF;

  IF p_transaction IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, 0::NUMERIC, 0::NUMERIC, NULL::UUID, 0,
      'Transaction data is required'::TEXT;
    RETURN;
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, 0::NUMERIC, 0::NUMERIC, NULL::UUID, 0,
      'Items are required'::TEXT;
    RETURN;
  END IF;

  -- ==================== PARSE TRANSACTION DATA ====================

  v_transaction_id := COALESCE(
    p_transaction->>'id',
    'TRX-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 100000)::TEXT, 5, '0')
  );
  v_customer_id := (p_transaction->>'customer_id')::UUID;
  v_customer_name := p_transaction->>'customer_name';
  v_total := COALESCE((p_transaction->>'total')::NUMERIC, 0);
  v_paid_amount := COALESCE((p_transaction->>'paid_amount')::NUMERIC, 0);
  -- Normalize payment_method to valid values: cash, bank_transfer, check, digital_wallet
  v_payment_method := CASE LOWER(COALESCE(p_transaction->>'payment_method', 'cash'))
    WHEN 'tunai' THEN 'cash'
    WHEN 'cash' THEN 'cash'
    WHEN 'transfer' THEN 'bank_transfer'
    WHEN 'bank_transfer' THEN 'bank_transfer'
    WHEN 'bank' THEN 'bank_transfer'
    WHEN 'cek' THEN 'check'
    WHEN 'check' THEN 'check'
    WHEN 'giro' THEN 'check'
    WHEN 'digital' THEN 'digital_wallet'
    WHEN 'digital_wallet' THEN 'digital_wallet'
    WHEN 'e-wallet' THEN 'digital_wallet'
    ELSE 'cash'
  END;
  v_is_office_sale := COALESCE((p_transaction->>'is_office_sale')::BOOLEAN, FALSE);
