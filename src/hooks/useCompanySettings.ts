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
      };
    }
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