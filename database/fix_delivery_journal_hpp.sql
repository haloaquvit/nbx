-- ============================================================================
-- SCRIPT KOREKSI JURNAL PENGANTARAN - HPP SALAH (base_price vs cost_price)
-- ============================================================================
-- Branch: Es Kristal Aquvit (AEK) - e99e62f9-9ab6-4a61-ae64-0710fb081337
-- Database: mkw_db
--
-- MASALAH:
-- Jurnal pengantaran mencatat HPP menggunakan base_price (harga jual)
-- bukan cost_price (HPP) karena cost_price awalnya 0/null
--
-- SOLUSI:
-- Hapus jurnal yang salah dan buat ulang dengan HPP yang benar
-- ============================================================================

-- Variable untuk branch_id
\set branch_id 'e99e62f9-9ab6-4a61-ae64-0710fb081337'

BEGIN;

-- ============================================================================
-- STEP 1: Identifikasi jurnal yang perlu dikoreksi
-- ============================================================================
CREATE TEMP TABLE journals_to_fix AS
WITH delivery_hpp_analysis AS (
  SELECT
    je.id as journal_id,
    je.entry_number,
    je.description,
    je.reference_id as delivery_id,
    je.entry_date,
    jel.credit_amount as hpp_jurnal,
    SUM(di.quantity_delivered * p.cost_price) as hpp_seharusnya
  FROM journal_entries je
  JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
  JOIN deliveries d ON je.reference_id = d.id::text
  JOIN delivery_items di ON d.id = di.delivery_id
  JOIN products p ON di.product_id = p.id
  WHERE je.branch_id = :'branch_id'::uuid
    AND je.is_voided = false
    AND je.description LIKE 'Pengantaran%'
    AND jel.account_code = '1310'
  GROUP BY je.id, je.entry_number, je.description, je.reference_id, je.entry_date, jel.credit_amount
)
SELECT
  journal_id,
  entry_number,
  description,
  delivery_id,
  entry_date,
  hpp_jurnal,
  hpp_seharusnya,
  (hpp_jurnal - hpp_seharusnya) as selisih
FROM delivery_hpp_analysis
WHERE hpp_jurnal != hpp_seharusnya;

-- Tampilkan jurnal yang akan dikoreksi
SELECT
  entry_number,
  SUBSTRING(description, 1, 50) as deskripsi,
  hpp_jurnal as "HPP Salah",
  hpp_seharusnya as "HPP Benar",
  selisih as "Selisih"
FROM journals_to_fix
ORDER BY selisih DESC;

-- ============================================================================
-- STEP 2: Dapatkan account IDs
-- ============================================================================
CREATE TEMP TABLE account_ids AS
SELECT
  (SELECT id FROM accounts WHERE branch_id = :'branch_id'::uuid AND code = '1310' LIMIT 1) as persediaan_id,
  (SELECT id FROM accounts WHERE branch_id = :'branch_id'::uuid AND code = '2140' LIMIT 1) as hutang_bd_id;

-- Verifikasi account IDs
SELECT * FROM account_ids;

-- ============================================================================
-- STEP 3: Hapus journal_entry_lines yang salah
-- ============================================================================
DELETE FROM journal_entry_lines
WHERE journal_entry_id IN (SELECT journal_id FROM journals_to_fix);

-- ============================================================================
-- STEP 4: Buat journal_entry_lines baru dengan HPP yang benar
-- ============================================================================

-- Insert Debit ke Hutang Barang Dagang (2140)
INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, account_code, account_name, debit_amount, credit_amount, description)
SELECT
  j.journal_id,
  1,
  a.hutang_bd_id,
  '2140',
  'Modal Barang Dagang Tertahan',
  j.hpp_seharusnya,
  0,
  'Kewajiban kirim barang terpenuhi'
FROM journals_to_fix j
CROSS JOIN account_ids a;

-- Insert Credit ke Persediaan Barang Dagang (1310)
INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, account_code, account_name, debit_amount, credit_amount, description)
SELECT
  j.journal_id,
  2,
  a.persediaan_id,
  '1310',
  'Persediaan Barang Dagang',
  0,
  j.hpp_seharusnya,
  'Pengurangan persediaan barang diantar'
FROM journals_to_fix j
CROSS JOIN account_ids a;

-- ============================================================================
-- STEP 5: Update total_debit dan total_credit di journal_entries
-- ============================================================================
UPDATE journal_entries je
SET
  total_debit = j.hpp_seharusnya,
  total_credit = j.hpp_seharusnya
FROM journals_to_fix j
WHERE je.id = j.journal_id;

-- ============================================================================
-- STEP 6: Verifikasi hasil koreksi
-- ============================================================================
SELECT
  '=== HASIL KOREKSI ===' as info;

-- Cek saldo akun setelah koreksi
SELECT
  a.code,
  a.name,
  SUM(jel.debit_amount) as total_debit,
  SUM(jel.credit_amount) as total_credit,
  CASE
    WHEN a.type IN ('Aset', 'Beban') THEN SUM(jel.debit_amount) - SUM(jel.credit_amount)
    ELSE SUM(jel.credit_amount) - SUM(jel.debit_amount)
  END as saldo_baru
FROM journal_entries je
JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
JOIN accounts a ON jel.account_id = a.id
WHERE je.branch_id = :'branch_id'::uuid
  AND je.is_voided = false
  AND (a.code IN ('1310', '2140'))
GROUP BY a.code, a.name, a.type
ORDER BY a.code;

-- Ringkasan koreksi
SELECT
  COUNT(*) as jumlah_jurnal_dikoreksi,
  SUM(selisih) as total_selisih_dikoreksi
FROM journals_to_fix;

-- ============================================================================
-- COMMIT jika semua OK, atau ROLLBACK jika ada masalah
-- ============================================================================
-- Uncomment salah satu:
COMMIT;
-- ROLLBACK;

-- Cleanup
DROP TABLE IF EXISTS journals_to_fix;
DROP TABLE IF EXISTS account_ids;
