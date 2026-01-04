# CHANGELOG v4

## 2026-01-02 - COA Balance Calculation Cleanup

### Removed Dead Code
- **Hapus `updateAccountBalance` mutation** dari `useAccounts.ts`
  - Fungsi ini mengupdate kolom `accounts.balance` yang **TIDAK digunakan** untuk perhitungan saldo
  - Saldo akun HANYA dihitung dari `journal_entry_lines` (double-entry accounting)
  - Ini adalah dead code yang berpotensi menyebabkan kebingungan

### COA Balance System Documentation
```
PRINSIP DOUBLE-ENTRY ACCOUNTING:
================================
1. Saldo akun dihitung 100% dari journal_entry_lines
2. Kolom accounts.balance TIDAK digunakan (legacy)
3. initial_balance hanya referensi untuk membuat opening journal
4. Ketika initial_balance diubah via updateInitialBalance:
   - Jurnal opening lama di-void otomatis
   - Jurnal opening baru dibuat dengan pasangan Laba Ditahan (3200)

RUMUS PERHITUNGAN SALDO:
========================
- Aset/Beban: saldo = SUM(debit) - SUM(credit)
- Kewajiban/Modal/Pendapatan: saldo = SUM(credit) - SUM(debit)

FUNGSI EDIT YANG AMAN:
======================
- updateAccount: Edit metadata (name, code, type) - tidak menyentuh balance
- updateInitialBalance: Edit saldo awal - auto-create opening journal
- deleteAccount: Hapus akun - perlu validasi jika sudah ada jurnal
```

---

## 2025-12-28 - APK Build & Bluetooth Printer Support

---

## Server Architecture

### Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        VPS SERVER                                │
│                    103.197.190.54                                │
│                    Ubuntu 22.04.5 LTS                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐     ┌─────────────────────────────────────┐    │
│  │   NGINX     │     │         PostgreSQL 14               │    │
│  │  Port 443   │     │         Port 5432                   │    │
│  │  (HTTPS)    │     │                                     │    │
│  └──────┬──────┘     │  ┌─────────────┐ ┌─────────────┐   │    │
│         │            │  │ aquvit_new  │ │   mkw_db    │   │    │
│         │            │  │  (Nabire)   │ │ (Manokwari) │   │    │
│         │            │  └─────────────┘ └─────────────┘   │    │
│         │            └─────────────────────────────────────┘    │
│         │                       ▲              ▲                 │
│         ▼                       │              │                 │
│  ┌──────────────────────────────┴──────────────┴───────────┐    │
│  │                         PM2                              │    │
│  │                                                          │    │
│  │  ┌─────────────────┐  ┌─────────────────┐               │    │
│  │  │ NABIRE STACK    │  │ MANOKWARI STACK │               │    │
│  │  │                 │  │                 │               │    │
│  │  │ PostgREST :3000 │  │ PostgREST :3007 │               │    │
│  │  │ Auth      :3006 │  │ Auth      :3003 │               │    │
│  │  └─────────────────┘  └─────────────────┘               │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Domain Mapping

| Domain | Lokasi | Database | PostgREST | Auth Server |
|--------|--------|----------|-----------|-------------|
| `nbx.aquvit.id` | Nabire | `aquvit_new` | :3000 | :3006 |
| `mkw.aquvit.id` | Manokwari | `mkw_db` | :3007 | :3003 |

### Nginx Routing

```
nbx.aquvit.id
├── /rest/*    → localhost:3000 (PostgREST Nabire)
├── /auth/*    → localhost:3006 (Auth Server Nabire)
└── /*         → /var/www/aquvit (Static files)

mkw.aquvit.id
├── /rest/*    → localhost:3007 (PostgREST Manokwari)
├── /auth/*    → localhost:3003 (Auth Server Manokwari)
└── /*         → /var/www/aquvit (Static files)
```

### PM2 Process List

