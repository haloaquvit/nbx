
-- Check for unbalanced journals
SELECT 
    id, 
    entry_number, 
    description,
    total_debit, 
    total_credit, 
    (total_debit - total_credit) as diff 
FROM journal_entries 
WHERE status = 'posted' 
  AND is_voided = false 
  AND ABS(total_debit - total_credit) > 1
ORDER BY diff DESC;

-- Check for specific amount discrepancy
SELECT * FROM journal_entries 
WHERE ABS(total_debit) = 177282778 OR ABS(total_credit) = 177282778;

-- Check account balances to see which one might be close to the diff
SELECT code, name, balance 
FROM accounts 
WHERE ABS(balance) BETWEEN 177282000 AND 177283000;
