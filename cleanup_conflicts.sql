-- Drop conflicting functions to ensure clean redeploy

-- 1. Void Transaction (Conflicted between 07 and 09)
DROP FUNCTION IF EXISTS void_transaction_atomic(TEXT, UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS void_transaction_atomic(UUID, UUID, TEXT, UUID);

-- 2. Create Transaction (To update with new signature/logic)
DROP FUNCTION IF EXISTS create_transaction_atomic(JSONB, JSONB, UUID, UUID, TEXT, TEXT);

-- 3. Update Transaction
DROP FUNCTION IF EXISTS update_transaction_atomic(TEXT, JSONB, UUID, UUID, TEXT);
