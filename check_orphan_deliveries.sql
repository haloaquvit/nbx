-- Cek delivery yang tidak memiliki transaksi (orphan)
-- Ini terjadi jika transaksi dihapus tapi delivery tidak terhapus

SELECT 
    'ORPHAN DELIVERIES' as check_type,
    COUNT(*) as count,
    'Deliveries tanpa transaksi terkait' as description
FROM deliveries d
LEFT JOIN transactions t ON d.transaction_id = t.id
WHERE t.id IS NULL;

-- Detail delivery orphan
SELECT 
    'DELIVERY DETAILS' as check_type,
    d.id,
    d.transaction_id,
    d.delivery_number,
    d.status as delivery_status,
    d.customer_name,
    d.delivery_date,
    t.id as transaction_exists,
    t.status as transaction_status
FROM deliveries d
LEFT JOIN transactions t ON d.transaction_id = t.id
WHERE t.id IS NULL
ORDER BY d.delivery_date DESC;

-- Cek delivery_items yang orphan
SELECT 
    'ORPHAN DELIVERY ITEMS' as check_type,
    COUNT(*) as count,
    'Delivery items tanpa delivery terkait' as description
FROM delivery_items di
LEFT JOIN deliveries d ON di.delivery_id = d.id
WHERE d.id IS NULL;

-- Cek komisi delivery yang orphan
SELECT 
    'ORPHAN DELIVERY COMMISSIONS' as check_type,
    COUNT(*) as count,
    'Commission entries delivery tanpa delivery terkait' as description
FROM commission_entries ce
LEFT JOIN deliveries d ON ce.delivery_id = d.id
WHERE ce.delivery_id IS NOT NULL AND d.id IS NULL;
