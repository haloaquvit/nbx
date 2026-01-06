-- Create new index to speed up payment history lookups
CREATE INDEX IF NOT EXISTS idx_payment_history_branch_id ON payment_history(branch_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_transaction_id ON payment_history(transaction_id);

-- Check grants
GRANT SELECT, INSERT, UPDATE, DELETE ON payment_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON payment_history TO service_role;
