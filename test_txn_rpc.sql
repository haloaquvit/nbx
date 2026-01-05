DO $$
DECLARE
  v_res RECORD;
  v_count INT;
  v_branch_id UUID := 'e99e62f9-9ab6-4a61-ae64-0710fb081337';
  v_prod_id UUID := '81c600c6-eedc-4db2-af43-69f04e16953b';
BEGIN
  RAISE NOTICE 'Testing create_transaction_atomic...';

  -- Call RPC
  SELECT * INTO v_res FROM create_transaction_atomic(
    jsonb_build_object(
      'total', 50000,
      'paid_amount', 50000,
      'payment_method', 'cash',
      'is_office_sale', true,
      'customer_name', 'RPC Test User'
    ),
    jsonb_build_array(
      jsonb_build_object(
        'product_id', v_prod_id,
        'quantity', 1,
        'price', 50000,
        'is_bonus', false
      )
    ),
    v_branch_id,
    NULL, 
    'Tester', 
    NULL
  );
  
  RAISE NOTICE 'RPC Result: Success=%, TxnId=%', v_res.success, v_res.transaction_id;
  
  IF v_res.success THEN
    -- Check Payments
    SELECT COUNT(*) INTO v_count FROM transaction_payments WHERE transaction_id = v_res.transaction_id;
    RAISE NOTICE 'Payment Records Found: %', v_count;
    
    IF v_count >= 1 THEN
        RAISE NOTICE '✅ TEST SUCCESS: Payment record created.';
    ELSE
        RAISE NOTICE '❌ TEST FAILED: Payment record missing!';
    END IF;
  ELSE
    RAISE NOTICE '❌ RPC Failed: %', v_res.error_message;
  END IF;

  RAISE NOTICE 'Rolling back...';
  RAISE EXCEPTION 'Test Complete (Rollback)';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'Test Complete (Rollback)' THEN
    RAISE NOTICE '%', SQLERRM;
  ELSE
    RAISE NOTICE 'Error: %', SQLERRM;
  END IF;
END $$;
