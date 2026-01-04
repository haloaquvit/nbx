-- ============================================================================
-- FIX PAYMENT ACCOUNTS - Ensure all cash/bank accounts have is_payment_account = true
-- This is required for transactions to appear in Cash Flow (Buku Kas)
-- ============================================================================

-- Mark all cash and bank accounts as payment accounts
-- Codes 1110-1199 are typically cash/bank accounts
UPDATE accounts
SET is_payment_account = true
WHERE code IN ('1110', '1120', '1130', '1140', '1150', '1160', '1170', '1180', '1190', '1199')
  AND (is_payment_account IS NULL OR is_payment_account = false);

-- Also mark any account with "Kas" or "Bank" in the name
UPDATE accounts
SET is_payment_account = true
WHERE (LOWER(name) LIKE '%kas%' OR LOWER(name) LIKE '%bank%' OR LOWER(name) LIKE '%cash%')
  AND is_header = false
  AND (is_payment_account IS NULL OR is_payment_account = false)
  AND code LIKE '11%'; -- Only asset accounts starting with 11

-- Verify the results
SELECT id, code, name, is_payment_account, branch_id
FROM accounts
WHERE code LIKE '11%' AND is_header = false
ORDER BY branch_id, code;
