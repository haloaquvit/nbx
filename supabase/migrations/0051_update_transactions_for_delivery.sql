-- Add is_office_sale column jika belum ada
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' 
    AND column_name = 'is_office_sale'
  ) THEN
    ALTER TABLE transactions ADD COLUMN is_office_sale BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Update existing transactions yang mungkin sudah ada
-- Default semua ke FALSE kecuali yang explicit di-set sebagai office sale

-- Add index untuk performance query delivery
CREATE INDEX IF NOT EXISTS idx_transactions_delivery_status 
ON transactions(status, is_office_sale) 
WHERE status IN ('Siap Antar', 'Diantar Sebagian');

-- Add index untuk order_date untuk sorting delivery queue
CREATE INDEX IF NOT EXISTS idx_transactions_order_date ON transactions(order_date);

-- Update function untuk memastikan status delivery logic correct
CREATE OR REPLACE FUNCTION validate_transaction_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Jika transaksi adalah laku kantor, tidak boleh masuk ke delivery flow
  IF NEW.is_office_sale = true AND NEW.status IN ('Siap Antar', 'Diantar Sebagian') THEN
    -- Auto change ke 'Selesai' untuk laku kantor
    NEW.status := 'Selesai';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger untuk validate status transition
CREATE OR REPLACE TRIGGER transaction_status_validation
  BEFORE UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION validate_transaction_status_transition();