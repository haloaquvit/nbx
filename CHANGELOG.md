# CHANGELOG

Semua perubahan penting pada proyek AQUVIT ERP System didokumentasikan di file ini.

---

## VPS Server Information

| Item | Value |
|------|-------|
| **Hostname** | AQUVIT |
| **IP Address** | `103.197.190.54` |
| **OS** | Ubuntu 22.04.5 LTS |
| **SSH User** | `deployer` |
| **SSH Key** | `Aquvit.pem` |
| **Database** | PostgreSQL 14 (`aquvit_db`) |
| **Web Root** | `/var/www/aquvit` |

### Domain & Services

| Domain | Lokasi | Port |
|--------|--------|------|
| `nbx.aquvit.id` | Nabire | 443 (HTTPS) |
| `mkw.aquvit.id` | Manokwari | 443 (HTTPS) |

> **Note:** Domain lama `app.aquvit.id` dan `erp.aquvit.id` sudah tidak aktif (2025-12-25).

### Services Running

| Service | Port | Config | Database |
|---------|------|--------|----------|
| PostgREST (Nabire) | 3000 | `/home/deployer/postgrest/postgrest.conf` | `aquvit_new` |
| PostgREST (Manokwari) | 3007 | `/home/deployer/postgrest-mkw/postgrest.conf` | `mkw_db` |
| Auth Server (Nabire) | 3006 | `/home/deployer/auth-server/server.js` | `aquvit_new` |
| Auth Server (Manokwari) | 3003 | `/home/deployer/auth-server-mkw/server.js` | `mkw_db` |
| Nginx | 80, 443 | Reverse proxy |  |
| PostgreSQL | 5432 | Database server |  |

### Database Configuration

| Lokasi | Database Name | PostgREST Port | Auth Port |
|--------|---------------|----------------|-----------|
| Nabire | `aquvit_new` | 3000 | 3006 |
| Manokwari | `mkw_db` | 3007 | 3003 |

### Database Credentials

```
User: aquavit
Password: Aquvit2024
Host: 127.0.0.1
Port: 5432
```

**Contoh koneksi psql:**
```bash
# Nabire
PGPASSWORD='Aquvit2024' psql -U aquavit -h 127.0.0.1 -d aquvit_new

# Manokwari
PGPASSWORD='Aquvit2024' psql -U aquavit -h 127.0.0.1 -d mkw_db

# Atau dengan sudo (untuk ALTER TABLE dll jika perlu superuser)
sudo -u postgres psql -d aquvit_new
sudo -u postgres psql -d mkw_db
```

### Database Schema Notes

**PENTING untuk AI:**

1. **Tabel Karyawan = `profiles`** (bukan `employees`)
   - Frontend type: `Employee` → Database table: `profiles`
   - Field `name` adalah generated column dari `full_name`
   - Roles: `owner`, `admin`, `cashier`, `driver`, `sales`, `helper`, `operator`, `designer`, `supervisor`

2. **Foreign Key ke karyawan selalu ke `profiles(id)`**
   ```sql
   -- Contoh benar:
   ALTER TABLE accounts ADD COLUMN employee_id UUID REFERENCES profiles(id);

   -- SALAH (tabel tidak ada):
   ALTER TABLE accounts ADD COLUMN employee_id UUID REFERENCES employees(id);
   ```

3. **Ownership tabel berbeda per database:**
   - Nabire: Mix `aquavit` dan `postgres`
   - Manokwari: Semua owned by `postgres`
   - Gunakan `sudo -u postgres` untuk ALTER TABLE di Manokwari

4. **Setelah ALTER TABLE, restart PostgREST:**
   ```bash
   pm2 restart postgrest-aquvit postgrest-mkw
   ```

5. **Total 55 tabel** termasuk:
   - `accounts` - Chart of Accounts
   - `profiles` - Karyawan/Users
   - `transactions` - Transaksi penjualan
   - `deliveries` - Pengiriman
   - `journal_entries` + `journal_entry_lines` - Jurnal akuntansi
   - `customers`, `suppliers`, `products`, `materials`
   - Dan lainnya...

### PM2 Process Names

