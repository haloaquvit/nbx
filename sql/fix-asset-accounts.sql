-- ============================================================================
-- FIX ASSET ACCOUNTS - Perbaiki relasi aset ke akun COA yang benar
-- ============================================================================
-- Masalah: Aset equipment masuk ke akun Kendaraan, dan sebaliknya
-- Solusi: Update account_id berdasarkan NAMA akun yang benar
-- ============================================================================

-- 1. Lihat kondisi sebelum fix
SELECT
    'SEBELUM FIX' as status,
    a.asset_name,
    a.category,
    a.purchase_price,
    acc.code as old_code,
    acc.name as old_account_name
FROM assets a
LEFT JOIN accounts acc ON a.account_id = acc.id
ORDER BY a.category;

-- 2. Fix aset VEHICLE (kendaraan) - harus ke akun yang namanya mengandung 'Kendaraan'
UPDATE assets a
SET account_id = (
    SELECT acc.id
    FROM accounts acc
    WHERE acc.branch_id = a.branch_id
      AND acc.is_active = true
      AND acc.is_header = false
      AND (LOWER(acc.name) LIKE '%kendaraan%' OR LOWER(acc.name) LIKE '%vehicle%')
    ORDER BY acc.code
    LIMIT 1
)
WHERE a.category = 'vehicle'
  AND EXISTS (
    SELECT 1 FROM accounts acc
    WHERE acc.branch_id = a.branch_id
      AND (LOWER(acc.name) LIKE '%kendaraan%' OR LOWER(acc.name) LIKE '%vehicle%')
  );

-- 3. Fix aset EQUIPMENT (peralatan/mesin) - harus ke akun yang namanya mengandung 'Peralatan'
UPDATE assets a
SET account_id = (
    SELECT acc.id
    FROM accounts acc
    WHERE acc.branch_id = a.branch_id
      AND acc.is_active = true
      AND acc.is_header = false
      AND (LOWER(acc.name) LIKE '%peralatan%' OR LOWER(acc.name) LIKE '%mesin%' OR LOWER(acc.name) LIKE '%equipment%')
    ORDER BY acc.code
    LIMIT 1
)
WHERE a.category = 'equipment'
  AND EXISTS (
    SELECT 1 FROM accounts acc
    WHERE acc.branch_id = a.branch_id
      AND (LOWER(acc.name) LIKE '%peralatan%' OR LOWER(acc.name) LIKE '%mesin%')
  );

-- 4. Fix aset BUILDING (bangunan)
UPDATE assets a
SET account_id = (
    SELECT acc.id
    FROM accounts acc
    WHERE acc.branch_id = a.branch_id
      AND acc.is_active = true
      AND acc.is_header = false
      AND (LOWER(acc.name) LIKE '%bangunan%' OR LOWER(acc.name) LIKE '%gedung%' OR LOWER(acc.name) LIKE '%building%')
    ORDER BY acc.code
    LIMIT 1
)
WHERE a.category = 'building'
  AND EXISTS (
    SELECT 1 FROM accounts acc
    WHERE acc.branch_id = a.branch_id
      AND (LOWER(acc.name) LIKE '%bangunan%' OR LOWER(acc.name) LIKE '%gedung%')
  );

-- 5. Fix aset OTHER - pastikan tidak pakai header account (1400)
UPDATE assets a
SET account_id = (
    SELECT acc.id
    FROM accounts acc
    WHERE acc.branch_id = a.branch_id
      AND acc.is_active = true
      AND acc.is_header = false
      AND acc.code LIKE '14%'
      AND acc.code != '1400'  -- bukan header
      AND acc.code NOT LIKE '%30' -- bukan akumulasi penyusutan
    ORDER BY acc.code DESC
    LIMIT 1
)
WHERE a.category = 'other'
  AND EXISTS (
    SELECT acc.id FROM accounts acc
    WHERE acc.branch_id = a.branch_id
      AND acc.is_header = false
      AND acc.code LIKE '14%'
  );

-- 6. Lihat kondisi setelah fix
SELECT
    'SETELAH FIX' as status,
    a.asset_name,
    a.category,
    a.purchase_price,
    acc.code as new_code,
    acc.name as new_account_name
FROM assets a
LEFT JOIN accounts acc ON a.account_id = acc.id
ORDER BY a.category;

-- 7. Verifikasi total per akun
SELECT
    acc.code,
    acc.name,
    COUNT(a.id) as jumlah_aset,
    SUM(a.purchase_price) as total_nilai
FROM assets a
JOIN accounts acc ON a.account_id = acc.id
GROUP BY acc.code, acc.name
ORDER BY acc.code;
