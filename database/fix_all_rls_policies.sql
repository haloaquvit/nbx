-- Fix All RLS Policies for PostgREST
-- This script updates all policies to include specific roles instead of just 'public'
-- Run as: sudo -u postgres psql -d aquavit_master -f fix_all_rls_policies.sql

-- Define roles for different permission levels
-- ALL ROLES: owner, admin, supervisor, cashier, designer, operator, supir, authenticated
-- ADMIN ONLY: owner, admin
-- READ ONLY: all roles can read

BEGIN;

-- ============================================================
-- PRICING TABLES (No policies exist - RLS is on but blocking all)
-- ============================================================

-- bonus_pricings
DROP POLICY IF EXISTS bonus_pricings_select ON bonus_pricings;
DROP POLICY IF EXISTS bonus_pricings_insert ON bonus_pricings;
DROP POLICY IF EXISTS bonus_pricings_update ON bonus_pricings;
DROP POLICY IF EXISTS bonus_pricings_delete ON bonus_pricings;

CREATE POLICY bonus_pricings_select ON bonus_pricings FOR SELECT TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated USING (true);
CREATE POLICY bonus_pricings_insert ON bonus_pricings FOR INSERT TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated WITH CHECK (true);
CREATE POLICY bonus_pricings_update ON bonus_pricings FOR UPDATE TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated USING (true);
CREATE POLICY bonus_pricings_delete ON bonus_pricings FOR DELETE TO owner, admin USING (true);

-- stock_pricings
DROP POLICY IF EXISTS stock_pricings_select ON stock_pricings;
DROP POLICY IF EXISTS stock_pricings_insert ON stock_pricings;
DROP POLICY IF EXISTS stock_pricings_update ON stock_pricings;
DROP POLICY IF EXISTS stock_pricings_delete ON stock_pricings;

CREATE POLICY stock_pricings_select ON stock_pricings FOR SELECT TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated USING (true);
CREATE POLICY stock_pricings_insert ON stock_pricings FOR INSERT TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated WITH CHECK (true);
CREATE POLICY stock_pricings_update ON stock_pricings FOR UPDATE TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated USING (true);
CREATE POLICY stock_pricings_delete ON stock_pricings FOR DELETE TO owner, admin USING (true);

-- customer_pricings
DROP POLICY IF EXISTS customer_pricings_select ON customer_pricings;
DROP POLICY IF EXISTS customer_pricings_insert ON customer_pricings;
DROP POLICY IF EXISTS customer_pricings_update ON customer_pricings;
DROP POLICY IF EXISTS customer_pricings_delete ON customer_pricings;

CREATE POLICY customer_pricings_select ON customer_pricings FOR SELECT TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated USING (true);
CREATE POLICY customer_pricings_insert ON customer_pricings FOR INSERT TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated WITH CHECK (true);
CREATE POLICY customer_pricings_update ON customer_pricings FOR UPDATE TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated USING (true);
CREATE POLICY customer_pricings_delete ON customer_pricings FOR DELETE TO owner, admin USING (true);

-- ============================================================
-- ACCOUNTS
-- ============================================================
DROP POLICY IF EXISTS accounts_select ON accounts;
DROP POLICY IF EXISTS accounts_insert ON accounts;
DROP POLICY IF EXISTS accounts_update ON accounts;
DROP POLICY IF EXISTS accounts_delete ON accounts;

CREATE POLICY accounts_select ON accounts FOR SELECT TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated USING (true);
CREATE POLICY accounts_insert ON accounts FOR INSERT TO owner, admin, supervisor, cashier, authenticated WITH CHECK (true);
CREATE POLICY accounts_update ON accounts FOR UPDATE TO owner, admin, supervisor, cashier, authenticated USING (true);
CREATE POLICY accounts_delete ON accounts FOR DELETE TO owner, admin USING (true);

