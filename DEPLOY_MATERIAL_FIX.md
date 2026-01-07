# Deploy Material Stock Fix - Instructions

## Overview
Deployment script untuk memperbaiki masalah "gagal potong stock product not found" pada penjualan material.

## Files Changed
1. `database/rpc/05_delivery.sql` - Support material detection & FIFO
2. `database/rpc/05_delivery_no_stock.sql` - Filter materials from delivery
3. `database/rpc/09_transaction.sql` - Direct material sales (no delivery needed)
4. `src/hooks/useDeliveries.ts` - Filter out materials from delivery
5. `src/hooks/useTransactions.ts` - Send material_id for materials

## Prerequisites
- SSH Access: `ssh -i Aquvit_temp.pem -o StrictHostKeyChecking=no deployer@103.197.190.54`
- Database password: `Aquvit2024`

## Deployment Steps

### Step 1: Connect to VPS
```bash
ssh -i Aquvit_temp.pem -o StrictHostKeyChecking=no deployer@103.197.190.54
```

### Step 2: Upload Deployment Script
Dari local machine (di folder project):
```bash
scp -i Aquvit_temp.pem deploy_material_fix.sh deployer@103.197.190.54:/home/deployer/
scp -i Aquvit_temp.pem database/rpc/05_delivery.sql deployer@103.197.190.54:/home/deployer/
scp -i Aquvit_temp.pem database/rpc/05_delivery_no_stock.sql deployer@103.197.190.54:/home/deployer/
scp -i Aquvit_temp.pem database/rpc/09_transaction.sql deployer@103.197.190.54:/home/deployer/
```

### Step 3: Deploy to Nabire Database
Setelah SSH ke VPS:
```bash
cd /home/deployer
chmod +x deploy_material_fix.sh
./deploy_material_fix.sh nabire
```

### Step 4: Deploy to Manokwari Database
```bash
./deploy_material_fix.sh manokwari
```

### Step 5: Verify Deployment
Cek status PostgREST:
```bash
pm2 list
pm2 logs postgrest-aquvit --lines 50
pm2 logs postgrest-mkw --lines 50
```

## Testing After Deployment

### Test 1: Create Material Transaction
1. Buka aplikasi Aquvit
2. Buat transaksi baru dengan item material
3. Pastikan transaction berhasil dibuat
4. Cek stok bahan baku berkurang

### Test 2: Verify Stock Deduction
```sql
-- Di database, cek material stock
SELECT * FROM material_batches WHERE material_id = '<material_uuid>' ORDER BY created_at DESC LIMIT 5;
```

### Test 3: Check Journal Entry
```sql
-- Cek journal untuk transaksi material
SELECT 
  je.entry_number,
  je.entry_date,
  je.description,
  je.reference_id,
  je.reference_type,
  je.is_voided,
  jel.account_id,
  a.code,
  a.name,
  jel.debit_amount,
  jel.credit_amount
FROM journal_entries je
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
JOIN accounts a ON a.id = jel.account_id
WHERE je.reference_id = '<transaction_id>'
ORDER BY je.entry_date DESC;
```

Expected journal for material sale:
```
Dr. 1110 Kas / 1210 Piutang   Rp XXX
Cr. 4100 Pendapatan Penjualan   Rp XXX
Dr. 5100 HPP                    Rp XXX
Cr. 1320 Persediaan Bahan Baku    Rp XXX
```

### Test 4: Verify No Delivery for Material
```sql
-- Cek tidak ada delivery untuk transaction material
SELECT * FROM deliveries WHERE transaction_id = '<transaction_id>';
-- Should return 0 rows for material-only transactions
```

## Rollback Plan
Jika ada masalah, restore backup:
```bash
# Connect to database
PGPASSWORD='Aquvit2024' psql -U aquavit -h 127.0.0.1 -d aquvit_new

# Restore from backup (replace with actual backup file)
\i /path/to/backup/aquvit_new_functions.sql

# Restart PostgREST
pm2 restart postgrest-aquvit
```

## Troubleshooting

### Issue: Permission Denied
```bash
chmod +x deploy_material_fix.sh
```

### Issue: RPC Not Found After Deployment
```bash
# Check if RPC exists
SELECT * FROM pg_proc WHERE proname LIKE '%delivery%' OR proname LIKE '%transaction%';
```

### Issue: PostgREST Not Loading New Functions
```bash
# Force restart PostgREST
pm2 restart postgrest-aquvit
pm2 restart postgrest-mkw
pm2 logs postgrest-aquvit --err
```

### Issue: SQL Syntax Error
```bash
# Check SQL syntax locally first
PGPASSWORD='Aquvit2024' psql -U aquavit -h 127.0.0.1 -d aquvit_new -f database/rpc/05_delivery.sql
```

## Deployment Checklist
- [ ] Connect to VPS via SSH
- [ ] Upload deployment script to VPS
- [ ] Upload RPC files to VPS
- [ ] Make script executable
- [ ] Deploy to Nabire database
- [ ] Deploy to Manokwari database
- [ ] Verify PostgREST restarted successfully
- [ ] Test material sales in frontend
- [ ] Verify stock deduction works
- [ ] Check journal entries are correct
- [ ] Verify no delivery created for materials

## Support
Jika ada masalah:
1. Cek PM2 logs: `pm2 logs`
2. Cek PostgREST logs: `pm2 logs postgrest-aquvit --err`
3. Cek PostgreSQL logs: `sudo tail -f /var/log/postgresql/postgresql-14-main.log`
