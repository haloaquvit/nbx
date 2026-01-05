\set ON_ERROR_STOP on

BEGIN;

-- 0. Params
\set branch_id '''e99e62f9-9ab6-4a61-ae64-0710fb081337'''
\set product_id '''81c600c6-eedc-4db2-af43-69f04e16953b'''
\set transaction_id '''AIR-MIG-AR-0222'''
\set payable_id '''AIR-MIG-AP-0001'''

-- 1. Test Restore Inventory (to ensure stock)
SELECT restore_inventory_fifo(
  :product_id,
  :branch_id,
  10,
  5000,
  'TEST-RESTORE-INIT'
);

-- 2. Test Consume Inventory
SELECT consume_inventory_fifo(
  :product_id,
  :branch_id,
  5,
  'TEST-CONSUME-001'
);

-- 3. Test Receive Payment (Transaction)
-- Select current amount first
SELECT id, total, paid_amount FROM transactions WHERE id = :transaction_id;

SELECT receive_payment_atomic(
  :transaction_id,
  :branch_id,
  1000, -- Amount
  'cash',
  CURRENT_DATE,
  'Test Payment Receive'
);

-- Verify payment
SELECT id, total, paid_amount FROM transactions WHERE id = :transaction_id;
SELECT * FROM transaction_payments WHERE transaction_id = :transaction_id ORDER BY created_at DESC LIMIT 1;


-- 4. Test Pay Supplier
SELECT pay_supplier_atomic(
  :payable_id,
  :branch_id,
  1000,
  'cash',
  CURRENT_DATE,
  'Test Payment Supplier'
);

ROLLBACK;
