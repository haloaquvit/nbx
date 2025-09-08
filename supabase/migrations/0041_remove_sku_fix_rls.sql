-- Remove SKU fields and fix RLS policy for commission system

-- First, drop the trigger temporarily
DROP TRIGGER IF EXISTS trigger_populate_commission_product_info ON commission_rules;
DROP FUNCTION IF EXISTS populate_commission_product_info();

-- Remove product_sku columns since we don't need them
ALTER TABLE commission_rules DROP COLUMN IF EXISTS product_sku;
ALTER TABLE commission_entries DROP COLUMN IF EXISTS product_sku;

-- Create simplified trigger function without SKU
CREATE OR REPLACE FUNCTION populate_commission_product_info()
RETURNS TRIGGER AS $$
BEGIN
  -- Try to get product name from products table
  SELECT p.name 
  INTO NEW.product_name
  FROM products p 
  WHERE p.id = NEW.product_id;
  
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

-- Fix RLS policies for commission_rules
DROP POLICY IF EXISTS "Admin/Owner/Cashier can manage commission rules" ON commission_rules;
DROP POLICY IF EXISTS "Anyone can view commission rules" ON commission_rules;

-- More permissive RLS policies
CREATE POLICY "Anyone can view commission rules" ON commission_rules
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage commission rules" ON commission_rules
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Fix RLS policies for commission_entries
DROP POLICY IF EXISTS "Admin/Owner can manage commission entries" ON commission_entries;
DROP POLICY IF EXISTS "System can insert commission entries" ON commission_entries;
DROP POLICY IF EXISTS "Anyone can view commission entries" ON commission_entries;

-- More permissive RLS policies for commission_entries
CREATE POLICY "Anyone can view commission entries" ON commission_entries
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert commission entries" ON commission_entries
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can manage commission entries" ON commission_entries
  FOR ALL USING (auth.uid() IS NOT NULL);