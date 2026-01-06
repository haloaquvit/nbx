
\echo '=== BRANCHES ==='
SELECT id, name FROM branches;

\echo '=== PERSEDIAAN BARANG DAGANG (1310) ANALYSIS ==='
-- Get Account ID for 1310
WITH acc AS (
    SELECT id, name FROM accounts WHERE code = '1310' LIMIT 1
)
SELECT 
    je.entry_date,
    je.reference_type, -- transaction, production, etc.
    je.description,
    jel.debit_amount,
    jel.credit_amount,
    (jel.debit_amount - jel.credit_amount) as net_change
FROM journal_entry_lines jel
JOIN journal_entries je ON jel.journal_entry_id = je.id
JOIN acc ON jel.account_id = acc.id
WHERE je.status = 'posted' AND je.is_voided = false
ORDER BY je.entry_date DESC, je.created_at DESC
LIMIT 20;

\echo '=== SUMMARY BY REFERENCE TYPE FOR 1310 ==='
SELECT 
    je.reference_type,
    COUNT(*) as count,
    SUM(jel.debit_amount) as total_debit,
    SUM(jel.credit_amount) as total_credit,
    SUM(jel.debit_amount - jel.credit_amount) as net_impact
FROM journal_entry_lines jel
JOIN journal_entries je ON jel.journal_entry_id = je.id
WHERE jel.account_id = (SELECT id FROM accounts WHERE code = '1310' LIMIT 1)
AND je.status = 'posted' AND je.is_voided = false
GROUP BY je.reference_type;
