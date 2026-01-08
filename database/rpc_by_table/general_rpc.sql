-- =====================================================
-- RPC Functions for table: general
-- Generated: 2026-01-08T22:26:17.724Z
-- Total functions: 69
-- =====================================================

-- Function: calculate_commission_amount
CREATE OR REPLACE FUNCTION public.calculate_commission_amount()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.amount = NEW.quantity * NEW.rate_per_qty;
  RETURN NEW;
END;
$function$
;


-- Function: can_access_pos
CREATE OR REPLACE FUNCTION public.can_access_pos()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN RETURN has_permission('pos_access'); END;
$function$
;


-- Function: can_access_settings
CREATE OR REPLACE FUNCTION public.can_access_settings()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN RETURN has_permission('settings_access'); END;
$function$
;


-- Function: can_create_accounts
CREATE OR REPLACE FUNCTION public.can_create_accounts()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN RETURN has_permission('accounts_create'); END;
$function$
;


-- Function: can_create_advances
CREATE OR REPLACE FUNCTION public.can_create_advances()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN RETURN has_permission('advances_create'); END;
$function$
;


-- Function: can_create_customers
CREATE OR REPLACE FUNCTION public.can_create_customers()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN RETURN has_permission('customers_create'); END;
$function$
;


-- Function: can_create_employees
CREATE OR REPLACE FUNCTION public.can_create_employees()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN RETURN has_permission('employees_create'); END;
$function$
;


-- Function: can_create_expenses
CREATE OR REPLACE FUNCTION public.can_create_expenses()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN RETURN has_permission('expenses_create'); END;
$function$
;


-- Function: can_create_materials
CREATE OR REPLACE FUNCTION public.can_create_materials()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN RETURN has_permission('materials_create'); END;
$function$
;


-- Function: can_create_products
CREATE OR REPLACE FUNCTION public.can_create_products()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN RETURN has_permission('products_create'); END;
$function$
;


-- Function: can_create_quotations
CREATE OR REPLACE FUNCTION public.can_create_quotations()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN RETURN has_permission('quotations_create'); END;
$function$
;


-- Function: can_create_transactions
CREATE OR REPLACE FUNCTION public.can_create_transactions()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN RETURN has_permission('transactions_create'); END;
$function$
;


-- Function: can_delete_customers
CREATE OR REPLACE FUNCTION public.can_delete_customers()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN RETURN has_permission('customers_delete'); END;
$function$
;


-- Function: can_delete_employees
CREATE OR REPLACE FUNCTION public.can_delete_employees()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN RETURN has_permission('employees_delete'); END;
$function$
;


-- Function: can_delete_materials
CREATE OR REPLACE FUNCTION public.can_delete_materials()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN RETURN has_permission('materials_delete'); END;
$function$
;


-- Function: can_delete_products
CREATE OR REPLACE FUNCTION public.can_delete_products()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN RETURN has_permission('products_delete'); END;
$function$
;


-- Function: can_delete_transactions
CREATE OR REPLACE FUNCTION public.can_delete_transactions()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN RETURN has_permission('transactions_delete'); END;
$function$
;


-- Function: can_edit_accounts
CREATE OR REPLACE FUNCTION public.can_edit_accounts()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN RETURN has_permission('accounts_edit'); END;
$function$
;


-- Function: can_edit_customers
CREATE OR REPLACE FUNCTION public.can_edit_customers()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN RETURN has_permission('customers_edit'); END;
$function$
;


-- Function: can_edit_employees
CREATE OR REPLACE FUNCTION public.can_edit_employees()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN RETURN has_permission('employees_edit'); END;
$function$
;


-- Function: can_edit_materials
CREATE OR REPLACE FUNCTION public.can_edit_materials()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN RETURN has_permission('materials_edit'); END;
$function$
;


-- Function: can_edit_products
CREATE OR REPLACE FUNCTION public.can_edit_products()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN RETURN has_permission('products_edit'); END;
$function$
;


-- Function: can_edit_quotations
CREATE OR REPLACE FUNCTION public.can_edit_quotations()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN RETURN has_permission('quotations_edit'); END;
$function$
;


-- Function: can_edit_transactions
CREATE OR REPLACE FUNCTION public.can_edit_transactions()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN RETURN has_permission('transactions_edit'); END;
$function$
;


-- Function: can_manage_roles
CREATE OR REPLACE FUNCTION public.can_manage_roles()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN RETURN has_permission('role_management'); END;
$function$
;


