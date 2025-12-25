# AQUVIT ERP System

**Dibuat oleh: Mutashim Zakiy | © 2025**

Sistem ERP (Enterprise Resource Planning) komprehensif untuk manajemen **Manufaktur & Distribusi Wholesale** dengan modul akuntansi terintegrasi, dirancang khusus untuk bisnis di Indonesia.

---

## Server & Deployment

| Server | IP | Domain | Database | Lokasi |
|--------|-----|--------|----------|--------|
| **Primary** | `103.197.190.54` | `nbx.aquvit.id` | `aquvit_db` | Nabire |
| **Secondary** | `103.197.190.54` | `mkw.aquvit.id` | `aquavit_manokwari` | Manokwari |

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
│  │         https://nbx.aquvit.id (Nabire Server)             │   │
│  │         https://mkw.aquvit.id (Manokwari Server)          │   │
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
Production: https://nbx.aquvit.id/rest/v1
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
VITE_SUPABASE_URL=https://nbx.aquvit.id
VITE_SUPABASE_ANON_KEY=your_anon_key

# Upload Server
UPLOAD_SERVER_URL=https://nbx.aquvit.id/uploads
```

### Server Configuration (client.ts)

```typescript
// Server configurations
const SERVERS: Record<string, string> = {
  'nabire': 'https://nbx.aquvit.id',
  'manokwari': 'https://mkw.aquvit.id',
};

// Selection logic:
// - Web browser: uses current origin
// - APK/Capacitor: user selects from localStorage
// - Development: defaults to nbx.aquvit.id
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
sudo certbot --nginx -d nbx.aquvit.id
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

---

## Changelog

### 2024-12-25 - Perbaikan Sistem Komisi & Payroll

#### 🔧 Bug Fixes

1. **Pemotongan Panjar Tidak Update Saldo Panjar Karyawan**
   - File: `src/hooks/usePayroll.ts`
   - Sebelumnya: Ketika payroll dibuat dengan pemotongan panjar, `employee_advances.remaining_amount` tidak diupdate
   - Sesudah: Menggunakan metode FIFO untuk mengurangi saldo panjar dari advance terlama
   - Logika: Loop melalui semua panjar aktif (remaining_amount > 0) terurut dari tanggal terlama, kurangi hingga total deduction terpenuhi

2. **Komisi Tidak Terhitung saat Hitung Gaji**
   - File: Database function `calculate_commission_for_period` & `calculate_payroll_with_advances`
   - Sebelumnya: RPC function mengharuskan `commission_rate > 0` di salary config untuk menghitung komisi
   - Sesudah: Komisi selalu dihitung dari tabel `commission_entries` untuk tipe gaji 'commission_only' dan 'mixed'

3. **RLS Policy Blocking Commission Tables**
   - File: `database/fix_commission_rls.sql`
   - Sebelumnya: Insert ke `commission_rules` diblok oleh RLS policy
   - Sesudah: Menambahkan policy permissive untuk SELECT, INSERT, UPDATE, DELETE pada `commission_rules` dan `commission_entries`

4. **Commission Entries Tidak Ter-generate dari Delivery**
   - File: `src/utils/commissionUtils.ts`
   - Masalah: Delivery yang dibuat sebelum commission rules di-setup tidak memiliki commission entries
   - Solusi: Menjalankan SQL untuk generate commission entries retroaktif berdasarkan delivery history

#### ✨ Enhancements

5. **Status Komisi Update saat Payroll Dibuat**
   - File: `src/hooks/usePayroll.ts`
   - Fitur baru: Ketika payroll record dibuat, semua `commission_entries` untuk karyawan tersebut dalam periode yang sama otomatis diupdate statusnya ke 'paid'
   - Ini memastikan komisi tidak dihitung ulang di periode berikutnya

6. **Hapus Halaman Commission Manage**
   - File: `src/App.tsx`, `src/components/layout/Sidebar.tsx`
   - Dihapus: Route `/commission-manage` dan menu di sidebar
   - Alasan: Fitur setup komisi sudah dipindahkan ke tab di halaman Employee

#### 📝 Catatan Teknis

**Alur Komisi:**
1. Admin setup commission rules per produk per role di halaman Employee
2. Saat delivery selesai, `generateDeliveryCommission()` membuat entries di `commission_entries`
3. Saat sales transaction, `generateSalesCommission()` membuat entries di `commission_entries`
4. RPC `calculate_commission_for_period` menghitung total dari `commission_entries` dengan status 'pending'
5. Saat payroll dibuat, status commission entries diupdate ke 'paid'

**Alur Pemotongan Panjar:**
1. Karyawan request panjar → `employee_advances` dengan `remaining_amount` = jumlah panjar
2. Saat payroll, admin input jumlah pemotongan panjar
3. Sistem update `remaining_amount` menggunakan FIFO dari panjar terlama
4. Journal entry dicatat: Dr. Beban Gaji, Cr. Kas, Cr. Piutang Karyawan (jika ada potongan panjar)

---

### 2024-12-24 - Perbaikan Laporan Keuangan & Integrasi Jurnal

#### 🔧 Bug Fixes

1. **React Key Warning di JournalEntryTable**
   - File: `src/components/JournalEntryTable.tsx`
   - Perbaikan: Mengganti `<>` menjadi `<React.Fragment key={entry.id}>` dalam `.map()` untuk menghilangkan warning "Each child in a list should have a unique key prop"

2. **Dialog Accessibility Warning**
   - File: `src/components/ui/dialog.tsx`
   - Perbaikan:
     - Menambahkan import `@radix-ui/react-visually-hidden`
     - Menambahkan komponen `VisuallyHidden` untuk accessibility fallback
     - Menambahkan prop `aria-describedby` pada `DialogContent`
     - Menambahkan prop `hideCloseButton` untuk opsional menyembunyikan tombol close

#### 📊 Perbaikan Laporan Keuangan

**Masalah:** Laporan keuangan (Balance Sheet, Income Statement, Cash Flow Statement) tidak menampilkan data yang benar karena menggunakan kolom `accounts.balance` yang tidak pernah diupdate.

**Solusi:** Semua laporan keuangan sekarang menghitung saldo akun secara dinamis dari `journal_entry_lines`.

3. **Balance Sheet - Perhitungan Saldo dari Jurnal**
   - File: `src/utils/financialStatementsUtils.ts`
   - Menambahkan fungsi `calculateAccountBalancesFromJournal()` yang menghitung saldo akun berdasarkan:
     - `initial_balance` dari akun
     - Semua `journal_entry_lines` dengan status 'posted' dan `is_voided = false`
     - Filter per-branch menggunakan `branchId`
     - Support tanggal cut-off dengan parameter `asOfDate`
   - Logika perhitungan saldo berdasarkan tipe akun:
     - **Aset & Beban**: Debit (+), Credit (-)
     - **Kewajiban, Modal, Pendapatan**: Credit (+), Debit (-)

