-- ========================================
-- MANUAL DATABASE FIX SCRIPT
-- ========================================
-- Execute this script manually in your Supabase SQL editor
-- to create suppliers table and fix purchase_orders columns

-- 1. CREATE SUPPLIERS TABLE AND RELATED TABLES
-- ========================================
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  contact_person VARCHAR(100),
  phone VARCHAR(20),
  email VARCHAR(100),
  address TEXT,
  city VARCHAR(50),
  postal_code VARCHAR(10),
  payment_terms VARCHAR(50) DEFAULT 'Cash',
  tax_number VARCHAR(50),
  bank_account VARCHAR(100),
  bank_name VARCHAR(50),
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for suppliers
CREATE INDEX IF NOT EXISTS idx_suppliers_code ON public.suppliers(code);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON public.suppliers(name);
CREATE INDEX IF NOT EXISTS idx_suppliers_is_active ON public.suppliers(is_active);

-- Enable RLS for suppliers
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for suppliers
DROP POLICY IF EXISTS "Authenticated users can view suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Authenticated users can manage suppliers" ON public.suppliers;

CREATE POLICY "Authenticated users can view suppliers" ON public.suppliers
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage suppliers" ON public.suppliers
  FOR ALL USING (auth.role() = 'authenticated');

-- 2. CREATE SUPPLIER_MATERIALS TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS public.supplier_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  supplier_price NUMERIC NOT NULL CHECK (supplier_price > 0),
  unit VARCHAR(20) NOT NULL,
  min_order_qty INTEGER DEFAULT 1,
  lead_time_days INTEGER DEFAULT 7,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(supplier_id, material_id)
);

-- Create indexes for supplier_materials
CREATE INDEX IF NOT EXISTS idx_supplier_materials_supplier_id ON public.supplier_materials(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_materials_material_id ON public.supplier_materials(material_id);

-- Enable RLS for supplier_materials
ALTER TABLE public.supplier_materials ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for supplier_materials
DROP POLICY IF EXISTS "Authenticated users can view supplier materials" ON public.supplier_materials;
DROP POLICY IF EXISTS "Authenticated users can manage supplier materials" ON public.supplier_materials;

CREATE POLICY "Authenticated users can view supplier materials" ON public.supplier_materials
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage supplier materials" ON public.supplier_materials
  FOR ALL USING (auth.role() = 'authenticated');

-- 3. FIX PURCHASE_ORDERS TABLE - ADD MISSING COLUMNS
-- ========================================
ALTER TABLE public.purchase_orders 
ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id),
ADD COLUMN IF NOT EXISTS quoted_price NUMERIC,
ADD COLUMN IF NOT EXISTS unit_price DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS supplier_name TEXT,
ADD COLUMN IF NOT EXISTS supplier_contact TEXT,
ADD COLUMN IF NOT EXISTS expected_delivery_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS expedition VARCHAR(100);

-- Create indexes for purchase_orders
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_name ON public.purchase_orders(supplier_name);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_expected_delivery_date ON public.purchase_orders(expected_delivery_date);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_expedition ON public.purchase_orders(expedition);

-- 4. CREATE SUPPLIER CODE GENERATION FUNCTIONS
-- ========================================
CREATE OR REPLACE FUNCTION generate_supplier_code()
RETURNS VARCHAR(20)
LANGUAGE plpgsql
AS $$
DECLARE
  new_code VARCHAR(20);
  counter INTEGER;
BEGIN
  -- Get the current max number from existing codes
  SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM 4) AS INTEGER)), 0) + 1
  INTO counter
  FROM suppliers
  WHERE code ~ '^SUP[0-9]+$';
  
  -- Generate new code
  new_code := 'SUP' || LPAD(counter::TEXT, 4, '0');
  
  RETURN new_code;
END;
$$;

-- Create trigger function
CREATE OR REPLACE FUNCTION set_supplier_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    NEW.code := generate_supplier_code();
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_set_supplier_code ON public.suppliers;
CREATE TRIGGER trigger_set_supplier_code
  BEFORE INSERT OR UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION set_supplier_code();

-- 5. INSERT SAMPLE SUPPLIERS DATA
-- ========================================
INSERT INTO public.suppliers (code, name, contact_person, phone, email, address, city, payment_terms) VALUES
('SUP0001', 'PT. Bahan Bangunan Jaya', 'Budi Santoso', '021-1234567', 'budi@bahanbangunanjaya.com', 'Jl. Industri No. 123', 'Jakarta', 'Net 30'),
('SUP0002', 'CV. Material Prima', 'Sari Dewi', '021-2345678', 'sari@materialprima.co.id', 'Jl. Gudang No. 456', 'Tangerang', 'Cash'),
('SUP0003', 'Toko Besi Berkah', 'Ahmad Rahman', '021-3456789', 'ahmad@besibekah.com', 'Jl. Logam No. 789', 'Bekasi', 'Net 14')
ON CONFLICT (code) DO NOTHING;

-- 6. UPDATE EXISTING PURCHASE ORDERS
-- ========================================
UPDATE public.purchase_orders 
SET total_cost = COALESCE(total_cost, (
  SELECT COALESCE(purchase_orders.quantity * m.price_per_unit, 0)
  FROM materials m 
  WHERE m.id = purchase_orders.material_id
))
WHERE total_cost IS NULL;

-- Success message
SELECT '✅ DATABASE FIX COMPLETED SUCCESSFULLY!' as status,
       'Tables: suppliers, supplier_materials created' as tables_created,
       'Columns: supplier_id, quoted_price, unit_price, supplier_name, supplier_contact, expected_delivery_date, expedition added to purchase_orders' as columns_added,
       'Sample data: 3 suppliers inserted' as sample_data;