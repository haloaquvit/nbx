-- Create commission_rules table
CREATE TABLE commission_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_sku TEXT,
  role TEXT NOT NULL CHECK (role IN ('sales', 'driver', 'helper')),
  rate_per_qty DECIMAL(15,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(product_id, role)
);

-- Create commission_entries table
CREATE TABLE commission_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('sales', 'driver', 'helper')),
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_sku TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  rate_per_qty DECIMAL(15,2) NOT NULL DEFAULT 0,
  amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  transaction_id TEXT,
  delivery_id TEXT,
  ref TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for better performance
CREATE INDEX idx_commission_rules_product_role ON commission_rules(product_id, role);
CREATE INDEX idx_commission_entries_user ON commission_entries(user_id);
CREATE INDEX idx_commission_entries_role ON commission_entries(role);
CREATE INDEX idx_commission_entries_date ON commission_entries(created_at);
CREATE INDEX idx_commission_entries_transaction ON commission_entries(transaction_id);
CREATE INDEX idx_commission_entries_delivery ON commission_entries(delivery_id);

-- Enable RLS
ALTER TABLE commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policies for commission_rules
CREATE POLICY "Anyone can view commission rules" ON commission_rules
  FOR SELECT USING (true);

CREATE POLICY "Admin/Owner/Cashier can manage commission rules" ON commission_rules
  FOR ALL USING (
    auth.jwt() ->> 'user_role' IN ('admin', 'owner', 'cashier')
  );

-- RLS Policies for commission_entries  
CREATE POLICY "Anyone can view commission entries" ON commission_entries
  FOR SELECT USING (true);

CREATE POLICY "System can insert commission entries" ON commission_entries
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admin/Owner can manage commission entries" ON commission_entries
  FOR ALL USING (
    auth.jwt() ->> 'user_role' IN ('admin', 'owner')
  );

-- Function to automatically populate product info in commission rules
CREATE OR REPLACE FUNCTION populate_commission_product_info()
RETURNS TRIGGER AS $$
BEGIN
  -- Try to get product info from products table
  SELECT p.name, p.sku 
  INTO NEW.product_name, NEW.product_sku
  FROM products p 
  WHERE p.id = NEW.product_id;
  
  -- If not found, keep the provided values
  IF NEW.product_name IS NULL THEN
    NEW.product_name = COALESCE(NEW.product_name, NEW.product_id);
  END IF;
  
  NEW.updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for commission_rules
CREATE TRIGGER trigger_populate_commission_product_info
  BEFORE INSERT OR UPDATE ON commission_rules
  FOR EACH ROW
  EXECUTE FUNCTION populate_commission_product_info();

-- Function to calculate commission amount
CREATE OR REPLACE FUNCTION calculate_commission_amount()
RETURNS TRIGGER AS $$
BEGIN
  NEW.amount = NEW.quantity * NEW.rate_per_qty;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for commission_entries
CREATE TRIGGER trigger_calculate_commission_amount
  BEFORE INSERT OR UPDATE ON commission_entries
  FOR EACH ROW
  EXECUTE FUNCTION calculate_commission_amount();

-- Sample data for testing (optional)
/*
INSERT INTO commission_rules (product_id, product_name, product_sku, role, rate_per_qty) VALUES
('sample-product-1', 'Sample Product 1', 'SP001', 'sales', 1000),
('sample-product-1', 'Sample Product 1', 'SP001', 'driver', 500),
('sample-product-1', 'Sample Product 1', 'SP001', 'helper', 300),
('sample-product-2', 'Sample Product 2', 'SP002', 'sales', 1500),
('sample-product-2', 'Sample Product 2', 'SP002', 'driver', 750),
('sample-product-2', 'Sample Product 2', 'SP002', 'helper', 450);
*/