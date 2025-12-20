-- =====================================================
-- MIGRATION: Add retasi_items table for tracking products in retasi
-- =====================================================

-- Create retasi_items table if not exists
CREATE TABLE IF NOT EXISTS public.retasi_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retasi_id UUID NOT NULL REFERENCES public.retasi(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  returned_quantity INTEGER DEFAULT 0,
  sold_quantity INTEGER DEFAULT 0,
  error_quantity INTEGER DEFAULT 0,
  weight NUMERIC(10, 2),
  volume NUMERIC(10, 2),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_retasi_items_retasi_id ON public.retasi_items(retasi_id);
CREATE INDEX IF NOT EXISTS idx_retasi_items_product_id ON public.retasi_items(product_id);

-- Enable RLS
ALTER TABLE public.retasi_items ENABLE ROW LEVEL SECURITY;

-- Create RLS policy
DROP POLICY IF EXISTS "Authenticated users can manage retasi_items" ON public.retasi_items;
CREATE POLICY "Authenticated users can manage retasi_items"
  ON public.retasi_items
  FOR ALL
  USING (auth.role() = 'authenticated');

-- Add comment
COMMENT ON TABLE public.retasi_items IS 'Stores detail products that are carried in each retasi trip';
COMMENT ON COLUMN public.retasi_items.quantity IS 'Total quantity brought';
COMMENT ON COLUMN public.retasi_items.returned_quantity IS 'Quantity returned unsold';
COMMENT ON COLUMN public.retasi_items.sold_quantity IS 'Quantity sold';
COMMENT ON COLUMN public.retasi_items.error_quantity IS 'Quantity with errors/damage';

-- Verify
SELECT 'retasi_items table created successfully' AS status;
