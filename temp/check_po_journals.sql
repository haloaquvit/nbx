-- Check PO journals and accounts payable status
SELECT 
  po.id, 
  po.po_number, 
  po.status, 
  po.total_cost, 
  po.received_date, 
  po.approved_at,
  COUNT(DISTINCT je.id) as journal_count,
  COUNT(DISTINCT ap.id) as ap_count
FROM purchase_orders po
LEFT JOIN journal_entries je ON je.reference_id = po.id AND je.reference_type = 'purchase_order' AND je.is_voided = FALSE
LEFT JOIN accounts_payable ap ON ap.purchase_order_id = po.id
WHERE po.created_at >= '2026-01-01'
GROUP BY po.id
ORDER BY po.created_at DESC
LIMIT 10;
