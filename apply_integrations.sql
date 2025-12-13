-- Manual SQL untuk apply semua integrasi payroll
-- Jalankan script ini di database production

-- ========================================
-- ADVANCE-PAYROLL INTEGRATION
-- ========================================

-- Step 1: Create function to calculate outstanding advances for an employee
CREATE OR REPLACE FUNCTION public.get_outstanding_advances(emp_id UUID, up_to_date DATE DEFAULT CURRENT_DATE)
RETURNS DECIMAL(15,2) AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 2: Create function to auto-calculate payroll with advance deduction
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 3: Create function to automatically repay advances when salary is paid
CREATE OR REPLACE FUNCTION public.process_advance_repayment_from_salary(
  payroll_record_id UUID,
  advance_deduction_amount DECIMAL(15,2)
)
RETURNS VOID AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Create trigger to auto-process advance repayments when payroll is paid
CREATE OR REPLACE FUNCTION public.trigger_process_advance_repayment()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process when payroll status changes to 'paid' and there are deductions
  IF NEW.status = 'paid' AND OLD.status != 'paid' AND NEW.deduction_amount > 0 THEN
    -- Process advance repayments
    PERFORM public.process_advance_repayment_from_salary(NEW.id, NEW.deduction_amount);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS payroll_advance_repayment_trigger ON public.payroll_records;
CREATE TRIGGER payroll_advance_repayment_trigger
  AFTER UPDATE ON public.payroll_records
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_process_advance_repayment();

-- Step 5: Add advance-related columns to payroll views
CREATE OR REPLACE VIEW public.payroll_summary AS
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
  -- Calculate advance-related info
  public.get_outstanding_advances(pr.employee_id, pr.period_end) as outstanding_advances,
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
-- COMMISSION REPORTS INTEGRATION
-- ========================================

-- Step 6: Create view to combine delivery commissions and payroll commissions
CREATE OR REPLACE VIEW public.unified_commission_report AS
WITH delivery_commissions AS (
  -- Get commissions from deliveries (existing system)
  SELECT
    d.driver_id as employee_id,
    p1.full_name as employee_name,
    p1.role as employee_role,
    'delivery' as commission_source,
    d.delivery_date as commission_date,
    EXTRACT(YEAR FROM d.delivery_date) as commission_year,
    EXTRACT(MONTH FROM d.delivery_date) as commission_month,
    d.total_amount as base_amount,
    COALESCE(
      CASE
        WHEN es.commission_type = 'percentage' THEN d.total_amount * (es.commission_rate / 100)
        WHEN es.commission_type = 'fixed_amount' THEN es.commission_rate
        ELSE 0
      END, 0
    ) as commission_amount,
    es.commission_rate,
    es.commission_type,
    d.id as reference_id,
    'Delivery #' || d.id as reference_name,
    d.created_at
  FROM deliveries d
  JOIN profiles p1 ON p1.id = d.driver_id
  LEFT JOIN employee_salaries es ON es.employee_id = d.driver_id
    AND es.is_active = true
    AND d.delivery_date BETWEEN es.effective_from AND COALESCE(es.effective_until, '9999-12-31')
  WHERE d.status = 'completed'

  UNION ALL

  -- Helper commissions
  SELECT
    d.helper_id as employee_id,
    p2.full_name as employee_name,
    p2.role as employee_role,
    'delivery' as commission_source,
    d.delivery_date as commission_date,
    EXTRACT(YEAR FROM d.delivery_date) as commission_year,
    EXTRACT(MONTH FROM d.delivery_date) as commission_month,
    d.total_amount as base_amount,
    COALESCE(
      CASE
        WHEN es.commission_type = 'percentage' THEN d.total_amount * (es.commission_rate / 100)
        WHEN es.commission_type = 'fixed_amount' THEN es.commission_rate
        ELSE 0
      END, 0
    ) as commission_amount,
    es.commission_rate,
    es.commission_type,
    d.id as reference_id,
    'Delivery #' || d.id as reference_name,
    d.created_at
  FROM deliveries d
  JOIN profiles p2 ON p2.id = d.helper_id
  LEFT JOIN employee_salaries es ON es.employee_id = d.helper_id
    AND es.is_active = true
    AND d.delivery_date BETWEEN es.effective_from AND COALESCE(es.effective_until, '9999-12-31')
  WHERE d.status = 'completed' AND d.helper_id IS NOT NULL
),
payroll_commissions AS (
  -- Get commissions from payroll records (new system)
  SELECT
    pr.employee_id,
    p.full_name as employee_name,
    p.role as employee_role,
    'payroll' as commission_source,
    DATE(pr.period_year || '-' || pr.period_month || '-15') as commission_date, -- Mid-month for payroll
    pr.period_year as commission_year,
    pr.period_month as commission_month,
    (pr.base_salary_amount + pr.bonus_amount) as base_amount, -- Base for commission calculation
    pr.commission_amount,
    es.commission_rate,
    es.commission_type,
    pr.id as reference_id,
    'Payroll ' || TO_CHAR(DATE(pr.period_year || '-' || pr.period_month || '-01'), 'Month YYYY') as reference_name,
    pr.created_at
  FROM payroll_records pr
  JOIN profiles p ON p.id = pr.employee_id
  LEFT JOIN employee_salaries es ON es.id = pr.salary_config_id
  WHERE pr.commission_amount > 0
)
SELECT
  employee_id,
  employee_name,
  employee_role,
  commission_source,
  commission_date,
  commission_year,
  commission_month,
  base_amount,
  commission_amount,
  commission_rate,
  commission_type,
  reference_id,
  reference_name,
  created_at,
  -- Additional computed fields
  CASE
    WHEN commission_source = 'delivery' THEN 'Komisi Pengantaran'
    WHEN commission_source = 'payroll' THEN 'Komisi Gaji'
    ELSE 'Komisi Lain'
  END as commission_source_display,
  TO_CHAR(commission_date, 'Month YYYY') as period_display
