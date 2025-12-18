-- Auto Branch ID System
-- File: 0109_auto_branch_id_system.sql
-- Purpose: Automatically set branch_id for all transactions based on user's branch
-- Strategy: Create triggers that auto-populate branch_id from user's profile

-- Step 1: Create function to get user's current branch
CREATE OR REPLACE FUNCTION public.get_user_branch_id()
RETURNS UUID AS $$
DECLARE
  user_branch_id UUID;
BEGIN
  -- Try to get branch_id from user's profile
  SELECT branch_id INTO user_branch_id
  FROM public.profiles
  WHERE id = auth.uid();

  RETURN user_branch_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 2: Create trigger function to auto-set branch_id
CREATE OR REPLACE FUNCTION public.auto_set_branch_id()
RETURNS TRIGGER AS $$
BEGIN
  -- Only set branch_id if it's NULL
  IF NEW.branch_id IS NULL THEN
    NEW.branch_id := public.get_user_branch_id();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Apply trigger to all main transaction tables
-- Transactions (Orders/Sales)
DROP TRIGGER IF EXISTS auto_branch_id_transactions ON public.transactions;
CREATE TRIGGER auto_branch_id_transactions
  BEFORE INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_branch_id();

-- Cash History
DROP TRIGGER IF EXISTS auto_branch_id_cash_history ON public.cash_history;
CREATE TRIGGER auto_branch_id_cash_history
  BEFORE INSERT ON public.cash_history
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_branch_id();

-- Purchase Orders
DROP TRIGGER IF EXISTS auto_branch_id_purchase_orders ON public.purchase_orders;
CREATE TRIGGER auto_branch_id_purchase_orders
  BEFORE INSERT ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_branch_id();

-- Production Records
DROP TRIGGER IF EXISTS auto_branch_id_production_records ON public.production_records;
CREATE TRIGGER auto_branch_id_production_records
  BEFORE INSERT ON public.production_records
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_branch_id();

-- Material Stock Movements
DROP TRIGGER IF EXISTS auto_branch_id_material_movements ON public.material_stock_movements;
CREATE TRIGGER auto_branch_id_material_movements
  BEFORE INSERT ON public.material_stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_branch_id();

-- Deliveries
DROP TRIGGER IF EXISTS auto_branch_id_deliveries ON public.deliveries;
CREATE TRIGGER auto_branch_id_deliveries
  BEFORE INSERT ON public.deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_branch_id();

-- Expenses
DROP TRIGGER IF EXISTS auto_branch_id_expenses ON public.expenses;
CREATE TRIGGER auto_branch_id_expenses
  BEFORE INSERT ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_branch_id();

-- Employee Advances
DROP TRIGGER IF EXISTS auto_branch_id_employee_advances ON public.employee_advances;
CREATE TRIGGER auto_branch_id_employee_advances
  BEFORE INSERT ON public.employee_advances
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_branch_id();

-- Payroll Records
DROP TRIGGER IF EXISTS auto_branch_id_payroll_records ON public.payroll_records;
CREATE TRIGGER auto_branch_id_payroll_records
  BEFORE INSERT ON public.payroll_records
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_branch_id();

-- Accounts Payable
DROP TRIGGER IF EXISTS auto_branch_id_accounts_payable ON public.accounts_payable;
CREATE TRIGGER auto_branch_id_accounts_payable
  BEFORE INSERT ON public.accounts_payable
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_branch_id();

-- Attendance Records
DROP TRIGGER IF EXISTS auto_branch_id_attendance ON public.attendance;
CREATE TRIGGER auto_branch_id_attendance
  BEFORE INSERT ON public.attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_branch_id();

-- Commission Entries
DROP TRIGGER IF EXISTS auto_branch_id_commission_entries ON public.commission_entries;
CREATE TRIGGER auto_branch_id_commission_entries
  BEFORE INSERT ON public.commission_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_branch_id();

-- Commission Rules
DROP TRIGGER IF EXISTS auto_branch_id_commission_rules ON public.commission_rules;
CREATE TRIGGER auto_branch_id_commission_rules
  BEFORE INSERT ON public.commission_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_branch_id();

-- Step 4: Apply trigger to master data tables
-- Products
DROP TRIGGER IF EXISTS auto_branch_id_products ON public.products;
CREATE TRIGGER auto_branch_id_products
  BEFORE INSERT ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_branch_id();

-- Materials
DROP TRIGGER IF EXISTS auto_branch_id_materials ON public.materials;
CREATE TRIGGER auto_branch_id_materials
  BEFORE INSERT ON public.materials
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_branch_id();

-- Customers
DROP TRIGGER IF EXISTS auto_branch_id_customers ON public.customers;
CREATE TRIGGER auto_branch_id_customers
  BEFORE INSERT ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_branch_id();

-- Suppliers
DROP TRIGGER IF EXISTS auto_branch_id_suppliers ON public.suppliers;
CREATE TRIGGER auto_branch_id_suppliers
  BEFORE INSERT ON public.suppliers
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_branch_id();

-- Assets
DROP TRIGGER IF EXISTS auto_branch_id_assets ON public.assets;
CREATE TRIGGER auto_branch_id_assets
  BEFORE INSERT ON public.assets
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_branch_id();

-- Asset Maintenance
DROP TRIGGER IF EXISTS auto_branch_id_asset_maintenance ON public.asset_maintenance;
CREATE TRIGGER auto_branch_id_asset_maintenance
  BEFORE INSERT ON public.asset_maintenance
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_branch_id();

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_user_branch_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_set_branch_id() TO authenticated;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Auto branch_id system installed successfully!';
  RAISE NOTICE 'All new records will automatically get branch_id from user profile';
END $$;
