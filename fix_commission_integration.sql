-- FIX COMMISSION INTEGRATION
-- Menghubungkan payroll system dengan existing commission system

-- ========================================
-- STEP 1: JALANKAN DULU API ACCESS FIXES
-- ========================================

-- Recreate views dengan permissions yang benar
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
-- STEP 2: UPDATE COMMISSION CALCULATION FUNCTION
-- ========================================

-- Perbaiki fungsi untuk menggunakan existing commission system
CREATE OR REPLACE FUNCTION public.calculate_commission_for_period(
  emp_id UUID,
  start_date DATE,
  end_date DATE
)
RETURNS DECIMAL(15,2) AS $$
DECLARE
  salary_config public.employee_salaries;
  total_commission DECIMAL(15,2) := 0;
BEGIN
  -- Get active salary configuration
  SELECT * INTO salary_config FROM public.get_active_salary_config(emp_id, start_date);

  -- Jika tidak ada konfigurasi gaji atau bukan tipe yang memiliki komisi, return 0
  IF salary_config IS NULL OR salary_config.payroll_type NOT IN ('commission_only', 'mixed') THEN
    RETURN 0;
  END IF;

  -- Ambil total komisi dari existing commission_entries table
  -- Ini akan mengambil semua komisi yang sudah tercatat di sistem komisi existing
  SELECT COALESCE(SUM(amount), 0) INTO total_commission
  FROM commission_entries ce
  WHERE ce.user_id = emp_id
    AND ce.created_at::date >= start_date
    AND ce.created_at::date <= end_date;

  -- Untuk payroll commission_only, gunakan semua komisi yang ada
  -- Untuk payroll mixed, bisa ditambahkan logic khusus jika dibutuhkan
  RETURN total_commission;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- STEP 3: UPDATE PAYROLL CALCULATION FUNCTION
-- ========================================

-- Update fungsi calculate_payroll_with_advances untuk menggunakan komisi existing
CREATE OR REPLACE FUNCTION public.calculate_payroll_with_advances(
  emp_id UUID,
  period_year INTEGER,
  period_month INTEGER
)
RETURNS JSONB AS $$
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

  -- Calculate commission from existing commission system
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- STEP 4: GRANT PERMISSIONS
-- ========================================

-- Grant SELECT on tables
GRANT SELECT ON public.employee_salaries TO authenticated;
GRANT SELECT ON public.payroll_records TO authenticated;
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

-- Make sure tables and views have proper ownership
ALTER TABLE public.employee_salaries OWNER TO postgres;
ALTER TABLE public.payroll_records OWNER TO postgres;
ALTER VIEW public.employee_salary_summary OWNER TO postgres;
ALTER VIEW public.payroll_summary OWNER TO postgres;

-- Make sure functions have proper ownership
ALTER FUNCTION public.get_outstanding_advances(UUID, DATE) OWNER TO postgres;
ALTER FUNCTION public.calculate_payroll_with_advances(UUID, INTEGER, INTEGER) OWNER TO postgres;
ALTER FUNCTION public.process_advance_repayment_from_salary(UUID, DECIMAL) OWNER TO postgres;
ALTER FUNCTION public.calculate_commission_for_period(UUID, DATE, DATE) OWNER TO postgres;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Commission integration fixes applied!';
  RAISE NOTICE '🔗 Payroll system now uses existing commission_entries table';
  RAISE NOTICE '📊 Views recreated with proper permissions';
  RAISE NOTICE '⚡ Functions updated to use existing commission system';
  RAISE NOTICE '🔄 Schema reload notification sent';
  RAISE NOTICE '';
  RAISE NOTICE '📋 NEXT STEPS:';
  RAISE NOTICE '1. Payroll tipe "commission_only" akan ambil komisi dari commission_entries';
  RAISE NOTICE '2. Payroll tipe "mixed" akan gabung gaji pokok + komisi existing';
  RAISE NOTICE '3. Tidak perlu input komisi manual - otomatis dari sistem komisi';
END $$;