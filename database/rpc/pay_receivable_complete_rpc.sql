-- ============================================================================
-- RPC: Complete Receivable Payment with Journal
-- Purpose: Update transaction, insert payment_history, AND create journal entry
-- ============================================================================

DROP FUNCTION IF EXISTS pay_receivable_complete_rpc(TEXT, NUMERIC, TEXT, TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS pay_receivable_complete_rpc(TEXT, NUMERIC, TEXT, TEXT, UUID, UUID);
DROP FUNCTION IF EXISTS pay_receivable_complete_rpc(TEXT, NUMERIC, TEXT, TEXT, UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION pay_receivable_complete_rpc(
    p_transaction_id TEXT,
    p_amount NUMERIC,
    p_payment_account_id TEXT,
    p_notes TEXT DEFAULT NULL,
    p_branch_id UUID DEFAULT NULL,
    p_user_id UUID DEFAULT NULL,
    p_recorded_by_name TEXT DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    payment_id UUID,
    journal_id UUID,
    error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_transaction RECORD;
    v_payment_id UUID;
    v_journal_result RECORD;
    v_new_paid_amount NUMERIC;
    v_new_status TEXT;
BEGIN
    -- Get transaction info
    SELECT 
        t.id,
        t.total,
        t.paid_amount,
        t.payment_status,
        t.branch_id,
        t.customer_name
    INTO v_transaction
    FROM transactions t
    WHERE t.id = p_transaction_id;

    IF v_transaction.id IS NULL THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Transaction not found'::TEXT;
        RETURN;
    END IF;

    -- Use transaction's branch_id if not provided
    IF p_branch_id IS NULL THEN
        p_branch_id := v_transaction.branch_id;
    END IF;

    -- Validate amount
    IF p_amount <= 0 THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Amount must be positive'::TEXT;
        RETURN;
    END IF;

    v_new_paid_amount := COALESCE(v_transaction.paid_amount, 0) + p_amount;
    
    IF v_new_paid_amount > v_transaction.total THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Payment exceeds remaining balance'::TEXT;
        RETURN;
    END IF;

    -- Determine new payment status
    IF v_new_paid_amount >= v_transaction.total THEN
        v_new_status := 'Lunas';
    ELSIF v_new_paid_amount > 0 THEN
        v_new_status := 'Partial';
    ELSE
        v_new_status := 'Belum Lunas';
    END IF;

    -- 1. Update transaction
    UPDATE transactions
    SET 
        paid_amount = v_new_paid_amount,
        payment_status = v_new_status,
        updated_at = NOW()
    WHERE id = p_transaction_id;

    -- 2. Insert payment history
    INSERT INTO payment_history (
        transaction_id,
        branch_id,
        amount,
        remaining_amount,
        payment_method,
        account_id,
        payment_date,
        notes,
        recorded_by,
        recorded_by_name,
        created_at
    ) VALUES (
        p_transaction_id,
        p_branch_id,
        p_amount,
        (v_transaction.total - v_new_paid_amount),
        'Tunai',
        p_payment_account_id,
        NOW(),
        p_notes,
        p_user_id,
        p_recorded_by_name,
        NOW()
    ) RETURNING id INTO v_payment_id;

    -- 3. Create journal entry via RPC
    SELECT * INTO v_journal_result
    FROM create_receivable_payment_journal_rpc(
        p_branch_id,
        p_transaction_id,
        CURRENT_DATE,
        p_amount,
        v_transaction.customer_name,
        p_payment_account_id
    );

    IF NOT v_journal_result.success THEN
        RAISE EXCEPTION 'Failed to create journal: %', v_journal_result.error_message;
    END IF;

    RETURN QUERY SELECT 
        TRUE, 
        v_payment_id, 
        v_journal_result.journal_id,
        NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, SQLERRM::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION pay_receivable_complete_rpc(TEXT, NUMERIC, TEXT, TEXT, UUID, UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION pay_receivable_complete_rpc IS
    'Complete receivable payment: update transaction, insert payment_history (with recorder name), and create journal entry';
