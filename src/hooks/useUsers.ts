import { useQuery } from '@tanstack/react-query';
import { User, UserRole } from '@/types/user';
import { supabase } from '@/integrations/supabase/client';
import { useBranch } from '@/contexts/BranchContext';

interface UseUsersOptions {
  role?: UserRole;
  filterByBranch?: boolean;
}

export const useUsers = (roleOrOptions?: UserRole | UseUsersOptions) => {
  const { currentBranch } = useBranch();

  // Handle both old API (role string) and new API (options object)
  const options: UseUsersOptions = typeof roleOrOptions === 'object'
    ? roleOrOptions
    : { role: roleOrOptions, filterByBranch: false };

  const { role, filterByBranch = false } = options;

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ['users', role, filterByBranch ? currentBranch?.id : null],
    queryFn: async () => {
      let query = supabase.from('profiles').select('id, full_name, role, branch_id');

      if (role) {
        query = query.eq('role', role);
      }

      // Filter by current branch if requested
      if (filterByBranch && currentBranch?.id) {
        query = query.eq('branch_id', currentBranch.id);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(error.message);
      }

      return data.map(profile => ({
        id: profile.id,
        name: profile.full_name,
        role: profile.role,
        branchId: profile.branch_id,
      }));
    },
  });

  return { users, isLoading };
};