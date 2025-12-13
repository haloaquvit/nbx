-- SIMPLE DEBUG FUNCTION
-- Test payroll calculation with detailed logging

CREATE OR REPLACE FUNCTION public.debug_payroll_calculation(
  emp_id UUID,
  period_year INTEGER DEFAULT 2025,
  period_month INTEGER DEFAULT 1
)
RETURNS TEXT AS $$
DECLARE
  debug_info TEXT := '';
  salary_config RECORD;
  commission_total DECIMAL(15,2);
  advance_total DECIMAL(15,2);
  period_start DATE;
  period_end DATE;
BEGIN
  debug_info := debug_info || 'DEBUGGING PAYROLL CALCULATION' || E'\n';
  debug_info := debug_info || '=============================' || E'\n';
  debug_info := debug_info || 'Employee ID: ' || emp_id || E'\n';
  debug_info := debug_info || 'Period: ' || period_year || '-' || period_month || E'\n' || E'\n';

  -- Calculate period
  period_start := DATE(period_year || '-' || period_month || '-01');
  period_end := (period_start + INTERVAL '1 month - 1 day')::DATE;
  debug_info := debug_info || 'Period dates: ' || period_start || ' to ' || period_end || E'\n' || E'\n';

  -- Check employee exists
  BEGIN
    SELECT full_name INTO debug_info FROM profiles WHERE id = emp_id;
    debug_info := debug_info || 'Employee found: ' || COALESCE(debug_info, 'NOT FOUND') || E'\n';
  EXCEPTION WHEN OTHERS THEN
    debug_info := debug_info || 'Employee lookup error: ' || SQLERRM || E'\n';
  END;

  -- Check salary config
  BEGIN
    SELECT * INTO salary_config FROM employee_salaries
    WHERE employee_id = emp_id AND is_active = true
    ORDER BY created_at DESC LIMIT 1;

    IF salary_config IS NOT NULL THEN
      debug_info := debug_info || 'Salary Config Found:' || E'\n';
      debug_info := debug_info || '  - Base Salary: ' || COALESCE(salary_config.base_salary, 0) || E'\n';
      debug_info := debug_info || '  - Payroll Type: ' || COALESCE(salary_config.payroll_type, 'NULL') || E'\n';
      debug_info := debug_info || '  - Is Active: ' || salary_config.is_active || E'\n';
    ELSE
      debug_info := debug_info || 'NO SALARY CONFIG FOUND!' || E'\n';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    debug_info := debug_info || 'Salary config error: ' || SQLERRM || E'\n';
  END;

  debug_info := debug_info || E'\n';

  -- Check commission entries
  BEGIN
    SELECT COUNT(*), COALESCE(SUM(amount), 0) INTO salary_config
    FROM commission_entries
    WHERE user_id = emp_id
    AND created_at::date >= period_start
    AND created_at::date <= period_end;

    debug_info := debug_info || 'Commission Entries:' || E'\n';
    debug_info := debug_info || '  - Count: ' || salary_config.count || E'\n';
    debug_info := debug_info || '  - Total: ' || salary_config.sum || E'\n';

    -- Show some sample records
    FOR salary_config IN
      SELECT created_at, amount, description
      FROM commission_entries
      WHERE user_id = emp_id
      AND created_at::date >= period_start
      AND created_at::date <= period_end
      LIMIT 3
    LOOP
      debug_info := debug_info || '  - ' || salary_config.created_at || ': ' || salary_config.amount || ' (' || COALESCE(salary_config.description, 'no desc') || ')' || E'\n';
    END LOOP;

  EXCEPTION WHEN OTHERS THEN
    debug_info := debug_info || 'Commission entries error: ' || SQLERRM || E'\n';
  END;

  debug_info := debug_info || E'\n';

  -- Check employee advances
  BEGIN
    SELECT COUNT(*), COALESCE(SUM(amount), 0) INTO salary_config
    FROM employee_advances
    WHERE employee_id = emp_id;

    debug_info := debug_info || 'Employee Advances:' || E'\n';
    debug_info := debug_info || '  - Count: ' || salary_config.count || E'\n';
    debug_info := debug_info || '  - Total: ' || salary_config.sum || E'\n';

    -- Check repayments
    SELECT COUNT(*), COALESCE(SUM(ar.amount), 0) INTO salary_config
    FROM employee_advances ea
    LEFT JOIN advance_repayments ar ON ar.advance_id = ea.id
    WHERE ea.employee_id = emp_id;

    debug_info := debug_info || 'Advance Repayments:' || E'\n';
    debug_info := debug_info || '  - Count: ' || salary_config.count || E'\n';
    debug_info := debug_info || '  - Total: ' || salary_config.sum || E'\n';

  EXCEPTION WHEN OTHERS THEN
    debug_info := debug_info || 'Advances error: ' || SQLERRM || E'\n';
  END;

  debug_info := debug_info || E'\n' || 'DEBUG COMPLETED' || E'\n';

  RETURN debug_info;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.debug_payroll_calculation(UUID, INTEGER, INTEGER) TO authenticated;

-- Test function
DO $$
DECLARE
  test_emp_id UUID;
  debug_result TEXT;
BEGIN
  -- Get first active employee
  SELECT id INTO test_emp_id FROM profiles WHERE status = 'Aktif' LIMIT 1;

  IF test_emp_id IS NOT NULL THEN
    SELECT debug_payroll_calculation(test_emp_id) INTO debug_result;
    RAISE NOTICE '%', debug_result;
  ELSE
    RAISE NOTICE 'No active employees found for testing';
  END IF;
END $$;