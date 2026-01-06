-- ============================================================================
-- Cleanup Script: Void Duplicate PO Payable Journals
-- Purpose: Fix existing duplicate journals caused by double AP creation
-- ============================================================================

-- IMPORTANT: Run this AFTER deploying the RPC fixes to prevent new duplicates

-- ============================================================================
-- Step 1: Identify Duplicate Journals
-- ============================================================================

-- Find POs with multiple journal entries
SELECT 
  po.id as po_id,
  po.po_number,
  po.supplier_name,
  po.total_cost,
  COUNT(DISTINCT je.id) as journal_count,
  COUNT(DISTINCT ap.id) as ap_count,
  STRING_AGG(DISTINCT je.entry_number, ', ') as journal_numbers,
  STRING_AGG(DISTINCT je.reference_type, ', ') as journal_types
FROM purchase_orders po
LEFT JOIN journal_entries je ON (
  (je.reference_id = po.id AND je.reference_type = 'purchase_order')
  OR (je.reference_id IN (SELECT id FROM accounts_payable WHERE purchase_order_id = po.id) AND je.reference_type = 'accounts_payable')
)
AND je.is_voided = FALSE
LEFT JOIN accounts_payable ap ON ap.purchase_order_id = po.id
WHERE po.status IN ('Approved', 'Diterima')
GROUP BY po.id
HAVING COUNT(DISTINCT je.id) > 1
ORDER BY po.created_at DESC;

-- ============================================================================
-- Step 2: Identify Journals to Void
-- ============================================================================

-- Find journals created by create_accounts_payable_atomic for POs
-- These should be voided (keep only the ones from approve_purchase_order_atomic)
WITH po_ap_journals AS (
  SELECT 
    je.id as journal_id,
    je.entry_number,
    je.reference_type,
    je.reference_id as ap_id,
    je.description,
    je.total_debit,
    je.created_at,
    ap.purchase_order_id,
    po.po_number,
    po.supplier_name
  FROM journal_entries je
  JOIN accounts_payable ap ON ap.id = je.reference_id
  JOIN purchase_orders po ON po.id = ap.purchase_order_id
  WHERE je.reference_type = 'accounts_payable'
    AND ap.purchase_order_id IS NOT NULL
    AND je.is_voided = FALSE
)
SELECT 
  journal_id,
  entry_number,
  po_number,
  supplier_name,
  total_debit,
  description,
  created_at,
  'WILL BE VOIDED' as action
FROM po_ap_journals
ORDER BY created_at DESC;

-- ============================================================================
-- Step 3: VOID Duplicate Journals (EXECUTE WITH CAUTION!)
-- ============================================================================

-- Void journals created by create_accounts_payable_atomic for POs
-- Keep only journals from approve_purchase_order_atomic (reference_type = 'purchase_order')
UPDATE journal_entries
SET 
  is_voided = TRUE,
  voided_at = NOW(),
  voided_reason = 'Duplicate journal - PO sudah ada journal dari approve_purchase_order_atomic',
  updated_at = NOW()
WHERE id IN (
  SELECT je.id
  FROM journal_entries je
  JOIN accounts_payable ap ON ap.id = je.reference_id
  WHERE je.reference_type = 'accounts_payable'
    AND ap.purchase_order_id IS NOT NULL
    AND je.is_voided = FALSE
);

-- ============================================================================
-- Step 4: Delete Duplicate AP Records (OPTIONAL)
-- ============================================================================

-- Find duplicate AP records (manual AP for PO that already has AP from approve)
SELECT 
  ap.id,
  ap.purchase_order_id,
  ap.supplier_name,
  ap.amount,
  ap.status,
  ap.created_at,
  CASE 
    WHEN ap.id LIKE 'AP-PO-%' THEN 'KEEP (from approve_purchase_order_atomic)'
    ELSE 'DELETE (manual duplicate)'
  END as action
FROM accounts_payable ap
WHERE ap.purchase_order_id IS NOT NULL
ORDER BY ap.purchase_order_id, ap.created_at;

-- Delete manual AP records for POs (keep only AP-PO-* format)
-- ONLY if they haven't been paid yet
DELETE FROM accounts_payable
WHERE id NOT LIKE 'AP-PO-%'  -- Manual AP IDs
  AND purchase_order_id IS NOT NULL
  AND status = 'Outstanding'
  AND paid_amount = 0
  AND purchase_order_id IN (
    SELECT purchase_order_id 
    FROM accounts_payable 
    WHERE id LIKE 'AP-PO-%'  -- PO AP IDs from approve_purchase_order_atomic
  );

-- ============================================================================
-- Step 5: Verification
-- ============================================================================

-- Verify: Each PO should have exactly 1 journal and 1 AP
SELECT 
  po.id as po_id,
  po.po_number,
  po.status,
  COUNT(DISTINCT je.id) FILTER (WHERE je.is_voided = FALSE) as active_journal_count,
  COUNT(DISTINCT ap.id) as ap_count,
  STRING_AGG(DISTINCT je.entry_number, ', ') FILTER (WHERE je.is_voided = FALSE) as active_journals
FROM purchase_orders po
LEFT JOIN journal_entries je ON je.reference_id = po.id AND je.reference_type = 'purchase_order'
LEFT JOIN accounts_payable ap ON ap.purchase_order_id = po.id
WHERE po.status IN ('Approved', 'Diterima')
  AND po.created_at >= '2025-01-01'
GROUP BY po.id
ORDER BY po.created_at DESC;

-- Verify: Check account balances after cleanup
SELECT 
  a.code,
  a.name,
  SUM(jel.debit_amount - jel.credit_amount) as balance
FROM accounts a
LEFT JOIN journal_entry_lines jel ON jel.account_id = a.id
LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.is_voided = FALSE
WHERE a.code IN ('1120', '1320', '1310', '2110')  -- Kas, Persediaan, Hutang
GROUP BY a.id, a.code, a.name
ORDER BY a.code;

-- ============================================================================
-- Notes:
-- ============================================================================
-- 1. Run Step 1-2 first to identify duplicates
-- 2. Review the results carefully
-- 3. Run Step 3 to void duplicate journals
-- 4. Run Step 4 ONLY if you want to delete duplicate AP records
-- 5. Run Step 5 to verify cleanup was successful
-- 6. Check with accounting team that balances are correct
