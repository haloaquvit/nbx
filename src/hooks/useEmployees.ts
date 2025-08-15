import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Employee } from '@/types/employee'
import { supabase } from '@/integrations/supabase/client'

export const useEmployees = () => {
  const queryClient = useQueryClient();

  const { data: employees, isLoading, error, isError } = useQuery<Employee[]>({
    queryKey: ['employees'],
    queryFn: async () => {
      const { data, error: queryError } = await supabase
        .from('employees_view')
        .select('*');
      
      if (queryError) {
        console.error("Error fetching employees from view:", queryError);
        throw new Error(queryError.message);
      }

      return data.map((employee: any) => ({
        id: employee.id,
        name: employee.full_name,
        username: employee.username,
        email: employee.email,
        role: employee.role,
        phone: employee.phone,
        address: employee.address,
        status: employee.status,
      }));
    }
  });

  const createEmployee = useMutation({
    mutationFn: async (employeeData: any) => {
      const { data, error } = await supabase.functions.invoke('create-employee', {
        body: employeeData,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
  });

  const updateEmployee = useMutation({
    mutationFn: async (employeeData: Partial<Employee> & { id: string }): Promise<any> => {
      const { id, name, username, role, phone, address, status } = employeeData;
      const { data, error } = await supabase
        .from('profiles')
        .update({
          full_name: name,
          username,
          role,
          phone,
          address,
          status,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
  });

  const resetPassword = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: string, newPassword: string }) => {
      const { error } = await supabase.functions.invoke('reset-employee-password', {
        body: { userId, newPassword },
      });
      if (error) throw new Error(error.message);
    },
  });

  const deleteEmployee = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.functions.invoke('delete-employee', {
        body: { user_id: userId },
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
  });

  return {
    employees,
    isLoading,
    error,
    isError,
    createEmployee,
    updateEmployee,
    resetPassword,
    deleteEmployee,
  }
}