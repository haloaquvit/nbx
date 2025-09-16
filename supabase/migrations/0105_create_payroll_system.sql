-- ========================================
-- PAYROLL SYSTEM TABLES
-- ========================================
-- File: 0105_create_payroll_system.sql
-- Purpose: Create separate tables for employee salary management
-- Date: 2025-01-19

-- Step 1: Create employee_salaries table (Salary Configuration)
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

-- Step 2: Create payroll_records table (Monthly Payroll Transactions)
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
  payment_account_id UUID REFERENCES public.accounts(id),

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

-- Step 3: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_employee_salaries_employee_id ON public.employee_salaries(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_salaries_active ON public.employee_salaries(employee_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_employee_salaries_effective_period ON public.employee_salaries(effective_from, effective_until);

CREATE INDEX IF NOT EXISTS idx_payroll_records_employee_id ON public.payroll_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_records_period ON public.payroll_records(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_payroll_records_status ON public.payroll_records(status);
CREATE INDEX IF NOT EXISTS idx_payroll_records_payment_date ON public.payroll_records(payment_date) WHERE payment_date IS NOT NULL;

-- Step 4: Create updated_at triggers
CREATE OR REPLACE FUNCTION public.update_payroll_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_employee_salaries_updated_at
  BEFORE UPDATE ON public.employee_salaries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_payroll_updated_at();

CREATE TRIGGER update_payroll_records_updated_at
  BEFORE UPDATE ON public.payroll_records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_payroll_updated_at();

-- Step 5: Row Level Security (RLS) Policies
ALTER TABLE public.employee_salaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;

-- RLS for employee_salaries
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

-- Step 6: Create helper functions
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

-- Step 7: Create views for easier querying
CREATE OR REPLACE VIEW public.employee_salary_summary AS
SELECT
  es.id as salary_config_id,
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
  es.created_at,
  es.notes
FROM public.employee_salaries es
JOIN public.profiles p ON p.id = es.employee_id
WHERE p.status != 'Nonaktif';

CREATE OR REPLACE VIEW public.payroll_summary AS
SELECT
  pr.id as payroll_id,
  pr.employee_id,
  p.full_name as employee_name,
  p.role as employee_role,
  pr.period_year,
  pr.period_month,
  TO_CHAR(DATE(pr.period_year || '-' || pr.period_month || '-01'), 'Month YYYY') as period_display,
  pr.base_salary_amount,
  pr.commission_amount,
  pr.bonus_amount,
  pr.deduction_amount,
  pr.gross_salary,
  pr.net_salary,
  pr.status,
  pr.payment_date,
  a.name as payment_account_name,
  pr.created_at,
  pr.notes
FROM public.payroll_records pr
JOIN public.profiles p ON p.id = pr.employee_id
LEFT JOIN public.accounts a ON a.id = pr.payment_account_id
WHERE p.status != 'Nonaktif'
ORDER BY pr.period_year DESC, pr.period_month DESC, p.full_name;

-- Grant permissions on views
GRANT SELECT ON public.employee_salary_summary TO authenticated;
GRANT SELECT ON public.payroll_summary TO authenticated;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION public.get_active_salary_config(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_commission_for_period(UUID, DATE, DATE) TO authenticated;

-- Step 8: Insert sample data for testing (optional)
-- This will be done through the UI, but can be uncommented for testing

/*
-- Sample salary configurations
INSERT INTO public.employee_salaries (employee_id, base_salary, commission_rate, payroll_type, commission_type, notes)
SELECT
  id as employee_id,
  CASE
    WHEN role IN ('driver', 'helper') THEN 3000000
    WHEN role IN ('admin', 'cashier') THEN 4000000
    WHEN role = 'sales' THEN 2000000
    ELSE 3500000
  END as base_salary,
  CASE
    WHEN role IN ('driver', 'helper') THEN 5
    WHEN role = 'sales' THEN 10
    ELSE 0
  END as commission_rate,
  CASE
    WHEN role = 'sales' THEN 'mixed'
    WHEN role IN ('driver', 'helper') THEN 'mixed'
    ELSE 'monthly'
  END as payroll_type,
  CASE
    WHEN role IN ('driver', 'helper', 'sales') THEN 'percentage'
    ELSE 'none'
  END as commission_type,
  'Initial salary configuration' as notes
FROM public.profiles
WHERE status = 'Aktif' AND role IS NOT NULL;
*/

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Payroll system tables created successfully!';
  RAISE NOTICE '📊 Tables: employee_salaries, payroll_records';
  RAISE NOTICE '🔒 RLS policies applied';
  RAISE NOTICE '📈 Views: employee_salary_summary, payroll_summary';
  RAISE NOTICE '⚙️ Functions: get_active_salary_config, calculate_commission_for_period';
END $$;