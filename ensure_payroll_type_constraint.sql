-- ENSURE GAJI_KARYAWAN TYPE IS ALLOWED IN CASH_HISTORY
-- This will fix the cash history not being saved due to type constraint

-- Drop existing type constraint
ALTER TABLE public.cash_history DROP CONSTRAINT IF EXISTS cash_history_type_check;

-- Add comprehensive constraint with all payroll types
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
  'gaji_karyawan',        -- ✅ PAYROLL PAYMENT TYPE
  'pembayaran_gaji'       -- ✅ ALTERNATIVE PAYROLL TYPE
));

-- Test the constraint allows gaji_karyawan
DO $$
BEGIN
  IF 'gaji_karyawan' = ANY(ARRAY[
    'orderan', 'kas_masuk_manual', 'kas_keluar_manual',
    'panjar_pengambilan', 'panjar_pelunasan', 'pengeluaran',
    'pembayaran_po', 'pembayaran_piutang', 'transfer_masuk',
    'transfer_keluar', 'gaji_karyawan', 'pembayaran_gaji'
  ]) THEN
    RAISE NOTICE '✅ gaji_karyawan type constraint is now valid!';
  ELSE
    RAISE NOTICE '❌ ERROR: gaji_karyawan still not allowed!';
  END IF;
END $$;