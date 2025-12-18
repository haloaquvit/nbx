import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Branch } from '@/types/branch';
import { useToast } from '@/hooks/use-toast';

export function useBranches() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all branches
  const {
    data: branches = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .order('name');

      if (error) throw error;

      return data.map((b): Branch => ({
        id: b.id,
        companyId: b.company_id,
        name: b.name,
        code: b.code,
        address: b.address,
        phone: b.phone,
        email: b.email,
        managerId: b.manager_id,
        managerName: b.manager_name,
        isActive: b.is_active,
        settings: b.settings,
        createdAt: new Date(b.created_at),
        updatedAt: new Date(b.updated_at),
      }));
    },
  });

  // Create branch
  const createBranch = useMutation({
    mutationFn: async (branch: Omit<Branch, 'id' | 'createdAt' | 'updatedAt'>) => {
      const { data, error } = await supabase
        .from('branches')
        .insert({
          company_id: branch.companyId,
          name: branch.name,
          code: branch.code,
          address: branch.address,
          phone: branch.phone,
          email: branch.email,
          manager_id: branch.managerId,
          manager_name: branch.managerName,
          is_active: branch.isActive,
          settings: branch.settings,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      toast({
        title: 'Berhasil',
        description: 'Cabang berhasil ditambahkan',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Gagal menambahkan cabang: ${error.message}`,
        variant: 'destructive',
      });
    },
  });

  // Update branch
  const updateBranch = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Branch>;
    }) => {
      const { data, error } = await supabase
        .from('branches')
        .update({
          company_id: updates.companyId,
          name: updates.name,
          code: updates.code,
          address: updates.address,
          phone: updates.phone,
          email: updates.email,
          manager_id: updates.managerId,
          manager_name: updates.managerName,
          is_active: updates.isActive,
          settings: updates.settings,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      toast({
        title: 'Berhasil',
        description: 'Cabang berhasil diperbarui',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Gagal memperbarui cabang: ${error.message}`,
        variant: 'destructive',
      });
    },
  });

  // Delete branch
  const deleteBranch = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('branches').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      toast({
        title: 'Berhasil',
        description: 'Cabang berhasil dihapus',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Gagal menghapus cabang: ${error.message}`,
        variant: 'destructive',
      });
    },
  });

  return {
    branches,
    isLoading,
    error,
    createBranch,
    updateBranch,
    deleteBranch,
  };
}
