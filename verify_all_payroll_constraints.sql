-- VERIFY ALL PAYROLL CONSTRAINTS AND TABLES
-- Comprehensive check to ensure all payroll components work correctly

-- 1. Check cash_history table structure and constraints
DO $$
DECLARE
    constraint_record RECORD;
    column_count integer;
BEGIN
    RAISE NOTICE '🔍 VERIFYING CASH_HISTORY TABLE';
    RAISE NOTICE '===============================';

    -- Check table exists
    SELECT COUNT(*) INTO column_count
    FROM information_schema.columns
    WHERE table_name = 'cash_history' AND table_schema = 'public';

    RAISE NOTICE '📋 Cash_history table has % columns', column_count;

    -- Check constraints
    FOR constraint_record IN
        SELECT conname, pg_get_constraintdef(oid) as definition
        FROM pg_constraint
        WHERE conrelid = 'public.cash_history'::regclass
        AND contype = 'c' -- CHECK constraints
    LOOP
        RAISE NOTICE '✅ Constraint: %', constraint_record.conname;
        IF constraint_record.conname LIKE '%type%' THEN
            RAISE NOTICE '   Definition: %', constraint_record.definition;

            -- Check if gaji_karyawan is included
            IF constraint_record.definition LIKE '%gaji_karyawan%' THEN
                RAISE NOTICE '   ✅ gaji_karyawan type is allowed';
            ELSE
                RAISE NOTICE '   ❌ gaji_karyawan type is MISSING!';
            END IF;
        END IF;
    END LOOP;
END $$;

-- 2. Check advance_repayments table for notes column
DO $$
DECLARE
    notes_exists boolean;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🔍 VERIFYING ADVANCE_REPAYMENTS TABLE';
    RAISE NOTICE '====================================';

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'advance_repayments'
        AND column_name = 'notes'
        AND table_schema = 'public'
    ) INTO notes_exists;

    IF notes_exists THEN
        RAISE NOTICE '✅ advance_repayments.notes column exists';
    ELSE
        RAISE NOTICE '❌ advance_repayments.notes column MISSING!';
        RAISE NOTICE '💡 Need to run: fix_advance_repayments_notes_column.sql';
    END IF;
END $$;

-- 3. Test insert into cash_history with gaji_karyawan type
DO $$
DECLARE
    test_id uuid := gen_random_uuid();
    test_successful boolean := false;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🧪 TESTING CASH_HISTORY INSERT';
    RAISE NOTICE '==============================';

    BEGIN
        -- Try to insert a test payroll record
        INSERT INTO public.cash_history (
            id,
            account_id,
            account_name,
            type,
            amount,
            description,
            reference_id,
            reference_name,
            user_name
        ) VALUES (
            test_id,
            'test-account',
            'Test Account',
            'gaji_karyawan',
            100000,
            'Test payroll payment',
            'test-payroll-1',
            'Test Payroll',
            'Test User'
        );

        test_successful := true;
        RAISE NOTICE '✅ Test insert SUCCESSFUL';

        -- Clean up test record
        DELETE FROM public.cash_history WHERE id = test_id;
        RAISE NOTICE '🧹 Test record cleaned up';

    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '❌ Test insert FAILED: %', SQLERRM;
        test_successful := false;
    END;

    IF NOT test_successful THEN
        RAISE NOTICE '💡 Need to run: ensure_payroll_type_constraint.sql';
    END IF;
END $$;

-- 4. Final recommendations
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '📋 REQUIRED SQL SCRIPTS (if not already run):';
    RAISE NOTICE '===========================================';
    RAISE NOTICE '1. ensure_payroll_type_constraint.sql';
    RAISE NOTICE '2. fix_advance_repayments_notes_column.sql';
    RAISE NOTICE '3. create_update_account_balance_function.sql';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 After running these, payroll payments should work!';
END $$;