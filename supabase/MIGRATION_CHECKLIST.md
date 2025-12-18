# 📋 Migration Testing Checklist

**Project:** Aquvit Fix - Database Migrations
**Total Migrations:** 65 files
**Test Date:** _________________
**Tested By:** _________________

---

## 🎯 Pre-Test Setup

- [ ] Database kosong sudah dibuat
- [ ] File `combined_migrations_for_testing.sql` sudah siap (255 KB)
- [ ] Sudah login ke Supabase Dashboard / PostgreSQL client
- [ ] Backup existing data (jika ada)

---

## 📊 Migration Execution

### **Step 1: Run Combined Migrations**
- [ ] Copy file `combined_migrations_for_testing.sql`
- [ ] Paste ke SQL Editor
- [ ] Klik "Run" / Execute
- [ ] **Result:** ✅ Success / ❌ Error

**Error Log (jika ada):**
```
[Tulis error message di sini]
```

---

## ✅ Database Structure Verification

### **Core Tables (Foundation)**
- [ ] `profiles` - User profiles
- [ ] `roles` - User roles (owner, admin, cashier, etc.)
- [ ] `role_permissions` - Granular permissions
- [ ] `company_settings` - Company configuration

### **Sales & Transactions (8 tables)**
- [ ] `customers` - Customer master data
- [ ] `transactions` - Main sales orders
- [ ] `quotations` - Sales quotations
- [ ] `transaction_payments` - Payment tracking
- [ ] `deliveries` - Delivery management
- [ ] `delivery_items` - Items per delivery
- [ ] `retasi` - Return/exchange transactions

### **Products & Inventory (9 tables)**
- [ ] `products` - Product catalog
- [ ] `product_materials` - Bill of Materials (BOM)
- [ ] `materials` - Raw materials
- [ ] `material_stock_movements` - Stock movement history
- [ ] `production_records` - Production tracking
- [ ] `production_errors` - Error/waste tracking
- [ ] `stock_pricings` - Dynamic pricing rules
- [ ] `bonus_pricings` - Volume-based bonus

### **Financial Accounting (6 tables)**
- [ ] `accounts` - Chart of Accounts
- [ ] `cash_history` - All cash movements
- [ ] `account_transfers` - Inter-account transfers
- [ ] `expenses` - Operating expenses
- [ ] `balance_adjustments` - Owner reconciliation

### **Purchasing & Suppliers (4 tables)**
- [ ] `suppliers` - Supplier master data
- [ ] `supplier_materials` - Price per supplier
- [ ] `purchase_orders` - PO with receipt tracking
- [ ] `accounts_payable` - Debt tracking

### **Payroll & HR (6 tables)**
- [ ] `employee_salaries` - Salary configurations
- [ ] `payroll_records` - Monthly payroll
- [ ] `employee_advances` - Cash advances (panjar)
- [ ] `advance_repayments` - Advance repayment
- [ ] `commission_rules` - Commission by product & role
- [ ] `commission_entries` - Commission calculations
- [ ] `attendance` - Check-in/out tracking

### **Assets & Maintenance (3 tables)**
- [ ] `assets` - Fixed assets with depreciation
- [ ] `asset_maintenance` - Maintenance tracking
- [ ] `notifications` - Multi-purpose notifications

### **Islamic Finance (2 tables)**
- [ ] `zakat_records` - Zakat & charity tracking
- [ ] `nishab_reference` - Gold/silver price reference

### **System (2 tables)**
- [ ] `audit_logs` - Comprehensive audit trail
- [ ] `performance_logs` - Performance monitoring

**Total Tables Created:** _____ / 42

---

## 🔧 Functions & Stored Procedures

### **User Management**
- [ ] `get_user_role()` - Get current user's role
- [ ] Function exists: ✅ / ❌
- [ ] Can execute: ✅ / ❌

### **Financial Functions**
- [ ] `calculate_balance()` - Calculate account balance
- [ ] `update_remaining_amount()` - Update transaction remaining
- [ ] Functions exist: ✅ / ❌
- [ ] Can execute: ✅ / ❌

### **Test Function Execution**
```sql
-- Test get_user_role
SELECT get_user_role();
```
**Result:** _________________

---

## 🔐 Row Level Security (RLS)

### **RLS Policies Check**
```sql
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename;
```

- [ ] RLS policies exist
- [ ] **Total Policies:** _____ (expected: 50+)

### **Critical RLS Tables**
- [ ] `profiles` - Enable RLS: ✅ / ❌
- [ ] `transactions` - Enable RLS: ✅ / ❌
- [ ] `cash_history` - Enable RLS: ✅ / ❌
- [ ] `payroll_records` - Enable RLS: ✅ / ❌

---

## 🎲 Data Type & Enum Verification

