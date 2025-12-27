import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

export interface CompanyInfo {
  name: string;
  address: string;
  phone: string;
  logo: string;
  latitude?: number | null;
  longitude?: number | null;
  attendanceRadius?: number | null;
  timezone?: string; // e.g., 'Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'
  // Bank accounts for invoice
  bankAccount1?: string; // e.g., "MANDIRI-1540020855197"
  bankAccount2?: string; // e.g., "BNI-2990213245"
  bankAccount3?: string; // e.g., "BRI-777201000033304"
  bankAccountName?: string; // Nama pemilik rekening, e.g., "CV. PERSADA INTIM PUSAKA"
  salesPhone?: string; // Nomor HP Sales
}

export const useCompanySettings = () => {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery<CompanyInfo>({
    queryKey: ['companySettings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('company_settings').select('key, value');
      if (error) throw new Error(error.message);

      const settingsObj = data.reduce((acc, { key, value }) => {
        acc[key] = value;
        return acc;
      }, {} as any);

      return {
        name: settingsObj.company_name || '',
        address: settingsObj.company_address || '',
        phone: settingsObj.company_phone || '',
        logo: settingsObj.company_logo || '',
        latitude: settingsObj.company_latitude ? parseFloat(settingsObj.company_latitude) : null,
        longitude: settingsObj.company_longitude ? parseFloat(settingsObj.company_longitude) : null,
        attendanceRadius: settingsObj.company_attendance_radius ? parseInt(settingsObj.company_attendance_radius, 10) : null,
        timezone: settingsObj.company_timezone || 'Asia/Jakarta', // Default WIB
        bankAccount1: settingsObj.company_bank_account_1 || '',
        bankAccount2: settingsObj.company_bank_account_2 || '',
        bankAccount3: settingsObj.company_bank_account_3 || '',
        bankAccountName: settingsObj.company_bank_account_name || '',
        salesPhone: settingsObj.company_sales_phone || '',
      };
    },
    staleTime: 60 * 60 * 1000, // 1 hour (settings rarely change)
    gcTime: 2 * 60 * 60 * 1000, // 2 hours cache
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const updateSettings = useMutation({
    mutationFn: async (newInfo: CompanyInfo) => {
      const settingsData = [
        { key: 'company_name', value: newInfo.name },
        { key: 'company_address', value: newInfo.address },
        { key: 'company_phone', value: newInfo.phone },
        { key: 'company_logo', value: newInfo.logo },
        { key: 'company_latitude', value: newInfo.latitude?.toString() ?? '' },
        { key: 'company_longitude', value: newInfo.longitude?.toString() ?? '' },
        { key: 'company_attendance_radius', value: newInfo.attendanceRadius?.toString() ?? '' },
        { key: 'company_timezone', value: newInfo.timezone || 'Asia/Jakarta' },
        { key: 'company_bank_account_1', value: newInfo.bankAccount1 || '' },
        { key: 'company_bank_account_2', value: newInfo.bankAccount2 || '' },
        { key: 'company_bank_account_3', value: newInfo.bankAccount3 || '' },
        { key: 'company_bank_account_name', value: newInfo.bankAccountName || '' },
        { key: 'company_sales_phone', value: newInfo.salesPhone || '' },
      ];
      const { error } = await supabase.from('company_settings').upsert(settingsData);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companySettings'] });
    }
  });

  return { settings, isLoading, updateSettings };
}