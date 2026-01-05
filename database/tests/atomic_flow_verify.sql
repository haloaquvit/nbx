DO $$
DECLARE
  v_branch_id UUID;
  v_user_id UUID;
  v_material_id UUID;
  v_product_id UUID;
  v_tx_id UUID;
  v_delivery_result RECORD;
  v_prod_result RECORD;
  v_chk_accounts INTEGER;
BEGIN
  RAISE NOTICE '=== STARTING ATOMIC FLOW TEST ===';

  -- 1. Get a Branch
  SELECT id INTO v_branch_id FROM branches LIMIT 1;
  IF v_branch_id IS NULL THEN 
    RAISE NOTICE 'SKIP: No branch found'; 
    RETURN;
  END IF;
  RAISE NOTICE 'Using Branch: %', v_branch_id;

  -- Check if accounts exist for HPP (5100) and Inventory (1310) or this test will look like it "failed" to create journal
  SELECT COUNT(*) INTO v_chk_accounts FROM accounts WHERE branch_id = v_branch_id AND code IN ('5100', '1310');
  IF v_chk_accounts < 2 THEN
    RAISE NOTICE 'WARNING: Accounts 5100/1310 missing. Journal creation will define success=true but return no journal.';
  END IF;

  -- 2. Get/Create User (Dummy ID if needed for RPC logs)
  SELECT id INTO v_user_id FROM profiles LIMIT 1;
  IF v_user_id IS NULL THEN 
     v_user_id := gen_random_uuid(); 
     RAISE NOTICE 'Using dummy user ID';
  END IF;

  -- 3. Create Test Material & Initial Stock
  INSERT INTO materials (name, stock, unit, price_per_unit, branch_id)
  VALUES ('Test Material Atom ' || gen_random_uuid(), 100, 'kg', 5000, v_branch_id)
  RETURNING id INTO v_material_id;

  INSERT INTO inventory_batches (material_id, branch_id, initial_quantity, remaining_quantity, unit_cost, batch_date)
  VALUES (v_material_id, v_branch_id, 100, 100, 5000, NOW());

  -- 4. Create Test Product & BOM
  INSERT INTO products (name, code, price, branch_id)
  VALUES ('Test Product Atom ' || gen_random_uuid(), 'T-ATOM-' || substring(gen_random_uuid()::text, 1, 5), 50000, v_branch_id)
  RETURNING id INTO v_product_id;

  INSERT INTO product_materials (product_id, material_id, quantity)
  VALUES (v_product_id, v_material_id, 2); -- 2kg per product

  RAISE NOTICE 'Setup Complete: Product % created', v_product_id;

  -- 5. TEST PRODUCTION (RPC)
  RAISE NOTICE '--- Testing process_production_atomic ---';
  SELECT * INTO v_prod_result FROM process_production_atomic(
    v_product_id, 10, true, 'Test Prod', v_branch_id, v_user_id, 'Tester'
  );
  
  IF NOT v_prod_result.success THEN 
    RAISE EXCEPTION 'Production Failed: %', v_prod_result.error_message; 
  END IF;
  RAISE NOTICE 'Production OK. Ref: %, Journal: %', v_prod_result.production_ref, v_prod_result.journal_id;

  -- 6. Create Transaction
  RAISE NOTICE 'Creating Transaction...';
  INSERT INTO transactions (branch_id, customer_name, total, status, items, is_office_sale)
  VALUES (
    v_branch_id, 'Test Customer', 500000, 'Pesanan Masuk', 
    jsonb_build_array(
      jsonb_build_object('product_id', v_product_id, 'quantity', 5, 'price', 50000, 'product_name', 'Test Product Atom')
    ),
    false
  )
  RETURNING id INTO v_tx_id;

  -- 7. TEST DELIVERY (RPC)
  RAISE NOTICE '--- Testing process_delivery_atomic ---';
  SELECT * INTO v_delivery_result FROM process_delivery_atomic(
    v_tx_id,
    jsonb_build_array(
       jsonb_build_object(
         'product_id', v_product_id,
         'quantity', 5,
         'product_name', 'Test Product Atom'
       )
    ),
    v_branch_id,
    NULL, NULL, CURRENT_DATE, 'Test Delivery', NULL
  );

  IF NOT v_delivery_result.success THEN 
    RAISE EXCEPTION 'Delivery Failed: %', v_delivery_result.error_message; 
  END IF;
  
  RAISE NOTICE 'Delivery OK.';
  RAISE NOTICE '  Delivery ID: %', v_delivery_result.delivery_id;
  RAISE NOTICE '  Total HPP: %', v_delivery_result.total_hpp;
  RAISE NOTICE '  HPP Journal ID: %', v_delivery_result.journal_id;

  IF v_delivery_result.total_hpp > 0 AND v_delivery_result.journal_id IS NULL THEN
     RAISE WARNING 'HPP Calculated but NO JOURNAL created. Check Account Setup!';
  END IF;

  RAISE EXCEPTION 'TEST SUCCESSFUL (Rolling back changes)'; -- Cause rollback to clean up

EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'TEST SUCCESSFUL%' THEN
    RAISE NOTICE '%', SQLERRM;
  ELSE
    RAISE EXCEPTION 'Test Failed: %', SQLERRM;
  END IF;
END $$;
