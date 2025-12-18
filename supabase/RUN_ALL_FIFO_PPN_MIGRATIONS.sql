-- ============================================================================
-- FIFO + PPN SYSTEM - COMPLETE MIGRATIONS
-- ============================================================================
-- Jalankan script ini SEKALI di Supabase SQL Editor
-- URL: https://supabase.com/dashboard/project/emfvoassfrsokqwspuml/sql/new
-- ============================================================================

-- ============================================================================
-- MIGRATION 1: Create Purchase Order Items Table
-- ============================================================================

-- 1. Create purchase_order_items table
CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  purchase_order_id TEXT NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  material_id UUID REFERENCES public.materials(id) ON DELETE SET NULL,
  quantity DECIMAL(15,4) NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(15,2) NOT NULL CHECK (unit_price >= 0),
  quantity_received DECIMAL(15,4),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_po_items_purchase_order_id ON public.purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_po_items_material_id ON public.purchase_order_items(material_id);

ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

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

-- Migrate existing POs to items (safe version - handles missing received_quantity column)
DO $$
DECLARE
  has_received_qty BOOLEAN;
BEGIN
  -- Check if received_quantity column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'purchase_orders'
    AND column_name = 'received_quantity'
  ) INTO has_received_qty;

  -- Migrate with or without received_quantity
  IF has_received_qty THEN
    INSERT INTO public.purchase_order_items (
      id, purchase_order_id, material_id, quantity, unit_price, quantity_received, notes, created_at
    )
    SELECT
      gen_random_uuid()::TEXT,
      po.id,
      po.material_id,
      COALESCE(po.quantity, 0),
      CASE
        WHEN po.total_cost IS NOT NULL AND po.quantity IS NOT NULL AND po.quantity > 0
        THEN po.total_cost / po.quantity
        WHEN po.material_id IS NOT NULL
        THEN COALESCE((SELECT price_per_unit FROM public.materials WHERE id = po.material_id), 0)
        ELSE 0
      END,
      COALESCE(po.received_quantity, po.quantity),
      po.notes,
      po.created_at
    FROM public.purchase_orders po
    WHERE po.material_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.purchase_order_items poi WHERE poi.purchase_order_id = po.id)
    ON CONFLICT (id) DO NOTHING;
  ELSE
    INSERT INTO public.purchase_order_items (
      id, purchase_order_id, material_id, quantity, unit_price, quantity_received, notes, created_at
    )
    SELECT
      gen_random_uuid()::TEXT,
      po.id,
      po.material_id,
      COALESCE(po.quantity, 0),
      CASE
        WHEN po.total_cost IS NOT NULL AND po.quantity IS NOT NULL AND po.quantity > 0
        THEN po.total_cost / po.quantity
        WHEN po.material_id IS NOT NULL
        THEN COALESCE((SELECT price_per_unit FROM public.materials WHERE id = po.material_id), 0)
        ELSE 0
      END,
      po.quantity, -- No received_quantity column, use quantity
      po.notes,
      po.created_at
    FROM public.purchase_orders po
    WHERE po.material_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.purchase_order_items poi WHERE poi.purchase_order_id = po.id)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- Add new fields to purchase_orders
ALTER TABLE public.purchase_orders
ADD COLUMN IF NOT EXISTS po_number VARCHAR(50) UNIQUE,
ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id),
ADD COLUMN IF NOT EXISTS order_date TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS expected_delivery_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Generate PO numbers
DO $$
DECLARE
  po_record RECORD;
  counter INTEGER := 1;
BEGIN
  FOR po_record IN
    SELECT id, created_at FROM public.purchase_orders WHERE po_number IS NULL ORDER BY created_at
  LOOP
    UPDATE public.purchase_orders
    SET po_number = 'PO-' || TO_CHAR(po_record.created_at, 'YYYY') || '-' || LPAD(counter::TEXT, 4, '0')
    WHERE id = po_record.id;
    counter := counter + 1;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION generate_po_number()
RETURNS TEXT AS $$
DECLARE
  new_number TEXT;
  counter INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(po_number FROM 'PO-[0-9]{4}-([0-9]+)') AS INTEGER)), 0) INTO counter
  FROM public.purchase_orders WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE);
  counter := counter + 1;
  new_number := 'PO-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(counter::TEXT, 4, '0');
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_po_items_updated_at
  BEFORE UPDATE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_po_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE VIEW purchase_orders_with_items AS
