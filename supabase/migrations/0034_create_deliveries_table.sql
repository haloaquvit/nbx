-- Create deliveries table untuk sistem pengantaran partial
CREATE TABLE deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  delivery_number SERIAL NOT NULL, -- Auto increment untuk urutan pengantaran per transaksi
  delivery_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  photo_url TEXT, -- URL foto laporan pengantaran dari Google Drive
  photo_drive_id TEXT, -- ID file di Google Drive untuk backup reference
  notes TEXT, -- Catatan pengantaran
  delivered_by TEXT, -- Nama driver/pengantar
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create delivery_items table untuk track item yang diantar per pengantaran
CREATE TABLE delivery_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL, -- Store product name untuk history
  quantity_delivered INTEGER NOT NULL CHECK (quantity_delivered > 0),
  unit TEXT NOT NULL, -- Satuan produk
  width DECIMAL, -- Dimensi jika ada
  height DECIMAL, -- Dimensi jika ada
  notes TEXT, -- Catatan spesifik untuk item ini
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes untuk performance
CREATE INDEX idx_deliveries_transaction_id ON deliveries(transaction_id);
CREATE INDEX idx_deliveries_delivery_date ON deliveries(delivery_date);
CREATE INDEX idx_delivery_items_delivery_id ON delivery_items(delivery_id);
CREATE INDEX idx_delivery_items_product_id ON delivery_items(product_id);

-- Enable RLS
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_items ENABLE ROW LEVEL SECURITY;

-- RLS policies untuk deliveries
CREATE POLICY "Enable read access for authenticated users" ON deliveries
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users" ON deliveries
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users" ON deliveries
  FOR UPDATE USING (auth.role() = 'authenticated');

-- RLS policies untuk delivery_items
CREATE POLICY "Enable read access for authenticated users" ON delivery_items
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users" ON delivery_items
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users" ON delivery_items
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Function untuk update status transaksi berdasarkan delivery progress
CREATE OR REPLACE FUNCTION update_transaction_delivery_status()
RETURNS TRIGGER AS $$
DECLARE
  transaction_record RECORD;
  total_ordered INTEGER;
  total_delivered INTEGER;
  item_record RECORD;
BEGIN
  -- Get transaction details
  SELECT * INTO transaction_record 
  FROM transactions 
  WHERE id = (
    SELECT transaction_id 
    FROM deliveries 
    WHERE id = COALESCE(NEW.delivery_id, OLD.delivery_id)
  );
  
  -- Skip jika transaksi adalah laku kantor
  IF transaction_record.is_office_sale = true THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  -- Calculate total quantity ordered vs delivered untuk setiap item
  FOR item_record IN 
    SELECT 
      ti.product_id,
      ti.quantity as ordered_quantity,
      COALESCE(SUM(di.quantity_delivered), 0) as delivered_quantity
    FROM transactions t
    JOIN LATERAL jsonb_to_recordset(t.items) AS ti(
      product jsonb,
      quantity integer
    ) ON true
    JOIN LATERAL (SELECT (ti.product->>'id')::uuid as product_id) p ON true
    LEFT JOIN deliveries d ON d.transaction_id = t.id
    LEFT JOIN delivery_items di ON di.delivery_id = d.id AND di.product_id = p.product_id
    WHERE t.id = transaction_record.id
    GROUP BY ti.product_id, ti.quantity
  LOOP
    -- Jika ada item yang belum selesai diantar
    IF item_record.delivered_quantity < item_record.ordered_quantity THEN
      -- Jika sudah ada pengantaran tapi belum lengkap
      IF item_record.delivered_quantity > 0 THEN
        UPDATE transactions 
        SET status = 'Diantar Sebagian'
        WHERE id = transaction_record.id;
        RETURN COALESCE(NEW, OLD);
      ELSE
        -- Belum ada pengantaran sama sekali, tetap 'Siap Antar'
        RETURN COALESCE(NEW, OLD);
      END IF;
    END IF;
  END LOOP;
  
  -- Jika sampai sini, berarti semua item sudah diantar lengkap
  UPDATE transactions 
  SET status = 'Selesai'
  WHERE id = transaction_record.id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger untuk auto-update status transaksi
CREATE TRIGGER delivery_items_status_trigger
  AFTER INSERT OR UPDATE OR DELETE ON delivery_items
  FOR EACH ROW
  EXECUTE FUNCTION update_transaction_delivery_status();

-- Function untuk mendapatkan delivery summary per transaksi
CREATE OR REPLACE FUNCTION get_delivery_summary(transaction_id_param TEXT)
RETURNS TABLE (
  product_id UUID,
  product_name TEXT,
  ordered_quantity INTEGER,
  delivered_quantity INTEGER,
  remaining_quantity INTEGER,
  unit TEXT,
  width DECIMAL,
  height DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.product_id,
    p.product_name,
    p.ordered_quantity::INTEGER,
    COALESCE(di_summary.delivered_quantity, 0)::INTEGER,
    (p.ordered_quantity - COALESCE(di_summary.delivered_quantity, 0))::INTEGER,
    p.unit,
    p.width,
    p.height
  FROM (
    SELECT 
      (ti.product->>'id')::uuid as product_id,
      ti.product->>'name' as product_name,
      ti.quantity as ordered_quantity,
      ti.unit as unit,
      ti.width as width,
      ti.height as height
    FROM transactions t
    JOIN LATERAL jsonb_to_recordset(t.items) AS ti(
      product jsonb,
      quantity integer,
      unit text,
      width decimal,
      height decimal
    ) ON true
    WHERE t.id = transaction_id_param
  ) p
  LEFT JOIN (
    SELECT 
      di.product_id,
      SUM(di.quantity_delivered) as delivered_quantity
    FROM deliveries d
    JOIN delivery_items di ON di.delivery_id = d.id
    WHERE d.transaction_id = transaction_id_param
    GROUP BY di.product_id
  ) di_summary ON di_summary.product_id = p.product_id;
END;
$$ LANGUAGE plpgsql;

-- Function untuk mendapatkan transaksi yang siap untuk diantar (exclude laku kantor)
CREATE OR REPLACE FUNCTION get_transactions_ready_for_delivery()
RETURNS TABLE (
  id TEXT,
  customer_name TEXT,
  order_date TIMESTAMPTZ,
  items JSONB,
  total DECIMAL,
  status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.customer_name,
    t.order_date,
    t.items,
    t.total,
    t.status
  FROM transactions t
  WHERE t.status IN ('Siap Antar', 'Diantar Sebagian')
    AND (t.is_office_sale IS NULL OR t.is_office_sale = false)
  ORDER BY t.order_date ASC;
END;
$$ LANGUAGE plpgsql;