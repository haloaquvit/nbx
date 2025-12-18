-- Add supplier fields to purchase_orders table
ALTER TABLE purchase_orders 
ADD COLUMN IF NOT EXISTS unit_price DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS supplier_name TEXT,
ADD COLUMN IF NOT EXISTS supplier_contact TEXT,
ADD COLUMN IF NOT EXISTS expected_delivery_date TIMESTAMPTZ;

-- Update existing records to have total_cost if missing (calculate from quantity * estimated unit price from materials)
UPDATE purchase_orders
SET total_cost = COALESCE(total_cost, (
  SELECT COALESCE(purchase_orders.quantity * m.price_per_unit, 0)
  FROM materials m
  WHERE m.id = purchase_orders.material_id
))
WHERE total_cost IS NULL;

-- Add index for supplier queries
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_name ON purchase_orders(supplier_name);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_expected_delivery_date ON purchase_orders(expected_delivery_date);