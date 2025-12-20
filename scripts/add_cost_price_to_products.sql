-- =====================================================
-- MIGRATION: Add cost_price field to products table
-- =====================================================
-- This field stores the purchase cost (HPP) for "Jual Langsung" products
-- For "Produksi" products, HPP is calculated from BOM (Bill of Materials)

-- Add cost_price column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'products'
    AND column_name = 'cost_price'
  ) THEN
    ALTER TABLE public.products ADD COLUMN cost_price NUMERIC(15, 2) DEFAULT 0;
  END IF;
END $$;

-- Add comment to explain the field
COMMENT ON COLUMN public.products.cost_price IS 'Harga pokok/modal pembelian untuk produk Jual Langsung. Untuk produk Produksi, HPP dihitung dari BOM.';

-- Verify
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'products'
AND column_name = 'cost_price';

SELECT 'cost_price column added successfully' AS status;
