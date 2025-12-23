# AQUVIT ERP System

Sistem ERP (Enterprise Resource Planning) komprehensif untuk manajemen **Manufaktur & Distribusi Wholesale** dengan modul akuntansi terintegrasi, dirancang khusus untuk bisnis di Indonesia.

---

## Server & Deployment

| Server | IP | Domain | Lokasi |
|--------|-----|--------|--------|
| **Primary** | `103.197.190.54` | `app.aquvit.id` | Nabire |
| **Secondary** | `103.197.190.54` | `erp.aquvit.id` | Manokwari |

---

## Daftar Isi

- [Fitur Utama](#fitur-utama)
- [Tech Stack](#tech-stack)
- [Arsitektur Sistem](#arsitektur-sistem)
- [Struktur Direktori](#struktur-direktori)
- [Hooks & State Management](#hooks--state-management)
- [Contexts](#contexts)
- [Services](#services)
- [Sistem Akuntansi](#sistem-akuntansi)
- [Alur Bisnis](#alur-bisnis)
- [Sistem Permission](#sistem-permission)
- [Struktur Database](#struktur-database)
- [API Reference](#api-reference)
- [Instalasi & Konfigurasi](#instalasi--konfigurasi)
- [Deployment](#deployment)

---

## Fitur Utama

### 1. Point of Sale (POS)
- Manajemen transaksi penjualan
- Multi-metode pembayaran (Cash, Transfer, Kredit)
- Perhitungan PPN otomatis (11%)
- Cetak struk/invoice PDF
- Driver POS untuk penjualan di lapangan
- Bonus item dengan pencatatan akuntansi otomatis

### 2. Manajemen Produksi (Manufacturing)
- Resep produk dengan Bill of Materials (BOM)
- Konsumsi bahan baku otomatis
- Tracking batch produksi
- Kalkulasi HPP (Harga Pokok Produksi)

### 3. Distribusi & Pengiriman
- Manajemen armada kendaraan
- Tracking status pengiriman real-time
- Pengurangan stok otomatis saat delivery
- Perhitungan komisi driver & helper
- Retasi (retur) management

### 4. Inventory Management
- Stock multi-gudang per cabang
- Pergerakan stok real-time
- FIFO valuation
- Stock opname & adjustment
- Material stock movements

### 5. HR & Payroll
- Database karyawan lengkap
- Perhitungan gaji otomatis (bulanan/harian)
- Manajemen kasbon/advance karyawan
- Sistem komisi berbasis performa
- Absensi karyawan

### 6. Akuntansi & Keuangan
- Chart of Accounts (CoA) standar Indonesia
- Double-entry bookkeeping otomatis
- Laporan Keuangan:
  - Neraca (Balance Sheet)
  - Laporan Laba Rugi (Income Statement)
  - Laporan Arus Kas (Cash Flow Statement)
- Manajemen Piutang & Hutang
- Perhitungan Zakat

### 7. Multi-Branch Support
- Operasi multi-cabang
- Saldo terpisah per cabang (COA global, balance per branch)
- Switch branch untuk owner/admin
- Laporan konsolidasi

---

## Tech Stack

| Layer | Teknologi |
|-------|-----------|
| **Frontend** | React 18.3 + TypeScript + Vite |
| **UI Framework** | Shadcn UI (Radix UI) + Tailwind CSS |
| **State Management** | React Query (@tanstack/react-query) |
| **Routing** | React Router DOM v6 |
| **Backend** | PostgreSQL 14 + PostgREST API |
| **API Client** | Supabase-JS (adapted for PostgREST) |
| **Authentication** | Custom JWT (PostgREST Auth) |
| **Mobile** | Capacitor 8 (Android APK) |
| **PDF Generation** | jsPDF + jspdf-autotable |
| **Charts** | Recharts |
| **Excel Export** | SheetJS (xlsx) |

---

## Arsitektur Sistem

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  Web Browser │  │  Android APK │  │  Progressive Web App │   │
│  │   (Vite)     │  │ (Capacitor)  │  │       (PWA)          │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API GATEWAY LAYER                           │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    PostgREST API                          │   │
│  │         https://app.aquvit.id (Nabire Server)             │   │
│  │         https://erp.aquvit.id (Manokwari Server)          │   │
│  │                  IP: 103.197.190.54                       │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DATABASE LAYER                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              PostgreSQL 14 Database                       │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────────────┐    │   │
│  │  │ Accounting │ │ Inventory  │ │  HR & Payroll      │    │   │
│  │  │   Tables   │ │   Tables   │ │     Tables         │    │   │
│  │  └────────────┘ └────────────┘ └────────────────────┘    │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      FILE STORAGE                                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Upload Server (Express.js)                   │   │
│  │         /uploads/customers/ - Foto pelanggan              │   │
│  │         /uploads/products/  - Foto produk                 │   │
│  │         /uploads/employees/ - Foto karyawan               │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Struktur Direktori

```
src/
├── components/          # Komponen UI React (Dialogs, Forms, Tables)
├── pages/               # Halaman aplikasi (50+ pages)
├── hooks/               # Custom React hooks (50 files)
├── contexts/            # React Context providers
│   ├── AuthContext.tsx      # Autentikasi & session
│   ├── BranchContext.tsx    # Multi-branch management
│   └── PerformanceContext.tsx
├── services/            # Business logic services
│   ├── accountLookupService.ts  # Mapping akun CoA
│   ├── stockService.ts          # Proses stok transaksi
│   ├── materialStockService.ts  # Stok bahan baku
│   ├── pricingService.ts        # Kalkulasi harga
│   ├── photoUploadService.ts    # Upload foto
│   └── rolePermissionService.ts # Manajemen permission
├── types/               # TypeScript type definitions
├── utils/               # Utility functions
├── integrations/        # External integrations
│   └── supabase/
│       ├── client.ts        # PostgREST client
│       └── postgrestAuth.ts # Custom JWT auth
├── lib/                 # Shared libraries
├── styles/              # Global styles
└── App.tsx              # Main app component
```

---

## Hooks & State Management

### Transaksi & Penjualan

| Hook | Fungsi |
|------|--------|
| `useTransactions` | CRUD transaksi + double-entry accounting otomatis |
| `useTransactionById` | Get single transaction by ID |
| `useTransactionsByCustomer` | Transaksi per pelanggan |

**Fitur useTransactions:**
- Auto-create journal entries (Kas, Piutang, Pendapatan, HPP)
- Stock movement processing
- Sales commission generation
- Bonus item accounting (Beban Promosi)
- Rollback accounting on delete

### Akuntansi & Keuangan

| Hook | Fungsi |
|------|--------|
| `useAccounts` | Chart of Accounts CRUD + balance per branch |
| `useCashBalance` | Saldo kas real-time |
| `useCashFlow` | Arus kas & mutasi |
| `useAccountsPayable` | Hutang usaha |
| `useExpenses` | Pengeluaran + double-entry |
| `useZakat` | Perhitungan zakat |

**Perhitungan Saldo Akun:**
```
Saldo = initial_balance + Σ(cash_history movements per branch)
```
- `transaction_type='income'` → menambah saldo
- `transaction_type='expense'` → mengurangi saldo

### Pengiriman & Delivery

| Hook | Fungsi |
|------|--------|
| `useDeliveries` | Manajemen pengiriman |
| `useDeliveryEmployees` | Driver & helper list |
| `useTransactionsReadyForDelivery` | Transaksi siap kirim |
| `useRetasi` | Retur/retasi management |

**Fitur:**
- Stock reduction on delivery
- Partial delivery tracking
- Delivery summary per transaction
- Photo upload untuk bukti kirim

### HR & Payroll

| Hook | Fungsi |
|------|--------|
| `usePayroll` | Kalkulasi & proses gaji |
| `useEmployees` | CRUD karyawan |
| `useEmployeeAdvances` | Kasbon/panjar karyawan |
| `useAttendance` | Absensi |
| `useCommissions` | Komisi sales/driver |

**Tipe Payroll:**
- `monthly` - Gaji bulanan
- `daily` - Gaji harian

**Tipe Komisi:**
- `none` - Tanpa komisi
- `sales` - Komisi penjualan
- `delivery` - Komisi pengiriman

### Inventory & Produksi

| Hook | Fungsi |
|------|--------|
| `useProducts` | Master produk |
| `useMaterials` | Master bahan baku |
| `useMaterialMovements` | Pergerakan bahan |
| `useStockMovements` | Pergerakan stok produk |
| `useProduction` | Batch produksi |
| `usePricing` | Kalkulasi harga |

### Master Data

| Hook | Fungsi |
|------|--------|
| `useCustomers` | CRUD pelanggan |
| `useSuppliers` | CRUD supplier |
| `useBranches` | CRUD cabang |
| `useCompanies` | CRUD perusahaan |
| `useAssets` | Aset tetap |
| `useMaintenance` | Pemeliharaan aset |

### Sistem & Permission

| Hook | Fungsi |
|------|--------|
| `usePermissions` | Role-based access control |
| `useGranularPermission` | Permission granular per fitur |
| `useRoles` | CRUD roles |
| `useAuth` | Autentikasi |
| `useUsers` | User management |

---

## Contexts

### AuthContext
Mengelola autentikasi dan session user.

```typescript
interface AuthContextType {
  session: Session | null;
  user: Employee | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}
```

**Fitur:**
- PostgREST mode dengan custom JWT
- Profile caching (15 menit)
- Auto-refresh token
- Fallback to auth data jika DB timeout

### BranchContext
Mengelola multi-branch operation.

```typescript
interface BranchContextType {
  currentBranch: Branch | null;
  availableBranches: Branch[];
  currentCompany: Company | null;
  isHeadOffice: boolean;
  canAccessAllBranches: boolean;
  switchBranch: (branchId: string) => void;
  refreshBranches: () => Promise<void>;
  loading: boolean;
}
```

**Fitur:**
- Branch selection persistence (localStorage)
- Auto-refresh page on branch switch
- Role-based branch access (owner/admin dapat switch)
- Company info per branch

---

## Services

### accountLookupService
Mapping akun berdasarkan nama/tipe untuk fleksibilitas CoA.

```typescript
type AccountLookupType =
  | 'KAS_BESAR' | 'KAS_KECIL' | 'BANK'
  | 'PIUTANG_USAHA' | 'PIUTANG_KARYAWAN'
  | 'PERSEDIAAN_BAHAN' | 'PERSEDIAAN_PRODUK'
  | 'HUTANG_USAHA' | 'HUTANG_GAJI'
  | 'PENDAPATAN_PENJUALAN' | 'HPP' | 'BEBAN_GAJI'
  // ... dll
```

### stockService
Proses pergerakan stok saat transaksi.

```typescript
StockService.processTransactionStock(
  transactionId: string,
  items: TransactionItem[],
  userId: string,
  userName: string
)
```

### materialStockService
Proses pergerakan stok bahan baku.

### pricingService
Kalkulasi harga dengan berbagai faktor:
- Base price
- Customer category discount
- Quantity discount
- Special pricing

### photoUploadService
Upload foto ke server dengan resize otomatis.

```typescript
PhotoUploadService.uploadCustomerPhoto(file: File, customerId: string)
PhotoUploadService.uploadProductPhoto(file: File, productId: string)
PhotoUploadService.uploadEmployeePhoto(file: File, employeeId: string)
```

### rolePermissionService
CRUD role permissions dari database.

---

## Sistem Akuntansi

### Chart of Accounts (Bagan Akun Standar)

Struktur CoA 4-level dengan kode akun 4 digit:

```
Level 1: Header (1000, 2000, 3000, 4000, 5000, 6000)
Level 2: Sub-header (1100, 1200, 1300...)
Level 3: Detail (1110, 1120, 1130...)
Level 4: Sub-detail (1111, 1112, 1113...)
```

#### Struktur Akun Lengkap

```
1000 - ASET
├── 1100 - Kas dan Setara Kas
│   ├── 1110 - Kas Besar
│   ├── 1111 - Kas Kecil
│   ├── 1112 - Bank BCA
│   └── 1113 - Bank Mandiri
├── 1200 - Piutang
│   ├── 1210 - Piutang Usaha
│   └── 1220 - Piutang Karyawan (Kasbon)
├── 1300 - Persediaan
│   ├── 1310 - Persediaan Bahan Baku
│   └── 1320 - Persediaan Barang Jadi
└── 1400 - Aset Tetap
    ├── 1410 - Peralatan
    ├── 1411 - Akumulasi Penyusutan Peralatan
    ├── 1420 - Kendaraan
    └── 1421 - Akumulasi Penyusutan Kendaraan

2000 - KEWAJIBAN
├── 2100 - Kewajiban Lancar
│   ├── 2110 - Hutang Usaha
│   ├── 2120 - Hutang Gaji
│   └── 2130 - Hutang Pajak

3000 - MODAL
├── 3100 - Modal Pemilik
├── 3200 - Laba Ditahan
└── 3300 - Prive

4000 - PENDAPATAN
├── 4100 - Pendapatan Penjualan
├── 4200 - Pendapatan Jasa
└── 4300 - Pendapatan Lain-lain

5000 - HARGA POKOK PENJUALAN (HPP)
├── 5100 - HPP Bahan Baku
├── 5200 - HPP Tenaga Kerja Langsung
└── 5300 - HPP Overhead Pabrik

6000 - BEBAN OPERASIONAL
├── 6100 - Beban Penjualan
│   ├── 6110 - Beban Pengiriman
│   ├── 6120 - Beban Komisi Penjualan
│   └── 6150 - Beban Promosi
└── 6200 - Beban Umum & Administrasi
    ├── 6210 - Beban Gaji
    ├── 6220 - Beban Listrik & Air
    ├── 6230 - Beban Telepon & Internet
    └── 6240 - Beban Penyusutan
```

### Double-Entry Bookkeeping Otomatis

Setiap transaksi otomatis mencatat jurnal double-entry:

#### Penjualan Tunai

```
┌────────────────────────┬──────────────┬──────────────┐
│ Akun                   │ Debit        │ Kredit       │
├────────────────────────┼──────────────┼──────────────┤
│ 1110 - Kas Besar       │ 1.000.000    │              │
│ 4100 - Pendapatan      │              │ 1.000.000    │
│ 5100 - HPP             │   700.000    │              │
│ 1320 - Persediaan      │              │   700.000    │
└────────────────────────┴──────────────┴──────────────┘
```

#### Penjualan Kredit

```
┌────────────────────────┬──────────────┬──────────────┐
│ Akun                   │ Debit        │ Kredit       │
├────────────────────────┼──────────────┼──────────────┤
│ 1210 - Piutang Usaha   │ 5.000.000    │              │
│ 4100 - Pendapatan      │              │ 5.000.000    │
│ 5100 - HPP             │ 3.500.000    │              │
│ 1320 - Persediaan      │              │ 3.500.000    │
└────────────────────────┴──────────────┴──────────────┘
```

#### Bonus/Promosi

```
┌────────────────────────┬──────────────┬──────────────┐
│ Akun                   │ Debit        │ Kredit       │
├────────────────────────┼──────────────┼──────────────┤
│ 6150 - Beban Promosi   │   100.000    │              │
│ 1400 - Persediaan      │              │   100.000    │
└────────────────────────┴──────────────┴──────────────┘
```

#### Pengeluaran

```
┌────────────────────────┬──────────────┬──────────────┐
│ Akun                   │ Debit        │ Kredit       │
├────────────────────────┼──────────────┼──────────────┤
│ 6210 - Beban Gaji      │ 5.000.000    │              │
│ 1110 - Kas Besar       │              │ 5.000.000    │
└────────────────────────┴──────────────┴──────────────┘
```

#### Kasbon Karyawan

```
┌────────────────────────┬──────────────┬──────────────┐
│ Akun                   │ Debit        │ Kredit       │
├────────────────────────┼──────────────┼──────────────┤
│ 1220 - Piutang Karyawan│ 1.000.000    │              │
│ 1110 - Kas Besar       │              │ 1.000.000    │
└────────────────────────┴──────────────┴──────────────┘
```

### Perhitungan Saldo Akun

```
Saldo Akun = Initial Balance + Σ(Cash History Movements per Branch)
```

**cash_history.transaction_type:**
- `income` → menambah saldo akun
- `expense` → mengurangi saldo akun

**Contoh Kasbon:**
- Piutang Karyawan: type='panjar_pengambilan', transaction_type='income' → +saldo
- Kas: type='panjar_pengambilan', transaction_type='expense' → -saldo

---

## Alur Bisnis

### 1. Alur Penjualan (POS)

```
Order Masuk
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ useTransactions.addTransaction()                    │
│  • Insert transaction record                        │
│  • Process stock movements (StockService)           │
│  • Generate sales commission                        │
│  • Record cash_history (if paid)                    │
│  • Update Pendapatan (4100) - Credit                │
│  • Update HPP (5100) - Debit                        │
│  • Update Persediaan (1320) - Credit                │
│  • Update Piutang (1210) - Debit (if kredit)        │
│  • Process bonus items → Beban Promosi (6150)       │
└─────────────────────────────────────────────────────┘
    │
    ▼
Status: "Pesanan Masuk"
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ Delivery Process (useDeliveries)                    │
│  • Assign driver & helper                           │
│  • Create delivery record                           │
│  • Reduce product stock                             │
│  • Upload delivery photo                            │
│  • Generate driver/helper commission                │
└─────────────────────────────────────────────────────┘
    │
    ▼
Status: "Terkirim" / "Diantar Sebagian"
```

### 2. Alur Pengeluaran

```
Input Expense
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ useExpenses.addExpense()                            │
│  • Insert expense record                            │
│  • Update Kas (1110) - Credit (kurang)              │
│  • Update Akun Beban (6xxx) - Debit (tambah)        │
│  • Record cash_history                              │
└─────────────────────────────────────────────────────┘
```

### 3. Alur Payroll

```
Periode Gaji
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ usePayroll.calculatePayroll()                       │
│  • Get base salary from employee_salaries           │
│  • Calculate commission (if applicable)             │
│  • Get outstanding advances (kasbon)                │
│  • Calculate gross & net salary                     │
│  • Create payroll_record                            │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ usePayroll.processPayroll()                         │
│  • Update payroll status to 'paid'                  │
│  • Deduct kasbon from employee_advances             │
│  • Update Beban Gaji (6210) - Debit                 │
│  • Update Kas (1110) - Credit                       │
│  • Record cash_history                              │
└─────────────────────────────────────────────────────┘
```

### 4. Alur Kasbon Karyawan

```
Pengambilan Kasbon
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ useEmployeeAdvances.addAdvance()                    │
│  • Insert employee_advances record                  │
│  • Update Piutang Karyawan (1220) - Debit           │
│  • Update Kas (1110) - Credit                       │
│  • Record cash_history (type: panjar_pengambilan)   │
└─────────────────────────────────────────────────────┘
    │
    ▼
Potong di Gaji
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ Payroll Processing                                  │
│  • Deduct from net salary                           │
│  • Update advance status to 'paid'                  │
│  • Update Piutang Karyawan (1220) - Credit          │
└─────────────────────────────────────────────────────┘
```

---

## Sistem Permission

### User Roles

| Role | Deskripsi | Akses |
|------|-----------|-------|
| `owner` | Pemilik usaha | Full access semua fitur |
| `admin` | Administrator | Semua kecuali role management |
| `cashier` | Kasir | POS, transaksi penjualan |
| `supir` | Driver pengiriman | Driver POS, delivery tracking |
| `helper` | Helper pengiriman | Delivery assistant |
| `warehouse` | Gudang | Inventory management |

### Granular Permissions

```typescript
// Core Data Access
products_view, products_create, products_edit, products_delete
materials_view, materials_create, materials_edit
transactions_view, transactions_create
customers_view, customers_create, customers_edit
employees_view, employees_create, employees_edit

// POS Access
pos_access          // Kasir POS
pos_driver_access   // Driver POS

// Financial
accounts_view, accounts_edit
receivables_view, receivables_manage
expenses_view, expenses_create
advances_view, advances_create
payables_view, payables_manage
cash_flow_view
financial_reports

// Reports
stock_reports
transaction_reports
attendance_reports
production_reports
material_movement_report
transaction_items_report

// System
settings_access
role_management
```

### Permission Mapping

```typescript
// Simplified permission check
const userPermissions = {
  products: granularPerms.products_view === true,
  transactions: granularPerms.pos_access || granularPerms.transactions_view,
  deliveries: granularPerms.pos_driver_access || granularPerms.delivery_view,
  financial: granularPerms.accounts_view || granularPerms.receivables_view,
  // ... etc
}
```

---

## Struktur Database

### Tabel Utama

#### 1. Akuntansi & Keuangan

| Tabel | Deskripsi |
|-------|-----------|
| `accounts` | Chart of Accounts (CoA) - Bagan Akun Standar |
| `cash_history` | Riwayat mutasi kas per akun per cabang |
| `manual_journal_entries` | Header jurnal umum manual |
| `manual_journal_entry_lines` | Detail baris jurnal (debit/kredit) |
| `accounts_payable` | Hutang usaha ke supplier |
| `payment_history` | Riwayat pembayaran piutang |
| `expenses` | Pengeluaran operasional |

#### 2. Transaksi & Penjualan

| Tabel | Deskripsi |
|-------|-----------|
| `transactions` | Transaksi penjualan/order |
| `transaction_items` | Detail item per transaksi (embedded in JSON) |
| `customers` | Data pelanggan |
| `customer_categories` | Kategori pelanggan |
| `quotations` | Penawaran harga |

#### 3. Pengiriman

| Tabel | Deskripsi |
|-------|-----------|
| `deliveries` | Header pengiriman |
| `delivery_items` | Detail item pengiriman |

#### 4. Inventory & Produksi

| Tabel | Deskripsi |
|-------|-----------|
| `products` | Master produk jadi |
| `materials` | Master bahan baku |
| `product_recipes` | Resep/BOM produk |
| `material_stock_movements` | Pergerakan stok bahan |
| `production_batches` | Batch produksi |

#### 5. HR & Payroll

| Tabel | Deskripsi |
|-------|-----------|
| `profiles` | Data user/karyawan |
| `employees` | Data karyawan (legacy) |
| `employee_salaries` | Konfigurasi gaji |
| `employee_salary_summary` | View ringkasan gaji |
| `employee_advances` | Kasbon/pinjaman karyawan |
| `payroll_records` | Rekaman penggajian |
| `attendance` | Absensi karyawan |
| `commission_entries` | Entri komisi |

#### 6. Master Data

| Tabel | Deskripsi |
|-------|-----------|
| `branches` | Data cabang |
| `companies` | Data perusahaan |
| `vehicles` | Armada kendaraan |
| `assets` | Aset tetap perusahaan |
| `suppliers` | Data supplier |
| `role_permissions` | Permission per role |

---

## API Reference

### Base URL

```
Production: https://app.aquvit.id/rest/v1
```

### Authentication

Semua request membutuhkan header:

```http
Authorization: Bearer <jwt_token>
apikey: <anon_key>
Content-Type: application/json
```

### Endpoints Utama

#### Accounts (Chart of Accounts)

```http
GET    /accounts                      # List semua akun
GET    /accounts?code=eq.1110         # Get akun by code
GET    /accounts?order=code           # Sorted by code
POST   /accounts                      # Create akun baru
PATCH  /accounts?id=eq.xxx            # Update akun
DELETE /accounts?id=eq.xxx            # Delete akun
```

#### Transactions

```http
GET    /transactions                                    # List transaksi
GET    /transactions?branch_id=eq.xxx                   # Filter by branch
GET    /transactions?status=eq.Pesanan%20Masuk          # Filter by status
GET    /transactions?order=created_at.desc              # Order by date
POST   /transactions                                    # Create transaksi
PATCH  /transactions?id=eq.xxx                          # Update transaksi
DELETE /transactions?id=eq.xxx                          # Delete transaksi
```

#### Cash History

```http
GET    /cash_history?account_id=eq.xxx&branch_id=eq.xxx
GET    /cash_history?type=eq.orderan
POST   /cash_history                    # Record mutasi
```

#### Deliveries

```http
GET    /deliveries?transaction_id=eq.xxx
GET    /deliveries?select=*,items:delivery_items(*),driver:profiles!driver_id(*)
POST   /deliveries
DELETE /deliveries?id=eq.xxx
```

#### Employees & Payroll

```http
GET    /profiles?role=in.(supir,helper)
GET    /employee_salary_summary
GET    /payroll_records?period_year=eq.2024&period_month=eq.12
POST   /payroll_records
PATCH  /payroll_records?id=eq.xxx
```

### RPC Functions

```http
POST /rpc/get_account_balance_analysis
POST /rpc/get_account_balance_with_children
POST /rpc/pay_receivable_with_history
POST /rpc/calculate_payroll_with_advances
POST /rpc/deduct_materials_for_transaction
POST /rpc/generate_journal_number
```

---

## Instalasi & Konfigurasi

### Prerequisites

- Node.js 18+
- npm atau yarn
- PostgreSQL 14+
- Android Studio (untuk build APK)

### Langkah Instalasi

```bash
# 1. Clone repository
git clone https://github.com/your-org/aquvit-erp.git
cd aquvit-erp

# 2. Install dependencies
npm install

# 3. Setup environment variables
cp .env.example .env.local
# Edit .env.local dengan konfigurasi yang sesuai

# 4. Jalankan development server
npm run dev

# 5. Build untuk production
npm run build
```

### Environment Variables

```env
# Database
VITE_SUPABASE_URL=https://app.aquvit.id
VITE_SUPABASE_ANON_KEY=your_anon_key

# Upload Server
UPLOAD_SERVER_URL=https://app.aquvit.id/uploads
```

### Server Configuration (client.ts)

```typescript
// Server configurations
const SERVERS: Record<string, string> = {
  'nabire': 'https://app.aquvit.id',
  'manokwari': 'https://erp.aquvit.id',
};

// Selection logic:
// - Web browser: uses current origin
// - APK/Capacitor: user selects from localStorage
// - Development: defaults to app.aquvit.id
```

### Build APK Android

```bash
# 1. Sync Capacitor
npx cap sync android

# 2. Buka Android Studio
npx cap open android

# 3. Build APK via command line
cd android
./gradlew assembleDebug

# Output: android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Deployment

### Server Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 2 Core | 4 Core |
| RAM | 4 GB | 8 GB |
| Storage | 50 GB SSD | 100 GB SSD |
| OS | Ubuntu 20.04+ | Ubuntu 22.04 |

### Stack Deployment

```bash
# 1. Install PostgreSQL
sudo apt install postgresql-14

# 2. Install PostgREST
wget https://github.com/PostgREST/postgrest/releases/download/v12.0.2/postgrest-v12.0.2-linux-static-x64.tar.xz
tar xJf postgrest-v12.0.2-linux-static-x64.tar.xz

# 3. Configure PostgREST
cat > postgrest.conf << EOF
db-uri = "postgres://authenticator:password@localhost:5432/aquvit"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "your-256-bit-secret"
EOF

# 4. Install Nginx
sudo apt install nginx

# 5. Configure SSL dengan Certbot
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d app.aquvit.id
```

### Struktur Direktori Server

```
/var/www/aquvit/
├── dist/                 # Built frontend files
├── uploads/              # Uploaded files
│   ├── customers/
│   ├── products/
│   └── employees/
├── auth-server/          # Custom auth server
└── postgrest.conf        # PostgREST config
```

### Backup Database

```bash
# Backup harian
PGPASSWORD="Aquvit2024!" pg_dump -h 103.197.190.54 -U aquvit -d aquvit > backup_$(date +%Y%m%d).sql

# Restore
PGPASSWORD="Aquvit2024!" psql -h 103.197.190.54 -U aquvit -d aquvit < backup_20241222.sql
```

### Log Monitoring

```bash
# PostgREST logs
journalctl -u postgrest -f

# Nginx access logs
tail -f /var/log/nginx/access.log
```

---

## Query Optimization

Semua hooks menggunakan React Query dengan konfigurasi optimal:

```typescript
{
  staleTime: 5 * 60 * 1000,      // 5 menit data dianggap fresh
  gcTime: 10 * 60 * 1000,        // 10 menit cache
  refetchOnWindowFocus: false,   // Tidak refetch saat focus
  refetchOnReconnect: false,     // Tidak refetch saat reconnect
  retry: 1,                      // Retry sekali jika gagal
  retryDelay: 1000,              // Delay 1 detik
}
```

---

## License

Copyright 2024 Aquvit. All rights reserved.

---

## Support

- **Email**: support@aquvit.id
- **Website**: https://aquvit.id



Modul baru (misalnya: CRM, Notifikasi, Dashboard Analytics)
Integrasi pihak ketiga (WhatsApp, Payment Gateway)
Fitur mobile tambahan
2. Perbaikan/Enhancement
Optimasi performa
Perbaikan UI/UX
Bug fixes yang sudah diketahui
3. Laporan & Analytics
Laporan baru
Dashboard statistik
Export data tambahan
4. Sistem & Infrastruktur
Keamanan
Backup otomatis
Logging & monitoring target pembaharuan 




📊 ANALISIS AKUNTANSI - CASH FLOW PAGE
✅ Hal yang Sudah Benar:
Pemisahan Transfer dari Pendapatan/Pengeluaran
Kode dengan benar mengecualikan transfer antar akun dari perhitungan total income/expense (line 142-154 di useCashBalance.ts)
Transfer hanya memindahkan uang antar rekening, bukan menambah/mengurangi total kas
Konsep Payment Account
Menggunakan flag isPaymentAccount untuk memfilter akun kas/bank
Ini sesuai dengan pemisahan akun kas vs non-kas
Double-Entry pada General Ledger
GeneralLedgerTable.tsx menggunakan logika debit/kredit yang benar berdasarkan tipe akun
⚠️ MASALAH AKUNTANSI YANG DITEMUKAN:
1. Cash Flow ≠ Laporan Arus Kas (PSAK 2/IAS 7)
Masalah: Halaman ini sebenarnya adalah Buku Kas/Cash Ledger, bukan Laporan Arus Kas yang sebenarnya. Perbedaan:
Aspek	Sistem Saat Ini	Standar PSAK 2/IAS 7
Isi	Daftar transaksi kas	Ringkasan berdasarkan aktivitas
Kategori	Income vs Expense	Operating, Investing, Financing
Format	Kronologis	3 bagian aktivitas
Tujuan	Monitoring harian	Analisis sumber/penggunaan kas
Rekomendasi: Rename halaman ini menjadi "Buku Kas" atau "Kas Harian", dan buat halaman terpisah untuk Laporan Arus Kas yang sesuai PSAK 2.
2. Klasifikasi Transaksi Tidak Sesuai Standar
Masalah di useCashBalance.ts line 158-163:
// Income types saat ini
['orderan', 'kas_masuk_manual', 'panjar_pelunasan', 'pembayaran_piutang']

// Expense types saat ini  
['pengeluaran', 'panjar_pengambilan', 'pembayaran_po', 'kas_keluar_manual', 'gaji_karyawan']
Masalah Akuntansi:
pembayaran_piutang (pelunasan piutang dari pelanggan) BUKAN pendapatan - ini adalah konversi piutang ke kas
pembayaran_po (pembayaran ke supplier) BUKAN beban - ini bisa jadi pembelian aset/persediaan
Tidak ada pemisahan antara:
Aktivitas Operasional: penjualan, pembelian, gaji
Aktivitas Investasi: beli/jual aset tetap
Aktivitas Pendanaan: pinjaman, setoran modal
3. Perhitungan Saldo Awal Tidak Akuntabel
Masalah di line 192:
const totalPreviousBalance = totalBalance - todayNet;
Masalah: Saldo awal dihitung mundur dari saldo akhir dikurangi aktivitas hari ini. Ini adalah backward calculation yang tidak memiliki audit trail. Seharusnya:
Saldo awal = Saldo penutupan hari sebelumnya (tersimpan di database)
Ada proses tutup buku harian yang mencatat saldo penutupan
4. Tidak Ada Rekonsiliasi Bank
Sistem tidak memiliki mekanisme untuk:
Mencocokkan saldo buku dengan saldo bank
Mencatat transaksi in-transit
Menangani perbedaan pencatatan (outstanding check, deposit in transit)
5. Running Balance Per Transaksi Bermasalah
Di CashFlowTable.tsx line ~450:
const calculateRunningBalances = () => {
  let cumulativeBalance = previousDayBalance;
  // ...iterasi dan hitung running balance
}
Masalah:
Urutan transaksi berpengaruh pada running balance
Tidak ada timestamp yang presisi (bisa ada transaksi di detik yang sama)
Koreksi/pembatalan transaksi akan mengacaukan histori
6. Penghapusan Transaksi Tidak Sesuai Prinsip Akuntansi
Di CashFlowTable.tsx ada fungsi delete:
const handleDelete = async (record: CashFlowRecord) => {
  // Langsung menghapus record
}
PELANGGARAN SERIUS:
Prinsip akuntansi TIDAK MEMPERBOLEHKAN penghapusan transaksi yang sudah dicatat
Seharusnya menggunakan jurnal koreksi/reversal
Audit trail hilang jika transaksi dihapus
📋 REKOMENDASI PERBAIKAN:
Prioritas Tinggi:
Ganti Delete dengan Reversal/Void
// Bukan menghapus, tapi membuat jurnal balik
const handleVoid = async (record: CashFlowRecord) => {
  await createReversalEntry(record);
  await markAsVoided(record.id);
}
Pisahkan Halaman:
"Buku Kas" = Daftar transaksi harian (yang sekarang)
"Laporan Arus Kas" = Format PSAK 2 dengan 3 aktivitas
Tambah Klasifikasi Aktivitas:
type CashFlowActivity = 'operating' | 'investing' | 'financing';
Prioritas Menengah:
Implementasi Tutup Buku Harian
Simpan saldo penutupan setiap hari
Saldo awal = saldo penutupan kemarin
Audit Trail yang Lengkap
Setiap perubahan tercatat dengan user, timestamp, alasan
Tidak ada hard delete, hanya soft delete/void
Rekonsiliasi Bank
Fitur untuk mencocokkan saldo buku vs mutasi bank
📈 CONTOH LAPORAN ARUS KAS YANG BENAR (PSAK 2):
LAPORAN ARUS KAS
Periode: Desember 2024

ARUS KAS DARI AKTIVITAS OPERASI
  Penerimaan dari pelanggan          Rp XXX
  Pembayaran ke supplier            (Rp XXX)
  Pembayaran gaji karyawan          (Rp XXX)
  Pembayaran beban operasional      (Rp XXX)
  ─────────────────────────────────────────
  Kas Bersih dari Aktivitas Operasi  Rp XXX

ARUS KAS DARI AKTIVITAS INVESTASI
  Pembelian aset tetap              (Rp XXX)
  Penjualan aset tetap               Rp XXX
  ─────────────────────────────────────────
  Kas Bersih dari Aktivitas Investasi (Rp XXX)

ARUS KAS DARI AKTIVITAS PENDANAAN
  Penerimaan pinjaman                Rp XXX
  Pembayaran pinjaman               (Rp XXX)
  Setoran modal                      Rp XXX
  ─────────────────────────────────────────
  Kas Bersih dari Aktivitas Pendanaan Rp XXX

KENAIKAN/(PENURUNAN) BERSIH KAS      Rp XXX
Saldo Kas Awal Periode               Rp XXX
─────────────────────────────────────────────
SALDO KAS AKHIR PERIODE              Rp XXX
🎯 KESIMPULAN:
Aspek	Status	Keterangan
Pencatatan Transaksi	⚠️ Perlu Perbaikan	Delete harus diganti reversal
Klasifikasi Kas	❌ Tidak Sesuai	Belum ada Operating/Investing/Financing
Format Laporan	❌ Tidak Sesuai	Ini Buku Kas, bukan Laporan Arus Kas
Double-Entry	✅ Sudah Benar	Di General Ledger sudah benar
Audit Trail	⚠️ Lemah	Transaksi bisa dihapus
Rekonsiliasi	❌ Tidak Ada	Perlu ditambahkan
Skor Kepatuhan Akuntansi: 45/100 Apakah Anda ingin saya membantu memperbaiki salah satu masalah di atas?


---

## Sistem Jurnal Umum (Auto-Generate)

### Fitur Utama

Sistem jurnal umum dengan auto-generate jurnal otomatis dari berbagai transaksi:

| Sumber Transaksi | Jurnal yang Dibuat |
|------------------|-------------------|
| POS (Penjualan Tunai) | Dr. Kas, Cr. Pendapatan |
| POS (Penjualan Kredit) | Dr. Piutang, Cr. Pendapatan |
| Pengeluaran | Dr. Beban (sesuai kategori), Cr. Kas |
| Panjar Karyawan | Dr. Panjar Karyawan, Cr. Kas |
| Pelunasan Panjar | Dr. Kas, Cr. Panjar Karyawan |
| Gaji Karyawan | Dr. Beban Gaji, Cr. Kas, Cr. Panjar (jika ada potongan) |

### File yang Terlibat

| File | Fungsi |
|------|--------|
| `src/services/journalService.ts` | Service untuk auto-generate jurnal |
| `src/hooks/useJournalService.ts` | Hook wrapper dengan branch context |
| `src/hooks/useJournalEntries.ts` | CRUD hook untuk jurnal manual |
| `src/types/journal.ts` | Type definitions |
| `src/pages/JournalPage.tsx` | Halaman Jurnal Umum |
| `src/components/JournalEntryForm.tsx` | Form input jurnal manual |
| `src/components/JournalEntryTable.tsx` | Tabel list jurnal |

### Alur Jurnal Otomatis

```
Transaksi Input (POS/Expense/Panjar/Payroll)
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ Hook (useTransactions, useExpenses, dll)            │
│  • Simpan transaksi ke database                     │
│  • Panggil journalService.createXxxJournal()        │
│  • Auto-post jurnal dengan branch_id aktif          │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ journalService.ts                                    │
│  • Generate nomor jurnal (JE-2024-000001)           │
│  • Cari akun COA berdasarkan kode/nama              │
│  • Buat journal_entries + journal_entry_lines       │
│  • Update saldo akun jika autoPost=true             │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ Database                                             │
│  • journal_entries (header)                         │
│  • journal_entry_lines (detail debit/kredit)        │
│  • accounts.balance (updated)                       │
└─────────────────────────────────────────────────────┘
```

### Penggunaan di Hooks

```typescript
// Contoh di useExpenses.ts
import { createExpenseJournal } from '@/services/journalService';

// Setelah insert expense berhasil
if (currentBranch?.id) {
  await createExpenseJournal({
    expenseId: data.id,
    expenseDate: newExpenseData.date,
    amount: newExpenseData.amount,
    categoryName: newExpenseData.category,
    description: newExpenseData.description,
    branchId: currentBranch.id, // WAJIB: branch_id aktif
  });
}
```

### Database Schema Jurnal

```sql
-- Header Jurnal
CREATE TABLE journal_entries (
    id UUID PRIMARY KEY,
    entry_number TEXT NOT NULL UNIQUE,  -- JE-2024-000001
    entry_date DATE NOT NULL,
    description TEXT NOT NULL,
    reference_type TEXT,  -- 'transaction', 'expense', 'payroll', dll
    reference_id TEXT,    -- ID sumber transaksi
    status TEXT DEFAULT 'draft',  -- 'draft', 'posted', 'voided'
    total_debit NUMERIC(15,2),
    total_credit NUMERIC(15,2),
    branch_id UUID,  -- WAJIB untuk multi-branch
    is_voided BOOLEAN DEFAULT FALSE,
    void_reason TEXT,
    -- audit fields...
);

-- Detail Baris Jurnal
CREATE TABLE journal_entry_lines (
    id UUID PRIMARY KEY,
    journal_entry_id UUID REFERENCES journal_entries(id),
    line_number INTEGER,
    account_id TEXT REFERENCES accounts(id),
    account_code TEXT,
    account_name TEXT,
    debit_amount NUMERIC(15,2),
    credit_amount NUMERIC(15,2),
    description TEXT
);
```

### Catatan Penting

1. **branch_id WAJIB** - Setiap jurnal harus memiliki branch_id untuk pemisahan data multi-cabang
2. **Auto-post** - Jurnal dari transaksi otomatis langsung di-post (status='posted')
3. **Reference tracking** - Jurnal menyimpan reference_type dan reference_id untuk traceability
4. **Void, bukan Delete** - Jurnal yang sudah posted tidak boleh dihapus, hanya bisa di-void

### Halaman Jurnal Umum

Fitur halaman Jurnal Umum (`/journal`):

- **Buat Jurnal Manual** - Untuk penyesuaian, pembukaan, penutupan
- **Filter Status** - Semua, Draft, Posted, Void
- **Expand Detail** - Lihat baris debit/kredit per jurnal
- **Aksi**: Post (finalisasi), Void (batalkan), Delete (draft saja)

### Views Database

```sql
-- Buku Besar (General Ledger)
CREATE VIEW general_ledger AS
SELECT account_id, entry_date, debit_amount, credit_amount
FROM journal_entry_lines
JOIN journal_entries ON ...
WHERE status = 'posted' AND is_voided = FALSE;

-- Neraca Saldo (Trial Balance)
CREATE VIEW trial_balance AS
SELECT account_id, SUM(debit_amount), SUM(credit_amount)
FROM journal_entry_lines
JOIN journal_entries ON ...
WHERE status = 'posted' AND is_voided = FALSE
GROUP BY account_id;
```