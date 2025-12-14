import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Retasi, RetasiItem, CreateRetasiData, UpdateRetasiData, ReturnItemsData } from '@/types/retasi';

// Database to App mapping
const fromDb = (dbRetasi: any): Retasi => ({
  id: dbRetasi.id,
  retasi_number: dbRetasi.retasi_number,
  truck_number: dbRetasi.truck_number,
  driver_name: dbRetasi.driver_name,
  helper_name: dbRetasi.helper_name,
  departure_date: new Date(dbRetasi.departure_date),
  departure_time: dbRetasi.departure_time,
  route: dbRetasi.route,
  total_items: dbRetasi.total_items || 0,
  total_weight: dbRetasi.total_weight,
  notes: dbRetasi.notes,
  retasi_ke: dbRetasi.retasi_ke || 1,
  is_returned: dbRetasi.is_returned || false,
  returned_items_count: dbRetasi.returned_items_count,
  error_items_count: dbRetasi.error_items_count,
  return_notes: dbRetasi.return_notes,
  created_by: dbRetasi.created_by,
  created_at: new Date(dbRetasi.created_at),
  updated_at: new Date(dbRetasi.updated_at),
});

// App to Database mapping
const toDb = (appRetasi: CreateRetasiData | UpdateRetasiData) => {
  const dbData: any = { ...appRetasi };
  
  if ('departure_date' in appRetasi && appRetasi.departure_date) {
    dbData.departure_date = appRetasi.departure_date.toISOString().split('T')[0];
  }
  
  return dbData;
};

// Hook to check if a driver has any retasi records (legacy - kept for backward compatibility)
export const useDriverHasRetasi = (driverName?: string) => {
  return useQuery<boolean>({
    queryKey: ['driver-has-retasi', driverName],
    queryFn: async () => {
      if (!driverName) return false;

      const { data, error } = await supabase
        .from('retasi')
        .select('id')
        .eq('driver_name', driverName)
        .limit(1);

      if (error) {
        console.error('[useDriverHasRetasi] Error checking driver retasi:', error);
        return false;
      }

      return (data && data.length > 0) || false;
    },
    enabled: !!driverName,
  });
};

// Hook to get active retasi for a driver (is_returned = false)
export const useActiveRetasi = (driverName?: string) => {
  return useQuery<Retasi | null>({
    queryKey: ['active-retasi', driverName],
    queryFn: async () => {
      if (!driverName) return null;

      console.log('[useActiveRetasi] Checking active retasi for driver:', driverName);

      const { data, error } = await supabase
        .from('retasi')
        .select('*')
        .eq('driver_name', driverName)
        .eq('is_returned', false)
        .maybeSingle();

      if (error) {
        console.error('[useActiveRetasi] Error fetching active retasi:', error);
        return null;
      }

      console.log('[useActiveRetasi] Active retasi found:', data);

      return data ? fromDb(data) : null;
    },
    enabled: !!driverName,
  });
};

