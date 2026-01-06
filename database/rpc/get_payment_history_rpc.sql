-- Create new RPC specifically for viewing payment history
CREATE OR REPLACE FUNCTION get_payment_history_rpc(
    p_branch_id UUID,
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    id UUID,
    payment_date TIMESTAMP WITH TIME ZONE,
    amount NUMERIC,
    transaction_id TEXT,
    customer_name TEXT,
    payment_method TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ph.id,
        ph.payment_date,
        ph.amount,
        ph.transaction_id,
        t.customer_name,
        ph.payment_method,
        ph.notes,
        ph.created_at
    FROM payment_history ph
    LEFT JOIN transactions t ON ph.transaction_id = t.id
    WHERE ph.branch_id = p_branch_id
    ORDER BY ph.payment_date DESC
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_payment_history_rpc(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_payment_history_rpc(UUID, INTEGER) TO service_role;
