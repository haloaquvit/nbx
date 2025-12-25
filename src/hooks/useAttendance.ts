import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Attendance } from '@/types/attendance'
import { useAuth } from './useAuth'
import { useBranch } from '@/contexts/BranchContext'
import { startOfDay, endOfDay } from 'date-fns'

export const useAttendance = () => {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { currentBranch } = useBranch()

  const getTodayAttendance = useQuery<Attendance | null>({
    queryKey: ['todayAttendance', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const today = new Date();
      const startOfToday = startOfDay(today).toISOString();
      const endOfToday = endOfDay(today).toISOString();
      
      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('user_id', user.id)
        .gte('check_in_time', startOfToday)
        .lte('check_in_time', endOfToday)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') { // Ignore 'single row not found' error
        throw new Error(error.message);
      }
      return data;
    },
    enabled: !!user,
  });

  const checkIn = useMutation({
    mutationFn: async ({ location }: { location: string }) => {
      if (!user) throw new Error("User not found");
      // Use .limit(1) and handle array response because our client forces Accept: application/json
      const { data: dataRaw, error } = await supabase
        .from('attendance')
        .insert({
          user_id: user.id,
          check_in_time: new Date().toISOString(),
          status: 'Hadir',
          location_check_in: location,
          branch_id: currentBranch?.id || null,
        })
        .select()
        .limit(1);
      if (error) throw error;
      const data = Array.isArray(dataRaw) ? dataRaw[0] : dataRaw;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todayAttendance', user?.id] });
    },
  });

  const checkOut = useMutation({
    mutationFn: async ({ attendanceId, location }: { attendanceId: string, location: string }) => {
      // Use .limit(1) and handle array response because our client forces Accept: application/json
      const { data: dataRaw, error } = await supabase
        .from('attendance')
        .update({
          check_out_time: new Date().toISOString(),
          status: 'Pulang',
          location_check_out: location,
        })
        .eq('id', attendanceId)
        .select()
        .limit(1);
      if (error) throw error;
      const data = Array.isArray(dataRaw) ? dataRaw[0] : dataRaw;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todayAttendance', user?.id] });
    },
  });

  const getAllAttendance = useQuery<Attendance[]>({
    queryKey: ['allAttendance', currentBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('attendance')
        .select('*')
        .order('check_in_time', { ascending: false });

      // Apply branch filter - ALWAYS filter by selected branch
      if (currentBranch?.id) {
        query = query.eq('branch_id', currentBranch.id);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: (user?.role === 'admin' || user?.role === 'owner') && !!currentBranch,
    refetchOnMount: true, // Auto-refetch when switching branches
  });

  return {
    todayAttendance: getTodayAttendance.data,
    isLoadingToday: getTodayAttendance.isLoading,
    checkIn,
    checkOut,
    allAttendance: getAllAttendance.data,
    isLoadingAll: getAllAttendance.isLoading,
  };
};