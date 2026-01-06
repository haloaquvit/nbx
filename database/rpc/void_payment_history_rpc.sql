-- ============================================================================
-- RPC: Void/Rollback Payment History
-- Purpose: Membatalkan pembayaran piutang dan mengembalikan saldo piutang
-- ============================================================================

DROP FUNCTION IF EXISTS void_payment_history_rpc(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION void_payment_history_rpc(
    p_payment_id UUID,
    p_branch_id UUID,
    p_reason TEXT DEFAULT 'Pembayaran dibatalkan'
)
RETURNS TABLE (
    success BOOLEAN,
    error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_payment RECORD;
    v_transaction RECORD;
BEGIN
    -- Validasi branch_id
    IF p_branch_id IS NULL THEN
        RETURN QUERY SELECT FALSE, 'Branch ID is required'::TEXT;
        RETURN;
    END IF;

    -- Get payment info
    SELECT 
        ph.id,
        ph.transaction_id,
        ph.amount,
        ph.branch_id,
        ph.payment_date
    INTO v_payment
    FROM payment_history ph
    WHERE ph.id = p_payment_id
      AND ph.branch_id = p_branch_id;

    IF v_payment.id IS NULL THEN
        RETURN QUERY SELECT FALSE, 'Payment not found in this branch'::TEXT;
        RETURN;
    END IF;

    -- Get transaction info
    SELECT 
        t.id,
        t.total,
        t.paid_amount,
        t.payment_status
    INTO v_transaction
    FROM transactions t
    WHERE t.id = v_payment.transaction_id;

    IF v_transaction.id IS NULL THEN
        RETURN QUERY SELECT FALSE, 'Transaction not found'::TEXT;
        RETURN;
    END IF;

    -- Update transaction: reduce paid_amount
    UPDATE transactions
    SET 
        paid_amount = GREATEST(0, COALESCE(paid_amount, 0) - v_payment.amount),
        payment_status = CASE 
            WHEN GREATEST(0, COALESCE(paid_amount, 0) - v_payment.amount) >= total THEN 'Lunas'
            WHEN GREATEST(0, COALESCE(paid_amount, 0) - v_payment.amount) > 0 THEN 'Partial'
            ELSE 'Belum Lunas'
        END,
        updated_at = NOW()
    WHERE id = v_payment.transaction_id;

    -- Delete payment history record
    DELETE FROM payment_history
    WHERE id = p_payment_id;

    -- Void related journal entry if exists
    UPDATE journal_entries
    SET 
        is_voided = TRUE,
        voided_at = NOW(),
        void_reason = p_reason
    WHERE reference_type = 'receivable_payment'
      AND reference_id = p_payment_id::TEXT
      AND branch_id = p_branch_id;

    RETURN QUERY SELECT TRUE, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT FALSE, SQLERRM::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION void_payment_history_rpc(UUID, UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION void_payment_history_rpc IS 
    'Void/rollback payment history and restore receivable balance';
