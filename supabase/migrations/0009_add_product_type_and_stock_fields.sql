-- Add new fields to products table for stock management and product types
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'Stock' CHECK (type IN ('Stock', 'Beli')),
ADD COLUMN IF NOT EXISTS current_stock NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS min_stock NUMERIC DEFAULT 0;

-- Add comments for new columns
COMMENT ON COLUMN public.products.type IS 'Jenis barang: Stock (produksi menurunkan stock), Beli (produksi menambah stock)';
COMMENT ON COLUMN public.products.current_stock IS 'Stock saat ini';
COMMENT ON COLUMN public.products.min_stock IS 'Stock minimum untuk alert';

-- Create stock_movements table to track all stock changes
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('IN', 'OUT', 'ADJUSTMENT')),
  reason TEXT NOT NULL CHECK (reason IN ('PURCHASE', 'PRODUCTION', 'SALES', 'ADJUSTMENT', 'RETURN')),
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
  CONSTRAINT fk_stock_movement_product 
    FOREIGN KEY (product_id) 
    REFERENCES public.products(id) 
    ON DELETE CASCADE,
    
  CONSTRAINT fk_stock_movement_user 
    FOREIGN KEY (user_id) 
    REFERENCES public.users(id) 
    ON DELETE CASCADE,
    
  -- Ensure positive quantity
  CONSTRAINT positive_quantity CHECK (quantity > 0)
);

-- Enable Row Level Security
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users to view stock movements
CREATE POLICY IF NOT EXISTS "Authenticated users can view stock movements" 
ON public.stock_movements FOR SELECT 
USING (auth.role() = 'authenticated');

-- Create policy for authenticated users to insert stock movements
CREATE POLICY IF NOT EXISTS "Authenticated users can create stock movements" 
ON public.stock_movements FOR INSERT 
USING (auth.role() = 'authenticated');

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_user ON public.stock_movements(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON public.stock_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference ON public.stock_movements(reference_id, reference_type);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type_reason ON public.stock_movements(type, reason);

-- Add comments to stock_movements table
COMMENT ON TABLE public.stock_movements IS 'History of all stock movements and changes';
COMMENT ON COLUMN public.stock_movements.type IS 'Type of movement: IN (stock bertambah), OUT (stock berkurang), ADJUSTMENT (penyesuaian)';
COMMENT ON COLUMN public.stock_movements.reason IS 'Reason for movement: PURCHASE, PRODUCTION, SALES, ADJUSTMENT, RETURN';
COMMENT ON COLUMN public.stock_movements.quantity IS 'Quantity moved (always positive)';
COMMENT ON COLUMN public.stock_movements.previous_stock IS 'Stock before this movement';
COMMENT ON COLUMN public.stock_movements.new_stock IS 'Stock after this movement';
COMMENT ON COLUMN public.stock_movements.reference_id IS 'ID of related record (transaction, purchase order, etc)';
COMMENT ON COLUMN public.stock_movements.reference_type IS 'Type of reference (transaction, purchase_order, etc)';

-- Update existing products to have default values for new fields
UPDATE public.products 
SET 
  type = 'Stock',
  current_stock = 0,
  min_stock = 0
WHERE type IS NULL OR current_stock IS NULL OR min_stock IS NULL;