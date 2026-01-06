-- Test the new RPC function to verify it returns data
SELECT * FROM get_payment_history_rpc('00000000-0000-0000-0000-000000000001', 10);
