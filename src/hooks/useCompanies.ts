import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Company } from '@/types/branch';
import { useToast } from '@/hooks/use-toast';

export function useCompanies() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all companies
  const {
    data: companies = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('name');

      if (error) throw error;

      return data.map((c): Company => ({
        id: c.id,
        name: c.name,
        code: c.code,
        isHeadOffice: c.is_head_office,
        address: c.address,
        phone: c.phone,
        email: c.email,
        taxId: c.tax_id,
        logoUrl: c.logo_url,
        isActive: c.is_active,
        createdAt: new Date(c.created_at),
        updatedAt: new Date(c.updated_at),
      }));
    },
  });

  // Create company
  const createCompany = useMutation({
    mutationFn: async (company: Omit<Company, 'id' | 'createdAt' | 'updatedAt'>) => {
      // Use .limit(1) and handle array response because our client forces Accept: application/json
      const { data: dataRaw, error } = await supabase
        .from('companies')
        .insert({
          name: company.name,
          code: company.code,
          is_head_office: company.isHeadOffice,
          address: company.address,
          phone: company.phone,
          email: company.email,
          tax_id: company.taxId,
          logo_url: company.logoUrl,
          is_active: company.isActive,
        })
        .select()
        .limit(1);

      if (error) throw error;
      const data = Array.isArray(dataRaw) ? dataRaw[0] : dataRaw;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      toast({
        title: 'Berhasil',
        description: 'Perusahaan berhasil ditambahkan',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Gagal menambahkan perusahaan: ${error.message}`,
        variant: 'destructive',
      });
    },
  });

  // Update company
  const updateCompany = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Company>;
    }) => {
      // Use .limit(1) and handle array response because our client forces Accept: application/json
      const { data: dataRaw, error } = await supabase
        .from('companies')
        .update({
          name: updates.name,
          code: updates.code,
          is_head_office: updates.isHeadOffice,
          address: updates.address,
          phone: updates.phone,
          email: updates.email,
          tax_id: updates.taxId,
          logo_url: updates.logoUrl,
          is_active: updates.isActive,
        })
        .eq('id', id)
        .select()
        .limit(1);

      if (error) throw error;
      const data = Array.isArray(dataRaw) ? dataRaw[0] : dataRaw;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      toast({
        title: 'Berhasil',
        description: 'Perusahaan berhasil diperbarui',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Gagal memperbarui perusahaan: ${error.message}`,
        variant: 'destructive',
      });
    },
  });

  // Delete company
  const deleteCompany = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('companies').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      toast({
        title: 'Berhasil',
        description: 'Perusahaan berhasil dihapus',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Gagal menghapus perusahaan: ${error.message}`,
        variant: 'destructive',
      });
    },
  });

  return {
    companies,
    isLoading,
    error,
    createCompany,
    updateCompany,
    deleteCompany,
  };
}
