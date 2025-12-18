-- =====================================================
-- Migration: Add branch_id to All Tables
-- Description: Menambahkan kolom branch_id ke semua tabel transaksional
-- =====================================================

-- 1. Add branch_id to profiles (Users/Employees)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

CREATE INDEX IF NOT EXISTS idx_profiles_branch_id ON public.profiles(branch_id);

-- Update existing profiles to default branch
UPDATE public.profiles
SET branch_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE branch_id IS NULL;

-- 2. Add branch_id to customers
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

CREATE INDEX IF NOT EXISTS idx_customers_branch_id ON public.customers(branch_id);

UPDATE public.customers
SET branch_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE branch_id IS NULL;

-- 3. Add branch_id to products (Optional: bisa shared atau per branch)
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id),
ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT false; -- True jika produk shared antar cabang

CREATE INDEX IF NOT EXISTS idx_products_branch_id ON public.products(branch_id);
CREATE INDEX IF NOT EXISTS idx_products_is_shared ON public.products(is_shared);

UPDATE public.products
SET branch_id = '00000000-0000-0000-0000-000000000001'::uuid,
    is_shared = true -- Set semua produk existing jadi shared
WHERE branch_id IS NULL;

-- 4. Add branch_id to materials (Optional: bisa shared atau per branch)
ALTER TABLE public.materials
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id),
ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_materials_branch_id ON public.materials(branch_id);
CREATE INDEX IF NOT EXISTS idx_materials_is_shared ON public.materials(is_shared);

UPDATE public.materials
SET branch_id = '00000000-0000-0000-0000-000000000001'::uuid,
    is_shared = true
WHERE branch_id IS NULL;

-- 5. Add branch_id to transactions
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

CREATE INDEX IF NOT EXISTS idx_transactions_branch_id ON public.transactions(branch_id);

UPDATE public.transactions
SET branch_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE branch_id IS NULL;

-- 6. Add branch_id to quotations
ALTER TABLE public.quotations
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

CREATE INDEX IF NOT EXISTS idx_quotations_branch_id ON public.quotations(branch_id);

UPDATE public.quotations
SET branch_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE branch_id IS NULL;

-- 7. Add branch_id to accounts (Chart of Accounts)
ALTER TABLE public.accounts
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id),
ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_accounts_branch_id ON public.accounts(branch_id);

UPDATE public.accounts
SET branch_id = '00000000-0000-0000-0000-000000000001'::uuid,
    is_shared = true -- Akun bisa shared antar cabang
WHERE branch_id IS NULL;

-- 8. Add branch_id to expenses
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

CREATE INDEX IF NOT EXISTS idx_expenses_branch_id ON public.expenses(branch_id);

UPDATE public.expenses
SET branch_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE branch_id IS NULL;

-- 9. Add branch_id to cash_history
ALTER TABLE public.cash_history
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

CREATE INDEX IF NOT EXISTS idx_cash_history_branch_id ON public.cash_history(branch_id);

UPDATE public.cash_history
SET branch_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE branch_id IS NULL;

-- 10. Add branch_id to employee_advances
ALTER TABLE public.employee_advances
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

CREATE INDEX IF NOT EXISTS idx_employee_advances_branch_id ON public.employee_advances(branch_id);

UPDATE public.employee_advances
SET branch_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE branch_id IS NULL;

-- 11. Add branch_id to purchase_orders
ALTER TABLE public.purchase_orders
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_branch_id ON public.purchase_orders(branch_id);

UPDATE public.purchase_orders
SET branch_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE branch_id IS NULL;

-- 12. Add branch_id to suppliers (bisa shared atau per branch)
ALTER TABLE public.suppliers
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id),
ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_suppliers_branch_id ON public.suppliers(branch_id);

UPDATE public.suppliers
SET branch_id = '00000000-0000-0000-0000-000000000001'::uuid,
    is_shared = true
WHERE branch_id IS NULL;

-- 13. Add branch_id to deliveries
ALTER TABLE public.deliveries
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

CREATE INDEX IF NOT EXISTS idx_deliveries_branch_id ON public.deliveries(branch_id);

UPDATE public.deliveries
SET branch_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE branch_id IS NULL;

