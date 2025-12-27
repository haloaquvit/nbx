# CHANGELOG v4

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

### SSH Access

```bash
ssh -i Aquvit.pem deployer@103.197.190.54
```

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

## Forecast / Roadmap

| Fitur | Status | Deskripsi |
|-------|--------|-----------|
| **Driver Location Tracking** | Planned | Lacak lokasi supir secara real-time |
| - Background Location Service | - | Kirim lokasi ke server meski app di background |
| - Database `driver_locations` | - | Simpan history lokasi supir |
| - Admin Monitoring UI | - | Peta untuk melihat posisi semua supir |
| - WebSocket/Polling | - | Update posisi real-time ke admin |
