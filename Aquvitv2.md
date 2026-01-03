# Aquvit v2 - Changelog & Migration Guide

**Tanggal**: 2026-01-03
**Status**: Belum di-push ke production

---

## Daftar Perubahan

### 1. Fitur Delivery Tanpa Supir (Web Only)

**File yang diubah**:
- `src/utils/roleUtils.ts`
- `src/components/DeliveryFormContent.tsx`
- `src/hooks/useDeliveries.ts`

**Deskripsi**:
- Role `owner`, `admin`, `kasir sales`, `kasir` dapat membuat delivery tanpa memilih supir di web view
- Jika tidak ada supir, komisi tidak di-generate
- Field supir menjadi opsional dengan label "(Opsional)"
- Opsi "Tanpa Supir" tersedia di dropdown

**Perubahan kode**:
```typescript
// src/utils/roleUtils.ts - Fungsi baru
export const canDeliverWithoutDriver = (user: RoleInput): boolean => {
  return hasAnyRole(user, ['owner', 'admin', 'kasir sales', 'kasir']);
};
```

---

### 2. Helper Muncul di Dropdown Supir

**File yang diubah**:
- `src/components/DeliveryFormContent.tsx`
- `src/components/DriverDeliveryDialog.tsx`
- `src/hooks/useDrivers.ts`

**Deskripsi**:
- Employee dengan role `helper` sekarang muncul di dropdown supir
- Label "(Helper)" ditambahkan untuk membedakan dari supir asli
- Berlaku untuk POS Kasir web dan POS Supir mobile

**Perubahan**:
```typescript
// Filter supir dan helper
employees?.filter(emp => ['supir', 'helper'].includes(emp.role?.toLowerCase()))

// Label helper
{emp.name}{emp.role?.toLowerCase() === 'helper' ? ' (Helper)' : ''}
```

---

### 3. Pembatasan Menu Helper di Mobile

**File yang diubah**:
- `src/components/layout/MobileLayout.tsx`

**Deskripsi**:
Role `helper` hanya dapat mengakses 3 menu di mobile:
1. POS Supir
2. Pelanggan Terdekat
3. Komisi Saya

**Perubahan**:
```typescript
const isHelper = user?.role?.toLowerCase() === 'helper'
const helperMenuItems = [
  { title: 'POS Supir', icon: Truck, path: '/driver-pos' },
  { title: 'Pelanggan Terdekat', icon: MapPin, path: '/customer-map' },
  { title: 'Komisi Saya', icon: Coins, path: '/my-commission' }
]
const menuItems = isHelper ? helperMenuItems : regularMenuItems
```

---

### 4. Branch Switching untuk Sales & Kasir

**File yang diubah**:
- `src/contexts/BranchContext.tsx`
- `src/components/layout/MobileLayout.tsx`

**Deskripsi**:
Role berikut sekarang dapat pindah cabang:
- `owner` (existing)
- `admin`
- `sales`
- `kasir`
- `kasir sales`

**Perubahan**:
```typescript
// src/contexts/BranchContext.tsx
const canAccessAllBranches = useMemo(() => {
  const role = user?.role?.toLowerCase();
  return isHeadOffice ||
         role === 'admin' ||
         role === 'sales' ||
         role === 'kasir' ||
         role === 'kasir sales';
}, [user?.role, isHeadOffice]);
```

---

### 5. PIN Per-User (Dipindahkan dari Settings)

**File yang diubah**:
- `src/pages/SettingsPage.tsx` - Hapus tab Security
- `src/contexts/AuthContext.tsx` - PIN dari profiles, bukan company_settings
- `src/components/PinValidationDialog.tsx` - Teks generic (bukan "Owner")
- `src/components/PinSetupDialog.tsx` - **NEW** Dialog untuk set PIN
- `src/pages/EmployeePage.tsx` - Tombol Set PIN di tabel karyawan

