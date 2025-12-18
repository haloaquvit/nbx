# 📋 PPN Tax Tracking System Guide

## 🎯 Overview

Sistem pelacakan PPN (Pajak Pertambahan Nilai) untuk Purchase Orders yang terintegrasi dengan sistem FIFO. Mendukung item kena pajak dan non-pajak dalam satu PO.

## ✨ Key Features

1. **Item-Level Tax Control**
   - Setiap item bisa PPN atau non-PPN
   - Persentase pajak dapat dikustomisasi (default 11%)
   - Kalkulasi otomatis subtotal, pajak, dan total

2. **PO-Level Tax Summary**
   - Total sebelum pajak (subtotal)
   - Total pajak (PPN)
   - Grand total (dengan pajak)
   - Nomor dan tanggal faktur pajak

3. **Supplier Tax Information**
   - NPWP (Nomor Pokok Wajib Pajak)
   - Status PKP (Pengusaha Kena Pajak)

4. **FIFO Integration**
   - Batch inventory mencatat info pajak di notes
   - HPP calculation tetap menggunakan harga sebelum pajak
   - Tax information untuk reporting

## 🗂️ Database Schema

### purchase_order_items
```sql
-- Tax fields per item
is_taxable BOOLEAN DEFAULT true
tax_percentage DECIMAL(5,2) DEFAULT 11.00
tax_amount DECIMAL(15,2) -- Auto-calculated
subtotal DECIMAL(15,2) -- unit_price × quantity
total_with_tax DECIMAL(15,2) -- subtotal + tax_amount
```

### purchase_orders
```sql
-- Tax summary
subtotal_amount DECIMAL(15,2) -- Sum of all items before tax
tax_amount DECIMAL(15,2) -- Total PPN
total_amount DECIMAL(15,2) -- Grand total
tax_invoice_number VARCHAR(100) -- Nomor faktur pajak
tax_invoice_date DATE
tax_notes TEXT
```

### suppliers
```sql
npwp VARCHAR(20) -- Nomor Pokok Wajib Pajak
is_pkp BOOLEAN DEFAULT false -- PKP status
```

## 🔧 How It Works

### Automatic Calculations

```sql
-- Trigger on INSERT/UPDATE of purchase_order_items:
subtotal = unit_price × quantity

IF is_taxable THEN
  tax_amount = subtotal × (tax_percentage / 100)
ELSE
  tax_amount = 0
END IF

total_with_tax = subtotal + tax_amount

-- Then automatically updates purchase_orders:
subtotal_amount = SUM(all items subtotal)
tax_amount = SUM(all items tax_amount)
total_amount = SUM(all items total_with_tax)
```

### Example Calculation

**PO with mixed taxable/non-taxable items:**

| Item | Qty | Price | Subtotal | PPN? | Tax (11%) | Total |
|------|-----|-------|----------|------|-----------|-------|
| Kain A | 100 | 90 | 9,000 | ✅ Yes | 990 | 9,990 |
| Kain B | 50 | 93 | 4,650 | ✅ Yes | 511.50 | 5,161.50 |
| Benang | 200 | 5 | 1,000 | ❌ No | 0 | 1,000 |

**PO Totals:**
- Subtotal: Rp 14,650
- PPN (11%): Rp 1,501.50
- **Grand Total: Rp 16,151.50**

## 📊 Usage Examples

### 1. Create PO with Mixed Tax Items

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
  'supplier-id',
  'branch-id',
  NOW(),
  'pending'
) RETURNING id;

-- Add taxable item
INSERT INTO purchase_order_items (
  purchase_order_id,
  material_id,
  quantity,
  unit_price,
  is_taxable,
  tax_percentage
) VALUES (
  'po-id',
  'material-id-1',
  100,
  90.00,
  true,
  11.00
);
-- Auto-calculated:
-- subtotal = 9,000
-- tax_amount = 990
-- total_with_tax = 9,990

