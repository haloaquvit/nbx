--
-- PostgreSQL database dump
--

\restrict x5QkOc8E7x5rEmoNiyEWMhh21MOHj3nn7FOqWmneQtxEbBTGkWXzJig3AUb3Ejr

-- Dumped from database version 14.20 (Ubuntu 14.20-0ubuntu0.22.04.1)
-- Dumped by pg_dump version 14.20 (Ubuntu 14.20-0ubuntu0.22.04.1)

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
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auth;


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: attendance_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.attendance_status AS ENUM (
    'Hadir',
    'Pulang'
);


--
-- Name: email(); Type: FUNCTION; Schema: auth; Owner: -
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


--
-- Name: role(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.role() RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE
    jwt_claims JSON;
BEGIN
    jwt_claims := current_setting('request.jwt.claims', true)::JSON;
    IF jwt_claims IS NULL THEN RETURN 'anon'; END IF;
    RETURN COALESCE(jwt_claims->>'role', 'anon');
EXCEPTION WHEN OTHERS THEN
    RETURN 'anon';
END;
$$;


--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: -
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


--
-- Name: add_material_stock(uuid, numeric); Type: FUNCTION; Schema: public; Owner: -
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


--
-- Name: audit_profiles_changes(); Type: FUNCTION; Schema: public; Owner: -
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


--
-- Name: audit_transactions_changes(); Type: FUNCTION; Schema: public; Owner: -
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


--
-- Name: auto_fill_account_type(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_fill_account_type() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
BEGIN
    -- If parent_id is provided, inherit type from parent
    IF NEW.parent_id IS NOT NULL THEN
        SELECT type INTO NEW.type 
        FROM accounts 
        WHERE id = NEW.parent_id;
    END IF;
    
    -- If still no type, determine from code prefix
    IF NEW.type IS NULL AND NEW.code IS NOT NULL THEN
        CASE 
            WHEN NEW.code LIKE '1%' THEN NEW.type := 'ASET';
            WHEN NEW.code LIKE '2%' THEN NEW.type := 'KEWAJIBAN';
            WHEN NEW.code LIKE '3%' THEN NEW.type := 'MODAL';
            WHEN NEW.code LIKE '4%' THEN NEW.type := 'PENDAPATAN';
            WHEN NEW.code LIKE '5%' OR NEW.code LIKE '6%' THEN NEW.type := 'BEBAN';
            ELSE NEW.type := 'ASET'; -- default
        END CASE;
    END IF;
    
    -- Auto-fill normal_balance based on type
    IF NEW.normal_balance IS NULL THEN
        CASE NEW.type
            WHEN 'ASET' THEN NEW.normal_balance := 'DEBIT';
            WHEN 'BEBAN' THEN NEW.normal_balance := 'DEBIT';
            WHEN 'KEWAJIBAN' THEN NEW.normal_balance := 'CREDIT';
            WHEN 'MODAL' THEN NEW.normal_balance := 'CREDIT';
            WHEN 'PENDAPATAN' THEN NEW.normal_balance := 'CREDIT';
            ELSE NEW.normal_balance := 'DEBIT';
        END CASE;
    END IF;
    
    -- Auto-fill level based on parent
    IF NEW.level IS NULL THEN
        IF NEW.parent_id IS NULL THEN
            NEW.level := 1;
        ELSE
            SELECT level + 1 INTO NEW.level 
            FROM accounts 
            WHERE id = NEW.parent_id;
        END IF;
    END IF;
    
    -- Auto-fill sort_order from code
    IF NEW.sort_order IS NULL OR NEW.sort_order = 0 THEN
        IF NEW.code ~ '^[0-9]+$' THEN
            NEW.sort_order := CAST(NEW.code AS INTEGER);
        END IF;
    END IF;
    
    RETURN NEW;
END;
$_$;


--
-- Name: calculate_asset_current_value(text); Type: FUNCTION; Schema: public; Owner: -
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


--
-- Name: calculate_commission_amount(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_commission_amount() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.amount = NEW.quantity * NEW.rate_per_qty;
  RETURN NEW;
END;
$$;


--
-- Name: calculate_commission_for_period(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_commission_for_period(emp_id uuid, start_date date, end_date date) RETURNS numeric
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  salary_config public.employee_salaries;
  total_commission DECIMAL(15,2) := 0;
  commission_base DECIMAL(15,2) := 0;
BEGIN
  -- Get active salary configuration
  SELECT * INTO salary_config FROM public.get_active_salary_config(emp_id, start_date);

  IF salary_config IS NULL OR salary_config.commission_rate = 0 THEN
    RETURN 0;
  END IF;

  -- Calculate commission base from various sources
  -- 1. From deliveries (for drivers/helpers)
  SELECT COALESCE(SUM(d.total_amount), 0) INTO commission_base
  FROM deliveries d
  WHERE (d.driver_id = emp_id OR d.helper_id = emp_id)
    AND d.delivery_date >= start_date
    AND d.delivery_date <= end_date
    AND d.status = 'completed';

  -- 2. From sales transactions (for sales staff) - can be added later
  -- Add more commission sources here as needed

  -- Calculate commission based on type
  IF salary_config.commission_type = 'percentage' THEN
    total_commission := commission_base * (salary_config.commission_rate / 100);
  ELSIF salary_config.commission_type = 'fixed_amount' THEN
    total_commission := salary_config.commission_rate; -- Fixed amount per month
  END IF;

  RETURN total_commission;
END;
$$;


--
-- Name: calculate_payroll_with_advances(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_payroll_with_advances(emp_id uuid, period_year integer, period_month integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
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

  -- Calculate commission
  IF salary_config.payroll_type IN ('commission_only', 'mixed') AND salary_config.commission_rate > 0 THEN
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


--
-- Name: calculate_transaction_payment_status(text); Type: FUNCTION; Schema: public; Owner: -
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


--
-- Name: calculate_zakat_amount(numeric, text); Type: FUNCTION; Schema: public; Owner: -
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


--
-- Name: FUNCTION calculate_zakat_amount(p_asset_value numeric, p_nishab_type text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.calculate_zakat_amount(p_asset_value numeric, p_nishab_type text) IS 'Calculate zakat obligation based on asset value and nishab threshold';


--
-- Name: can_access_branch(uuid); Type: FUNCTION; Schema: public; Owner: -
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


--
-- Name: can_access_pos(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_access_pos() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('pos_access'); END;
$$;


--
-- Name: can_access_settings(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_access_settings() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('settings_access'); END;
$$;


--
-- Name: can_create_accounts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_create_accounts() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('accounts_create'); END;
$$;


--
-- Name: can_create_advances(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_create_advances() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('advances_create'); END;
$$;


--
-- Name: can_create_customers(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_create_customers() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('customers_create'); END;
$$;


--
-- Name: can_create_employees(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_create_employees() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('employees_create'); END;
$$;


--
-- Name: can_create_expenses(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_create_expenses() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('expenses_create'); END;
$$;


--
-- Name: can_create_materials(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_create_materials() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('materials_create'); END;
$$;


--
-- Name: can_create_products(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_create_products() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('products_create'); END;
$$;


--
-- Name: can_create_quotations(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_create_quotations() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('quotations_create'); END;
$$;


--
-- Name: can_create_transactions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_create_transactions() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('transactions_create'); END;
$$;


--
-- Name: can_delete_customers(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_delete_customers() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('customers_delete'); END;
$$;


--
-- Name: can_delete_employees(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_delete_employees() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('employees_delete'); END;
$$;


--
-- Name: can_delete_materials(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_delete_materials() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('materials_delete'); END;
$$;


--
-- Name: can_delete_products(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_delete_products() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('products_delete'); END;
$$;


--
-- Name: can_delete_transactions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_delete_transactions() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('transactions_delete'); END;
$$;


--
-- Name: can_edit_accounts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_edit_accounts() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('accounts_edit'); END;
$$;


--
-- Name: can_edit_customers(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_edit_customers() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('customers_edit'); END;
$$;


--
-- Name: can_edit_employees(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_edit_employees() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('employees_edit'); END;
$$;


--
-- Name: can_edit_materials(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_edit_materials() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('materials_edit'); END;
$$;


--
-- Name: can_edit_products(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_edit_products() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('products_edit'); END;
$$;


--
-- Name: can_edit_quotations(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_edit_quotations() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('quotations_edit'); END;
$$;


--
-- Name: can_edit_transactions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_edit_transactions() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('transactions_edit'); END;
$$;


--
-- Name: can_manage_roles(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_manage_roles() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('role_management'); END;
$$;


--
-- Name: can_view_accounts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_view_accounts() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('accounts_view'); END;
$$;


--
-- Name: can_view_advances(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_view_advances() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('advances_view'); END;
$$;


--
-- Name: can_view_customers(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_view_customers() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('customers_view'); END;
$$;


--
-- Name: can_view_employees(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_view_employees() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('employees_view'); END;
$$;


--
-- Name: can_view_expenses(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_view_expenses() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('expenses_view'); END;
$$;


--
-- Name: can_view_financial_reports(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_view_financial_reports() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('financial_reports'); END;
$$;


--
-- Name: can_view_materials(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_view_materials() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('materials_view'); END;
$$;


--
-- Name: can_view_products(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_view_products() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('products_view'); END;
$$;


--
-- Name: can_view_quotations(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_view_quotations() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('quotations_view'); END;
$$;


--
-- Name: can_view_receivables(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_view_receivables() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('receivables_view'); END;
$$;


--
-- Name: can_view_stock_reports(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_view_stock_reports() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('stock_reports'); END;
$$;


--
-- Name: can_view_transactions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_view_transactions() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN RETURN has_permission('transactions_view'); END;
$$;


--
-- Name: cancel_transaction_payment(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
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


--
-- Name: cleanup_old_audit_logs(); Type: FUNCTION; Schema: public; Owner: -
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


--
-- Name: create_audit_log(text, text, text, jsonb, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_audit_log(p_table_name text, p_operation text, p_record_id text, p_old_data jsonb DEFAULT NULL::jsonb, p_new_data jsonb DEFAULT NULL::jsonb, p_additional_info jsonb DEFAULT NULL::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  audit_id UUID;
  current_user_profile RECORD;
BEGIN
  -- Get current user profile for context
  SELECT p.role, p.full_name, u.email INTO current_user_profile
  FROM auth.users u
  LEFT JOIN public.profiles p ON u.id = p.id
  WHERE u.id = auth.uid();
  
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
    auth.uid(),
    current_user_profile.email,
    current_user_profile.role,
    p_additional_info
  ) RETURNING id INTO audit_id;
  
  RETURN audit_id;
END;
$$;


--
-- Name: create_maintenance_reminders(); Type: FUNCTION; Schema: public; Owner: -
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


--
-- Name: create_zakat_cash_entry(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_zakat_cash_entry() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_account_name TEXT;
    v_cash_history_id TEXT;
BEGIN
    -- Only create cash entry if status is 'paid' and payment account is specified
    IF NEW.status = 'paid' AND NEW.payment_account_id IS NOT NULL AND NEW.cash_history_id IS NULL THEN
        -- Get account name
        SELECT name INTO v_account_name FROM accounts WHERE id = NEW.payment_account_id;

        -- Generate cash history ID
        v_cash_history_id := 'CH-ZAKAT-' || NEW.id || '-' || EXTRACT(EPOCH FROM NOW())::TEXT;

        -- Insert into cash_history
        INSERT INTO cash_history (
            id,
            account_id,
            account_name,
            amount,
            type,
            description,
            reference_type,
            reference_id,
            reference_name,
            created_at
        ) VALUES (
            v_cash_history_id,
            NEW.payment_account_id,
            v_account_name,
            NEW.amount,
            CASE
                WHEN NEW.category = 'zakat' THEN 'zakat'
                ELSE 'sedekah'
            END,
            NEW.title || COALESCE(' - ' || NEW.description, ''),
            CASE
                WHEN NEW.category = 'zakat' THEN 'zakat'
                ELSE 'charity'
            END,
            NEW.id,
            NEW.title,
            NEW.payment_date
        );

        -- Update the zakat record with cash_history_id
        NEW.cash_history_id := v_cash_history_id;

        -- Update account balance
        UPDATE accounts
        SET balance = balance - NEW.amount
        WHERE id = NEW.payment_account_id;
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: deactivate_employee(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.deactivate_employee(employee_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    UPDATE profiles 
    SET status = 'Tidak Aktif', 
        updated_at = NOW()
    WHERE id = employee_id;
END;
$$;


--
-- Name: deduct_materials_for_transaction(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.deduct_materials_for_transaction(p_transaction_id text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  item_record jsonb;
  material_record jsonb;
  material_id_uuid uuid;
  quantity_to_deduct numeric;
BEGIN
  FOR item_record IN (SELECT jsonb_array_elements(items) FROM public.transactions WHERE id = p_transaction_id)
  LOOP
    IF item_record -> 'product' ->> 'materials' IS NOT NULL THEN
      FOR material_record IN (SELECT jsonb_array_elements(item_record -> 'product' -> 'materials'))
      LOOP
        material_id_uuid := (material_record ->> 'materialId')::uuid;
        quantity_to_deduct := (material_record ->> 'quantity')::numeric * (item_record ->> 'quantity')::numeric;

        UPDATE public.materials
        SET stock = stock - quantity_to_deduct
        WHERE id = material_id_uuid;
      END LOOP;
    END IF;
  END LOOP;
END;
$$;


--
-- Name: delete_transaction_cascade(text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_transaction_cascade(p_transaction_id text, p_deleted_by uuid DEFAULT NULL::uuid, p_reason text DEFAULT 'Manual deletion'::text) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: demo_balance_sheet(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.demo_balance_sheet() RETURNS TABLE(section text, code character varying, account_name text, amount numeric)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  -- ASET
  SELECT 
    'ASET' as section,
    a.code,
    a.name as account_name,
    a.balance as amount
  FROM public.accounts a
  WHERE a.type = 'ASET' 
    AND a.is_header = false
    AND a.is_active = true
    AND a.code IS NOT NULL
  
  UNION ALL
  
  -- KEWAJIBAN
  SELECT 
    'KEWAJIBAN' as section,
    a.code,
    a.name as account_name, 
    a.balance as amount
  FROM public.accounts a
  WHERE a.type = 'KEWAJIBAN'
    AND a.is_header = false
    AND a.is_active = true
    AND a.code IS NOT NULL
    
  UNION ALL
  
  -- MODAL
  SELECT 
    'MODAL' as section,
    a.code,
    a.name as account_name,
    a.balance as amount  
  FROM public.accounts a
  WHERE a.type = 'MODAL'
    AND a.is_header = false
    AND a.is_active = true
    AND a.code IS NOT NULL
    
  ORDER BY section, code;
END;
$$;


--
-- Name: demo_show_chart_of_accounts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.demo_show_chart_of_accounts() RETURNS TABLE(level_indent text, code character varying, account_name text, account_type text, normal_bal character varying, current_balance numeric, is_header_account boolean)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    REPEAT('  ', a.level - 1) || 
    CASE 
      WHEN a.is_header THEN '📁 '
      ELSE '💰 '
    END as level_indent,
    a.code,
    a.name as account_name,
    a.type as account_type,
    a.normal_balance as normal_bal,
    a.balance as current_balance,
    a.is_header as is_header_account
  FROM public.accounts a
  WHERE a.is_active = true
    AND (a.code IS NOT NULL OR a.id LIKE 'acc-%')
  ORDER BY a.sort_order, a.code;
END;
$$;


--
-- Name: demo_trial_balance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.demo_trial_balance() RETURNS TABLE(code character varying, account_name text, debit_balance numeric, credit_balance numeric)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.code,
    a.name as account_name,
    CASE 
      WHEN a.normal_balance = 'DEBIT' AND a.balance >= 0 THEN a.balance
      WHEN a.normal_balance = 'DEBIT' AND a.balance < 0 THEN 0
      WHEN a.normal_balance = 'CREDIT' AND a.balance < 0 THEN ABS(a.balance)
      ELSE 0
    END as debit_balance,
    CASE 
      WHEN a.normal_balance = 'CREDIT' AND a.balance >= 0 THEN a.balance  
      WHEN a.normal_balance = 'CREDIT' AND a.balance < 0 THEN 0
      WHEN a.normal_balance = 'DEBIT' AND a.balance < 0 THEN ABS(a.balance)
      ELSE 0
    END as credit_balance
  FROM public.accounts a
  WHERE a.is_active = true 
    AND a.is_header = false
    AND a.code IS NOT NULL
    AND a.balance != 0
  ORDER BY a.code;
END;
$$;


--
-- Name: disable_rls(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.disable_rls(table_name text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- Check if user has permission (only owner role)
  IF NOT EXISTS (
    SELECT 1 FROM auth.users 
    WHERE id = auth.uid() 
    AND raw_user_meta_data->>'role' = 'owner'
  ) THEN
    RAISE EXCEPTION 'Only owner can manage RLS settings';
  END IF;

  -- Disable RLS on the specified table
  EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', table_name);
  
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to disable RLS on table %: %', table_name, SQLERRM;
END;
$$;


--
-- Name: driver_has_unreturned_retasi(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.driver_has_unreturned_retasi(driver text) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
  count_unreturned INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO count_unreturned
  FROM public.retasi
  WHERE driver_name = driver 
    AND is_returned = FALSE;
  
  RETURN count_unreturned > 0;
END;
$$;


--
-- Name: enable_rls(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enable_rls(table_name text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- Check if user has permission (only owner role)
  IF NOT EXISTS (
    SELECT 1 FROM auth.users 
    WHERE id = auth.uid() 
    AND raw_user_meta_data->>'role' = 'owner'
  ) THEN
    RAISE EXCEPTION 'Only owner can manage RLS settings';
  END IF;

  -- Enable RLS on the specified table
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
  
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to enable RLS on table %: %', table_name, SQLERRM;
END;
$$;


--
-- Name: generate_delivery_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_delivery_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: generate_journal_number(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_journal_number(entry_date date) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
  date_str TEXT;
  sequence_num INTEGER;
  journal_number TEXT;
BEGIN
  -- Format: MJE-YYYYMMDD-XXX (Manual Journal Entry)
  date_str := to_char(entry_date, 'YYYYMMDD');
  
  -- Get next sequence for this date
  SELECT COALESCE(MAX(
    CAST(
      SUBSTRING(journal_number FROM 'MJE-\d{8}-(\d+)') AS INTEGER
    )
  ), 0) + 1
  INTO sequence_num
  FROM public.manual_journal_entries
  WHERE journal_number LIKE 'MJE-' || date_str || '-%';
  
  -- Generate journal number
  journal_number := 'MJE-' || date_str || '-' || LPAD(sequence_num::TEXT, 3, '0');
  
  RETURN journal_number;
END;
$$;


--
-- Name: generate_retasi_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_retasi_number() RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
  new_number TEXT;
  counter INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(retasi_number FROM 12 FOR 3) AS INTEGER)), 0) + 1
  INTO counter
  FROM public.retasi
  WHERE retasi_number LIKE 'RET-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-%';
  
  new_number := 'RET-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD(counter::TEXT, 3, '0');
  
  RETURN new_number;
END;
$$;


--
-- Name: generate_supplier_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_supplier_code() RETURNS character varying
    LANGUAGE plpgsql
    AS $_$
DECLARE
  new_code VARCHAR(20);
  counter INTEGER;
BEGIN
  -- Get the current max number from existing codes
  SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM 4) AS INTEGER)), 0) + 1
  INTO counter
  FROM suppliers
  WHERE code ~ '^SUP[0-9]+$';
  
  -- Generate new code
  new_code := 'SUP' || LPAD(counter::TEXT, 4, '0');
  
  RETURN new_code;
END;
$_$;


--
-- Name: get_account_balance_analysis(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_account_balance_analysis(p_account_id text) RETURNS TABLE(account_id text, account_name text, account_type text, current_balance numeric, calculated_balance numeric, difference numeric, transaction_breakdown jsonb, needs_reconciliation boolean)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_account RECORD;
  v_pos_sales NUMERIC := 0;
  v_receivables NUMERIC := 0;
  v_cash_income NUMERIC := 0;
  v_cash_expense NUMERIC := 0;
  v_expenses NUMERIC := 0;
  v_advances NUMERIC := 0;
  v_calculated NUMERIC;
BEGIN
  -- Get account info
  SELECT id, name, COALESCE(account_type, type) as account_type, 
         current_balance, initial_balance
  INTO v_account
  FROM accounts 
  WHERE id = p_account_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Calculate POS sales (check if payment_account column exists in transactions)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' AND column_name = 'payment_account'
  ) THEN
    SELECT COALESCE(SUM(total), 0) INTO v_pos_sales
    FROM transactions 
    WHERE payment_account = p_account_id 
    AND payment_status = 'Lunas';
  END IF;

  -- Calculate receivables payments (if table exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transaction_payments') THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_receivables
    FROM transaction_payments 
    WHERE account_id = p_account_id 
    AND status = 'active';
  END IF;

  -- Calculate cash history
  SELECT 
    COALESCE(SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END), 0)
  INTO v_cash_income, v_cash_expense
  FROM cash_history 
  WHERE account_id = p_account_id;

  -- Calculate expenses (if table exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'expenses') THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_expenses
    FROM expenses 
    WHERE account_id = p_account_id 
    AND status = 'approved';
  END IF;

  -- Calculate advances (if table exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'employee_advances') THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_advances
    FROM employee_advances 
    WHERE account_id = p_account_id 
    AND status = 'approved';
  END IF;

  -- Calculate total
  v_calculated := COALESCE(v_account.initial_balance, 0) + v_pos_sales + v_receivables + v_cash_income - v_cash_expense - v_expenses - v_advances;

  RETURN QUERY SELECT 
    p_account_id,
    v_account.name,
    v_account.account_type,
    v_account.current_balance,
    v_calculated,
    (v_account.current_balance - v_calculated),
    json_build_object(
      'initial_balance', COALESCE(v_account.initial_balance, 0),
      'pos_sales', v_pos_sales,
      'receivables_payments', v_receivables,
      'cash_income', v_cash_income,
      'cash_expense', v_cash_expense,
      'expenses', v_expenses,
      'advances', v_advances
    )::JSONB,
    (ABS(v_account.current_balance - v_calculated) > 1000);
END;
$$;


--
-- Name: get_account_balance_with_children(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_account_balance_with_children(account_id text) RETURNS numeric
    LANGUAGE plpgsql
    AS $$
DECLARE
  total_balance NUMERIC := 0;
BEGIN
  -- Get sum of all child account balances
  WITH RECURSIVE account_tree AS (
    SELECT id, balance FROM public.accounts WHERE id = account_id
    UNION ALL
    SELECT a.id, a.balance 
    FROM public.accounts a
    JOIN account_tree at ON a.parent_id = at.id
  )
  SELECT COALESCE(SUM(balance), 0) INTO total_balance
  FROM account_tree
  WHERE id != account_id OR NOT EXISTS(
    SELECT 1 FROM public.accounts WHERE parent_id = account_id
  );
  
  RETURN total_balance;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: employee_salaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_salaries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    base_salary numeric(15,2) DEFAULT 0 NOT NULL,
    commission_rate numeric(5,2) DEFAULT 0 NOT NULL,
    payroll_type character varying(20) DEFAULT 'monthly'::character varying NOT NULL,
    commission_type character varying(20) DEFAULT 'none'::character varying NOT NULL,
    effective_from date DEFAULT CURRENT_DATE NOT NULL,
    effective_until date,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    CONSTRAINT valid_base_salary CHECK ((base_salary >= (0)::numeric)),
    CONSTRAINT valid_commission_rate CHECK (((commission_rate >= (0)::numeric) AND (commission_rate <= (100)::numeric))),
    CONSTRAINT valid_commission_type CHECK (((commission_type)::text = ANY ((ARRAY['percentage'::character varying, 'fixed_amount'::character varying, 'none'::character varying])::text[]))),
    CONSTRAINT valid_effective_period CHECK (((effective_until IS NULL) OR (effective_until >= effective_from))),
    CONSTRAINT valid_payroll_type CHECK (((payroll_type)::text = ANY ((ARRAY['monthly'::character varying, 'commission_only'::character varying, 'mixed'::character varying])::text[])))
);


--
-- Name: get_active_salary_config(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_active_salary_config(emp_id uuid, check_date date DEFAULT CURRENT_DATE) RETURNS public.employee_salaries
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  result public.employee_salaries;
BEGIN
  SELECT * INTO result
  FROM public.employee_salaries
  WHERE employee_id = emp_id
    AND is_active = true
    AND effective_from <= check_date
    AND (effective_until IS NULL OR effective_until >= check_date)
  ORDER BY effective_from DESC
  LIMIT 1;

  RETURN result;
END;
$$;


--
-- Name: get_all_accounts_balance_analysis(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_all_accounts_balance_analysis() RETURNS TABLE(account_id text, account_name text, account_type text, current_balance numeric, calculated_balance numeric, difference numeric, needs_reconciliation boolean, last_updated timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    analysis.account_id,
    analysis.account_name,
    analysis.account_type,
    analysis.current_balance,
    analysis.calculated_balance,
    analysis.difference,
    analysis.needs_reconciliation,
    COALESCE(acc.updated_at, acc.created_at, NOW()) as last_updated
  FROM accounts acc,
  LATERAL get_account_balance_analysis(acc.id) analysis
  ORDER BY ABS(analysis.difference) DESC;
END;
$$;


--
-- Name: get_commission_summary(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_commission_summary(emp_id uuid DEFAULT NULL::uuid, start_date date DEFAULT NULL::date, end_date date DEFAULT NULL::date) RETURNS TABLE(employee_id uuid, employee_name text, employee_role text, total_commission numeric, delivery_commission numeric, payroll_commission numeric, commission_count integer, period_start date, period_end date)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    ucr.employee_id,
    ucr.employee_name,
    ucr.employee_role,
    SUM(ucr.commission_amount) as total_commission,
    SUM(CASE WHEN ucr.commission_source = 'delivery' THEN ucr.commission_amount ELSE 0 END) as delivery_commission,
    SUM(CASE WHEN ucr.commission_source = 'payroll' THEN ucr.commission_amount ELSE 0 END) as payroll_commission,
    COUNT(*)::INTEGER as commission_count,
    COALESCE(start_date, MIN(ucr.commission_date)) as period_start,
    COALESCE(end_date, MAX(ucr.commission_date)) as period_end
  FROM public.unified_commission_report ucr
  WHERE
    (emp_id IS NULL OR ucr.employee_id = emp_id)
    AND (start_date IS NULL OR ucr.commission_date >= start_date)
    AND (end_date IS NULL OR ucr.commission_date <= end_date)
  GROUP BY ucr.employee_id, ucr.employee_name, ucr.employee_role
  ORDER BY total_commission DESC;
END;
$$;


--
-- Name: get_current_nishab(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_current_nishab() RETURNS TABLE(gold_price numeric, silver_price numeric, gold_nishab numeric, silver_nishab numeric, zakat_rate numeric, gold_nishab_value numeric, silver_nishab_value numeric)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    n.gold_price,
    n.silver_price,
    n.gold_nishab,
    n.silver_nishab,
    n.zakat_rate,
    (n.gold_price * n.gold_nishab) as gold_nishab_value,
    (n.silver_price * n.silver_nishab) as silver_nishab_value
  FROM nishab_reference n
  WHERE n.effective_date <= CURRENT_DATE
  ORDER BY n.effective_date DESC
  LIMIT 1;
  
  -- If no data, return defaults
  IF NOT FOUND THEN
    RETURN QUERY SELECT 
      1100000::NUMERIC, -- gold_price per gram
      15000::NUMERIC,   -- silver_price per gram
      85::NUMERIC,      -- gold_nishab grams
      595::NUMERIC,     -- silver_nishab grams
      0.025::NUMERIC,   -- zakat_rate 2.5%
      93500000::NUMERIC, -- gold_nishab_value
      8925000::NUMERIC;  -- silver_nishab_value
  END IF;
END;
$$;


--
-- Name: FUNCTION get_current_nishab(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_current_nishab() IS 'Get current nishab values for zakat calculation';


--
-- Name: get_current_user_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_current_user_role() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN (
    SELECT role 
    FROM public.profiles 
    WHERE id = auth.uid()
  );
END;
$$;


--
-- Name: get_delivery_summary(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_delivery_summary(transaction_id_param text) RETURNS TABLE(product_id uuid, product_name text, ordered_quantity integer, delivered_quantity integer, remaining_quantity integer, unit text, width numeric, height numeric)
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: get_delivery_with_employees(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_delivery_with_employees(delivery_id_param uuid) RETURNS TABLE(id uuid, transaction_id text, delivery_number integer, delivery_date timestamp with time zone, photo_url text, photo_drive_id text, notes text, driver_name text, helper_name text, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: get_next_retasi_counter(text, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_next_retasi_counter(driver text, target_date date DEFAULT CURRENT_DATE) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  counter INTEGER;
BEGIN
  -- Get the highest retasi_ke for the driver on the specific date
  SELECT COALESCE(MAX(retasi_ke), 0) + 1
  INTO counter
  FROM public.retasi
  WHERE driver_name = driver 
    AND departure_date = target_date;
  
  RETURN counter;
END;
$$;


--
-- Name: get_outstanding_advances(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_outstanding_advances(emp_id uuid, up_to_date date DEFAULT CURRENT_DATE) RETURNS numeric
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  total_advances DECIMAL(15,2) := 0;
  total_repayments DECIMAL(15,2) := 0;
  outstanding DECIMAL(15,2) := 0;
BEGIN
  -- Calculate total advances up to the specified date
  SELECT COALESCE(SUM(amount), 0) INTO total_advances
  FROM public.employee_advances
  WHERE employee_id = emp_id
    AND date <= up_to_date;

  -- Calculate total repayments up to the specified date
  SELECT COALESCE(SUM(ar.amount), 0) INTO total_repayments
  FROM public.advance_repayments ar
  JOIN public.employee_advances ea ON ea.id = ar.advance_id
  WHERE ea.employee_id = emp_id
    AND ar.date <= up_to_date;

  -- Calculate outstanding amount
  outstanding := total_advances - total_repayments;

  -- Return 0 if negative (overpaid)
  RETURN GREATEST(outstanding, 0);
END;
$$;


--
-- Name: get_rls_policies(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_rls_policies(table_name text DEFAULT NULL::text) RETURNS TABLE(schema_name text, table_name text, policy_name text, cmd text, roles text, qual text)
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT 
    schemaname::text as schema_name,
    tablename::text as table_name,
    policyname::text as policy_name,
    cmd::text,
    array_to_string(roles, ', ')::text as roles,
    qual::text
  FROM pg_policies 
  WHERE schemaname = 'public'
    AND (table_name IS NULL OR tablename = table_name)
  ORDER BY tablename, policyname;
$$;


--
-- Name: get_rls_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_rls_status() RETURNS TABLE(schema_name text, table_name text, rls_enabled boolean)
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT 
    schemaname::text as schema_name,
    tablename::text as table_name,
    rowsecurity as rls_enabled
  FROM pg_tables 
  WHERE schemaname = 'public'
  ORDER BY tablename;
$$;


--
-- Name: get_transactions_ready_for_delivery(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_transactions_ready_for_delivery() RETURNS TABLE(id text, customer_name text, order_date timestamp with time zone, items jsonb, total numeric, status text)
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: get_user_branch_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_branch_id() RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN
    RETURN (SELECT branch_id FROM profiles WHERE id = auth.uid());
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, status)
  VALUES (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.email,
    new.raw_user_meta_data ->> 'role',
    new.raw_user_meta_data ->> 'status'
  );
  RETURN new;
END;
$$;


--
-- Name: has_perm(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_perm(perm_name text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    jwt_role TEXT;
    perms JSONB;
BEGIN
    -- Get role from JWT claims (PostgREST sets this)
    BEGIN
        jwt_role := current_setting('request.jwt.claims', true)::json->>'role';
    EXCEPTION WHEN OTHERS THEN
        jwt_role := NULL;
    END;
    
    -- If no role in JWT, try current_user as fallback
    IF jwt_role IS NULL OR jwt_role = '' THEN
        jwt_role := current_user;
    END IF;
    
    -- Owner and admin always have all permissions
    IF jwt_role IN ('owner', 'admin') THEN
        RETURN true;
    END IF;
    
    -- Get permissions from role_permissions table
    SELECT permissions INTO perms
    FROM role_permissions
    WHERE role_id = jwt_role;
    
    -- If no permissions found, deny
    IF perms IS NULL THEN
        RETURN false;
    END IF;
    
    -- Check 'all' permission first
    IF (perms->>'all')::boolean = true THEN
        RETURN true;
    END IF;
    
    -- Check specific permission
    RETURN COALESCE((perms->>perm_name)::boolean, false);
END;
$$;


--
-- Name: has_permission(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_permission(permission_name text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE
    user_role TEXT;
    permissions JSONB;
BEGIN
    user_role := auth.role();

    -- If no role or anon, check if there's a valid user_id (authenticated)
    IF user_role IS NULL OR user_role = 'anon' THEN
        -- Check if user is authenticated via auth.uid()
        IF auth.uid() IS NOT NULL THEN
            -- Get role from profiles table
            SELECT role INTO user_role FROM profiles WHERE id = auth.uid();
        END IF;

        -- Still no role? deny access
        IF user_role IS NULL OR user_role = 'anon' THEN
            RETURN false;
        END IF;
    END IF;

    -- Get permissions from role_permissions table
    SELECT rp.permissions INTO permissions
    FROM role_permissions rp
    WHERE rp.role_id = user_role;

    -- If role not found in role_permissions, fallback to roles table
    IF permissions IS NULL THEN
        SELECT r.permissions INTO permissions
        FROM roles r
        WHERE r.name = user_role AND r.is_active = true;
    END IF;

    -- No permissions found, but owner/admin should have access
    IF permissions IS NULL THEN
        IF user_role IN ('owner', 'admin', 'super_admin', 'head_office_admin') THEN
            RETURN true;
        END IF;
        RETURN false;
    END IF;

    -- Check 'all' permission (owner-level access)
    IF (permissions->>'all')::boolean = true THEN
        RETURN true;
    END IF;

    -- Check specific permission
    RETURN COALESCE((permissions->>permission_name)::boolean, false);
END;
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role
    FROM public.profiles
    WHERE id = auth.uid()
    LIMIT 1;

    RETURN user_role IN ('admin', 'owner');
END;
$$;


--
-- Name: is_authenticated(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_authenticated() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE
    user_role TEXT;
BEGIN
    -- Check if there's a valid user_id
    IF auth.uid() IS NOT NULL THEN
        RETURN true;
    END IF;

    -- Or if role is not anon
    user_role := auth.role();
    RETURN user_role IS NOT NULL AND user_role != 'anon';
END;
$$;


--
-- Name: is_owner(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_owner() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role
    FROM public.profiles
    WHERE id = auth.uid()
    LIMIT 1;

    RETURN user_role = 'owner';
END;
$$;


--
-- Name: is_super_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_super_admin() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role
    FROM public.profiles
    WHERE id = auth.uid()
    LIMIT 1;

    RETURN user_role IN ('super_admin', 'head_office_admin', 'owner', 'admin');
END;
$$;


--
-- Name: log_performance(text, integer, text, integer, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_performance(p_operation_name text, p_duration_ms integer, p_table_name text DEFAULT NULL::text, p_record_count integer DEFAULT NULL::integer, p_query_type text DEFAULT NULL::text, p_metadata jsonb DEFAULT NULL::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO public.performance_logs (
    operation_name,
    duration_ms,
    user_id,
    table_name,
    record_count,
    query_type,
    metadata
  ) VALUES (
    p_operation_name,
    p_duration_ms,
    auth.uid(),
    p_table_name,
    p_record_count,
    p_query_type,
    p_metadata
  ) RETURNING id INTO log_id;
  
  RETURN log_id;
END;
$$;


--
-- Name: mark_retasi_returned(uuid, integer, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_retasi_returned(retasi_id uuid, returned_count integer DEFAULT 0, error_count integer DEFAULT 0, notes text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE public.retasi 
  SET 
    is_returned = TRUE,
    returned_items_count = returned_count,
    error_items_count = error_count,
    return_notes = notes,
    updated_at = NOW()
  WHERE id = retasi_id;
  
  RETURN FOUND;
END;
$$;


--
-- Name: notify_debt_payment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_debt_payment() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Only notify for debt payment type
    IF NEW.type = 'pembayaran_utang' THEN
        INSERT INTO notifications (id, title, message, type, reference_type, reference_id, reference_url, priority)
        VALUES (
            'NOTIF-DEBT-' || NEW.id || '-' || EXTRACT(EPOCH FROM NOW())::TEXT,
            'Debt Payment Recorded',
            'Payment of Rp ' || TO_CHAR(NEW.amount, 'FM999,999,999,999') || ' for ' || COALESCE(NEW.description, 'debt payment'),
            'debt_payment',
            'accounts_payable',
            NEW.reference_id,
            '/accounts-payable',
            'normal'
        );
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: notify_payroll_processed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_payroll_processed() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Only notify for payroll payment type
    IF NEW.type = 'pembayaran_gaji' THEN
        INSERT INTO notifications (id, title, message, type, reference_type, reference_id, reference_url, priority)
        VALUES (
            'NOTIF-PAYROLL-' || NEW.id || '-' || EXTRACT(EPOCH FROM NOW())::TEXT,
            'Payroll Payment Processed',
            'Salary payment of Rp ' || TO_CHAR(NEW.amount, 'FM999,999,999,999') || ' for ' || COALESCE(NEW.reference_name, 'employee'),
            'payroll_processed',
            'payroll',
            NEW.reference_id,
            '/payroll',
            'normal'
        );
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: notify_production_completed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_production_completed() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_product_name TEXT;
BEGIN
    -- Only notify when status changes to completed
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        -- Get product name
        SELECT name INTO v_product_name FROM products WHERE id = NEW.product_id;

        INSERT INTO notifications (id, title, message, type, reference_type, reference_id, reference_url, priority)
        VALUES (
            'NOTIF-PROD-' || NEW.id || '-' || EXTRACT(EPOCH FROM NOW())::TEXT,
            'Production Completed',
            'Production of ' || COALESCE(v_product_name, 'Unknown Product') || ' completed. Quantity: ' || NEW.quantity_produced,
            'production_completed',
            'production',
            NEW.id,
            '/production',
            'normal'
        );
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: notify_purchase_order_created(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_purchase_order_created() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO notifications (id, title, message, type, reference_type, reference_id, reference_url, priority)
    VALUES (
        'NOTIF-PO-' || NEW.id || '-' || EXTRACT(EPOCH FROM NOW())::TEXT,
        'New Purchase Order Created',
        'PO #' || COALESCE(NEW.po_number, NEW.id::TEXT) || ' for supplier ' || COALESCE(NEW.supplier_name, 'Unknown') || ' - ' ||
        'Total: Rp ' || TO_CHAR(COALESCE(NEW.total_cost, 0), 'FM999,999,999,999'),
        'purchase_order_created',
        'purchase_order',
        NEW.id,
        '/purchase-orders/' || NEW.id,
        'normal'
    );
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Don't fail the insert if notification fails
    RETURN NEW;
END;
$$;


--
-- Name: pay_receivable(text, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pay_receivable(p_transaction_id text, p_amount numeric) RETURNS void
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: pay_receivable_with_history(text, numeric, text, text, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pay_receivable_with_history(p_transaction_id text, p_amount numeric, p_account_id text DEFAULT NULL::text, p_account_name text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_recorded_by uuid DEFAULT NULL::uuid, p_recorded_by_name text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
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
    p_recorded_by,
    p_recorded_by_name
  );
END;
$$;


--
-- Name: populate_commission_product_info(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.populate_commission_product_info() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Try to get product name from products table
  SELECT p.name 
  INTO NEW.product_name
  FROM products p 
  WHERE p.id = NEW.product_id;
  
  -- If product name not found, use product_id as fallback
  IF NEW.product_name IS NULL THEN
    NEW.product_name = COALESCE(NEW.product_name, NEW.product_id::text);
  END IF;
  
  NEW.updated_at = NOW();
  
  RETURN NEW;
END;
$$;


--
-- Name: process_advance_repayment_from_salary(uuid, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_advance_repayment_from_salary(payroll_record_id uuid, advance_deduction_amount numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  payroll_record RECORD;
  remaining_deduction DECIMAL(15,2);
  advance_record RECORD;
  repayment_amount DECIMAL(15,2);
BEGIN
  -- Get payroll record details
  SELECT pr.*, p.full_name as employee_name
  INTO payroll_record
  FROM public.payroll_records pr
  JOIN public.profiles p ON p.id = pr.employee_id
  WHERE pr.id = payroll_record_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll record not found';
  END IF;

  remaining_deduction := advance_deduction_amount;

  -- Process advances in chronological order (FIFO)
  FOR advance_record IN
    SELECT ea.*, (ea.amount - COALESCE(SUM(ar.amount), 0)) as remaining_amount
    FROM public.employee_advances ea
    LEFT JOIN public.advance_repayments ar ON ar.advance_id = ea.id
    WHERE ea.employee_id = payroll_record.employee_id
      AND ea.date <= payroll_record.period_end
    GROUP BY ea.id, ea.amount, ea.date, ea.employee_id, ea.employee_name, ea.notes, ea.created_at, ea.account_id, ea.account_name
    HAVING (ea.amount - COALESCE(SUM(ar.amount), 0)) > 0
    ORDER BY ea.date ASC
  LOOP
    -- Calculate repayment amount for this advance
    repayment_amount := LEAST(remaining_deduction, advance_record.remaining_amount);

    -- Create repayment record
    INSERT INTO public.advance_repayments (
      id,
      advance_id,
      amount,
      date,
      recorded_by,
      notes
    ) VALUES (
      'rep-' || extract(epoch from now())::bigint || '-' || substring(advance_record.id from 5),
      advance_record.id,
      repayment_amount,
      payroll_record.payment_date,
      payroll_record.created_by,
      'Pemotongan gaji ' || TO_CHAR(DATE(payroll_record.period_year || '-' || payroll_record.period_month || '-01'), 'Month YYYY')
    );

    -- Update remaining deduction
    remaining_deduction := remaining_deduction - repayment_amount;

    -- Update remaining amount using RPC
    PERFORM public.update_remaining_amount(advance_record.id);

    -- Exit if all deduction is processed
    IF remaining_deduction <= 0 THEN
      EXIT;
    END IF;
  END LOOP;

  -- Update account balances for the repayments
  -- Decrease panjar karyawan account (1220)
  PERFORM public.update_account_balance('acc-1220', -advance_deduction_amount);

END;
$$;


--
-- Name: reconcile_account_balance(text, numeric, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reconcile_account_balance(p_account_id text, p_new_balance numeric, p_reason text, p_user_id uuid, p_user_name text) RETURNS TABLE(success boolean, message text, old_balance numeric, new_balance numeric, adjustment_amount numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_old_balance NUMERIC;
  v_adjustment NUMERIC;
  v_account_name TEXT;
BEGIN
  -- Check if user is owner
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = p_user_id AND role = 'owner'
  ) THEN
    RETURN QUERY SELECT 
      false as success,
      'Access denied. Only owners can reconcile account balances.' as message,
      0::NUMERIC as old_balance,
      0::NUMERIC as new_balance,
      0::NUMERIC as adjustment_amount;
    RETURN;
  END IF;

  -- Get current account info
  SELECT current_balance, name INTO v_old_balance, v_account_name
  FROM accounts 
  WHERE id = p_account_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT 
      false as success,
      'Account not found.' as message,
      0::NUMERIC as old_balance,
      0::NUMERIC as new_balance,
      0::NUMERIC as adjustment_amount;
    RETURN;
  END IF;

  -- Calculate adjustment
  v_adjustment := p_new_balance - v_old_balance;

  -- Update account balance
  UPDATE accounts 
  SET 
    current_balance = p_new_balance,
    updated_at = NOW()
  WHERE id = p_account_id;

  -- Log the reconciliation in cash_history table
  INSERT INTO cash_history (
    account_id,
    transaction_type,
    amount,
    description,
    reference_number,
    created_by,
    created_by_name,
    source_type
  ) VALUES (
    p_account_id,
    CASE WHEN v_adjustment >= 0 THEN 'income'::TEXT ELSE 'expense'::TEXT END,
    ABS(v_adjustment),
    COALESCE(p_reason, 'Balance reconciliation by owner'),
    'RECON-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS'),
    p_user_id,
    p_user_name,
    'reconciliation'
  );

  RETURN QUERY SELECT 
    true as success,
    'Account balance successfully reconciled from ' || v_old_balance::TEXT || ' to ' || p_new_balance::TEXT as message,
    v_old_balance as old_balance,
    p_new_balance as new_balance,
    v_adjustment as adjustment_amount;
END;
$$;


--
-- Name: record_payment_history(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_payment_history() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- Only trigger if paid_amount increased
  IF NEW.paid_amount > OLD.paid_amount THEN
    INSERT INTO public.payment_history (
      transaction_id,
      amount,
      payment_date,
      remaining_amount,
      recorded_by_name
    ) VALUES (
      NEW.id,
      NEW.paid_amount - OLD.paid_amount,
      NOW(),
      NEW.total - NEW.paid_amount,
      'System Auto-Record'
    );
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: record_receivable_payment(text, numeric, text, text, text, text, text, text, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_receivable_payment(p_transaction_id text, p_amount numeric, p_payment_method text DEFAULT 'cash'::text, p_account_id text DEFAULT NULL::text, p_account_name text DEFAULT 'Kas'::text, p_description text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_reference_number text DEFAULT NULL::text, p_paid_by_user_id uuid DEFAULT NULL::uuid, p_paid_by_user_name text DEFAULT 'System'::text, p_paid_by_user_role text DEFAULT 'staff'::text) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
  payment_id UUID;
  transaction_total NUMERIC;
  current_paid NUMERIC;
  new_payment_description TEXT;
BEGIN
  -- Validate transaction exists
  SELECT total INTO transaction_total FROM transactions WHERE id = p_transaction_id;
  IF transaction_total IS NULL THEN
    RAISE EXCEPTION 'Transaction not found: %', p_transaction_id;
  END IF;
  
  -- Calculate current paid amount
  SELECT COALESCE(SUM(amount), 0) INTO current_paid
  FROM transaction_payments 
  WHERE transaction_id = p_transaction_id AND status = 'active';
  
  -- Validate payment amount
  IF (current_paid + p_amount) > transaction_total THEN
    RAISE EXCEPTION 'Payment amount exceeds remaining balance';
  END IF;
  
  -- Generate description
  new_payment_description := COALESCE(p_description, 'Pembayaran piutang - ' || 
    CASE 
      WHEN (current_paid + p_amount) >= transaction_total THEN 'Pelunasan'
      ELSE 'Pembayaran ke-' || ((SELECT COUNT(*) FROM transaction_payments WHERE transaction_id = p_transaction_id AND status = 'active') + 1)
    END
  );
  
  -- Insert payment record
  INSERT INTO transaction_payments (
    transaction_id, amount, payment_method, account_id, account_name,
    description, notes, reference_number,
    paid_by_user_id, paid_by_user_name, paid_by_user_role, created_by
  ) VALUES (
    p_transaction_id, p_amount, p_payment_method, p_account_id, p_account_name,
    new_payment_description, p_notes, p_reference_number,
    p_paid_by_user_id, p_paid_by_user_name, p_paid_by_user_role, p_paid_by_user_id
  )
  RETURNING id INTO payment_id;
  
  -- Update transaction
  UPDATE transactions 
  SET 
    paid_amount = current_paid + p_amount,
    payment_status = CASE 
      WHEN current_paid + p_amount >= total THEN 'Lunas'::text
      ELSE 'Belum Lunas'::text
    END
  WHERE id = p_transaction_id;
  
  RETURN payment_id;
END;
$$;


--
-- Name: refresh_daily_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_daily_stats() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  REFRESH MATERIALIZED VIEW public.daily_stats;
END;
$$;


--
-- Name: search_customers(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_customers(search_term text DEFAULT ''::text, limit_count integer DEFAULT 50) RETURNS TABLE(id uuid, name text, phone text, address text, order_count integer, last_order_date timestamp with time zone, total_spent numeric)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    c.phone,
    c.address,
    c."orderCount",
    MAX(t.order_date) as last_order_date,
    COALESCE(SUM(t.total), 0) as total_spent
  FROM public.customers c
  LEFT JOIN public.transactions t ON c.id = t.customer_id
  WHERE 
    (search_term = '' OR 
     c.name ILIKE '%' || search_term || '%' OR
     c.phone ILIKE '%' || search_term || '%')
  GROUP BY c.id, c.name, c.phone, c.address, c."orderCount"
  ORDER BY c.name
  LIMIT limit_count;
END;
$$;


--
-- Name: search_products_with_stock(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_products_with_stock(search_term text DEFAULT ''::text, category_filter text DEFAULT NULL::text, limit_count integer DEFAULT 50) RETURNS TABLE(id uuid, name text, category text, base_price numeric, unit text, current_stock numeric, min_order integer, is_low_stock boolean)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.name,
    p.category,
    p.base_price,
    p.unit,
    COALESCE((p.specifications->>'stock')::NUMERIC, 0) as current_stock,
    p.min_order,
    COALESCE((p.specifications->>'stock')::NUMERIC, 0) <= p.min_order as is_low_stock
  FROM public.products p
  WHERE 
    (search_term = '' OR p.name ILIKE '%' || search_term || '%')
    AND (category_filter IS NULL OR p.category = category_filter)
  ORDER BY p.name
  LIMIT limit_count;
END;
$$;


--
-- Name: search_transactions(text, integer, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_transactions(search_term text DEFAULT ''::text, limit_count integer DEFAULT 50, offset_count integer DEFAULT 0, status_filter text DEFAULT NULL::text) RETURNS TABLE(id text, customer_name text, customer_display_name text, cashier_name text, total numeric, paid_amount numeric, payment_status text, status text, order_date timestamp with time zone, created_at timestamp with time zone)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.customer_name,
    c.name as customer_display_name,
    p.full_name as cashier_name,
    t.total,
    t.paid_amount,
    t.payment_status,
    t.status,
    t.order_date,
    t.created_at
  FROM public.transactions t
  LEFT JOIN public.customers c ON t.customer_id = c.id
  LEFT JOIN public.profiles p ON t.cashier_id = p.id
  WHERE 
    (search_term = '' OR 
     t.customer_name ILIKE '%' || search_term || '%' OR
     t.id ILIKE '%' || search_term || '%' OR
     c.name ILIKE '%' || search_term || '%')
    AND (status_filter IS NULL OR t.status = status_filter)
  ORDER BY t.order_date DESC
  LIMIT limit_count
  OFFSET offset_count;
END;
$$;


--
-- Name: set_account_initial_balance(text, numeric, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_account_initial_balance(p_account_id text, p_initial_balance numeric, p_reason text, p_user_id uuid, p_user_name text) RETURNS TABLE(success boolean, message text, old_initial_balance numeric, new_initial_balance numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_old_initial NUMERIC;
  v_account_name TEXT;
BEGIN
  -- Check if user is owner
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = p_user_id AND role = 'owner'
  ) THEN
    RETURN QUERY SELECT 
      false as success,
      'Access denied. Only owners can set initial balances.' as message,
      0::NUMERIC as old_initial_balance,
      0::NUMERIC as new_initial_balance;
    RETURN;
  END IF;

  -- Get current initial balance
  SELECT initial_balance, name INTO v_old_initial, v_account_name
  FROM accounts 
  WHERE id = p_account_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT 
      false as success,
      'Account not found.' as message,
      0::NUMERIC as old_initial_balance,
      0::NUMERIC as new_initial_balance;
    RETURN;
  END IF;

  -- Update initial balance
  UPDATE accounts 
  SET 
    initial_balance = p_initial_balance,
    updated_at = NOW()
  WHERE id = p_account_id;

  -- Log the change in cash_history
  INSERT INTO cash_history (
    account_id,
    transaction_type,
    amount,
    description,
    reference_number,
    created_by,
    created_by_name,
    source_type
  ) VALUES (
    p_account_id,
    'income',
    p_initial_balance,
    'Initial balance set: ' || COALESCE(p_reason, 'Initial balance setup'),
    'INIT-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS'),
    p_user_id,
    p_user_name,
    'initial_balance'
  );

  RETURN QUERY SELECT 
    true as success,
    'Initial balance set for ' || v_account_name || ' from ' || COALESCE(v_old_initial::TEXT, 'null') || ' to ' || p_initial_balance::TEXT as message,
    v_old_initial as old_initial_balance,
    p_initial_balance as new_initial_balance;
END;
$$;


--
-- Name: set_retasi_ke(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_retasi_ke() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Auto-generate retasi number if not provided
  IF NEW.retasi_number IS NULL OR NEW.retasi_number = '' THEN
    NEW.retasi_number := generate_retasi_number();
  END IF;
  
  -- Auto-set retasi_ke based on driver and date
  IF NEW.driver_name IS NOT NULL THEN
    NEW.retasi_ke := get_next_retasi_counter(NEW.driver_name, NEW.departure_date);
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: set_retasi_ke_and_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_retasi_ke_and_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Auto-generate retasi number if not provided
  IF NEW.retasi_number IS NULL OR NEW.retasi_number = '' THEN
    NEW.retasi_number := generate_retasi_number();
  END IF;
  
  -- Auto-set retasi_ke based on driver and date
  IF NEW.driver_name IS NOT NULL THEN
    NEW.retasi_ke := get_next_retasi_counter(NEW.driver_name, NEW.departure_date);
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: set_supplier_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_supplier_code() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    NEW.code := generate_supplier_code();
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;


--
-- Name: sync_attendance_checkin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_attendance_checkin() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- If check_in_time is provided, use it for check_in
    IF NEW.check_in_time IS NOT NULL AND NEW.check_in IS NULL THEN
        NEW.check_in := NEW.check_in_time;
    -- If check_in is provided, use it for check_in_time
    ELSIF NEW.check_in IS NOT NULL AND NEW.check_in_time IS NULL THEN
        NEW.check_in_time := NEW.check_in;
    END IF;
    
    -- Same for check_out
    IF NEW.check_out_time IS NOT NULL AND NEW.check_out IS NULL THEN
        NEW.check_out := NEW.check_out_time;
    ELSIF NEW.check_out IS NOT NULL AND NEW.check_out_time IS NULL THEN
        NEW.check_out_time := NEW.check_out;
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: sync_attendance_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_attendance_ids() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Sync user_id and employee_id
    IF NEW.user_id IS NOT NULL AND NEW.employee_id IS NULL THEN
        NEW.employee_id := NEW.user_id;
    ELSIF NEW.employee_id IS NOT NULL AND NEW.user_id IS NULL THEN
        NEW.user_id := NEW.employee_id;
    END IF;
    
    -- Set date if not provided
    IF NEW.date IS NULL THEN
        NEW.date := CURRENT_DATE;
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: sync_attendance_user_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_attendance_user_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- If date is not provided, set to today
    IF NEW.date IS NULL THEN
        NEW.date := CURRENT_DATE;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: sync_payroll_commissions_to_entries(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_payroll_commissions_to_entries() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  synced_count INTEGER := 0;
  payroll_record RECORD;
BEGIN
  -- Loop through payroll records with commissions that haven't been synced
  FOR payroll_record IN
    SELECT
      pr.*,
      p.full_name as employee_name,
      p.role as employee_role
    FROM payroll_records pr
    JOIN profiles p ON p.id = pr.employee_id
    WHERE pr.commission_amount > 0
      AND pr.status = 'paid'
      AND NOT EXISTS (
        SELECT 1 FROM commission_entries ce
        WHERE ce.source_id = pr.id AND ce.source_type = 'payroll'
      )
  LOOP
    -- Insert commission entry for the payroll commission
    INSERT INTO commission_entries (
      id,
      user_id,
      user_name,
      role,
      amount,
      quantity,
      product_name,
      delivery_id,
      source_type,
      source_id,
      created_at
    ) VALUES (
      'comm-payroll-' || payroll_record.id,
      payroll_record.employee_id,
      payroll_record.employee_name,
      payroll_record.employee_role,
      payroll_record.commission_amount,
      1, -- Quantity 1 for payroll commission
      'Komisi Gaji ' || TO_CHAR(DATE(payroll_record.period_year || '-' || payroll_record.period_month || '-01'), 'Month YYYY'),
      NULL, -- No delivery_id for payroll commissions
      'payroll',
      payroll_record.id,
      payroll_record.created_at
    );

    synced_count := synced_count + 1;
  END LOOP;

  RETURN synced_count;
END;
$$;


--
-- Name: test_balance_reconciliation_functions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.test_balance_reconciliation_functions() RETURNS TABLE(test_name text, status text, message text)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_account_id TEXT;
  v_test_user_id UUID;
BEGIN
  -- Get first account for testing
  SELECT id INTO v_account_id FROM accounts LIMIT 1;
  
  -- Get first owner user for testing
  SELECT id INTO v_test_user_id FROM profiles WHERE role = 'owner' LIMIT 1;
  
  -- Test 1: Check if get_all_accounts_balance_analysis works
  BEGIN
    PERFORM * FROM get_all_accounts_balance_analysis() LIMIT 1;
    RETURN QUERY SELECT 
      'get_all_accounts_balance_analysis' as test_name,
      'SUCCESS' as status,
      'Function exists and executes successfully' as message;
  EXCEPTION WHEN others THEN
    RETURN QUERY SELECT 
      'get_all_accounts_balance_analysis' as test_name,
      'FAILED' as status,
      SQLERRM as message;
  END;
  
  -- Test 2: Check if get_account_balance_analysis works
  IF v_account_id IS NOT NULL THEN
    BEGIN
      PERFORM * FROM get_account_balance_analysis(v_account_id) LIMIT 1;
      RETURN QUERY SELECT 
        'get_account_balance_analysis' as test_name,
        'SUCCESS' as status,
        'Function exists and executes successfully' as message;
    EXCEPTION WHEN others THEN
      RETURN QUERY SELECT 
        'get_account_balance_analysis' as test_name,
        'FAILED' as status,
        SQLERRM as message;
    END;
  END IF;
  
  -- Test 3: Check if balance_adjustments table exists
  BEGIN
    PERFORM 1 FROM balance_adjustments LIMIT 1;
    RETURN QUERY SELECT 
      'balance_adjustments_table' as test_name,
      'SUCCESS' as status,
      'Table exists and accessible' as message;
  EXCEPTION WHEN others THEN
    RETURN QUERY SELECT 
      'balance_adjustments_table' as test_name,
      'FAILED' as status,
      SQLERRM as message;
  END;
  
  -- Test 4: Check if cash_history table exists
  BEGIN
    PERFORM 1 FROM cash_history LIMIT 1;
    RETURN QUERY SELECT 
      'cash_history_table' as test_name,
      'SUCCESS' as status,
      'Table exists and accessible' as message;
  EXCEPTION WHEN others THEN
    RETURN QUERY SELECT 
      'cash_history_table' as test_name,
      'FAILED' as status,
      SQLERRM as message;
  END;
  
END;
$$;


--
-- Name: trigger_process_advance_repayment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_process_advance_repayment() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Only process when payroll status changes to 'paid' and there are deductions
  IF NEW.status = 'paid' AND OLD.status != 'paid' AND NEW.deduction_amount > 0 THEN
    -- Process advance repayments
    PERFORM public.process_advance_repayment_from_salary(NEW.id, NEW.deduction_amount);
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: trigger_sync_payroll_commission(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_sync_payroll_commission() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- When payroll status changes to 'paid' and has commission amount
  IF NEW.status = 'paid' AND OLD.status != 'paid' AND NEW.commission_amount > 0 THEN
    -- Check if commission entry doesn't already exist
    IF NOT EXISTS (
      SELECT 1 FROM commission_entries ce
      WHERE ce.source_id = NEW.id AND ce.source_type = 'payroll'
    ) THEN
      -- Get employee info
      DECLARE
        emp_name TEXT;
        emp_role TEXT;
      BEGIN
        SELECT p.full_name, p.role INTO emp_name, emp_role
        FROM profiles p WHERE p.id = NEW.employee_id;

        -- Insert commission entry
        INSERT INTO commission_entries (
          id,
          user_id,
          user_name,
          role,
          amount,
          quantity,
          product_name,
          delivery_id,
          source_type,
          source_id,
          created_at
        ) VALUES (
          'comm-payroll-' || NEW.id,
          NEW.employee_id,
          emp_name,
          emp_role,
          NEW.commission_amount,
          1,
          'Komisi Gaji ' || TO_CHAR(DATE(NEW.period_year || '-' || NEW.period_month || '-01'), 'Month YYYY'),
          NULL,
          'payroll',
          NEW.id,
          NOW()
        );
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: update_overdue_maintenance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_overdue_maintenance() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Update status to overdue for scheduled maintenance past due date
    UPDATE asset_maintenance
    SET status = 'overdue'
    WHERE status = 'scheduled'
      AND scheduled_date < CURRENT_DATE;

    -- Create notifications for overdue maintenance (if not already sent)
    INSERT INTO notifications (id, title, message, type, reference_type, reference_id, reference_url, priority, user_id)
    SELECT
        'NOTIF-OVERDUE-' || am.id || '-' || EXTRACT(EPOCH FROM NOW())::TEXT,
        'Maintenance Overdue: ' || a.asset_name,
        'Maintenance "' || am.title || '" for asset "' || a.asset_name || '" is overdue since ' || am.scheduled_date::TEXT,
        'maintenance_overdue',
        'maintenance',
        am.id,
        '/maintenance',
        'high',
        am.created_by
    FROM asset_maintenance am
    JOIN assets a ON am.asset_id = a.id
    WHERE am.status = 'overdue'
      AND am.notification_sent = FALSE;

    -- Mark notifications as sent
    UPDATE asset_maintenance
    SET notification_sent = TRUE
    WHERE status = 'overdue'
      AND notification_sent = FALSE;
END;
$$;


--
-- Name: update_payment_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_payment_status() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Auto-update payment status based on paid amount vs total
  IF NEW.paid_amount >= NEW.total THEN
    NEW.payment_status := 'Lunas';
  ELSIF NEW.paid_amount > 0 THEN
    NEW.payment_status := 'Belum Lunas';
  ELSE
    -- Keep existing payment_status if no payment yet
    -- Could be 'Kredit' or 'Belum Lunas'
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: update_payroll_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_payroll_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_product_materials_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_product_materials_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


--
-- Name: update_production_records_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_production_records_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


--
-- Name: update_profiles_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_profiles_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;


--
-- Name: update_remaining_amount(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_remaining_amount(p_advance_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_total_repaid NUMERIC := 0;
  v_original_amount NUMERIC := 0;
  v_new_remaining NUMERIC := 0;
BEGIN
  -- Get the original advance amount
  SELECT amount INTO v_original_amount
  FROM public.employee_advances 
  WHERE id = p_advance_id;
  
  IF v_original_amount IS NULL THEN
    RAISE EXCEPTION 'Advance with ID % not found', p_advance_id;
  END IF;
  
  -- Calculate total repaid amount for this advance
  SELECT COALESCE(SUM(amount), 0) INTO v_total_repaid
  FROM public.advance_repayments 
  WHERE advance_id = p_advance_id;
  
  -- Calculate new remaining amount
  v_new_remaining := v_original_amount - v_total_repaid;
  
  -- Ensure remaining amount doesn't go below 0
  IF v_new_remaining < 0 THEN
    v_new_remaining := 0;
  END IF;
  
  -- Update the remaining amount
  UPDATE public.employee_advances 
  SET remaining_amount = v_new_remaining
  WHERE id = p_advance_id;
  
END;
$$;


--
-- Name: update_transaction_delivery_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_transaction_delivery_status() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
      ti.product_id,
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
    GROUP BY ti.product_id, ti.quantity
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
        -- Belum ada pengantaran sama sekali, tetap 'Siap Antar'
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
$$;


--
-- Name: update_transaction_status_from_delivery(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_transaction_status_from_delivery() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: validate_journal_balance(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_journal_balance(journal_id uuid) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
  total_debits NUMERIC;
  total_credits NUMERIC;
BEGIN
  -- Calculate total debits and credits
  SELECT 
    COALESCE(SUM(debit_amount), 0),
    COALESCE(SUM(credit_amount), 0)
  INTO total_debits, total_credits
  FROM public.manual_journal_entry_lines
  WHERE journal_id = validate_journal_balance.journal_id;
  
  -- Return true if balanced (difference less than 0.01 for rounding)
  RETURN ABS(total_debits - total_credits) < 0.01;
END;
$$;


--
-- Name: validate_transaction_status_transition(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_transaction_status_transition() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Jika transaksi adalah laku kantor, tidak boleh masuk ke delivery flow
  IF NEW.is_office_sale = true AND NEW.status IN ('Siap Antar', 'Diantar Sebagian') THEN
    -- Auto change ke 'Selesai' untuk laku kantor
    NEW.status := 'Selesai';
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts (
    id text NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    balance numeric NOT NULL,
    is_payment_account boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    current_balance numeric DEFAULT 0,
    initial_balance numeric DEFAULT 0 NOT NULL,
    account_type text DEFAULT 'cash'::text,
    updated_at timestamp with time zone DEFAULT now(),
    code character varying(10),
    parent_id text,
    level integer DEFAULT 1,
    normal_balance character varying(10) DEFAULT 'DEBIT'::character varying,
    is_header boolean DEFAULT false,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    branch_id uuid,
    category text,
    CONSTRAINT accounts_level_check CHECK (((level >= 1) AND (level <= 4))),
    CONSTRAINT accounts_normal_balance_check CHECK (((normal_balance)::text = ANY ((ARRAY['DEBIT'::character varying, 'CREDIT'::character varying])::text[])))
);


--
-- Name: COLUMN accounts.balance; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts.balance IS 'Saldo saat ini yang dihitung dari initial_balance + semua transaksi';


--
-- Name: COLUMN accounts.initial_balance; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts.initial_balance IS 'Saldo awal yang diinput oleh owner, tidak berubah kecuali diupdate manual';


--
-- Name: COLUMN accounts.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts.code IS 'Kode akun standar (1000, 1100, 1110, dst)';


--
-- Name: COLUMN accounts.parent_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts.parent_id IS 'ID parent account untuk hierarki';


--
-- Name: COLUMN accounts.level; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts.level IS 'Level hierarki: 1=Header, 2=Sub-header, 3=Detail, 4=Sub-detail';


--
-- Name: COLUMN accounts.normal_balance; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts.normal_balance IS 'Saldo normal: DEBIT atau CREDIT';


--
-- Name: COLUMN accounts.is_header; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts.is_header IS 'Apakah ini header account (tidak bisa digunakan untuk transaksi)';


--
-- Name: COLUMN accounts.is_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts.is_active IS 'Status aktif account';


--
-- Name: COLUMN accounts.sort_order; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts.sort_order IS 'Urutan tampilan dalam laporan';


--
-- Name: accounts_hierarchy; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.accounts_hierarchy AS
 WITH RECURSIVE account_tree AS (
         SELECT accounts.id,
            accounts.code,
            accounts.name,
            accounts.type,
            accounts.parent_id,
            accounts.level,
            accounts.is_header,
            accounts.is_active,
            accounts.normal_balance,
            accounts.balance,
            accounts.initial_balance,
            accounts.is_payment_account,
            accounts.sort_order,
            accounts.name AS full_path,
            ARRAY[accounts.sort_order] AS path_array
           FROM public.accounts
          WHERE ((accounts.parent_id IS NULL) AND (accounts.is_active = true))
        UNION ALL
         SELECT a.id,
            a.code,
            a.name,
            a.type,
            a.parent_id,
            a.level,
            a.is_header,
            a.is_active,
            a.normal_balance,
            a.balance,
            a.initial_balance,
            a.is_payment_account,
            a.sort_order,
            ((at.full_path || ' > '::text) || a.name) AS full_path,
            (at.path_array || a.sort_order) AS path_array
           FROM (public.accounts a
             JOIN account_tree at ON ((a.parent_id = at.id)))
          WHERE (a.is_active = true)
        )
 SELECT account_tree.id,
    account_tree.code,
    account_tree.name,
    account_tree.type,
    account_tree.parent_id,
    account_tree.level,
    account_tree.is_header,
    account_tree.is_active,
    account_tree.normal_balance,
    account_tree.balance,
    account_tree.initial_balance,
    account_tree.is_payment_account,
    account_tree.sort_order,
    account_tree.full_path,
    (repeat('  '::text, (account_tree.level - 1)) || account_tree.name) AS indented_name
   FROM account_tree
  ORDER BY account_tree.path_array;


--
-- Name: accounts_payable; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts_payable (
    id text NOT NULL,
    purchase_order_id text,
    supplier_name text NOT NULL,
    amount numeric NOT NULL,
    due_date timestamp with time zone,
    description text NOT NULL,
    status text DEFAULT 'Outstanding'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    paid_at timestamp with time zone,
    paid_amount numeric DEFAULT 0,
    payment_account_id text,
    notes text,
    interest_rate numeric DEFAULT 0,
    interest_type text DEFAULT 'flat'::text,
    creditor_type text DEFAULT 'supplier'::text,
    branch_id uuid,
    CONSTRAINT accounts_payable_creditor_type_check CHECK ((creditor_type = ANY (ARRAY['supplier'::text, 'bank'::text, 'credit_card'::text, 'other'::text]))),
    CONSTRAINT accounts_payable_interest_type_check CHECK ((interest_type = ANY (ARRAY['flat'::text, 'per_month'::text, 'per_year'::text]))),
    CONSTRAINT accounts_payable_status_check CHECK ((status = ANY (ARRAY['Outstanding'::text, 'Paid'::text, 'Partial'::text])))
);


--
-- Name: COLUMN accounts_payable.interest_rate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts_payable.interest_rate IS 'Interest rate in percentage (e.g., 5 for 5%)';


--
-- Name: COLUMN accounts_payable.interest_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts_payable.interest_type IS 'Type of interest calculation: flat (one-time), per_month (monthly), per_year (annual)';


--
-- Name: COLUMN accounts_payable.creditor_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts_payable.creditor_type IS 'Type of creditor: supplier, bank, credit_card, or other';


--
-- Name: advance_repayments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.advance_repayments (
    id text NOT NULL,
    advance_id text,
    amount numeric NOT NULL,
    date timestamp with time zone NOT NULL,
    recorded_by text
);


--
-- Name: asset_maintenance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_maintenance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id uuid,
    maintenance_date date,
    maintenance_type text,
    description text,
    cost numeric(15,2) DEFAULT 0,
    performed_by text,
    next_maintenance_date date,
    status text DEFAULT 'completed'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    branch_id uuid,
    scheduled_date date,
    title text,
    completed_date date,
    is_recurring boolean DEFAULT false,
    recurrence_interval integer,
    recurrence_unit text,
    priority text DEFAULT 'medium'::text,
    estimated_cost numeric(15,2) DEFAULT 0,
    actual_cost numeric(15,2) DEFAULT 0,
    payment_account_id text,
    payment_account_name text,
    service_provider text,
    technician_name text,
    parts_replaced text,
    labor_hours numeric(10,2),
    work_performed text,
    findings text,
    recommendations text,
    attachments text,
    notify_before_days integer DEFAULT 7,
    notification_sent boolean DEFAULT false,
    created_by uuid,
    completed_by uuid
);


--
-- Name: assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    code text,
    category text,
    purchase_date date,
    purchase_price numeric(15,2) DEFAULT 0,
    current_value numeric(15,2) DEFAULT 0,
    depreciation_method text DEFAULT 'straight_line'::text,
    useful_life_years integer DEFAULT 5,
    salvage_value numeric(15,2) DEFAULT 0,
    location text,
    status text DEFAULT 'active'::text,
    notes text,
    branch_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    asset_name text GENERATED ALWAYS AS (name) STORED,
    asset_code text,
    description text,
    supplier_name text,
    brand text,
    model text,
    serial_number text,
    condition text DEFAULT 'good'::text,
    account_id text,
    warranty_expiry date,
    insurance_expiry date,
    photo_url text,
    created_by uuid
);


--
-- Name: attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid,
    date date DEFAULT CURRENT_DATE NOT NULL,
    check_in timestamp with time zone,
    check_out timestamp with time zone,
    status text DEFAULT 'present'::text,
    notes text,
    branch_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    user_id uuid,
    check_in_time timestamp with time zone,
    check_out_time timestamp with time zone
);


--
-- Name: balance_adjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.balance_adjustments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id text NOT NULL,
    adjustment_type text NOT NULL,
    old_balance numeric,
    new_balance numeric,
    adjustment_amount numeric,
    reason text NOT NULL,
    reference_number text,
    adjusted_by uuid,
    adjusted_by_name text,
    created_at timestamp with time zone DEFAULT now(),
    approved_by uuid,
    approved_at timestamp with time zone,
    status text DEFAULT 'pending'::text,
    CONSTRAINT balance_adjustments_adjustment_type_check CHECK ((adjustment_type = ANY (ARRAY['reconciliation'::text, 'initial_balance'::text, 'correction'::text]))),
    CONSTRAINT balance_adjustments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: bonus_pricings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bonus_pricings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    min_quantity integer NOT NULL,
    max_quantity integer,
    bonus_quantity integer DEFAULT 0 NOT NULL,
    bonus_type text NOT NULL,
    bonus_value numeric(15,2) DEFAULT 0 NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT bonus_pricings_bonus_type_check CHECK ((bonus_type = ANY (ARRAY['quantity'::text, 'percentage'::text, 'fixed_discount'::text])))
);


--
-- Name: TABLE bonus_pricings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.bonus_pricings IS 'Bonus rules based on purchase quantity';


--
-- Name: COLUMN bonus_pricings.min_quantity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bonus_pricings.min_quantity IS 'Minimum quantity for this bonus rule';


--
-- Name: COLUMN bonus_pricings.max_quantity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bonus_pricings.max_quantity IS 'Maximum quantity for this bonus rule (NULL means no upper limit)';


--
-- Name: COLUMN bonus_pricings.bonus_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bonus_pricings.bonus_type IS 'Type of bonus: quantity (free items), percentage (% discount), fixed_discount (fixed amount discount)';


--
-- Name: COLUMN bonus_pricings.bonus_value; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bonus_pricings.bonus_value IS 'Value of bonus depending on type: quantity in pieces, percentage (0-100), or fixed discount amount';


--
-- Name: branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    address text,
    phone text,
    is_main boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true,
    company_id uuid,
    manager_id uuid,
    manager_name text,
    settings jsonb DEFAULT '{}'::jsonb,
    code text,
    email text,
    city text,
    province text,
    postal_code text,
    country text DEFAULT 'Indonesia'::text
);


--
-- Name: cash_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id text NOT NULL,
    transaction_type text NOT NULL,
    amount numeric NOT NULL,
    description text NOT NULL,
    reference_number text,
    created_by uuid,
    created_by_name text,
    source_type text,
    created_at timestamp with time zone DEFAULT now(),
    branch_id uuid,
    type text,
    CONSTRAINT cash_history_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT cash_history_transaction_type_check CHECK ((transaction_type = ANY (ARRAY['income'::text, 'expense'::text])))
);


--
-- Name: commission_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commission_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    user_name text NOT NULL,
    role text NOT NULL,
    product_id uuid NOT NULL,
    product_name text NOT NULL,
    quantity integer DEFAULT 0 NOT NULL,
    rate_per_qty numeric(15,2) DEFAULT 0 NOT NULL,
    amount numeric(15,2) DEFAULT 0 NOT NULL,
    transaction_id text,
    delivery_id text,
    ref text NOT NULL,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now(),
    branch_id uuid,
    CONSTRAINT commission_entries_role_check CHECK ((role = ANY (ARRAY['sales'::text, 'driver'::text, 'helper'::text]))),
    CONSTRAINT commission_entries_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'cancelled'::text])))
);


--
-- Name: commission_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commission_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    product_name text NOT NULL,
    role text NOT NULL,
    rate_per_qty numeric(15,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT commission_rules_role_check CHECK ((role = ANY (ARRAY['sales'::text, 'driver'::text, 'helper'::text])))
);


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    address text,
    phone text,
    email text,
    tax_id text,
    logo_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    code text,
    is_head_office boolean DEFAULT false,
    is_active boolean DEFAULT true
);


--
-- Name: company_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_settings (
    key text NOT NULL,
    value text
);


--
-- Name: customer_pricings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_pricings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid,
    customer_id uuid,
    customer_classification text,
    price_type text DEFAULT 'fixed'::text,
    price_value numeric(15,2),
    priority integer DEFAULT 0,
    description text,
    is_active boolean DEFAULT true,
    branch_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    phone text,
    address text,
    "orderCount" integer DEFAULT 0,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    latitude numeric,
    longitude numeric,
    full_address text,
    store_photo_url text,
    store_photo_drive_id text,
    jumlah_galon_titip integer DEFAULT 0,
    branch_id uuid,
    classification text
);


--
-- Name: COLUMN customers.jumlah_galon_titip; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.customers.jumlah_galon_titip IS 'Jumlah galon yang dititip di pelanggan';


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id text NOT NULL,
    customer_id uuid,
    customer_name text,
    cashier_id uuid,
    cashier_name text,
    designer_id uuid,
    operator_id uuid,
    payment_account_id text,
    order_date timestamp with time zone NOT NULL,
    finish_date timestamp with time zone,
    items jsonb,
    total numeric NOT NULL,
    paid_amount numeric NOT NULL,
    payment_status text NOT NULL,
    status text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    subtotal numeric DEFAULT 0,
    ppn_enabled boolean DEFAULT false,
    ppn_percentage numeric DEFAULT 11,
    ppn_amount numeric DEFAULT 0,
    is_office_sale boolean DEFAULT false,
    due_date timestamp with time zone,
    ppn_mode text,
    sales_id uuid,
    sales_name text,
    retasi_id uuid,
    retasi_number text,
    branch_id uuid,
    notes text,
    CONSTRAINT transaction_status_check CHECK ((status = ANY (ARRAY['Pesanan Masuk'::text, 'Siap Antar'::text, 'Diantar Sebagian'::text, 'Selesai'::text, 'Dibatalkan'::text]))),
    CONSTRAINT transactions_ppn_mode_check CHECK ((ppn_mode = ANY (ARRAY['include'::text, 'exclude'::text])))
);


--
-- Name: TABLE transactions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.transactions IS 'Transaction data. Delivery information is now handled separately in deliveries and delivery_items tables as of migration 0034.';


--
-- Name: COLUMN transactions.subtotal; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.subtotal IS 'Total sebelum PPN dan setelah diskon';


--
-- Name: COLUMN transactions.ppn_enabled; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.ppn_enabled IS 'Apakah PPN diaktifkan untuk transaksi ini';


--
-- Name: COLUMN transactions.ppn_percentage; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.ppn_percentage IS 'Persentase PPN yang digunakan (default 11%)';


--
-- Name: COLUMN transactions.ppn_amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.ppn_amount IS 'Jumlah PPN dalam rupiah';


--
-- Name: COLUMN transactions.is_office_sale; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.is_office_sale IS 'Menandakan apakah produk laku kantor (true) atau perlu diantar (false)';


--
-- Name: COLUMN transactions.due_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.due_date IS 'Tanggal jatuh tempo untuk pembayaran kredit';


--
-- Name: COLUMN transactions.ppn_mode; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.ppn_mode IS 'Mode PPN: include (sudah termasuk) atau exclude (belum termasuk)';


--
-- Name: COLUMN transactions.sales_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.sales_id IS 'ID of the sales person responsible for this transaction';


--
-- Name: COLUMN transactions.sales_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.sales_name IS 'Name of the sales person responsible for this transaction';


--
-- Name: COLUMN transactions.retasi_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.retasi_id IS 'Reference to retasi table - links driver transactions to their active retasi';


--
-- Name: COLUMN transactions.retasi_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.retasi_number IS 'Retasi number for display purposes (e.g., RET-20251213-001)';


--
-- Name: daily_stats; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.daily_stats AS
 SELECT CURRENT_DATE AS date,
    count(*) AS total_transactions,
    sum(transactions.total) AS total_revenue,
    count(DISTINCT transactions.customer_id) AS unique_customers,
    avg(transactions.total) AS avg_transaction_value
   FROM public.transactions
  WHERE (date(transactions.order_date) = CURRENT_DATE)
  WITH NO DATA;


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    base_price numeric NOT NULL,
    unit text NOT NULL,
    min_order integer NOT NULL,
    description text,
    specifications jsonb,
    materials jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    type text DEFAULT 'Produksi'::text,
    current_stock numeric DEFAULT 0,
    min_stock numeric DEFAULT 0,
    branch_id uuid,
    cost_price numeric(15,2),
    is_shared boolean DEFAULT false
);


--
-- Name: COLUMN products.type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.type IS 'Jenis barang: Stock (produksi menurunkan stock), Beli (produksi menambah stock)';


--
-- Name: COLUMN products.current_stock; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.current_stock IS 'Stock saat ini';


--
-- Name: COLUMN products.min_stock; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.min_stock IS 'Stock minimum untuk alert';


--
-- Name: dashboard_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.dashboard_summary AS
 WITH recent_transactions AS (
         SELECT count(*) AS total_transactions,
            sum(transactions.total) AS total_revenue,
            count(
                CASE
                    WHEN (transactions.payment_status = 'Lunas'::text) THEN 1
                    ELSE NULL::integer
                END) AS paid_transactions,
            count(
                CASE
                    WHEN (transactions.payment_status = 'Belum Lunas'::text) THEN 1
                    ELSE NULL::integer
                END) AS unpaid_transactions
           FROM public.transactions
          WHERE (transactions.order_date >= (CURRENT_DATE - '30 days'::interval))
        ), stock_summary AS (
         SELECT count(*) AS total_products,
            count(
                CASE
                    WHEN (((products.specifications ->> 'stock'::text))::numeric <= (products.min_order)::numeric) THEN 1
                    ELSE NULL::integer
                END) AS low_stock_products
           FROM public.products
        ), customer_summary AS (
         SELECT count(*) AS total_customers
           FROM public.customers
        )
 SELECT rt.total_transactions,
    rt.total_revenue,
    rt.paid_transactions,
    rt.unpaid_transactions,
    ss.total_products,
    ss.low_stock_products,
    cs.total_customers
   FROM recent_transactions rt,
    stock_summary ss,
    customer_summary cs;


--
-- Name: deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transaction_id text NOT NULL,
    delivery_number integer NOT NULL,
    delivery_date timestamp with time zone DEFAULT now() NOT NULL,
    photo_url text,
    photo_drive_id text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    branch_id uuid,
    driver_id uuid,
    helper_id uuid,
    driver_name text,
    helper_name text,
    CONSTRAINT delivery_number_positive CHECK ((delivery_number > 0))
);


--
-- Name: delivery_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delivery_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    delivery_id uuid NOT NULL,
    product_id uuid NOT NULL,
    product_name text NOT NULL,
    quantity_delivered integer NOT NULL,
    unit text NOT NULL,
    width numeric,
    height numeric,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    is_bonus boolean DEFAULT false,
    CONSTRAINT delivery_items_quantity_delivered_check CHECK ((quantity_delivered > 0))
);


--
-- Name: delivery_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delivery_photos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    delivery_id uuid,
    photo_url text NOT NULL,
    photo_type text DEFAULT 'delivery'::text,
    description text,
    uploaded_at timestamp with time zone DEFAULT now()
);


--
-- Name: employee_advances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_advances (
    id text NOT NULL,
    employee_id uuid,
    employee_name text,
    amount numeric NOT NULL,
    date timestamp with time zone NOT NULL,
    notes text,
    remaining_amount numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    account_id text,
    account_name text,
    branch_id uuid,
    purpose text,
    status text DEFAULT 'pending'::text,
    approved_by uuid,
    approved_at timestamp with time zone
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    full_name text,
    role text DEFAULT 'user'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    password_hash character varying(255),
    branch_id uuid,
    username text,
    phone text,
    address text,
    status text DEFAULT 'Aktif'::text,
    name text GENERATED ALWAYS AS (full_name) STORED
);


--
-- Name: employee_salary_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.employee_salary_summary AS
 SELECT es.id,
    es.employee_id,
    p.full_name AS employee_name,
    p.role AS employee_role,
    es.base_salary,
    es.commission_rate,
    es.payroll_type,
    es.commission_type,
    es.effective_from,
    es.effective_until,
    es.is_active,
    es.created_by,
    es.created_at,
    es.updated_at,
    es.notes
   FROM (public.employee_salaries es
     LEFT JOIN public.profiles p ON ((es.employee_id = p.id)));


--
-- Name: expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expenses (
    id text NOT NULL,
    description text NOT NULL,
    amount numeric NOT NULL,
    account_id text,
    account_name text,
    date timestamp with time zone NOT NULL,
    category text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expense_account_id character varying(50),
    expense_account_name character varying(100),
    branch_id uuid
);


--
-- Name: manual_journal_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.manual_journal_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entry_number character varying(50) NOT NULL,
    entry_date date DEFAULT CURRENT_DATE NOT NULL,
    description text,
    notes text,
    status character varying(20) DEFAULT 'draft'::character varying,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: manual_journal_entry_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.manual_journal_entry_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    journal_entry_id uuid,
    account_id uuid,
    description text,
    debit numeric(15,2) DEFAULT 0,
    credit numeric(15,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: material_stock_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.material_stock_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    material_id uuid NOT NULL,
    material_name text NOT NULL,
    type text NOT NULL,
    reason text NOT NULL,
    quantity numeric NOT NULL,
    previous_stock numeric NOT NULL,
    new_stock numeric NOT NULL,
    notes text,
    reference_id text,
    reference_type text,
    user_id uuid NOT NULL,
    user_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id uuid,
    CONSTRAINT material_stock_movements_reason_check CHECK ((reason = ANY (ARRAY['PURCHASE'::text, 'PRODUCTION_CONSUMPTION'::text, 'PRODUCTION_ACQUISITION'::text, 'ADJUSTMENT'::text, 'RETURN'::text, 'PRODUCTION_ERROR'::text, 'PRODUCTION_DELETE_RESTORE'::text]))),
    CONSTRAINT material_stock_movements_type_check CHECK ((type = ANY (ARRAY['IN'::text, 'OUT'::text, 'ADJUSTMENT'::text]))),
    CONSTRAINT positive_quantity CHECK ((quantity > (0)::numeric))
);


--
-- Name: TABLE material_stock_movements; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.material_stock_movements IS 'History of all material stock movements and changes';


--
-- Name: COLUMN material_stock_movements.type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.material_stock_movements.type IS 'Type of movement: IN (stock bertambah), OUT (stock berkurang), ADJUSTMENT (penyesuaian)';


--
-- Name: COLUMN material_stock_movements.reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.material_stock_movements.reason IS 'Reason for movement: PURCHASE, PRODUCTION_CONSUMPTION, PRODUCTION_ACQUISITION, ADJUSTMENT, RETURN, PRODUCTION_ERROR, PRODUCTION_DELETE_RESTORE';


--
-- Name: COLUMN material_stock_movements.quantity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.material_stock_movements.quantity IS 'Quantity moved (always positive)';


--
-- Name: COLUMN material_stock_movements.previous_stock; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.material_stock_movements.previous_stock IS 'Stock before this movement';


--
-- Name: COLUMN material_stock_movements.new_stock; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.material_stock_movements.new_stock IS 'Stock after this movement';


--
-- Name: COLUMN material_stock_movements.reference_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.material_stock_movements.reference_id IS 'ID of related record (transaction, purchase order, etc)';


--
-- Name: COLUMN material_stock_movements.reference_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.material_stock_movements.reference_type IS 'Type of reference (transaction, purchase_order, etc)';


--
-- Name: materials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    unit text NOT NULL,
    price_per_unit numeric NOT NULL,
    stock numeric NOT NULL,
    min_stock numeric NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    type text DEFAULT 'Stock'::text,
    branch_id uuid,
    CONSTRAINT materials_type_check CHECK ((type = ANY (ARRAY['Stock'::text, 'Beli'::text])))
);


--
-- Name: COLUMN materials.type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materials.type IS 'Jenis bahan: Stock (produksi menurunkan stock), Beli (produksi menambah stock)';


--
-- Name: nishab_reference; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nishab_reference (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gold_price numeric(15,2),
    silver_price numeric(15,2),
    gold_nishab numeric(15,4) DEFAULT 85,
    silver_nishab numeric(15,4) DEFAULT 595,
    zakat_rate numeric(5,4) DEFAULT 0.025,
    effective_date date DEFAULT CURRENT_DATE,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    notes text
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    title text NOT NULL,
    message text,
    type text DEFAULT 'info'::text,
    is_read boolean DEFAULT false,
    link text,
    created_at timestamp with time zone DEFAULT now(),
    reference_type text,
    reference_id text,
    reference_url text,
    priority text DEFAULT 'normal'::text,
    read_at timestamp with time zone,
    expires_at timestamp with time zone
);


--
-- Name: payment_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transaction_id text NOT NULL,
    amount numeric NOT NULL,
    payment_date timestamp with time zone DEFAULT now() NOT NULL,
    remaining_amount numeric NOT NULL,
    payment_method text DEFAULT 'Tunai'::text,
    account_id text,
    account_name text,
    notes text,
    recorded_by uuid,
    recorded_by_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id uuid,
    CONSTRAINT payment_history_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT payment_history_remaining_amount_check CHECK ((remaining_amount >= (0)::numeric))
);


--
-- Name: payroll_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid,
    period_start date NOT NULL,
    period_end date NOT NULL,
    base_salary numeric(15,2) DEFAULT 0,
    total_commission numeric(15,2) DEFAULT 0,
    total_bonus numeric(15,2) DEFAULT 0,
    total_deductions numeric(15,2) DEFAULT 0,
    advance_deduction numeric(15,2) DEFAULT 0,
    net_salary numeric(15,2) DEFAULT 0,
    status text DEFAULT 'draft'::text,
    paid_date date,
    payment_method text,
    notes text,
    branch_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: payroll_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.payroll_summary AS
 SELECT pr.id,
    pr.employee_id,
    p.full_name AS employee_name,
    p.role AS employee_role,
    (EXTRACT(year FROM pr.period_start))::integer AS period_year,
    (EXTRACT(month FROM pr.period_start))::integer AS period_month,
    pr.base_salary,
    pr.total_commission,
    pr.total_bonus,
    pr.total_deductions,
    pr.advance_deduction,
    pr.net_salary,
    pr.status,
    pr.paid_date,
    pr.payment_method,
    pr.notes,
    pr.branch_id,
    pr.created_by,
    pr.created_at,
    pr.updated_at
   FROM (public.payroll_records pr
     LEFT JOIN public.profiles p ON ((pr.employee_id = p.id)));


--
-- Name: product_materials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_materials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    material_id uuid NOT NULL,
    quantity numeric(10,4) DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: production_errors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.production_errors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ref character varying(50) NOT NULL,
    material_id uuid NOT NULL,
    quantity numeric(10,2) NOT NULL,
    note text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT production_errors_quantity_check CHECK ((quantity > (0)::numeric))
);


--
-- Name: TABLE production_errors; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.production_errors IS 'Records of material errors/defects during production process';


--
-- Name: COLUMN production_errors.ref; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.production_errors.ref IS 'Unique reference code for the error record (e.g., ERR-250122-001)';


--
-- Name: COLUMN production_errors.material_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.production_errors.material_id IS 'Reference to the material that had errors';


--
-- Name: COLUMN production_errors.quantity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.production_errors.quantity IS 'Quantity of material that was defective/error';


--
-- Name: COLUMN production_errors.note; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.production_errors.note IS 'Description of the error or defect';


--
-- Name: COLUMN production_errors.created_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.production_errors.created_by IS 'User who recorded the error';


--
-- Name: production_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.production_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ref character varying(50) NOT NULL,
    product_id uuid,
    quantity numeric(10,2) DEFAULT 0 NOT NULL,
    note text,
    consume_bom boolean DEFAULT true NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    branch_id uuid,
    bom_snapshot jsonb,
    user_input_id uuid,
    user_input_name text,
    CONSTRAINT check_production_record_logic CHECK ((((product_id IS NULL) AND (quantity <= (0)::numeric)) OR ((product_id IS NOT NULL) AND (quantity >= (0)::numeric))))
);


--
-- Name: purchase_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_order_items (
    id text DEFAULT gen_random_uuid() NOT NULL,
    purchase_order_id text,
    material_id uuid,
    product_id uuid,
    item_type text DEFAULT 'material'::text,
    quantity numeric(15,2) DEFAULT 0,
    unit_price numeric(15,2) DEFAULT 0,
    quantity_received numeric(15,2) DEFAULT 0,
    is_taxable boolean DEFAULT false,
    tax_percentage numeric(5,2) DEFAULT 0,
    tax_amount numeric(15,2) DEFAULT 0,
    subtotal numeric(15,2) DEFAULT 0,
    total_with_tax numeric(15,2) DEFAULT 0,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    material_name text,
    product_name text,
    unit text
);


--
-- Name: purchase_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_orders (
    id text NOT NULL,
    material_id uuid,
    material_name text,
    quantity numeric,
    unit text,
    requested_by text,
    status text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    total_cost numeric,
    payment_account_id text,
    payment_date timestamp with time zone,
    unit_price numeric(10,2),
    supplier_name text,
    supplier_contact text,
    expected_delivery_date timestamp with time zone,
    supplier_id uuid,
    quoted_price numeric,
    expedition character varying(100),
    received_date timestamp with time zone,
    delivery_note_photo text,
    received_by text,
    received_quantity numeric,
    expedition_receiver text,
    branch_id uuid,
    po_number text,
    order_date date DEFAULT CURRENT_DATE,
    approved_at timestamp with time zone,
    approved_by text,
    include_ppn boolean DEFAULT false,
    ppn_amount numeric(15,2) DEFAULT 0
);


--
-- Name: quotations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quotations (
    id text NOT NULL,
    customer_id uuid,
    customer_name text,
    prepared_by text,
    items jsonb,
    total numeric,
    status text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    valid_until timestamp with time zone,
    transaction_id text,
    branch_id uuid,
    notes text
);


--
-- Name: retasi; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retasi (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    retasi_number text NOT NULL,
    truck_number text,
    driver_name text,
    helper_name text,
    departure_date date NOT NULL,
    departure_time time without time zone,
    route text,
    total_items integer DEFAULT 0,
    total_weight numeric(10,2),
    notes text,
    retasi_ke integer DEFAULT 1 NOT NULL,
    is_returned boolean DEFAULT false,
    returned_items_count integer DEFAULT 0,
    error_items_count integer DEFAULT 0,
    return_notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    barang_laku integer DEFAULT 0,
    branch_id uuid,
    driver_id uuid,
    helper_id uuid,
    date date DEFAULT CURRENT_DATE,
    status text DEFAULT 'open'::text
);


--
-- Name: COLUMN retasi.barang_laku; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.retasi.barang_laku IS 'Jumlah barang yang laku terjual dari retasi';


--
-- Name: retasi_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retasi_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    retasi_id uuid,
    product_id uuid,
    product_name text,
    quantity integer DEFAULT 0,
    weight numeric(10,2) DEFAULT 0,
    returned_qty integer DEFAULT 0,
    error_qty integer DEFAULT 0,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    customer_name text,
    amount numeric(15,2) DEFAULT 0,
    collected_amount numeric(15,2) DEFAULT 0,
    status text DEFAULT 'pending'::text
);


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role_id text NOT NULL,
    permissions jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    display_name text NOT NULL,
    description text,
    permissions jsonb DEFAULT '{}'::jsonb,
    is_system_role boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE roles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.roles IS 'Table untuk menyimpan role/jabatan yang bisa dikelola secara dinamis';


--
-- Name: COLUMN roles.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.roles.name IS 'Nama unik role (lowercase, untuk sistem)';


--
-- Name: COLUMN roles.display_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.roles.display_name IS 'Nama tampilan role (untuk UI)';


--
-- Name: COLUMN roles.permissions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.roles.permissions IS 'JSON object berisi permission untuk role ini';


--
-- Name: COLUMN roles.is_system_role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.roles.is_system_role IS 'Apakah ini system role yang tidak bisa dihapus';


--
-- Name: COLUMN roles.is_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.roles.is_active IS 'Status aktif role';


--
-- Name: stock_pricings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_pricings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    min_stock integer NOT NULL,
    max_stock integer,
    price numeric(15,2) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE stock_pricings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.stock_pricings IS 'Pricing rules based on product stock levels';


--
-- Name: COLUMN stock_pricings.min_stock; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stock_pricings.min_stock IS 'Minimum stock level for this pricing rule';


--
-- Name: COLUMN stock_pricings.max_stock; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stock_pricings.max_stock IS 'Maximum stock level for this pricing rule (NULL means no upper limit)';


--
-- Name: COLUMN stock_pricings.price; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stock_pricings.price IS 'Price to use when stock is within the range';


--
-- Name: supplier_materials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_materials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier_id uuid NOT NULL,
    material_id uuid NOT NULL,
    supplier_price numeric NOT NULL,
    unit character varying(20) NOT NULL,
    min_order_qty integer DEFAULT 1,
    lead_time_days integer DEFAULT 7,
    last_updated timestamp with time zone DEFAULT now(),
    notes text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT supplier_materials_supplier_price_check CHECK ((supplier_price > (0)::numeric))
);


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(20) NOT NULL,
    name character varying(100) NOT NULL,
    contact_person character varying(100),
    phone character varying(20),
    email character varying(100),
    address text,
    city character varying(50),
    postal_code character varying(10),
    payment_terms character varying(50) DEFAULT 'Cash'::character varying,
    tax_number character varying(50),
    bank_account character varying(100),
    bank_name character varying(50),
    notes text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    branch_id uuid
);


--
-- Name: transaction_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transaction_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transaction_id text NOT NULL,
    payment_date timestamp with time zone DEFAULT now() NOT NULL,
    amount numeric NOT NULL,
    payment_method text DEFAULT 'cash'::text,
    account_id text,
    account_name text NOT NULL,
    description text NOT NULL,
    notes text,
    reference_number text,
    paid_by_user_id uuid,
    paid_by_user_name text NOT NULL,
    paid_by_user_role text,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    status text DEFAULT 'active'::text,
    cancelled_at timestamp with time zone,
    cancelled_by uuid,
    cancelled_reason text,
    CONSTRAINT transaction_payments_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT transaction_payments_payment_method_check CHECK ((payment_method = ANY (ARRAY['cash'::text, 'bank_transfer'::text, 'check'::text, 'digital_wallet'::text]))),
    CONSTRAINT transaction_payments_status_check CHECK ((status = ANY (ARRAY['active'::text, 'cancelled'::text, 'deleted'::text])))
);


--
-- Name: transaction_detail_report; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.transaction_detail_report AS
 WITH payment_summary AS (
         SELECT tp.transaction_id,
            count(*) AS payment_count,
            sum(tp.amount) AS total_paid,
            min(tp.payment_date) AS first_payment_date,
            max(tp.payment_date) AS last_payment_date,
            array_agg(json_build_object('id', tp.id, 'payment_date', tp.payment_date, 'amount', tp.amount, 'payment_method', tp.payment_method, 'account_name', tp.account_name, 'description', tp.description, 'notes', tp.notes, 'reference_number', tp.reference_number, 'paid_by_user_name', tp.paid_by_user_name, 'paid_by_user_role', tp.paid_by_user_role, 'created_at', tp.created_at, 'status', tp.status) ORDER BY tp.payment_date DESC) AS payment_details
           FROM public.transaction_payments tp
          WHERE (tp.status = 'active'::text)
          GROUP BY tp.transaction_id
        )
 SELECT t.id AS transaction_id,
    t.created_at AS transaction_date,
    t.customer_name,
    COALESCE(c.phone, ''::text) AS customer_phone,
    COALESCE(c.address, ''::text) AS customer_address,
    ''::text AS transaction_description,
    ''::text AS transaction_notes,
    (t.total - t.paid_amount) AS subtotal,
    0 AS discount,
    0 AS ppn_amount,
    t.total AS transaction_total,
    t.paid_amount AS legacy_paid_amount,
    COALESCE(ps.payment_count, (0)::bigint) AS payment_count,
    COALESCE(ps.total_paid, (0)::numeric) AS total_paid,
    (t.total - COALESCE(ps.total_paid, (0)::numeric)) AS remaining_balance,
    ps.first_payment_date,
    ps.last_payment_date,
    public.calculate_transaction_payment_status(t.id) AS payment_status,
        CASE
            WHEN (public.calculate_transaction_payment_status(t.id) = 'unpaid'::text) THEN 'Belum Bayar'::text
            WHEN (public.calculate_transaction_payment_status(t.id) = 'partial'::text) THEN 'Bayar Partial'::text
            WHEN (public.calculate_transaction_payment_status(t.id) = 'paid'::text) THEN 'Lunas'::text
            ELSE 'Unknown'::text
        END AS payment_status_label,
    ps.payment_details,
    t.items AS transaction_items,
    t.cashier_name AS transaction_created_by,
    t.created_at AS transaction_created_at,
    t.created_at AS transaction_updated_at
   FROM ((public.transactions t
     LEFT JOIN payment_summary ps ON ((t.id = ps.transaction_id)))
     LEFT JOIN public.customers c ON ((t.customer_id = c.id)))
  ORDER BY t.created_at DESC;


--
-- Name: transactions_with_customer; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.transactions_with_customer AS
 SELECT t.id,
    t.customer_id,
    t.customer_name,
    t.cashier_id,
    t.cashier_name,
    t.designer_id,
    t.operator_id,
    t.payment_account_id,
    t.order_date,
    t.finish_date,
    t.items,
    t.total,
    t.paid_amount,
    t.payment_status,
    t.status,
    t.created_at,
    t.subtotal,
    t.ppn_enabled,
    t.ppn_percentage,
    t.ppn_amount,
    t.is_office_sale,
    t.due_date,
    t.ppn_mode,
    c.name AS customer_display_name,
    c.phone AS customer_phone,
    c.address AS customer_address,
    p.full_name AS cashier_display_name
   FROM ((public.transactions t
     LEFT JOIN public.customers c ON ((t.customer_id = c.id)))
     LEFT JOIN public.profiles p ON ((t.cashier_id = p.id)));


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    role_id uuid,
    assigned_at timestamp with time zone DEFAULT now(),
    assigned_by uuid
);


--
-- Name: zakat_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zakat_records (
    id text NOT NULL,
    type text NOT NULL,
    category text DEFAULT 'zakat'::text NOT NULL,
    title text NOT NULL,
    description text,
    recipient text,
    recipient_type text,
    amount numeric(15,2) DEFAULT 0 NOT NULL,
    nishab_amount numeric(15,2),
    percentage_rate numeric(5,2) DEFAULT 2.5,
    payment_date date DEFAULT CURRENT_DATE NOT NULL,
    payment_account_id uuid,
    payment_method text,
    status text DEFAULT 'pending'::text,
    cash_history_id uuid,
    receipt_number text,
    calculation_basis text,
    calculation_notes text,
    is_anonymous boolean DEFAULT false,
    notes text,
    attachment_url text,
    hijri_year text,
    hijri_month text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: accounts accounts_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_code_unique UNIQUE (code);


--
-- Name: accounts_payable accounts_payable_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts_payable
    ADD CONSTRAINT accounts_payable_pkey PRIMARY KEY (id);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: advance_repayments advance_repayments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_repayments
    ADD CONSTRAINT advance_repayments_pkey PRIMARY KEY (id);


--
-- Name: asset_maintenance asset_maintenance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_maintenance
    ADD CONSTRAINT asset_maintenance_pkey PRIMARY KEY (id);


--
-- Name: assets assets_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_code_key UNIQUE (code);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: attendance attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);


--
-- Name: balance_adjustments balance_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_adjustments
    ADD CONSTRAINT balance_adjustments_pkey PRIMARY KEY (id);


--
-- Name: bonus_pricings bonus_pricings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bonus_pricings
    ADD CONSTRAINT bonus_pricings_pkey PRIMARY KEY (id);


--
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


--
-- Name: cash_history cash_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_history
    ADD CONSTRAINT cash_history_pkey PRIMARY KEY (id);


--
-- Name: commission_entries commission_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_entries
    ADD CONSTRAINT commission_entries_pkey PRIMARY KEY (id);


--
-- Name: commission_rules commission_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_rules
    ADD CONSTRAINT commission_rules_pkey PRIMARY KEY (id);


--
-- Name: commission_rules commission_rules_product_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_rules
    ADD CONSTRAINT commission_rules_product_id_role_key UNIQUE (product_id, role);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: company_settings company_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_settings
    ADD CONSTRAINT company_settings_pkey PRIMARY KEY (key);


--
-- Name: customer_pricings customer_pricings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_pricings
    ADD CONSTRAINT customer_pricings_pkey PRIMARY KEY (id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: deliveries deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_pkey PRIMARY KEY (id);


--
-- Name: deliveries deliveries_transaction_delivery_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_transaction_delivery_number_key UNIQUE (transaction_id, delivery_number);


--
-- Name: delivery_items delivery_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_items
    ADD CONSTRAINT delivery_items_pkey PRIMARY KEY (id);


--
-- Name: delivery_photos delivery_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_photos
    ADD CONSTRAINT delivery_photos_pkey PRIMARY KEY (id);


--
-- Name: employee_advances employee_advances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_advances
    ADD CONSTRAINT employee_advances_pkey PRIMARY KEY (id);


--
-- Name: employee_salaries employee_salaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_salaries
    ADD CONSTRAINT employee_salaries_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: manual_journal_entries manual_journal_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manual_journal_entries
    ADD CONSTRAINT manual_journal_entries_pkey PRIMARY KEY (id);


--
-- Name: manual_journal_entry_lines manual_journal_entry_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manual_journal_entry_lines
    ADD CONSTRAINT manual_journal_entry_lines_pkey PRIMARY KEY (id);


--
-- Name: material_stock_movements material_stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_stock_movements
    ADD CONSTRAINT material_stock_movements_pkey PRIMARY KEY (id);


--
-- Name: materials materials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials
    ADD CONSTRAINT materials_pkey PRIMARY KEY (id);


--
-- Name: nishab_reference nishab_reference_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nishab_reference
    ADD CONSTRAINT nishab_reference_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: payment_history payment_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_history
    ADD CONSTRAINT payment_history_pkey PRIMARY KEY (id);


--
-- Name: payroll_records payroll_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_records
    ADD CONSTRAINT payroll_records_pkey PRIMARY KEY (id);


--
-- Name: product_materials product_materials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_materials
    ADD CONSTRAINT product_materials_pkey PRIMARY KEY (id);


--
-- Name: product_materials product_materials_product_id_material_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_materials
    ADD CONSTRAINT product_materials_product_id_material_id_key UNIQUE (product_id, material_id);


--
-- Name: production_errors production_errors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_errors
    ADD CONSTRAINT production_errors_pkey PRIMARY KEY (id);


--
-- Name: production_errors production_errors_ref_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_errors
    ADD CONSTRAINT production_errors_ref_key UNIQUE (ref);


--
-- Name: production_records production_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_records
    ADD CONSTRAINT production_records_pkey PRIMARY KEY (id);


--
-- Name: production_records production_records_ref_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_records
    ADD CONSTRAINT production_records_ref_key UNIQUE (ref);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_email_key UNIQUE (email);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: purchase_order_items purchase_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_pkey PRIMARY KEY (id);


--
-- Name: purchase_orders purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);


--
-- Name: quotations quotations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_pkey PRIMARY KEY (id);


--
-- Name: retasi_items retasi_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retasi_items
    ADD CONSTRAINT retasi_items_pkey PRIMARY KEY (id);


--
-- Name: retasi retasi_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retasi
    ADD CONSTRAINT retasi_pkey PRIMARY KEY (id);


--
-- Name: retasi retasi_retasi_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retasi
    ADD CONSTRAINT retasi_retasi_number_key UNIQUE (retasi_number);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (id);


--
-- Name: roles roles_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_name_key UNIQUE (name);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: stock_pricings stock_pricings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_pricings
    ADD CONSTRAINT stock_pricings_pkey PRIMARY KEY (id);


--
-- Name: supplier_materials supplier_materials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_materials
    ADD CONSTRAINT supplier_materials_pkey PRIMARY KEY (id);


--
-- Name: supplier_materials supplier_materials_supplier_id_material_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_materials
    ADD CONSTRAINT supplier_materials_supplier_id_material_id_key UNIQUE (supplier_id, material_id);


--
-- Name: suppliers suppliers_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_code_key UNIQUE (code);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: transaction_payments transaction_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_payments
    ADD CONSTRAINT transaction_payments_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_id_key UNIQUE (user_id, role_id);


--
-- Name: zakat_records zakat_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zakat_records
    ADD CONSTRAINT zakat_records_pkey PRIMARY KEY (id);


--
-- Name: idx_accounts_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accounts_code ON public.accounts USING btree (code);


--
-- Name: idx_accounts_is_payment_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accounts_is_payment_account ON public.accounts USING btree (is_payment_account);


--
-- Name: idx_accounts_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accounts_level ON public.accounts USING btree (level);


--
-- Name: idx_accounts_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accounts_parent ON public.accounts USING btree (parent_id);


--
-- Name: idx_accounts_payable_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accounts_payable_created_at ON public.accounts_payable USING btree (created_at);


--
-- Name: idx_accounts_payable_po_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accounts_payable_po_id ON public.accounts_payable USING btree (purchase_order_id);


--
-- Name: idx_accounts_payable_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accounts_payable_status ON public.accounts_payable USING btree (status);


--
-- Name: idx_accounts_sort_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accounts_sort_order ON public.accounts USING btree (sort_order);


--
-- Name: idx_accounts_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accounts_type ON public.accounts USING btree (type);


--
-- Name: idx_balance_adjustments_account_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_balance_adjustments_account_id ON public.balance_adjustments USING btree (account_id);


--
-- Name: idx_balance_adjustments_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_balance_adjustments_created_at ON public.balance_adjustments USING btree (created_at);


--
-- Name: idx_balance_adjustments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_balance_adjustments_status ON public.balance_adjustments USING btree (status);


--
-- Name: idx_bonus_pricings_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bonus_pricings_active ON public.bonus_pricings USING btree (is_active);


--
-- Name: idx_bonus_pricings_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bonus_pricings_product_id ON public.bonus_pricings USING btree (product_id);


--
-- Name: idx_bonus_pricings_qty_range; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bonus_pricings_qty_range ON public.bonus_pricings USING btree (min_quantity, max_quantity);


--
-- Name: idx_cash_history_account_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cash_history_account_id ON public.cash_history USING btree (account_id);


--
-- Name: idx_cash_history_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cash_history_created_at ON public.cash_history USING btree (created_at);


--
-- Name: idx_cash_history_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cash_history_type ON public.cash_history USING btree (transaction_type);


--
-- Name: idx_commission_entries_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commission_entries_date ON public.commission_entries USING btree (created_at);


--
-- Name: idx_commission_entries_delivery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commission_entries_delivery ON public.commission_entries USING btree (delivery_id);


--
-- Name: idx_commission_entries_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commission_entries_role ON public.commission_entries USING btree (role);


--
-- Name: idx_commission_entries_transaction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commission_entries_transaction ON public.commission_entries USING btree (transaction_id);


--
-- Name: idx_commission_entries_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commission_entries_user ON public.commission_entries USING btree (user_id);


--
-- Name: idx_commission_rules_product_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commission_rules_product_role ON public.commission_rules USING btree (product_id, role);


--
-- Name: idx_customers_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_created_at ON public.customers USING btree ("createdAt");


--
-- Name: idx_customers_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_name ON public.customers USING btree (name);


--
-- Name: idx_daily_stats_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_stats_date ON public.daily_stats USING btree (date);


--
-- Name: idx_deliveries_delivery_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deliveries_delivery_date ON public.deliveries USING btree (delivery_date);


--
-- Name: idx_deliveries_transaction_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deliveries_transaction_id ON public.deliveries USING btree (transaction_id);


--
-- Name: idx_delivery_items_delivery_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_items_delivery_id ON public.delivery_items USING btree (delivery_id);


--
-- Name: idx_delivery_items_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_items_product_id ON public.delivery_items USING btree (product_id);


--
-- Name: idx_employee_salaries_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_salaries_active ON public.employee_salaries USING btree (employee_id, is_active) WHERE (is_active = true);


--
-- Name: idx_employee_salaries_effective_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_salaries_effective_period ON public.employee_salaries USING btree (effective_from, effective_until);


--
-- Name: idx_employee_salaries_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_salaries_employee_id ON public.employee_salaries USING btree (employee_id);


--
-- Name: idx_material_stock_movements_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_material_stock_movements_created_at ON public.material_stock_movements USING btree (created_at DESC);


--
-- Name: idx_material_stock_movements_material; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_material_stock_movements_material ON public.material_stock_movements USING btree (material_id);


--
-- Name: idx_material_stock_movements_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_material_stock_movements_reference ON public.material_stock_movements USING btree (reference_id, reference_type);


--
-- Name: idx_material_stock_movements_type_reason; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_material_stock_movements_type_reason ON public.material_stock_movements USING btree (type, reason);


--
-- Name: idx_material_stock_movements_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_material_stock_movements_user ON public.material_stock_movements USING btree (user_id);


--
-- Name: idx_materials_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_materials_name ON public.materials USING btree (name);


--
-- Name: idx_materials_stock; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_materials_stock ON public.materials USING btree (stock);


--
-- Name: idx_payment_history_payment_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_history_payment_date ON public.payment_history USING btree (payment_date);


--
-- Name: idx_payment_history_transaction_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_history_transaction_id ON public.payment_history USING btree (transaction_id);


--
-- Name: idx_product_materials_material_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_materials_material_id ON public.product_materials USING btree (material_id);


--
-- Name: idx_product_materials_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_materials_product_id ON public.product_materials USING btree (product_id);


--
-- Name: idx_production_errors_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_production_errors_created_at ON public.production_errors USING btree (created_at);


--
-- Name: idx_production_errors_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_production_errors_created_by ON public.production_errors USING btree (created_by);


--
-- Name: idx_production_errors_material_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_production_errors_material_id ON public.production_errors USING btree (material_id);


--
-- Name: idx_production_errors_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_production_errors_ref ON public.production_errors USING btree (ref);


--
-- Name: idx_production_records_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_production_records_created_at ON public.production_records USING btree (created_at);


--
-- Name: idx_production_records_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_production_records_created_by ON public.production_records USING btree (created_by);


--
-- Name: idx_production_records_error_entries; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_production_records_error_entries ON public.production_records USING btree (created_at) WHERE (product_id IS NULL);


--
-- Name: idx_production_records_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_production_records_product_id ON public.production_records USING btree (product_id);


--
-- Name: idx_production_records_product_id_nullable; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_production_records_product_id_nullable ON public.production_records USING btree (product_id) WHERE (product_id IS NOT NULL);


--
-- Name: idx_products_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_name ON public.products USING btree (name);


--
-- Name: idx_profiles_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_email ON public.profiles USING btree (email);


--
-- Name: idx_profiles_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_role ON public.profiles USING btree (role);


--
-- Name: idx_purchase_orders_expected_delivery_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_orders_expected_delivery_date ON public.purchase_orders USING btree (expected_delivery_date);


--
-- Name: idx_purchase_orders_expedition; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_orders_expedition ON public.purchase_orders USING btree (expedition);


--
-- Name: idx_purchase_orders_supplier_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_orders_supplier_name ON public.purchase_orders USING btree (supplier_name);


--
-- Name: idx_retasi_departure_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retasi_departure_date ON public.retasi USING btree (departure_date);


--
-- Name: idx_retasi_driver_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retasi_driver_date ON public.retasi USING btree (driver_name, departure_date);


--
-- Name: idx_retasi_returned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retasi_returned ON public.retasi USING btree (is_returned);


--
-- Name: idx_roles_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roles_active ON public.roles USING btree (is_active);


--
-- Name: idx_roles_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roles_name ON public.roles USING btree (name);


--
-- Name: idx_stock_pricings_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_pricings_active ON public.stock_pricings USING btree (is_active);


--
-- Name: idx_stock_pricings_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_pricings_product_id ON public.stock_pricings USING btree (product_id);


--
-- Name: idx_stock_pricings_stock_range; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_pricings_stock_range ON public.stock_pricings USING btree (min_stock, max_stock);


--
-- Name: idx_supplier_materials_material_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_materials_material_id ON public.supplier_materials USING btree (material_id);


--
-- Name: idx_supplier_materials_supplier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_materials_supplier_id ON public.supplier_materials USING btree (supplier_id);


--
-- Name: idx_suppliers_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_code ON public.suppliers USING btree (code);


--
-- Name: idx_suppliers_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_is_active ON public.suppliers USING btree (is_active);


--
-- Name: idx_suppliers_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_name ON public.suppliers USING btree (name);


--
-- Name: idx_transaction_payments_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transaction_payments_date ON public.transaction_payments USING btree (payment_date);


--
-- Name: idx_transaction_payments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transaction_payments_status ON public.transaction_payments USING btree (status);


--
-- Name: idx_transaction_payments_transaction_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transaction_payments_transaction_id ON public.transaction_payments USING btree (transaction_id);


--
-- Name: idx_transactions_cashier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_cashier_id ON public.transactions USING btree (cashier_id);


--
-- Name: idx_transactions_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_customer_id ON public.transactions USING btree (customer_id);


--
-- Name: idx_transactions_delivery_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_delivery_status ON public.transactions USING btree (status, is_office_sale) WHERE (status = ANY (ARRAY['Siap Antar'::text, 'Diantar Sebagian'::text]));


--
-- Name: idx_transactions_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_due_date ON public.transactions USING btree (due_date);


--
-- Name: idx_transactions_is_office_sale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_is_office_sale ON public.transactions USING btree (is_office_sale);


--
-- Name: idx_transactions_order_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_order_date ON public.transactions USING btree (order_date);


--
-- Name: idx_transactions_payment_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_payment_status ON public.transactions USING btree (payment_status);


--
-- Name: idx_transactions_ppn_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_ppn_enabled ON public.transactions USING btree (ppn_enabled);


--
-- Name: idx_transactions_retasi_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_retasi_id ON public.transactions USING btree (retasi_id);


--
-- Name: idx_transactions_retasi_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_retasi_number ON public.transactions USING btree (retasi_number);


--
-- Name: idx_transactions_sales_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_sales_id ON public.transactions USING btree (sales_id);


--
-- Name: idx_transactions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_status ON public.transactions USING btree (status);


--
-- Name: role_permissions_role_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX role_permissions_role_id_idx ON public.role_permissions USING btree (role_id);


--
-- Name: accounts accounts_auto_fill; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER accounts_auto_fill BEFORE INSERT ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.auto_fill_account_type();


--
-- Name: accounts accounts_auto_fill_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER accounts_auto_fill_update BEFORE UPDATE ON public.accounts FOR EACH ROW WHEN ((old.parent_id IS DISTINCT FROM new.parent_id)) EXECUTE FUNCTION public.auto_fill_account_type();


--
-- Name: attendance attendance_before_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER attendance_before_insert BEFORE INSERT ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.sync_attendance_user_id();


--
-- Name: attendance attendance_sync_checkin; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER attendance_sync_checkin BEFORE INSERT OR UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.sync_attendance_checkin();


--
-- Name: attendance attendance_sync_ids; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER attendance_sync_ids BEFORE INSERT OR UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.sync_attendance_ids();


--
-- Name: profiles audit_profiles_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_profiles_trigger AFTER INSERT OR DELETE OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.audit_profiles_changes();

ALTER TABLE public.profiles DISABLE TRIGGER audit_profiles_trigger;


--
-- Name: transactions audit_transactions_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_transactions_trigger AFTER INSERT OR DELETE OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.audit_transactions_changes();


--
-- Name: delivery_items delivery_items_status_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER delivery_items_status_trigger AFTER INSERT OR DELETE OR UPDATE ON public.delivery_items FOR EACH ROW EXECUTE FUNCTION public.update_transaction_delivery_status();


--
-- Name: transactions on_receivable_payment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_receivable_payment AFTER UPDATE OF paid_amount ON public.transactions FOR EACH ROW WHEN ((new.paid_amount IS DISTINCT FROM old.paid_amount)) EXECUTE FUNCTION public.record_payment_history();


--
-- Name: deliveries set_delivery_number_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_delivery_number_trigger BEFORE INSERT ON public.deliveries FOR EACH ROW EXECUTE FUNCTION public.generate_delivery_number();


--
-- Name: transactions transaction_status_validation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER transaction_status_validation BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.validate_transaction_status_transition();


--
-- Name: commission_entries trigger_calculate_commission_amount; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_calculate_commission_amount BEFORE INSERT OR UPDATE ON public.commission_entries FOR EACH ROW EXECUTE FUNCTION public.calculate_commission_amount();


--
-- Name: cash_history trigger_notify_cash_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_notify_cash_history AFTER INSERT ON public.cash_history FOR EACH ROW EXECUTE FUNCTION public.notify_debt_payment();


--
-- Name: cash_history trigger_notify_payroll; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_notify_payroll AFTER INSERT ON public.cash_history FOR EACH ROW EXECUTE FUNCTION public.notify_payroll_processed();


--
-- Name: production_records trigger_notify_production; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_notify_production AFTER INSERT OR UPDATE ON public.production_records FOR EACH ROW EXECUTE FUNCTION public.notify_production_completed();


--
-- Name: purchase_orders trigger_notify_purchase_order; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_notify_purchase_order AFTER INSERT ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.notify_purchase_order_created();


--
-- Name: commission_rules trigger_populate_commission_product_info; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_populate_commission_product_info BEFORE INSERT OR UPDATE ON public.commission_rules FOR EACH ROW EXECUTE FUNCTION public.populate_commission_product_info();


--
-- Name: retasi trigger_set_retasi_ke_and_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_set_retasi_ke_and_number BEFORE INSERT ON public.retasi FOR EACH ROW EXECUTE FUNCTION public.set_retasi_ke_and_number();


--
-- Name: suppliers trigger_set_supplier_code; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_set_supplier_code BEFORE INSERT OR UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.set_supplier_code();


--
-- Name: transactions trigger_update_payment_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_payment_status BEFORE INSERT OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.update_payment_status();


--
-- Name: accounts update_accounts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: bonus_pricings update_bonus_pricings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_bonus_pricings_updated_at BEFORE UPDATE ON public.bonus_pricings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: cash_history update_cash_history_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_cash_history_updated_at BEFORE UPDATE ON public.cash_history FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: employee_salaries update_employee_salaries_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_employee_salaries_updated_at BEFORE UPDATE ON public.employee_salaries FOR EACH ROW EXECUTE FUNCTION public.update_payroll_updated_at();


--
-- Name: product_materials update_product_materials_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_product_materials_updated_at BEFORE UPDATE ON public.product_materials FOR EACH ROW EXECUTE FUNCTION public.update_product_materials_updated_at();


--
-- Name: production_records update_production_records_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_production_records_updated_at BEFORE UPDATE ON public.production_records FOR EACH ROW EXECUTE FUNCTION public.update_production_records_updated_at();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_profiles_updated_at();


--
-- Name: retasi update_retasi_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_retasi_updated_at BEFORE UPDATE ON public.retasi FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: roles update_roles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: stock_pricings update_stock_pricings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_stock_pricings_updated_at BEFORE UPDATE ON public.stock_pricings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: accounts accounts_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: accounts accounts_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_parent_fk FOREIGN KEY (parent_id) REFERENCES public.accounts(id) ON DELETE RESTRICT;


--
-- Name: accounts_payable accounts_payable_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts_payable
    ADD CONSTRAINT accounts_payable_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: accounts_payable accounts_payable_payment_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts_payable
    ADD CONSTRAINT accounts_payable_payment_account_id_fkey FOREIGN KEY (payment_account_id) REFERENCES public.accounts(id);


--
-- Name: advance_repayments advance_repayments_advance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_repayments
    ADD CONSTRAINT advance_repayments_advance_id_fkey FOREIGN KEY (advance_id) REFERENCES public.employee_advances(id) ON DELETE CASCADE;


--
-- Name: asset_maintenance asset_maintenance_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_maintenance
    ADD CONSTRAINT asset_maintenance_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id);


--
-- Name: asset_maintenance asset_maintenance_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_maintenance
    ADD CONSTRAINT asset_maintenance_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: asset_maintenance asset_maintenance_completed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_maintenance
    ADD CONSTRAINT asset_maintenance_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.profiles(id);


--
-- Name: asset_maintenance asset_maintenance_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_maintenance
    ADD CONSTRAINT asset_maintenance_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: asset_maintenance asset_maintenance_payment_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_maintenance
    ADD CONSTRAINT asset_maintenance_payment_account_id_fkey FOREIGN KEY (payment_account_id) REFERENCES public.accounts(id);


--
-- Name: assets assets_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: assets assets_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: assets assets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: attendance attendance_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: attendance attendance_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.profiles(id);


--
-- Name: attendance attendance_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: balance_adjustments balance_adjustments_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_adjustments
    ADD CONSTRAINT balance_adjustments_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: balance_adjustments balance_adjustments_adjusted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_adjustments
    ADD CONSTRAINT balance_adjustments_adjusted_by_fkey FOREIGN KEY (adjusted_by) REFERENCES public.profiles(id);


--
-- Name: balance_adjustments balance_adjustments_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_adjustments
    ADD CONSTRAINT balance_adjustments_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id);


--
-- Name: bonus_pricings bonus_pricings_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bonus_pricings
    ADD CONSTRAINT bonus_pricings_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: branches branches_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: branches branches_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES public.profiles(id);


--
-- Name: cash_history cash_history_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_history
    ADD CONSTRAINT cash_history_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: cash_history cash_history_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_history
    ADD CONSTRAINT cash_history_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: cash_history cash_history_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_history
    ADD CONSTRAINT cash_history_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: commission_entries commission_entries_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_entries
    ADD CONSTRAINT commission_entries_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: customer_pricings customer_pricings_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_pricings
    ADD CONSTRAINT customer_pricings_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: customer_pricings customer_pricings_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_pricings
    ADD CONSTRAINT customer_pricings_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: customer_pricings customer_pricings_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_pricings
    ADD CONSTRAINT customer_pricings_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: customers customers_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: deliveries deliveries_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: deliveries deliveries_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.profiles(id);


--
-- Name: deliveries deliveries_helper_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_helper_id_fkey FOREIGN KEY (helper_id) REFERENCES public.profiles(id);


--
-- Name: deliveries deliveries_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE;


--
-- Name: delivery_items delivery_items_delivery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_items
    ADD CONSTRAINT delivery_items_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES public.deliveries(id) ON DELETE CASCADE;


--
-- Name: delivery_items delivery_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_items
    ADD CONSTRAINT delivery_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: delivery_photos delivery_photos_delivery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_photos
    ADD CONSTRAINT delivery_photos_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES public.deliveries(id);


--
-- Name: employee_advances employee_advances_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_advances
    ADD CONSTRAINT employee_advances_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: employee_advances employee_advances_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_advances
    ADD CONSTRAINT employee_advances_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id);


--
-- Name: employee_advances employee_advances_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_advances
    ADD CONSTRAINT employee_advances_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: employee_advances employee_advances_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_advances
    ADD CONSTRAINT employee_advances_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.profiles(id);


--
-- Name: employee_salaries employee_salaries_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_salaries
    ADD CONSTRAINT employee_salaries_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: employee_salaries employee_salaries_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_salaries
    ADD CONSTRAINT employee_salaries_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: expenses expenses_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: expenses expenses_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: expenses fk_expenses_expense_account; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT fk_expenses_expense_account FOREIGN KEY (expense_account_id) REFERENCES public.accounts(id);


--
-- Name: material_stock_movements fk_material_stock_movement_material; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_stock_movements
    ADD CONSTRAINT fk_material_stock_movement_material FOREIGN KEY (material_id) REFERENCES public.materials(id) ON DELETE CASCADE;


--
-- Name: material_stock_movements fk_material_stock_movement_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_stock_movements
    ADD CONSTRAINT fk_material_stock_movement_user FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: manual_journal_entry_lines manual_journal_entry_lines_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manual_journal_entry_lines
    ADD CONSTRAINT manual_journal_entry_lines_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.manual_journal_entries(id) ON DELETE CASCADE;


--
-- Name: material_stock_movements material_stock_movements_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_stock_movements
    ADD CONSTRAINT material_stock_movements_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: materials materials_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials
    ADD CONSTRAINT materials_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: nishab_reference nishab_reference_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nishab_reference
    ADD CONSTRAINT nishab_reference_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: payment_history payment_history_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_history
    ADD CONSTRAINT payment_history_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: payment_history payment_history_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_history
    ADD CONSTRAINT payment_history_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: payment_history payment_history_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_history
    ADD CONSTRAINT payment_history_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.profiles(id);


--
-- Name: payment_history payment_history_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_history
    ADD CONSTRAINT payment_history_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE;


--
-- Name: payroll_records payroll_records_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_records
    ADD CONSTRAINT payroll_records_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: payroll_records payroll_records_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_records
    ADD CONSTRAINT payroll_records_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: payroll_records payroll_records_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_records
    ADD CONSTRAINT payroll_records_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.profiles(id);


--
-- Name: product_materials product_materials_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_materials
    ADD CONSTRAINT product_materials_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.materials(id) ON DELETE CASCADE;


--
-- Name: product_materials product_materials_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_materials
    ADD CONSTRAINT product_materials_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: production_errors production_errors_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_errors
    ADD CONSTRAINT production_errors_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: production_errors production_errors_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_errors
    ADD CONSTRAINT production_errors_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.materials(id) ON DELETE CASCADE;


--
-- Name: production_records production_records_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_records
    ADD CONSTRAINT production_records_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: production_records production_records_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_records
    ADD CONSTRAINT production_records_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: production_records production_records_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_records
    ADD CONSTRAINT production_records_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: products products_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: profiles profiles_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: purchase_order_items purchase_order_items_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.materials(id);


--
-- Name: purchase_order_items purchase_order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: purchase_order_items purchase_order_items_purchase_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE;


--
-- Name: purchase_orders purchase_orders_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: purchase_orders purchase_orders_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.materials(id);


--
-- Name: purchase_orders purchase_orders_payment_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_payment_account_id_fkey FOREIGN KEY (payment_account_id) REFERENCES public.accounts(id);


--
-- Name: purchase_orders purchase_orders_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: quotations quotations_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: quotations quotations_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: retasi retasi_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retasi
    ADD CONSTRAINT retasi_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: retasi retasi_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retasi
    ADD CONSTRAINT retasi_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.profiles(id);


--
-- Name: retasi retasi_helper_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retasi
    ADD CONSTRAINT retasi_helper_id_fkey FOREIGN KEY (helper_id) REFERENCES public.profiles(id);


--
-- Name: retasi_items retasi_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retasi_items
    ADD CONSTRAINT retasi_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: retasi_items retasi_items_retasi_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retasi_items
    ADD CONSTRAINT retasi_items_retasi_id_fkey FOREIGN KEY (retasi_id) REFERENCES public.retasi(id) ON DELETE CASCADE;


--
-- Name: stock_pricings stock_pricings_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_pricings
    ADD CONSTRAINT stock_pricings_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: supplier_materials supplier_materials_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_materials
    ADD CONSTRAINT supplier_materials_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.materials(id) ON DELETE CASCADE;


--
-- Name: supplier_materials supplier_materials_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_materials
    ADD CONSTRAINT supplier_materials_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;


--
-- Name: suppliers suppliers_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: transaction_payments transaction_payments_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_payments
    ADD CONSTRAINT transaction_payments_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: transaction_payments transaction_payments_cancelled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_payments
    ADD CONSTRAINT transaction_payments_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES public.profiles(id);


--
-- Name: transaction_payments transaction_payments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_payments
    ADD CONSTRAINT transaction_payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: transaction_payments transaction_payments_paid_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_payments
    ADD CONSTRAINT transaction_payments_paid_by_user_id_fkey FOREIGN KEY (paid_by_user_id) REFERENCES public.profiles(id);


--
-- Name: transaction_payments transaction_payments_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_payments
    ADD CONSTRAINT transaction_payments_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE;


--
-- Name: transactions transactions_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: transactions transactions_cashier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_cashier_id_fkey FOREIGN KEY (cashier_id) REFERENCES public.profiles(id);


--
-- Name: transactions transactions_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: transactions transactions_designer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_designer_id_fkey FOREIGN KEY (designer_id) REFERENCES public.profiles(id);


--
-- Name: transactions transactions_operator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_operator_id_fkey FOREIGN KEY (operator_id) REFERENCES public.profiles(id);


--
-- Name: transactions transactions_payment_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_payment_account_id_fkey FOREIGN KEY (payment_account_id) REFERENCES public.accounts(id);


--
-- Name: transactions transactions_retasi_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_retasi_id_fkey FOREIGN KEY (retasi_id) REFERENCES public.retasi(id) ON DELETE SET NULL;


--
-- Name: transactions transactions_sales_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_sales_id_fkey FOREIGN KEY (sales_id) REFERENCES public.profiles(id);


--
-- Name: user_roles user_roles_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.profiles(id);


--
-- Name: user_roles user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id);


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: accounts_payable Allow all for accounts_payable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for accounts_payable" ON public.accounts_payable USING (true) WITH CHECK (true);


--
-- Name: zakat_records Allow all for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for authenticated users" ON public.zakat_records USING (true) WITH CHECK (true);


--
-- Name: nishab_reference Allow all for nishab_reference; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for nishab_reference" ON public.nishab_reference USING (true) WITH CHECK (true);


--
-- Name: accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: accounts accounts_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounts_delete ON public.accounts FOR DELETE USING (true);


--
-- Name: accounts accounts_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounts_insert ON public.accounts FOR INSERT WITH CHECK (true);


--
-- Name: accounts_payable; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;

--
-- Name: accounts accounts_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounts_select ON public.accounts FOR SELECT USING (true);


--
-- Name: accounts accounts_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounts_update ON public.accounts FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: advance_repayments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.advance_repayments ENABLE ROW LEVEL SECURITY;

--
-- Name: asset_maintenance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.asset_maintenance ENABLE ROW LEVEL SECURITY;

--
-- Name: asset_maintenance asset_maintenance_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY asset_maintenance_delete ON public.asset_maintenance FOR DELETE USING (true);


--
-- Name: asset_maintenance asset_maintenance_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY asset_maintenance_insert ON public.asset_maintenance FOR INSERT WITH CHECK (true);


--
-- Name: asset_maintenance asset_maintenance_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY asset_maintenance_select ON public.asset_maintenance FOR SELECT USING (true);


--
-- Name: asset_maintenance asset_maintenance_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY asset_maintenance_update ON public.asset_maintenance FOR UPDATE USING (true);


--
-- Name: assets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

--
-- Name: assets assets_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assets_delete ON public.assets FOR DELETE USING (true);


--
-- Name: assets assets_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assets_insert ON public.assets FOR INSERT WITH CHECK (true);


--
-- Name: assets assets_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assets_select ON public.assets FOR SELECT USING (true);


--
-- Name: assets assets_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assets_update ON public.assets FOR UPDATE USING (true);


--
-- Name: attendance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance attendance_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_delete ON public.attendance FOR DELETE USING (true);


--
-- Name: attendance attendance_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_insert ON public.attendance FOR INSERT WITH CHECK (true);


--
-- Name: attendance attendance_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_select ON public.attendance FOR SELECT USING (true);


--
-- Name: attendance attendance_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_update ON public.attendance FOR UPDATE USING (true);


--
-- Name: balance_adjustments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.balance_adjustments ENABLE ROW LEVEL SECURITY;

--
-- Name: bonus_pricings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bonus_pricings ENABLE ROW LEVEL SECURITY;

--
-- Name: branches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

--
-- Name: branches branches_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branches_delete ON public.branches FOR DELETE USING (true);


--
-- Name: branches branches_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branches_insert ON public.branches FOR INSERT WITH CHECK (true);


--
-- Name: branches branches_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branches_manage ON public.branches USING (public.has_perm('role_management'::text));


--
-- Name: branches branches_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branches_select ON public.branches FOR SELECT USING (true);


--
-- Name: branches branches_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branches_update ON public.branches FOR UPDATE USING (true);


--
-- Name: cash_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cash_history ENABLE ROW LEVEL SECURITY;

--
-- Name: commission_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.commission_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: commission_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: companies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

--
-- Name: companies companies_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY companies_manage ON public.companies USING (public.has_perm('role_management'::text));


--
-- Name: companies companies_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY companies_select ON public.companies FOR SELECT USING (true);


--
-- Name: company_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: company_settings company_settings_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_settings_delete ON public.company_settings FOR DELETE USING (public.has_perm('settings_access'::text));


--
-- Name: company_settings company_settings_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_settings_insert ON public.company_settings FOR INSERT WITH CHECK (true);


--
-- Name: company_settings company_settings_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_settings_select ON public.company_settings FOR SELECT USING (true);


--
-- Name: company_settings company_settings_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_settings_update ON public.company_settings FOR UPDATE USING (true);


--
-- Name: customer_pricings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_pricings ENABLE ROW LEVEL SECURITY;

--
-- Name: customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

--
-- Name: customers customers_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_delete ON public.customers FOR DELETE USING (true);


--
-- Name: customers customers_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_insert ON public.customers FOR INSERT WITH CHECK (true);


--
-- Name: customers customers_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_select ON public.customers FOR SELECT USING (true);


--
-- Name: customers customers_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_update ON public.customers FOR UPDATE USING (true);


--
-- Name: deliveries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

--
-- Name: deliveries deliveries_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deliveries_delete ON public.deliveries FOR DELETE USING (true);


--
-- Name: deliveries deliveries_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deliveries_insert ON public.deliveries FOR INSERT WITH CHECK (true);


--
-- Name: deliveries deliveries_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deliveries_manage ON public.deliveries USING (public.has_perm('transactions_create'::text));


--
-- Name: deliveries deliveries_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deliveries_select ON public.deliveries FOR SELECT USING (true);


--
-- Name: deliveries deliveries_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deliveries_update ON public.deliveries FOR UPDATE USING (true);


--
-- Name: delivery_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.delivery_items ENABLE ROW LEVEL SECURITY;

--
-- Name: delivery_items delivery_items_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delivery_items_delete ON public.delivery_items FOR DELETE USING (true);


--
-- Name: delivery_items delivery_items_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delivery_items_insert ON public.delivery_items FOR INSERT WITH CHECK (true);


--
-- Name: delivery_items delivery_items_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delivery_items_manage ON public.delivery_items USING (public.has_perm('transactions_create'::text));


--
-- Name: delivery_items delivery_items_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delivery_items_select ON public.delivery_items FOR SELECT USING (true);


--
-- Name: delivery_items delivery_items_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delivery_items_update ON public.delivery_items FOR UPDATE USING (true);


--
-- Name: delivery_photos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.delivery_photos ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_advances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employee_advances ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_advances employee_advances_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employee_advances_delete ON public.employee_advances FOR DELETE USING (true);


--
-- Name: employee_advances employee_advances_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employee_advances_insert ON public.employee_advances FOR INSERT WITH CHECK (true);


--
-- Name: employee_advances employee_advances_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employee_advances_select ON public.employee_advances FOR SELECT USING (true);


--
-- Name: employee_advances employee_advances_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employee_advances_update ON public.employee_advances FOR UPDATE USING (true);


--
-- Name: employee_salaries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employee_salaries ENABLE ROW LEVEL SECURITY;

--
-- Name: expenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: expenses expenses_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY expenses_delete ON public.expenses FOR DELETE USING (true);


--
-- Name: expenses expenses_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY expenses_insert ON public.expenses FOR INSERT WITH CHECK (true);


--
-- Name: expenses expenses_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY expenses_select ON public.expenses FOR SELECT USING (true);


--
-- Name: expenses expenses_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY expenses_update ON public.expenses FOR UPDATE USING (true);


--
-- Name: manual_journal_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.manual_journal_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: manual_journal_entry_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.manual_journal_entry_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: material_stock_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.material_stock_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: materials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

--
-- Name: materials materials_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY materials_delete ON public.materials FOR DELETE USING (true);


--
-- Name: materials materials_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY materials_insert ON public.materials FOR INSERT WITH CHECK (true);


--
-- Name: materials materials_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY materials_select ON public.materials FOR SELECT USING (true);


--
-- Name: materials materials_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY materials_update ON public.materials FOR UPDATE USING (true);


--
-- Name: nishab_reference; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nishab_reference ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_delete ON public.notifications FOR DELETE USING (true);


--
-- Name: notifications notifications_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_insert ON public.notifications FOR INSERT WITH CHECK (true);


--
-- Name: notifications notifications_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_manage ON public.notifications USING (true);


--
-- Name: notifications notifications_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_select ON public.notifications FOR SELECT USING (true);


--
-- Name: notifications notifications_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_update ON public.notifications FOR UPDATE USING (true);


--
-- Name: payment_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;

--
-- Name: payroll_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;

--
-- Name: product_materials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_materials ENABLE ROW LEVEL SECURITY;

--
-- Name: product_materials product_materials_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_materials_delete ON public.product_materials FOR DELETE USING (true);


--
-- Name: product_materials product_materials_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_materials_insert ON public.product_materials FOR INSERT WITH CHECK (true);


--
-- Name: product_materials product_materials_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_materials_select ON public.product_materials FOR SELECT USING (true);


--
-- Name: product_materials product_materials_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_materials_update ON public.product_materials FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: production_errors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.production_errors ENABLE ROW LEVEL SECURITY;

--
-- Name: production_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.production_records ENABLE ROW LEVEL SECURITY;

--
-- Name: production_records production_records_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY production_records_delete ON public.production_records FOR DELETE USING (public.has_perm('role_management'::text));


--
-- Name: production_records production_records_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY production_records_insert ON public.production_records FOR INSERT WITH CHECK (true);


--
-- Name: production_records production_records_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY production_records_select ON public.production_records FOR SELECT USING (true);


--
-- Name: production_records production_records_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY production_records_update ON public.production_records FOR UPDATE USING (true);


--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: products products_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_delete ON public.products FOR DELETE USING (true);


--
-- Name: products products_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_insert ON public.products FOR INSERT WITH CHECK (true);


--
-- Name: products products_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_select ON public.products FOR SELECT USING (true);


--
-- Name: products products_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_update ON public.products FOR UPDATE USING (true);


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_delete ON public.profiles FOR DELETE USING (true);


--
-- Name: profiles profiles_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_insert ON public.profiles FOR INSERT WITH CHECK (true);


--
-- Name: profiles profiles_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select ON public.profiles FOR SELECT USING (true);


--
-- Name: profiles profiles_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update ON public.profiles FOR UPDATE USING (true);


--
-- Name: purchase_order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_order_items purchase_order_items_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY purchase_order_items_delete ON public.purchase_order_items FOR DELETE USING (true);


--
-- Name: purchase_order_items purchase_order_items_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY purchase_order_items_insert ON public.purchase_order_items FOR INSERT WITH CHECK (true);


--
-- Name: purchase_order_items purchase_order_items_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY purchase_order_items_manage ON public.purchase_order_items USING (public.has_perm('expenses_create'::text));


--
-- Name: purchase_order_items purchase_order_items_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY purchase_order_items_select ON public.purchase_order_items FOR SELECT USING (true);


--
-- Name: purchase_order_items purchase_order_items_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY purchase_order_items_update ON public.purchase_order_items FOR UPDATE USING (true);


--
-- Name: purchase_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_orders purchase_orders_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY purchase_orders_delete ON public.purchase_orders FOR DELETE USING (true);


--
-- Name: purchase_orders purchase_orders_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY purchase_orders_insert ON public.purchase_orders FOR INSERT WITH CHECK (true);


--
-- Name: purchase_orders purchase_orders_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY purchase_orders_manage ON public.purchase_orders USING (public.has_perm('expenses_create'::text));


--
-- Name: purchase_orders purchase_orders_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY purchase_orders_select ON public.purchase_orders FOR SELECT USING (true);


--
-- Name: purchase_orders purchase_orders_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY purchase_orders_update ON public.purchase_orders FOR UPDATE USING (true);


--
-- Name: quotations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;

--
-- Name: quotations quotations_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quotations_delete ON public.quotations FOR DELETE USING (true);


--
-- Name: quotations quotations_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quotations_insert ON public.quotations FOR INSERT WITH CHECK (true);


--
-- Name: quotations quotations_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quotations_select ON public.quotations FOR SELECT USING (true);


--
-- Name: quotations quotations_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quotations_update ON public.quotations FOR UPDATE USING (true);


--
-- Name: retasi; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.retasi ENABLE ROW LEVEL SECURITY;

--
-- Name: retasi retasi_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY retasi_delete ON public.retasi FOR DELETE USING (true);


--
-- Name: retasi retasi_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY retasi_insert ON public.retasi FOR INSERT WITH CHECK (true);


--
-- Name: retasi_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.retasi_items ENABLE ROW LEVEL SECURITY;

--
-- Name: retasi_items retasi_items_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY retasi_items_delete ON public.retasi_items FOR DELETE USING (true);


--
-- Name: retasi_items retasi_items_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY retasi_items_insert ON public.retasi_items FOR INSERT WITH CHECK (true);


--
-- Name: retasi_items retasi_items_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY retasi_items_select ON public.retasi_items FOR SELECT USING (true);


--
-- Name: retasi_items retasi_items_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY retasi_items_update ON public.retasi_items FOR UPDATE USING (true);


--
-- Name: retasi retasi_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY retasi_select ON public.retasi FOR SELECT USING (true);


--
-- Name: retasi retasi_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY retasi_update ON public.retasi FOR UPDATE USING (true);


--
-- Name: role_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: role_permissions role_permissions_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY role_permissions_manage ON public.role_permissions USING (public.has_perm('role_management'::text));


--
-- Name: role_permissions role_permissions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY role_permissions_select ON public.role_permissions FOR SELECT USING (public.has_perm('role_management'::text));


--
-- Name: roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

--
-- Name: roles roles_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roles_manage ON public.roles USING (public.has_perm('role_management'::text));


--
-- Name: roles roles_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roles_select ON public.roles FOR SELECT USING (true);


--
-- Name: stock_pricings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_pricings ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_materials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplier_materials ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_materials supplier_materials_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY supplier_materials_delete ON public.supplier_materials FOR DELETE USING (true);


--
-- Name: supplier_materials supplier_materials_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY supplier_materials_insert ON public.supplier_materials FOR INSERT WITH CHECK (true);


--
-- Name: supplier_materials supplier_materials_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY supplier_materials_select ON public.supplier_materials FOR SELECT USING (true);


--
-- Name: supplier_materials supplier_materials_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY supplier_materials_update ON public.supplier_materials FOR UPDATE USING (true);


--
-- Name: suppliers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

--
-- Name: suppliers suppliers_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppliers_delete ON public.suppliers FOR DELETE USING (true);


--
-- Name: suppliers suppliers_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppliers_insert ON public.suppliers FOR INSERT WITH CHECK (true);


--
-- Name: suppliers suppliers_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppliers_manage ON public.suppliers USING (public.has_perm('settings_access'::text));


--
-- Name: suppliers suppliers_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppliers_select ON public.suppliers FOR SELECT USING (true);


--
-- Name: suppliers suppliers_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppliers_update ON public.suppliers FOR UPDATE USING (true);


--
-- Name: transaction_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transaction_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: transaction_payments transaction_payments_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY transaction_payments_manage ON public.transaction_payments USING (public.has_perm('transactions_create'::text));


--
-- Name: transaction_payments transaction_payments_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY transaction_payments_select ON public.transaction_payments FOR SELECT USING (public.has_perm('transactions_view'::text));


--
-- Name: transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: transactions transactions_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY transactions_delete ON public.transactions FOR DELETE USING (true);


--
-- Name: transactions transactions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY transactions_insert ON public.transactions FOR INSERT WITH CHECK (true);


--
-- Name: transactions transactions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY transactions_select ON public.transactions FOR SELECT USING (true);


--
-- Name: transactions transactions_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY transactions_update ON public.transactions FOR UPDATE USING (true);


--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: zakat_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.zakat_records ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict x5QkOc8E7x5rEmoNiyEWMhh21MOHj3nn7FOqWmneQtxEbBTGkWXzJig3AUb3Ejr

