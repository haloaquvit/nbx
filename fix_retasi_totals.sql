-- Fix: Update total_items in retasi table based on actual retasi_items
UPDATE retasi r
SET total_items = (
    SELECT COALESCE(SUM(ri.quantity), 0)
    FROM retasi_items ri
    WHERE ri.retasi_id = r.id
)
WHERE r.total_items = 0 OR r.total_items IS NULL;

-- Verify the fix
SELECT 
    r.retasi_number,
    r.driver_name,
    r.total_items as updated_total,
    COUNT(ri.id) as items_count,
    SUM(ri.quantity) as actual_qty
FROM retasi r
LEFT JOIN retasi_items ri ON r.id = ri.retasi_id
WHERE r.departure_date = CURRENT_DATE
GROUP BY r.id, r.retasi_number, r.driver_name, r.total_items
ORDER BY r.created_at DESC;
