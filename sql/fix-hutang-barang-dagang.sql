-- =============================================================================
-- SCRIPT FIX DATA HISTORIS: HUTANG BARANG DAGANG
-- =============================================================================
--
-- Logika:
-- Hutang Barang Dagang = Total HPP dari barang yang BELUM diantar
--
-- Cross-check:
-- Saldo Hutang Barang Dagang (2140) harus = SUM(HPP belum diantar semua transaksi)
--
-- Jalankan script ini untuk memperbaiki data transaksi historis
-- =============================================================================

-- Step 1: Cek akun Hutang Barang Dagang (2140) exists
SELECT id, code, name, type FROM accounts WHERE code = '2140';

-- =============================================================================
-- Step 2: Query untuk cek transaksi yang belum selesai diantar
-- =============================================================================
WITH transaction_delivery_summary AS (
  SELECT
    t.id AS transaction_id,
    t.transaction_number,
    t.customer_name,
    t.order_date,
    t.is_office_sale,
    t.status,
    t.items,
    t.branch_id,
    -- Calculate total ordered from transaction items (excluding bonus)
    COALESCE(
      (SELECT SUM((item->>'quantity')::numeric)
       FROM jsonb_array_elements(t.items) AS item
       WHERE (item->>'_isSalesMeta')::boolean IS NOT TRUE
         AND (item->>'isBonus')::boolean IS NOT TRUE
      ), 0
    ) AS total_ordered,
    -- Calculate total delivered
    COALESCE(
      (SELECT SUM(di.quantity_delivered)
       FROM deliveries d
       JOIN delivery_items di ON di.delivery_id = d.id
       WHERE d.transaction_id = t.id
      ), 0
    ) AS total_delivered
  FROM transactions t
  WHERE t.is_office_sale = false  -- Hanya transaksi non-office sale
    AND t.status NOT IN ('Dibatalkan', 'Cancelled')
)
SELECT
  transaction_id,
  transaction_number,
  customer_name,
  order_date,
  status,
  total_ordered,
  total_delivered,
  (total_ordered - total_delivered) AS remaining_qty,
  CASE
    WHEN total_ordered = total_delivered THEN 'Selesai'
    WHEN total_delivered > 0 THEN 'Diantar Sebagian'
    ELSE 'Belum Diantar'
  END AS delivery_status
FROM transaction_delivery_summary
WHERE total_ordered > total_delivered
ORDER BY order_date DESC;

-- =============================================================================
-- Step 3: Calculate total HPP untuk barang yang belum diantar
-- =============================================================================
WITH undelivered_items AS (
  SELECT
    t.id AS transaction_id,
    t.transaction_number,
    t.branch_id,
    item->>'product'->>'id' AS product_id,
    item->>'product'->>'name' AS product_name,
    (item->>'quantity')::numeric AS ordered_qty,
    (item->>'hpp')::numeric AS item_hpp,
    -- Get delivered quantity for this specific product
    COALESCE(
      (SELECT SUM(di.quantity_delivered)
       FROM deliveries d
       JOIN delivery_items di ON di.delivery_id = d.id
       WHERE d.transaction_id = t.id
         AND di.product_id = (item->'product'->>'id')::uuid
      ), 0
    ) AS delivered_qty
  FROM transactions t,
       jsonb_array_elements(t.items) AS item
  WHERE t.is_office_sale = false
    AND t.status NOT IN ('Dibatalkan', 'Cancelled')
    AND (item->>'_isSalesMeta')::boolean IS NOT TRUE
    AND (item->>'isBonus')::boolean IS NOT TRUE
)
SELECT
  transaction_id,
  transaction_number,
  product_name,
  ordered_qty,
  delivered_qty,
  (ordered_qty - delivered_qty) AS remaining_qty,
  item_hpp,
  CASE
    WHEN ordered_qty > 0 THEN (item_hpp / ordered_qty)
    ELSE 0
  END AS hpp_per_unit,
  CASE
    WHEN ordered_qty > 0 THEN ((ordered_qty - delivered_qty) * (item_hpp / ordered_qty))
    ELSE 0
  END AS undelivered_hpp
