-- Add initial_balance column to accounts table
-- This separates the initial balance (set by owner) from current balance (calculated)

-- Add the new column
ALTER TABLE public.accounts ADD COLUMN initial_balance NUMERIC DEFAULT 0;

-- Update existing accounts to set initial_balance equal to current balance
-- This preserves existing data during migration
UPDATE public.accounts SET initial_balance = balance;

-- Make initial_balance NOT NULL after setting values
ALTER TABLE public.accounts ALTER COLUMN initial_balance SET NOT NULL;

-- Add comment to explain the columns
COMMENT ON COLUMN public.accounts.initial_balance IS 'Saldo awal yang diinput oleh owner, tidak berubah kecuali diupdate manual';
COMMENT ON COLUMN public.accounts.balance IS 'Saldo saat ini yang dihitung dari initial_balance + semua transaksi';