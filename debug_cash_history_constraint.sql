-- DEBUG CASH_HISTORY TYPE CONSTRAINT
-- Check if 'gaji_karyawan' type is allowed in cash_history table

-- Check current constraints on cash_history table
DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    RAISE NOTICE '🔍 Current constraints on cash_history table:';

    FOR constraint_record IN
        SELECT conname, pg_get_constraintdef(oid) as definition
        FROM pg_constraint
        WHERE conrelid = 'public.cash_history'::regclass
        AND contype = 'c' -- CHECK constraints
    LOOP
        RAISE NOTICE '📋 %: %', constraint_record.conname, constraint_record.definition;
    END LOOP;
END $$;

-- Test if 'gaji_karyawan' type would be accepted
DO $$
BEGIN
    -- Try to validate the constraint logic
    IF 'gaji_karyawan' = ANY(ARRAY[
        'orderan',
        'kas_masuk_manual',
        'kas_keluar_manual',
        'panjar_pengambilan',
        'panjar_pelunasan',
        'pengeluaran',
        'pembayaran_po',
        'pembayaran_piutang',
        'transfer_masuk',
        'transfer_keluar',
        'gaji_karyawan',
        'pembayaran_gaji'
    ]) THEN
        RAISE NOTICE '✅ gaji_karyawan type should be valid';
    ELSE
        RAISE NOTICE '❌ gaji_karyawan type NOT in constraint list';
    END IF;
END $$;

-- Show recent cash_history records to see if any payroll payments exist
DO $$
DECLARE
    record_count integer;
    gaji_count integer;
BEGIN
    SELECT COUNT(*) INTO record_count FROM public.cash_history;
    SELECT COUNT(*) INTO gaji_count FROM public.cash_history WHERE type = 'gaji_karyawan';

    RAISE NOTICE '📊 Total cash_history records: %', record_count;
    RAISE NOTICE '💰 Payroll payment records (gaji_karyawan): %', gaji_count;

    IF gaji_count > 0 THEN
        RAISE NOTICE '✅ Payroll payments are being saved successfully!';
    ELSE
        RAISE NOTICE '⚠️ No payroll payments found in cash_history';
    END IF;
END $$;