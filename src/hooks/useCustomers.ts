import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Customer } from '@/types/customer'
import { supabase } from '@/integrations/supabase/client'
import { useBranch } from '@/contexts/BranchContext'

export const useCustomers = () => {
  const queryClient = useQueryClient();
  const { currentBranch, canAccessAllBranches } = useBranch();

  const { data: customers, isLoading } = useQuery<Customer[]>({
    queryKey: ['customers', currentBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('customers')
        .select('*')
        .order('name', { ascending: true });

      // Apply branch filter (only if not head office viewing all branches)
      if (currentBranch?.id) {
        query = query.eq('branch_id', currentBranch.id);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data || [];
    },
    enabled: !!currentBranch,
    // Optimized for POS and customer management usage
    staleTime: 5 * 60 * 1000, // 5 minutes - customers change less frequently
    gcTime: 10 * 60 * 1000, // 10 minutes cache
    refetchOnWindowFocus: false, // Don't refetch on window focus
    refetchOnReconnect: false, // Don't refetch on reconnect
    retry: 1, // Only retry once
    retryDelay: 1000,
  });

  const addCustomer = useMutation({
    mutationFn: async (newCustomerData: Omit<Customer, 'id' | 'createdAt' | 'orderCount'>): Promise<Customer> => {
      const customerToInsert = {
        name: newCustomerData.name,
        phone: newCustomerData.phone,
        address: newCustomerData.address,
        latitude: newCustomerData.latitude,
        longitude: newCustomerData.longitude,
        full_address: newCustomerData.full_address,
        store_photo_url: newCustomerData.store_photo_url,
        store_photo_drive_id: newCustomerData.store_photo_drive_id,
        jumlah_galon_titip: newCustomerData.jumlah_galon_titip,
        branch_id: currentBranch?.id || null,
      };
      
      const { data, error } = await supabase
        .from('customers')
        .insert([customerToInsert])
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  const updateCustomer = useMutation({
    mutationFn: async (customerData: Partial<Customer> & { id: string }): Promise<Customer> => {
      const { id, ...updateData } = customerData;
      
      const customerToUpdate = {
        name: updateData.name,
        phone: updateData.phone,
        address: updateData.address,
        latitude: updateData.latitude,
        longitude: updateData.longitude,
        full_address: updateData.full_address,
        store_photo_url: updateData.store_photo_url,
        store_photo_drive_id: updateData.store_photo_drive_id,
        jumlah_galon_titip: updateData.jumlah_galon_titip,
      };
      
      const { data, error } = await supabase
        .from('customers')
        .update(customerToUpdate)
        .eq('id', id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  const deleteCustomer = useMutation({
    mutationFn: async (customerId: string) => {
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', customerId);

      if (error) {
        if (error.code === '23503') {
          throw new Error('Gagal: Pelanggan ini memiliki transaksi terkait.');
        }
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  return {
    customers,
    isLoading,
    addCustomer,
    updateCustomer,
    deleteCustomer,
  };
}

export const useCustomerById = (id: string) => {
  const { data: customer, isLoading } = useQuery<Customer | undefined>({
    queryKey: ['customer', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!id,
  });
  return { customer, isLoading };
}