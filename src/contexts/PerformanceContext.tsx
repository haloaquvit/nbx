import { createContext, useContext, useCallback, ReactNode } from 'react'
import { supabase } from '@/integrations/supabase/client'

interface PerformanceMetrics {
  operationName: string
  duration: number
  tableName?: string
  recordCount?: number
  metadata?: any
}

interface PerformanceContextType {
  logPerformance: (metrics: PerformanceMetrics) => void
  measureOperation: <T>(
    operationName: string,
    operation: () => Promise<T>,
    metadata?: any
  ) => Promise<T>
}

const PerformanceContext = createContext<PerformanceContextType | undefined>(undefined)

export const PerformanceProvider = ({ children }: { children: ReactNode }) => {
  const logPerformance = useCallback(async (metrics: PerformanceMetrics) => {
    // Only log if performance is concerning (> 100ms)
    if (metrics.duration < 100) return

    try {
      await supabase.rpc('log_performance', {
        p_operation_name: metrics.operationName,
        p_duration_ms: metrics.duration,
        p_table_name: metrics.tableName,
        p_record_count: metrics.recordCount,
        p_query_type: 'CLIENT_OPERATION',
        p_metadata: {
          ...metrics.metadata,
          timestamp: new Date().toISOString(),
          url: window.location.pathname,
          userAgent: navigator.userAgent.split(' ')[0]
        }
      })
    } catch (error) {
      // Silently fail performance logging to avoid affecting user experience
      console.warn('Performance logging failed:', error)
    }
  }, [])

  const measureOperation = useCallback(async <T,>(
    operationName: string,
    operation: () => Promise<T>,
    metadata?: any
  ): Promise<T> => {
    const startTime = performance.now()
    
    try {
      const result = await operation()
      const duration = Math.round(performance.now() - startTime)
      
      logPerformance({
        operationName,
        duration,
        metadata: {
          ...metadata,
          success: true
        }
      })
      
      return result
    } catch (error) {
      const duration = Math.round(performance.now() - startTime)
      
      logPerformance({
        operationName: `${operationName}_ERROR`,
        duration,
        metadata: {
          ...metadata,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      })
      
      throw error
    }
  }, [logPerformance])

  return (
    <PerformanceContext.Provider value={{ logPerformance, measureOperation }}>
      {children}
    </PerformanceContext.Provider>
  )
}

export const usePerformance = () => {
  const context = useContext(PerformanceContext)
  if (!context) {
    throw new Error('usePerformance must be used within a PerformanceProvider')
  }
  return context
}