```bash
pm2 list
# auth-server-new     (port 3006 - Nabire)
# auth-server-mkw     (port 3003 - Manokwari)
# postgrest-aquvit    (port 3000 - Nabire)
# postgrest-mkw       (port 3007 - Manokwari)
```

### SSH Connection

```bash
ssh -i Aquvit.pem deployer@103.197.190.54
```

### Useful Commands

```bash
# Check PostgREST status
sudo systemctl status postgrest

# Restart PostgREST
sudo systemctl restart postgrest

# Reload PostgREST schema (tanpa restart)
sudo kill -SIGUSR1 $(pgrep postgrest)

# Check PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-14-main.log

# Check Nginx logs
sudo tail -f /var/log/nginx/error.log
```

---

## [v4] 2025-12-28 - APK Build & Bluetooth Printer Support

### New Features

46. **APK Live URL Mode**
    - APK sekarang load dari live server URL (tidak bundled assets)
    - **Tidak perlu rebuild APK** untuk update web/frontend
    - Cukup deploy ke VPS, APK otomatis dapat update terbaru
    - Nabire: `https://nbx.aquvit.id`
    - Manokwari: `https://mkw.aquvit.id`
    - Batch files auto-switch URL: `android/build_nabire.bat`, `android/build_manokwari.bat`
    - **Catatan:** APK butuh koneksi internet, tidak bisa offline

47. **Bluetooth Thermal Printer Support**
    - Plugin: `@capacitor-community/bluetooth-le@7.3.0`
    - Service: `src/services/bluetoothPrintService.ts`
    - Hook: `src/hooks/useBluetoothPrinter.ts`
    - Fitur:
      - Scan printer Bluetooth
      - Connect/Disconnect printer
      - Test print
      - Print struk POS dengan format ESC/POS
      - Auto-reconnect ke printer tersimpan

48. **Contacts Plugin**
    - Plugin: `@capacitor-community/contacts@7.1.0`
    - Permission: READ_CONTACTS, WRITE_CONTACTS

49. **Fix Auth Server Routing**
    - Perbaikan nginx config untuk auth routing
    - Sebelum: `/auth/v1/token` return 404
    - Sesudah: Auth endpoint berfungsi normal
    - Update pada `mkw.aquvit.id` dan `nbx.aquvit.id`

### APK Build Instructions

```bash
# Build untuk Nabire (nbx.aquvit.id)
npm run build:nabire
npx cap sync android
# Buka Android Studio -> Build APK

# Build untuk Manokwari (mkw.aquvit.id)
npm run build:manokwari
npx cap sync android
# Buka Android Studio -> Build APK

# Atau gunakan batch file:
android\build_nabire.bat
android\build_manokwari.bat
```

### Capacitor Plugins Installed

| Plugin | Version | Fungsi |
|--------|---------|--------|
| `@capacitor/camera` | 8.0.0 | Kamera & Galeri |
| `@capacitor/geolocation` | 8.0.0 | GPS/Lokasi |
| `@capacitor-community/bluetooth-le` | 7.3.0 | Bluetooth Printer |
| `@capacitor-community/contacts` | 7.1.0 | Akses Kontak |
| `@capacitor/browser` | 8.0.0 | In-app Browser |
| `@capacitor/local-notifications` | 8.0.0 | Notifikasi Lokal |
| `@capacitor/push-notifications` | 8.0.0 | Push Notification |

### Android Permissions (AndroidManifest.xml)

```xml
<!-- Bluetooth -->
<uses-permission android:name="android.permission.BLUETOOTH" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />

<!-- Contacts -->
<uses-permission android:name="android.permission.READ_CONTACTS" />
<uses-permission android:name="android.permission.WRITE_CONTACTS" />

<!-- Camera, Location, Storage - sudah ada sebelumnya -->
```

### Files Created/Modified

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

### Bluetooth Printer Usage

```tsx
import { useBluetoothPrinter } from '@/hooks/useBluetoothPrinter';

function MyComponent() {
  const {
    scanForPrinters,
    connectToPrinter,
    printReceipt,
    testPrint,
    isConnected,
    devices,
  } = useBluetoothPrinter();

  // Scan printer
  await scanForPrinters();

  // Connect
  await connectToPrinter(devices[0]);

  // Print struk
  await printReceipt({
    storeName: 'Aquvit Store',
    transactionNo: 'TRX-001',
    items: [...],
    total: 100000,
    // ...
  });
}
```

