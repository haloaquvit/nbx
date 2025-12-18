-- Integrate Purchase Orders with FIFO Inventory System
-- Auto-create inventory batches when PO items are received

-- 1. Function to create inventory batch from PO item when received
CREATE OR REPLACE FUNCTION create_batch_from_po_receipt()
RETURNS TRIGGER AS $$
DECLARE
  batch_num TEXT;
  po_record RECORD;
BEGIN
  -- Only create batch when status changes to 'received' or 'partially_received'
  IF NEW.status IN ('received', 'partially_received') AND
     (OLD.status IS NULL OR OLD.status NOT IN ('received', 'partially_received')) THEN

    -- Get PO details
    SELECT po.supplier_id, po.branch_id, po.order_date
    INTO po_record
    FROM public.purchase_orders po
    WHERE po.id = NEW.id;

    -- Generate batch number
    batch_num := generate_batch_number();

    -- Create inventory batches for each item in the PO
    INSERT INTO public.material_inventory_batches (
      material_id,
      branch_id,
      purchase_order_id,
      po_item_id,
      batch_number,
      purchase_date,
      quantity_received,
      quantity_remaining,
      unit_price,
      supplier_id,
      notes,
      created_by
    )
    SELECT
      poi.material_id,
      po_record.branch_id,
      NEW.id,
      poi.id,
      batch_num || '-' || ROW_NUMBER() OVER (ORDER BY poi.id),
      COALESCE(po_record.order_date, NOW()),
      COALESCE(poi.quantity_received, poi.quantity), -- Use received quantity if available
      COALESCE(poi.quantity_received, poi.quantity), -- Initially, remaining = received
      poi.unit_price, -- This is the key: price from PO
      po_record.supplier_id,
      'Auto-created from PO #' || NEW.po_number,
      NEW.approved_by
    FROM public.purchase_order_items poi
    WHERE poi.purchase_order_id = NEW.id;

    RAISE NOTICE 'Created inventory batches for PO %', NEW.po_number;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on purchase_orders table
CREATE TRIGGER trigger_create_batch_from_po
  AFTER INSERT OR UPDATE OF status ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION create_batch_from_po_receipt();

-- 2. Add quantity_received to purchase_order_items if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'purchase_order_items'
    AND column_name = 'quantity_received'
  ) THEN
    ALTER TABLE public.purchase_order_items
    ADD COLUMN quantity_received DECIMAL(15,4);
  END IF;
END $$;

-- 3. Function to get available stock with batch details (for UI display)
CREATE OR REPLACE FUNCTION get_material_stock_with_batches(
  p_material_id UUID,
  p_branch_id UUID DEFAULT NULL
)
RETURNS TABLE (
  material_id UUID,
  material_name TEXT,
  total_quantity DECIMAL,
  total_value DECIMAL,
  weighted_avg_price DECIMAL,
  batch_count INTEGER,
  oldest_batch_date TIMESTAMP,
  newest_batch_date TIMESTAMP,
  batch_details JSON
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.name,
    COALESCE(SUM(b.quantity_remaining), 0) as total_qty,
    COALESCE(SUM(b.quantity_remaining * b.unit_price), 0) as total_val,
    CASE
      WHEN SUM(b.quantity_remaining) > 0
      THEN SUM(b.quantity_remaining * b.unit_price) / SUM(b.quantity_remaining)
      ELSE 0
    END as weighted_avg,
    COUNT(b.id)::INTEGER as batch_cnt,
    MIN(b.purchase_date) as oldest,
    MAX(b.purchase_date) as newest,
    COALESCE(
      json_agg(
        json_build_object(
          'batch_id', b.id,
          'batch_number', b.batch_number,
          'purchase_date', b.purchase_date,
          'quantity_remaining', b.quantity_remaining,
          'unit_price', b.unit_price,
          'supplier_id', b.supplier_id,
          'po_number', po.po_number
        )
        ORDER BY b.purchase_date, b.created_at
      ) FILTER (WHERE b.id IS NOT NULL),
      '[]'::JSON
    ) as batches
  FROM public.materials m
  LEFT JOIN public.material_inventory_batches b
    ON m.id = b.material_id
    AND b.status = 'active'
    AND b.quantity_remaining > 0
    AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
  LEFT JOIN public.purchase_orders po ON b.purchase_order_id = po.id
  WHERE m.id = p_material_id
  GROUP BY m.id, m.name;
END;
$$ LANGUAGE plpgsql;

-- 4. Function to get HPP report for production
CREATE OR REPLACE FUNCTION get_production_hpp_detail(
  p_production_record_id UUID
)
RETURNS TABLE (
  material_id UUID,
  material_name TEXT,
  total_quantity_used DECIMAL,
  total_cost DECIMAL,
  avg_cost_per_unit DECIMAL,
  batch_breakdown JSON
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.name,
    SUM(uh.quantity_used) as qty_used,
    SUM(uh.total_cost) as cost,
    CASE
      WHEN SUM(uh.quantity_used) > 0
      THEN SUM(uh.total_cost) / SUM(uh.quantity_used)
      ELSE 0
    END as avg_cost,
    json_agg(
      json_build_object(
        'batch_number', b.batch_number,
        'quantity_used', uh.quantity_used,
        'unit_price', uh.unit_price,
        'cost', uh.total_cost,
        'usage_date', uh.usage_date,
        'purchase_date', b.purchase_date
      )
      ORDER BY uh.usage_date
    ) as breakdown
  FROM public.material_usage_history uh
  JOIN public.materials m ON uh.material_id = m.id
  JOIN public.material_inventory_batches b ON uh.batch_id = b.id
  WHERE uh.production_record_id = p_production_record_id
  GROUP BY m.id, m.name
  ORDER BY m.name;
END;
$$ LANGUAGE plpgsql;

-- 5. View for easy HPP monitoring
CREATE OR REPLACE VIEW material_inventory_summary AS
SELECT
  m.id as material_id,
  m.name as material_name,
  m.unit,
  m.branch_id,
  b.name as branch_name,
  COUNT(DISTINCT mib.id) as active_batch_count,
  SUM(mib.quantity_remaining) as total_quantity_available,
  SUM(mib.quantity_remaining * mib.unit_price) as total_inventory_value,
  CASE
    WHEN SUM(mib.quantity_remaining) > 0
    THEN SUM(mib.quantity_remaining * mib.unit_price) / SUM(mib.quantity_remaining)
    ELSE 0
  END as weighted_average_cost,
  MIN(mib.unit_price) as lowest_unit_price,
  MAX(mib.unit_price) as highest_unit_price,
  MIN(mib.purchase_date) as oldest_batch_date,
  MAX(mib.purchase_date) as newest_batch_date
FROM public.materials m
LEFT JOIN public.branches b ON m.branch_id = b.id
LEFT JOIN public.material_inventory_batches mib
  ON m.id = mib.material_id
  AND mib.status = 'active'
  AND mib.quantity_remaining > 0
GROUP BY m.id, m.name, m.unit, m.branch_id, b.name;

-- 6. Add helpful comments
COMMENT ON FUNCTION create_batch_from_po_receipt IS 'Automatically creates inventory batches when PO is received';
COMMENT ON FUNCTION get_material_stock_with_batches IS 'Get material stock with detailed batch information for UI';
COMMENT ON FUNCTION get_production_hpp_detail IS 'Get detailed HPP breakdown for a production record';
COMMENT ON VIEW material_inventory_summary IS 'Summary view of material inventory with FIFO costing metrics';
