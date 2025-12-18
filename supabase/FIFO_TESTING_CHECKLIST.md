# ✅ FIFO System Testing Checklist

## 📋 Pre-Requirements

- [ ] Run migration `0201_create_material_inventory_fifo_system.sql`
- [ ] Run migration `0202_integrate_po_with_fifo_system.sql`
- [ ] Verify tables exist:
  ```sql
  SELECT tablename FROM pg_tables
  WHERE schemaname = 'public'
  AND tablename IN (
    'material_inventory_batches',
    'material_usage_history'
  );
  ```

## 🧪 Test Scenarios

### Test 1: Auto-Create Batch from PO

**Setup:**
```sql
-- 1. Create a material
INSERT INTO materials (name, unit, price_per_unit, stock, branch_id)
VALUES ('Kain Test', 'meter', 0, 0, 'your-branch-id')
RETURNING id;  -- Save this ID

-- 2. Create a supplier
INSERT INTO suppliers (name, phone, branch_id)
VALUES ('Supplier Test', '081234567890', 'your-branch-id')
RETURNING id;  -- Save this ID

-- 3. Create a PO
INSERT INTO purchase_orders (
  po_number, supplier_id, branch_id, order_date, status
) VALUES (
  'PO-TEST-001', 'supplier-id', 'branch-id', NOW(), 'pending'
) RETURNING id;  -- Save this ID

-- 4. Add PO items
INSERT INTO purchase_order_items (
  purchase_order_id, material_id, quantity, unit_price
) VALUES (
  'po-id', 'material-id', 100, 90.00
);
```

**Action:**
```sql
-- Approve PO (trigger batch creation)
UPDATE purchase_orders
SET status = 'received', approved_by = 'your-user-id'
WHERE id = 'po-id';
```

**Verify:**
```sql
-- Check batch was created
SELECT
  batch_number,
  quantity_received,
  quantity_remaining,
  unit_price,
  status
FROM material_inventory_batches
WHERE purchase_order_id = 'po-id';
```

**Expected Result:**
- [x] 1 batch created with batch_number like 'MAT-2025-001'
- [x] quantity_received = 100
- [x] quantity_remaining = 100
- [x] unit_price = 90
- [x] status = 'active'

---

### Test 2: Second PO with Different Price

**Action:**
```sql
-- Create second PO with higher price
INSERT INTO purchase_orders (
  po_number, supplier_id, branch_id, order_date, status
) VALUES (
  'PO-TEST-002', 'supplier-id', 'branch-id', NOW(), 'received'
) RETURNING id;

-- Add items with NEW price
INSERT INTO purchase_order_items (
  purchase_order_id, material_id, quantity, unit_price
) VALUES (
  'po-id-2', 'material-id', 100, 93.00
);
```

**Verify:**
```sql
SELECT
  batch_number,
  purchase_date,
  quantity_remaining,
  unit_price
FROM material_inventory_batches
WHERE material_id = 'material-id'
ORDER BY purchase_date;
```

**Expected Result:**
- [x] 2 batches exist
- [x] Batch 1: unit_price = 90, qty = 100
- [x] Batch 2: unit_price = 93, qty = 100
- [x] Both status = 'active'

---

### Test 3: FIFO Cost Calculation (Preview)

**Action:**
```sql
-- Calculate cost for 150 units (will use both batches)
SELECT
  batch_id,
  quantity_from_batch,
  unit_price,
  batch_cost
FROM calculate_fifo_cost(
  'material-id',
  150,
  'branch-id'
);
```

**Expected Result:**
| batch_id | quantity_from_batch | unit_price | batch_cost |
|----------|---------------------|------------|------------|
| batch-1  | 100                 | 90         | 9000       |
| batch-2  | 50                  | 93         | 4650       |

**Total Cost:** 13,650
**Average Cost:** 91 (13650/150)

**Verify Math:**
- [x] Uses oldest batch first (FIFO)
- [x] First batch depleted completely (100 units)
- [x] Second batch partially used (50 units)
- [x] Total cost = 9,000 + 4,650 = 13,650 ✓

---

