# Deploy Instructions: Sync aquvit_dev → Production

## Tujuan
Menyamakan schema dan functions di **aquvit_new** (Nabire) dan **mkw_db** (Manokwari) dengan **aquvit_dev**.

## Yang Akan Dilakukan
1. ✅ Backup database production
2. ✅ Hapus SEMUA functions lama (data TIDAK terhapus!)
3. ✅ Add missing columns/tables
4. ✅ Deploy semua RPC functions baru
5. ✅ Restart PostgREST

---

## Cara Deploy

### Option 1: Upload & Run di VPS

```bash
# 1. Dari Windows, upload files ke VPS
cd "d:\App\Aquvit Fix - Copy"

# Upload semua file
scp -i Aquvit.pem database/full_sync_to_production.sql deployer@103.197.190.54:/home/deployer/deploy/
scp -i Aquvit.pem database/deploy_full.sh deployer@103.197.190.54:/home/deployer/deploy/
scp -r -i Aquvit.pem database/rpc deployer@103.197.190.54:/home/deployer/deploy/

# 2. SSH ke VPS
ssh -i Aquvit.pem deployer@103.197.190.54

# 3. Jalankan deploy script
cd /home/deployer/deploy
chmod +x deploy_full.sh
./deploy_full.sh
```

### Option 2: Manual Step-by-Step

```bash
# SSH ke VPS
ssh -i Aquvit.pem deployer@103.197.190.54

# Set variables
DB_USER="aquavit"
DB_PASS="Aquvit2024"
DB_HOST="127.0.0.1"

# === NABIRE ===

# 1. Backup
PGPASSWORD="$DB_PASS" pg_dump -U $DB_USER -h $DB_HOST -d aquvit_new \
  --no-owner -F c -f ~/backups/nabire_pre_sync.dump

# 2. Sync schema (hapus functions + add columns)
PGPASSWORD="$DB_PASS" psql -U $DB_USER -h $DB_HOST -d aquvit_new \
  -f /home/deployer/deploy/full_sync_to_production.sql

# 3. Deploy RPC (satu per satu atau semua)
for f in /home/deployer/deploy/rpc/*.sql; do
  echo "Deploying $f..."
  PGPASSWORD="$DB_PASS" psql -U $DB_USER -h $DB_HOST -d aquvit_new -f "$f"
done

# === MANOKWARI ===
# (ulangi langkah yang sama dengan -d mkw_db)

# 4. Restart PostgREST
pm2 restart postgrest-aquvit postgrest-mkw
```

---

## Verifikasi

```bash
# Cek jumlah functions
PGPASSWORD='Aquvit2024' psql -U aquavit -h 127.0.0.1 -d aquvit_new \
  -c "SELECT COUNT(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace;"

# Cek function tertentu
PGPASSWORD='Aquvit2024' psql -U aquavit -h 127.0.0.1 -d aquvit_new \
  -c "SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace ORDER BY proname;"

# Test API
curl -s https://nabire.aquvit.id/rest/v1/transactions?limit=1
curl -s https://mkw.aquvit.id/rest/v1/transactions?limit=1
```

---

## Rollback (Jika Bermasalah)

```bash
# Restore dari backup
PGPASSWORD='Aquvit2024' pg_restore -U aquavit -h 127.0.0.1 -d aquvit_new \
  --clean --if-exists ~/backups/nabire_pre_sync.dump

# Restart PostgREST
pm2 restart postgrest-aquvit postgrest-mkw
```

---

## Troubleshooting

### Error: "function already exists with same argument types"
```sql
-- Hapus function yang conflict
DROP FUNCTION IF EXISTS function_name(arg_types) CASCADE;
```

### Error: "column does not exist"
```sql
-- Tambah column yang missing
ALTER TABLE table_name ADD COLUMN IF NOT EXISTS column_name TYPE;
```

### Error: "permission denied"
```sql
-- Grant ulang
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
```

### PostgREST tidak reload schema
```bash
# Kill dan start ulang
pm2 delete postgrest-aquvit postgrest-mkw
pm2 start postgrest --name postgrest-aquvit -- /etc/postgrest/aquvit.conf
pm2 start postgrest --name postgrest-mkw -- /etc/postgrest/mkw.conf
```
