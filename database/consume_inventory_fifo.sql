-- ============================================================
-- RPC FUNCTION: consume_inventory_fifo
-- FIFO (First In First Out) inventory consumption for HPP calculation
-- Supports both products (p_product_id) and materials (p_material_id)
-- ============================================================

-- Drop function lama jika ada
DROP FUNCTION IF EXISTS consume_inventory_fifo(uuid, uuid, numeric, text, uuid);

CREATE OR REPLACE FUNCTION public.consume_inventory_fifo(
  p_product_id UUID DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_quantity NUMERIC DEFAULT 0,
  p_transaction_id TEXT DEFAULT NULL,
  p_material_id UUID DEFAULT NULL
)
RETURNS TABLE (
  total_hpp NUMERIC,
  batches_consumed JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining_qty NUMERIC;
  batch_record RECORD;
  consume_qty NUMERIC;
  total_cost NUMERIC := 0;
  consumed_batches JSONB := '[]'::JSONB;
BEGIN
  remaining_qty := p_quantity;

  -- Validate input: must have either product_id or material_id
  IF p_product_id IS NULL AND p_material_id IS NULL THEN
    RETURN QUERY SELECT 0::NUMERIC, '[]'::JSONB;
    RETURN;
  END IF;

  -- Loop through batches in FIFO order (oldest first based on batch_date)
  FOR batch_record IN
    SELECT
      id,
      remaining_quantity,
      unit_cost,
      notes,
      batch_date
    FROM inventory_batches
    WHERE
      -- Match by product_id OR material_id
      (p_product_id IS NOT NULL AND product_id = p_product_id)
      OR (p_material_id IS NOT NULL AND material_id = p_material_id)
    AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND remaining_quantity > 0
    ORDER BY batch_date ASC, created_at ASC
  LOOP
    -- Calculate how much to consume from this batch
    IF remaining_qty <= 0 THEN
      EXIT;
    END IF;

    IF batch_record.remaining_quantity >= remaining_qty THEN
      consume_qty := remaining_qty;
    ELSE
      consume_qty := batch_record.remaining_quantity;
    END IF;

    -- Calculate cost for this batch
    total_cost := total_cost + (consume_qty * COALESCE(batch_record.unit_cost, 0));

    -- Update batch remaining quantity
    UPDATE inventory_batches
    SET remaining_quantity = remaining_quantity - consume_qty,
        updated_at = NOW()
    WHERE id = batch_record.id;

    -- Log the consumption
    consumed_batches := consumed_batches || jsonb_build_object(
      'batch_id', batch_record.id,
      'quantity', consume_qty,
      'unit_cost', batch_record.unit_cost,
      'subtotal', consume_qty * COALESCE(batch_record.unit_cost, 0),
      'notes', batch_record.notes
    );

    remaining_qty := remaining_qty - consume_qty;
  END LOOP;

  -- Return result
  RETURN QUERY SELECT total_cost, consumed_batches;
END;
$$;

-- Grant execute to authenticated role
GRANT EXECUTE ON FUNCTION public.consume_inventory_fifo(UUID, UUID, NUMERIC, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_inventory_fifo(UUID, UUID, NUMERIC, TEXT, UUID) TO anon;

-- ============================================================
-- Ensure inventory_batches table has material_id column
-- ============================================================
DO $$
BEGIN
  -- Add material_id column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_batches' AND column_name = 'material_id'
  ) THEN
    ALTER TABLE inventory_batches ADD COLUMN material_id UUID REFERENCES materials(id) ON DELETE CASCADE;
    CREATE INDEX idx_inventory_batches_material_id ON inventory_batches(material_id);
    RAISE NOTICE 'Added material_id column to inventory_batches';
  END IF;

  -- Add production_id column if not exists (for tracking production batches)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_batches' AND column_name = 'production_id'
  ) THEN
    ALTER TABLE inventory_batches ADD COLUMN production_id UUID;
    CREATE INDEX idx_inventory_batches_production_id ON inventory_batches(production_id);
    RAISE NOTICE 'Added production_id column to inventory_batches';
  END IF;

  -- Add supplier_id column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_batches' AND column_name = 'supplier_id'
  ) THEN
    ALTER TABLE inventory_batches ADD COLUMN supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;
    CREATE INDEX idx_inventory_batches_supplier_id ON inventory_batches(supplier_id);
    RAISE NOTICE 'Added supplier_id column to inventory_batches';
  END IF;

  -- Add purchase_order_id column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_batches' AND column_name = 'purchase_order_id'
  ) THEN
    ALTER TABLE inventory_batches ADD COLUMN purchase_order_id TEXT;
    CREATE INDEX idx_inventory_batches_po_id ON inventory_batches(purchase_order_id);
    RAISE NOTICE 'Added purchase_order_id column to inventory_batches';
  END IF;

  -- Add batch_date column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_batches' AND column_name = 'batch_date'
  ) THEN
    ALTER TABLE inventory_batches ADD COLUMN batch_date TIMESTAMPTZ DEFAULT NOW();
    CREATE INDEX idx_inventory_batches_batch_date ON inventory_batches(batch_date);
    RAISE NOTICE 'Added batch_date column to inventory_batches';
  END IF;
END $$;

-- ============================================================
-- Create initial batches for existing materials that have stock but no batches
-- This ensures FIFO works for materials that were in stock before batch tracking
-- Uses price_per_unit as the unit_cost for initial stock
-- ============================================================
DO $$
DECLARE
  mat RECORD;
  branch_rec RECORD;
BEGIN
  -- For each material with stock > 0 that doesn't have any batches
  FOR mat IN
    SELECT m.id, m.name, m.stock, m.price_per_unit
    FROM materials m
    WHERE m.stock > 0
    AND NOT EXISTS (
      SELECT 1 FROM inventory_batches ib
      WHERE ib.material_id = m.id AND ib.remaining_quantity > 0
    )
  LOOP
    -- Get first branch (or use NULL for global)
    SELECT id INTO branch_rec FROM branches LIMIT 1;

    -- Create initial batch with price_per_unit as unit_cost
    INSERT INTO inventory_batches (
      material_id,
      branch_id,
      initial_quantity,
      remaining_quantity,
      unit_cost,
      batch_date,
      notes
    ) VALUES (
      mat.id,
      branch_rec.id,
      mat.stock,
      mat.stock,
      COALESCE(mat.price_per_unit, 0),
      NOW() - INTERVAL '1 year', -- Set date to 1 year ago so it's consumed first (FIFO)
      'Stok Awal - ' || mat.name
    );

    RAISE NOTICE 'Created initial batch for material: % with % units @ Rp%/unit', mat.name, mat.stock, mat.price_per_unit;
  END LOOP;
END $$;

-- ============================================================
-- Verify the function works
-- ============================================================
-- Test: SELECT * FROM consume_inventory_fifo(NULL, NULL, 10, 'test', 'material-uuid-here');
