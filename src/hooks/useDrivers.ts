import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Driver {
  id: string;
  name: string;
  phone?: string;
  license_number?: string;
  is_active: boolean;
}

export const useDrivers = () => {
  const { data: drivers, isLoading } = useQuery<Driver[]>({
    queryKey: ['drivers'],
    queryFn: async () => {
      // Get drivers from profiles table with 'supir' role
      try {
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name, phone, role, status')
          .eq('role', 'supir')
          .eq('status', 'Aktif')
          .order('full_name', { ascending: true });

        if (!profilesError && profilesData && profilesData.length > 0) {
          return profilesData.map(profile => ({
            id: profile.id,
            name: profile.full_name,
            phone: profile.phone,
            license_number: null,
            is_active: true,
          }));
        }
      } catch (error) {
        console.warn('Error fetching drivers from profiles table:', error);
      }

      // Fallback to other driver-related roles if no 'supir' found
      try {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('profiles')
          .select('id, full_name, phone, role, status')
          .in('role', ['driver', 'operator'])
          .eq('status', 'Aktif')
          .order('full_name', { ascending: true });

        if (!fallbackError && fallbackData && fallbackData.length > 0) {
          return fallbackData.map(profile => ({
            id: profile.id,
            name: profile.full_name,
            phone: profile.phone,
            license_number: null,
            is_active: true,
          }));
        }
      } catch (error) {
        console.warn('Error fetching fallback drivers:', error);
      }

      // Return empty array if no drivers found
      return [];
    }
  });

  return {
    drivers: drivers || [],
    isLoading,
  };
};