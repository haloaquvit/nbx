# 🏭 FIFO Inventory Costing + PPN Tax Tracking System

## 📖 Overview

Sistem terintegrasi untuk tracking inventory dengan metode FIFO (First In First Out) dan pelacakan PPN (Pajak Pertambahan Nilai) pada Purchase Orders.

## ✨ Key Features

### 🔄 FIFO Inventory System
- ✅ Track setiap batch pembelian dengan harga terpisah
- ✅ Automatic FIFO costing saat pemakaian material
- ✅ HPP calculation akurat berdasarkan harga batch
- ✅ Usage history detail untuk audit trail
- ✅ Weighted average cost calculation
- ✅ Auto-create batch dari Purchase Order

### 💰 PPN Tax Tracking
- ✅ Item-level tax control (PPN/Non-PPN)
- ✅ Customizable tax percentage (default 11%)
- ✅ Automatic calculation: subtotal, tax, total
- ✅ PO-level tax summary
- ✅ Tax invoice tracking (nomor & tanggal faktur)
- ✅ Supplier NPWP & PKP status
- ✅ Tax reports dan breakdown

### 🔗 Integration
- ✅ FIFO batches include tax information
- ✅ HPP uses pre-tax prices for accurate costing
- ✅ Tax data available for reporting
- ✅ Seamless PO → Inventory → Production flow

## 📁 File Structure

```
supabase/
├── migrations/
│   ├── 0201_create_material_inventory_fifo_system.sql
│   ├── 0202_integrate_po_with_fifo_system.sql
│   └── 0203_add_ppn_tax_tracking_to_po.sql
│
├── FIFO_SYSTEM_GUIDE.md           # FIFO usage guide
├── FIFO_TESTING_CHECKLIST.md      # FIFO test scenarios
├── PPN_TAX_TRACKING_GUIDE.md      # PPN usage guide
├── PPN_TESTING_CHECKLIST.md       # PPN test scenarios
└── FIFO_AND_TAX_SYSTEM_README.md  # This file
```

## 🚀 Quick Start

### 1. Run Migrations (in order)

```bash
# Via Supabase CLI
npx supabase migration up

# Or manually via SQL Editor:
# 1. Run 0201_create_material_inventory_fifo_system.sql
# 2. Run 0202_integrate_po_with_fifo_system.sql
# 3. Run 0203_add_ppn_tax_tracking_to_po.sql
```

### 2. Verify Installation

```sql
-- Check tables exist
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN (
  'material_inventory_batches',
  'material_usage_history'
);

-- Check functions exist
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN (
  'calculate_fifo_cost',
  'use_material_fifo',
  'get_po_tax_detail'
);

-- Check triggers exist
SELECT trigger_name FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND trigger_name IN (
  'trigger_create_batch_from_po',
  'trigger_calculate_po_item_totals'
);
```

### 3. Test Basic Functionality

```sql
-- Test FIFO calculation
SELECT * FROM calculate_fifo_cost(
  'material-id',
  100,
  'branch-id'
);

-- Test PO tax calculation
INSERT INTO purchase_order_items (
  purchase_order_id,
  material_id,
  quantity,
  unit_price,
  is_taxable
) VALUES (
  'po-id',
  'material-id',
  100,
  90,
  true
);

-- Verify auto-calculated tax
SELECT subtotal, tax_amount, total_with_tax
FROM purchase_order_items
WHERE purchase_order_id = 'po-id';
```

## 📊 Complete Workflow Example

### Scenario: Purchase 200m Kain, Use 150m for Production

#### Step 1: Create Purchase Order with Tax

