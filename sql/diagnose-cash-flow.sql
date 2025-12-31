-- ============================================================================
-- DIAGNOSA ARUS KAS - Cari jurnal yang menyebabkan Penarikan Modal/Prive
-- ============================================================================
-- Jalankan query ini di pgAdmin untuk cabang Air Minum AQUVIT (Manokwari)
-- Branch ID: 13d4e975-d9cb-407b-9d2e-5e33cf8cef64
-- ============================================================================

-- 1. Cari semua akun Kas dan Bank
SELECT id, code, name, type
FROM accounts
WHERE branch_id = '13d4e975-d9cb-407b-9d2e-5e33cf8cef64'
  AND (code LIKE '1-1%' OR code LIKE '11%' OR LOWER(name) LIKE '%kas%' OR LOWER(name) LIKE '%bank%')
  AND is_header = false
ORDER BY code;

-- 2. Cari semua akun Modal (3xxx)
SELECT id, code, name, type
FROM accounts
WHERE branch_id = '13d4e975-d9cb-407b-9d2e-5e33cf8cef64'
  AND code LIKE '3%'
  AND is_header = false
ORDER BY code;

-- 3. Cari jurnal yang melibatkan kas keluar dengan counterpart Modal
-- Ini yang menyebabkan "Penarikan Modal/Prive" di Arus Kas
WITH cash_account_ids AS (
  SELECT id FROM accounts
  WHERE branch_id = '13d4e975-d9cb-407b-9d2e-5e33cf8cef64'
    AND (code LIKE '1-1%' OR code LIKE '11%' OR LOWER(name) LIKE '%kas%' OR LOWER(name) LIKE '%bank%')
    AND is_header = false
),
journal_with_cash AS (
  SELECT DISTINCT je.id, je.entry_number, je.entry_date, je.description, je.reference_type
  FROM journal_entries je
  JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  WHERE je.branch_id = '13d4e975-d9cb-407b-9d2e-5e33cf8cef64'
    AND je.status = 'posted'
    AND je.is_voided = false
    AND je.entry_date >= '2025-12-01' AND je.entry_date <= '2025-12-31'
    AND jel.account_id IN (SELECT id FROM cash_account_ids)
    AND jel.credit_amount > 0 -- Kas keluar
)
SELECT
  jwc.entry_number,
  jwc.entry_date,
  jwc.description,
  jwc.reference_type,
  jel.account_code,
  jel.account_name,
  jel.debit_amount,
  jel.credit_amount
FROM journal_with_cash jwc
JOIN journal_entry_lines jel ON jel.journal_entry_id = jwc.id
ORDER BY jwc.entry_date, jwc.entry_number, jel.debit_amount DESC;

-- 4. Cari jurnal dengan jumlah 250.000.000 (Rp 250 juta)
SELECT
  je.id,
  je.entry_number,
  je.entry_date,
  je.description,
  je.reference_type,
  jel.account_code,
  jel.account_name,
  jel.debit_amount,
  jel.credit_amount
FROM journal_entries je
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
WHERE je.branch_id = '13d4e975-d9cb-407b-9d2e-5e33cf8cef64'
  AND je.status = 'posted'
  AND je.is_voided = false
  AND (jel.debit_amount = 250000000 OR jel.credit_amount = 250000000)
ORDER BY je.entry_date, jel.debit_amount DESC;

-- 5. Hitung total kas keluar yang counterpart-nya Modal
WITH cash_account_ids AS (
  SELECT id FROM accounts
  WHERE branch_id = '13d4e975-d9cb-407b-9d2e-5e33cf8cef64'
    AND (code LIKE '1-1%' OR code LIKE '11%' OR LOWER(name) LIKE '%kas%' OR LOWER(name) LIKE '%bank%')
    AND is_header = false
),
cash_out_to_modal AS (
  SELECT
    je.id as journal_id,
    jel_cash.credit_amount as kas_keluar,
    jel_modal.account_code as modal_code,
    jel_modal.account_name as modal_name
  FROM journal_entries je
  JOIN journal_entry_lines jel_cash ON jel_cash.journal_entry_id = je.id
  JOIN journal_entry_lines jel_modal ON jel_modal.journal_entry_id = je.id
  WHERE je.branch_id = '13d4e975-d9cb-407b-9d2e-5e33cf8cef64'
    AND je.status = 'posted'
    AND je.is_voided = false
    AND je.entry_date >= '2025-12-01' AND je.entry_date <= '2025-12-31'
    AND jel_cash.account_id IN (SELECT id FROM cash_account_ids)
    AND jel_cash.credit_amount > 0
    AND jel_modal.account_code LIKE '3%'
    AND jel_modal.debit_amount > 0
)
SELECT
  SUM(kas_keluar) as total_penarikan_modal,
  COUNT(*) as jumlah_jurnal
FROM cash_out_to_modal;

-- ============================================================================
-- PERBAIKAN: Jika ditemukan jurnal import hutang yang salah, perbaiki dengan:
-- ============================================================================
-- Contoh: Jika ada jurnal import hutang yang salah:
--   Dr. Laba Ditahan (3200)  250.000.000
--      Cr. Kas (1100)                    250.000.000
--
-- Seharusnya (untuk import hutang tanpa kas):
--   Dr. Laba Ditahan (3200)  250.000.000
--      Cr. Hutang Bank (2200)            250.000.000
--
-- Caranya:
-- 1. Void jurnal yang salah (UPDATE journal_entries SET is_voided = true WHERE id = ...)
-- 2. Buat jurnal baru yang benar
-- 3. Atau edit langsung account_id di journal_entry_lines
-- ============================================================================
