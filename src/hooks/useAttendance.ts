import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Attendance } from '@/types/attendance'
import { useAuth } from './useAuth'
import { startOfDay, endOfDay } from 'date-fns'

export const useAttendance = () => {
  const queryClient = useQueryClient()
  const { user } = useAuth()

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
      const { data, error } = await supabase
        .from('attendance')
        .insert({
          user_id: user.id,
          check_in_time: new Date().toISOString(),
          status: 'Hadir',
          location_check_in: location,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todayAttendance', user?.id] });
    },
  });

  const checkOut = useMutation({
    mutationFn: async ({ attendanceId, location }: { attendanceId: string, location: string }) => {
      const { data, error } = await supabase
        .from('attendance')
        .update({
          check_out_time: new Date().toISOString(),
          status: 'Pulang',
          location_check_out: location,
        })
        .eq('id', attendanceId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todayAttendance', user?.id] });
    },
  });

  const getAllAttendance = useQuery<Attendance[]>({
    queryKey: ['allAttendance'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .order('check_in_time', { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: user?.role === 'admin' || user?.role === 'owner',
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