SELECT po.id, po.po_number, po.order_date, po.status, po.branch_id, b.name as branch_name,
       po.supplier_id, s.name as supplier_name, COUNT(poi.id) as items_count,
       SUM(poi.quantity * poi.unit_price) as calculated_total, po.total_cost as original_total_cost,
       po.notes, po.created_at, po.updated_at
FROM public.purchase_orders po
LEFT JOIN public.branches b ON po.branch_id = b.id
LEFT JOIN public.suppliers s ON po.supplier_id = s.id
LEFT JOIN public.purchase_order_items poi ON po.id = poi.purchase_order_id
GROUP BY po.id, po.po_number, po.order_date, po.status, po.branch_id, b.name,
         po.supplier_id, s.name, po.total_cost, po.notes, po.created_at, po.updated_at;

-- ============================================================================
-- MIGRATION 2: Create FIFO Inventory System
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.material_inventory_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id),
  purchase_order_id TEXT REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  po_item_id TEXT,
  batch_number VARCHAR(50) UNIQUE NOT NULL,
  purchase_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  quantity_received DECIMAL(15,4) NOT NULL CHECK (quantity_received > 0),
  quantity_remaining DECIMAL(15,4) NOT NULL CHECK (quantity_remaining >= 0),
  unit_price DECIMAL(15,2) NOT NULL CHECK (unit_price > 0),
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  notes TEXT,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'depleted', 'expired')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT quantity_check CHECK (quantity_remaining <= quantity_received)
);

CREATE INDEX IF NOT EXISTS idx_material_batches_material_id ON public.material_inventory_batches(material_id);
CREATE INDEX IF NOT EXISTS idx_material_batches_branch_id ON public.material_inventory_batches(branch_id);
CREATE INDEX IF NOT EXISTS idx_material_batches_po_id ON public.material_inventory_batches(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_material_batches_status ON public.material_inventory_batches(status);
CREATE INDEX IF NOT EXISTS idx_material_batches_purchase_date ON public.material_inventory_batches(purchase_date);

CREATE TABLE IF NOT EXISTS public.material_usage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.material_inventory_batches(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id),
  usage_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  quantity_used DECIMAL(15,4) NOT NULL CHECK (quantity_used > 0),
  unit_price DECIMAL(15,2) NOT NULL,
  total_cost DECIMAL(15,2) NOT NULL,
  production_record_id UUID REFERENCES public.production_records(id) ON DELETE SET NULL,
  transaction_id UUID,
  usage_type VARCHAR(50) DEFAULT 'production' CHECK (usage_type IN ('production', 'adjustment', 'waste', 'return')),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_material_usage_material_id ON public.material_usage_history(material_id);
CREATE INDEX IF NOT EXISTS idx_material_usage_batch_id ON public.material_usage_history(batch_id);
CREATE INDEX IF NOT EXISTS idx_material_usage_production_id ON public.material_usage_history(production_record_id);
CREATE INDEX IF NOT EXISTS idx_material_usage_date ON public.material_usage_history(usage_date);
CREATE INDEX IF NOT EXISTS idx_material_usage_branch_id ON public.material_usage_history(branch_id);

CREATE OR REPLACE FUNCTION generate_batch_number()
RETURNS TEXT AS $$
DECLARE
  new_number TEXT;
  counter INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(batch_number FROM 'MAT-[0-9]{4}-([0-9]+)') AS INTEGER)), 0) INTO counter
  FROM public.material_inventory_batches WHERE DATE(purchase_date) = CURRENT_DATE;
  counter := counter + 1;
  new_number := 'MAT-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(counter::TEXT, 3, '0');
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

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
  FOR batch_record IN
    SELECT b.id, b.quantity_remaining, b.unit_price, b.purchase_date
    FROM public.material_inventory_batches b
    WHERE b.material_id = p_material_id AND b.status = 'active' AND b.quantity_remaining > 0
      AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
    ORDER BY b.purchase_date ASC, b.created_at ASC
  LOOP
    IF batch_record.quantity_remaining >= remaining_quantity THEN
      RETURN QUERY SELECT batch_record.id, remaining_quantity, batch_record.unit_price, remaining_quantity * batch_record.unit_price;
      EXIT;
    ELSE
      RETURN QUERY SELECT batch_record.id, batch_record.quantity_remaining, batch_record.unit_price, batch_record.quantity_remaining * batch_record.unit_price;
      remaining_quantity := remaining_quantity - batch_record.quantity_remaining;
    END IF;
  END LOOP;
  IF remaining_quantity > 0 THEN
    RAISE EXCEPTION 'Insufficient stock. Still need % units', remaining_quantity;
  END IF;
