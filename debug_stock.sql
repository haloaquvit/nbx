\x off
\echo '--- BRANCHES ---'
SELECT id, name FROM branches WHERE name ILIKE '%AQUVIT%';

\echo '--- PRODUCTS ---'
SELECT id, name FROM products WHERE name ILIKE '%AQUVIT 19 L%';

\x on
\echo '--- VIEW STOCK (FILTERED) ---'
SELECT * FROM v_product_current_stock 
WHERE product_id IN (SELECT id FROM products WHERE name ILIKE '%AQUVIT 19 L%');

\echo '--- INVENTORY BATCHES ---'
SELECT id, branch_id, remaining_quantity, batch_date 
FROM inventory_batches 
WHERE product_id IN (SELECT id FROM products WHERE name ILIKE '%AQUVIT 19 L%') 
AND remaining_quantity > 0;
