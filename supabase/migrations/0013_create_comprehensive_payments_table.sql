-- Create comprehensive payments table like ERP Odoo
-- This table will track ALL payments (POS direct payments + receivables payments)

-- 1. Create payments table
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Basic Payment Info
  payment_number TEXT UNIQUE NOT NULL, -- Auto-generated: PAY/2024/001
  payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  currency TEXT DEFAULT 'IDR',
  exchange_rate NUMERIC DEFAULT 1,
  
  -- Payment Classification
  payment_type TEXT NOT NULL CHECK (payment_type IN ('inbound', 'outbound')), -- Masuk/Keluar
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer', 'check', 'card', 'digital_wallet', 'other')),
  payment_source TEXT NOT NULL CHECK (payment_source IN ('pos_direct', 'receivables', 'manual_entry', 'expense', 'advance')),
  
  -- Status and State
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'posted', 'cancelled', 'reconciled')),
  is_reconciled BOOLEAN DEFAULT FALSE,
  reconciliation_date TIMESTAMPTZ,
  
  -- Partner Information (Customer/Vendor)
  partner_id UUID REFERENCES public.customers(id), -- Could be customer or vendor
  partner_name TEXT NOT NULL,
  partner_type TEXT NOT NULL CHECK (partner_type IN ('customer', 'vendor', 'employee')),
  
  -- Transaction Reference
  transaction_id TEXT REFERENCES public.transactions(id),
  invoice_number TEXT, -- For reference
  order_number TEXT, -- For reference
  
  -- Account Information
  payment_account_id TEXT NOT NULL REFERENCES public.accounts(id),
  payment_account_name TEXT NOT NULL,
  destination_account_id TEXT REFERENCES public.accounts(id), -- For transfers
  destination_account_name TEXT,
  
  -- Journal Entry Reference
  journal_entry_id TEXT, -- For accounting integration
  
  -- Payment Details
  reference TEXT, -- External reference (check number, transfer ref, etc.)
  communication TEXT, -- Payment memo/description
  notes TEXT,
  
  -- Reconciliation Info
  allocated_amount NUMERIC DEFAULT 0, -- How much is allocated to invoices
  unallocated_amount NUMERIC DEFAULT 0, -- Remaining unallocated
  
  -- Document Attachments
  attachment_ids JSONB DEFAULT '[]', -- Array of file references
  
  -- Audit Trail
  created_by UUID REFERENCES public.profiles(id),
  created_by_name TEXT,
  posted_by UUID REFERENCES public.profiles(id),
  posted_by_name TEXT,
  cancelled_by UUID REFERENCES public.profiles(id),
  cancelled_by_name TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  posted_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  
  -- Constraints
  CONSTRAINT valid_amounts CHECK (allocated_amount + unallocated_amount <= amount),
  CONSTRAINT valid_posted_state CHECK (
    (state = 'posted' AND posted_by IS NOT NULL AND posted_at IS NOT NULL) OR 
    (state != 'posted')
  ),
  CONSTRAINT valid_cancelled_state CHECK (
    (state = 'cancelled' AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL) OR 
    (state != 'cancelled')
  )
);

-- 2. Create payment_allocations table for invoice allocations
CREATE TABLE public.payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  transaction_id TEXT NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  allocated_amount NUMERIC NOT NULL CHECK (allocated_amount > 0),
  allocation_date TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by UUID REFERENCES public.profiles(id),
  created_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Ensure no duplicate allocations
  UNIQUE(payment_id, transaction_id)
);

-- 3. Enable RLS
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;

-- 4. Create policies
CREATE POLICY "Authenticated users can manage payments" ON public.payments 
FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage payment allocations" ON public.payment_allocations 
FOR ALL USING (auth.role() = 'authenticated');

-- 5. Create indexes for performance
CREATE INDEX idx_payments_payment_number ON public.payments(payment_number);
CREATE INDEX idx_payments_payment_date ON public.payments(payment_date);
CREATE INDEX idx_payments_partner_id ON public.payments(partner_id);
CREATE INDEX idx_payments_transaction_id ON public.payments(transaction_id);
CREATE INDEX idx_payments_payment_account_id ON public.payments(payment_account_id);
CREATE INDEX idx_payments_state ON public.payments(state);
CREATE INDEX idx_payments_payment_source ON public.payments(payment_source);
CREATE INDEX idx_payments_payment_type ON public.payments(payment_type);

