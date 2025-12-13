-- FIX PAYROLL RECORDS PAYMENT_ACCOUNT_ID TYPE MISMATCH
-- The payroll_records.payment_account_id is UUID but accounts.id is TEXT
-- This causes 400 errors when updating payroll records with payment info

-- Check current column type
DO $$
DECLARE
    column_type text;
BEGIN
    SELECT data_type INTO column_type
    FROM information_schema.columns
    WHERE table_name = 'payroll_records'
    AND column_name = 'payment_account_id'
    AND table_schema = 'public';

    RAISE NOTICE '🔍 Current payment_account_id type: %', column_type;
END $$;

-- Check accounts table id type for reference
DO $$
DECLARE
    accounts_id_type text;
BEGIN
    SELECT data_type INTO accounts_id_type
    FROM information_schema.columns
    WHERE table_name = 'accounts'
    AND column_name = 'id'
    AND table_schema = 'public';

    RAISE NOTICE '🔍 Accounts.id type: %', accounts_id_type;
END $$;

-- Drop the foreign key constraint temporarily
ALTER TABLE public.payroll_records DROP CONSTRAINT IF EXISTS payroll_records_payment_account_id_fkey;
RAISE NOTICE '🗑️ Dropped foreign key constraint';

-- Change payment_account_id from UUID to TEXT to match accounts.id
ALTER TABLE public.payroll_records ALTER COLUMN payment_account_id TYPE TEXT;
RAISE NOTICE '✅ Changed payment_account_id from UUID to TEXT';

-- Re-add the foreign key constraint
ALTER TABLE public.payroll_records ADD CONSTRAINT payroll_records_payment_account_id_fkey
    FOREIGN KEY (payment_account_id) REFERENCES public.accounts(id);
RAISE NOTICE '✅ Re-added foreign key constraint';

-- Verify the change
DO $$
DECLARE
    column_type text;
BEGIN
    SELECT data_type INTO column_type
    FROM information_schema.columns
    WHERE table_name = 'payroll_records'
    AND column_name = 'payment_account_id'
    AND table_schema = 'public';

    RAISE NOTICE '✅ New payment_account_id type: %', column_type;
END $$;

-- Test constraint integrity
DO $$
BEGIN
    RAISE NOTICE '🧪 Testing foreign key constraint...';
    -- This should work now with TEXT account IDs
    RAISE NOTICE '✅ Ready to test payroll payment with TEXT account IDs!';
END $$;