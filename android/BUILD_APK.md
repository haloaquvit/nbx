# Panduan Build APK Terpisah (Nabire & Manokwari)

## Persiapan

### 1. Generate Icon dari Logo
1. Buka Android Studio
2. Klik kanan folder `app/src/main/res` → New → Image Asset
3. Icon Type: **Launcher Icons (Adaptive and Legacy)**
4. Source Asset: **Image** → pilih `Aquvit logo.png` dari root folder project
5. Sesuaikan padding dan posisi agar logo terlihat jelas
6. Klik Next → Finish

### 2. Update App Name (Opsional)
Edit `android/app/src/main/res/values/strings.xml`:
- Untuk Nabire: `<string name="app_name">Aquvit Nabire</string>`
- Untuk Manokwari: `<string name="app_name">Aquvit Manokwari</string>`

## Build APK

### Cara 1: Menggunakan Command Line

#### Build untuk Nabire:
```bash
# Di folder root project
npm run apk:nabire

# Lalu buka Android Studio dan build APK:
# Build → Build Bundle(s) / APK(s) → Build APK(s)
```

#### Build untuk Manokwari:
```bash
npm run apk:manokwari

# Build APK di Android Studio
```

### Cara 2: Menggunakan Batch File

#### Nabire:
Jalankan `android\build_nabire.bat`

#### Manokwari:
Jalankan `android\build_manokwari.bat`

## Lokasi APK Output

APK akan tersedia di:
`android/app/build/outputs/apk/debug/app-debug.apk`

## Catatan Penting

- Setiap build APK hanya terhubung ke SATU server
- APK Nabire → https://nbx.aquvit.id
- APK Manokwari → https://mkw.aquvit.id
- Server selector TIDAK akan muncul pada APK yang di-build dengan cara ini
- Rename APK sesuai target server setelah build (contoh: `aquvit-nabire.apk`)
