-- ADD PAYROLL TYPES TO CASH_HISTORY
-- Add gaji_karyawan to the CHECK constraint

-- Drop the existing check constraint
ALTER TABLE public.cash_history DROP CONSTRAINT IF EXISTS cash_history_type_check;

-- Add new constraint with payroll types
ALTER TABLE public.cash_history ADD CONSTRAINT cash_history_type_check
CHECK (type IN (
  'orderan',
  'kas_masuk_manual',
  'kas_keluar_manual',
  'panjar_pengambilan',
  'panjar_pelunasan',
  'pengeluaran',
  'pembayaran_po',
  'pembayaran_piutang',
  'transfer_masuk',
  'transfer_keluar',
  'gaji_karyawan',
  'pembayaran_gaji'
));

DO $$
BEGIN
  RAISE NOTICE '✅ Added payroll types to cash_history!';
  RAISE NOTICE '📊 Valid types now include: gaji_karyawan, pembayaran_gaji';
  RAISE NOTICE '🧪 Test payroll payment now!';
END $$;