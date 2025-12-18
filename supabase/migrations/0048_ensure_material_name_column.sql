-- =====================================================
-- ENSURE MATERIAL_NAME COLUMN EXISTS IN MATERIAL_STOCK_MOVEMENTS
-- =====================================================

-- Add material_name column if it doesn't exist
ALTER TABLE public.material_stock_movements 
ADD COLUMN IF NOT EXISTS material_name TEXT;

-- Set NOT NULL constraint only if column was just added and is currently nullable
UPDATE public.material_stock_movements 
SET material_name = 'Unknown Material' 
WHERE material_name IS NULL;

-- Make the column NOT NULL after populating it
ALTER TABLE public.material_stock_movements 
ALTER COLUMN material_name SET NOT NULL;