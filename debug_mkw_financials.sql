
-- Debug Script for Negative Balance Sheet
-- To be run on mkw_db (Manokwari)

\echo '=== 1. CHECK FOR NEGATIVE BALANCES (CALCULATED FROM JOURNALS) ==='
WITH account_balances AS (
    SELECT 
        a.id,
        a.code,
        a.name,
        a.type,
        a.initial_balance,
        COALESCE(SUM(
            CASE 
                WHEN a.type IN ('Aset', 'Beban', 'Asset', 'Expense') THEN jel.debit_amount - jel.credit_amount
                ELSE jel.credit_amount - jel.debit_amount
            END
        ), 0) as journal_movement,
        (a.initial_balance + COALESCE(SUM(
            CASE 
                WHEN a.type IN ('Aset', 'Beban', 'Asset', 'Expense') THEN jel.debit_amount - jel.credit_amount
                ELSE jel.credit_amount - jel.debit_amount
            END
        ), 0)) as calculated_balance
    FROM accounts a
    LEFT JOIN journal_entry_lines jel ON a.id = jel.account_id
    LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id
    WHERE 
        (je.status = 'posted' AND je.is_voided = false) OR je.id IS NULL
    GROUP BY a.id, a.code, a.name, a.type, a.initial_balance
)
SELECT * FROM account_balances 
WHERE calculated_balance < 0 
ORDER BY calculated_balance ASC;


\echo '=== 2. TOTAL DEBIT VS CREDIT (Should be equal) ==='
SELECT 
    sum(debit_amount) as total_debit, 
    sum(credit_amount) as total_credit,
    sum(debit_amount) - sum(credit_amount) as difference
FROM journal_entry_lines jel
JOIN journal_entries je ON jel.journal_entry_id = je.id
WHERE je.status = 'posted' AND je.is_voided = false;


\echo '=== 3. CHECK SPECIFIC NEGATIVE ACCOUNTS DETAILS (Top 5) ==='
-- Replace ID with one from step 1 if needed, for now just getting top 5 negative assets
SELECT 
    je.entry_date,
    je.transaction_number,
    je.description,
    jel.debit_amount,
    jel.credit_amount,
    a.name as account_name
FROM journal_entry_lines jel
JOIN journal_entries je ON jel.journal_entry_id = je.id
JOIN accounts a ON jel.account_id = a.id
WHERE a.id IN (
    SELECT id FROM accounts 
    LEFT JOIN journal_entry_lines jel_sub ON accounts.id = jel_sub.account_id
    GROUP BY accounts.id 
    HAVING (accounts.initial_balance + SUM(jel_sub.debit_amount - jel_sub.credit_amount)) < 0
    AND accounts.type = 'Aset'
    LIMIT 5
)
AND je.status = 'posted' AND je.is_voided = false
ORDER BY je.entry_date DESC
LIMIT 20;