| Process Name | Port | Database | Config Path |
|--------------|------|----------|-------------|
| `postgrest-aquvit` | 3000 | `aquvit_new` | `/home/deployer/postgrest/postgrest.conf` |
| `postgrest-mkw` | 3007 | `mkw_db` | `/home/deployer/postgrest-mkw/postgrest.conf` |
| `auth-server-new` | 3006 | `aquvit_new` | `/home/deployer/auth-server/server.js` |
| `auth-server-mkw` | 3003 | `mkw_db` | `/home/deployer/auth-server-mkw/server.js` |

### SSH & Database Access

```bash
# SSH ke server (file pem ada di root folder project)
ssh -i "Aquvit.pem" -o StrictHostKeyChecking=no deployer@103.197.190.54

# Akses PostgreSQL (gunakan sudo -u postgres)
sudo -u postgres psql -d mkw_db       # Database Manokwari
sudo -u postgres psql -d aquvit_new   # Database Nabire

# Contoh query
sudo -u postgres psql -d mkw_db -c "SELECT COUNT(*) FROM products;"

# Restart PostgREST (untuk reload schema setelah GRANT/migration)
sudo systemctl restart postgrest

# Cek status PostgREST
sudo systemctl status postgrest
```

**PENTING untuk AI:**
- File `Aquvit.pem` ada di root folder project
- Gunakan `sudo -u postgres psql` (bukan `PGPASSWORD=xxx psql -U postgres`)
- PostgREST berjalan sebagai systemd service, bukan Docker
- Setelah GRANT atau migration, restart PostgREST: `sudo systemctl restart postgrest`

### Useful Commands

```bash
# List all PM2 processes
pm2 list

# Restart specific service
pm2 restart auth-server-new
pm2 restart auth-server-mkw
pm2 restart postgrest-aquvit
pm2 restart postgrest-mkw

# View logs
pm2 logs auth-server-new --lines 50
pm2 logs auth-server-mkw --lines 50

# Reload PostgREST schema (tanpa restart)
sudo kill -SIGUSR1 $(pgrep postgrest)

# Check Nginx status
sudo systemctl status nginx
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# Check PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-14-main.log

# Check Nginx error logs
sudo tail -f /var/log/nginx/error.log
```

---

## New Features

### 46. APK Build Terpisah per Server

Build APK terpisah untuk Nabire dan Manokwari dengan server URL di-hardcode saat build.

**Environment Files:**
- `.env.nabire` → `VITE_APK_SERVER=nabire`
- `.env.manokwari` → `VITE_APK_SERVER=manokwari`

**Build Commands:**
```bash
# Nabire
npm run build:nabire && npx cap sync android

# Manokwari
npm run build:manokwari && npx cap sync android
```

**Android Studio:**
Build → Generate App Bundles or APKs → Generate APKs

### 47. Bluetooth Thermal Printer Support

- **Plugin**: `@capacitor-community/bluetooth-le@7.3.0`
- **Service**: `src/services/bluetoothPrintService.ts`
- **Hook**: `src/hooks/useBluetoothPrinter.ts`

**Fitur:**
- Scan printer Bluetooth
- Connect/Disconnect printer
- Test print
- Print struk POS dengan format ESC/POS
- Auto-reconnect ke printer tersimpan

**Usage:**
```tsx
import { useBluetoothPrinter } from '@/hooks/useBluetoothPrinter';

const { scanForPrinters, connectToPrinter, printReceipt, testPrint } = useBluetoothPrinter();

// Scan
await scanForPrinters();

// Connect
await connectToPrinter(devices[0]);

// Print
await printReceipt({
  storeName: 'Aquvit Store',
  transactionNo: 'TRX-001',
  items: [...],
  total: 100000,
});
```

### 48. Contacts Plugin

- **Plugin**: `@capacitor-community/contacts@7.1.0`
- **Permission**: READ_CONTACTS, WRITE_CONTACTS

### 49. Fix Auth Server Routing

