-- Add PPN (Value Added Tax) Tracking to Purchase Orders
-- Allows tracking of taxable (PPN) and non-taxable items in PO

-- 1. Add PPN fields to purchase_order_items table
ALTER TABLE public.purchase_order_items
ADD COLUMN IF NOT EXISTS is_taxable BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS tax_percentage DECIMAL(5,2) DEFAULT 11.00 CHECK (tax_percentage >= 0 AND tax_percentage <= 100),
ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS subtotal DECIMAL(15,2) DEFAULT 0, -- unit_price * quantity
ADD COLUMN IF NOT EXISTS total_with_tax DECIMAL(15,2) DEFAULT 0; -- subtotal + tax_amount

-- 2. Add PPN summary fields to purchase_orders table
ALTER TABLE public.purchase_orders
ADD COLUMN IF NOT EXISTS subtotal_amount DECIMAL(15,2) DEFAULT 0, -- Sum of all items before tax
ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(15,2) DEFAULT 0, -- Total PPN
ADD COLUMN IF NOT EXISTS total_amount DECIMAL(15,2) DEFAULT 0, -- Grand total with tax
ADD COLUMN IF NOT EXISTS tax_invoice_number VARCHAR(100), -- Nomor faktur pajak
ADD COLUMN IF NOT EXISTS tax_invoice_date DATE, -- Tanggal faktur pajak
ADD COLUMN IF NOT EXISTS tax_notes TEXT; -- Catatan pajak

-- 3. Function to calculate PO item tax and totals
CREATE OR REPLACE FUNCTION calculate_po_item_totals()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate subtotal
  NEW.subtotal := NEW.unit_price * NEW.quantity;

  -- Calculate tax amount if taxable
  IF NEW.is_taxable THEN
    NEW.tax_amount := NEW.subtotal * (NEW.tax_percentage / 100);
  ELSE
    NEW.tax_amount := 0;
  END IF;

  -- Calculate total with tax
  NEW.total_with_tax := NEW.subtotal + NEW.tax_amount;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic calculation on insert/update
CREATE TRIGGER trigger_calculate_po_item_totals
  BEFORE INSERT OR UPDATE OF unit_price, quantity, is_taxable, tax_percentage
  ON public.purchase_order_items
  FOR EACH ROW
  EXECUTE FUNCTION calculate_po_item_totals();

-- 4. Function to calculate PO summary totals
CREATE OR REPLACE FUNCTION calculate_po_summary_totals()
RETURNS TRIGGER AS $$
DECLARE
  po_id UUID;
BEGIN
  -- Get the PO ID from the changed item
  IF TG_OP = 'DELETE' THEN
    po_id := OLD.purchase_order_id;
  ELSE
    po_id := NEW.purchase_order_id;
  END IF;

  -- Update PO totals
  UPDATE public.purchase_orders
  SET
    subtotal_amount = COALESCE((
      SELECT SUM(subtotal)
      FROM public.purchase_order_items
      WHERE purchase_order_id = po_id
    ), 0),
    tax_amount = COALESCE((
      SELECT SUM(tax_amount)
      FROM public.purchase_order_items
      WHERE purchase_order_id = po_id
    ), 0),
    total_amount = COALESCE((
      SELECT SUM(total_with_tax)
      FROM public.purchase_order_items
      WHERE purchase_order_id = po_id
    ), 0),
    updated_at = NOW()
  WHERE id = po_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic PO summary calculation
CREATE TRIGGER trigger_calculate_po_summary_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_order_items
  FOR EACH ROW
  EXECUTE FUNCTION calculate_po_summary_totals();

-- 5. Update FIFO batch creation to include tax information in notes
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
      poi.unit_price, -- Price from PO (excluding tax for COGS calculation)
      po_record.supplier_id,
      'Auto-created from PO #' || NEW.po_number ||
      CASE
        WHEN poi.is_taxable THEN ' | PPN ' || poi.tax_percentage || '% = Rp ' || COALESCE(poi.tax_amount, 0)
        ELSE ' | Non-PPN'
      END,
      NEW.approved_by
    FROM public.purchase_order_items poi
    WHERE poi.purchase_order_id = NEW.id;

    RAISE NOTICE 'Created inventory batches for PO %', NEW.po_number;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. View for PO tax summary report
CREATE OR REPLACE VIEW purchase_order_tax_summary AS
SELECT
  po.id as po_id,
  po.po_number,
  po.order_date,
  s.name as supplier_name,
  s.npwp as supplier_npwp,
  b.name as branch_name,
  po.subtotal_amount,
  po.tax_amount,
  po.total_amount,
  po.tax_invoice_number,
  po.tax_invoice_date,
  po.status,
  -- Count taxable vs non-taxable items
  COUNT(poi.id) FILTER (WHERE poi.is_taxable = true) as taxable_items_count,
  COUNT(poi.id) FILTER (WHERE poi.is_taxable = false) as non_taxable_items_count,
  -- Sum by tax status
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

