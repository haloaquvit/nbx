-- Migration: Add 'operator' and 'supervisor' to commission_rules role check constraint
-- Date: 2026-01-09
-- Issue: UI allows setting commission for 'Operator' role but DB constraint only allows 'sales', 'driver', 'helper'

-- Drop old constraint
ALTER TABLE commission_rules
DROP CONSTRAINT IF EXISTS commission_rules_role_check;

-- Add new constraint with additional roles
ALTER TABLE commission_rules
ADD CONSTRAINT commission_rules_role_check
CHECK (role = ANY (ARRAY['sales'::text, 'driver'::text, 'helper'::text, 'operator'::text, 'supervisor'::text]));

-- Verify
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'commission_rules_role_check';
