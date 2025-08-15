-- CREATE SIMPLE TRANSACTION PAYMENT TRACKING SYSTEM
-- Transaction sebagai parent data - menggunakan kolom minimal yang pasti ada

-- ========================================
-- STEP 1: CREATE PAYMENT TRACKING TABLE
-- ========================================

CREATE TABLE IF NOT EXISTS public.transaction_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Transaction Reference (PARENT)
  transaction_id TEXT NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  
  -- Payment Details
  payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'bank_transfer', 'check', 'digital_wallet')),
  
  -- Account Information
  account_id TEXT REFERENCES public.accounts(id),
  account_name TEXT NOT NULL,
  
  -- Payment Description
  description TEXT NOT NULL,
  notes TEXT,
  reference_number TEXT,
  
  -- User Tracking
  paid_by_user_id UUID REFERENCES public.profiles(id),
  paid_by_user_name TEXT NOT NULL,
  paid_by_user_role TEXT,
  
  -- Audit Trail
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id),
  
  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'deleted')),
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES public.profiles(id),
  cancelled_reason TEXT
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_transaction_payments_transaction_id ON public.transaction_payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_payments_date ON public.transaction_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_transaction_payments_status ON public.transaction_payments(status);

-- ========================================
-- STEP 2: PAYMENT STATUS FUNCTION
-- ========================================