FROM undelivered_items
WHERE ordered_qty > delivered_qty
ORDER BY transaction_id, product_name;

-- =============================================================================
-- Step 4: TOTAL Hutang Barang Dagang yang seharusnya
-- =============================================================================
WITH undelivered_hpp AS (
  SELECT
    t.branch_id,
    SUM(
      CASE
        WHEN (item->>'quantity')::numeric > 0
        THEN (
          ((item->>'quantity')::numeric - COALESCE(
            (SELECT SUM(di.quantity_delivered)
             FROM deliveries d
             JOIN delivery_items di ON di.delivery_id = d.id
             WHERE d.transaction_id = t.id
               AND di.product_id = (item->'product'->>'id')::uuid
            ), 0
          )) * ((item->>'hpp')::numeric / (item->>'quantity')::numeric)
        )
        ELSE 0
      END
    ) AS total_undelivered_hpp
  FROM transactions t,
       jsonb_array_elements(t.items) AS item
  WHERE t.is_office_sale = false
    AND t.status NOT IN ('Dibatalkan', 'Cancelled')
    AND (item->>'_isSalesMeta')::boolean IS NOT TRUE
    AND (item->>'isBonus')::boolean IS NOT TRUE
    AND (item->>'quantity')::numeric > COALESCE(
      (SELECT SUM(di.quantity_delivered)
       FROM deliveries d
       JOIN delivery_items di ON di.delivery_id = d.id
       WHERE d.transaction_id = t.id
         AND di.product_id = (item->'product'->>'id')::uuid
      ), 0
    )
  GROUP BY t.branch_id
)
SELECT
  branch_id,
  total_undelivered_hpp AS "Hutang Barang Dagang Seharusnya"
FROM undelivered_hpp;

-- =============================================================================
-- Step 5: Cek saldo Hutang Barang Dagang saat ini (dari jurnal)
-- =============================================================================
SELECT
  a.branch_id,
  a.code,
  a.name,
  SUM(COALESCE(jel.credit_amount, 0) - COALESCE(jel.debit_amount, 0)) AS saldo_hutang_barang_dagang
FROM accounts a
LEFT JOIN journal_entry_lines jel ON jel.account_id = a.id
LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id
  AND je.status = 'posted'
  AND je.is_voided = false
WHERE a.code = '2140'
GROUP BY a.branch_id, a.code, a.name;

-- =============================================================================
-- CATATAN PENTING:
-- =============================================================================
--
-- Untuk transaksi BARU, sistem sudah benar:
-- 1. Saat transaksi non-office sale: Cr. Hutang Barang Dagang
-- 2. Saat pengantaran: Dr. Hutang Barang Dagang, Cr. Persediaan
--
-- Untuk data LAMA, ada 2 opsi:
--
-- OPSI A: Buat jurnal adjustment sekali saja
-- - Hitung selisih antara yang seharusnya vs saldo saat ini
-- - Buat jurnal manual: Dr. HPP, Cr. Hutang Barang Dagang
--
-- OPSI B: Void jurnal lama dan generate ulang
-- - Lebih bersih tapi lebih kompleks
-- - Perlu void semua jurnal transaksi lama
-- - Generate ulang dengan logika baru
--
-- Rekomendasi: Gunakan OPSI A karena lebih simple dan tidak mengganggu data historis
-- =============================================================================

-- =============================================================================
-- OPSI A: Query untuk membuat jurnal adjustment
-- =============================================================================
-- Jalankan query di Step 4 dan Step 5 untuk mendapatkan selisih
-- Kemudian buat jurnal adjustment secara manual di aplikasi:
--
-- Jika saldo Hutang Barang Dagang KURANG dari yang seharusnya:
-- Dr. HPP (5100)                     xxx (selisih)
--   Cr. Hutang Barang Dagang (2140)       xxx
--
-- Jika saldo Hutang Barang Dagang LEBIH dari yang seharusnya:
-- Dr. Hutang Barang Dagang (2140)    xxx (selisih)
--   Cr. HPP (5100)                        xxx
-- =============================================================================
