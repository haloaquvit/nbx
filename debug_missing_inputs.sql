
\echo '=== CHECKING PRODUCTION JOURNALS ==='
SELECT 
    je.branch_id,
    je.reference_type,
    je.entry_date,
    je.status,
    jel.account_id,
    acc.code,
    acc.name,
    jel.debit_amount,
    jel.credit_amount
FROM journal_entries je
JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
JOIN accounts acc ON jel.account_id = acc.id
WHERE je.reference_type IN ('production', 'purchase')
AND je.status = 'posted'
ORDER BY je.created_at DESC
LIMIT 20;

\echo '=== CHECKING OPENING BALANCE JOURNALS ==='
SELECT 
    je.branch_id,
    je.reference_type,
    je.entry_date,
    jel.debit_amount,
    acc.code,
    acc.name
FROM journal_entries je
JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
JOIN accounts acc ON jel.account_id = acc.id
WHERE je.reference_type = 'opening'
AND acc.code = '1310';
