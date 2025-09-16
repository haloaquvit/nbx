-- ========================================
-- CREATE SUPPLIERS TABLE
-- ========================================
-- Purpose: Create suppliers master data table

-- Create suppliers table
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
  payment_terms VARCHAR(50) DEFAULT 'Cash', -- Cash, Net 30, Net 60, etc.
  tax_number VARCHAR(50), -- NPWP
  bank_account VARCHAR(100),
  bank_name VARCHAR(50),
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_suppliers_code ON public.suppliers(code);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON public.suppliers(name);
CREATE INDEX IF NOT EXISTS idx_suppliers_is_active ON public.suppliers(is_active);

-- Enable RLS
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Authenticated users can view suppliers" ON public.suppliers
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage suppliers" ON public.suppliers
  FOR ALL USING (auth.role() = 'authenticated');

-- Create supplier_materials table for price tracking per supplier
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
CREATE POLICY "Authenticated users can view supplier materials" ON public.supplier_materials
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage supplier materials" ON public.supplier_materials
  FOR ALL USING (auth.role() = 'authenticated');

-- Add supplier_id to purchase_orders table
ALTER TABLE public.purchase_orders 
ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id),
ADD COLUMN IF NOT EXISTS quoted_price NUMERIC;

-- Create function to auto-generate supplier code
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

-- Create trigger to auto-generate supplier code if not provided
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

CREATE TRIGGER trigger_set_supplier_code
  BEFORE INSERT OR UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION set_supplier_code();

-- Insert sample suppliers
INSERT INTO public.suppliers (code, name, contact_person, phone, email, address, city, payment_terms) VALUES
('SUP0001', 'PT. Bahan Bangunan Jaya', 'Budi Santoso', '021-1234567', 'budi@bahanbangunanjaya.com', 'Jl. Industri No. 123', 'Jakarta', 'Net 30'),
('SUP0002', 'CV. Material Prima', 'Sari Dewi', '021-2345678', 'sari@materialprima.co.id', 'Jl. Gudang No. 456', 'Tangerang', 'Cash'),
('SUP0003', 'Toko Besi Berkah', 'Ahmad Rahman', '021-3456789', 'ahmad@besibekah.com', 'Jl. Logam No. 789', 'Bekasi', 'Net 14')
ON CONFLICT (code) DO NOTHING;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Suppliers table and integration created successfully!';
  RAISE NOTICE '';
  RAISE NOTICE '📊 TABLES CREATED:';
  RAISE NOTICE '   - suppliers: Master data supplier';
  RAISE NOTICE '   - supplier_materials: Price tracking per supplier';
  RAISE NOTICE '';
  RAISE NOTICE '🔗 INTEGRATIONS:';
  RAISE NOTICE '   - Added supplier_id to purchase_orders';
  RAISE NOTICE '   - Added quoted_price for manual price input';
  RAISE NOTICE '';
  RAISE NOTICE '📝 SAMPLE DATA:';
  RAISE NOTICE '   - 3 sample suppliers inserted';
  RAISE NOTICE '   - Auto-generated supplier codes (SUP0001, etc.)';
END $$;