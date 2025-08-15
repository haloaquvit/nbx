-- Add payment_history table to track detailed payment records for receivables
CREATE TABLE public.payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id TEXT NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  remaining_amount NUMERIC NOT NULL CHECK (remaining_amount >= 0),
  payment_method TEXT DEFAULT 'Tunai',
  account_id TEXT REFERENCES public.accounts(id),
  account_name TEXT,
  notes TEXT,
  recorded_by UUID REFERENCES public.profiles(id),
  recorded_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;

-- Create policy for payment_history
CREATE POLICY "Authenticated users can manage payment history" ON public.payment_history 
FOR ALL USING (auth.role() = 'authenticated');

-- Create index for better query performance
CREATE INDEX idx_payment_history_transaction_id ON public.payment_history(transaction_id);
CREATE INDEX idx_payment_history_payment_date ON public.payment_history(payment_date);

-- Function to automatically update payment history when receivable is paid
CREATE OR REPLACE FUNCTION public.record_payment_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only trigger if paid_amount increased
  IF NEW.paid_amount > OLD.paid_amount THEN
    INSERT INTO public.payment_history (
      transaction_id,
      amount,
      payment_date,
      remaining_amount,
      recorded_by_name
    ) VALUES (
      NEW.id,
      NEW.paid_amount - OLD.paid_amount,
      NOW(),
      NEW.total - NEW.paid_amount,
      'System Auto-Record'
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger to automatically record payment history
CREATE TRIGGER on_receivable_payment
  AFTER UPDATE OF paid_amount ON public.transactions
  FOR EACH ROW
  WHEN (NEW.paid_amount IS DISTINCT FROM OLD.paid_amount)
  EXECUTE FUNCTION public.record_payment_history();

-- Function to pay receivable with proper history tracking
CREATE OR REPLACE FUNCTION public.pay_receivable_with_history(
  p_transaction_id TEXT,
  p_amount NUMERIC,
  p_account_id TEXT DEFAULT NULL,
  p_account_name TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_recorded_by UUID DEFAULT NULL,
  p_recorded_by_name TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transaction RECORD;
  v_remaining_amount NUMERIC;
BEGIN
  -- Get current transaction
  SELECT * INTO v_transaction FROM public.transactions WHERE id = p_transaction_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;
  
  -- Calculate remaining amount after this payment
  v_remaining_amount := v_transaction.total - (v_transaction.paid_amount + p_amount);
  
  IF v_remaining_amount < 0 THEN
    RAISE EXCEPTION 'Payment amount exceeds remaining balance';
  END IF;
  
  -- Update transaction
  UPDATE public.transactions 
  SET 
    paid_amount = paid_amount + p_amount,
    payment_status = CASE 
      WHEN paid_amount + p_amount >= total THEN 'Lunas'
      ELSE 'Belum Lunas'
    END
  WHERE id = p_transaction_id;
  
  -- Record payment history
  INSERT INTO public.payment_history (
    transaction_id,
    amount,
    payment_date,
    remaining_amount,
    account_id,
    account_name,
    notes,
    recorded_by,
    recorded_by_name
  ) VALUES (
    p_transaction_id,
    p_amount,
    NOW(),
    v_remaining_amount,
    p_account_id,
    p_account_name,
    p_notes,
    p_recorded_by,
    p_recorded_by_name
  );
END;
$$;