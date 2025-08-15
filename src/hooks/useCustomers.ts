import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Customer } from '@/types/customer'
import { supabase } from '@/integrations/supabase/client'

export const useCustomers = () => {
  const queryClient = useQueryClient();

  const { data: customers, isLoading } = useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: async () => {
      console.log('Fetching customers data...');
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('name', { ascending: true });
      console.log('Customers query result:', { data, error, count: data?.length });
      if (error) throw new Error(error.message);
      return data || [];
    }
  });

  const addCustomer = useMutation({
    mutationFn: async (newCustomerData: Omit<Customer, 'id' | 'createdAt' | 'orderCount'>): Promise<Customer> => {
      const { data, error } = await supabase
        .from('customers')
        .insert([newCustomerData])
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