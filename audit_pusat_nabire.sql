
WITH 
-- 1. Get Branch ID
branch_pusat AS (
  SELECT id FROM branches WHERE id = '00000000-0000-0000-0000-000000000001'
),
-- 2. Sales Data (Direct Sales from Transactions)
sales_data AS (
  SELECT 
    p.name as product_name,
    SUM((item->>'quantity')::NUMERIC) as total_sold
  FROM transactions t,
       branch_pusat bp,
       jsonb_array_elements(t.items) item
  JOIN products p ON p.id::TEXT = (item->>'product_id')::TEXT OR p.id::TEXT = (item->>'productId')::TEXT
  WHERE t.branch_id = bp.id 
    AND t.status != 'Batal'
  GROUP BY p.name
),
-- 3. Stock Usage Data (Inventory Batches)
stock_usage AS (
  SELECT 
    p.name as product_name,
    SUM(ib.initial_quantity) - SUM(ib.remaining_quantity) as total_usage_system,
    SUM(ib.remaining_quantity) as current_stock
  FROM inventory_batches ib
  JOIN products p ON p.id = ib.product_id
  JOIN branch_pusat bp ON bp.id = ib.branch_id
  GROUP BY p.name
)
-- 4. Final Comparison
SELECT 
  COALESCE(sd.product_name, su.product_name) as "Nama Produk",
  COALESCE(sd.total_sold, 0) as "Terjual (Trx)",
  COALESCE(su.total_usage_system, 0) as "Tercatat Sistem",
  (COALESCE(su.total_usage_system, 0) - COALESCE(sd.total_sold, 0)) as "Selisih",
  COALESCE(su.current_stock, 0) as "Sisa Stok Fisik"
FROM sales_data sd
FULL OUTER JOIN stock_usage su ON su.product_name = sd.product_name
ORDER BY "Nama Produk";