Perbaikan nginx config - menghapus trailing slash pada proxy_pass yang menyebabkan `/auth/v1/token` return 404.

---

## Capacitor Plugins

| Plugin | Version | Fungsi |
|--------|---------|--------|
| `@capacitor/camera` | 8.0.0 | Kamera & Galeri |
| `@capacitor/geolocation` | 8.0.0 | GPS/Lokasi |
| `@capacitor-community/bluetooth-le` | 7.3.0 | Bluetooth Printer |
| `@capacitor-community/contacts` | 7.1.0 | Akses Kontak |
| `@capacitor/browser` | 8.0.0 | In-app Browser |
| `@capacitor/local-notifications` | 8.0.0 | Notifikasi Lokal |
| `@capacitor/push-notifications` | 8.0.0 | Push Notification |

---

## Android Permissions

```xml
<!-- Bluetooth -->
<uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />

<!-- Contacts -->
<uses-permission android:name="android.permission.READ_CONTACTS" />
<uses-permission android:name="android.permission.WRITE_CONTACTS" />

<!-- Location -->
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />

<!-- Camera -->
<uses-permission android:name="android.permission.CAMERA" />

<!-- Storage -->
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
```

---

## Files Created/Modified

| File | Perubahan |
|------|-----------|
| `src/services/bluetoothPrintService.ts` | Service Bluetooth printer |
| `src/hooks/useBluetoothPrinter.ts` | React hook untuk printer |
| `src/integrations/supabase/client.ts` | Support `VITE_APK_SERVER` env |
| `.env.nabire` | Environment untuk build Nabire |
| `.env.manokwari` | Environment untuk build Manokwari |
| `android/build_nabire.bat` | Batch file build Nabire |
| `android/build_manokwari.bat` | Batch file build Manokwari |
| `android/BUILD_APK.md` | Panduan build APK |
| `android/app/src/main/AndroidManifest.xml` | Tambah permission Bluetooth & Contacts |
| `package.json` | Tambah scripts build:nabire, build:manokwari |

---

## 2025-12-31 - HPP Bonus, Arus Kas Fix, Mobile POS Improvement

### 50. HPP Bonus - Akun Terpisah untuk Barang Gratis

Barang bonus (gratis) sekarang dicatat terpisah dari HPP biasa agar laporan laba rugi lebih akurat.

**Perubahan:**
- Tambah akun **5210 HPP Bonus** di `chartOfAccountsUtils.ts`
- Rename akun **2140** dari "Hutang Barang Dagang" menjadi "Modal Barang Dagang Tertahan"
- Modifikasi `journalService.ts` untuk menghitung dan mencatat HPP Bonus secara terpisah
- Modifikasi `useTransactions.ts` untuk menghitung HPP dari item bonus

**Jurnal Penjualan dengan Bonus:**
```
Dr. Kas/Piutang          xxx  (pembayaran)
Dr. HPP                  xxx  (cost barang terjual)
Dr. HPP Bonus            xxx  (cost barang gratis)
    Cr. Penjualan        xxx
    Cr. Persediaan       xxx  (total cost semua barang)
```

### 51. Fix Arus Kas - Exclude Transfer Internal

Perbaikan laporan arus kas yang sebelumnya menghitung transfer antar akun kas sebagai arus kas.

**Masalah:**
- Transfer dari Kas Kecil ke Kas Besar tercatat sebagai kas masuk DAN kas keluar
- Jurnal penyesuaian internal muncul di arus kas

**Solusi di `financialStatementsUtils.ts`:**
- Skip jurnal dimana counterpart juga akun Kas/Bank (internal transfer)
- Skip jurnal yang hanya melibatkan akun kas tanpa counterpart

### 52. Mobile POS - Perbaikan UI & Logika