-- ============================================================
-- ACCOUNTS_PAYABLE
-- ============================================================
DROP POLICY IF EXISTS "Allow all for accounts_payable" ON accounts_payable;
DROP POLICY IF EXISTS accounts_payable_select ON accounts_payable;
DROP POLICY IF EXISTS accounts_payable_insert ON accounts_payable;
DROP POLICY IF EXISTS accounts_payable_update ON accounts_payable;
DROP POLICY IF EXISTS accounts_payable_delete ON accounts_payable;

CREATE POLICY accounts_payable_select ON accounts_payable FOR SELECT TO owner, admin, supervisor, cashier, authenticated USING (true);
CREATE POLICY accounts_payable_insert ON accounts_payable FOR INSERT TO owner, admin, supervisor, cashier, authenticated WITH CHECK (true);
CREATE POLICY accounts_payable_update ON accounts_payable FOR UPDATE TO owner, admin, supervisor, cashier, authenticated USING (true);
CREATE POLICY accounts_payable_delete ON accounts_payable FOR DELETE TO owner, admin USING (true);

-- ============================================================
-- ASSET_MAINTENANCE
-- ============================================================
DROP POLICY IF EXISTS asset_maintenance_select ON asset_maintenance;
DROP POLICY IF EXISTS asset_maintenance_insert ON asset_maintenance;
DROP POLICY IF EXISTS asset_maintenance_update ON asset_maintenance;
DROP POLICY IF EXISTS asset_maintenance_delete ON asset_maintenance;

CREATE POLICY asset_maintenance_select ON asset_maintenance FOR SELECT TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated USING (true);
CREATE POLICY asset_maintenance_insert ON asset_maintenance FOR INSERT TO owner, admin, supervisor, authenticated WITH CHECK (true);
CREATE POLICY asset_maintenance_update ON asset_maintenance FOR UPDATE TO owner, admin, supervisor, authenticated USING (true);
CREATE POLICY asset_maintenance_delete ON asset_maintenance FOR DELETE TO owner, admin USING (true);

-- ============================================================
-- ASSETS
-- ============================================================
DROP POLICY IF EXISTS assets_select ON assets;
DROP POLICY IF EXISTS assets_insert ON assets;
DROP POLICY IF EXISTS assets_update ON assets;
DROP POLICY IF EXISTS assets_delete ON assets;

CREATE POLICY assets_select ON assets FOR SELECT TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated USING (true);
CREATE POLICY assets_insert ON assets FOR INSERT TO owner, admin, supervisor, authenticated WITH CHECK (true);
CREATE POLICY assets_update ON assets FOR UPDATE TO owner, admin, supervisor, authenticated USING (true);
CREATE POLICY assets_delete ON assets FOR DELETE TO owner, admin USING (true);

-- ============================================================
-- ATTENDANCE
-- ============================================================
DROP POLICY IF EXISTS attendance_select ON attendance;
DROP POLICY IF EXISTS attendance_insert ON attendance;
DROP POLICY IF EXISTS attendance_update ON attendance;
DROP POLICY IF EXISTS attendance_delete ON attendance;

CREATE POLICY attendance_select ON attendance FOR SELECT TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated USING (true);
CREATE POLICY attendance_insert ON attendance FOR INSERT TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated WITH CHECK (true);
CREATE POLICY attendance_update ON attendance FOR UPDATE TO owner, admin, supervisor, authenticated USING (true);
CREATE POLICY attendance_delete ON attendance FOR DELETE TO owner, admin USING (true);

-- ============================================================
-- BRANCHES
-- ============================================================
DROP POLICY IF EXISTS branches_manage ON branches;
DROP POLICY IF EXISTS branches_select ON branches;
DROP POLICY IF EXISTS branches_insert ON branches;
DROP POLICY IF EXISTS branches_update ON branches;
DROP POLICY IF EXISTS branches_delete ON branches;

CREATE POLICY branches_select ON branches FOR SELECT TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated USING (true);
CREATE POLICY branches_insert ON branches FOR INSERT TO owner, admin WITH CHECK (true);
CREATE POLICY branches_update ON branches FOR UPDATE TO owner, admin USING (true);
CREATE POLICY branches_delete ON branches FOR DELETE TO owner, admin USING (true);

