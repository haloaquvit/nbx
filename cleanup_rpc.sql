-- Drop conflicting functions to clean state
DROP FUNCTION IF EXISTS consume_inventory_fifo(UUID, UUID, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS restore_inventory_fifo(UUID, UUID, NUMERIC, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS get_product_stock(UUID, UUID);
DROP FUNCTION IF EXISTS get_product_stock(UUID);
DROP FUNCTION IF EXISTS receive_payment_atomic(UUID, UUID, NUMERIC, TEXT, DATE, TEXT);
