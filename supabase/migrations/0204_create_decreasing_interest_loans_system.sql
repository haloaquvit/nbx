-- ============================================================================
-- SISTEM HUTANG DENGAN BUNGA MENURUN (Decreasing Interest Loan System)
-- ============================================================================
-- Sistem untuk mengelola hutang dengan perhitungan bunga menurun
-- Bunga dihitung dari sisa pokok pinjaman setiap periode
-- ============================================================================

-- 1. Create loans table (Tabel Hutang Utama)
CREATE TABLE IF NOT EXISTS public.loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_number VARCHAR(50) UNIQUE NOT NULL,

  -- Basic info
  branch_id UUID REFERENCES public.branches(id),
  supplier_id UUID REFERENCES public.suppliers(id), -- Creditor (Bank, Supplier, dll)
  creditor_name VARCHAR(255) NOT NULL,
  creditor_type VARCHAR(50) DEFAULT 'supplier', -- 'supplier', 'bank', 'individual', 'other'

  -- Loan details
  principal_amount DECIMAL(15,2) NOT NULL CHECK (principal_amount > 0), -- Pokok pinjaman
  interest_rate DECIMAL(5,2) NOT NULL CHECK (interest_rate >= 0), -- % per bulan/tahun
  interest_period VARCHAR(20) DEFAULT 'monthly', -- 'monthly', 'yearly'
  loan_term_months INTEGER NOT NULL CHECK (loan_term_months > 0), -- Jangka waktu dalam bulan

  -- Dates
  loan_date DATE NOT NULL,
  first_payment_date DATE NOT NULL,

  -- Status
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'paid_off', 'cancelled'

  -- Calculated fields (diisi saat generate payment schedule)
  total_interest DECIMAL(15,2) DEFAULT 0, -- Total bunga keseluruhan
  total_amount DECIMAL(15,2), -- Total pokok + bunga
  monthly_principal DECIMAL(15,2), -- Angsuran pokok per bulan

  -- Current status
  paid_principal DECIMAL(15,2) DEFAULT 0, -- Pokok yang sudah dibayar
  paid_interest DECIMAL(15,2) DEFAULT 0, -- Bunga yang sudah dibayar
  remaining_principal DECIMAL(15,2), -- Sisa pokok hutang

  -- Notes
  purpose TEXT, -- Tujuan pinjaman
  notes TEXT,

  -- Audit
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create loan_payment_schedules table (Jadwal Pembayaran)
CREATE TABLE IF NOT EXISTS public.loan_payment_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,

  -- Schedule details
  installment_number INTEGER NOT NULL, -- Angsuran ke-
  due_date DATE NOT NULL,

  -- Amounts (Decreasing Interest Calculation)
  principal_amount DECIMAL(15,2) NOT NULL, -- Angsuran pokok (tetap)
  interest_amount DECIMAL(15,2) NOT NULL, -- Bunga (menurun)
  total_payment DECIMAL(15,2) NOT NULL, -- Total = pokok + bunga

  -- Sisa setelah angsuran ini
  remaining_principal DECIMAL(15,2) NOT NULL,

  -- Payment status
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'paid', 'overdue', 'partial'
  paid_date DATE,
  paid_amount DECIMAL(15,2) DEFAULT 0,
  paid_principal DECIMAL(15,2) DEFAULT 0,
  paid_interest DECIMAL(15,2) DEFAULT 0,

  -- Late payment
  days_late INTEGER DEFAULT 0,
  late_fee DECIMAL(15,2) DEFAULT 0,

  -- Payment reference
  payment_id UUID, -- Reference to cash_history or journal entry

  -- Notes
  notes TEXT,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(loan_id, installment_number)
);

