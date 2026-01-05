# RPC MIGRATION STATUS REPORT

## Overview
This document summarizes the migration status of the Aquvit application from "Heavy Client" to "Full RPC" architecture.

## 1. Transactions (Status: ✅ COMPLETED)
**File:** `src/hooks/useTransactions.ts`
- **Creation (`addTransaction`)**: Fully migrated to `create_transaction_atomic`.
  - Manual Insert -> REMOVED
  - Manual Stock Deduction -> REMOVED (Handled by RPC)
  - Manual Journal Creation -> REMOVED (Handled by RPC)
  - Manual Commission Generation -> REMOVED (Handled by RPC)
- **Update (`updateTransaction`)**: Migrated to `update_transaction_atomic`.
- **Deletion (`deleteTransaction`)**: Migrated to `void_transaction_atomic`.
- **Payment (`payReceivable`)**: Migrated to `receive_payment_atomic`.

## 2. Accounts Payable (Status: ✅ COMPLETED)
**File:** `src/hooks/useAccountsPayable.ts`
- **Creation (`createAccountsPayable`)**: Fully migrated to `create_accounts_payable_atomic`.
- **Payment (`payAccountsPayable`)**: Uses `pay_supplier_atomic`.
- **Legacy Logic**: All client-side fallbacks and manual ID generation REMOVED.

## 3. Deliveries (Status: ✅ COMPLETED)
**File:** `src/hooks/useDeliveries.ts`
- **Creation (`createDelivery`)**: Uses `process_delivery_atomic`.
  - **Stock & Journal**: Handled by RPC.
  - **Commission**: NOW HANDLED BY RPC. Client-side `generateDeliveryCommission` call REMOVED.
- **Deletion (`deleteDelivery`)**: Uses `void_delivery_atomic`.
  - **Commission Deletion**: NOW HANDLED BY RPC.
- **Update (`updateDelivery`)**: Hybrid (Stock adjustments call specialized FIFO RPCs but flow is orchestrating from frontend).

## 4. Product & Material Stock (Status: ✅ COMPLETED)
**Files:** `src/hooks/useProducts.ts`, `src/hooks/useMaterials.ts`
- **Initial Stock Sync**: Both migrated to `sync_product_initial_stock_atomic` and `sync_material_initial_stock_atomic`.
- **Material Add Stock**: Migrated to `add_material_batch`.
- **Manual inventory_batches updates**: REMOVED.

## 5. Chart of Accounts (Status: ✅ COMPLETED)
**File:** `src/hooks/useAccounts.ts`
- **CRUD Operations**: Fully migrated to `create_account`, `update_account`, `delete_account`, and `import_standard_coa`.

## 6. Journal Entries (Status: ✅ COMPLETED)
**File:** `src/hooks/useJournalEntries.ts`
- **Creation & Void**: Migrated to `create_journal_atomic` and `void_journal_entry`.

## 7. Next Steps
1. **Refactor `updateDelivery`**: Convert the complex delivery update logic into a single `update_delivery_atomic` RPC.
2. **Refactor `updateInitialBalance` in `useAccounts.ts`**: Integrate journal creation for initial balance updates into a dedicated RPC.
3. **Refactor `postMutation` in `useJournalEntries.ts`**: Create `post_journal_atomic` for status updates.
4. **Cleanup**: Remove remaining hybrid logic and old `StockService` methods if no longer used.
