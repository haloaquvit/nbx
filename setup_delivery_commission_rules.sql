-- Setup commission rules untuk semua role: sales, driver, dan helper

-- Tambah commission rules untuk sales (1000 rupiah per item)
INSERT INTO commission_rules (product_id, product_name, role, rate_per_qty)
SELECT 
  p.id as product_id,
  p.name as product_name,
  'sales' as role,
  1000 as rate_per_qty
FROM products p
WHERE p.type = 'Stock'
ON CONFLICT (product_id, role) DO UPDATE SET
  product_name = EXCLUDED.product_name,
  rate_per_qty = EXCLUDED.rate_per_qty;

-- Tambah commission rules untuk driver (500 rupiah per item)
INSERT INTO commission_rules (product_id, product_name, role, rate_per_qty)
SELECT 
  p.id as product_id,
  p.name as product_name,
  'driver' as role,
  500 as rate_per_qty
FROM products p
WHERE p.type = 'Stock'
ON CONFLICT (product_id, role) DO UPDATE SET
  product_name = EXCLUDED.product_name,
  rate_per_qty = EXCLUDED.rate_per_qty;

-- Tambah commission rules untuk helper (300 rupiah per item)
INSERT INTO commission_rules (product_id, product_name, role, rate_per_qty)
SELECT 
  p.id as product_id,
  p.name as product_name,
  'helper' as role,
  300 as rate_per_qty
FROM products p
WHERE p.type = 'Stock'
ON CONFLICT (product_id, role) DO UPDATE SET
  product_name = EXCLUDED.product_name,
  rate_per_qty = EXCLUDED.rate_per_qty;

-- Lihat hasil setup
SELECT 
  role,
  count(*) as total_rules,
  min(rate_per_qty) as min_rate,
  max(rate_per_qty) as max_rate
FROM commission_rules 
WHERE role IN ('sales', 'driver', 'helper')
GROUP BY role
ORDER BY role;