-- ============================================================
-- CASH_HISTORY
-- ============================================================
DROP POLICY IF EXISTS cash_history_select ON cash_history;
DROP POLICY IF EXISTS cash_history_insert ON cash_history;
DROP POLICY IF EXISTS cash_history_update ON cash_history;
DROP POLICY IF EXISTS cash_history_delete ON cash_history;

CREATE POLICY cash_history_select ON cash_history FOR SELECT TO owner, admin, supervisor, cashier, authenticated USING (true);
CREATE POLICY cash_history_insert ON cash_history FOR INSERT TO owner, admin, supervisor, cashier, authenticated WITH CHECK (true);
CREATE POLICY cash_history_update ON cash_history FOR UPDATE TO owner, admin, supervisor, authenticated USING (true);
CREATE POLICY cash_history_delete ON cash_history FOR DELETE TO owner, admin USING (true);

-- ============================================================
-- COMPANIES
-- ============================================================
DROP POLICY IF EXISTS companies_select ON companies;
DROP POLICY IF EXISTS companies_manage ON companies;
DROP POLICY IF EXISTS companies_insert ON companies;
DROP POLICY IF EXISTS companies_update ON companies;
DROP POLICY IF EXISTS companies_delete ON companies;

CREATE POLICY companies_select ON companies FOR SELECT TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated USING (true);
CREATE POLICY companies_insert ON companies FOR INSERT TO owner, admin WITH CHECK (true);
CREATE POLICY companies_update ON companies FOR UPDATE TO owner, admin USING (true);
CREATE POLICY companies_delete ON companies FOR DELETE TO owner USING (true);

-- ============================================================
-- COMPANY_SETTINGS
-- ============================================================
DROP POLICY IF EXISTS company_settings_select ON company_settings;
DROP POLICY IF EXISTS company_settings_insert ON company_settings;
DROP POLICY IF EXISTS company_settings_update ON company_settings;
DROP POLICY IF EXISTS company_settings_delete ON company_settings;

CREATE POLICY company_settings_select ON company_settings FOR SELECT TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated USING (true);
CREATE POLICY company_settings_insert ON company_settings FOR INSERT TO owner, admin WITH CHECK (true);
CREATE POLICY company_settings_update ON company_settings FOR UPDATE TO owner, admin USING (true);
CREATE POLICY company_settings_delete ON company_settings FOR DELETE TO owner USING (true);

-- ============================================================
-- CUSTOMERS
-- ============================================================
DROP POLICY IF EXISTS customers_select ON customers;
DROP POLICY IF EXISTS customers_insert ON customers;
DROP POLICY IF EXISTS customers_update ON customers;
DROP POLICY IF EXISTS customers_delete ON customers;

CREATE POLICY customers_select ON customers FOR SELECT TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated USING (true);
CREATE POLICY customers_insert ON customers FOR INSERT TO owner, admin, supervisor, cashier, supir, authenticated WITH CHECK (true);
CREATE POLICY customers_update ON customers FOR UPDATE TO owner, admin, supervisor, cashier, authenticated USING (true);
CREATE POLICY customers_delete ON customers FOR DELETE TO owner, admin USING (true);

-- ============================================================
-- DELIVERIES
-- ============================================================
DROP POLICY IF EXISTS deliveries_manage ON deliveries;
DROP POLICY IF EXISTS deliveries_select ON deliveries;
DROP POLICY IF EXISTS deliveries_insert ON deliveries;
DROP POLICY IF EXISTS deliveries_update ON deliveries;
DROP POLICY IF EXISTS deliveries_delete ON deliveries;

CREATE POLICY deliveries_select ON deliveries FOR SELECT TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated USING (true);
CREATE POLICY deliveries_insert ON deliveries FOR INSERT TO owner, admin, supervisor, cashier, supir, authenticated WITH CHECK (true);
CREATE POLICY deliveries_update ON deliveries FOR UPDATE TO owner, admin, supervisor, cashier, supir, authenticated USING (true);
CREATE POLICY deliveries_delete ON deliveries FOR DELETE TO owner, admin USING (true);