CREATE OR REPLACE FUNCTION public.calculate_transaction_payment_status(
  p_transaction_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  transaction_total NUMERIC;
  total_paid NUMERIC;
BEGIN
  -- Get transaction total
  SELECT total INTO transaction_total FROM transactions WHERE id = p_transaction_id;
  IF transaction_total IS NULL THEN RETURN 'unknown'; END IF;
  
  -- Calculate total payments (active only)
  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM transaction_payments 
  WHERE transaction_id = p_transaction_id AND status = 'active';
  
  -- Return status
  IF total_paid = 0 THEN RETURN 'unpaid';
  ELSIF total_paid >= transaction_total THEN RETURN 'paid';
  ELSE RETURN 'partial';
  END IF;
END;
$$;

-- ========================================
-- STEP 3: SIMPLE TRANSACTION DETAIL VIEW
-- ========================================

CREATE OR REPLACE VIEW public.transaction_detail_report AS
WITH payment_summary AS (
  SELECT 
    tp.transaction_id,
    COUNT(*) as payment_count,
    SUM(tp.amount) as total_paid,
    MIN(tp.payment_date) as first_payment_date,
    MAX(tp.payment_date) as last_payment_date,
    ARRAY_AGG(
      JSON_BUILD_OBJECT(
        'id', tp.id,
        'payment_date', tp.payment_date,
        'amount', tp.amount,
        'payment_method', tp.payment_method,
        'account_name', tp.account_name,
        'description', tp.description,
        'notes', tp.notes,
        'reference_number', tp.reference_number,
        'paid_by_user_name', tp.paid_by_user_name,
        'paid_by_user_role', tp.paid_by_user_role,
        'created_at', tp.created_at,
        'status', tp.status
      ) ORDER BY tp.payment_date DESC
    ) as payment_details
  FROM transaction_payments tp
  WHERE tp.status = 'active'
  GROUP BY tp.transaction_id
)
SELECT 
  -- Transaction Basic Info (minimal columns yang pasti ada)
  t.id as transaction_id,
  t.created_at as transaction_date,
  t.customer_name,
  COALESCE(c.phone, '') as customer_phone,
  COALESCE(c.address, '') as customer_address,
  '' as transaction_description,  -- Empty placeholder
  '' as transaction_notes,        -- Empty placeholder
  
  -- Financial Summary (kolom yang pasti ada)
  (t.total - t.paid_amount) as subtotal,
  0 as discount,  -- Default 0 jika tidak ada
  0 as ppn_amount,  -- Tidak ada kolom ppn_amount di tabel
  t.total as transaction_total,
  t.paid_amount as legacy_paid_amount,
  
  -- Payment Information
  COALESCE(ps.payment_count, 0) as payment_count,
  COALESCE(ps.total_paid, 0) as total_paid,
  (t.total - COALESCE(ps.total_paid, 0)) as remaining_balance,
  ps.first_payment_date,
  ps.last_payment_date,
  
  -- Payment Status
  calculate_transaction_payment_status(t.id) as payment_status,
  CASE 
    WHEN calculate_transaction_payment_status(t.id) = 'unpaid' THEN 'Belum Bayar'
    WHEN calculate_transaction_payment_status(t.id) = 'partial' THEN 'Bayar Partial'
    WHEN calculate_transaction_payment_status(t.id) = 'paid' THEN 'Lunas'
    ELSE 'Unknown'
  END as payment_status_label,
  
  -- Payment Details JSON
  ps.payment_details,
  
  -- Transaction Items (dari JSONB kolom items)
  t.items as transaction_items,
  
  -- Audit Info
  t.cashier_name as transaction_created_by,
  t.created_at as transaction_created_at,
  t.created_at as transaction_updated_at
  
FROM transactions t
LEFT JOIN payment_summary ps ON t.id = ps.transaction_id
LEFT JOIN customers c ON t.customer_id = c.id
ORDER BY t.created_at DESC;

-- ========================================
-- STEP 4: PAYMENT RECORDING FUNCTION
-- ========================================

CREATE OR REPLACE FUNCTION public.record_receivable_payment(
  p_transaction_id TEXT,
  p_amount NUMERIC,
  p_payment_method TEXT DEFAULT 'cash',
  p_account_id TEXT DEFAULT NULL,
  p_account_name TEXT DEFAULT 'Kas',
  p_description TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_reference_number TEXT DEFAULT NULL,
  p_paid_by_user_id UUID DEFAULT NULL,
  p_paid_by_user_name TEXT DEFAULT 'System',
  p_paid_by_user_role TEXT DEFAULT 'staff'
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  payment_id UUID;
  transaction_total NUMERIC;
  current_paid NUMERIC;
  new_payment_description TEXT;
BEGIN
  -- Validate transaction exists
  SELECT total INTO transaction_total FROM transactions WHERE id = p_transaction_id;
  IF transaction_total IS NULL THEN
    RAISE EXCEPTION 'Transaction not found: %', p_transaction_id;
  END IF;
  
  -- Calculate current paid amount
  SELECT COALESCE(SUM(amount), 0) INTO current_paid
  FROM transaction_payments 
  WHERE transaction_id = p_transaction_id AND status = 'active';
  
  -- Validate payment amount
  IF (current_paid + p_amount) > transaction_total THEN
    RAISE EXCEPTION 'Payment amount exceeds remaining balance';
  END IF;
  
  -- Generate description
  new_payment_description := COALESCE(p_description, 'Pembayaran piutang - ' || 
    CASE 
      WHEN (current_paid + p_amount) >= transaction_total THEN 'Pelunasan'
      ELSE 'Pembayaran ke-' || ((SELECT COUNT(*) FROM transaction_payments WHERE transaction_id = p_transaction_id AND status = 'active') + 1)
    END
  );
  
  -- Insert payment record
  INSERT INTO transaction_payments (
    transaction_id, amount, payment_method, account_id, account_name,
    description, notes, reference_number,
    paid_by_user_id, paid_by_user_name, paid_by_user_role, created_by
  ) VALUES (
    p_transaction_id, p_amount, p_payment_method, p_account_id, p_account_name,
    new_payment_description, p_notes, p_reference_number,
    p_paid_by_user_id, p_paid_by_user_name, p_paid_by_user_role, p_paid_by_user_id
  )
  RETURNING id INTO payment_id;
  
  -- Update transaction
  UPDATE transactions 
  SET 
    paid_amount = current_paid + p_amount,
    payment_status = CASE 
      WHEN current_paid + p_amount >= total THEN 'Lunas'::text
      ELSE 'Belum Lunas'::text
    END
  WHERE id = p_transaction_id;
  
  RETURN payment_id;
END;
$$;

-- ========================================
-- STEP 5: DELETE FUNCTIONS
-- ========================================

-- Cascading delete
CREATE OR REPLACE FUNCTION public.delete_transaction_cascade(
  p_transaction_id TEXT,
  p_deleted_by UUID DEFAULT NULL,
  p_reason TEXT DEFAULT 'Manual deletion'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  -- Soft delete payments
  UPDATE transaction_payments 
  SET status = 'deleted', cancelled_at = NOW(), cancelled_by = p_deleted_by,
      cancelled_reason = 'Transaction deleted: ' || p_reason
  WHERE transaction_id = p_transaction_id AND status = 'active';
  
  -- Delete main transaction (items are stored as JSONB, no separate table)
  DELETE FROM transactions WHERE id = p_transaction_id;
  
  RETURN TRUE;
END;
$$;

-- Cancel payment
CREATE OR REPLACE FUNCTION public.cancel_transaction_payment(
  p_payment_id UUID,
  p_cancelled_by UUID DEFAULT NULL,
  p_reason TEXT DEFAULT 'Payment cancelled'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  transaction_id_var TEXT;
  payment_amount NUMERIC;
  new_paid_amount NUMERIC;
BEGIN
  -- Get payment info
  SELECT transaction_id, amount INTO transaction_id_var, payment_amount
  FROM transaction_payments WHERE id = p_payment_id AND status = 'active';
  
  IF transaction_id_var IS NULL THEN
    RAISE EXCEPTION 'Payment not found or already cancelled';
  END IF;
  
  -- Cancel payment
  UPDATE transaction_payments 
  SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = p_cancelled_by, cancelled_reason = p_reason
  WHERE id = p_payment_id;
  
  -- Update transaction
  SELECT COALESCE(SUM(amount), 0) INTO new_paid_amount
  FROM transaction_payments WHERE transaction_id = transaction_id_var AND status = 'active';
  
  UPDATE transactions 
  SET paid_amount = new_paid_amount,
      payment_status = CASE WHEN new_paid_amount >= total THEN 'Lunas'::text ELSE 'Belum Lunas'::text END
  WHERE id = transaction_id_var;
  
  RETURN TRUE;
END;
$$;

-- Enable RLS on new table
ALTER TABLE public.transaction_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage transaction payments" ON public.transaction_payments FOR ALL USING (auth.role() = 'authenticated');