-- ============================================================================
-- Verification Query: Check PO Status and Related Records
-- Purpose: Assess impact before migration
-- ============================================================================

-- 1. Count POs by status
SELECT 
  status,
  COUNT(*) as count,
  SUM(total_cost) as total_amount
FROM purchase_orders
WHERE created_at >= '2025-01-01'
GROUP BY status
ORDER BY status;

-- 2. Check POs with journals and AP
SELECT 
  po.id, 
  po.po_number, 
  po.status, 
  po.total_cost, 
  po.received_date, 
  po.approved_at,
  po.created_at,
  COUNT(DISTINCT je.id) as journal_count,
  COUNT(DISTINCT ap.id) as ap_count,
  STRING_AGG(DISTINCT je.entry_number, ', ') as journal_numbers
FROM purchase_orders po
LEFT JOIN journal_entries je ON je.reference_id = po.id AND je.reference_type = 'purchase_order' AND je.is_voided = FALSE
LEFT JOIN accounts_payable ap ON ap.purchase_order_id = po.id
WHERE po.created_at >= '2025-01-01'
GROUP BY po.id, po.po_number, po.status, po.total_cost, po.received_date, po.approved_at, po.created_at
ORDER BY po.created_at DESC;

-- 3. Critical: POs that are Approved but NOT Received (will need migration)
SELECT 
  po.id, 
  po.po_number, 
  po.status, 
  po.total_cost,
  po.approved_at,
  COUNT(DISTINCT je.id) as journal_count,
  COUNT(DISTINCT ap.id) as ap_count
FROM purchase_orders po
LEFT JOIN journal_entries je ON je.reference_id = po.id AND je.reference_type = 'purchase_order' AND je.is_voided = FALSE
LEFT JOIN accounts_payable ap ON ap.purchase_order_id = po.id
WHERE po.status = 'Approved' 
  AND po.received_date IS NULL
GROUP BY po.id, po.po_number, po.status, po.total_cost, po.approved_at
ORDER BY po.approved_at DESC;

-- 4. Check journal entries for POs
SELECT 
  je.id,
  je.entry_number,
  je.entry_date,
  je.description,
  je.reference_id as po_id,
  je.total_debit,
  je.total_credit,
  je.status,
  je.is_voided,
  po.status as po_status,
  po.received_date
FROM journal_entries je
JOIN purchase_orders po ON po.id = je.reference_id
WHERE je.reference_type = 'purchase_order'
  AND je.created_at >= '2025-01-01'
ORDER BY je.created_at DESC
LIMIT 20;

-- 5. Check accounts_payable for POs
SELECT 
  ap.id,
  ap.purchase_order_id,
  ap.supplier_name,
  ap.amount,
  ap.paid_amount,
  ap.status,
  ap.due_date,
  po.status as po_status,
  po.received_date,
  po.approved_at
FROM accounts_payable ap
JOIN purchase_orders po ON po.id = ap.purchase_order_id
WHERE ap.created_at >= '2025-01-01'
ORDER BY ap.created_at DESC
LIMIT 20;
