-- Fix commission trigger - remove sku reference since it doesn't exist in products table
CREATE OR REPLACE FUNCTION populate_commission_product_info()
RETURNS TRIGGER AS $$
BEGIN
  -- Try to get product info from products table (remove sku reference)
  SELECT p.name 
  INTO NEW.product_name
  FROM products p 
  WHERE p.id = NEW.product_id;
  
  -- Set product_sku to product_id since sku column doesn't exist in products
  NEW.product_sku = NEW.product_id;
  
  -- If product name not found, use product_id as fallback
  IF NEW.product_name IS NULL THEN
    NEW.product_name = COALESCE(NEW.product_name, NEW.product_id);
  END IF;
  
  NEW.updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;