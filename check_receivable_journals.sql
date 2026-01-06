-- Check if receivable payment journals exist
SELECT 
    je.id,
    je.entry_number,
    je.entry_date,
    je.reference_type,
    je.reference_id,
    je.description,
    je.status,
    je.total_debit,
    je.total_credit
FROM journal_entries je
WHERE je.branch_id = '00000000-0000-0000-0000-000000000001'
  AND (je.reference_type = 'receivable' OR je.reference_type = 'receivable_payment')
ORDER BY je.created_at DESC
LIMIT 10;