### Forecast / Roadmap

| Fitur | Status | Deskripsi |
|-------|--------|-----------|
| **Driver Location Tracking** | Planned | Lacak lokasi supir secara real-time |
| - Background Location Service | - | Kirim lokasi ke server meski app di background |
| - Database `driver_locations` | - | Simpan history lokasi supir |
| - Admin Monitoring UI | - | Peta untuk melihat posisi semua supir |
| - WebSocket/Polling | - | Update posisi real-time ke admin |

---

## [v3] 2025-12-27 - Dashboard Enhancement & Retasi Improvement

### New Features

42. **Dashboard - Informasi Pelanggan Aktif & Tidak Aktif**
    - **File**: `src/components/Dashboard.tsx`
    - Mengganti section "Transaksi Terbaru" dengan 2 section baru:
    - **Pelanggan Aktif**: Tabel dengan pagination, menampilkan:
      - Nama pelanggan
      - Jumlah transaksi (badge hijau)
      - Total belanja
      - Tanggal transaksi terakhir
      - Diurutkan berdasarkan jumlah transaksi (terbanyak dulu)
    - **Pelanggan Tidak Aktif**: Card grid dengan pagination, menampilkan:
      - Pelanggan yang 30+ hari tidak transaksi
      - Pelanggan yang belum pernah transaksi
      - Hari sejak transaksi terakhir
      - Total transaksi dan nominal
    - Maksimal 5 data per halaman dengan tombol navigasi slide

43. **Form Retur Retasi - Input Per Produk**
    - **Files**:
      - `src/components/ReturnRetasiDialog.tsx` - UI form baru
      - `src/types/retasi.ts` - Type dengan `item_returns`
      - `src/hooks/useRetasi.ts` - Save per-item data
      - `src/pages/RetasiPage.tsx` - Fetch items saat dialog buka
    - Sebelumnya: Input total barang kembali/error/laku secara agregat
    - Sesudah: Tabel per produk yang dibawa dengan kolom:
      | Produk | Dibawa | Kembali | Laku | Error | Selisih |
    - Validasi: Total input tidak boleh melebihi jumlah dibawa
    - Summary: Total dibawa, kembali, laku, error, dan selisih
    - Data tersimpan per produk ke tabel `retasi_items`

44. **Perbaikan Perhitungan ROE dan DER di Dashboard**
    - **File**: `src/components/Dashboard.tsx`
    - **Masalah**: ROE dan DER selalu 0 karena akun Modal tidak memiliki jurnal entries
    - **Perbaikan**: Jika akun Modal kosong, gunakan persamaan akuntansi:
      - `Modal = Total Aset - Total Kewajiban`
    - Ini menghitung retained earnings (laba ditahan) secara otomatis

45. **Perubahan Idle Timeout Login Session**
    - **File**: `src/contexts/AuthContext.tsx`
    - Sebelumnya: 5 menit timeout (terlalu cepat)
    - Sesudah: 1 jam timeout dengan warning di menit ke-55
    - Note: JWT token di auth-server tetap 7 hari (tidak diubah)

### VPS Information

```
IP: 103.197.190.54
SSH: ssh -i Aquvit.pem deployer@103.197.190.54

Services:
- PostgREST Nabire: port 3000
- PostgREST Manokwari: port 3001
- Auth Server: port 3002
- PostgreSQL: port 5432

Database: aquvit_new (nama baru dari aquvit_db)

Useful Commands:
# Restart PostgREST
sudo systemctl restart postgrest
pm2 restart postgrest

# Reload schema tanpa restart
sudo kill -SIGUSR1 $(pgrep postgrest)

# Check logs
sudo tail -f /var/log/nginx/error.log
pm2 logs auth-server

# Backup database
pg_dump -U aquvit_user -h localhost aquvit_new > backup.sql
```

### Files Modified

| File | Perubahan |
|------|-----------|
| `src/components/Dashboard.tsx` | Pelanggan aktif/tidak aktif, fix ROE/DER |
| `src/components/ReturnRetasiDialog.tsx` | Form retur per produk |
| `src/types/retasi.ts` | Type `item_returns` untuk detail per produk |
| `src/hooks/useRetasi.ts` | Save per-item data saat return |
| `src/pages/RetasiPage.tsx` | Fetch items saat buka dialog return |
| `src/contexts/AuthContext.tsx` | Idle timeout 5 menit → 1 jam |

