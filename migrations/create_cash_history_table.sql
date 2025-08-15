-- Create cash_history table for tracking all cash transactions
CREATE TABLE cash_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id text REFERENCES public.accounts(id) ON DELETE CASCADE NOT NULL,
  account_name text NOT NULL,
  type text NOT NULL CHECK (type IN (
    'orderan',
    'kas_masuk_manual',
    'kas_keluar_manual',
    'panjar_pengambilan',
    'panjar_pelunasan',
    'pengeluaran',
    'pembayaran_po',
    'pemutihan_piutang',
    'transfer_masuk',
    'transfer_keluar'
  )),
  amount numeric NOT NULL,
  description text NOT NULL,
  reference_id text,
  reference_name text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes for better query performance
CREATE INDEX idx_cash_history_account_id ON cash_history(account_id);
CREATE INDEX idx_cash_history_type ON cash_history(type);
CREATE INDEX idx_cash_history_created_at ON cash_history(created_at);
CREATE INDEX idx_cash_history_user_id ON cash_history(user_id);

-- Enable RLS (Row Level Security)
ALTER TABLE cash_history ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Enable read access for authenticated users" ON cash_history
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users" ON cash_history
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Trigger for updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_cash_history_updated_at BEFORE UPDATE ON cash_history
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();