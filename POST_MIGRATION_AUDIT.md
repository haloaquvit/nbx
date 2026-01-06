# Post-RPC Migration Audit & Debug Plan

## Context
User baru saja migrasi ke RPC semalam. Perlu audit menyeluruh untuk memastikan semua fungsi bekerja dengan benar.

## Audit Checklist

### 1. Core Business Flows

#### A. Sales Flow (Penjualan)
- [ ] **Create Transaction**
  - [ ] Office Sale (immediate stock deduction)
  - [ ] Non-Office Sale (stock deducted on delivery)
  - [ ] Cash payment
  - [ ] Credit payment
  - [ ] Partial payment
  - [ ] Journal created correctly (Dr. Kas/Piutang, Cr. Pendapatan, Dr. HPP, Cr. Persediaan)
  - [ ] FIFO stock consumption
  - [ ] Commission generated for sales

- [ ] **Edit Transaction**
  - [ ] Edit total → journal adjusted ✅ (just fixed)
  - [ ] Edit paid_amount → journal adjusted ✅ (just fixed)
  - [ ] Edit items → recalculate HPP
  - [ ] Edit customer

- [ ] **Delete/Void Transaction**
  - [ ] Stock restored (LIFO)
  - [ ] Journal voided
  - [ ] Commission deleted
  - [ ] Deliveries deleted

- [ ] **Receivable Payment**
  - [ ] Pay full
  - [ ] Pay partial
  - [ ] Journal created (Dr. Kas, Cr. Piutang)
  - [ ] Transaction status updated

#### B. Purchase Order Flow
- [ ] **Create PO**
  - [ ] Multi-item PO (materials + products)
  - [ ] PPN calculation
  - [ ] Status: Pending

- [ ] **Approve PO** ✅ (just fixed duplicate issue)
  - [ ] Journal created (Dr. Persediaan, Cr. Hutang)
  - [ ] Accounts Payable created
  - [ ] No duplicate journals
  - [ ] Status: Approved

- [ ] **Receive PO**
  - [ ] Stock added to inventory
  - [ ] Inventory batches created (FIFO)
  - [ ] Material stock movements
  - [ ] Status: Diterima

- [ ] **Pay PO (Accounts Payable)**
  - [ ] Pay full
  - [ ] Pay partial
  - [ ] Journal created (Dr. Hutang, Cr. Kas)
  - [ ] AP status updated

- [ ] **Delete PO**
  - [ ] Stock rolled back
  - [ ] Journals voided
  - [ ] AP deleted

#### C. Delivery Flow
- [ ] **Create Delivery**
  - [ ] Stock deducted (FIFO)
  - [ ] Delivery items created
  - [ ] Commission generated for driver
  - [ ] Status: Pending/In Transit

- [ ] **Complete Delivery**
  - [ ] Status: Delivered
  - [ ] Transaction delivery_status updated

- [ ] **Retasi (Return)**
  - [ ] Stock restored
  - [ ] Journal reversal (Dr. Persediaan, Cr. Pendapatan)
  - [ ] Refund processed

#### D. Production Flow
- [ ] **Create Production**
  - [ ] BOM consumption (FIFO)
  - [ ] Product batch created
  - [ ] Journal created (Dr. Persediaan Produk, Cr. Persediaan Bahan)
  - [ ] Material stock movements

- [ ] **Void Production**
  - [ ] Stock restored (LIFO)
  - [ ] Journal voided
  - [ ] Batches deleted

#### E. Expense Flow
- [ ] **Create Expense**
  - [ ] Journal created (Dr. Beban, Cr. Kas)
  - [ ] Account balance updated

- [ ] **Delete Expense**
  - [ ] Journal voided
  - [ ] Account balance restored

#### F. Payroll Flow
- [ ] **Process Payroll**
  - [ ] Salary calculation
  - [ ] Deductions (BPJS, Tax)
  - [ ] Journal created (Dr. Beban Gaji, Cr. Kas)

- [ ] **Pay Commission**
  - [ ] Commission entries marked as paid
  - [ ] Journal created (Dr. Beban Komisi, Cr. Kas)

#### G. Stock Adjustment (Opname)
- [ ] **Stock Adjustment**
  - [ ] Inventory batches adjusted
  - [ ] Journal created (Dr/Cr. Persediaan, Cr/Dr. Selisih Stok)

---

### 2. Data Integrity Checks

#### A. Inventory
```sql
-- Check for negative stock
SELECT p.name, p.stock, b.name as branch_name
FROM products p
JOIN branches b ON b.id = p.branch_id
WHERE p.stock < 0;

-- Check FIFO batch integrity
SELECT 
  p.name,
  SUM(ib.remaining_quantity) as total_batch_qty,
  p.stock as product_stock,
  SUM(ib.remaining_quantity) - p.stock as difference
FROM inventory_batches ib
JOIN products p ON p.id = ib.product_id
GROUP BY p.id, p.name, p.stock
HAVING SUM(ib.remaining_quantity) != p.stock;
```

#### B. Journals
```sql
-- Check unbalanced journals
SELECT 
  je.id,
  je.entry_number,
  je.description,
  je.total_debit,
  je.total_credit,
  je.total_debit - je.total_credit as imbalance
FROM journal_entries je
WHERE je.is_voided = FALSE
  AND ABS(je.total_debit - je.total_credit) > 0.01;

-- Check journals without lines
SELECT je.id, je.entry_number
FROM journal_entries je
LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
WHERE jel.id IS NULL AND je.is_voided = FALSE;
```

