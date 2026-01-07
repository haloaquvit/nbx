# Plan: Unifying `consume_inventory_fifo` RPC

## Current Situation
There are currently two conflicting files defining the exact same function signature `consume_inventory_fifo(UUID, UUID, NUMERIC, TEXT)`:

1.  **`database/rpc/01_fifo_inventory.sql`** (Base Version)
    *   Strict FIFO: Throws an error if stock is insufficient.
    *   Legacy version.

2.  **`database/rpc/01_fifo_inventory_v3.sql`** (Enhanced Version)
    *   Negative Stock Support: Creates "Deficit Batches" (negative stock) if requests exceed available stock.
    *   Currently active in the database (deployed last).

## Dependencies
The following RPCs rely on `consume_inventory_fifo`:

1.  **`05_delivery.sql`**: `process_delivery_atomic` (Standard Delivery)
2.  **`19_delivery_management.sql`**: `update_delivery_atomic` (Delivery Update/Edit)
3.  **`09_transaction.sql`**: `create_transaction_atomic` (Office Sales / Direct Sales)
4.  **`07_void.sql`**: `void_production_atomic` (Voiding production consumes the finished goods back)
5.  **`18_stock_adjustment.sql`**: `create_product_stock_adjustment_atomic` (Stock Reduction)

*(Note: `04_production.sql` uses `consume_material_fifo` and is unaffected)*

## Proposed Solution (Consolidation)

We should standardise on the **Enhanced Version (v3)** because the system (especially Delivery/Office Sales) often requires negative stock handling to prevent operations from being blocked by minor stock discrepancies.

### Execution Steps:

1.  **Archive Base Version**:
    *   Rename `database/rpc/01_fifo_inventory.sql` to `database/rpc/01_fifo_inventory_legacy.sql.bak`.

2.  **Promote v3 to Master**:
    *   Rename `database/rpc/01_fifo_inventory_v3.sql` to `database/rpc/01_fifo_inventory.sql`.
    *   *Note: This ensures the filename matches the contents and intention.*

3.  **Redeploy**:
    *   Deploy the new `01_fifo_inventory.sql`.
    *   Dependencies (05, 07, 09, 18, 19) do **not** need to be changed because they already call `consume_inventory_fifo`, and we are swapping the implementation "under the hood" to the superior v3 version.

4.  **Verification**:
    *   Verify `consume_inventory_fifo` exists and allows negative stock (by checking if a delivery > stock succeeds).
