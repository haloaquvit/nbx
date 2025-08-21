-- Update transaction status system with auto-update functionality
-- Migration: 0033_update_transaction_status_system.sql
-- Date: 2025-01-19

-- Update transaction status enum to include new statuses
ALTER TYPE transaction_status DROP CONSTRAINT IF EXISTS transaction_status_check;

-- Create new status check constraint
ALTER TABLE public.transactions 
ADD CONSTRAINT transaction_status_check CHECK (
  status IN (
    'Pesanan Masuk',     -- Order baru dibuat
    'Siap Antar',        -- Produksi selesai, siap diantar
    'Diantar Sebagian',  -- Sebagian sudah diantar
    'Selesai',           -- Semua sudah berhasil diantar
    'Dibatalkan'         -- Order dibatalkan
  )
);

-- Create function to auto-update transaction status based on delivery progress
CREATE OR REPLACE FUNCTION update_transaction_status_from_delivery()
RETURNS TRIGGER AS $$
DECLARE
  transaction_id TEXT;
  total_items INTEGER;
  delivered_items INTEGER;
  cancelled_deliveries INTEGER;
BEGIN
  -- Get transaction ID from delivery
  transaction_id := COALESCE(NEW.transaction_id, OLD.transaction_id);
  
  IF transaction_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  -- Count total items in transaction (from transaction items)
  SELECT COALESCE(jsonb_array_length(items), 0)
  INTO total_items
  FROM public.transactions 
  WHERE id = transaction_id;
  
  -- Count delivered items from all deliveries for this transaction
  SELECT 
    COALESCE(SUM(CASE WHEN d.status = 'delivered' THEN di.quantity_delivered ELSE 0 END), 0),
    COUNT(CASE WHEN d.status = 'cancelled' THEN 1 END)
  INTO delivered_items, cancelled_deliveries
  FROM public.deliveries d
  LEFT JOIN public.delivery_items di ON d.id = di.delivery_id  
  WHERE d.transaction_id = transaction_id;
  
  -- Update transaction status based on delivery progress
  IF cancelled_deliveries > 0 AND delivered_items = 0 THEN
    -- All deliveries cancelled, no items delivered
    UPDATE public.transactions 
    SET status = 'Dibatalkan' 
    WHERE id = transaction_id AND status != 'Dibatalkan';
    
  ELSIF delivered_items = 0 THEN
    -- No items delivered yet, but delivery exists
    UPDATE public.transactions 
    SET status = 'Siap Antar' 
    WHERE id = transaction_id AND status NOT IN ('Siap Antar', 'Diantar Sebagian', 'Selesai');
    
  ELSIF delivered_items > 0 AND delivered_items < total_items THEN
    -- Partial delivery completed
    UPDATE public.transactions 
    SET status = 'Diantar Sebagian' 
    WHERE id = transaction_id AND status != 'Diantar Sebagian';
    
  ELSIF delivered_items >= total_items THEN
    -- All items delivered
    UPDATE public.transactions 
    SET status = 'Selesai' 
    WHERE id = transaction_id AND status != 'Selesai';
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger for delivery status changes
CREATE TRIGGER trigger_update_transaction_status_from_delivery
  AFTER INSERT OR UPDATE OR DELETE ON public.deliveries
  FOR EACH ROW
  EXECUTE FUNCTION update_transaction_status_from_delivery();

-- Create trigger for delivery item changes  
CREATE TRIGGER trigger_update_transaction_status_from_delivery_items
  AFTER INSERT OR UPDATE OR DELETE ON public.delivery_items
  FOR EACH ROW
  EXECUTE FUNCTION update_transaction_status_from_delivery();

-- Function to auto-update payment status based on paid amount
CREATE OR REPLACE FUNCTION update_payment_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-update payment status based on paid amount vs total
  IF NEW.paid_amount >= NEW.total THEN
    NEW.payment_status := 'Lunas';
  ELSIF NEW.paid_amount > 0 THEN
    NEW.payment_status := 'Belum Lunas';
  ELSE
    -- Keep existing payment_status if no payment yet
    -- Could be 'Kredit' or 'Belum Lunas'
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for payment status auto-update
CREATE TRIGGER trigger_update_payment_status
  BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_payment_status();

-- Create indexes for better filtering performance
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_payment_status ON public.transactions(payment_status);
CREATE INDEX IF NOT EXISTS idx_transactions_order_date ON public.transactions(order_date);
CREATE INDEX IF NOT EXISTS idx_transactions_customer_id ON public.transactions(customer_id);

-- Create view for transaction summary with delivery info
CREATE OR REPLACE VIEW transaction_summary AS
SELECT 
  t.*,
  c.name as customer_name,
  c.phone as customer_phone,
  c.address as customer_address,
  -- Delivery summary
  COUNT(d.id) as total_deliveries,
  COUNT(CASE WHEN d.status = 'pending' THEN 1 END) as pending_deliveries,
  COUNT(CASE WHEN d.status = 'in_transit' THEN 1 END) as in_transit_deliveries,
  COUNT(CASE WHEN d.status = 'delivered' THEN 1 END) as completed_deliveries,
  COUNT(CASE WHEN d.status = 'cancelled' THEN 1 END) as cancelled_deliveries,
  -- Payment calculation
  ROUND((t.paid_amount * 100.0 / NULLIF(t.total, 0)), 2) as payment_percentage,
  (t.total - t.paid_amount) as remaining_amount
FROM public.transactions t
LEFT JOIN public.customers c ON t.customer_id = c.id
LEFT JOIN public.deliveries d ON t.id = d.transaction_id
GROUP BY t.id, c.name, c.phone, c.address;

-- Grant access to the view
GRANT SELECT ON public.transaction_summary TO authenticated;

-- Success message
SELECT 'Transaction status system updated with auto-status and comprehensive filtering!' as status;