---

## 2025-12-25 21:45 WIT (Update 11) - Fix Date Error

### Bug Fixes

41. **Fix Invalid Date Error di DeliveryCompletionDialog**
    - **File**: `src/components/DeliveryCompletionDialog.tsx`
    - **Error**: `RangeError: Invalid time value` saat deliveryDate null
    - **Fix**: Tambah null check sebelum format date

---

## 2025-12-25 21:30 WIT (Update 10) - Database Rename

### Changes

40. **Database Rename**
    - `aquavit_db` → `aquvit_db` (Nabire)
    - Update PostgREST config `/home/deployer/postgrest/postgrest.conf`
    - Restart PostgREST service

---

## 2025-12-25 21:15 WIT (Update 9) - Domain Rename

### Changes

39. **Domain Rename**
    - `app.aquvit.id` → `nbx.aquvit.id` (Nabire)
    - `erp.aquvit.id` → `mkw.aquvit.id` (Manokwari)
    - SSL certificate baru untuk kedua domain
    - Nginx config diperbarui
    - Update `client.ts`, `App.tsx`, `ServerSelector.tsx` dengan URL baru
    - Build dan deploy ke VPS

---

## 2025-12-25 23:00 WIT (Update 8) - Customer Map & Nearby Tracking

### New Features

36. **Peta Pelanggan Interaktif**
    - Peta OpenStreetMap dengan semua pelanggan yang punya koordinat
    - Marker berbeda warna: Biru (Rumahan), Hijau (Kios/Toko), Merah (Lokasi User)
    - Popup info pelanggan: foto toko, nama, alamat, jarak, tombol telepon & rute
    - Auto-fit bounds ke semua marker
    - Route: `/customer-map`

37. **Fitur Lacak Pelanggan Terdekat**
    - Daftar pelanggan terdekat dari lokasi user saat ini
    - Filter radius: 500m, 1km, 2km, 5km, 10km, Semua
    - Urutan berdasarkan jarak terdekat
    - Ranking 1-3 dengan badge warna
    - Tombol langsung: Telepon & Rute Google Maps
    - Real-time GPS tracking (watch position)

38. **Geo Utilities**
    - Haversine formula untuk hitung jarak akurat
    - Sort customers by distance
    - Filter by radius

### Dependencies Added

- `leaflet` - Library peta open source
- `react-leaflet@4.2.1` - React wrapper untuk Leaflet (compatible React 18)
- `@types/leaflet` - TypeScript definitions

### Files Created

| File | Deskripsi |
|------|-----------|
| `src/pages/CustomerMapPage.tsx` | Halaman utama peta pelanggan |
| `src/components/CustomerMap.tsx` | Komponen peta Leaflet |
| `src/components/NearbyCustomerList.tsx` | Daftar pelanggan terdekat |
| `src/utils/geoUtils.ts` | Utility untuk kalkulasi jarak |

### Files Modified

| File | Perubahan |
|------|-----------|
| `src/App.tsx` | Tambah route `/customer-map` (mobile & desktop) |
| `src/components/layout/Sidebar.tsx` | Tambah menu "Peta Pelanggan" |
| `src/globals.css` | Import Leaflet CSS + custom marker styles |

### Notes

- Fitur ini murni real-time tracking, tidak menyimpan data ke database
- Berguna untuk driver/pengantar optimasi rute pengantaran
- GPS accuracy bergantung pada perangkat user

---

## 2025-12-25 22:30 WIT (Update 7) - Bug Fixes

### Bug Fixes

32. **Fix Token Retrieval untuk SQL Backup API**
    - **File**: `src/pages/WebManagementPage.tsx`
    - **Masalah**: Backup API call gagal 401 karena token diambil dari key yang salah (`auth_token`)
    - **Perbaikan**: Token sekarang diambil dari `localStorage.getItem('postgrest_auth_session')` dan di-parse JSON untuk mengambil `access_token`