-- 7. Function to get PO details with tax breakdown (for PDF generation)
CREATE OR REPLACE FUNCTION get_po_tax_detail(p_po_id UUID)
RETURNS TABLE (
  po_number VARCHAR,
  order_date TIMESTAMPTZ,
  supplier_name TEXT,
  supplier_npwp VARCHAR,
  supplier_address TEXT,
  branch_name TEXT,
  tax_invoice_number VARCHAR,
  tax_invoice_date DATE,
  items JSON,
  subtotal_amount DECIMAL,
  tax_amount DECIMAL,
  total_amount DECIMAL,
  tax_notes TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    po.po_number,
    po.order_date,
    s.name,
    s.npwp,
    s.address,
    b.name,
    po.tax_invoice_number,
    po.tax_invoice_date,
    COALESCE(
      json_agg(
        json_build_object(
          'material_name', m.name,
          'quantity', poi.quantity,
          'unit', m.unit,
          'unit_price', poi.unit_price,
          'subtotal', poi.subtotal,
          'is_taxable', poi.is_taxable,
          'tax_percentage', poi.tax_percentage,
          'tax_amount', poi.tax_amount,
          'total_with_tax', poi.total_with_tax,
          'notes', poi.notes
        )
        ORDER BY poi.id
      ),
      '[]'::JSON
    ) as items_json,
    po.subtotal_amount,
    po.tax_amount,
    po.total_amount,
    po.tax_notes
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

-- 8. Add NPWP field to suppliers if not exists (for tax reporting)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'suppliers'
    AND column_name = 'npwp'
  ) THEN
    ALTER TABLE public.suppliers
    ADD COLUMN npwp VARCHAR(20); -- Nomor Pokok Wajib Pajak
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'suppliers'
    AND column_name = 'is_pkp'
  ) THEN
    ALTER TABLE public.suppliers
    ADD COLUMN is_pkp BOOLEAN DEFAULT false; -- Pengusaha Kena Pajak
  END IF;
END $$;

-- 9. Update existing PO items with default values
UPDATE public.purchase_order_items
SET
  is_taxable = COALESCE(is_taxable, true),
  tax_percentage = COALESCE(tax_percentage, 11.00),
  subtotal = COALESCE(subtotal, unit_price * quantity),
  tax_amount = COALESCE(tax_amount, (unit_price * quantity * 11.00 / 100)),
  total_with_tax = COALESCE(total_with_tax, (unit_price * quantity * 1.11))
WHERE subtotal IS NULL OR tax_amount IS NULL OR total_with_tax IS NULL;

-- 10. Calculate totals for existing POs
DO $$
DECLARE
  po_record RECORD;
BEGIN
  FOR po_record IN SELECT id FROM public.purchase_orders LOOP
    UPDATE public.purchase_orders
    SET
      subtotal_amount = COALESCE((
        SELECT SUM(subtotal)
        FROM public.purchase_order_items
        WHERE purchase_order_id = po_record.id
      ), 0),
      tax_amount = COALESCE((
        SELECT SUM(tax_amount)
        FROM public.purchase_order_items
        WHERE purchase_order_id = po_record.id
      ), 0),
      total_amount = COALESCE((
        SELECT SUM(total_with_tax)
        FROM public.purchase_order_items
        WHERE purchase_order_id = po_record.id
      ), 0)
    WHERE id = po_record.id;
  END LOOP;
END $$;

-- 11. Add indexes for tax queries
CREATE INDEX IF NOT EXISTS idx_po_items_taxable ON public.purchase_order_items(is_taxable);
CREATE INDEX IF NOT EXISTS idx_po_tax_invoice_number ON public.purchase_orders(tax_invoice_number);
CREATE INDEX IF NOT EXISTS idx_suppliers_npwp ON public.suppliers(npwp);

-- 12. Add helpful comments
COMMENT ON COLUMN public.purchase_order_items.is_taxable IS 'Whether this item is subject to PPN (Value Added Tax)';
COMMENT ON COLUMN public.purchase_order_items.tax_percentage IS 'PPN percentage (default 11%)';
COMMENT ON COLUMN public.purchase_order_items.tax_amount IS 'Calculated PPN amount';
COMMENT ON COLUMN public.purchase_order_items.subtotal IS 'Item subtotal before tax (unit_price × quantity)';
COMMENT ON COLUMN public.purchase_order_items.total_with_tax IS 'Item total including tax';
COMMENT ON COLUMN public.purchase_orders.subtotal_amount IS 'PO subtotal before tax';
COMMENT ON COLUMN public.purchase_orders.tax_amount IS 'Total PPN for PO';
COMMENT ON COLUMN public.purchase_orders.total_amount IS 'Grand total including tax';
COMMENT ON COLUMN public.purchase_orders.tax_invoice_number IS 'Nomor faktur pajak';
COMMENT ON COLUMN public.suppliers.npwp IS 'Nomor Pokok Wajib Pajak (Tax ID)';
COMMENT ON COLUMN public.suppliers.is_pkp IS 'Pengusaha Kena Pajak (Taxable Entrepreneur status)';
COMMENT ON VIEW purchase_order_tax_summary IS 'Summary view of PO with tax breakdown';
COMMENT ON FUNCTION get_po_tax_detail IS 'Get complete PO details with tax information for PDF generation';
