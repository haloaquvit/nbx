-- Check recent retasi with their dates
SELECT 
    retasi_number,
    driver_name,
    departure_date,
    departure_time,
    created_at,
    DATE(created_at AT TIME ZONE 'Asia/Jayapura') as created_date_local
FROM retasi
ORDER BY created_at DESC
LIMIT 10;