33. **Fix Auth URL untuk Local Development**
    - **File**: `src/pages/WebManagementPage.tsx`
    - **Masalah**: Di localhost, API call ke `/auth/v1/admin/backup` gagal 404 karena auth-server tidak ada
    - **Perbaikan**: Menggunakan `getTenantConfigDynamic().authUrl` yang return URL VPS (`https://app.aquvit.id/auth`) untuk dev

34. **Fix Permission Denied pada View `payroll_summary`**
    - **Database**: GRANT SELECT pada view `payroll_summary` ke role authenticated, owner, admin, cashier, supervisor
    - **Command**: `pm2 restart postgrest` untuk apply changes

35. **Cleanup Debug Console.log**
    - **File**: `src/components/PaymentConfirmationDialog.tsx`
    - **Hapus**: `console.log('📊 PaymentDialog Debug:', {...})` yang spam di console

---

## 2025-12-25 22:10 WIT (Update 6) - SQL Full Backup Feature

### New Features

31. **SQL Full Backup dari Web (Owner Only)**
    - Fitur backup database lengkap (pg_dump) langsung dari Web Management
    - Termasuk: Schema, RLS Policies (72), Functions, Triggers, dan semua Data
    - Backup disimpan di VPS: `/home/deployer/backups/`
    - Otomatis di-compress (gzip) untuk menghemat storage
    - Backup otomatis dihapus setelah 7 hari
    - List semua backup files di server
    - Download backup file ke local
    - Delete backup file dari server

### API Endpoints Added (auth-server)

| Method | Endpoint | Fungsi |
|--------|----------|--------|
| `POST` | `/auth/v1/admin/backup` | Create SQL backup |
| `GET` | `/auth/v1/admin/backups` | List all backups |
| `GET` | `/auth/v1/admin/backup/download/:filename` | Download backup file |
| `DELETE` | `/auth/v1/admin/backup/:filename` | Delete backup file |

### Files Changed

- `src/pages/WebManagementPage.tsx` - Tambah section SQL Full Backup di tab Import/Export
- `scripts/auth-server/server.js` - Tambah 4 endpoint untuk backup management

### Notes

- Fitur ini memerlukan deploy ulang auth-server ke VPS
- Backup SQL lengkap hanya bisa dijalankan di production (VPS) karena butuh akses pg_dump

---

## 2025-12-25 21:46 WIT (Update 5) - Web Management Page

### New Features

27. **Web Management Page (Owner Only)**
    - Halaman baru untuk manajemen sistem yang hanya bisa diakses oleh Owner
    - Akses via: Sidebar > Pengaturan > Web Management
    - Route: `/web-management`

28. **Tab Healthy - System Health Check**
    - Cek status koneksi Database (response time)
    - Cek status Auth API
    - Tampilkan jumlah record di tabel utama (customers, products, transactions, accounts)
    - Tombol "Run Health Check" untuk refresh status
    - Visual indicator: Healthy (hijau), Error (merah), Unknown (abu)

29. **Tab Reset Database - Selective Data Reset**
    - Pilih kategori data yang mau dihapus secara selektif
    - Kategori tersedia: Sales, Customers, Inventory, Production, Purchasing, Journal, Finance, HR, Operations, Branches, Assets, Loans, Zakat
    - "Select All" untuk memilih semua kategori
    - Warning untuk dependency antar kategori
    - Konfirmasi dengan password sebelum eksekusi
    - Dialog konfirmasi dengan detail tabel yang akan dihapus

30. **Tab Import/Export - Backup & Restore**
    - **Export (Backup)**: Download seluruh data database ke file JSON
    - Progress bar dengan status per tabel
    - File otomatis bernama `aquvit-backup-YYYY-MM-DD-HHmmss.json`
    - **Import (Restore)**: Upload file backup JSON
    - Validasi format file backup
    - Info backup: tanggal dibuat, server asal, jumlah record
    - Opsi: Hapus data existing sebelum restore (destructive)
    - Opsi: Skip restore users (lebih aman)
    - Progress bar dan detail log restore

### Files Created

- `src/pages/WebManagementPage.tsx` - Halaman utama Web Management dengan 3 tab
- `src/services/backupRestoreService.ts` - Service untuk backup/restore data via PostgREST
- `src/components/BackupRestoreDialog.tsx` - Dialog component (tidak dipakai, integrated ke page)

### Files Changed

