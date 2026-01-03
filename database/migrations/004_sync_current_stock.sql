-- Migration 004: Sync current_stock with SUM(inventory_batches)
-- Purpose: Fix any mismatches between stored stock and calculated stock
-- Date: 2026-01-03

-- First, let's see the current state (for logging)
DO $$
DECLARE
  v_mismatch_count INTEGER;
  v_product RECORD;
BEGIN
  -- Count mismatches before sync
  SELECT COUNT(*)
  INTO v_mismatch_count
  FROM products p
  LEFT JOIN (
    SELECT product_id, SUM(remaining_quantity) as batch_stock
    FROM inventory_batches
    WHERE remaining_quantity > 0
    GROUP BY product_id
  ) ib ON ib.product_id = p.id
  WHERE p.current_stock != COALESCE(ib.batch_stock, 0);

  RAISE NOTICE 'Found % products with stock mismatch before sync', v_mismatch_count;

  -- Log each mismatch
  FOR v_product IN
    SELECT
      p.id,
      p.name,
      p.current_stock as stored,
      COALESCE(ib.batch_stock, 0) as calculated
    FROM products p
    LEFT JOIN (
      SELECT product_id, SUM(remaining_quantity) as batch_stock
      FROM inventory_batches
      WHERE remaining_quantity > 0
      GROUP BY product_id
    ) ib ON ib.product_id = p.id
    WHERE p.current_stock != COALESCE(ib.batch_stock, 0)
    LIMIT 50
  LOOP
    RAISE NOTICE 'Mismatch: % - stored: %, calculated: %',
      v_product.name, v_product.stored, v_product.calculated;
  END LOOP;
END $$;

-- Sync current_stock with calculated stock from batches
UPDATE products p
SET
  current_stock = COALESCE(batch_calc.calculated_stock, 0),
  updated_at = NOW()
FROM (
  SELECT
    product_id,
    SUM(remaining_quantity) as calculated_stock
  FROM inventory_batches
  WHERE remaining_quantity > 0
  GROUP BY product_id
) batch_calc
WHERE p.id = batch_calc.product_id
  AND p.current_stock != batch_calc.calculated_stock;

-- Also set to 0 for products with no batches
UPDATE products p
SET
  current_stock = 0,
  updated_at = NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_batches ib
  WHERE ib.product_id = p.id
    AND ib.remaining_quantity > 0
)
AND p.current_stock != 0;

-- Verify sync completed
DO $$
DECLARE
  v_mismatch_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_mismatch_count
  FROM products p
  LEFT JOIN (
    SELECT product_id, SUM(remaining_quantity) as batch_stock
    FROM inventory_batches
    WHERE remaining_quantity > 0
    GROUP BY product_id
  ) ib ON ib.product_id = p.id
  WHERE p.current_stock != COALESCE(ib.batch_stock, 0);

  IF v_mismatch_count = 0 THEN
    RAISE NOTICE 'SUCCESS: All product stocks are now in sync with inventory batches';
  ELSE
    RAISE WARNING 'WARNING: Still % products with mismatch after sync', v_mismatch_count;
  END IF;
END $$;

-- Create trigger to auto-sync current_stock when batches change (optional but recommended)
CREATE OR REPLACE FUNCTION sync_product_stock_from_batches()
RETURNS TRIGGER AS $$
BEGIN
  -- Update current_stock in products table
  UPDATE products
  SET
    current_stock = COALESCE((
      SELECT SUM(remaining_quantity)
      FROM inventory_batches
      WHERE product_id = COALESCE(NEW.product_id, OLD.product_id)
        AND remaining_quantity > 0
    ), 0),
    updated_at = NOW()
  WHERE id = COALESCE(NEW.product_id, OLD.product_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists then create
DROP TRIGGER IF EXISTS trigger_sync_product_stock ON inventory_batches;

CREATE TRIGGER trigger_sync_product_stock
AFTER INSERT OR UPDATE OR DELETE ON inventory_batches
FOR EACH ROW
EXECUTE FUNCTION sync_product_stock_from_batches();

COMMENT ON FUNCTION sync_product_stock_from_batches IS 'Auto-sync products.current_stock when inventory_batches changes';