4. **Income Statement - Konfirmasi Integrasi Jurnal**
   - File: `src/utils/financialStatementsUtils.ts`
   - Income Statement sudah menggunakan `journal_entry_lines` dengan benar
   - Query filter: `status = 'posted'` dan `is_voided = false`
   - Pendapatan dihitung dari akun dengan kode awalan '4'
   - HPP dihitung dari akun dengan kode awalan '5'
   - Beban Operasional dihitung dari akun dengan kode awalan '6'

5. **Cash Flow Statement - Perbaikan Saldo Kas Akhir**
   - File: `src/utils/financialStatementsUtils.ts`
   - Sebelumnya: `endingCash` diambil dari `accounts.balance` (statis)
   - Sesudah: `endingCash` dihitung dari `calculateAccountBalancesFromJournal()` dengan parameter `periodTo`
   - Ini memastikan saldo kas akhir periode akurat berdasarkan jurnal yang sudah di-posting

#### 📝 Catatan Teknis

**Mengapa Saldo Tidak Diupdate di COA?**

Sistem ini **tidak** mengupdate kolom `balance` di tabel `accounts` ketika jurnal di-posting. Ini adalah keputusan desain yang disengaja:

1. **Konsistensi Data** - Saldo selalu dihitung dari sumber yang sama (journal entries)
2. **Fleksibilitas Periode** - Bisa menghitung saldo untuk tanggal apapun (historical reporting)
3. **Audit Trail** - Semua perubahan saldo bisa di-trace ke jurnal tertentu
4. **Menghindari Duplikasi** - Tidak perlu sinkronisasi antara dua sumber data

**File yang Menggunakan Perhitungan Dinamis:**

| File | Fungsi |
|------|--------|
| `src/hooks/useAccounts.ts` | Menampilkan saldo akun di UI |
| `src/utils/financialStatementsUtils.ts` | Laporan Keuangan (Balance Sheet, Income Statement, Cash Flow) |

**Logika Perhitungan:**

```typescript
// Untuk setiap journal_entry_line yang posted & tidak voided:
const isDebitNormal = ['Aset', 'Beban'].includes(accountType);
const balanceChange = isDebitNormal
  ? debitAmount - creditAmount
  : creditAmount - debitAmount;

// Saldo = initial_balance + Σ(balanceChange dari semua jurnal)
```

#### ⚠️ Breaking Changes

Tidak ada breaking changes. Semua perubahan bersifat perbaikan internal.

---

### 2024-12-24 (Update 2) - Perbaikan Laporan Arus Kas

#### 🔧 Bug Fixes

6. **Kode Akun Panjar Karyawan Salah**
   - File: `src/utils/financialStatementsUtils.ts`
   - Sebelumnya: Filter mencari kode `13xx` untuk panjar karyawan
   - Sesudah: Filter mencari kode `122x` (sesuai COA: 1220 = Piutang Karyawan)
   - Ini memperbaiki:
     - `fromAdvanceRepayment` (pelunasan panjar dari karyawan)
     - `forEmployeeAdvances` (pemberian panjar ke karyawan)

7. **Filter Pembayaran ke Supplier Diperbaiki**
   - Sebelumnya: Mencari kode `13xx` yang juga mencakup Piutang Karyawan
   - Sesudah: Mencari kode `131x`, `132x` (Persediaan) atau `211x` (Hutang Usaha) saja
   - Filter juga mencakup nama akun: `persediaan`, `bahan`, `hutang usaha`

#### 📊 UI Improvements

8. **Laporan Arus Kas Menampilkan Detail per Akun**
   - File: `src/pages/FinancialReportsPage.tsx`
   - Sebelumnya: Hanya menampilkan kategori summary (Pelanggan, Pembayaran piutang, dll)
   - Sesudah: Menampilkan detail per akun lawan (`byAccount`) dari jurnal
   - Ini memungkinkan melihat semua transaksi yang mempengaruhi kas secara detail

#### 🔍 Debug Logging

9. **Enhanced Console Logging**
   - Menambahkan detail logging untuk debugging klasifikasi arus kas:
     - `receiptsBreakdown`: Detail penerimaan kas per kategori
     - `paymentsBreakdown`: Detail pembayaran kas per kategori
     - `operatingReceiptsDetail`: List akun lawan untuk kas masuk
     - `operatingPaymentsDetail`: List akun lawan untuk kas keluar

**Kode Akun Referensi:**

| Kode | Nama Akun | Kategori |
|------|-----------|----------|
| 1120 | Kas Tunai | Kas/Bank |
| 121x | Piutang Usaha | Piutang |
| 1220 | Piutang Karyawan (Panjar) | Piutang |
| 131x | Persediaan Barang Dagang | Persediaan |
| 132x | Persediaan Bahan Baku | Persediaan |
| 211x | Hutang Usaha | Kewajiban |
| 4xxx | Pendapatan | Pendapatan |
| 5xxx | HPP | HPP |
| 6xxx | Beban Operasional | Beban |

---

### 2024-12-24 (Update 3) - Perbaikan Laporan Laba Rugi

#### 🔧 Bug Fixes

10. **Income Statement Tidak Menampilkan Pendapatan**
    - File: `src/utils/financialStatementsUtils.ts`
    - **Masalah**: Query accounts menggunakan filter `branch_id` padahal COA adalah global
    - **Akibat**: `accountsData` kosong sehingga `accountTypes` tidak terisi, akun tidak bisa diklasifikasikan
    - **Perbaikan**: Menghapus filter `branch_id` dari query accounts

    ```typescript
    // SEBELUM (SALAH):
    let accountsQuery = supabase
      .from('accounts')
      .select('id, code, name, type, is_header')
      .order('code');

    if (branchId) {
      accountsQuery = accountsQuery.eq('branch_id', branchId); // ❌ COA tidak punya branch_id
    }

    // SESUDAH (BENAR):
    const { data: accountsData } = await supabase
      .from('accounts')
      .select('id, code, name, type, is_header')
      .order('code');
    // Note: Branch filtering sudah dilakukan di level journal_entries
    ```

#### 🔍 Enhanced Debug Logging

11. **Console Log Income Statement Diperluas**
    - Menambahkan info: `accountsLoaded`, `journalLinesRaw`, `journalLinesFiltered`, `accountTotalsCount`
    - Menambahkan detail per akun (`allAccountTotals`) untuk debugging

---

### 2025-12-24 (Update 4) - Perbaikan Final Income Statement

#### 🔧 Bug Fixes

