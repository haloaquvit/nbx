-- Add sales_id and sales_name columns to transactions table
-- Migration: 0045_add_sales_columns_to_transactions.sql
-- Date: 2025-09-06
-- Purpose: Support commission tracking for sales persons

-- Add sales columns to transactions table
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS sales_id UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS sales_name TEXT;

-- Add comments for new columns
COMMENT ON COLUMN public.transactions.sales_id IS 'ID of the sales person responsible for this transaction';
COMMENT ON COLUMN public.transactions.sales_name IS 'Name of the sales person responsible for this transaction';

-- Create index for sales_id for faster commission queries
CREATE INDEX IF NOT EXISTS idx_transactions_sales_id ON public.transactions(sales_id);

-- Success message
SELECT 'Kolom sales_id dan sales_name berhasil ditambahkan ke tabel transactions!' as status;