# 📋 Panduan Testing Migration Database

## 🎯 Tujuan
Dokumen ini berisi langkah-langkah untuk melakukan testing migrations di database Supabase kosong.

---

## 📦 File yang Tersedia

### 1. **combined_migrations_for_testing.sql** (255 KB, 7641 baris)
File gabungan dari **65 migration files** yang sudah diurutkan dengan benar.

### 2. **combine_migrations.cjs**
Script Node.js untuk menggabungkan semua migrations (jika perlu regenerate).

---

## 🚀 Cara Test Manual di Supabase

### **Option 1: Supabase Dashboard (Recommended)**

#### **Langkah 1: Buat Project Baru**
1. Login ke [Supabase Dashboard](https://supabase.com/dashboard)
2. Klik **"New Project"**
3. Beri nama: `aquvit-test-migrations` (atau nama lain)
4. Set password database
5. Pilih region terdekat
6. Tunggu sampai project selesai dibuat (~2 menit)

#### **Langkah 2: Jalankan Migrations**
1. Buka project yang baru dibuat
2. Klik menu **"SQL Editor"** di sidebar
3. Klik **"New Query"**
4. Buka file: `supabase/combined_migrations_for_testing.sql`
5. **Copy seluruh isi file** (Ctrl+A, Ctrl+C)
6. **Paste ke SQL Editor** (Ctrl+V)
7. Klik **"Run"** atau tekan **Ctrl+Enter**
8. Tunggu proses selesai (~30-60 detik)

#### **Langkah 3: Cek Hasil**
1. Lihat output di bagian bawah editor
2. Jika sukses, akan muncul: `Success. No rows returned`
3. Jika ada error, akan muncul pesan error dengan nomor baris

#### **Langkah 4: Verifikasi Schema**
1. Klik menu **"Table Editor"** di sidebar
2. Cek apakah semua tabel sudah terbuat:

**Expected Tables (42 tabel):**
```
✓ profiles
✓ roles
✓ role_permissions
✓ customers
✓ accounts
✓ materials
✓ products
✓ product_materials
✓ material_stock_movements
✓ production_records
✓ production_errors
✓ transactions
✓ quotations
✓ transaction_payments
✓ deliveries
✓ delivery_items
✓ retasi
✓ employee_advances
✓ advance_repayments
✓ expenses
✓ purchase_orders
✓ suppliers
✓ supplier_materials
✓ accounts_payable
✓ company_settings
✓ cash_history
✓ account_transfers
✓ balance_adjustments
✓ attendance
✓ employee_salaries
✓ payroll_records
✓ advance_repayments
✓ commission_rules
✓ commission_entries
✓ stock_pricings
✓ bonus_pricings
✓ audit_logs
✓ performance_logs
✓ notifications
✓ assets
✓ asset_maintenance
✓ zakat_records
✓ nishab_reference
```

5. Klik **"Database"** → **"Schemas"** untuk melihat semua tabel

#### **Langkah 5: Test Functions**
1. Kembali ke **SQL Editor**
2. Jalankan query test:

```sql
-- Test 1: Cek semua tabel
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Test 2: Cek semua functions
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
ORDER BY routine_name;

-- Test 3: Cek RLS policies
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Test 4: Cek triggers
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- Test 5: Test insert sample data
INSERT INTO roles (name, description)
VALUES ('admin', 'Administrator')
RETURNING *;
```

---

### **Option 2: Docker PostgreSQL Lokal**

Jika ingin test di lokal tanpa Supabase:

```bash
# 1. Start PostgreSQL container
docker run --name aquvit-test-db \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=aquvit_test \
  -p 5432:5432 \
  -d postgres:17

# 2. Run migrations
psql -h localhost -U postgres -d aquvit_test \
  -f supabase/combined_migrations_for_testing.sql

# 3. Check tables
psql -h localhost -U postgres -d aquvit_test \
  -c "\dt public.*"

# 4. Cleanup when done
docker stop aquvit-test-db
docker rm aquvit-test-db
```

---

### **Option 3: Supabase CLI Lokal**

Jika sudah punya Docker dan Supabase CLI:

```bash
# 1. Start Supabase local
npx supabase start

# 2. Reset database (fresh start)
npx supabase db reset

# 3. Check status
npx supabase status

# 4. Run individual migrations (optional)
npx supabase db push

# 5. Check tables
npx supabase db diff
```

---

## ✅ Checklist Verifikasi

### **Database Structure**
- [ ] Semua 42 tabel terbuat
- [ ] Tidak ada error saat migration
- [ ] Foreign keys terbuat dengan benar
- [ ] Indexes terbuat dengan benar

### **Functions & Triggers**
- [ ] Function `get_user_role()` ada
- [ ] Function `update_remaining_amount()` ada
- [ ] Function `calculate_balance()` ada
- [ ] Triggers untuk audit_logs berfungsi

### **Row Level Security (RLS)**
- [ ] RLS enabled di tabel yang perlu
- [ ] Policies terbuat dengan benar
- [ ] Test insert/select dengan user berbeda

### **Data Types & Enums**
- [ ] Enum `user_role` terbuat
- [ ] Enum `transaction_status` terbuat
- [ ] Enum `payment_status` terbuat
- [ ] JSONB fields berfungsi

### **Constraints**
- [ ] NOT NULL constraints ada
- [ ] UNIQUE constraints ada
- [ ] CHECK constraints ada
- [ ] DEFAULT values ada

---

## 🐛 Common Errors & Solutions

### **Error: "relation already exists"**
**Penyebab:** Tabel sudah ada di database
**Solusi:**
```sql
-- Drop semua tabel dan mulai dari awal
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
-- Jalankan ulang migrations
```

### **Error: "type already exists"**
**Penyebab:** Enum type sudah ada
**Solusi:**
```sql
-- Drop enum type
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS transaction_status CASCADE;
-- Jalankan ulang migrations
```

### **Error: "column does not exist"**
**Penyebab:** Migration tidak dijalankan sesuai urutan
**Solusi:** Pastikan menggunakan `combined_migrations_for_testing.sql` yang sudah terurut

### **Error: "permission denied"**
**Penyebab:** User tidak punya permission
**Solusi:** Gunakan user `postgres` atau superuser

---

## 📊 Expected Results

Jika semua migrations berhasil, Anda akan punya:

- ✅ **42 tabel** dengan relasi lengkap
- ✅ **15+ functions** untuk business logic
- ✅ **30+ triggers** untuk automation
- ✅ **50+ RLS policies** untuk security
- ✅ **8 enum types** untuk data validation
- ✅ **100+ indexes** untuk performance

**Total SQL Lines:** 7,641 baris
**Total Migrations:** 65 files

---

## 🔄 Regenerate Combined File

Jika ada perubahan di migrations dan perlu regenerate:

```bash
cd supabase
node combine_migrations.cjs
```

File `combined_migrations_for_testing.sql` akan di-update otomatis.

---

## 📝 Migration Order

File migrations sudah diurutkan dengan benar:

```
0000-0056  → Core migrations (base schema, fixes)
0100-0116  → Extended features (payroll, assets, zakat)
```

**PENTING:** File `001_create_transaction_payment_tracking.sql` akan otomatis diurutkan oleh script.

---

## ⚠️ NOTES

1. **File Testing SUDAH DIHAPUS:**
   - ❌ `9001_test_chart_of_accounts_enhancement.sql`
   - ❌ `9002_test_coa_data_demo.sql`
   - ❌ `9003_create_manual_journal_entries.sql`

2. **File Disabled SUDAH DIHAPUS:**
   - ❌ `0013_create_comprehensive_payments_table.sql.disabled`

3. **Duplicates SUDAH DINOMORI ULANG:**
   - 10 file duplicate sudah direnomori dari 0047-0056

4. **RLS Warning:**
   - File `0001` mematikan RLS, tapi migrations selanjutnya akan re-enable dengan policies yang benar

---

## 🎉 Success Criteria

Migration dianggap **SUKSES** jika:

1. ✅ Tidak ada error di SQL Editor
2. ✅ Semua 42 tabel terbuat
3. ✅ Sample INSERT berhasil
4. ✅ SELECT berhasil
5. ✅ Functions dapat dipanggil
6. ✅ Triggers berfungsi

---

## 📞 Troubleshooting

Jika ada masalah:

1. **Copy error message lengkap**
2. **Cari nomor baris error** di file combined
3. **Cek migration file** yang bermasalah
4. **Fix migration** individual
5. **Regenerate combined file**
6. **Test ulang**

---

**Last Updated:** 2025-12-17
**Total Migrations:** 65 files
**Total Size:** 255 KB
