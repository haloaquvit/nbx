import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Branch } from '@/types/branch';
import { useToast } from '@/hooks/use-toast';
import { STANDARD_COA_TEMPLATE } from '@/utils/chartOfAccountsUtils';

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

  // Create branch and copy COA from headquarters
  const createBranch = useMutation({
    mutationFn: async (branch: Omit<Branch, 'id' | 'createdAt' | 'updatedAt'>) => {
      // 1. Create the branch
      // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
      const { data: newBranchRaw, error: branchError } = await supabase
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
        .order('id').limit(1);

      if (branchError) throw branchError;
      const newBranch = Array.isArray(newBranchRaw) ? newBranchRaw[0] : newBranchRaw;
      if (!newBranch) throw new Error('Failed to create branch');

      // 2. Get the headquarters branch (first branch or one named "Pusat"/"Manokwari")
      const { data: allBranches } = await supabase
        .from('branches')
        .select('id, name')
        .order('created_at', { ascending: true });

      const headquartersBranch = allBranches?.find(b =>
        b.name.toLowerCase().includes('pusat') ||
        b.name.toLowerCase().includes('manokwari')
      ) || allBranches?.[0];

      // 3. Try to get accounts from headquarters first
      let accountsToCopy: any[] = [];

      if (headquartersBranch && headquartersBranch.id !== newBranch.id) {
        const { data: hqAccounts, error: accError } = await supabase
          .from('accounts')
          .select('code, name, type, parent_id, is_header, level, normal_balance, is_active, sort_order, category')
          .eq('branch_id', headquartersBranch.id)
          .order('code');

        if (!accError && hqAccounts && hqAccounts.length > 0) {
          accountsToCopy = hqAccounts.map(acc => ({
            branch_id: newBranch.id,
            code: acc.code,
            name: acc.name,
            type: acc.type,
            parent_id: null,
            is_header: acc.is_header,
            initial_balance: 0,
            balance: 0,
            level: acc.level,
            normal_balance: acc.normal_balance,
            is_active: acc.is_active,
            sort_order: acc.sort_order,
            category: acc.category,
          }));
        }
      }

      // 4. Fallback to standard template if no HQ accounts found
      if (accountsToCopy.length === 0) {
        console.log('[useBranches] Using standard COA template for new branch');
        accountsToCopy = STANDARD_COA_TEMPLATE.map(template => ({
          branch_id: newBranch.id,
          code: template.code,
          name: template.name,
          type: template.category === 'ASET' ? 'Aset' :
                template.category === 'KEWAJIBAN' ? 'Kewajiban' :
                template.category === 'MODAL' ? 'Modal' :
                template.category === 'PENDAPATAN' || template.category === 'PENDAPATAN_NON_OPERASIONAL' ? 'Pendapatan' :
                'Beban',
          parent_id: null,
          is_header: template.isHeader,
          initial_balance: 0,
          balance: 0,
          level: template.level,
          normal_balance: template.normalBalance === 'DEBIT' ? 'debit' : 'credit',
          is_active: true,
          sort_order: template.sortOrder,
          category: template.category,
          is_payment_account: template.isPaymentAccount || false,
        }));
      }

      // 5. Insert accounts for new branch
      if (accountsToCopy.length > 0) {
        const { error: insertError } = await supabase
          .from('accounts')
          .insert(accountsToCopy);

        if (insertError) {
          console.error('Failed to create COA for new branch:', insertError);
        } else {
          console.log(`[useBranches] Created ${accountsToCopy.length} accounts for branch ${newBranch.id}`);
        }
      }

      return newBranch;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      toast({
        title: 'Berhasil',
        description: 'Cabang berhasil ditambahkan dengan struktur akun dari kantor pusat',
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
      // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
      const { data: dataRaw, error } = await supabase
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
        .order('id').limit(1);

      if (error) throw error;
      const data = Array.isArray(dataRaw) ? dataRaw[0] : dataRaw;
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

  // Copy COA from headquarters to a branch that doesn't have accounts
  const copyCoaToBranch = useMutation({
    mutationFn: async (targetBranchId: string) => {
      // 1. Check if target branch already has accounts
      const { data: existingAccounts } = await supabase
        .from('accounts')
        .select('id')
        .eq('branch_id', targetBranchId)
        .order('id').limit(1);

      if (existingAccounts && existingAccounts.length > 0) {
        throw new Error('Branch sudah memiliki akun COA');
      }

      // 2. Get the headquarters branch
      const { data: allBranches } = await supabase
        .from('branches')
        .select('id, name')
        .order('created_at', { ascending: true });

      const headquartersBranch = allBranches?.find(b =>
        b.name.toLowerCase().includes('pusat') ||
        b.name.toLowerCase().includes('manokwari')
      ) || allBranches?.[0];

      if (!headquartersBranch || headquartersBranch.id === targetBranchId) {
        throw new Error('Tidak dapat menemukan kantor pusat untuk menyalin COA');
      }

      // 3. Try to get accounts from headquarters
      let accountsToCopy: any[] = [];

      const { data: hqAccounts, error: accError } = await supabase
        .from('accounts')
        .select('code, name, type, parent_id, is_header, level, normal_balance, is_active, sort_order, category')
        .eq('branch_id', headquartersBranch.id)
        .order('code');

      if (!accError && hqAccounts && hqAccounts.length > 0) {
        accountsToCopy = hqAccounts.map(acc => ({
          branch_id: targetBranchId,
          code: acc.code,
          name: acc.name,
          type: acc.type,
          parent_id: null,
          is_header: acc.is_header,
          initial_balance: 0,
          balance: 0,
          level: acc.level,
          normal_balance: acc.normal_balance,
          is_active: acc.is_active,
          sort_order: acc.sort_order,
          category: acc.category,
        }));
      }

      // 4. Fallback to standard template if no HQ accounts
      if (accountsToCopy.length === 0) {
        console.log('[useBranches] Using standard COA template');
        accountsToCopy = STANDARD_COA_TEMPLATE.map(template => ({
          branch_id: targetBranchId,
          code: template.code,
          name: template.name,
          type: template.category === 'ASET' ? 'Aset' :
                template.category === 'KEWAJIBAN' ? 'Kewajiban' :
                template.category === 'MODAL' ? 'Modal' :
                template.category === 'PENDAPATAN' || template.category === 'PENDAPATAN_NON_OPERASIONAL' ? 'Pendapatan' :
                'Beban',
          parent_id: null,
          is_header: template.isHeader,
          initial_balance: 0,
          balance: 0,
          level: template.level,
          normal_balance: template.normalBalance === 'DEBIT' ? 'debit' : 'credit',
          is_active: true,
          sort_order: template.sortOrder,
          category: template.category,
          is_payment_account: template.isPaymentAccount || false,
        }));
      }

      const { error: insertError } = await supabase
        .from('accounts')
        .insert(accountsToCopy);

      if (insertError) throw insertError;

      return { copiedCount: accountsToCopy.length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      toast({
        title: 'Berhasil',
        description: `${data.copiedCount} akun COA berhasil disalin dari kantor pusat`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Gagal menyalin COA: ${error.message}`,
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
    copyCoaToBranch,
  };
}
