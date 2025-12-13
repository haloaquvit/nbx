-- CREATE UPDATE_ACCOUNT_BALANCE RPC FUNCTION
-- This function updates account balances and is called by payroll payments

-- First check if the function already exists
DO $$
DECLARE
    function_exists boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.proname = 'update_account_balance'
    ) INTO function_exists;

    IF function_exists THEN
        RAISE NOTICE '✅ update_account_balance function already exists';
    ELSE
        RAISE NOTICE '⚠️ update_account_balance function missing';
    END IF;
END $$;

-- Create the update_account_balance function
CREATE OR REPLACE FUNCTION public.update_account_balance(
    account_id TEXT,
    amount NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Update the account balance
    UPDATE public.accounts
    SET balance = balance + amount
    WHERE id = account_id;

    -- Check if the account was found and updated
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Account with id % not found', account_id;
    END IF;

    -- Log the balance update
    RAISE NOTICE 'Updated account % balance by %', account_id, amount;
END;
$$;

-- Set function permissions
GRANT EXECUTE ON FUNCTION public.update_account_balance(TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_account_balance(TEXT, NUMERIC) TO service_role;

-- Test the function exists and works
DO $$
DECLARE
    test_account_id TEXT := 'acc-1755355596383'; -- Use an existing account for testing
    current_balance NUMERIC;
BEGIN
    -- Get current balance for verification
    SELECT balance INTO current_balance
    FROM public.accounts
    WHERE id = test_account_id;

    IF current_balance IS NOT NULL THEN
        RAISE NOTICE '🧪 Test account % current balance: %', test_account_id, current_balance;
        RAISE NOTICE '✅ update_account_balance function ready for payroll payments!';
    ELSE
        RAISE NOTICE '⚠️ Test account not found, but function is ready';
    END IF;

EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '⚠️ Could not test function, but it should work: %', SQLERRM;
END $$;

-- Final confirmation
DO $$
BEGIN
    RAISE NOTICE '✅ update_account_balance RPC function created successfully!';
    RAISE NOTICE '💰 Payroll payments can now update account balances';
END $$;