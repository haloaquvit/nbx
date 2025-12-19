-- Create customer_pricings table for customer-specific pricing rules
-- This allows setting special prices based on:
-- 1. Customer classification (Rumahan, Kios/Toko)
-- 2. Specific customer

CREATE TABLE IF NOT EXISTS customer_pricings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  -- Target: either a specific customer OR a classification (not both)
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  customer_classification TEXT CHECK (customer_classification IN ('Rumahan', 'Kios/Toko')),

  -- Pricing options
  price_type TEXT NOT NULL CHECK (price_type IN ('fixed', 'discount_percentage', 'discount_amount')),
  price_value NUMERIC(12,2) NOT NULL, -- fixed price, percentage (0-100), or discount amount

  -- Priority: higher number = higher priority (customer-specific should override classification)
  priority INTEGER DEFAULT 0,

  -- Metadata
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure either customer_id OR customer_classification is set, not both
  CONSTRAINT customer_or_classification CHECK (
    (customer_id IS NOT NULL AND customer_classification IS NULL) OR
    (customer_id IS NULL AND customer_classification IS NOT NULL)
  )
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_customer_pricings_product_id ON customer_pricings(product_id);
CREATE INDEX IF NOT EXISTS idx_customer_pricings_customer_id ON customer_pricings(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_pricings_classification ON customer_pricings(customer_classification);
CREATE INDEX IF NOT EXISTS idx_customer_pricings_branch_id ON customer_pricings(branch_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_customer_pricings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_customer_pricings_updated_at ON customer_pricings;
CREATE TRIGGER trigger_update_customer_pricings_updated_at
  BEFORE UPDATE ON customer_pricings
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_pricings_updated_at();

-- Enable RLS
ALTER TABLE customer_pricings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Enable read access for authenticated users" ON customer_pricings
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert access for authenticated users" ON customer_pricings
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update access for authenticated users" ON customer_pricings
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete access for authenticated users" ON customer_pricings
  FOR DELETE USING (auth.role() = 'authenticated');

-- Comment on table
COMMENT ON TABLE customer_pricings IS 'Customer-specific pricing rules based on customer or classification';
COMMENT ON COLUMN customer_pricings.price_type IS 'Type of pricing: fixed (absolute price), discount_percentage (% off base), discount_amount (fixed amount off)';
COMMENT ON COLUMN customer_pricings.priority IS 'Higher priority rules override lower ones. Customer-specific should have higher priority than classification-based.';
