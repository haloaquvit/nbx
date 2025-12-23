-- Hapus kolom yang tidak digunakan di tabel accounts
-- Jalankan SQL ini di pgAdmin atau Supabase SQL Editor

-- 1. Hapus kolom 'category' (tidak digunakan di aplikasi)
ALTER TABLE accounts DROP COLUMN IF EXISTS category;

-- 2. Hapus kolom 'account_type' (digantikan oleh is_payment_account)
ALTER TABLE accounts DROP COLUMN IF EXISTS account_type;

-- 3. Hapus kolom 'current_balance' (duplikat dari balance)
ALTER TABLE accounts DROP COLUMN IF EXISTS current_balance;

-- 4. Hapus kolom 'normal_balance' (fitur dihapus dari UI)
ALTER TABLE accounts DROP COLUMN IF EXISTS normal_balance;

-- Verifikasi kolom yang tersisa
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'accounts'
ORDER BY ordinal_position;