**Fix Error:**
- Fix `Cannot read properties of undefined (reading 'filter')` di `pricingService.ts`
- Tambah defensive check `|| []` untuk array parameters
- Perbaiki pemanggilan `PricingService.calculatePrice` di `MobilePosForm.tsx` dan `PosForm.tsx`

**UI Improvement:**
- Tampilan pembayaran sekarang sama dengan Driver POS (input-first flow)
- Bisa simpan transaksi tanpa pembayaran (kredit)
- Auto-select akun pembayaran pertama jika ada jumlah bayar
- Tombol "Lunas" dan "Kredit" untuk quick select
- Status pembayaran visual (Lunas/Kredit)

**Dark Mode:**
- Tambah dark mode styling untuk product selection sheet
- Fix text visibility di dark mode

**Touch Support:**
- Tambah `onTouchEnd` handler untuk product selection
- Tambah `touch-manipulation` dan `select-none` class

### Files Modified

| File | Perubahan |
|------|-----------|
| `src/utils/chartOfAccountsUtils.ts` | Tambah akun 5210 HPP Bonus, rename 2140 |
| `src/services/journalService.ts` | Tambah parameter hppBonusAmount, jurnal HPP Bonus |
| `src/hooks/useTransactions.ts` | Hitung HPP Bonus untuk item bonus |
| `src/utils/financialStatementsUtils.ts` | Exclude internal transfer dari arus kas |
| `src/services/pricingService.ts` | Defensive check untuk array undefined |
| `src/components/PosForm.tsx` | Defensive check untuk calculatePrice |
| `src/components/MobilePosForm.tsx` | UI pembayaran baru, fix pricing, dark mode |

---

## 2026-01-02 - Accounting System Improvements

### 53. COA Seeding dengan Fallback Template Standar

Ketika membuat branch baru, sistem sekarang menggunakan fallback ke template standar jika kantor pusat tidak memiliki COA.

**Perubahan:**
- Modifikasi `useBranches.ts` untuk import `STANDARD_COA_TEMPLATE`
- `createBranch` dan `copyCoaToBranch` sekarang fallback ke template standar
- Template standar mencakup 50+ akun standar Indonesia

**Flow:**
```
Branch Baru Dibuat
    ↓
Cek apakah HQ punya COA?
    ↓
[Ya] → Copy dari HQ
[Tidak] → Gunakan STANDARD_COA_TEMPLATE
    ↓
Insert akun ke branch baru
```

### 54. Period Locking - Cegah Posting ke Periode Tertutup

Jurnal tidak dapat dibuat pada periode yang sudah ditutup (tutup buku tahunan).

**Perubahan di journalService.ts:**
- Tambah fungsi `isPeriodClosed(date, branchId)`
- Tambah fungsi `getClosedPeriods(branchId)`
- Validasi di `createJournalEntry()` - block posting ke periode tertutup

**Error Message:**
```
"Periode tahun 2025 sudah ditutup. Tidak dapat membuat jurnal pada periode yang sudah ditutup."
```

### 55. Optimasi Query dengan Caching Hook

Hook baru untuk menghitung saldo akun dengan caching yang lebih agresif.

**File Baru:**
- `src/hooks/useAccountBalanceSummary.ts`

**Fitur:**
- Cache 2 menit untuk saldo akun
- Kalkulasi summary: Total Aset, Kewajiban, Modal, Pendapatan, Beban, HPP
- Getter helpers: `getAccountBalance(idOrCode)`, `getAccountsByType(type)`
- Check `isBalanced` untuk validasi neraca

**Usage:**
```tsx
const { summary, getAccountBalance } = useAccountBalanceSummary();
console.log(summary.totalAset, summary.labaRugiBersih);
console.log(getAccountBalance('1120')); // Saldo Kas
```

### 56. Journal Number Sequence yang Lebih Robust

Perbaikan generasi nomor jurnal untuk mencegah race condition.