12. **Income Statement Pendapatan Tetap 0 Meskipun Ada Journal Lines**
    - File: `src/utils/financialStatementsUtils.ts`
    - **Masalah**: Akun dibuat per-branch dengan ID berbeda, tapi kode sama. `account_id` di journal_entry_lines tidak cocok dengan ID akun di tabel accounts global.
    - **Perbaikan**: Menggunakan `account_code` (bukan `account_id`) sebagai primary key untuk aggregasi journal lines
    - **Fallback**: Jika `accountTypes` lookup gagal, infer tipe akun dari prefix kode:
      - `1xxx` = Aset
      - `2xxx` = Kewajiban
      - `3xxx` = Modal
      - `4xxx` = Pendapatan
      - `5xxx`, `6xxx` = Beban (HPP & Operasional)
      - `7xxx` = Pendapatan Lain-lain
      - `8xxx` = Beban Lain-lain

    ```typescript
    // SEBELUM (SALAH) - menggunakan account_id sebagai key:
    if (!accountTotals[accountId]) {
      accountTotals[accountId] = { ... };
    }

    // SESUDAH (BENAR) - menggunakan account_code sebagai key:
    const accountCode = line.account_code || '';
    if (!accountTotals[accountCode]) {
      accountTotals[accountCode] = { ... };
    }
    ```

#### 📊 Penjelasan: COA Per-Branch

Sistem AQUVIT menggunakan **COA per-branch**, artinya setiap cabang memiliki akun terpisah dengan ID berbeda tapi kode yang sama:

| Branch | Account ID | Account Code | Account Name |
|--------|------------|--------------|--------------|
| Pusat | `acc-001` | `4100` | Pendapatan Usaha |
| Cabang A | `acc-101` | `4100` | Pendapatan Usaha |
| Cabang B | `acc-201` | `4100` | Pendapatan Usaha |

Karena itu, penghitungan laporan keuangan menggunakan **kode akun** sebagai identifier, bukan ID akun.

---

### 2025-12-24 (Update 5) - Perbaikan Payroll System

#### 🔧 Bug Fixes

13. **RLS Policies untuk Payroll Tables**
    - **Masalah**: Tombol "Setujui", "Bayar", dan "Hapus" di halaman payroll tidak berfungsi - error 401 Unauthorized
    - **Penyebab**: Tabel `payroll_records` dan `employee_salaries` tidak memiliki RLS policies yang tepat
    - **Perbaikan**: Menambahkan RLS policies di server database:

    ```sql
    -- EMPLOYEE_SALARIES
    CREATE POLICY employee_salaries_select ON employee_salaries FOR SELECT TO owner, admin, supervisor, cashier, authenticated USING (true);
    CREATE POLICY employee_salaries_insert ON employee_salaries FOR INSERT TO owner, admin, authenticated WITH CHECK (true);
    CREATE POLICY employee_salaries_update ON employee_salaries FOR UPDATE TO owner, admin, authenticated USING (true);
    CREATE POLICY employee_salaries_delete ON employee_salaries FOR DELETE TO owner, admin USING (true);

    -- PAYROLL_RECORDS
    CREATE POLICY payroll_records_select ON payroll_records FOR SELECT TO owner, admin, supervisor, cashier, authenticated USING (true);
    CREATE POLICY payroll_records_insert ON payroll_records FOR INSERT TO owner, admin, authenticated WITH CHECK (true);
    CREATE POLICY payroll_records_update ON payroll_records FOR UPDATE TO owner, admin, authenticated USING (true);
    CREATE POLICY payroll_records_delete ON payroll_records FOR DELETE TO owner, admin USING (true);
    ```

    - File SQL: `database/fix_payroll_rls.sql`

14. **UI Tidak Update Setelah Mutasi Payroll**
    - File: `src/hooks/usePayroll.ts`
    - **Masalah**: Setelah approve/delete/pay berhasil di server (HTTP 204), data di UI tidak berubah
    - **Penyebab**: `invalidateQueries` menggunakan `exact: true` (default) sehingga tidak match dengan query yang memiliki filters dan branch_id
    - **Perbaikan**: Menambahkan `exact: false` pada semua `invalidateQueries` dan `refetchQueries`:

    ```typescript
    // SEBELUM (tidak match query dengan filters):
    await queryClient.invalidateQueries({ queryKey: ['payrollRecords'] });

    // SESUDAH (match semua variant):
    await queryClient.invalidateQueries({ queryKey: ['payrollRecords'], exact: false });
    await queryClient.refetchQueries({ queryKey: ['payrollRecords'], exact: false, type: 'active' });
    ```

15. **PostgREST Service Restart**
    - **Masalah**: PostgREST service gagal start dengan error "Address in use"
    - **Penyebab**: Ada orphan process yang masih menggunakan port 3000
    - **Perbaikan**: Kill orphan process dan restart PostgREST, lalu kirim SIGUSR1 untuk reload schema cache

#### ⚠️ Masalah yang Belum Terselesaikan

- **POST 401 Unauthorized pada payroll_records**: Error ini masih muncul di console meskipun RLS policies sudah diterapkan. Investigasi lebih lanjut diperlukan untuk:
  - Memastikan JWT token memiliki role claim yang benar
  - Memverifikasi PostgREST sudah reload schema setelah policy changes
  - Cek apakah ada caching di nginx/browser yang menyebabkan stale response

#### 📝 Catatan Server

- PostgREST berjalan di port 3000
- Ada 2 instance PostgREST:
  - `postgrest.conf` - untuk nbx.aquvit.id (Nabire)
  - `postgrest-manokwari.conf` - untuk mkw.aquvit.id (Manokwari)
- Database: `aquvit_db`
- Untuk reload schema PostgREST: `sudo kill -SIGUSR1 <postgrest_pid>`

#### 📋 File yang Dimodifikasi

| File | Perubahan |
|------|-----------|
| `src/hooks/usePayroll.ts` | Perbaikan cache invalidation dengan `exact: false` |
| `database/fix_all_rls_policies.sql` | Menambahkan RLS policies untuk payroll tables |
| `database/fix_payroll_rls.sql` | SQL standalone untuk fix RLS payroll |

---

### Known Issues - Payroll System

| Issue | Status | Deskripsi |
|-------|--------|-----------|
| POST 401 pada payroll_records | 🔴 Belum Fix | Error saat create payroll record baru. RLS policies sudah ada tapi masih 401. |
| UI tidak update setelah delete | 🟢 Fixed | Sudah diperbaiki dengan `exact: false` pada invalidateQueries |
| UI tidak update setelah approve | 🟢 Fixed | Sudah diperbaiki dengan `exact: false` pada invalidateQueries |

---

### 2025-12-25 - Implementasi FIFO Inventory untuk HPP

#### 🆕 Fitur Baru

