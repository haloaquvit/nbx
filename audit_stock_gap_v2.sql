
WITH 
-- 1. Hitung Total Delivered (Surat Jalan)
delivered_data AS (
  SELECT 
    d.branch_id,
    di.product_id,
    SUM(di.quantity_delivered) as total_delivered
  FROM delivery_items di
  JOIN deliveries d ON d.id = di.delivery_id
  WHERE d.status = 'delivered'
  GROUP BY d.branch_id, di.product_id
),
-- 2. Hitung Direct Sales (Laku Kantor / Langsung Bawa)
-- Asumsi: Transaksi 'is_office_sale' = TRUE dianggap barang sudah keluar fisik saat transaksi
office_sales AS (
  SELECT 
    t.branch_id,
    p.id as product_id,
    SUM((item->>'quantity')::NUMERIC) as total_direct
  FROM transactions t,
       jsonb_array_elements(t.items) item
  JOIN products p ON p.id::TEXT = (item->>'product_id') OR p.id::TEXT = (item->>'productId')
  WHERE t.status != 'Batal' 
    AND t.is_office_sale = TRUE
  GROUP BY t.branch_id, p.id
),
-- 3. Hitung Total yang Tercatat Sistem (In - Remaining)
system_usage AS (
  SELECT 
    branch_id,
    product_id,
    SUM(initial_quantity) - SUM(remaining_quantity) as total_system_usage,
    SUM(remaining_quantity) as current_system_stock
  FROM inventory_batches
  GROUP BY branch_id, product_id
),
-- 4. Master Product List per Branch
branch_products AS (
  SELECT DISTINCT branch_id, product_id FROM delivered_data
  UNION
  SELECT DISTINCT branch_id, product_id FROM office_sales
  UNION
  SELECT DISTINCT branch_id, product_id FROM system_usage
)

-- 5. Final Calculation
SELECT 
  b.name as branch_name,
  p.name as product_name,
  COALESCE(dd.total_delivered, 0) as "Delivery (Antar)",
  COALESCE(os.total_direct, 0) as "Office (Langsung)",
  (COALESCE(dd.total_delivered, 0) + COALESCE(os.total_direct, 0)) as "Total Fisik Keluar",
  COALESCE(su.total_system_usage, 0) as "Sistem Catat (Usage)",
  COALESCE(su.total_system_usage, 0) - (COALESCE(dd.total_delivered, 0) + COALESCE(os.total_direct, 0)) as "Selisih (System - Fisik)",
  CASE 
    WHEN (COALESCE(su.total_system_usage, 0) - (COALESCE(dd.total_delivered, 0) + COALESCE(os.total_direct, 0))) < -0.1 THEN 'KURANG POTONG (Bahaya)'
    WHEN (COALESCE(su.total_system_usage, 0) - (COALESCE(dd.total_delivered, 0) + COALESCE(os.total_direct, 0))) > 0.1 THEN 'LEBIH POTONG (Aneh)'
    ELSE 'MATCH'
  END as "Status",
  COALESCE(su.current_system_stock, 0) as "Stok Sistem Skrg"
FROM branch_products bp
JOIN products p ON p.id = bp.product_id
JOIN branches b ON b.id = bp.branch_id
LEFT JOIN delivered_data dd ON dd.branch_id = bp.branch_id AND dd.product_id = bp.product_id
LEFT JOIN office_sales os ON os.branch_id = bp.branch_id AND os.product_id = bp.product_id
LEFT JOIN system_usage su ON su.branch_id = bp.branch_id AND su.product_id = bp.product_id
WHERE (COALESCE(dd.total_delivered, 0) + COALESCE(os.total_direct, 0)) > 0 -- Hanya tampilkan yang ada pergerakan
ORDER BY b.name, p.name;
