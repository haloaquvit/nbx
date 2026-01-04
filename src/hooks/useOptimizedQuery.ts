import { useQuery, useQueryClient, UseQueryOptions } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

interface OptimizedQueryOptions<T> extends Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'> {
  queryKey: string[]
  tableName?: string
  logPerformance?: boolean
}

/**
 * Custom hook for optimized database queries with performance logging
 */
export function useOptimizedQuery<T>(
  options: OptimizedQueryOptions<T> & {
    queryFn: () => Promise<T>
  }
) {
  const queryClient = useQueryClient()

  return useQuery({
    ...options,
    queryFn: async () => {
      const startTime = performance.now()
      
      try {
        const result = await options.queryFn()
        
        // Log performance if enabled - with safe fallback
        if (options.logPerformance && options.tableName) {
          const duration = Math.round(performance.now() - startTime)
          
          // Only log if duration is significant (> 100ms)
          if (duration > 100) {
            // Use safe performance logging with fallback
            import('@/utils/safeAuditLog').then(({ safePerformanceLog }) => {
              safePerformanceLog(
                options.queryKey.join('_'),
                duration,
                options.tableName,
                {
                  query_key: options.queryKey,
                  browser: navigator.userAgent.split(' ')[0]
                }
              )
            }).catch(error => {
              console.warn('Performance logging failed:', error)
            })
          }
        }
        
        return result
      } catch (error) {
        const duration = Math.round(performance.now() - startTime)
        
        // Log failed queries for debugging
        if (options.logPerformance) {
          supabase.rpc('log_performance', {
            p_operation_name: `${options.queryKey.join('_')}_ERROR`,
            p_duration_ms: duration,
            p_table_name: options.tableName || 'unknown',
            p_query_type: 'SELECT_ERROR',
            p_metadata: {
              error: error instanceof Error ? error.message : 'Unknown error',
              query_key: options.queryKey
            }
          }).catch(logError => {
            console.warn('Error logging failed:', logError)
          })
        }
        
        throw error
      }
    },
    // Default optimizations
    staleTime: options.staleTime ?? 5 * 60 * 1000, // 5 minutes
    cacheTime: options.cacheTime ?? 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: options.refetchOnWindowFocus ?? false,
    refetchOnMount: options.refetchOnMount ?? true,
  })
}

/**
 * Hook for optimized transaction search with pagination
 */
export function useOptimizedTransactionSearch(
  searchTerm: string = '',
  statusFilter: string | null = null,
  limit: number = 50,
  offset: number = 0
) {
  return useOptimizedQuery({
    queryKey: ['transactions_search', searchTerm, statusFilter, limit, offset],
    tableName: 'transactions',
    logPerformance: true,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.rpc('search_transactions', {
          search_term: searchTerm,
          limit_count: limit,
          offset_count: offset,
          status_filter: statusFilter
        })

        if (error) {
          if (error.message.includes('function') && error.message.includes('does not exist')) {
            console.warn('[Transaction Search] RPC fallback to direct query')
            return await fallbackTransactionSearch(searchTerm, statusFilter, limit, offset)
          }
          throw error
        }
        return data || []
      } catch (error) {
        console.warn('[Transaction Search] RPC failed, using fallback:', error)
        return await fallbackTransactionSearch(searchTerm, statusFilter, limit, offset)
      }
    },
    enabled: true,
    staleTime: 2 * 60 * 1000, // 2 minutes for search results
  })
}

// Fallback for transaction search
async function fallbackTransactionSearch(
  searchTerm: string = '',
  statusFilter: string | null = null,
  limit: number = 50,
  offset: number = 0
) {
  let query = supabase
    .from('transactions')
    .select(`
      id,
      customer_name,
      total,
      paid_amount,
      payment_status,
      status,
      order_date,
      created_at
    `)

  if (searchTerm) {
    query = query.or(`customer_name.ilike.%${searchTerm}%,id.ilike.%${searchTerm}%`)
  }

  if (statusFilter) {
    query = query.eq('status', statusFilter)
  }

  query = query
    .order('order_date', { ascending: false })
    .range(offset, offset + limit - 1)

  const { data, error } = await query
  if (error) throw error

  return (data || []).map(t => ({
    ...t,
    customer_display_name: t.customer_name,
    cashier_name: null // Will be null in fallback
  }))
}

/**
 * Hook for optimized product search
 */
