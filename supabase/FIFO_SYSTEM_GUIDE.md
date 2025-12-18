# 📊 Panduan Sistem FIFO (First In First Out) untuk HPP

## 🎯 Tujuan
Sistem ini memungkinkan tracking harga pembelian bahan dari Purchase Order dan otomatis menghitung HPP dengan metode FIFO saat produksi.

## 🏗️ Arsitektur Sistem

### 1. **Tables Created**

#### `material_inventory_batches`
Menyimpan setiap batch pembelian bahan dengan harga masing-masing.

**Kolom Penting:**
- `batch_number`: Nomor batch unik (MAT-2025-001)
- `purchase_order_id`: Link ke PO
- `quantity_received`: Jumlah yang diterima
- `quantity_remaining`: Sisa yang belum dipakai
- `unit_price`: **Harga dari PO** (ini yang dipakai untuk HPP!)
- `status`: active/depleted/expired

#### `material_usage_history`
Record penggunaan bahan dengan cost actual dari batch.

**Kolom Penting:**
- `batch_id`: Dari batch mana bahan ini diambil
- `quantity_used`: Berapa yang dipakai
- `unit_price`: Harga dari batch tersebut
- `total_cost`: quantity_used × unit_price
- `production_record_id`: Link ke produksi

## 📝 Alur Kerja

### **Scenario 1: Purchase Order Disetujui**

```sql
-- Ketika PO status berubah jadi 'received'
UPDATE purchase_orders
SET status = 'received'
WHERE id = 'po-uuid';

-- Otomatis trigger akan membuat batch:
-- Batch 1: 100 unit @ Rp 90 (dari PO bulan ini)
```

**Result:**
```
material_inventory_batches:
- batch_number: MAT-2025-001
- material_id: uuid-of-material
- quantity_received: 100
- quantity_remaining: 100
- unit_price: 90 ← dari PO
- purchase_date: 2025-01-15
```

### **Scenario 2: Purchase Order Kedua (Bulan Depan)**

```sql
-- PO kedua dengan harga berbeda
UPDATE purchase_orders
SET status = 'received'
WHERE id = 'po-uuid-2';

-- Otomatis membuat batch baru:
-- Batch 2: 100 unit @ Rp 93
```

**Result:**
```
material_inventory_batches:
Batch 1:
- quantity_remaining: 100
- unit_price: 90

Batch 2: (NEW)
- quantity_remaining: 100
- unit_price: 93
```

### **Scenario 3: Produksi Menggunakan Bahan (FIFO Magic!)**

```sql
-- Gunakan 150 unit untuk produksi
SELECT use_material_fifo(
  p_material_id := 'material-uuid',
  p_quantity := 150,
  p_branch_id := 'branch-uuid',
  p_production_record_id := 'production-uuid',
  p_usage_type := 'production'
);
```

**FIFO Calculation Automatic:**
```json
{
  "material_id": "xxx",
  "quantity_used": 150,
  "total_cost": 13650,
  "average_price": 91,
  "batches_used": [
    {
      "batch_id": "batch-1",
      "quantity": 100,
      "unit_price": 90,
      "cost": 9000  ← 100 × 90
    },
    {
      "batch_id": "batch-2",
      "quantity": 50,
      "unit_price": 93,
      "cost": 4650  ← 50 × 93
    }
  ]
}
```

**Updated Batches:**
```
Batch 1:
- quantity_remaining: 0 (habis!)
- status: depleted

Batch 2:
- quantity_remaining: 50 (100 - 50)
- status: active
```

## 🔧 Fungsi-Fungsi Penting

### 1. **calculate_fifo_cost()**
Menghitung cost dengan FIFO tanpa mengubah data.

```sql
-- Cek berapa cost jika pakai 150 unit (preview)
SELECT * FROM calculate_fifo_cost(
  'material-uuid',
  150,
  'branch-uuid'
);
```

**Output:**
| batch_id | quantity_from_batch | unit_price | batch_cost |
|----------|---------------------|------------|------------|
| batch-1  | 100                 | 90         | 9000       |
| batch-2  | 50                  | 93         | 4650       |

### 2. **use_material_fifo()**
Execute penggunaan bahan dengan FIFO (update database).

```sql
SELECT use_material_fifo(
  p_material_id := 'uuid',
  p_quantity := 150,
  p_branch_id := 'uuid',
  p_production_record_id := 'uuid',
  p_usage_type := 'production',
  p_notes := 'Produksi batch A',
  p_user_id := 'user-uuid'
);
```

### 3. **get_material_stock_with_batches()**
Lihat stock dengan detail per batch (untuk UI).

```sql
SELECT * FROM get_material_stock_with_batches('material-uuid', 'branch-uuid');
```

**Output:**
```json
{
  "material_name": "Kain Katun",
  "total_quantity": 150,
  "total_value": 13950,
  "weighted_avg_price": 93,
  "batch_count": 2,
  "batch_details": [
    {"batch_number": "MAT-2025-001", "quantity_remaining": 0, "unit_price": 90},
    {"batch_number": "MAT-2025-002", "quantity_remaining": 50, "unit_price": 93}
  ]
}
```

