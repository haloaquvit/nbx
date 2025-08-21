-- Fix products category constraint issue  
-- Migration: 0039_fix_products_category_constraint.sql
-- Date: 2025-01-20
-- Purpose: Remove NOT NULL constraint from category since it's not used in the system

-- Option 1: Make category nullable (recommended since you don't use it)
ALTER TABLE public.products 
ALTER COLUMN category DROP NOT NULL;

-- Option 2: Set a simple default for any existing data
ALTER TABLE public.products 
ALTER COLUMN category SET DEFAULT 'Umum';

-- Update any existing records to have a default category
UPDATE public.products 
SET category = 'Umum' 
WHERE category IS NULL OR category = '';

-- Success message
SELECT 'Products category constraint removed! Category is now optional.' as status;