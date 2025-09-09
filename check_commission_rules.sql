-- Check existing commission rules
SELECT 
  role,
  product_name,
  rate_per_qty,
  created_at
FROM commission_rules 
WHERE role IN ('driver', 'helper', 'supir')
ORDER BY role, product_name;

-- Check all commission rules
SELECT 
  role,
  count(*) as rule_count
FROM commission_rules 
GROUP BY role
ORDER BY role;

-- Check total commission rules
SELECT count(*) as total_rules FROM commission_rules;