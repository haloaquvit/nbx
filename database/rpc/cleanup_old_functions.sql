-- Cleanup old RPC functions that have been refactored to use auth.uid()
-- This prevents "function name not unique" errors and confusion

-- 1. PO Management
DROP FUNCTION IF EXISTS approve_purchase_order_atomic(TEXT, UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS create_purchase_order_atomic(JSONB, JSONB, UUID, UUID); -- In case old signature existed

-- 2. Stock Adjustment
DROP FUNCTION IF EXISTS create_product_stock_adjustment_atomic(UUID, UUID, NUMERIC, TEXT, NUMERIC, UUID);
DROP FUNCTION IF EXISTS create_material_stock_adjustment_atomic(UUID, UUID, NUMERIC, TEXT, NUMERIC, UUID);

-- 3. Tax Payment
DROP FUNCTION IF EXISTS create_tax_payment_atomic(UUID, TEXT, NUMERIC, NUMERIC, UUID, TEXT, UUID);

-- 4. Employee Advance
DROP FUNCTION IF EXISTS create_employee_advance_atomic(JSONB, UUID, UUID);
DROP FUNCTION IF EXISTS repay_employee_advance_atomic(UUID, UUID, NUMERIC, DATE, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS void_employee_advance_atomic(UUID, UUID, TEXT, UUID);

-- 5. Closing Entries
DROP FUNCTION IF EXISTS execute_closing_entry_atomic(UUID, INTEGER, UUID);

-- 6. Zakat Management
DROP FUNCTION IF EXISTS upsert_zakat_record_atomic(UUID, TEXT, JSONB, UUID);