#### C. Accounts Payable
```sql
-- Check AP without PO
SELECT ap.id, ap.supplier_name, ap.amount
FROM accounts_payable ap
WHERE ap.purchase_order_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM purchase_orders po WHERE po.id = ap.purchase_order_id);

-- Check duplicate AP for same PO
SELECT purchase_order_id, COUNT(*) as ap_count
FROM accounts_payable
WHERE purchase_order_id IS NOT NULL
GROUP BY purchase_order_id
HAVING COUNT(*) > 1;
```

#### D. Transactions
```sql
-- Check transactions with wrong payment_status
SELECT 
  t.id,
  t.total,
  t.paid_amount,
  t.payment_status,
  CASE 
    WHEN t.paid_amount >= t.total THEN 'Lunas'
    WHEN t.paid_amount > 0 THEN 'Partial'
    ELSE 'Belum Lunas'
  END as expected_status
FROM transactions t
WHERE t.payment_status != CASE 
    WHEN t.paid_amount >= t.total THEN 'Lunas'
    WHEN t.paid_amount > 0 THEN 'Partial'
    ELSE 'Belum Lunas'
  END;
```

---

### 3. RPC Function Tests

#### A. Transaction RPCs
- [ ] `create_transaction_atomic` - ✅ Working
- [ ] `update_transaction_atomic` - ✅ Just fixed
- [ ] `void_transaction_atomic` - Need to test

#### B. PO RPCs
- [ ] `create_purchase_order_atomic` - Need to test
- [ ] `approve_purchase_order_atomic` - ✅ Just fixed (duplicate prevention)
- [ ] `receive_po_atomic` - Need to test
- [ ] `delete_po_atomic` - Need to test

#### C. Payment RPCs
- [ ] `receive_payment_atomic` - Need to test
- [ ] `pay_supplier_atomic` - Need to test
- [ ] `create_accounts_payable_atomic` - ✅ Just fixed (PO validation)

#### D. Delivery RPCs
- [ ] `create_delivery_atomic` - Need to test
- [ ] `process_retasi_atomic` - Need to test

#### E. Production RPCs
- [ ] `create_production_atomic` - Need to test
- [ ] `void_production_atomic` - Need to test

#### F. Other RPCs
- [ ] `create_expense_atomic` - Need to test
- [ ] `process_payroll_atomic` - Need to test
- [ ] `pay_commission_atomic` - Need to test
- [ ] `adjust_stock_atomic` - Need to test

---

### 4. Frontend Pages Audit

#### A. Dashboard
- [ ] Stats loading correctly
- [ ] Charts rendering
- [ ] Recent transactions showing

#### B. Transactions Page
- [ ] List loading
- [ ] Create transaction
- [ ] Edit transaction ✅ Just fixed
- [ ] Delete transaction
- [ ] Payment dialog

#### C. Purchase Orders Page
- [ ] List loading
- [ ] Create PO
- [ ] Approve PO ✅ Just fixed
- [ ] Receive PO
- [ ] Pay PO
- [ ] Delete PO

#### D. Deliveries Page
- [ ] List loading
- [ ] Create delivery
- [ ] Complete delivery
- [ ] Retasi

#### E. Production Page
- [ ] List loading
- [ ] Create production
- [ ] Void production

#### F. Expenses Page
- [ ] List loading
- [ ] Create expense
- [ ] Delete expense

#### G. Payroll Page
- [ ] List loading
- [ ] Process payroll
- [ ] Pay commission

#### H. Accounts Payable Page
- [ ] List loading ✅ (was the original issue)
- [ ] Create manual AP
- [ ] Pay AP
- [ ] Delete AP

#### I. Financial Reports
- [ ] Balance Sheet
- [ ] Income Statement
- [ ] Cash Flow
- [ ] Trial Balance
- [ ] Journal Entries

---

### 5. Known Issues & Fixes

#### Fixed ✅
1. **Duplicate PO Payable Journals**
   - Added duplicate check in `approve_purchase_order_atomic`
   - Added PO validation in `create_accounts_payable_atomic`
   - Frontend validation in `useAccountsPayable.ts`

2. **Edit Transaction Error**
   - Fixed missing `v_fifo_result` variable in `update_transaction_atomic`
   - Journal now properly adjusted when total/paid_amount changes

#### Pending Investigation
1. **Stock Adjustment Journal**
   - Need to verify journal created correctly

2. **Production Journal**
   - Need to verify reference_type is 'production' not 'adjustment'

3. **Delivery Commission**
   - Need to verify commission generated for driver

---

### 6. Testing Priority

**High Priority** (Critical Business Flows):
1. Create Transaction (Sales)
2. Receive Payment (Receivables)
3. Create & Approve PO
4. Receive PO
5. Pay Accounts Payable

**Medium Priority**:
1. Create Delivery
2. Create Production
3. Create Expense
4. Stock Adjustment

**Low Priority**:
1. Payroll
2. Commission Payment
3. Retasi

---

### 7. Deployment Checklist

- [x] Deploy `16_po_management.sql` (PO duplicate fix)
- [x] Deploy `06_payment.sql` (AP validation)
- [x] Deploy `09_transaction.sql` (Edit transaction fix)
- [x] Restart PostgREST
- [ ] Run data integrity checks
- [ ] Test critical flows
- [ ] Monitor error logs

---

## Next Steps

1. **Run Data Integrity Checks** (SQL queries above)
2. **Test Critical Flows** (Sales, PO, Payment)
3. **Fix Any Issues Found**
4. **Document Remaining Issues**
5. **Create Regression Test Suite**

---

## Notes

- User sudah void manual duplicate journals
- RPC migration baru semalam, expect ada issues lain
- Prioritize critical business flows first
- Document all findings for future reference
