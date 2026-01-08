-- List all non-zero balances
SELECT 
    account_code, 
    account_name, 
    account_type, 
    calculated_balance
FROM v_account_balances
WHERE calculated_balance != 0
ORDER BY account_type, account_code;

-- Check for the specific difference
SELECT 
    account_code, 
    account_name, 
    account_type, 
    calculated_balance
FROM v_account_balances
WHERE ABS(calculated_balance - 177282778) < 2000;
