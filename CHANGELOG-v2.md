# Changelog v2 - Aquvit Fix

**Tanggal**: 26 Desember 2024
**Versi**: 2.0.0

---

## Koneksi VPS

### Server Utama
| Konfigurasi | Nilai |
|-------------|-------|
| **VPS IP** | `103.197.190.54` |
| **Domain** | `nbx.aquvit.id` |
| **SSH User** | `deployer` |
| **SSH Key** | `Aquvit.pem` |

### Database
| Konfigurasi | Nilai |
|-------------|-------|
| **Database Name** | `aquvit_new` |
| **Database User** | `aquavit` |
| **Database Password** | `Aquvit2024` |
| **Database Host** | `127.0.0.1:5432` |

### Services (PM2)
| Service | Port | Database | Status |
|---------|------|----------|--------|
| `auth-server-new` | 3006 | aquvit_new | Active |
| `postgrest-aquvit` | 3005 | aquvit_new | Active |
| `upload-server` | 3001 | - | Active |

### Nginx Routing
```
nbx.aquvit.id/rest/v1/* → localhost:3005 (PostgREST)
nbx.aquvit.id/auth/*    → localhost:3006 (Auth Server)
nbx.aquvit.id/upload/*  → localhost:3001 (Upload Server)
```

---

## Perubahan dari v1

### 1. Database Baru (aquvit_new)
- **Sebelum**: Menggunakan `aquvit_db` yang menyebabkan PostgREST restart 2568+ kali
- **Sesudah**: Database baru `aquvit_new` dengan schema fresh dan stabil

### 2. Auth Server dengan Auto-Initialization
File: `scripts/auth-server/server.js`

Saat server pertama kali start pada database kosong, otomatis membuat:
- **1 Branch**: Kantor Pusat
- **7 System Roles**: owner, admin, supervisor, cashier, designer, operator, supir
- **7 Role Permissions**: Granular permissions per role
- **8 Company Settings**: name, address, phone, logo, latitude, longitude, radius, timezone
- **1 Admin Profile**: email=admin, password=admin, role=owner

### 3. Perbaikan Client Connection
File: `src/integrations/supabase/client.ts`

- Menghapus console.warn spam yang menyebabkan performance overhead
- Menggunakan simple token check tanpa verbose logging
- Mendukung 4 domain: nbx.aquvit.id, mkw.aquvit.id, app.aquvit.id, erp.aquvit.id

### 4. Permission Views
Grant SELECT permission untuk 7 views ke role authenticated/anon:
- `payroll_summary`
- `transaction_detail_report`
- `trial_balance`
- `employee_salary_summary`
- `dashboard_summary`
- `general_ledger`
- `transactions_with_customer`

### 5. Data Migration
- 20 Materials di-copy dari `aquvit_db` ke `aquvit_new`
- Termasuk: Galon, Pre foam, Karton, Label, Tutup, dll

### 6. Bug Fixes
- **Fixed**: Trigger `audit_profiles_trigger` error saat create user
- **Fixed**: Permission denied untuk views
- **Fixed**: PostgREST restart loop (2568+ kali → stabil)

---

## Struktur Koneksi

```
┌─────────────────────────────────────────────────────────────┐
│                     BROWSER / APK                           │
│                   https://nbx.aquvit.id                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                         NGINX                               │
│                   VPS: 103.197.190.54                       │
│                                                             │
│   /rest/v1/*  →  localhost:3005 (PostgREST)                │
│   /auth/*     →  localhost:3006 (Auth Server)              │
│   /upload/*   →  localhost:3001 (Upload Server)            │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   PostgREST     │ │   Auth Server   │ │  Upload Server  │
│   Port: 3005    │ │   Port: 3006    │ │   Port: 3001    │
│                 │ │                 │ │                 │
│ postgrest-aquvit│ │ auth-server-new │ │  upload-server  │
└─────────────────┘ └─────────────────┘ └─────────────────┘
          │                   │
          └─────────┬─────────┘
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                      PostgreSQL                             │
│                   Database: aquvit_new                      │
│                   User: aquavit                             │
│                   Port: 5432                                │
└─────────────────────────────────────────────────────────────┘
```

---

## Files yang Dimodifikasi

| File | Perubahan |
|------|-----------|
| `scripts/auth-server/server.js` | Auto-initialization, hapus audit trigger code |
| `src/integrations/supabase/client.ts` | Hapus console.warn, simple token check |

