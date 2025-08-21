-- Debug and fix products insert issue
-- Migration: 0040_debug_and_fix_products_insert.sql  
-- Date: 2025-01-20
-- Purpose: Additional fixes and debugging for products table

-- First, let's see current table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'products' 
ORDER BY ordinal_position;

-- Make category nullable AND set default (belt and suspenders approach)
ALTER TABLE public.products 
ALTER COLUMN category DROP NOT NULL;

ALTER TABLE public.products 
ALTER COLUMN category SET DEFAULT 'Umum';

-- Update any existing records with null/empty category
UPDATE public.products 
SET category = COALESCE(NULLIF(category, ''), 'Umum')
WHERE category IS NULL OR category = '';

-- Let's also check if there might be a missing 'type' column that the app expects
-- If the app is looking for 'type' but database has 'category', we need to align

-- Add type column if it doesn't exist (the app seems to use 'type')
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'type'
  ) THEN
    ALTER TABLE public.products ADD COLUMN type TEXT DEFAULT 'Produksi';
    
    -- Copy category to type for existing records
    UPDATE public.products SET type = COALESCE(category, 'Produksi');
  END IF;
END $$;

-- Also ensure current_stock, min_stock columns exist (app seems to expect these)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'current_stock'
  ) THEN
    ALTER TABLE public.products ADD COLUMN current_stock NUMERIC DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'min_stock'
  ) THEN
    ALTER TABLE public.products ADD COLUMN min_stock NUMERIC DEFAULT 0;
  END IF;
END $$;

-- Show final table structure for verification
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'products' 
ORDER BY ordinal_position;

-- Success message
SELECT 'Products table structure fixed! Category is now nullable with default, type column added if needed.' as status;