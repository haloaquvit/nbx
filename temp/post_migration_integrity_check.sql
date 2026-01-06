-- ============================================================================
-- Post-RPC Migration Data Integrity Checks
-- Run these queries to identify issues after RPC migration
-- ============================================================================

-- ============================================================================
-- 1. INVENTORY INTEGRITY
-- ============================================================================

-- Check for negative stock
SELECT 
  p.id,
  p.name,
  p.stock,
  b.name as branch_name,
  'NEGATIVE STOCK' as issue
FROM products p
JOIN branches b ON b.id = p.branch_id
WHERE p.stock < 0
ORDER BY p.stock;

-- Check FIFO batch integrity (batch qty != product stock)
SELECT 
  p.id,
  p.name,
  p.stock as product_stock,
  SUM(ib.remaining_quantity) as total_batch_qty,
  SUM(ib.remaining_quantity) - p.stock as difference,
  'BATCH MISMATCH' as issue
FROM products p
LEFT JOIN inventory_batches ib ON ib.product_id = p.id
GROUP BY p.id, p.name, p.stock
HAVING ABS(SUM(COALESCE(ib.remaining_quantity, 0)) - p.stock) > 0.01
ORDER BY ABS(SUM(COALESCE(ib.remaining_quantity, 0)) - p.stock) DESC;

-- Check for batches with negative remaining_quantity
SELECT 
  ib.id,
  p.name as product_name,
  ib.initial_quantity,
  ib.remaining_quantity,
  ib.batch_date,
  'NEGATIVE BATCH' as issue
FROM inventory_batches ib
JOIN products p ON p.id = ib.product_id
WHERE ib.remaining_quantity < 0
ORDER BY ib.remaining_quantity;

-- ============================================================================
-- 2. JOURNAL INTEGRITY
-- ============================================================================

-- Check unbalanced journals
SELECT 
  je.id,
  je.entry_number,
  je.entry_date,
  je.description,
  je.reference_type,
  je.total_debit,
  je.total_credit,
  ABS(je.total_debit - je.total_credit) as imbalance,
  'UNBALANCED JOURNAL' as issue
FROM journal_entries je
WHERE je.is_voided = FALSE
  AND ABS(je.total_debit - je.total_credit) > 0.01
ORDER BY ABS(je.total_debit - je.total_credit) DESC;

-- Check journals without lines
SELECT 
  je.id,
  je.entry_number,
  je.entry_date,
  je.description,
  'NO JOURNAL LINES' as issue
FROM journal_entries je
LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
WHERE jel.id IS NULL 
  AND je.is_voided = FALSE
ORDER BY je.created_at DESC;

-- Check journal lines with zero amounts
SELECT 
  je.entry_number,
  jel.line_number,
  a.code,
  a.name,
  jel.debit_amount,
  jel.credit_amount,
  'ZERO AMOUNT LINE' as issue
FROM journal_entry_lines jel
JOIN journal_entries je ON je.id = jel.journal_entry_id
JOIN accounts a ON a.id = jel.account_id
WHERE jel.debit_amount = 0 AND jel.credit_amount = 0
  AND je.is_voided = FALSE
ORDER BY je.created_at DESC;

-- ============================================================================
-- 3. ACCOUNTS PAYABLE INTEGRITY
-- ============================================================================

-- Check AP without PO (orphaned)
SELECT 
  ap.id,
  ap.supplier_name,
  ap.amount,
  ap.purchase_order_id,
  'ORPHANED AP (NO PO)' as issue
FROM accounts_payable ap
WHERE ap.purchase_order_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM purchase_orders po WHERE po.id = ap.purchase_order_id)
ORDER BY ap.created_at DESC;

-- Check duplicate AP for same PO
SELECT 
  ap.purchase_order_id,
  po.po_number,
  COUNT(*) as ap_count,
  STRING_AGG(ap.id, ', ') as ap_ids,
  SUM(ap.amount) as total_amount,
  'DUPLICATE AP FOR PO' as issue
FROM accounts_payable ap
JOIN purchase_orders po ON po.id = ap.purchase_order_id
WHERE ap.purchase_order_id IS NOT NULL
GROUP BY ap.purchase_order_id, po.po_number
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;

-- Check AP with NULL branch_id
SELECT 
  ap.id,
  ap.supplier_name,
  ap.amount,
  ap.branch_id,
  'NULL BRANCH_ID' as issue
FROM accounts_payable ap
WHERE ap.branch_id IS NULL
ORDER BY ap.created_at DESC;

-- ============================================================================
-- 4. TRANSACTION INTEGRITY
-- ============================================================================

-- Check transactions with wrong payment_status
SELECT 
  t.id,
  t.customer_name,
  t.total,
  t.paid_amount,
  t.payment_status as current_status,
  CASE 
    WHEN t.paid_amount >= t.total THEN 'Lunas'
    WHEN t.paid_amount > 0 THEN 'Partial'
    ELSE 'Belum Lunas'
  END as expected_status,
  'WRONG PAYMENT STATUS' as issue
FROM transactions t
WHERE t.payment_status != CASE 
    WHEN t.paid_amount >= t.total THEN 'Lunas'
    WHEN t.paid_amount > 0 THEN 'Partial'
    ELSE 'Belum Lunas'
  END
  AND t.is_voided = FALSE
ORDER BY t.created_at DESC;

-- Check transactions with paid_amount > total
SELECT 
  t.id,
  t.customer_name,
  t.total,
  t.paid_amount,
  t.paid_amount - t.total as overpayment,
  'OVERPAYMENT' as issue
FROM transactions t
WHERE t.paid_amount > t.total
  AND t.is_voided = FALSE
