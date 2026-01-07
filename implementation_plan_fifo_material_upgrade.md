# Plan: Upgrade Material FIFO to Support Negative Stock

## Objective
Update `database/rpc/02_fifo_material.sql` to align with the Enhanced FIFO Inventory logic. Currently, it throws an error if stock is insufficient. We must allow it to create "Deficit Batches" (negative stock) so that Production operations are not blocked by minor stock discrepancies.

## Current Logic (Fragile)
```sql
IF v_available_stock < p_quantity THEN
  RETURN QUERY SELECT FALSE ... 'Stok material tidak cukup ...'
END IF;
```

## Proposed Logic (Robust)
1.  Remove the strict `IF v_available_stock < p_quantity` check.
2.  Consume whatever is available from existing batches.
3.  If `v_remaining > 0`:
    *   Create a new batch with `remaining_quantity = -v_remaining`.
    *   Notes: 'Negative Stock fallback'.
    *   Unit Cost: 0 (or last known cost, but 0 is safer to avoid creating fake value).

## Execution Steps
1.  **Modify `database/rpc/02_fifo_material.sql`**:
    *   Remove blocking check.
    *   Add "Handle Deficit" block after the loop.
    *   Ensure `material_stock_movements` logs the negative transaction correctly.

## Verification
*   Running Production with insufficient material should succeed now, instead of failing.
