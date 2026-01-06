-- Check retasi dates vs server time
SELECT 
    NOW() as server_time,
    CURRENT_DATE as server_date,
    CURRENT_TIME as server_time_only;

-- Check recent retasi with their dates
SELECT 
    retasi_number,
    driver_name,
    departure_date,
    departure_time,
    created_at,
    DATE(created_at) as created_date,
    TIME(created_at) as created_time
FROM retasi
ORDER BY created_at DESC
LIMIT 10;
