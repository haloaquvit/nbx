import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Employee } from '@/types/employee'
import { supabase } from '@/integrations/supabase/client'
import { useBranch } from '@/contexts/BranchContext'

export const useEmployees = () => {
  const queryClient = useQueryClient();
  const { currentBranch, canAccessAllBranches } = useBranch();

  const { data: employees, isLoading, error, isError } = useQuery<Employee[]>({
    queryKey: ['employees', currentBranch?.id],
    queryFn: async () => {
      try {
        // Simple approach - just get profiles data, don't crash on error
        let query = supabase
          .from('profiles')
          .select('id, email, full_name, username, role, phone, address, status, branch_id')
          .neq('status', 'Nonaktif');

        // Apply branch filter - ALWAYS filter by selected branch
        if (currentBranch?.id) {
          query = query.eq('branch_id', currentBranch.id);
        }

        const { data, error } = await query;

        if (error) {
          console.warn('[useEmployees] Profiles query failed:', error);
          // Return empty array instead of throwing to prevent app crash
          return [];
        }

        // Map profiles data to Employee format
        return (data || []).map((employee: any) => ({
          id: employee.id,
          name: employee.full_name || employee.email || 'Unknown',
          username: employee.username || employee.email || '',
          email: employee.email,
          role: employee.role || 'user',
          phone: employee.phone || '',
          address: employee.address || '',
          status: employee.status || 'Aktif',
        }));
      } catch (err) {
        console.error('[useEmployees] Unexpected error:', err);
        // Return empty array to prevent app crash
        return [];
      }
    },
    enabled: !!currentBranch, // Only run when branch is loaded
    // Optimized for employee management pages
    staleTime: 10 * 60 * 1000, // 10 minutes - employees don't change frequently
    gcTime: 15 * 60 * 1000, // 15 minutes cache
    refetchOnWindowFocus: false, // Don't refetch on window focus
    refetchOnReconnect: false, // Don't refetch on reconnect
    retry: 1, // Only retry once
    retryDelay: 1000,
  });

  const createEmployee = useMutation({
    mutationFn: async (employeeData: any) => {
      console.log('[useEmployees] Creating employee - DISABLED temporarily to prevent crashes');
      throw new Error('Employee creation temporarily disabled. Please contact admin.');
    },
    onSuccess: (data) => {
      console.log('[useEmployees] Employee created successfully:', data);
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['delivery-drivers'] });
      queryClient.invalidateQueries({ queryKey: ['delivery-helpers'] });
    },
  });

  const updateEmployee = useMutation({
    mutationFn: async (employeeData: Partial<Employee> & { id: string }): Promise<any> => {
      console.log('[useEmployees] Updating employee:', employeeData);
      
      const { id, name, username, role, phone, address, status } = employeeData;
      
      // Prepare update data with only non-null values
      const updateData: any = {};
      if (name !== undefined) updateData.full_name = name;
      if (username !== undefined) updateData.username = username;
      if (role !== undefined) updateData.role = role;
      if (phone !== undefined) updateData.phone = phone;
      if (address !== undefined) updateData.address = address;
      if (status !== undefined) updateData.status = status;
      
      console.log('[useEmployees] Update data:', updateData);
      
      // Try multiple approaches for updating
      let data = null;
      let error = null;
      
      // Approach 1: Standard update
      try {
        const result = await supabase
          .from('profiles')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();
        
        data = result.data;
        error = result.error;
        
        if (!error) {
          console.log('[useEmployees] Standard update successful:', data);
          return data;
        }
      } catch (err) {
        console.warn('[useEmployees] Standard update failed:', err);
        error = err as any;
      }
      
      // Approach 2: Update without select (if select is causing RLS issues)
      if (error) {
        try {
          const result = await supabase
            .from('profiles')
            .update(updateData)
            .eq('id', id);
          
          if (!result.error) {
            console.log('[useEmployees] Update without select successful');
            // Return the updated data manually
            return { id, ...updateData };
          } else {
            error = result.error;
          }
        } catch (err) {
          console.warn('[useEmployees] Update without select failed:', err);
          error = err as any;
        }
      }
      
      // If all approaches fail, throw the error
      if (error) {
        console.error('[useEmployees] All update approaches failed:', error);
        throw new Error(`Gagal mengupdate karyawan: ${error.message || 'Unknown error'}`);
      }
      
      return data;
    },
    onSuccess: (data) => {
      console.log('[useEmployees] Employee updated successfully:', data);
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (error) => {
      console.error('[useEmployees] Update employee error:', error);
    },
  });

  const resetPassword = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: string, newPassword: string }) => {
      // Edge function not available - disable for now
      throw new Error('Reset password tidak tersedia saat ini. Hubungi administrator.');
    },
  });

  const deleteEmployee = useMutation({
    mutationFn: async (userId: string) => {
      console.log('[useEmployees] Deleting/deactivating employee:', userId);
      
      try {
        // Try using the safe deactivation function first
        const { data, error } = await supabase.rpc('deactivate_employee', {
          employee_id: userId
        });
        
        if (error) {
          console.warn('[useEmployees] deactivate_employee function failed, falling back to direct update:', error);
          
          // Fallback to direct update
          const { error: updateError } = await supabase
            .from('profiles')
            .update({ 
              status: 'Tidak Aktif',
              updated_at: new Date().toISOString()
            })
            .eq('id', userId);
          
          if (updateError) {
            throw new Error(`Gagal menonaktifkan karyawan: ${updateError.message}`);
          }
        }
        
        console.log('[useEmployees] Employee deactivated successfully');
      } catch (err) {
        console.error('[useEmployees] Delete employee error:', err);
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['delivery-drivers'] });
      queryClient.invalidateQueries({ queryKey: ['delivery-helpers'] });
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