-- 14. Add branch_id to production_records
ALTER TABLE public.production_records
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

CREATE INDEX IF NOT EXISTS idx_production_records_branch_id ON public.production_records(branch_id);

UPDATE public.production_records
SET branch_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE branch_id IS NULL;

-- 15. Add branch_id to material_stock_movements
ALTER TABLE public.material_stock_movements
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

CREATE INDEX IF NOT EXISTS idx_material_stock_movements_branch_id ON public.material_stock_movements(branch_id);

UPDATE public.material_stock_movements
SET branch_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE branch_id IS NULL;

-- 16. Add branch_id to retasi
ALTER TABLE public.retasi
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

CREATE INDEX IF NOT EXISTS idx_retasi_branch_id ON public.retasi(branch_id);

UPDATE public.retasi
SET branch_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE branch_id IS NULL;

-- 17. Add branch_id to attendance
ALTER TABLE public.attendance
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

CREATE INDEX IF NOT EXISTS idx_attendance_branch_id ON public.attendance(branch_id);

UPDATE public.attendance
SET branch_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE branch_id IS NULL;

-- 18. Add branch_id to payroll_records
ALTER TABLE public.payroll_records
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

CREATE INDEX IF NOT EXISTS idx_payroll_records_branch_id ON public.payroll_records(branch_id);

UPDATE public.payroll_records
SET branch_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE branch_id IS NULL;

-- 19. Add branch_id to commission_entries
ALTER TABLE public.commission_entries
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

CREATE INDEX IF NOT EXISTS idx_commission_entries_branch_id ON public.commission_entries(branch_id);

UPDATE public.commission_entries
SET branch_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE branch_id IS NULL;

-- 20. Add branch_id to accounts_payable
ALTER TABLE public.accounts_payable
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

CREATE INDEX IF NOT EXISTS idx_accounts_payable_branch_id ON public.accounts_payable(branch_id);

UPDATE public.accounts_payable
SET branch_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE branch_id IS NULL;

-- 21. Add branch_id to account_transfers
ALTER TABLE public.account_transfers
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

CREATE INDEX IF NOT EXISTS idx_account_transfers_branch_id ON public.account_transfers(branch_id);

UPDATE public.account_transfers
SET branch_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE branch_id IS NULL;

-- 22. Add branch_id to assets
ALTER TABLE public.assets
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

CREATE INDEX IF NOT EXISTS idx_assets_branch_id ON public.assets(branch_id);

UPDATE public.assets
SET branch_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE branch_id IS NULL;

-- 23. Add branch_id to asset_maintenance
ALTER TABLE public.asset_maintenance
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

CREATE INDEX IF NOT EXISTS idx_asset_maintenance_branch_id ON public.asset_maintenance(branch_id);

UPDATE public.asset_maintenance
SET branch_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE branch_id IS NULL;

-- 24. Add branch_id to zakat_records
ALTER TABLE public.zakat_records
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

CREATE INDEX IF NOT EXISTS idx_zakat_records_branch_id ON public.zakat_records(branch_id);

UPDATE public.zakat_records
SET branch_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE branch_id IS NULL;

-- 25. Add branch_id to stock_pricings
ALTER TABLE public.stock_pricings
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

CREATE INDEX IF NOT EXISTS idx_stock_pricings_branch_id ON public.stock_pricings(branch_id);

UPDATE public.stock_pricings
SET branch_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE branch_id IS NULL;

-- 26. Add branch_id to bonus_pricings
ALTER TABLE public.bonus_pricings
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

CREATE INDEX IF NOT EXISTS idx_bonus_pricings_branch_id ON public.bonus_pricings(branch_id);

UPDATE public.bonus_pricings
SET branch_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE branch_id IS NULL;

COMMENT ON COLUMN public.products.is_shared IS 'True jika produk dapat digunakan oleh semua cabang';
COMMENT ON COLUMN public.materials.is_shared IS 'True jika material dapat digunakan oleh semua cabang';
COMMENT ON COLUMN public.accounts.is_shared IS 'True jika akun dapat digunakan oleh semua cabang';
COMMENT ON COLUMN public.suppliers.is_shared IS 'True jika supplier dapat digunakan oleh semua cabang';
