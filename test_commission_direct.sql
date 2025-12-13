-- TEST COMMISSION CALCULATION DIRECTLY
-- Debug why commission calculation returns 0

-- Test the commission query directly
DO $$
DECLARE
  emp_id UUID := '18018e5e-97a4-4a70-b15c-b3b08645b741';
  period_year INTEGER := 2025;
  period_month INTEGER := 9;
  period_start DATE;
  period_end DATE;
  commission_amount DECIMAL(15,2) := 0;
  salary_config RECORD;
BEGIN
  -- Calculate period dates (same as in function)
  period_start := DATE(period_year || '-' || period_month || '-01');
  period_end := (period_start + INTERVAL '1 month - 1 day')::DATE;

  RAISE NOTICE 'Testing commission calculation for:';
  RAISE NOTICE 'Employee ID: %', emp_id;
  RAISE NOTICE 'Period: % to %', period_start, period_end;

  -- Get salary config
  SELECT * INTO salary_config FROM employee_salaries
  WHERE employee_id = emp_id AND is_active = true
  ORDER BY created_at DESC LIMIT 1;

  RAISE NOTICE 'Salary config: payroll_type=%, base_salary=%',
    salary_config.payroll_type, salary_config.base_salary;

  -- Test commission query with different variations
  RAISE NOTICE '=== TESTING COMMISSION QUERIES ===';

  -- Test 1: Exact query from function
  SELECT COALESCE(SUM(amount), 0) INTO commission_amount
  FROM commission_entries ce
  WHERE ce.user_id = emp_id
    AND ce.created_at >= (period_start || 'T00:00:00')::timestamp
    AND ce.created_at <= (period_end || 'T23:59:59')::timestamp;

  RAISE NOTICE 'Test 1 (with timestamp): %', commission_amount;

  -- Test 2: Simple date range
  SELECT COALESCE(SUM(amount), 0) INTO commission_amount
  FROM commission_entries ce
  WHERE ce.user_id = emp_id
    AND DATE(ce.created_at) >= period_start
    AND DATE(ce.created_at) <= period_end;

  RAISE NOTICE 'Test 2 (simple date): %', commission_amount;

  -- Test 3: Count entries to see if any exist
  SELECT COUNT(*) INTO commission_amount
  FROM commission_entries ce
  WHERE ce.user_id = emp_id
    AND DATE(ce.created_at) >= period_start
    AND DATE(ce.created_at) <= period_end;

  RAISE NOTICE 'Test 3 (count entries): %', commission_amount;

  -- Test 4: Show some sample entries
  FOR salary_config IN
    SELECT created_at, amount, user_name, product_name
    FROM commission_entries
    WHERE user_id = emp_id
    AND DATE(created_at) >= period_start
    AND DATE(created_at) <= period_end
    LIMIT 5
  LOOP
    RAISE NOTICE 'Sample entry: % - % - % - %',
      salary_config.created_at, salary_config.amount,
      salary_config.user_name, salary_config.product_name;
  END LOOP;

END $$;