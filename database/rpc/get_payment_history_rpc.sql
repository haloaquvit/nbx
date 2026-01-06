DROP FUNCTION IF EXISTS get_payment_history_rpc(uuid, integer);

CREATE OR REPLACE FUNCTION public.get_payment_history_rpc(p_branch_id uuid, p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, payment_date timestamp with time zone, amount numeric, transaction_id text, customer_name text, payment_method text, notes text, account_name text, user_name text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
        COALESCE(a.name, 'Kas Besar') as account_name,
        COALESCE(pr.full_name, ph.recorded_by_name, 'System') as user_name,
        ph.created_at
    FROM payment_history ph
    LEFT JOIN transactions t ON ph.transaction_id = t.id
    LEFT JOIN accounts a ON ph.account_id = a.id
    LEFT JOIN profiles pr ON ph.recorded_by = pr.id
    WHERE ph.branch_id = p_branch_id
    ORDER BY ph.payment_date DESC
    LIMIT p_limit;
END;
$function$
