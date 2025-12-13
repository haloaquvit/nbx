-- DEBUG RPC FUNCTION ERRORS
-- Script untuk debug dan fix function calculate_payroll_with_advances

-- ========================================
-- STEP 1: CHECK IF FUNCTION EXISTS
-- ========================================

SELECT
  routine_name,
  routine_type,
  specific_name,
  data_type,
  routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'calculate_payroll_with_advances';

-- ========================================
-- STEP 2: CHECK FUNCTION PARAMETERS
-- ========================================

SELECT
  parameter_name,
  data_type,
  parameter_mode
FROM information_schema.parameters
WHERE specific_name = (
  SELECT specific_name
  FROM information_schema.routines
  WHERE routine_schema = 'public'
  AND routine_name = 'calculate_payroll_with_advances'
);

-- ========================================
-- STEP 3: RECREATE FUNCTION WITH BETTER ERROR HANDLING
-- ========================================

CREATE OR REPLACE FUNCTION public.calculate_payroll_with_advances(
  emp_id UUID,
  period_year INTEGER,
  period_month INTEGER
)
RETURNS JSONB AS $$
DECLARE
  salary_config RECORD;
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
  -- Validate input parameters
  IF emp_id IS NULL THEN
    RAISE EXCEPTION 'Employee ID cannot be null';
  END IF;

  IF period_year IS NULL OR period_year < 2020 OR period_year > 2100 THEN
    RAISE EXCEPTION 'Invalid year: %', period_year;
  END IF;

  IF period_month IS NULL OR period_month < 1 OR period_month > 12 THEN
    RAISE EXCEPTION 'Invalid month: %', period_month;
  END IF;

  -- Calculate period dates
  BEGIN
    period_start := DATE(period_year || '-' || period_month || '-01');
    period_end := (period_start + INTERVAL '1 month - 1 day')::DATE;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error calculating period dates: %', SQLERRM;
  END;

  -- Get employee salary configuration (simplified query)
  BEGIN
    SELECT
      es.id,
      es.employee_id,
      es.base_salary,
      es.commission_rate,
      es.payroll_type,
      es.commission_type,
      es.effective_from,
      es.effective_until,
      es.is_active
    INTO salary_config
    FROM public.employee_salaries es
    WHERE es.employee_id = emp_id
      AND es.is_active = true
      AND es.effective_from <= period_start
      AND (es.effective_until IS NULL OR es.effective_until >= period_start)
    ORDER BY es.effective_from DESC
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error fetching salary config: %', SQLERRM;
  END;

  IF salary_config IS NULL THEN
    RAISE EXCEPTION 'No active salary configuration found for employee: %', emp_id;
  END IF;

  -- Calculate base salary
  IF salary_config.payroll_type IN ('monthly', 'mixed') THEN
    base_salary := COALESCE(salary_config.base_salary, 0);
  END IF;

  -- Calculate commission from existing commission system
  IF salary_config.payroll_type IN ('commission_only', 'mixed') THEN
    BEGIN
      SELECT COALESCE(SUM(amount), 0) INTO commission_amount
      FROM commission_entries ce
      WHERE ce.user_id = emp_id
        AND ce.created_at::date >= period_start
        AND ce.created_at::date <= period_end;
    EXCEPTION WHEN OTHERS THEN
      -- If commission_entries table doesn't exist, default to 0
      commission_amount := 0;
      RAISE NOTICE 'Warning: Could not fetch commission data: %', SQLERRM;
    END;
  END IF;

  -- Calculate outstanding advances
  BEGIN
    SELECT COALESCE(SUM(ea.amount), 0) - COALESCE(SUM(ar.amount), 0)
    INTO outstanding_advances
    FROM public.employee_advances ea
    LEFT JOIN public.advance_repayments ar ON ar.advance_id = ea.id
    WHERE ea.employee_id = emp_id
      AND ea.date <= period_end;

    -- Ensure no negative outstanding
    outstanding_advances := GREATEST(outstanding_advances, 0);
  EXCEPTION WHEN OTHERS THEN
    -- If advance tables don't exist, default to 0
    outstanding_advances := 0;
    RAISE NOTICE 'Warning: Could not fetch advance data: %', SQLERRM;
  END;

  -- Calculate gross salary
  gross_salary := base_salary + commission_amount + bonus_amount;

  -- Calculate advance deduction (don't deduct more than gross salary)
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

EXCEPTION WHEN OTHERS THEN
  -- Return error information in JSON format instead of raising exception
  RETURN jsonb_build_object(
    'error', true,
    'message', SQLERRM,
    'employeeId', emp_id,
    'periodYear', period_year,
    'periodMonth', period_month
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- STEP 4: ENSURE PROPER PERMISSIONS
-- ========================================

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.calculate_payroll_with_advances(UUID, INTEGER, INTEGER) TO authenticated;

-- Ensure function owner is correct
ALTER FUNCTION public.calculate_payroll_with_advances(UUID, INTEGER, INTEGER) OWNER TO postgres;

-- ========================================
-- STEP 5: TEST THE FUNCTION
-- ========================================

-- Test with a sample employee (uncomment to test)
/*
-- Get first employee ID
DO $$
DECLARE
  test_emp_id UUID;
  test_result JSONB;
BEGIN
  SELECT id INTO test_emp_id FROM public.profiles WHERE status = 'Aktif' LIMIT 1;

  IF test_emp_id IS NOT NULL THEN
    -- Test the function
    SELECT public.calculate_payroll_with_advances(test_emp_id, 2025, 1) INTO test_result;
    RAISE NOTICE 'Test result: %', test_result;
  ELSE
    RAISE NOTICE 'No active employees found for testing';
  END IF;
END $$;
*/

-- ========================================
-- STEP 6: REFRESH SUPABASE SCHEMA
-- ========================================

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ RPC function debugging completed!';
  RAISE NOTICE '🔧 Function recreated with better error handling';
  RAISE NOTICE '🔐 Permissions granted to authenticated users';
  RAISE NOTICE '📊 Function now handles missing tables gracefully';
  RAISE NOTICE '🧪 Test the RPC call from frontend now!';
END $$;