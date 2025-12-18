-- Create purchase_order_items table to support multiple items per PO
-- This migration transforms the old single-item PO system to multi-item system

-- 1. Create purchase_order_items table
CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  purchase_order_id TEXT NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  material_id UUID REFERENCES public.materials(id) ON DELETE SET NULL,

  -- Item details
  quantity DECIMAL(15,4) NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(15,2) NOT NULL CHECK (unit_price >= 0),
  quantity_received DECIMAL(15,4), -- Actual quantity received

  -- Additional info
  notes TEXT,

  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create indexes
CREATE INDEX IF NOT EXISTS idx_po_items_purchase_order_id ON public.purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_po_items_material_id ON public.purchase_order_items(material_id);

-- 3. Enable RLS
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS policies (same as purchase_orders)
CREATE POLICY "Users can view PO items in their branch or if admin/owner"
  ON public.purchase_order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
      AND (
        po.branch_id IN (
          SELECT id FROM public.branches
          WHERE id = (SELECT branch_id FROM public.profiles WHERE id = auth.uid())
        )
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin', 'super_admin', 'head_office_admin')
      )
    )
  );

CREATE POLICY "Authorized users can insert PO items"
  ON public.purchase_order_items FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authorized users can update PO items"
  ON public.purchase_order_items FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authorized users can delete PO items"
  ON public.purchase_order_items FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- 5. Migrate existing purchase_orders data to purchase_order_items
-- For each existing PO, create one item in purchase_order_items
INSERT INTO public.purchase_order_items (
  id,
  purchase_order_id,
  material_id,
  quantity,
  unit_price,
  quantity_received,
  notes,
  created_at
)
SELECT
  gen_random_uuid()::TEXT,
  po.id,
  po.material_id,
  COALESCE(po.quantity, 0),
  CASE
    -- Try to get unit price from total_cost / quantity
    WHEN po.total_cost IS NOT NULL AND po.quantity IS NOT NULL AND po.quantity > 0
    THEN po.total_cost / po.quantity
    -- Fallback to material price
    WHEN po.material_id IS NOT NULL
    THEN COALESCE((SELECT price_per_unit FROM public.materials WHERE id = po.material_id), 0)
    -- Final fallback
    ELSE 0
  END,
  po.received_quantity,
  po.notes,
  po.created_at
FROM public.purchase_orders po
WHERE po.material_id IS NOT NULL
  AND NOT EXISTS (
    -- Don't migrate if items already exist for this PO
    SELECT 1 FROM public.purchase_order_items poi
    WHERE poi.purchase_order_id = po.id
  );

-- 6. Add new fields to purchase_orders for multi-item support
ALTER TABLE public.purchase_orders
ADD COLUMN IF NOT EXISTS po_number VARCHAR(50) UNIQUE,
ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id),
ADD COLUMN IF NOT EXISTS order_date TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS expected_delivery_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS include_ppn BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ppn_amount DECIMAL(15,2) DEFAULT 0;

-- 7. Generate PO numbers for existing records without one
DO $$
DECLARE
  po_record RECORD;
  counter INTEGER := 1;
BEGIN
  FOR po_record IN
    SELECT id, created_at
    FROM public.purchase_orders
    WHERE po_number IS NULL
    ORDER BY created_at
  LOOP
    UPDATE public.purchase_orders
    SET po_number = 'PO-' || TO_CHAR(po_record.created_at, 'YYYY') || '-' || LPAD(counter::TEXT, 4, '0')
    WHERE id = po_record.id;

    counter := counter + 1;
  END LOOP;
END $$;

-- 8. Create function to generate next PO number
CREATE OR REPLACE FUNCTION generate_po_number()
RETURNS TEXT AS $$
DECLARE
  new_number TEXT;
  counter INTEGER;
BEGIN
  -- Get the latest PO number for current year
  SELECT COALESCE(
    MAX(
      CAST(
        SUBSTRING(po_number FROM 'PO-[0-9]{4}-([0-9]+)') AS INTEGER
      )
    ), 0
  ) INTO counter
  FROM public.purchase_orders
  WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE);

  -- Increment counter
  counter := counter + 1;

  -- Generate new PO number: PO-YYYY-NNNN
  new_number := 'PO-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(counter::TEXT, 4, '0');

  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- 9. Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_po_items_updated_at
  BEFORE UPDATE ON public.purchase_order_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_po_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 10. Add helpful comments
COMMENT ON TABLE public.purchase_order_items IS 'Items within a purchase order - supports multiple materials per PO';
COMMENT ON COLUMN public.purchase_order_items.quantity IS 'Ordered quantity';
COMMENT ON COLUMN public.purchase_order_items.quantity_received IS 'Actually received quantity (may differ from ordered)';
COMMENT ON COLUMN public.purchase_order_items.unit_price IS 'Price per unit (before tax)';
COMMENT ON COLUMN public.purchase_orders.po_number IS 'Unique PO number (PO-YYYY-NNNN)';
COMMENT ON FUNCTION generate_po_number IS 'Generates next sequential PO number for current year';

-- 11. Create view for PO with items summary
CREATE OR REPLACE VIEW purchase_orders_with_items AS
SELECT
  po.id,
  po.po_number,
  po.order_date,
  po.status,
  po.branch_id,
  b.name as branch_name,
  po.supplier_id,
  s.name as supplier_name,
  COUNT(poi.id) as items_count,
  SUM(poi.quantity * poi.unit_price) as calculated_total,
  po.total_cost as original_total_cost,
  po.notes,
  po.created_at,
  po.updated_at
FROM public.purchase_orders po
LEFT JOIN public.branches b ON po.branch_id = b.id
LEFT JOIN public.suppliers s ON po.supplier_id = s.id
LEFT JOIN public.purchase_order_items poi ON po.id = poi.purchase_order_id
GROUP BY po.id, po.po_number, po.order_date, po.status, po.branch_id, b.name,
         po.supplier_id, s.name, po.total_cost, po.notes, po.created_at, po.updated_at;

COMMENT ON VIEW purchase_orders_with_items IS 'Purchase orders with aggregated items summary';