### **Enum Types**
- [ ] `user_role` (owner, admin, employee, etc.)
- [ ] `transaction_status` (draft, pending, completed, etc.)
- [ ] `payment_status` (pending, partial, paid, etc.)
- [ ] `delivery_status` (pending, shipped, delivered, etc.)
- [ ] `asset_status` (active, maintenance, disposed, etc.)
- [ ] `maintenance_type` (preventive, corrective, etc.)

**Check Query:**
```sql
SELECT typname FROM pg_type
WHERE typtype = 'e'
ORDER BY typname;
```

**Total Enums:** _____ / 8+

---

## 🔗 Foreign Key Constraints

### **Critical Relationships**
- [ ] `transactions.customer_id` → `customers.id`
- [ ] `deliveries.transaction_id` → `transactions.id`
- [ ] `product_materials.product_id` → `products.id`
- [ ] `product_materials.material_id` → `materials.id`
- [ ] `payroll_records.employee_id` → `profiles.id`

**Check Query:**
```sql
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name;
```

**Total Foreign Keys:** _____

---

## 🚀 Triggers

### **Trigger List**
```sql
SELECT trigger_name, event_object_table, action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table;
```

- [ ] Triggers created: ✅ / ❌
- [ ] **Total Triggers:** _____ (expected: 30+)

### **Critical Triggers**
- [ ] Audit log triggers (INSERT/UPDATE/DELETE)
- [ ] Auto-update timestamps
- [ ] Commission calculation triggers
- [ ] Stock movement triggers

---

## 📊 Indexes

### **Index Check**
```sql
SELECT
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

- [ ] Indexes created: ✅ / ❌
- [ ] **Total Indexes:** _____ (expected: 100+)

---

## 🧪 Functional Testing

### **Test 1: Insert Sample Data**

#### **Insert Role**
```sql
INSERT INTO roles (name, description)
VALUES ('admin', 'Administrator')
RETURNING *;
```
- [ ] Success: ✅ / ❌
- [ ] Error: _________________

#### **Insert Customer**
```sql
INSERT INTO customers (name, phone, address)
VALUES ('Test Customer', '08123456789', 'Jakarta')
RETURNING *;
```
- [ ] Success: ✅ / ❌

#### **Insert Material**
```sql
INSERT INTO materials (name, type, unit, stock)
VALUES ('Test Material', 'Stock', 'pcs', 100)
RETURNING *;
```
- [ ] Success: ✅ / ❌

#### **Insert Product**
```sql
INSERT INTO products (name, price, product_type)
VALUES ('Test Product', 100000, 'finished')
RETURNING *;
```
- [ ] Success: ✅ / ❌

### **Test 2: Query Data**

```sql
-- Check all tables have columns
SELECT table_name,
       (SELECT count(*) FROM information_schema.columns
        WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

- [ ] All tables have columns: ✅ / ❌
- [ ] No empty tables: ✅ / ❌

### **Test 3: Transaction Flow**

```sql
-- Create a transaction
INSERT INTO transactions (customer_id, total_amount, status)
VALUES (
  (SELECT id FROM customers LIMIT 1),
  500000,
  'draft'
) RETURNING *;
```

- [ ] Transaction created: ✅ / ❌

---

## 🐛 Error Tracking

### **Errors Found During Migration**

| # | Migration File | Error Message | Status | Notes |
|---|----------------|---------------|--------|-------|
| 1 |                |               | ⬜ Fixed / ⬜ Pending |       |
| 2 |                |               | ⬜ Fixed / ⬜ Pending |       |
| 3 |                |               | ⬜ Fixed / ⬜ Pending |       |

---

## ✅ Final Verification

### **Overall Results**
- [ ] All migrations executed successfully
- [ ] All tables created (42/42)
- [ ] All functions created
- [ ] All RLS policies active
- [ ] All enums created
- [ ] All foreign keys working
- [ ] All triggers working
- [ ] Sample data can be inserted
- [ ] Sample data can be queried
- [ ] No critical errors

### **Performance Check**
```sql
-- Check table sizes
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

**Total Database Size:** _________________

---

## 📝 Notes & Observations

**Observations:**
```
[Tulis catatan atau observasi di sini]
```

**Recommendations:**
```
[Tulis rekomendasi untuk improvement]
```

---

## 🎯 Sign Off

**Migration Status:** ⬜ PASSED / ⬜ FAILED / ⬜ NEEDS REVIEW

**Tested By:** _________________
**Date:** _________________
**Signature:** _________________

---

**NOTES:**
- File testing (9001-9003) sudah dihapus ✅
- File disabled (0013) sudah dihapus ✅
- Duplicates (0028-0041) sudah dinomori ulang ke 0047-0056 ✅
- Total migrations: 65 files, 255 KB, 7,641 baris ✅
