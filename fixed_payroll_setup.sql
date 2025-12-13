-- FIXED COMPLETE PAYROLL SYSTEM SETUP
-- Jalankan script ini di database production untuk setup lengkap

-- ========================================
-- STEP 1: CREATE PAYROLL SYSTEM TABLES
-- ========================================

-- Create employee_salaries table (Salary Configuration)
CREATE TABLE IF NOT EXISTS public.employee_salaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Salary Configuration
  base_salary DECIMAL(15,2) DEFAULT 0 NOT NULL,
  commission_rate DECIMAL(5,2) DEFAULT 0 NOT NULL,
  payroll_type VARCHAR(20) DEFAULT 'monthly' NOT NULL,
  commission_type VARCHAR(20) DEFAULT 'none' NOT NULL,

  -- Validity Period
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_until DATE NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,

  -- Metadata
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  notes TEXT,

  -- Constraints
  CONSTRAINT valid_commission_rate CHECK (commission_rate >= 0 AND commission_rate <= 100),
  CONSTRAINT valid_base_salary CHECK (base_salary >= 0),
  CONSTRAINT valid_payroll_type CHECK (payroll_type IN ('monthly', 'commission_only', 'mixed')),
  CONSTRAINT valid_commission_type CHECK (commission_type IN ('percentage', 'fixed_amount', 'none')),
  CONSTRAINT valid_effective_period CHECK (effective_until IS NULL OR effective_until >= effective_from)
);

-- Create payroll_records table (Monthly Payroll Transactions)
CREATE TABLE IF NOT EXISTS public.payroll_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  salary_config_id UUID REFERENCES public.employee_salaries(id) ON DELETE SET NULL,

  -- Period
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Salary Components
  base_salary_amount DECIMAL(15,2) DEFAULT 0 NOT NULL,
  commission_amount DECIMAL(15,2) DEFAULT 0 NOT NULL,
  bonus_amount DECIMAL(15,2) DEFAULT 0 NOT NULL,
  deduction_amount DECIMAL(15,2) DEFAULT 0 NOT NULL,

  -- Totals (computed fields)
  gross_salary DECIMAL(15,2) GENERATED ALWAYS AS (
    base_salary_amount + commission_amount + bonus_amount
  ) STORED,
  net_salary DECIMAL(15,2) GENERATED ALWAYS AS (
    base_salary_amount + commission_amount + bonus_amount - deduction_amount
  ) STORED,

  -- Status and Payment
  status VARCHAR(20) DEFAULT 'draft' NOT NULL,
  payment_date DATE NULL,
  payment_account_id TEXT REFERENCES public.accounts(id), -- Changed from UUID to TEXT

  -- Integration with cash_history
  cash_history_id UUID NULL,

  -- Metadata
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  notes TEXT,

  -- Constraints
  CONSTRAINT valid_period_year CHECK (period_year >= 2020 AND period_year <= 2100),
  CONSTRAINT valid_period_month CHECK (period_month >= 1 AND period_month <= 12),
  CONSTRAINT valid_status CHECK (status IN ('draft', 'approved', 'paid')),
  CONSTRAINT valid_amounts CHECK (
    base_salary_amount >= 0 AND
    commission_amount >= 0 AND
    bonus_amount >= 0 AND
    deduction_amount >= 0
  ),
  CONSTRAINT valid_period_dates CHECK (period_end >= period_start),

  -- Unique constraint: one payroll record per employee per month
  UNIQUE(employee_id, period_year, period_month)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_employee_salaries_employee_id ON public.employee_salaries(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_salaries_active ON public.employee_salaries(employee_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_employee_salaries_effective_period ON public.employee_salaries(effective_from, effective_until);

CREATE INDEX IF NOT EXISTS idx_payroll_records_employee_id ON public.payroll_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_records_period ON public.payroll_records(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_payroll_records_status ON public.payroll_records(status);
CREATE INDEX IF NOT EXISTS idx_payroll_records_payment_date ON public.payroll_records(payment_date) WHERE payment_date IS NOT NULL;

-- Create updated_at triggers
CREATE OR REPLACE FUNCTION public.update_payroll_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_employee_salaries_updated_at ON public.employee_salaries;
CREATE TRIGGER update_employee_salaries_updated_at
  BEFORE UPDATE ON public.employee_salaries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_payroll_updated_at();

DROP TRIGGER IF EXISTS update_payroll_records_updated_at ON public.payroll_records;
CREATE TRIGGER update_payroll_records_updated_at
  BEFORE UPDATE ON public.payroll_records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_payroll_updated_at();

-- ========================================
-- STEP 2: CREATE PAYROLL HELPER FUNCTIONS
-- ========================================

CREATE OR REPLACE FUNCTION public.get_active_salary_config(emp_id UUID, check_date DATE DEFAULT CURRENT_DATE)
RETURNS public.employee_salaries AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.calculate_commission_for_period(
  emp_id UUID,
  start_date DATE,
  end_date DATE
)
RETURNS DECIMAL(15,2) AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- STEP 3: CREATE PAYROLL VIEWS
-- ========================================

CREATE OR REPLACE VIEW public.employee_salary_summary AS
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

-- ========================================
-- STEP 4: ADVANCE-PAYROLL INTEGRATION
-- ========================================

-- Function to calculate outstanding advances for an employee
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

-- Function to auto-calculate payroll with advance deduction
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

-- Function to automatically repay advances when salary is paid
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

    -- Update remaining amount using RPC function
    IF EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'update_remaining_amount'
    ) THEN
      PERFORM public.update_remaining_amount(advance_record.id);
    ELSE
      -- Fallback: update remaining amount manually
      UPDATE public.employee_advances
      SET remaining_amount = (
        SELECT amount - COALESCE(SUM(ar.amount), 0)
        FROM public.advance_repayments ar
        WHERE ar.advance_id = advance_record.id
      )
      WHERE id = advance_record.id;
    END IF;

    -- Exit if all deduction is processed
    IF remaining_deduction <= 0 THEN
      EXIT;
    END IF;
  END LOOP;

  -- Update account balances for the repayments
  -- Check if update_account_balance function exists, otherwise skip
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'update_account_balance'
  ) THEN
    -- Decrease panjar karyawan account (1220)
    PERFORM public.update_account_balance('acc-1220', -advance_deduction_amount);
  END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-process advance repayments when payroll is paid
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

-- Updated payroll summary view with advance info
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
-- STEP 5: ROW LEVEL SECURITY (RLS)
-- ========================================

ALTER TABLE public.employee_salaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;

-- RLS for employee_salaries
DROP POLICY IF EXISTS "Admin and owner can view all employee salaries" ON public.employee_salaries;
CREATE POLICY "Admin and owner can view all employee salaries" ON public.employee_salaries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('owner', 'admin')
      AND p.status = 'Aktif'
    )
  );