---

## Cara Deploy

### 1. Deploy Auth Server
```bash
scp -i Aquvit.pem scripts/auth-server/server.js deployer@103.197.190.54:/var/www/auth-server-new/
ssh -i Aquvit.pem deployer@103.197.190.54 "pm2 restart auth-server-new"
```

### 2. Deploy Frontend
```bash
npm run build
scp -i Aquvit.pem -r dist/* deployer@103.197.190.54:/var/www/aquvit/
```

### 3. Check Logs
```bash
ssh -i Aquvit.pem deployer@103.197.190.54 "pm2 logs auth-server-new --lines 20"
ssh -i Aquvit.pem deployer@103.197.190.54 "pm2 logs postgrest-aquvit --lines 20"
```

---

## Default Login

| Email | Password | Role |
|-------|----------|------|
| admin | admin | owner |
| owner@aquvit.id | owner123 | owner |

---

## Status Services

Untuk cek status semua services:
```bash
ssh -i Aquvit.pem deployer@103.197.190.54 "pm2 list"
```

Expected output:
```
│ auth-server-new     │ online │ 3006 │
│ postgrest-aquvit    │ online │ 3005 │
│ upload-server       │ online │ 3001 │
```

---

## Changelog - 26 Desember 2024 (Update 2)

### Commit: `830233c`

#### 1. POS Stock Validation
**File**: `src/components/PosForm.tsx`

- Produk dengan stok 0 di-disable (tidak bisa dipilih)
- Tampilan abu-abu dengan opacity rendah untuk produk habis
- Label merah "⚠️ Stok Habis" untuk produk tanpa stok
- Validasi saat add to cart:
  - Stok 0 → toast error "Stok Habis"
  - Qty melebihi stok → toast error "Stok Tidak Cukup"

#### 2. Auth Security - Migrasi dari localStorage ke sessionStorage + Memory
**Files**:
- `src/integrations/supabase/postgrestAuth.ts`
- `src/integrations/supabase/client.ts`
- `src/pages/WebManagementPage.tsx`

| Aspek | Sebelum (localStorage) | Sesudah (sessionStorage + memory) |
|-------|------------------------|-----------------------------------|
| Persistensi | Permanen | Hilang saat browser tutup |
| XSS Vulnerability | Tinggi | Lebih rendah |
| Page Refresh | Tetap login | Tetap login (via sessionStorage) |
| Tab Baru | Session shared | Session tidak shared |

#### 3. Sync Foto Pelanggan
**File**: `src/pages/CustomerPage.tsx`

- Tombol baru "Sync Foto" untuk mencocokkan foto dari VPS dengan pelanggan
- Matching berdasarkan nama pelanggan dalam filename
- Format filename: `{8char-uuid}{NamaPelanggan}.Foto Lokasi.{timestamp}.jpg`
- Update database `store_photo_url` otomatis

#### 4. PostgREST Compatibility Fix
**Files**: Semua hooks di `src/hooks/`

- Fix error `.limit(1)` tanpa `.order()` di PostgREST
- Semua query single record sekarang menggunakan `.order('id').limit(1)`
- Handle array response dari PostgREST

#### 5. Auth Server Auto-Initialization
**File**: `scripts/auth-server/server.js`

Saat database kosong, auto-create:
- 1 Branch (Kantor Pusat)
- 7 System Roles (owner, admin, supervisor, cashier, designer, operator, supir)
- 7 Role Permissions
- 8 Company Settings
- 1 Admin Profile (admin/admin dengan role owner)

---

### Files Modified (38 files)

| Category | Files |
|----------|-------|
| **Auth** | `client.ts`, `postgrestAuth.ts` |
| **Pages** | `CustomerPage.tsx`, `WebManagementPage.tsx` |
| **Components** | `PosForm.tsx` |
| **Hooks** | `useAccounts.ts`, `useAccountsPayable.ts`, `useAssets.ts`, `useAttendance.ts`, `useBranches.ts`, `useCommissions.ts`, `useCompanies.ts`, `useCustomers.ts`, `useDeliveries.ts`, `useEmployeeAdvances.ts`, `useEmployees.ts`, `useExpenses.ts`, `useJournalEntries.ts`, `useMaterialMovements.ts`, `useMaterials.ts`, `useOptimizedCommissions.ts`, `useOptimizedQuery.ts`, `usePayroll.ts`, `useProduction.ts`, `useProducts.ts`, `usePurchaseOrders.ts`, `useRetasi.ts`, `useRoles.ts`, `useSalesCommission.ts`, `useStockMovements.ts`, `useSuppliers.ts`, `useTransactions.ts` |
| **Services** | `journalService.ts`, `stockService.ts` |
| **Utils** | `productValidation.ts`, `simpleCashFlow.ts` |
| **Contexts** | `BranchContext.tsx` |
| **Server** | `scripts/auth-server/server.js` |

