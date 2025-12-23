--
-- PostgreSQL database dump
--

\restrict U1surJBFqOaVQYuc8ReqAtrE44HXKbAObLGwRzjbKxWbcEJkVMuJxtvjwgnUEQo

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
-- Name: attendance_status; Type: TYPE; Schema: public; Owner: aquavit
--

CREATE TYPE public.attendance_status AS ENUM (
    'Hadir',
    'Pulang'
);


ALTER TYPE public.attendance_status OWNER TO aquavit;

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
-- Name: audit_profiles_changes(); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.audit_profiles_changes() OWNER TO aquavit;

--
-- Name: audit_transactions_changes(); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.audit_transactions_changes() OWNER TO aquavit;

--
-- Name: auto_fill_account_type(); Type: FUNCTION; Schema: public; Owner: postgres
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


ALTER FUNCTION public.auto_fill_account_type() OWNER TO postgres;

--
-- Name: calculate_asset_current_value(text); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.calculate_asset_current_value(p_asset_id text) OWNER TO aquavit;

--
-- Name: calculate_commission_amount(); Type: FUNCTION; Schema: public; Owner: aquavit
--

CREATE FUNCTION public.calculate_commission_amount() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.amount = NEW.quantity * NEW.rate_per_qty;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.calculate_commission_amount() OWNER TO aquavit;

--
-- Name: calculate_commission_for_period(uuid, date, date); Type: FUNCTION; Schema: public; Owner: postgres
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


ALTER FUNCTION public.calculate_commission_for_period(emp_id uuid, start_date date, end_date date) OWNER TO postgres;