DROP POLICY IF EXISTS "Admin and owner can manage employee salaries" ON public.employee_salaries;
CREATE POLICY "Admin and owner can manage employee salaries" ON public.employee_salaries
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('owner', 'admin')
      AND p.status = 'Aktif'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('owner', 'admin')
      AND p.status = 'Aktif'
    )
  );

-- RLS for payroll_records
DROP POLICY IF EXISTS "Admin and owner can view all payroll records" ON public.payroll_records;
CREATE POLICY "Admin and owner can view all payroll records" ON public.payroll_records
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('owner', 'admin')
      AND p.status = 'Aktif'
    )
  );

DROP POLICY IF EXISTS "Admin and owner can manage payroll records" ON public.payroll_records;
CREATE POLICY "Admin and owner can manage payroll records" ON public.payroll_records
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('owner', 'admin')
      AND p.status = 'Aktif'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('owner', 'admin')
      AND p.status = 'Aktif'
    )
  );

-- ========================================
-- STEP 6: GRANT PERMISSIONS
-- ========================================

-- Grant permissions on views
GRANT SELECT ON public.employee_salary_summary TO authenticated;
GRANT SELECT ON public.payroll_summary TO authenticated;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION public.get_active_salary_config(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_commission_for_period(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_outstanding_advances(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_payroll_with_advances(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_advance_repayment_from_salary(UUID, DECIMAL) TO authenticated;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Complete payroll system setup completed successfully!';
  RAISE NOTICE '📊 Tables: employee_salaries, payroll_records created';
  RAISE NOTICE '🔗 Advance-Payroll integration: auto-deduction and repayment tracking';
  RAISE NOTICE '⚡ Triggers: automatic advance repayment when payroll is paid';
  RAISE NOTICE '📈 Views: employee_salary_summary, payroll_summary with advance info';
  RAISE NOTICE '🔒 RLS policies applied for admin/owner access';
  RAISE NOTICE '🔧 Fixed foreign key compatibility issues';
END $$;