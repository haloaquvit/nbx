import { useQuery } from '@tanstack/react-query';
import { User, UserRole } from '@/types/user';
import { supabase } from '@/integrations/supabase/client';

export const useUsers = (role?: UserRole) => {
  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ['users', role],
    queryFn: async () => {
      let query = supabase.from('profiles').select('id, full_name, role');
      
      if (role) {
        query = query.eq('role', role);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(error.message);
      }

      return data.map(profile => ({
        id: profile.id,
        name: profile.full_name,
        role: profile.role,
      }));
    },
  });

  return { users, isLoading };
};