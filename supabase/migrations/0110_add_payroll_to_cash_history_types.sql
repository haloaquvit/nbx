-- Add payroll payment types to cash_history
-- File: 0110_add_payroll_to_cash_history_types.sql
-- Purpose: Add gaji_karyawan and pembayaran_hutang to cash_history type constraint

-- Drop existing constraint
ALTER TABLE public.cash_history
DROP CONSTRAINT IF EXISTS cash_history_type_check;

-- Add new constraint with additional types
ALTER TABLE public.cash_history
ADD CONSTRAINT cash_history_type_check CHECK (type IN (
  'orderan',
  'kas_masuk_manual',
  'kas_keluar_manual',
  'panjar_pengambilan',
  'panjar_pelunasan',
  'pengeluaran',
  'pembayaran_po',
  'pembayaran_piutang',
  'pembayaran_hutang',
  'gaji_karyawan',
  'transfer_masuk',
  'transfer_keluar'
));

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Cash history types updated successfully!';
  RAISE NOTICE 'Added types: gaji_karyawan, pembayaran_hutang';
END $$;
