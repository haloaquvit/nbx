-- Create manual journal entries table
CREATE TABLE IF NOT EXISTS public.manual_journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_number VARCHAR(20) UNIQUE NOT NULL,
  entry_date DATE NOT NULL,
  description TEXT NOT NULL,
  reference TEXT,
  total_amount NUMERIC NOT NULL CHECK (total_amount > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'reversed')),
  
  -- User tracking
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Posting tracking
  posted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  posted_by_name TEXT,
  posted_at TIMESTAMPTZ,
  
  -- Reversal tracking
  reversed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reversed_by_name TEXT,
  reversed_at TIMESTAMPTZ,
  reversal_reason TEXT,
  
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create manual journal entry lines table
CREATE TABLE IF NOT EXISTS public.manual_journal_entry_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id UUID NOT NULL REFERENCES public.manual_journal_entries(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  
  -- Account information
  account_id TEXT NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  account_code VARCHAR(10),
  account_name TEXT NOT NULL,
  
  -- Amount information
  debit_amount NUMERIC DEFAULT 0 CHECK (debit_amount >= 0),
  credit_amount NUMERIC DEFAULT 0 CHECK (credit_amount >= 0),
  
  -- Line details
  description TEXT,
  reference TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Ensure either debit or credit, not both
  CONSTRAINT debit_or_credit_not_both CHECK (
    (debit_amount > 0 AND credit_amount = 0) OR 
    (credit_amount > 0 AND debit_amount = 0)
  ),
  
  -- Ensure at least one amount is provided
  CONSTRAINT debit_or_credit_required CHECK (
    debit_amount > 0 OR credit_amount > 0
  ),
  
  -- Unique line number per journal
  UNIQUE (journal_id, line_number)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_manual_journal_entries_date ON public.manual_journal_entries(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_manual_journal_entries_status ON public.manual_journal_entries(status);
CREATE INDEX IF NOT EXISTS idx_manual_journal_entries_created_by ON public.manual_journal_entries(created_by);
CREATE INDEX IF NOT EXISTS idx_manual_journal_entries_journal_number ON public.manual_journal_entries(journal_number);

CREATE INDEX IF NOT EXISTS idx_manual_journal_entry_lines_journal_id ON public.manual_journal_entry_lines(journal_id);
CREATE INDEX IF NOT EXISTS idx_manual_journal_entry_lines_account_id ON public.manual_journal_entry_lines(account_id);

-- Enable Row Level Security
ALTER TABLE public.manual_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_journal_entry_lines ENABLE ROW LEVEL SECURITY;

-- RLS Policies for manual_journal_entries
CREATE POLICY "Authenticated users can view manual journal entries" 
ON public.manual_journal_entries FOR SELECT 
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can create manual journal entries" 
ON public.manual_journal_entries FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update manual journal entries" 
ON public.manual_journal_entries FOR UPDATE 
USING (auth.role() = 'authenticated');

CREATE POLICY "Only owners can delete manual journal entries" 
ON public.manual_journal_entries FOR DELETE 
USING (auth.role() = 'authenticated');

-- RLS Policies for manual_journal_entry_lines
CREATE POLICY "Authenticated users can view manual journal entry lines" 
ON public.manual_journal_entry_lines FOR SELECT 
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can create manual journal entry lines" 
ON public.manual_journal_entry_lines FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update manual journal entry lines" 
ON public.manual_journal_entry_lines FOR UPDATE 
USING (auth.role() = 'authenticated');

CREATE POLICY "Only owners can delete manual journal entry lines" 
ON public.manual_journal_entry_lines FOR DELETE 
USING (auth.role() = 'authenticated');

-- Function to generate journal number
CREATE OR REPLACE FUNCTION generate_journal_number(entry_date DATE)
RETURNS TEXT AS $$
DECLARE
  date_str TEXT;
  sequence_num INTEGER;
  journal_number TEXT;
BEGIN
  -- Format: MJE-YYYYMMDD-XXX (Manual Journal Entry)
  date_str := to_char(entry_date, 'YYYYMMDD');
  
  -- Get next sequence for this date
  SELECT COALESCE(MAX(
    CAST(
      SUBSTRING(journal_number FROM 'MJE-\d{8}-(\d+)') AS INTEGER
    )
  ), 0) + 1
  INTO sequence_num
  FROM public.manual_journal_entries
  WHERE journal_number LIKE 'MJE-' || date_str || '-%';
  
  -- Generate journal number
  journal_number := 'MJE-' || date_str || '-' || LPAD(sequence_num::TEXT, 3, '0');
  
  RETURN journal_number;
END;
$$ LANGUAGE plpgsql;

-- Function to validate journal entry balance
CREATE OR REPLACE FUNCTION validate_journal_balance(journal_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  total_debits NUMERIC;
  total_credits NUMERIC;
BEGIN
  -- Calculate total debits and credits
  SELECT 
    COALESCE(SUM(debit_amount), 0),
    COALESCE(SUM(credit_amount), 0)
  INTO total_debits, total_credits
  FROM public.manual_journal_entry_lines
  WHERE journal_id = validate_journal_balance.journal_id;
  
  -- Return true if balanced (difference less than 0.01 for rounding)
  RETURN ABS(total_debits - total_credits) < 0.01;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_manual_journal_entries_updated_at 
BEFORE UPDATE ON public.manual_journal_entries
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE public.manual_journal_entries IS 'Manual journal entries for non-cash transactions and adjustments';
COMMENT ON TABLE public.manual_journal_entry_lines IS 'Individual debit/credit lines for manual journal entries';

COMMENT ON COLUMN public.manual_journal_entries.status IS 'Entry status: draft (editable), posted (locked), reversed (cancelled)';
COMMENT ON COLUMN public.manual_journal_entries.journal_number IS 'Unique journal number in format MJE-YYYYMMDD-XXX';
COMMENT ON COLUMN public.manual_journal_entries.total_amount IS 'Total amount of the journal entry (sum of debits or credits)';

COMMENT ON COLUMN public.manual_journal_entry_lines.debit_amount IS 'Debit amount for this line (mutually exclusive with credit_amount)';
COMMENT ON COLUMN public.manual_journal_entry_lines.credit_amount IS 'Credit amount for this line (mutually exclusive with debit_amount)';
COMMENT ON COLUMN public.manual_journal_entry_lines.line_number IS 'Sequential line number within the journal entry';