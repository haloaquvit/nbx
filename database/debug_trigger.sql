-- Debug script to find trigger error
DO $$
DECLARE
    v_txn_id TEXT := 'TRX-DEBUG-999';
    v_branch_id UUID;
BEGIN
    -- Get a valid branch_id
    SELECT id INTO v_branch_id FROM branches LIMIT 1;
    
    IF v_branch_id IS NULL THEN
        RAISE EXCEPTION 'No branch found in database';
    END IF;

    -- Create a dummy transaction
    INSERT INTO transactions (id, branch_id, status, payment_status, total, paid_amount)
    VALUES (v_txn_id, v_branch_id, 'Pesanan Masuk', 'Belum Lunas', 1000, 0)
    ON CONFLICT (id) DO NOTHING;

    RAISE NOTICE 'Attempting to update transaction status...';
    
    BEGIN
        UPDATE transactions 
        SET status = 'Selesai', delivery_status = 'Completed', payment_status = 'Lunas'
        WHERE id = v_txn_id;
        
        RAISE NOTICE 'Update successful!';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Caught Error: %', SQLERRM;
        RAISE NOTICE 'Error Detail: %', SQLSTATE;
    END;

    -- Cleanup
    DELETE FROM transactions WHERE id = v_txn_id;
END $$;
