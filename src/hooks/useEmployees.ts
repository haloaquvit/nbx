import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Employee } from '@/types/employee'
import { supabase, isPostgRESTMode } from '@/integrations/supabase/client'
import { postgrestAuth } from '@/integrations/supabase/postgrestAuth'
import { useBranch } from '@/contexts/BranchContext'

export const useEmployees = () => {
  const queryClient = useQueryClient();
  const { currentBranch, canAccessAllBranches } = useBranch();

  const { data: employees, isLoading, error, isError } = useQuery<Employee[]>({
    queryKey: ['employees', currentBranch?.id, canAccessAllBranches],
    queryFn: async () => {
      try {
        // Simple approach - just get profiles data, don't crash on error
        let query = supabase
          .from('profiles')
          .select('id, email, full_name, username, role, phone, address, status, branch_id');

        // Apply branch filter - only if user cannot access all branches
        // Owner/Admin can see all employees regardless of branch
        if (currentBranch?.id && !canAccessAllBranches) {
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
    staleTime: 0, // Always refetch to get latest data
    gcTime: 5 * 60 * 1000, // 5 minutes cache
    refetchOnWindowFocus: true,
    retry: 1,
    retryDelay: 1000,
  });

  const createEmployee = useMutation({
    mutationFn: async (employeeData: {
      email: string;
      password: string;
      full_name: string;
      username?: string | null;
      role: string;
      phone?: string;
      address?: string;
      status?: string;
    }) => {
      console.log('[useEmployees] Creating employee:', employeeData);

      let userId: string;

      if (isPostgRESTMode) {
        // PostgREST mode - use custom auth API
        const { data, error: authError } = await postgrestAuth.createUser({
          email: employeeData.email,
          password: employeeData.password,
          full_name: employeeData.full_name,
          role: employeeData.role,
        });

        if (authError) {
          console.error('[useEmployees] PostgREST createUser error:', authError);
          if (authError.message.includes('already exists')) {
            throw new Error('Email sudah terdaftar. Gunakan email lain.');
          }
          throw new Error(`Gagal membuat akun: ${authError.message}`);
        }

        if (!data?.user) {
          throw new Error('Gagal membuat user. Silakan coba lagi.');
        }

        userId = data.user.id;
        console.log('[useEmployees] PostgREST user created:', userId);

        // Update profile with additional data
        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            username: employeeData.username || employeeData.email.split('@')[0],
            phone: employeeData.phone || '',
            address: employeeData.address || '',
            status: employeeData.status || 'Aktif',
            branch_id: currentBranch?.id || null,
          })
          .eq('id', userId);

        if (profileError) {
          console.warn('[useEmployees] Profile update error:', profileError);
        }

      } else {
        // Supabase mode - use Supabase signUp
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: employeeData.email,
          password: employeeData.password,
          options: {
            data: {
              full_name: employeeData.full_name,
              role: employeeData.role,
            },
            emailRedirectTo: undefined,
          }
        });

        if (authError) {
          console.error('[useEmployees] Auth signUp error:', authError);
          if (authError.message.includes('already registered')) {
            throw new Error('Email sudah terdaftar. Gunakan email lain.');
          }
          throw new Error(`Gagal membuat akun: ${authError.message}`);
        }

        if (!authData.user) {
          throw new Error('Gagal membuat user. Silakan coba lagi.');
        }

        userId = authData.user.id;
        console.log('[useEmployees] Auth user created:', userId);

        // Update the profile with additional data
        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            full_name: employeeData.full_name,
            username: employeeData.username || employeeData.email.split('@')[0],
            role: employeeData.role,
            phone: employeeData.phone || '',
            address: employeeData.address || '',
            status: employeeData.status || 'Aktif',
            branch_id: currentBranch?.id || null,
          })
          .eq('id', userId);

        if (profileError) {
          console.warn('[useEmployees] Profile update error (may be ok if trigger handles it):', profileError);
        }
      }

      console.log('[useEmployees] Employee created successfully');
      return { id: userId, email: employeeData.email };
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
      // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
      try {
        const result = await supabase
          .from('profiles')
          .update(updateData)
          .eq('id', id)
          .select()
          .order('id').limit(1);

        const resultData = Array.isArray(result.data) ? result.data[0] : result.data;
        data = resultData;
        error = result.error;

        if (!error && data) {
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
      console.log('[useEmployees] Reset password for user:', userId);

      if (isPostgRESTMode) {
        // PostgREST mode - use direct admin password reset
        const { data, error } = await postgrestAuth.adminResetPassword(userId, newPassword);

        if (error) {
          console.error('[useEmployees] Admin reset password error:', error);
          throw new Error(`Gagal reset password: ${error.message}`);
        }

        console.log('[useEmployees] Password reset successful for user:', userId);
        return { success: true, message: 'Password berhasil direset' };
      } else {
        // Supabase mode - use email reset flow
        // Get user email first
        // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
        const { data: profileRaw, error: profileError } = await supabase
          .from('profiles')
          .select('email')
          .eq('id', userId)
          .order('id').limit(1);

        const profile = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw;
        if (profileError || !profile?.email) {
          throw new Error('Tidak dapat menemukan email karyawan');
        }

        // Send password reset email
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(profile.email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });

        if (resetError) {
          console.error('[useEmployees] Reset password error:', resetError);
          throw new Error(`Gagal mengirim email reset password: ${resetError.message}`);
        }

        console.log('[useEmployees] Password reset email sent to:', profile.email);
        return { email: profile.email };
      }
    },
  });

  const deleteEmployee = useMutation({
    mutationFn: async (userId: string) => {
      console.log('[useEmployees] Deleting employee:', userId);

      try {
        // Delete employee from profiles table
        const { error: deleteError } = await supabase
          .from('profiles')
          .delete()
          .eq('id', userId);

        if (deleteError) {
          console.error('[useEmployees] Delete failed:', deleteError);
          throw new Error(`Gagal menghapus karyawan: ${deleteError.message}`);
        }

        console.log('[useEmployees] Employee deleted successfully');
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