### Test 4: Execute Material Usage with FIFO

**Action:**
```sql
-- Create production record first
INSERT INTO production_records (
  product_id, quantity_produced, branch_id, status
) VALUES (
  'product-id', 10, 'branch-id', 'completed'
) RETURNING id;

-- Use material with FIFO
SELECT use_material_fifo(
  p_material_id := 'material-id',
  p_quantity := 150,
  p_branch_id := 'branch-id',
  p_production_record_id := 'production-id',
  p_usage_type := 'production',
  p_notes := 'Test FIFO usage',
  p_user_id := auth.uid()
);
```

**Expected Result:**
```json
{
  "material_id": "xxx",
  "quantity_used": 150,
  "total_cost": 13650,
  "average_price": 91,
  "batches_used": [
    {"batch_id": "...", "quantity": 100, "unit_price": 90, "cost": 9000},
    {"batch_id": "...", "quantity": 50, "unit_price": 93, "cost": 4650}
  ]
}
```

**Verify Batch Updates:**
```sql
SELECT
  batch_number,
  quantity_received,
  quantity_remaining,
  status
FROM material_inventory_batches
WHERE material_id = 'material-id'
ORDER BY purchase_date;
```

**Expected:**
- [x] Batch 1: quantity_remaining = 0, status = 'depleted'
- [x] Batch 2: quantity_remaining = 50, status = 'active'

**Verify Usage History:**
```sql
SELECT
  batch_id,
  quantity_used,
  unit_price,
  total_cost
FROM material_usage_history
WHERE production_record_id = 'production-id';
```

**Expected:**
- [x] 2 records created (one per batch)
- [x] Record 1: qty=100, price=90, cost=9000
- [x] Record 2: qty=50, price=93, cost=4650

**Verify Material Stock:**
```sql
SELECT stock FROM materials WHERE id = 'material-id';
```

**Expected:**
- [x] Stock decreased by 150

---

### Test 5: Third Usage (Should Use Remaining Batch 2)

**Action:**
```sql
-- Use another 30 units
SELECT use_material_fifo(
  p_material_id := 'material-id',
  p_quantity := 30,
  p_branch_id := 'branch-id',
  p_production_record_id := 'production-id-2',
  p_usage_type := 'production'
);
```

**Expected Result:**
```json
{
  "total_cost": 2790,  // 30 × 93
  "average_price": 93,
  "batches_used": [
    {"batch_id": "batch-2", "quantity": 30, "unit_price": 93, "cost": 2790}
  ]
}
```

**Verify:**
```sql
SELECT quantity_remaining, status
FROM material_inventory_batches
WHERE material_id = 'material-id'
ORDER BY purchase_date;
```

**Expected:**
- [x] Batch 1: qty=0, depleted (unchanged)
- [x] Batch 2: qty=20 (50-30), active

---

### Test 6: Insufficient Stock Error

**Action:**
```sql
-- Try to use 100 units (only 20 available)
SELECT use_material_fifo(
  p_material_id := 'material-id',
  p_quantity := 100,
  p_branch_id := 'branch-id'
);
```

**Expected Result:**
- [x] Error: "Insufficient stock. Still need 80 units"
- [x] No changes to database (transaction rolled back)

---

### Test 7: Get Stock with Batches (for UI)

**Action:**
```sql
SELECT * FROM get_material_stock_with_batches(
  'material-id',
  'branch-id'
);
```

**Expected Result:**
- [x] total_quantity = 20
- [x] total_value = 1860 (20 × 93)
- [x] weighted_avg_price = 93
- [x] batch_count = 1
- [x] batch_details shows only active batches

---

### Test 8: Production HPP Report

**Action:**
```sql
SELECT * FROM get_production_hpp_detail('production-id');
```

**Expected Result:**
- [x] Shows material breakdown
- [x] total_quantity_used = 150
- [x] total_cost = 13650
- [x] avg_cost_per_unit = 91
- [x] batch_breakdown shows 2 batches used

---

### Test 9: Inventory Summary View

**Action:**
```sql
SELECT * FROM material_inventory_summary
WHERE material_id = 'material-id';
```