export function useOptimizedProductSearch(
  searchTerm: string = '',
  categoryFilter: string | null = null,
  limit: number = 50
) {
  return useOptimizedQuery({
    queryKey: ['products_search', searchTerm, categoryFilter, limit],
    tableName: 'products',
    logPerformance: true,
    queryFn: async () => {
      // First try the optimized RPC function
      try {
        const { data, error } = await supabase.rpc('search_products_with_stock', {
          search_term: searchTerm,
          category_filter: categoryFilter,
          limit_count: limit
        })

        if (error) {
          // If RPC function doesn't exist, fallback to direct query
          if (error.message.includes('function') && error.message.includes('does not exist')) {
            console.warn('[Product Search] RPC fallback to direct query')
            return await fallbackProductSearch(searchTerm, categoryFilter, limit)
          }
          throw error
        }
        return data || []
      } catch (error) {
        console.warn('[Product Search] RPC failed, using fallback:', error)
        return await fallbackProductSearch(searchTerm, categoryFilter, limit)
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes for product data
  })
}

// Fallback function for direct product search
// Stock is fetched from v_product_current_stock VIEW (source of truth)
async function fallbackProductSearch(
  searchTerm: string = '',
  categoryFilter: string | null = null,
  limit: number = 50
) {
  let query = supabase
    .from('products')
    .select(`
      id,
      name,
      type,
      base_price,
      unit,
      min_order,
      min_stock,
      description,
      specifications
    `)

  if (searchTerm) {
    query = query.ilike('name', `%${searchTerm}%`)
  }

  if (categoryFilter) {
    query = query.eq('type', categoryFilter)
  }

  query = query.limit(limit).order('name')

  const { data, error } = await query

  if (error) throw error

  // Get stock from VIEW (source of truth)
  const productIds = (data || []).map(p => p.id);
  let stockMap = new Map<string, number>();

  if (productIds.length > 0) {
    const { data: stockData } = await supabase
      .from('v_product_current_stock')
      .select('product_id, current_stock')
      .in('product_id', productIds);
    (stockData || []).forEach((s: any) => stockMap.set(s.product_id, Number(s.current_stock) || 0));
  }

  // Transform data to match RPC output format
  return (data || []).map(product => {
    const currentStock = stockMap.get(product.id) || 0;
    return {
      id: product.id,
      name: product.name,
      category: product.type || 'Produksi',
      base_price: product.base_price,
      unit: product.unit,
      current_stock: currentStock,
      min_order: product.min_order,
      is_low_stock: currentStock <= (product.min_order || 0)
    };
  })
}

/**
 * Hook for optimized customer search
 */
export function useOptimizedCustomerSearch(
  searchTerm: string = '',
  limit: number = 50
) {
  return useOptimizedQuery({
    queryKey: ['customers_search', searchTerm, limit],
    tableName: 'customers',
    logPerformance: true,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_customers', {
        search_term: searchTerm,
        limit_count: limit
      })

      if (error) throw error
      return data || []
    },
    staleTime: 10 * 60 * 1000, // 10 minutes for customer data
  })
}

/**
 * Hook for dashboard summary with optimized caching
 */
export function useOptimizedDashboardSummary() {
  return useOptimizedQuery({
    queryKey: ['dashboard_summary'],
    tableName: 'dashboard_summary',
    logPerformance: true,
    queryFn: async () => {
      try {
        // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
        const { data: dataRaw, error } = await supabase
          .from('dashboard_summary')
          .select('*')
          .order('id').limit(1)

        if (error) {
          // If view doesn't exist, fallback to direct calculation
          if (error.message.includes('relation') && error.message.includes('does not exist')) {
            console.warn('[Dashboard] Summary view not found, using fallback calculation')
            return await fallbackDashboardSummary()
          }
          throw error
        }
        const data = Array.isArray(dataRaw) ? dataRaw[0] : dataRaw
        return data
      } catch (error) {
        console.warn('[Dashboard] Summary query failed, using fallback:', error)
        return await fallbackDashboardSummary()
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 15 * 60 * 1000, // 15 minutes
  })
}

// Fallback dashboard calculation
async function fallbackDashboardSummary() {
  try {
    // Get basic transaction stats
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('total, payment_status, order_date')
      .gte('order_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

    if (txError) throw txError

    const totalTransactions = transactions?.length || 0
    const totalRevenue = transactions?.reduce((sum, t) => sum + (t.total || 0), 0) || 0
    const paidTransactions = transactions?.filter(t => t.payment_status === 'Lunas').length || 0
    const unpaidTransactions = transactions?.filter(t => t.payment_status === 'Belum Lunas').length || 0

    // Get basic product count
    const { count: productCount } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })

    // Get basic customer count
    const { count: customerCount } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })

    return {
      total_transactions: totalTransactions,
      total_revenue: totalRevenue,
      paid_transactions: paidTransactions,
      unpaid_transactions: unpaidTransactions,
      total_products: productCount || 0,
      low_stock_products: 0, // Cannot calculate without complex query
      total_customers: customerCount || 0
    }
  } catch (error) {
    console.warn('[Dashboard] Fallback calculation failed:', error)
    // Return empty state
    return {
      total_transactions: 0,
      total_revenue: 0,
      paid_transactions: 0,
      unpaid_transactions: 0,
      total_products: 0,
      low_stock_products: 0,
      total_customers: 0
    }
  }
}

/**
 * Prefetch commonly used data
 */
export function usePrefetchCommonData() {
  const queryClient = useQueryClient()

  const prefetchProducts = () => {
    queryClient.prefetchQuery({
      queryKey: ['products_search', '', null, 50],
      queryFn: async () => {
        const { data, error } = await supabase.rpc('search_products_with_stock', {
          search_term: '',
          category_filter: null,
          limit_count: 50
        })
        if (error) throw error
        return data || []
      },
      staleTime: 5 * 60 * 1000,
    })
  }

  const prefetchCustomers = () => {
    queryClient.prefetchQuery({
      queryKey: ['customers_search', '', 50],
      queryFn: async () => {
        const { data, error } = await supabase.rpc('search_customers', {
          search_term: '',
          limit_count: 50
        })
        if (error) throw error
        return data || []
      },
      staleTime: 10 * 60 * 1000,
    })
  }

  return {
    prefetchProducts,
    prefetchCustomers,
    prefetchAll: () => {
      prefetchProducts()
      prefetchCustomers()
    }
  }
}