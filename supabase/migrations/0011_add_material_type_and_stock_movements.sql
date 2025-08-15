-- Add type field to materials table
ALTER TABLE public.materials 
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'Stock' CHECK (type IN ('Stock', 'Beli'));

-- Add comment for the new column
COMMENT ON COLUMN public.materials.type IS 'Jenis bahan: Stock (produksi menurunkan stock), Beli (produksi menambah stock)';

-- Update existing materials to have default type
UPDATE public.materials 
SET type = 'Stock'
WHERE type IS NULL;

-- Create material_stock_movements table to track all material stock changes
CREATE TABLE IF NOT EXISTS public.material_stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL,
  material_name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('IN', 'OUT', 'ADJUSTMENT')),
  reason TEXT NOT NULL CHECK (reason IN ('PURCHASE', 'PRODUCTION_CONSUMPTION', 'PRODUCTION_ACQUISITION', 'ADJUSTMENT', 'RETURN')),
  quantity NUMERIC NOT NULL,
  previous_stock NUMERIC NOT NULL,
  new_stock NUMERIC NOT NULL,
  notes TEXT,
  reference_id TEXT,
  reference_type TEXT,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Foreign key constraints
  CONSTRAINT fk_material_stock_movement_material 
    FOREIGN KEY (material_id) 
    REFERENCES public.materials(id) 
    ON DELETE CASCADE,
    
  CONSTRAINT fk_material_stock_movement_user 
    FOREIGN KEY (user_id) 
    REFERENCES public.profiles(id) 
    ON DELETE CASCADE,
    
  -- Ensure positive quantity
  CONSTRAINT positive_quantity CHECK (quantity > 0)
);

-- Enable Row Level Security
ALTER TABLE public.material_stock_movements ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users to view material stock movements
CREATE POLICY IF NOT EXISTS "Authenticated users can view material stock movements" 
ON public.material_stock_movements FOR SELECT 
USING (auth.role() = 'authenticated');

-- Create policy for authenticated users to insert material stock movements
CREATE POLICY IF NOT EXISTS "Authenticated users can create material stock movements" 
ON public.material_stock_movements FOR INSERT 
USING (auth.role() = 'authenticated');

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_material_stock_movements_material ON public.material_stock_movements(material_id);
CREATE INDEX IF NOT EXISTS idx_material_stock_movements_user ON public.material_stock_movements(user_id);
CREATE INDEX IF NOT EXISTS idx_material_stock_movements_created_at ON public.material_stock_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_stock_movements_reference ON public.material_stock_movements(reference_id, reference_type);
CREATE INDEX IF NOT EXISTS idx_material_stock_movements_type_reason ON public.material_stock_movements(type, reason);

-- Add comments to material_stock_movements table
COMMENT ON TABLE public.material_stock_movements IS 'History of all material stock movements and changes';
COMMENT ON COLUMN public.material_stock_movements.type IS 'Type of movement: IN (stock bertambah), OUT (stock berkurang), ADJUSTMENT (penyesuaian)';
COMMENT ON COLUMN public.material_stock_movements.reason IS 'Reason for movement: PURCHASE, PRODUCTION_CONSUMPTION, PRODUCTION_ACQUISITION, ADJUSTMENT, RETURN';
COMMENT ON COLUMN public.material_stock_movements.quantity IS 'Quantity moved (always positive)';
COMMENT ON COLUMN public.material_stock_movements.previous_stock IS 'Stock before this movement';
COMMENT ON COLUMN public.material_stock_movements.new_stock IS 'Stock after this movement';
COMMENT ON COLUMN public.material_stock_movements.reference_id IS 'ID of related record (transaction, purchase order, etc)';
COMMENT ON COLUMN public.material_stock_movements.reference_type IS 'Type of reference (transaction, purchase_order, etc)';