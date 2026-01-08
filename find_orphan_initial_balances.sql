
COPY (
    SELECT 
        code, 
        name, 
        type, 
        initial_balance 
    FROM accounts 
    WHERE initial_balance != 0 
    AND branch_id IS NOT NULL -- Limit to branch accounts
    AND id NOT IN (
        SELECT account_id 
        FROM journal_entry_lines jel
        JOIN journal_entries je ON jel.journal_entry_id = je.id
        WHERE je.reference_type = 'opening_balance' AND je.is_voided = false
    )
    ORDER BY type, code
) TO STDOUT WITH CSV HEADER;
