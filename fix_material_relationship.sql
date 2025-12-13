-- Fix foreign key relationship for material_stock_movements
-- The foreign key constraint exists but Supabase PostgREST can't detect it

-- Drop and recreate the foreign key constraint with proper naming
ALTER TABLE public.material_stock_movements
DROP CONSTRAINT IF EXISTS fk_material_stock_movement_material;

ALTER TABLE public.material_stock_movements
ADD CONSTRAINT material_stock_movements_material_id_fkey
FOREIGN KEY (material_id) REFERENCES public.materials(id) ON DELETE CASCADE;

-- Verify the constraint
SELECT
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM
    information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name='material_stock_movements';