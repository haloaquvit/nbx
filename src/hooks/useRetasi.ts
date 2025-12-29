import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Retasi, RetasiItem, CreateRetasiData, UpdateRetasiData, ReturnItemsData, CreateRetasiItemData } from '@/types/retasi';
import { useBranch } from '@/contexts/BranchContext';
import { useAuth } from './useAuth';
import { useTimezone } from '@/contexts/TimezoneContext';
import { getOfficeDateString } from '@/utils/officeTime';

// Database to App mapping for RetasiItem
// Note: Database uses returned_qty/error_qty, App uses returned_quantity/error_quantity
const fromDbItem = (dbItem: any): RetasiItem => ({
  id: dbItem.id,
  retasi_id: dbItem.retasi_id,
  delivery_id: dbItem.delivery_id,
  product_id: dbItem.product_id,
  product_name: dbItem.product_name,
  quantity: dbItem.quantity || 0,
  returned_quantity: dbItem.returned_qty || dbItem.returned_quantity || 0,
  sold_quantity: dbItem.sold_qty || dbItem.sold_quantity || 0,
  error_quantity: dbItem.error_qty || dbItem.error_quantity || 0,
  unsold_quantity: dbItem.unsold_qty || dbItem.unsold_quantity || 0,
  weight: dbItem.weight,
  volume: dbItem.volume,
  notes: dbItem.notes,
  created_at: new Date(dbItem.created_at),
});

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
  returned_items_count: dbRetasi.returned_items_count || 0,
  error_items_count: dbRetasi.error_items_count || 0,
  barang_laku: dbRetasi.barang_laku || 0, // Jumlah barang yang laku terjual
  barang_tidak_laku: dbRetasi.barang_tidak_laku || 0, // Jumlah barang yang tidak laku
  return_notes: dbRetasi.return_notes,
  created_by: dbRetasi.created_by,
  created_at: new Date(dbRetasi.created_at),
  updated_at: new Date(dbRetasi.updated_at),
});

