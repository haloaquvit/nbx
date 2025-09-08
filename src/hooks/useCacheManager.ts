import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect } from 'react'

/**
 * Cache management utilities for optimizing data fetching
 */
export function useCacheManager() {
  const queryClient = useQueryClient()

  // Clear old cache entries to free memory
  const clearStaleCache = useCallback(() => {
    const now = Date.now()
    const cacheData = queryClient.getQueryCache()
    
    cacheData.getAll().forEach(query => {
      const { dataUpdatedAt, gcTime } = query.state
      const isStale = now - dataUpdatedAt > (gcTime || 10 * 60 * 1000)
      
      if (isStale) {
        queryClient.removeQueries({ 
          queryKey: query.queryKey,
          exact: true 
        })
      }
    })
    
    console.log('🧹 Cleared stale cache entries')
  }, [queryClient])

  // Prefetch critical data
  const prefetchCriticalData = useCallback(() => {
    // Prefetch commonly used data with longer cache times
    const criticalQueries = [
      { key: ['products'], staleTime: 15 * 60 * 1000 }, // 15 minutes
      { key: ['users'], staleTime: 10 * 60 * 1000 }, // 10 minutes
      { key: ['accounts'], staleTime: 20 * 60 * 1000 }, // 20 minutes
      { key: ['company-settings'], staleTime: 30 * 60 * 1000 }, // 30 minutes
    ]

    criticalQueries.forEach(({ key, staleTime }) => {
      const existingData = queryClient.getQueryData(key)
      if (!existingData) {
        queryClient.prefetchQuery({
          queryKey: key,
          staleTime,
          gcTime: staleTime * 2,
        })
      }
    })
  }, [queryClient])

  // Optimized invalidation - only invalidate what's necessary
  const smartInvalidate = useCallback((
    patterns: string[],
    options: { 
      refetchActive?: boolean
      refetchInactive?: boolean 
    } = {}
  ) => {
    patterns.forEach(pattern => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey.join('_')
          return key.includes(pattern)
        },
        refetchType: options.refetchActive !== false ? 'active' : 'none'
      })
    })
  }, [queryClient])

  // Batch cache updates for better performance
  const batchCacheUpdates = useCallback((updates: Array<{
    queryKey: any[]
    updater: (oldData: any) => any
  }>) => {
    queryClient.getQueryCache().batch(() => {
      updates.forEach(({ queryKey, updater }) => {
        queryClient.setQueryData(queryKey, updater)
      })
    })
  }, [queryClient])

  // Get cache statistics for debugging
  const getCacheStats = useCallback(() => {
    const cache = queryClient.getQueryCache()
    const queries = cache.getAll()
    
    const stats = {
      total: queries.length,
      stale: 0,
      fresh: 0,
      loading: 0,
      error: 0,
      totalSize: 0
    }

    queries.forEach(query => {
      const { status, isStale } = query.state
      
      if (isStale) stats.stale++
      else stats.fresh++
      
      switch (status) {
        case 'loading': stats.loading++; break
        case 'error': stats.error++; break
      }
      
      // Rough size estimation
      try {
        const dataStr = JSON.stringify(query.state.data)
        stats.totalSize += dataStr?.length || 0
      } catch {
        // Ignore circular references
      }
    })

    return {
      ...stats,
      averageSize: stats.total ? Math.round(stats.totalSize / stats.total) : 0,
      sizeMB: (stats.totalSize / (1024 * 1024)).toFixed(2)
    }
  }, [queryClient])

  // Setup periodic cache cleaning
  useEffect(() => {
    const interval = setInterval(() => {
      clearStaleCache()
    }, 5 * 60 * 1000) // Every 5 minutes

    return () => clearInterval(interval)
  }, [clearStaleCache])

  // Setup memory pressure detection
  useEffect(() => {
    if ('memory' in performance && 'onmemorywarning' in window) {
      const handleMemoryPressure = () => {
        console.warn('🚨 Memory pressure detected, clearing cache')
        clearStaleCache()
        // Force garbage collection if available
        if ('gc' in window && typeof window.gc === 'function') {
          window.gc()
        }
      }

      // @ts-ignore - experimental API
      window.addEventListener('memorywarning', handleMemoryPressure)
      
      return () => {
        // @ts-ignore
        window.removeEventListener('memorywarning', handleMemoryPressure)
      }
    }
  }, [clearStaleCache])

  return {
    clearStaleCache,
    prefetchCriticalData,
    smartInvalidate,
    batchCacheUpdates,
    getCacheStats
  }
}

/**
 * Hook for smart data synchronization between related queries
 */
export function useDataSync() {
  const queryClient = useQueryClient()

  const syncTransactionData = useCallback((transactionId: string, updates: any) => {
    // Update all queries that might contain this transaction
    const relatedQueryKeys = [
      ['transactions'],
      ['transactions', transactionId],
      ['receivables'],
      ['sales-report'],
      ['dashboard-summary']
    ]

    queryClient.getQueryCache().batch(() => {
      relatedQueryKeys.forEach(queryKey => {
        queryClient.setQueryData(queryKey, (oldData: any) => {
          if (!oldData) return oldData
          
          // Handle different data structures
          if (Array.isArray(oldData)) {
            return oldData.map((item: any) => 
              item.id === transactionId ? { ...item, ...updates } : item
            )
          }
          
          if (oldData.id === transactionId) {
            return { ...oldData, ...updates }
          }
          
          return oldData
        })
      })
    })
  }, [queryClient])

  const syncProductData = useCallback((productId: string, updates: any) => {
    const relatedQueryKeys = [
      ['products'],
      ['products', productId],
      ['inventory'],
      ['products_search']
    ]

    queryClient.getQueryCache().batch(() => {
      relatedQueryKeys.forEach(queryKey => {
        queryClient.setQueryData(queryKey, (oldData: any) => {
          if (!oldData) return oldData
          
          if (Array.isArray(oldData)) {
            return oldData.map((item: any) => 
              item.id === productId ? { ...item, ...updates } : item
            )
          }
          
          return oldData.id === productId ? { ...oldData, ...updates } : oldData
        })
      })
    })
  }, [queryClient])

  return {
    syncTransactionData,
    syncProductData
  }
}

/**
 * Hook for background data refreshing
 */
export function useBackgroundRefresh() {
  const queryClient = useQueryClient()

  useEffect(() => {
    // Setup background refresh for critical data when app becomes visible
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Refresh critical data when app becomes visible
        const criticalQueries = [
          'dashboard-summary',
          'accounts',
          'transactions'
        ]

        criticalQueries.forEach(pattern => {
          queryClient.invalidateQueries({
            predicate: (query) => {
              const key = query.queryKey.join('_')
              return key.includes(pattern)
            },
            refetchType: 'active'
          })
        })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [queryClient])

  // Setup periodic refresh for real-time sensitive data
  useEffect(() => {
    const interval = setInterval(() => {
      // Only refresh if app is visible
      if (!document.hidden) {
        queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey.join('_')
            // Only refresh real-time sensitive data
            return key.includes('dashboard') || key.includes('accounts')
          },
          refetchType: 'active'
        })
      }
    }, 2 * 60 * 1000) // Every 2 minutes

    return () => clearInterval(interval)
  }, [queryClient])
}