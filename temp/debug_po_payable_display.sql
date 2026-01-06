-- ============================================================================
-- Debug Query: Check Accounts Payable Display Issue
-- Purpose: Investigate why PO payables are not showing in view
-- ============================================================================

-- 1. Check if accounts_payable records exist for POs
SELECT 
  ap.id,
  ap.purchase_order_id,
  ap.supplier_name,
  ap.amount,
  ap.status,
  ap.branch_id,
  ap.created_at,
  po.status as po_status,
  po.approved_at,
  po.received_date
FROM accounts_payable ap
LEFT JOIN purchase_orders po ON po.id = ap.purchase_order_id
WHERE ap.created_at >= '2025-01-01'
ORDER BY ap.created_at DESC
LIMIT 20;

-- 2. Check POs that should have AP but don't
SELECT 
  po.id,
  po.po_number,
  po.status,
  po.total_cost,
  po.approved_at,
  po.received_date,
  po.branch_id,
  COUNT(ap.id) as ap_count
FROM purchase_orders po
LEFT JOIN accounts_payable ap ON ap.purchase_order_id = po.id
WHERE po.status IN ('Approved', 'Diterima')
  AND po.created_at >= '2025-01-01'
GROUP BY po.id
HAVING COUNT(ap.id) = 0
ORDER BY po.created_at DESC;

-- 3. Check RLS policies on accounts_payable table
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'accounts_payable';

-- 4. Check if branch_id is NULL in accounts_payable
SELECT 
  COUNT(*) as total_records,
  COUNT(CASE WHEN branch_id IS NULL THEN 1 END) as null_branch_count,
  COUNT(CASE WHEN branch_id IS NOT NULL THEN 1 END) as has_branch_count
FROM accounts_payable
WHERE created_at >= '2025-01-01';

-- 5. Check accounts_payable by branch
SELECT 
  b.name as branch_name,
  COUNT(ap.id) as payable_count,
  SUM(ap.amount) as total_amount,
  SUM(CASE WHEN ap.status = 'Outstanding' THEN ap.amount ELSE 0 END) as outstanding_amount
FROM branches b
LEFT JOIN accounts_payable ap ON ap.branch_id = b.id
GROUP BY b.id, b.name
ORDER BY b.name;

-- 6. Check recent journal entries for PO
SELECT 
  je.id,
  je.entry_number,
  je.entry_date,
  je.description,
  je.reference_type,
  je.reference_id,
  je.status,
  je.is_voided,
  je.branch_id,
  je.total_debit,
  je.total_credit
FROM journal_entries je
WHERE je.reference_type = 'purchase_order'
  AND je.created_at >= '2025-01-01'
ORDER BY je.created_at DESC
LIMIT 20;

-- 7. Check if there are orphaned accounts_payable (no matching PO)
SELECT 
  ap.id,
  ap.purchase_order_id,
  ap.supplier_name,
  ap.amount,
  ap.created_at,
  CASE WHEN po.id IS NULL THEN 'ORPHANED' ELSE 'OK' END as status
FROM accounts_payable ap
LEFT JOIN purchase_orders po ON po.id = ap.purchase_order_id
WHERE ap.created_at >= '2025-01-01'
ORDER BY ap.created_at DESC;