CREATE INDEX idx_payment_allocations_payment_id ON public.payment_allocations(payment_id);
CREATE INDEX idx_payment_allocations_transaction_id ON public.payment_allocations(transaction_id);

-- 6. Create sequence for payment numbers
CREATE SEQUENCE IF NOT EXISTS payment_number_seq START 1;

-- 7. Function to generate payment number
CREATE OR REPLACE FUNCTION generate_payment_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  year_part TEXT;
  seq_number TEXT;
BEGIN
  year_part := EXTRACT(YEAR FROM NOW())::TEXT;
  seq_number := LPAD(nextval('payment_number_seq')::TEXT, 4, '0');
  RETURN 'PAY/' || year_part || '/' || seq_number;
END;
$$;

-- 8. Function to update payment amounts on allocation changes
CREATE OR REPLACE FUNCTION update_payment_amounts()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update allocated and unallocated amounts
  UPDATE public.payments 
  SET 
    allocated_amount = (
      SELECT COALESCE(SUM(allocated_amount), 0) 
      FROM public.payment_allocations 
      WHERE payment_id = COALESCE(NEW.payment_id, OLD.payment_id)
    ),
    updated_at = NOW()
  WHERE id = COALESCE(NEW.payment_id, OLD.payment_id);
  
  -- Update unallocated amount
  UPDATE public.payments 
  SET unallocated_amount = amount - allocated_amount
  WHERE id = COALESCE(NEW.payment_id, OLD.payment_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 9. Create triggers
CREATE TRIGGER trg_update_payment_amounts
  AFTER INSERT OR UPDATE OR DELETE ON public.payment_allocations
  FOR EACH ROW EXECUTE FUNCTION update_payment_amounts();

-- 10. Function to create payment from POS
CREATE OR REPLACE FUNCTION create_pos_payment(
  p_transaction_id TEXT,
  p_amount NUMERIC,
  p_payment_method TEXT,
  p_payment_account_id TEXT,
  p_payment_account_name TEXT,
  p_partner_id UUID,
  p_partner_name TEXT,
  p_reference TEXT DEFAULT NULL,
  p_communication TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL,
  p_created_by_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_payment_id UUID;
  v_payment_number TEXT;
BEGIN
  -- Generate payment number
  v_payment_number := generate_payment_number();
  
  -- Create payment record
  INSERT INTO public.payments (
    payment_number,
    payment_date,
    amount,
    payment_type,
    payment_method,
    payment_source,
    state,
    partner_id,
    partner_name,
    partner_type,
    transaction_id,
    payment_account_id,
    payment_account_name,
    reference,
    communication,
    allocated_amount,
    unallocated_amount,
    created_by,
    created_by_name
  ) VALUES (
    v_payment_number,
    NOW(),
    p_amount,
    'inbound',
    p_payment_method,
    'pos_direct',
    'posted', -- POS payments are automatically posted
    p_partner_id,
    p_partner_name,
    'customer',
    p_transaction_id,
    p_payment_account_id,
    p_payment_account_name,
    p_reference,
    COALESCE(p_communication, 'Pembayaran langsung via POS - Order: ' || p_transaction_id),
    p_amount, -- Full amount allocated to transaction
    0, -- No unallocated amount
    p_created_by,
    p_created_by_name
  ) RETURNING id INTO v_payment_id;
  
  -- Create allocation record
  INSERT INTO public.payment_allocations (
    payment_id,
    transaction_id,
    allocated_amount,
    created_by,
    created_by_name
  ) VALUES (
    v_payment_id,
    p_transaction_id,
    p_amount,
    p_created_by,
    p_created_by_name
  );
  
  RETURN v_payment_id;
END;
$$;

-- 11. Function to create payment from receivables
CREATE OR REPLACE FUNCTION create_receivables_payment(
  p_transaction_id TEXT,
  p_amount NUMERIC,
  p_payment_method TEXT DEFAULT 'cash',
  p_payment_account_id TEXT,
  p_payment_account_name TEXT,
  p_reference TEXT DEFAULT NULL,
  p_communication TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL,
  p_created_by_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_payment_id UUID;
  v_payment_number TEXT;
  v_transaction RECORD;
BEGIN
  -- Get transaction info
  SELECT * INTO v_transaction FROM public.transactions WHERE id = p_transaction_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;
  
  -- Generate payment number
  v_payment_number := generate_payment_number();
  
  -- Create payment record
  INSERT INTO public.payments (
    payment_number,
    payment_date,
    amount,
    payment_type,
    payment_method,
    payment_source,
    state,
    partner_id,
    partner_name,
    partner_type,
    transaction_id,
    payment_account_id,
    payment_account_name,
    reference,
    communication,
    notes,
    allocated_amount,
    unallocated_amount,
    created_by,
    created_by_name
  ) VALUES (
    v_payment_number,
    NOW(),
    p_amount,
    'inbound',
    p_payment_method,
    'receivables',
    'posted', -- Receivables payments are automatically posted
    v_transaction.customer_id,
    v_transaction.customer_name,
    'customer',
    p_transaction_id,
    p_payment_account_id,
    p_payment_account_name,
    p_reference,
    COALESCE(p_communication, 'Pembayaran piutang - Order: ' || p_transaction_id),
    p_notes,
    p_amount, -- Full amount allocated to transaction
    0, -- No unallocated amount
    p_created_by,
    p_created_by_name
  ) RETURNING id INTO v_payment_id;
  
  -- Create allocation record
  INSERT INTO public.payment_allocations (
    payment_id,
    transaction_id,
    allocated_amount,
    created_by,
    created_by_name
  ) VALUES (
    v_payment_id,
    p_transaction_id,
    p_amount,
    p_created_by,
    p_created_by_name
  );
  
  -- Update transaction paid amount and status
  UPDATE public.transactions 
  SET 
    paid_amount = paid_amount + p_amount,
    payment_status = CASE 
      WHEN paid_amount + p_amount >= total THEN 'Lunas'
      ELSE 'Belum Lunas'
    END
  WHERE id = p_transaction_id;
  
  RETURN v_payment_id;
END;
$$;

-- 12. Function to get payment summary
CREATE OR REPLACE FUNCTION get_payment_summary(
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  total_inbound NUMERIC,
  total_outbound NUMERIC,
  net_cash_flow NUMERIC,
  pos_payments NUMERIC,
  receivables_payments NUMERIC,
  manual_payments NUMERIC,
  cash_payments NUMERIC,
  bank_payments NUMERIC,
  payment_count BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(CASE WHEN payment_type = 'inbound' THEN amount ELSE 0 END), 0) as total_inbound,
    COALESCE(SUM(CASE WHEN payment_type = 'outbound' THEN amount ELSE 0 END), 0) as total_outbound,
    COALESCE(SUM(CASE WHEN payment_type = 'inbound' THEN amount ELSE -amount END), 0) as net_cash_flow,
    COALESCE(SUM(CASE WHEN payment_source = 'pos_direct' THEN amount ELSE 0 END), 0) as pos_payments,
    COALESCE(SUM(CASE WHEN payment_source = 'receivables' THEN amount ELSE 0 END), 0) as receivables_payments,
    COALESCE(SUM(CASE WHEN payment_source = 'manual_entry' THEN amount ELSE 0 END), 0) as manual_payments,
    COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN amount ELSE 0 END), 0) as cash_payments,
    COALESCE(SUM(CASE WHEN payment_method IN ('bank_transfer', 'check') THEN amount ELSE 0 END), 0) as bank_payments,
    COUNT(*) as payment_count
  FROM public.payments 
  WHERE state = 'posted'
    AND (p_start_date IS NULL OR payment_date >= p_start_date)
    AND (p_end_date IS NULL OR payment_date <= p_end_date);
END;
$$;

-- 13. Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_payments_updated_at 
  BEFORE UPDATE ON public.payments 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 14. Verification
SELECT 
  'payments table' as component,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payments') 
    THEN '✅ Created' 
    ELSE '❌ Missing' 
  END as status
UNION ALL
SELECT 
  'payment_allocations table' as component,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_allocations') 
    THEN '✅ Created' 
    ELSE '❌ Missing' 
  END as status
UNION ALL
SELECT 
  'create_pos_payment function' as component,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'create_pos_payment') 
    THEN '✅ Created' 
    ELSE '❌ Missing' 
  END as status
UNION ALL
SELECT 
  'create_receivables_payment function' as component,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'create_receivables_payment') 
    THEN '✅ Created' 
    ELSE '❌ Missing' 
  END as status;

-- Migration completed! 🎉
-- Next: Update POS and Receivables to use these functions