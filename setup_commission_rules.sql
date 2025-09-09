-- Setup commission rules for existing products
-- This script will add commission rules for all existing products

-- First, let's add commission rules for sales role (1000 per item as example)
INSERT INTO commission_rules (product_id, role, rate_per_qty)
SELECT 
  p.id as product_id,
  'sales' as role,
  1000 as rate_per_qty  -- 1000 rupiah per item for sales
FROM products p
WHERE NOT EXISTS (
  SELECT 1 FROM commission_rules cr 
  WHERE cr.product_id = p.id AND cr.role = 'sales'
)
ON CONFLICT (product_id, role) DO NOTHING;

-- Add commission rules for driver role (500 per item as example)
INSERT INTO commission_rules (product_id, role, rate_per_qty)
SELECT 
  p.id as product_id,
  'driver' as role,  -- Using 'driver' to match database constraint
  500 as rate_per_qty  -- 500 rupiah per item for driver
FROM products p
WHERE NOT EXISTS (
  SELECT 1 FROM commission_rules cr 
  WHERE cr.product_id = p.id AND cr.role = 'driver'
)
ON CONFLICT (product_id, role) DO NOTHING;

-- Add commission rules for helper role (300 per item as example)
INSERT INTO commission_rules (product_id, role, rate_per_qty)
SELECT 
  p.id as product_id,
  'helper' as role,
  300 as rate_per_qty  -- 300 rupiah per item for helper
FROM products p
WHERE NOT EXISTS (
  SELECT 1 FROM commission_rules cr 
  WHERE cr.product_id = p.id AND cr.role = 'helper'
)
ON CONFLICT (product_id, role) DO NOTHING;

-- Display the created rules
SELECT 
  cr.product_id,
  cr.product_name,
  cr.role,
  cr.rate_per_qty,
  cr.created_at
FROM commission_rules cr
ORDER BY cr.product_name, cr.role;