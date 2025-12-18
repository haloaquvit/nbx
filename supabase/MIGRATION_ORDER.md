# 📋 Migration Execution Order

## 🎯 FIFO + PPN System Migrations

Execute these migrations in **exact order** to set up the complete FIFO inventory costing and PPN tax tracking system.

## ✅ Pre-flight Checks

Before running migrations:

```sql
-- 1. Check database version
SELECT version();

-- 2. Verify existing tables
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('purchase_orders', 'materials', 'suppliers', 'branches');

-- 3. Backup your data (IMPORTANT!)
-- Use Supabase Dashboard or pg_dump
```

## 🚀 Migration Order

### Step 1: Create Purchase Order Items Table
**File:** `0200_create_purchase_order_items_table.sql`

**What it does:**
- ✅ Creates `purchase_order_items` table
- ✅ Migrates existing single-item POs to multi-item format
- ✅ Adds `po_number`, `supplier_id`, `branch_id` to purchase_orders
- ✅ Generates PO numbers for existing records
- ✅ Creates `generate_po_number()` function
- ✅ Creates view `purchase_orders_with_items`

**Run:**
```bash
npx supabase migration up --file 0200_create_purchase_order_items_table.sql
```

**Verify:**
```sql
-- Should return rows
SELECT COUNT(*) FROM purchase_order_items;

-- Should show new columns
\d purchase_orders

-- Should work
SELECT generate_po_number();
```

---

### Step 2: Create FIFO Inventory System
**File:** `0201_create_material_inventory_fifo_system.sql`

**What it does:**
- ✅ Creates `material_inventory_batches` table
- ✅ Creates `material_usage_history` table
- ✅ Creates `generate_batch_number()` function
- ✅ Creates `calculate_fifo_cost()` function
- ✅ Creates `use_material_fifo()` function
- ✅ Sets up RLS policies
- ✅ Creates triggers for auto-status updates

**Run:**
```bash
npx supabase migration up --file 0201_create_material_inventory_fifo_system.sql
```

**Verify:**
```sql
-- Tables exist
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('material_inventory_batches', 'material_usage_history');

-- Functions exist
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN ('calculate_fifo_cost', 'use_material_fifo', 'generate_batch_number');
```

---

### Step 3: Integrate PO with FIFO System
**File:** `0202_integrate_po_with_fifo_system.sql`

**What it does:**
- ✅ Creates `create_batch_from_po_receipt()` trigger function
- ✅ Auto-creates inventory batches when PO status = 'received'
- ✅ Creates `get_material_stock_with_batches()` function
- ✅ Creates `get_production_hpp_detail()` function
- ✅ Creates `material_inventory_summary` view

**Run:**
```bash
npx supabase migration up --file 0202_integrate_po_with_fifo_system.sql
```

**Verify:**
```sql
-- Trigger exists
SELECT trigger_name FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND trigger_name = 'trigger_create_batch_from_po';

-- View exists
SELECT * FROM material_inventory_summary LIMIT 1;
```

---

### Step 4: Add PPN Tax Tracking
**File:** `0203_add_ppn_tax_tracking_to_po.sql`

**What it does:**
- ✅ Adds tax fields to `purchase_order_items` (is_taxable, tax_percentage, etc.)
- ✅ Adds tax summary fields to `purchase_orders`
- ✅ Creates `calculate_po_item_totals()` trigger
- ✅ Creates `calculate_po_summary_totals()` trigger
- ✅ Updates `create_batch_from_po_receipt()` to include tax notes
- ✅ Creates `purchase_order_tax_summary` view
- ✅ Creates `get_po_tax_detail()` function
- ✅ Adds NPWP and PKP fields to suppliers

**Run:**
```bash
npx supabase migration up --file 0203_add_ppn_tax_tracking_to_po.sql
```

**Verify:**
```sql
-- Tax fields exist
SELECT column_name FROM information_schema.columns
WHERE table_name = 'purchase_order_items'
AND column_name IN ('is_taxable', 'tax_percentage', 'tax_amount');

-- Triggers exist
SELECT trigger_name FROM information_schema.triggers
WHERE trigger_name LIKE '%tax%';

-- Function exists
SELECT routine_name FROM information_schema.routines
WHERE routine_name = 'get_po_tax_detail';
```

---

## 🧪 Post-Migration Testing

### Quick Smoke Test