```sql
-- Create PO
INSERT INTO purchase_orders (
  po_number,
  supplier_id,
  branch_id,
  order_date,
  status
) VALUES (
  'PO-2025-001',
  'supplier-abc',
  'branch-jakarta',
  NOW(),
  'pending'
) RETURNING id; -- Save as 'po-id'

-- Add 2 batches with different prices (both taxable)
INSERT INTO purchase_order_items (
  purchase_order_id,
  material_id,
  quantity,
  unit_price,
  is_taxable,
  tax_percentage
) VALUES
  ('po-id', 'kain-id', 100, 90.00, true, 11.00),
  ('po-id', 'kain-id', 100, 93.00, true, 11.00);

-- Check PO totals (auto-calculated)
SELECT
  po_number,
  subtotal_amount,  -- 18,300 (9,000 + 9,300)
  tax_amount,       -- 2,013 (990 + 1,023)
  total_amount      -- 20,313
FROM purchase_orders WHERE id = 'po-id';
```

**Result:**
- Batch 1: 100m @ Rp 90 = Rp 9,000 + PPN Rp 990 = **Rp 9,990**
- Batch 2: 100m @ Rp 93 = Rp 9,300 + PPN Rp 1,023 = **Rp 10,323**
- **Grand Total: Rp 20,313**

#### Step 2: Receive PO (Auto-Create FIFO Batches)

```sql
-- Mark PO as received
UPDATE purchase_orders
SET
  status = 'received',
  approved_by = 'user-id',
  tax_invoice_number = '010.000-25.00000001',
  tax_invoice_date = '2025-01-15'
WHERE id = 'po-id';
```

**Automatic Actions:**
1. ✅ Trigger creates 2 inventory batches
2. ✅ Batch 1: 100m @ Rp 90 (pre-tax price for HPP)
3. ✅ Batch 2: 100m @ Rp 93
4. ✅ Notes include tax info: "PPN 11% = Rp 990"
5. ✅ Material stock increased by 200m

```sql
-- Verify batches created
SELECT
  batch_number,
  quantity_remaining,
  unit_price,
  notes
FROM material_inventory_batches
WHERE purchase_order_id = 'po-id'
ORDER BY purchase_date;
```

**Result:**
```
batch_number    | qty | price | notes
----------------|-----|-------|--------------------------------
MAT-2025-001-1  | 100 | 90.00 | Auto-created from PO #PO-2025-001 | PPN 11% = Rp 990
MAT-2025-001-2  | 100 | 93.00 | Auto-created from PO #PO-2025-001 | PPN 11% = Rp 1023
```

#### Step 3: Use Material for Production (FIFO Costing)

```sql
-- Create production record
INSERT INTO production_records (
  product_id,
  quantity_produced,
  branch_id,
  status
) VALUES (
  'product-id',
  10,
  'branch-jakarta',
  'completed'
) RETURNING id; -- Save as 'production-id'

-- Use 150m of Kain with automatic FIFO
SELECT use_material_fifo(
  p_material_id := 'kain-id',
  p_quantity := 150,
  p_branch_id := 'branch-jakarta',
  p_production_record_id := 'production-id',
  p_usage_type := 'production',
  p_notes := 'Production batch #10',
  p_user_id := auth.uid()
);
```

**Returns:**
```json
{
  "material_id": "kain-id",
  "quantity_used": 150,
  "total_cost": 13650,
  "average_price": 91,
  "batches_used": [
    {
      "batch_id": "batch-1-id",
      "quantity": 100,
      "unit_price": 90,
      "cost": 9000
    },
    {
      "batch_id": "batch-2-id",
      "quantity": 50,
      "unit_price": 93,
      "cost": 4650
    }
  ]
}
```

**HPP Calculation:**
- Used 100m from Batch 1 @ Rp 90 = **Rp 9,000**
- Used 50m from Batch 2 @ Rp 93 = **Rp 4,650**
- **Total HPP: Rp 13,650**
- **Average Cost: Rp 91/meter**

#### Step 4: Verify Remaining Stock

```sql
-- Check batch status
SELECT
  batch_number,
  quantity_received,
  quantity_remaining,
  status
FROM material_inventory_batches
WHERE material_id = 'kain-id'
ORDER BY purchase_date;
```

