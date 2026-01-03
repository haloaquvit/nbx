import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranch } from '@/contexts/BranchContext';

export interface Driver {
  id: string;
  name: string;
  phone?: string;
  license_number?: string;
  is_active: boolean;
  role?: string; // 'supir' or 'helper'
}

export const useDrivers = () => {
  const { currentBranch } = useBranch();

  const { data: drivers, isLoading } = useQuery<Driver[]>({
    queryKey: ['drivers', currentBranch?.id],
    queryFn: async () => {
      // Get drivers from profiles table with 'supir' or 'helper' role
      try {
        let query = supabase
          .from('profiles')
          .select('id, full_name, phone, role, status, branch_id')
          .in('role', ['supir', 'helper'])
          .eq('status', 'Aktif')
          .order('full_name', { ascending: true });

        // Always apply branch filter based on selected branch
        // All users should see drivers from the currently selected branch only
        if (currentBranch?.id) {
          query = query.eq('branch_id', currentBranch.id);
        }

        const { data: profilesData, error: profilesError } = await query;

        if (!profilesError && profilesData && profilesData.length > 0) {
          return profilesData.map(profile => ({
            id: profile.id,
            name: profile.full_name,
            phone: profile.phone,
            license_number: null,
            is_active: true,
            role: profile.role,
          }));
        }
      } catch (error) {
        console.warn('Error fetching drivers from profiles table:', error);
      }

      // Fallback to other driver-related roles if no 'supir'/'helper' found
      try {
        let fallbackQuery = supabase
          .from('profiles')
          .select('id, full_name, phone, role, status, branch_id')
          .in('role', ['driver', 'operator'])
          .eq('status', 'Aktif')
          .order('full_name', { ascending: true });

        // Always apply branch filter based on selected branch
        if (currentBranch?.id) {
          fallbackQuery = fallbackQuery.eq('branch_id', currentBranch.id);
        }

        const { data: fallbackData, error: fallbackError } = await fallbackQuery;

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
    },
    enabled: !!currentBranch, // Only run when branch is loaded
  });

  return {
    drivers: drivers || [],
    isLoading,
  };
};