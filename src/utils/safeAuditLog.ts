import { supabase } from '@/integrations/supabase/client'

interface AuditLogData {
  table_name: string
  operation: string
  record_id: string
  old_data?: any
  new_data?: any
  additional_info?: any
}

/**
 * Safe audit logging with fallbacks
 * Gracefully handles cases where audit system isn't deployed yet
 */
export async function safeAuditLog(data: AuditLogData): Promise<void> {
  try {
    // Check if audit function exists first
    const { data: functions, error: fnError } = await supabase.rpc('create_audit_log', {
      p_table_name: data.table_name,
      p_operation: data.operation,
      p_record_id: data.record_id,
      p_old_data: data.old_data || null,
      p_new_data: data.new_data || null,
      p_additional_info: data.additional_info || null
    });

    if (fnError) {
      // If function doesn't exist, fallback to console logging
      if (fnError.message.includes('function') && fnError.message.includes('does not exist')) {
        console.info('[Audit Log - Fallback]', {
          timestamp: new Date().toISOString(),
          ...data
        });
        return;
      }
      throw fnError;
    }

  } catch (error) {
    // Fallback to local storage for offline audit (development)
    console.warn('[Audit Log] Database logging failed, using fallback:', error);
    
    try {
      const auditLogs = JSON.parse(localStorage.getItem('audit_logs') || '[]');
      auditLogs.push({
        ...data,
        timestamp: new Date().toISOString(),
        user_id: 'unknown' // User ID handled by context elsewhere
      });
      
      // Keep only last 50 logs in localStorage
      if (auditLogs.length > 50) {
        auditLogs.splice(0, auditLogs.length - 50);
      }
      
      localStorage.setItem('audit_logs', JSON.stringify(auditLogs));
    } catch (localError) {
      console.warn('[Audit Log] All fallbacks failed:', localError);
    }
  }
}

/**
 * Safe performance logging with fallbacks
 */
export async function safePerformanceLog(
  operation_name: string,
  duration_ms: number,
  table_name?: string,
  metadata?: any
): Promise<void> {
  // Only log if performance is concerning (> 100ms) to reduce noise
  if (duration_ms < 100) return;

  try {
    await supabase.rpc('log_performance', {
      p_operation_name: operation_name,
      p_duration_ms: duration_ms,
      p_table_name: table_name,
      p_query_type: 'CLIENT_OPERATION',
      p_metadata: metadata
    });
  } catch (error) {
    // Fallback to console for development
    console.info('[Performance - Fallback]', {
      operation: operation_name,
      duration: duration_ms + 'ms',
      table: table_name,
      metadata,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Check if audit system is available
 */
export async function isAuditSystemAvailable(): Promise<boolean> {
  try {
    // Try to call a simple audit function
    await supabase.rpc('create_audit_log', {
      p_table_name: 'system_check',
      p_operation: 'HEALTH_CHECK',
      p_record_id: 'test'
    });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get local audit logs from fallback storage
 */
export function getLocalAuditLogs(): any[] {
  try {
    return JSON.parse(localStorage.getItem('audit_logs') || '[]');
  } catch (error) {
    console.warn('Failed to get local audit logs:', error);
    return [];
  }
}

/**
 * Clear local audit logs
 */
export function clearLocalAuditLogs(): void {
  try {
    localStorage.removeItem('audit_logs');
  } catch (error) {
    console.warn('Failed to clear local audit logs:', error);
  }
}