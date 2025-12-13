-- CLEANUP DUPLICATE/TESTING DATA FROM PAYROLL SYSTEM
-- This will remove duplicate entries created during testing

-- Show current data before cleanup
DO $$
DECLARE
    payroll_count integer;
    cash_history_count integer;
    advance_repayment_count integer;
BEGIN
    SELECT COUNT(*) INTO payroll_count FROM public.payroll_records;
    SELECT COUNT(*) INTO cash_history_count FROM public.cash_history WHERE type = 'gaji_karyawan';
    SELECT COUNT(*) INTO advance_repayment_count FROM public.advance_repayments;

    RAISE NOTICE '📊 BEFORE CLEANUP:';
    RAISE NOTICE '  - Payroll records: %', payroll_count;
    RAISE NOTICE '  - Cash history (gaji): %', cash_history_count;
    RAISE NOTICE '  - Advance repayments: %', advance_repayment_count;
END $$;

-- Delete duplicate cash history entries (keep only the latest for each employee/period)
WITH duplicate_cash_history AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY reference_id ORDER BY created_at DESC) as row_num
    FROM public.cash_history
    WHERE type = 'gaji_karyawan'
)
DELETE FROM public.cash_history
WHERE id IN (
    SELECT id FROM duplicate_cash_history WHERE row_num > 1
);

-- Delete duplicate payroll records (keep only the latest for each employee/period)
WITH duplicate_payroll AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY employee_id, period_year, period_month ORDER BY created_at DESC) as row_num
    FROM public.payroll_records
)
DELETE FROM public.payroll_records
WHERE id IN (
    SELECT id FROM duplicate_payroll WHERE row_num > 1
);

-- Delete orphaned advance repayments (where advance_id doesn't exist)
DELETE FROM public.advance_repayments
WHERE advance_id NOT IN (SELECT id FROM public.employee_advances);

-- Reset any 'paid' payroll records back to 'approved' if needed for re-testing
-- (Uncomment if you want to reset status for re-testing)
-- UPDATE public.payroll_records SET status = 'approved' WHERE status = 'paid';

-- Show data after cleanup
DO $$
DECLARE
    payroll_count integer;
    cash_history_count integer;
    advance_repayment_count integer;
BEGIN
    SELECT COUNT(*) INTO payroll_count FROM public.payroll_records;
    SELECT COUNT(*) INTO cash_history_count FROM public.cash_history WHERE type = 'gaji_karyawan';
    SELECT COUNT(*) INTO advance_repayment_count FROM public.advance_repayments;

    RAISE NOTICE '📊 AFTER CLEANUP:';
    RAISE NOTICE '  - Payroll records: %', payroll_count;
    RAISE NOTICE '  - Cash history (gaji): %', cash_history_count;
    RAISE NOTICE '  - Advance repayments: %', advance_repayment_count;
    RAISE NOTICE '✅ Cleanup completed!';
END $$;