END;
$$ LANGUAGE plpgsql;

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
  FOR fifo_result IN SELECT * FROM calculate_fifo_cost(p_material_id, p_quantity, p_branch_id)
  LOOP
    UPDATE public.material_inventory_batches
    SET quantity_remaining = quantity_remaining - fifo_result.quantity_from_batch,
        status = CASE WHEN quantity_remaining - fifo_result.quantity_from_batch <= 0 THEN 'depleted' ELSE 'active' END,
        updated_at = NOW()
    WHERE id = fifo_result.batch_id;

    INSERT INTO public.material_usage_history (
      material_id, batch_id, branch_id, quantity_used, unit_price, total_cost,
      production_record_id, usage_type, notes, created_by
    ) VALUES (
      p_material_id, fifo_result.batch_id, p_branch_id, fifo_result.quantity_from_batch,
      fifo_result.unit_price, fifo_result.batch_cost, p_production_record_id,
      p_usage_type, p_notes, p_user_id
    );

    batch_array := batch_array || json_build_object(
      'batch_id', fifo_result.batch_id, 'quantity', fifo_result.quantity_from_batch,
      'unit_price', fifo_result.unit_price, 'cost', fifo_result.batch_cost
    )::JSON;

    total_cost := total_cost + fifo_result.batch_cost;
  END LOOP;

  UPDATE public.materials SET stock = stock - p_quantity, updated_at = NOW() WHERE id = p_material_id;

  usage_summary := json_build_object(
    'material_id', p_material_id, 'quantity_used', p_quantity,
    'total_cost', total_cost, 'average_price', total_cost / p_quantity, 'batches_used', batch_array
  );

  RETURN usage_summary;
END;
$$ LANGUAGE plpgsql;

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
  FOR EACH ROW EXECUTE FUNCTION update_batch_status();

ALTER TABLE public.material_inventory_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_usage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view batches in their branch"
  ON public.material_inventory_batches FOR SELECT
  USING (
    branch_id IN (SELECT id FROM public.branches WHERE id = (SELECT branch_id FROM public.profiles WHERE id = auth.uid()))
    OR auth.jwt() ->> 'role' IN ('owner', 'admin')
  );

CREATE POLICY "Authorized users can insert batches"
  ON public.material_inventory_batches FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authorized users can update batches"
  ON public.material_inventory_batches FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view usage history in their branch"
  ON public.material_usage_history FOR SELECT
  USING (
    branch_id IN (SELECT id FROM public.branches WHERE id = (SELECT branch_id FROM public.profiles WHERE id = auth.uid()))
    OR auth.jwt() ->> 'role' IN ('owner', 'admin')
  );

CREATE POLICY "Authorized users can insert usage history"
  ON public.material_usage_history FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================================
-- MIGRATION 3: Integrate PO with FIFO
-- ============================================================================

CREATE OR REPLACE FUNCTION create_batch_from_po_receipt()
RETURNS TRIGGER AS $$
DECLARE
  batch_num TEXT;
  po_record RECORD;
BEGIN
  IF NEW.status IN ('received', 'partially_received') AND
     (OLD.status IS NULL OR OLD.status NOT IN ('received', 'partially_received')) THEN

    SELECT po.supplier_id, po.branch_id, po.order_date INTO po_record
    FROM public.purchase_orders po WHERE po.id = NEW.id;

    batch_num := generate_batch_number();

    INSERT INTO public.material_inventory_batches (
      material_id, branch_id, purchase_order_id, po_item_id, batch_number,
      purchase_date, quantity_received, quantity_remaining, unit_price,
      supplier_id, notes, created_by
    )
    SELECT
      poi.material_id, po_record.branch_id, NEW.id, poi.id,
      batch_num || '-' || ROW_NUMBER() OVER (ORDER BY poi.id),
      COALESCE(po_record.order_date, NOW()),
      COALESCE(poi.quantity_received, poi.quantity),
      COALESCE(poi.quantity_received, poi.quantity),
      poi.unit_price, po_record.supplier_id,
      'Auto-created from PO #' || NEW.po_number ||
      CASE WHEN poi.is_taxable THEN ' | PPN ' || poi.tax_percentage || '% = Rp ' || COALESCE(poi.tax_amount, 0)
           ELSE ' | Non-PPN' END,
      NEW.approved_by
    FROM public.purchase_order_items poi
    WHERE poi.purchase_order_id = NEW.id;

    RAISE NOTICE 'Created inventory batches for PO %', NEW.po_number;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_batch_from_po
  AFTER INSERT OR UPDATE OF status ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION create_batch_from_po_receipt();

