
\echo '=== CHECKING CANDIDATE JOURNALS FOR FIX ==='
SELECT 
    id,
    entry_date,
    reference_type,
    description,
    total_debit
FROM journal_entries
WHERE reference_type = 'adjustment' 
AND description ILIKE 'Produksi%'
ORDER BY entry_date DESC;

\echo '=== SUMMARY ==='
SELECT COUNT(*) as total_to_fix
FROM journal_entries
WHERE reference_type = 'adjustment' 
AND description ILIKE 'Produksi%';
