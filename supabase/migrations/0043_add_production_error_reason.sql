-- Add PRODUCTION_ERROR and PRODUCTION_DELETE_RESTORE reasons to material_stock_movements constraint
-- This allows recording material losses due to production errors and restoring stock when deleting production records

-- Drop the existing constraint
ALTER TABLE public.material_stock_movements 
DROP CONSTRAINT material_stock_movements_reason_check;

-- Add the updated constraint with new production-related reasons
ALTER TABLE public.material_stock_movements 
ADD CONSTRAINT material_stock_movements_reason_check 
CHECK (reason IN ('PURCHASE', 'PRODUCTION_CONSUMPTION', 'PRODUCTION_ACQUISITION', 'ADJUSTMENT', 'RETURN', 'PRODUCTION_ERROR', 'PRODUCTION_DELETE_RESTORE'));

-- Update comment to reflect the new reasons
COMMENT ON COLUMN public.material_stock_movements.reason IS 'Reason for movement: PURCHASE, PRODUCTION_CONSUMPTION, PRODUCTION_ACQUISITION, ADJUSTMENT, RETURN, PRODUCTION_ERROR, PRODUCTION_DELETE_RESTORE';