-- 3. Create loan_payments table (Riwayat Pembayaran Aktual)
CREATE TABLE IF NOT EXISTS public.loan_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES public.loan_payment_schedules(id),

  -- Payment details
  payment_date DATE NOT NULL,
  payment_amount DECIMAL(15,2) NOT NULL CHECK (payment_amount > 0),

  -- Allocation
  allocated_principal DECIMAL(15,2) NOT NULL,
  allocated_interest DECIMAL(15,2) NOT NULL,
  allocated_late_fee DECIMAL(15,2) DEFAULT 0,

  -- Payment method
  payment_method VARCHAR(50), -- 'cash', 'transfer', 'check'
  account_id UUID REFERENCES public.accounts(id), -- Account used for payment

  -- Reference
  cash_history_id UUID REFERENCES public.cash_history(id),
  receipt_number VARCHAR(50),

  -- Notes
  notes TEXT,

  -- Audit
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create indexes
CREATE INDEX IF NOT EXISTS idx_loans_branch_id ON public.loans(branch_id);
CREATE INDEX IF NOT EXISTS idx_loans_supplier_id ON public.loans(supplier_id);
CREATE INDEX IF NOT EXISTS idx_loans_status ON public.loans(status);
CREATE INDEX IF NOT EXISTS idx_loans_loan_date ON public.loans(loan_date);

CREATE INDEX IF NOT EXISTS idx_loan_schedules_loan_id ON public.loan_payment_schedules(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_schedules_due_date ON public.loan_payment_schedules(due_date);
CREATE INDEX IF NOT EXISTS idx_loan_schedules_status ON public.loan_payment_schedules(status);

CREATE INDEX IF NOT EXISTS idx_loan_payments_loan_id ON public.loan_payments(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_payments_schedule_id ON public.loan_payments(schedule_id);
CREATE INDEX IF NOT EXISTS idx_loan_payments_date ON public.loan_payments(payment_date);

-- 5. Enable RLS
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_payment_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_payments ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS Policies
CREATE POLICY "Users can view loans in their branch or if admin"
  ON public.loans FOR SELECT
  USING (
    branch_id IN (
      SELECT id FROM public.branches
      WHERE id = (SELECT branch_id FROM public.profiles WHERE id = auth.uid())
    )
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin', 'super_admin', 'head_office_admin')
  );

CREATE POLICY "Authorized users can insert loans"
  ON public.loans FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authorized users can update loans"
  ON public.loans FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view payment schedules for their branch loans"
  ON public.loan_payment_schedules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.id = loan_payment_schedules.loan_id
      AND (
        l.branch_id IN (
          SELECT id FROM public.branches
          WHERE id = (SELECT branch_id FROM public.profiles WHERE id = auth.uid())
        )
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin', 'super_admin', 'head_office_admin')
      )
    )
  );

CREATE POLICY "Authorized users can manage payment schedules"
  ON public.loan_payment_schedules FOR ALL
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view loan payments for their branch"
  ON public.loan_payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.id = loan_payments.loan_id
      AND (
        l.branch_id IN (
          SELECT id FROM public.branches
          WHERE id = (SELECT branch_id FROM public.profiles WHERE id = auth.uid())
        )
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin', 'super_admin', 'head_office_admin')
      )
    )
  );

CREATE POLICY "Authorized users can manage loan payments"
  ON public.loan_payments FOR ALL
  USING (auth.uid() IS NOT NULL);

-- 7. Create function to generate loan number
CREATE OR REPLACE FUNCTION generate_loan_number()
RETURNS TEXT AS $$
DECLARE
  new_number TEXT;
  counter INTEGER;
BEGIN
  -- Get the latest loan number for current year
  SELECT COALESCE(
    MAX(
      CAST(
        SUBSTRING(loan_number FROM 'LOAN-[0-9]{4}-([0-9]+)') AS INTEGER
      )
    ), 0
  ) INTO counter
  FROM public.loans
  WHERE EXTRACT(YEAR FROM loan_date) = EXTRACT(YEAR FROM CURRENT_DATE);

  -- Increment counter
  counter := counter + 1;

  -- Generate new loan number: LOAN-YYYY-NNNN
  new_number := 'LOAN-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(counter::TEXT, 4, '0');

  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- 8. Create function to calculate decreasing interest payment schedule
