# Plan: Standardizing Journal Creation (Refactoring to create_journal_atomic)

## Objective
Refactor all critical RPCs that manually insert into `journal_entries` to use the centralized `create_journal_atomic` function. This ensures all modules benefit from the robust "Retry Loop" mechanism found in `create_journal_atomic`, preventing "Duplicate Key" errors during concurrent operations.

## Affected Files & Status

### Critical Modules (Priority 1)
- [x] `database/rpc/05_delivery.sql` (Delivery Management)
- [x] `database/rpc/06_payment.sql` (Payment Processing - Receivable & Payable)

### Secondary Modules (Priority 2)
- [x] `database/rpc/13_debt_installment.sql` (Debt Installments)
- [x] `database/rpc/14_employee_advance.sql` (Employee Advances)
- [ ] `database/rpc/16_po_management.sql` (Purchase Orders)

### Other Modules (To be assessed)
- `12_tax_payment.sql`
- `15_coa_adjustments.sql`
- `15_zakat.sql`
- `16_commission_payment.sql`
- `18_stock_adjustment.sql`

## Execution Steps

1.  **Refactor 05_delivery.sql**
    *   Replace manual `INSERT INTO journal_entries` and `journal_entry_lines` loops.
    *   Construct `JSONB` array for lines.
    *   Call `create_journal_atomic`.

2.  **Refactor 06_payment.sql**
    *   Update `receive_payment_atomic`.
    *   Update `pay_supplier_atomic`.
    *   Update `create_accounts_payable_atomic`.

3.  **Refactor 13_debt_installment.sql**
    *   Update `pay_debt_installment_atomic`.

4.  **Refactor 14_employee_advance.sql**
    *   Update `create_employee_advance_atomic`.
    *   Update `repay_employee_advance_atomic`.

5.  **Verify**
    *   Ensure all functions compile correctly.