-- Function: can_view_accounts
CREATE OR REPLACE FUNCTION public.can_view_accounts()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN RETURN has_permission('accounts_view'); END;
$function$
;


-- Function: can_view_advances
CREATE OR REPLACE FUNCTION public.can_view_advances()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN RETURN has_permission('advances_view'); END;
$function$
;


-- Function: can_view_customers
CREATE OR REPLACE FUNCTION public.can_view_customers()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN RETURN has_permission('customers_view'); END;
$function$
;


-- Function: can_view_employees
CREATE OR REPLACE FUNCTION public.can_view_employees()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN RETURN has_permission('employees_view'); END;
$function$
;


-- Function: can_view_expenses
CREATE OR REPLACE FUNCTION public.can_view_expenses()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN RETURN has_permission('expenses_view'); END;
$function$
;


-- Function: can_view_financial_reports
CREATE OR REPLACE FUNCTION public.can_view_financial_reports()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN RETURN has_permission('financial_reports'); END;
$function$
;


-- Function: can_view_materials
CREATE OR REPLACE FUNCTION public.can_view_materials()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN RETURN has_permission('materials_view'); END;
$function$
;


-- Function: can_view_products
CREATE OR REPLACE FUNCTION public.can_view_products()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN RETURN has_permission('products_view'); END;
$function$
;


-- Function: can_view_quotations
CREATE OR REPLACE FUNCTION public.can_view_quotations()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN RETURN has_permission('quotations_view'); END;
$function$
;


-- Function: can_view_receivables
CREATE OR REPLACE FUNCTION public.can_view_receivables()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN RETURN has_permission('receivables_view'); END;
$function$
;


-- Function: can_view_stock_reports
CREATE OR REPLACE FUNCTION public.can_view_stock_reports()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN RETURN has_permission('stock_reports'); END;
$function$
;


-- Function: can_view_transactions
CREATE OR REPLACE FUNCTION public.can_view_transactions()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN RETURN has_permission('transactions_view'); END;
$function$
;


-- Function: check_user_permission_all
CREATE OR REPLACE FUNCTION public.check_user_permission_all(p_user_id uuid, p_permissions text[])
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;


-- Function: check_user_permission_any
CREATE OR REPLACE FUNCTION public.check_user_permission_any(p_user_id uuid, p_permissions text[])
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;


