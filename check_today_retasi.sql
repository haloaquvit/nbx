SELECT 
    id,
    retasi_number,
    driver_name,
    total_items,
    returned_items_count,
    error_items_count,
    barang_laku,
    barang_tidak_laku,
    is_returned,
    departure_date
FROM retasi
WHERE departure_date = CURRENT_DATE
ORDER BY created_at DESC
LIMIT 5;
