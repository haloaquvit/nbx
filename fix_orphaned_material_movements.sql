-- Fix orphaned material_stock_movements records
-- Some material_stock_movements have material_id that don't exist in materials table

-- First, find orphaned records
SELECT
    msm.id,
    msm.material_id,
    msm.material_name,
    msm.created_at
FROM material_stock_movements msm
LEFT JOIN materials m ON m.id = msm.material_id
WHERE m.id IS NULL
ORDER BY msm.created_at DESC;

-- Option 1: Delete orphaned records (safest)
DELETE FROM material_stock_movements
WHERE material_id IN (
    SELECT msm.material_id
    FROM material_stock_movements msm
    LEFT JOIN materials m ON m.id = msm.material_id
    WHERE m.id IS NULL
);

-- Option 2: Create missing materials based on material_stock_movements data
-- (Only run this if you want to preserve the movement history)
/*
INSERT INTO materials (id, name, stock, price_per_unit, created_at)
SELECT DISTINCT
    msm.material_id,
    msm.material_name,
    0 as stock,
    0 as price_per_unit,
    NOW() as created_at
FROM material_stock_movements msm
LEFT JOIN materials m ON m.id = msm.material_id
WHERE m.id IS NULL
ON CONFLICT (id) DO NOTHING;
*/

-- After cleaning, recreate the foreign key constraint
ALTER TABLE public.material_stock_movements
DROP CONSTRAINT IF EXISTS material_stock_movements_material_id_fkey;

ALTER TABLE public.material_stock_movements
ADD CONSTRAINT material_stock_movements_material_id_fkey
FOREIGN KEY (material_id) REFERENCES public.materials(id) ON DELETE CASCADE;