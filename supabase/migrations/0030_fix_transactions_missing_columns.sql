-- Fix missing columns in transactions table
-- Migration: 0030_fix_transactions_missing_columns.sql
-- Date: 2025-01-19

-- Add missing columns to transactions table
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS is_office_sale BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS subtotal NUMERIC,
ADD COLUMN IF NOT EXISTS ppn_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS ppn_mode TEXT CHECK (ppn_mode IN ('include', 'exclude')),
ADD COLUMN IF NOT EXISTS ppn_percentage NUMERIC DEFAULT 11,
ADD COLUMN IF NOT EXISTS ppn_amount NUMERIC DEFAULT 0;

-- Add comments for new columns
COMMENT ON COLUMN public.transactions.is_office_sale IS 'Menandakan apakah produk laku kantor (true) atau perlu diantar (false)';
COMMENT ON COLUMN public.transactions.due_date IS 'Tanggal jatuh tempo untuk pembayaran kredit';
COMMENT ON COLUMN public.transactions.subtotal IS 'Total sebelum PPN dan setelah diskon';
COMMENT ON COLUMN public.transactions.ppn_enabled IS 'Apakah PPN diaktifkan untuk transaksi ini';
COMMENT ON COLUMN public.transactions.ppn_mode IS 'Mode PPN: include (sudah termasuk) atau exclude (belum termasuk)';
COMMENT ON COLUMN public.transactions.ppn_percentage IS 'Persentase PPN yang digunakan (default 11%)';
COMMENT ON COLUMN public.transactions.ppn_amount IS 'Jumlah PPN dalam rupiah';

-- Create index for is_office_sale for faster delivery filtering
CREATE INDEX IF NOT EXISTS idx_transactions_is_office_sale ON public.transactions(is_office_sale);
CREATE INDEX IF NOT EXISTS idx_transactions_due_date ON public.transactions(due_date);
CREATE INDEX IF NOT EXISTS idx_transactions_ppn_enabled ON public.transactions(ppn_enabled);

-- Update existing transactions to set default values for new columns
-- Set is_office_sale = false for all existing transactions (they should be eligible for delivery)
UPDATE public.transactions 
SET 
  is_office_sale = false,
  ppn_enabled = false,
  ppn_percentage = 11,
  ppn_amount = 0
WHERE is_office_sale IS NULL 
   OR ppn_enabled IS NULL 
   OR ppn_percentage IS NULL 
   OR ppn_amount IS NULL;

-- For existing transactions, calculate subtotal from total (assuming no PPN was used before)
UPDATE public.transactions 
SET subtotal = total
WHERE subtotal IS NULL;

-- Success message
SELECT 'Kolom missing di tabel transactions berhasil ditambahkan!' as status;