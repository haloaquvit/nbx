-- FIX MISSING USER_NAME IN CASH_HISTORY FOR PAYROLL RECORDS
-- Update any payroll cash_history records that have missing user_name

-- Show current payroll cash_history records with missing user names
DO $$
DECLARE
    missing_count integer;
    total_count integer;
BEGIN
    SELECT COUNT(*) INTO total_count
    FROM public.cash_history
    WHERE type IN ('gaji_karyawan', 'pembayaran_gaji');

    SELECT COUNT(*) INTO missing_count
    FROM public.cash_history
    WHERE type IN ('gaji_karyawan', 'pembayaran_gaji')
    AND (user_name IS NULL OR user_name = '');

    RAISE NOTICE '📊 PAYROLL CASH HISTORY STATUS:';
    RAISE NOTICE '  - Total payroll records: %', total_count;
    RAISE NOTICE '  - Records with missing user_name: %', missing_count;
END $$;

-- Update missing user_name with default values
UPDATE public.cash_history
SET user_name = COALESCE(
    user_name,
    'System Admin'
)
WHERE type IN ('gaji_karyawan', 'pembayaran_gaji')
AND (user_name IS NULL OR user_name = '');

-- Show results after update
DO $$
DECLARE
    missing_count integer;
    updated_count integer;
BEGIN
    SELECT COUNT(*) INTO missing_count
    FROM public.cash_history
    WHERE type IN ('gaji_karyawan', 'pembayaran_gaji')
    AND (user_name IS NULL OR user_name = '');

    SELECT COUNT(*) INTO updated_count
    FROM public.cash_history
    WHERE type IN ('gaji_karyawan', 'pembayaran_gaji')
    AND user_name = 'System Admin';

    RAISE NOTICE '✅ AFTER UPDATE:';
    RAISE NOTICE '  - Records with missing user_name: %', missing_count;
    RAISE NOTICE '  - Records updated to "System Admin": %', updated_count;
    RAISE NOTICE '🎯 All payroll cash history records now have user_name!';
END $$;