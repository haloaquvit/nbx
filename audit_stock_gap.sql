
WITH 
-- 1. Hitung Total Delivered per Produk per Cabang
delivered_data AS (
  SELECT 
    d.branch_id,
    b.name as branch_name,
    di.product_id,
    p.name as product_name,
    SUM(di.quantity_delivered) as total_delivered
  FROM delivery_items di
  JOIN deliveries d ON d.id = di.delivery_id
  JOIN products p ON p.id = di.product_id
  JOIN branches b ON b.id = d.branch_id
  WHERE d.status = 'delivered'
  GROUP BY d.branch_id, b.name, di.product_id, p.name
),
-- 2. Hitung Total yang Tercatat Sistem (In - Remaining)
system_usage AS (
  SELECT 
    branch_id,
    product_id,
    SUM(initial_quantity) - SUM(remaining_quantity) as total_system_usage,
    SUM(remaining_quantity) as current_system_stock
  FROM inventory_batches
  GROUP BY branch_id, product_id
)
-- 3. Gabungkan dan Cari Selisih
SELECT 
  dd.branch_name,
  dd.product_name,
  dd.total_delivered as "Fisik Keluar (Delivery)",
  COALESCE(su.total_system_usage, 0) as "Sistem Catat (Usage)",
  COALESCE(su.total_system_usage, 0) - dd.total_delivered as "Selisih (System - Fisik)",
  CASE 
    WHEN (COALESCE(su.total_system_usage, 0) - dd.total_delivered) < 0 THEN 'KURANG POTONG (Bahaya)'
    WHEN (COALESCE(su.total_system_usage, 0) - dd.total_delivered) > 0 THEN 'LEBIH POTONG (Aman?)'
    ELSE 'MATCH'
  END as "Status",
  COALESCE(su.current_system_stock, 0) as "Stok Sistem Skrg"
FROM delivered_data dd
LEFT JOIN system_usage su ON su.branch_id = dd.branch_id AND su.product_id = dd.product_id
ORDER BY dd.branch_name, dd.product_name;