### 4. **get_production_hpp_detail()**
Lihat detail HPP untuk satu production record.

```sql
SELECT * FROM get_production_hpp_detail('production-record-uuid');
```

**Output:**
| material_name | total_quantity_used | total_cost | avg_cost_per_unit | batch_breakdown |
|---------------|---------------------|------------|-------------------|-----------------|
| Kain Katun    | 150                 | 13650      | 91                | [detailed JSON] |
| Benang        | 10                  | 500        | 50                | [detailed JSON] |

## 📊 Views untuk Monitoring

### `material_inventory_summary`
Ringkasan inventory dengan metrics FIFO.

```sql
SELECT * FROM material_inventory_summary
WHERE branch_id = 'branch-uuid';
```

**Kolom:**
- `total_quantity_available`: Total stock tersedia
- `total_inventory_value`: Nilai total inventory
- `weighted_average_cost`: Rata-rata tertimbang
- `lowest_unit_price`: Harga terendah di batch aktif
- `highest_unit_price`: Harga tertinggi di batch aktif
- `active_batch_count`: Jumlah batch yang masih ada

## 🎨 Integrasi dengan Frontend

### Display Stock Info
```typescript
// Fetch material with batch details
const { data } = await supabase
  .rpc('get_material_stock_with_batches', {
    p_material_id: materialId,
    p_branch_id: branchId
  });

// Show in UI:
// Stock: 150 unit
// Avg Price: Rp 93
// Total Value: Rp 13,950
// Batches: 2 active
```

### Production Form
```typescript
// Preview FIFO cost before production
const { data: costPreview } = await supabase
  .rpc('calculate_fifo_cost', {
    p_material_id: materialId,
    p_quantity_needed: 150,
    p_branch_id: branchId
  });

// Show estimated HPP
console.log('Estimated cost:', costPreview.reduce((sum, b) => sum + b.batch_cost, 0));
```

### Execute Production with FIFO
```typescript
// Use material with automatic FIFO
const { data: result } = await supabase
  .rpc('use_material_fifo', {
    p_material_id: materialId,
    p_quantity: 150,
    p_branch_id: branchId,
    p_production_record_id: productionId,
    p_usage_type: 'production',
    p_user_id: userId
  });

// Result contains actual cost
console.log('Actual HPP:', result.total_cost);
console.log('Average price:', result.average_price);
```

### HPP Report
```typescript
// Get detailed HPP for production
const { data: hppDetail } = await supabase
  .rpc('get_production_hpp_detail', {
    p_production_record_id: productionId
  });

// Show breakdown per material
hppDetail.forEach(material => {
  console.log(`${material.material_name}: Rp ${material.total_cost}`);
  console.log('Batches used:', material.batch_breakdown);
});
```

## ⚠️ Important Notes

### 1. **Insufficient Stock Error**
Jika stock tidak cukup, function akan throw error:
```sql
ERROR: Insufficient stock. Still need 50 units
```

Handle di frontend:
```typescript
try {
  await supabase.rpc('use_material_fifo', { ... });
} catch (error) {
  if (error.message.includes('Insufficient stock')) {
    alert('Stock tidak cukup!');
  }
}
```

### 2. **Automatic Batch Creation**
Batch dibuat otomatis saat PO status = 'received'. Pastikan:
- PO items sudah lengkap
- Unit price sudah benar
- Quantity received sudah diisi

### 3. **Manual Batch Entry**
Jika ada pembelian tanpa PO:
```sql
INSERT INTO material_inventory_batches (
  material_id,
  branch_id,
  batch_number,
  quantity_received,
  quantity_remaining,
  unit_price,
  purchase_date
) VALUES (
  'material-uuid',
  'branch-uuid',
  generate_batch_number(),
  100,
  100,
  95,
  NOW()
);
```

## 🚀 Migration Steps

1. **Run Migration 0201:**
```bash
npx supabase migration up 0201_create_material_inventory_fifo_system.sql
```

2. **Run Migration 0202:**
```bash
npx supabase migration up 0202_integrate_po_with_fifo_system.sql
```

3. **Verify Tables Created:**
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name LIKE 'material_%';
```

4. **Test FIFO Function:**
```sql
-- Create test batch
INSERT INTO material_inventory_batches ...

-- Test calculation
SELECT * FROM calculate_fifo_cost('test-material', 50, 'test-branch');
```

## 📈 Benefits

✅ **Accurate HPP**: Harga actual dari PO digunakan untuk HPP
✅ **Automatic FIFO**: Sistem otomatis pakai batch terlama dulu
✅ **Price History**: Track perubahan harga bahan dari waktu ke waktu
✅ **Detailed Reports**: HPP breakdown per batch per material
✅ **Real-time Costing**: HPP dihitung saat produksi, bukan estimasi
✅ **Inventory Valuation**: Total nilai inventory berdasarkan cost actual

## 🎯 Next Steps

1. Update frontend untuk display batch info
2. Tambah UI untuk preview FIFO cost sebelum produksi
3. Buat report HPP yang detail
4. Monitor weighted average cost untuk pricing decisions
