-- Migration 001: Create VIEW for derived product stock
-- Purpose: Make current_stock derived from inventory_batches instead of direct column
-- Date: 2026-01-03

-- View to calculate current stock from inventory batches (source of truth)
CREATE OR REPLACE VIEW v_product_current_stock AS
SELECT
  p.id as product_id,
  p.name as product_name,
  p.branch_id,
  p.current_stock as stored_stock,  -- Current value in products table
  COALESCE(SUM(ib.remaining_quantity), 0) as calculated_stock,  -- Derived from batches
  COALESCE(SUM(ib.remaining_quantity), 0) as current_stock,  -- Alias for app compatibility
  COALESCE(SUM(ib.remaining_quantity), 0) - p.current_stock as difference  -- Mismatch detection
FROM products p
LEFT JOIN inventory_batches ib ON ib.product_id = p.id AND ib.remaining_quantity > 0
GROUP BY p.id, p.name, p.branch_id, p.current_stock;

-- View to get stock mismatches only
CREATE OR REPLACE VIEW v_stock_mismatches AS
SELECT
  product_id,
  product_name,
  branch_id,
  stored_stock,
  calculated_stock,
  difference
FROM v_product_current_stock
WHERE difference != 0;

-- Function to get current stock for a product (use this instead of products.current_stock)
CREATE OR REPLACE FUNCTION get_product_stock(p_product_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_stock NUMERIC;
BEGIN
  SELECT COALESCE(SUM(remaining_quantity), 0)
  INTO v_stock
  FROM inventory_batches
  WHERE product_id = p_product_id
    AND remaining_quantity > 0;

  RETURN v_stock;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant permissions
GRANT SELECT ON v_product_current_stock TO authenticated;
GRANT SELECT ON v_stock_mismatches TO authenticated;
GRANT EXECUTE ON FUNCTION get_product_stock(UUID) TO authenticated;

COMMENT ON VIEW v_product_current_stock IS 'Derived product stock from inventory_batches - source of truth';
COMMENT ON VIEW v_stock_mismatches IS 'Products where stored stock differs from calculated stock';
COMMENT ON FUNCTION get_product_stock IS 'Get current stock for a product from inventory_batches';
