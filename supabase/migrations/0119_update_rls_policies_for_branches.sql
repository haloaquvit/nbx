-- =====================================================
-- Migration: Update RLS Policies for Multi-Branch
-- Description: Update semua RLS policies untuk support branch filtering
-- =====================================================

-- ==========================================
-- 1. PROFILES TABLE
-- ==========================================
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;

-- Users can view profiles in their branch or all if head office
CREATE POLICY "Users can view branch profiles"
  ON public.profiles FOR SELECT
  USING (
    -- Head office bisa lihat semua
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.branches b ON p.branch_id = b.id
      JOIN public.companies c ON b.company_id = c.id
      WHERE p.id = auth.uid() AND c.is_head_office = true
    )
    OR
    -- User biasa hanya bisa lihat profile di branch yang sama
    branch_id = (SELECT branch_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- ==========================================
-- 2. CUSTOMERS TABLE
-- ==========================================
DROP POLICY IF EXISTS "Authenticated users can manage customers" ON public.customers;

CREATE POLICY "Users can view branch customers"
  ON public.customers FOR SELECT
  USING (
    can_access_branch(branch_id)
  );

CREATE POLICY "Users can insert branch customers"
  ON public.customers FOR INSERT
  WITH CHECK (
    branch_id = get_user_branch_id()
    OR is_head_office_user()
  );

CREATE POLICY "Users can update branch customers"
  ON public.customers FOR UPDATE
  USING (
    can_access_branch(branch_id)
  );

CREATE POLICY "Users can delete branch customers"
  ON public.customers FOR DELETE
  USING (
    can_access_branch(branch_id)
  );

-- ==========================================
-- 3. TRANSACTIONS TABLE
-- ==========================================
DROP POLICY IF EXISTS "Authenticated users can manage transactions" ON public.transactions;

CREATE POLICY "Users can view branch transactions"
  ON public.transactions FOR SELECT
  USING (
    can_access_branch(branch_id)
  );

CREATE POLICY "Users can insert branch transactions"
  ON public.transactions FOR INSERT
  WITH CHECK (
    branch_id = get_user_branch_id()
  );

CREATE POLICY "Users can update branch transactions"
  ON public.transactions FOR UPDATE
  USING (
    can_access_branch(branch_id)
  );

CREATE POLICY "Users can delete branch transactions"
  ON public.transactions FOR DELETE
  USING (
    can_access_branch(branch_id)
  );

-- ==========================================
-- 4. PRODUCTS TABLE
-- ==========================================
DROP POLICY IF EXISTS "Authenticated users can manage products" ON public.products;

-- Users can view shared products or products in their branch
CREATE POLICY "Users can view accessible products"
  ON public.products FOR SELECT
  USING (
    is_shared = true
    OR can_access_branch(branch_id)
  );

CREATE POLICY "Users can insert products"
  ON public.products FOR INSERT
  WITH CHECK (
    branch_id = get_user_branch_id()
    OR is_head_office_user()
  );

CREATE POLICY "Users can update accessible products"
  ON public.products FOR UPDATE
  USING (
    can_access_branch(branch_id)
    OR (is_shared = true AND is_head_office_user())
  );

CREATE POLICY "Users can delete accessible products"
  ON public.products FOR DELETE
  USING (
    can_access_branch(branch_id)
    OR (is_shared = true AND is_head_office_user())
  );

-- ==========================================
-- 5. MATERIALS TABLE
-- ==========================================
DROP POLICY IF EXISTS "Authenticated users can manage materials" ON public.materials;

CREATE POLICY "Users can view accessible materials"
  ON public.materials FOR SELECT
  USING (
    is_shared = true
    OR can_access_branch(branch_id)
  );

CREATE POLICY "Users can insert materials"
  ON public.materials FOR INSERT
  WITH CHECK (
    branch_id = get_user_branch_id()
    OR is_head_office_user()
  );

CREATE POLICY "Users can update accessible materials"
  ON public.materials FOR UPDATE
  USING (
    can_access_branch(branch_id)
    OR (is_shared = true AND is_head_office_user())
  );

CREATE POLICY "Users can delete accessible materials"
  ON public.materials FOR DELETE
  USING (
    can_access_branch(branch_id)
    OR (is_shared = true AND is_head_office_user())
  );

-- ==========================================
-- 6. ACCOUNTS TABLE
-- ==========================================
DROP POLICY IF EXISTS "Authenticated users can manage accounts" ON public.accounts;

CREATE POLICY "Users can view accessible accounts"
  ON public.accounts FOR SELECT
  USING (
    is_shared = true
    OR can_access_branch(branch_id)
  );

CREATE POLICY "Users can manage accessible accounts"
  ON public.accounts FOR ALL
  USING (
    can_access_branch(branch_id)
    OR (is_shared = true AND is_head_office_user())
  );

-- ==========================================
-- 7. EXPENSES TABLE
-- ==========================================
DROP POLICY IF EXISTS "Authenticated users can manage expenses" ON public.expenses;

CREATE POLICY "Users can view branch expenses"
  ON public.expenses FOR SELECT
  USING (
    can_access_branch(branch_id)
  );

CREATE POLICY "Users can manage branch expenses"
  ON public.expenses FOR ALL
  USING (
    can_access_branch(branch_id)
  );

-- ==========================================
-- 8. CASH_HISTORY TABLE
-- ==========================================
DROP POLICY IF EXISTS "Authenticated users can manage cash history" ON public.cash_history;

CREATE POLICY "Users can view branch cash history"
  ON public.cash_history FOR SELECT
  USING (
    can_access_branch(branch_id)
  );

CREATE POLICY "Users can manage branch cash history"
  ON public.cash_history FOR ALL
  USING (
    can_access_branch(branch_id)
  );

-- ==========================================
-- 9. EMPLOYEE_ADVANCES TABLE
-- ==========================================
DROP POLICY IF EXISTS "Authenticated users can manage employee advances" ON public.employee_advances;

CREATE POLICY "Users can view branch employee advances"
  ON public.employee_advances FOR SELECT
  USING (
    can_access_branch(branch_id)
  );

CREATE POLICY "Users can manage branch employee advances"
  ON public.employee_advances FOR ALL
  USING (
    can_access_branch(branch_id)
  );

-- ==========================================
-- 10. PURCHASE_ORDERS TABLE
-- ==========================================
DROP POLICY IF EXISTS "Authenticated users can manage purchase orders" ON public.purchase_orders;

CREATE POLICY "Users can view branch purchase orders"
  ON public.purchase_orders FOR SELECT
  USING (
    can_access_branch(branch_id)
  );

CREATE POLICY "Users can manage branch purchase orders"
  ON public.purchase_orders FOR ALL
  USING (
    can_access_branch(branch_id)
  );

-- ==========================================
-- 11. SUPPLIERS TABLE
-- ==========================================
DROP POLICY IF EXISTS "Authenticated users can manage suppliers" ON public.suppliers;

CREATE POLICY "Users can view accessible suppliers"
  ON public.suppliers FOR SELECT
  USING (
    is_shared = true
    OR can_access_branch(branch_id)
  );

CREATE POLICY "Users can manage accessible suppliers"
  ON public.suppliers FOR ALL
  USING (
    can_access_branch(branch_id)
    OR (is_shared = true AND is_head_office_user())
  );

-- ==========================================
-- 12. DELIVERIES TABLE
-- ==========================================
DROP POLICY IF EXISTS "Authenticated users can manage deliveries" ON public.deliveries;

CREATE POLICY "Users can view branch deliveries"
  ON public.deliveries FOR SELECT
  USING (
    can_access_branch(branch_id)
  );

CREATE POLICY "Users can manage branch deliveries"
  ON public.deliveries FOR ALL
  USING (
    can_access_branch(branch_id)
  );

-- ==========================================
-- 13. PRODUCTION_RECORDS TABLE
-- ==========================================
DROP POLICY IF EXISTS "Authenticated users can manage production records" ON public.production_records;

CREATE POLICY "Users can view branch production records"
  ON public.production_records FOR SELECT
  USING (
    can_access_branch(branch_id)
  );

CREATE POLICY "Users can manage branch production records"
  ON public.production_records FOR ALL
  USING (
    can_access_branch(branch_id)
  );

-- ==========================================
-- 14. MATERIAL_STOCK_MOVEMENTS TABLE
-- ==========================================
DROP POLICY IF EXISTS "Authenticated users can manage material stock movements" ON public.material_stock_movements;

CREATE POLICY "Users can view branch material movements"
  ON public.material_stock_movements FOR SELECT
  USING (
    can_access_branch(branch_id)
  );

CREATE POLICY "Users can manage branch material movements"
  ON public.material_stock_movements FOR ALL
  USING (
    can_access_branch(branch_id)
  );

-- ==========================================
-- 15. QUOTATIONS TABLE
-- ==========================================
DROP POLICY IF EXISTS "Authenticated users can manage quotations" ON public.quotations;

CREATE POLICY "Users can view branch quotations"
  ON public.quotations FOR SELECT
  USING (
    can_access_branch(branch_id)
  );

CREATE POLICY "Users can manage branch quotations"
  ON public.quotations FOR ALL
  USING (
    can_access_branch(branch_id)
  );

-- ==========================================
-- 16. RETASI TABLE
-- ==========================================
DROP POLICY IF EXISTS "Authenticated users can manage retasi" ON public.retasi;

CREATE POLICY "Users can view branch retasi"
  ON public.retasi FOR SELECT
  USING (
    can_access_branch(branch_id)
  );

CREATE POLICY "Users can manage branch retasi"
  ON public.retasi FOR ALL
  USING (
    can_access_branch(branch_id)
  );

-- ==========================================
-- 17. ATTENDANCE TABLE
-- ==========================================
DROP POLICY IF EXISTS "Authenticated users can manage attendance" ON public.attendance;

CREATE POLICY "Users can view branch attendance"
  ON public.attendance FOR SELECT
  USING (
    can_access_branch(branch_id)
  );

CREATE POLICY "Users can manage branch attendance"
  ON public.attendance FOR ALL
  USING (
    can_access_branch(branch_id)
  );

-- ==========================================
-- 18. PAYROLL_RECORDS TABLE
-- ==========================================
DROP POLICY IF EXISTS "Authenticated users can manage payroll records" ON public.payroll_records;

CREATE POLICY "Users can view branch payroll"
  ON public.payroll_records FOR SELECT
  USING (
    can_access_branch(branch_id)
  );

CREATE POLICY "Users can manage branch payroll"
  ON public.payroll_records FOR ALL
  USING (
    can_access_branch(branch_id)
  );

-- ==========================================
-- 19. COMMISSION_ENTRIES TABLE
-- ==========================================
DROP POLICY IF EXISTS "Authenticated users can manage commission entries" ON public.commission_entries;

CREATE POLICY "Users can view branch commissions"
  ON public.commission_entries FOR SELECT
  USING (
    can_access_branch(branch_id)
  );

CREATE POLICY "Users can manage branch commissions"
  ON public.commission_entries FOR ALL
  USING (
    can_access_branch(branch_id)
  );

-- ==========================================
-- 20. ACCOUNTS_PAYABLE TABLE
-- ==========================================
DROP POLICY IF EXISTS "Authenticated users can manage accounts payable" ON public.accounts_payable;

CREATE POLICY "Users can view branch accounts payable"
  ON public.accounts_payable FOR SELECT
  USING (
    can_access_branch(branch_id)
  );

CREATE POLICY "Users can manage branch accounts payable"
  ON public.accounts_payable FOR ALL
  USING (
    can_access_branch(branch_id)
  );

-- ==========================================
-- 21. ASSETS TABLE
-- ==========================================
DROP POLICY IF EXISTS "Authenticated users can manage assets" ON public.assets;

CREATE POLICY "Users can view branch assets"
  ON public.assets FOR SELECT
  USING (
    can_access_branch(branch_id)
  );

CREATE POLICY "Users can manage branch assets"
  ON public.assets FOR ALL
  USING (
    can_access_branch(branch_id)
  );

-- ==========================================
-- 22. ASSET_MAINTENANCE TABLE
-- ==========================================
DROP POLICY IF EXISTS "Authenticated users can manage asset maintenance" ON public.asset_maintenance;

CREATE POLICY "Users can view branch asset maintenance"
  ON public.asset_maintenance FOR SELECT
  USING (
    can_access_branch(branch_id)
  );

CREATE POLICY "Users can manage branch asset maintenance"
  ON public.asset_maintenance FOR ALL
  USING (
    can_access_branch(branch_id)
  );

-- ==========================================
-- 23. ZAKAT_RECORDS TABLE
-- ==========================================
DROP POLICY IF EXISTS "Authenticated users can manage zakat records" ON public.zakat_records;

CREATE POLICY "Users can view branch zakat"
  ON public.zakat_records FOR SELECT
  USING (
    can_access_branch(branch_id)
  );

CREATE POLICY "Users can manage branch zakat"
  ON public.zakat_records FOR ALL
  USING (
    can_access_branch(branch_id)
  );

COMMENT ON FUNCTION can_access_branch IS 'Digunakan oleh RLS policies untuk mengecek akses branch';