-- ============================================================
-- DELIVERY_ITEMS
-- ============================================================
DROP POLICY IF EXISTS delivery_items_manage ON delivery_items;
DROP POLICY IF EXISTS delivery_items_select ON delivery_items;
DROP POLICY IF EXISTS delivery_items_insert ON delivery_items;
DROP POLICY IF EXISTS delivery_items_update ON delivery_items;
DROP POLICY IF EXISTS delivery_items_delete ON delivery_items;

CREATE POLICY delivery_items_select ON delivery_items FOR SELECT TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated USING (true);
CREATE POLICY delivery_items_insert ON delivery_items FOR INSERT TO owner, admin, supervisor, cashier, supir, authenticated WITH CHECK (true);
CREATE POLICY delivery_items_update ON delivery_items FOR UPDATE TO owner, admin, supervisor, cashier, supir, authenticated USING (true);
CREATE POLICY delivery_items_delete ON delivery_items FOR DELETE TO owner, admin USING (true);

-- ============================================================
-- EMPLOYEE_ADVANCES
-- ============================================================
DROP POLICY IF EXISTS employee_advances_select ON employee_advances;
DROP POLICY IF EXISTS employee_advances_insert ON employee_advances;
DROP POLICY IF EXISTS employee_advances_update ON employee_advances;
DROP POLICY IF EXISTS employee_advances_delete ON employee_advances;

CREATE POLICY employee_advances_select ON employee_advances FOR SELECT TO owner, admin, supervisor, cashier, authenticated USING (true);
CREATE POLICY employee_advances_insert ON employee_advances FOR INSERT TO owner, admin, supervisor, cashier, authenticated WITH CHECK (true);
CREATE POLICY employee_advances_update ON employee_advances FOR UPDATE TO owner, admin, supervisor, authenticated USING (true);
CREATE POLICY employee_advances_delete ON employee_advances FOR DELETE TO owner, admin USING (true);

-- ============================================================
-- EXPENSES
-- ============================================================
DROP POLICY IF EXISTS expenses_select ON expenses;
DROP POLICY IF EXISTS expenses_insert ON expenses;
DROP POLICY IF EXISTS expenses_update ON expenses;
DROP POLICY IF EXISTS expenses_delete ON expenses;

CREATE POLICY expenses_select ON expenses FOR SELECT TO owner, admin, supervisor, cashier, authenticated USING (true);
CREATE POLICY expenses_insert ON expenses FOR INSERT TO owner, admin, supervisor, cashier, authenticated WITH CHECK (true);
CREATE POLICY expenses_update ON expenses FOR UPDATE TO owner, admin, supervisor, authenticated USING (true);
CREATE POLICY expenses_delete ON expenses FOR DELETE TO owner, admin USING (true);

-- ============================================================
-- MATERIAL_STOCK_MOVEMENTS
-- ============================================================
DROP POLICY IF EXISTS material_stock_movements_select ON material_stock_movements;
DROP POLICY IF EXISTS material_stock_movements_insert ON material_stock_movements;
DROP POLICY IF EXISTS material_stock_movements_update ON material_stock_movements;
DROP POLICY IF EXISTS material_stock_movements_delete ON material_stock_movements;

CREATE POLICY material_stock_movements_select ON material_stock_movements FOR SELECT TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated USING (true);
CREATE POLICY material_stock_movements_insert ON material_stock_movements FOR INSERT TO owner, admin, supervisor, operator, authenticated WITH CHECK (true);
CREATE POLICY material_stock_movements_update ON material_stock_movements FOR UPDATE TO owner, admin, supervisor, authenticated USING (true);
CREATE POLICY material_stock_movements_delete ON material_stock_movements FOR DELETE TO owner, admin USING (true);

