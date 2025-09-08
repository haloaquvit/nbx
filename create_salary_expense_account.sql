-- Create Salary Expense Account for Commission Integration
-- Date: 2025-09-06
-- Purpose: Ensure salary expense account exists for automatic commission expenses

-- Create the salary expense account if it doesn't exist
INSERT INTO public.accounts (id, name, type, balance, is_payment_account, created_at)
VALUES ('beban-gaji', 'Beban Gaji Karyawan', 'expense', 0, false, NOW())
ON CONFLICT (id) DO UPDATE SET 
  name = 'Beban Gaji Karyawan',
  type = 'expense';

-- Also create a more specific commission expense account
INSERT INTO public.accounts (id, name, type, balance, is_payment_account, created_at)
VALUES ('beban-komisi', 'Beban Komisi Karyawan', 'expense', 0, false, NOW())
ON CONFLICT (id) DO UPDATE SET 
  name = 'Beban Komisi Karyawan',
  type = 'expense';

SELECT 'Akun beban gaji dan komisi berhasil dibuat!' as status;