**Deskripsi**:
- Tab "Security" dihapus dari Settings
- PIN sekarang disimpan di kolom `pin` pada tabel `profiles`
- Setiap karyawan bisa memiliki PIN sendiri (diatur oleh Owner)
- Jika PIN tidak diset, validasi PIN di-bypass untuk user tersebut
- PIN validation tetap muncul setelah 3 menit idle (jika user punya PIN)

**Cara kerja**:
1. Owner buka halaman Karyawan
2. Klik icon Shield pada baris karyawan
3. Set PIN 4-6 digit
4. Karyawan akan diminta PIN setelah 3 menit idle

**Perubahan kode**:
```typescript
// AuthContext.tsx - Fetch PIN dari profiles
const fetchUserPin = useCallback(async (userId: string) => {
  const { data } = await supabase
    .from('profiles')
    .select('pin')
    .eq('id', userId)
    .limit(1);
  // ...
}, []);

// PIN validation untuk SEMUA user yang punya PIN (bukan hanya owner)
if (ownerPin) {
  pinValidationTimerRef.current = setTimeout(() => {
    setPinRequired(true);
  }, PIN_VALIDATION_INTERVAL_MS);
}
```

---

### 6. Deprecation: products.current_stock

**File yang diubah**:
- `src/hooks/useDeliveries.ts`

**Deskripsi**:
- `products.current_stock` DEPRECATED
- Stok sekarang dihitung dari `v_product_current_stock` (derived dari `inventory_batches`)
- Semua operasi stok (deduct/restore) hanya melalui FIFO functions

**Perubahan**:
```typescript
// SEBELUM (deprecated)
await supabase.from('products').update({ current_stock: newStock })

// SESUDAH (recommended)
await deductBatchFIFO(productId, quantity, branchId);
await restoreBatchFIFO(productId, quantity, branchId);
```

---

## File Migrasi Database

Jalankan migrasi berikut di VPS **secara berurutan**:

### Migration 005: Soft Delete Columns
**File**: `database/migrations/005_soft_delete_columns.sql`

Menambahkan kolom soft delete ke tabel:
- `transactions`: is_cancelled, cancelled_at, cancelled_by, cancel_reason
- `deliveries`: is_cancelled, cancelled_at, cancelled_by, cancel_reason
- `production_records`: is_cancelled, cancelled_at, cancelled_by, cancel_reason
- `expenses`: is_cancelled, cancelled_at, cancelled_by, cancel_reason
- `payment_history`: is_cancelled, cancelled_at, cancelled_by, cancel_reason

Indexes untuk filter:
- `idx_transactions_not_cancelled`
- `idx_deliveries_not_cancelled`
- `idx_production_not_cancelled`
- `idx_expenses_not_cancelled`

Functions:
- `cancel_transaction_v2(p_transaction_id, p_user_id, p_user_name, p_reason)`

---

### Migration 006: Journal Immutability
**File**: `database/migrations/006_journal_immutability.sql`

Trigger untuk mencegah update pada posted journal:
- `trigger_prevent_posted_journal_update`
- `trigger_prevent_posted_lines_update`

Functions:
- `prevent_posted_journal_update()`
- `prevent_posted_journal_lines_update()`
- `void_journal_by_reference(p_reference_id, p_reference_type, ...)`

---

### Migration 007: Material Stock FIFO
**File**: `database/migrations/007_material_stock_fifo.sql`

View dan functions untuk FIFO material:
- `v_material_current_stock` (view)
- `consume_material_fifo(...)`
- `restore_material_fifo(...)`

---

### Migration 008: Material FIFO Complete
**File**: `database/migrations/008_material_fifo_complete.sql`

Sistem FIFO lengkap untuk materials:
- Kolom `material_id` di `inventory_batches`
- Index `idx_inventory_batches_material_id`
- Index `idx_inventory_batches_material_fifo`

Views:
- `v_material_current_stock` (improved)

Functions:
- `consume_material_fifo_v2(...)` - consume material via FIFO
- `restore_material_fifo_v2(...)` - restore material dengan bikin batch baru
- `add_material_batch(...)` - tambah batch baru untuk pembelian
- `migrate_material_stock_to_batches()` - migrasi data existing ke batches