**Result:**
```
batch_number    | received | remaining | status
----------------|----------|-----------|--------
MAT-2025-001-1  | 100      | 0         | depleted
MAT-2025-001-2  | 100      | 50        | active
```

#### Step 5: View Production HPP Report

```sql
SELECT * FROM get_production_hpp_detail('production-id');
```

**Returns:**
```json
{
  "material_name": "Kain",
  "total_quantity_used": 150,
  "total_cost": 13650,
  "avg_cost_per_unit": 91,
  "batch_breakdown": [
    {
      "batch_number": "MAT-2025-001-1",
      "quantity_used": 100,
      "unit_price": 90,
      "cost": 9000,
      "purchase_date": "2025-01-15"
    },
    {
      "batch_number": "MAT-2025-001-2",
      "quantity_used": 50,
      "unit_price": 93,
      "cost": 4650,
      "purchase_date": "2025-01-15"
    }
  ]
}
```

#### Step 6: Generate PO PDF with Tax

```sql
SELECT * FROM get_po_tax_detail('po-id');
```

**PDF Output:**
```
══════════════════════════════════════════════════
                PURCHASE ORDER
══════════════════════════════════════════════════

PO Number:      PO-2025-001
Date:           15 Jan 2025
Supplier:       PT Supplier ABC
NPWP:           01.234.567.8-901.000

Faktur Pajak:   010.000-25.00000001
Tanggal:        15 Jan 2025

──────────────────────────────────────────────────
Item Details:
──────────────────────────────────────────────────

Item: Kain A
Qty:     100 meter @ Rp 90.00
Subtotal:    Rp   9,000.00
PPN 11%:     Rp     990.00
Total:       Rp   9,990.00

Item: Kain A (Batch 2)
Qty:     100 meter @ Rp 93.00
Subtotal:    Rp   9,300.00
PPN 11%:     Rp   1,023.00
Total:       Rp  10,323.00

══════════════════════════════════════════════════
                    SUMMARY
══════════════════════════════════════════════════

Subtotal:        Rp  18,300.00
PPN (11%):       Rp   2,013.00
──────────────────────────────────
GRAND TOTAL:     Rp  20,313.00
══════════════════════════════════════════════════
```

## 📈 Key Reports

### 1. Inventory Summary with Weighted Average

```sql
SELECT * FROM material_inventory_summary
WHERE material_id = 'kain-id';
```

Returns:
- Total quantity available: 50
- Total inventory value: Rp 4,650
- Weighted average cost: Rp 93
- Active batches: 1

### 2. Monthly PPN Report

```sql
SELECT
  DATE_TRUNC('month', order_date) as month,
  COUNT(*) as po_count,
  SUM(subtotal_amount) as total_before_tax,
  SUM(tax_amount) as total_ppn,
  SUM(total_amount) as total_with_tax
FROM purchase_orders
WHERE order_date >= '2025-01-01'
  AND status = 'received'
GROUP BY month;
```

### 3. Supplier Tax Summary

```sql
SELECT * FROM purchase_order_tax_summary
WHERE supplier_npwp IS NOT NULL
ORDER BY total_amount DESC;
```

## 🎯 Important Concepts

### HPP vs Purchase Price

**Purchase Price (with tax):**
- What you pay to supplier
- Includes PPN (11%)
- Example: Rp 9,990 (Rp 9,000 + Rp 990 PPN)

**HPP/COGS (without tax):**
- Cost of Goods Sold for accounting
- Excludes PPN (tax is separate expense)
- Example: Rp 9,000 (base price)
- Used in FIFO calculation

**Why?**
- PPN is not part of product cost
- PPN is recoverable (input tax credit)
- HPP reflects true material cost

### FIFO Benefits

1. **Accurate Costing**: Uses actual purchase prices
2. **Price Trend Analysis**: See cost changes over time
3. **Inventory Valuation**: Weighted average for balance sheet
4. **Compliance**: Matches physical flow of goods
5. **Tax Reporting**: Separate tracking of tax vs cost

