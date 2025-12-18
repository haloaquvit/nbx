-- ============================================================================
-- ADD DATE FIELDS TO PURCHASE ORDERS
-- ============================================================================
-- Add fields for tracking PO lifecycle dates:
-- 1. order_date - when PO was created (already exists)
-- 2. received_date - when goods were received
-- 3. payment_date - when invoice was paid
-- ============================================================================

-- 1. Add received_date and payment_date to purchase_orders
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'purchase_orders'
    AND column_name = 'received_date'
  ) THEN
    ALTER TABLE public.purchase_orders
    ADD COLUMN received_date TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'purchase_orders'
    AND column_name = 'payment_date'
  ) THEN
    ALTER TABLE public.purchase_orders
    ADD COLUMN payment_date TIMESTAMPTZ;
  END IF;
END $$;

-- 2. Add comments
COMMENT ON COLUMN public.purchase_orders.order_date IS 'Tanggal PO dibuat/dipesan';
COMMENT ON COLUMN public.purchase_orders.received_date IS 'Tanggal barang diterima';
COMMENT ON COLUMN public.purchase_orders.payment_date IS 'Tanggal nota/invoice dibayar';

-- 3. Update existing records based on status
-- For completed POs, set received_date from created_at if not set
UPDATE public.purchase_orders
SET received_date = created_at
WHERE status = 'completed'
  AND received_date IS NULL;

-- 4. Create function to auto-update dates based on status changes
CREATE OR REPLACE FUNCTION update_po_dates()
RETURNS TRIGGER AS $$
BEGIN
  -- When status changes to 'completed', set received_date if not already set
  IF NEW.status = 'completed' AND OLD.status != 'completed' AND NEW.received_date IS NULL THEN
    NEW.received_date := NOW();
  END IF;

  -- When status changes to 'paid', set payment_date if not already set
  IF NEW.status = 'paid' AND OLD.status != 'paid' AND NEW.payment_date IS NULL THEN
    NEW.payment_date := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Create trigger for auto-updating dates
DROP TRIGGER IF EXISTS trigger_update_po_dates ON public.purchase_orders;
CREATE TRIGGER trigger_update_po_dates
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_po_dates();

-- 6. Normalize existing status values to match new constraint
UPDATE public.purchase_orders
SET status = CASE
  WHEN LOWER(status) = 'pending' THEN 'pending'
  WHEN LOWER(status) = 'approved' THEN 'approved'
  WHEN LOWER(status) = 'rejected' THEN 'rejected'
  WHEN LOWER(status) = 'completed' OR LOWER(status) = 'selesai' THEN 'completed'
  WHEN LOWER(status) = 'paid' OR LOWER(status) = 'dibayar' THEN 'paid'
  WHEN LOWER(status) = 'cancelled' THEN 'cancelled'
  ELSE 'pending'
END
WHERE status IS NOT NULL;

-- 7. Add 'paid' status to purchase_orders constraint
-- Check if status column has CHECK constraint and update it
DO $$
BEGIN
  -- Drop existing constraint if exists
  ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_status_check;

  -- Add new constraint with 'paid' status (case-insensitive)
  ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'paid', 'cancelled'));
END $$;

-- 8. Create view for PO date tracking
CREATE OR REPLACE VIEW purchase_orders_date_tracking AS
SELECT
  po.id,
  po.po_number,
  po.order_date,
  po.received_date,
  po.payment_date,
  po.status,
  EXTRACT(DAY FROM (po.received_date - po.order_date)) as days_to_receive,
  EXTRACT(DAY FROM (po.payment_date - po.received_date)) as days_to_pay,
  EXTRACT(DAY FROM (po.payment_date - po.order_date)) as total_days,
  s.name as supplier_name,
  b.name as branch_name,
  po.total_cost
FROM public.purchase_orders po
LEFT JOIN public.suppliers s ON po.supplier_id = s.id
LEFT JOIN public.branches b ON po.branch_id = b.id;

COMMENT ON VIEW purchase_orders_date_tracking IS 'Tracking PO lifecycle dates and durations';
