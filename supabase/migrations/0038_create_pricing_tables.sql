-- Create stock pricing table
CREATE TABLE IF NOT EXISTS stock_pricings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  min_stock INTEGER NOT NULL,
  max_stock INTEGER NULL,
  price DECIMAL(15,2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create bonus pricing table
CREATE TABLE IF NOT EXISTS bonus_pricings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  min_quantity INTEGER NOT NULL,
  max_quantity INTEGER NULL,
  bonus_quantity INTEGER NOT NULL DEFAULT 0,
  bonus_type TEXT NOT NULL CHECK (bonus_type IN ('quantity', 'percentage', 'fixed_discount')),
  bonus_value DECIMAL(15,2) NOT NULL DEFAULT 0,
  description TEXT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_stock_pricings_product_id ON stock_pricings(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_pricings_active ON stock_pricings(is_active);
CREATE INDEX IF NOT EXISTS idx_stock_pricings_stock_range ON stock_pricings(min_stock, max_stock);

CREATE INDEX IF NOT EXISTS idx_bonus_pricings_product_id ON bonus_pricings(product_id);
CREATE INDEX IF NOT EXISTS idx_bonus_pricings_active ON bonus_pricings(is_active);
CREATE INDEX IF NOT EXISTS idx_bonus_pricings_qty_range ON bonus_pricings(min_quantity, max_quantity);

-- Update triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_stock_pricings_updated_at BEFORE UPDATE ON stock_pricings FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_bonus_pricings_updated_at BEFORE UPDATE ON bonus_pricings FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE stock_pricings IS 'Pricing rules based on product stock levels';
COMMENT ON TABLE bonus_pricings IS 'Bonus rules based on purchase quantity';

COMMENT ON COLUMN stock_pricings.min_stock IS 'Minimum stock level for this pricing rule';
COMMENT ON COLUMN stock_pricings.max_stock IS 'Maximum stock level for this pricing rule (NULL means no upper limit)';
COMMENT ON COLUMN stock_pricings.price IS 'Price to use when stock is within the range';

COMMENT ON COLUMN bonus_pricings.min_quantity IS 'Minimum quantity for this bonus rule';
COMMENT ON COLUMN bonus_pricings.max_quantity IS 'Maximum quantity for this bonus rule (NULL means no upper limit)';
COMMENT ON COLUMN bonus_pricings.bonus_type IS 'Type of bonus: quantity (free items), percentage (% discount), fixed_discount (fixed amount discount)';
COMMENT ON COLUMN bonus_pricings.bonus_value IS 'Value of bonus depending on type: quantity in pieces, percentage (0-100), or fixed discount amount';