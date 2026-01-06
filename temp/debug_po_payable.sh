#!/bin/bash
# Debug script to check PO payable display issue on VPS

echo "=== Checking Accounts Payable Records for POs ==="
PGPASSWORD='Aquvit2024' psql -U aquavit -h 127.0.0.1 -d aquvit_new -c "
SELECT 
  ap.id,
  ap.purchase_order_id,
  ap.supplier_name,
  ap.amount,
  ap.status,
  ap.branch_id,
  ap.created_at,
  po.status as po_status
FROM accounts_payable ap
LEFT JOIN purchase_orders po ON po.id = ap.purchase_order_id
WHERE ap.created_at >= '2025-01-01'
ORDER BY ap.created_at DESC
LIMIT 10;
"

echo ""
echo "=== Checking Branch ID Distribution ==="
PGPASSWORD='Aquvit2024' psql -U aquavit -h 127.0.0.1 -d aquvit_new -c "
SELECT 
  COUNT(*) as total_records,
  COUNT(CASE WHEN branch_id IS NULL THEN 1 END) as null_branch_count,
  COUNT(CASE WHEN branch_id IS NOT NULL THEN 1 END) as has_branch_count
FROM accounts_payable
WHERE created_at >= '2025-01-01';
"

echo ""
echo "=== Checking RLS Policies ==="
PGPASSWORD='Aquvit2024' psql -U aquavit -h 127.0.0.1 -d aquvit_new -c "
SELECT 
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'accounts_payable';
"

echo ""
echo "=== Checking POs without AP ==="
PGPASSWORD='Aquvit2024' psql -U aquavit -h 127.0.0.1 -d aquvit_new -c "
SELECT 
  po.id,
  po.po_number,
  po.status,
  po.total_cost,
  po.approved_at,
  po.branch_id,
  COUNT(ap.id) as ap_count
FROM purchase_orders po
LEFT JOIN accounts_payable ap ON ap.purchase_order_id = po.id
WHERE po.status IN ('Approved', 'Diterima')
  AND po.created_at >= '2025-01-01'
GROUP BY po.id
HAVING COUNT(ap.id) = 0
ORDER BY po.created_at DESC
LIMIT 10;
"
