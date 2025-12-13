-- Batch fix for problematic migrations
-- This script fixes IF NOT EXISTS issues in multiple migration files

-- Run this directly against the database to sync the migrations properly

-- From 0104_create_accounts_payable.sql
CREATE TABLE IF NOT EXISTS accounts_payable (
    id text PRIMARY KEY,
    purchase_order_id text REFERENCES purchase_orders(id) ON DELETE CASCADE,
    supplier_name text NOT NULL,
    amount numeric NOT NULL,
    due_date timestamptz,
    description text NOT NULL,
    status text NOT NULL DEFAULT 'Outstanding' CHECK (status IN ('Outstanding', 'Paid', 'Partial')),
    created_at timestamptz DEFAULT now(),
    paid_at timestamptz,
    paid_amount numeric DEFAULT 0,
    payment_account_id text REFERENCES accounts(id),
    notes text
);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_accounts_payable_po_id ON accounts_payable(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_accounts_payable_status ON accounts_payable(status);
CREATE INDEX IF NOT EXISTS idx_accounts_payable_created_at ON accounts_payable(created_at);

-- From 0105_create_payroll_system.sql (just ensure tables exist)
CREATE TABLE IF NOT EXISTS employee_salaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    position TEXT NOT NULL,
    base_salary DECIMAL(15,2) NOT NULL DEFAULT 0,
    commission_type TEXT CHECK (commission_type IN ('percentage', 'fixed_amount')),
    commission_rate DECIMAL(10,4) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_until DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payroll_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    salary_config_id UUID REFERENCES employee_salaries(id),
    period_year INTEGER NOT NULL,
    period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    base_salary_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
    commission_amount DECIMAL(15,2) DEFAULT 0,
    bonus_amount DECIMAL(15,2) DEFAULT 0,
    deduction_amount DECIMAL(15,2) DEFAULT 0,
    total_gross DECIMAL(15,2) GENERATED ALWAYS AS (base_salary_amount + commission_amount + bonus_amount) STORED,
    total_net DECIMAL(15,2) GENERATED ALWAYS AS (base_salary_amount + commission_amount + bonus_amount - deduction_amount) STORED,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES profiles(id),
    approved_by UUID REFERENCES profiles(id),
    approved_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    UNIQUE(employee_id, period_year, period_month)
);

-- Success message
SELECT 'accounts_payable and payroll tables ensured to exist' as status;