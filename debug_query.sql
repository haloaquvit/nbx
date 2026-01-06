
SELECT 
    je.reference_type,
    COUNT(*) as count,
    SUM(jel.debit_amount) as debit,
    SUM(jel.credit_amount) as credit,
    SUM(jel.debit_amount - jel.credit_amount) as net
FROM journal_entry_lines jel
JOIN journal_entries je ON jel.journal_entry_id = je.id
WHERE jel.account_id = 'acc-1767045783111'
AND je.status = 'posted' AND je.is_voided = false
GROUP BY je.reference_type;
