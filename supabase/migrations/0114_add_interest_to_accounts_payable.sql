-- Add interest rate fields to accounts_payable table
ALTER TABLE accounts_payable
ADD COLUMN IF NOT EXISTS interest_rate numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS interest_type text DEFAULT 'flat' CHECK (interest_type IN ('flat', 'per_month', 'per_year')),
ADD COLUMN IF NOT EXISTS creditor_type text DEFAULT 'supplier' CHECK (creditor_type IN ('supplier', 'bank', 'credit_card', 'other'));

-- Add comment for clarity
COMMENT ON COLUMN accounts_payable.interest_rate IS 'Interest rate in percentage (e.g., 5 for 5%)';
COMMENT ON COLUMN accounts_payable.interest_type IS 'Type of interest calculation: flat (one-time), per_month (monthly), per_year (annual)';
COMMENT ON COLUMN accounts_payable.creditor_type IS 'Type of creditor: supplier, bank, credit_card, or other';