export const useRetasi = (filters?: {
  is_returned?: boolean;
  driver_name?: string;
  date_from?: string;
  date_to?: string;
}) => {
  const queryClient = useQueryClient();

  // Get all retasi
  const { data: retasiList, isLoading } = useQuery<Retasi[]>({
    queryKey: ['retasi', filters],
    queryFn: async () => {
      let query = supabase
        .from('retasi')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters?.is_returned !== undefined) {
        query = query.eq('is_returned', filters.is_returned);
      }
      if (filters?.driver_name && filters.driver_name !== 'all') {
        query = query.eq('driver_name', filters.driver_name);
      }
      if (filters?.date_from) {
        query = query.gte('departure_date', filters.date_from);
      }
      if (filters?.date_to) {
        query = query.lte('departure_date', filters.date_to);
      }

      const { data, error } = await query;
      
      if (error) {
        console.error('Error fetching retasi:', error);
        throw new Error(error.message);
      }
      
      return data ? data.map(fromDb) : [];
    }
  });

  // Get retasi statistics
  const { data: stats } = useQuery({
    queryKey: ['retasi-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('retasi')
        .select('is_returned, departure_date');

      if (error) {
        console.error('Error fetching retasi stats:', error);
        throw new Error(error.message);
      }

      const today = new Date().toISOString().split('T')[0];
      const stats = {
        total_retasi: data.length,
        active_retasi: data.filter(d => !d.is_returned).length,
        returned_retasi: data.filter(d => d.is_returned).length,
        today_retasi: data.filter(d => d.departure_date === today).length,
      };

      return stats;
    }
  });

  // Check if driver has unreturned retasi - simple table query
  const checkDriverAvailability = async (driverName: string): Promise<boolean> => {
    console.log('[useRetasi] === CHECKING DRIVER AVAILABILITY ===');
    console.log('[useRetasi] Driver name:', driverName);
    
    try {
      const { data, error } = await supabase
        .from('retasi')
        .select('id, retasi_number, is_returned, driver_name')
        .eq('driver_name', driverName)
        .eq('is_returned', false);
      
      console.log('[useRetasi] Query result:', { data, error });
      
      if (error) {
        console.error('[useRetasi] Database error:', error);
        // If table doesn't exist, assume no active retasi
        if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
          console.log('[useRetasi] Retasi table does not exist, returning available=true');
          return true;
        }
        throw new Error(`Database error: ${error.message}`);
      }
      
      const activeRetasiList = data || [];
      const hasActiveRetasi = activeRetasiList.length > 0;
      const isAvailable = !hasActiveRetasi;
      
      console.log('[useRetasi] Active retasi found:', activeRetasiList);
      console.log('[useRetasi] Has active retasi:', hasActiveRetasi);
      console.log('[useRetasi] Driver is available:', isAvailable);
      console.log('[useRetasi] === END CHECK ===');
      
      return isAvailable; // Return true if driver is AVAILABLE (no unreturned retasi)
    } catch (err) {
      console.error('[useRetasi] Unexpected error in checkDriverAvailability:', err);
      throw err;
    }
  };

  // Create retasi - simplified
  const createRetasi = useMutation({
    mutationFn: async (retasiData: CreateRetasiData): Promise<Retasi> => {
      console.log('[useRetasi] Creating retasi with data:', retasiData);
      
      const { items, ...mainData } = retasiData;
      
      // Check if driver already has unreturned retasi
      if (mainData.driver_name) {
        console.log('[useRetasi] Checking if driver has active retasi for:', mainData.driver_name);
        
        const { data: activeRetasiCheck, error: activeError } = await supabase
          .from('retasi')
          .select('retasi_number, retasi_ke, departure_date')
          .eq('driver_name', mainData.driver_name)
          .eq('is_returned', false);
          
        if (activeError) {
          console.error('[useRetasi] Error checking active retasi:', activeError);
          // If table doesn't exist, continue
          if (!activeError.message.includes('does not exist')) {
            throw new Error(`Error checking active retasi: ${activeError.message}`);
          }
        } else if (activeRetasiCheck && activeRetasiCheck.length > 0) {
          const activeRetasi = activeRetasiCheck[0];
          console.error('[useRetasi] Driver has unreturned retasi:', activeRetasi);
          throw new Error(`Supir ${mainData.driver_name} masih memiliki retasi ${activeRetasi.retasi_number} (retasi ke-${activeRetasi.retasi_ke}) yang belum dikembalikan`);
        }
        
        console.log('[useRetasi] Driver is available - no active retasi found');
      }
      
      // Generate simple retasi number
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
      const timeStr = Date.now().toString().slice(-3);
      const retasiNumber = `RET-${dateStr}-${timeStr}`;
      
      // Get next retasi_ke for this driver TODAY
      const todayDate = today.toISOString().slice(0, 10); // YYYY-MM-DD format
      
      console.log('[useRetasi] Getting retasi_ke for driver:', mainData.driver_name, 'on date:', todayDate);
      
      // Count how many retasi this driver has created today (regardless of return status)
      const { data: todayRetasi, error: countError } = await supabase
        .from('retasi')
        .select('retasi_ke')
        .eq('driver_name', mainData.driver_name)
        .eq('departure_date', todayDate)
        .order('retasi_ke', { ascending: false });
      
      if (countError) {
        console.error('[useRetasi] Error counting today retasi:', countError);
        throw new Error(`Error checking retasi count: ${countError.message}`);
      }
      
      // Next retasi_ke is the count of today's retasi + 1
      const nextRetasiKe = (todayRetasi?.length || 0) + 1;
      
      console.log('[useRetasi] Today retasi for driver:', todayRetasi);
      console.log('[useRetasi] Current count for today:', todayRetasi?.length || 0);
      console.log('[useRetasi] Next retasi_ke will be:', nextRetasiKe);
      
      // Prepare insert data
      const insertData = {
        ...toDb(mainData),
        retasi_number: retasiNumber,
        retasi_ke: nextRetasiKe,
        created_by: (await supabase.auth.getUser()).data.user?.id
      };
      
      console.log('[useRetasi] Inserting retasi with data:', insertData);
      
      // Insert main retasi record
      const { data: retasi, error: retasiError } = await supabase
        .from('retasi')
        .insert(insertData)
        .select()
        .single();

      console.log('[useRetasi] Insert result:', { retasi, retasiError });

      if (retasiError) {
        console.error('[useRetasi] Error inserting retasi:', retasiError);
        console.error('[useRetasi] Error details:', {
          message: retasiError.message,
          details: retasiError.details,
          hint: retasiError.hint,
          code: retasiError.code
        });
        throw new Error(`Gagal membuat retasi: ${retasiError.message}${retasiError.details ? ` (${retasiError.details})` : ''}${retasiError.hint ? ` - ${retasiError.hint}` : ''}`);
      }

      return fromDb(retasi);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retasi'] });
      queryClient.invalidateQueries({ queryKey: ['retasi-stats'] });
    }
  });

  // Update retasi
  const updateRetasi = useMutation({
    mutationFn: async ({ id, ...updateData }: UpdateRetasiData & { id: string }): Promise<Retasi> => {
      const { data, error } = await supabase
        .from('retasi')
        .update(toDb(updateData))
        .eq('id', id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return fromDb(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retasi'] });
      queryClient.invalidateQueries({ queryKey: ['retasi-stats'] });
    }
  });

  // Mark retasi as returned - simple table update
  const markRetasiReturned = useMutation({
    mutationFn: async ({ retasiId, ...returnData }: ReturnItemsData & { retasiId: string }): Promise<void> => {
      const { error } = await supabase
        .from('retasi')
        .update({
          is_returned: true,
          returned_items_count: returnData.returned_items_count || 0,
          error_items_count: returnData.error_items_count || 0,
          return_notes: returnData.return_notes || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', retasiId);

      if (error) {
        console.error('Error updating retasi:', error);
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retasi'] });
      queryClient.invalidateQueries({ queryKey: ['retasi-stats'] });
    }
  });

  // Delete retasi
  const deleteRetasi = useMutation({
    mutationFn: async (retasiId: string): Promise<void> => {
      const { error } = await supabase
        .from('retasi')
        .delete()
        .eq('id', retasiId);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retasi'] });
      queryClient.invalidateQueries({ queryKey: ['retasi-stats'] });
    }
  });

  return {
    retasiList,
    stats,
    isLoading,
    createRetasi,
    updateRetasi,
    markRetasiReturned,
    deleteRetasi,
    checkDriverAvailability,
  };
};