- `src/App.tsx` - Tambah route `/web-management`
- `src/components/layout/Sidebar.tsx` - Tambah menu "Web Management" di section Pengaturan (owner only)

---

## 2025-12-25 (Update 4) - Perbaikan UI Mobile POS

### New Features

23. **Pemilihan Sales di Mobile POS**
    - Ditambahkan card Sales dengan background hijau di halaman POS mobile
    - User bisa memilih sales yang bertanggung jawab untuk transaksi
    - Jika user login dengan role `sales`, otomatis terpilih sebagai sales

24. **Input Item yang Lebih Mudah**
    - **Tombol Tambah (hijau)**: Buka sheet pilih produk dengan grid 2 kolom
    - **Pencarian produk**: Langsung cari produk dengan auto-focus
    - **Indikator keranjang**: Produk yang sudah di-cart ditandai dengan badge hijau
    - **Kontrol qty langsung**: Tombol [-] dan [+] di daftar item, plus input angka yang bisa diketik langsung
    - **Auto-select input**: Saat tap input angka, semua angka ter-select otomatis untuk replace cepat

25. **Pembayaran yang Disederhanakan**
    - Tombol metode pembayaran (Tunai, Transfer, dll) langsung tampil tanpa dropdown
    - Tombol "Lunas" dan "Belum Bayar" untuk switch cepat
    - Input bayar sebagian hanya muncul jika tidak pilih Lunas
    - Badge status "✓ Pembayaran Lunas" saat sudah bayar penuh

26. **Dialog Sukses Setelah Transaksi**
    - Setelah transaksi berhasil, muncul dialog sukses (bukan langsung redirect)
    - Menampilkan total transaksi, nama pelanggan, dan ID transaksi
    - **Cetak Struk (RawBT)**: Tombol biru untuk print thermal via RawBT
    - **Lihat Detail Transaksi**: Navigasi ke halaman transaksi dengan highlight
    - **Transaksi Baru**: Reset form untuk transaksi baru
    - **Ke Daftar Transaksi**: Navigasi ke halaman transaksi

### Improvements

- Hapus console.log debug dari `client.ts` untuk production
- Auto-select pada semua input number untuk UX lebih baik
- Spinner arrows dihilangkan pada input number untuk tampilan lebih bersih

### Files Changed

- `src/components/MobilePosForm.tsx` - Redesign UI untuk mobile POS + Success dialog
- `src/components/PosForm.tsx` - Tambah auto-select sales untuk desktop
- `src/integrations/supabase/client.ts` - Cleanup debug logs

---

## 2025-12-25 (Update 3) - Perbaikan RLS Role Inheritance

### Bug Fixes

21. **Login Error 403 Forbidden untuk Semua Role**
    - **Masalah**: User dengan role `sales`, `owner`, `admin`, `cashier`, `supir`, dll tidak bisa login - semua request API return 403 Forbidden
    - **Penyebab**: Role-role aplikasi (`owner`, `admin`, `cashier`, `supir`, `sales`, `supervisor`, `designer`, `operator`) tidak inherit dari role `authenticated`
    - **Detail**: RLS policies menggunakan `TO authenticated` tapi role aplikasi bukan member dari `authenticated`, sehingga policies tidak berlaku
    - **Perbaikan**: Grant role `authenticated` ke semua role aplikasi di PostgreSQL:

    ```sql
    -- Grant authenticated ke semua role aplikasi
    GRANT authenticated TO owner;
    GRANT authenticated TO admin;
    GRANT authenticated TO cashier;
    GRANT authenticated TO supir;
    GRANT authenticated TO sales;
    GRANT authenticated TO supervisor;
    GRANT authenticated TO designer;
    GRANT authenticated TO operator;
    ```

    - **Verifikasi**:
    ```sql
    SELECT r.rolname, ARRAY(SELECT b.rolname FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles b ON m.roleid = b.oid WHERE m.member = r.oid) as member_of
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ('owner', 'admin', 'cashier', 'supir', 'sales', 'supervisor', 'designer', 'operator');
    ```

22. **Cleanup Console Debug Logs**
    - **File**: `src/contexts/BranchContext.tsx`
    - **Perubahan**: Menghapus semua `console.log`, `console.warn`, dan `console.error` untuk production build
    - **Alasan**: Mengurangi noise di browser console dan meningkatkan performa