16. **FIFO Inventory System untuk HPP (Harga Pokok Penjualan)**
    - **Tujuan**: HPP dihitung berdasarkan harga beli aktual dari PO menggunakan metode FIFO (First In, First Out)
    - **Database Changes** (Nabire - `aquvit_db`):
      - Menambahkan kolom `material_id` di tabel `inventory_batches` untuk tracking material
      - Membuat fungsi `consume_inventory_fifo()` yang mendukung product dan material
      - Membuat fungsi helper `get_product_fifo_cost()` dan `get_material_fifo_cost()`

    ```sql
    -- Struktur inventory_batches
    inventory_batches (
      id, product_id, material_id, branch_id, batch_date,
      purchase_order_id, supplier_id,
      initial_quantity, remaining_quantity, unit_cost,
      notes, created_at, updated_at
    )

    -- Fungsi FIFO consumption
    consume_inventory_fifo(
      p_product_id uuid,
      p_branch_id uuid,
      p_quantity numeric,
      p_transaction_id text,
      p_material_id uuid  -- NEW: untuk konsumsi material produksi
    ) RETURNS (total_hpp numeric, batches_consumed jsonb)
    ```

17. **Integrasi FIFO dengan Penerimaan PO**
    - File: `src/hooks/usePurchaseOrders.ts` (baris 610-683)
    - Saat PO di-receive, sistem otomatis membuat `inventory_batch` dengan:
      - `unit_cost` = harga beli dari PO item
      - `material_id` atau `product_id` sesuai jenis item
      - `purchase_order_id` untuk audit trail
    - Ini memungkinkan tracking harga beli yang berbeda per supplier/waktu

18. **Integrasi FIFO dengan Penjualan**
    - File: `src/hooks/useTransactions.ts` (baris 340-397)
    - Saat transaksi penjualan:
      1. Sistem memanggil `consume_inventory_fifo()` untuk consume batch tertua
      2. HPP dihitung dari total cost batch yang dikonsumsi
      3. Jika tidak ada batch, fallback ke `cost_price` produk
    - Jurnal HPP dibuat dengan nilai aktual dari FIFO

19. **Integrasi FIFO dengan Produksi**
    - File: `src/hooks/useProduction.ts` (baris 262-303)
    - Saat produksi:
      1. Untuk setiap material BOM, consume dari `inventory_batches` menggunakan FIFO
      2. Total material cost dihitung dari harga batch yang dikonsumsi
      3. Jurnal produksi menggunakan cost aktual dari material FIFO
    - Fallback ke `cost_price` material jika tidak ada batch

#### 📊 Alur FIFO HPP

```
PO Created → PO Approved → PO Received
                              ↓
                    inventory_batch created
                    (material_id/product_id, unit_cost dari PO)
                              ↓
            ┌─────────────────┴─────────────────┐
            ↓                                   ↓
    Penjualan Produk                     Produksi
            ↓                                   ↓
    consume_inventory_fifo()         consume_inventory_fifo()
    (untuk product_id)               (untuk material_id)
            ↓                                   ↓
    HPP = Σ(batch.unit_cost × qty)   Material Cost = Σ(batch.unit_cost × qty)
            ↓                                   ↓
    Jurnal: Dr. HPP (5xxx)           Jurnal: Dr. Persediaan Barang (1310)
            Cr. Persediaan (1310)            Cr. Persediaan Bahan (1320)
```

#### 📋 File yang Dimodifikasi

| File | Perubahan |
|------|-----------|
| `src/hooks/usePurchaseOrders.ts` | Membuat inventory_batch saat receive PO (material & product) |
| `src/hooks/useTransactions.ts` | Consume FIFO batch saat penjualan untuk HPP |
| `src/hooks/useProduction.ts` | Consume FIFO batch untuk material produksi |
| `database/fifo_inventory.sql` | SQL untuk tabel dan fungsi FIFO |

#### ⚠️ Catatan Penting

1. **Data Historis**: PO yang sudah di-receive sebelum fitur ini aktif tidak memiliki `inventory_batch`, sehingga akan fallback ke `cost_price`
2. **Migrasi**: Untuk PO lama, bisa manually insert `inventory_batch` jika diperlukan
3. **Multi-Branch**: FIFO tracking per-branch (batch hanya dikonsumsi dari branch yang sama)

---

### 2025-12-25 (Update 2) - Fix Fungsi FIFO Duplikat

#### 🔧 Bug Fixes

20. **Fungsi FIFO Duplikat Dihapus**
    - **Masalah**: Ada 2 fungsi `consume_inventory_fifo` di database dengan signature berbeda, menyebabkan error "function is not unique"
    - **Perbaikan**: Drop fungsi lama yang tidak punya parameter `p_material_id`

#### 📊 Alur Stok (Tidak Berubah)

```
LAKU KANTOR (isOfficeSale = true):
  Transaksi Dibuat → Stok ↓
  Delete Transaction → Stok ↑

BUKAN LAKU KANTOR (isOfficeSale = false):
  Transaksi Dibuat → (stok belum berubah)
  Delivery → Stok ↓
  Delete Delivery → Stok ↑
```

#### 📋 Penjelasan Alur Stok

| Kondisi | Kapan Stok Berkurang | Kapan Stok Di-restore |
|---------|---------------------|----------------------|
| Laku Kantor | Saat transaksi dibuat | Saat delete transaction |
| Bukan Laku Kantor | Saat delivery | Saat delete delivery |

---

## VPS Server Documentation

### Server Information

| Item | Value |
|------|-------|
| **Hostname** | AQUVIT |
| **IP Address** | `103.197.190.54` |
| **OS** | Ubuntu 22.04.5 LTS (Jammy Jellyfish) |
| **SSH User** | `deployer` |
| **SSH Key** | `Aquvit.pem` |

### Server Specs

| Resource | Value |
|----------|-------|
| RAM | 1.9 GB |
| Storage | 58 GB SSD (8% used) |
| Swap | None |

### SSH Connection

```bash
# Connect to VPS
ssh -i Aquvit.pem deployer@103.197.190.54
```

---

### Directory Structure

```
/var/www/
├── aquvit/                 # Frontend build (nbx.aquvit.id & mkw.aquvit.id)
│   ├── index.html
│   ├── assets/             # JS, CSS bundles
│   ├── favicon.ico
│   └── robots.txt
├── aquvit-app/             # Alternate frontend (unused?)
├── auth-server/            # Custom JWT Auth Server (Express.js)
│   ├── server.js           # Main auth logic
│   ├── setup.sql           # DB setup for auth
│   ├── package.json
│   └── node_modules/
└── upload-server/          # File Upload Server (Express.js)
    ├── server.js           # Upload handling
    ├── uploads/            # Uploaded files storage
    │   ├── customers/      # Customer photos
    │   ├── products/       # Product photos
    │   └── employees/      # Employee photos
    ├── package.json
    └── node_modules/

/home/deployer/
└── postgrest/
    ├── postgrest           # PostgREST binary v12.0.2
    ├── postgrest.conf      # Config for Nabire (port 3000)
    └── postgrest-manokwari.conf  # Config for Manokwari (port 3003)
```

