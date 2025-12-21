-- ============================================================================
-- SCRIPT: Fix Pembayaran Hutang yang Tercatat Sebagai Beban
-- ============================================================================
-- Script ini untuk memperbaiki data lama dimana pembayaran PO/hutang
-- dicatat sebagai 'pengeluaran' atau 'expense' biasa padahal seharusnya
-- dicatat sebagai 'pembayaran_po' atau 'pembayaran_hutang'
-- ============================================================================

-- Step 1: Lihat data cash_history yang terkait dengan PO
SELECT 'Data pembayaran terkait PO:' as info;
SELECT
  id,
  type,
  description,
  amount,
  reference_id,
  reference_name,
  created_at
FROM cash_history
WHERE reference_id LIKE 'PO-%'
   OR reference_name LIKE '%PO%'
   OR description LIKE '%PO%'
   OR description LIKE '%Purchase Order%'
ORDER BY created_at DESC
LIMIT 50;

-- Step 2: Lihat berapa banyak yang sudah benar (type = pembayaran_po)
SELECT 'Jumlah record per type:' as info;
SELECT
  type,
  COUNT(*) as count,
  SUM(amount) as total_amount
FROM cash_history
WHERE reference_id LIKE 'PO-%'
   OR reference_name LIKE '%PO%'
   OR description LIKE '%PO%'
   OR description LIKE '%Purchase Order%'
GROUP BY type
ORDER BY count DESC;

-- Step 3: Update record yang masih salah type-nya (PREVIEW - tidak dieksekusi)
-- Uncomment baris di bawah ini untuk menjalankan update
/*
UPDATE cash_history
SET type = 'pembayaran_po'
WHERE (reference_id LIKE 'PO-%'
   OR reference_name LIKE '%PO%'
   OR description LIKE '%Pembayaran PO%')
  AND type != 'pembayaran_po'
  AND type IN ('pengeluaran', 'kas_keluar_manual');
*/

-- Step 4: Cek data accounts_payable yang sudah dibayar
SELECT 'Data Accounts Payable yang sudah dibayar:' as info;
SELECT
  id,
  supplier_name,
  amount,
  paid_amount,
  status,
  purchase_order_id,
  paid_at
FROM accounts_payable
WHERE status = 'Paid' OR paid_amount > 0
ORDER BY paid_at DESC
LIMIT 50;

-- Step 5: Cek data expenses yang terkait dengan PO (seharusnya tidak ada)
SELECT 'Expenses terkait PO (seharusnya kosong):' as info;
SELECT
  id,
  category,
  description,
  amount,
  account_id,
  created_at
FROM expenses
WHERE description LIKE '%PO%'
   OR category LIKE '%PO%'
   OR category = 'Pembayaran PO'
ORDER BY created_at DESC
LIMIT 50;

-- ============================================================================
-- PENTING:
-- Jika ada data expenses yang terkait PO, data tersebut seharusnya:
-- 1. Dipindahkan ke cash_history dengan type = 'pembayaran_po'
-- 2. Dihapus dari tabel expenses
-- 3. Saldo akun Beban harus dikurangi
-- 4. Saldo akun Kewajiban (Hutang) harus dikurangi
-- ============================================================================