### Technical Notes

**Mengapa Role Harus Inherit dari `authenticated`?**

PostgREST menggunakan role-based access control (RBAC). Ketika user login dengan JWT yang memiliki role claim (misal: `sales`), PostgREST akan `SET ROLE sales` di PostgreSQL.

RLS policies di sistem ini menggunakan:
```sql
CREATE POLICY xxx ON table_name FOR ALL TO authenticated USING (true);
```

Jika role `sales` bukan member dari `authenticated`, maka policy tersebut tidak berlaku untuk role `sales`, sehingga query return 0 rows atau 403 Forbidden.

**Role Hierarchy Setelah Perbaikan:**
```
authenticated (parent role)
├── owner
├── admin
├── cashier
├── supir
├── sales
├── supervisor
├── designer
└── operator
```

---

## 2025-12-25 (Update 2) - Fix Fungsi FIFO Duplikat

### Bug Fixes

20. **Fungsi FIFO Duplikat Dihapus**
    - **Masalah**: Ada 2 fungsi `consume_inventory_fifo` di database dengan signature berbeda, menyebabkan error "function is not unique"
    - **Perbaikan**: Drop fungsi lama yang tidak punya parameter `p_material_id`

### Alur Stok (Tidak Berubah)

```
LAKU KANTOR (isOfficeSale = true):
  Transaksi Dibuat -> Stok berkurang
  Delete Transaction -> Stok dikembalikan

BUKAN LAKU KANTOR (isOfficeSale = false):
  Transaksi Dibuat -> (stok belum berubah)
  Delivery -> Stok berkurang
  Delete Delivery -> Stok dikembalikan
```

| Kondisi | Kapan Stok Berkurang | Kapan Stok Di-restore |
|---------|---------------------|----------------------|
| Laku Kantor | Saat transaksi dibuat | Saat delete transaction |
| Bukan Laku Kantor | Saat delivery | Saat delete delivery |

---

## 2025-12-25 - Implementasi FIFO Inventory untuk HPP

### Fitur Baru

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

### Alur FIFO HPP

```
PO Created -> PO Approved -> PO Received
                              |
                    inventory_batch created
                    (material_id/product_id, unit_cost dari PO)
                              |
            +-----------------+------------------+
            |                                    |
    Penjualan Produk                       Produksi
            |                                    |
    consume_inventory_fifo()         consume_inventory_fifo()
    (untuk product_id)               (untuk material_id)
            |                                    |
    HPP = sum(batch.unit_cost * qty)   Material Cost = sum(batch.unit_cost * qty)
            |                                    |
    Jurnal: Dr. HPP (5xxx)           Jurnal: Dr. Persediaan Barang (1310)
            Cr. Persediaan (1310)            Cr. Persediaan Bahan (1320)
```

### File yang Dimodifikasi

| File | Perubahan |
|------|-----------|
| `src/hooks/usePurchaseOrders.ts` | Membuat inventory_batch saat receive PO (material & product) |
| `src/hooks/useTransactions.ts` | Consume FIFO batch saat penjualan untuk HPP |
| `src/hooks/useProduction.ts` | Consume FIFO batch untuk material produksi |
| `database/fifo_inventory.sql` | SQL untuk tabel dan fungsi FIFO |

### Catatan Penting

1. **Data Historis**: PO yang sudah di-receive sebelum fitur ini aktif tidak memiliki `inventory_batch`, sehingga akan fallback ke `cost_price`
2. **Migrasi**: Untuk PO lama, bisa manually insert `inventory_batch` jika diperlukan
3. **Multi-Branch**: FIFO tracking per-branch (batch hanya dikonsumsi dari branch yang sama)

---

## 2025-12-25 - Perbaikan Sistem Komisi & Payroll

### Bug Fixes

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

### Enhancements

5. **Status Komisi Update saat Payroll Dibuat**
   - File: `src/hooks/usePayroll.ts`
   - Fitur baru: Ketika payroll record dibuat, semua `commission_entries` untuk karyawan tersebut dalam periode yang sama otomatis diupdate statusnya ke 'paid'
   - Ini memastikan komisi tidak dihitung ulang di periode berikutnya

