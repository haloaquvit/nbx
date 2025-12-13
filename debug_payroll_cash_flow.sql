-- DEBUG PAYROLL CASH FLOW INTEGRATION
-- Check if payroll payments are recorded in cash_history and affect account balances

-- 1. Check if cash_history has payroll records
DO $$
DECLARE
    cash_history_count integer;
    payroll_records_count integer;
BEGIN
    RAISE NOTICE '🔍 DEBUGGING PAYROLL CASH FLOW INTEGRATION';
    RAISE NOTICE '================================================';

    -- Count cash history records for payroll
    SELECT COUNT(*) INTO cash_history_count
    FROM public.cash_history
    WHERE type IN ('gaji_karyawan', 'pembayaran_gaji');

    -- Count paid payroll records
    SELECT COUNT(*) INTO payroll_records_count
    FROM public.payroll_records
    WHERE status = 'paid';

    RAISE NOTICE '📊 RECORD COUNTS:';
    RAISE NOTICE '  - Cash history (payroll): %', cash_history_count;
    RAISE NOTICE '  - Paid payroll records: %', payroll_records_count;

    IF cash_history_count = 0 THEN
        RAISE NOTICE '❌ NO PAYROLL CASH HISTORY FOUND!';
    ELSE
        RAISE NOTICE '✅ Payroll cash history records exist';
    END IF;
END $$;

-- 2. Show sample payroll cash_history records
DO $$
DECLARE
    sample_record RECORD;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '📋 SAMPLE PAYROLL CASH HISTORY RECORDS:';
    RAISE NOTICE '=====================================';

    FOR sample_record IN
        SELECT
            id,
            account_id,
            account_name,
            type,
            amount,
            description,
            user_name,
            created_at
        FROM public.cash_history
        WHERE type IN ('gaji_karyawan', 'pembayaran_gaji')
        ORDER BY created_at DESC
        LIMIT 3
    LOOP
        RAISE NOTICE '💰 Record ID: %', sample_record.id;
        RAISE NOTICE '  - Account: % (%)', sample_record.account_name, sample_record.account_id;
        RAISE NOTICE '  - Type: %', sample_record.type;
        RAISE NOTICE '  - Amount: %', sample_record.amount;
        RAISE NOTICE '  - Description: %', sample_record.description;
        RAISE NOTICE '  - User: %', sample_record.user_name;
        RAISE NOTICE '  - Created: %', sample_record.created_at;
        RAISE NOTICE '  ---';
    END LOOP;
END $$;

-- 3. Check if update_account_balance function exists
DO $$
DECLARE
    function_exists boolean;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🔧 CHECKING UPDATE_ACCOUNT_BALANCE FUNCTION:';
    RAISE NOTICE '============================================';

    SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.proname = 'update_account_balance'
    ) INTO function_exists;

    IF function_exists THEN
        RAISE NOTICE '✅ update_account_balance function EXISTS';
    ELSE
        RAISE NOTICE '❌ update_account_balance function MISSING!';
        RAISE NOTICE '💡 Need to run: create_update_account_balance_function.sql';
    END IF;
END $$;

-- 4. Show account balances for accounts used in payroll
DO $$
DECLARE
    account_record RECORD;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '💰 ACCOUNT BALANCES (used in payroll):';
    RAISE NOTICE '====================================';

    FOR account_record IN
        SELECT DISTINCT
            a.id,
            a.name,
            a.balance,
            ch.created_at as last_payroll
        FROM public.accounts a
        JOIN public.cash_history ch ON ch.account_id = a.id
        WHERE ch.type IN ('gaji_karyawan', 'pembayaran_gaji')
        ORDER BY ch.created_at DESC
    LOOP
        RAISE NOTICE '🏦 Account: % (%)', account_record.name, account_record.id;
        RAISE NOTICE '  - Current Balance: %', account_record.balance;
        RAISE NOTICE '  - Last Payroll: %', account_record.last_payroll;
        RAISE NOTICE '  ---';
    END LOOP;
END $$;

-- 5. Final summary
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🎯 SUMMARY & RECOMMENDATIONS:';
    RAISE NOTICE '=============================';
    RAISE NOTICE '1. Check if cash_history records exist ✓';
    RAISE NOTICE '2. Check if update_account_balance function exists ✓';
    RAISE NOTICE '3. Verify account balance changes ✓';
    RAISE NOTICE '';
    RAISE NOTICE '💡 If function is missing, run:';
    RAISE NOTICE '   create_update_account_balance_function.sql';
END $$;