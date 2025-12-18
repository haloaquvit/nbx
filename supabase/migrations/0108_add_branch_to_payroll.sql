-- Add branch_id to payroll tables
-- File: 0108_add_branch_to_payroll.sql
-- Purpose: Add branch_id to payroll_records and update payroll_summary view

-- Step 1: Add branch_id to payroll_records table
ALTER TABLE public.payroll_records
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

-- Step 2: Create index for branch filtering
CREATE INDEX IF NOT EXISTS idx_payroll_records_branch_id
ON public.payroll_records(branch_id);

-- Step 3: Drop and recreate payroll_summary view to include branch_id
DROP VIEW IF EXISTS public.payroll_summary;

CREATE VIEW public.payroll_summary AS
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
  pr.branch_id,
  pr.created_at,
  pr.notes
FROM public.payroll_records pr
JOIN public.profiles p ON p.id = pr.employee_id
LEFT JOIN public.accounts a ON a.id = pr.payment_account_id
WHERE p.status != 'Nonaktif'
ORDER BY pr.period_year DESC, pr.period_month DESC, p.full_name;

-- Grantpermissions
GRANT SELECT ON public.payroll_summary TO authenticated;