-- ============================================================
-- MATERIALS
-- ============================================================
DROP POLICY IF EXISTS materials_select ON materials;
DROP POLICY IF EXISTS materials_insert ON materials;
DROP POLICY IF EXISTS materials_update ON materials;
DROP POLICY IF EXISTS materials_delete ON materials;

CREATE POLICY materials_select ON materials FOR SELECT TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated USING (true);
CREATE POLICY materials_insert ON materials FOR INSERT TO owner, admin, supervisor, authenticated WITH CHECK (true);
CREATE POLICY materials_update ON materials FOR UPDATE TO owner, admin, supervisor, authenticated USING (true);
CREATE POLICY materials_delete ON materials FOR DELETE TO owner, admin USING (true);

-- ============================================================
-- NISHAB_REFERENCE
-- ============================================================
DROP POLICY IF EXISTS "Allow all for nishab_reference" ON nishab_reference;
DROP POLICY IF EXISTS nishab_reference_select ON nishab_reference;
DROP POLICY IF EXISTS nishab_reference_insert ON nishab_reference;
DROP POLICY IF EXISTS nishab_reference_update ON nishab_reference;
DROP POLICY IF EXISTS nishab_reference_delete ON nishab_reference;

CREATE POLICY nishab_reference_select ON nishab_reference FOR SELECT TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated USING (true);
CREATE POLICY nishab_reference_insert ON nishab_reference FOR INSERT TO owner, admin WITH CHECK (true);
CREATE POLICY nishab_reference_update ON nishab_reference FOR UPDATE TO owner, admin USING (true);
CREATE POLICY nishab_reference_delete ON nishab_reference FOR DELETE TO owner, admin USING (true);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
DROP POLICY IF EXISTS notifications_manage ON notifications;
DROP POLICY IF EXISTS notifications_select ON notifications;
DROP POLICY IF EXISTS notifications_insert ON notifications;
DROP POLICY IF EXISTS notifications_update ON notifications;
DROP POLICY IF EXISTS notifications_delete ON notifications;

CREATE POLICY notifications_select ON notifications FOR SELECT TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated USING (true);
CREATE POLICY notifications_insert ON notifications FOR INSERT TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated WITH CHECK (true);
CREATE POLICY notifications_update ON notifications FOR UPDATE TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated USING (true);
CREATE POLICY notifications_delete ON notifications FOR DELETE TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated USING (true);

-- ============================================================
-- PRODUCT_MATERIALS
-- ============================================================
DROP POLICY IF EXISTS product_materials_select ON product_materials;
DROP POLICY IF EXISTS product_materials_insert ON product_materials;
DROP POLICY IF EXISTS product_materials_update ON product_materials;
DROP POLICY IF EXISTS product_materials_delete ON product_materials;

CREATE POLICY product_materials_select ON product_materials FOR SELECT TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated USING (true);
CREATE POLICY product_materials_insert ON product_materials FOR INSERT TO owner, admin, supervisor, authenticated WITH CHECK (true);
CREATE POLICY product_materials_update ON product_materials FOR UPDATE TO owner, admin, supervisor, authenticated USING (true);
CREATE POLICY product_materials_delete ON product_materials FOR DELETE TO owner, admin USING (true);

-- ============================================================
-- PRODUCTION_RECORDS
-- ============================================================
DROP POLICY IF EXISTS production_records_select ON production_records;
DROP POLICY IF EXISTS production_records_insert ON production_records;
DROP POLICY IF EXISTS production_records_update ON production_records;
DROP POLICY IF EXISTS production_records_delete ON production_records;

CREATE POLICY production_records_select ON production_records FOR SELECT TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated USING (true);
CREATE POLICY production_records_insert ON production_records FOR INSERT TO owner, admin, supervisor, operator, authenticated WITH CHECK (true);
CREATE POLICY production_records_update ON production_records FOR UPDATE TO owner, admin, supervisor, authenticated USING (true);
CREATE POLICY production_records_delete ON production_records FOR DELETE TO owner, admin USING (true);

