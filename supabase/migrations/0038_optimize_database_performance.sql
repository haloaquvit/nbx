-- PERFORMANCE OPTIMIZATION MIGRATION
-- Migration: 0038_optimize_database_performance.sql
-- Date: 2025-01-20
-- Purpose: Fix slow loading issues with better indexes and optimized queries

-- Add critical missing indexes for better performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_customer_id ON public.transactions(customer_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_status ON public.transactions(status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_payment_status ON public.transactions(payment_status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_order_date ON public.transactions(order_date);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_cashier_id ON public.transactions(cashier_id);

-- Optimize profiles table queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_status ON public.profiles(status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- Optimize customers table
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_name ON public.customers(name);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_created_at ON public.customers("createdAt");

-- Optimize products and materials
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_category ON public.products(category);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_name ON public.products(name);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_materials_name ON public.materials(name);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_materials_stock ON public.materials(stock);

-- Optimize accounts table
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_accounts_type ON public.accounts(type);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_accounts_is_payment_account ON public.accounts(is_payment_account);

-- Create optimized view for transactions with customer data (reduce JOIN overhead)
CREATE OR REPLACE VIEW public.transactions_with_customer AS
SELECT 
  t.*,
  c.name as customer_display_name,
  c.phone as customer_phone,
  c.address as customer_address,
  p.full_name as cashier_display_name
FROM public.transactions t
LEFT JOIN public.customers c ON t.customer_id = c.id
LEFT JOIN public.profiles p ON t.cashier_id = p.id;

-- Create optimized view for dashboard queries
CREATE OR REPLACE VIEW public.dashboard_summary AS
WITH recent_transactions AS (
  SELECT 
    COUNT(*) as total_transactions,
    SUM(total) as total_revenue,
    COUNT(CASE WHEN payment_status = 'Lunas' THEN 1 END) as paid_transactions,
    COUNT(CASE WHEN payment_status = 'Belum Lunas' THEN 1 END) as unpaid_transactions
  FROM public.transactions 
  WHERE order_date >= CURRENT_DATE - INTERVAL '30 days'
),
stock_summary AS (
  SELECT 
    COUNT(*) as total_products,
    COUNT(CASE WHEN (specifications->>'stock')::numeric <= min_order THEN 1 END) as low_stock_products
  FROM public.products
),
customer_summary AS (
  SELECT COUNT(*) as total_customers
  FROM public.customers
)
SELECT 
  rt.*,
  ss.total_products,
  ss.low_stock_products,
  cs.total_customers
FROM recent_transactions rt, stock_summary ss, customer_summary cs;

-- Create function for fast transaction search (with pagination)
CREATE OR REPLACE FUNCTION public.search_transactions(
  search_term TEXT DEFAULT '',
  limit_count INTEGER DEFAULT 50,
  offset_count INTEGER DEFAULT 0,
  status_filter TEXT DEFAULT NULL
)
RETURNS TABLE (
  id TEXT,
  customer_name TEXT,
  customer_display_name TEXT,
  cashier_name TEXT,
  total NUMERIC,
  paid_amount NUMERIC,
  payment_status TEXT,
  status TEXT,
  order_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.customer_name,
    c.name as customer_display_name,
    p.full_name as cashier_name,
    t.total,
    t.paid_amount,
    t.payment_status,
    t.status,
    t.order_date,
    t.created_at
  FROM public.transactions t
  LEFT JOIN public.customers c ON t.customer_id = c.id
  LEFT JOIN public.profiles p ON t.cashier_id = p.id
  WHERE 
    (search_term = '' OR 
     t.customer_name ILIKE '%' || search_term || '%' OR
     t.id ILIKE '%' || search_term || '%' OR
     c.name ILIKE '%' || search_term || '%')
    AND (status_filter IS NULL OR t.status = status_filter)
  ORDER BY t.order_date DESC
  LIMIT limit_count
  OFFSET offset_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- Create function for fast product search with stock info
CREATE OR REPLACE FUNCTION public.search_products_with_stock(
  search_term TEXT DEFAULT '',
  category_filter TEXT DEFAULT NULL,
  limit_count INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  category TEXT,
  base_price NUMERIC,
  unit TEXT,
  current_stock NUMERIC,
  min_order INTEGER,
  is_low_stock BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.name,
    p.category,
    p.base_price,
    p.unit,
    COALESCE((p.specifications->>'stock')::NUMERIC, 0) as current_stock,
    p.min_order,
    COALESCE((p.specifications->>'stock')::NUMERIC, 0) <= p.min_order as is_low_stock
  FROM public.products p
  WHERE 
    (search_term = '' OR p.name ILIKE '%' || search_term || '%')
    AND (category_filter IS NULL OR p.category = category_filter)
  ORDER BY p.name
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- Create optimized customer search function
CREATE OR REPLACE FUNCTION public.search_customers(
  search_term TEXT DEFAULT '',
  limit_count INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  phone TEXT,
  address TEXT,
  order_count INTEGER,
  last_order_date TIMESTAMPTZ,
  total_spent NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    c.phone,
    c.address,
    c."orderCount",
    MAX(t.order_date) as last_order_date,
    COALESCE(SUM(t.total), 0) as total_spent
  FROM public.customers c
  LEFT JOIN public.transactions t ON c.id = t.customer_id
  WHERE 
    (search_term = '' OR 
     c.name ILIKE '%' || search_term || '%' OR
     c.phone ILIKE '%' || search_term || '%')
  GROUP BY c.id, c.name, c.phone, c.address, c."orderCount"
  ORDER BY c.name
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- Create materialized view for frequently accessed data (refresh daily)
CREATE MATERIALIZED VIEW public.daily_stats AS
SELECT 
  CURRENT_DATE as date,
  COUNT(*) as total_transactions,
  SUM(total) as total_revenue,
  COUNT(DISTINCT customer_id) as unique_customers,
  AVG(total) as avg_transaction_value
FROM public.transactions 
WHERE DATE(order_date) = CURRENT_DATE;

-- Create indexes on materialized view
CREATE INDEX idx_daily_stats_date ON public.daily_stats(date);

-- Function to refresh materialized view (call this daily via cron)
CREATE OR REPLACE FUNCTION public.refresh_daily_stats()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW public.daily_stats;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions on new views and functions
GRANT SELECT ON public.transactions_with_customer TO authenticated;
GRANT SELECT ON public.dashboard_summary TO authenticated;
GRANT SELECT ON public.daily_stats TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_transactions TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_products_with_stock TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_customers TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_daily_stats TO authenticated;

-- Create cleanup function for old audit logs (prevent table bloat)
CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.audit_logs 
  WHERE timestamp < NOW() - INTERVAL '90 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Log the cleanup operation
  PERFORM public.create_audit_log(
    'audit_logs',
    'CLEANUP',
    'system',
    NULL,
    jsonb_build_object('deleted_count', deleted_count),
    jsonb_build_object('operation', 'automatic_cleanup')
  );
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Grant permission for cleanup function
GRANT EXECUTE ON FUNCTION public.cleanup_old_audit_logs TO authenticated;

-- Success message
SELECT 'Database performance optimization complete! Indexes added, views created, search functions optimized.' as status;