6. **Hapus Halaman Commission Manage**
   - File: `src/App.tsx`, `src/components/layout/Sidebar.tsx`
   - Dihapus: Route `/commission-manage` dan menu di sidebar
   - Alasan: Fitur setup komisi sudah dipindahkan ke tab di halaman Employee

### Catatan Teknis

**Alur Komisi:**
1. Admin setup commission rules per produk per role di halaman Employee
2. Saat delivery selesai, `generateDeliveryCommission()` membuat entries di `commission_entries`
3. Saat sales transaction, `generateSalesCommission()` membuat entries di `commission_entries`
4. RPC `calculate_commission_for_period` menghitung total dari `commission_entries` dengan status 'pending'
5. Saat payroll dibuat, status commission entries diupdate ke 'paid'

**Alur Pemotongan Panjar:**
1. Karyawan request panjar -> `employee_advances` dengan `remaining_amount` = jumlah panjar
2. Saat payroll, admin input jumlah pemotongan panjar
3. Sistem update `remaining_amount` menggunakan FIFO dari panjar terlama
4. Journal entry dicatat: Dr. Beban Gaji, Cr. Kas, Cr. Piutang Karyawan (jika ada potongan panjar)

---

## 2024-12-24 - Perbaikan Laporan Keuangan & Integrasi Jurnal

### Bug Fixes

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

### Perbaikan Laporan Keuangan

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

### Catatan Teknis

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

// Saldo = initial_balance + sum(balanceChange dari semua jurnal)
```

---

## 2024-12-24 (Update 2) - Perbaikan Laporan Arus Kas

### Bug Fixes

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

### UI Improvements

8. **Laporan Arus Kas Menampilkan Detail per Akun**
   - File: `src/pages/FinancialReportsPage.tsx`
   - Sebelumnya: Hanya menampilkan kategori summary (Pelanggan, Pembayaran piutang, dll)
   - Sesudah: Menampilkan detail per akun lawan (`byAccount`) dari jurnal
   - Ini memungkinkan melihat semua transaksi yang mempengaruhi kas secara detail

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

## 2024-12-24 (Update 3) - Perbaikan Laporan Laba Rugi

### Bug Fixes

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
      accountsQuery = accountsQuery.eq('branch_id', branchId); // COA tidak punya branch_id
    }

    // SESUDAH (BENAR):
    const { data: accountsData } = await supabase
      .from('accounts')
      .select('id, code, name, type, is_header')
      .order('code');
    // Note: Branch filtering sudah dilakukan di level journal_entries
    ```

---

## 2024-12-24 (Update 4) - Perbaikan Final Income Statement

### Bug Fixes

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

### Penjelasan: COA Per-Branch

Sistem AQUVIT menggunakan **COA per-branch**, artinya setiap cabang memiliki akun terpisah dengan ID berbeda tapi kode yang sama:

| Branch | Account ID | Account Code | Account Name |
|--------|------------|--------------|--------------|
| Pusat | `acc-001` | `4100` | Pendapatan Usaha |
| Cabang A | `acc-101` | `4100` | Pendapatan Usaha |
| Cabang B | `acc-201` | `4100` | Pendapatan Usaha |

Karena itu, penghitungan laporan keuangan menggunakan **kode akun** sebagai identifier, bukan ID akun.

---

## 2024-12-24 (Update 5) - Perbaikan Payroll System

### Bug Fixes

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

### File yang Dimodifikasi

| File | Perubahan |
|------|-----------|
| `src/hooks/usePayroll.ts` | Perbaikan cache invalidation dengan `exact: false` |
| `database/fix_all_rls_policies.sql` | Menambahkan RLS policies untuk payroll tables |
| `database/fix_payroll_rls.sql` | SQL standalone untuk fix RLS payroll |

---

## Known Issues

| Issue | Status | Deskripsi |
|-------|--------|-----------|
| POST 401 pada payroll_records | Resolved | Fixed dengan role inheritance ke `authenticated` |
| UI tidak update setelah delete | Resolved | Fixed dengan `exact: false` pada invalidateQueries |
| UI tidak update setelah approve | Resolved | Fixed dengan `exact: false` pada invalidateQueries |
| Login 403 Forbidden | Resolved | Fixed dengan `GRANT authenticated TO <role>` |