ORDER BY (t.paid_amount - t.total) DESC;

-- Check transactions without journal
SELECT 
  t.id,
  t.customer_name,
  t.total,
  t.order_date,
  'NO JOURNAL ENTRY' as issue
FROM transactions t
WHERE NOT EXISTS (
  SELECT 1 FROM journal_entries je 
  WHERE je.reference_id = t.id 
    AND je.reference_type = 'transaction'
    AND je.is_voided = FALSE
)
  AND t.is_voided = FALSE
  AND t.created_at >= '2025-01-01'
ORDER BY t.created_at DESC;

-- ============================================================================
-- 5. PURCHASE ORDER INTEGRITY
-- ============================================================================

-- Check PO without journal (Approved/Diterima but no journal)
SELECT 
  po.id,
  po.po_number,
  po.status,
  po.total_cost,
  po.approved_at,
  'NO JOURNAL ENTRY' as issue
FROM purchase_orders po
WHERE po.status IN ('Approved', 'Diterima')
  AND NOT EXISTS (
    SELECT 1 FROM journal_entries je 
    WHERE je.reference_id = po.id 
      AND je.reference_type = 'purchase_order'
      AND je.is_voided = FALSE
  )
ORDER BY po.created_at DESC;

-- Check PO without AP (Approved/Diterima but no AP)
SELECT 
  po.id,
  po.po_number,
  po.status,
  po.total_cost,
  po.approved_at,
  'NO ACCOUNTS PAYABLE' as issue
FROM purchase_orders po
WHERE po.status IN ('Approved', 'Diterima')
  AND NOT EXISTS (
    SELECT 1 FROM accounts_payable ap 
    WHERE ap.purchase_order_id = po.id
  )
ORDER BY po.created_at DESC;

-- ============================================================================
-- 6. DELIVERY INTEGRITY
-- ============================================================================

-- Check deliveries without stock deduction
SELECT 
  d.id,
  d.delivery_number,
  t.id as transaction_id,
  d.status,
  'NO STOCK MOVEMENT' as issue
FROM deliveries d
JOIN transactions t ON t.id = d.transaction_id
WHERE d.status = 'Delivered'
  AND NOT EXISTS (
    SELECT 1 FROM product_stock_movements psm
    WHERE psm.reference_id = d.id::TEXT
      AND psm.reference_type = 'delivery'
  )
ORDER BY d.created_at DESC;

-- ============================================================================
-- 7. PRODUCTION INTEGRITY
-- ============================================================================

-- Check production with wrong reference_type in journal
SELECT 
  pr.id,
  pr.ref,
  je.entry_number,
  je.reference_type,
  'WRONG REFERENCE TYPE (should be production)' as issue
FROM production_records pr
JOIN journal_entries je ON je.reference_id = pr.id::TEXT
WHERE je.reference_type != 'production'
  AND je.is_voided = FALSE
ORDER BY pr.created_at DESC;

-- ============================================================================
-- 8. ACCOUNT BALANCE INTEGRITY
-- ============================================================================

-- Recalculate account balances and compare with stored balance
WITH calculated_balances AS (
  SELECT 
    a.id,
    a.code,
    a.name,
    a.balance as stored_balance,
    a.normal_balance,
    COALESCE(SUM(
      CASE 
        WHEN a.normal_balance = 'DEBIT' THEN jel.debit_amount - jel.credit_amount
        ELSE jel.credit_amount - jel.debit_amount
      END
    ), 0) + COALESCE(a.initial_balance, 0) as calculated_balance
  FROM accounts a
  LEFT JOIN journal_entry_lines jel ON jel.account_id = a.id
  LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.is_voided = FALSE
  WHERE a.is_active = TRUE
  GROUP BY a.id, a.code, a.name, a.balance, a.normal_balance, a.initial_balance
)
SELECT 
  code,
  name,
  stored_balance,
  calculated_balance,
  ABS(stored_balance - calculated_balance) as difference,
  'BALANCE MISMATCH' as issue
FROM calculated_balances
WHERE ABS(stored_balance - calculated_balance) > 0.01
ORDER BY ABS(stored_balance - calculated_balance) DESC;

-- ============================================================================
-- 9. SUMMARY REPORT
-- ============================================================================

SELECT 
  'Negative Stock' as check_type,
  COUNT(*) as issue_count
FROM products WHERE stock < 0
UNION ALL
SELECT 
  'Unbalanced Journals',
  COUNT(*)
FROM journal_entries 
WHERE is_voided = FALSE AND ABS(total_debit - total_credit) > 0.01
UNION ALL
SELECT 
  'Duplicate AP for PO',
  COUNT(*)
FROM (
  SELECT purchase_order_id
  FROM accounts_payable
  WHERE purchase_order_id IS NOT NULL
  GROUP BY purchase_order_id
  HAVING COUNT(*) > 1
) sub
UNION ALL
SELECT 
  'Wrong Payment Status',
  COUNT(*)
FROM transactions t
WHERE t.payment_status != CASE 
    WHEN t.paid_amount >= t.total THEN 'Lunas'
    WHEN t.paid_amount > 0 THEN 'Partial'
    ELSE 'Belum Lunas'
  END
  AND t.is_voided = FALSE
UNION ALL
SELECT 
  'PO without Journal',
  COUNT(*)
FROM purchase_orders po
WHERE po.status IN ('Approved', 'Diterima')
  AND NOT EXISTS (
    SELECT 1 FROM journal_entries je 
    WHERE je.reference_id = po.id 
      AND je.reference_type = 'purchase_order'
      AND je.is_voided = FALSE
  )
ORDER BY issue_count DESC;
