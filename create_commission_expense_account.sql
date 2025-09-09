-- Create commission expense account if it doesn't exist
INSERT INTO accounts (id, name, type, balance, is_payment_account, created_at)
VALUES (
  'beban-komisi',
  'Beban Komisi Karyawan',
  'expense',
  0,
  false,
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Also create a more general commission expense account as backup
INSERT INTO accounts (id, name, type, balance, is_payment_account, created_at)
VALUES (
  'expense-commission',
  'Komisi Penjualan',
  'expense',
  0,
  false,
  NOW()
)
ON CONFLICT (id) DO NOTHING;