-- Function: enable_audit_for_table
CREATE OR REPLACE FUNCTION public.enable_audit_for_table(target_table text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  trigger_name text;
BEGIN
  trigger_name := 'audit_trigger_' || target_table;
  EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', trigger_name, target_table);
  EXECUTE format(
    'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_trigger_func()',
    trigger_name, target_table
  );
  RAISE NOTICE 'Audit trigger enabled for table: %', target_table;
END;
$function$
;


-- Function: generate_journal_number
CREATE OR REPLACE FUNCTION public.generate_journal_number(entry_date date)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
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
$function$
;


-- Function: get_rls_status
CREATE OR REPLACE FUNCTION public.get_rls_status()
 RETURNS TABLE(schema_name text, table_name text, rls_enabled boolean)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT 
    schemaname::text as schema_name,
    tablename::text as table_name,
    rowsecurity as rls_enabled
  FROM pg_tables 
  WHERE schemaname = 'public'
  ORDER BY tablename;
$function$
;


-- Function: is_authenticated
CREATE OR REPLACE FUNCTION public.is_authenticated()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
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
$function$
;


-- Function: log_performance
CREATE OR REPLACE FUNCTION public.log_performance(p_operation_name text, p_duration_ms integer, p_table_name text DEFAULT NULL::text, p_record_count integer DEFAULT NULL::integer, p_query_type text DEFAULT NULL::text, p_metadata jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;


-- Function: prevent_posted_journal_update
CREATE OR REPLACE FUNCTION public.prevent_posted_journal_update()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Allow if changing from draft to posted
  IF OLD.status = 'draft' AND NEW.status = 'posted' THEN
    RETURN NEW;
  END IF;
  -- Allow if voiding (is_voided changing to true)
  IF OLD.is_voided IS DISTINCT FROM NEW.is_voided THEN
    RETURN NEW;
  END IF;
  -- Allow if changing status to voided
  IF NEW.status = 'voided' AND OLD.status != 'voided' THEN
    RETURN NEW;
  END IF;
  -- Prevent other updates on posted journals
  IF OLD.status = 'posted' THEN
    -- Check if any significant field changed
    IF OLD.total_debit IS DISTINCT FROM NEW.total_debit
       OR OLD.total_credit IS DISTINCT FROM NEW.total_credit
       OR OLD.entry_date IS DISTINCT FROM NEW.entry_date
       OR OLD.description IS DISTINCT FROM NEW.description THEN
      RAISE EXCEPTION 'Cannot update posted journal entry. Use void and create new instead. Journal: %', OLD.entry_number;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;


-- Function: refresh_daily_stats
CREATE OR REPLACE FUNCTION public.refresh_daily_stats()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  REFRESH MATERIALIZED VIEW public.daily_stats;
END;
$function$
;


-- Function: set_supplier_code
CREATE OR REPLACE FUNCTION public.set_supplier_code()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    NEW.code := generate_supplier_code();
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$function$
;


-- Function: sync_attendance_checkin
CREATE OR REPLACE FUNCTION public.sync_attendance_checkin()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$
;


-- Function: sync_attendance_ids
CREATE OR REPLACE FUNCTION public.sync_attendance_ids()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$
;


-- Function: sync_attendance_user_id
CREATE OR REPLACE FUNCTION public.sync_attendance_user_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- If date is not provided, set to today
    IF NEW.date IS NULL THEN
        NEW.date := CURRENT_DATE;
    END IF;
    RETURN NEW;
END;
$function$
;


-- Function: trigger_process_advance_repayment
CREATE OR REPLACE FUNCTION public.trigger_process_advance_repayment()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Only process when payroll status changes to 'paid' and there are deductions
  IF NEW.status = 'paid' AND OLD.status != 'paid' AND NEW.deduction_amount > 0 THEN
    -- Process advance repayments
    PERFORM public.process_advance_repayment_from_salary(NEW.id, NEW.deduction_amount);
  END IF;
  RETURN NEW;
END;
$function$
;


-- Function: update_payment_status
CREATE OR REPLACE FUNCTION public.update_payment_status()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$
;


-- Function: update_payroll_updated_at
CREATE OR REPLACE FUNCTION public.update_payroll_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;


-- Function: update_product_materials_updated_at
CREATE OR REPLACE FUNCTION public.update_product_materials_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$function$
;


-- Function: update_production_records_updated_at
CREATE OR REPLACE FUNCTION public.update_production_records_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$function$
;


-- Function: update_profiles_updated_at
CREATE OR REPLACE FUNCTION public.update_profiles_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$function$
;


-- Function: update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;


-- Function: uuid_generate_v1
CREATE OR REPLACE FUNCTION public.uuid_generate_v1()
 RETURNS uuid
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v1$function$
;


-- Function: uuid_generate_v1mc
CREATE OR REPLACE FUNCTION public.uuid_generate_v1mc()
 RETURNS uuid
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v1mc$function$
;


-- Function: uuid_generate_v3
CREATE OR REPLACE FUNCTION public.uuid_generate_v3(namespace uuid, name text)
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v3$function$
;


-- Function: uuid_generate_v4
CREATE OR REPLACE FUNCTION public.uuid_generate_v4()
 RETURNS uuid
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v4$function$
;


-- Function: uuid_generate_v5
CREATE OR REPLACE FUNCTION public.uuid_generate_v5(namespace uuid, name text)
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v5$function$
;


-- Function: uuid_nil
CREATE OR REPLACE FUNCTION public.uuid_nil()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_nil$function$
;


-- Function: uuid_ns_dns
CREATE OR REPLACE FUNCTION public.uuid_ns_dns()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_ns_dns$function$
;


-- Function: uuid_ns_oid
CREATE OR REPLACE FUNCTION public.uuid_ns_oid()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_ns_oid$function$
;


-- Function: uuid_ns_url
CREATE OR REPLACE FUNCTION public.uuid_ns_url()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_ns_url$function$
;


-- Function: uuid_ns_x500
CREATE OR REPLACE FUNCTION public.uuid_ns_x500()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_ns_x500$function$
;


-- Function: validate_journal_balance
CREATE OR REPLACE FUNCTION public.validate_journal_balance(journal_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
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
$function$
;


-- Function: validate_transaction_status_transition
CREATE OR REPLACE FUNCTION public.validate_transaction_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Jika transaksi adalah laku kantor, tidak boleh masuk ke delivery flow
  IF NEW.is_office_sale = true AND NEW.status IN ('Siap Antar', 'Diantar Sebagian') THEN
    -- Auto change ke 'Selesai' untuk laku kantor
    NEW.status := 'Selesai';
  END IF;
  
  RETURN NEW;
END;
$function$
;