---

### Running Services

#### PM2 Managed Processes

| Name | Port | Description |
|------|------|-------------|
| `auth-server` | 3002 | JWT Authentication API |
| `upload-server` | 3001 | File Upload API |
| `postgrest` | 3000 | PostgREST API for Nabire |
| `postgrest-manokwari` | 3003 | PostgREST API for Manokwari |

#### System Services

| Service | Status |
|---------|--------|
| `nginx` | Active (Running) |
| `postgresql@14-main` | Active (Running) |

#### Port Mapping

| Port | Service | Description |
|------|---------|-------------|
| 22 | SSH | Remote access |
| 80 | Nginx | HTTP (redirects to HTTPS) |
| 443 | Nginx | HTTPS frontend |
| 3000 | PostgREST | Nabire REST API |
| 3001 | Node.js | Upload server |
| 3002 | Node.js | Auth server |
| 3003 | PostgREST | Manokwari REST API |
| 5432 | PostgreSQL | Database |

---

### Backend Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         NGINX (Port 443/80)                         │
│         SSL Termination + Reverse Proxy + Static Files              │
└─────────────────────────────────────────────────────────────────────┘
                    │                    │                    │
         ┌──────────┴──────────┐         │         ┌──────────┴──────────┐
         ▼                     ▼         ▼         ▼                     ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────────┐
