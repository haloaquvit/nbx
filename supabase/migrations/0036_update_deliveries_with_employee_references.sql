-- Update deliveries table to use employee references instead of free text
-- Drop old text field and add employee references

ALTER TABLE deliveries 
DROP COLUMN IF EXISTS delivered_by;

-- Add driver and helper employee references
ALTER TABLE deliveries 
ADD COLUMN driver_id UUID REFERENCES employees(id),
ADD COLUMN helper_id UUID REFERENCES employees(id);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_deliveries_driver_id ON deliveries(driver_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_helper_id ON deliveries(helper_id);

-- Update function untuk update status transaksi berdasarkan delivery progress
-- (Re-create function to handle new column structure)
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

-- Function untuk mendapatkan delivery summary dengan employee names
CREATE OR REPLACE FUNCTION get_delivery_with_employees(delivery_id_param UUID)
RETURNS TABLE (
  id UUID,
  transaction_id TEXT,
  delivery_number INTEGER,
  delivery_date TIMESTAMPTZ,
  photo_url TEXT,
  photo_drive_id TEXT,
  notes TEXT,
  driver_name TEXT,
  helper_name TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.id,
    d.transaction_id,
    d.delivery_number,
    d.delivery_date,
    d.photo_url,
    d.photo_drive_id,
    d.notes,
    driver.name as driver_name,
    helper.name as helper_name,
    d.created_at,
    d.updated_at
  FROM deliveries d
  LEFT JOIN employees driver ON d.driver_id = driver.id
  LEFT JOIN employees helper ON d.helper_id = helper.id
  WHERE d.id = delivery_id_param;
END;
$$ LANGUAGE plpgsql;

-- Function untuk mendapatkan karyawan dengan role supir atau helper
CREATE OR REPLACE FUNCTION get_delivery_employees()
RETURNS TABLE (
  id UUID,
  name TEXT,
  position TEXT,
  role TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.name,
    e.position,
    e.role
  FROM employees e
  WHERE e.role IN ('supir', 'helper')
    AND e.status = 'active'
  ORDER BY e.role, e.name;
END;
$$ LANGUAGE plpgsql;