FROM delivery_commissions
WHERE commission_amount > 0

UNION ALL

SELECT
  employee_id,
  employee_name,
  employee_role,
  commission_source,
  commission_date,
  commission_year,
  commission_month,
  base_amount,
  commission_amount,
  commission_rate,
  commission_type,
  reference_id,
  reference_name,
  created_at,
  CASE
    WHEN commission_source = 'delivery' THEN 'Komisi Pengantaran'
    WHEN commission_source = 'payroll' THEN 'Komisi Gaji'
    ELSE 'Komisi Lain'
  END as commission_source_display,
  TO_CHAR(commission_date, 'Month YYYY') as period_display
FROM payroll_commissions
WHERE commission_amount > 0

ORDER BY commission_date DESC, employee_name ASC;

-- Step 7: Create function to get commission summary by employee and period
CREATE OR REPLACE FUNCTION public.get_commission_summary(
  emp_id UUID DEFAULT NULL,
  start_date DATE DEFAULT NULL,
  end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  employee_id UUID,
  employee_name TEXT,
  employee_role TEXT,
  total_commission DECIMAL(15,2),
  delivery_commission DECIMAL(15,2),
  payroll_commission DECIMAL(15,2),
  commission_count INTEGER,
  period_start DATE,
  period_end DATE
) AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 8: Grant permissions
GRANT EXECUTE ON FUNCTION public.get_outstanding_advances(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_payroll_with_advances(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_advance_repayment_from_salary(UUID, DECIMAL) TO authenticated;
GRANT SELECT ON public.unified_commission_report TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_commission_summary(UUID, DATE, DATE) TO authenticated;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ All integrations applied successfully!';
  RAISE NOTICE '🔗 Advance-Payroll integration: auto-deduction and repayment tracking';
  RAISE NOTICE '📊 Commission reports: unified view of delivery and payroll commissions';
  RAISE NOTICE '⚡ Triggers: automatic advance repayment when payroll is paid';
  RAISE NOTICE '📈 Views: updated payroll_summary and new unified_commission_report';
END $$;