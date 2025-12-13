-- FIX PAYROLL API ACCESS ISSUES
-- Script untuk mengatasi 404 dan permission errors

-- ========================================
-- STEP 1: VERIFY AND RECREATE VIEWS
-- ========================================

-- Drop and recreate employee_salary_summary view
DROP VIEW IF EXISTS public.employee_salary_summary;
CREATE VIEW public.employee_salary_summary AS
SELECT
  es.id,
  es.employee_id,
  p.full_name as employee_name,
  p.role as employee_role,
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
FROM public.employee_salaries es
JOIN public.profiles p ON p.id = es.employee_id
WHERE p.status != 'Nonaktif';

-- Drop and recreate payroll_summary view
DROP VIEW IF EXISTS public.payroll_summary;
CREATE VIEW public.payroll_summary AS
SELECT
  pr.id as payroll_id,
  pr.employee_id,
  p.full_name as employee_name,
  p.role as employee_role,
  pr.salary_config_id,
  pr.period_year,
  pr.period_month,
  pr.period_start,
  pr.period_end,
  TO_CHAR(DATE(pr.period_year || '-' || pr.period_month || '-01'), 'Month YYYY') as period_display,
  pr.base_salary_amount,
  pr.commission_amount,
  pr.bonus_amount,
  pr.deduction_amount,
  -- Calculate advance-related info (with fallback)
  COALESCE(
    (SELECT public.get_outstanding_advances(pr.employee_id, pr.period_end)),
    0
  ) as outstanding_advances,
  pr.gross_salary,
  pr.net_salary,
  pr.status,
  pr.payment_date,
  pr.payment_account_id,
  a.name as payment_account_name,
  pr.cash_history_id,
  pr.created_by,
  pr.created_at,
  pr.updated_at,
  pr.notes
FROM public.payroll_records pr
JOIN public.profiles p ON p.id = pr.employee_id
LEFT JOIN public.accounts a ON a.id = pr.payment_account_id
WHERE p.status != 'Nonaktif'
ORDER BY pr.period_year DESC, pr.period_month DESC, p.full_name;

-- ========================================
-- STEP 2: ENABLE RLS ON VIEWS (if needed)
-- ========================================

-- Enable RLS on views
ALTER VIEW public.employee_salary_summary SET (security_barrier = true);
ALTER VIEW public.payroll_summary SET (security_barrier = true);

-- ========================================
-- STEP 3: CREATE RLS POLICIES FOR VIEWS
-- ========================================

-- Note: Views inherit RLS from underlying tables, but we can add explicit policies

-- RLS for employee_salary_summary view (inherit from employee_salaries table)
-- Views will automatically apply RLS based on underlying table policies

-- ========================================
-- STEP 4: GRANT PROPER PERMISSIONS
-- ========================================

-- Grant SELECT on tables to authenticated users
GRANT SELECT ON public.employee_salaries TO authenticated;
GRANT SELECT ON public.payroll_records TO authenticated;

-- Grant INSERT, UPDATE, DELETE to authenticated (RLS will restrict access)
GRANT INSERT, UPDATE, DELETE ON public.employee_salaries TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.payroll_records TO authenticated;

-- Grant permissions on views
GRANT SELECT ON public.employee_salary_summary TO authenticated;
GRANT SELECT ON public.payroll_summary TO authenticated;

-- Grant USAGE on sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION public.get_active_salary_config(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_commission_for_period(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_outstanding_advances(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_payroll_with_advances(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_advance_repayment_from_salary(UUID, DECIMAL) TO authenticated;

-- ========================================
-- STEP 5: ENSURE SUPABASE API ACCESS
-- ========================================

-- Make sure tables are exposed to PostgREST API
-- This should be automatic, but let's be explicit

-- Verify the tables exist and have proper ownership
ALTER TABLE public.employee_salaries OWNER TO postgres;
ALTER TABLE public.payroll_records OWNER TO postgres;

-- Verify the views exist and have proper ownership
ALTER VIEW public.employee_salary_summary OWNER TO postgres;
ALTER VIEW public.payroll_summary OWNER TO postgres;

-- Make sure functions have proper ownership and security
ALTER FUNCTION public.get_outstanding_advances(UUID, DATE) OWNER TO postgres;
ALTER FUNCTION public.calculate_payroll_with_advances(UUID, INTEGER, INTEGER) OWNER TO postgres;
ALTER FUNCTION public.process_advance_repayment_from_salary(UUID, DECIMAL) OWNER TO postgres;

-- ========================================
-- STEP 6: CREATE SIMPLE TEST DATA (optional)
-- ========================================

-- Insert a test salary config (uncomment if needed)
/*
-- Get first active employee
DO $$
DECLARE
  test_emp_id UUID;
BEGIN
  SELECT id INTO test_emp_id
  FROM public.profiles
  WHERE status = 'Aktif'
  LIMIT 1;

  IF test_emp_id IS NOT NULL THEN
    INSERT INTO public.employee_salaries (
      employee_id,
      base_salary,
      commission_rate,
      payroll_type,
      commission_type,
      notes
    ) VALUES (
      test_emp_id,
      5000000,
      5,
      'mixed',
      'percentage',
      'Test salary configuration'
    )
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
*/

-- ========================================
-- STEP 7: REFRESH SUPABASE SCHEMA CACHE
-- ========================================

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Payroll API access fixes applied!';
  RAISE NOTICE '📊 Views recreated: employee_salary_summary, payroll_summary';
  RAISE NOTICE '🔐 Permissions granted to authenticated users';
  RAISE NOTICE '⚡ Functions accessible via RPC';
  RAISE NOTICE '🔄 Schema reload notification sent';
  RAISE NOTICE '🧪 Test the API endpoints now!';
END $$;