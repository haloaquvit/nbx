# Supabase Export & PostgreSQL Import Tools

Tools untuk export data dari Supabase dan import ke PostgreSQL VPS.

## Cara Penggunaan

### Opsi 1: Dengan Docker (Recommended)

```bash
# 1. Edit docker-compose.yml, ganti SUPABASE_ANON_KEY dengan key Anda
# 2. Build dan jalankan
cd scripts/backup
docker-compose up --build

# Output akan ada di folder ./output
```

### Opsi 2: Dengan Node.js Langsung

```bash
# 1. Set environment variables
export SUPABASE_URL="https://emfvoassfrsokqwspuml.supabase.co"
export SUPABASE_ANON_KEY="your-anon-key-here"

# 2. Jalankan export
cd scripts/backup
node export-supabase.js

# Output akan ada di folder ./output
```

### Import ke PostgreSQL VPS

```bash
# 1. Install pg dependency (jika belum)
npm install pg

# 2. Set environment variables
export POSTGRES_HOST="your-vps-ip"
export POSTGRES_PORT="5432"
export POSTGRES_DB="aquvit2"
export POSTGRES_USER="postgres"
export POSTGRES_PASSWORD="your-password"

# 3. Jalankan import
node import-to-postgres.js
```

## File Output

Setelah export, folder `output/` akan berisi:
- `accounts.json` - Data akun/COA
- `branches.json` - Data cabang
- `transactions.json` - Data transaksi
- `...` - Tabel lainnya
- `_export_summary.json` - Ringkasan export

## Catatan Penting

1. **Supabase Auth Users** - Data users di `auth.users` TIDAK ter-export karena butuh akses admin. Anda perlu:
   - Buat users baru secara manual, ATAU
   - Gunakan Supabase self-hosted untuk copy auth users

2. **Storage Files** - File yang diupload ke Supabase Storage TIDAK ter-export. Jika ada foto/file, perlu download manual.

3. **RLS Policies** - Row Level Security policies TIDAK ter-export. Perlu setup ulang di database baru.

## Troubleshooting

### Error: Table not found
Beberapa tabel mungkin tidak ada jika belum dibuat. Ini normal, script akan skip tabel tersebut.

### Error: Permission denied
Pastikan SUPABASE_ANON_KEY sudah benar dan memiliki akses read ke tabel.

### Error: Connection refused (import)
Pastikan PostgreSQL di VPS sudah berjalan dan bisa diakses dari luar (cek firewall & pg_hba.conf).
