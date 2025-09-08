-- Fix commission table types to match products table
-- Change product_id from TEXT to UUID to match products.id

-- First, remove the trigger temporarily
DROP TRIGGER IF EXISTS trigger_populate_commission_product_info ON commission_rules;

-- Drop the existing function
DROP FUNCTION IF EXISTS populate_commission_product_info();

-- Alter commission_rules table to use UUID for product_id
ALTER TABLE commission_rules 
ALTER COLUMN product_id TYPE UUID USING product_id::uuid;

-- Alter commission_entries table to use UUID for product_id
ALTER TABLE commission_entries 
ALTER COLUMN product_id TYPE UUID USING product_id::uuid;

-- Recreate the trigger function with proper types
CREATE OR REPLACE FUNCTION populate_commission_product_info()
RETURNS TRIGGER AS $$
BEGIN
  -- Try to get product info from products table
  SELECT p.name 
  INTO NEW.product_name
  FROM products p 
  WHERE p.id = NEW.product_id;
  
  -- Set product_sku to product_id as text since sku column doesn't exist in products
  NEW.product_sku = NEW.product_id::text;
  
  -- If product name not found, use product_id as fallback
  IF NEW.product_name IS NULL THEN
    NEW.product_name = COALESCE(NEW.product_name, NEW.product_id::text);
  END IF;
  
  NEW.updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER trigger_populate_commission_product_info
  BEFORE INSERT OR UPDATE ON commission_rules
  FOR EACH ROW
  EXECUTE FUNCTION populate_commission_product_info();