--
-- Name: calculate_payroll_with_advances(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
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


ALTER FUNCTION public.calculate_payroll_with_advances(emp_id uuid, period_year integer, period_month integer) OWNER TO postgres;

--
-- Name: calculate_transaction_payment_status(text); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.calculate_transaction_payment_status(p_transaction_id text) OWNER TO aquavit;

--
-- Name: calculate_zakat_amount(numeric, text); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.calculate_zakat_amount(p_asset_value numeric, p_nishab_type text) OWNER TO aquavit;

--
-- Name: FUNCTION calculate_zakat_amount(p_asset_value numeric, p_nishab_type text); Type: COMMENT; Schema: public; Owner: aquavit
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
-- Name: cancel_transaction_payment(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.cancel_transaction_payment(p_payment_id uuid, p_cancelled_by uuid, p_reason text) OWNER TO aquavit;

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
-- Name: create_audit_log(text, text, text, jsonb, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.create_audit_log(p_table_name text, p_operation text, p_record_id text, p_old_data jsonb, p_new_data jsonb, p_additional_info jsonb) OWNER TO aquavit;

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
-- Name: create_zakat_cash_entry(); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.create_zakat_cash_entry() OWNER TO aquavit;

--
-- Name: deactivate_employee(uuid); Type: FUNCTION; Schema: public; Owner: postgres
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


ALTER FUNCTION public.deactivate_employee(employee_id uuid) OWNER TO postgres;

--
-- Name: deduct_materials_for_transaction(text); Type: FUNCTION; Schema: public; Owner: postgres
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


ALTER FUNCTION public.deduct_materials_for_transaction(p_transaction_id text) OWNER TO postgres;

--
-- Name: delete_transaction_cascade(text, uuid, text); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.delete_transaction_cascade(p_transaction_id text, p_deleted_by uuid, p_reason text) OWNER TO aquavit;

--
-- Name: demo_balance_sheet(); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.demo_balance_sheet() OWNER TO aquavit;

--
-- Name: demo_show_chart_of_accounts(); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.demo_show_chart_of_accounts() OWNER TO aquavit;

--
-- Name: demo_trial_balance(); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.demo_trial_balance() OWNER TO aquavit;

--
-- Name: disable_rls(text); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.disable_rls(table_name text) OWNER TO aquavit;

--
-- Name: driver_has_unreturned_retasi(text); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.driver_has_unreturned_retasi(driver text) OWNER TO aquavit;

--
-- Name: enable_rls(text); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.enable_rls(table_name text) OWNER TO aquavit;

--
-- Name: generate_delivery_number(); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.generate_delivery_number() OWNER TO aquavit;

--
-- Name: generate_journal_number(date); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.generate_journal_number(entry_date date) OWNER TO aquavit;

--
-- Name: generate_retasi_number(); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.generate_retasi_number() OWNER TO aquavit;

--
-- Name: generate_supplier_code(); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.generate_supplier_code() OWNER TO aquavit;

--
-- Name: get_account_balance_analysis(text); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.get_account_balance_analysis(p_account_id text) OWNER TO aquavit;

--
-- Name: get_account_balance_with_children(text); Type: FUNCTION; Schema: public; Owner: postgres
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


ALTER FUNCTION public.get_account_balance_with_children(account_id text) OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: employee_salaries; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.employee_salaries OWNER TO postgres;

--
-- Name: get_active_salary_config(uuid, date); Type: FUNCTION; Schema: public; Owner: postgres
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


ALTER FUNCTION public.get_active_salary_config(emp_id uuid, check_date date) OWNER TO postgres;

--
-- Name: get_all_accounts_balance_analysis(); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.get_all_accounts_balance_analysis() OWNER TO aquavit;

--
-- Name: get_commission_summary(uuid, date, date); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.get_commission_summary(emp_id uuid, start_date date, end_date date) OWNER TO aquavit;

--
-- Name: get_current_nishab(); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.get_current_nishab() OWNER TO aquavit;

--
-- Name: FUNCTION get_current_nishab(); Type: COMMENT; Schema: public; Owner: aquavit
--

COMMENT ON FUNCTION public.get_current_nishab() IS 'Get current nishab values for zakat calculation';


--
-- Name: get_current_user_role(); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.get_current_user_role() OWNER TO aquavit;

--
-- Name: get_delivery_summary(text); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.get_delivery_summary(transaction_id_param text) OWNER TO aquavit;

--
-- Name: get_delivery_with_employees(uuid); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.get_delivery_with_employees(delivery_id_param uuid) OWNER TO aquavit;

--
-- Name: get_next_retasi_counter(text, date); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.get_next_retasi_counter(driver text, target_date date) OWNER TO aquavit;

--
-- Name: get_outstanding_advances(uuid, date); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.get_outstanding_advances(emp_id uuid, up_to_date date) OWNER TO aquavit;

--
-- Name: get_rls_policies(text); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.get_rls_policies(table_name text) OWNER TO aquavit;

--
-- Name: get_rls_status(); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.get_rls_status() OWNER TO aquavit;

--
-- Name: get_transactions_ready_for_delivery(); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.get_transactions_ready_for_delivery() OWNER TO aquavit;

--
-- Name: get_user_branch_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_user_branch_id() RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN
    RETURN (SELECT branch_id FROM profiles WHERE id = auth.uid());
END;
$$;


ALTER FUNCTION public.get_user_branch_id() OWNER TO postgres;

--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.handle_new_user() OWNER TO aquavit;

--
-- Name: has_perm(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.has_perm(perm_name text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    jwt_role TEXT;
    perms JSONB;
BEGIN
    -- Get role from JWT claims
    BEGIN
        jwt_role := current_setting('request.jwt.claims', true)::json->>'role';
    EXCEPTION WHEN OTHERS THEN
        jwt_role := NULL;
    END;

    -- No JWT role = deny
    IF jwt_role IS NULL OR jwt_role = '' THEN
        RETURN false;
    END IF;

    -- Owner always has all permissions
    IF jwt_role = 'owner' THEN
        RETURN true;
    END IF;

    -- Get permissions from role_permissions table
    SELECT permissions INTO perms
    FROM role_permissions
    WHERE role_id = jwt_role;

    -- If no permissions found for role, allow basic access (authenticated)
    IF perms IS NULL THEN
        RETURN true;  -- Allow authenticated users with unknown roles
    END IF;

    -- Check 'all' permission first
    IF (perms->>'all')::boolean = true THEN
        RETURN true;
    END IF;

    -- Check specific permission
    RETURN COALESCE((perms->>perm_name)::boolean, false);
END;
$$;


ALTER FUNCTION public.has_perm(perm_name text) OWNER TO postgres;

--
-- Name: has_permission(text); Type: FUNCTION; Schema: public; Owner: postgres
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


ALTER FUNCTION public.has_permission(permission_name text) OWNER TO postgres;

--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.is_admin() OWNER TO aquavit;

--
-- Name: is_authenticated(); Type: FUNCTION; Schema: public; Owner: postgres
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


ALTER FUNCTION public.is_authenticated() OWNER TO postgres;

--
-- Name: is_owner(); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.is_owner() OWNER TO aquavit;

--
-- Name: is_super_admin(); Type: FUNCTION; Schema: public; Owner: postgres
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


ALTER FUNCTION public.is_super_admin() OWNER TO postgres;

--
-- Name: log_performance(text, integer, text, integer, text, jsonb); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.log_performance(p_operation_name text, p_duration_ms integer, p_table_name text, p_record_count integer, p_query_type text, p_metadata jsonb) OWNER TO aquavit;

--
-- Name: mark_retasi_returned(uuid, integer, integer, text); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.mark_retasi_returned(retasi_id uuid, returned_count integer, error_count integer, notes text) OWNER TO aquavit;

--
-- Name: notify_debt_payment(); Type: FUNCTION; Schema: public; Owner: postgres
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


ALTER FUNCTION public.notify_debt_payment() OWNER TO postgres;

--
-- Name: notify_payroll_processed(); Type: FUNCTION; Schema: public; Owner: postgres
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


ALTER FUNCTION public.notify_payroll_processed() OWNER TO postgres;

--
-- Name: notify_production_completed(); Type: FUNCTION; Schema: public; Owner: postgres
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


ALTER FUNCTION public.notify_production_completed() OWNER TO postgres;

--
-- Name: notify_purchase_order_created(); Type: FUNCTION; Schema: public; Owner: postgres
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


ALTER FUNCTION public.notify_purchase_order_created() OWNER TO postgres;

--
-- Name: pay_receivable(text, numeric); Type: FUNCTION; Schema: public; Owner: postgres
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


ALTER FUNCTION public.pay_receivable(p_transaction_id text, p_amount numeric) OWNER TO postgres;

--
-- Name: pay_receivable_with_history(text, numeric, text, text, text, uuid, text); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.pay_receivable_with_history(p_transaction_id text, p_amount numeric, p_account_id text, p_account_name text, p_notes text, p_recorded_by uuid, p_recorded_by_name text) OWNER TO aquavit;

--
-- Name: populate_commission_product_info(); Type: FUNCTION; Schema: public; Owner: postgres
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


ALTER FUNCTION public.populate_commission_product_info() OWNER TO postgres;

--
-- Name: process_advance_repayment_from_salary(uuid, numeric); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.process_advance_repayment_from_salary(payroll_record_id uuid, advance_deduction_amount numeric) OWNER TO aquavit;

--
-- Name: reconcile_account_balance(text, numeric, text, uuid, text); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.reconcile_account_balance(p_account_id text, p_new_balance numeric, p_reason text, p_user_id uuid, p_user_name text) OWNER TO aquavit;

--
-- Name: record_payment_history(); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.record_payment_history() OWNER TO aquavit;

--
-- Name: record_receivable_payment(text, numeric, text, text, text, text, text, text, uuid, text, text); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.record_receivable_payment(p_transaction_id text, p_amount numeric, p_payment_method text, p_account_id text, p_account_name text, p_description text, p_notes text, p_reference_number text, p_paid_by_user_id uuid, p_paid_by_user_name text, p_paid_by_user_role text) OWNER TO aquavit;

--
-- Name: refresh_daily_stats(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.refresh_daily_stats() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  REFRESH MATERIALIZED VIEW public.daily_stats;
END;
$$;


ALTER FUNCTION public.refresh_daily_stats() OWNER TO postgres;

--
-- Name: search_customers(text, integer); Type: FUNCTION; Schema: public; Owner: postgres
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


ALTER FUNCTION public.search_customers(search_term text, limit_count integer) OWNER TO postgres;

--
-- Name: search_products_with_stock(text, text, integer); Type: FUNCTION; Schema: public; Owner: postgres
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


ALTER FUNCTION public.search_products_with_stock(search_term text, category_filter text, limit_count integer) OWNER TO postgres;

--
-- Name: search_transactions(text, integer, integer, text); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.search_transactions(search_term text, limit_count integer, offset_count integer, status_filter text) OWNER TO aquavit;

--
-- Name: set_account_initial_balance(text, numeric, text, uuid, text); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.set_account_initial_balance(p_account_id text, p_initial_balance numeric, p_reason text, p_user_id uuid, p_user_name text) OWNER TO aquavit;

--
-- Name: set_retasi_ke(); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.set_retasi_ke() OWNER TO aquavit;

--
-- Name: set_retasi_ke_and_number(); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.set_retasi_ke_and_number() OWNER TO aquavit;

--
-- Name: set_supplier_code(); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.set_supplier_code() OWNER TO aquavit;

--
-- Name: sync_attendance_checkin(); Type: FUNCTION; Schema: public; Owner: postgres
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


ALTER FUNCTION public.sync_attendance_checkin() OWNER TO postgres;

--
-- Name: sync_attendance_ids(); Type: FUNCTION; Schema: public; Owner: postgres
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


ALTER FUNCTION public.sync_attendance_ids() OWNER TO postgres;

--
-- Name: sync_attendance_user_id(); Type: FUNCTION; Schema: public; Owner: postgres
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


ALTER FUNCTION public.sync_attendance_user_id() OWNER TO postgres;

--
-- Name: sync_payroll_commissions_to_entries(); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.sync_payroll_commissions_to_entries() OWNER TO aquavit;

--
-- Name: test_balance_reconciliation_functions(); Type: FUNCTION; Schema: public; Owner: postgres
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


ALTER FUNCTION public.test_balance_reconciliation_functions() OWNER TO postgres;

--
-- Name: trigger_process_advance_repayment(); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.trigger_process_advance_repayment() OWNER TO aquavit;

--
-- Name: trigger_sync_payroll_commission(); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.trigger_sync_payroll_commission() OWNER TO aquavit;

--
-- Name: update_overdue_maintenance(); Type: FUNCTION; Schema: public; Owner: postgres
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


ALTER FUNCTION public.update_overdue_maintenance() OWNER TO postgres;

--
-- Name: update_payment_status(); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.update_payment_status() OWNER TO aquavit;

--
-- Name: update_payroll_updated_at(); Type: FUNCTION; Schema: public; Owner: aquavit
--

CREATE FUNCTION public.update_payroll_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_payroll_updated_at() OWNER TO aquavit;

--
-- Name: update_product_materials_updated_at(); Type: FUNCTION; Schema: public; Owner: aquavit
--

CREATE FUNCTION public.update_product_materials_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_product_materials_updated_at() OWNER TO aquavit;

--
-- Name: update_production_records_updated_at(); Type: FUNCTION; Schema: public; Owner: aquavit
--

CREATE FUNCTION public.update_production_records_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_production_records_updated_at() OWNER TO aquavit;

--
-- Name: update_profiles_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_profiles_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_profiles_updated_at() OWNER TO postgres;

--
-- Name: update_remaining_amount(text); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.update_remaining_amount(p_advance_id text) OWNER TO aquavit;

--
-- Name: update_transaction_delivery_status(); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.update_transaction_delivery_status() OWNER TO aquavit;

--
-- Name: update_transaction_status_from_delivery(); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.update_transaction_status_from_delivery() OWNER TO aquavit;

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: aquavit
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO aquavit;

--
-- Name: validate_journal_balance(uuid); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.validate_journal_balance(journal_id uuid) OWNER TO aquavit;

--
-- Name: validate_transaction_status_transition(); Type: FUNCTION; Schema: public; Owner: aquavit
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


ALTER FUNCTION public.validate_transaction_status_transition() OWNER TO aquavit;

--
-- Name: accounts; Type: TABLE; Schema: public; Owner: aquavit
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


ALTER TABLE public.accounts OWNER TO aquavit;

--
-- Name: COLUMN accounts.balance; Type: COMMENT; Schema: public; Owner: aquavit
--

COMMENT ON COLUMN public.accounts.balance IS 'Saldo saat ini yang dihitung dari initial_balance + semua transaksi';


--
-- Name: COLUMN accounts.initial_balance; Type: COMMENT; Schema: public; Owner: aquavit
--

COMMENT ON COLUMN public.accounts.initial_balance IS 'Saldo awal yang diinput oleh owner, tidak berubah kecuali diupdate manual';


--
-- Name: COLUMN accounts.code; Type: COMMENT; Schema: public; Owner: aquavit
--

COMMENT ON COLUMN public.accounts.code IS 'Kode akun standar (1000, 1100, 1110, dst)';


--
-- Name: COLUMN accounts.parent_id; Type: COMMENT; Schema: public; Owner: aquavit
--

COMMENT ON COLUMN public.accounts.parent_id IS 'ID parent account untuk hierarki';


--
-- Name: COLUMN accounts.level; Type: COMMENT; Schema: public; Owner: aquavit
--

COMMENT ON COLUMN public.accounts.level IS 'Level hierarki: 1=Header, 2=Sub-header, 3=Detail, 4=Sub-detail';


--
-- Name: COLUMN accounts.normal_balance; Type: COMMENT; Schema: public; Owner: aquavit
--

COMMENT ON COLUMN public.accounts.normal_balance IS 'Saldo normal: DEBIT atau CREDIT';


--
-- Name: COLUMN accounts.is_header; Type: COMMENT; Schema: public; Owner: aquavit
--

COMMENT ON COLUMN public.accounts.is_header IS 'Apakah ini header account (tidak bisa digunakan untuk transaksi)';


--
-- Name: COLUMN accounts.is_active; Type: COMMENT; Schema: public; Owner: aquavit
--

COMMENT ON COLUMN public.accounts.is_active IS 'Status aktif account';


--
-- Name: COLUMN accounts.sort_order; Type: COMMENT; Schema: public; Owner: aquavit
--

COMMENT ON COLUMN public.accounts.sort_order IS 'Urutan tampilan dalam laporan';


--
-- Name: accounts_hierarchy; Type: VIEW; Schema: public; Owner: postgres
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


ALTER TABLE public.accounts_hierarchy OWNER TO postgres;

--
-- Name: accounts_payable; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.accounts_payable OWNER TO postgres;

--
-- Name: COLUMN accounts_payable.interest_rate; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.accounts_payable.interest_rate IS 'Interest rate in percentage (e.g., 5 for 5%)';


--
-- Name: COLUMN accounts_payable.interest_type; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.accounts_payable.interest_type IS 'Type of interest calculation: flat (one-time), per_month (monthly), per_year (annual)';


--
-- Name: COLUMN accounts_payable.creditor_type; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.accounts_payable.creditor_type IS 'Type of creditor: supplier, bank, credit_card, or other';


--
-- Name: advance_repayments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.advance_repayments (
    id text NOT NULL,
    advance_id text,
    amount numeric NOT NULL,
    date timestamp with time zone NOT NULL,
    recorded_by text
);


ALTER TABLE public.advance_repayments OWNER TO postgres;

--
-- Name: asset_maintenance; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.asset_maintenance OWNER TO postgres;

--
-- Name: assets; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.assets OWNER TO postgres;

--
-- Name: attendance; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.attendance OWNER TO postgres;

--
-- Name: balance_adjustments; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.balance_adjustments OWNER TO postgres;

--
-- Name: bonus_pricings; Type: TABLE; Schema: public; Owner: aquavit
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


ALTER TABLE public.bonus_pricings OWNER TO aquavit;

--
-- Name: TABLE bonus_pricings; Type: COMMENT; Schema: public; Owner: aquavit
--

COMMENT ON TABLE public.bonus_pricings IS 'Bonus rules based on purchase quantity';


--
-- Name: COLUMN bonus_pricings.min_quantity; Type: COMMENT; Schema: public; Owner: aquavit
--

COMMENT ON COLUMN public.bonus_pricings.min_quantity IS 'Minimum quantity for this bonus rule';


--
-- Name: COLUMN bonus_pricings.max_quantity; Type: COMMENT; Schema: public; Owner: aquavit
--

COMMENT ON COLUMN public.bonus_pricings.max_quantity IS 'Maximum quantity for this bonus rule (NULL means no upper limit)';


--
-- Name: COLUMN bonus_pricings.bonus_type; Type: COMMENT; Schema: public; Owner: aquavit
--

COMMENT ON COLUMN public.bonus_pricings.bonus_type IS 'Type of bonus: quantity (free items), percentage (% discount), fixed_discount (fixed amount discount)';


--
-- Name: COLUMN bonus_pricings.bonus_value; Type: COMMENT; Schema: public; Owner: aquavit
--

COMMENT ON COLUMN public.bonus_pricings.bonus_value IS 'Value of bonus depending on type: quantity in pieces, percentage (0-100), or fixed discount amount';


--
-- Name: branches; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.branches OWNER TO postgres;

--
-- Name: cash_history; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.cash_history OWNER TO postgres;

--
-- Name: commission_entries; Type: TABLE; Schema: public; Owner: aquavit
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


ALTER TABLE public.commission_entries OWNER TO aquavit;

--
-- Name: commission_rules; Type: TABLE; Schema: public; Owner: aquavit
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


ALTER TABLE public.commission_rules OWNER TO aquavit;

--
-- Name: companies; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.companies OWNER TO postgres;

--
-- Name: company_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.company_settings (
    key text NOT NULL,
    value text
);


ALTER TABLE public.company_settings OWNER TO postgres;

--
-- Name: customer_pricings; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.customer_pricings OWNER TO postgres;

--
-- Name: customers; Type: TABLE; Schema: public; Owner: aquavit
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


ALTER TABLE public.customers OWNER TO aquavit;

--
-- Name: COLUMN customers.jumlah_galon_titip; Type: COMMENT; Schema: public; Owner: aquavit
--

COMMENT ON COLUMN public.customers.jumlah_galon_titip IS 'Jumlah galon yang dititip di pelanggan';


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.transactions OWNER TO postgres;

--
-- Name: TABLE transactions; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.transactions IS 'Transaction data. Delivery information is now handled separately in deliveries and delivery_items tables as of migration 0034.';


--
-- Name: COLUMN transactions.subtotal; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.transactions.subtotal IS 'Total sebelum PPN dan setelah diskon';


--
-- Name: COLUMN transactions.ppn_enabled; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.transactions.ppn_enabled IS 'Apakah PPN diaktifkan untuk transaksi ini';


--
-- Name: COLUMN transactions.ppn_percentage; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.transactions.ppn_percentage IS 'Persentase PPN yang digunakan (default 11%)';


--
-- Name: COLUMN transactions.ppn_amount; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.transactions.ppn_amount IS 'Jumlah PPN dalam rupiah';


--
-- Name: COLUMN transactions.is_office_sale; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.transactions.is_office_sale IS 'Menandakan apakah produk laku kantor (true) atau perlu diantar (false)';


--
-- Name: COLUMN transactions.due_date; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.transactions.due_date IS 'Tanggal jatuh tempo untuk pembayaran kredit';


--
-- Name: COLUMN transactions.ppn_mode; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.transactions.ppn_mode IS 'Mode PPN: include (sudah termasuk) atau exclude (belum termasuk)';


--
-- Name: COLUMN transactions.sales_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.transactions.sales_id IS 'ID of the sales person responsible for this transaction';


--
-- Name: COLUMN transactions.sales_name; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.transactions.sales_name IS 'Name of the sales person responsible for this transaction';


--
-- Name: COLUMN transactions.retasi_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.transactions.retasi_id IS 'Reference to retasi table - links driver transactions to their active retasi';


--
-- Name: COLUMN transactions.retasi_number; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.transactions.retasi_number IS 'Retasi number for display purposes (e.g., RET-20251213-001)';


--
-- Name: daily_stats; Type: MATERIALIZED VIEW; Schema: public; Owner: postgres
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


ALTER TABLE public.daily_stats OWNER TO postgres;

--
-- Name: products; Type: TABLE; Schema: public; Owner: aquavit
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


ALTER TABLE public.products OWNER TO aquavit;

--
-- Name: COLUMN products.type; Type: COMMENT; Schema: public; Owner: aquavit
--

COMMENT ON COLUMN public.products.type IS 'Jenis barang: Stock (produksi menurunkan stock), Beli (produksi menambah stock)';


--
-- Name: COLUMN products.current_stock; Type: COMMENT; Schema: public; Owner: aquavit
--

COMMENT ON COLUMN public.products.current_stock IS 'Stock saat ini';


--
-- Name: COLUMN products.min_stock; Type: COMMENT; Schema: public; Owner: aquavit
--

COMMENT ON COLUMN public.products.min_stock IS 'Stock minimum untuk alert';


--
-- Name: dashboard_summary; Type: VIEW; Schema: public; Owner: postgres
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


ALTER TABLE public.dashboard_summary OWNER TO postgres;

--
-- Name: deliveries; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.deliveries OWNER TO postgres;

--
-- Name: delivery_items; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.delivery_items OWNER TO postgres;

--
-- Name: delivery_photos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.delivery_photos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    delivery_id uuid,
    photo_url text NOT NULL,
    photo_type text DEFAULT 'delivery'::text,
    description text,
    uploaded_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.delivery_photos OWNER TO postgres;

--
-- Name: employee_advances; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.employee_advances OWNER TO postgres;

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: aquavit
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
    name text GENERATED ALWAYS AS (full_name) STORED,
    allowed_branches uuid[] DEFAULT '{}'::uuid[]
);


ALTER TABLE public.profiles OWNER TO aquavit;

--
-- Name: COLUMN profiles.allowed_branches; Type: COMMENT; Schema: public; Owner: aquavit
--

COMMENT ON COLUMN public.profiles.allowed_branches IS 'Array of branch UUIDs user can access. Empty means all branches.';


--
-- Name: employee_salary_summary; Type: VIEW; Schema: public; Owner: postgres
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


ALTER TABLE public.employee_salary_summary OWNER TO postgres;

--
-- Name: expenses; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.expenses OWNER TO postgres;

--
-- Name: manual_journal_entries; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.manual_journal_entries OWNER TO postgres;

--
-- Name: manual_journal_entry_lines; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.manual_journal_entry_lines OWNER TO postgres;

--
-- Name: material_stock_movements; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.material_stock_movements OWNER TO postgres;

--
-- Name: TABLE material_stock_movements; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.material_stock_movements IS 'History of all material stock movements and changes';


--
-- Name: COLUMN material_stock_movements.type; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.material_stock_movements.type IS 'Type of movement: IN (stock bertambah), OUT (stock berkurang), ADJUSTMENT (penyesuaian)';


--
-- Name: COLUMN material_stock_movements.reason; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.material_stock_movements.reason IS 'Reason for movement: PURCHASE, PRODUCTION_CONSUMPTION, PRODUCTION_ACQUISITION, ADJUSTMENT, RETURN, PRODUCTION_ERROR, PRODUCTION_DELETE_RESTORE';


--
-- Name: COLUMN material_stock_movements.quantity; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.material_stock_movements.quantity IS 'Quantity moved (always positive)';


--
-- Name: COLUMN material_stock_movements.previous_stock; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.material_stock_movements.previous_stock IS 'Stock before this movement';


--
-- Name: COLUMN material_stock_movements.new_stock; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.material_stock_movements.new_stock IS 'Stock after this movement';


--
-- Name: COLUMN material_stock_movements.reference_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.material_stock_movements.reference_id IS 'ID of related record (transaction, purchase order, etc)';


--
-- Name: COLUMN material_stock_movements.reference_type; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.material_stock_movements.reference_type IS 'Type of reference (transaction, purchase_order, etc)';


--
-- Name: materials; Type: TABLE; Schema: public; Owner: aquavit
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
    cost_price numeric(15,2) DEFAULT 0,
    CONSTRAINT materials_type_check CHECK ((type = ANY (ARRAY['Stock'::text, 'Beli'::text])))
);


ALTER TABLE public.materials OWNER TO aquavit;

--
-- Name: COLUMN materials.type; Type: COMMENT; Schema: public; Owner: aquavit
--

COMMENT ON COLUMN public.materials.type IS 'Jenis bahan: Stock (produksi menurunkan stock), Beli (produksi menambah stock)';


--
-- Name: nishab_reference; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.nishab_reference OWNER TO postgres;

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.notifications OWNER TO postgres;

--
-- Name: payment_history; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.payment_history OWNER TO postgres;

--
-- Name: payroll_records; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.payroll_records OWNER TO postgres;

--
-- Name: payroll_summary; Type: VIEW; Schema: public; Owner: postgres
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


ALTER TABLE public.payroll_summary OWNER TO postgres;

--
-- Name: product_materials; Type: TABLE; Schema: public; Owner: aquavit
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


ALTER TABLE public.product_materials OWNER TO aquavit;

--
-- Name: production_errors; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.production_errors OWNER TO postgres;

--
-- Name: TABLE production_errors; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.production_errors IS 'Records of material errors/defects during production process';


--
-- Name: COLUMN production_errors.ref; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.production_errors.ref IS 'Unique reference code for the error record (e.g., ERR-250122-001)';


--
-- Name: COLUMN production_errors.material_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.production_errors.material_id IS 'Reference to the material that had errors';


--
-- Name: COLUMN production_errors.quantity; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.production_errors.quantity IS 'Quantity of material that was defective/error';


--
-- Name: COLUMN production_errors.note; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.production_errors.note IS 'Description of the error or defect';


--
-- Name: COLUMN production_errors.created_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.production_errors.created_by IS 'User who recorded the error';


--
-- Name: production_records; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.production_records OWNER TO postgres;

--
-- Name: purchase_order_items; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.purchase_order_items OWNER TO postgres;

--
-- Name: purchase_orders; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.purchase_orders OWNER TO postgres;

--
-- Name: quotations; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.quotations OWNER TO postgres;

--
-- Name: retasi; Type: TABLE; Schema: public; Owner: aquavit
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


ALTER TABLE public.retasi OWNER TO aquavit;

--
-- Name: COLUMN retasi.barang_laku; Type: COMMENT; Schema: public; Owner: aquavit
--

COMMENT ON COLUMN public.retasi.barang_laku IS 'Jumlah barang yang laku terjual dari retasi';


--
-- Name: retasi_items; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.retasi_items OWNER TO postgres;

--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: aquavit
--

CREATE TABLE public.role_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role_id text NOT NULL,
    permissions jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


ALTER TABLE public.role_permissions OWNER TO aquavit;

--
-- Name: roles; Type: TABLE; Schema: public; Owner: aquavit
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


ALTER TABLE public.roles OWNER TO aquavit;

--
-- Name: TABLE roles; Type: COMMENT; Schema: public; Owner: aquavit
--

COMMENT ON TABLE public.roles IS 'Table untuk menyimpan role/jabatan yang bisa dikelola secara dinamis';


--
-- Name: COLUMN roles.name; Type: COMMENT; Schema: public; Owner: aquavit
--

COMMENT ON COLUMN public.roles.name IS 'Nama unik role (lowercase, untuk sistem)';


--
-- Name: COLUMN roles.display_name; Type: COMMENT; Schema: public; Owner: aquavit
--

COMMENT ON COLUMN public.roles.display_name IS 'Nama tampilan role (untuk UI)';


--
-- Name: COLUMN roles.permissions; Type: COMMENT; Schema: public; Owner: aquavit
--

COMMENT ON COLUMN public.roles.permissions IS 'JSON object berisi permission untuk role ini';


--
-- Name: COLUMN roles.is_system_role; Type: COMMENT; Schema: public; Owner: aquavit
--

COMMENT ON COLUMN public.roles.is_system_role IS 'Apakah ini system role yang tidak bisa dihapus';


--
-- Name: COLUMN roles.is_active; Type: COMMENT; Schema: public; Owner: aquavit
--

COMMENT ON COLUMN public.roles.is_active IS 'Status aktif role';


--
-- Name: stock_pricings; Type: TABLE; Schema: public; Owner: aquavit
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


ALTER TABLE public.stock_pricings OWNER TO aquavit;

--
-- Name: TABLE stock_pricings; Type: COMMENT; Schema: public; Owner: aquavit
--

COMMENT ON TABLE public.stock_pricings IS 'Pricing rules based on product stock levels';


--
-- Name: COLUMN stock_pricings.min_stock; Type: COMMENT; Schema: public; Owner: aquavit
--

COMMENT ON COLUMN public.stock_pricings.min_stock IS 'Minimum stock level for this pricing rule';


--
-- Name: COLUMN stock_pricings.max_stock; Type: COMMENT; Schema: public; Owner: aquavit
--

COMMENT ON COLUMN public.stock_pricings.max_stock IS 'Maximum stock level for this pricing rule (NULL means no upper limit)';


--
-- Name: COLUMN stock_pricings.price; Type: COMMENT; Schema: public; Owner: aquavit
--

COMMENT ON COLUMN public.stock_pricings.price IS 'Price to use when stock is within the range';


--
-- Name: supplier_materials; Type: TABLE; Schema: public; Owner: aquavit
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


ALTER TABLE public.supplier_materials OWNER TO aquavit;

--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: aquavit
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


ALTER TABLE public.suppliers OWNER TO aquavit;

--
-- Name: transaction_payments; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.transaction_payments OWNER TO postgres;

--
-- Name: transaction_detail_report; Type: VIEW; Schema: public; Owner: postgres
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


ALTER TABLE public.transaction_detail_report OWNER TO postgres;

--
-- Name: transactions_with_customer; Type: VIEW; Schema: public; Owner: postgres
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


ALTER TABLE public.transactions_with_customer OWNER TO postgres;

--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    role_id uuid,
    assigned_at timestamp with time zone DEFAULT now(),
    assigned_by uuid
);


ALTER TABLE public.user_roles OWNER TO postgres;

--
-- Name: zakat_records; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.zakat_records OWNER TO postgres;

--
-- Data for Name: accounts; Type: TABLE DATA; Schema: public; Owner: aquavit
--

COPY public.accounts (id, name, type, balance, is_payment_account, created_at, current_balance, initial_balance, account_type, updated_at, code, parent_id, level, normal_balance, is_header, is_active, sort_order, branch_id, category) FROM stdin;
acc-1766339926698	Beban Air	BEBAN	0	f	2025-12-22 00:58:48.247419+07	0	0	cash	2025-12-22 01:25:16.349274+07	6010	acc-6000	2	DEBIT	f	t	6010	3c9f4cab-ae4d-4313-99b7-86be6a989771	\N
acc-1400	Aset Tetap	ASET	0	f	2025-12-22 01:05:31.043068+07	0	0	cash	2025-12-22 01:25:16.349274+07	1400	acc-1000	2	DEBIT	t	t	1400	\N	\N
acc-2100	Kewajiban Lancar	KEWAJIBAN	0	f	2025-12-22 01:05:31.046641+07	0	0	cash	2025-12-22 01:25:16.349274+07	2100	acc-2000	2	CREDIT	t	t	2100	\N	\N
acc-3200	Laba Ditahan	MODAL	0	f	2025-12-22 01:05:31.052077+07	0	0	cash	2025-12-22 01:25:16.349274+07	3200	acc-3000	2	CREDIT	f	t	3200	\N	\N
acc-3300	Prive	MODAL	0	f	2025-12-22 01:05:31.052077+07	0	0	cash	2025-12-22 01:25:16.349274+07	3300	acc-3000	2	DEBIT	f	t	3300	\N	\N
acc-4010	Piutang Pelanggan	PENDAPATAN	0	f	2025-12-22 01:05:31.054221+07	0	0	cash	2025-12-22 01:25:16.349274+07	4010	acc-4000	2	CREDIT	f	t	4010	\N	\N
acc-4300	Pendapatan Lain-lain	PENDAPATAN	0	f	2025-12-22 01:05:31.054221+07	0	0	cash	2025-12-22 01:25:16.349274+07	4300	acc-4000	2	CREDIT	f	t	4300	\N	\N
acc-5100	HPP Bahan Baku	BEBAN	0	f	2025-12-22 01:05:31.056345+07	0	0	cash	2025-12-22 01:25:16.349274+07	5100	acc-5000	2	DEBIT	f	t	5100	\N	\N
acc-5200	HPP Tenaga Kerja	BEBAN	0	f	2025-12-22 01:05:31.056345+07	0	0	cash	2025-12-22 01:25:16.349274+07	5200	acc-5000	2	DEBIT	f	t	5200	\N	\N
acc-5300	HPP Overhead	BEBAN	0	f	2025-12-22 01:05:31.056345+07	0	0	cash	2025-12-22 01:25:16.349274+07	5300	acc-5000	2	DEBIT	f	t	5300	\N	\N
acc-6100	Beban Penjualan	BEBAN	0	f	2025-12-22 01:05:31.058881+07	0	0	cash	2025-12-22 01:25:16.349274+07	6100	acc-6000	2	DEBIT	t	t	6100	\N	\N
acc-1113	Bank Lainnya	ASET	0	t	2025-12-22 01:05:31.043068+07	0	0	cash	2025-12-22 01:25:16.349274+07	1113	acc-1100	3	DEBIT	f	t	1113	\N	\N
acc-2130	Utang Pajak	KEWAJIBAN	0	f	2025-12-22 01:05:31.046641+07	0	0	cash	2025-12-22 01:25:16.349274+07	2130	acc-2100	3	CREDIT	f	t	2130	\N	\N
acc-2140	Utang Bank	KEWAJIBAN	0	f	2025-12-22 01:05:31.046641+07	0	0	cash	2025-12-22 01:25:16.349274+07	2140	acc-2100	3	CREDIT	f	t	2140	\N	\N
acc-6110	Beban Gaji Sales	BEBAN	0	f	2025-12-22 01:05:31.058881+07	0	0	cash	2025-12-22 01:25:16.349274+07	6110	acc-6100	3	DEBIT	f	t	6110	\N	\N
acc-6120	Beban Transportasi	BEBAN	0	f	2025-12-22 01:05:31.058881+07	0	0	cash	2025-12-22 01:25:16.349274+07	6120	acc-6100	3	DEBIT	f	t	6120	\N	\N
acc-6130	Komisi Penjualan	BEBAN	0	f	2025-12-22 01:05:31.058881+07	0	0	cash	2025-12-22 01:25:16.349274+07	6130	acc-6100	3	DEBIT	f	t	6130	\N	\N
acc-6140	Beban Komisi Karyawan	BEBAN	0	f	2025-12-22 01:05:31.058881+07	0	0	cash	2025-12-22 01:25:16.349274+07	6140	acc-6100	3	DEBIT	f	t	6140	\N	\N
acc-6150	Beban Promosi	BEBAN	0	f	2025-12-22 01:05:31.058881+07	0	0	cash	2025-12-22 01:25:16.349274+07	6150	acc-6100	3	DEBIT	f	t	6150	\N	\N
acc-6280	Beli Material Water Treatment	BEBAN	0	f	2025-12-22 01:05:31.058881+07	0	0	cash	2025-12-22 01:25:16.349274+07	6280	acc-6200	3	DEBIT	f	t	6280	\N	\N
acc-1120	Kas Kecil	ASET	0	t	2025-12-22 01:05:31.043068+07	0	0	cash	2025-12-22 01:25:16.349274+07	1120	acc-1100	3	DEBIT	f	t	1120	\N	\N
acc-1130	BCA Kasmawati	ASET	0	t	2025-12-22 01:05:31.043068+07	0	0	cash	2025-12-22 01:25:16.349274+07	1130	acc-1100	3	DEBIT	f	t	1130	\N	\N
acc-1111	Bank BCA	ASET	0	t	2025-12-21 21:29:12.705772+07	0	0	cash	2025-12-22 01:25:16.349274+07	1111	acc-1100	3	DEBIT	f	t	1111	3c9f4cab-ae4d-4313-99b7-86be6a989771	\N
acc-1112	Bank Mandiri	ASET	0	t	2025-12-21 21:29:12.707807+07	0	0	cash	2025-12-22 01:25:16.349274+07	1112	acc-1100	3	DEBIT	f	t	1112	3c9f4cab-ae4d-4313-99b7-86be6a989771	\N
acc-6000	BEBAN OPERASIONAL	BEBAN	0	f	2025-12-21 21:29:12.701521+07	0	0	cash	2025-12-22 01:25:16.349274+07	6000	\N	1	DEBIT	t	t	6000	3c9f4cab-ae4d-4313-99b7-86be6a989771	\N
acc-1110	Kas Tunai	Aset	10000000	t	2025-12-21 21:29:12.703495+07	0	10000000	cash	2025-12-22 01:59:52.335863+07	1110	acc-1100	3	DEBIT	f	t	1110	3c9f4cab-ae4d-4313-99b7-86be6a989771	\N
acc-1440	Bangunan	ASET	9000000000	f	2025-12-22 01:05:31.043068+07	0	0	cash	2025-12-22 02:48:27.66813+07	1440	acc-1400	3	DEBIT	f	t	1440	\N	\N
acc-1300	Persediaan	ASET	0	f	2025-12-22 01:05:31.043068+07	0	0	cash	2025-12-22 01:25:16.349274+07	1300	acc-1000	2	DEBIT	t	t	1300	\N	\N
acc-6200	Beban Umum & Administrasi	BEBAN	0	f	2025-12-22 01:05:31.058881+07	0	0	cash	2025-12-22 01:25:16.349274+07	6200	acc-6000	2	DEBIT	t	t	6200	\N	\N
acc-1000	ASET	ASET	0	f	2025-12-21 21:29:12.688327+07	0	0	cash	2025-12-22 01:25:16.349274+07	1000	\N	1	DEBIT	t	t	1000	3c9f4cab-ae4d-4313-99b7-86be6a989771	\N
acc-2000	KEWAJIBAN	KEWAJIBAN	0	f	2025-12-21 21:29:12.695374+07	0	0	cash	2025-12-22 01:25:16.349274+07	2000	\N	1	CREDIT	t	t	2000	3c9f4cab-ae4d-4313-99b7-86be6a989771	\N
acc-3000	MODAL	MODAL	0	f	2025-12-21 21:29:12.697345+07	0	0	cash	2025-12-22 01:25:16.349274+07	3000	\N	1	CREDIT	t	t	3000	3c9f4cab-ae4d-4313-99b7-86be6a989771	\N
acc-4000	PENDAPATAN	PENDAPATAN	0	f	2025-12-21 21:29:12.699232+07	0	0	cash	2025-12-22 01:25:16.349274+07	4000	\N	1	CREDIT	t	t	4000	3c9f4cab-ae4d-4313-99b7-86be6a989771	\N
acc-5000	HARGA POKOK PENJUALAN	BEBAN	0	f	2025-12-22 01:05:31.056345+07	0	0	cash	2025-12-22 01:25:16.349274+07	5000	\N	1	DEBIT	t	t	5000	\N	\N
acc-1100	Kas dan Setara Kas	ASET	0	f	2025-12-21 21:29:12.690573+07	0	0	cash	2025-12-22 01:25:16.349274+07	1100	acc-1000	2	DEBIT	t	t	1100	3c9f4cab-ae4d-4313-99b7-86be6a989771	\N
acc-1200	Piutang	ASET	0	f	2025-12-21 21:29:12.69286+07	0	0	cash	2025-12-22 01:25:16.349274+07	1200	acc-1000	2	DEBIT	t	t	1200	3c9f4cab-ae4d-4313-99b7-86be6a989771	\N
acc-3100	Modal Pemilik	MODAL	0	f	2025-12-21 21:29:12.722626+07	0	0	cash	2025-12-22 01:25:16.349274+07	3100	acc-3000	2	CREDIT	f	t	3100	3c9f4cab-ae4d-4313-99b7-86be6a989771	\N
acc-4100	Pendapatan Penjualan	PENDAPATAN	0	f	2025-12-21 21:29:12.725308+07	0	0	cash	2025-12-22 01:25:16.349274+07	4100	acc-4000	2	CREDIT	f	t	4100	3c9f4cab-ae4d-4313-99b7-86be6a989771	\N
acc-1220	Piutang Karyawan	ASET	0	f	2025-12-22 01:05:31.043068+07	0	0	cash	2025-12-22 01:25:16.349274+07	1220	acc-1200	3	DEBIT	f	t	1220	\N	\N
acc-1310	Persediaan Bahan Baku	ASET	0	f	2025-12-22 01:05:31.043068+07	0	0	cash	2025-12-22 01:25:16.349274+07	1310	acc-1300	3	DEBIT	f	t	1310	\N	\N
acc-6210	Beban Gaji Karyawan	BEBAN	0	f	2025-12-22 01:05:31.058881+07	0	0	cash	2025-12-22 01:25:16.349274+07	6210	acc-6200	3	DEBIT	f	t	6210	\N	\N
acc-6220	Beban Listrik	BEBAN	0	f	2025-12-22 01:05:31.058881+07	0	0	cash	2025-12-22 01:25:16.349274+07	6220	acc-6200	3	DEBIT	f	t	6220	\N	\N
acc-6230	Beban Telepon	BEBAN	0	f	2025-12-22 01:05:31.058881+07	0	0	cash	2025-12-22 01:25:16.349274+07	6230	acc-6200	3	DEBIT	f	t	6230	\N	\N
acc-1210	Piutang Usaha	ASET	0	f	2025-12-21 21:29:12.717931+07	0	0	cash	2025-12-22 01:25:16.349274+07	1210	acc-1200	3	DEBIT	f	t	1210	3c9f4cab-ae4d-4313-99b7-86be6a989771	\N
acc-6240	Beban Penyusutan	BEBAN	0	f	2025-12-22 01:05:31.058881+07	0	0	cash	2025-12-22 01:25:16.349274+07	6240	acc-6200	3	DEBIT	f	t	6240	\N	\N
acc-6250	Beban Bayar Air	BEBAN	0	f	2025-12-22 01:05:31.058881+07	0	0	cash	2025-12-22 01:25:16.349274+07	6250	acc-6200	3	DEBIT	f	t	6250	\N	\N
acc-6270	Beban Ekspedisi/Shipping	BEBAN	0	f	2025-12-22 01:05:31.058881+07	0	0	cash	2025-12-22 01:25:16.349274+07	6270	acc-6200	3	DEBIT	f	t	6270	\N	\N
acc-1320	Persediaan Produk Jadi	ASET	0	f	2025-12-22 01:05:31.043068+07	0	0	cash	2025-12-22 01:25:16.349274+07	1320	acc-1300	3	DEBIT	f	t	1320	\N	\N
acc-1410	Peralatan Produksi	ASET	0	f	2025-12-22 01:05:31.043068+07	0	0	cash	2025-12-22 01:25:16.349274+07	1410	acc-1400	3	DEBIT	f	t	1410	\N	\N
acc-1420	Kendaraan	ASET	0	f	2025-12-22 01:05:31.043068+07	0	0	cash	2025-12-22 01:25:16.349274+07	1420	acc-1400	3	DEBIT	f	t	1420	\N	\N
acc-1430	Tanah	ASET	0	f	2025-12-22 01:05:31.043068+07	0	0	cash	2025-12-22 01:25:16.349274+07	1430	acc-1400	3	DEBIT	f	t	1430	\N	\N
acc-2110	Utang Usaha	KEWAJIBAN	0	f	2025-12-22 01:05:31.046641+07	0	0	cash	2025-12-22 01:25:16.349274+07	2110	acc-2100	3	CREDIT	f	t	2110	\N	\N
acc-2120	Utang Gaji	KEWAJIBAN	0	f	2025-12-22 01:05:31.046641+07	0	0	cash	2025-12-22 01:25:16.349274+07	2120	acc-2100	3	CREDIT	f	t	2120	\N	\N
\.


--
-- Data for Name: accounts_payable; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.accounts_payable (id, purchase_order_id, supplier_name, amount, due_date, description, status, created_at, paid_at, paid_amount, payment_account_id, notes, interest_rate, interest_type, creditor_type, branch_id) FROM stdin;
\.


--
-- Data for Name: advance_repayments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.advance_repayments (id, advance_id, amount, date, recorded_by) FROM stdin;
\.


--
-- Data for Name: asset_maintenance; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.asset_maintenance (id, asset_id, maintenance_date, maintenance_type, description, cost, performed_by, next_maintenance_date, status, notes, created_at, updated_at, branch_id, scheduled_date, title, completed_date, is_recurring, recurrence_interval, recurrence_unit, priority, estimated_cost, actual_cost, payment_account_id, payment_account_name, service_provider, technician_name, parts_replaced, labor_hours, work_performed, findings, recommendations, attachments, notify_before_days, notification_sent, created_by, completed_by) FROM stdin;
\.


--
-- Data for Name: assets; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.assets (id, name, code, category, purchase_date, purchase_price, current_value, depreciation_method, useful_life_years, salvage_value, location, status, notes, branch_id, created_at, updated_at, asset_code, description, supplier_name, brand, model, serial_number, condition, account_id, warranty_expiry, insurance_expiry, photo_url, created_by) FROM stdin;
5f0f58d9-6bef-467a-b5ad-26925a2023bc	Bangunan Pabrik	AST-46489494-RAY	building	2025-12-21	9000000000.00	9000000000.00	straight_line	5	0.00	Nabire	active	\N	2462d89d-5fb2-4cac-b241-85048af234be	2025-12-22 02:48:27.528556+07	2025-12-22 02:48:27.528556+07	AST-46489494-RAY		\N	Bangunan Pabrik	\N	\N	good	acc-1440	\N	\N	\N	\N
\.


--
-- Data for Name: attendance; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.attendance (id, employee_id, date, check_in, check_out, status, notes, branch_id, created_at, updated_at, user_id, check_in_time, check_out_time) FROM stdin;
\.


--
-- Data for Name: balance_adjustments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.balance_adjustments (id, account_id, adjustment_type, old_balance, new_balance, adjustment_amount, reason, reference_number, adjusted_by, adjusted_by_name, created_at, approved_by, approved_at, status) FROM stdin;
\.


--
-- Data for Name: bonus_pricings; Type: TABLE DATA; Schema: public; Owner: aquavit
--

COPY public.bonus_pricings (id, product_id, min_quantity, max_quantity, bonus_quantity, bonus_type, bonus_value, description, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: branches; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.branches (id, name, address, phone, is_main, created_at, updated_at, is_active, company_id, manager_id, manager_name, settings, code, email, city, province, postal_code, country) FROM stdin;
3c9f4cab-ae4d-4313-99b7-86be6a989771	Kantor Pusat	\N	\N	t	2025-12-21 22:46:41.288507+07	2025-12-21 22:46:41.288507+07	t	00000000-0000-0000-0000-000000000001	\N	\N	{}	PUSAT	\N	\N	\N	\N	Indonesia
2462d89d-5fb2-4cac-b241-85048af234be	AIR MINUM AQUVIT	\N	\N	f	2025-12-22 00:16:34.919884+07	2025-12-22 00:16:34.919884+07	t	00000000-0000-0000-0000-000000000001	\N	\N	{}	1130	\N	\N	\N	\N	Indonesia
\.


--
-- Data for Name: cash_history; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.cash_history (id, account_id, transaction_type, amount, description, reference_number, created_by, created_by_name, source_type, created_at, branch_id, type) FROM stdin;
\.


--
-- Data for Name: commission_entries; Type: TABLE DATA; Schema: public; Owner: aquavit
--

COPY public.commission_entries (id, user_id, user_name, role, product_id, product_name, quantity, rate_per_qty, amount, transaction_id, delivery_id, ref, status, created_at, branch_id) FROM stdin;
\.


--
-- Data for Name: commission_rules; Type: TABLE DATA; Schema: public; Owner: aquavit
--

COPY public.commission_rules (id, product_id, product_name, role, rate_per_qty, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: companies; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.companies (id, name, address, phone, email, tax_id, logo_url, created_at, updated_at, code, is_head_office, is_active) FROM stdin;
00000000-0000-0000-0000-000000000001	Aquvit Pusat	\N	\N	\N	\N	\N	2025-12-22 00:16:00.80991+07	2025-12-22 00:16:00.80991+07	HQ	t	t
\.


--
-- Data for Name: company_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.company_settings (key, value) FROM stdin;
test	test
company_name	PT. Persada Intim Pusaka
company_address	
company_phone	
company_logo	data:image/png;base64,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
company_latitude	-0.86476
company_longitude	134.0484635
company_attendance_radius	50
\.


--
-- Data for Name: customer_pricings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.customer_pricings (id, product_id, customer_id, customer_classification, price_type, price_value, priority, description, is_active, branch_id, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: customers; Type: TABLE DATA; Schema: public; Owner: aquavit
--

COPY public.customers (id, name, phone, address, "orderCount", "createdAt", latitude, longitude, full_address, store_photo_url, store_photo_drive_id, jumlah_galon_titip, branch_id, classification) FROM stdin;
52aacc22-31fd-434a-9d2f-e31672e2c2a0	Samedi	82189373523	-3.338583. 135.528535	0	2025-12-22 03:03:41.693023+07	-3.338583	135.528535	\N	Customers_Images/324fgf242Samedi.Foto Lokasi.124010.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
feb551d0-a010-4eb9-9efc-d8eea371233e	Mama fardan	85244763759	Asrama Kodim	0	2025-12-22 03:03:41.693023+07	-3.3378586	135.5323149	\N		\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
bc2657aa-4347-4eae-b665-8f2a2b8b55ab	Samelina Mundoni	82315104323		0	2025-12-22 03:03:41.693023+07	\N	\N	\N		\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
911356c4-6b42-473d-a093-5b5828886745	Mama Genesis	82199532606	jl.suci lorong 6	0	2025-12-22 03:03:41.693023+07	-3.3374643	135.5262303	\N		\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
208791ed-9d77-4d93-84c2-6be7ea0fef59	Cimma	85363896665	jl.suci lorong 6	0	2025-12-22 03:03:41.693023+07	-3.3375818	135.5267892	\N		\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
48bb7841-404e-48fe-9920-7ba4f27261e0	Mama Valery	81286224300	jl.ujung pandang	0	2025-12-22 03:03:41.693023+07	-3.3631116	135.5116582	\N		\N	5	2462d89d-5fb2-4cac-b241-85048af234be	\N
8a1b2217-9ffa-44b8-88cf-426a023049c1	Ibu Ela	82198098089	jl.surabaya	0	2025-12-22 03:03:41.693023+07	-3.366486	135.5108941	\N		\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
1d0e7e1d-679c-4378-a711-b3533cf8de2e	Ibu Azalya Murib	82139999880		0	2025-12-22 03:03:41.693023+07	-3.3833918	135.4878251	\N		\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
42f78dda-74e7-44f7-b0ac-7422521d02ec	Ibu Tamrin	85244833979	karang Mulia	0	2025-12-22 03:03:41.693023+07	-3.3697717	135.5086179	\N		\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
aa27220f-b978-400c-a1f1-0ca4e2424783	Pak Sukirman	82238239972	karang Tumaritis	0	2025-12-22 03:03:41.693023+07	-3.3823934	135.5061784	\N		\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
b851d855-41dc-49db-bff1-5d592602a883	Pak Abdul Telkomsel	82341031938	jl.Merdeka	0	2025-12-22 03:03:41.693023+07	-3.3669532	135.5051847	\N		\N	5	2462d89d-5fb2-4cac-b241-85048af234be	\N
8a237399-120c-413b-a787-bd890cc56f23	Mama jordi	82324760558	Grimulyo	0	2025-12-22 03:03:41.693023+07	-3.3863712	135.5087477	\N		\N	12	2462d89d-5fb2-4cac-b241-85048af234be	\N
b511f4d6-458c-4bb8-9fb0-7c6f7eca9e60	Pak Bari	81344580274	Grimulyo	0	2025-12-22 03:03:41.693023+07	-3.3848905	135.5096043	\N		\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
adb511ef-1552-4e01-bc0a-1396dae7c546	Pak Anes	81248163666	jl.Palu	0	2025-12-22 03:03:41.693023+07	-3.3569454	135.5114339	\N		\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
b06dde04-cb46-4b61-b787-13e3d3ae0e09	Pak Fatur Rachman	81296739967	jl. kendari	0	2025-12-22 03:03:41.693023+07	-3.3586956	135.5110205	\N		\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
5ecc6d7e-e1bf-49db-96c8-1d87c7c2a851	pak Herman	82346583971	Batalyon Karang	0	2025-12-22 03:03:41.693023+07	-3.39456	135.509279	\N		\N	25	2462d89d-5fb2-4cac-b241-85048af234be	\N
a9d2a356-cf51-4cb5-aaf1-00cb0d1acf93	mama Marlan	82198415915	jl.suci lorong 5	0	2025-12-22 03:03:41.693023+07	-3.3357362	135.5257529	\N		\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
901c2077-cbd2-47e2-9278-60aa7ecc833f	Ikan bakar jl. pemuda	82399512440	jl.Pemuda	0	2025-12-22 03:03:41.693023+07	-3.3639708	135.4984041	\N		\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
9b3e807c-0d6e-4c13-b213-288116302096	Ibu Mila	81232059957	jl.suci lorong 5	0	2025-12-22 03:03:41.693023+07	-3.3377953	135.5269143	\N		\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
5cc73832-fb69-4ec7-b60d-92b8e412e077	Pak Edwin	81343243013	kali mangga	0	2025-12-22 03:03:41.693023+07	-3.3341584	135.5325261	\N		\N	6	2462d89d-5fb2-4cac-b241-85048af234be	\N
96eaa6e2-7ded-468b-8c4c-4a75e3ec5ee0	Homestay snopy	81283332987	jl. Pemuda	0	2025-12-22 03:03:41.693023+07	-3.3620456	135.5000945	\N		\N	5	2462d89d-5fb2-4cac-b241-85048af234be	\N
646266e2-edb4-4978-82ed-2421faeab933	Enos Aquvit	82210585453		0	2025-12-22 03:03:41.693023+07	-3.3248755	135.5371915	\N		\N	8	2462d89d-5fb2-4cac-b241-85048af234be	\N
fa486b91-8d94-488a-852b-e18250e80a08	Kedai Qarny	81248198451	Jl. manggosidi oyehe	0	2025-12-22 03:03:41.693023+07	-3.3607961	135.5000322	\N		\N	8	2462d89d-5fb2-4cac-b241-85048af234be	\N
0b13ddf6-f734-49d0-9788-023c2633baa9	Pak Alex	82399769772	Sanoba Bawah	0	2025-12-22 03:03:41.693023+07	-3.3181863	135.5407337	\N		\N	5	2462d89d-5fb2-4cac-b241-85048af234be	\N
803d2ebf-1062-4125-a1b6-84b531e4baf8	Ibu Ester	81245670903	Sanoba Bawah	0	2025-12-22 03:03:41.693023+07	-3.3183309	135.5416094	\N		\N	5	2462d89d-5fb2-4cac-b241-85048af234be	\N
ad7ae998-0419-43f4-90b4-75d67d0461d4	Bapak Yumna	81344000959	Perumahan Sanoba	0	2025-12-22 03:03:41.693023+07	-3.3224304	135.5488068	\N		\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
d22c76a2-ea0b-48ea-b9e9-475541619ebe	Bapak Bambang	85322014203	Grimulyo	0	2025-12-22 03:03:41.693023+07	-3.3860847	135.5114895	\N		\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
03fef4c8-3967-4f62-aa96-8b670ecfd5e8	Laundry Yasin	81341373979	Lorong Pabrik tahu	0	2025-12-22 03:03:41.693023+07	-3.3462148	135.5137168	\N		\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
07891f5e-4b59-4029-9aa3-f4657d48b36e	Jemy Landa	82196795060	Kelapa 2 kalibobo	0	2025-12-22 03:03:41.693023+07	-3.3720222	135.4878546	\N		\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
7024e98b-38ea-454d-9bd9-791019a17552	Vallery Aquvit	82199110185	Sriwini	0	2025-12-22 03:03:41.693023+07	-3.3368923	135.5258135	\N		\N	5	2462d89d-5fb2-4cac-b241-85048af234be	\N
e1803a39-b0d2-476f-a67f-ddada5256394	Pak Didik	0852-9023-3798	Sriwini	0	2025-12-22 03:03:41.693023+07	-3.3430271	135.5217007	\N		\N	15	2462d89d-5fb2-4cac-b241-85048af234be	\N
6aa06e68-92e7-420d-b57e-27499250222e	Bengkel Samudra	82231751707	Nabarua	0	2025-12-22 03:03:41.693023+07	-3.3472554	135.5132357	\N		\N	5	2462d89d-5fb2-4cac-b241-85048af234be	\N
5a61e395-4bcf-4910-92a7-96418ba0e5b0	Jastip Sapapua	82198923093	Nabarua	0	2025-12-22 03:03:41.693023+07	-3.3505613	135.510587	\N		\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
389421d3-f047-4dae-984b-a71a41ee7c0d	Ibu Puspo	82397720836	Karang Mulia	0	2025-12-22 03:03:41.693023+07	-3.3669509	135.5033216	\N		\N	10	2462d89d-5fb2-4cac-b241-85048af234be	\N
8e2f38aa-deab-468a-a81e-2e4e28afbc63	Pak Haris	81399458991	Nabarua	0	2025-12-22 03:03:41.693023+07	-3.3497038	135.5273441	\N		\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
53954af0-faa3-4e3c-b742-640f918c81e4	Ibu Dinda As-Syafi'iyyah	82128843711	Nabarua	0	2025-12-22 03:03:41.693023+07	-3.3574615	135.5260402	\N		\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
2036601f-2a9c-4279-983c-92fa174e59e3	Ustadz Wahab	85231545694	kaliharapan	0	2025-12-22 03:03:41.693023+07	-3.3574615	135.5260402	\N		\N	5	2462d89d-5fb2-4cac-b241-85048af234be	\N
e076fe3c-3433-417a-bcfd-00b00bd5fd27	Kios Abizar	81342704748	Jl. Manggosidi oyehe	0	2025-12-22 03:03:41.693023+07	-3.3615659	135.4986558	\N		\N	5	2462d89d-5fb2-4cac-b241-85048af234be	\N
0b52deee-4ea2-49a8-b76b-6acad247595c	Ustad Hasan	82199934340	Jl. Palembang	0	2025-12-22 03:03:41.693023+07	-3.3668783	135.5080137	\N		\N	4	2462d89d-5fb2-4cac-b241-85048af234be	\N
dc683a36-bbb8-4a6d-8a6c-5bf7c57df5fb	Arema Variasi Mobil	81320599093	Kali Harapan	0	2025-12-22 03:03:41.693023+07	-3.3790495	135.5102782	\N		\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
607aa7ca-a706-4a52-8211-7792472dc43d	Kosan ancah	82199304428	Jl. Surabaya	0	2025-12-22 03:03:41.693023+07	-3.366654	135.5093156	\N		\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
cb07206b-fd53-4040-b67e-b942f5510098	Pak Sagian	81247713278	Karang Mulia	0	2025-12-22 03:03:41.693023+07	-3.3629322	135.5122657	\N		\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
02d10d09-51c5-41d6-a101-28c6ad847742	Pak Iwan	82199527272	Karang Mulia	0	2025-12-22 03:03:41.693023+07	-3.3663009	135.5081988	\N		\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
303d03c2-c27c-4c8f-adb7-a18a35616a27	Pak Ferry	81247685263	Karang Mulia	0	2025-12-22 03:03:41.693023+07	-3.3652205	135.5113031	\N		\N	4	2462d89d-5fb2-4cac-b241-85048af234be	\N
1aec1843-50d1-4949-add8-1f396b73793d	Ibu Ivana Hadi	82199566575	AURI	0	2025-12-22 03:03:41.693023+07	-3.3777642	135.5118939	\N		\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
1da9634c-6735-4fb7-96a0-571d72737b4d	Ibu Azizah	8124215609	Kota lama	0	2025-12-22 03:03:41.693023+07	-3.3690374	135.4954563	\N		\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
f9a7febf-2ca2-4607-ba5d-e6cc6b9b9630	Ibu Yul	82199949080	Kotalama	0	2025-12-22 03:03:41.693023+07	-3.3655606	135.4917468	\N		\N	5	2462d89d-5fb2-4cac-b241-85048af234be	\N
8791d07f-324b-4af8-9d68-0ce2837b0958	Ibu Rani	82350154862	Kelapa 2	0	2025-12-22 03:03:41.693023+07	-3.3692637	135.489414	\N		\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
d9d461d8-c2c5-436c-88a1-a4df4526354a	Iwan Kojo	85299519555	Smoker	0	2025-12-22 03:03:41.693023+07	-3.3437996	135.5169193	\N		\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
bade7d96-5dc3-42be-b8f1-af889cdf5080	Ibu Sayori	85254947600	Sanoba Atas	0	2025-12-22 03:03:41.693023+07	-3.3437996	135.5169193	\N		\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
3f220e8d-da55-40fe-b314-2eed43e4f86a	Dr. Ita Octawati. SpPK	85254115010	Sriwini	0	2025-12-22 03:03:41.693023+07	-3.3420859	135.5307787	\N		\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
3070a599-2a25-47bd-9a75-745d62a244c7	Kedai Suarasa	81311540000	Malompo	0	2025-12-22 03:03:41.693023+07	-3.3545041	135.5076785	\N		\N	5	2462d89d-5fb2-4cac-b241-85048af234be	\N
fadcd3fd-4d36-4049-b4be-b69c1e6cb8d3	Arriyadi Denzipur	82398862008	DENZIPUR	0	2025-12-22 03:03:41.693023+07	-3.3382525	135.5382694	\N		\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
e0fb67bf-66d7-4ef3-a9db-3609b14aa825	Radia	82198948182	Waharia	0	2025-12-22 03:03:41.693023+07	-3.3148586	135.5601773	\N		\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
deaaca59-579f-41ea-bf7d-85ac0c8b990c	Ibu Roni	82238982832	Air Mendidi	0	2025-12-22 03:03:41.693023+07	-3.2332252	135.5881786	\N		\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
45ab5cf6-bb6f-4f6b-a356-7da7da0d4b72	Jeni Waray	85272920874	Air Mendidi	0	2025-12-22 03:03:41.693023+07	-3.2393958	135.5735106	\N		\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
ccbad3d7-e344-4cf8-b5b0-7e6737944d61	Fadil Motor	81220656747	BMW	0	2025-12-22 03:03:41.693023+07	-3.388068	135.486597	\N	Customers_Images/cb40b66dFadil Motor.Foto Lokasi.002630.jpg	\N	10	2462d89d-5fb2-4cac-b241-85048af234be	\N
1f8e3752-06ef-472b-b0e7-9b8ab4d2067e	Showroom Jaya Abadi	82261080324	BMW	0	2025-12-22 03:03:41.693023+07	-3.38807	135.486601	\N	Customers_Images/5ffb86d1Showroom Jaya Abadi.Foto Lokasi.003206.jpg	\N	6	2462d89d-5fb2-4cac-b241-85048af234be	\N
77044e65-ca9c-478b-b38f-4db71a1079fa	Aroyan / Bengkel BMW	82316284851	BMW	0	2025-12-22 03:03:41.693023+07	-3.388222	135.486668	\N	Customers_Images/2e8265b6Aroyan.Foto Lokasi.003612.jpg	\N	2	2462d89d-5fb2-4cac-b241-85048af234be	\N
9cecf653-de99-499b-bfbb-79093f46e2d8	Klinik Arby Medika	81248490034	Sriwini	0	2025-12-22 03:03:41.693023+07	-3.346432	135.514147	\N	Customers_Images/89de5b6fKlinik Arby Medika.Foto Lokasi.005837.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
9fefbb0f-5dca-4c7c-8056-ff998d9e3f16	Kaka marjan	81296001298	BMW	0	2025-12-22 03:03:41.693023+07	-3.398775	135.47751	\N	Customers_Images/1900c0adKaka marjan.Foto Lokasi.010557.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
11ecbb63-fe3e-4c69-9be6-8e5d8695f4e8	Pak Purnomo	8124011622	SP3	0	2025-12-22 03:03:41.693023+07	-3.42905	135.471123	\N	Customers_Images/7f61809bPak Purnomo.Foto Lokasi.014048.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
b97b8acf-7173-4674-aac9-35dc263fe2c1	Ibu Surandi	82124725844	Jl. Batalyon	0	2025-12-22 03:03:41.693023+07	-3.394133	135.509565	\N	Customers_Images/6683c029Ibu Surandi.Foto Lokasi.014431.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
a4e04120-fe32-43eb-b4f3-0eaef28a5de2	Warsini	81240479111	SP3	0	2025-12-22 03:03:41.693023+07	-3.429477	135.470742	\N	Customers_Images/23867a0fWarsini.Foto Lokasi.014603.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
4cadf905-ec68-4769-8e18-82359e18fef3	Yusuf wijaya	82223535355	SP3	0	2025-12-22 03:03:41.693023+07	-3.429271	135.472364	\N	Customers_Images/9f2e7824Yusuf wijaya.Foto Lokasi.015259.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
1df216b2-fe3b-42b1-8b8c-43c478da73c3	Gunawan	82398918861	SP3	0	2025-12-22 03:03:41.693023+07	-3.429948	135.471382	\N	Customers_Images/99efbb31Gunawan.Foto Lokasi.015918.jpg	\N	5	2462d89d-5fb2-4cac-b241-85048af234be	\N
8a359665-9c01-4f4a-8a0a-1783bc72a1a6	Yaser	=+62 852-2222-1026	Kalibobo	0	2025-12-22 03:03:41.693023+07	-3.368672	135.486764	\N	Customers_Images/edec883aYaser.Foto Lokasi.020758.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
0fee3e11-82c4-4188-b845-0f4da027cbca	Ibu Ika	82238157149	Kalibobo	0	2025-12-22 03:03:41.693023+07	-3.370613	135.486553	\N	Customers_Images/3ad45f27Ibu Eka.Foto Lokasi.022449.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
d3707f1b-325b-4159-8cf1-0ab86b534a12	LIM Studio	85299238805	Nabarua	0	2025-12-22 03:03:41.693023+07	-3.345448	135.519579	\N	Customers_Images/bd393e80LIM Studio.Foto Lokasi.024613.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
4721c94d-3092-41da-918d-417eca5f2e44	Pak Heru	82199314749	Sriwini	0	2025-12-22 03:03:41.693023+07	-3.33958	135.529992	\N	Customers_Images/73b5280ePak Heru.Foto Lokasi.030107.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
47fd016b-1097-4d9a-a9b5-ec4d342f2427	Ibu Minten	82199345782	Karang Tumaritis	0	2025-12-22 03:03:41.693023+07	-3.375705	135.504895	\N	Customers_Images/b4b02269Ibu mite.Foto Lokasi.053752.jpg	\N	2	2462d89d-5fb2-4cac-b241-85048af234be	\N
d8b7e494-d26d-458e-a5f0-9ea86e03760f	Pak Toga	81357003332	Sanoba Atas	0	2025-12-22 03:03:41.693023+07	-3.323473	135.549359	\N	Customers_Images/e1097f50Pak Toga.Foto Lokasi.054226.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
3d7c6d52-708f-44d1-8185-7ee56fd836b0	Ibu hasna	82399954887	Jl. Yapis	0	2025-12-22 03:03:41.693023+07	-3.375948	135.50468	\N	Customers_Images/4d6793f6Ibu hasna.Foto Lokasi.055205.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
6fa0418d-06b9-4f34-8ad9-f2a556e0887d	Ibu Joko	81361951967	Waharia	0	2025-12-22 03:03:41.693023+07	-3.313209	135.560971	\N	Customers_Images/88d6aac6Ibu Joko.Foto Lokasi.055557.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
eea507b0-5ccb-4ae2-9d3b-c7eae1444483	Ibu SRI	82197695835	Waharia	0	2025-12-22 03:03:41.693023+07	-3.313158	135.560952	\N	Customers_Images/aafef3f7Ibu Neti Mesar.Foto Lokasi.060110.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
7c6d0043-f0c8-44c6-80a0-8fe36dc57140	Pak febri	82115296996	Grimulyo	0	2025-12-22 03:03:41.693023+07	-3.380523	135.513807	\N	Customers_Images/79b8cf73Pak febri.Foto Lokasi.060428.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
00c07fbc-3ec5-465c-8768-64e37b6a4b7d	Ibu Atisa	82398513392	Waharia	0	2025-12-22 03:03:41.693023+07	-3.313178	135.560911	\N	Customers_Images/25932ae6Ibu Atisa.Foto Lokasi.060446.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
af2716f8-9ac3-42e7-8d60-67378b4e4d56	Bapak Wili	85321783716	Waharia	0	2025-12-22 03:03:41.693023+07	-3.303049	135.567177	\N	Customers_Images/e1ca20c1Bapak Wili.Foto Lokasi.061926.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
83d9c1c5-0d8e-4846-adc4-bc7040eb21b4	Pak Umar	82350253900	Oyehe	0	2025-12-22 03:03:41.693023+07	-3.360124	135.500165	\N	Customers_Images/f7ef2c97Pak Umar.Foto Lokasi.062345.jpg	\N	11	2462d89d-5fb2-4cac-b241-85048af234be	\N
9f800add-7d6c-4ce5-958c-099875bc309e	Jumardin Aquvit	85244273184	Sanoba Dalam	0	2025-12-22 03:03:41.693023+07	-3.322333	135.547773	\N	Customers_Images/68467825Jumardin Aquvit.Foto Lokasi.063920.jpg	\N	2	2462d89d-5fb2-4cac-b241-85048af234be	\N
7d47497d-2668-40d7-b67a-cc45cfb80571	Warung sa suka	85254973978	Oyehe	0	2025-12-22 03:03:41.693023+07	-3.360884	135.497576	\N	Customers_Images/493b43b6Warung sa suka.Foto Lokasi.064924.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
f225a08d-b6ce-41b2-b8bd-c4355225b03a	Pak Sekda	81247875493	Sriwini	0	2025-12-22 03:03:41.693023+07	-3.34061	135.519844	\N	Customers_Images/72655d5fPak Sekda.Foto Lokasi.065657.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
c94ccdd4-8f90-4c34-acc1-986ff121341d	Ibu Manobi	82199111634	Oyehe	0	2025-12-22 03:03:41.693023+07	-3.363987	135.498254	\N	Customers_Images/a41ff112Ibu Manobi.Foto Lokasi.070613.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
d69f797d-bca6-43d4-a7c8-e336518ce118	Pak Nuzul	82220076777	Kotalama Aspol	0	2025-12-22 03:03:41.693023+07	-3.365879	135.49203	\N	Customers_Images/d88677faPak Nuzul.Foto Lokasi.074225.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
6f466f56-6fd4-4aa4-b5d9-bb225fe48bf2	Ibu Heri	82257557131	DENZIPUR	0	2025-12-22 03:03:41.693023+07	-3.338905	135.539738	\N	Customers_Images/9d2fac23Ibu Heri.Foto Lokasi.074747.jpg	\N	10	2462d89d-5fb2-4cac-b241-85048af234be	\N
25cb9a5e-0770-45e2-9d89-1d93be042861	Ibu Tina	82268312058	Kali Harapan	0	2025-12-22 03:03:41.693023+07	-3.357913	135.525433	\N	Customers_Images/b728c92aIbu Tina.Foto Lokasi.083907.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
d957b90a-b30e-4be3-9be7-65e9b6c749f5	Rahman	81240333354	Kali Harapan	0	2025-12-22 03:03:41.693023+07	-3.357917	135.525265	\N	Customers_Images/7b28d4f6Rahman.Foto Lokasi.084157.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
4a0d74fa-d562-4c57-8819-c10ad83e83f1	IBU UMI	81344622994	Kali Harapan	0	2025-12-22 03:03:41.693023+07	-3.358636	135.526088	\N	Customers_Images/e1c66b8cUmi Iwan.Foto Lokasi.084629.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
68963195-37ca-432d-b21f-244acc19a395	Mama Wawan	82190177818	Kali Harapan	0	2025-12-22 03:03:41.693023+07	-3.358502	135.5258	\N	Customers_Images/d6b9c449Mama Wawan.Foto Lokasi.084940.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
d7590da1-acd2-4fe3-aa7c-e2cc81bce3a9	Bapak Tadin	6285362030398	Kali Harapan	0	2025-12-22 03:03:41.693023+07	-3.359827	135.526203	\N	Customers_Images/c83285b1Bapak Tadin.Foto Lokasi.085952.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
2e449487-2946-408c-9fcf-01f77f4d4943	Hj. Suleha	81240364900	Kali Harapan	0	2025-12-22 03:03:41.693023+07	-3.359746	135.52622	\N	Customers_Images/f60da869Hj. Suleha.Foto Lokasi.090837.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
25051d30-aa22-44d2-a67f-1ef90116b186	Mama Kania ( Aziz )	81227229428	Kali Harapan	0	2025-12-22 03:03:41.693023+07	-3.358143	135.52601	\N	Customers_Images/b3e894ceMama Kania ( Aziz ).Foto Lokasi.091503.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
49fec346-810e-4a2a-a131-51610b7c8589	Pak allan	85240151589	JL.SUTOMO	0	2025-12-22 03:03:41.693023+07	-3.353763	135.510487	\N	Customers_Images/13674773Pak allan.Foto Lokasi.002948.jpg	\N	3	2462d89d-5fb2-4cac-b241-85048af234be	\N
f4584afb-3c6f-4074-963f-2474b28ba555	Ibu Wulan	85244965555	Malompo	0	2025-12-22 03:03:41.693023+07	-3.354251	135.509813	\N	Customers_Images/2500c8c9Ibu Wulan.Foto Lokasi.003705.jpg	\N	3	2462d89d-5fb2-4cac-b241-85048af234be	\N
9d182329-4581-4530-951c-cb312faa662f	Kantor Spill	85255972737	SANOBA ATAS	0	2025-12-22 03:03:41.693023+07	-3.354541	135.510456	\N	Customers_Images/86279c2bKantor Spill.Foto Lokasi.004154.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
2e879fcb-e0ec-4974-8590-17ef8ca79528	Amusi Bimos	81354002475	JL.SAMRATULANGI	0	2025-12-22 03:03:41.693023+07	-3.354866	135.509931	\N	Customers_Images/224ecd4aAmusi Bimos.Foto Lokasi.005620.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
e1d57996-1420-4c9f-84c8-7db4e2d8b94c	Ibu Rati Agung	81227626862	SMOKER ATAS	0	2025-12-22 03:03:41.693023+07	-3.343831	135.517883	\N	Customers_Images/60d4d258Ibu Rati Agung.Foto Lokasi.010856.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
098139fb-b631-4950-a35b-6e941f8a304c	Bu Elka	811421438	Jl. Jayapura	0	2025-12-22 03:03:41.693023+07	-3.357604	135.51017	\N	Customers_Images/48567ba8Bu Elka.Foto Lokasi.013111.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
d327fe0d-907a-4429-a2d8-61f08c5fd7f9	RN Call	82301075329	Grimulyo	0	2025-12-22 03:03:41.693023+07	-3.380608	135.507047	\N	Customers_Images/c2aa9b89RN Call.Foto Lokasi.015043.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
ac33be74-29f7-47f4-9777-d53a2a95ffda	Kaka Ida	81265167475	Grimulyo	0	2025-12-22 03:03:41.693023+07	-3.385058	135.50898	\N	Customers_Images/062493f7Kaka Ida.Foto Lokasi.021534.jpg	\N	4	2462d89d-5fb2-4cac-b241-85048af234be	\N
28555fdf-8a45-45ed-9fee-00a0abc90583	Kantor inspektorat ( Dio )	81336250618	Karang Tumaritis	0	2025-12-22 03:03:41.693023+07	-3.37451	135.505477	\N	Customers_Images/f823de18Kantor inspektorat ( Dio ).Foto Lokasi.025832.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
a5c2b9a2-b125-4e7f-8bf2-20049734a7b4	Ibu Paula	8124849555	Sriwini	0	2025-12-22 03:03:41.693023+07	-3.344423	135.518451	\N	Customers_Images/f1d4a979Ibu Paula.Foto Lokasi.031739.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
545a6e74-0e3e-4a07-a098-c2f3f0538c5c	Mama Gress	82239337099	KALI MANGGA	0	2025-12-22 03:03:41.693023+07	-3.331653	135.530706	\N	Customers_Images/c164b806Mama Gress.Foto Lokasi.032605.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
a2c175cd-bf9e-4666-9b9a-db61ba848065	Raja ( 106 Kodim )	81247710215	ASRAMA KODIM	0	2025-12-22 03:03:41.693023+07	-3.337859	135.531308	\N	Customers_Images/1a105ee6Raja ( 106 Kodim ).Foto Lokasi.033416.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
be76d7dd-809f-4132-a1c0-fcd9c2297ca9	PAK JERRY HADI	82397544322	Malompo	0	2025-12-22 03:03:41.693023+07	-3.351495	135.513227	\N	Customers_Images/a12049aaJerry Hadi.Foto Lokasi.060054.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
2e74adb4-eee5-494c-a7ba-459849dc6141	Mama inglia	85142961998	Smoker	0	2025-12-22 03:03:41.693023+07	-3.34409	135.518395	\N	Customers_Images/b44101dbMama inglia.Foto Lokasi.061251.jpg	\N	5	2462d89d-5fb2-4cac-b241-85048af234be	\N
984ba2c2-2e06-4d2a-a56a-d43a486c3ff2	PAK IDE	82199317343	SD KIMI	0	2025-12-22 03:03:41.693023+07	-3.286443	135.573383	\N	Customers_Images/12d80723Ibu Paide SD Kimi.Foto Lokasi.064040.jpg	\N	5	2462d89d-5fb2-4cac-b241-85048af234be	\N
95c378eb-94e9-4a72-9e11-0ca4663d6e5d	Ibu Susan	82110683804	SANOBA,DEPAN GEDO	0	2025-12-22 03:03:41.693023+07	-3.310965	135.546307	\N	Customers_Images/94259c7aIbu Susan.Foto Lokasi.065540.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
ae2d0157-3096-4383-b3ef-71d2d9026959	Bengkel adri	81240523583	SP3	0	2025-12-22 03:03:41.693023+07	-3.430639	135.461866	\N	Customers_Images/de3723c9Bengkel adri.Foto Lokasi.070359.jpg	\N	5	2462d89d-5fb2-4cac-b241-85048af234be	\N
60dbc5d7-3b73-4771-9753-c9eb48d9ee4e	Pak Rudy	85255972733	Sanoba Bawah	0	2025-12-22 03:03:41.693023+07	-3.316365	135.543785	\N	Customers_Images/31657543Pak Rudy.Foto Lokasi.071447.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
eb8be6d0-263f-4298-94b2-67d7cf193d4d	Ibu Sarnawiya	82165706590	Kali Harapan	0	2025-12-22 03:03:41.693023+07	-3.359102	135.526645	\N	Customers_Images/86494c6fIbu Sarnawiya.Foto Lokasi.080414.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
8ede8313-86ed-4f00-a6ac-36c121f03701	Ibu Devi	=+62 823-2052-2462	Kali Harapan	0	2025-12-22 03:03:41.693023+07	-3.35894	135.52669	\N	Customers_Images/b5204284Ibu Devi.Foto Lokasi.080918.jpg	\N	3	2462d89d-5fb2-4cac-b241-85048af234be	\N
5a674931-830b-4d65-9e1f-04ca82b7b087	PAK YOGA	82248115547	Jl. Robert Wolter Monginsidi	0	2025-12-22 03:03:41.693023+07	-3.361758	135.498528	\N	Customers_Images/ef5b2345Yoga.Foto Lokasi.083506.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
998f9b2c-a8cb-467d-add2-11d696b218ad	Pak Usman	81344025662	Samabusa	0	2025-12-22 03:03:41.693023+07	-3.232764	135.588133	\N	Customers_Images/d4b0f50cPak Usman.Foto Lokasi.013251.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
468ec8c1-72fc-4507-adee-de942edd5a5e	Laundry kasih manis	85244777506	Sambusa	0	2025-12-22 03:03:41.693023+07	-3.232846	135.587888	\N	Customers_Images/3079d503Laundry kasih manis.Foto Lokasi.014327.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
9903be19-2004-40bf-8540-6f60906ed9bc	Qiyas call	82238045636	Samabusa	0	2025-12-22 03:03:41.693023+07	-3.22635	135.592575	\N	Customers_Images/74209c80Qiyas call.Foto Lokasi.020138.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
f017c3fd-026c-4b8f-acf4-7e9f43f58f3c	Ibu Setiawan	82239582393	DENZIPUR	0	2025-12-22 03:03:41.693023+07	-3.33943	135.539739	\N	Customers_Images/49fa4fa2Ibu Setiawan.Foto Lokasi.023440.jpg	\N	14	2462d89d-5fb2-4cac-b241-85048af234be	\N
c8b2aab9-d749-4026-bfc8-4c5f6fbf424e	Pak Aris Denzipur	81381606912	DENZIPUR	0	2025-12-22 03:03:41.693023+07	-3.338893	135.539267	\N	Customers_Images/07e57e7ePak Aris Denzipur.Foto Lokasi.044557.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
78c2dfa9-201e-463f-9ae2-0d7dc6aa7eda	Kosan ancah	82238019773	JL.SURABAYA	0	2025-12-22 03:03:41.693023+07	-3.366581	135.509297	\N	Customers_Images/a3980ddcKosan ancah.Foto Lokasi.045538.jpg	\N	1	2462d89d-5fb2-4cac-b241-85048af234be	\N
82954304-8256-4f00-928f-f90cb12828dc	Pak Erwin denzipur	81311940528	DENZIPUR	0	2025-12-22 03:03:41.693023+07	-3.339179	135.539497	\N	Customers_Images/060885acPak Erwin denzipur.Foto Lokasi.045913.jpg	\N	5	2462d89d-5fb2-4cac-b241-85048af234be	\N
79148008-9a57-4533-b73f-3adf3adfa898	Homestay Swis	8114191898	JL.MEDY TONAPA,TAPIOKA	0	2025-12-22 03:03:41.693023+07	-3.343826	135.524629	\N	Customers_Images/1c3f1655Homestay Swis.Foto Lokasi.052544.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
c7ffd99b-11b9-4c3c-ac84-2f97ec83e7c8	KAKA ANI	82129608491	Karang Tumaritis	0	2025-12-22 03:03:41.693023+07	-3.381696	135.506323	\N	Customers_Images/e7a0ee6dIbu Ani.Foto Lokasi.053413.jpg	\N	11	2462d89d-5fb2-4cac-b241-85048af234be	\N
30775ede-474a-41e4-b17f-35077a09c3ac	Ibu Ani	82132820244	Kali Harapan	0	2025-12-22 03:03:41.693023+07	-3.358949	135.525965	\N	Customers_Images/4e5edb69Ibu Ani.Foto Lokasi.061150.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
78606494-2336-4c56-965f-7f1c51360775	Om Andi	82293137618	Kali Harapan	0	2025-12-22 03:03:41.693023+07	-3.358999	135.52585	\N	Customers_Images/69d13b54Om Andi.Foto Lokasi.061710.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
797d8f41-cd33-46d4-800b-dd2f39398b37	Ibu Shanna	82239638143	Kali Harapan	0	2025-12-22 03:03:41.693023+07	-3.358805	135.526267	\N	Customers_Images/5f616a8aIbu Shanna.Foto Lokasi.062513.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
e1ebb1cc-cb25-48f8-929c-581a9eedce2b	Rusli	81222174149	Kali Harapan	0	2025-12-22 03:03:41.693023+07	-3.358551	135.525972	\N	Customers_Images/ba65894bRusli.Foto Lokasi.063408.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
031b535e-2d93-4ad7-b7bf-ce3dd3e0da55	Ibu mel	82197713252	Kelapa 2	0	2025-12-22 03:03:41.693023+07	-3.373819	135.485715	\N	Customers_Images/9fe2ab68Ibu mel.Foto Lokasi.065430.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
f8c81854-0f9c-4fc8-ac04-46766ca66617	MRP Nabire	82396001298	Jl. Mandala	0	2025-12-22 03:03:41.693023+07	-3.383873	135.482857	\N	Customers_Images/5e98c947MRP Nabire.Foto Lokasi.070734.jpg	\N	10	2462d89d-5fb2-4cac-b241-85048af234be	\N
379e0d4d-429b-43da-b444-aa54418d6b6c	Pak Yudha	=+62 857-3304-1033	Jl. Semarang	0	2025-12-22 03:03:41.693023+07	-3.36911	135.509358	\N	Customers_Images/f499e882Pak Yudha.Foto Lokasi.071302.jpg	\N	2	2462d89d-5fb2-4cac-b241-85048af234be	\N
b6dcbc11-76ea-45dc-82a7-d818fc190818	Pak Muis	=+62 853-4445-8899	Jl. Tumaritis	0	2025-12-22 03:03:41.693023+07	-3.379995	135.504267	\N	Customers_Images/b4eb8ed2Pak Muis.Foto Lokasi.073402.jpg	\N	8	2462d89d-5fb2-4cac-b241-85048af234be	\N
1449231a-b165-4c48-8f29-ef1abf274b58	Pak Tedy	81259671782	Sanoba Bawah	0	2025-12-22 03:03:41.693023+07	-3.324197	135.535877	\N	Customers_Images/5430bcaaPak Tedy.Foto Lokasi.235739.jpg	\N	10	2462d89d-5fb2-4cac-b241-85048af234be	\N
984a6a6f-99cf-4387-8e02-054fdf76f85e	Ibu Ema	81216101556	Kalibobo	0	2025-12-22 03:03:41.693023+07	-3.363523	135.489064	\N	Customers_Images/c76e9ac2Ibu Ema.Foto Lokasi.000043.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
aabdd6a6-fb6b-4a4c-87d2-a05c68cc807c	Ibu Suhardi	82239311819	Waharia	0	2025-12-22 03:03:41.693023+07	-3.31722	135.556635	\N	Customers_Images/db9814d5Ibu Suhardi.Foto Lokasi.003020.jpg	\N	3	2462d89d-5fb2-4cac-b241-85048af234be	\N
852a038b-94e2-4a2d-a42d-9375e43737e2	Ibu Jihan	82259646751	Waharia	0	2025-12-22 03:03:41.693023+07	-3.310741	135.553929	\N	Customers_Images/2745b2a3Ibu Jihan.Foto Lokasi.003942.jpg	\N	5	2462d89d-5fb2-4cac-b241-85048af234be	\N
371d740a-8a53-45f9-a044-197e59ed2f87	Ibu Tia	82248690609	Kalibobo	0	2025-12-22 03:03:41.693023+07	-3.376231	135.477549	\N	Customers_Images/39d82e74Ibu Tia.Foto Lokasi.004529.jpg	\N	5	2462d89d-5fb2-4cac-b241-85048af234be	\N
b6d42bbb-3291-4281-a0da-91aad4361c0c	Ibu Dini	82398264403	Waharia	0	2025-12-22 03:03:41.693023+07	-3.313877	135.559602	\N	Customers_Images/b756dbcfIbu Dini.Foto Lokasi.005341.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
1f33ff3d-0b5b-4957-a95c-212ebbe208bd	Mama Lawang	8221131697	Kalibobo	0	2025-12-22 03:03:41.693023+07	-3.383791	135.475562	\N	Customers_Images/2fbaa848Mama Lawang.Foto Lokasi.010558.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
2679c339-9db4-4dd9-b1a1-85f3f5e58dc1	Bengkel Tzhan	85216927123	Kimi	0	2025-12-22 03:03:41.693023+07	-3.28619	135.574497	\N	Customers_Images/3ea66839Bengkel Tzhan.Foto Lokasi.010722.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
6cca298b-8778-469a-acfc-a6b17ec63e2f	Bapak Arifin	81247198260	Kimi	0	2025-12-22 03:03:41.693023+07	-3.27324	135.572091	\N	Customers_Images/f087eb3aBapak Arifin.Foto Lokasi.011533.jpg	\N	10	2462d89d-5fb2-4cac-b241-85048af234be	\N
386d1e55-d780-4cdd-8a75-d1e128d8e853	Misel	81245885939	Grimulyo	0	2025-12-22 03:03:41.693023+07	-3.387621	135.508394	\N	Customers_Images/84ddc4b4Misel.Foto Lokasi.015943.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
9871cb12-c78b-4b57-bf37-b314f601c54a	Gorengan Samabusa	81259599567	Samabusa	0	2025-12-22 03:03:41.693023+07	-3.230297	135.592552	\N	Customers_Images/b191a666Gorengan Samabusa.Foto Lokasi.023018.jpg	\N	5	2462d89d-5fb2-4cac-b241-85048af234be	\N
4a088886-1649-4df6-8598-8a70c21b3b40	Pak Deni	82248018831	JL.JAKARTA	0	2025-12-22 03:03:41.693023+07	-3.361443	135.508057	\N	Customers_Images/7a2cd705Pak Deni.Foto Lokasi.043039.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
deb98ef2-fcba-4df3-baab-731bbe108c1d	Budi motor	82198269917	Karang Mulia	0	2025-12-22 03:03:41.693023+07	-3.372773	135.509587	\N	Customers_Images/f0d3ef04Budi motor.Foto Lokasi.050415.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
682530bf-9965-4986-822f-797c1fab8d7c	Pak Mustofa	85243209677	Sanoba Atas	0	2025-12-22 03:03:41.693023+07	-3.327337	135.547742	\N	Customers_Images/654075eaPak Mustofa.Foto Lokasi.052948.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
6260dcab-d6d3-42e3-b10a-afb47108b5fa	Laundry Gia	85344590308	Kali Harapan	0	2025-12-22 03:03:41.693023+07	-3.359369	135.525602	\N	Customers_Images/ce4ba60fLaundry Gia.Foto Lokasi.055051.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
43b13d85-2611-422b-9aff-9d6c62635af0	Pak Sandy	81344100060	Jl. Medan	0	2025-12-22 03:03:41.693023+07	-3.368417	135.511825	\N	Customers_Images/48ea2c74Pak Sandy.Foto Lokasi.062510.jpg	\N	5	2462d89d-5fb2-4cac-b241-85048af234be	\N
d2a6b539-e424-4d83-b158-f479f1584d13	Wawan	82110068824	Smoker	0	2025-12-22 03:03:41.693023+07	-3.341267	135.51866	\N	Customers_Images/46f43ef6Wawan.Foto Lokasi.000127.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
09721ccf-1d50-4b76-88c5-d193377f3ea3	Pak Hardiknas pencucian mobil	85314926644	Smoker	0	2025-12-22 03:03:41.693023+07	-3.341781	135.518677	\N	Customers_Images/191514b4Pak Hardiknas pencucian mobil.Foto Lokasi.000859.jpg	\N	3	2462d89d-5fb2-4cac-b241-85048af234be	\N
d3dc8f95-f011-4f9a-b2ed-bb42401bf7e1	Soraya	81344749429	Smoker	0	2025-12-22 03:03:41.693023+07	-3.342583	135.515825	\N	Customers_Images/2fcfd2fdSoraya.Foto Lokasi.002031.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
efd300e0-99ad-405b-b8fd-575fa6bf7d80	Mama kenan	82293845911	Grimulyo	0	2025-12-22 03:03:41.693023+07	-3.38474	135.510698	\N	Customers_Images/1d0e11deMama kenan.Foto Lokasi.010636.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
7c7a398f-ff69-4d1f-bcc1-48012c888a42	Ibu murni kantor bina marga	82398972963	Jl. Merdeka	0	2025-12-22 03:03:41.693023+07	-3.369242	135.50657	\N	Customers_Images/0fb04e24Ibu murni kantor bina marga.Foto Lokasi.013024.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
e555c018-7e6e-4a8b-b8dd-be2c6984297d	Ibu Hasbi Bina Marga	82334143142	Jl. Merdeka	0	2025-12-22 03:03:41.693023+07	-3.369203	135.506744	\N	Customers_Images/f2bbfae4Ibu Hasbi Bina Marga.Foto Lokasi.013237.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
354cb9a9-158a-49a1-ac30-0a21abf9c095	Hj. Nurhayati	85240690325	Karang Tumaritis	0	2025-12-22 03:03:41.693023+07	-3.380768	135.503449	\N	Customers_Images/55d332b4Hj. Nurhayati.Foto Lokasi.014855.jpg	\N	10	2462d89d-5fb2-4cac-b241-85048af234be	\N
4858845f-3207-493f-956b-9370d3580fb2	Jastip Gadai	85217749599	Kali Bobo	0	2025-12-22 03:03:41.693023+07	-3.366498	135.486877	\N	Customers_Images/bc601d08Jastip Gadai.Foto Lokasi.021030.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
e020934c-cba0-4452-a074-e75477734125	Kios Fatimah ( DeaRafa )	81344226678	Morgo Pantai	0	2025-12-22 03:03:41.693023+07	-3.363412	135.490279	\N	Customers_Images/efaba92bKios Fatimah ( DeaRafa ).Foto Lokasi.022726.jpg	\N	7	2462d89d-5fb2-4cac-b241-85048af234be	\N
9610314f-bcf9-435b-a7bf-a5ddaf8f0eca	Khaliky	81344609378	Sriwini	0	2025-12-22 03:03:41.693023+07	-3.340341	135.529045	\N	Customers_Images/bdd42c71Khaliky.Foto Lokasi.025215.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
1a0a1958-9dcd-4af3-bf5f-84adca238e53	Mama raja	85254445320	Grimulyo	0	2025-12-22 03:03:41.693023+07	-3.381469	135.507904	\N	Customers_Images/1556220fMama raja.Foto Lokasi.074208.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
3bd9638c-66eb-4132-9208-3a7ce454022f	Kota Bali	82260924355	Pasar SP	0	2025-12-22 03:03:41.693023+07	-3.442636	135.448001	\N	Customers_Images/9934173dKota Bali.Foto Lokasi.000750.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
2d0ca51a-a14b-4e02-81e2-eba33807e368	kios maria	85299293919	Smoker	0	2025-12-22 03:03:41.693023+07	-3.342959	135.518389	\N	Customers_Images/f2aa9e77Ria.Foto Lokasi.001012.jpg	\N	4	2462d89d-5fb2-4cac-b241-85048af234be	\N
3a0c3023-7979-4ef0-b3a5-34c0d5642f6e	Pak Nasir	81240445677	Samabusa	0	2025-12-22 03:03:41.693023+07	-3.227474	135.589209	\N	Customers_Images/b4133ce6Pak Nasir.Foto Lokasi.012558.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
2fcbe325-ccbe-4977-b39b-01b6d60e2953	Pandiani Senandi	81240101004	Samabusa	0	2025-12-22 03:03:41.693023+07	-3.238208	135.585453	\N	Customers_Images/ce9a7026Pandiani Senandi.Foto Lokasi.014306.jpg	\N	10	2462d89d-5fb2-4cac-b241-85048af234be	\N
8d690311-0287-4e08-9c74-08647a121e6f	Evellin	82259805516	Samabusa	0	2025-12-22 03:03:41.693023+07	-3.24296	135.58312	\N	Customers_Images/b2b93cdbEvellin.Foto Lokasi.015903.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
eb1206c5-ec0f-4dc6-b70e-b27283e92bd5	Pak Hamzah	62 851-9713-0260	Sriwini	0	2025-12-22 03:03:41.693023+07	-3.33893	135.529591	\N	Customers_Images/cd47fd34Pak Hamzah.Foto Lokasi.051825.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
92387a16-a56d-42b7-a117-fe6ae17c44f9	Ibu Rosi ( kosan Pak Iwan )	85229334718	Karang Mulia	0	2025-12-22 03:03:41.693023+07	-3.366575	135.508225	\N	Customers_Images/cc06b938Ibu Rosi ( kosan Pak Iwan ).Foto Lokasi.054823.jpg	\N	3	2462d89d-5fb2-4cac-b241-85048af234be	\N
037930a5-15f0-45fb-b548-cbbd85d47eb3	Ibu Aisyah ( Kosan Pak Iwan )	82278578567	Karang Mulia	0	2025-12-22 03:03:41.693023+07	-3.366544	135.508193	\N	Customers_Images/7f7988e6Ibu Aisyah ( Kosan Pak Iwan ).Foto Lokasi.055335.jpg	\N	2	2462d89d-5fb2-4cac-b241-85048af234be	\N
90f7a891-66e1-47c8-a0b9-da562e389b51	Dian ( Kosan Pak Iwan )	85317680740	Karang Mulia	0	2025-12-22 03:03:41.693023+07	-3.366549	135.508161	\N	Customers_Images/cbd4ddefDian ( Kosan Pak Iwan ).Foto Lokasi.055610.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
6ae68e36-bc39-49b7-9597-429ef0ee19e1	Angle ( Clara )	85282596255	Kota Lama	0	2025-12-22 03:03:41.693023+07	-3.364574	135.493073	\N	Customers_Images/c658f89cAngle ( Clara ).Foto Lokasi.061210.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
701d53af-5f19-4a5f-8d62-7e38af97b94e	Pak malik	81299286668	KPR	0	2025-12-22 03:03:41.693023+07	-3.348732	135.527895	\N	Customers_Images/76b3e709Pak malik.Foto Lokasi.021852.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
c89b8f1d-8414-4d44-9ea3-47300ecc427f	Ibu ayu	0821-3038-0403	Denzipur	0	2025-12-22 03:03:41.693023+07	-3.339226	135.539549	\N	Customers_Images/564f371fIbu ayu.Foto Lokasi.005457.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
69d2c470-547c-44b2-92a5-10c081517d66	Pak Siagian	81247713278	Belakang GSI	0	2025-12-22 03:03:41.693023+07	-3.363005	135.51227	\N	Customers_Images/e7335464Pak Siagian.Foto Lokasi.011548.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
271e0acc-10cf-4312-b528-c28b4a61ffb6	Sahal	0813-4099-7672	Polda	0	2025-12-22 03:03:41.693023+07	-3.363913	135.501217	\N	Customers_Images/b960a573Sahal.Foto Lokasi.013444.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
cd01703f-3b74-4f5a-8af4-babc671f841b	Hadi AURI	82198611415	Jln Ampera AURI	0	2025-12-22 03:03:41.693023+07	-3.377669	135.511925	\N	Customers_Images/a864834eHadi AURI.Foto Lokasi.021658.jpg	\N	10	2462d89d-5fb2-4cac-b241-85048af234be	\N
858d9eb0-2ece-442e-9113-633373a9667c	Ibu sari	0822-3844-4376	Gang 25	0	2025-12-22 03:03:41.693023+07	-3.368443	135.509032	\N	Customers_Images/cf93dc0dIbu sari.Foto Lokasi.025208.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
71dd6fc0-7d1b-435c-b923-51f6e7c0a6a6	Ibu melani	81395440794	Bina marga	0	2025-12-22 03:03:41.693023+07	-3.368792	135.506462	\N	Customers_Images/d41a8747Ibu melani.Foto Lokasi.030513.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
474baa9c-416a-4a53-bf84-97c1500f3468	Ibu farida	81343462412	X harapan	0	2025-12-22 03:03:41.693023+07	-3.359557	135.52678	\N	Customers_Images/4e365b9dIbu farida.Foto Lokasi.052920.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
ba93dbc5-fc1f-443a-89a9-f4fd57bc44ac	Suster ici	85254912099	X harapan	0	2025-12-22 03:03:41.693023+07	-3.358698	135.526598	\N	Customers_Images/23d0fb9dSuster ici.Foto Lokasi.053415.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
42069edf-0fd4-4fb3-8624-15e7412cdc88	Fatul aquvit	0851-9700-3208	X harapan	0	2025-12-22 03:03:41.693023+07	-3.357783	135.526306	\N	Customers_Images/bd458b0bFatul aquvit.Foto Lokasi.053855.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
ad56f390-a5b2-4e9e-b0a8-463060c15787	Ibu sinar	85354862212	X harapan	0	2025-12-22 03:03:41.693023+07	-3.35854	135.526165	\N	Customers_Images/53155524Ibu sinar.Foto Lokasi.055216.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
68fee516-1b78-4f8e-bea3-a61a2b12e16a	Ibu Mia	81347502269	X harapan	0	2025-12-22 03:03:41.693023+07	-3.358855	135.526039	\N	Customers_Images/dda14991Ibu Mia.Foto Lokasi.055912.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
8adfe635-132b-41a0-bf06-c7089a0ac190	Ibu halija	82398862008	X harapan	0	2025-12-22 03:03:41.693023+07	-3.358988	135.525947	\N	Customers_Images/dd20271bIbu halija.Foto Lokasi.060421.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
031ff45c-7df6-468c-b29e-27902d2e04eb	Mama bilqis	82239638143	X harapan	0	2025-12-22 03:03:41.693023+07	-3.359249	135.526188	\N	Customers_Images/28dcdb07Mama bilqis.Foto Lokasi.061314.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
26fcbf44-2eb3-46ab-96dd-d0c35ad7822d	Panca niaga	81277000171	Oyehe	0	2025-12-22 03:03:41.693023+07	-3.357788	135.502486	\N	Customers_Images/cfd89ac4Panca niaga.Foto Lokasi.065105.jpg	\N	10	2462d89d-5fb2-4cac-b241-85048af234be	\N
18f96c4b-18ce-4f07-8100-240623d4e1b2	Ibu romba	82181210036	Kelapa dua	0	2025-12-22 03:03:41.693023+07	-3.369256	135.489461	\N	Customers_Images/549eb41aIbu romba.Foto Lokasi.071508.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
15d3af6d-81fb-4861-812f-c79b3f035581	Pak angga	81344124365	Kelapa dua	0	2025-12-22 03:03:41.693023+07	-3.36927	135.489402	\N	Customers_Images/0c8b3993Pak angga.Foto Lokasi.072046.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
fb9c3b81-3bac-4b31-9cf7-a754d6cda137	Pak jarung	82310761396	Kepala dua	0	2025-12-22 03:03:41.693023+07	-3.369271	135.489398	\N	Customers_Images/5b7cc907Pak jarung.Foto Lokasi.072749.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
e3eb7c79-ef4d-430f-9504-5fb5de55c3c7	Mama nugi	81251847922	Kelapa dua	0	2025-12-22 03:03:41.693023+07	-3.369321	135.489288	\N	Customers_Images/74463936Mama nugi.Foto Lokasi.072820.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
b028fd13-b7bc-498b-af5b-1f43b3440d28	Ibu Erni	.......	Kelapa dua	0	2025-12-22 03:03:41.693023+07	-3.369361	135.489613	\N	Customers_Images/c31a64acIbu Erni.Foto Lokasi.073737.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
9b1eddde-5b8b-4422-a749-aad5b76e10b6	Afdal	82148200538	Kelapa dua	0	2025-12-22 03:03:41.693023+07	-3.369249	135.489491	\N	Customers_Images/ab8c8b96Afdal.Foto Lokasi.074419.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
1d16b531-3e49-4748-98ce-5706521a34f0	Mama wana	82191636563	Kelapa dua	0	2025-12-22 03:03:41.693023+07	-3.369409	135.489503	\N	Customers_Images/c925ecc9Mama wana.Foto Lokasi.074709.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
543d63b0-1073-430b-aab8-8e6c2b8ce649	Ibu jean	0821-1650-7410	Perumahan graha	0	2025-12-22 03:03:41.693023+07	-3.371814	135.48669	\N	Customers_Images/0fd93eebIbu jean.Foto Lokasi.080055.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
cd422bbe-9493-466a-a921-c09f89d395a7	Sekolah insan mandiri	81240091994	Depan zipur	0	2025-12-22 03:03:41.693023+07	-3.337413	135.536467	\N	Customers_Images/4ee0da5bSekolah insan mandiri.Foto Lokasi.011629.jpg	\N	7	2462d89d-5fb2-4cac-b241-85048af234be	\N
fe6ce265-8036-415a-a2c6-284ea00fece4	Haji akmar	0812-4888-222	Belakang bakso rudal	0	2025-12-22 03:03:41.693023+07	-3.361144	135.506022	\N	Customers_Images/ac3b1557Haji akmar.Foto Lokasi.014103.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
3c774a16-8fcc-41b6-98e6-703049ca5701	Ibu kasma	81240302236	Kosan pak iwan	0	2025-12-22 03:03:41.693023+07	-3.366298	135.508192	\N	Customers_Images/30e69deaIbu kasma.Foto Lokasi.015130.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
8eb4188e-2017-498e-92dd-373436ea1c08	Pak sudirman	82248814401	Kosan pak iwan	0	2025-12-22 03:03:41.693023+07	-3.366288	135.508178	\N	Customers_Images/d348289fPak sudirman.Foto Lokasi.015301.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
a7e52092-ac87-4d2c-85e2-1127337acb91	Ibu amy	85354202020	Dpn aula maranatha	0	2025-12-22 03:03:41.693023+07	-3.349926	135.513415	\N	Customers_Images/ab6bbd98Ibu amy.Foto Lokasi.023448.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
d029970e-9f7b-4f32-bcd4-c9f1d8b23136	Mama wahyu	82198965939	Pasar sore	0	2025-12-22 03:03:41.693023+07	-3.344672	135.526126	\N	Customers_Images/5529bc6bMama wahyu.Foto Lokasi.025429.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
f6509d07-cd7a-4c9e-b8a6-4211bfb925c7	Kk rahma	81344609378	Samping hotel ria	0	2025-12-22 03:03:41.693023+07	-3.340415	135.528965	\N	Customers_Images/40d8dd87Kk rahma.Foto Lokasi.030304.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
b4523edd-c595-49c1-ad72-a2ac4d813977	Pak hasan gorengan kusuma	0852-5454-4065	Kusuma bangsa lampu merah	0	2025-12-22 03:03:41.693023+07	-3.358904	135.506167	\N	Customers_Images/76a2095dPak hasan gorengan kusuma.Foto Lokasi.031919.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
4f734cb4-176c-4d6b-9c6a-2638c4a6d793	Sultan	81233227131	Smoker	0	2025-12-22 03:03:41.693023+07	-3.342474	135.51532	\N	Customers_Images/3ad5780bSultan.Foto Lokasi.052938.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
6321afca-e461-4e15-a040-546d40ed5f01	Bengkel Fadil motor	81291423425	Bmw	0	2025-12-22 03:03:41.693023+07	-3.388024	135.486606	\N	Customers_Images/005c19a2Bengkel Fadil motor.Foto Lokasi.053349.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
d9fde72e-19bf-4325-b1fb-1fee12723ffb	Berkah papua	82198489907	Sp3	0	2025-12-22 03:03:41.693023+07	-3.428331	135.469855	\N	Customers_Images/a962c454Berkah papua.Foto Lokasi.061506.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
fe7e5fc0-e93d-480e-a600-7902cefb3603	Yusuf layuk	81231461424	Smoker	0	2025-12-22 03:03:41.693023+07	-3.34596	135.518243	\N	Customers_Images/acd015c9Yusuf layuk.Foto Lokasi.071239.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
2b7b1e38-3d1a-49a4-8a6d-6648663606b6	Hj Ramlah	85343298311	Smoker	0	2025-12-22 03:03:41.693023+07	-3.344258	135.517187	\N	Customers_Images/3fda6767Hj Ramlah.Foto Lokasi.071832.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
e865fb63-b4d7-4ad5-bdd2-d5154d53642d	Betamax	81247430680	Kusuma bangsa	0	2025-12-22 03:03:41.693023+07	-3.360415	135.503837	\N	Customers_Images/14e8328bBetamax.Foto Lokasi.075749.jpg	\N	4	2462d89d-5fb2-4cac-b241-85048af234be	\N
3a7b308c-25b1-4a8a-8a41-5dc1ad10c8c9	Telur kimi	82199558169	Kimi bawa	0	2025-12-22 03:03:41.693023+07	-3.276677	135.566802	\N	Customers_Images/09b84237Telur kimi.Foto Lokasi.092259.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
a7e0fcaa-c394-4d99-a10d-2ceb4e9183c7	Suarasa	81311540000	Depan k24	0	2025-12-22 03:03:41.693023+07	-3.354603	135.507717	\N	Customers_Images/53d73b15Suarasa.Foto Lokasi.092442.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
ada8b4cf-8b6c-4d17-8c75-dbb34a52d2ad	Pak yohan	82248820249	Jln surabaya, komplek ibu ella	0	2025-12-22 03:03:41.693023+07	-3.3664	135.510978	\N	Customers_Images/5a0d72e1Pak yohan.Foto Lokasi.000516.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
494c767e-2e51-4eae-95b4-176e5782c592	Pak Fuad	0853-4298-7773	Belakang yapis	0	2025-12-22 03:03:41.693023+07	-3.374148	135.51249	\N	Customers_Images/06eba750Pak Fuad.Foto Lokasi.002036.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
b728a904-4ca6-4bb1-9deb-91d107caa1a2	Ibu feny	82198917107	Samping hadi malompo	0	2025-12-22 03:03:41.693023+07	-3.351547	135.513306	\N	Customers_Images/21593b0aIbu feny.Foto Lokasi.003857.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
cf11da2c-af39-4027-b5b6-b058fddc4a05	Pak sekda	85283539953	Pasar smoker	0	2025-12-22 03:03:41.693023+07	-3.340808	135.519825	\N	Customers_Images/c0545a4fPak sekda.Foto Lokasi.004806.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
b1374da5-4cac-48a7-8176-56e070449927	F&F	82238444844	Siriwini	0	2025-12-22 03:03:41.693023+07	-3.337502	135.528108	\N	Customers_Images/4a9a2dabF&F.Foto Lokasi.010136.jpg	\N	5	2462d89d-5fb2-4cac-b241-85048af234be	\N
fbe9d6e9-0e32-4557-b240-70f3778677a3	Nenek jumardin	0852-7392-2034	Sanoba	0	2025-12-22 03:03:41.693023+07	-3.321551	135.54895	\N	Customers_Images/24d66318Nenek jumardin.Foto Lokasi.014356.jpg	\N	5	2462d89d-5fb2-4cac-b241-85048af234be	\N
06dd32f9-f4d2-45d9-bf33-542006a9c48f	Ibu Ida	8124215609	Kota lama	0	2025-12-22 03:03:41.693023+07	-3.368786	135.495535	\N	Customers_Images/795b41e9Ibu Ida.Foto Lokasi.052727.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
ac39baa3-519b-4409-89d4-6472d73369e0	Ibu wati	81240983420	X harapan	0	2025-12-22 03:03:41.693023+07	-3.35855	135.525826	\N	Customers_Images/75733c0aIbu wati.Foto Lokasi.060237.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
47f9bd85-d967-457f-973b-e9e1e0a480eb	Ibu mariati	82397774015	X harapan	0	2025-12-22 03:03:41.693023+07	-3.358409	135.525654	\N	Customers_Images/0a009729Ibu mariati.Foto Lokasi.062206.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
e284d215-0806-4ac9-bbf7-0b330e0ecd6e	Pak wawi	81240293949	X harapan	0	2025-12-22 03:03:41.693023+07	-3.359407	135.525637	\N	Customers_Images/b347a80fPak wawi.Foto Lokasi.063956.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
c2a36d7a-2fe2-4d36-8552-566cb1de4ee9	Pak aldi	82238202929	Jln surabaya, belakang SMP PGRI	0	2025-12-22 03:03:41.693023+07	-3.366621	135.50927	\N	Customers_Images/6e0fb979Pak aldi.Foto Lokasi.074235.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
57aa558a-8daf-4986-8c56-c222b11a7ada	Wasilomata	82261590052	Jln kusuma bangsa	0	2025-12-22 03:03:41.693023+07	-3.357956	135.507623	\N	Customers_Images/6d1be6cfWasilomata.Foto Lokasi.000301.jpg	\N	10	2462d89d-5fb2-4cac-b241-85048af234be	\N
3218f59b-928e-487d-8bc6-e0eae77e5c0c	Bunda kodim	82199347818	Kodim	0	2025-12-22 03:03:41.693023+07	-3.375762	135.505412	\N	Customers_Images/bc140bafBunda kodim.Foto Lokasi.003206.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
a9e96aa3-3c84-496c-98c4-73aa61654da4	Ibu lupita	82137372769	Lorong SMK 2 wadio	0	2025-12-22 03:03:41.693023+07	-3.397408	135.481843	\N	Customers_Images/e9d3b5eaIbu lupita.Foto Lokasi.005941.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
bd960e2d-2c4c-48b2-9d8e-80f459b91667	Ibu ronal	85244358283	Bina marga	0	2025-12-22 03:03:41.693023+07	-3.369283	135.506658	\N	Customers_Images/306d0033Ibu ronal.Foto Lokasi.013902.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
71eb1ee0-8eb3-473c-8a8a-0b53ab885bd0	Ibu titi	0822-9748-2226	Samping akper	0	2025-12-22 03:03:41.693023+07	-3.358463	135.505172	\N	Customers_Images/37ec6d6fIbu titi.Foto Lokasi.045612.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
d35cf3d0-9ce4-493e-99e2-7a1e6dbb9318	Mertua geby	82199348433	Samabusa	0	2025-12-22 03:03:41.693023+07	-3.225218	135.589372	\N	Customers_Images/00ba477cMertua geby.Foto Lokasi.045951.jpg	\N	5	2462d89d-5fb2-4cac-b241-85048af234be	\N
39009f4c-e161-47a9-a94d-ab2d62cd1091	Ibu klerin	82192543843	Samabusa	0	2025-12-22 03:03:41.693023+07	-3.226475	135.592467	\N	Customers_Images/1d95e68aIbu klerin.Foto Lokasi.052036.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
3955345b-3f31-4fe6-85c0-3f174d94d31f	Ilham samabusa	82115833650	Belka samabusa	0	2025-12-22 03:03:41.693023+07	-3.233186	135.594371	\N	Customers_Images/dd59bfc3Ilham samabusa.Foto Lokasi.053028.jpg	\N	5	2462d89d-5fb2-4cac-b241-85048af234be	\N
f13c99e0-a78b-48b7-a543-943322973669	Mama Fathin/toko tengah	82299665599	Sp3	0	2025-12-22 03:03:41.693023+07	-3.428661	135.468586	\N	Customers_Images/349f3b5dMama Fathin-toko tengah.Foto Lokasi.082536.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
1a56511d-d97e-4ecf-8e53-64485415f5b9	Mama ayuni	85299293919	Smoker	0	2025-12-22 03:03:41.693023+07	0	0	\N	Customers_Images/d5ed54e0Mama ayuni.Foto Lokasi.012107.jpg	\N	1	2462d89d-5fb2-4cac-b241-85048af234be	\N
e5c5f6a1-c2b7-4543-bdb4-7cc50db9ef5f	Mama tio	82398014378	Mes amp	0	2025-12-22 03:03:41.693023+07	0	0	\N	Customers_Images/8161a2f4Mama tio.Foto Lokasi.032230.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
b1874ce0-3f2c-4faf-87d7-8344374c8e60	Ibu dini	82398264403	Waharia home stay D'FLOW	0	2025-12-22 03:03:41.693023+07	-3.314125	135.55954	\N	Customers_Images/c171cae2Ibu dini.Foto Lokasi.043634.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
775a4db4-ad37-485a-a822-5b3215bc86e6	Ibu wakita	82238548311	Sp3 depan pak gunawan	0	2025-12-22 03:03:41.693023+07	-3.429729	135.471214	\N	Customers_Images/b84a09a5Ibu wakita.Foto Lokasi.065231.jpg	\N	4	2462d89d-5fb2-4cac-b241-85048af234be	\N
b9958f19-44ed-470f-b2b1-feb5052afabf	Merta buana	82199600221	BMW	0	2025-12-22 03:03:41.693023+07	-3.389638	135.489044	\N	Customers_Images/19d9cb78Merta buana.Foto Lokasi.072045.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
b8904ec4-48fc-46b5-b4df-fa35afb595ee	Tante nadi		Karang	0	2025-12-22 03:03:41.693023+07	-3.380819	135.503346	\N	Customers_Images/c981440aTante nadi.Foto Lokasi.073852.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
9e016049-5693-4e4b-a35d-06cb86fc62a7	Haji majid	81226181911	Karang	0	2025-12-22 03:03:41.693023+07	-3.380818	135.503364	\N	Customers_Images/ba622d5fHaji majid.Foto Lokasi.075646.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
9109b06c-48fc-4da6-92f8-9ee911574399	Ibu ita	81324574641	X harapan	0	2025-12-22 03:03:41.693023+07	-3.358118	135.525247	\N	Customers_Images/75ec38b1Ibu ita.Foto Lokasi.083332.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
66adee3f-c566-474f-8dd0-a9e26f69529c	Pak baktiar	82165706590	X harapan	0	2025-12-22 03:03:41.693023+07	-3.359158	135.526519	\N	Customers_Images/05cf055fPak baktiar.Foto Lokasi.085017.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
caa2fe9e-410e-4a86-a6cf-67f744731be6	Ibu putri	85136280355	X harapan	0	2025-12-22 03:03:41.693023+07	-3.358909	135.526471	\N	Customers_Images/43dac81aIbu putri.Foto Lokasi.085342.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
f938c365-d140-4352-8b4a-8dce8ac9e8da	Mama sindi	81367286839	X harapan	0	2025-12-22 03:03:41.693023+07	-3.3578	135.525992	\N	Customers_Images/6c79b31cMama sindi.Foto Lokasi.112212.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
506d75a2-71d1-417a-81ed-dec723373933	Pos polda	81340443858	Polda	0	2025-12-22 03:03:41.693023+07	0	0	\N	Customers_Images/ed1d122bPos polda.Foto Lokasi.031411.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
9e211452-f0b1-4759-8281-ac80b452815c	Mama Al	82315651299	Depn home stay matiroan	0	2025-12-22 03:03:41.693023+07	0	0	\N	Customers_Images/d2a58729Mama Al.Foto Lokasi.031509.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
98cad04e-8396-41f2-ab53-baff85fa68bb	Mama zahra	85312993501	Depn home stay matiroan	0	2025-12-22 03:03:41.693023+07	0	0	\N	Customers_Images/7d8c3737Mama zahra.Foto Lokasi.031803.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
28ca8d64-1dd1-4c74-887a-dea14281db14	Ibu Nan	8	Xharapan	0	2025-12-22 03:03:41.693023+07	-3.359268	135.525776	\N	Customers_Images/e84905bfIbu Nan.Foto Lokasi.034322.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
0340d95e-594a-4ce7-8d39-68e5f8f8567f	Mama kembar	81285723261	Xharapan	0	2025-12-22 03:03:41.693023+07	-3.358333	135.525987	\N	Customers_Images/f49119d8Mama kembar.Foto Lokasi.035817.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
b23796a0-8e34-4b81-985e-6d7fff6dbd71	Pak Gama	81240080789	Perumahan kaya raya grimulyo	0	2025-12-22 03:03:41.693023+07	-3.381389	135.513233	\N	Customers_Images/d7358450Pak Gama.Foto Lokasi.043855.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
9026cb87-3754-43b9-ba57-a6b213863507	Bengkel cahaya bone motor	82199109545	Depan bank papua	0	2025-12-22 03:03:41.693023+07	-3.360895	135.498945	\N	Customers_Images/b6bc1e80Bengkel cahaya bone motor.Foto Lokasi.052926.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
ab7df830-b680-43a5-b734-72d3b2b429b8	Hadi oyehe	82246171560	Oyehe depn bank papua	0	2025-12-22 03:03:41.693023+07	-3.360375	135.499412	\N	Customers_Images/780d5b38Hadi oyehe.Foto Lokasi.061114.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
ee2bc4f6-abdd-4afa-b050-94a218c9e8ae	Pak lamuttu	81344356507	Pasar Kalibobo	0	2025-12-22 03:03:41.693023+07	-3.365995	135.487994	\N	Customers_Images/91934b53Pak lamuttu.Foto Lokasi.065034.jpg	\N	5	2462d89d-5fb2-4cac-b241-85048af234be	\N
8518300d-3230-4da0-b147-335544acdf7a	Pak surandi	82124725844	Batalion	0	2025-12-22 03:03:41.693023+07	-3.394312	135.509563	\N	Customers_Images/271fab0aPak surandi.Foto Lokasi.071928.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
2e9402f2-d287-4123-a4d1-4d34057d4d63	Pak diaz	85244254600	Ekspedisi	0	2025-12-22 03:03:41.693023+07	-3.334395	135.539485	\N	Customers_Images/d96540bfPak diaz.Foto Lokasi.075028.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
746d2604-e7bd-41e8-8805-b0ae7834ca43	Ibu laode	82121820001	Asrama Kodim	0	2025-12-22 03:03:41.693023+07	-3.337901	135.532059	\N	Customers_Images/35bfcb2dIbu laode.Foto Lokasi.080553.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
9b070874-dafa-4975-8961-64e22a327ca4	Ibu udinina	81247710215	Asrama kodim 106	0	2025-12-22 03:03:41.693023+07	-3.33786	135.531273	\N	Customers_Images/d2f09321Ibu udinina.Foto Lokasi.081031.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
f1834c94-0ecd-4a40-bc37-0ac53cacb82c	Muh. Aska	0823-4833-7963	Waharia	0	2025-12-22 03:03:41.693023+07	-3.312965	135.5616	\N	Customers_Images/7e6e6493Muh. Aska.Foto Lokasi.092106.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
1f2575fa-0be6-4aea-95d6-df6349f0e93b	Pak yahya	0812-4027-4272	Karang	0	2025-12-22 03:03:41.693023+07	-3.376873	135.503106	\N	Customers_Images/04a8d7bfPak yahya.Foto Lokasi.002216.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
77d2ce2a-4ef1-41b0-b543-7f3c27118843	Ibu hengki kodim	85263523985	Kodim	0	2025-12-22 03:03:41.693023+07	-3.376015	135.504743	\N	Customers_Images/402c14c7Ibu hengki kodim.Foto Lokasi.002933.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
b59d6050-5986-4eae-b4f9-a6c5df8b1a59	Ibu Parto	82199451000	Kodim	0	2025-12-22 03:03:41.693023+07	-3.375879	135.504893	\N	Customers_Images/7781f950Ibu Parto.Foto Lokasi.003212.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
6efd84c4-d208-4a1b-a23f-5c17f07cd759	Ibu cici	81324040175	Bina marga	0	2025-12-22 03:03:41.693023+07	-3.369045	135.506277	\N	Customers_Images/cd7323f1Ibu cici.Foto Lokasi.010940.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
aa2ca3c4-e36d-45d4-8147-9d8dcf919080	Ibu Nia	85256356636	Jln surabaya, kompleks ibu Ella	0	2025-12-22 03:03:41.693023+07	-3.366573	135.510905	\N	Customers_Images/97db56aeIbu Nia.Foto Lokasi.011146.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
f716b6d5-5860-4459-99a6-af46ebeee1d1	Pak haggi	85250847185	Samping borobudur	0	2025-12-22 03:03:41.693023+07	-3.341425	135.529782	\N	Customers_Images/38e8915fPak haggi.Foto Lokasi.034222.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
c5f0869f-a502-416b-be59-8263571d1839	Hadi malompo	82397544322	Malompo	0	2025-12-22 03:03:41.693023+07	-3.351243	135.513893	\N	Customers_Images/38b00033Hadi malompo.Foto Lokasi.034246.jpg	\N	20	2462d89d-5fb2-4cac-b241-85048af234be	\N
dabd2899-64bf-4495-b448-28b555896b72	Pak Anca	85244489456	Kosan samping SPM pgri	0	2025-12-22 03:03:41.693023+07	-3.366571	135.509309	\N	Customers_Images/50b28718Pak Anca.Foto Lokasi.035550.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
5eb2e077-7e50-4ba5-a168-398f9bc9bcff	DOUBLE C	8123008069	Depan bank papua	0	2025-12-22 03:03:41.693023+07	-3.360495	135.499087	\N	Customers_Images/c668f105DOUBLE C.Foto Lokasi.073235.jpg	\N	10	2462d89d-5fb2-4cac-b241-85048af234be	\N
0ebeb831-6413-4eb7-bf87-5cc7ef04ebd2	Misrina	0812-7052-4997	Bina marga	0	2025-12-22 03:03:41.693023+07	0	0	\N	Customers_Images/27ec9914Misrina.Foto Lokasi.003324.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
f128e4be-1262-4da2-aaca-2515c78e7f26	Ibu lili		Basarnas	0	2025-12-22 03:03:41.693023+07	-3.313013	135.560896	\N	Customers_Images/35427a41Ibu lili.Foto Lokasi.004309.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
773fcb1a-95fb-4dd4-afa5-56cba3f0c6c3	Pak iskandar	81240479111	Sp3 jalur 3	0	2025-12-22 03:03:41.693023+07	-3.428832	135.4715	\N	Customers_Images/95665889Pak iskandar.Foto Lokasi.005607.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
69d0e020-fe46-4172-8c56-d7bbd0d60283	Ibu ani suruan	82238118840	Samping mama wahyu	0	2025-12-22 03:03:41.693023+07	0	0	\N	Customers_Images/74f8b8e6Ibu ani suruan.Foto Lokasi.024810.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
6528c1c8-360d-4dc9-b071-7e12e431c73c	Ibu ira	+62 853-3456-9898	Kelapa dua	0	2025-12-22 03:03:41.693023+07	-3.369115	135.489003	\N	Customers_Images/a3c19b5fIbu ira.Foto Lokasi.084455.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
a8a1b5fd-3f61-4100-b4ef-2a6f19b0abf0	Ibu rahmi	82197762604	Belakang gor penjahit mesuara	0	2025-12-22 03:03:41.693023+07	-3.365676	135.493642	\N	Customers_Images/f0de7998Ibu rahmi.Foto Lokasi.095601.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
3811ab37-ef6d-4c66-af5c-4124a97f3c28	Ibu tien	82148202242	KPR	0	2025-12-22 03:03:41.693023+07	-3.34978	135.527429	\N	Customers_Images/59e6274cIbu tien.Foto Lokasi.023959.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
4694b91c-b083-4480-8345-f16caad59949	Kios aurora	85344770555	Smoker	0	2025-12-22 03:03:41.693023+07	0	0	\N	Customers_Images/40eff623Kios aurora.Foto Lokasi.002751.jpg	\N	10	2462d89d-5fb2-4cac-b241-85048af234be	\N
b62c02f2-27ff-401f-bdcd-afe965301ca5	Pak Ismail	85343834382	Sp3 jalur 4	0	2025-12-22 03:03:41.693023+07	0	0	\N	Customers_Images/5a4e1c81Pak Ismail.Foto Lokasi.023329.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
d311ca4a-54b1-4ea7-81fe-3a7c9f5d009b	Apk rahmat polisi	85244911906	Depan lembaga	0	2025-12-22 03:03:41.693023+07	0	0	\N	Customers_Images/6ecbab68Apk rahmat polisi.Foto Lokasi.001516.jpg	\N	5	2462d89d-5fb2-4cac-b241-85048af234be	\N
7e96f3a7-34fa-4dfc-922d-e4624c7925bf	Haji ridwan	81248716661	Kota lama	0	2025-12-22 03:03:41.693023+07	0	0	\N	Customers_Images/8f6a5aeeHaji ridwan.Foto Lokasi.035246.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
ea1edfb1-f64d-4243-86cc-9291a645c19e	Haji ridwan	81248716616	Kota lama	0	2025-12-22 03:03:41.693023+07	0	0	\N	Customers_Images/41281538Haji ridwan.Foto Lokasi.035408.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
c1a50e35-ffb2-4d01-a7a6-5aaa2c5b7365	Pak andi	82189869077	Jln topo samping kios amira	0	2025-12-22 03:03:41.693023+07	0	0	\N	Customers_Images/0b26f5a5Pak andi.Foto Lokasi.043543.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
50497a51-605a-4480-9b0c-0ea4a8859b80	Ibu langgeng	85354031423	Sp3	0	2025-12-22 03:03:41.693023+07	-3.430217	135.473744	\N	Customers_Images/8597bd57Ibu langgeng.Foto Lokasi.072717.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
79b534ed-e5ef-4fed-b015-1658dc956d45	Mama kiki	85244150826	Sp3	0	2025-12-22 03:03:41.693023+07	-3.43019	135.472775	\N	Customers_Images/3f5c0f9eMama kiki.Foto Lokasi.090405.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
73e7d901-e4b6-437e-afdc-a48e83181af5	Mama naya	81240839304	Sp3	0	2025-12-22 03:03:41.693023+07	-3.431376	135.470808	\N	Customers_Images/6faf0ebbMama naya.Foto Lokasi.090442.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
68a217cb-7e9a-458b-b57f-58c817c5e0ab	Ammi	+62 853-5420-2020	Nabarua Depan Aula Maranatha	0	2025-12-22 03:03:41.693023+07	-3.349939	135.513539	\N	Customers_Images/af7e75f0Ammi.Foto Lokasi.022717.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
e9e6c7df-a41e-4892-b065-79ed7d4da736	Mama Qila	+62 813-1415-2483	Girimulyo	0	2025-12-22 03:03:41.693023+07	-3.38549	135.510013	\N	Customers_Images/1d577a06Mama Qila.Foto Lokasi.044824.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
47214217-4174-46da-83de-ed9f93d2a2fd	Kk ira jama	+62 852-8888-9225	Tapioka	0	2025-12-22 03:03:41.693023+07	-3.342327	135.520397	\N	Customers_Images/52463a59Kk ira jama.Foto Lokasi.003556.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
e50bde27-b681-42f2-886d-6f189672746f	Kantor satwas Nabire	81247212349	Depn PT gunung selatan	0	2025-12-22 03:03:41.693023+07	-3.347003	135.519822	\N	Customers_Images/f22ade78Kantor satwas Nabire.Foto Lokasi.010415.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
97c13c55-370f-4de8-bd0a-bd8217e9a04f	Pak yudi	81344032239	Bina marga	0	2025-12-22 03:03:41.693023+07	-3.368981	135.506484	\N	Customers_Images/00330ea3Pak yudi.Foto Lokasi.235442.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
88957dc9-b619-441a-a6f4-2d1a6b4e8a75	Ibu nadia	82199995451	Kalibobo belkng Futsal	0	2025-12-22 03:03:41.693023+07	-3.376776	135.503581	\N	Customers_Images/b05d2678Ibu nadia.Foto Lokasi.234539.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
44e12717-95f3-47e2-80ce-520ec331a480	Ta awun	8124058116	Sp3	0	2025-12-22 03:03:41.693023+07	-3.430768	135.470612	\N	Customers_Images/f6c27540Ta awun.Foto Lokasi.072142.jpg	\N	20	2462d89d-5fb2-4cac-b241-85048af234be	\N
2b1f8af5-1b74-4862-a002-e64476e5f559	Pak eko	82335340212	Dpn kelurahan	0	2025-12-22 03:03:41.693023+07	-3.3872	135.493345	\N	Customers_Images/9a2d98a6Pak eko.Foto Lokasi.080259.jpg	\N	6	2462d89d-5fb2-4cac-b241-85048af234be	\N
5496d297-05a5-4c55-ad46-383ea0e197d1	Ibu arum	85254915668	Gang 25	0	2025-12-22 03:03:41.693023+07	-3.368596	135.50882	\N	Customers_Images/30c66a63Ibu arum.Foto Lokasi.233612.jpg	\N	0	2462d89d-5fb2-4cac-b241-85048af234be	\N
\.


--
-- Data for Name: deliveries; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.deliveries (id, transaction_id, delivery_number, delivery_date, photo_url, photo_drive_id, notes, created_at, updated_at, branch_id, driver_id, helper_id, driver_name, helper_name) FROM stdin;
\.


--
-- Data for Name: delivery_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.delivery_items (id, delivery_id, product_id, product_name, quantity_delivered, unit, width, height, notes, created_at, is_bonus) FROM stdin;
\.


--
-- Data for Name: delivery_photos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.delivery_photos (id, delivery_id, photo_url, photo_type, description, uploaded_at) FROM stdin;
\.


--
-- Data for Name: employee_advances; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.employee_advances (id, employee_id, employee_name, amount, date, notes, remaining_amount, created_at, account_id, account_name, branch_id, purpose, status, approved_by, approved_at) FROM stdin;
\.


--
-- Data for Name: employee_salaries; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.employee_salaries (id, employee_id, base_salary, commission_rate, payroll_type, commission_type, effective_from, effective_until, is_active, created_by, created_at, updated_at, notes) FROM stdin;
ba6f5ce0-82e9-4978-b080-1f43adfff756	539af32c-4388-4d62-9997-82d016eb6e52	15000000.00	0.00	monthly	none	2025-12-21	\N	t	\N	2025-12-22 00:01:46.365675+07	2025-12-22 00:01:46.365675+07	Konfigurasi gaji untuk Syahruddin Makki (owner)
\.


--
-- Data for Name: expenses; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.expenses (id, description, amount, account_id, account_name, date, category, created_at, expense_account_id, expense_account_name, branch_id) FROM stdin;
\.


--
-- Data for Name: manual_journal_entries; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.manual_journal_entries (id, entry_number, entry_date, description, notes, status, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: manual_journal_entry_lines; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.manual_journal_entry_lines (id, journal_entry_id, account_id, description, debit, credit, created_at) FROM stdin;
\.


--
-- Data for Name: material_stock_movements; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.material_stock_movements (id, material_id, material_name, type, reason, quantity, previous_stock, new_stock, notes, reference_id, reference_type, user_id, user_name, created_at, branch_id) FROM stdin;
0c5c4105-1c13-4396-87a0-40d3897bf15c	3e5b6482-7927-46ca-9f4d-5e7bbbd165d1	Segel Galon 19 Liter	OUT	PRODUCTION_CONSUMPTION	100	1003	903	Production: PRD-251222-602 (Air Isi Ulang 19 L)	12513778-c847-466a-a26e-792d65103467	production	539af32c-4388-4d62-9997-82d016eb6e52	Syahruddin Makki	2025-12-22 09:55:00.095476+07	2462d89d-5fb2-4cac-b241-85048af234be
a5152a6e-2e70-404c-9107-9b126e0aff3f	a8c7cf03-73fe-427a-a0ad-50bd55e3a481	Tutup Galon	OUT	PRODUCTION_CONSUMPTION	100	1003	903	Production: PRD-251222-602 (Air Isi Ulang 19 L)	12513778-c847-466a-a26e-792d65103467	production	539af32c-4388-4d62-9997-82d016eb6e52	Syahruddin Makki	2025-12-22 09:55:00.307654+07	2462d89d-5fb2-4cac-b241-85048af234be
593238ff-5dbd-429b-bce7-e1feb9d46289	66f49e61-0188-415c-a77d-6923e5e4c1e4	Tissue Galon	OUT	PRODUCTION_CONSUMPTION	100	1003	903	Production: PRD-251222-602 (Air Isi Ulang 19 L)	12513778-c847-466a-a26e-792d65103467	production	539af32c-4388-4d62-9997-82d016eb6e52	Syahruddin Makki	2025-12-22 09:55:00.520109+07	2462d89d-5fb2-4cac-b241-85048af234be
\.


--
-- Data for Name: materials; Type: TABLE DATA; Schema: public; Owner: aquavit
--

COPY public.materials (id, name, unit, price_per_unit, stock, min_stock, description, created_at, updated_at, type, branch_id, cost_price) FROM stdin;
3e5b6482-7927-46ca-9f4d-5e7bbbd165d1	Segel Galon 19 Liter	Pcs	80	903	50000		2025-12-22 01:55:16.202939+07	2025-12-22 09:54:57.296+07	Stock	2462d89d-5fb2-4cac-b241-85048af234be	0.00
a8c7cf03-73fe-427a-a0ad-50bd55e3a481	Tutup Galon	Pcs	375	903	50000		2025-12-22 01:53:54.383843+07	2025-12-22 09:54:57.508+07	Stock	2462d89d-5fb2-4cac-b241-85048af234be	0.00
66f49e61-0188-415c-a77d-6923e5e4c1e4	Tissue Galon	Pcs	120	903	50000		2025-12-22 01:56:45.611099+07	2025-12-22 09:54:57.722+07	Stock	2462d89d-5fb2-4cac-b241-85048af234be	0.00
4e484e0c-861e-4133-b65a-3dc4d22efd10	Stiker Galon 19 Liter	Pcs	150	1000	10000		2025-12-22 01:54:22.26815+07	2025-12-22 01:54:22.26815+07	Stock	2462d89d-5fb2-4cac-b241-85048af234be	0.00
b0c11c47-0e84-442a-9afb-52cfbd03120c	Segel Galon	pcs	800	1000	10000		2025-12-22 02:20:56.707455+07	2025-12-22 02:20:56.707455+07	Stock	3c9f4cab-ae4d-4313-99b7-86be6a989771	0.00
\.


--
-- Data for Name: nishab_reference; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.nishab_reference (id, gold_price, silver_price, gold_nishab, silver_nishab, zakat_rate, effective_date, created_by, created_at, notes) FROM stdin;
60c4dc4f-4a4c-4c1f-a676-a80e1292b9aa	1100000.00	15000.00	85.0000	595.0000	0.0250	2024-01-01	\N	2025-12-22 01:35:23.651406+07	Default nishab values
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notifications (id, user_id, title, message, type, is_read, link, created_at, reference_type, reference_id, reference_url, priority, read_at, expires_at) FROM stdin;
\.


--
-- Data for Name: payment_history; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payment_history (id, transaction_id, amount, payment_date, remaining_amount, payment_method, account_id, account_name, notes, recorded_by, recorded_by_name, created_at, updated_at, branch_id) FROM stdin;
\.


--
-- Data for Name: payroll_records; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payroll_records (id, employee_id, period_start, period_end, base_salary, total_commission, total_bonus, total_deductions, advance_deduction, net_salary, status, paid_date, payment_method, notes, branch_id, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: product_materials; Type: TABLE DATA; Schema: public; Owner: aquavit
--

COPY public.product_materials (id, product_id, material_id, quantity, notes, created_at, updated_at) FROM stdin;
bebe393d-42c7-4d38-ad8f-a1e24cbb15c7	50fc90e8-ddfe-49b1-81c8-398f7b7113f9	3e5b6482-7927-46ca-9f4d-5e7bbbd165d1	1.0000	\N	2025-12-22 02:20:58.393456+07	2025-12-22 02:20:58.393456+07
f859c140-eb93-4d4b-a413-4e84b39e9ec5	50fc90e8-ddfe-49b1-81c8-398f7b7113f9	a8c7cf03-73fe-427a-a0ad-50bd55e3a481	1.0000	\N	2025-12-22 02:21:09.358169+07	2025-12-22 02:21:09.358169+07
0574c9b2-8605-4e17-acce-e5d93b350b40	50fc90e8-ddfe-49b1-81c8-398f7b7113f9	66f49e61-0188-415c-a77d-6923e5e4c1e4	1.0000	\N	2025-12-22 02:22:44.835546+07	2025-12-22 02:22:44.835546+07
\.


--
-- Data for Name: production_errors; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.production_errors (id, ref, material_id, quantity, note, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: production_records; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.production_records (id, ref, product_id, quantity, note, consume_bom, created_by, created_at, updated_at, branch_id, bom_snapshot, user_input_id, user_input_name) FROM stdin;
12513778-c847-466a-a26e-792d65103467	PRD-251222-602	50fc90e8-ddfe-49b1-81c8-398f7b7113f9	100.00	\N	t	539af32c-4388-4d62-9997-82d016eb6e52	2025-12-22 09:54:59.737106+07	2025-12-22 09:54:59.737106+07	2462d89d-5fb2-4cac-b241-85048af234be	"[{\\"id\\":\\"bebe393d-42c7-4d38-ad8f-a1e24cbb15c7\\",\\"materialId\\":\\"3e5b6482-7927-46ca-9f4d-5e7bbbd165d1\\",\\"materialName\\":\\"Segel Galon 19 Liter\\",\\"quantity\\":1,\\"unit\\":\\"Pcs\\",\\"notes\\":null},{\\"id\\":\\"f859c140-eb93-4d4b-a413-4e84b39e9ec5\\",\\"materialId\\":\\"a8c7cf03-73fe-427a-a0ad-50bd55e3a481\\",\\"materialName\\":\\"Tutup Galon\\",\\"quantity\\":1,\\"unit\\":\\"Pcs\\",\\"notes\\":null},{\\"id\\":\\"0574c9b2-8605-4e17-acce-e5d93b350b40\\",\\"materialId\\":\\"66f49e61-0188-415c-a77d-6923e5e4c1e4\\",\\"materialName\\":\\"Tissue Galon\\",\\"quantity\\":1,\\"unit\\":\\"Pcs\\",\\"notes\\":null}]"	539af32c-4388-4d62-9997-82d016eb6e52	Syahruddin Makki
\.


--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: aquavit
--

COPY public.products (id, name, base_price, unit, min_order, description, specifications, materials, created_at, updated_at, type, current_stock, min_stock, branch_id, cost_price, is_shared) FROM stdin;
50fc90e8-ddfe-49b1-81c8-398f7b7113f9	Air Isi Ulang 19 L	10000	pcs	1		[]	[]	2025-12-22 02:14:37.111845+07	2025-12-22 09:54:57.082+07	Produksi	100	0	2462d89d-5fb2-4cac-b241-85048af234be	\N	f
\.


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: aquavit
--

COPY public.profiles (id, email, full_name, role, created_at, updated_at, password_hash, branch_id, username, phone, address, status, allowed_branches) FROM stdin;
539af32c-4388-4d62-9997-82d016eb6e52	inputpip@gmail.com	Syahruddin Makki	owner	2025-12-21 22:27:42.929988+07	2025-12-21 21:09:21.293551+07	$2a$10$00ifpM3fDPswZtjT/NFVa.M0RGznu8QfNGYs5Yj4E8tkX9LHc/tzC	3c9f4cab-ae4d-4313-99b7-86be6a989771	\N	\N	\N	Aktif	{3c9f4cab-ae4d-4313-99b7-86be6a989771,2462d89d-5fb2-4cac-b241-85048af234be}
c7dbea8b-b95b-4d2e-a81a-1ed80b3f9af7	dbaquvit@gmail.com	Achmad Habib Chirsin	owner	2025-12-21 22:36:24.677086+07	2025-12-21 21:09:21.293551+07	$2a$10$jeT2mKV9Bb8SHWKGyLDjZO./T0fqbOXEkWGsjICpMek/GqgzD0a6K	3c9f4cab-ae4d-4313-99b7-86be6a989771	\N	\N	\N	Aktif	{3c9f4cab-ae4d-4313-99b7-86be6a989771,2462d89d-5fb2-4cac-b241-85048af234be}
a84c33b9-f244-4c4a-b3ef-f76428284c63	halo.aquvit@gmail.com	halo aquvit	supir	2025-12-22 10:19:46.520075+07	2025-12-22 03:24:39.269146+07	$2a$10$D0A9LsTUe5AtbRdZ2Iej..WXbNxj8nb26ndriefkJ9CYAjD0IpnKi	2462d89d-5fb2-4cac-b241-85048af234be	\N	\N	\N	Aktif	{}
\.


--
-- Data for Name: purchase_order_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.purchase_order_items (id, purchase_order_id, material_id, product_id, item_type, quantity, unit_price, quantity_received, is_taxable, tax_percentage, tax_amount, subtotal, total_with_tax, notes, created_at, updated_at, material_name, product_name, unit) FROM stdin;
\.


--
-- Data for Name: purchase_orders; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.purchase_orders (id, material_id, material_name, quantity, unit, requested_by, status, created_at, notes, total_cost, payment_account_id, payment_date, unit_price, supplier_name, supplier_contact, expected_delivery_date, supplier_id, quoted_price, expedition, received_date, delivery_note_photo, received_by, received_quantity, expedition_receiver, branch_id, po_number, order_date, approved_at, approved_by, include_ppn, ppn_amount) FROM stdin;
\.


--
-- Data for Name: quotations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.quotations (id, customer_id, customer_name, prepared_by, items, total, status, created_at, valid_until, transaction_id, branch_id, notes) FROM stdin;
\.


--
-- Data for Name: retasi; Type: TABLE DATA; Schema: public; Owner: aquavit
--

COPY public.retasi (id, retasi_number, truck_number, driver_name, helper_name, departure_date, departure_time, route, total_items, total_weight, notes, retasi_ke, is_returned, returned_items_count, error_items_count, return_notes, created_by, created_at, updated_at, barang_laku, branch_id, driver_id, helper_id, date, status) FROM stdin;
2f902029-71a6-4268-bfe4-72722a3ea750	RET-20251222-945	\N	halo aquvit	\N	2025-12-22	\N	\N	10	\N	\N	1	f	0	0	\N	a84c33b9-f244-4c4a-b3ef-f76428284c63	2025-12-22 10:32:47.951867+07	2025-12-22 10:32:47.951867+07	0	2462d89d-5fb2-4cac-b241-85048af234be	\N	\N	2025-12-22	open
\.


--
-- Data for Name: retasi_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.retasi_items (id, retasi_id, product_id, product_name, quantity, weight, returned_qty, error_qty, notes, created_at, customer_name, amount, collected_amount, status) FROM stdin;
ba8d4972-0f65-4b6d-85e5-3c9fdac9516a	2f902029-71a6-4268-bfe4-72722a3ea750	50fc90e8-ddfe-49b1-81c8-398f7b7113f9	Air Isi Ulang 19 L	10	\N	0	0	\N	2025-12-22 10:32:48.089163+07	\N	0.00	0.00	pending
\.


--
-- Data for Name: role_permissions; Type: TABLE DATA; Schema: public; Owner: aquavit
--

COPY public.role_permissions (id, role_id, permissions, created_at, updated_at) FROM stdin;
ae1394c6-f8e3-4430-821a-11f3d81b8758	operator	{"pos_access": false, "zakat_edit": false, "zakat_view": false, "assets_edit": false, "assets_view": false, "retasi_edit": false, "retasi_view": false, "payroll_view": false, "zakat_create": false, "accounts_edit": false, "accounts_view": false, "advances_edit": false, "advances_view": false, "assets_create": false, "assets_delete": false, "branches_edit": false, "branches_view": false, "delivery_edit": false, "delivery_view": false, "expenses_edit": false, "expenses_view": false, "payables_edit": false, "payables_view": false, "products_edit": false, "products_view": true, "profiles_edit": false, "profiles_view": false, "retasi_create": false, "retasi_delete": false, "stock_reports": false, "cash_flow_view": false, "customers_edit": false, "customers_view": true, "dashboard_view": true, "employees_edit": false, "employees_view": false, "materials_edit": false, "materials_view": true, "suppliers_edit": false, "suppliers_view": false, "accounts_create": false, "accounts_delete": false, "advances_create": false, "attendance_edit": false, "attendance_view": true, "branches_create": false, "branches_delete": false, "commission_view": false, "delivery_create": false, "delivery_delete": false, "expenses_create": false, "expenses_delete": false, "payables_create": false, "payables_delete": false, "payroll_process": false, "production_edit": false, "production_view": true, "products_create": false, "products_delete": false, "quotations_edit": false, "quotations_view": false, "role_management": false, "settings_access": false, "customers_create": false, "customers_delete": false, "employees_create": false, "employees_delete": false, "maintenance_edit": false, "maintenance_view": false, "materials_create": false, "materials_delete": false, "receivables_edit": false, "receivables_view": false, "suppliers_create": false, "suppliers_delete": false, "attendance_access": false, "attendance_create": true, "attendance_delete": false, "commission_manage": false, "commission_report": false, "financial_reports": false, "pos_driver_access": false, "production_create": true, "production_delete": false, "quotations_create": false, "quotations_delete": false, "transactions_edit": false, "transactions_view": true, "attendance_reports": false, "maintenance_create": false, "notifications_view": false, "production_reports": false, "transaction_reports": false, "transactions_create": false, "transactions_delete": false, "purchase_orders_edit": false, "purchase_orders_view": false, "purchase_orders_create": false, "purchase_orders_delete": false, "material_movement_report": false, "transaction_items_report": false, "branch_access_2462d89d-5fb2-4cac-b241-85048af234be": false, "branch_access_3c9f4cab-ae4d-4313-99b7-86be6a989771": false}	2025-12-15 13:51:20.512773+07	2025-12-22 10:31:54.349+07
4de6351e-8ff1-44ad-aa3e-eec306a8cfa4	cashier	{"pos_access": true, "zakat_edit": false, "zakat_view": false, "assets_edit": false, "assets_view": false, "retasi_edit": false, "retasi_view": false, "payroll_view": false, "zakat_create": false, "accounts_edit": false, "accounts_view": true, "advances_edit": false, "advances_view": false, "assets_create": false, "assets_delete": false, "branches_edit": false, "branches_view": false, "delivery_edit": false, "delivery_view": false, "expenses_edit": false, "expenses_view": true, "payables_edit": false, "payables_view": false, "products_edit": false, "products_view": true, "profiles_edit": false, "profiles_view": false, "retasi_create": false, "retasi_delete": false, "stock_reports": true, "cash_flow_view": false, "customers_edit": false, "customers_view": true, "dashboard_view": true, "employees_edit": false, "employees_view": false, "materials_edit": false, "materials_view": true, "suppliers_edit": false, "suppliers_view": false, "accounts_create": false, "accounts_delete": false, "advances_create": false, "attendance_edit": false, "attendance_view": true, "branches_create": false, "branches_delete": false, "commission_view": false, "delivery_create": false, "delivery_delete": false, "expenses_create": false, "expenses_delete": false, "payables_create": false, "payables_delete": false, "payroll_process": false, "production_edit": false, "production_view": true, "products_create": false, "products_delete": false, "quotations_edit": false, "quotations_view": false, "role_management": false, "settings_access": false, "customers_create": true, "customers_delete": false, "employees_create": false, "employees_delete": false, "maintenance_edit": false, "maintenance_view": false, "materials_create": false, "materials_delete": false, "receivables_edit": false, "receivables_view": false, "suppliers_create": false, "suppliers_delete": false, "attendance_access": false, "attendance_create": true, "attendance_delete": false, "commission_manage": false, "commission_report": false, "financial_reports": false, "pos_driver_access": false, "production_create": false, "production_delete": false, "quotations_create": false, "quotations_delete": false, "transactions_edit": true, "transactions_view": true, "attendance_reports": false, "maintenance_create": false, "notifications_view": false, "production_reports": false, "transaction_reports": false, "transactions_create": true, "transactions_delete": false, "purchase_orders_edit": false, "purchase_orders_view": false, "purchase_orders_create": false, "purchase_orders_delete": false, "material_movement_report": false, "transaction_items_report": false, "branch_access_2462d89d-5fb2-4cac-b241-85048af234be": false, "branch_access_3c9f4cab-ae4d-4313-99b7-86be6a989771": false}	2025-12-15 13:51:20.512773+07	2025-12-22 10:31:54.357+07
d83a6164-29e9-41a1-a002-018c75fb981a	owner	{"all": true, "pos_access": true, "assets_edit": true, "assets_view": true, "payroll_edit": true, "payroll_view": true, "reports_view": true, "accounts_edit": true, "accounts_view": true, "assets_create": true, "assets_delete": true, "expenses_edit": true, "expenses_view": true, "products_edit": true, "products_view": true, "stock_reports": true, "customers_edit": true, "customers_view": true, "dashboard_view": true, "materials_edit": true, "materials_view": true, "payroll_create": true, "payroll_delete": true, "reports_export": true, "accounts_create": true, "accounts_delete": true, "attendance_edit": true, "attendance_view": true, "expenses_create": true, "expenses_delete": true, "production_edit": true, "production_view": true, "products_create": true, "products_delete": true, "role_management": true, "settings_access": true, "customers_create": true, "customers_delete": true, "materials_create": true, "materials_delete": true, "attendance_create": true, "attendance_delete": true, "financial_reports": true, "pos_driver_access": true, "production_create": true, "production_delete": true, "transactions_edit": true, "transactions_view": true, "transactions_create": true, "transactions_delete": true, "branch_access_2462d89d-5fb2-4cac-b241-85048af234be": true, "branch_access_3c9f4cab-ae4d-4313-99b7-86be6a989771": true}	2025-12-15 13:51:20.512773+07	2025-12-22 10:14:16.415+07
d582e080-c329-489d-b90a-14d1c121062e	supir	{"retasi_view": true, "delivery_view": true, "profiles_edit": true, "profiles_view": true, "attendance_view": true, "attendance_access": true, "attendance_create": true, "pos_driver_access": true, "notifications_view": true}	2025-12-22 03:13:50.187771+07	2025-12-22 10:35:03.428377+07
213c6434-c2fc-4a7f-981a-1ebedc522278	designer	{"pos_access": false, "zakat_edit": false, "zakat_view": false, "assets_edit": false, "assets_view": false, "retasi_edit": false, "retasi_view": false, "payroll_view": false, "zakat_create": false, "accounts_edit": false, "accounts_view": false, "advances_edit": false, "advances_view": false, "assets_create": false, "assets_delete": false, "branches_edit": false, "branches_view": false, "delivery_edit": false, "delivery_view": false, "expenses_edit": false, "expenses_view": false, "payables_edit": false, "payables_view": false, "products_edit": true, "products_view": true, "profiles_edit": false, "profiles_view": false, "retasi_create": false, "retasi_delete": false, "stock_reports": true, "cash_flow_view": false, "customers_edit": false, "customers_view": true, "dashboard_view": true, "employees_edit": false, "employees_view": false, "materials_edit": true, "materials_view": true, "suppliers_edit": false, "suppliers_view": false, "accounts_create": false, "accounts_delete": false, "advances_create": false, "attendance_edit": false, "attendance_view": true, "branches_create": false, "branches_delete": false, "commission_view": false, "delivery_create": false, "delivery_delete": false, "expenses_create": false, "expenses_delete": false, "payables_create": false, "payables_delete": false, "payroll_process": false, "production_edit": true, "production_view": true, "products_create": false, "products_delete": false, "quotations_edit": false, "quotations_view": false, "role_management": false, "settings_access": false, "customers_create": false, "customers_delete": false, "employees_create": false, "employees_delete": false, "maintenance_edit": false, "maintenance_view": false, "materials_create": false, "materials_delete": false, "receivables_edit": false, "receivables_view": false, "suppliers_create": false, "suppliers_delete": false, "attendance_access": false, "attendance_create": true, "attendance_delete": false, "commission_manage": false, "commission_report": false, "financial_reports": false, "pos_driver_access": false, "production_create": true, "production_delete": true, "quotations_create": false, "quotations_delete": false, "transactions_edit": false, "transactions_view": true, "attendance_reports": false, "maintenance_create": false, "notifications_view": false, "production_reports": false, "transaction_reports": false, "transactions_create": false, "transactions_delete": false, "purchase_orders_edit": false, "purchase_orders_view": false, "purchase_orders_create": false, "purchase_orders_delete": false, "material_movement_report": false, "transaction_items_report": false, "branch_access_2462d89d-5fb2-4cac-b241-85048af234be": false, "branch_access_3c9f4cab-ae4d-4313-99b7-86be6a989771": false}	2025-12-15 13:51:20.512773+07	2025-12-22 10:31:54.361+07
6d34f8d0-5054-41e9-bc1b-c2b9bc8a87d0	supervisor	{"pos_access": true, "zakat_edit": false, "zakat_view": false, "assets_edit": false, "assets_view": true, "retasi_edit": false, "retasi_view": false, "payroll_view": true, "reports_view": true, "zakat_create": false, "accounts_edit": false, "accounts_view": true, "advances_edit": false, "advances_view": false, "assets_create": false, "assets_delete": false, "branches_edit": false, "branches_view": false, "delivery_edit": false, "delivery_view": false, "expenses_edit": true, "expenses_view": true, "payables_edit": false, "payables_view": false, "products_edit": true, "products_view": true, "profiles_edit": false, "profiles_view": false, "retasi_create": false, "retasi_delete": false, "stock_reports": true, "cash_flow_view": false, "customers_edit": true, "customers_view": true, "dashboard_view": true, "employees_edit": false, "employees_view": false, "materials_edit": true, "materials_view": true, "suppliers_edit": false, "suppliers_view": false, "accounts_create": false, "accounts_delete": false, "advances_create": false, "attendance_edit": true, "attendance_view": true, "branches_create": false, "branches_delete": false, "commission_view": false, "delivery_create": false, "delivery_delete": false, "expenses_create": true, "expenses_delete": false, "payables_create": false, "payables_delete": false, "payroll_process": false, "production_edit": true, "production_view": true, "products_create": false, "products_delete": false, "quotations_edit": false, "quotations_view": false, "role_management": false, "settings_access": false, "customers_create": false, "customers_delete": false, "employees_create": false, "employees_delete": false, "maintenance_edit": false, "maintenance_view": false, "materials_create": false, "materials_delete": false, "receivables_edit": false, "receivables_view": false, "suppliers_create": false, "suppliers_delete": false, "attendance_access": false, "attendance_create": true, "attendance_delete": false, "commission_manage": false, "commission_report": false, "financial_reports": true, "pos_driver_access": false, "production_create": true, "production_delete": false, "quotations_create": false, "quotations_delete": false, "transactions_edit": true, "transactions_view": true, "attendance_reports": false, "maintenance_create": false, "notifications_view": false, "production_reports": false, "transaction_reports": false, "transactions_create": true, "transactions_delete": false, "purchase_orders_edit": false, "purchase_orders_view": false, "purchase_orders_create": false, "purchase_orders_delete": false, "material_movement_report": false, "transaction_items_report": false, "branch_access_2462d89d-5fb2-4cac-b241-85048af234be": false, "branch_access_3c9f4cab-ae4d-4313-99b7-86be6a989771": false}	2025-12-15 13:51:20.512773+07	2025-12-22 10:31:54.374+07
11673833-3dc9-4182-95a6-3d3c3718b679	admin	{"pos_access": true, "zakat_edit": false, "zakat_view": false, "assets_edit": true, "assets_view": true, "retasi_edit": false, "retasi_view": false, "payroll_edit": true, "payroll_view": true, "reports_view": true, "zakat_create": false, "accounts_edit": true, "accounts_view": true, "advances_edit": false, "advances_view": false, "assets_create": true, "assets_delete": true, "branches_edit": false, "branches_view": false, "delivery_edit": false, "delivery_view": false, "expenses_edit": true, "expenses_view": true, "payables_edit": false, "payables_view": false, "products_edit": true, "products_view": true, "profiles_edit": false, "profiles_view": false, "retasi_create": false, "retasi_delete": false, "stock_reports": true, "cash_flow_view": false, "customers_edit": true, "customers_view": true, "dashboard_view": true, "employees_edit": false, "employees_view": false, "materials_edit": true, "materials_view": true, "payroll_create": true, "payroll_delete": true, "reports_export": true, "suppliers_edit": false, "suppliers_view": false, "accounts_create": true, "accounts_delete": true, "advances_create": false, "attendance_edit": true, "attendance_view": true, "branches_create": false, "branches_delete": false, "commission_view": false, "delivery_create": false, "delivery_delete": false, "expenses_create": true, "expenses_delete": true, "payables_create": false, "payables_delete": false, "payroll_process": false, "production_edit": true, "production_view": true, "products_create": true, "products_delete": true, "quotations_edit": false, "quotations_view": false, "role_management": false, "settings_access": true, "customers_create": true, "customers_delete": true, "employees_create": false, "employees_delete": false, "maintenance_edit": false, "maintenance_view": false, "materials_create": true, "materials_delete": true, "receivables_edit": false, "receivables_view": false, "suppliers_create": false, "suppliers_delete": false, "attendance_access": false, "attendance_create": true, "attendance_delete": true, "commission_manage": false, "commission_report": false, "financial_reports": true, "pos_driver_access": true, "production_create": true, "production_delete": true, "quotations_create": false, "quotations_delete": false, "transactions_edit": true, "transactions_view": true, "attendance_reports": false, "maintenance_create": false, "notifications_view": false, "production_reports": false, "transaction_reports": false, "transactions_create": true, "transactions_delete": true, "purchase_orders_edit": false, "purchase_orders_view": false, "purchase_orders_create": false, "purchase_orders_delete": false, "material_movement_report": false, "transaction_items_report": false, "branch_access_2462d89d-5fb2-4cac-b241-85048af234be": true, "branch_access_3c9f4cab-ae4d-4313-99b7-86be6a989771": true}	2025-12-15 13:51:20.512773+07	2025-12-22 10:31:54.404+07
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: aquavit
--

COPY public.roles (id, name, display_name, description, permissions, is_system_role, is_active, created_at, updated_at) FROM stdin;
9e05882b-db26-451d-829d-c97a6cc470b2	owner	Owner	Pemilik perusahaan dengan akses penuh	{"all": true}	t	t	2025-12-15 20:52:31.023881+07	2025-12-15 20:52:31.023881+07
72ca8ca2-1064-4dd5-b0f0-b2981c043bd1	admin	Administrator	Administrator sistem dengan akses luas	{"manage_users": true, "view_reports": true, "manage_products": true, "manage_transactions": true}	t	t	2025-12-15 20:52:31.023881+07	2025-12-15 20:52:31.023881+07
49f8ca6f-b354-49ab-ba40-51f99b1d313f	supervisor	Supervisor	Supervisor operasional	{"view_reports": true, "manage_products": true, "manage_transactions": true}	t	t	2025-12-15 20:52:31.023881+07	2025-12-15 20:52:31.023881+07
c4adb819-7e2b-4369-a551-b78c4edcd140	cashier	Kasir	Kasir untuk transaksi penjualan	{"manage_customers": true, "create_transactions": true}	t	t	2025-12-15 20:52:31.023881+07	2025-12-15 20:52:31.023881+07
2397aa71-bb4b-4b34-bdb5-bece6ce6fe43	designer	Desainer	Desainer produk dan quotation	{"manage_products": true, "create_quotations": true}	t	t	2025-12-15 20:52:31.023881+07	2025-12-15 20:52:31.023881+07
a949a579-9afc-480a-a854-162c5b3e4b35	operator	Operator	Operator produksi	{"view_products": true, "update_production": true}	t	t	2025-12-15 20:52:31.023881+07	2025-12-15 20:52:31.023881+07
3c265f84-81ec-450e-b4a8-9aa9edca1ed9	supir	Supir	Supir pengantaran	{"retasi_view": true, "delivery_view": true, "profiles_edit": true, "profiles_view": true, "attendance_view": true, "attendance_access": true, "attendance_create": true, "pos_driver_access": true, "notifications_view": true}	t	t	2025-12-22 09:55:52.893147+07	2025-12-22 10:35:03.434695+07
\.


--
-- Data for Name: stock_pricings; Type: TABLE DATA; Schema: public; Owner: aquavit
--

COPY public.stock_pricings (id, product_id, min_stock, max_stock, price, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: supplier_materials; Type: TABLE DATA; Schema: public; Owner: aquavit
--

COPY public.supplier_materials (id, supplier_id, material_id, supplier_price, unit, min_order_qty, lead_time_days, last_updated, notes, is_active, created_at) FROM stdin;
\.


--
-- Data for Name: suppliers; Type: TABLE DATA; Schema: public; Owner: aquavit
--

COPY public.suppliers (id, code, name, contact_person, phone, email, address, city, postal_code, payment_terms, tax_number, bank_account, bank_name, notes, is_active, created_at, updated_at, branch_id) FROM stdin;
12c1cab3-81e3-4365-b17d-d69cd9ce0f06	SUP0001	halo aquvit	halo aquvit	\N	\N	tes\n34334	Manokwari	98312	Cash	\N	\N	\N	\N	t	2025-12-22 01:38:34.868357+07	2025-12-22 01:38:34.868357+07	2462d89d-5fb2-4cac-b241-85048af234be
\.


--
-- Data for Name: transaction_payments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.transaction_payments (id, transaction_id, payment_date, amount, payment_method, account_id, account_name, description, notes, reference_number, paid_by_user_id, paid_by_user_name, paid_by_user_role, created_at, created_by, status, cancelled_at, cancelled_by, cancelled_reason) FROM stdin;
\.


--
-- Data for Name: transactions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.transactions (id, customer_id, customer_name, cashier_id, cashier_name, designer_id, operator_id, payment_account_id, order_date, finish_date, items, total, paid_amount, payment_status, status, created_at, subtotal, ppn_enabled, ppn_percentage, ppn_amount, is_office_sale, due_date, ppn_mode, sales_id, sales_name, retasi_id, retasi_number, branch_id, notes) FROM stdin;
\.


--
-- Data for Name: user_roles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_roles (id, user_id, role_id, assigned_at, assigned_by) FROM stdin;
\.


--
-- Data for Name: zakat_records; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.zakat_records (id, type, category, title, description, recipient, recipient_type, amount, nishab_amount, percentage_rate, payment_date, payment_account_id, payment_method, status, cash_history_id, receipt_number, calculation_basis, calculation_notes, is_anonymous, notes, attachment_url, hijri_year, hijri_month, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Name: accounts accounts_code_unique; Type: CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_code_unique UNIQUE (code);


--
-- Name: accounts_payable accounts_payable_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounts_payable
    ADD CONSTRAINT accounts_payable_pkey PRIMARY KEY (id);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: advance_repayments advance_repayments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.advance_repayments
    ADD CONSTRAINT advance_repayments_pkey PRIMARY KEY (id);


--
-- Name: asset_maintenance asset_maintenance_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.asset_maintenance
    ADD CONSTRAINT asset_maintenance_pkey PRIMARY KEY (id);


--
-- Name: assets assets_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_code_key UNIQUE (code);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: attendance attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);


--
-- Name: balance_adjustments balance_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.balance_adjustments
    ADD CONSTRAINT balance_adjustments_pkey PRIMARY KEY (id);


--
-- Name: bonus_pricings bonus_pricings_pkey; Type: CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.bonus_pricings
    ADD CONSTRAINT bonus_pricings_pkey PRIMARY KEY (id);


--
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


--
-- Name: cash_history cash_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cash_history
    ADD CONSTRAINT cash_history_pkey PRIMARY KEY (id);


--
-- Name: commission_entries commission_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.commission_entries
    ADD CONSTRAINT commission_entries_pkey PRIMARY KEY (id);


--
-- Name: commission_rules commission_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.commission_rules
    ADD CONSTRAINT commission_rules_pkey PRIMARY KEY (id);


--
-- Name: commission_rules commission_rules_product_id_role_key; Type: CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.commission_rules
    ADD CONSTRAINT commission_rules_product_id_role_key UNIQUE (product_id, role);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: company_settings company_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.company_settings
    ADD CONSTRAINT company_settings_pkey PRIMARY KEY (key);


--
-- Name: customer_pricings customer_pricings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_pricings
    ADD CONSTRAINT customer_pricings_pkey PRIMARY KEY (id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: deliveries deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_pkey PRIMARY KEY (id);


--
-- Name: deliveries deliveries_transaction_delivery_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_transaction_delivery_number_key UNIQUE (transaction_id, delivery_number);


--
-- Name: delivery_items delivery_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.delivery_items
    ADD CONSTRAINT delivery_items_pkey PRIMARY KEY (id);


--
-- Name: delivery_photos delivery_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.delivery_photos
    ADD CONSTRAINT delivery_photos_pkey PRIMARY KEY (id);


--
-- Name: employee_advances employee_advances_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_advances
    ADD CONSTRAINT employee_advances_pkey PRIMARY KEY (id);


--
-- Name: employee_salaries employee_salaries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_salaries
    ADD CONSTRAINT employee_salaries_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: manual_journal_entries manual_journal_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.manual_journal_entries
    ADD CONSTRAINT manual_journal_entries_pkey PRIMARY KEY (id);


--
-- Name: manual_journal_entry_lines manual_journal_entry_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.manual_journal_entry_lines
    ADD CONSTRAINT manual_journal_entry_lines_pkey PRIMARY KEY (id);


--
-- Name: material_stock_movements material_stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.material_stock_movements
    ADD CONSTRAINT material_stock_movements_pkey PRIMARY KEY (id);


--
-- Name: materials materials_pkey; Type: CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.materials
    ADD CONSTRAINT materials_pkey PRIMARY KEY (id);


--
-- Name: nishab_reference nishab_reference_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.nishab_reference
    ADD CONSTRAINT nishab_reference_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: payment_history payment_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_history
    ADD CONSTRAINT payment_history_pkey PRIMARY KEY (id);


--
-- Name: payroll_records payroll_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payroll_records
    ADD CONSTRAINT payroll_records_pkey PRIMARY KEY (id);


--
-- Name: product_materials product_materials_pkey; Type: CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.product_materials
    ADD CONSTRAINT product_materials_pkey PRIMARY KEY (id);


--
-- Name: product_materials product_materials_product_id_material_id_key; Type: CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.product_materials
    ADD CONSTRAINT product_materials_product_id_material_id_key UNIQUE (product_id, material_id);


--
-- Name: production_errors production_errors_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.production_errors
    ADD CONSTRAINT production_errors_pkey PRIMARY KEY (id);


--
-- Name: production_errors production_errors_ref_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.production_errors
    ADD CONSTRAINT production_errors_ref_key UNIQUE (ref);


--
-- Name: production_records production_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.production_records
    ADD CONSTRAINT production_records_pkey PRIMARY KEY (id);


--
-- Name: production_records production_records_ref_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.production_records
    ADD CONSTRAINT production_records_ref_key UNIQUE (ref);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_email_key; Type: CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_email_key UNIQUE (email);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: purchase_order_items purchase_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_pkey PRIMARY KEY (id);


--
-- Name: purchase_orders purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);


--
-- Name: quotations quotations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_pkey PRIMARY KEY (id);


--
-- Name: retasi_items retasi_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.retasi_items
    ADD CONSTRAINT retasi_items_pkey PRIMARY KEY (id);


--
-- Name: retasi retasi_pkey; Type: CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.retasi
    ADD CONSTRAINT retasi_pkey PRIMARY KEY (id);


--
-- Name: retasi retasi_retasi_number_key; Type: CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.retasi
    ADD CONSTRAINT retasi_retasi_number_key UNIQUE (retasi_number);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (id);


--
-- Name: roles roles_name_key; Type: CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_name_key UNIQUE (name);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: stock_pricings stock_pricings_pkey; Type: CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.stock_pricings
    ADD CONSTRAINT stock_pricings_pkey PRIMARY KEY (id);


--
-- Name: supplier_materials supplier_materials_pkey; Type: CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.supplier_materials
    ADD CONSTRAINT supplier_materials_pkey PRIMARY KEY (id);


--
-- Name: supplier_materials supplier_materials_supplier_id_material_id_key; Type: CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.supplier_materials
    ADD CONSTRAINT supplier_materials_supplier_id_material_id_key UNIQUE (supplier_id, material_id);


--
-- Name: suppliers suppliers_code_key; Type: CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_code_key UNIQUE (code);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: transaction_payments transaction_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transaction_payments
    ADD CONSTRAINT transaction_payments_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_id_key UNIQUE (user_id, role_id);


--
-- Name: zakat_records zakat_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.zakat_records
    ADD CONSTRAINT zakat_records_pkey PRIMARY KEY (id);


--
-- Name: idx_accounts_code; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_accounts_code ON public.accounts USING btree (code);


--
-- Name: idx_accounts_is_payment_account; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_accounts_is_payment_account ON public.accounts USING btree (is_payment_account);


--
-- Name: idx_accounts_level; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_accounts_level ON public.accounts USING btree (level);


--
-- Name: idx_accounts_parent; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_accounts_parent ON public.accounts USING btree (parent_id);


--
-- Name: idx_accounts_payable_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_accounts_payable_created_at ON public.accounts_payable USING btree (created_at);


--
-- Name: idx_accounts_payable_po_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_accounts_payable_po_id ON public.accounts_payable USING btree (purchase_order_id);


--
-- Name: idx_accounts_payable_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_accounts_payable_status ON public.accounts_payable USING btree (status);


--
-- Name: idx_accounts_sort_order; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_accounts_sort_order ON public.accounts USING btree (sort_order);


--
-- Name: idx_accounts_type; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_accounts_type ON public.accounts USING btree (type);


--
-- Name: idx_balance_adjustments_account_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_balance_adjustments_account_id ON public.balance_adjustments USING btree (account_id);


--
-- Name: idx_balance_adjustments_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_balance_adjustments_created_at ON public.balance_adjustments USING btree (created_at);


--
-- Name: idx_balance_adjustments_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_balance_adjustments_status ON public.balance_adjustments USING btree (status);


--
-- Name: idx_bonus_pricings_active; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_bonus_pricings_active ON public.bonus_pricings USING btree (is_active);


--
-- Name: idx_bonus_pricings_product_id; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_bonus_pricings_product_id ON public.bonus_pricings USING btree (product_id);


--
-- Name: idx_bonus_pricings_qty_range; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_bonus_pricings_qty_range ON public.bonus_pricings USING btree (min_quantity, max_quantity);


--
-- Name: idx_cash_history_account_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cash_history_account_id ON public.cash_history USING btree (account_id);


--
-- Name: idx_cash_history_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cash_history_created_at ON public.cash_history USING btree (created_at);


--
-- Name: idx_cash_history_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cash_history_type ON public.cash_history USING btree (transaction_type);


--
-- Name: idx_commission_entries_date; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_commission_entries_date ON public.commission_entries USING btree (created_at);


--
-- Name: idx_commission_entries_delivery; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_commission_entries_delivery ON public.commission_entries USING btree (delivery_id);


--
-- Name: idx_commission_entries_role; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_commission_entries_role ON public.commission_entries USING btree (role);


--
-- Name: idx_commission_entries_transaction; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_commission_entries_transaction ON public.commission_entries USING btree (transaction_id);


--
-- Name: idx_commission_entries_user; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_commission_entries_user ON public.commission_entries USING btree (user_id);


--
-- Name: idx_commission_rules_product_role; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_commission_rules_product_role ON public.commission_rules USING btree (product_id, role);


--
-- Name: idx_customers_created_at; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_customers_created_at ON public.customers USING btree ("createdAt");


--
-- Name: idx_customers_name; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_customers_name ON public.customers USING btree (name);


--
-- Name: idx_daily_stats_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_daily_stats_date ON public.daily_stats USING btree (date);


--
-- Name: idx_deliveries_delivery_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deliveries_delivery_date ON public.deliveries USING btree (delivery_date);


--
-- Name: idx_deliveries_transaction_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deliveries_transaction_id ON public.deliveries USING btree (transaction_id);


--
-- Name: idx_delivery_items_delivery_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_delivery_items_delivery_id ON public.delivery_items USING btree (delivery_id);


--
-- Name: idx_delivery_items_product_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_delivery_items_product_id ON public.delivery_items USING btree (product_id);


--
-- Name: idx_employee_salaries_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_employee_salaries_active ON public.employee_salaries USING btree (employee_id, is_active) WHERE (is_active = true);


--
-- Name: idx_employee_salaries_effective_period; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_employee_salaries_effective_period ON public.employee_salaries USING btree (effective_from, effective_until);


--
-- Name: idx_employee_salaries_employee_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_employee_salaries_employee_id ON public.employee_salaries USING btree (employee_id);


--
-- Name: idx_material_stock_movements_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_material_stock_movements_created_at ON public.material_stock_movements USING btree (created_at DESC);


--
-- Name: idx_material_stock_movements_material; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_material_stock_movements_material ON public.material_stock_movements USING btree (material_id);


--
-- Name: idx_material_stock_movements_reference; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_material_stock_movements_reference ON public.material_stock_movements USING btree (reference_id, reference_type);


--
-- Name: idx_material_stock_movements_type_reason; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_material_stock_movements_type_reason ON public.material_stock_movements USING btree (type, reason);


--
-- Name: idx_material_stock_movements_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_material_stock_movements_user ON public.material_stock_movements USING btree (user_id);


--
-- Name: idx_materials_name; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_materials_name ON public.materials USING btree (name);


--
-- Name: idx_materials_stock; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_materials_stock ON public.materials USING btree (stock);


--
-- Name: idx_payment_history_payment_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payment_history_payment_date ON public.payment_history USING btree (payment_date);


--
-- Name: idx_payment_history_transaction_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payment_history_transaction_id ON public.payment_history USING btree (transaction_id);


--
-- Name: idx_product_materials_material_id; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_product_materials_material_id ON public.product_materials USING btree (material_id);


--
-- Name: idx_product_materials_product_id; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_product_materials_product_id ON public.product_materials USING btree (product_id);


--
-- Name: idx_production_errors_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_production_errors_created_at ON public.production_errors USING btree (created_at);


--
-- Name: idx_production_errors_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_production_errors_created_by ON public.production_errors USING btree (created_by);


--
-- Name: idx_production_errors_material_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_production_errors_material_id ON public.production_errors USING btree (material_id);


--
-- Name: idx_production_errors_ref; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_production_errors_ref ON public.production_errors USING btree (ref);


--
-- Name: idx_production_records_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_production_records_created_at ON public.production_records USING btree (created_at);


--
-- Name: idx_production_records_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_production_records_created_by ON public.production_records USING btree (created_by);


--
-- Name: idx_production_records_error_entries; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_production_records_error_entries ON public.production_records USING btree (created_at) WHERE (product_id IS NULL);


--
-- Name: idx_production_records_product_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_production_records_product_id ON public.production_records USING btree (product_id);


--
-- Name: idx_production_records_product_id_nullable; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_production_records_product_id_nullable ON public.production_records USING btree (product_id) WHERE (product_id IS NOT NULL);


--
-- Name: idx_products_name; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_products_name ON public.products USING btree (name);


--
-- Name: idx_profiles_email; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_profiles_email ON public.profiles USING btree (email);


--
-- Name: idx_profiles_role; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_profiles_role ON public.profiles USING btree (role);


--
-- Name: idx_purchase_orders_expected_delivery_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_purchase_orders_expected_delivery_date ON public.purchase_orders USING btree (expected_delivery_date);


--
-- Name: idx_purchase_orders_expedition; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_purchase_orders_expedition ON public.purchase_orders USING btree (expedition);


--
-- Name: idx_purchase_orders_supplier_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_purchase_orders_supplier_name ON public.purchase_orders USING btree (supplier_name);


--
-- Name: idx_retasi_departure_date; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_retasi_departure_date ON public.retasi USING btree (departure_date);


--
-- Name: idx_retasi_driver_date; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_retasi_driver_date ON public.retasi USING btree (driver_name, departure_date);


--
-- Name: idx_retasi_returned; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_retasi_returned ON public.retasi USING btree (is_returned);


--
-- Name: idx_roles_active; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_roles_active ON public.roles USING btree (is_active);


--
-- Name: idx_roles_name; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_roles_name ON public.roles USING btree (name);


--
-- Name: idx_stock_pricings_active; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_stock_pricings_active ON public.stock_pricings USING btree (is_active);


--
-- Name: idx_stock_pricings_product_id; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_stock_pricings_product_id ON public.stock_pricings USING btree (product_id);


--
-- Name: idx_stock_pricings_stock_range; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_stock_pricings_stock_range ON public.stock_pricings USING btree (min_stock, max_stock);


--
-- Name: idx_supplier_materials_material_id; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_supplier_materials_material_id ON public.supplier_materials USING btree (material_id);


--
-- Name: idx_supplier_materials_supplier_id; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_supplier_materials_supplier_id ON public.supplier_materials USING btree (supplier_id);


--
-- Name: idx_suppliers_code; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_suppliers_code ON public.suppliers USING btree (code);


--
-- Name: idx_suppliers_is_active; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_suppliers_is_active ON public.suppliers USING btree (is_active);


--
-- Name: idx_suppliers_name; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE INDEX idx_suppliers_name ON public.suppliers USING btree (name);


--
-- Name: idx_transaction_payments_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transaction_payments_date ON public.transaction_payments USING btree (payment_date);


--
-- Name: idx_transaction_payments_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transaction_payments_status ON public.transaction_payments USING btree (status);


--
-- Name: idx_transaction_payments_transaction_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transaction_payments_transaction_id ON public.transaction_payments USING btree (transaction_id);


--
-- Name: idx_transactions_cashier_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transactions_cashier_id ON public.transactions USING btree (cashier_id);


--
-- Name: idx_transactions_customer_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transactions_customer_id ON public.transactions USING btree (customer_id);


--
-- Name: idx_transactions_delivery_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transactions_delivery_status ON public.transactions USING btree (status, is_office_sale) WHERE (status = ANY (ARRAY['Siap Antar'::text, 'Diantar Sebagian'::text]));


--
-- Name: idx_transactions_due_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transactions_due_date ON public.transactions USING btree (due_date);


--
-- Name: idx_transactions_is_office_sale; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transactions_is_office_sale ON public.transactions USING btree (is_office_sale);


--
-- Name: idx_transactions_order_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transactions_order_date ON public.transactions USING btree (order_date);


--
-- Name: idx_transactions_payment_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transactions_payment_status ON public.transactions USING btree (payment_status);


--
-- Name: idx_transactions_ppn_enabled; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transactions_ppn_enabled ON public.transactions USING btree (ppn_enabled);


--
-- Name: idx_transactions_retasi_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transactions_retasi_id ON public.transactions USING btree (retasi_id);


--
-- Name: idx_transactions_retasi_number; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transactions_retasi_number ON public.transactions USING btree (retasi_number);


--
-- Name: idx_transactions_sales_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transactions_sales_id ON public.transactions USING btree (sales_id);


--
-- Name: idx_transactions_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transactions_status ON public.transactions USING btree (status);


--
-- Name: role_permissions_role_id_idx; Type: INDEX; Schema: public; Owner: aquavit
--

CREATE UNIQUE INDEX role_permissions_role_id_idx ON public.role_permissions USING btree (role_id);


--
-- Name: accounts accounts_auto_fill; Type: TRIGGER; Schema: public; Owner: aquavit
--

CREATE TRIGGER accounts_auto_fill BEFORE INSERT ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.auto_fill_account_type();


--
-- Name: accounts accounts_auto_fill_update; Type: TRIGGER; Schema: public; Owner: aquavit
--

CREATE TRIGGER accounts_auto_fill_update BEFORE UPDATE ON public.accounts FOR EACH ROW WHEN ((old.parent_id IS DISTINCT FROM new.parent_id)) EXECUTE FUNCTION public.auto_fill_account_type();


--
-- Name: attendance attendance_before_insert; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER attendance_before_insert BEFORE INSERT ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.sync_attendance_user_id();


--
-- Name: attendance attendance_sync_checkin; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER attendance_sync_checkin BEFORE INSERT OR UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.sync_attendance_checkin();


--
-- Name: attendance attendance_sync_ids; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER attendance_sync_ids BEFORE INSERT OR UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.sync_attendance_ids();


--
-- Name: profiles audit_profiles_trigger; Type: TRIGGER; Schema: public; Owner: aquavit
--

CREATE TRIGGER audit_profiles_trigger AFTER INSERT OR DELETE OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.audit_profiles_changes();


--
-- Name: transactions audit_transactions_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER audit_transactions_trigger AFTER INSERT OR DELETE OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.audit_transactions_changes();


--
-- Name: delivery_items delivery_items_status_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER delivery_items_status_trigger AFTER INSERT OR DELETE OR UPDATE ON public.delivery_items FOR EACH ROW EXECUTE FUNCTION public.update_transaction_delivery_status();


--
-- Name: transactions on_receivable_payment; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER on_receivable_payment AFTER UPDATE OF paid_amount ON public.transactions FOR EACH ROW WHEN ((new.paid_amount IS DISTINCT FROM old.paid_amount)) EXECUTE FUNCTION public.record_payment_history();


--
-- Name: deliveries set_delivery_number_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER set_delivery_number_trigger BEFORE INSERT ON public.deliveries FOR EACH ROW EXECUTE FUNCTION public.generate_delivery_number();


--
-- Name: transactions transaction_status_validation; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER transaction_status_validation BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.validate_transaction_status_transition();


--
-- Name: commission_entries trigger_calculate_commission_amount; Type: TRIGGER; Schema: public; Owner: aquavit
--

CREATE TRIGGER trigger_calculate_commission_amount BEFORE INSERT OR UPDATE ON public.commission_entries FOR EACH ROW EXECUTE FUNCTION public.calculate_commission_amount();


--
-- Name: cash_history trigger_notify_cash_history; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_notify_cash_history AFTER INSERT ON public.cash_history FOR EACH ROW EXECUTE FUNCTION public.notify_debt_payment();


--
-- Name: cash_history trigger_notify_payroll; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_notify_payroll AFTER INSERT ON public.cash_history FOR EACH ROW EXECUTE FUNCTION public.notify_payroll_processed();


--
-- Name: purchase_orders trigger_notify_purchase_order; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_notify_purchase_order AFTER INSERT ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.notify_purchase_order_created();


--
-- Name: commission_rules trigger_populate_commission_product_info; Type: TRIGGER; Schema: public; Owner: aquavit
--

CREATE TRIGGER trigger_populate_commission_product_info BEFORE INSERT OR UPDATE ON public.commission_rules FOR EACH ROW EXECUTE FUNCTION public.populate_commission_product_info();


--
-- Name: retasi trigger_set_retasi_ke_and_number; Type: TRIGGER; Schema: public; Owner: aquavit
--

CREATE TRIGGER trigger_set_retasi_ke_and_number BEFORE INSERT ON public.retasi FOR EACH ROW EXECUTE FUNCTION public.set_retasi_ke_and_number();


--
-- Name: suppliers trigger_set_supplier_code; Type: TRIGGER; Schema: public; Owner: aquavit
--

CREATE TRIGGER trigger_set_supplier_code BEFORE INSERT OR UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.set_supplier_code();


--
-- Name: transactions trigger_update_payment_status; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_payment_status BEFORE INSERT OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.update_payment_status();


--
-- Name: accounts update_accounts_updated_at; Type: TRIGGER; Schema: public; Owner: aquavit
--

CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: bonus_pricings update_bonus_pricings_updated_at; Type: TRIGGER; Schema: public; Owner: aquavit
--

CREATE TRIGGER update_bonus_pricings_updated_at BEFORE UPDATE ON public.bonus_pricings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: cash_history update_cash_history_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_cash_history_updated_at BEFORE UPDATE ON public.cash_history FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: employee_salaries update_employee_salaries_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_employee_salaries_updated_at BEFORE UPDATE ON public.employee_salaries FOR EACH ROW EXECUTE FUNCTION public.update_payroll_updated_at();


--
-- Name: product_materials update_product_materials_updated_at; Type: TRIGGER; Schema: public; Owner: aquavit
--

CREATE TRIGGER update_product_materials_updated_at BEFORE UPDATE ON public.product_materials FOR EACH ROW EXECUTE FUNCTION public.update_product_materials_updated_at();


--
-- Name: production_records update_production_records_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_production_records_updated_at BEFORE UPDATE ON public.production_records FOR EACH ROW EXECUTE FUNCTION public.update_production_records_updated_at();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: aquavit
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_profiles_updated_at();


--
-- Name: retasi update_retasi_updated_at; Type: TRIGGER; Schema: public; Owner: aquavit
--

CREATE TRIGGER update_retasi_updated_at BEFORE UPDATE ON public.retasi FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: roles update_roles_updated_at; Type: TRIGGER; Schema: public; Owner: aquavit
--

CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: stock_pricings update_stock_pricings_updated_at; Type: TRIGGER; Schema: public; Owner: aquavit
--

CREATE TRIGGER update_stock_pricings_updated_at BEFORE UPDATE ON public.stock_pricings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: accounts accounts_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: accounts accounts_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_parent_fk FOREIGN KEY (parent_id) REFERENCES public.accounts(id) ON DELETE RESTRICT;


--
-- Name: accounts_payable accounts_payable_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounts_payable
    ADD CONSTRAINT accounts_payable_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: accounts_payable accounts_payable_payment_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounts_payable
    ADD CONSTRAINT accounts_payable_payment_account_id_fkey FOREIGN KEY (payment_account_id) REFERENCES public.accounts(id);


--
-- Name: advance_repayments advance_repayments_advance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.advance_repayments
    ADD CONSTRAINT advance_repayments_advance_id_fkey FOREIGN KEY (advance_id) REFERENCES public.employee_advances(id) ON DELETE CASCADE;


--
-- Name: asset_maintenance asset_maintenance_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.asset_maintenance
    ADD CONSTRAINT asset_maintenance_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id);


--
-- Name: asset_maintenance asset_maintenance_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.asset_maintenance
    ADD CONSTRAINT asset_maintenance_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: asset_maintenance asset_maintenance_completed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.asset_maintenance
    ADD CONSTRAINT asset_maintenance_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.profiles(id);


--
-- Name: asset_maintenance asset_maintenance_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.asset_maintenance
    ADD CONSTRAINT asset_maintenance_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: asset_maintenance asset_maintenance_payment_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.asset_maintenance
    ADD CONSTRAINT asset_maintenance_payment_account_id_fkey FOREIGN KEY (payment_account_id) REFERENCES public.accounts(id);


--
-- Name: assets assets_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: assets assets_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: assets assets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: attendance attendance_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: attendance attendance_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.profiles(id);


--
-- Name: attendance attendance_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: balance_adjustments balance_adjustments_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.balance_adjustments
    ADD CONSTRAINT balance_adjustments_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: balance_adjustments balance_adjustments_adjusted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.balance_adjustments
    ADD CONSTRAINT balance_adjustments_adjusted_by_fkey FOREIGN KEY (adjusted_by) REFERENCES public.profiles(id);


--
-- Name: balance_adjustments balance_adjustments_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.balance_adjustments
    ADD CONSTRAINT balance_adjustments_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id);


--
-- Name: bonus_pricings bonus_pricings_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.bonus_pricings
    ADD CONSTRAINT bonus_pricings_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: branches branches_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: branches branches_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES public.profiles(id);


--
-- Name: cash_history cash_history_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cash_history
    ADD CONSTRAINT cash_history_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: cash_history cash_history_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cash_history
    ADD CONSTRAINT cash_history_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: cash_history cash_history_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cash_history
    ADD CONSTRAINT cash_history_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: commission_entries commission_entries_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.commission_entries
    ADD CONSTRAINT commission_entries_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: customer_pricings customer_pricings_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_pricings
    ADD CONSTRAINT customer_pricings_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: customer_pricings customer_pricings_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_pricings
    ADD CONSTRAINT customer_pricings_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: customer_pricings customer_pricings_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_pricings
    ADD CONSTRAINT customer_pricings_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: customers customers_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: deliveries deliveries_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: deliveries deliveries_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.profiles(id);


--
-- Name: deliveries deliveries_helper_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_helper_id_fkey FOREIGN KEY (helper_id) REFERENCES public.profiles(id);


--
-- Name: deliveries deliveries_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE;


--
-- Name: delivery_items delivery_items_delivery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.delivery_items
    ADD CONSTRAINT delivery_items_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES public.deliveries(id) ON DELETE CASCADE;


--
-- Name: delivery_items delivery_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.delivery_items
    ADD CONSTRAINT delivery_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: delivery_photos delivery_photos_delivery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.delivery_photos
    ADD CONSTRAINT delivery_photos_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES public.deliveries(id);


--
-- Name: employee_advances employee_advances_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_advances
    ADD CONSTRAINT employee_advances_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: employee_advances employee_advances_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_advances
    ADD CONSTRAINT employee_advances_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id);


--
-- Name: employee_advances employee_advances_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_advances
    ADD CONSTRAINT employee_advances_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: employee_advances employee_advances_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_advances
    ADD CONSTRAINT employee_advances_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.profiles(id);


--
-- Name: employee_salaries employee_salaries_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_salaries
    ADD CONSTRAINT employee_salaries_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: employee_salaries employee_salaries_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_salaries
    ADD CONSTRAINT employee_salaries_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: expenses expenses_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: expenses expenses_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: expenses fk_expenses_expense_account; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT fk_expenses_expense_account FOREIGN KEY (expense_account_id) REFERENCES public.accounts(id);


--
-- Name: material_stock_movements fk_material_stock_movement_material; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.material_stock_movements
    ADD CONSTRAINT fk_material_stock_movement_material FOREIGN KEY (material_id) REFERENCES public.materials(id) ON DELETE CASCADE;


--
-- Name: material_stock_movements fk_material_stock_movement_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.material_stock_movements
    ADD CONSTRAINT fk_material_stock_movement_user FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: manual_journal_entry_lines manual_journal_entry_lines_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.manual_journal_entry_lines
    ADD CONSTRAINT manual_journal_entry_lines_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.manual_journal_entries(id) ON DELETE CASCADE;


--
-- Name: material_stock_movements material_stock_movements_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.material_stock_movements
    ADD CONSTRAINT material_stock_movements_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: materials materials_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.materials
    ADD CONSTRAINT materials_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: nishab_reference nishab_reference_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.nishab_reference
    ADD CONSTRAINT nishab_reference_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: payment_history payment_history_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_history
    ADD CONSTRAINT payment_history_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: payment_history payment_history_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_history
    ADD CONSTRAINT payment_history_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: payment_history payment_history_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_history
    ADD CONSTRAINT payment_history_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.profiles(id);


--
-- Name: payment_history payment_history_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_history
    ADD CONSTRAINT payment_history_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE;


--
-- Name: payroll_records payroll_records_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payroll_records
    ADD CONSTRAINT payroll_records_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: payroll_records payroll_records_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payroll_records
    ADD CONSTRAINT payroll_records_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: payroll_records payroll_records_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payroll_records
    ADD CONSTRAINT payroll_records_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.profiles(id);


--
-- Name: product_materials product_materials_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.product_materials
    ADD CONSTRAINT product_materials_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.materials(id) ON DELETE CASCADE;


--
-- Name: product_materials product_materials_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.product_materials
    ADD CONSTRAINT product_materials_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: production_errors production_errors_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.production_errors
    ADD CONSTRAINT production_errors_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: production_errors production_errors_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.production_errors
    ADD CONSTRAINT production_errors_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.materials(id) ON DELETE CASCADE;


--
-- Name: production_records production_records_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.production_records
    ADD CONSTRAINT production_records_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: production_records production_records_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.production_records
    ADD CONSTRAINT production_records_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: production_records production_records_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.production_records
    ADD CONSTRAINT production_records_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: products products_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: profiles profiles_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: purchase_order_items purchase_order_items_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.materials(id);


--
-- Name: purchase_order_items purchase_order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: purchase_order_items purchase_order_items_purchase_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE;


--
-- Name: purchase_orders purchase_orders_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: purchase_orders purchase_orders_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.materials(id);


--
-- Name: purchase_orders purchase_orders_payment_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_payment_account_id_fkey FOREIGN KEY (payment_account_id) REFERENCES public.accounts(id);


--
-- Name: purchase_orders purchase_orders_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: quotations quotations_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: quotations quotations_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: retasi retasi_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.retasi
    ADD CONSTRAINT retasi_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: retasi retasi_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.retasi
    ADD CONSTRAINT retasi_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.profiles(id);


--
-- Name: retasi retasi_helper_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.retasi
    ADD CONSTRAINT retasi_helper_id_fkey FOREIGN KEY (helper_id) REFERENCES public.profiles(id);


--
-- Name: retasi_items retasi_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.retasi_items
    ADD CONSTRAINT retasi_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: retasi_items retasi_items_retasi_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.retasi_items
    ADD CONSTRAINT retasi_items_retasi_id_fkey FOREIGN KEY (retasi_id) REFERENCES public.retasi(id) ON DELETE CASCADE;


--
-- Name: stock_pricings stock_pricings_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.stock_pricings
    ADD CONSTRAINT stock_pricings_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: supplier_materials supplier_materials_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.supplier_materials
    ADD CONSTRAINT supplier_materials_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.materials(id) ON DELETE CASCADE;


--
-- Name: supplier_materials supplier_materials_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.supplier_materials
    ADD CONSTRAINT supplier_materials_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;


--
-- Name: suppliers suppliers_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: aquavit
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: transaction_payments transaction_payments_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transaction_payments
    ADD CONSTRAINT transaction_payments_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: transaction_payments transaction_payments_cancelled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transaction_payments
    ADD CONSTRAINT transaction_payments_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES public.profiles(id);


--
-- Name: transaction_payments transaction_payments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transaction_payments
    ADD CONSTRAINT transaction_payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: transaction_payments transaction_payments_paid_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transaction_payments
    ADD CONSTRAINT transaction_payments_paid_by_user_id_fkey FOREIGN KEY (paid_by_user_id) REFERENCES public.profiles(id);


--
-- Name: transaction_payments transaction_payments_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transaction_payments
    ADD CONSTRAINT transaction_payments_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE;


--
-- Name: transactions transactions_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: transactions transactions_cashier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_cashier_id_fkey FOREIGN KEY (cashier_id) REFERENCES public.profiles(id);


--
-- Name: transactions transactions_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: transactions transactions_designer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_designer_id_fkey FOREIGN KEY (designer_id) REFERENCES public.profiles(id);


--
-- Name: transactions transactions_operator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_operator_id_fkey FOREIGN KEY (operator_id) REFERENCES public.profiles(id);


--
-- Name: transactions transactions_payment_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_payment_account_id_fkey FOREIGN KEY (payment_account_id) REFERENCES public.accounts(id);


--
-- Name: transactions transactions_retasi_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_retasi_id_fkey FOREIGN KEY (retasi_id) REFERENCES public.retasi(id) ON DELETE SET NULL;


--
-- Name: transactions transactions_sales_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_sales_id_fkey FOREIGN KEY (sales_id) REFERENCES public.profiles(id);


--
-- Name: user_roles user_roles_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.profiles(id);


--
-- Name: user_roles user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id);


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: accounts_payable Allow all for accounts_payable; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all for accounts_payable" ON public.accounts_payable USING (true) WITH CHECK (true);


--
-- Name: zakat_records Allow all for authenticated users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all for authenticated users" ON public.zakat_records USING (true) WITH CHECK (true);


--
-- Name: nishab_reference Allow all for nishab_reference; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all for nishab_reference" ON public.nishab_reference USING (true) WITH CHECK (true);


--
-- Name: accounts; Type: ROW SECURITY; Schema: public; Owner: aquavit
--

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: accounts accounts_delete; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY accounts_delete ON public.accounts FOR DELETE USING (public.has_perm('accounts_delete'::text));


--
-- Name: accounts accounts_insert; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY accounts_insert ON public.accounts FOR INSERT WITH CHECK (public.has_perm('accounts_create'::text));


--
-- Name: accounts_payable; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;

--
-- Name: accounts accounts_select; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY accounts_select ON public.accounts FOR SELECT USING (public.has_perm('accounts_view'::text));


--
-- Name: accounts accounts_update; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY accounts_update ON public.accounts FOR UPDATE USING (public.has_perm('accounts_edit'::text));


--
-- Name: advance_repayments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.advance_repayments ENABLE ROW LEVEL SECURITY;

--
-- Name: asset_maintenance; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.asset_maintenance ENABLE ROW LEVEL SECURITY;

--
-- Name: asset_maintenance asset_maintenance_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY asset_maintenance_delete ON public.asset_maintenance FOR DELETE USING (public.has_perm('assets_delete'::text));


--
-- Name: asset_maintenance asset_maintenance_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY asset_maintenance_insert ON public.asset_maintenance FOR INSERT WITH CHECK (public.has_perm('assets_edit'::text));


--
-- Name: asset_maintenance asset_maintenance_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY asset_maintenance_select ON public.asset_maintenance FOR SELECT USING (public.has_perm('assets_view'::text));


--
-- Name: asset_maintenance asset_maintenance_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY asset_maintenance_update ON public.asset_maintenance FOR UPDATE USING (public.has_perm('assets_edit'::text));


--
-- Name: assets; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

--
-- Name: assets assets_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY assets_delete ON public.assets FOR DELETE USING (public.has_perm('assets_delete'::text));


--
-- Name: assets assets_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY assets_insert ON public.assets FOR INSERT WITH CHECK (public.has_perm('assets_create'::text));


--
-- Name: assets assets_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY assets_select ON public.assets FOR SELECT USING (public.has_perm('assets_view'::text));


--
-- Name: assets assets_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY assets_update ON public.assets FOR UPDATE USING (public.has_perm('assets_edit'::text));


--
-- Name: attendance; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance attendance_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY attendance_delete ON public.attendance FOR DELETE USING (public.has_perm('attendance_delete'::text));


--
-- Name: attendance attendance_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY attendance_insert ON public.attendance FOR INSERT WITH CHECK (public.has_perm('attendance_create'::text));


--
-- Name: attendance attendance_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY attendance_select ON public.attendance FOR SELECT USING (public.has_perm('attendance_view'::text));


--
-- Name: attendance attendance_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY attendance_update ON public.attendance FOR UPDATE USING (public.has_perm('attendance_edit'::text));


--
-- Name: balance_adjustments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.balance_adjustments ENABLE ROW LEVEL SECURITY;

--
-- Name: bonus_pricings; Type: ROW SECURITY; Schema: public; Owner: aquavit
--

ALTER TABLE public.bonus_pricings ENABLE ROW LEVEL SECURITY;

--
-- Name: branches; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

--
-- Name: branches branches_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY branches_delete ON public.branches FOR DELETE USING (true);


--
-- Name: branches branches_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY branches_insert ON public.branches FOR INSERT WITH CHECK (true);


--
-- Name: branches branches_manage; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY branches_manage ON public.branches USING (public.has_perm('role_management'::text));


--
-- Name: branches branches_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY branches_select ON public.branches FOR SELECT USING (true);


--
-- Name: branches branches_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY branches_update ON public.branches FOR UPDATE USING (true);


--
-- Name: cash_history; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.cash_history ENABLE ROW LEVEL SECURITY;

--
-- Name: cash_history cash_history_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY cash_history_delete ON public.cash_history FOR DELETE USING (public.has_perm('transactions_delete'::text));


--
-- Name: cash_history cash_history_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY cash_history_insert ON public.cash_history FOR INSERT WITH CHECK (public.has_perm('transactions_create'::text));


--
-- Name: cash_history cash_history_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY cash_history_select ON public.cash_history FOR SELECT USING (public.has_perm('transactions_view'::text));


--
-- Name: cash_history cash_history_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY cash_history_update ON public.cash_history FOR UPDATE USING (public.has_perm('transactions_edit'::text));


--
-- Name: commission_entries; Type: ROW SECURITY; Schema: public; Owner: aquavit
--

ALTER TABLE public.commission_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: commission_rules; Type: ROW SECURITY; Schema: public; Owner: aquavit
--

ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: companies; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

--
-- Name: companies companies_manage; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY companies_manage ON public.companies USING (public.has_perm('role_management'::text));


--
-- Name: companies companies_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY companies_select ON public.companies FOR SELECT USING (true);


--
-- Name: company_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: company_settings company_settings_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY company_settings_delete ON public.company_settings FOR DELETE USING (public.has_perm('settings_access'::text));


--
-- Name: company_settings company_settings_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY company_settings_insert ON public.company_settings FOR INSERT WITH CHECK (true);


--
-- Name: company_settings company_settings_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY company_settings_select ON public.company_settings FOR SELECT USING (true);


--
-- Name: company_settings company_settings_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY company_settings_update ON public.company_settings FOR UPDATE USING (true);


--
-- Name: customer_pricings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.customer_pricings ENABLE ROW LEVEL SECURITY;

--
-- Name: customers; Type: ROW SECURITY; Schema: public; Owner: aquavit
--

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

--
-- Name: customers customers_delete; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY customers_delete ON public.customers FOR DELETE USING (public.has_perm('customers_delete'::text));


--
-- Name: customers customers_insert; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY customers_insert ON public.customers FOR INSERT WITH CHECK (public.has_perm('customers_create'::text));


--
-- Name: customers customers_select; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY customers_select ON public.customers FOR SELECT USING (public.has_perm('customers_view'::text));


--
-- Name: customers customers_update; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY customers_update ON public.customers FOR UPDATE USING (public.has_perm('customers_edit'::text));


--
-- Name: deliveries; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

--
-- Name: deliveries deliveries_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY deliveries_delete ON public.deliveries FOR DELETE USING (true);


--
-- Name: deliveries deliveries_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY deliveries_insert ON public.deliveries FOR INSERT WITH CHECK (true);


--
-- Name: deliveries deliveries_manage; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY deliveries_manage ON public.deliveries USING (public.has_perm('transactions_create'::text));


--
-- Name: deliveries deliveries_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY deliveries_select ON public.deliveries FOR SELECT USING (true);


--
-- Name: deliveries deliveries_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY deliveries_update ON public.deliveries FOR UPDATE USING (true);


--
-- Name: delivery_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.delivery_items ENABLE ROW LEVEL SECURITY;

--
-- Name: delivery_items delivery_items_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY delivery_items_delete ON public.delivery_items FOR DELETE USING (true);


--
-- Name: delivery_items delivery_items_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY delivery_items_insert ON public.delivery_items FOR INSERT WITH CHECK (true);


--
-- Name: delivery_items delivery_items_manage; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY delivery_items_manage ON public.delivery_items USING (public.has_perm('transactions_create'::text));


--
-- Name: delivery_items delivery_items_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY delivery_items_select ON public.delivery_items FOR SELECT USING (true);


--
-- Name: delivery_items delivery_items_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY delivery_items_update ON public.delivery_items FOR UPDATE USING (true);


--
-- Name: delivery_photos; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.delivery_photos ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_advances; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.employee_advances ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_advances employee_advances_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY employee_advances_delete ON public.employee_advances FOR DELETE USING (public.has_perm('payroll_delete'::text));


--
-- Name: employee_advances employee_advances_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY employee_advances_insert ON public.employee_advances FOR INSERT WITH CHECK (public.has_perm('payroll_create'::text));


--
-- Name: employee_advances employee_advances_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY employee_advances_select ON public.employee_advances FOR SELECT USING (public.has_perm('payroll_view'::text));


--
-- Name: employee_advances employee_advances_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY employee_advances_update ON public.employee_advances FOR UPDATE USING (public.has_perm('payroll_edit'::text));


--
-- Name: employee_salaries; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.employee_salaries ENABLE ROW LEVEL SECURITY;

--
-- Name: expenses; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: expenses expenses_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY expenses_delete ON public.expenses FOR DELETE USING (public.has_perm('expenses_delete'::text));


--
-- Name: expenses expenses_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY expenses_insert ON public.expenses FOR INSERT WITH CHECK (public.has_perm('expenses_create'::text));


--
-- Name: expenses expenses_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY expenses_select ON public.expenses FOR SELECT USING (public.has_perm('expenses_view'::text));


--
-- Name: expenses expenses_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY expenses_update ON public.expenses FOR UPDATE USING (public.has_perm('expenses_edit'::text));


--
-- Name: manual_journal_entries; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.manual_journal_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: manual_journal_entry_lines; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.manual_journal_entry_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: material_stock_movements; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.material_stock_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: material_stock_movements material_stock_movements_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY material_stock_movements_delete ON public.material_stock_movements FOR DELETE USING (public.has_perm('materials_delete'::text));


--
-- Name: material_stock_movements material_stock_movements_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY material_stock_movements_insert ON public.material_stock_movements FOR INSERT WITH CHECK (public.has_perm('materials_edit'::text));


--
-- Name: material_stock_movements material_stock_movements_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY material_stock_movements_select ON public.material_stock_movements FOR SELECT USING (public.has_perm('materials_view'::text));


--
-- Name: material_stock_movements material_stock_movements_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY material_stock_movements_update ON public.material_stock_movements FOR UPDATE USING (public.has_perm('materials_edit'::text));


--
-- Name: materials materials_delete; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY materials_delete ON public.materials FOR DELETE USING (public.has_perm('materials_delete'::text));


--
-- Name: materials materials_insert; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY materials_insert ON public.materials FOR INSERT WITH CHECK (public.has_perm('materials_create'::text));


--
-- Name: materials materials_select; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY materials_select ON public.materials FOR SELECT USING (public.has_perm('materials_view'::text));


--
-- Name: materials materials_update; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY materials_update ON public.materials FOR UPDATE USING (public.has_perm('materials_edit'::text));


--
-- Name: nishab_reference; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.nishab_reference ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY notifications_delete ON public.notifications FOR DELETE USING (public.has_perm('dashboard_view'::text));


--
-- Name: notifications notifications_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY notifications_insert ON public.notifications FOR INSERT WITH CHECK (public.has_perm('dashboard_view'::text));


--
-- Name: notifications notifications_manage; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY notifications_manage ON public.notifications USING (true);


--
-- Name: notifications notifications_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY notifications_select ON public.notifications FOR SELECT USING (public.has_perm('dashboard_view'::text));


--
-- Name: notifications notifications_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY notifications_update ON public.notifications FOR UPDATE USING (public.has_perm('dashboard_view'::text));


--
-- Name: payment_history; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;

--
-- Name: payroll_records; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;

--
-- Name: product_materials; Type: ROW SECURITY; Schema: public; Owner: aquavit
--

ALTER TABLE public.product_materials ENABLE ROW LEVEL SECURITY;

--
-- Name: product_materials product_materials_delete; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY product_materials_delete ON public.product_materials FOR DELETE USING (public.has_perm('products_delete'::text));


--
-- Name: product_materials product_materials_insert; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY product_materials_insert ON public.product_materials FOR INSERT WITH CHECK (public.has_perm('products_edit'::text));


--
-- Name: product_materials product_materials_select; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY product_materials_select ON public.product_materials FOR SELECT USING (public.has_perm('products_view'::text));


--
-- Name: product_materials product_materials_update; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY product_materials_update ON public.product_materials FOR UPDATE USING (public.has_perm('products_edit'::text));


--
-- Name: production_errors; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.production_errors ENABLE ROW LEVEL SECURITY;

--
-- Name: production_records; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.production_records ENABLE ROW LEVEL SECURITY;

--
-- Name: production_records production_records_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY production_records_delete ON public.production_records FOR DELETE USING (public.has_perm('production_delete'::text));


--
-- Name: production_records production_records_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY production_records_insert ON public.production_records FOR INSERT WITH CHECK (public.has_perm('production_create'::text));


--
-- Name: production_records production_records_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY production_records_select ON public.production_records FOR SELECT USING (public.has_perm('production_view'::text));


--
-- Name: production_records production_records_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY production_records_update ON public.production_records FOR UPDATE USING (public.has_perm('production_edit'::text));


--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: aquavit
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: products products_delete; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY products_delete ON public.products FOR DELETE USING (public.has_perm('products_delete'::text));


--
-- Name: products products_insert; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY products_insert ON public.products FOR INSERT WITH CHECK (public.has_perm('products_create'::text));


--
-- Name: products products_select; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY products_select ON public.products FOR SELECT USING (public.has_perm('products_view'::text));


--
-- Name: products products_update; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY products_update ON public.products FOR UPDATE USING (public.has_perm('products_edit'::text));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: aquavit
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_delete; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY profiles_delete ON public.profiles FOR DELETE USING (public.has_perm('payroll_delete'::text));


--
-- Name: profiles profiles_insert; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY profiles_insert ON public.profiles FOR INSERT WITH CHECK (public.has_perm('payroll_create'::text));


--
-- Name: profiles profiles_select; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY profiles_select ON public.profiles FOR SELECT USING ((((current_setting('request.jwt.claims'::text, true))::json ->> 'role'::text) IS NOT NULL));


--
-- Name: profiles profiles_update; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY profiles_update ON public.profiles FOR UPDATE USING (public.has_perm('payroll_edit'::text));


--
-- Name: purchase_order_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_order_items purchase_order_items_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY purchase_order_items_delete ON public.purchase_order_items FOR DELETE USING (true);


--
-- Name: purchase_order_items purchase_order_items_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY purchase_order_items_insert ON public.purchase_order_items FOR INSERT WITH CHECK (true);


--
-- Name: purchase_order_items purchase_order_items_manage; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY purchase_order_items_manage ON public.purchase_order_items USING (public.has_perm('expenses_create'::text));


--
-- Name: purchase_order_items purchase_order_items_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY purchase_order_items_select ON public.purchase_order_items FOR SELECT USING (true);


--
-- Name: purchase_order_items purchase_order_items_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY purchase_order_items_update ON public.purchase_order_items FOR UPDATE USING (true);


--
-- Name: purchase_orders; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_orders purchase_orders_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY purchase_orders_delete ON public.purchase_orders FOR DELETE USING (true);


--
-- Name: purchase_orders purchase_orders_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY purchase_orders_insert ON public.purchase_orders FOR INSERT WITH CHECK (true);


--
-- Name: purchase_orders purchase_orders_manage; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY purchase_orders_manage ON public.purchase_orders USING (public.has_perm('expenses_create'::text));


--
-- Name: purchase_orders purchase_orders_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY purchase_orders_select ON public.purchase_orders FOR SELECT USING (true);


--
-- Name: purchase_orders purchase_orders_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY purchase_orders_update ON public.purchase_orders FOR UPDATE USING (true);


--
-- Name: quotations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;

--
-- Name: quotations quotations_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY quotations_delete ON public.quotations FOR DELETE USING (public.has_perm('transactions_delete'::text));


--
-- Name: quotations quotations_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY quotations_insert ON public.quotations FOR INSERT WITH CHECK (public.has_perm('transactions_create'::text));


--
-- Name: quotations quotations_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY quotations_select ON public.quotations FOR SELECT USING (public.has_perm('transactions_view'::text));


--
-- Name: quotations quotations_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY quotations_update ON public.quotations FOR UPDATE USING (public.has_perm('transactions_edit'::text));


--
-- Name: retasi; Type: ROW SECURITY; Schema: public; Owner: aquavit
--

ALTER TABLE public.retasi ENABLE ROW LEVEL SECURITY;

--
-- Name: retasi retasi_delete; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY retasi_delete ON public.retasi FOR DELETE USING (public.has_perm('transactions_delete'::text));


--
-- Name: retasi retasi_insert; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY retasi_insert ON public.retasi FOR INSERT WITH CHECK (public.has_perm('transactions_create'::text));


--
-- Name: retasi_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.retasi_items ENABLE ROW LEVEL SECURITY;

--
-- Name: retasi_items retasi_items_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY retasi_items_delete ON public.retasi_items FOR DELETE USING (public.has_perm('transactions_delete'::text));


--
-- Name: retasi_items retasi_items_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY retasi_items_insert ON public.retasi_items FOR INSERT WITH CHECK (public.has_perm('transactions_create'::text));


--
-- Name: retasi_items retasi_items_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY retasi_items_select ON public.retasi_items FOR SELECT USING (public.has_perm('transactions_view'::text));


--
-- Name: retasi_items retasi_items_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY retasi_items_update ON public.retasi_items FOR UPDATE USING (public.has_perm('transactions_edit'::text));


--
-- Name: retasi retasi_select; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY retasi_select ON public.retasi FOR SELECT USING (public.has_perm('transactions_view'::text));


--
-- Name: retasi retasi_update; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY retasi_update ON public.retasi FOR UPDATE USING (public.has_perm('transactions_edit'::text));


--
-- Name: role_permissions; Type: ROW SECURITY; Schema: public; Owner: aquavit
--

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: role_permissions role_permissions_manage; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY role_permissions_manage ON public.role_permissions USING (public.has_perm('role_management'::text));


--
-- Name: role_permissions role_permissions_select; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY role_permissions_select ON public.role_permissions FOR SELECT USING (public.has_perm('role_management'::text));


--
-- Name: roles; Type: ROW SECURITY; Schema: public; Owner: aquavit
--

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

--
-- Name: roles roles_manage; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY roles_manage ON public.roles USING (public.has_perm('role_management'::text));


--
-- Name: roles roles_select; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY roles_select ON public.roles FOR SELECT USING (true);


--
-- Name: stock_pricings; Type: ROW SECURITY; Schema: public; Owner: aquavit
--

ALTER TABLE public.stock_pricings ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_materials; Type: ROW SECURITY; Schema: public; Owner: aquavit
--

ALTER TABLE public.supplier_materials ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_materials supplier_materials_delete; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY supplier_materials_delete ON public.supplier_materials FOR DELETE USING (true);


--
-- Name: supplier_materials supplier_materials_insert; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY supplier_materials_insert ON public.supplier_materials FOR INSERT WITH CHECK (true);


--
-- Name: supplier_materials supplier_materials_select; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY supplier_materials_select ON public.supplier_materials FOR SELECT USING (true);


--
-- Name: supplier_materials supplier_materials_update; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY supplier_materials_update ON public.supplier_materials FOR UPDATE USING (true);


--
-- Name: suppliers; Type: ROW SECURITY; Schema: public; Owner: aquavit
--

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

--
-- Name: suppliers suppliers_delete; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY suppliers_delete ON public.suppliers FOR DELETE USING (true);


--
-- Name: suppliers suppliers_insert; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY suppliers_insert ON public.suppliers FOR INSERT WITH CHECK (true);


--
-- Name: suppliers suppliers_manage; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY suppliers_manage ON public.suppliers USING (public.has_perm('settings_access'::text));


--
-- Name: suppliers suppliers_select; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY suppliers_select ON public.suppliers FOR SELECT USING (true);


--
-- Name: suppliers suppliers_update; Type: POLICY; Schema: public; Owner: aquavit
--

CREATE POLICY suppliers_update ON public.suppliers FOR UPDATE USING (true);


--
-- Name: transaction_payments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.transaction_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: transaction_payments transaction_payments_manage; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY transaction_payments_manage ON public.transaction_payments USING (public.has_perm('transactions_create'::text));


--
-- Name: transaction_payments transaction_payments_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY transaction_payments_select ON public.transaction_payments FOR SELECT USING (public.has_perm('transactions_view'::text));


--
-- Name: transactions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: transactions transactions_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY transactions_delete ON public.transactions FOR DELETE USING (public.has_perm('transactions_delete'::text));


--
-- Name: transactions transactions_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY transactions_insert ON public.transactions FOR INSERT WITH CHECK (public.has_perm('transactions_create'::text));


--
-- Name: transactions transactions_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY transactions_select ON public.transactions FOR SELECT USING (public.has_perm('transactions_view'::text));


--
-- Name: transactions transactions_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY transactions_update ON public.transactions FOR UPDATE USING (public.has_perm('transactions_edit'::text));


--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: zakat_records; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.zakat_records ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA auth; Type: ACL; Schema: -; Owner: postgres
--

GRANT USAGE ON SCHEMA auth TO anon;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT USAGE ON SCHEMA auth TO aquavit;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: postgres
--

GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO aquavit;
GRANT USAGE ON SCHEMA public TO owner;
GRANT USAGE ON SCHEMA public TO admin;
GRANT USAGE ON SCHEMA public TO supervisor;
GRANT USAGE ON SCHEMA public TO cashier;
GRANT USAGE ON SCHEMA public TO designer;
GRANT USAGE ON SCHEMA public TO operator;


--
-- Name: FUNCTION email(); Type: ACL; Schema: auth; Owner: postgres
--

GRANT ALL ON FUNCTION auth.email() TO anon;
GRANT ALL ON FUNCTION auth.email() TO authenticated;
GRANT ALL ON FUNCTION auth.email() TO aquavit;


--
-- Name: FUNCTION has_role(required_role text); Type: ACL; Schema: auth; Owner: postgres
--

GRANT ALL ON FUNCTION auth.has_role(required_role text) TO authenticated;
GRANT ALL ON FUNCTION auth.has_role(required_role text) TO aquavit;
GRANT ALL ON FUNCTION auth.has_role(required_role text) TO owner;
GRANT ALL ON FUNCTION auth.has_role(required_role text) TO admin;
GRANT ALL ON FUNCTION auth.has_role(required_role text) TO cashier;
GRANT ALL ON FUNCTION auth.has_role(required_role text) TO anon;


--
-- Name: FUNCTION is_authenticated(); Type: ACL; Schema: auth; Owner: postgres
--

GRANT ALL ON FUNCTION auth.is_authenticated() TO authenticated;
GRANT ALL ON FUNCTION auth.is_authenticated() TO aquavit;
GRANT ALL ON FUNCTION auth.is_authenticated() TO owner;
GRANT ALL ON FUNCTION auth.is_authenticated() TO admin;
GRANT ALL ON FUNCTION auth.is_authenticated() TO cashier;
GRANT ALL ON FUNCTION auth.is_authenticated() TO anon;


--
-- Name: FUNCTION role(); Type: ACL; Schema: auth; Owner: postgres
--

GRANT ALL ON FUNCTION auth.role() TO anon;
GRANT ALL ON FUNCTION auth.role() TO authenticated;
GRANT ALL ON FUNCTION auth.role() TO aquavit;
GRANT ALL ON FUNCTION auth.role() TO owner;
GRANT ALL ON FUNCTION auth.role() TO admin;
GRANT ALL ON FUNCTION auth.role() TO cashier;


--
-- Name: FUNCTION uid(); Type: ACL; Schema: auth; Owner: postgres
--

GRANT ALL ON FUNCTION auth.uid() TO anon;
GRANT ALL ON FUNCTION auth.uid() TO authenticated;
GRANT ALL ON FUNCTION auth.uid() TO aquavit;


--
-- Name: FUNCTION add_material_stock(material_id uuid, quantity_to_add numeric); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.add_material_stock(material_id uuid, quantity_to_add numeric) TO authenticated;
GRANT ALL ON FUNCTION public.add_material_stock(material_id uuid, quantity_to_add numeric) TO anon;
GRANT ALL ON FUNCTION public.add_material_stock(material_id uuid, quantity_to_add numeric) TO aquavit;


--
-- Name: FUNCTION audit_profiles_changes(); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.audit_profiles_changes() TO authenticated;
GRANT ALL ON FUNCTION public.audit_profiles_changes() TO anon;


--
-- Name: FUNCTION audit_transactions_changes(); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.audit_transactions_changes() TO authenticated;
GRANT ALL ON FUNCTION public.audit_transactions_changes() TO anon;


--
-- Name: FUNCTION calculate_asset_current_value(p_asset_id text); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.calculate_asset_current_value(p_asset_id text) TO authenticated;
GRANT ALL ON FUNCTION public.calculate_asset_current_value(p_asset_id text) TO anon;


--
-- Name: FUNCTION calculate_commission_amount(); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.calculate_commission_amount() TO authenticated;
GRANT ALL ON FUNCTION public.calculate_commission_amount() TO anon;


--
-- Name: FUNCTION calculate_commission_for_period(emp_id uuid, start_date date, end_date date); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.calculate_commission_for_period(emp_id uuid, start_date date, end_date date) TO authenticated;
GRANT ALL ON FUNCTION public.calculate_commission_for_period(emp_id uuid, start_date date, end_date date) TO anon;
GRANT ALL ON FUNCTION public.calculate_commission_for_period(emp_id uuid, start_date date, end_date date) TO aquavit;


--
-- Name: FUNCTION calculate_payroll_with_advances(emp_id uuid, period_year integer, period_month integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.calculate_payroll_with_advances(emp_id uuid, period_year integer, period_month integer) TO authenticated;
GRANT ALL ON FUNCTION public.calculate_payroll_with_advances(emp_id uuid, period_year integer, period_month integer) TO anon;
GRANT ALL ON FUNCTION public.calculate_payroll_with_advances(emp_id uuid, period_year integer, period_month integer) TO aquavit;


--
-- Name: FUNCTION calculate_transaction_payment_status(p_transaction_id text); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.calculate_transaction_payment_status(p_transaction_id text) TO authenticated;
GRANT ALL ON FUNCTION public.calculate_transaction_payment_status(p_transaction_id text) TO anon;


--
-- Name: FUNCTION calculate_zakat_amount(p_asset_value numeric, p_nishab_type text); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.calculate_zakat_amount(p_asset_value numeric, p_nishab_type text) TO authenticated;
GRANT ALL ON FUNCTION public.calculate_zakat_amount(p_asset_value numeric, p_nishab_type text) TO anon;


--
-- Name: FUNCTION can_access_branch(branch_uuid uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_access_branch(branch_uuid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_access_branch(branch_uuid uuid) TO anon;
GRANT ALL ON FUNCTION public.can_access_branch(branch_uuid uuid) TO aquavit;


--
-- Name: FUNCTION can_access_pos(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_access_pos() TO anon;
GRANT ALL ON FUNCTION public.can_access_pos() TO authenticated;
GRANT ALL ON FUNCTION public.can_access_pos() TO aquavit;


--
-- Name: FUNCTION can_access_settings(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_access_settings() TO anon;
GRANT ALL ON FUNCTION public.can_access_settings() TO authenticated;
GRANT ALL ON FUNCTION public.can_access_settings() TO aquavit;


--
-- Name: FUNCTION can_create_accounts(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_create_accounts() TO anon;
GRANT ALL ON FUNCTION public.can_create_accounts() TO authenticated;
GRANT ALL ON FUNCTION public.can_create_accounts() TO aquavit;


--
-- Name: FUNCTION can_create_advances(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_create_advances() TO anon;
GRANT ALL ON FUNCTION public.can_create_advances() TO authenticated;
GRANT ALL ON FUNCTION public.can_create_advances() TO aquavit;


--
-- Name: FUNCTION can_create_customers(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_create_customers() TO anon;
GRANT ALL ON FUNCTION public.can_create_customers() TO authenticated;
GRANT ALL ON FUNCTION public.can_create_customers() TO aquavit;


--
-- Name: FUNCTION can_create_employees(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_create_employees() TO anon;
GRANT ALL ON FUNCTION public.can_create_employees() TO authenticated;
GRANT ALL ON FUNCTION public.can_create_employees() TO aquavit;


--
-- Name: FUNCTION can_create_expenses(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_create_expenses() TO anon;
GRANT ALL ON FUNCTION public.can_create_expenses() TO authenticated;
GRANT ALL ON FUNCTION public.can_create_expenses() TO aquavit;


--
-- Name: FUNCTION can_create_materials(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_create_materials() TO anon;
GRANT ALL ON FUNCTION public.can_create_materials() TO authenticated;
GRANT ALL ON FUNCTION public.can_create_materials() TO aquavit;


--
-- Name: FUNCTION can_create_products(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_create_products() TO anon;
GRANT ALL ON FUNCTION public.can_create_products() TO authenticated;
GRANT ALL ON FUNCTION public.can_create_products() TO aquavit;


--
-- Name: FUNCTION can_create_quotations(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_create_quotations() TO anon;
GRANT ALL ON FUNCTION public.can_create_quotations() TO authenticated;
GRANT ALL ON FUNCTION public.can_create_quotations() TO aquavit;


--
-- Name: FUNCTION can_create_transactions(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_create_transactions() TO anon;
GRANT ALL ON FUNCTION public.can_create_transactions() TO authenticated;
GRANT ALL ON FUNCTION public.can_create_transactions() TO aquavit;


--
-- Name: FUNCTION can_delete_customers(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_delete_customers() TO anon;
GRANT ALL ON FUNCTION public.can_delete_customers() TO authenticated;
GRANT ALL ON FUNCTION public.can_delete_customers() TO aquavit;


--
-- Name: FUNCTION can_delete_employees(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_delete_employees() TO anon;
GRANT ALL ON FUNCTION public.can_delete_employees() TO authenticated;
GRANT ALL ON FUNCTION public.can_delete_employees() TO aquavit;


--
-- Name: FUNCTION can_delete_materials(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_delete_materials() TO anon;
GRANT ALL ON FUNCTION public.can_delete_materials() TO authenticated;
GRANT ALL ON FUNCTION public.can_delete_materials() TO aquavit;


--
-- Name: FUNCTION can_delete_products(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_delete_products() TO anon;
GRANT ALL ON FUNCTION public.can_delete_products() TO authenticated;
GRANT ALL ON FUNCTION public.can_delete_products() TO aquavit;


--
-- Name: FUNCTION can_delete_transactions(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_delete_transactions() TO anon;
GRANT ALL ON FUNCTION public.can_delete_transactions() TO authenticated;
GRANT ALL ON FUNCTION public.can_delete_transactions() TO aquavit;


--
-- Name: FUNCTION can_edit_accounts(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_edit_accounts() TO anon;
GRANT ALL ON FUNCTION public.can_edit_accounts() TO authenticated;
GRANT ALL ON FUNCTION public.can_edit_accounts() TO aquavit;


--
-- Name: FUNCTION can_edit_customers(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_edit_customers() TO anon;
GRANT ALL ON FUNCTION public.can_edit_customers() TO authenticated;
GRANT ALL ON FUNCTION public.can_edit_customers() TO aquavit;


--
-- Name: FUNCTION can_edit_employees(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_edit_employees() TO anon;
GRANT ALL ON FUNCTION public.can_edit_employees() TO authenticated;
GRANT ALL ON FUNCTION public.can_edit_employees() TO aquavit;


--
-- Name: FUNCTION can_edit_materials(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_edit_materials() TO anon;
GRANT ALL ON FUNCTION public.can_edit_materials() TO authenticated;
GRANT ALL ON FUNCTION public.can_edit_materials() TO aquavit;


--
-- Name: FUNCTION can_edit_products(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_edit_products() TO anon;
GRANT ALL ON FUNCTION public.can_edit_products() TO authenticated;
GRANT ALL ON FUNCTION public.can_edit_products() TO aquavit;


--
-- Name: FUNCTION can_edit_quotations(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_edit_quotations() TO anon;
GRANT ALL ON FUNCTION public.can_edit_quotations() TO authenticated;
GRANT ALL ON FUNCTION public.can_edit_quotations() TO aquavit;


--
-- Name: FUNCTION can_edit_transactions(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_edit_transactions() TO anon;
GRANT ALL ON FUNCTION public.can_edit_transactions() TO authenticated;
GRANT ALL ON FUNCTION public.can_edit_transactions() TO aquavit;


--
-- Name: FUNCTION can_manage_roles(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_manage_roles() TO anon;
GRANT ALL ON FUNCTION public.can_manage_roles() TO authenticated;
GRANT ALL ON FUNCTION public.can_manage_roles() TO aquavit;


--
-- Name: FUNCTION can_view_accounts(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_view_accounts() TO anon;
GRANT ALL ON FUNCTION public.can_view_accounts() TO authenticated;
GRANT ALL ON FUNCTION public.can_view_accounts() TO aquavit;


--
-- Name: FUNCTION can_view_advances(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_view_advances() TO anon;
GRANT ALL ON FUNCTION public.can_view_advances() TO authenticated;
GRANT ALL ON FUNCTION public.can_view_advances() TO aquavit;


--
-- Name: FUNCTION can_view_customers(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_view_customers() TO anon;
GRANT ALL ON FUNCTION public.can_view_customers() TO authenticated;
GRANT ALL ON FUNCTION public.can_view_customers() TO aquavit;


--
-- Name: FUNCTION can_view_employees(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_view_employees() TO anon;
GRANT ALL ON FUNCTION public.can_view_employees() TO authenticated;
GRANT ALL ON FUNCTION public.can_view_employees() TO aquavit;


--
-- Name: FUNCTION can_view_expenses(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_view_expenses() TO anon;
GRANT ALL ON FUNCTION public.can_view_expenses() TO authenticated;
GRANT ALL ON FUNCTION public.can_view_expenses() TO aquavit;


--
-- Name: FUNCTION can_view_financial_reports(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_view_financial_reports() TO anon;
GRANT ALL ON FUNCTION public.can_view_financial_reports() TO authenticated;
GRANT ALL ON FUNCTION public.can_view_financial_reports() TO aquavit;


--
-- Name: FUNCTION can_view_materials(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_view_materials() TO anon;
GRANT ALL ON FUNCTION public.can_view_materials() TO authenticated;
GRANT ALL ON FUNCTION public.can_view_materials() TO aquavit;


--
-- Name: FUNCTION can_view_products(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_view_products() TO anon;
GRANT ALL ON FUNCTION public.can_view_products() TO authenticated;
GRANT ALL ON FUNCTION public.can_view_products() TO aquavit;


--
-- Name: FUNCTION can_view_quotations(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_view_quotations() TO anon;
GRANT ALL ON FUNCTION public.can_view_quotations() TO authenticated;
GRANT ALL ON FUNCTION public.can_view_quotations() TO aquavit;


--
-- Name: FUNCTION can_view_receivables(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_view_receivables() TO anon;
GRANT ALL ON FUNCTION public.can_view_receivables() TO authenticated;
GRANT ALL ON FUNCTION public.can_view_receivables() TO aquavit;


--
-- Name: FUNCTION can_view_stock_reports(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_view_stock_reports() TO anon;
GRANT ALL ON FUNCTION public.can_view_stock_reports() TO authenticated;
GRANT ALL ON FUNCTION public.can_view_stock_reports() TO aquavit;


--
-- Name: FUNCTION can_view_transactions(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_view_transactions() TO anon;
GRANT ALL ON FUNCTION public.can_view_transactions() TO authenticated;
GRANT ALL ON FUNCTION public.can_view_transactions() TO aquavit;


--
-- Name: FUNCTION cancel_transaction_payment(p_payment_id uuid, p_cancelled_by uuid, p_reason text); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.cancel_transaction_payment(p_payment_id uuid, p_cancelled_by uuid, p_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.cancel_transaction_payment(p_payment_id uuid, p_cancelled_by uuid, p_reason text) TO anon;


--
-- Name: FUNCTION cleanup_old_audit_logs(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.cleanup_old_audit_logs() TO authenticated;
GRANT ALL ON FUNCTION public.cleanup_old_audit_logs() TO anon;
GRANT ALL ON FUNCTION public.cleanup_old_audit_logs() TO aquavit;


--
-- Name: FUNCTION create_audit_log(p_table_name text, p_operation text, p_record_id text, p_old_data jsonb, p_new_data jsonb, p_additional_info jsonb); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.create_audit_log(p_table_name text, p_operation text, p_record_id text, p_old_data jsonb, p_new_data jsonb, p_additional_info jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.create_audit_log(p_table_name text, p_operation text, p_record_id text, p_old_data jsonb, p_new_data jsonb, p_additional_info jsonb) TO anon;


--
-- Name: FUNCTION create_maintenance_reminders(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.create_maintenance_reminders() TO authenticated;
GRANT ALL ON FUNCTION public.create_maintenance_reminders() TO anon;
GRANT ALL ON FUNCTION public.create_maintenance_reminders() TO aquavit;


--
-- Name: FUNCTION create_zakat_cash_entry(); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.create_zakat_cash_entry() TO authenticated;
GRANT ALL ON FUNCTION public.create_zakat_cash_entry() TO anon;


--
-- Name: FUNCTION deactivate_employee(employee_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.deactivate_employee(employee_id uuid) TO anon;
GRANT ALL ON FUNCTION public.deactivate_employee(employee_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.deactivate_employee(employee_id uuid) TO aquavit;


--
-- Name: FUNCTION deduct_materials_for_transaction(p_transaction_id text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.deduct_materials_for_transaction(p_transaction_id text) TO authenticated;
GRANT ALL ON FUNCTION public.deduct_materials_for_transaction(p_transaction_id text) TO anon;
GRANT ALL ON FUNCTION public.deduct_materials_for_transaction(p_transaction_id text) TO aquavit;


--
-- Name: FUNCTION delete_transaction_cascade(p_transaction_id text, p_deleted_by uuid, p_reason text); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.delete_transaction_cascade(p_transaction_id text, p_deleted_by uuid, p_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.delete_transaction_cascade(p_transaction_id text, p_deleted_by uuid, p_reason text) TO anon;


--
-- Name: FUNCTION demo_balance_sheet(); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.demo_balance_sheet() TO authenticated;
GRANT ALL ON FUNCTION public.demo_balance_sheet() TO anon;


--
-- Name: FUNCTION demo_show_chart_of_accounts(); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.demo_show_chart_of_accounts() TO authenticated;
GRANT ALL ON FUNCTION public.demo_show_chart_of_accounts() TO anon;


--
-- Name: FUNCTION demo_trial_balance(); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.demo_trial_balance() TO authenticated;
GRANT ALL ON FUNCTION public.demo_trial_balance() TO anon;


--
-- Name: FUNCTION disable_rls(table_name text); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.disable_rls(table_name text) TO authenticated;
GRANT ALL ON FUNCTION public.disable_rls(table_name text) TO anon;


--
-- Name: FUNCTION driver_has_unreturned_retasi(driver text); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.driver_has_unreturned_retasi(driver text) TO authenticated;
GRANT ALL ON FUNCTION public.driver_has_unreturned_retasi(driver text) TO anon;


--
-- Name: FUNCTION enable_rls(table_name text); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.enable_rls(table_name text) TO authenticated;
GRANT ALL ON FUNCTION public.enable_rls(table_name text) TO anon;


--
-- Name: FUNCTION generate_delivery_number(); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.generate_delivery_number() TO authenticated;
GRANT ALL ON FUNCTION public.generate_delivery_number() TO anon;


--
-- Name: FUNCTION generate_journal_number(entry_date date); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.generate_journal_number(entry_date date) TO authenticated;
GRANT ALL ON FUNCTION public.generate_journal_number(entry_date date) TO anon;


--
-- Name: FUNCTION generate_retasi_number(); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.generate_retasi_number() TO authenticated;
GRANT ALL ON FUNCTION public.generate_retasi_number() TO anon;


--
-- Name: FUNCTION generate_supplier_code(); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.generate_supplier_code() TO authenticated;
GRANT ALL ON FUNCTION public.generate_supplier_code() TO anon;


--
-- Name: FUNCTION get_account_balance_analysis(p_account_id text); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.get_account_balance_analysis(p_account_id text) TO authenticated;
GRANT ALL ON FUNCTION public.get_account_balance_analysis(p_account_id text) TO anon;


--
-- Name: FUNCTION get_account_balance_with_children(account_id text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_account_balance_with_children(account_id text) TO authenticated;
GRANT ALL ON FUNCTION public.get_account_balance_with_children(account_id text) TO anon;
GRANT ALL ON FUNCTION public.get_account_balance_with_children(account_id text) TO aquavit;


--
-- Name: TABLE employee_salaries; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.employee_salaries TO authenticated;
GRANT ALL ON TABLE public.employee_salaries TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.employee_salaries TO aquavit;
GRANT ALL ON TABLE public.employee_salaries TO owner;
GRANT ALL ON TABLE public.employee_salaries TO admin;
GRANT ALL ON TABLE public.employee_salaries TO supervisor;
GRANT ALL ON TABLE public.employee_salaries TO cashier;
GRANT ALL ON TABLE public.employee_salaries TO designer;
GRANT ALL ON TABLE public.employee_salaries TO operator;


--
-- Name: FUNCTION get_active_salary_config(emp_id uuid, check_date date); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_active_salary_config(emp_id uuid, check_date date) TO authenticated;
GRANT ALL ON FUNCTION public.get_active_salary_config(emp_id uuid, check_date date) TO anon;
GRANT ALL ON FUNCTION public.get_active_salary_config(emp_id uuid, check_date date) TO aquavit;


--
-- Name: FUNCTION get_all_accounts_balance_analysis(); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.get_all_accounts_balance_analysis() TO authenticated;
GRANT ALL ON FUNCTION public.get_all_accounts_balance_analysis() TO anon;


--
-- Name: FUNCTION get_commission_summary(emp_id uuid, start_date date, end_date date); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.get_commission_summary(emp_id uuid, start_date date, end_date date) TO authenticated;
GRANT ALL ON FUNCTION public.get_commission_summary(emp_id uuid, start_date date, end_date date) TO anon;


--
-- Name: FUNCTION get_current_nishab(); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.get_current_nishab() TO authenticated;
GRANT ALL ON FUNCTION public.get_current_nishab() TO anon;


--
-- Name: FUNCTION get_current_user_role(); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.get_current_user_role() TO authenticated;
GRANT ALL ON FUNCTION public.get_current_user_role() TO anon;


--
-- Name: FUNCTION get_delivery_summary(transaction_id_param text); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.get_delivery_summary(transaction_id_param text) TO authenticated;
GRANT ALL ON FUNCTION public.get_delivery_summary(transaction_id_param text) TO anon;


--
-- Name: FUNCTION get_delivery_with_employees(delivery_id_param uuid); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.get_delivery_with_employees(delivery_id_param uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_delivery_with_employees(delivery_id_param uuid) TO anon;


--
-- Name: FUNCTION get_next_retasi_counter(driver text, target_date date); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.get_next_retasi_counter(driver text, target_date date) TO authenticated;
GRANT ALL ON FUNCTION public.get_next_retasi_counter(driver text, target_date date) TO anon;


--
-- Name: FUNCTION get_outstanding_advances(emp_id uuid, up_to_date date); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.get_outstanding_advances(emp_id uuid, up_to_date date) TO authenticated;
GRANT ALL ON FUNCTION public.get_outstanding_advances(emp_id uuid, up_to_date date) TO anon;


--
-- Name: FUNCTION get_rls_policies(table_name text); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.get_rls_policies(table_name text) TO authenticated;
GRANT ALL ON FUNCTION public.get_rls_policies(table_name text) TO anon;


--
-- Name: FUNCTION get_rls_status(); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.get_rls_status() TO authenticated;
GRANT ALL ON FUNCTION public.get_rls_status() TO anon;


--
-- Name: FUNCTION get_transactions_ready_for_delivery(); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.get_transactions_ready_for_delivery() TO authenticated;
GRANT ALL ON FUNCTION public.get_transactions_ready_for_delivery() TO anon;


--
-- Name: FUNCTION get_user_branch_id(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_user_branch_id() TO authenticated;
GRANT ALL ON FUNCTION public.get_user_branch_id() TO anon;
GRANT ALL ON FUNCTION public.get_user_branch_id() TO aquavit;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO anon;


--
-- Name: FUNCTION has_perm(perm_name text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.has_perm(perm_name text) TO owner;
GRANT ALL ON FUNCTION public.has_perm(perm_name text) TO admin;
GRANT ALL ON FUNCTION public.has_perm(perm_name text) TO supervisor;
GRANT ALL ON FUNCTION public.has_perm(perm_name text) TO cashier;
GRANT ALL ON FUNCTION public.has_perm(perm_name text) TO designer;
GRANT ALL ON FUNCTION public.has_perm(perm_name text) TO operator;
GRANT ALL ON FUNCTION public.has_perm(perm_name text) TO authenticated;
GRANT ALL ON FUNCTION public.has_perm(perm_name text) TO anon;
GRANT ALL ON FUNCTION public.has_perm(perm_name text) TO aquavit;


--
-- Name: FUNCTION has_permission(permission_name text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.has_permission(permission_name text) TO anon;
GRANT ALL ON FUNCTION public.has_permission(permission_name text) TO authenticated;
GRANT ALL ON FUNCTION public.has_permission(permission_name text) TO aquavit;


--
-- Name: FUNCTION is_admin(); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.is_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_admin() TO anon;


--
-- Name: FUNCTION is_authenticated(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_authenticated() TO anon;
GRANT ALL ON FUNCTION public.is_authenticated() TO authenticated;
GRANT ALL ON FUNCTION public.is_authenticated() TO aquavit;


--
-- Name: FUNCTION is_owner(); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.is_owner() TO authenticated;
GRANT ALL ON FUNCTION public.is_owner() TO anon;


--
-- Name: FUNCTION is_super_admin(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_super_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_super_admin() TO anon;
GRANT ALL ON FUNCTION public.is_super_admin() TO aquavit;


--
-- Name: FUNCTION log_performance(p_operation_name text, p_duration_ms integer, p_table_name text, p_record_count integer, p_query_type text, p_metadata jsonb); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.log_performance(p_operation_name text, p_duration_ms integer, p_table_name text, p_record_count integer, p_query_type text, p_metadata jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.log_performance(p_operation_name text, p_duration_ms integer, p_table_name text, p_record_count integer, p_query_type text, p_metadata jsonb) TO anon;


--
-- Name: FUNCTION mark_retasi_returned(retasi_id uuid, returned_count integer, error_count integer, notes text); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.mark_retasi_returned(retasi_id uuid, returned_count integer, error_count integer, notes text) TO authenticated;
GRANT ALL ON FUNCTION public.mark_retasi_returned(retasi_id uuid, returned_count integer, error_count integer, notes text) TO anon;


--
-- Name: FUNCTION notify_debt_payment(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.notify_debt_payment() TO authenticated;
GRANT ALL ON FUNCTION public.notify_debt_payment() TO anon;
GRANT ALL ON FUNCTION public.notify_debt_payment() TO aquavit;


--
-- Name: FUNCTION notify_payroll_processed(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.notify_payroll_processed() TO authenticated;
GRANT ALL ON FUNCTION public.notify_payroll_processed() TO anon;
GRANT ALL ON FUNCTION public.notify_payroll_processed() TO aquavit;


--
-- Name: FUNCTION notify_production_completed(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.notify_production_completed() TO authenticated;
GRANT ALL ON FUNCTION public.notify_production_completed() TO anon;
GRANT ALL ON FUNCTION public.notify_production_completed() TO aquavit;


--
-- Name: FUNCTION notify_purchase_order_created(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.notify_purchase_order_created() TO authenticated;
GRANT ALL ON FUNCTION public.notify_purchase_order_created() TO anon;
GRANT ALL ON FUNCTION public.notify_purchase_order_created() TO aquavit;


--
-- Name: FUNCTION pay_receivable(p_transaction_id text, p_amount numeric); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.pay_receivable(p_transaction_id text, p_amount numeric) TO authenticated;
GRANT ALL ON FUNCTION public.pay_receivable(p_transaction_id text, p_amount numeric) TO anon;
GRANT ALL ON FUNCTION public.pay_receivable(p_transaction_id text, p_amount numeric) TO aquavit;


--
-- Name: FUNCTION pay_receivable_with_history(p_transaction_id text, p_amount numeric, p_account_id text, p_account_name text, p_notes text, p_recorded_by uuid, p_recorded_by_name text); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.pay_receivable_with_history(p_transaction_id text, p_amount numeric, p_account_id text, p_account_name text, p_notes text, p_recorded_by uuid, p_recorded_by_name text) TO authenticated;
GRANT ALL ON FUNCTION public.pay_receivable_with_history(p_transaction_id text, p_amount numeric, p_account_id text, p_account_name text, p_notes text, p_recorded_by uuid, p_recorded_by_name text) TO anon;


--
-- Name: FUNCTION populate_commission_product_info(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.populate_commission_product_info() TO authenticated;
GRANT ALL ON FUNCTION public.populate_commission_product_info() TO anon;
GRANT ALL ON FUNCTION public.populate_commission_product_info() TO aquavit;


--
-- Name: FUNCTION process_advance_repayment_from_salary(payroll_record_id uuid, advance_deduction_amount numeric); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.process_advance_repayment_from_salary(payroll_record_id uuid, advance_deduction_amount numeric) TO authenticated;
GRANT ALL ON FUNCTION public.process_advance_repayment_from_salary(payroll_record_id uuid, advance_deduction_amount numeric) TO anon;


--
-- Name: FUNCTION reconcile_account_balance(p_account_id text, p_new_balance numeric, p_reason text, p_user_id uuid, p_user_name text); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.reconcile_account_balance(p_account_id text, p_new_balance numeric, p_reason text, p_user_id uuid, p_user_name text) TO authenticated;
GRANT ALL ON FUNCTION public.reconcile_account_balance(p_account_id text, p_new_balance numeric, p_reason text, p_user_id uuid, p_user_name text) TO anon;


--
-- Name: FUNCTION record_payment_history(); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.record_payment_history() TO authenticated;
GRANT ALL ON FUNCTION public.record_payment_history() TO anon;


--
-- Name: FUNCTION record_receivable_payment(p_transaction_id text, p_amount numeric, p_payment_method text, p_account_id text, p_account_name text, p_description text, p_notes text, p_reference_number text, p_paid_by_user_id uuid, p_paid_by_user_name text, p_paid_by_user_role text); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.record_receivable_payment(p_transaction_id text, p_amount numeric, p_payment_method text, p_account_id text, p_account_name text, p_description text, p_notes text, p_reference_number text, p_paid_by_user_id uuid, p_paid_by_user_name text, p_paid_by_user_role text) TO authenticated;
GRANT ALL ON FUNCTION public.record_receivable_payment(p_transaction_id text, p_amount numeric, p_payment_method text, p_account_id text, p_account_name text, p_description text, p_notes text, p_reference_number text, p_paid_by_user_id uuid, p_paid_by_user_name text, p_paid_by_user_role text) TO anon;


--
-- Name: FUNCTION refresh_daily_stats(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.refresh_daily_stats() TO authenticated;
GRANT ALL ON FUNCTION public.refresh_daily_stats() TO anon;
GRANT ALL ON FUNCTION public.refresh_daily_stats() TO aquavit;


--
-- Name: FUNCTION search_customers(search_term text, limit_count integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.search_customers(search_term text, limit_count integer) TO authenticated;
GRANT ALL ON FUNCTION public.search_customers(search_term text, limit_count integer) TO anon;
GRANT ALL ON FUNCTION public.search_customers(search_term text, limit_count integer) TO aquavit;


--
-- Name: FUNCTION search_products_with_stock(search_term text, category_filter text, limit_count integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.search_products_with_stock(search_term text, category_filter text, limit_count integer) TO authenticated;
GRANT ALL ON FUNCTION public.search_products_with_stock(search_term text, category_filter text, limit_count integer) TO anon;
GRANT ALL ON FUNCTION public.search_products_with_stock(search_term text, category_filter text, limit_count integer) TO aquavit;


--
-- Name: FUNCTION search_transactions(search_term text, limit_count integer, offset_count integer, status_filter text); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.search_transactions(search_term text, limit_count integer, offset_count integer, status_filter text) TO authenticated;
GRANT ALL ON FUNCTION public.search_transactions(search_term text, limit_count integer, offset_count integer, status_filter text) TO anon;


--
-- Name: FUNCTION set_account_initial_balance(p_account_id text, p_initial_balance numeric, p_reason text, p_user_id uuid, p_user_name text); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.set_account_initial_balance(p_account_id text, p_initial_balance numeric, p_reason text, p_user_id uuid, p_user_name text) TO authenticated;
GRANT ALL ON FUNCTION public.set_account_initial_balance(p_account_id text, p_initial_balance numeric, p_reason text, p_user_id uuid, p_user_name text) TO anon;


--
-- Name: FUNCTION set_retasi_ke(); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.set_retasi_ke() TO authenticated;
GRANT ALL ON FUNCTION public.set_retasi_ke() TO anon;


--
-- Name: FUNCTION set_retasi_ke_and_number(); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.set_retasi_ke_and_number() TO authenticated;
GRANT ALL ON FUNCTION public.set_retasi_ke_and_number() TO anon;


--
-- Name: FUNCTION set_supplier_code(); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.set_supplier_code() TO authenticated;
GRANT ALL ON FUNCTION public.set_supplier_code() TO anon;


--
-- Name: FUNCTION sync_payroll_commissions_to_entries(); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.sync_payroll_commissions_to_entries() TO authenticated;
GRANT ALL ON FUNCTION public.sync_payroll_commissions_to_entries() TO anon;


--
-- Name: FUNCTION test_balance_reconciliation_functions(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.test_balance_reconciliation_functions() TO authenticated;
GRANT ALL ON FUNCTION public.test_balance_reconciliation_functions() TO anon;
GRANT ALL ON FUNCTION public.test_balance_reconciliation_functions() TO aquavit;


--
-- Name: FUNCTION trigger_process_advance_repayment(); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.trigger_process_advance_repayment() TO authenticated;
GRANT ALL ON FUNCTION public.trigger_process_advance_repayment() TO anon;


--
-- Name: FUNCTION trigger_sync_payroll_commission(); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.trigger_sync_payroll_commission() TO authenticated;
GRANT ALL ON FUNCTION public.trigger_sync_payroll_commission() TO anon;


--
-- Name: FUNCTION update_overdue_maintenance(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_overdue_maintenance() TO authenticated;
GRANT ALL ON FUNCTION public.update_overdue_maintenance() TO anon;
GRANT ALL ON FUNCTION public.update_overdue_maintenance() TO aquavit;


--
-- Name: FUNCTION update_payment_status(); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.update_payment_status() TO authenticated;
GRANT ALL ON FUNCTION public.update_payment_status() TO anon;


--
-- Name: FUNCTION update_payroll_updated_at(); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.update_payroll_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_payroll_updated_at() TO anon;


--
-- Name: FUNCTION update_product_materials_updated_at(); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.update_product_materials_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_product_materials_updated_at() TO anon;


--
-- Name: FUNCTION update_production_records_updated_at(); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.update_production_records_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_production_records_updated_at() TO anon;


--
-- Name: FUNCTION update_profiles_updated_at(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_profiles_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_profiles_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_profiles_updated_at() TO aquavit;


--
-- Name: FUNCTION update_remaining_amount(p_advance_id text); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.update_remaining_amount(p_advance_id text) TO authenticated;
GRANT ALL ON FUNCTION public.update_remaining_amount(p_advance_id text) TO anon;


--
-- Name: FUNCTION update_transaction_delivery_status(); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.update_transaction_delivery_status() TO authenticated;
GRANT ALL ON FUNCTION public.update_transaction_delivery_status() TO anon;


--
-- Name: FUNCTION update_transaction_status_from_delivery(); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.update_transaction_status_from_delivery() TO authenticated;
GRANT ALL ON FUNCTION public.update_transaction_status_from_delivery() TO anon;


--
-- Name: FUNCTION update_updated_at_column(); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO anon;


--
-- Name: FUNCTION uuid_generate_v1(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.uuid_generate_v1() TO authenticated;
GRANT ALL ON FUNCTION public.uuid_generate_v1() TO anon;
GRANT ALL ON FUNCTION public.uuid_generate_v1() TO aquavit;


--
-- Name: FUNCTION uuid_generate_v1mc(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.uuid_generate_v1mc() TO authenticated;
GRANT ALL ON FUNCTION public.uuid_generate_v1mc() TO anon;
GRANT ALL ON FUNCTION public.uuid_generate_v1mc() TO aquavit;


--
-- Name: FUNCTION uuid_generate_v3(namespace uuid, name text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.uuid_generate_v3(namespace uuid, name text) TO authenticated;
GRANT ALL ON FUNCTION public.uuid_generate_v3(namespace uuid, name text) TO anon;
GRANT ALL ON FUNCTION public.uuid_generate_v3(namespace uuid, name text) TO aquavit;


--
-- Name: FUNCTION uuid_generate_v4(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.uuid_generate_v4() TO authenticated;
GRANT ALL ON FUNCTION public.uuid_generate_v4() TO anon;
GRANT ALL ON FUNCTION public.uuid_generate_v4() TO aquavit;


--
-- Name: FUNCTION uuid_generate_v5(namespace uuid, name text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.uuid_generate_v5(namespace uuid, name text) TO authenticated;
GRANT ALL ON FUNCTION public.uuid_generate_v5(namespace uuid, name text) TO anon;
GRANT ALL ON FUNCTION public.uuid_generate_v5(namespace uuid, name text) TO aquavit;


--
-- Name: FUNCTION uuid_nil(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.uuid_nil() TO authenticated;
GRANT ALL ON FUNCTION public.uuid_nil() TO anon;
GRANT ALL ON FUNCTION public.uuid_nil() TO aquavit;


--
-- Name: FUNCTION uuid_ns_dns(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.uuid_ns_dns() TO authenticated;
GRANT ALL ON FUNCTION public.uuid_ns_dns() TO anon;
GRANT ALL ON FUNCTION public.uuid_ns_dns() TO aquavit;


--
-- Name: FUNCTION uuid_ns_oid(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.uuid_ns_oid() TO authenticated;
GRANT ALL ON FUNCTION public.uuid_ns_oid() TO anon;
GRANT ALL ON FUNCTION public.uuid_ns_oid() TO aquavit;


--
-- Name: FUNCTION uuid_ns_url(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.uuid_ns_url() TO authenticated;
GRANT ALL ON FUNCTION public.uuid_ns_url() TO anon;
GRANT ALL ON FUNCTION public.uuid_ns_url() TO aquavit;


--
-- Name: FUNCTION uuid_ns_x500(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.uuid_ns_x500() TO authenticated;
GRANT ALL ON FUNCTION public.uuid_ns_x500() TO anon;
GRANT ALL ON FUNCTION public.uuid_ns_x500() TO aquavit;


--
-- Name: FUNCTION validate_journal_balance(journal_id uuid); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.validate_journal_balance(journal_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.validate_journal_balance(journal_id uuid) TO anon;


--
-- Name: FUNCTION validate_transaction_status_transition(); Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON FUNCTION public.validate_transaction_status_transition() TO authenticated;
GRANT ALL ON FUNCTION public.validate_transaction_status_transition() TO anon;


--
-- Name: TABLE accounts; Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON TABLE public.accounts TO authenticated;
GRANT ALL ON TABLE public.accounts TO anon;
GRANT ALL ON TABLE public.accounts TO owner;
GRANT ALL ON TABLE public.accounts TO admin;
GRANT ALL ON TABLE public.accounts TO supervisor;
GRANT ALL ON TABLE public.accounts TO cashier;
GRANT ALL ON TABLE public.accounts TO designer;
GRANT ALL ON TABLE public.accounts TO operator;


--
-- Name: TABLE accounts_hierarchy; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.accounts_hierarchy TO authenticated;
GRANT ALL ON TABLE public.accounts_hierarchy TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.accounts_hierarchy TO aquavit;
GRANT ALL ON TABLE public.accounts_hierarchy TO owner;
GRANT ALL ON TABLE public.accounts_hierarchy TO admin;
GRANT ALL ON TABLE public.accounts_hierarchy TO supervisor;
GRANT ALL ON TABLE public.accounts_hierarchy TO cashier;
GRANT ALL ON TABLE public.accounts_hierarchy TO designer;
GRANT ALL ON TABLE public.accounts_hierarchy TO operator;


--
-- Name: TABLE accounts_payable; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.accounts_payable TO authenticated;
GRANT ALL ON TABLE public.accounts_payable TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.accounts_payable TO aquavit;
GRANT ALL ON TABLE public.accounts_payable TO owner;
GRANT ALL ON TABLE public.accounts_payable TO admin;
GRANT ALL ON TABLE public.accounts_payable TO supervisor;
GRANT ALL ON TABLE public.accounts_payable TO cashier;
GRANT ALL ON TABLE public.accounts_payable TO designer;
GRANT ALL ON TABLE public.accounts_payable TO operator;


--
-- Name: TABLE advance_repayments; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.advance_repayments TO authenticated;
GRANT ALL ON TABLE public.advance_repayments TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.advance_repayments TO aquavit;
GRANT ALL ON TABLE public.advance_repayments TO owner;
GRANT ALL ON TABLE public.advance_repayments TO admin;
GRANT ALL ON TABLE public.advance_repayments TO supervisor;
GRANT ALL ON TABLE public.advance_repayments TO cashier;
GRANT ALL ON TABLE public.advance_repayments TO designer;
GRANT ALL ON TABLE public.advance_repayments TO operator;


--
-- Name: TABLE asset_maintenance; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.asset_maintenance TO aquavit;
GRANT ALL ON TABLE public.asset_maintenance TO authenticated;
GRANT ALL ON TABLE public.asset_maintenance TO anon;
GRANT ALL ON TABLE public.asset_maintenance TO owner;
GRANT ALL ON TABLE public.asset_maintenance TO admin;
GRANT ALL ON TABLE public.asset_maintenance TO supervisor;
GRANT ALL ON TABLE public.asset_maintenance TO cashier;
GRANT ALL ON TABLE public.asset_maintenance TO designer;
GRANT ALL ON TABLE public.asset_maintenance TO operator;


--
-- Name: TABLE assets; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.assets TO aquavit;
GRANT ALL ON TABLE public.assets TO authenticated;
GRANT ALL ON TABLE public.assets TO anon;
GRANT ALL ON TABLE public.assets TO owner;
GRANT ALL ON TABLE public.assets TO admin;
GRANT ALL ON TABLE public.assets TO supervisor;
GRANT ALL ON TABLE public.assets TO cashier;
GRANT ALL ON TABLE public.assets TO designer;
GRANT ALL ON TABLE public.assets TO operator;


--
-- Name: TABLE attendance; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.attendance TO aquavit;
GRANT ALL ON TABLE public.attendance TO authenticated;
GRANT ALL ON TABLE public.attendance TO anon;
GRANT ALL ON TABLE public.attendance TO owner;
GRANT ALL ON TABLE public.attendance TO admin;
GRANT ALL ON TABLE public.attendance TO supervisor;
GRANT ALL ON TABLE public.attendance TO cashier;
GRANT ALL ON TABLE public.attendance TO designer;
GRANT ALL ON TABLE public.attendance TO operator;


--
-- Name: TABLE balance_adjustments; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.balance_adjustments TO authenticated;
GRANT ALL ON TABLE public.balance_adjustments TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.balance_adjustments TO aquavit;
GRANT ALL ON TABLE public.balance_adjustments TO owner;
GRANT ALL ON TABLE public.balance_adjustments TO admin;
GRANT ALL ON TABLE public.balance_adjustments TO supervisor;
GRANT ALL ON TABLE public.balance_adjustments TO cashier;
GRANT ALL ON TABLE public.balance_adjustments TO designer;
GRANT ALL ON TABLE public.balance_adjustments TO operator;


--
-- Name: TABLE bonus_pricings; Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON TABLE public.bonus_pricings TO authenticated;
GRANT ALL ON TABLE public.bonus_pricings TO anon;
GRANT ALL ON TABLE public.bonus_pricings TO owner;
GRANT ALL ON TABLE public.bonus_pricings TO admin;
GRANT ALL ON TABLE public.bonus_pricings TO supervisor;
GRANT ALL ON TABLE public.bonus_pricings TO cashier;
GRANT ALL ON TABLE public.bonus_pricings TO designer;
GRANT ALL ON TABLE public.bonus_pricings TO operator;


--
-- Name: TABLE branches; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.branches TO aquavit;
GRANT ALL ON TABLE public.branches TO authenticated;
GRANT ALL ON TABLE public.branches TO anon;
GRANT ALL ON TABLE public.branches TO owner;
GRANT ALL ON TABLE public.branches TO admin;
GRANT ALL ON TABLE public.branches TO supervisor;
GRANT ALL ON TABLE public.branches TO cashier;
GRANT ALL ON TABLE public.branches TO designer;
GRANT ALL ON TABLE public.branches TO operator;


--
-- Name: TABLE cash_history; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.cash_history TO authenticated;
GRANT ALL ON TABLE public.cash_history TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.cash_history TO aquavit;
GRANT ALL ON TABLE public.cash_history TO owner;
GRANT ALL ON TABLE public.cash_history TO admin;
GRANT ALL ON TABLE public.cash_history TO supervisor;
GRANT ALL ON TABLE public.cash_history TO cashier;
GRANT ALL ON TABLE public.cash_history TO designer;
GRANT ALL ON TABLE public.cash_history TO operator;


--
-- Name: TABLE commission_entries; Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON TABLE public.commission_entries TO authenticated;
GRANT ALL ON TABLE public.commission_entries TO anon;
GRANT ALL ON TABLE public.commission_entries TO owner;
GRANT ALL ON TABLE public.commission_entries TO admin;
GRANT ALL ON TABLE public.commission_entries TO supervisor;
GRANT ALL ON TABLE public.commission_entries TO cashier;
GRANT ALL ON TABLE public.commission_entries TO designer;
GRANT ALL ON TABLE public.commission_entries TO operator;


--
-- Name: TABLE commission_rules; Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON TABLE public.commission_rules TO authenticated;
GRANT ALL ON TABLE public.commission_rules TO anon;
GRANT ALL ON TABLE public.commission_rules TO owner;
GRANT ALL ON TABLE public.commission_rules TO admin;
GRANT ALL ON TABLE public.commission_rules TO supervisor;
GRANT ALL ON TABLE public.commission_rules TO cashier;
GRANT ALL ON TABLE public.commission_rules TO designer;
GRANT ALL ON TABLE public.commission_rules TO operator;


--
-- Name: TABLE companies; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.companies TO aquavit;
GRANT ALL ON TABLE public.companies TO authenticated;
GRANT ALL ON TABLE public.companies TO anon;
GRANT ALL ON TABLE public.companies TO owner;
GRANT ALL ON TABLE public.companies TO admin;
GRANT ALL ON TABLE public.companies TO supervisor;
GRANT ALL ON TABLE public.companies TO cashier;
GRANT ALL ON TABLE public.companies TO designer;
GRANT ALL ON TABLE public.companies TO operator;


--
-- Name: TABLE company_settings; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.company_settings TO authenticated;
GRANT ALL ON TABLE public.company_settings TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.company_settings TO aquavit;
GRANT ALL ON TABLE public.company_settings TO owner;
GRANT ALL ON TABLE public.company_settings TO admin;
GRANT ALL ON TABLE public.company_settings TO supervisor;
GRANT ALL ON TABLE public.company_settings TO cashier;
GRANT ALL ON TABLE public.company_settings TO designer;
GRANT ALL ON TABLE public.company_settings TO operator;


--
-- Name: TABLE customer_pricings; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.customer_pricings TO aquavit;
GRANT ALL ON TABLE public.customer_pricings TO authenticated;
GRANT ALL ON TABLE public.customer_pricings TO anon;
GRANT ALL ON TABLE public.customer_pricings TO owner;
GRANT ALL ON TABLE public.customer_pricings TO admin;
GRANT ALL ON TABLE public.customer_pricings TO supervisor;
GRANT ALL ON TABLE public.customer_pricings TO cashier;
GRANT ALL ON TABLE public.customer_pricings TO designer;
GRANT ALL ON TABLE public.customer_pricings TO operator;


--
-- Name: TABLE customers; Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON TABLE public.customers TO authenticated;
GRANT ALL ON TABLE public.customers TO anon;
GRANT ALL ON TABLE public.customers TO owner;
GRANT ALL ON TABLE public.customers TO admin;
GRANT ALL ON TABLE public.customers TO supervisor;
GRANT ALL ON TABLE public.customers TO cashier;
GRANT ALL ON TABLE public.customers TO designer;
GRANT ALL ON TABLE public.customers TO operator;


--
-- Name: TABLE transactions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.transactions TO authenticated;
GRANT ALL ON TABLE public.transactions TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.transactions TO aquavit;
GRANT ALL ON TABLE public.transactions TO owner;
GRANT ALL ON TABLE public.transactions TO admin;
GRANT ALL ON TABLE public.transactions TO supervisor;
GRANT ALL ON TABLE public.transactions TO cashier;
GRANT ALL ON TABLE public.transactions TO designer;
GRANT ALL ON TABLE public.transactions TO operator;


--
-- Name: TABLE daily_stats; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.daily_stats TO authenticated;
GRANT ALL ON TABLE public.daily_stats TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.daily_stats TO aquavit;
GRANT ALL ON TABLE public.daily_stats TO owner;
GRANT ALL ON TABLE public.daily_stats TO admin;
GRANT ALL ON TABLE public.daily_stats TO supervisor;
GRANT ALL ON TABLE public.daily_stats TO cashier;
GRANT ALL ON TABLE public.daily_stats TO designer;
GRANT ALL ON TABLE public.daily_stats TO operator;


--
-- Name: TABLE products; Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON TABLE public.products TO authenticated;
GRANT ALL ON TABLE public.products TO anon;
GRANT ALL ON TABLE public.products TO owner;
GRANT ALL ON TABLE public.products TO admin;
GRANT ALL ON TABLE public.products TO supervisor;
GRANT ALL ON TABLE public.products TO cashier;
GRANT ALL ON TABLE public.products TO designer;
GRANT ALL ON TABLE public.products TO operator;


--
-- Name: TABLE dashboard_summary; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.dashboard_summary TO authenticated;
GRANT ALL ON TABLE public.dashboard_summary TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.dashboard_summary TO aquavit;
GRANT ALL ON TABLE public.dashboard_summary TO owner;
GRANT ALL ON TABLE public.dashboard_summary TO admin;
GRANT ALL ON TABLE public.dashboard_summary TO supervisor;
GRANT ALL ON TABLE public.dashboard_summary TO cashier;
GRANT ALL ON TABLE public.dashboard_summary TO designer;
GRANT ALL ON TABLE public.dashboard_summary TO operator;


--
-- Name: TABLE deliveries; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.deliveries TO authenticated;
GRANT ALL ON TABLE public.deliveries TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.deliveries TO aquavit;
GRANT ALL ON TABLE public.deliveries TO owner;
GRANT ALL ON TABLE public.deliveries TO admin;
GRANT ALL ON TABLE public.deliveries TO supervisor;
GRANT ALL ON TABLE public.deliveries TO cashier;
GRANT ALL ON TABLE public.deliveries TO designer;
GRANT ALL ON TABLE public.deliveries TO operator;


--
-- Name: TABLE delivery_items; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.delivery_items TO authenticated;
GRANT ALL ON TABLE public.delivery_items TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.delivery_items TO aquavit;
GRANT ALL ON TABLE public.delivery_items TO owner;
GRANT ALL ON TABLE public.delivery_items TO admin;
GRANT ALL ON TABLE public.delivery_items TO supervisor;
GRANT ALL ON TABLE public.delivery_items TO cashier;
GRANT ALL ON TABLE public.delivery_items TO designer;
GRANT ALL ON TABLE public.delivery_items TO operator;


--
-- Name: TABLE delivery_photos; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.delivery_photos TO aquavit;
GRANT ALL ON TABLE public.delivery_photos TO authenticated;
GRANT ALL ON TABLE public.delivery_photos TO anon;
GRANT ALL ON TABLE public.delivery_photos TO owner;
GRANT ALL ON TABLE public.delivery_photos TO admin;
GRANT ALL ON TABLE public.delivery_photos TO supervisor;
GRANT ALL ON TABLE public.delivery_photos TO cashier;
GRANT ALL ON TABLE public.delivery_photos TO designer;
GRANT ALL ON TABLE public.delivery_photos TO operator;


--
-- Name: TABLE employee_advances; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.employee_advances TO authenticated;
GRANT ALL ON TABLE public.employee_advances TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.employee_advances TO aquavit;
GRANT ALL ON TABLE public.employee_advances TO owner;
GRANT ALL ON TABLE public.employee_advances TO admin;
GRANT ALL ON TABLE public.employee_advances TO supervisor;
GRANT ALL ON TABLE public.employee_advances TO cashier;
GRANT ALL ON TABLE public.employee_advances TO designer;
GRANT ALL ON TABLE public.employee_advances TO operator;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO owner;
GRANT ALL ON TABLE public.profiles TO admin;
GRANT ALL ON TABLE public.profiles TO supervisor;
GRANT ALL ON TABLE public.profiles TO cashier;
GRANT ALL ON TABLE public.profiles TO designer;
GRANT ALL ON TABLE public.profiles TO operator;


--
-- Name: TABLE employee_salary_summary; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.employee_salary_summary TO aquavit;
GRANT ALL ON TABLE public.employee_salary_summary TO authenticated;
GRANT ALL ON TABLE public.employee_salary_summary TO anon;
GRANT ALL ON TABLE public.employee_salary_summary TO owner;
GRANT ALL ON TABLE public.employee_salary_summary TO admin;
GRANT ALL ON TABLE public.employee_salary_summary TO supervisor;
GRANT ALL ON TABLE public.employee_salary_summary TO cashier;
GRANT ALL ON TABLE public.employee_salary_summary TO designer;
GRANT ALL ON TABLE public.employee_salary_summary TO operator;


--
-- Name: TABLE expenses; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.expenses TO authenticated;
GRANT ALL ON TABLE public.expenses TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.expenses TO aquavit;
GRANT ALL ON TABLE public.expenses TO owner;
GRANT ALL ON TABLE public.expenses TO admin;
GRANT ALL ON TABLE public.expenses TO supervisor;
GRANT ALL ON TABLE public.expenses TO cashier;
GRANT ALL ON TABLE public.expenses TO designer;
GRANT ALL ON TABLE public.expenses TO operator;


--
-- Name: TABLE manual_journal_entries; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.manual_journal_entries TO authenticated;
GRANT ALL ON TABLE public.manual_journal_entries TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.manual_journal_entries TO aquavit;
GRANT ALL ON TABLE public.manual_journal_entries TO owner;
GRANT ALL ON TABLE public.manual_journal_entries TO admin;
GRANT ALL ON TABLE public.manual_journal_entries TO supervisor;
GRANT ALL ON TABLE public.manual_journal_entries TO cashier;
GRANT ALL ON TABLE public.manual_journal_entries TO designer;
GRANT ALL ON TABLE public.manual_journal_entries TO operator;


--
-- Name: TABLE manual_journal_entry_lines; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.manual_journal_entry_lines TO authenticated;
GRANT ALL ON TABLE public.manual_journal_entry_lines TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.manual_journal_entry_lines TO aquavit;
GRANT ALL ON TABLE public.manual_journal_entry_lines TO owner;
GRANT ALL ON TABLE public.manual_journal_entry_lines TO admin;
GRANT ALL ON TABLE public.manual_journal_entry_lines TO supervisor;
GRANT ALL ON TABLE public.manual_journal_entry_lines TO cashier;
GRANT ALL ON TABLE public.manual_journal_entry_lines TO designer;
GRANT ALL ON TABLE public.manual_journal_entry_lines TO operator;


--
-- Name: TABLE material_stock_movements; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.material_stock_movements TO authenticated;
GRANT ALL ON TABLE public.material_stock_movements TO anon;
GRANT ALL ON TABLE public.material_stock_movements TO aquavit;
GRANT ALL ON TABLE public.material_stock_movements TO owner;
GRANT ALL ON TABLE public.material_stock_movements TO admin;
GRANT ALL ON TABLE public.material_stock_movements TO supervisor;
GRANT ALL ON TABLE public.material_stock_movements TO cashier;
GRANT ALL ON TABLE public.material_stock_movements TO designer;
GRANT ALL ON TABLE public.material_stock_movements TO operator;


--
-- Name: TABLE materials; Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON TABLE public.materials TO authenticated;
GRANT ALL ON TABLE public.materials TO anon;
GRANT ALL ON TABLE public.materials TO owner;
GRANT ALL ON TABLE public.materials TO admin;
GRANT ALL ON TABLE public.materials TO supervisor;
GRANT ALL ON TABLE public.materials TO cashier;
GRANT ALL ON TABLE public.materials TO designer;
GRANT ALL ON TABLE public.materials TO operator;


--
-- Name: TABLE nishab_reference; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.nishab_reference TO aquavit;
GRANT ALL ON TABLE public.nishab_reference TO authenticated;
GRANT ALL ON TABLE public.nishab_reference TO anon;
GRANT ALL ON TABLE public.nishab_reference TO owner;
GRANT ALL ON TABLE public.nishab_reference TO admin;
GRANT ALL ON TABLE public.nishab_reference TO supervisor;
GRANT ALL ON TABLE public.nishab_reference TO cashier;
GRANT ALL ON TABLE public.nishab_reference TO designer;
GRANT ALL ON TABLE public.nishab_reference TO operator;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.notifications TO aquavit;
GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO anon;
GRANT ALL ON TABLE public.notifications TO owner;
GRANT ALL ON TABLE public.notifications TO admin;
GRANT ALL ON TABLE public.notifications TO supervisor;
GRANT ALL ON TABLE public.notifications TO cashier;
GRANT ALL ON TABLE public.notifications TO designer;
GRANT ALL ON TABLE public.notifications TO operator;


--
-- Name: TABLE payment_history; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.payment_history TO authenticated;
GRANT ALL ON TABLE public.payment_history TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.payment_history TO aquavit;
GRANT ALL ON TABLE public.payment_history TO owner;
GRANT ALL ON TABLE public.payment_history TO admin;
GRANT ALL ON TABLE public.payment_history TO supervisor;
GRANT ALL ON TABLE public.payment_history TO cashier;
GRANT ALL ON TABLE public.payment_history TO designer;
GRANT ALL ON TABLE public.payment_history TO operator;


--
-- Name: TABLE payroll_records; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.payroll_records TO aquavit;
GRANT ALL ON TABLE public.payroll_records TO authenticated;
GRANT ALL ON TABLE public.payroll_records TO anon;
GRANT ALL ON TABLE public.payroll_records TO owner;
GRANT ALL ON TABLE public.payroll_records TO admin;
GRANT ALL ON TABLE public.payroll_records TO supervisor;
GRANT ALL ON TABLE public.payroll_records TO cashier;
GRANT ALL ON TABLE public.payroll_records TO designer;
GRANT ALL ON TABLE public.payroll_records TO operator;


--
-- Name: TABLE payroll_summary; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.payroll_summary TO authenticated;
GRANT ALL ON TABLE public.payroll_summary TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.payroll_summary TO aquavit;
GRANT ALL ON TABLE public.payroll_summary TO owner;
GRANT ALL ON TABLE public.payroll_summary TO admin;
GRANT ALL ON TABLE public.payroll_summary TO supervisor;
GRANT ALL ON TABLE public.payroll_summary TO cashier;
GRANT ALL ON TABLE public.payroll_summary TO designer;
GRANT ALL ON TABLE public.payroll_summary TO operator;


--
-- Name: TABLE product_materials; Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON TABLE public.product_materials TO authenticated;
GRANT ALL ON TABLE public.product_materials TO anon;
GRANT ALL ON TABLE public.product_materials TO owner;
GRANT ALL ON TABLE public.product_materials TO admin;
GRANT ALL ON TABLE public.product_materials TO supervisor;
GRANT ALL ON TABLE public.product_materials TO cashier;
GRANT ALL ON TABLE public.product_materials TO designer;
GRANT ALL ON TABLE public.product_materials TO operator;


--
-- Name: TABLE production_errors; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.production_errors TO authenticated;
GRANT ALL ON TABLE public.production_errors TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.production_errors TO aquavit;
GRANT ALL ON TABLE public.production_errors TO owner;
GRANT ALL ON TABLE public.production_errors TO admin;
GRANT ALL ON TABLE public.production_errors TO supervisor;
GRANT ALL ON TABLE public.production_errors TO cashier;
GRANT ALL ON TABLE public.production_errors TO designer;
GRANT ALL ON TABLE public.production_errors TO operator;


--
-- Name: TABLE production_records; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.production_records TO authenticated;
GRANT ALL ON TABLE public.production_records TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.production_records TO aquavit;
GRANT ALL ON TABLE public.production_records TO owner;
GRANT ALL ON TABLE public.production_records TO admin;
GRANT ALL ON TABLE public.production_records TO supervisor;
GRANT ALL ON TABLE public.production_records TO cashier;
GRANT ALL ON TABLE public.production_records TO designer;
GRANT ALL ON TABLE public.production_records TO operator;


--
-- Name: TABLE purchase_order_items; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.purchase_order_items TO aquavit;
GRANT ALL ON TABLE public.purchase_order_items TO authenticated;
GRANT ALL ON TABLE public.purchase_order_items TO anon;
GRANT ALL ON TABLE public.purchase_order_items TO owner;
GRANT ALL ON TABLE public.purchase_order_items TO admin;
GRANT ALL ON TABLE public.purchase_order_items TO supervisor;
GRANT ALL ON TABLE public.purchase_order_items TO cashier;
GRANT ALL ON TABLE public.purchase_order_items TO designer;
GRANT ALL ON TABLE public.purchase_order_items TO operator;


--
-- Name: TABLE purchase_orders; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.purchase_orders TO authenticated;
GRANT ALL ON TABLE public.purchase_orders TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.purchase_orders TO aquavit;
GRANT ALL ON TABLE public.purchase_orders TO owner;
GRANT ALL ON TABLE public.purchase_orders TO admin;
GRANT ALL ON TABLE public.purchase_orders TO supervisor;
GRANT ALL ON TABLE public.purchase_orders TO cashier;
GRANT ALL ON TABLE public.purchase_orders TO designer;
GRANT ALL ON TABLE public.purchase_orders TO operator;


--
-- Name: TABLE quotations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.quotations TO authenticated;
GRANT ALL ON TABLE public.quotations TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.quotations TO aquavit;
GRANT ALL ON TABLE public.quotations TO owner;
GRANT ALL ON TABLE public.quotations TO admin;
GRANT ALL ON TABLE public.quotations TO supervisor;
GRANT ALL ON TABLE public.quotations TO cashier;
GRANT ALL ON TABLE public.quotations TO designer;
GRANT ALL ON TABLE public.quotations TO operator;


--
-- Name: TABLE retasi; Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON TABLE public.retasi TO authenticated;
GRANT ALL ON TABLE public.retasi TO anon;
GRANT ALL ON TABLE public.retasi TO owner;
GRANT ALL ON TABLE public.retasi TO admin;
GRANT ALL ON TABLE public.retasi TO supervisor;
GRANT ALL ON TABLE public.retasi TO cashier;
GRANT ALL ON TABLE public.retasi TO designer;
GRANT ALL ON TABLE public.retasi TO operator;


--
-- Name: TABLE retasi_items; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.retasi_items TO aquavit;
GRANT ALL ON TABLE public.retasi_items TO authenticated;
GRANT ALL ON TABLE public.retasi_items TO anon;
GRANT ALL ON TABLE public.retasi_items TO owner;
GRANT ALL ON TABLE public.retasi_items TO admin;
GRANT ALL ON TABLE public.retasi_items TO supervisor;
GRANT ALL ON TABLE public.retasi_items TO cashier;
GRANT ALL ON TABLE public.retasi_items TO designer;
GRANT ALL ON TABLE public.retasi_items TO operator;


--
-- Name: TABLE role_permissions; Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON TABLE public.role_permissions TO authenticated;
GRANT ALL ON TABLE public.role_permissions TO anon;
GRANT ALL ON TABLE public.role_permissions TO owner;
GRANT ALL ON TABLE public.role_permissions TO admin;
GRANT ALL ON TABLE public.role_permissions TO supervisor;
GRANT ALL ON TABLE public.role_permissions TO cashier;
GRANT ALL ON TABLE public.role_permissions TO designer;
GRANT ALL ON TABLE public.role_permissions TO operator;


--
-- Name: TABLE roles; Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON TABLE public.roles TO authenticated;
GRANT ALL ON TABLE public.roles TO anon;
GRANT ALL ON TABLE public.roles TO owner;
GRANT ALL ON TABLE public.roles TO admin;
GRANT ALL ON TABLE public.roles TO supervisor;
GRANT ALL ON TABLE public.roles TO cashier;
GRANT ALL ON TABLE public.roles TO designer;
GRANT ALL ON TABLE public.roles TO operator;


--
-- Name: TABLE stock_pricings; Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON TABLE public.stock_pricings TO authenticated;
GRANT ALL ON TABLE public.stock_pricings TO anon;
GRANT ALL ON TABLE public.stock_pricings TO owner;
GRANT ALL ON TABLE public.stock_pricings TO admin;
GRANT ALL ON TABLE public.stock_pricings TO supervisor;
GRANT ALL ON TABLE public.stock_pricings TO cashier;
GRANT ALL ON TABLE public.stock_pricings TO designer;
GRANT ALL ON TABLE public.stock_pricings TO operator;


--
-- Name: TABLE supplier_materials; Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON TABLE public.supplier_materials TO authenticated;
GRANT ALL ON TABLE public.supplier_materials TO anon;
GRANT ALL ON TABLE public.supplier_materials TO owner;
GRANT ALL ON TABLE public.supplier_materials TO admin;
GRANT ALL ON TABLE public.supplier_materials TO supervisor;
GRANT ALL ON TABLE public.supplier_materials TO cashier;
GRANT ALL ON TABLE public.supplier_materials TO designer;
GRANT ALL ON TABLE public.supplier_materials TO operator;


--
-- Name: TABLE suppliers; Type: ACL; Schema: public; Owner: aquavit
--

GRANT ALL ON TABLE public.suppliers TO authenticated;
GRANT ALL ON TABLE public.suppliers TO anon;
GRANT ALL ON TABLE public.suppliers TO owner;
GRANT ALL ON TABLE public.suppliers TO admin;
GRANT ALL ON TABLE public.suppliers TO supervisor;
GRANT ALL ON TABLE public.suppliers TO cashier;
GRANT ALL ON TABLE public.suppliers TO designer;
GRANT ALL ON TABLE public.suppliers TO operator;


--
-- Name: TABLE transaction_payments; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.transaction_payments TO authenticated;
GRANT ALL ON TABLE public.transaction_payments TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.transaction_payments TO aquavit;
GRANT ALL ON TABLE public.transaction_payments TO owner;
GRANT ALL ON TABLE public.transaction_payments TO admin;
GRANT ALL ON TABLE public.transaction_payments TO supervisor;
GRANT ALL ON TABLE public.transaction_payments TO cashier;
GRANT ALL ON TABLE public.transaction_payments TO designer;
GRANT ALL ON TABLE public.transaction_payments TO operator;


--
-- Name: TABLE transaction_detail_report; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.transaction_detail_report TO authenticated;
GRANT ALL ON TABLE public.transaction_detail_report TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.transaction_detail_report TO aquavit;
GRANT ALL ON TABLE public.transaction_detail_report TO owner;
GRANT ALL ON TABLE public.transaction_detail_report TO admin;
GRANT ALL ON TABLE public.transaction_detail_report TO supervisor;
GRANT ALL ON TABLE public.transaction_detail_report TO cashier;
GRANT ALL ON TABLE public.transaction_detail_report TO designer;
GRANT ALL ON TABLE public.transaction_detail_report TO operator;


--
-- Name: TABLE transactions_with_customer; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.transactions_with_customer TO authenticated;
GRANT ALL ON TABLE public.transactions_with_customer TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.transactions_with_customer TO aquavit;
GRANT ALL ON TABLE public.transactions_with_customer TO owner;
GRANT ALL ON TABLE public.transactions_with_customer TO admin;
GRANT ALL ON TABLE public.transactions_with_customer TO supervisor;
GRANT ALL ON TABLE public.transactions_with_customer TO cashier;
GRANT ALL ON TABLE public.transactions_with_customer TO designer;
GRANT ALL ON TABLE public.transactions_with_customer TO operator;


--
-- Name: TABLE user_roles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_roles TO aquavit;
GRANT ALL ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO anon;
GRANT ALL ON TABLE public.user_roles TO owner;
GRANT ALL ON TABLE public.user_roles TO admin;
GRANT ALL ON TABLE public.user_roles TO supervisor;
GRANT ALL ON TABLE public.user_roles TO cashier;
GRANT ALL ON TABLE public.user_roles TO designer;
GRANT ALL ON TABLE public.user_roles TO operator;


--
-- Name: TABLE zakat_records; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.zakat_records TO authenticated;
GRANT ALL ON TABLE public.zakat_records TO anon;


--
-- Name: daily_stats; Type: MATERIALIZED VIEW DATA; Schema: public; Owner: postgres
--

REFRESH MATERIALIZED VIEW public.daily_stats;


--
-- PostgreSQL database dump complete
--

\unrestrict U1surJBFqOaVQYuc8ReqAtrE44HXKbAObLGwRzjbKxWbcEJkVMuJxtvjwgnUEQo

