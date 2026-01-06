
\echo '=== CHECKING PRODUCTION BATCHES ==='
SELECT COUNT(*) as total_production, SUM(quantity) as total_qty 
FROM production_batches;

\echo '=== CHECKING PRODUCTION RPC STATUS ==='
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name LIKE '%production%' 
AND routine_type='FUNCTION' 
AND routine_schema='public';
