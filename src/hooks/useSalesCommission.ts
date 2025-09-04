import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { SalesCommissionSetting, SalesCommissionReport, SalesCommissionTransaction } from '@/types/commission'
import { Employee } from '@/types/employee'

export const useSalesEmployees = () => {
  return useQuery<Employee[]>({
    queryKey: ['sales-employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, username, email, role, phone, status')
        .eq('role', 'sales')
        .eq('status', 'Aktif')

      if (error) {
        console.error('[useSalesEmployees] Error:', error)
        return []
      }

      console.log('[useSalesEmployees] Raw data:', data)
      
      const mappedEmployees = (data || []).map((employee: any) => ({
        id: employee.id,
        name: employee.full_name || employee.username || employee.email || 'Unknown',
        username: employee.username || employee.email || '',
        email: employee.email || '',
        role: employee.role,
        phone: employee.phone || '',
        address: '',
        status: employee.status || 'Aktif',
      }))
      
      console.log('[useSalesEmployees] Mapped employees:', mappedEmployees)
      
      return mappedEmployees
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}

export const useSalesCommissionSettings = () => {
  const queryClient = useQueryClient()

  const { data: settings, isLoading } = useQuery<SalesCommissionSetting[]>({
    queryKey: ['sales-commission-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_commission_settings')
        .select(`
          *,
          sales:profiles!sales_id(full_name)
        `)
        .eq('is_active', true)

      if (error) {
        console.error('[useSalesCommissionSettings] Error:', error)
        return []
      }

      return (data || []).map((setting: any) => ({
        id: setting.id,
        salesId: setting.sales_id,
        salesName: setting.sales?.full_name || 'Unknown',
        commissionType: setting.commission_type,
        commissionValue: setting.commission_value,
        isActive: setting.is_active,
        createdAt: new Date(setting.created_at),
        updatedAt: new Date(setting.updated_at),
        createdBy: setting.created_by,
      }))
    },
  })

  const createSetting = useMutation({
    mutationFn: async (data: Omit<SalesCommissionSetting, 'id' | 'createdAt' | 'updatedAt'>) => {
      const { data: result, error } = await supabase
        .from('sales_commission_settings')
        .insert({
          sales_id: data.salesId,
          commission_type: data.commissionType,
          commission_value: data.commissionValue,
          is_active: data.isActive,
          created_by: data.createdBy,
        })
        .select()
        .single()

      if (error) throw error
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-commission-settings'] })
    },
  })

  const updateSetting = useMutation({
    mutationFn: async (data: Partial<SalesCommissionSetting> & { id: string }) => {
      const { data: result, error } = await supabase
        .from('sales_commission_settings')
        .update({
          commission_type: data.commissionType,
          commission_value: data.commissionValue,
          is_active: data.isActive,
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.id)
        .select()
        .single()

      if (error) throw error
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-commission-settings'] })
    },
  })

  const deleteSetting = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('sales_commission_settings')
        .update({ is_active: false })
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-commission-settings'] })
    },
  })

  return {
    settings: settings || [],
    isLoading,
    createSetting,
    updateSetting,
    deleteSetting,
  }
}

export const useSalesCommissionReport = (salesId?: string, startDate?: Date, endDate?: Date) => {
  return useQuery<SalesCommissionReport | null>({
    queryKey: ['sales-commission-report', salesId, startDate, endDate],
    queryFn: async () => {
      if (!salesId || !startDate || !endDate) return null

      // Get sales commission setting
      const { data: setting } = await supabase
        .from('sales_commission_settings')
        .select('commission_type, commission_value')
        .eq('sales_id', salesId)
        .eq('is_active', true)
        .single()

      if (!setting) return null

      // Get transactions for the sales person in the date range
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select(`
          id,
          customer_name,
          order_date,
          total,
          payment_status
        `)
        .eq('sales_id', salesId)
        .gte('order_date', startDate.toISOString())
        .lte('order_date', endDate.toISOString())
        .order('order_date', { ascending: false })

      if (error) {
        console.error('[useSalesCommissionReport] Error:', error)
        return null
      }

      const salesData = transactions || []
      const totalSales = salesData.reduce((sum, t) => sum + t.total, 0)
      const totalTransactions = salesData.length

      let commissionEarned = 0
      if (setting.commission_type === 'percentage') {
        commissionEarned = (totalSales * setting.commission_value) / 100
      } else {
        commissionEarned = totalTransactions * setting.commission_value
      }

      const commissionTransactions: SalesCommissionTransaction[] = salesData.map(t => {
        let transactionCommission = 0
        if (setting.commission_type === 'percentage') {
          transactionCommission = (t.total * setting.commission_value) / 100
        } else {
          transactionCommission = setting.commission_value
        }

        return {
          id: t.id,
          transactionId: t.id,
          customerName: t.customer_name,
          orderDate: new Date(t.order_date),
          totalAmount: t.total,
          commissionAmount: transactionCommission,
          status: t.payment_status === 'Lunas' ? 'paid' : 'pending',
        }
      })

      // Get sales name
      const { data: salesProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', salesId)
        .single()

      return {
        salesId,
        salesName: salesProfile?.full_name || 'Unknown',
        totalSales,
        totalTransactions,
        commissionEarned,
        commissionType: setting.commission_type,
        commissionRate: setting.commission_value,
        period: {
          startDate,
          endDate,
        },
        transactions: commissionTransactions,
      }
    },
    enabled: !!salesId && !!startDate && !!endDate,
  })
}