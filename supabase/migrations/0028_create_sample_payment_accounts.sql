-- Insert sample payment accounts if they don't exist
INSERT INTO public.accounts (id, name, type, balance, initial_balance, is_payment_account, created_at)
VALUES 
  ('acc-cash-001', 'Kas Tunai', 'Aset', 0, 0, true, NOW()),
  ('acc-bank-001', 'Bank BCA', 'Aset', 0, 0, true, NOW()),
  ('acc-bank-002', 'Bank Mandiri', 'Aset', 0, 0, true, NOW())
ON CONFLICT (id) DO NOTHING;