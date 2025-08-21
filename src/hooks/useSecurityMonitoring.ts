import { useCallback, useEffect, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/integrations/supabase/client'
import { checkSensitiveOperationLimit, apiRateLimit, getUserRateLimitKey } from '@/utils/rateLimiter'

interface SecurityEvent {
  type: 'AUTH_ATTEMPT' | 'SENSITIVE_OPERATION' | 'RATE_LIMIT_EXCEEDED' | 'SUSPICIOUS_ACTIVITY'
  details: any
  timestamp: Date
}

interface SecurityMonitoringOptions {
  enableRealTimeMonitoring?: boolean
  logToServer?: boolean
  alertOnSuspiciousActivity?: boolean
}

/**
 * Hook for monitoring security events and suspicious activities
 */
export function useSecurityMonitoring(options: SecurityMonitoringOptions = {}) {
  const { user } = useAuth()
  const securityEventsRef = useRef<SecurityEvent[]>([])
  const lastActivityRef = useRef<Date>(new Date())

  const {
    enableRealTimeMonitoring = true,
    logToServer = true,
    alertOnSuspiciousActivity = true
  } = options

  // Log security event
  const logSecurityEvent = useCallback(async (event: SecurityEvent) => {
    securityEventsRef.current.push(event)
    
    // Keep only last 100 events in memory
    if (securityEventsRef.current.length > 100) {
      securityEventsRef.current = securityEventsRef.current.slice(-100)
    }

    // Log to server if enabled and user is authenticated
    if (logToServer && user) {
      try {
        await supabase.rpc('create_audit_log', {
          p_table_name: 'security_events',
          p_operation: event.type,
          p_record_id: user.id,
          p_new_data: event.details,
          p_additional_info: {
            timestamp: event.timestamp.toISOString(),
            user_agent: navigator.userAgent,
            url: window.location.pathname,
            referrer: document.referrer
          }
        })
      } catch (error) {
        console.warn('Failed to log security event:', error)
      }
    }

    // Alert on suspicious activity
    if (alertOnSuspiciousActivity) {
      if (event.type === 'RATE_LIMIT_EXCEEDED' || event.type === 'SUSPICIOUS_ACTIVITY') {
        console.warn('🚨 Security Alert:', event)
        
        // You could integrate with external monitoring services here
        // e.g., Sentry, LogRocket, etc.
      }
    }
  }, [user, logToServer, alertOnSuspiciousActivity])

  // Monitor sensitive operations
  const monitorSensitiveOperation = useCallback(async (
    operation: string,
    details: any = {}
  ) => {
    if (!user) return false

    const allowed = checkSensitiveOperationLimit(user.id, operation)
    
    if (!allowed) {
      await logSecurityEvent({
        type: 'RATE_LIMIT_EXCEEDED',
        details: {
          operation,
          user_id: user.id,
          user_role: user.role,
          ...details
        },
        timestamp: new Date()
      })
      return false
    }

    await logSecurityEvent({
      type: 'SENSITIVE_OPERATION',
      details: {
        operation,
        user_id: user.id,
        user_role: user.role,
        ...details
      },
      timestamp: new Date()
    })

    return true
  }, [user, logSecurityEvent])

  // Monitor authentication attempts
  const monitorAuthAttempt = useCallback(async (
    type: 'LOGIN' | 'LOGOUT' | 'PASSWORD_RESET',
    success: boolean,
    details: any = {}
  ) => {
    await logSecurityEvent({
      type: 'AUTH_ATTEMPT',
      details: {
        auth_type: type,
        success,
        user_id: user?.id,
        ...details
      },
      timestamp: new Date()
    })
  }, [user, logSecurityEvent])

  // Detect suspicious patterns
  const detectSuspiciousActivity = useCallback(() => {
    const recentEvents = securityEventsRef.current.filter(
      event => Date.now() - event.timestamp.getTime() < 5 * 60 * 1000 // Last 5 minutes
    )

    // Pattern 1: Multiple failed auth attempts
    const failedAuthAttempts = recentEvents.filter(
      event => event.type === 'AUTH_ATTEMPT' && !event.details.success
    ).length

    if (failedAuthAttempts >= 3) {
      logSecurityEvent({
        type: 'SUSPICIOUS_ACTIVITY',
        details: {
          pattern: 'MULTIPLE_FAILED_AUTH',
          count: failedAuthAttempts,
          user_id: user?.id
        },
        timestamp: new Date()
      })
    }

    // Pattern 2: Rapid sensitive operations
    const sensitiveOps = recentEvents.filter(
      event => event.type === 'SENSITIVE_OPERATION'
    ).length

    if (sensitiveOps >= 10) {
      logSecurityEvent({
        type: 'SUSPICIOUS_ACTIVITY',
        details: {
          pattern: 'RAPID_SENSITIVE_OPERATIONS',
          count: sensitiveOps,
          user_id: user?.id
        },
        timestamp: new Date()
      })
    }

    // Pattern 3: Multiple rate limit exceeded
    const rateLimitExceeded = recentEvents.filter(
      event => event.type === 'RATE_LIMIT_EXCEEDED'
    ).length

    if (rateLimitExceeded >= 3) {
      logSecurityEvent({
        type: 'SUSPICIOUS_ACTIVITY',
        details: {
          pattern: 'MULTIPLE_RATE_LIMIT_EXCEEDED',
          count: rateLimitExceeded,
          user_id: user?.id
        },
        timestamp: new Date()
      })
    }
  }, [user, logSecurityEvent])

  // Monitor user activity patterns
  const trackActivity = useCallback(() => {
    lastActivityRef.current = new Date()
    
    // Check for suspicious patterns periodically
    if (Math.random() < 0.1) { // 10% chance to run detection
      detectSuspiciousActivity()
    }
  }, [detectSuspiciousActivity])

  // Set up activity monitoring
  useEffect(() => {
    if (!enableRealTimeMonitoring) return

    const handleActivity = () => trackActivity()
    
    // Monitor various user activities
    const events = ['click', 'keypress', 'scroll', 'mousemove', 'touchstart']
    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true })
    })

    // Periodic suspicious activity detection
    const interval = setInterval(detectSuspiciousActivity, 60000) // Every minute

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity)
      })
      clearInterval(interval)
    }
  }, [enableRealTimeMonitoring, trackActivity, detectSuspiciousActivity])

  // Monitor page visibility changes (potential session hijacking)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        logSecurityEvent({
          type: 'SUSPICIOUS_ACTIVITY',
          details: {
            pattern: 'PAGE_HIDDEN',
            user_id: user?.id,
            duration: Date.now() - lastActivityRef.current.getTime()
          },
          timestamp: new Date()
        })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [user, logSecurityEvent])

  // Get security summary
  const getSecuritySummary = useCallback(() => {
    const events = securityEventsRef.current
    const last24Hours = events.filter(
      event => Date.now() - event.timestamp.getTime() < 24 * 60 * 60 * 1000
    )

    return {
      totalEvents: events.length,
      last24Hours: last24Hours.length,
      authAttempts: last24Hours.filter(e => e.type === 'AUTH_ATTEMPT').length,
      sensitiveOperations: last24Hours.filter(e => e.type === 'SENSITIVE_OPERATION').length,
      rateLimitExceeded: last24Hours.filter(e => e.type === 'RATE_LIMIT_EXCEEDED').length,
      suspiciousActivities: last24Hours.filter(e => e.type === 'SUSPICIOUS_ACTIVITY').length,
      lastActivity: lastActivityRef.current
    }
  }, [])

  // Check if current session is secure
  const isSessionSecure = useCallback(() => {
    if (!user) return false

    const recentSuspicious = securityEventsRef.current.filter(
      event => 
        event.type === 'SUSPICIOUS_ACTIVITY' &&
        Date.now() - event.timestamp.getTime() < 10 * 60 * 1000 // Last 10 minutes
    )

    return recentSuspicious.length === 0
  }, [user])

  return {
    logSecurityEvent,
    monitorSensitiveOperation,
    monitorAuthAttempt,
    getSecuritySummary,
    isSessionSecure,
    trackActivity
  }
}

/**
 * Higher-order component for protecting sensitive operations
 */
export function withSecurityMonitoring<T extends any[]>(
  operation: string,
  fn: (...args: T) => Promise<any>
) {
  return async (...args: T) => {
    const { monitorSensitiveOperation } = useSecurityMonitoring()
    
    const allowed = await monitorSensitiveOperation(operation, { args })
    if (!allowed) {
      throw new Error('Operation blocked due to rate limiting')
    }

    return fn(...args)
  }
}