-- Drop all versions of approve_purchase_order_atomic
DROP FUNCTION IF EXISTS approve_purchase_order_atomic(UUID, UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS approve_purchase_order_atomic(TEXT, UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS approve_purchase_order_atomic;
