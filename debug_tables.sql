-- DEBUG DATABASE TABLES
-- Check structure and data for payroll integration

-- ========================================
-- CHECK TABLE STRUCTURE
-- ========================================

-- Check commission_entries table structure
SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'commission_entries'
ORDER BY ordinal_position;

-- Check employee_advances table structure
SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'employee_advances'
ORDER BY ordinal_position;

-- Check advance_repayments table structure
SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'advance_repayments'
ORDER BY ordinal_position;

-- Check employee_salaries table structure
SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'employee_salaries'
ORDER BY ordinal_position;

-- ========================================
-- CHECK SAMPLE DATA
-- ========================================

-- Check commission_entries data (first 5 rows)
SELECT * FROM commission_entries LIMIT 5;

-- Check employee_advances data (first 5 rows)
SELECT * FROM employee_advances LIMIT 5;

-- Check employee_salaries data (first 5 rows)
SELECT * FROM employee_salaries LIMIT 5;

-- Check profiles data (first 5 rows)
SELECT id, full_name, role FROM profiles WHERE status = 'Aktif' LIMIT 5;

-- ========================================
-- TEST SPECIFIC USER
-- ========================================

-- Get a specific employee ID to test with
DO $$
DECLARE
    test_emp_id UUID;
    test_result RECORD;
BEGIN
    -- Get first active employee
    SELECT id INTO test_emp_id FROM profiles WHERE status = 'Aktif' LIMIT 1;

    IF test_emp_id IS NOT NULL THEN
        RAISE NOTICE 'Testing with employee ID: %', test_emp_id;

        -- Check salary config for this employee
        SELECT * INTO test_result FROM employee_salaries
        WHERE employee_id = test_emp_id AND is_active = true LIMIT 1;

        IF test_result IS NOT NULL THEN
            RAISE NOTICE 'Salary config found: base_salary=%, payroll_type=%',
                test_result.base_salary, test_result.payroll_type;
        ELSE
            RAISE NOTICE 'No salary config found for this employee';
        END IF;

        -- Check commission entries for this employee
        SELECT COUNT(*), COALESCE(SUM(amount), 0) INTO test_result
        FROM commission_entries
        WHERE user_id = test_emp_id
        AND created_at >= '2025-01-01'
        AND created_at <= '2025-01-31';

        RAISE NOTICE 'Commission entries: count=%, total=%', test_result.count, test_result.sum;

        -- Check advances for this employee
        SELECT COUNT(*), COALESCE(SUM(amount), 0) INTO test_result
        FROM employee_advances
        WHERE employee_id = test_emp_id;

        RAISE NOTICE 'Employee advances: count=%, total=%', test_result.count, test_result.sum;

    ELSE
        RAISE NOTICE 'No active employees found';
    END IF;
END $$;