-- ========================================
-- FIX ADVANCE-PAYROLL INTEGRATION
-- ========================================
-- File: 0120_fix_advance_payroll_integration.sql
-- Purpose: Fix hardcoded account ID 'acc-1220' to use dynamic lookup by code '1220'
-- Date: 2025-01-21

-- Step 1: Create helper function to get Piutang Karyawan account ID dynamically
CREATE OR REPLACE FUNCTION public.get_piutang_karyawan_account_id()
RETURNS UUID AS $$
DECLARE
  account_id UUID;
BEGIN
  SELECT id INTO account_id
  FROM public.accounts
  WHERE code = '1220'
  LIMIT 1;

  IF account_id IS NULL THEN
    RAISE WARNING 'Piutang Karyawan account (code 1220) not found in accounts table';
  END IF;

  RETURN account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 2: Update the process_advance_repayment_from_salary function to use dynamic lookup
CREATE OR REPLACE FUNCTION public.process_advance_repayment_from_salary(
  payroll_record_id UUID,
  advance_deduction_amount DECIMAL(15,2)
)
RETURNS VOID AS $$
DECLARE
  payroll_record RECORD;
  remaining_deduction DECIMAL(15,2);
  advance_record RECORD;
  repayment_amount DECIMAL(15,2);
  piutang_account_id UUID;
BEGIN
  -- Get Piutang Karyawan account ID dynamically
  piutang_account_id := public.get_piutang_karyawan_account_id();

  IF piutang_account_id IS NULL THEN
    RAISE EXCEPTION 'Akun Piutang Karyawan (kode 1220) tidak ditemukan. Silakan tambahkan akun tersebut terlebih dahulu.';
  END IF;

  -- Get payroll record details
  SELECT pr.*, p.full_name as employee_name
  INTO payroll_record
  FROM public.payroll_records pr
  JOIN public.profiles p ON p.id = pr.employee_id
  WHERE pr.id = payroll_record_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll record not found';
  END IF;

  remaining_deduction := advance_deduction_amount;

  -- Log start of processing
  RAISE NOTICE '📋 Processing advance repayment for employee: %, amount: %', payroll_record.employee_name, advance_deduction_amount;

  -- Process advances in chronological order (FIFO)
  FOR advance_record IN
    SELECT ea.*, (ea.amount - COALESCE(SUM(ar.amount), 0)) as remaining_amount
    FROM public.employee_advances ea
    LEFT JOIN public.advance_repayments ar ON ar.advance_id = ea.id
    WHERE ea.employee_id = payroll_record.employee_id
      AND ea.date <= payroll_record.period_end
    GROUP BY ea.id, ea.amount, ea.date, ea.employee_id, ea.employee_name, ea.notes, ea.created_at, ea.account_id, ea.account_name, ea.branch_id, ea.remaining_amount
    HAVING (ea.amount - COALESCE(SUM(ar.amount), 0)) > 0
    ORDER BY ea.date ASC
  LOOP
    -- Calculate repayment amount for this advance
    repayment_amount := LEAST(remaining_deduction, advance_record.remaining_amount);

    RAISE NOTICE '  💰 Processing advance %: repaying % from remaining %', advance_record.id, repayment_amount, advance_record.remaining_amount;

    -- Create repayment record
    INSERT INTO public.advance_repayments (
      id,
      advance_id,
      amount,
      date,
      recorded_by,
      notes
    ) VALUES (
      'rep-' || extract(epoch from now())::bigint || '-' || substring(advance_record.id from 5),
      advance_record.id,
      repayment_amount,
      payroll_record.payment_date,
      payroll_record.created_by,
      'Pemotongan gaji ' || TO_CHAR(DATE(payroll_record.period_year || '-' || payroll_record.period_month || '-01'), 'Month YYYY')
    );

    -- Update remaining deduction
    remaining_deduction := remaining_deduction - repayment_amount;

    -- Update remaining amount using RPC
    PERFORM public.update_remaining_amount(advance_record.id);

    RAISE NOTICE '  ✅ Repayment created for advance %, remaining deduction: %', advance_record.id, remaining_deduction;

    -- Exit if all deduction is processed
    IF remaining_deduction <= 0 THEN
      EXIT;
    END IF;
  END LOOP;

  -- Update Piutang Karyawan account balance (decrease asset)
  -- Use dynamic account ID instead of hardcoded 'acc-1220'
  UPDATE public.accounts
  SET balance = balance - advance_deduction_amount
  WHERE id = piutang_account_id;

  RAISE NOTICE '✅ Piutang Karyawan (%) decreased by %', piutang_account_id, advance_deduction_amount;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 3: Recreate the trigger function with better logging
CREATE OR REPLACE FUNCTION public.trigger_process_advance_repayment()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process when payroll status changes to 'paid' and there are deductions
  IF NEW.status = 'paid' AND OLD.status != 'paid' AND NEW.deduction_amount > 0 THEN
    RAISE NOTICE '🔄 Payroll trigger: Processing advance repayment for payroll %, deduction amount: %', NEW.id, NEW.deduction_amount;

    -- Process advance repayments
    PERFORM public.process_advance_repayment_from_salary(NEW.id, NEW.deduction_amount);

    RAISE NOTICE '✅ Payroll trigger: Advance repayment processed successfully';
  ELSE
    IF NEW.status = 'paid' AND OLD.status != 'paid' THEN
      RAISE NOTICE 'ℹ️ Payroll trigger: Status changed to paid but no deduction (deduction_amount = %)', NEW.deduction_amount;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Ensure trigger exists
DROP TRIGGER IF EXISTS payroll_advance_repayment_trigger ON public.payroll_records;
CREATE TRIGGER payroll_advance_repayment_trigger
  AFTER UPDATE ON public.payroll_records
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_process_advance_repayment();

-- Step 5: Grant permissions
GRANT EXECUTE ON FUNCTION public.get_piutang_karyawan_account_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_advance_repayment_from_salary(UUID, DECIMAL) TO authenticated;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Advance-Payroll integration FIXED successfully!';
  RAISE NOTICE '🔧 Fixed: process_advance_repayment_from_salary now uses dynamic account lookup';
  RAISE NOTICE '🔧 Added: get_piutang_karyawan_account_id() helper function';
  RAISE NOTICE '🔧 Added: Better logging in trigger function';
END $$;