CREATE OR REPLACE FUNCTION get_material_stock_with_batches(
  p_material_id UUID,
  p_branch_id UUID DEFAULT NULL
)
RETURNS TABLE (
  material_id UUID, material_name TEXT, total_quantity DECIMAL, total_value DECIMAL,
  weighted_avg_price DECIMAL, batch_count INTEGER, oldest_batch_date TIMESTAMP,
  newest_batch_date TIMESTAMP, batch_details JSON
) AS $$
BEGIN
  RETURN QUERY
  SELECT m.id, m.name,
    COALESCE(SUM(b.quantity_remaining), 0) as total_qty,
    COALESCE(SUM(b.quantity_remaining * b.unit_price), 0) as total_val,
    CASE WHEN SUM(b.quantity_remaining) > 0
         THEN SUM(b.quantity_remaining * b.unit_price) / SUM(b.quantity_remaining) ELSE 0 END as weighted_avg,
    COUNT(b.id)::INTEGER as batch_cnt,
    MIN(b.purchase_date) as oldest, MAX(b.purchase_date) as newest,
    COALESCE(json_agg(json_build_object(
      'batch_id', b.id, 'batch_number', b.batch_number, 'purchase_date', b.purchase_date,
      'quantity_remaining', b.quantity_remaining, 'unit_price', b.unit_price,
      'supplier_id', b.supplier_id, 'po_number', po.po_number
    ) ORDER BY b.purchase_date, b.created_at) FILTER (WHERE b.id IS NOT NULL), '[]'::JSON) as batches
  FROM public.materials m
  LEFT JOIN public.material_inventory_batches b ON m.id = b.material_id
    AND b.status = 'active' AND b.quantity_remaining > 0
    AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
  LEFT JOIN public.purchase_orders po ON b.purchase_order_id = po.id
  WHERE m.id = p_material_id
  GROUP BY m.id, m.name;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_production_hpp_detail(p_production_record_id UUID)
RETURNS TABLE (
  material_id UUID, material_name TEXT, total_quantity_used DECIMAL,
  total_cost DECIMAL, avg_cost_per_unit DECIMAL, batch_breakdown JSON
) AS $$
BEGIN
  RETURN QUERY
  SELECT m.id, m.name, SUM(uh.quantity_used) as qty_used, SUM(uh.total_cost) as cost,
    CASE WHEN SUM(uh.quantity_used) > 0 THEN SUM(uh.total_cost) / SUM(uh.quantity_used) ELSE 0 END as avg_cost,
    json_agg(json_build_object(
      'batch_number', b.batch_number, 'quantity_used', uh.quantity_used,
      'unit_price', uh.unit_price, 'cost', uh.total_cost,
      'usage_date', uh.usage_date, 'purchase_date', b.purchase_date
    ) ORDER BY uh.usage_date) as breakdown
  FROM public.material_usage_history uh
  JOIN public.materials m ON uh.material_id = m.id
  JOIN public.material_inventory_batches b ON uh.batch_id = b.id
  WHERE uh.production_record_id = p_production_record_id
  GROUP BY m.id, m.name ORDER BY m.name;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE VIEW material_inventory_summary AS
SELECT m.id as material_id, m.name as material_name, m.unit, m.branch_id, b.name as branch_name,
  COUNT(DISTINCT mib.id) as active_batch_count,
  SUM(mib.quantity_remaining) as total_quantity_available,
  SUM(mib.quantity_remaining * mib.unit_price) as total_inventory_value,
  CASE WHEN SUM(mib.quantity_remaining) > 0
       THEN SUM(mib.quantity_remaining * mib.unit_price) / SUM(mib.quantity_remaining) ELSE 0 END as weighted_average_cost,
  MIN(mib.unit_price) as lowest_unit_price, MAX(mib.unit_price) as highest_unit_price,
  MIN(mib.purchase_date) as oldest_batch_date, MAX(mib.purchase_date) as newest_batch_date