**Database Migration:**
- `database/create_journal_sequence.sql`
- Tabel `journal_sequences` untuk tracking sequence per branch/hari
- RPC `get_next_journal_number()` dengan advisory lock
- Format: `JE-YYYYMMDD-XXXX`

**Perubahan di journalService.ts:**
- Coba gunakan RPC `get_next_journal_number` terlebih dahulu
- Fallback ke metode lama jika RPC tidak tersedia
- Race-condition free dengan PostgreSQL advisory lock

### Files Created/Modified

| File | Perubahan |
|------|-----------|
| `src/hooks/useBranches.ts` | Fallback COA ke template standar |
| `src/hooks/useAccountBalanceSummary.ts` | Hook cached account balances |
| `src/services/journalService.ts` | Period locking + sequence RPC |
| `database/create_journal_sequence.sql` | Database migration untuk sequence |

---

## Forecast / Roadmap

| Fitur | Status | Deskripsi |
|-------|--------|-----------|
| **Driver Location Tracking** | Planned | Lacak lokasi supir secara real-time |
| - Background Location Service | - | Kirim lokasi ke server meski app di background |
| - Database `driver_locations` | - | Simpan history lokasi supir |
| - Admin Monitoring UI | - | Peta untuk melihat posisi semua supir |
| - WebSocket/Polling | - | Update posisi real-time ke admin |




##### Ini yang harus di lakukan selanjutnya #####

Laporan Lengkap: COA, Jurnal & Branch ID
1. SISTEM COA (Chart of Accounts)
Struktur Database accounts:
Field	Deskripsi
id	Primary key (acc-XXXX)
code	Kode 4-digit (1120, 2110, dst)
name	Nama akun
type	Aset/Kewajiban/Modal/Pendapatan/Beban
initial_balance	Saldo awal (referensi untuk opening journal)
balance	TIDAK DIGUNAKAN - legacy field
is_payment_account	Akun kas/bank untuk pembayaran
is_header	Header vs detail account
branch_id	Multi-branch support
employee_id	Untuk kas karyawan
Kode Akun Standar:
1xxx - ASET (Debit normal)
  1100 - Kas dan Setara Kas
  1200 - Piutang
  1300 - Persediaan
  1400 - Aset Tetap

2xxx - KEWAJIBAN (Credit normal)
  2100 - Hutang Jangka Pendek
  2200 - Hutang Jangka Panjang

3xxx - MODAL (Credit normal)
  3100 - Modal Disetor
  3200 - Laba Ditahan

4xxx - PENDAPATAN (Credit normal)
  4110 - Penjualan

5xxx - HPP (Debit normal)
  5100 - Harga Pokok Penjualan
  5210 - HPP Bonus

6xxx - BEBAN OPERASIONAL (Debit normal)
  6100-6900 - Beban-beban operasional
2. PERHITUNGAN SALDO AKUN
Prinsip Utama: Double-Entry Accounting
Saldo = HANYA dihitung dari journal_entry_lines
       BUKAN dari kolom accounts.balance
Rumus:
// Aset & Beban (Debit Normal):
saldo = SUM(debit) - SUM(credit)

