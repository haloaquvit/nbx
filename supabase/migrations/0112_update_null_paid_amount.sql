-- Update NULL paid_amount values to 0 for existing records
-- This fixes the payment button display issue

-- First, update existing NULL values to 0
UPDATE accounts_payable
SET paid_amount = 0
WHERE paid_amount IS NULL;

-- Add default value for paid_amount column to prevent future NULL issues
ALTER TABLE accounts_payable
ALTER COLUMN paid_amount SET DEFAULT 0;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Updated NULL paid_amount values to 0';
  RAISE NOTICE 'Set default value to 0 for future records';
END $$;