-- ============================================================
-- PRODUCTS
-- ============================================================
DROP POLICY IF EXISTS products_select ON products;
DROP POLICY IF EXISTS products_insert ON products;
DROP POLICY IF EXISTS products_update ON products;
DROP POLICY IF EXISTS products_delete ON products;

CREATE POLICY products_select ON products FOR SELECT TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated USING (true);
CREATE POLICY products_insert ON products FOR INSERT TO owner, admin, supervisor, authenticated WITH CHECK (true);
CREATE POLICY products_update ON products FOR UPDATE TO owner, admin, supervisor, authenticated USING (true);
CREATE POLICY products_delete ON products FOR DELETE TO owner, admin USING (true);

-- ============================================================
-- PROFILES
-- ============================================================
DROP POLICY IF EXISTS profiles_select ON profiles;
DROP POLICY IF EXISTS profiles_insert ON profiles;
DROP POLICY IF EXISTS profiles_update ON profiles;
DROP POLICY IF EXISTS profiles_delete ON profiles;

CREATE POLICY profiles_select ON profiles FOR SELECT TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated USING (true);
CREATE POLICY profiles_insert ON profiles FOR INSERT TO owner, admin WITH CHECK (true);
CREATE POLICY profiles_update ON profiles FOR UPDATE TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated USING (true);
CREATE POLICY profiles_delete ON profiles FOR DELETE TO owner, admin USING (true);

-- ============================================================
-- PURCHASE_ORDER_ITEMS
-- ============================================================
DROP POLICY IF EXISTS purchase_order_items_manage ON purchase_order_items;
DROP POLICY IF EXISTS purchase_order_items_select ON purchase_order_items;
DROP POLICY IF EXISTS purchase_order_items_insert ON purchase_order_items;
DROP POLICY IF EXISTS purchase_order_items_update ON purchase_order_items;
DROP POLICY IF EXISTS purchase_order_items_delete ON purchase_order_items;

CREATE POLICY purchase_order_items_select ON purchase_order_items FOR SELECT TO owner, admin, supervisor, cashier, authenticated USING (true);
CREATE POLICY purchase_order_items_insert ON purchase_order_items FOR INSERT TO owner, admin, supervisor, authenticated WITH CHECK (true);
CREATE POLICY purchase_order_items_update ON purchase_order_items FOR UPDATE TO owner, admin, supervisor, authenticated USING (true);
CREATE POLICY purchase_order_items_delete ON purchase_order_items FOR DELETE TO owner, admin USING (true);

-- ============================================================
-- PURCHASE_ORDERS
-- ============================================================
DROP POLICY IF EXISTS purchase_orders_manage ON purchase_orders;
DROP POLICY IF EXISTS purchase_orders_select ON purchase_orders;
DROP POLICY IF EXISTS purchase_orders_insert ON purchase_orders;
DROP POLICY IF EXISTS purchase_orders_update ON purchase_orders;
DROP POLICY IF EXISTS purchase_orders_delete ON purchase_orders;

CREATE POLICY purchase_orders_select ON purchase_orders FOR SELECT TO owner, admin, supervisor, cashier, authenticated USING (true);
CREATE POLICY purchase_orders_insert ON purchase_orders FOR INSERT TO owner, admin, supervisor, authenticated WITH CHECK (true);
CREATE POLICY purchase_orders_update ON purchase_orders FOR UPDATE TO owner, admin, supervisor, authenticated USING (true);
CREATE POLICY purchase_orders_delete ON purchase_orders FOR DELETE TO owner, admin USING (true);

-- ============================================================
-- QUOTATIONS
-- ============================================================
DROP POLICY IF EXISTS quotations_select ON quotations;
DROP POLICY IF EXISTS quotations_insert ON quotations;
DROP POLICY IF EXISTS quotations_update ON quotations;
DROP POLICY IF EXISTS quotations_delete ON quotations;

