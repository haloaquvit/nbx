import { useRef, useEffect } from 'react'

/**
 * Hook to detect and log unnecessary re-renders in development
 */
export function useRenderTracker(componentName: string, props?: Record<string, any>) {
  const renderCount = useRef(0)
  const prevProps = useRef(props)
  
  renderCount.current++
  
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔄 [${componentName}] Render #${renderCount.current}`)
      
      if (props && prevProps.current) {
        const changedProps = Object.keys(props).filter(
          key => props[key] !== prevProps.current?.[key]
        )
        
        if (changedProps.length > 0) {
          console.log(`📝 [${componentName}] Props changed:`, changedProps.map(key => ({
            prop: key,
            from: prevProps.current?.[key],
            to: props[key]
          })))
        }
      }
      
      prevProps.current = props
    }
  })
}

/**
 * Hook to warn about expensive re-renders
 */
export function useExpensiveRenderWarning(
  componentName: string, 
  threshold: number = 100,
  deps?: React.DependencyList
) {
  const startTime = useRef<number>()
  
  // Mark render start
  startTime.current = performance.now()
  
  useEffect(() => {
    if (startTime.current) {
      const renderTime = performance.now() - startTime.current
      
      if (renderTime > threshold) {
        console.warn(
          `⚠️ [${componentName}] Slow render: ${renderTime.toFixed(2)}ms`,
          deps ? { dependencies: deps } : {}
        )
      }
    }
  })
}

/**
 * Utility to create memoized components with render tracking
 */
export function createMemoizedComponent<T extends React.ComponentType<any>>(
  Component: T,
  componentName: string,
  propsAreEqual?: (prevProps: any, nextProps: any) => boolean
): T {
  const MemoizedComponent = React.memo(Component, propsAreEqual) as T
  
  if (process.env.NODE_ENV === 'development') {
    MemoizedComponent.displayName = `Memo(${componentName})`
  }
  
  return MemoizedComponent
}

/**
 * Deep comparison for React.memo
 */
export function deepEqual(prevProps: any, nextProps: any): boolean {
  const prevKeys = Object.keys(prevProps)
  const nextKeys = Object.keys(nextProps)
  
  if (prevKeys.length !== nextKeys.length) {
    return false
  }
  
  for (const key of prevKeys) {
    if (!nextKeys.includes(key)) {
      return false
    }
    
    const prevValue = prevProps[key]
    const nextValue = nextProps[key]
    
    if (prevValue === nextValue) {
      continue
    }
    
    if (
      typeof prevValue !== 'object' ||
      typeof nextValue !== 'object' ||
      prevValue == null ||
      nextValue == null
    ) {
      return false
    }
    
    if (Array.isArray(prevValue) !== Array.isArray(nextValue)) {
      return false
    }
    
    if (Array.isArray(prevValue)) {
      if (prevValue.length !== nextValue.length) {
        return false
      }
      
      for (let i = 0; i < prevValue.length; i++) {
        if (!deepEqual({ value: prevValue[i] }, { value: nextValue[i] })) {
          return false
        }
      }
      
      continue
    }
    
    if (!deepEqual(prevValue, nextValue)) {
      return false
    }
  }
  
  return true
}

/**
 * Shallow comparison for React.memo (more performant than deep)
 */
export function shallowEqual(prevProps: any, nextProps: any): boolean {
  const prevKeys = Object.keys(prevProps)
  const nextKeys = Object.keys(nextProps)
  
  if (prevKeys.length !== nextKeys.length) {
    return false
  }
  
  for (const key of prevKeys) {
    if (prevProps[key] !== nextProps[key]) {
      return false
    }
  }
  
  return true
}

/**
 * Create stable references for arrays/objects to prevent re-renders
 */
export function useStableReference<T>(value: T): T {
  const ref = useRef<T>(value)
  
  // Only update if the value has actually changed (deep comparison)
  if (!deepEqual({ value: ref.current }, { value })) {
    ref.current = value
  }
  
  return ref.current
}

/**
 * Bundle size optimization - remove console.logs in production
 */
export const devLog = process.env.NODE_ENV === 'development' 
  ? console.log.bind(console)
  : () => {}

export const devWarn = process.env.NODE_ENV === 'development'
  ? console.warn.bind(console)
  : () => {}

export const devError = process.env.NODE_ENV === 'development'
  ? console.error.bind(console)
  : () => {}

/**
 * Performance monitoring for components
 */
export class PerformanceMonitor {
  private static instance: PerformanceMonitor
  private measurements: Map<string, number[]> = new Map()
  
  static getInstance() {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor()
    }
    return PerformanceMonitor.instance
  }
  
  startMeasurement(name: string) {
    performance.mark(`${name}-start`)
  }
  
  endMeasurement(name: string) {
    performance.mark(`${name}-end`)
    performance.measure(name, `${name}-start`, `${name}-end`)
    
    const entries = performance.getEntriesByName(name)
    const latest = entries[entries.length - 1]
    
    if (latest) {
      const measurements = this.measurements.get(name) || []
      measurements.push(latest.duration)
      
      // Keep only last 10 measurements
      if (measurements.length > 10) {
        measurements.shift()
      }
      
      this.measurements.set(name, measurements)
      
      // Clear performance entries to prevent memory leak
      performance.clearMarks(`${name}-start`)
      performance.clearMarks(`${name}-end`)
      performance.clearMeasures(name)
    }
  }
  
  getStats(name: string) {
    const measurements = this.measurements.get(name) || []
    if (measurements.length === 0) return null
    
    const sum = measurements.reduce((a, b) => a + b, 0)
    const avg = sum / measurements.length
    const min = Math.min(...measurements)
    const max = Math.max(...measurements)
    
    return { avg, min, max, count: measurements.length }
  }
  
  getAllStats() {
    const stats: Record<string, any> = {}
    for (const [name] of this.measurements) {
      stats[name] = this.getStats(name)
    }
    return stats
  }
}

// Re-export React for convenience
import React from 'react'