
SELECT 
    RPAD(account_code, 15, ' ') as code,
    RPAD(SUBSTRING(account_name, 1, 35), 35, ' ') as name,
    RPAD(account_type, 15, ' ') as type,
    calculated_balance
FROM v_account_balances
WHERE calculated_balance != 0
ORDER BY account_type, account_code;