CREATE POLICY quotations_select ON quotations FOR SELECT TO owner, admin, supervisor, cashier, designer, authenticated USING (true);
CREATE POLICY quotations_insert ON quotations FOR INSERT TO owner, admin, supervisor, cashier, designer, authenticated WITH CHECK (true);
CREATE POLICY quotations_update ON quotations FOR UPDATE TO owner, admin, supervisor, cashier, designer, authenticated USING (true);
CREATE POLICY quotations_delete ON quotations FOR DELETE TO owner, admin USING (true);

-- ============================================================
-- RETASI
-- ============================================================
DROP POLICY IF EXISTS retasi_select ON retasi;
DROP POLICY IF EXISTS retasi_insert ON retasi;
DROP POLICY IF EXISTS retasi_update ON retasi;
DROP POLICY IF EXISTS retasi_delete ON retasi;

CREATE POLICY retasi_select ON retasi FOR SELECT TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated USING (true);
CREATE POLICY retasi_insert ON retasi FOR INSERT TO owner, admin, supervisor, authenticated WITH CHECK (true);
CREATE POLICY retasi_update ON retasi FOR UPDATE TO owner, admin, supervisor, supir, authenticated USING (true);
CREATE POLICY retasi_delete ON retasi FOR DELETE TO owner, admin USING (true);

-- ============================================================
-- RETASI_ITEMS
-- ============================================================
DROP POLICY IF EXISTS retasi_items_select ON retasi_items;
DROP POLICY IF EXISTS retasi_items_insert ON retasi_items;
DROP POLICY IF EXISTS retasi_items_update ON retasi_items;
DROP POLICY IF EXISTS retasi_items_delete ON retasi_items;

CREATE POLICY retasi_items_select ON retasi_items FOR SELECT TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated USING (true);
CREATE POLICY retasi_items_insert ON retasi_items FOR INSERT TO owner, admin, supervisor, supir, authenticated WITH CHECK (true);
CREATE POLICY retasi_items_update ON retasi_items FOR UPDATE TO owner, admin, supervisor, supir, authenticated USING (true);
CREATE POLICY retasi_items_delete ON retasi_items FOR DELETE TO owner, admin USING (true);

-- ============================================================
-- ROLE_PERMISSIONS
-- ============================================================
DROP POLICY IF EXISTS role_permissions_manage ON role_permissions;
DROP POLICY IF EXISTS role_permissions_select ON role_permissions;
DROP POLICY IF EXISTS role_permissions_insert ON role_permissions;
DROP POLICY IF EXISTS role_permissions_update ON role_permissions;
DROP POLICY IF EXISTS role_permissions_delete ON role_permissions;

CREATE POLICY role_permissions_select ON role_permissions FOR SELECT TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated USING (true);
CREATE POLICY role_permissions_insert ON role_permissions FOR INSERT TO owner, admin WITH CHECK (true);
CREATE POLICY role_permissions_update ON role_permissions FOR UPDATE TO owner, admin USING (true);
CREATE POLICY role_permissions_delete ON role_permissions FOR DELETE TO owner, admin USING (true);

-- ============================================================
-- ROLES
-- ============================================================
DROP POLICY IF EXISTS roles_manage ON roles;
DROP POLICY IF EXISTS roles_select ON roles;
DROP POLICY IF EXISTS roles_insert ON roles;
DROP POLICY IF EXISTS roles_update ON roles;
DROP POLICY IF EXISTS roles_delete ON roles;

CREATE POLICY roles_select ON roles FOR SELECT TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated USING (true);
CREATE POLICY roles_insert ON roles FOR INSERT TO owner, admin WITH CHECK (true);
CREATE POLICY roles_update ON roles FOR UPDATE TO owner, admin USING (true);
CREATE POLICY roles_delete ON roles FOR DELETE TO owner, admin USING (true);

-- ============================================================
-- SUPPLIER_MATERIALS
-- ============================================================
DROP POLICY IF EXISTS supplier_materials_select ON supplier_materials;
DROP POLICY IF EXISTS supplier_materials_insert ON supplier_materials;
DROP POLICY IF EXISTS supplier_materials_update ON supplier_materials;
DROP POLICY IF EXISTS supplier_materials_delete ON supplier_materials;

