-- Test Suite for RPC Functions

\set ON_ERROR_STOP on

BEGIN;

-- 1. Test consume_inventory_fifo (Manual Call)
-- Pre-requisite: Create inventory batch for product
INSERT INTO inventory_batches (product_id, branch_id, initial_quantity, remaining_quantity, unit_cost, batch_date)
VALUES ('81c600c6-eedc-4db2-af43-69f04e16953b', 'e99e62f9-9ab6-4a61-ae64-0710fb081337', 100, 100, 5000, NOW());

SELECT consume_inventory_fifo(
  '81c600c6-eedc-4db2-af43-69f04e16953b', -- product_id
  'e99e62f9-9ab6-4a61-ae64-0710fb081337', -- branch_id
  5, -- quantity
  'TEST-CONSUME-001' -- ref
);

-- 2. Test restore_inventory_fifo
SELECT restore_inventory_fifo(
  '81c600c6-eedc-4db2-af43-69f04e16953b',
  'e99e62f9-9ab6-4a61-ae64-0710fb081337',
  5,
  5000,
  'TEST-RESTORE-001'
);

-- 3. Test process_production_atomic
-- Note: Assuming BOM created in previous step
SELECT process_production_atomic(
  '81c600c6-eedc-4db2-af43-69f04e16953b', -- product_id
  10, -- quantity
  TRUE, -- consume_bom
  'Test Production', -- note
  'e99e62f9-9ab6-4a61-ae64-0710fb081337', -- branch_id
  '00000000-0000-0000-0000-000000000000'::uuid, -- user_id (system)
  'Tester' -- user_name
);

-- 4. Test process_spoilage_atomic
SELECT process_spoilage_atomic(
  '97547c41-f824-4ef9-99a1-e2060faf1554', -- material_id
  1, -- quantity
  'Test Spoilage', -- note
  'e99e62f9-9ab6-4a61-ae64-0710fb081337', -- branch_id
  '00000000-0000-0000-0000-000000000000'::uuid, -- user_id
  'Tester' -- user_name
);

-- 5. Test pay_supplier_atomic
-- Mock payable
INSERT INTO accounts_payable (id, supplier_name, amount, due_date, status, branch_id)
VALUES ('TEST-AP-001', 'Supplier Test', 100000, NOW(), 'Unpaid', 'e99e62f9-9ab6-4a61-ae64-0710fb081337')
ON CONFLICT (id) DO NOTHING;

SELECT pay_supplier_atomic(
  'TEST-AP-001', -- payable_id
  'e99e62f9-9ab6-4a61-ae64-0710fb081337', -- branch_id
  50000, -- amount
  'cash', -- method
  CURRENT_DATE, -- date
  'Test Payment' -- notes
);

-- 6. Test void_transaction_atomic
-- Mock transaction first
INSERT INTO transactions (id, ref, branch_id, customer_name, status, items, is_cancelled)
VALUES ('TEST-TR-999', 'TR-TEST-999', 'e99e62f9-9ab6-4a61-ae64-0710fb081337', 'Test Customer', 'Selesai', '[]', FALSE)
ON CONFLICT (id) DO NOTHING;

SELECT void_transaction_atomic(
  'TEST-TR-999', -- transaction_id
  'e99e62f9-9ab6-4a61-ae64-0710fb081337', -- branch_id
  'Salah input', -- reason
  '00000000-0000-0000-0000-000000000000'::uuid -- user_id
);


ROLLBACK; -- Always rollback test data