```sql
-- 1. Test PO item creation with tax
INSERT INTO purchase_orders (
  po_number, order_date, status
) VALUES (
  'PO-TEST-001', NOW(), 'pending'
) RETURNING id;

INSERT INTO purchase_order_items (
  purchase_order_id,
  material_id,
  quantity,
  unit_price,
  is_taxable
) VALUES (
  'po-id-from-above',
  (SELECT id FROM materials LIMIT 1),
  100,
  90,
  true
);

-- 2. Verify tax calculated
SELECT
  subtotal,       -- Should be 9,000
  tax_amount,     -- Should be 990
  total_with_tax  -- Should be 9,990
FROM purchase_order_items
WHERE purchase_order_id = 'po-id-from-above';

-- 3. Verify PO summary updated
SELECT
  subtotal_amount,  -- Should be 9,000
  tax_amount,       -- Should be 990
  total_amount      -- Should be 9,990
FROM purchase_orders
WHERE id = 'po-id-from-above';

-- 4. Test batch creation
UPDATE purchase_orders
SET status = 'received'
WHERE id = 'po-id-from-above';

-- 5. Verify batch created
SELECT COUNT(*) FROM material_inventory_batches
WHERE purchase_order_id = 'po-id-from-above';
-- Should return 1

-- 6. Clean up test data
DELETE FROM purchase_orders WHERE po_number = 'PO-TEST-001';
```

---

## 📊 Complete Testing

After smoke test passes, run comprehensive tests:

1. **FIFO System:** Follow [FIFO_TESTING_CHECKLIST.md](FIFO_TESTING_CHECKLIST.md)
2. **PPN System:** Follow [PPN_TESTING_CHECKLIST.md](PPN_TESTING_CHECKLIST.md)

---

## 🔄 Migration via Supabase CLI (Recommended)

```bash
# Navigate to project directory
cd "d:\App\Aquvit Fix - Copy"

# Run all pending migrations in order
npx supabase migration up

# Or run specific migration
npx supabase migration up --file supabase/migrations/0200_create_purchase_order_items_table.sql
```

---

## 🌐 Migration via Supabase Dashboard

1. Go to https://supabase.com/dashboard/project/YOUR_PROJECT/sql/new
2. Copy entire content of migration file
3. Paste into SQL Editor
4. Click "Run"
5. Verify success message
6. Repeat for each migration in order

---

## ⚠️ Important Notes

### DO NOT Skip Migrations
- Migrations have dependencies
- Running out of order will cause errors
- Each migration builds on the previous

### Backup First
- Always backup before running migrations
- Test on staging environment first if available

### Check for Errors
After each migration:
```sql
-- Check for failed functions
SELECT routine_name, routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN ('use_material_fifo', 'calculate_fifo_cost', 'get_po_tax_detail');

-- Check for failed triggers
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public';
```

### Schema Compatibility
- ✅ Compatible with existing data
- ✅ All migrations use IF NOT EXISTS
- ✅ Safe to re-run (idempotent)
- ✅ Migrates old PO format to new format

---

## 🐛 Troubleshooting

### Error: "relation already exists"
**Solution:** Migration already run or partial run. Check table exists:
```sql
SELECT tablename FROM pg_tables WHERE tablename = 'table_name';
```

### Error: "function already exists"
**Solution:** Use `CREATE OR REPLACE FUNCTION` (already in migrations)

### Error: "foreign key violation"
**Solution:** Check referenced tables exist:
```sql
SELECT tablename FROM pg_tables
WHERE tablename IN ('materials', 'suppliers', 'branches', 'purchase_orders');
```

### Error: "column already exists"
**Solution:** Migrations use `ADD COLUMN IF NOT EXISTS` - should not error

---

## ✅ Success Criteria

All migrations successful when:

- [x] All 4 migrations run without errors
- [x] Smoke test passes
- [x] All tables exist
- [x] All functions exist
- [x] All triggers exist
- [x] All views exist
- [x] RLS policies active
- [x] Test PO creates batches automatically
- [x] Tax calculations work correctly

---

## 📚 Next Steps

1. ✅ Run migrations in order
2. ✅ Run smoke test
3. ✅ Run comprehensive tests
4. ⏳ Update frontend UI
5. ⏳ Implement PDF generation
6. ⏳ Create reports dashboard

---

## 📖 Documentation

| File | Description |
|------|-------------|
| [FIFO_AND_TAX_SYSTEM_README.md](FIFO_AND_TAX_SYSTEM_README.md) | System overview & complete workflow |
| [FIFO_SYSTEM_GUIDE.md](FIFO_SYSTEM_GUIDE.md) | FIFO usage guide |
| [FIFO_TESTING_CHECKLIST.md](FIFO_TESTING_CHECKLIST.md) | 14 FIFO test scenarios |
| [PPN_TAX_TRACKING_GUIDE.md](PPN_TAX_TRACKING_GUIDE.md) | PPN usage guide |
| [PPN_TESTING_CHECKLIST.md](PPN_TESTING_CHECKLIST.md) | 19 PPN test scenarios |
| This file | Migration execution order |

---

**Ready to migrate? Start with Step 1! 🚀**
