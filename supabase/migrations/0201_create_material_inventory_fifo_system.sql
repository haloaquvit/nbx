-- Create Material Inventory FIFO System
-- This enables tracking of material purchases with different prices and automatic FIFO cost calculation

-- 1. Create material_inventory_batches table to track each purchase batch with its price
CREATE TABLE IF NOT EXISTS public.material_inventory_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id),

  -- Purchase Order reference (if from PO)
  purchase_order_id TEXT REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  po_item_id TEXT, -- Reference to specific item in PO

  -- Batch details
  batch_number VARCHAR(50) UNIQUE NOT NULL, -- Auto-generated: MAT-2025-001
  purchase_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  quantity_received DECIMAL(15,4) NOT NULL CHECK (quantity_received > 0),
  quantity_remaining DECIMAL(15,4) NOT NULL CHECK (quantity_remaining >= 0),
  unit_price DECIMAL(15,2) NOT NULL CHECK (unit_price > 0), -- Price from PO

  -- Additional info
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  notes TEXT,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'depleted', 'expired')),

  -- Audit fields
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT quantity_check CHECK (quantity_remaining <= quantity_received)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_material_batches_material_id ON public.material_inventory_batches(material_id);
CREATE INDEX IF NOT EXISTS idx_material_batches_branch_id ON public.material_inventory_batches(branch_id);
CREATE INDEX IF NOT EXISTS idx_material_batches_po_id ON public.material_inventory_batches(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_material_batches_status ON public.material_inventory_batches(status);
CREATE INDEX IF NOT EXISTS idx_material_batches_purchase_date ON public.material_inventory_batches(purchase_date);

-- 2. Create material_usage_history table to track FIFO usage
CREATE TABLE IF NOT EXISTS public.material_usage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.material_inventory_batches(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id),

  -- Usage details
  usage_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  quantity_used DECIMAL(15,4) NOT NULL CHECK (quantity_used > 0),
  unit_price DECIMAL(15,2) NOT NULL, -- Price from the batch
  total_cost DECIMAL(15,2) NOT NULL, -- quantity_used * unit_price

  -- Reference to what used this material
  production_record_id UUID REFERENCES public.production_records(id) ON DELETE SET NULL,
  transaction_id UUID, -- If used for other purposes
  usage_type VARCHAR(50) DEFAULT 'production' CHECK (usage_type IN ('production', 'adjustment', 'waste', 'return')),

  -- Additional info
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for usage history
CREATE INDEX IF NOT EXISTS idx_material_usage_material_id ON public.material_usage_history(material_id);
CREATE INDEX IF NOT EXISTS idx_material_usage_batch_id ON public.material_usage_history(batch_id);
CREATE INDEX IF NOT EXISTS idx_material_usage_production_id ON public.material_usage_history(production_record_id);
CREATE INDEX IF NOT EXISTS idx_material_usage_date ON public.material_usage_history(usage_date);
CREATE INDEX IF NOT EXISTS idx_material_usage_branch_id ON public.material_usage_history(branch_id);

-- 3. Function to generate batch number
CREATE OR REPLACE FUNCTION generate_batch_number()
RETURNS TEXT AS $$
DECLARE
  new_number TEXT;
  counter INTEGER;
BEGIN
  -- Get the latest batch number for today
  SELECT COALESCE(
    MAX(
      CAST(
        SUBSTRING(batch_number FROM 'MAT-[0-9]{4}-([0-9]+)') AS INTEGER
      )
    ), 0
  ) INTO counter
  FROM public.material_inventory_batches
  WHERE DATE(purchase_date) = CURRENT_DATE;

  -- Increment counter
  counter := counter + 1;

  -- Generate new batch number: MAT-YYYY-NNN
  new_number := 'MAT-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(counter::TEXT, 3, '0');

  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- 4. Function to calculate FIFO cost for material usage
CREATE OR REPLACE FUNCTION calculate_fifo_cost(
  p_material_id UUID,
  p_quantity_needed DECIMAL,
  p_branch_id UUID DEFAULT NULL
)
RETURNS TABLE (
  batch_id UUID,
  quantity_from_batch DECIMAL,
  unit_price DECIMAL,
  batch_cost DECIMAL
) AS $$
DECLARE
  remaining_quantity DECIMAL := p_quantity_needed;
  batch_record RECORD;
BEGIN
  -- Loop through batches in FIFO order (oldest first)
  FOR batch_record IN
    SELECT
      b.id,
      b.quantity_remaining,
      b.unit_price,
      b.purchase_date
    FROM public.material_inventory_batches b
    WHERE b.material_id = p_material_id
      AND b.status = 'active'
      AND b.quantity_remaining > 0
      AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
    ORDER BY b.purchase_date ASC, b.created_at ASC
  LOOP
    -- If this batch can fulfill all remaining quantity
    IF batch_record.quantity_remaining >= remaining_quantity THEN
      RETURN QUERY SELECT
        batch_record.id,
        remaining_quantity,
        batch_record.unit_price,
        remaining_quantity * batch_record.unit_price;
      EXIT; -- Done
    ELSE
      -- Use all from this batch and continue to next
      RETURN QUERY SELECT
        batch_record.id,
        batch_record.quantity_remaining,
        batch_record.unit_price,
        batch_record.quantity_remaining * batch_record.unit_price;
      remaining_quantity := remaining_quantity - batch_record.quantity_remaining;
    END IF;
  END LOOP;

  -- If we still have remaining quantity, it means insufficient stock
  IF remaining_quantity > 0 THEN
    RAISE EXCEPTION 'Insufficient stock. Still need % units', remaining_quantity;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 5. Function to use material with FIFO costing
CREATE OR REPLACE FUNCTION use_material_fifo(
  p_material_id UUID,
  p_quantity DECIMAL,
  p_branch_id UUID,
  p_production_record_id UUID DEFAULT NULL,
  p_usage_type VARCHAR DEFAULT 'production',
  p_notes TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  fifo_result RECORD;
  total_cost DECIMAL := 0;
  usage_summary JSON;
  batch_array JSON[] := '{}';
BEGIN
  -- Calculate FIFO cost
  FOR fifo_result IN
    SELECT * FROM calculate_fifo_cost(p_material_id, p_quantity, p_branch_id)
  LOOP
    -- Deduct from batch
    UPDATE public.material_inventory_batches
    SET
      quantity_remaining = quantity_remaining - fifo_result.quantity_from_batch,
      status = CASE
        WHEN quantity_remaining - fifo_result.quantity_from_batch <= 0 THEN 'depleted'
        ELSE 'active'
      END,
      updated_at = NOW()
    WHERE id = fifo_result.batch_id;

    -- Record usage history
    INSERT INTO public.material_usage_history (
      material_id,
      batch_id,
      branch_id,
      quantity_used,
      unit_price,
      total_cost,
      production_record_id,
      usage_type,
      notes,
      created_by
    ) VALUES (
      p_material_id,
      fifo_result.batch_id,
      p_branch_id,
      fifo_result.quantity_from_batch,
      fifo_result.unit_price,
      fifo_result.batch_cost,
      p_production_record_id,
      p_usage_type,
      p_notes,
      p_user_id
    );

    -- Add to result array
    batch_array := batch_array || json_build_object(
      'batch_id', fifo_result.batch_id,
      'quantity', fifo_result.quantity_from_batch,
      'unit_price', fifo_result.unit_price,
      'cost', fifo_result.batch_cost
    )::JSON;

    total_cost := total_cost + fifo_result.batch_cost;
  END LOOP;

  -- Update material stock
  UPDATE public.materials
  SET
    stock = stock - p_quantity,
    updated_at = NOW()
  WHERE id = p_material_id;

  -- Return summary
  usage_summary := json_build_object(
    'material_id', p_material_id,
    'quantity_used', p_quantity,
    'total_cost', total_cost,
    'average_price', total_cost / p_quantity,
    'batches_used', batch_array
  );

  RETURN usage_summary;
END;
$$ LANGUAGE plpgsql;

-- 6. Trigger to auto-update batch status when quantity_remaining changes
CREATE OR REPLACE FUNCTION update_batch_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.quantity_remaining <= 0 THEN
    NEW.status := 'depleted';
  ELSIF NEW.quantity_remaining > 0 AND OLD.status = 'depleted' THEN
    NEW.status := 'active';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_batch_status
  BEFORE UPDATE ON public.material_inventory_batches
  FOR EACH ROW
  EXECUTE FUNCTION update_batch_status();

-- 7. Enable RLS
ALTER TABLE public.material_inventory_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_usage_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for material_inventory_batches
CREATE POLICY "Users can view batches in their branch"
  ON public.material_inventory_batches FOR SELECT
  USING (
    branch_id IN (
      SELECT id FROM public.branches
      WHERE id = (SELECT branch_id FROM public.profiles WHERE id = auth.uid())
    )
    OR auth.jwt() ->> 'role' IN ('owner', 'admin')
  );

CREATE POLICY "Authorized users can insert batches"
  ON public.material_inventory_batches FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authorized users can update batches"
  ON public.material_inventory_batches FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- RLS Policies for material_usage_history
CREATE POLICY "Users can view usage history in their branch"
  ON public.material_usage_history FOR SELECT
  USING (
    branch_id IN (
      SELECT id FROM public.branches
      WHERE id = (SELECT branch_id FROM public.profiles WHERE id = auth.uid())
    )
    OR auth.jwt() ->> 'role' IN ('owner', 'admin')
  );

CREATE POLICY "Authorized users can insert usage history"
  ON public.material_usage_history FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 8. Add helpful comments
COMMENT ON TABLE public.material_inventory_batches IS 'Tracks material inventory in batches with FIFO costing';
COMMENT ON TABLE public.material_usage_history IS 'Records material usage with actual cost from FIFO batches';
COMMENT ON FUNCTION calculate_fifo_cost IS 'Calculates the cost of using materials based on FIFO method';
COMMENT ON FUNCTION use_material_fifo IS 'Uses material and automatically applies FIFO costing';
COMMENT ON COLUMN public.material_inventory_batches.batch_number IS 'Auto-generated unique batch identifier';
COMMENT ON COLUMN public.material_inventory_batches.quantity_remaining IS 'Current available quantity in this batch (decreases as used)';
COMMENT ON COLUMN public.material_inventory_batches.unit_price IS 'Purchase price from PO - used for FIFO cost calculation';
