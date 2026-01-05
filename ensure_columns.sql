-- Ensure all required columns exist for RPC functions
-- Transactions
ALTER TABLE transactions 
  ADD COLUMN IF NOT EXISTS ref TEXT,
  ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Deliveries
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'delivered',
  ADD COLUMN IF NOT EXISTS hpp_total NUMERIC DEFAULT 0;

-- Production Records
ALTER TABLE production_records
  ADD COLUMN IF NOT EXISTS ref TEXT,
  ADD COLUMN IF NOT EXISTS consume_bom BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS bom_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS user_input_id UUID,
  ADD COLUMN IF NOT EXISTS user_input_name TEXT;

-- Receivables
ALTER TABLE receivables
  ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_payment_date DATE;

-- Accounts Payable
ALTER TABLE accounts_payable
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS notes TEXT;
