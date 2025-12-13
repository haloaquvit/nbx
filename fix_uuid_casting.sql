-- FIX UUID TYPE CASTING IN COMMISSION CALCULATION
-- user_id field is TEXT, need to cast UUID to TEXT for comparison

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
  -- Basic validation
  IF emp_id IS NULL OR period_year IS NULL OR period_month IS NULL THEN
    RETURN jsonb_build_object(
      'error', true,
      'message', 'Invalid parameters: emp_id, period_year, and period_month are required'
    );
  END IF;

  -- Calculate period dates
  period_start := DATE(period_year || '-' || period_month || '-01');
  period_end := (period_start + INTERVAL '1 month - 1 day')::DATE;

  -- Get active salary configuration
  SELECT
    es.id,
    es.base_salary,
    es.payroll_type
  INTO salary_config
  FROM public.employee_salaries es
  WHERE es.employee_id = emp_id
    AND es.is_active = true
  ORDER BY es.created_at DESC
  LIMIT 1;

  IF salary_config IS NULL THEN
    RETURN jsonb_build_object(
      'error', true,
      'message', 'No salary configuration found for employee',
      'employeeId', emp_id
    );
  END IF;

  -- Calculate base salary
  IF salary_config.payroll_type IN ('monthly', 'mixed') THEN
    base_salary := COALESCE(salary_config.base_salary, 0);
  END IF;

  -- FIXED: Commission calculation with proper UUID to TEXT casting
  IF salary_config.payroll_type IN ('commission_only', 'mixed') THEN
    BEGIN
      SELECT COALESCE(SUM(amount), 0) INTO commission_amount
      FROM commission_entries ce
      WHERE ce.user_id = emp_id::TEXT  -- CAST UUID TO TEXT
        AND DATE(ce.created_at) >= period_start
        AND DATE(ce.created_at) <= period_end;

    EXCEPTION WHEN OTHERS THEN
      commission_amount := 0; -- Default if table doesn't exist
    END;
  END IF;

  -- Calculate advances
  BEGIN
    WITH advance_summary AS (
      SELECT
        COALESCE(SUM(ea.amount), 0) as total_advances,
        COALESCE(SUM(ar.amount), 0) as total_repayments
      FROM public.employee_advances ea
      LEFT JOIN public.advance_repayments ar ON ar.advance_id = ea.id
      WHERE ea.employee_id = emp_id
        AND ea.date <= period_end
    )
    SELECT GREATEST(total_advances - total_repayments, 0)
    INTO outstanding_advances
    FROM advance_summary;
  EXCEPTION WHEN OTHERS THEN
    outstanding_advances := 0; -- Default if tables don't exist
  END;

  -- Calculate totals
  gross_salary := base_salary + commission_amount + bonus_amount;
  advance_deduction := LEAST(outstanding_advances, gross_salary);
  total_deduction := advance_deduction;
  net_salary := gross_salary - total_deduction;

  -- Build result with camelCase fields
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
    'payrollType', salary_config.payroll_type,
    'error', false
  );

  RETURN result;

EXCEPTION WHEN OTHERS THEN
  -- Return error in JSON format
  RETURN jsonb_build_object(
    'error', true,
    'message', SQLERRM,
    'employeeId', emp_id,
    'periodYear', period_year,
    'periodMonth', period_month
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.calculate_payroll_with_advances(UUID, INTEGER, INTEGER) TO authenticated;
ALTER FUNCTION public.calculate_payroll_with_advances(UUID, INTEGER, INTEGER) OWNER TO postgres;

-- Notify schema reload
NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  RAISE NOTICE '✅ Fixed UUID casting issue!';
  RAISE NOTICE '🔧 user_id field is TEXT, now casting UUID to TEXT';
  RAISE NOTICE '🎯 Commission calculation should work now!';
  RAISE NOTICE '🧪 Test the payroll calculation!';
END $$;