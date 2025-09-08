import { useMemo, useRef } from 'react'

/**
 * Custom hook that provides stable selectors to prevent unnecessary re-renders
 * Uses deep equality comparison for objects and arrays
 */
export function useStableSelector<T, R>(
  data: T,
  selector: (data: T) => R,
  deps?: React.DependencyList
): R {
  const lastResultRef = useRef<R>()
  const lastDataRef = useRef<T>()
  
  return useMemo(() => {
    // If data hasn't changed (reference equality), return cached result
    if (data === lastDataRef.current && lastResultRef.current !== undefined) {
      return lastResultRef.current
    }
    
    // Calculate new result
    const newResult = selector(data)
    
    // If result hasn't changed (deep equality), return cached result
    if (lastResultRef.current !== undefined && deepEqual(newResult, lastResultRef.current)) {
      return lastResultRef.current
    }
    
    // Update refs and return new result
    lastDataRef.current = data
    lastResultRef.current = newResult
    return newResult
  }, [data, ...(deps || [])])
}

/**
 * Hook for creating stable callbacks that don't change unless dependencies change
 */
export function useStableCallback<T extends (...args: any[]) => any>(
  callback: T,
  deps: React.DependencyList
): T {
  const callbackRef = useRef<T>(callback)
  const depsRef = useRef<React.DependencyList>(deps)
  
  // Update callback only if dependencies changed
  if (!areArraysEqual(deps, depsRef.current)) {
    callbackRef.current = callback
    depsRef.current = deps
  }
  
  return callbackRef.current
}

/**
 * Hook for stable derived state with expensive calculations
 */
export function useStableDerivedState<T, R>(
  data: T,
  compute: (data: T) => R,
  isEqual?: (a: R, b: R) => boolean
): R {
  const computeRef = useRef(compute)
  const resultRef = useRef<R>()
  const dataRef = useRef<T>()
  
  computeRef.current = compute
  
  return useMemo(() => {
    // Skip computation if data hasn't changed
    if (data === dataRef.current && resultRef.current !== undefined) {
      return resultRef.current
    }
    
    const newResult = computeRef.current(data)
    
    // Use custom equality function if provided
    const equalityCheck = isEqual || deepEqual
    
    if (resultRef.current !== undefined && equalityCheck(newResult, resultRef.current)) {
      return resultRef.current
    }
    
    dataRef.current = data
    resultRef.current = newResult
    return newResult
  }, [data, isEqual])
}

// Deep equality comparison utility
function deepEqual(a: any, b: any): boolean {
  if (a === b) return true
  
  if (a == null || b == null) return false
  
  if (typeof a !== typeof b) return false
  
  if (typeof a !== 'object') return a === b
  
  // Handle arrays
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false
    }
    return true
  }
  
  if (Array.isArray(b)) return false
  
  // Handle objects
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  
  if (keysA.length !== keysB.length) return false
  
  for (const key of keysA) {
    if (!keysB.includes(key) || !deepEqual(a[key], b[key])) return false
  }
  
  return true
}

// Array equality comparison utility
function areArraysEqual(a: any[], b: any[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/**
 * Hook for pagination with stable selectors
 */
export function useStablePagination<T>(
  data: T[],
  pageSize: number = 50,
  currentPage: number = 1
) {
  return useStableDerivedState(
    { data, pageSize, currentPage },
    ({ data, pageSize, currentPage }) => {
      const startIndex = (currentPage - 1) * pageSize
      const endIndex = startIndex + pageSize
      
      return {
        items: data.slice(startIndex, endIndex),
        totalItems: data.length,
        totalPages: Math.ceil(data.length / pageSize),
        hasNextPage: endIndex < data.length,
        hasPrevPage: currentPage > 1,
        currentPage,
        pageSize
      }
    }
  )
}

/**
 * Hook for stable search filtering
 */
export function useStableFilter<T>(
  data: T[],
  searchTerm: string,
  filterFn: (item: T, searchTerm: string) => boolean,
  debounceMs: number = 300
) {
  // Debounce search term
  const debouncedSearchTerm = useDebounce(searchTerm, debounceMs)
  
  return useStableDerivedState(
    { data, searchTerm: debouncedSearchTerm, filterFn },
    ({ data, searchTerm, filterFn }) => {
      if (!searchTerm.trim()) return data
      return data.filter(item => filterFn(item, searchTerm))
    }
  )
}

/**
 * Debounce hook for search optimization
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)
  
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)
    
    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])
  
  return debouncedValue
}

// Re-export useState and useEffect for convenience
import { useState, useEffect } from 'react'