FROM public.materials m
LEFT JOIN public.branches b ON m.branch_id = b.id
LEFT JOIN public.material_inventory_batches mib ON m.id = mib.material_id
  AND mib.status = 'active' AND mib.quantity_remaining > 0
GROUP BY m.id, m.name, m.unit, m.branch_id, b.name;

-- ============================================================================
-- MIGRATION 4: Add PPN Tax Tracking
-- ============================================================================

ALTER TABLE public.purchase_order_items
ADD COLUMN IF NOT EXISTS is_taxable BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS tax_percentage DECIMAL(5,2) DEFAULT 11.00 CHECK (tax_percentage >= 0 AND tax_percentage <= 100),
ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS subtotal DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_with_tax DECIMAL(15,2) DEFAULT 0;

ALTER TABLE public.purchase_orders
ADD COLUMN IF NOT EXISTS subtotal_amount DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_amount DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS tax_invoice_number VARCHAR(100),
ADD COLUMN IF NOT EXISTS tax_invoice_date DATE,
ADD COLUMN IF NOT EXISTS tax_notes TEXT;

CREATE OR REPLACE FUNCTION calculate_po_item_totals()
RETURNS TRIGGER AS $$
BEGIN
  NEW.subtotal := NEW.unit_price * NEW.quantity;
  IF NEW.is_taxable THEN
    NEW.tax_amount := NEW.subtotal * (NEW.tax_percentage / 100);
  ELSE
    NEW.tax_amount := 0;
  END IF;
  NEW.total_with_tax := NEW.subtotal + NEW.tax_amount;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_po_item_totals
  BEFORE INSERT OR UPDATE OF unit_price, quantity, is_taxable, tax_percentage
  ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION calculate_po_item_totals();

CREATE OR REPLACE FUNCTION calculate_po_summary_totals()
RETURNS TRIGGER AS $$
DECLARE
  po_id TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    po_id := OLD.purchase_order_id;
  ELSE
    po_id := NEW.purchase_order_id;
  END IF;

  UPDATE public.purchase_orders
  SET
    subtotal_amount = COALESCE((SELECT SUM(subtotal) FROM public.purchase_order_items WHERE purchase_order_id = po_id), 0),
    tax_amount = COALESCE((SELECT SUM(tax_amount) FROM public.purchase_order_items WHERE purchase_order_id = po_id), 0),
    total_amount = COALESCE((SELECT SUM(total_with_tax) FROM public.purchase_order_items WHERE purchase_order_id = po_id), 0),
    updated_at = NOW()
  WHERE id = po_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_po_summary_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION calculate_po_summary_totals();

-- Add NPWP and PKP columns to suppliers FIRST (before creating views/functions that use them)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'npwp'
  ) THEN
    ALTER TABLE public.suppliers ADD COLUMN npwp VARCHAR(20);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'is_pkp'
  ) THEN
    ALTER TABLE public.suppliers ADD COLUMN is_pkp BOOLEAN DEFAULT false;
  END IF;
END $$;

-- NOW create views and functions that reference s.npwp
CREATE OR REPLACE VIEW purchase_order_tax_summary AS
SELECT po.id as po_id, po.po_number, po.order_date, s.name as supplier_name, s.npwp as supplier_npwp,
  b.name as branch_name, po.subtotal_amount, po.tax_amount, po.total_amount,
  po.tax_invoice_number, po.tax_invoice_date, po.status,
  COUNT(poi.id) FILTER (WHERE poi.is_taxable = true) as taxable_items_count,
  COUNT(poi.id) FILTER (WHERE poi.is_taxable = false) as non_taxable_items_count,
  SUM(poi.subtotal) FILTER (WHERE poi.is_taxable = true) as taxable_subtotal,
  SUM(poi.subtotal) FILTER (WHERE poi.is_taxable = false) as non_taxable_subtotal,
  SUM(poi.tax_amount) as total_tax