-- Add non-taxable item
INSERT INTO purchase_order_items (
  purchase_order_id,
  material_id,
  quantity,
  unit_price,
  is_taxable
) VALUES (
  'po-id',
  'material-id-2',
  200,
  5.00,
  false -- Non-PPN
);
-- Auto-calculated:
-- subtotal = 1,000
-- tax_amount = 0
-- total_with_tax = 1,000

-- PO totals auto-updated:
-- subtotal_amount = 10,000
-- tax_amount = 990
-- total_amount = 10,990
```

### 2. Get PO Tax Details for PDF

```sql
SELECT * FROM get_po_tax_detail('po-id');
```

**Returns:**
```json
{
  "po_number": "PO-2025-001",
  "order_date": "2025-01-15T10:00:00Z",
  "supplier_name": "PT Supplier ABC",
  "supplier_npwp": "01.234.567.8-901.000",
  "supplier_address": "Jl. Supplier No. 123",
  "branch_name": "Cabang Jakarta",
  "tax_invoice_number": "010.000-25.00000001",
  "tax_invoice_date": "2025-01-15",
  "items": [
    {
      "material_name": "Kain A",
      "quantity": 100,
      "unit": "meter",
      "unit_price": 90.00,
      "subtotal": 9000.00,
      "is_taxable": true,
      "tax_percentage": 11.00,
      "tax_amount": 990.00,
      "total_with_tax": 9990.00
    },
    {
      "material_name": "Benang",
      "quantity": 200,
      "unit": "meter",
      "unit_price": 5.00,
      "subtotal": 1000.00,
      "is_taxable": false,
      "tax_percentage": 11.00,
      "tax_amount": 0.00,
      "total_with_tax": 1000.00
    }
  ],
  "subtotal_amount": 10000.00,
  "tax_amount": 990.00,
  "total_amount": 10990.00
}
```

### 3. Add Tax Invoice Information

```sql
UPDATE purchase_orders
SET
  tax_invoice_number = '010.000-25.00000001',
  tax_invoice_date = '2025-01-15',
  tax_notes = 'Faktur pajak diterima lengkap'
WHERE id = 'po-id';
```

### 4. Update Supplier Tax Info

```sql
UPDATE suppliers
SET
  npwp = '01.234.567.8-901.000',
  is_pkp = true
WHERE id = 'supplier-id';
```

### 5. Tax Summary Report

```sql
SELECT * FROM purchase_order_tax_summary
WHERE order_date >= '2025-01-01'
ORDER BY order_date DESC;
```

**Returns:**
```
| PO Number | Supplier | Subtotal | PPN | Total | Taxable Items | Non-Taxable Items |
|-----------|----------|----------|-----|-------|---------------|-------------------|
| PO-2025-001 | PT ABC | 14,650 | 1,501.50 | 16,151.50 | 2 | 1 |
| PO-2025-002 | PT XYZ | 50,000 | 5,500 | 55,500 | 5 | 0 |
```

## 🔗 Integration with FIFO System

When PO is received, inventory batches are created with tax information in notes:

```sql
-- Batch notes example:
"Auto-created from PO #PO-2025-001 | PPN 11% = Rp 990"
"Auto-created from PO #PO-2025-001 | Non-PPN"
```

**Important:** HPP calculation uses `unit_price` (before tax) for accurate cost tracking.

## 📄 Frontend Integration

### Form Fields for PO Items

```typescript
interface POItemFormData {
  material_id: string;
  quantity: number;
  unit_price: number;
  is_taxable: boolean; // Checkbox: "Kena PPN"
  tax_percentage: number; // Input (default 11%)

  // Display only (auto-calculated):
  subtotal: number;
  tax_amount: number;
  total_with_tax: number;
}
```

### PO Summary Display

```typescript
interface POSummary {
  subtotal_amount: number; // Subtotal sebelum pajak
  tax_amount: number; // Total PPN
  total_amount: number; // Grand Total

  // Optional:
  tax_invoice_number?: string;
  tax_invoice_date?: string;
  tax_notes?: string;
}
```

### PDF Template Structure

```
PURCHASE ORDER
PO Number: PO-2025-001
Date: 15 Jan 2025
Supplier: PT Supplier ABC
NPWP: 01.234.567.8-901.000

