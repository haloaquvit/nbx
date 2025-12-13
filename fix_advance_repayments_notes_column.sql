-- ADD MISSING NOTES COLUMN TO ADVANCE_REPAYMENTS TABLE
-- The payroll functions expect a "notes" column but it doesn't exist in the original table

-- Check current table structure
DO $$
DECLARE
    column_exists boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'advance_repayments'
        AND column_name = 'notes'
        AND table_schema = 'public'
    ) INTO column_exists;

    IF column_exists THEN
        RAISE NOTICE '✅ Notes column already exists in advance_repayments';
    ELSE
        RAISE NOTICE '⚠️ Notes column missing from advance_repayments table';
    END IF;
END $$;

-- Add the missing notes column
ALTER TABLE public.advance_repayments ADD COLUMN IF NOT EXISTS notes TEXT;

-- Confirm the column was added
DO $$
BEGIN
    RAISE NOTICE '✅ Added notes column to advance_repayments table';
END $$;

-- Verify the column was added
DO $$
DECLARE
    column_count integer;
BEGIN
    SELECT COUNT(*) INTO column_count
    FROM information_schema.columns
    WHERE table_name = 'advance_repayments'
    AND table_schema = 'public';

    RAISE NOTICE '📋 Advance_repayments table now has % columns', column_count;
END $$;

-- Show all columns for verification
DO $$
DECLARE
    col_record RECORD;
BEGIN
    RAISE NOTICE '📋 Current advance_repayments table structure:';
    FOR col_record IN
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'advance_repayments'
        AND table_schema = 'public'
        ORDER BY ordinal_position
    LOOP
        RAISE NOTICE '  - %: % (nullable: %)', col_record.column_name, col_record.data_type, col_record.is_nullable;
    END LOOP;
END $$;

-- Final confirmation
DO $$
BEGIN
    RAISE NOTICE '✅ Ready to test payroll payment with advance repayment notes!';
END $$;