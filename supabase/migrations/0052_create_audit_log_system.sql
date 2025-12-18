-- PHASE 1: AUDIT LOGGING SYSTEM
-- Migration: 0037_create_audit_log_system.sql
-- Date: 2025-01-20
-- Purpose: Create comprehensive audit logging for sensitive operations

-- Create audit_logs table untuk track sensitive operations
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL, -- INSERT, UPDATE, DELETE
  record_id TEXT NOT NULL, -- ID of the affected record
  old_data JSONB, -- Previous data (for UPDATE/DELETE)
  new_data JSONB, -- New data (for INSERT/UPDATE)
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT,
  user_role TEXT,
  ip_address INET,
  user_agent TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  additional_info JSONB -- Extra metadata
);

-- Add indexes for performance
CREATE INDEX idx_audit_logs_table_name ON public.audit_logs(table_name);
CREATE INDEX idx_audit_logs_operation ON public.audit_logs(operation);  
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_timestamp ON public.audit_logs(timestamp);
CREATE INDEX idx_audit_logs_record_id ON public.audit_logs(record_id);

-- Enable RLS on audit logs (only admins can view)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins and owners can view audit logs
CREATE POLICY "Only admins and owners can view audit logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() 
      AND p.role IN ('owner', 'admin')
      AND p.status = 'Aktif'
    )
  );

-- Create audit log function
CREATE OR REPLACE FUNCTION public.create_audit_log(
  p_table_name TEXT,
  p_operation TEXT,
  p_record_id TEXT,
  p_old_data JSONB DEFAULT NULL,
  p_new_data JSONB DEFAULT NULL,
  p_additional_info JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  audit_id UUID;
  current_user_profile RECORD;
BEGIN
  -- Get current user profile for context
  SELECT p.role, p.full_name, u.email INTO current_user_profile
  FROM auth.users u
  LEFT JOIN public.profiles p ON u.id = p.id
  WHERE u.id = auth.uid();
  
  -- Insert audit log
  INSERT INTO public.audit_logs (
    table_name,
    operation,
    record_id,
    old_data,
    new_data,
    user_id,
    user_email,
    user_role,
    additional_info
  ) VALUES (
    p_table_name,
    p_operation,
    p_record_id,
    p_old_data,
    p_new_data,
    auth.uid(),
    current_user_profile.email,
    current_user_profile.role,
    p_additional_info
  ) RETURNING id INTO audit_id;
  
  RETURN audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create performance monitoring table
CREATE TABLE public.performance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_name TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  table_name TEXT,
  record_count INTEGER,
  query_type TEXT, -- SELECT, INSERT, UPDATE, DELETE
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB
);

-- Add indexes for performance monitoring
CREATE INDEX idx_performance_logs_operation ON public.performance_logs(operation_name);
CREATE INDEX idx_performance_logs_timestamp ON public.performance_logs(timestamp);
CREATE INDEX idx_performance_logs_duration ON public.performance_logs(duration_ms);

-- Performance logging function
CREATE OR REPLACE FUNCTION public.log_performance(
  p_operation_name TEXT,
  p_duration_ms INTEGER,
  p_table_name TEXT DEFAULT NULL,
  p_record_count INTEGER DEFAULT NULL,
  p_query_type TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO public.performance_logs (
    operation_name,
    duration_ms,
    user_id,
    table_name,
    record_count,
    query_type,
    metadata
  ) VALUES (
    p_operation_name,
    p_duration_ms,
    auth.uid(),
    p_table_name,
    p_record_count,
    p_query_type,
    p_metadata
  ) RETURNING id INTO log_id;
  
  RETURN log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create audit triggers for sensitive tables
-- Profiles audit trigger (most critical)
CREATE OR REPLACE FUNCTION public.audit_profiles_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.create_audit_log(
      'profiles',
      'DELETE',
      OLD.id::TEXT,
      row_to_json(OLD)::JSONB,
      NULL,
      jsonb_build_object('deleted_user_name', OLD.full_name)
    );
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.create_audit_log(
      'profiles',
      'UPDATE',
      NEW.id::TEXT,
      row_to_json(OLD)::JSONB,
      row_to_json(NEW)::JSONB,
      jsonb_build_object('updated_fields', (
        SELECT jsonb_object_agg(key, value)
        FROM jsonb_each(row_to_json(NEW)::JSONB)
        WHERE value != (row_to_json(OLD)::JSONB ->> key)::JSONB
      ))
    );
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM public.create_audit_log(
      'profiles',
      'INSERT',
      NEW.id::TEXT,
      NULL,
      row_to_json(NEW)::JSONB,
      jsonb_build_object('new_user_name', NEW.full_name)
    );
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create audit trigger for profiles
DROP TRIGGER IF EXISTS audit_profiles_trigger ON public.profiles;
CREATE TRIGGER audit_profiles_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_profiles_changes();

-- Transactions audit trigger (financial operations)
CREATE OR REPLACE FUNCTION public.audit_transactions_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.create_audit_log(
      'transactions',
      'DELETE',
      OLD.id,
      row_to_json(OLD)::JSONB,
      NULL,
      jsonb_build_object(
        'transaction_total', OLD.total,
        'customer_name', OLD.customer_name
      )
    );
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only log significant updates
    IF OLD.total != NEW.total OR OLD.payment_status != NEW.payment_status OR OLD.status != NEW.status THEN
      PERFORM public.create_audit_log(
        'transactions',
        'UPDATE',
        NEW.id,
        row_to_json(OLD)::JSONB,
        row_to_json(NEW)::JSONB,
        jsonb_build_object(
          'customer_name', NEW.customer_name,
          'old_total', OLD.total,
          'new_total', NEW.total,
          'old_status', OLD.status,
          'new_status', NEW.status
        )
      );
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM public.create_audit_log(
      'transactions',
      'INSERT',
      NEW.id,
      NULL,
      row_to_json(NEW)::JSONB,
      jsonb_build_object(
        'customer_name', NEW.customer_name,
        'total_amount', NEW.total
      )
    );
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create audit trigger for transactions
DROP TRIGGER IF EXISTS audit_transactions_trigger ON public.transactions;
CREATE TRIGGER audit_transactions_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.audit_transactions_changes();

-- Grant permissions
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_audit_log TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_performance TO authenticated;

-- Create view for audit summary (performance optimized)
CREATE OR REPLACE VIEW public.audit_summary AS
SELECT 
  table_name,
  operation,
  COUNT(*) as operation_count,
  DATE_TRUNC('day', timestamp) as date,
  array_agg(DISTINCT user_role) as user_roles
FROM public.audit_logs 
WHERE timestamp >= NOW() - INTERVAL '30 days'
GROUP BY table_name, operation, DATE_TRUNC('day', timestamp)
ORDER BY date DESC;

-- Grant access to the view
GRANT SELECT ON public.audit_summary TO authenticated;

-- Success message
SELECT 'Audit logging system berhasil dibuat! Phase 1 security implementation complete.' as status;