**Expected Result:**
- [x] total_quantity_available = 20
- [x] total_inventory_value = 1860
- [x] weighted_average_cost = 93
- [x] lowest_unit_price = 93
- [x] highest_unit_price = 93
- [x] active_batch_count = 1

---

### Test 10: Manual Batch Entry

**Action:**
```sql
-- Add batch manually (no PO)
INSERT INTO material_inventory_batches (
  material_id,
  branch_id,
  batch_number,
  purchase_date,
  quantity_received,
  quantity_remaining,
  unit_price,
  notes
) VALUES (
  'material-id',
  'branch-id',
  generate_batch_number(),
  NOW(),
  50,
  50,
  95.00,
  'Manual entry - emergency purchase'
);
```

**Verify:**
```sql
SELECT COUNT(*) as batch_count
FROM material_inventory_batches
WHERE material_id = 'material-id'
AND status = 'active';
```

**Expected:**
- [x] batch_count = 2 (previous 20 units + new 50 units)
- [x] New batch has unit_price = 95

---

## 🎯 Performance Tests

### Test 11: Large Volume FIFO

**Setup:**
```sql
-- Create 100 batches with different prices
DO $$
BEGIN
  FOR i IN 1..100 LOOP
    INSERT INTO material_inventory_batches (
      material_id,
      branch_id,
      batch_number,
      quantity_received,
      quantity_remaining,
      unit_price,
      purchase_date
    ) VALUES (
      'material-id',
      'branch-id',
      'TEST-BATCH-' || i,
      100,
      100,
      90 + (i * 0.5), -- Prices from 90.5 to 140
      NOW() + (i || ' minutes')::INTERVAL
    );
  END LOOP;
END $$;
```

**Action:**
```sql
-- Use 5000 units (should use 50 batches)
EXPLAIN ANALYZE
SELECT * FROM calculate_fifo_cost('material-id', 5000, 'branch-id');
```

**Verify:**
- [x] Query completes in < 100ms
- [x] Uses index on purchase_date
- [x] Returns 50 batch records

---

## 🔍 Edge Cases

### Test 12: Zero Quantity
```sql
SELECT use_material_fifo('material-id', 0, 'branch-id');
-- Should handle gracefully
```

### Test 13: Negative Quantity
```sql
SELECT use_material_fifo('material-id', -10, 'branch-id');
-- Should error due to CHECK constraint
```

### Test 14: NULL Values
```sql
SELECT calculate_fifo_cost(NULL, 100, 'branch-id');
-- Should handle NULL material_id
```

---

## 📊 Final Verification

After all tests, verify data integrity:

```sql
-- 1. Check total quantity in batches matches material stock
SELECT
  m.id,
  m.name,
  m.stock as material_stock,
  COALESCE(SUM(b.quantity_remaining), 0) as batches_total
FROM materials m
LEFT JOIN material_inventory_batches b
  ON m.id = b.material_id AND b.status = 'active'
GROUP BY m.id, m.name, m.stock
HAVING m.stock != COALESCE(SUM(b.quantity_remaining), 0);

-- Should return NO rows (stock matches batches)
```

```sql
-- 2. Verify usage history totals
SELECT
  production_record_id,
  SUM(quantity_used) as total_used,
  SUM(total_cost) as total_hpp
FROM material_usage_history
GROUP BY production_record_id;
```

```sql
-- 3. Check for orphaned records
SELECT COUNT(*) FROM material_usage_history
WHERE batch_id NOT IN (SELECT id FROM material_inventory_batches);

-- Should return 0
```

---

## ✅ Success Criteria

All tests should pass:
- [x] Batches auto-created from PO
- [x] FIFO calculation correct
- [x] Material usage updates batches
- [x] Usage history recorded
- [x] Stock decreased correctly
- [x] Multiple batches handled correctly
- [x] Insufficient stock error works
- [x] Reports show accurate data
- [x] Manual batch entry works
- [x] Performance acceptable
- [x] Data integrity maintained

## 🚀 Ready for Production!

Once all tests pass, the FIFO system is ready to use in production.
