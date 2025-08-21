-- Remove unused category column from products table
-- Migration: 0041_remove_unused_category_column.sql
-- Date: 2025-01-20
-- Purpose: Remove category column since it's not used in the application

-- Step 1: Drop the category column (it's not used in the app)
ALTER TABLE public.products DROP COLUMN IF EXISTS category;

-- Step 2: Ensure type column exists (this is what the app uses)
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'Produksi';

-- Step 3: Ensure stock columns exist (app expects these)
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS current_stock NUMERIC DEFAULT 0;

ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS min_stock NUMERIC DEFAULT 0;

-- Step 4: Update any existing products to have proper type if NULL
UPDATE public.products 
SET type = COALESCE(NULLIF(type, ''), 'Produksi') 
WHERE type IS NULL OR type = '';

-- Success message
SELECT 'Category column removed successfully! Products table now aligned with app requirements.' as status;