CREATE OR REPLACE FUNCTION calculate_decreasing_interest_schedule(
  p_loan_id UUID
)
RETURNS TABLE (
  installment_number INTEGER,
  due_date DATE,
  principal_amount DECIMAL,
  interest_amount DECIMAL,
  total_payment DECIMAL,
  remaining_principal DECIMAL
) AS $$
DECLARE
  v_loan RECORD;
  v_monthly_principal DECIMAL;
  v_remaining_principal DECIMAL;
  v_interest_amount DECIMAL;
  v_current_date DATE;
  v_monthly_rate DECIMAL;
  v_total_interest DECIMAL := 0;
BEGIN
  -- Get loan details
  SELECT * INTO v_loan FROM public.loans WHERE id = p_loan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan not found';
  END IF;

  -- Calculate monthly principal (pokok per bulan)
  v_monthly_principal := v_loan.principal_amount / v_loan.loan_term_months;
  v_remaining_principal := v_loan.principal_amount;
  v_current_date := v_loan.first_payment_date;

  -- Calculate monthly interest rate
  IF v_loan.interest_period = 'yearly' THEN
    v_monthly_rate := v_loan.interest_rate / 12;
  ELSE
    v_monthly_rate := v_loan.interest_rate;
  END IF;

  -- Generate schedule for each installment
  FOR i IN 1..v_loan.loan_term_months LOOP
    -- Calculate interest for this period (based on remaining principal)
    -- Bunga = Sisa Pokok × Rate
    v_interest_amount := ROUND(v_remaining_principal * (v_monthly_rate / 100), 2);
    v_total_interest := v_total_interest + v_interest_amount;

    installment_number := i;
    due_date := v_current_date;
    principal_amount := v_monthly_principal;
    interest_amount := v_interest_amount;
    total_payment := v_monthly_principal + v_interest_amount;

    -- Calculate remaining after this payment
    v_remaining_principal := v_remaining_principal - v_monthly_principal;
    remaining_principal := GREATEST(v_remaining_principal, 0); -- Avoid negative

    RETURN NEXT;

    -- Move to next month
    v_current_date := v_current_date + INTERVAL '1 month';
  END LOOP;

  -- Update loan total interest
  UPDATE public.loans
  SET
    total_interest = v_total_interest,
    total_amount = principal_amount + v_total_interest,
    monthly_principal = v_monthly_principal,
    remaining_principal = principal_amount
  WHERE id = p_loan_id;

END;
$$ LANGUAGE plpgsql;

