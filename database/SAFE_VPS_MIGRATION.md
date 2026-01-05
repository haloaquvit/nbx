# PANDUAN MIGRASI AMAN KE VPS

## PRINSIP UTAMA (WAJIB DIBACA!)

### JANGAN PERNAH:
- `pg_dump` full database ke VPS
- `DROP TABLE` di production
- `TRUNCATE` tabel apapun
- `DELETE FROM` tanpa WHERE clause spesifik
- `ALTER COLUMN TYPE` tanpa backup

### YANG AMAN:
- `CREATE OR REPLACE FUNCTION` - update RPC tanpa hapus data
- `CREATE TABLE IF NOT EXISTS` - tambah tabel baru
- `ALTER TABLE ADD COLUMN IF NOT EXISTS` - tambah kolom
- `CREATE INDEX IF NOT EXISTS` - tambah index
- `CREATE VIEW OR REPLACE` - update view

---

## URUTAN MIGRASI

### 1. BACKUP DULU! (WAJIB)
```bash
# Di VPS
pg_dump -U aquavit -h 127.0.0.1 aquvit_new > backup_$(date +%Y%m%d_%H%M).sql
```

### 2. RPC Functions (PALING PENTING)
RPC adalah logic bisnis. Update ini AMAN karena pakai `CREATE OR REPLACE`.

**Urutan deploy RPC:**
```bash
# Di VPS, jalankan berurutan:
psql -U aquavit -h 127.0.0.1 -d aquvit_new

# Core Functions
\i database/rpc/00_permission_checker.sql
\i database/rpc/01_fifo_inventory_v3.sql
\i database/rpc/02_fifo_material.sql
\i database/rpc/03_journal.sql

# Transaction & Delivery
\i database/rpc/04_production.sql
\i database/rpc/05_delivery.sql
\i database/rpc/05_delivery_no_stock.sql
\i database/rpc/06_payment.sql
\i database/rpc/07_void.sql

# Business Operations
\i database/rpc/08_purchase_order.sql
\i database/rpc/09_transaction.sql
\i database/rpc/10_migration_transaction.sql
\i database/rpc/10_payroll.sql
\i database/rpc/11_expense.sql
\i database/rpc/11_migration_delivery_journal.sql
\i database/rpc/12_asset.sql
\i database/rpc/12_tax_payment.sql
\i database/rpc/13_debt_installment.sql
\i database/rpc/13_sales_journal.sql
\i database/rpc/14_account_management.sql
\i database/rpc/14_employee_advance.sql
\i database/rpc/15_coa_adjustments.sql
\i database/rpc/15_zakat.sql
\i database/rpc/16_commission_payment.sql
\i database/rpc/16_po_management.sql
\i database/rpc/17_production_void.sql
\i database/rpc/17_retasi.sql
\i database/rpc/18_payroll_management.sql
\i database/rpc/18_stock_adjustment.sql
\i database/rpc/19_delivery_management.sql
\i database/rpc/19_legacy_journal_rpc.sql
\i database/rpc/20_employee_advances.sql
\i database/rpc/21_retasi_management.sql
\i database/rpc/22_closing_entries.sql
\i database/rpc/23_zakat_management.sql
\i database/rpc/24_debt_installment.sql
```

### 3. Views (AMAN)
```bash
\i database/migrations/001_create_stock_view.sql
\i database/migrations/002_create_account_balance_view.sql
```

### 4. Restart PostgREST
```bash
pm2 restart postgrest-aquvit postgrest-mkw
```

---

## FILE BARU YANG WAJIB DEPLOY

File RPC yang baru dibuat:
1. `05_delivery_no_stock.sql` - Untuk migrasi delivery tanpa kurangi stok
2. `10_migration_transaction.sql` - Untuk migrasi transaksi lama
3. `11_migration_delivery_journal.sql` - Untuk jurnal delivery migrasi
4. `12_tax_payment.sql` - Pembayaran pajak atomic
5. `13_debt_installment.sql` - Pembayaran angsuran hutang atomic

---

## CHECKLIST SEBELUM MIGRASI

- [ ] Backup database VPS
- [ ] Test build lokal berhasil (`npm run build`)
- [ ] Semua RPC tested di lokal
- [ ] Cek tidak ada DROP/TRUNCATE di file SQL
- [ ] Cek tidak ada DELETE tanpa WHERE

---

## SCRIPT OTOMATIS (PowerShell - Windows)

```powershell
# deploy_rpc_to_vps.ps1
$VPS_HOST = "103.197.190.54"
$DB_USER = "aquavit"
$DB_NAME = "aquvit_new"
$DB_PASS = "Aquvit2024"

# Upload semua file RPC
$files = Get-ChildItem "database/rpc/*.sql" | Sort-Object Name
foreach ($file in $files) {
    Write-Host "Deploying $($file.Name)..."
    # Copy file ke VPS
    scp -i Aquvit.pem $file.FullName deployer@${VPS_HOST}:/tmp/
    # Execute di VPS
    ssh -i Aquvit.pem deployer@$VPS_HOST "PGPASSWORD='$DB_PASS' psql -U $DB_USER -h 127.0.0.1 -d $DB_NAME -f /tmp/$($file.Name)"
}

Write-Host "Restarting PostgREST..."
ssh -i Aquvit.pem deployer@$VPS_HOST "pm2 restart postgrest-aquvit postgrest-mkw"
```

---

## SCRIPT OTOMATIS (Bash - Linux/Mac)

```bash
#!/bin/bash
# deploy_rpc_to_vps.sh

VPS_HOST="103.197.190.54"
DB_USER="aquavit"
DB_NAME="aquvit_new"
DB_PASS="Aquvit2024"
KEY_FILE="Aquvit.pem"

# Deploy semua RPC
for file in database/rpc/*.sql; do
    echo "Deploying $(basename $file)..."
    scp -i $KEY_FILE "$file" deployer@$VPS_HOST:/tmp/
    ssh -i $KEY_FILE deployer@$VPS_HOST \
        "PGPASSWORD='$DB_PASS' psql -U $DB_USER -h 127.0.0.1 -d $DB_NAME -f /tmp/$(basename $file)"
done

echo "Restarting PostgREST..."
ssh -i $KEY_FILE deployer@$VPS_HOST "pm2 restart postgrest-aquvit postgrest-mkw"

echo "Done!"
```

---

## VERIFIKASI SETELAH MIGRASI

```sql
-- Cek jumlah functions
SELECT COUNT(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace;

-- Cek functions baru
SELECT proname FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
AND proname LIKE '%atomic%'
ORDER BY proname;

-- Test salah satu RPC
SELECT * FROM pay_debt_installment_atomic(
    'test-id'::uuid,
    'branch-id'::uuid,
    '1110',
    'Test'
);
```

---

## ROLLBACK JIKA ERROR

```bash
# Restore dari backup
psql -U aquavit -h 127.0.0.1 aquvit_new < backup_YYYYMMDD_HHMM.sql
```

---

Last updated: 2026-01-05
