-- Create account transfers table to track transfer history
CREATE TABLE public.account_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_account_id TEXT NOT NULL,
  to_account_id TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  description TEXT NOT NULL,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Foreign key constraints
  CONSTRAINT fk_from_account 
    FOREIGN KEY (from_account_id) 
    REFERENCES public.accounts(id) 
    ON DELETE CASCADE,
    
  CONSTRAINT fk_to_account 
    FOREIGN KEY (to_account_id) 
    REFERENCES public.accounts(id) 
    ON DELETE CASCADE,
    
  CONSTRAINT fk_user 
    FOREIGN KEY (user_id) 
    REFERENCES public.users(id) 
    ON DELETE CASCADE,
    
  -- Ensure positive transfer amount
  CONSTRAINT positive_amount CHECK (amount > 0),
  
  -- Ensure different accounts
  CONSTRAINT different_accounts CHECK (from_account_id != to_account_id)
);

-- Enable Row Level Security
ALTER TABLE public.account_transfers ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users to view transfers
CREATE POLICY "Authenticated users can view account transfers" 
ON public.account_transfers FOR SELECT 
USING (auth.role() = 'authenticated');

-- Create policy for authenticated users to insert transfers
CREATE POLICY "Authenticated users can create account transfers" 
ON public.account_transfers FOR INSERT 
USING (auth.role() = 'authenticated');

-- Create indexes for better performance
CREATE INDEX idx_account_transfers_from_account ON public.account_transfers(from_account_id);
CREATE INDEX idx_account_transfers_to_account ON public.account_transfers(to_account_id);
CREATE INDEX idx_account_transfers_user ON public.account_transfers(user_id);
CREATE INDEX idx_account_transfers_created_at ON public.account_transfers(created_at DESC);

-- Add comments
COMMENT ON TABLE public.account_transfers IS 'History of transfers between accounts';
COMMENT ON COLUMN public.account_transfers.from_account_id IS 'Source account ID';
COMMENT ON COLUMN public.account_transfers.to_account_id IS 'Destination account ID';
COMMENT ON COLUMN public.account_transfers.amount IS 'Transfer amount';
COMMENT ON COLUMN public.account_transfers.description IS 'Transfer description/purpose';
COMMENT ON COLUMN public.account_transfers.user_id IS 'User who performed the transfer';
COMMENT ON COLUMN public.account_transfers.user_name IS 'Name of user who performed the transfer';