**PENTING**: Jalankan `SELECT * FROM migrate_material_stock_to_batches();` sekali setelah migrasi untuk seed data awal.

---

### Migration 009: PIN Per User
**File**: `database/migrations/009_pin_per_user.sql`

Memindahkan PIN dari company_settings ke profiles:
- Kolom `pin` di tabel `profiles`
- Index `idx_profiles_pin`
- Migrasi otomatis PIN existing ke owner pertama

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pin TEXT;
CREATE INDEX IF NOT EXISTS idx_profiles_pin ON profiles(id) WHERE pin IS NOT NULL;
```

---

## Langkah Deployment ke Production

### 1. Backup Database
```bash
pg_dump -h localhost -U postgres -d aquvit_prod > backup_$(date +%Y%m%d).sql
```

### 2. Jalankan Migrasi
```bash
psql -h localhost -U postgres -d aquvit_prod -f database/migrations/005_soft_delete_columns.sql
psql -h localhost -U postgres -d aquvit_prod -f database/migrations/006_journal_immutability.sql
psql -h localhost -U postgres -d aquvit_prod -f database/migrations/007_material_stock_fifo.sql
psql -h localhost -U postgres -d aquvit_prod -f database/migrations/008_material_fifo_complete.sql
psql -h localhost -U postgres -d aquvit_prod -f database/migrations/009_pin_per_user.sql
```

### 3. Migrasi Data Material ke Batches
```sql
-- Jalankan SEKALI untuk migrate existing stock
SELECT * FROM migrate_material_stock_to_batches();
```

### 4. Build & Deploy Frontend
```bash
npm run build
# Copy dist/ ke server
```

### 5. Restart Services
```bash
# Restart PostgREST
systemctl restart postgrest

# Atau jika pakai Docker
docker restart postgrest
```

---

## Catatan Penting

1. **Komisi Helper sebagai Supir**: Jika helper dipilih sebagai supir di delivery, komisi dihitung sebagai komisi supir (berdasarkan posisi field, bukan role).

2. **Branch Switching**: Semua role yang bisa switch branch akan melihat dropdown cabang di mobile sidebar.

3. **Stock FIFO**: Pastikan semua operasi stok menggunakan functions FIFO, bukan update langsung ke `current_stock`.

4. **Journal Immutability**: Setelah journal posted, tidak bisa diubah. Harus void dan buat baru.

---

## File yang Dimodifikasi (Summary)

```
.gitignore
scripts/auth-server/server.js
src/components/DeliveryFormContent.tsx
src/components/DriverDeliveryDialog.tsx
src/components/PinSetupDialog.tsx (NEW)
src/components/PinValidationDialog.tsx
src/components/ResetDatabaseDialog.tsx
src/components/layout/MobileLayout.tsx
src/contexts/AuthContext.tsx
src/contexts/BranchContext.tsx
src/hooks/useDeliveries.ts
src/hooks/useDrivers.ts
src/hooks/useProduction.ts
src/hooks/useProducts.ts
src/hooks/useTransactions.ts
src/hooks/useZakat.ts
src/integrations/supabase/client.ts
src/pages/EmployeePage.tsx
src/pages/SettingsPage.tsx
src/pages/WebManagementPage.tsx
src/services/backupRestoreService.ts
src/services/journalService.ts
src/services/materialMovementService.ts
src/services/materialStockService.ts
src/services/stockService.ts
src/types/zakat.ts
src/utils/financialStatementsUtils.ts
src/utils/idGenerator.ts
src/utils/roleUtils.ts
```

---

## Database Migrations (New Files)

```
database/migrations/005_soft_delete_columns.sql
database/migrations/006_journal_immutability.sql
database/migrations/007_material_stock_fifo.sql
database/migrations/008_material_fifo_complete.sql
database/migrations/009_pin_per_user.sql
```
