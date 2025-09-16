-- Add expedition field to purchase orders table
ALTER TABLE public.purchase_orders 
ADD COLUMN expedition VARCHAR(100);

-- Add index for better query performance
CREATE INDEX idx_purchase_orders_expedition ON public.purchase_orders(expedition);

-- Update existing rows to have null expedition
UPDATE public.purchase_orders SET expedition = NULL WHERE expedition IS NULL;