
COPY (
    SELECT 
        account_code, 
        account_name, 
        account_type, 
        calculated_balance
    FROM v_account_balances
    WHERE calculated_balance != 0
    ORDER BY account_type, account_code
) TO STDOUT WITH CSV HEADER;