## 🔒 Security & Compliance

### RLS Policies
- ✅ Branch-level access control
- ✅ Owner/Admin see all branches
- ✅ Users see only their branch data

### Audit Trail
- ✅ Created_by and created_at on all records
- ✅ Updated_at auto-updated on changes
- ✅ Usage history tracks who used materials
- ✅ Batch depletion history

### Tax Compliance
- ✅ NPWP tracking for suppliers
- ✅ PKP status flag
- ✅ Tax invoice number & date
- ✅ Detailed tax reports

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| [FIFO_SYSTEM_GUIDE.md](FIFO_SYSTEM_GUIDE.md) | Complete FIFO usage guide |
| [FIFO_TESTING_CHECKLIST.md](FIFO_TESTING_CHECKLIST.md) | 14 FIFO test scenarios |
| [PPN_TAX_TRACKING_GUIDE.md](PPN_TAX_TRACKING_GUIDE.md) | Complete PPN usage guide |
| [PPN_TESTING_CHECKLIST.md](PPN_TESTING_CHECKLIST.md) | 19 PPN test scenarios |
| This README | Overview & quick start |

## ✅ Testing

Run complete test suites:

```sql
-- Test FIFO system (14 scenarios)
-- See FIFO_TESTING_CHECKLIST.md

-- Test PPN system (19 scenarios)
-- See PPN_TESTING_CHECKLIST.md
```

## 🚧 Next Steps: Frontend Integration

### 1. PO Form Enhancements

```typescript
// Add tax fields to PO item form
interface POItemForm {
  material_id: string;
  quantity: number;
  unit_price: number;
  is_taxable: boolean; // Checkbox
  tax_percentage: number; // Default 11

  // Display only (auto-calculated):
  subtotal: number;
  tax_amount: number;
  total_with_tax: number;
}

// PO Summary component
<POSummary
  subtotal={po.subtotal_amount}
  tax={po.tax_amount}
  total={po.total_amount}
/>
```

### 2. Inventory Batch Display

```typescript
// Show batch information in material list
<MaterialBatchInfo
  materialId={material.id}
  batches={batches}
  showWeightedAverage={true}
/>
```

### 3. Production HPP Display

```typescript
// Show detailed HPP breakdown
<ProductionHPPDetail
  productionId={production.id}
  materials={materials}
  totalHPP={13650}
  batchBreakdown={batches}
/>
```

### 4. PDF Generation

```typescript
// Generate PO PDF with tax
import { generatePOPDF } from '@/utils/pdf';

const poData = await supabase
  .rpc('get_po_tax_detail', { p_po_id: poId })
  .single();

generatePOPDF(poData);
```

## 💡 Tips & Best Practices

1. **Always verify supplier NPWP** before marking as PKP
2. **Use consistent tax rates** (11% is standard)
3. **Record tax invoice numbers** for compliance
4. **Review batch status regularly** to identify old stock
5. **Run monthly tax reports** for reconciliation
6. **HPP uses pre-tax prices** for accurate costing
7. **Test calculations** before production use

## 🆘 Troubleshooting

### Batches not created from PO
- Check PO status is 'received' or 'partially_received'
- Verify trigger exists: `trigger_create_batch_from_po`
- Check migration 0202 ran successfully

### Tax not calculating
- Verify trigger exists: `trigger_calculate_po_item_totals`
- Check is_taxable and tax_percentage fields
- Ensure migration 0203 ran successfully

### FIFO insufficient stock error
- Check available batches: `SELECT * FROM material_inventory_batches WHERE material_id = '...' AND status = 'active'`
- Verify material stock matches batch totals

## 📞 Support

For issues or questions:
1. Check relevant documentation file
2. Run test scenarios from checklists
3. Review migration SQL for schema details
4. Check database logs for errors

## 🎉 Success!

You now have a complete FIFO inventory costing system with PPN tax tracking! 🚀