-- 9. Create function to generate and save payment schedule
CREATE OR REPLACE FUNCTION generate_loan_payment_schedule(p_loan_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_schedule RECORD;
BEGIN
  -- Delete existing schedules
  DELETE FROM public.loan_payment_schedules WHERE loan_id = p_loan_id;

  -- Generate and insert schedules
  FOR v_schedule IN
    SELECT * FROM calculate_decreasing_interest_schedule(p_loan_id)
  LOOP
    INSERT INTO public.loan_payment_schedules (
      loan_id,
      installment_number,
      due_date,
      principal_amount,
      interest_amount,
      total_payment,
      remaining_principal,
      status
    ) VALUES (
      p_loan_id,
      v_schedule.installment_number,
      v_schedule.due_date,
      v_schedule.principal_amount,
      v_schedule.interest_amount,
      v_schedule.total_payment,
      v_schedule.remaining_principal,
      'pending'
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- 10. Create function to process loan payment
CREATE OR REPLACE FUNCTION process_loan_payment(
  p_loan_id UUID,
  p_payment_amount DECIMAL,
  p_payment_date DATE,
  p_account_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_loan RECORD;
  v_schedule RECORD;
  v_remaining_amount DECIMAL := p_payment_amount;
  v_allocated_principal DECIMAL := 0;
  v_allocated_interest DECIMAL := 0;
  v_allocated_late_fee DECIMAL := 0;
  v_payment_id UUID;
  v_schedules_updated INTEGER := 0;
BEGIN
  -- Get loan
  SELECT * INTO v_loan FROM public.loans WHERE id = p_loan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan not found';
  END IF;

  -- Process payment for pending/overdue schedules in order
  FOR v_schedule IN
    SELECT * FROM public.loan_payment_schedules
    WHERE loan_id = p_loan_id
    AND status IN ('pending', 'overdue', 'partial')
    ORDER BY installment_number
  LOOP
    EXIT WHEN v_remaining_amount <= 0;

    -- Calculate days late
    DECLARE
      v_days_late INTEGER := GREATEST(0, p_payment_date - v_schedule.due_date);
      v_late_fee DECIMAL := 0;
      v_amount_needed DECIMAL;
    BEGIN
      -- Calculate late fee if applicable (example: 0.1% per day, max 5%)
      IF v_days_late > 0 THEN
        v_late_fee := LEAST(
          v_schedule.total_payment * 0.05, -- Max 5%
          v_schedule.total_payment * (v_days_late * 0.001) -- 0.1% per day
        );
      END IF;

      v_amount_needed := v_schedule.total_payment - v_schedule.paid_amount + v_late_fee;

      IF v_remaining_amount >= v_amount_needed THEN
        -- Full payment
        UPDATE public.loan_payment_schedules
        SET
          status = 'paid',
          paid_date = p_payment_date,
          paid_amount = paid_amount + v_amount_needed,
          paid_principal = principal_amount,
          paid_interest = interest_amount,
          days_late = v_days_late,
          late_fee = v_late_fee,
          updated_at = NOW()
        WHERE id = v_schedule.id;

        v_allocated_principal := v_allocated_principal + v_schedule.principal_amount;
        v_allocated_interest := v_allocated_interest + v_schedule.interest_amount;
        v_allocated_late_fee := v_allocated_late_fee + v_late_fee;
        v_remaining_amount := v_remaining_amount - v_amount_needed;
        v_schedules_updated := v_schedules_updated + 1;
      ELSE
        -- Partial payment
        DECLARE
          v_partial_principal DECIMAL;
          v_partial_interest DECIMAL;
        BEGIN
          -- Allocate to interest first, then principal
          IF v_remaining_amount > v_schedule.interest_amount THEN
            v_partial_interest := v_schedule.interest_amount;
            v_partial_principal := v_remaining_amount - v_partial_interest;
          ELSE
            v_partial_interest := v_remaining_amount;
            v_partial_principal := 0;
          END IF;

          UPDATE public.loan_payment_schedules
          SET
            status = 'partial',
            paid_amount = paid_amount + v_remaining_amount,
            paid_principal = paid_principal + v_partial_principal,
            paid_interest = paid_interest + v_partial_interest,
            days_late = v_days_late,
            late_fee = v_late_fee,
            updated_at = NOW()
          WHERE id = v_schedule.id;

          v_allocated_principal := v_allocated_principal + v_partial_principal;
          v_allocated_interest := v_allocated_interest + v_partial_interest;
          v_remaining_amount := 0;
          v_schedules_updated := v_schedules_updated + 1;
        END;
      END IF;
    END;
  END LOOP;

  -- Create payment record
  INSERT INTO public.loan_payments (
    loan_id,
    payment_date,
    payment_amount,
    allocated_principal,
    allocated_interest,
    allocated_late_fee,
    account_id,
    created_by
  ) VALUES (
    p_loan_id,
    p_payment_date,
    p_payment_amount,
    v_allocated_principal,
    v_allocated_interest,
    v_allocated_late_fee,
    p_account_id,
    COALESCE(p_user_id, auth.uid())
  ) RETURNING id INTO v_payment_id;

  -- Update loan totals
  UPDATE public.loans
  SET
    paid_principal = paid_principal + v_allocated_principal,
    paid_interest = paid_interest + v_allocated_interest,
    remaining_principal = principal_amount - (paid_principal + v_allocated_principal),
    status = CASE
      WHEN (principal_amount - (paid_principal + v_allocated_principal)) <= 0 THEN 'paid_off'
      ELSE status
    END,
    updated_at = NOW()
  WHERE id = p_loan_id;

  RETURN json_build_object(
    'payment_id', v_payment_id,
    'allocated_principal', v_allocated_principal,
    'allocated_interest', v_allocated_interest,
    'allocated_late_fee', v_allocated_late_fee,
    'remaining_amount', v_remaining_amount,
    'schedules_updated', v_schedules_updated
  );
END;
$$ LANGUAGE plpgsql;

-- 11. Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_loan_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_loans_updated_at
  BEFORE UPDATE ON public.loans
  FOR EACH ROW
  EXECUTE FUNCTION update_loan_updated_at();

CREATE TRIGGER trigger_loan_schedules_updated_at
  BEFORE UPDATE ON public.loan_payment_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_loan_updated_at();

-- 12. Create helpful views
CREATE OR REPLACE VIEW loan_summary AS
SELECT
  l.id,
  l.loan_number,
  l.creditor_name,
  l.creditor_type,
  b.name as branch_name,
  l.principal_amount,
  l.interest_rate,
  l.interest_period,
  l.loan_term_months,
  l.loan_date,
  l.status,
  l.total_interest,
  l.total_amount,
  l.paid_principal,
  l.paid_interest,
  l.remaining_principal,
  COUNT(lps.id) FILTER (WHERE lps.status = 'paid') as paid_installments,
  COUNT(lps.id) FILTER (WHERE lps.status = 'pending') as pending_installments,
  COUNT(lps.id) FILTER (WHERE lps.status = 'overdue') as overdue_installments,
  MIN(lps.due_date) FILTER (WHERE lps.status IN ('pending', 'overdue')) as next_payment_date,
  SUM(lps.total_payment) FILTER (WHERE lps.status IN ('pending', 'overdue', 'partial')) as remaining_payment
FROM public.loans l
LEFT JOIN public.branches b ON l.branch_id = b.id
LEFT JOIN public.loan_payment_schedules lps ON l.id = lps.loan_id
GROUP BY l.id, l.loan_number, l.creditor_name, l.creditor_type, b.name,
         l.principal_amount, l.interest_rate, l.interest_period, l.loan_term_months,
         l.loan_date, l.status, l.total_interest, l.total_amount,
         l.paid_principal, l.paid_interest, l.remaining_principal;

-- 13. Add comments
COMMENT ON TABLE public.loans IS 'Tabel hutang dengan sistem bunga menurun';
COMMENT ON TABLE public.loan_payment_schedules IS 'Jadwal pembayaran angsuran hutang';
COMMENT ON TABLE public.loan_payments IS 'Riwayat pembayaran hutang aktual';

COMMENT ON COLUMN public.loans.principal_amount IS 'Pokok pinjaman awal';
COMMENT ON COLUMN public.loans.interest_rate IS 'Persentase bunga per periode';
COMMENT ON COLUMN public.loans.monthly_principal IS 'Angsuran pokok per bulan (tetap)';
COMMENT ON COLUMN public.loans.total_interest IS 'Total bunga keseluruhan (menurun setiap periode)';

COMMENT ON FUNCTION calculate_decreasing_interest_schedule IS 'Menghitung jadwal pembayaran dengan bunga menurun';
COMMENT ON FUNCTION generate_loan_payment_schedule IS 'Generate dan simpan jadwal pembayaran ke database';
COMMENT ON FUNCTION process_loan_payment IS 'Proses pembayaran angsuran hutang';

-- 14. Example usage documentation
COMMENT ON VIEW loan_summary IS 'Ringkasan hutang dengan status pembayaran
Contoh penggunaan:
1. Buat hutang baru:
   INSERT INTO loans (loan_number, creditor_name, principal_amount, interest_rate, loan_term_months, loan_date, first_payment_date)
   VALUES (generate_loan_number(), ''Bank ABC'', 100000000, 12, 12, CURRENT_DATE, CURRENT_DATE + INTERVAL ''1 month'');

2. Generate jadwal pembayaran:
   SELECT generate_loan_payment_schedule(''loan_id'');

3. Lihat jadwal:
   SELECT * FROM loan_payment_schedules WHERE loan_id = ''loan_id'' ORDER BY installment_number;

4. Proses pembayaran:
   SELECT process_loan_payment(''loan_id'', 9000000, CURRENT_DATE);

5. Lihat ringkasan:
   SELECT * FROM loan_summary;
';