┌─────────────────────────────────────────────────────────────────┐
│ Item      │ Qty │ Price │ Subtotal │ PPN  │ Tax    │ Total     │
├─────────────────────────────────────────────────────────────────┤
│ Kain A    │ 100 │ 90    │ 9,000    │ 11%  │ 990    │ 9,990     │
│ Kain B    │  50 │ 93    │ 4,650    │ 11%  │ 511.50 │ 5,161.50  │
│ Benang    │ 200 │  5    │ 1,000    │ N/A  │ 0      │ 1,000     │
└─────────────────────────────────────────────────────────────────┘

                              Subtotal:     Rp  14,650.00
                              PPN (11%):    Rp   1,501.50
                              ─────────────────────────────
                              GRAND TOTAL:  Rp  16,151.50

Faktur Pajak: 010.000-25.00000001
Tanggal Faktur: 15 Jan 2025
```

## 🧪 Testing Scenarios

### Test 1: PO with All Taxable Items
```sql
-- All items PPN 11%
-- Verify: tax_amount = subtotal × 0.11
-- Verify: total_amount = subtotal × 1.11
```

### Test 2: PO with All Non-Taxable Items
```sql
-- All items is_taxable = false
-- Verify: tax_amount = 0
-- Verify: total_amount = subtotal_amount
```

### Test 3: PO with Mixed Items
```sql
-- Some taxable, some not
-- Verify: tax only calculated on taxable items
-- Verify: total is sum of all items with respective tax
```

### Test 4: Custom Tax Percentage
```sql
-- Set tax_percentage = 12%
-- Verify: calculation uses custom rate
```

### Test 5: FIFO Batch Creation
```sql
-- Receive PO with tax info
-- Verify: batches created with tax notes
-- Verify: unit_price in batch is before-tax price
```

### Test 6: Tax Invoice Tracking
```sql
-- Add tax invoice number and date
-- Verify: stored correctly
-- Verify: appears in reports
```

## 📈 Reports

### Monthly PPN Report
```sql
SELECT
  DATE_TRUNC('month', order_date) as month,
  COUNT(*) as po_count,
  SUM(subtotal_amount) as total_subtotal,
  SUM(tax_amount) as total_ppn,
  SUM(total_amount) as total_with_tax
FROM purchase_orders
WHERE order_date >= '2025-01-01'
  AND status IN ('received', 'partially_received')
GROUP BY DATE_TRUNC('month', order_date)
ORDER BY month DESC;
```

### Supplier Tax Report
```sql
SELECT
  s.name as supplier_name,
  s.npwp,
  s.is_pkp,
  COUNT(po.id) as po_count,
  SUM(po.subtotal_amount) as total_purchases,
  SUM(po.tax_amount) as total_ppn
FROM suppliers s
JOIN purchase_orders po ON s.id = po.supplier_id
WHERE po.order_date >= '2025-01-01'
  AND po.status IN ('received', 'partially_received')
GROUP BY s.id, s.name, s.npwp, s.is_pkp
ORDER BY total_purchases DESC;
```

## 🔒 Security Notes

1. Only authorized users can modify tax settings
2. Tax calculations are automatic to prevent manual errors
3. Audit trail maintained via triggers
4. RLS policies apply to all tax-related tables

## 📝 Best Practices

1. **Always verify supplier NPWP** before marking them as PKP
2. **Use consistent tax percentages** (11% is standard PPN in Indonesia)
3. **Record tax invoice numbers** for audit compliance
4. **Separate taxable and non-taxable items** when possible for clearer reporting
5. **HPP uses pre-tax prices** to ensure accurate cost of goods sold

## 🚀 Migration Notes

- Migration `0203_add_ppn_tax_tracking_to_po.sql` adds all tax fields
- Existing PO items auto-calculated with 11% PPN default
- Existing POs updated with summary totals
- Safe to run on production (uses IF NOT EXISTS)