// App to Database mapping
// Note: This function doesn't have access to timezone context,
// so departure_date conversion is handled in createRetasi mutation
const toDb = (appRetasi: CreateRetasiData | UpdateRetasiData, overrideDate?: string) => {
  const dbData: any = { ...appRetasi };

  if ('departure_date' in appRetasi && appRetasi.departure_date) {
    const depDate = appRetasi.departure_date;
    // Use overrideDate if provided (from office timezone), otherwise use local date
    if (overrideDate) {
      dbData.departure_date = overrideDate;
    } else {
      // Fallback to local date format
      const year = depDate.getFullYear();
      const month = String(depDate.getMonth() + 1).padStart(2, '0');
      const day = String(depDate.getDate()).padStart(2, '0');
      dbData.departure_date = `${year}-${month}-${day}`;
    }

    // Auto-set departure_time from departure_date if not provided
    if (!dbData.departure_time) {
      const hours = depDate.getHours().toString().padStart(2, '0');
      const minutes = depDate.getMinutes().toString().padStart(2, '0');
      dbData.departure_time = `${hours}:${minutes}`;
    }
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
        .order('id').limit(1);

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
// Uses case-insensitive matching with ILIKE to handle name variations
export const useActiveRetasi = (driverName?: string) => {
  return useQuery<Retasi | null>({
    queryKey: ['active-retasi', driverName],
    queryFn: async () => {
      if (!driverName) return null;

      const trimmedName = driverName.trim();
      console.log('[useActiveRetasi] Checking active retasi for driver:', trimmedName);
      console.log('[useActiveRetasi] Original name:', driverName, '| Trimmed:', trimmedName);

      // First try exact match
      let { data, error } = await supabase
        .from('retasi')
        .select('*')
        .eq('driver_name', trimmedName)
        .eq('is_returned', false)
        .maybeSingle();

      // If no exact match, try case-insensitive match
      if (!data && !error) {
        console.log('[useActiveRetasi] No exact match, trying case-insensitive...');
        const { data: ilikData, error: ilikError } = await supabase
          .from('retasi')
          .select('*')
          .ilike('driver_name', trimmedName)
          .eq('is_returned', false)
          .maybeSingle();

        data = ilikData;
        error = ilikError;
      }

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
  const { currentBranch } = useBranch();
  const { user } = useAuth();
  const { timezone } = useTimezone();

  // Get all retasi
  const { data: retasiList, isLoading } = useQuery<Retasi[]>({
    queryKey: ['retasi', currentBranch?.id, filters],
    queryFn: async () => {
      let query = supabase
        .from('retasi')
        .select('*')
        .order('created_at', { ascending: false });

      // Apply branch filter - ALWAYS filter by selected branch
      if (currentBranch?.id) {
        query = query.eq('branch_id', currentBranch.id);
      }

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
    },
    enabled: !!currentBranch,
    // Optimized for retasi management
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes cache
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    retryDelay: 1000,
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

      const today = getOfficeDateString(timezone);
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
      
      // Generate simple retasi number using OFFICE timezone from settings
      const todayDate = getOfficeDateString(timezone); // YYYY-MM-DD format in office timezone
      const dateStr = todayDate.replace(/-/g, '');
      const timeStr = Date.now().toString().slice(-3);
      const retasiNumber = `RET-${dateStr}-${timeStr}`;

      // Get next retasi_ke for this driver TODAY (using office timezone)
      
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
      
      // Prepare insert data (use user from context, works with both Supabase and PostgREST)
      // Pass todayDate to toDb to ensure departure_date uses office timezone
      const insertData = {
        ...toDb(mainData, todayDate),
        retasi_number: retasiNumber,
        retasi_ke: nextRetasiKe,
        created_by: user?.id || null,
        branch_id: currentBranch?.id || null
      };
      
      console.log('[useRetasi] Inserting retasi with data:', insertData);
      
      // Insert main retasi record
      // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
      const { data: retasiRaw, error: retasiError } = await supabase
        .from('retasi')
        .insert(insertData)
        .select()
        .order('id').limit(1);

      const retasi = Array.isArray(retasiRaw) ? retasiRaw[0] : retasiRaw;
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

      // Insert retasi items if provided
      if (items && items.length > 0) {
        const itemsToInsert = items.map(item => ({
          retasi_id: retasi.id,
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          weight: item.weight || null,
          notes: item.notes || null,
        }));

        console.log('[useRetasi] Inserting retasi items:', itemsToInsert);

        const { error: itemsError } = await supabase
          .from('retasi_items')
          .insert(itemsToInsert);

        if (itemsError) {
          console.error('[useRetasi] Error inserting retasi items:', itemsError);
          // Don't throw - items table might not exist yet
          console.warn('[useRetasi] Retasi items not saved - table may not exist');
        }
      }

      return fromDb(retasi);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retasi'] });
      queryClient.invalidateQueries({ queryKey: ['retasi-stats'] });
      queryClient.invalidateQueries({ queryKey: ['retasi-items'] });
    }
  });

  // Update retasi
  const updateRetasi = useMutation({
    mutationFn: async ({ id, ...updateData }: UpdateRetasiData & { id: string }): Promise<Retasi> => {
      // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
      const { data: dataRaw, error } = await supabase
        .from('retasi')
        .update(toDb(updateData))
        .eq('id', id)
        .select()
        .order('id').limit(1);

      if (error) throw new Error(error.message);
      const data = Array.isArray(dataRaw) ? dataRaw[0] : dataRaw;
      if (!data) throw new Error('Failed to update retasi');
      return fromDb(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retasi'] });
      queryClient.invalidateQueries({ queryKey: ['retasi-stats'] });
      // Also invalidate active-retasi cache so driver can access POS after status change
      queryClient.invalidateQueries({ queryKey: ['active-retasi'] });
    }
  });

  // Mark retasi as returned - update retasi and items
  const markRetasiReturned = useMutation({
    mutationFn: async ({ retasiId, ...returnData }: ReturnItemsData & { retasiId: string }): Promise<void> => {
      // Update main retasi record
      const { error: retasiError } = await supabase
        .from('retasi')
        .update({
          is_returned: true,
          returned_items_count: returnData.returned_items_count || 0,
          error_items_count: returnData.error_items_count || 0,
          barang_laku: returnData.barang_laku || 0,
          barang_tidak_laku: returnData.barang_tidak_laku || 0,
          return_notes: returnData.return_notes || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', retasiId);

      if (retasiError) {
        console.error('Error updating retasi:', retasiError);
        throw new Error(retasiError.message);
      }

      // Update individual item returns if provided
      // Note: Database uses returned_qty/error_qty column names
      if (returnData.item_returns && returnData.item_returns.length > 0) {
        for (const itemReturn of returnData.item_returns) {
          const { error: itemError } = await supabase
            .from('retasi_items')
            .update({
              returned_qty: itemReturn.returned_quantity || 0,
              sold_qty: itemReturn.sold_quantity || 0,
              error_qty: itemReturn.error_quantity || 0,
              unsold_qty: itemReturn.unsold_quantity || 0,
            })
            .eq('id', itemReturn.item_id);

          if (itemError) {
            console.error('Error updating retasi item:', itemError);
            // Continue with other items even if one fails
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retasi'] });
      queryClient.invalidateQueries({ queryKey: ['retasi-stats'] });
      queryClient.invalidateQueries({ queryKey: ['retasi-items'] });
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

  // Get retasi items by retasi_id
  const getRetasiItems = async (retasiId: string): Promise<RetasiItem[]> => {
    const { data, error } = await supabase
      .from('retasi_items')
      .select('*')
      .eq('retasi_id', retasiId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching retasi items:', error);
      return [];
    }

    return data ? data.map(fromDbItem) : [];
  };

  return {
    retasiList,
    stats,
    isLoading,
    createRetasi,
    updateRetasi,
    markRetasiReturned,
    deleteRetasi,
    checkDriverAvailability,
    getRetasiItems,
  };
};

// Hook to get retasi items for a specific retasi
export const useRetasiItems = (retasiId?: string) => {
  return useQuery<RetasiItem[]>({
    queryKey: ['retasi-items', retasiId],
    queryFn: async () => {
      if (!retasiId) return [];

      const { data, error } = await supabase
        .from('retasi_items')
        .select('*')
        .eq('retasi_id', retasiId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching retasi items:', error);
        return [];
      }

      return data ? data.map(fromDbItem) : [];
    },
    enabled: !!retasiId,
  });
};

// Interface for retasi transaction with items
export interface RetasiTransaction {
  id: string;
  transaction_number: string;
  customer_name: string;
  customer_phone?: string;
  total_amount: number;
  paid_amount: number;
  created_at: Date;
  items: {
    product_name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }[];
}

// Hook to get transactions (sales) for a specific retasi
export const useRetasiTransactions = (retasiId?: string) => {
  return useQuery<RetasiTransaction[]>({
    queryKey: ['retasi-transactions', retasiId],
    queryFn: async () => {
      if (!retasiId) return [];

      const { data, error } = await supabase
        .from('transactions')
        .select('id, transaction_number, customer_name, customer_phone, total_amount, paid_amount, items, created_at')
        .eq('retasi_id', retasiId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching retasi transactions:', error);
        return [];
      }

      return data ? data.map(tx => ({
        id: tx.id,
        transaction_number: tx.transaction_number,
        customer_name: tx.customer_name || 'Walk-in Customer',
        customer_phone: tx.customer_phone,
        total_amount: tx.total_amount || 0,
        paid_amount: tx.paid_amount || 0,
        created_at: new Date(tx.created_at),
        items: (tx.items || []).map((item: any) => ({
          product_name: item.productName || item.product_name || 'Unknown',
          quantity: item.quantity || 0,
          unit_price: item.unitPrice || item.unit_price || 0,
          subtotal: (item.quantity || 0) * (item.unitPrice || item.unit_price || 0),
        })),
      })) : [];
    },
    enabled: !!retasiId,
  });
};