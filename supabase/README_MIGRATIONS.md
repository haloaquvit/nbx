# 🗃️ Database Migrations - Aquvit Fix

## 📊 Overview

**Total Migrations:** 65 files
**Total Size:** 255 KB
**Total Lines:** 7,641 baris
**Database Tables:** 42 tabel
**Last Updated:** 2025-12-17

---

## 🚀 Quick Start - Test Migrations

### **Option 1: Supabase Dashboard (RECOMMENDED)**

1. Login ke [Supabase Dashboard](https://supabase.com/dashboard)
2. Buat project baru (atau gunakan existing)
3. Buka **SQL Editor**
4. Copy isi file `combined_migrations_for_testing.sql`
5. Paste & Run
6. Verifikasi 42 tabel terbuat

**Time:** ~2 menit
**Skill Level:** Beginner

---

### **Option 2: PostgreSQL Lokal**

```bash
docker run --name aquvit-test \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 -d postgres:17

psql -h localhost -U postgres \
  -f supabase/combined_migrations_for_testing.sql
```

**Time:** ~5 menit
**Skill Level:** Intermediate

---

## 📁 File Structure

```
supabase/
├── migrations/                          # 65 migration files
│   ├── 0000_*.sql                      # Foundation
│   ├── 0001-0046_*.sql                 # Core migrations
│   ├── 0047-0056_*.sql                 # Fixes (dinomori ulang)
│   └── 0100-0116_*.sql                 # Extended features
│
├── combined_migrations_for_testing.sql # ⭐ File untuk testing (255 KB)
├── combine_migrations.cjs              # Script generator
├── MIGRATION_TESTING_GUIDE.md          # 📖 Panduan lengkap
├── MIGRATION_CHECKLIST.md              # ✅ Checklist testing
└── README_MIGRATIONS.md                # 📄 File ini
```

---

## 🗂️ Database Schema Summary

### **Sales & Transactions (8 tables)**
- `customers`, `transactions`, `quotations`
- `transaction_payments`, `deliveries`, `delivery_items`
- `retasi` (return/exchange)

### **Inventory & Production (9 tables)**
- `products`, `materials`, `product_materials` (BOM)
- `material_stock_movements`, `production_records`
- `production_errors`, `stock_pricings`, `bonus_pricings`

### **Financial (6 tables)**
- `accounts` (Chart of Accounts)
- `cash_history`, `account_transfers`
- `expenses`, `balance_adjustments`

### **HR & Payroll (6 tables)**
- `employee_salaries`, `payroll_records`
- `employee_advances`, `advance_repayments`
- `commission_rules`, `commission_entries`
- `attendance`

### **Purchasing (4 tables)**
- `suppliers`, `supplier_materials`
- `purchase_orders`, `accounts_payable`

### **Assets (3 tables)**
- `assets`, `asset_maintenance`, `notifications`

### **Islamic Finance (2 tables)**
- `zakat_records`, `nishab_reference`

### **System (4 tables)**
- `profiles`, `roles`, `role_permissions`
- `audit_logs`, `performance_logs`, `company_settings`

**Total:** 42 tables

---

## 🔄 Migration History

### **Cleanup yang Sudah Dilakukan:**

#### ✅ **Dihapus (4 files):**
- ❌ `0013_create_comprehensive_payments_table.sql.disabled`
- ❌ `9001_test_chart_of_accounts_enhancement.sql`
- ❌ `9002_test_coa_data_demo.sql`
- ❌ `9003_create_manual_journal_entries.sql`

#### ✅ **Dinomori Ulang (10 files):**
Duplicate 0028-0041 → 0047-0056

| Lama | Baru | File |
|------|------|------|
| 0028 | 0047 | fix_employee_edit_permissions |
| 0029 | 0048 | ensure_material_name_column |
| 0030 | 0049 | fix_transactions_missing_columns |
| 0031 | 0050 | add_user_input_to_production_records |
| 0035 | 0051 | update_transactions_for_delivery |
| 0037 | 0052 | create_audit_log_system |
| 0038 | 0053 | optimize_database_performance |
| 0039 | 0054 | fix_products_category_constraint |
| 0040 | 0055 | fix_commission_types |
| 0041 | 0056 | remove_unused_category_column |

---

## 📋 Migration Order

```
Phase 1: Foundation (0000-0020)
  ├─ Base schema
  ├─ User roles & permissions
  └─ RLS setup

Phase 2: Core Business (0021-0046)
  ├─ Sales & transactions
  ├─ Inventory & production
  ├─ Delivery system
  └─ Pricing rules

Phase 3: Fixes (0047-0056) ⭐ BARU DINOMORI
  └─ Bug fixes & optimizations

Phase 4: Extended Features (0100-0116)
  ├─ Financial accounting
  ├─ Payroll & HR
  ├─ Assets management
  └─ Zakat system
```

---

## ⚠️ Important Notes

### **RLS Warning**
File `0001_menonaktifkan_row_level_security_untuk_semua_tabel_.sql` **mematikan RLS**, tapi migrations selanjutnya (0004, 0005, 0032) akan **re-enable** dengan policies yang benar.

**Action:** File ini AMAN, tidak perlu dihapus (sudah ada re-enable di migration selanjutnya).

---

## 🧪 Testing Workflow

```
1. Read MIGRATION_TESTING_GUIDE.md
   ↓
2. Prepare fresh database
   ↓
3. Run combined_migrations_for_testing.sql
   ↓
4. Use MIGRATION_CHECKLIST.md
   ↓
5. Verify 42 tables created
   ↓
6. Test sample INSERT/SELECT
   ↓
7. ✅ Done!
```

---

## 🔧 Regenerate Combined File

Jika ada perubahan di migrations:

```bash
cd supabase
node combine_migrations.cjs
```

Output: `combined_migrations_for_testing.sql` (auto-updated)

---

## 📊 Statistics

### **Before Cleanup:**
- Total files: 69
- Duplicates: 10 nomor (20 files)
- Testing files: 3
- Disabled files: 1

### **After Cleanup:**
- Total files: 65 ✅
- Duplicates: 0 ✅
- Testing files: 0 ✅
- Disabled files: 0 ✅

**Improvement:** -4 files, 100% clean migrations!

---

## 🎯 Expected Results

Setelah migrations sukses:

- ✅ **42 tables** dengan relasi lengkap
- ✅ **15+ functions** untuk business logic
- ✅ **30+ triggers** untuk automation
- ✅ **50+ RLS policies** untuk security
- ✅ **8+ enum types** untuk data validation
- ✅ **100+ indexes** untuk performance

---

## 📞 Need Help?

1. **Testing Guide:** Baca `MIGRATION_TESTING_GUIDE.md`
2. **Checklist:** Gunakan `MIGRATION_CHECKLIST.md`
3. **Issues:** Cek error message & search migration file
4. **Regenerate:** Jalankan `combine_migrations.cjs`

---

## 🔗 Related Files

- **Testing Guide:** [MIGRATION_TESTING_GUIDE.md](./MIGRATION_TESTING_GUIDE.md)
- **Checklist:** [MIGRATION_CHECKLIST.md](./MIGRATION_CHECKLIST.md)
- **Combined SQL:** [combined_migrations_for_testing.sql](./combined_migrations_for_testing.sql)
- **Generator:** [combine_migrations.cjs](./combine_migrations.cjs)

---

## ✅ Status

| Item | Status |
|------|--------|
| Migrations cleaned | ✅ Done |
| Duplicates removed | ✅ Done |
| Testing files removed | ✅ Done |
| Files renumbered | ✅ Done |
| Combined file generated | ✅ Done |
| Documentation created | ✅ Done |
| Ready for testing | ✅ **YES** |

---

**Last Updated:** 2025-12-17
**Maintained By:** Aquvit Development Team
**Version:** 1.0.0