---

### SQL untuk Sync Foto Pelanggan

File SQL tersedia di: `sync-customer-photos.sql`

Cara menjalankan:
```bash
# SSH ke VPS
ssh deployer@103.197.190.54

# Jalankan SQL
PGPASSWORD='Aquvit2024' psql -U aquavit -d aquvit_db -f /tmp/sync-customer-photos.sql
```

Total: 579 foto akan di-match dengan nama pelanggan.

---

## Changelog - 27 Desember 2024 (Update 3)

### 1. HPP (Harga Pokok Penjualan) & FIFO Inventory

#### A. FIFO Inventory Consumption untuk Material
**File**: `database/consume_inventory_fifo.sql`

- Fungsi `consume_inventory_fifo` sekarang support `material_id` selain `product_id`
- Material otomatis punya batch tracking seperti produk
- Batch awal dibuat otomatis dari `price_per_unit` material yang ada stok

#### B. HPP Journal Lines untuk Penjualan
**Jurnal otomatis saat penjualan:**
```
Dr. 5100 - Harga Pokok Produk     xxx
  Cr. 1310 - Persediaan Barang Dagang    xxx
```

- HPP dihitung dari `cost_price` produk × quantity
- Transaksi lama sudah di-update dengan HPP journal lines

### 2. Fix `.single()` → `.order().limit(1)` untuk PostgREST

**Masalah**: Client kita force `Accept: application/json`, tapi `.single()` butuh `application/vnd.pgrst.object+json`

**Solusi**: Ganti semua `.single()` dengan `.order('id').limit(1)` + array extraction

**Files yang diperbaiki (13 files):**

| File | Lokasi |
|------|--------|
| `src/utils/syncCashFlow.ts` | getKasKecilAccount |
| `src/utils/financialIntegration.ts` | getAccountById |
| `src/utils/simpleCashFlow.ts` | insert cash_history |
| `src/services/pricingService.ts` | getProductPricing, createStockPricing, createBonusPricing, createCustomerPricing, updateCustomerPricing, getCustomerProductPrice |
| `src/services/materialStockService.ts` | getMaterialStock |
| `src/services/materialMovementService.ts` | getTransaction |
| `src/contexts/AuthContext.tsx` | getProfile |
| `src/components/BOMManagement.tsx` | addBOMItem |
| `src/components/CashFlowTable.tsx` | getJournalLine |
| `src/pages/LoginPage.tsx` | getProfileByUsername |
| `src/components/PayReceivableDialog.tsx` | insertCashHistory |
| `src/components/PayrollHistoryTable.tsx` | getPayrollDetail |
| `src/components/ReceiveGoodsTab.tsx` | getPurchaseOrder |
| `src/components/UserPermissionTab.tsx` | getUserRole |

### 3. Transfer Antar Kas - Sudah Terintegrasi Jurnal

**File**: `src/services/journalService.ts` - `createTransferJournal()`

Saat transfer antar akun (kas ke kas, kas ke bank, dll):
```
Dr. Akun Tujuan     xxx
  Cr. Akun Asal          xxx
```

**Reference type**: `'transfer'`

---

### Files Modified

| Category | Files |
|----------|-------|
| **Database** | `consume_inventory_fifo.sql` |
| **Utils** | `syncCashFlow.ts`, `financialIntegration.ts`, `simpleCashFlow.ts` |
| **Services** | `pricingService.ts`, `materialStockService.ts`, `materialMovementService.ts` |
| **Contexts** | `AuthContext.tsx` |
| **Components** | `BOMManagement.tsx`, `CashFlowTable.tsx`, `PayReceivableDialog.tsx`, `PayrollHistoryTable.tsx`, `ReceiveGoodsTab.tsx`, `UserPermissionTab.tsx` |
| **Pages** | `LoginPage.tsx` |
