-- Fix production_records table to allow NULL product_id for error records
-- This allows recording damaged materials without requiring a product reference

ALTER TABLE production_records 
ALTER COLUMN product_id DROP NOT NULL;

-- Update the foreign key constraint to handle NULL values properly
-- The existing constraint will work fine with NULL values

-- Add a check constraint to ensure data integrity:
-- - If product_id is NULL, quantity should be negative (indicating material loss/damage)
-- - If product_id is not NULL, quantity should be positive (normal production)
ALTER TABLE production_records 
ADD CONSTRAINT check_production_record_logic 
CHECK (
  (product_id IS NULL AND quantity <= 0) OR 
  (product_id IS NOT NULL AND quantity >= 0)
);

-- Add an index for better performance on queries filtering by product_id
-- This handles both NULL and non-NULL values efficiently
CREATE INDEX IF NOT EXISTS idx_production_records_product_id_nullable 
ON production_records(product_id) 
WHERE product_id IS NOT NULL;

-- Add an index for error records (NULL product_id)
CREATE INDEX IF NOT EXISTS idx_production_records_error_entries 
ON production_records(created_at) 
WHERE product_id IS NULL;