CREATE POLICY supplier_materials_select ON supplier_materials FOR SELECT TO owner, admin, supervisor, cashier, authenticated USING (true);
CREATE POLICY supplier_materials_insert ON supplier_materials FOR INSERT TO owner, admin, supervisor, authenticated WITH CHECK (true);
CREATE POLICY supplier_materials_update ON supplier_materials FOR UPDATE TO owner, admin, supervisor, authenticated USING (true);
CREATE POLICY supplier_materials_delete ON supplier_materials FOR DELETE TO owner, admin USING (true);

-- ============================================================
-- SUPPLIERS
-- ============================================================
DROP POLICY IF EXISTS suppliers_manage ON suppliers;
DROP POLICY IF EXISTS suppliers_select ON suppliers;
DROP POLICY IF EXISTS suppliers_insert ON suppliers;
DROP POLICY IF EXISTS suppliers_update ON suppliers;
DROP POLICY IF EXISTS suppliers_delete ON suppliers;

CREATE POLICY suppliers_select ON suppliers FOR SELECT TO owner, admin, supervisor, cashier, authenticated USING (true);
CREATE POLICY suppliers_insert ON suppliers FOR INSERT TO owner, admin, supervisor, authenticated WITH CHECK (true);
CREATE POLICY suppliers_update ON suppliers FOR UPDATE TO owner, admin, supervisor, authenticated USING (true);
CREATE POLICY suppliers_delete ON suppliers FOR DELETE TO owner, admin USING (true);

-- ============================================================
-- TRANSACTION_PAYMENTS
-- ============================================================
DROP POLICY IF EXISTS transaction_payments_manage ON transaction_payments;
DROP POLICY IF EXISTS transaction_payments_select ON transaction_payments;
DROP POLICY IF EXISTS transaction_payments_insert ON transaction_payments;
DROP POLICY IF EXISTS transaction_payments_update ON transaction_payments;
DROP POLICY IF EXISTS transaction_payments_delete ON transaction_payments;

CREATE POLICY transaction_payments_select ON transaction_payments FOR SELECT TO owner, admin, supervisor, cashier, designer, operator, supir, authenticated USING (true);
CREATE POLICY transaction_payments_insert ON transaction_payments FOR INSERT TO owner, admin, supervisor, cashier, supir, authenticated WITH CHECK (true);
CREATE POLICY transaction_payments_update ON transaction_payments FOR UPDATE TO owner, admin, supervisor, cashier, authenticated USING (true);
CREATE POLICY transaction_payments_delete ON transaction_payments FOR DELETE TO owner, admin USING (true);

-- ============================================================
-- ZAKAT_RECORDS
-- ============================================================
DROP POLICY IF EXISTS "Allow all for authenticated users" ON zakat_records;
DROP POLICY IF EXISTS zakat_records_select ON zakat_records;
DROP POLICY IF EXISTS zakat_records_insert ON zakat_records;
DROP POLICY IF EXISTS zakat_records_update ON zakat_records;
DROP POLICY IF EXISTS zakat_records_delete ON zakat_records;

CREATE POLICY zakat_records_select ON zakat_records FOR SELECT TO owner, admin, supervisor, cashier, authenticated USING (true);
CREATE POLICY zakat_records_insert ON zakat_records FOR INSERT TO owner, admin, authenticated WITH CHECK (true);
CREATE POLICY zakat_records_update ON zakat_records FOR UPDATE TO owner, admin, authenticated USING (true);
CREATE POLICY zakat_records_delete ON zakat_records FOR DELETE TO owner, admin USING (true);

-- ============================================================
-- GRANT TABLE PERMISSIONS TO ALL ROLES
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO supervisor;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cashier;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO designer;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO operator;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO supir;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

-- Grant sequence usage
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO owner;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO supervisor;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cashier;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO designer;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO operator;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO supir;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

COMMIT;

-- Verify the changes
SELECT tablename, policyname, cmd, roles::text
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;
