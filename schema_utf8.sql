--
-- PostgreSQL database dump
--

\restrict MOVBtL0PHXYKK5aU7KI4WvJwc9TetAbUQFL62CFgQi0qtT2TlFVWDrCREqK4TFk

-- Dumped from database version 14.20 (Debian 14.20-1.pgdg13+1)
-- Dumped by pg_dump version 14.20 (Debian 14.20-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA auth;


ALTER SCHEMA auth OWNER TO postgres;

--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: attendance_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.attendance_status AS ENUM (
    'Hadir',
    'Pulang'
);


ALTER TYPE public.attendance_status OWNER TO postgres;

--
-- Name: email(); Type: FUNCTION; Schema: auth; Owner: postgres
--

CREATE FUNCTION auth.email() RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE
    jwt_claims JSON;
BEGIN
    jwt_claims := current_setting('request.jwt.claims', true)::JSON;
    IF jwt_claims IS NULL THEN RETURN NULL; END IF;
    RETURN jwt_claims->>'email';
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;


ALTER FUNCTION auth.email() OWNER TO postgres;

--
-- Name: has_role(text); Type: FUNCTION; Schema: auth; Owner: postgres
--

CREATE FUNCTION auth.has_role(required_role text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE
    user_role TEXT;
BEGIN
    user_role := auth.role();
    -- owner has all permissions
    IF user_role = 'owner' THEN RETURN TRUE; END IF;
    -- admin has most permissions
    IF user_role = 'admin' AND required_role IN ('admin', 'manager', 'cashier', 'authenticated') THEN RETURN TRUE; END IF;
    -- manager has manager and below
    IF user_role = 'manager' AND required_role IN ('manager', 'cashier', 'authenticated') THEN RETURN TRUE; END IF;
    -- cashier has cashier and authenticated
    IF user_role = 'cashier' AND required_role IN ('cashier', 'authenticated') THEN RETURN TRUE; END IF;
    -- exact match
    RETURN user_role = required_role;
END;
$$;


ALTER FUNCTION auth.has_role(required_role text) OWNER TO postgres;

--
-- Name: is_authenticated(); Type: FUNCTION; Schema: auth; Owner: postgres
--

CREATE FUNCTION auth.is_authenticated() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN
    RETURN auth.uid() IS NOT NULL;
END;
$$;


ALTER FUNCTION auth.is_authenticated() OWNER TO postgres;

--
-- Name: role(); Type: FUNCTION; Schema: auth; Owner: postgres
--

CREATE FUNCTION auth.role() RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE
    jwt_claims JSON;
    user_role TEXT;
    user_uuid UUID;
BEGIN
    -- First try to get role from JWT
    jwt_claims := current_setting('request.jwt.claims', true)::JSON;
    IF jwt_claims IS NOT NULL THEN
        user_role := jwt_claims->>'role';
        IF user_role IS NOT NULL AND user_role != '' THEN
            RETURN user_role;
        END IF;
    END IF;
    
    -- Fallback: get role from profiles using auth.uid()
    user_uuid := auth.uid();
    IF user_uuid IS NOT NULL THEN
        SELECT role INTO user_role
        FROM profiles
        WHERE id = user_uuid;
        
        IF user_role IS NOT NULL THEN
            RETURN user_role;
        END IF;
    END IF;
    
    RETURN 'authenticated';
EXCEPTION WHEN OTHERS THEN
    RETURN 'authenticated';
END;
$$;


ALTER FUNCTION auth.role() OWNER TO postgres;

--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: postgres
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE
    jwt_claims JSON;
    user_id TEXT;
BEGIN
    jwt_claims := current_setting('request.jwt.claims', true)::JSON;
    IF jwt_claims IS NULL THEN RETURN NULL; END IF;

    user_id := jwt_claims->>'user_id';
    IF user_id IS NULL THEN user_id := jwt_claims->>'sub'; END IF;
    IF user_id IS NULL OR user_id = '' THEN RETURN NULL; END IF;

    RETURN user_id::UUID;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;


ALTER FUNCTION auth.uid() OWNER TO postgres;

--
-- Name: add_material_batch(uuid, uuid, numeric, numeric, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.add_material_batch(p_material_id uuid, p_branch_id uuid, p_quantity numeric, p_unit_cost numeric, p_reference_id text DEFAULT NULL::text, p_notes text DEFAULT NULL::text) RETURNS TABLE(success boolean, batch_id uuid, error_message text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_new_batch_id UUID;
  v_current_stock NUMERIC;
BEGIN
  IF p_branch_id IS NULL THEN RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID required'::TEXT; RETURN; END IF;

  SELECT COALESCE(SUM(remaining_quantity), 0) INTO v_current_stock
  FROM inventory_batches
  WHERE material_id = p_material_id AND remaining_quantity > 0;

  INSERT INTO inventory_batches (
    material_id, branch_id, initial_quantity, remaining_quantity, unit_cost, batch_date, notes
  ) VALUES (
    p_material_id, p_branch_id, p_quantity, p_quantity, COALESCE(p_unit_cost, 0), NOW(), 
    COALESCE(p_notes, 'Purchase')
  ) RETURNING id INTO v_new_batch_id;

  INSERT INTO material_stock_movements (
    material_id, material_name, type, reason, quantity, previous_stock, new_stock, 
    reference_id, reference_type, notes, branch_id, created_at
  ) VALUES (
    p_material_id, (SELECT name FROM materials WHERE id=p_material_id), 'IN', 'PURCHASE', p_quantity, 
    v_current_stock, v_current_stock + p_quantity, p_reference_id, 'purchase', 
    'Purchase Batch', p_branch_id, NOW()
  );

  -- [FIX] UPDATE LEGACY STOCK COLUMN
  UPDATE materials 
  SET stock = stock + p_quantity,
      updated_at = NOW()
  WHERE id = p_material_id;

  RETURN QUERY SELECT TRUE, v_new_batch_id, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$;


ALTER FUNCTION public.add_material_batch(p_material_id uuid, p_branch_id uuid, p_quantity numeric, p_unit_cost numeric, p_reference_id text, p_notes text) OWNER TO postgres;

--
-- Name: add_material_stock(uuid, numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.add_material_stock(material_id uuid, quantity_to_add numeric) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE public.materials
  SET stock = stock + quantity_to_add
  WHERE id = material_id;
END;
$$;


ALTER FUNCTION public.add_material_stock(material_id uuid, quantity_to_add numeric) OWNER TO postgres;

--
-- Name: approve_purchase_order_atomic(uuid, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.approve_purchase_order_atomic(p_po_id uuid, p_branch_id uuid, p_user_id uuid, p_user_name text) RETURNS TABLE(success boolean, po_id uuid, error_message text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_po RECORD;
BEGIN
  -- Validasi
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is required'::TEXT;
    RETURN;
  END IF;

  -- Get PO
  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id AND branch_id = p_branch_id;
  
  IF v_po IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Purchase Order tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  IF v_po.status = 'Approved' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Purchase Order sudah disetujui'::TEXT;
    RETURN;
  END IF;

  -- Update status
  UPDATE purchase_orders 
  SET status = 'Approved',
      approved_by = p_user_id,
      approved_by_name = p_user_name,
      approved_at = NOW(),
      updated_at = NOW()
  WHERE id = p_po_id;

  RETURN QUERY SELECT TRUE, p_po_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$;


ALTER FUNCTION public.approve_purchase_order_atomic(p_po_id uuid, p_branch_id uuid, p_user_id uuid, p_user_name text) OWNER TO postgres;

--
-- Name: audit_profiles_changes(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.audit_profiles_changes() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.create_audit_log(
      'profiles',
      'DELETE',
      OLD.id::TEXT,
      row_to_json(OLD)::JSONB,
      NULL,
      jsonb_build_object('deleted_user_name', OLD.full_name)
    );
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.create_audit_log(
      'profiles',
      'UPDATE',
      NEW.id::TEXT,
      row_to_json(OLD)::JSONB,
      row_to_json(NEW)::JSONB,
      jsonb_build_object('updated_fields', (
        SELECT jsonb_object_agg(key, value)
        FROM jsonb_each(row_to_json(NEW)::JSONB)
        WHERE value != (row_to_json(OLD)::JSONB ->> key)::JSONB
      ))
    );
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM public.create_audit_log(
      'profiles',
      'INSERT',
      NEW.id::TEXT,
      NULL,
      row_to_json(NEW)::JSONB,
      jsonb_build_object('new_user_name', NEW.full_name)
    );
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION public.audit_profiles_changes() OWNER TO postgres;

--
-- Name: audit_transactions_changes(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.audit_transactions_changes() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;


ALTER FUNCTION public.audit_transactions_changes() OWNER TO postgres;

--
-- Name: audit_trigger_func(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.audit_trigger_func() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  old_data jsonb := NULL;
  new_data jsonb := NULL;
  changed_fields jsonb := NULL;
  record_id text := NULL;
  current_user_id uuid := NULL;
  current_user_email text := NULL;
  current_user_role text := NULL;
  key text;
  old_value jsonb;
  new_value jsonb;
BEGIN
  -- Coba ambil info user dari JWT
  BEGIN
    current_user_id := (current_setting('request.jwt.claims', true)::jsonb->>'sub')::uuid;
    current_user_email := current_setting('request.jwt.claims', true)::jsonb->>'email';
    current_user_role := current_setting('request.jwt.claims', true)::jsonb->>'role';
  EXCEPTION WHEN OTHERS THEN
    current_user_email := current_user;
  END;

  IF (TG_OP = 'DELETE') THEN
    old_data := to_jsonb(OLD);
    record_id := COALESCE(OLD.id::text, 'unknown');

  ELSIF (TG_OP = 'UPDATE') THEN
    old_data := to_jsonb(OLD);
    new_data := to_jsonb(NEW);
    record_id := COALESCE(NEW.id::text, OLD.id::text, 'unknown');

    -- Hitung field yang berubah
    changed_fields := '{}'::jsonb;
    FOR key IN SELECT jsonb_object_keys(new_data)
    LOOP
      old_value := old_data->key;
      new_value := new_data->key;
      IF old_value IS DISTINCT FROM new_value AND key NOT IN ('updated_at') THEN
        changed_fields := changed_fields || jsonb_build_object(
          key, jsonb_build_object('old', old_value, 'new', new_value)
        );
      END IF;
    END LOOP;

    IF changed_fields = '{}'::jsonb THEN
      RETURN NEW;
    END IF;

  ELSIF (TG_OP = 'INSERT') THEN
    new_data := to_jsonb(NEW);
    record_id := COALESCE(NEW.id::text, 'unknown');
  END IF;

  INSERT INTO audit_logs (table_name, operation, record_id, old_data, new_data, changed_fields, user_id, user_email, user_role, created_at)
  VALUES (TG_TABLE_NAME, TG_OP, record_id, old_data, new_data, changed_fields, current_user_id, current_user_email, current_user_role, NOW());

  IF (TG_OP = 'DELETE') THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;


ALTER FUNCTION public.audit_trigger_func() OWNER TO postgres;

--
-- Name: calculate_asset_current_value(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.calculate_asset_current_value(p_asset_id text) RETURNS numeric
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_purchase_price NUMERIC;
    v_purchase_date DATE;
    v_useful_life_years INTEGER;
    v_salvage_value NUMERIC;
    v_depreciation_method TEXT;
    v_years_elapsed NUMERIC;
    v_current_value NUMERIC;
BEGIN
    -- Get asset details
    SELECT
        purchase_price,
        purchase_date,
        useful_life_years,
        salvage_value,
        depreciation_method
    INTO
        v_purchase_price,
        v_purchase_date,
        v_useful_life_years,
        v_salvage_value,
        v_depreciation_method
    FROM assets
    WHERE id = p_asset_id;

    -- Calculate years elapsed
    v_years_elapsed := EXTRACT(YEAR FROM AGE(CURRENT_DATE, v_purchase_date)) +
                      (EXTRACT(MONTH FROM AGE(CURRENT_DATE, v_purchase_date)) / 12.0);

    -- Calculate depreciation based on method
    IF v_depreciation_method = 'straight_line' THEN
        -- Straight-line depreciation
        v_current_value := v_purchase_price -
                          ((v_purchase_price - v_salvage_value) / v_useful_life_years * v_years_elapsed);
    ELSE
        -- Declining balance (double declining)
        v_current_value := v_purchase_price * POWER(1 - (2.0 / v_useful_life_years), v_years_elapsed);
    END IF;

    -- Ensure value doesn't go below salvage value
    IF v_current_value < v_salvage_value THEN
        v_current_value := v_salvage_value;
    END IF;

    RETURN GREATEST(v_current_value, 0);
END;
$$;


ALTER FUNCTION public.calculate_asset_current_value(p_asset_id text) OWNER TO postgres;

--
-- Name: calculate_commission_amount(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.calculate_commission_amount() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.amount = NEW.quantity * NEW.rate_per_qty;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.calculate_commission_amount() OWNER TO postgres;

--
-- Name: calculate_commission_for_period(uuid, date, date); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.calculate_commission_for_period(emp_id uuid, start_date date, end_date date) RETURNS numeric
    LANGUAGE plpgsql
    AS $$
DECLARE
  total_commission DECIMAL(15,2) := 0;
BEGIN
  -- Calculate commission from commission_entries table
  SELECT COALESCE(SUM(amount), 0) INTO total_commission
  FROM commission_entries
  WHERE user_id = emp_id::text
    AND status = 'pending'
    AND created_at >= start_date
    AND created_at < (end_date + INTERVAL '1 day');

  RETURN total_commission;
END;
$$;


ALTER FUNCTION public.calculate_commission_for_period(emp_id uuid, start_date date, end_date date) OWNER TO postgres;

--
-- Name: calculate_fifo_cost(uuid, uuid, numeric, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.calculate_fifo_cost(p_product_id uuid DEFAULT NULL::uuid, p_branch_id uuid DEFAULT NULL::uuid, p_quantity numeric DEFAULT 0, p_material_id uuid DEFAULT NULL::uuid) RETURNS TABLE(total_hpp numeric, batches_info jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  remaining_qty NUMERIC;
  batch_record RECORD;
  consume_qty NUMERIC;
  total_cost NUMERIC := 0;
  batch_list JSONB := '[]'::JSONB;
BEGIN
  remaining_qty := p_quantity;

  -- Validate input: must have either product_id or material_id
  IF p_product_id IS NULL AND p_material_id IS NULL THEN
    RETURN QUERY SELECT 0::NUMERIC, '[]'::JSONB;
    RETURN;
  END IF;

  -- Loop through batches in FIFO order (oldest first based on batch_date)
  -- READ-ONLY: NO UPDATE to remaining_quantity
  FOR batch_record IN
    SELECT
      id,
      remaining_quantity,
      unit_cost,
      notes,
      batch_date
    FROM inventory_batches
    WHERE
      -- Match by product_id OR material_id
      ((p_product_id IS NOT NULL AND product_id = p_product_id)
      OR (p_material_id IS NOT NULL AND material_id = p_material_id))
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND remaining_quantity > 0
    ORDER BY batch_date ASC, created_at ASC
  LOOP
    -- Exit if we've consumed enough
    IF remaining_qty <= 0 THEN
      EXIT;
    END IF;

    -- Calculate how much to consume from this batch
    IF batch_record.remaining_quantity >= remaining_qty THEN
      consume_qty := remaining_qty;
    ELSE
      consume_qty := batch_record.remaining_quantity;
    END IF;

    -- Calculate cost for this batch
    total_cost := total_cost + (consume_qty * COALESCE(batch_record.unit_cost, 0));

    -- Log the consumption (for reference only, no actual update)
    batch_list := batch_list || jsonb_build_object(
      'batch_id', batch_record.id,
      'quantity', consume_qty,
      'unit_cost', batch_record.unit_cost,
      'subtotal', consume_qty * COALESCE(batch_record.unit_cost, 0),
      'notes', batch_record.notes
    );

    remaining_qty := remaining_qty - consume_qty;
  END LOOP;

  -- If batch not enough, try to get cost from BOM or cost_price
  IF remaining_qty > 0 AND p_product_id IS NOT NULL THEN
    DECLARE
      bom_cost NUMERIC := 0;
      fallback_cost NUMERIC := 0;
    BEGIN
      -- Try BOM cost first
      SELECT COALESCE(SUM(pm.quantity * m.price_per_unit), 0) INTO bom_cost
      FROM product_materials pm
      JOIN materials m ON m.id = pm.material_id
      WHERE pm.product_id = p_product_id;

      IF bom_cost > 0 THEN
        total_cost := total_cost + (bom_cost * remaining_qty);
        batch_list := batch_list || jsonb_build_object(
          'batch_id', 'bom_fallback',
          'quantity', remaining_qty,
          'unit_cost', bom_cost,
          'subtotal', bom_cost * remaining_qty,
          'notes', 'Calculated from BOM'
        );
      ELSE
        -- Fallback to cost_price
        SELECT COALESCE(cost_price, base_price, 0) INTO fallback_cost
        FROM products WHERE id = p_product_id;

        IF fallback_cost > 0 THEN
          total_cost := total_cost + (fallback_cost * remaining_qty);
          batch_list := batch_list || jsonb_build_object(
            'batch_id', 'cost_price_fallback',
            'quantity', remaining_qty,
            'unit_cost', fallback_cost,
            'subtotal', fallback_cost * remaining_qty,
            'notes', 'Fallback to cost_price'
          );
        END IF;
      END IF;
    END;
  END IF;

  -- Return result
  RETURN QUERY SELECT total_cost, batch_list;
END;
$$;


ALTER FUNCTION public.calculate_fifo_cost(p_product_id uuid, p_branch_id uuid, p_quantity numeric, p_material_id uuid) OWNER TO postgres;

--
-- Name: calculate_payroll_with_advances(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.calculate_payroll_with_advances(emp_id uuid, period_year integer, period_month integer) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  salary_config public.employee_salaries;
  period_start DATE;
  period_end DATE;
  base_salary DECIMAL(15,2) := 0;
  commission_amount DECIMAL(15,2) := 0;
  outstanding_advances DECIMAL(15,2) := 0;
  advance_deduction DECIMAL(15,2) := 0;
  bonus_amount DECIMAL(15,2) := 0;
  total_deduction DECIMAL(15,2) := 0;
  gross_salary DECIMAL(15,2) := 0;
  net_salary DECIMAL(15,2) := 0;
  result JSONB;
BEGIN
  -- Calculate period dates
  period_start := DATE(period_year || '-' || period_month || '-01');
  period_end := (period_start + INTERVAL '1 month - 1 day')::DATE;

  -- Get active salary configuration
  SELECT * INTO salary_config FROM public.get_active_salary_config(emp_id, period_start);

  IF salary_config IS NULL THEN
    RAISE EXCEPTION 'No active salary configuration found for employee';
  END IF;

  -- Calculate base salary
  IF salary_config.payroll_type IN ('monthly', 'mixed') THEN
    base_salary := salary_config.base_salary;
  END IF;

  -- ALWAYS calculate commission from commission_entries table
  -- (regardless of commission_rate setting in salary config)
  IF salary_config.payroll_type IN ('commission_only', 'mixed') THEN
    commission_amount := public.calculate_commission_for_period(emp_id, period_start, period_end);
  END IF;

  -- Calculate outstanding advances (up to end of payroll period)
  outstanding_advances := public.get_outstanding_advances(emp_id, period_end);

  -- Calculate gross salary
  gross_salary := base_salary + commission_amount + bonus_amount;

  -- Calculate advance deduction (don't deduct more than net salary)
  advance_deduction := LEAST(outstanding_advances, gross_salary);
  total_deduction := advance_deduction;

  -- Calculate net salary
  net_salary := gross_salary - total_deduction;

  -- Build result JSON
  result := jsonb_build_object(
    'employeeId', emp_id,
    'periodYear', period_year,
    'periodMonth', period_month,
    'periodStart', period_start,
    'periodEnd', period_end,
    'baseSalary', base_salary,
    'commissionAmount', commission_amount,
    'bonusAmount', bonus_amount,
    'outstandingAdvances', outstanding_advances,
    'advanceDeduction', advance_deduction,
    'totalDeduction', total_deduction,
    'grossSalary', gross_salary,
    'netSalary', net_salary,
    'salaryConfigId', salary_config.id,
    'payrollType', salary_config.payroll_type
  );

  RETURN result;
END;
$$;


ALTER FUNCTION public.calculate_payroll_with_advances(emp_id uuid, period_year integer, period_month integer) OWNER TO postgres;

--
-- Name: calculate_transaction_payment_status(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.calculate_transaction_payment_status(p_transaction_id text) RETURNS text
    LANGUAGE plpgsql
    AS $$
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
$$;


ALTER FUNCTION public.calculate_transaction_payment_status(p_transaction_id text) OWNER TO postgres;

--
-- Name: calculate_zakat_amount(numeric, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.calculate_zakat_amount(p_asset_value numeric, p_nishab_type text DEFAULT 'gold'::text) RETURNS TABLE(asset_value numeric, nishab_value numeric, is_obligatory boolean, zakat_amount numeric, rate numeric)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_nishab_value NUMERIC;
  v_rate NUMERIC;
BEGIN
  -- Get current nishab values
  SELECT 
    CASE WHEN p_nishab_type = 'gold' THEN nr.gold_price * nr.gold_nishab
         ELSE nr.silver_price * nr.silver_nishab END,
    nr.zakat_rate
  INTO v_nishab_value, v_rate
  FROM nishab_reference nr
  WHERE nr.effective_date <= CURRENT_DATE
  ORDER BY nr.effective_date DESC
  LIMIT 1;
  
  -- Use defaults if not found
  IF v_nishab_value IS NULL THEN
    v_nishab_value := CASE WHEN p_nishab_type = 'gold' THEN 93500000 ELSE 8925000 END;
    v_rate := 0.025;
  END IF;
  
  RETURN QUERY SELECT
    p_asset_value,
    v_nishab_value,
    (p_asset_value >= v_nishab_value),
    CASE WHEN p_asset_value >= v_nishab_value THEN p_asset_value * v_rate ELSE 0 END,
    v_rate * 100; -- Convert to percentage
END;
$$;


ALTER FUNCTION public.calculate_zakat_amount(p_asset_value numeric, p_nishab_type text) OWNER TO postgres;

--
-- Name: FUNCTION calculate_zakat_amount(p_asset_value numeric, p_nishab_type text); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.calculate_zakat_amount(p_asset_value numeric, p_nishab_type text) IS 'Calculate zakat obligation based on asset value and nishab threshold';


--
-- Name: can_access_branch(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_access_branch(branch_uuid uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE
    user_role TEXT;
    user_branch UUID;
BEGIN
    -- If no branch specified, allow (for shared data)
    IF branch_uuid IS NULL THEN
        RETURN true;
    END IF;

    SELECT role, branch_id INTO user_role, user_branch
    FROM public.profiles
    WHERE id = auth.uid()
    LIMIT 1;

    -- Super admins, owners, and head office admins can access all branches
    IF user_role IN ('super_admin', 'head_office_admin', 'owner', 'admin') THEN
        RETURN true;
    END IF;

    -- Regular users can only access their own branch
    RETURN user_branch = branch_uuid;
END;
$$;


ALTER FUNCTION public.can_access_branch(branch_uuid uuid) OWNER TO postgres;

--
-- Name: can_access_pos(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_access_pos() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('pos_access'); END;
$$;


ALTER FUNCTION public.can_access_pos() OWNER TO postgres;

--
-- Name: can_access_settings(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_access_settings() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('settings_access'); END;
$$;


ALTER FUNCTION public.can_access_settings() OWNER TO postgres;

--
-- Name: can_create_accounts(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_create_accounts() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('accounts_create'); END;
$$;


ALTER FUNCTION public.can_create_accounts() OWNER TO postgres;

--
-- Name: can_create_advances(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_create_advances() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('advances_create'); END;
$$;


ALTER FUNCTION public.can_create_advances() OWNER TO postgres;

--
-- Name: can_create_customers(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_create_customers() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('customers_create'); END;
$$;


ALTER FUNCTION public.can_create_customers() OWNER TO postgres;

--
-- Name: can_create_employees(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_create_employees() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('employees_create'); END;
$$;


ALTER FUNCTION public.can_create_employees() OWNER TO postgres;

--
-- Name: can_create_expenses(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_create_expenses() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('expenses_create'); END;
$$;


ALTER FUNCTION public.can_create_expenses() OWNER TO postgres;

--
-- Name: can_create_materials(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_create_materials() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('materials_create'); END;
$$;


ALTER FUNCTION public.can_create_materials() OWNER TO postgres;

--
-- Name: can_create_products(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_create_products() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
