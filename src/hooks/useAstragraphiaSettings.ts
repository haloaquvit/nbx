import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export type AstragraphiaContractType = 'bw' | 'color' // black-white or color

export interface AstragraphiaSettings {
  id: string
  // Black & White Contract
  bwRatePerClick: number
  bwMinimumMonthlyCharge: number
  // Color Contract  
  colorRatePerClick: number
  colorMinimumMonthlyCharge: number
  // Contract Info
  contractName: string
  contractStartDate: string
  contractEndDate?: string
  notes?: string
  updatedBy: string
  updatedAt: string
}

const DEFAULT_SETTINGS: Omit<AstragraphiaSettings, 'id' | 'updatedBy' | 'updatedAt'> = {
  // Default rates for B&W and Color
  bwRatePerClick: 45, // Rp per click for black & white
  bwMinimumMonthlyCharge: 50000, // Rp minimum for B&W
  colorRatePerClick: 300, // Rp per click for color (typically higher)
  colorMinimumMonthlyCharge: 100000, // Rp minimum for color
  // Contract info
  contractName: 'PT Astragraphia Document Solutions',
  contractStartDate: new Date().toISOString().split('T')[0],
  notes: 'Kontrak mesin xerox per klik cetak - Hitam Putih & Warna'
}

// Simulate API calls - replace with actual API endpoints
const mockApi = {
  getSettings: async (): Promise<AstragraphiaSettings> => {
    const stored = localStorage.getItem('astragraphia_settings')
    if (stored) {
      return JSON.parse(stored)
    }
    
    // Return default settings if none exist
    const defaultSettings: AstragraphiaSettings = {
      ...DEFAULT_SETTINGS,
      id: 'astragraphia-001',
      updatedBy: 'System',
      updatedAt: new Date().toISOString()
    }
    
    localStorage.setItem('astragraphia_settings', JSON.stringify(defaultSettings))
    return defaultSettings
  },

  updateSettings: async (settings: Partial<AstragraphiaSettings> & { updatedBy: string }): Promise<AstragraphiaSettings> => {
    const current = await mockApi.getSettings()
    const updated: AstragraphiaSettings = {
      ...current,
      ...settings,
      updatedAt: new Date().toISOString()
    }
    
    localStorage.setItem('astragraphia_settings', JSON.stringify(updated))
    return updated
  }
}

export const useAstragraphiaSettings = () => {
  const queryClient = useQueryClient()

  const { data: settings, isLoading, error } = useQuery({
    queryKey: ['astragraphia-settings'],
    queryFn: mockApi.getSettings,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  })

  const updateSettingsMutation = useMutation({
    mutationFn: mockApi.updateSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(['astragraphia-settings'], data)
      queryClient.invalidateQueries({ queryKey: ['astragraphia-settings'] })
    },
    onError: (error) => {
      console.error('Failed to update Astragraphia settings:', error)
    },
  })

  const updateSettings = (newSettings: Partial<AstragraphiaSettings> & { updatedBy: string }) => {
    return updateSettingsMutation.mutateAsync(newSettings)
  }

  return {
    settings: settings || {
      ...DEFAULT_SETTINGS,
      id: 'default',
      updatedBy: 'System',
      updatedAt: new Date().toISOString()
    },
    isLoading,
    error,
    updateSettings,
    isUpdating: updateSettingsMutation.isPending
  }
}