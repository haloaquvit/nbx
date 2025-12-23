-- =====================================================
-- CLEAR DATABASE AQUVIT
-- Mengosongkan semua data KECUALI:
-- - users (data login)
-- - employees (karyawan)
-- - customers (pelanggan)
-- - profiles (profil user)
-- - branches (cabang - diperlukan untuk foreign key)
-- - accounts (chart of accounts - struktur akun)
-- - roles & role_permissions (role sistem)
-- - user_roles (role user)
-- - companies & company_settings (pengaturan perusahaan)
-- =====================================================

-- Disable triggers temporarily for faster deletion
SET session_replication_role = 'replica';

-- =====================================================
-- HAPUS DATA TRANSAKSI & KEUANGAN
-- =====================================================

-- Payment & Receivables
TRUNCATE TABLE payment_history CASCADE;
TRUNCATE TABLE accounts_payable CASCADE;

-- Transactions
TRUNCATE TABLE transaction_payments CASCADE;
TRUNCATE TABLE delivery_photos CASCADE;
TRUNCATE TABLE delivery_items CASCADE;
TRUNCATE TABLE deliveries CASCADE;
TRUNCATE TABLE transactions CASCADE;

-- Journal entries
TRUNCATE TABLE manual_journal_entry_lines CASCADE;
TRUNCATE TABLE manual_journal_entries CASCADE;

-- Cash history
TRUNCATE TABLE cash_history CASCADE;
TRUNCATE TABLE balance_adjustments CASCADE;

-- Zakat
TRUNCATE TABLE zakat_records CASCADE;
TRUNCATE TABLE nishab_reference CASCADE;

-- =====================================================
-- HAPUS DATA HR & PAYROLL
-- =====================================================

TRUNCATE TABLE advance_repayments CASCADE;
TRUNCATE TABLE employee_advances CASCADE;
TRUNCATE TABLE payroll_records CASCADE;
TRUNCATE TABLE employee_salaries CASCADE;
TRUNCATE TABLE attendance CASCADE;
TRUNCATE TABLE commission_entries CASCADE;

-- =====================================================
-- HAPUS DATA INVENTORY & PRODUKSI
-- =====================================================

TRUNCATE TABLE material_stock_movements CASCADE;
TRUNCATE TABLE production_errors CASCADE;
TRUNCATE TABLE production_records CASCADE;
TRUNCATE TABLE product_materials CASCADE;

-- =====================================================
-- HAPUS DATA PEMBELIAN
-- =====================================================

TRUNCATE TABLE purchase_order_items CASCADE;
TRUNCATE TABLE purchase_orders CASCADE;
TRUNCATE TABLE supplier_materials CASCADE;
TRUNCATE TABLE suppliers CASCADE;

-- =====================================================
-- HAPUS DATA RETASI
-- =====================================================

TRUNCATE TABLE retasi_items CASCADE;
TRUNCATE TABLE retasi CASCADE;

-- =====================================================
-- HAPUS DATA LAINNYA
-- =====================================================

TRUNCATE TABLE quotations CASCADE;
TRUNCATE TABLE notifications CASCADE;
TRUNCATE TABLE expenses CASCADE;
TRUNCATE TABLE asset_maintenance CASCADE;
TRUNCATE TABLE assets CASCADE;

-- =====================================================
-- HAPUS DATA PRICING (tapi pertahankan struktur)
-- =====================================================

TRUNCATE TABLE customer_pricings CASCADE;
TRUNCATE TABLE stock_pricings CASCADE;
TRUNCATE TABLE bonus_pricings CASCADE;
TRUNCATE TABLE commission_rules CASCADE;

-- =====================================================
-- RESET SALDO AKUN (initial_balance jadi 0)
-- =====================================================

UPDATE accounts SET initial_balance = 0, current_balance = 0;

-- Re-enable triggers
SET session_replication_role = 'origin';

-- =====================================================
-- VERIFIKASI
-- =====================================================

SELECT 'Data yang DIPERTAHANKAN:' as status;
SELECT 'users' as table_name, COUNT(*) as count FROM profiles
UNION ALL
SELECT 'employees', COUNT(*) FROM employees
UNION ALL
SELECT 'customers', COUNT(*) FROM customers
UNION ALL
SELECT 'branches', COUNT(*) FROM branches
UNION ALL
SELECT 'accounts', COUNT(*) FROM accounts
UNION ALL
SELECT 'products', COUNT(*) FROM products
UNION ALL
SELECT 'materials', COUNT(*) FROM materials
UNION ALL
SELECT 'companies', COUNT(*) FROM companies
UNION ALL
SELECT 'company_settings', COUNT(*) FROM company_settings;

SELECT 'Data yang DIHAPUS (harus 0):' as status;
SELECT 'transactions', COUNT(*) FROM transactions
UNION ALL
SELECT 'cash_history', COUNT(*) FROM cash_history
UNION ALL
SELECT 'deliveries', COUNT(*) FROM deliveries
UNION ALL
SELECT 'employee_advances', COUNT(*) FROM employee_advances
UNION ALL
SELECT 'payroll_records', COUNT(*) FROM payroll_records;
