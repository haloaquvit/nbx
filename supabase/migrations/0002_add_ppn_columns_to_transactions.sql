-- Add PPN and subtotal columns to transactions table
ALTER TABLE public.transactions 
ADD COLUMN subtotal NUMERIC DEFAULT 0,
ADD COLUMN ppn_enabled BOOLEAN DEFAULT false,
ADD COLUMN ppn_percentage NUMERIC DEFAULT 11,
ADD COLUMN ppn_amount NUMERIC DEFAULT 0;

-- Update existing records to set subtotal equal to total for backward compatibility
UPDATE public.transactions SET subtotal = total WHERE subtotal = 0;