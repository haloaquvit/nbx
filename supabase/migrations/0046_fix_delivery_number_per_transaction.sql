-- Fix delivery number to be per-transaction instead of global
-- This will make delivery numbers start from 1 for each transaction

-- First, update existing delivery numbers to be per-transaction
WITH delivery_with_row_number AS (
  SELECT 
    id,
    transaction_id,
    ROW_NUMBER() OVER (PARTITION BY transaction_id ORDER BY created_at ASC) as new_delivery_number
  FROM deliveries
  ORDER BY transaction_id, created_at
)
UPDATE deliveries 
SET delivery_number = delivery_with_row_number.new_delivery_number
FROM delivery_with_row_number 
WHERE deliveries.id = delivery_with_row_number.id;

-- Create function to generate delivery number per transaction
CREATE OR REPLACE FUNCTION generate_delivery_number()
RETURNS TRIGGER AS $$
DECLARE
  next_number INTEGER;
BEGIN
  -- Get the next delivery number for this transaction
  SELECT COALESCE(MAX(delivery_number), 0) + 1 
  INTO next_number
  FROM deliveries 
  WHERE transaction_id = NEW.transaction_id;
  
  -- Set the delivery number
  NEW.delivery_number = next_number;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing sequence and column default
ALTER TABLE deliveries ALTER COLUMN delivery_number DROP DEFAULT;
DROP SEQUENCE IF EXISTS deliveries_delivery_number_seq;

-- Create trigger to auto-generate delivery number per transaction
DROP TRIGGER IF EXISTS set_delivery_number_trigger ON deliveries;
CREATE TRIGGER set_delivery_number_trigger
  BEFORE INSERT ON deliveries
  FOR EACH ROW
  EXECUTE FUNCTION generate_delivery_number();

-- Add constraint to ensure delivery_number is positive
ALTER TABLE deliveries ADD CONSTRAINT delivery_number_positive CHECK (delivery_number > 0);

-- Create unique constraint for delivery_number per transaction (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'deliveries_transaction_delivery_number_key'
    AND table_name = 'deliveries'
  ) THEN
    ALTER TABLE deliveries ADD CONSTRAINT deliveries_transaction_delivery_number_key 
    UNIQUE (transaction_id, delivery_number);
  END IF;
END $$;