FROM public.purchase_orders po
LEFT JOIN public.suppliers s ON po.supplier_id = s.id
LEFT JOIN public.branches b ON po.branch_id = b.id
LEFT JOIN public.purchase_order_items poi ON po.id = poi.purchase_order_id
GROUP BY po.id, po.po_number, po.order_date, s.name, s.npwp, b.name,
         po.subtotal_amount, po.tax_amount, po.total_amount,
         po.tax_invoice_number, po.tax_invoice_date, po.status;

CREATE OR REPLACE FUNCTION get_po_tax_detail(p_po_id TEXT)
RETURNS TABLE (
  po_number VARCHAR, order_date TIMESTAMPTZ, supplier_name TEXT, supplier_npwp VARCHAR,
  supplier_address TEXT, branch_name TEXT, tax_invoice_number VARCHAR, tax_invoice_date DATE,
  items JSON, subtotal_amount DECIMAL, tax_amount DECIMAL, total_amount DECIMAL, tax_notes TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT po.po_number, po.order_date, s.name, s.npwp, s.address, b.name,
    po.tax_invoice_number, po.tax_invoice_date,
    COALESCE(json_agg(json_build_object(
      'material_name', m.name, 'quantity', poi.quantity, 'unit', m.unit,
      'unit_price', poi.unit_price, 'subtotal', poi.subtotal,
      'is_taxable', poi.is_taxable, 'tax_percentage', poi.tax_percentage,
      'tax_amount', poi.tax_amount, 'total_with_tax', poi.total_with_tax, 'notes', poi.notes
    ) ORDER BY poi.id), '[]'::JSON) as items_json,
    po.subtotal_amount, po.tax_amount, po.total_amount, po.tax_notes
  FROM public.purchase_orders po
  LEFT JOIN public.suppliers s ON po.supplier_id = s.id
  LEFT JOIN public.branches b ON po.branch_id = b.id
  LEFT JOIN public.purchase_order_items poi ON po.id = poi.purchase_order_id
  LEFT JOIN public.materials m ON poi.material_id = m.id
  WHERE po.id = p_po_id
  GROUP BY po.po_number, po.order_date, s.name, s.npwp, s.address, b.name,
           po.tax_invoice_number, po.tax_invoice_date, po.subtotal_amount,
           po.tax_amount, po.total_amount, po.tax_notes;
END;
$$ LANGUAGE plpgsql;

UPDATE public.purchase_order_items
SET
  is_taxable = COALESCE(is_taxable, true),
  tax_percentage = COALESCE(tax_percentage, 11.00),
  subtotal = COALESCE(subtotal, unit_price * quantity),
  tax_amount = COALESCE(tax_amount, (unit_price * quantity * 11.00 / 100)),
  total_with_tax = COALESCE(total_with_tax, (unit_price * quantity * 1.11))
WHERE subtotal IS NULL OR tax_amount IS NULL OR total_with_tax IS NULL;

DO $$
DECLARE
  po_record RECORD;
BEGIN
  FOR po_record IN SELECT id FROM public.purchase_orders LOOP
    UPDATE public.purchase_orders
    SET
      subtotal_amount = COALESCE((SELECT SUM(subtotal) FROM public.purchase_order_items WHERE purchase_order_id = po_record.id), 0),
      tax_amount = COALESCE((SELECT SUM(tax_amount) FROM public.purchase_order_items WHERE purchase_order_id = po_record.id), 0),
      total_amount = COALESCE((SELECT SUM(total_with_tax) FROM public.purchase_order_items WHERE purchase_order_id = po_record.id), 0)
    WHERE id = po_record.id;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_po_items_taxable ON public.purchase_order_items(is_taxable);
CREATE INDEX IF NOT EXISTS idx_po_tax_invoice_number ON public.purchase_orders(tax_invoice_number);
CREATE INDEX IF NOT EXISTS idx_suppliers_npwp ON public.suppliers(npwp);

-- ============================================================================
-- DONE! 🎉
-- ============================================================================
-- Verify installation:
SELECT 'Installation Complete! ✅' as status;

SELECT tablename as created_tables FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('purchase_order_items', 'material_inventory_batches', 'material_usage_history');

SELECT routine_name as created_functions FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN ('use_material_fifo', 'calculate_fifo_cost', 'get_po_tax_detail', 'generate_batch_number', 'generate_po_number');
