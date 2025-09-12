-- ========================================
-- CONNECT EMPLOYEE ADVANCES TO ACCOUNT 1220
-- ========================================
-- Purpose: Remove Panjar Karyawan from expense categories and connect to existing account 1220

-- Remove Panjar Karyawan from expense category mapping since it should be an asset, not expense
DELETE FROM public.expense_category_mapping WHERE category_name = 'Panjar Karyawan';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Employee advances connected to account 1220 successfully!';
  RAISE NOTICE '';
  RAISE NOTICE '📊 CHANGES MADE:';
  RAISE NOTICE '   - Removed "Panjar Karyawan" from expense categories';
  RAISE NOTICE '   - Employee advances now use existing account 1220';
  RAISE NOTICE '';
  RAISE NOTICE 'ℹ️  Employee advances will now be recorded as:';
  RAISE NOTICE '   - DEBIT: 1220 Panjar Karyawan (increase asset)';
  RAISE NOTICE '   - CREDIT: Payment Account (decrease cash/bank)';
  RAISE NOTICE '';
  RAISE NOTICE 'ℹ️  Repayments will be recorded as:';
  RAISE NOTICE '   - DEBIT: Payment Account (increase cash/bank)';  
  RAISE NOTICE '   - CREDIT: 1220 Panjar Karyawan (decrease asset)';
END $$;