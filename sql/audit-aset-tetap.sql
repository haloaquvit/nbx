-- ============================================================================
-- AUDIT ASET TETAP - QUERY UNTUK KEDUA DATABASE
-- Jalankan di Nabire (aquvit_new) dan Manokwari (mkw_db)
-- ============================================================================

-- 1. LIHAT SEMUA ASET DAN AKUN YANG TERHUBUNG
SELECT
    'ASET DATA' as section,
    a.asset_name,
    a.asset_code,
    a.category,
    a.purchase_price,
    a.current_value,
    a.account_id,
    acc.code as account_code,
    acc.name as account_name,
    acc.type as account_type,
    acc.is_header
FROM assets a
LEFT JOIN accounts acc ON a.account_id = acc.id
ORDER BY a.category, a.asset_name;

-- 2. LIHAT STRUKTUR AKUN ASET TETAP (14xx)
SELECT
    'COA ASET TETAP' as section,
    code,
    name,
    type,
    is_header,
    balance,
    initial_balance
FROM accounts
WHERE code LIKE '14%' OR code LIKE '1-4%'
ORDER BY code;

-- 3. LIHAT JURNAL TERKAIT ASET TETAP
SELECT
    'JURNAL ASET' as section,
    je.entry_number,
    je.entry_date,
    je.description,
    jel.account_code,
    jel.account_name,
    jel.debit_amount,
    jel.credit_amount,
    je.is_voided
FROM journal_entries je
JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
WHERE jel.account_code LIKE '14%'
   OR jel.account_code LIKE '1-4%'
   OR je.description ILIKE '%aset%'
   OR je.description ILIKE '%kendaraan%'
   OR je.description ILIKE '%peralatan%'
ORDER BY je.entry_date DESC
LIMIT 50;

-- 4. HITUNG SALDO AKUN ASET TETAP DARI JURNAL
SELECT
    'SALDO DARI JURNAL' as section,
    jel.account_code,
    jel.account_name,
    SUM(jel.debit_amount) as total_debit,
    SUM(jel.credit_amount) as total_credit,
    SUM(jel.debit_amount - jel.credit_amount) as net_balance
FROM journal_entry_lines jel
JOIN journal_entries je ON je.id = jel.journal_entry_id
WHERE (jel.account_code LIKE '14%' OR jel.account_code LIKE '1-4%')
  AND je.status = 'posted'
  AND je.is_voided = false
GROUP BY jel.account_code, jel.account_name
ORDER BY jel.account_code;

-- 5. IDENTIFIKASI ASET TANPA JURNAL
SELECT
    'ASET TANPA JURNAL' as section,
    a.id,
    a.asset_name,
    a.category,
    a.purchase_price,
    a.account_id
FROM assets a
WHERE NOT EXISTS (
    SELECT 1 FROM journal_entries je
    WHERE je.reference_id = a.id::text
    AND je.is_voided = false
)
ORDER BY a.purchase_price DESC;

-- 6. TOTAL ASET TETAP DI TABEL ASSETS vs JURNAL
SELECT
    'PERBANDINGAN TOTAL' as section,
    (SELECT SUM(purchase_price) FROM assets WHERE status = 'active') as total_dari_tabel_assets,
    (SELECT SUM(debit_amount - credit_amount)
     FROM journal_entry_lines jel
     JOIN journal_entries je ON je.id = jel.journal_entry_id
     WHERE (jel.account_code LIKE '14%' OR jel.account_code LIKE '1-4%')
       AND jel.account_code NOT LIKE '%30' -- exclude akumulasi
       AND je.status = 'posted'
       AND je.is_voided = false
    ) as total_dari_jurnal;
