-- ============================================================================
-- SCRIPT: Add branch_id to accounts table for multi-branch COA
-- ============================================================================
-- This script adds branch_id column to accounts table to separate COA per branch
-- ============================================================================

-- Step 1: Check current structure of accounts table
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'accounts'
ORDER BY ordinal_position;

-- Step 2: Add branch_id column to accounts table
ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- Step 3: Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_accounts_branch_id ON accounts(branch_id);

-- Step 4: Verify column was added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'accounts' AND column_name = 'branch_id';

-- Step 5: Check existing branches
SELECT id, name FROM branches ORDER BY name;

-- ============================================================================
-- IMPORTANT: After adding branch_id, you need to:
-- 1. Assign existing accounts to branches (or keep NULL for global/shared accounts)
-- 2. Update the frontend to filter accounts by branch_id
-- ============================================================================

-- Example: Assign all existing accounts to a specific branch
-- UPDATE accounts SET branch_id = 'your-branch-uuid-here' WHERE branch_id IS NULL;

-- Example: Copy accounts to all branches (if you want separate accounts per branch)
-- This creates duplicate accounts for each branch
/*
DO $$
DECLARE
  branch_record RECORD;
  account_record RECORD;
BEGIN
  -- Get all branches
  FOR branch_record IN SELECT id, name FROM branches LOOP
    -- For each account without branch_id, create a copy for this branch
    FOR account_record IN
      SELECT * FROM accounts WHERE branch_id IS NULL
    LOOP
      INSERT INTO accounts (
        id, code, name, type, balance, initial_balance,
        is_payment_account, parent_id, level, normal_balance,
        is_header, is_active, sort_order, branch_id, created_at
      ) VALUES (
        'acc-' || branch_record.id || '-' || account_record.code,
        account_record.code,
        account_record.name,
        account_record.type,
        0, -- Start with zero balance for new branch
        0,
        account_record.is_payment_account,
        CASE
          WHEN account_record.parent_id IS NOT NULL
          THEN 'acc-' || branch_record.id || '-' ||
               (SELECT code FROM accounts WHERE id = account_record.parent_id)
          ELSE NULL
        END,
        account_record.level,
        account_record.normal_balance,
        account_record.is_header,
        account_record.is_active,
        account_record.sort_order,
        branch_record.id,
        NOW()
      )
      ON CONFLICT (id) DO NOTHING;
    END LOOP;

    RAISE NOTICE 'Created accounts for branch: %', branch_record.name;
  END LOOP;
END $$;
*/

SELECT 'branch_id column added to accounts table!' as status;