// Kewajiban, Modal, Pendapatan (Credit Normal):
saldo = SUM(credit) - SUM(debit)
Flow Initial Balance:
Owner set initial_balance → Auto-create Opening Journal → Saldo dihitung dari jurnal
3. JURNAL OTOMATIS (32 Fungsi)
Semua transaksi menciptakan jurnal otomatis:
Transaksi	Jurnal	Akun
POS/Penjualan	createSalesJournal	Dr.Kas Cr.Penjualan, Dr.HPP Cr.Persediaan
Beban	createExpenseJournal	Dr.Beban Cr.Kas
Panjar Karyawan	createAdvanceJournal	Dr.Piutang Cr.Kas
Transfer Kas	createTransferJournal	Dr.Kas A Cr.Kas B
Pembelian Material	createMaterialPurchaseJournal	Dr.Persediaan Cr.Kas/Hutang
Produksi	createProductionOutputJournal	Dr.Barang Jadi Cr.Bahan Baku
Depresiasi	createDepreciationJournal	Dr.Beban Cr.Akum.Peny
Pembayaran Hutang	createPayablePaymentJournal	Dr.Hutang Cr.Kas
4. STATUS BRANCH_ID
✅ SUDAH BENAR (Filter branch_id)
useTransactions ✓
useExpenses ✓
useEmployeeAdvances ✓
usePurchaseOrders ✓
useAssets ✓
useAccounts ✓
useProducts ✓
useCustomers ✓
useSuppliers ✓
useEmployees ✓
useProduction ✓
useJournalEntries ✓
useCashFlow ✓
usePaymentHistory ✓
useDailyReport ✓
⚠️ MASALAH DITEMUKAN: useRetasi
6 Query TIDAK ada filter branch_id:
useDriverHasRetasi() - baris 84-105
useActiveRetasi() - baris 109-150
checkDriverAvailability() - baris 252-289
createRetasi() - cek driver - baris 302-306
createRetasi() - hitung retasi_ke - baris 334-339
retasi-stats query - baris 227-249
DAMPAK: Data retasi dari branch lain bisa terlihat/tercampur!
5. RINGKASAN FITUR APLIKASI
Modul	Fitur
POS	Penjualan, Driver POS, Retasi
Inventori	Produk, Material, BOM, Stock Movement
Keuangan	COA, Jurnal, Neraca, Laba Rugi, Arus Kas
Piutang/Hutang	AR, AP, Cicilan
HRD	Karyawan, Payroll, Absensi, Panjar
Pengadaan	Supplier, PO, Penerimaan Barang
Aset	Fixed Asset, Depresiasi, Maintenance
Laporan	PDF Reports, Daily Box, Commission
6. REKOMENDASI PERBAIKAN
Segera perbaiki useRetasi.ts - tambahkan filter branch_id ke 6 query yang bermasalah:
// Contoh perbaikan:
.from('retasi')
.select('*')
.eq('driver_name', driverName)
.eq('branch_id', currentBranch?.id)  // ← TAMBAHKAN INI
Apakah ingin saya langsung perbaiki file useRetasi.ts?
cek lagi bukannya retasi sudah ada branch id ?
Saya akan cek langsung file useRetasi.ts untuk memverifikasi.
Read d:\App\Aquvit Fix - Copy\src\hooks\useRetasi.ts
Anda benar! Mari saya analisis ulang:
Hasil Verifikasi useRetasi.ts
✅ SUDAH ADA branch_id:
Query utama useRetasi (baris 186-189):
if (currentBranch?.id) {
  query = query.eq('branch_id', currentBranch.id);
}
createRetasi (baris 360):
branch_id: currentBranch?.id || null
⚠️ MEMANG TIDAK ADA branch_id (tapi mungkin by design):
Fungsi	Baris	Alasan Mungkin OK
useDriverHasRetasi()	84-105	Legacy hook, cek global
useActiveRetasi()	109-152	Cek driver aktif di SEMUA branch (prevent driver kerja di 2 branch sekaligus)
checkDriverAvailability()	252-289	Sama - prevent driver double-book
createRetasi() - cek active	302-306	Sama - validasi global
createRetasi() - count retasi_ke	334-339	Hitung per driver per hari (bisa jadi bug)
retasi-stats	227-249	Stats global (bisa jadi bug)
Pertanyaan Bisnis:
Apakah satu supir boleh bekerja di 2 branch berbeda secara bersamaan?
Jika TIDAK boleh → Logic sekarang sudah benar (cek global)
Jika BOLEH → Perlu tambah branch_id filter
Yang kemungkinan bug:
retasi-stats - harusnya per branch, bukan global
retasi_ke counting - harusnya per branch per driver per hari
Mau saya perbaiki yang 2 itu?


Jika sudah maka tulis changlog di bawah *****