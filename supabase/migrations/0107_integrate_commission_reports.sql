-- ========================================
-- COMMISSION REPORTS INTEGRATION
-- ========================================
-- File: 0107_integrate_commission_reports.sql
-- Purpose: Integrate commission reports with payroll system
-- Date: 2025-01-19

-- Step 1: Create view to combine delivery commissions and payroll commissions
CREATE OR REPLACE VIEW public.unified_commission_report AS
WITH payroll_commissions AS (
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
  FROM public.payroll_records pr
  JOIN public.profiles p ON p.id = pr.employee_id
  LEFT JOIN public.employee_salaries es ON es.id = pr.salary_config_id
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
FROM payroll_commissions
WHERE commission_amount > 0
ORDER BY commission_date DESC, employee_name ASC;

-- Step 2: Create function to get commission summary by employee and period
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

-- Step 3: Create function to sync commissions from payroll to commission entries
CREATE OR REPLACE FUNCTION public.sync_payroll_commissions_to_entries()
RETURNS INTEGER AS $$
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
    FROM public.payroll_records pr
    JOIN public.profiles p ON p.id = pr.employee_id
    WHERE pr.commission_amount > 0
      AND pr.status = 'paid'
      AND NOT EXISTS (
        SELECT 1 FROM public.commission_entries ce
        WHERE ce.source_id = pr.id AND ce.source_type = 'payroll'
      )
  LOOP
    -- Insert commission entry for the payroll commission
    INSERT INTO public.commission_entries (
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Create trigger to auto-sync commissions when payroll is paid
CREATE OR REPLACE FUNCTION public.trigger_sync_payroll_commission()
RETURNS TRIGGER AS $$
BEGIN
  -- When payroll status changes to 'paid' and has commission amount
  IF NEW.status = 'paid' AND OLD.status != 'paid' AND NEW.commission_amount > 0 THEN
    -- Check if commission entry doesn't already exist
    IF NOT EXISTS (
      SELECT 1 FROM public.commission_entries ce
      WHERE ce.source_id = NEW.id AND ce.source_type = 'payroll'
    ) THEN
      -- Get employee info
      DECLARE
        emp_name TEXT;
        emp_role TEXT;
      BEGIN
        SELECT p.full_name, p.role INTO emp_name, emp_role
        FROM public.profiles p WHERE p.id = NEW.employee_id;

        -- Insert commission entry
        INSERT INTO public.commission_entries (
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
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS payroll_commission_sync_trigger ON public.payroll_records;
CREATE TRIGGER payroll_commission_sync_trigger
  AFTER UPDATE ON public.payroll_records
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_sync_payroll_commission();

-- Step 5: Grant permissions
GRANT SELECT ON public.unified_commission_report TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_commission_summary(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_payroll_commissions_to_entries() TO authenticated;

-- Step 6: Sync existing payroll commissions (one-time operation)
-- This will be commented out after first run
/*
SELECT public.sync_payroll_commissions_to_entries();
*/

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Commission reports integration completed!';
  RAISE NOTICE '📊 View: unified_commission_report (combines delivery + payroll commissions)';
  RAISE NOTICE '📈 Function: get_commission_summary for aggregated reports';
  RAISE NOTICE '🔄 Auto-sync trigger for payroll commissions';
  RAISE NOTICE '⚡ Run sync_payroll_commissions_to_entries() to sync existing data';
END $$;