│   Static Files  │  │   /auth/*       │  │          /rest/v1/*             │
│   /var/www/     │  │   Auth Server   │  │         PostgREST               │
│   aquvit/       │  │   (Port 3002)   │  │   Nabire:3000 | Manokwari:3003  │
└─────────────────┘  └─────────────────┘  └─────────────────────────────────┘
                            │                           │
                            ▼                           ▼
                    ┌─────────────────────────────────────────────────┐
                    │            PostgreSQL 14 (Port 5432)            │
                    │   aquvit_db (Nabire) | aquvit_manokwari        │
                    └─────────────────────────────────────────────────┘
```

**Backend Type: PostgREST + Express.js**

Aplikasi ini menggunakan **arsitektur serverless-like** dengan:

1. **PostgREST** - Auto-generate REST API langsung dari PostgreSQL schema
   - Tidak perlu menulis endpoint manual
   - Query langsung ke database via HTTP
   - RLS (Row Level Security) untuk authorization

2. **Express.js Auth Server** - Custom JWT authentication
   - Login/logout endpoints
   - JWT token generation (matching PostgREST secret)
   - Password hashing dengan bcrypt

3. **Express.js Upload Server** - File handling
   - Multer for multipart uploads
   - Category-based file organization

---

### Database Configuration

#### Databases

| Database | Location | Description |
|----------|----------|-------------|
| `aquvit_db` | Nabire | Primary database |
| `aquvit_manokwari` | Manokwari | Secondary database |

#### Connection Details

```
Host: localhost
Port: 5432
User: aquavit
Password: Aquvit2024!
```

---

### Nginx Configuration

#### nbx.aquvit.id (Nabire)

```nginx
server {
    server_name nbx.aquvit.id;
    root /var/www/aquvit;

    # Auth API proxy
    location /auth/ {
        proxy_pass http://localhost:3002;
    }

    # PostgREST API proxy
    location /rest/v1/ {
        proxy_pass http://localhost:3000/;
    }

    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # SSL via Let's Encrypt
    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/nbx.aquvit.id/fullchain.pem;
}
```

#### mkw.aquvit.id (Manokwari)

```nginx
server {
    server_name mkw.aquvit.id;
    root /var/www/aquvit;  # Same frontend

    # Auth API (shared)
    location /auth/ {
        proxy_pass http://127.0.0.1:3002/auth/;
    }

    # PostgREST API (different port/database)
    location /rest/v1/ {
        proxy_pass http://127.0.0.1:3003/;  # Manokwari PostgREST
    }

    # SSL via Let's Encrypt
    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/mkw.aquvit.id/fullchain.pem;
}
```

---

### PostgREST Configuration

#### Nabire (postgrest.conf)

```ini
db-uri = "postgres://aquavit:Aquvit2024!@localhost:5432/aquvit_db"
db-schemas = "public"
db-anon-role = "anon"
server-host = "0.0.0.0"
server-port = 3000
jwt-secret = "c7ltcd4PN7uyaZJ/UoBbf71xdnHA3ezq7HYaaIvxizA="
jwt-secret-is-base64 = true
jwt-role-claim-key = ".role"
openapi-server-proxy-uri = "https://nbx.aquvit.id/rest/v1"
```

#### Manokwari (postgrest-manokwari.conf)

```ini
db-uri = "postgres://aquavit:Aquvit2024!@localhost:5432/aquavit_manokwari"
db-schemas = "public"
db-anon-role = "anon"
server-host = "0.0.0.0"
server-port = 3003
jwt-secret = "c7ltcd4PN7uyaZJ/UoBbf71xdnHA3ezq7HYaaIvxizA="
jwt-secret-is-base64 = true
jwt-role-claim-key = ".role"
openapi-server-proxy-uri = "https://mkw.aquvit.id/rest/v1"
```

---

### PM2 Commands

```bash
# List all processes
pm2 list

# View logs
pm2 logs auth-server
pm2 logs upload-server
pm2 logs postgrest

# Restart services
pm2 restart auth-server
pm2 restart postgrest
pm2 restart postgrest-manokwari

# Reload PostgREST schema (after DB changes)
pm2 sendSignal SIGUSR1 postgrest
pm2 sendSignal SIGUSR1 postgrest-manokwari
```

---

### Common Operations

#### Deploy Frontend Update

```bash
# 1. Build locally
npm run build

# 2. Upload to server
scp -i Aquvit.pem -r dist/* deployer@103.197.190.54:/var/www/aquvit/

# Or use rsync
rsync -avz -e "ssh -i Aquvit.pem" dist/ deployer@103.197.190.54:/var/www/aquvit/
```

#### Backup Database

```bash
# Nabire
PGPASSWORD='Aquvit2024!' pg_dump -h 103.197.190.54 -U aquavit -d aquvit_db > backup_nabire_$(date +%Y%m%d).sql

# Manokwari
PGPASSWORD='Aquvit2024!' pg_dump -h 103.197.190.54 -U aquavit -d aquavit_manokwari > backup_manokwari_$(date +%Y%m%d).sql
```

#### Check Service Status

```bash
ssh -i Aquvit.pem deployer@103.197.190.54 "pm2 list && systemctl status nginx postgresql"
```

#### View Logs

```bash
# Auth server logs
ssh -i Aquvit.pem deployer@103.197.190.54 "pm2 logs auth-server --lines 50"

# Nginx access logs
ssh -i Aquvit.pem deployer@103.197.190.54 "tail -50 /var/log/nginx/access.log"

# PostgreSQL logs
ssh -i Aquvit.pem deployer@103.197.190.54 "sudo tail -50 /var/log/postgresql/postgresql-14-main.log"
```

---

### Storage Usage

| Directory | Size |
|-----------|------|
| `/var/www/aquvit` | 17 MB |
| `/var/www/aquvit-app` | 4.3 MB |
| `/var/www/auth-server` | 8 MB |
| `/var/www/upload-server` | 101 MB |

---

### Security Notes

1. **JWT Secret** - Shared between Auth Server and PostgREST (base64 encoded)
2. **SSL** - Let's Encrypt certificates (auto-renewal via Certbot)
3. **RLS** - Row Level Security enabled on all tables
4. **CORS** - Configured for specific domains only
5. **Security Headers** - X-Frame-Options, X-Content-Type-Options, X-XSS-Protection

---

### 2025-12-24 (Update 6) - Fitur Cetak Jurnal & Laporan Keuangan

#### ✨ Fitur Baru

16. **Cetak Jurnal dengan Filter Tanggal**
    - File: `src/components/JournalEntryTable.tsx`
    - Fitur:
      - Filter tanggal (dari-sampai) untuk jurnal entries
      - Export ke Excel dengan semua jurnal terfilter
      - Export ke PDF dengan semua jurnal terfilter
      - Tombol cetak per-jurnal individual
    - Library: `xlsx` untuk Excel, `jspdf` + `jspdf-autotable` untuk PDF

17. **JournalEntryPDF Component**
    - File: `src/components/JournalEntryPDF.tsx` (NEW)
    - Fungsi:
      - `generateSingleJournalPDF()` - PDF untuk 1 jurnal
      - `generateJournalReportPDF()` - PDF laporan jurnal (range tanggal)
      - `downloadSingleJournalPDF()` - Download 1 jurnal
      - `printSingleJournal()` - Print langsung 1 jurnal
      - `downloadJournalReportPDF()` - Download laporan jurnal

18. **Auto-Generate Jurnal Pembayaran Piutang**
    - File: `src/services/journalService.ts`
    - Menambahkan parameter `paymentAccountId` pada `createReceivablePaymentJournal()`
    - Jurnal otomatis saat pembayaran piutang:
      ```
      Dr. Kas/Bank (sesuai akun dipilih)    xxx
        Cr. Piutang Usaha                       xxx
      ```
    - File terkait: `src/hooks/useTransactions.ts`, `src/components/PayReceivableDialog.tsx`

#### 🔧 Bug Fixes

19. **Fix autoTable Error di PDF Generation**
    - File: `src/components/BalanceSheetPDF.tsx`, `src/components/CashFlowPDF.tsx`, `src/components/IncomeStatementPDF.tsx`
    - **Masalah**: `doc.autoTable is not a function` error
    - **Penyebab**: Import `jspdf-autotable` yang salah
    - **Perbaikan**:
      ```typescript
      // SEBELUM (SALAH):
      import 'jspdf-autotable';
      doc.autoTable({...});

      // SESUDAH (BENAR):
      import autoTable from 'jspdf-autotable';
      autoTable(doc, {...});
      ```

20. **Signature Section & Printer Info di Laporan Keuangan**
    - File: `src/components/IncomeStatementPDF.tsx`, `src/components/BalanceSheetPDF.tsx`, `src/components/CashFlowPDF.tsx`
    - Menambahkan:
      - `PrinterInfo` interface (`name`, `position`)
      - Signature section dengan 3 kotak tanda tangan:
        - "Dibuat oleh" - auto-fill nama user yang mencetak
        - "Disetujui oleh" - kosong untuk tanda tangan
        - "Mengetahui" - kosong untuk tanda tangan
      - Footer: `Dicetak oleh: [nama] | Tanggal cetak: [timestamp]`

21. **Compact Layout 1 Halaman A4**
    - File: `src/components/IncomeStatementPDF.tsx`, `src/components/BalanceSheetPDF.tsx`, `src/components/CashFlowPDF.tsx`
    - **Masalah**: Data dan signature section tidak muat dalam 1 lembar A4
    - **Perbaikan**:
      - Memperbesar font size untuk readability
      - Signature section diposisikan di `pageHeight - 55mm`
      - Footer di `pageHeight - 8mm`
      - Cell padding dan spacing disesuaikan

22. **Integrasi Printer Info di FinancialReportsPage**
    - File: `src/pages/FinancialReportsPage.tsx`
    - Menambahkan `useAuth` hook untuk mendapatkan info user
    - Passing `printerInfo` ke semua fungsi download PDF:
      - `downloadBalanceSheetPDF(data, asOfDate, companyName, printerInfo)`
      - `downloadIncomeStatementPDF(data, companyName, printerInfo)`
      - `downloadCashFlowPDF(data, companyName, printerInfo)`
    - Printer info berisi:
      - `name`: Nama user (`user.name || user.email`)
      - `position`: Role user (`user.role`)

#### 📋 File yang Dimodifikasi/Dibuat

| File | Status | Deskripsi |
|------|--------|-----------|
| `src/components/JournalEntryPDF.tsx` | 🆕 NEW | PDF generator untuk jurnal |
| `src/components/JournalEntryTable.tsx` | 🔧 MODIFIED | Filter tanggal, export Excel/PDF |
| `src/services/journalService.ts` | 🔧 MODIFIED | Parameter paymentAccountId |
| `src/hooks/useTransactions.ts` | 🔧 MODIFIED | Auto-create journal pembayaran piutang |
| `src/components/PayReceivableDialog.tsx` | 🔧 MODIFIED | Integrasi journalService |
| `src/components/IncomeStatementPDF.tsx` | 🔧 MODIFIED | Signature section, layout compact |
| `src/components/BalanceSheetPDF.tsx` | 🔧 MODIFIED | Signature section, layout compact |
| `src/components/CashFlowPDF.tsx` | 🔧 MODIFIED | Signature section, layout compact |
| `src/pages/FinancialReportsPage.tsx` | 🔧 MODIFIED | Passing printerInfo ke PDF functions |

#### 📝 Catatan Penggunaan

**Export Jurnal ke Excel:**
```typescript
// Di JournalEntryTable.tsx
import * as XLSX from 'xlsx';

const handleExportExcel = () => {
  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Jurnal');
  XLSX.writeFile(wb, `Jurnal_${dateRange.from}_${dateRange.to}.xlsx`);
};
```

**Cetak Single Jurnal:**
```typescript
import { printSingleJournal } from '@/components/JournalEntryPDF';

// Dalam komponen
<Button onClick={() => printSingleJournal(entry, 'PT AQUVIT MANUFACTURE')}>
  <Printer className="h-4 w-4" />
</Button>
```

**Download Laporan Keuangan dengan Printer Info:**
```typescript
import { useAuth } from '@/hooks/useAuth';
import { downloadIncomeStatementPDF, PrinterInfo } from '@/components/IncomeStatementPDF';

const { user } = useAuth();

const handleDownload = () => {
  const printerInfo: PrinterInfo = {
    name: user?.name || user?.email || 'Unknown',
    position: user?.role || undefined
  };
  downloadIncomeStatementPDF(data, 'PT AQUVIT', printerInfo);
};
```

---

### 2025-12-25 (Update 7) - Fix Hutang Usaha & RLS Permissions Supir

#### 🔧 Bug Fixes

23. **Fix Jurnal Pembelian PO - PPN Tidak Masuk Hutang Usaha**
    - File: `src/hooks/usePurchaseOrders.ts`
    - **Masalah**: Jurnal pembelian PO dengan PPN hanya mencatat subtotal (tanpa PPN) ke Hutang Usaha
    - **Dampak**: Neraca menampilkan Hutang Usaha yang salah, saldo tidak seimbang
    - **Perbaikan**: Gunakan `total_cost` (termasuk PPN) untuk jurnal Hutang Usaha
    - **Catatan**: PPN masuk ke HPP/Persediaan, bukan dicatat terpisah

24. **Fix RLS Permissions untuk Role Supir/Driver**
    - Database: `role_permissions` table
    - **Masalah**: Supir dengan `pos_driver_access: true` tidak bisa akses POS
    - **Error**: `403 Forbidden - permission denied for table retasi`
    - **Permissions yang di-update**: `customers_view`, `products_view`, `accounts_view`, `transactions_view`, `transactions_create`, `transactions_edit`, `branch_access_kantor_pusat` → semua `true`

25. **Fix Data Jurnal Hutang Usaha di Database**
    - Update jurnal JE-2025-000001: Credit Hutang dari Rp 210.000 → Rp 233.100 (termasuk PPN)
    - Buat jurnal JE-2025-000009 untuk PO yang tidak tercipta (Rp 3.250.000)
    - **Hasil**: Saldo Hutang Usaha = Rp 0 (LUNAS) ✓

#### 📋 File yang Dimodifikasi/Dibuat

| File | Status | Deskripsi |
|------|--------|-----------|
| `src/hooks/usePurchaseOrders.ts` | 🔧 MODIFIED | Fix perhitungan materialTotal termasuk PPN |
| `database/fix_driver_rls_policies.sql` | 🆕 NEW | SQL script untuk fix RLS supir |
| `database/debug_hutang_usaha.sql` | 🆕 NEW | SQL script untuk debug saldo hutang |

---

### 2025-12-25 (Update 8) - Implementasi FIFO Inventory untuk HPP

#### ✨ Fitur Baru

26. **FIFO Inventory System untuk Tracking Harga Beli**
    - Database: `database/fifo_inventory.sql`
    - **Tujuan**: Menghitung HPP (Harga Pokok Penjualan) dengan akurat berdasarkan harga beli dari supplier yang berbeda-beda
    - **Metode**: FIFO (First In, First Out) - Batch tertua dikonsumsi terlebih dahulu

    **Tabel Baru:**
    - `inventory_batches` - Track setiap batch pembelian dengan harga beli per unit
    - `inventory_batch_consumptions` - Audit trail konsumsi batch (untuk penjualan/produksi)

    **Fungsi PostgreSQL:**
    - `consume_inventory_fifo(product_id, branch_id, quantity, transaction_id, material_id)` - Konsumsi inventory dengan FIFO dan return total HPP
    - `get_product_fifo_cost(product_id, branch_id)` - Get harga dari batch tertua
    - `get_material_fifo_cost(material_id, branch_id)` - Get harga material dari batch tertua
    - `get_product_weighted_avg_cost(product_id, branch_id)` - Get weighted average cost

27. **Auto-Insert Inventory Batch saat PO Diterima**
    - File: `src/hooks/usePurchaseOrders.ts`
    - **Untuk Produk (Jual Langsung)**:
      ```typescript
      await supabase.from('inventory_batches').insert({
        product_id: item.productId,
        purchase_order_id: po.id,
        supplier_id: po.supplierId,
        initial_quantity: item.quantity,
        remaining_quantity: item.quantity,
        unit_cost: item.unitPrice, // Harga beli dari PO
      });
      ```
    - **Untuk Material (Bahan Baku)**:
      ```typescript
      await supabase.from('inventory_batches').insert({
        material_id: item.materialId,
        purchase_order_id: po.id,
        supplier_id: po.supplierId,
        initial_quantity: item.quantity,
        remaining_quantity: item.quantity,
        unit_cost: item.unitPrice, // Harga beli bisa berbeda per supplier
      });
      ```

28. **FIFO Consumption saat Produksi**
    - File: `src/hooks/useProduction.ts`
    - **Sebelumnya**: HPP produksi menggunakan `cost_price` atau `price_per_unit` dari tabel materials
    - **Sesudah**: HPP produksi dihitung dari batch tertua via `consume_inventory_fifo()`
    - **Fallback**: Jika tidak ada batch tersedia, gunakan `cost_price` atau `price_per_unit`

    ```typescript
    // FIFO consumption untuk setiap bahan dalam BOM
    const { data: fifoResult } = await supabase.rpc('consume_inventory_fifo', {
      p_product_id: null,
      p_branch_id: currentBranch?.id,
      p_quantity: requiredQty,
      p_transaction_id: ref,
      p_material_id: bomItem.materialId
    });

    if (fifoResult?.total_hpp > 0) {
      totalMaterialCost += fifoResult.total_hpp;
      console.log(`✅ FIFO consumed for ${bomItem.materialName}`);
    }
    ```

29. **FIFO Consumption saat Penjualan**
    - File: `src/hooks/useTransactions.ts` (sudah ada sebelumnya)
    - HPP penjualan dihitung dari `consume_inventory_fifo()` untuk produk

30. **Update HPP Produk dari BOM**
    - Database: SQL update untuk produk yang `cost_price` masih 0
    - Menghitung HPP dari total harga material dalam Bill of Materials (BOM)
    - Update `materials.cost_price` dari `price_per_unit` jika belum ada

#### 📊 Cara Kerja FIFO

**Contoh Skenario:**
```
Hari 1: Beli 100 unit @ Rp 10.000 dari Supplier A → Batch #1
Hari 2: Beli 50 unit @ Rp 12.000 dari Supplier B → Batch #2
Hari 3: Produksi butuh 80 unit material

FIFO Consumption:
- Batch #1: Konsumsi 80 unit @ Rp 10.000 = Rp 800.000
- remaining_quantity Batch #1: 100 - 80 = 20 unit

Hari 4: Produksi butuh 40 unit material

FIFO Consumption:
- Batch #1: Konsumsi 20 unit @ Rp 10.000 = Rp 200.000 (habis)
- Batch #2: Konsumsi 20 unit @ Rp 12.000 = Rp 240.000
- Total HPP: Rp 440.000

Hari 5: Produksi butuh 30 unit material

FIFO Consumption:
- Batch #2: Konsumsi 30 unit @ Rp 12.000 = Rp 360.000
- remaining_quantity Batch #2: 50 - 20 - 30 = 0 unit (habis)
```

**Keuntungan FIFO:**
1. HPP akurat sesuai harga beli aktual
2. Support multi-supplier dengan harga berbeda
3. Audit trail lengkap (batch mana yang dikonsumsi)
4. Sesuai standar akuntansi Indonesia (PSAK)

#### 📋 File yang Dimodifikasi/Dibuat

| File | Status | Deskripsi |
|------|--------|-----------|
| `database/fifo_inventory.sql` | 🆕 NEW | SQL untuk tabel dan fungsi FIFO |
| `src/hooks/usePurchaseOrders.ts` | 🔧 MODIFIED | Insert inventory_batches saat PO diterima |
| `src/hooks/useProduction.ts` | 🔧 MODIFIED | Consume material FIFO saat produksi |
| `src/hooks/useTransactions.ts` | 🔧 EXISTING | Consume product FIFO saat penjualan |

#### 📝 Catatan Teknis

**Schema inventory_batches:**
```sql
CREATE TABLE inventory_batches (
    id UUID PRIMARY KEY,
    product_id UUID REFERENCES products(id),  -- Untuk produk
    material_id UUID REFERENCES materials(id), -- Untuk bahan baku
    branch_id UUID REFERENCES branches(id),
    purchase_order_id TEXT,
    supplier_id UUID REFERENCES suppliers(id),
    batch_date TIMESTAMP,
    initial_quantity NUMERIC(15,2),
    remaining_quantity NUMERIC(15,2),
    unit_cost NUMERIC(15,2),  -- Harga beli per unit
    notes TEXT
);

-- Constraint: harus ada product_id ATAU material_id
ALTER TABLE inventory_batches
ADD CONSTRAINT chk_product_or_material
CHECK (product_id IS NOT NULL OR material_id IS NOT NULL);
```

**Fallback Logic:**
1. Coba panggil `consume_inventory_fifo()`
2. Jika gagal (tidak ada batch), gunakan `cost_price` dari tabel
3. Jika `cost_price` null, gunakan `price_per_unit` atau `base_price`

---

### 2025-12-25 (Update 9) - Fitur PPN Include/Exclude & Potongan Gaji

#### 🆕 Fitur Baru

31. **PPN Include/Exclude pada Purchase Order**
    - File: `src/components/CreatePurchaseOrderDialog.tsx`, `src/hooks/usePurchaseOrders.ts`
    - **Fitur**: Menambahkan pilihan mode PPN:
      - **PPN Exclude**: Harga item belum termasuk PPN, PPN 11% ditambahkan di atas subtotal
      - **PPN Include**: Harga item sudah termasuk PPN 11%, subtotal dihitung dari total
    - **Akuntansi**: PPN Masukan dicatat ke akun Piutang Pajak (1230)

    **Jurnal PO dengan PPN:**
    ```
    Dr. Persediaan Bahan Baku (1320)    xxx (subtotal)
    Dr. PPN Masukan / Piutang Pajak (1230)  xxx (PPN amount)
      Cr. Hutang Usaha (2110)                    xxx (total)
    ```

32. **Kolom DPP dan PPN di Export Transaksi**
    - File: `src/components/TransactionTable.tsx`
    - Export PDF dan Excel sekarang menampilkan kolom:
      - DPP (Dasar Pengenaan Pajak / Subtotal)
      - PPN (nilai PPN)
    - PDF diubah ke landscape untuk mengakomodasi kolom tambahan

33. **Potongan Gaji (Salary Deduction) di Payroll**
    - File: `src/components/PayrollRecordDialog.tsx`, `src/hooks/usePayroll.ts`
    - **Fitur**: Menambahkan field "Potongan Gaji" yang terpisah dari "Potong Panjar"
    - **Kegunaan**: Untuk keterlambatan, absensi, atau potongan lainnya
    - **Field baru**:
      - `Potongan Gaji`: Nominal potongan
      - `Alasan Potongan`: Keterangan potongan (opsional)
    - **Perhitungan**:
      ```
      Gaji Bersih = Gaji Kotor - Potong Panjar - Potongan Gaji
      ```

#### 🔧 Database Migration

**File SQL**: `database/add_salary_deduction_and_ppn_columns.sql`

**Kolom baru yang ditambahkan:**

| Tabel | Kolom | Tipe | Deskripsi |
|-------|-------|------|-----------|
| `payroll_records` | `salary_deduction` | NUMERIC(15,2) | Potongan gaji (keterlambatan, absensi, dll) |
| `purchase_orders` | `subtotal` | NUMERIC(15,2) | Subtotal sebelum PPN (DPP) |
| `purchase_orders` | `ppn_mode` | TEXT | Mode PPN: 'include' atau 'exclude' |

**View yang diupdate:**
- `payroll_summary` - Menambahkan kolom `salary_deduction`

**Migration sudah dijalankan di:**
- ✅ aquvit_db (Nabire)
- ✅ aquvit_manokwari (Manokwari)

**Jalankan manual (jika perlu):**
```bash
ssh -i Aquvit.pem deployer@103.197.190.54
sudo -u postgres psql -d aquvit_db -f /tmp/add_salary_deduction_and_ppn_columns.sql
```

#### 📋 File yang Dimodifikasi/Dibuat

| File | Status | Deskripsi |
|------|--------|-----------|
| `src/types/purchaseOrder.ts` | 🔧 MODIFIED | Tambah `ppnMode`, `subtotal` |
| `src/hooks/usePurchaseOrders.ts` | 🔧 MODIFIED | Handle ppnMode, subtotal, jurnal PPN |
| `src/services/journalService.ts` | 🔧 MODIFIED | Jurnal PPN Masukan ke Piutang Pajak |
| `src/components/CreatePurchaseOrderDialog.tsx` | 🔧 MODIFIED | UI PPN mode selection |
| `src/components/TransactionTable.tsx` | 🔧 MODIFIED | Export PDF/Excel dengan DPP & PPN |
| `src/components/PayrollRecordDialog.tsx` | 🔧 MODIFIED | Field potongan gaji |
| `src/hooks/usePayroll.ts` | 🔧 MODIFIED | Handle salary_deduction |
| `database/add_salary_deduction_and_ppn_columns.sql` | 🆕 NEW | SQL migration script |

# CI Test
