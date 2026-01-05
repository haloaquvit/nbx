-- ============================================================================
-- TEST SCRIPT FOR ATOMIC RPC FUNCTIONS
-- Run this AFTER deploying 017_atomic_rpc_functions.sql
-- ============================================================================

-- 1. TEST process_production_atomic
-- Replace UUIDs with actual IDs from your database
DO $$
DECLARE
  v_result RECORD;
  v_product_id UUID;
  v_branch_id UUID;
  v_user_id UUID;
BEGIN
  -- Get a test product (first product with BOM)
  SELECT p.id, p.branch_id INTO v_product_id, v_branch_id
  FROM products p
  WHERE EXISTS (SELECT 1 FROM product_materials pm WHERE pm.product_id = p.id)
  LIMIT 1;

  -- Get a test user
  SELECT id INTO v_user_id FROM profiles LIMIT 1;

  IF v_product_id IS NULL THEN
    RAISE NOTICE '❌ No product with BOM found for testing';
    RETURN;
  END IF;

  RAISE NOTICE '🧪 Testing process_production_atomic...';
  RAISE NOTICE '   Product ID: %', v_product_id;
  RAISE NOTICE '   Branch ID: %', v_branch_id;

  -- Call the RPC
  SELECT * INTO v_result
  FROM process_production_atomic(
    p_product_id := v_product_id,
    p_quantity := 1,
    p_consume_bom := TRUE,
    p_note := 'TEST PRODUCTION - DELETE ME',
    p_branch_id := v_branch_id,
    p_user_id := v_user_id,
    p_user_name := 'Test User'
  );

  IF v_result.success THEN
    RAISE NOTICE '✅ Production RPC SUCCESS';
    RAISE NOTICE '   Production Ref: %', v_result.production_ref;
    RAISE NOTICE '   Material Cost: %', v_result.total_material_cost;
    RAISE NOTICE '   Journal ID: %', v_result.journal_id;
  ELSE
    RAISE NOTICE '❌ Production RPC FAILED: %', v_result.error_message;
  END IF;
END $$;


-- 2. TEST process_spoilage_atomic
DO $$
DECLARE
  v_result RECORD;
  v_material_id UUID;
  v_branch_id UUID;
  v_user_id UUID;
BEGIN
  -- Get a test material with stock
  SELECT m.id, m.branch_id INTO v_material_id, v_branch_id
  FROM materials m
  WHERE m.stock > 0
  LIMIT 1;

  -- Get a test user
  SELECT id INTO v_user_id FROM profiles LIMIT 1;

  IF v_material_id IS NULL THEN
    RAISE NOTICE '❌ No material with stock found for testing';
    RETURN;
  END IF;

  RAISE NOTICE '🧪 Testing process_spoilage_atomic...';
  RAISE NOTICE '   Material ID: %', v_material_id;
  RAISE NOTICE '   Branch ID: %', v_branch_id;

  -- Call the RPC
  SELECT * INTO v_result
  FROM process_spoilage_atomic(
    p_material_id := v_material_id,
    p_quantity := 0.1,  -- Small quantity for testing
    p_note := 'TEST SPOILAGE - DELETE ME',
    p_branch_id := v_branch_id,
    p_user_id := v_user_id,
    p_user_name := 'Test User'
  );

  IF v_result.success THEN
    RAISE NOTICE '✅ Spoilage RPC SUCCESS';
    RAISE NOTICE '   Record Ref: %', v_result.record_ref;
    RAISE NOTICE '   Spoilage Cost: %', v_result.spoilage_cost;
    RAISE NOTICE '   Journal ID: %', v_result.journal_id;
  ELSE
    RAISE NOTICE '❌ Spoilage RPC FAILED: %', v_result.error_message;
  END IF;
END $$;


-- 3. TEST receive_payment_atomic
DO $$
DECLARE
  v_result RECORD;
  v_receivable_id UUID;
  v_branch_id UUID;
  v_user_id UUID;
BEGIN
  -- Get a test receivable that's not fully paid
  SELECT r.id, r.branch_id INTO v_receivable_id, v_branch_id
  FROM receivables r
  WHERE r.status IN ('pending', 'partial')
  LIMIT 1;

  -- Get a test user
  SELECT id INTO v_user_id FROM profiles LIMIT 1;

  IF v_receivable_id IS NULL THEN
    RAISE NOTICE '⚠️ No pending receivable found for testing - SKIPPED';
    RETURN;
  END IF;

  RAISE NOTICE '🧪 Testing receive_payment_atomic...';
  RAISE NOTICE '   Receivable ID: %', v_receivable_id;
  RAISE NOTICE '   Branch ID: %', v_branch_id;

  -- Call the RPC with small amount
  SELECT * INTO v_result
  FROM receive_payment_atomic(
    p_receivable_id := v_receivable_id,
    p_amount := 1000,  -- Small amount for testing
    p_payment_method := 'cash',
    p_notes := 'TEST PAYMENT - DELETE ME',
    p_branch_id := v_branch_id,
    p_user_id := v_user_id,
    p_user_name := 'Test User'
  );

  IF v_result.success THEN
    RAISE NOTICE '✅ Receive Payment RPC SUCCESS';
    RAISE NOTICE '   Payment ID: %', v_result.payment_id;
    RAISE NOTICE '   Remaining: %', v_result.remaining_amount;
    RAISE NOTICE '   Fully Paid: %', v_result.is_fully_paid;
    RAISE NOTICE '   Journal ID: %', v_result.journal_id;
  ELSE
    RAISE NOTICE '❌ Receive Payment RPC FAILED: %', v_result.error_message;
  END IF;
END $$;


-- 4. Verify created records
RAISE NOTICE '📋 Checking created test records...';

SELECT 'production_records' as table_name, COUNT(*) as count
FROM production_records
WHERE note LIKE '%TEST%'
UNION ALL
SELECT 'journal_entries', COUNT(*)
FROM journal_entries
WHERE description LIKE '%TEST%'
UNION ALL
SELECT 'inventory_batches', COUNT(*)
FROM inventory_batches
WHERE notes LIKE '%TEST%';


-- 5. CLEANUP TEST DATA (uncomment to run)
/*
DELETE FROM journal_lines WHERE journal_id IN (
  SELECT id FROM journal_entries WHERE description LIKE '%TEST%'
);
DELETE FROM journal_entries WHERE description LIKE '%TEST%';
DELETE FROM production_records WHERE note LIKE '%TEST%';
DELETE FROM inventory_batches WHERE notes LIKE '%TEST%';
RAISE NOTICE '🧹 Test data cleaned up';
*/
