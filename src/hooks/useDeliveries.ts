import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Delivery, DeliveryInput, DeliveryItem, DeliveryUpdateInput } from '@/types/delivery';
import { useToast } from '@/hooks/use-toast';
import { useBranch } from '@/contexts/BranchContext';

// Type for delivery employees
interface DeliveryEmployee {
  id: string;
  name: string;
  role: string;
}

// Type for transaction ready for delivery
export interface TransactionDeliveryInfo {
  id: string;
  orderNumber: string;
  customerName: string;
  customerAddress: string;
  customerPhone: string;
  totalAmount: number;
  total: number; // Added for compatibility
  orderDate: Date;
  status: string;
  deliveries: Delivery[];
  deliverySummary: Array<{
    productId: string;
    productName: string;
    orderedQuantity: number;
    deliveredQuantity: number;
    remainingQuantity: number;
    unit: string;
    isBonus?: boolean;
    width?: number;
    height?: number;
  }>;
}

const fromDbToDelivery = (dbData: any): Delivery => ({
  id: dbData.id,
  transactionId: dbData.transaction_id,
  deliveryNumber: dbData.delivery_number,
  customerName: dbData.customer_name,
  customerAddress: dbData.customer_address,
  customerPhone: dbData.customer_phone,
  driverId: dbData.driver_id,
  driverName: dbData.driver?.full_name || dbData.driverName, // Map from joined profile
  helperId: dbData.helper_id,
  helperName: dbData.helper?.full_name || dbData.helperName, // Map from joined profile
  deliveryDate: new Date(dbData.delivery_date),
  status: dbData.status,
  photoUrl: dbData.photo_url,
  notes: dbData.notes,
  transactionTotal: dbData.transactions?.total || 0, // Map total from joined transaction
  createdAt: new Date(dbData.created_at),
  items: dbData.delivery_items?.map((item: any) => ({
    id: item.id,
    productId: item.product_id,
    productName: item.product_name,
    quantityDelivered: Number(item.quantity_delivered),
    unit: item.unit,
    isBonus: item.is_bonus,
    width: item.width,
    height: item.height,
    notes: item.notes,
  })) || [],
});

export const useDeliveries = (transactionId?: string) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { currentBranch } = useBranch();

  const { data: deliveries, isLoading } = useQuery<Delivery[]>({
    queryKey: ['deliveries', transactionId, currentBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('deliveries')
        // Join transactions for total, and profiles for driver/helper names
        // Note: Assuming FKs are properly set up. If not, names might still be missing.
        .select(`
          *,
          delivery_items(*),
          transactions(total),
          driver:driver_id(full_name),
          helper:helper_id(full_name)
        `);

      if (transactionId) {
        query = query.eq('transaction_id', transactionId);
      }

      if (currentBranch?.id) {
        query = query.eq('branch_id', currentBranch.id);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(fromDbToDelivery);
    },
    enabled: !!currentBranch,
  });

  const createDelivery = useMutation({
    mutationFn: async (input: DeliveryInput) => {
      if (!currentBranch?.id) throw new Error('Branch tidak dipilih');

      const { data, error } = await supabase.rpc('process_delivery_atomic', {
        p_transaction_id: input.transactionId,
        p_branch_id: currentBranch.id,
        p_items: input.items.map(item => ({
          product_id: item.productId,
          quantity: item.quantityDelivered,
          is_bonus: item.isBonus,
          notes: item.notes,
          width: item.width,
          height: item.height,
          unit: item.unit,
          product_name: item.productName
        })),
        p_driver_id: input.driverId || null,  // Empty string -> null for UUID
        p_helper_id: input.helperId || null,  // Empty string -> null for UUID
        p_delivery_date: input.deliveryDate.toISOString(),
        p_notes: input.notes,
        p_photo_url: input.photoUrl
      });

      if (error) throw error;
      const res = Array.isArray(data) ? data[0] : data;
      if (!res?.success) throw new Error(res?.error_message || 'Gagal membuat pengiriman');
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deliveries'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      queryClient.invalidateQueries({ queryKey: ['commissionEntries'] });
      queryClient.invalidateQueries({ queryKey: ['transactionsReadyForDelivery'] });
      toast({ title: 'Sukses', description: 'Pengiriman berhasil diproses' });
    },
  });

  const createDeliveryNoStock = useMutation({
    mutationFn: async (input: DeliveryInput) => {
      if (!currentBranch?.id) throw new Error('Branch tidak dipilih');

      const { data, error } = await supabase.rpc('process_delivery_atomic_no_stock', {
        p_transaction_id: input.transactionId,
        p_branch_id: currentBranch.id,
        p_items: input.items.map(item => ({
          product_id: item.productId,
          quantity: item.quantityDelivered,
          is_bonus: item.isBonus,
          notes: item.notes,
          width: item.width,
          height: item.height,
          unit: item.unit,
          product_name: item.productName
        })),
        p_driver_id: input.driverId || null,  // Empty string -> null for UUID
        p_helper_id: input.helperId || null,  // Empty string -> null for UUID
        p_delivery_date: input.deliveryDate.toISOString(),
        p_notes: input.notes,
        p_photo_url: input.photoUrl
      });

      if (error) throw error;
      const res = Array.isArray(data) ? data[0] : data;
      if (!res?.success) throw new Error(res?.error_message || 'Gagal membuat pengiriman (Migrasi)');
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deliveries'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      // No invalidation for products/journals/commissions needed as they weren't touched
      queryClient.invalidateQueries({ queryKey: ['transactionsReadyForDelivery'] });
      toast({ title: 'Sukses', description: 'Pengiriman migrasi berhasil dicatat' });
    },
  });

  const updateDelivery = useMutation({
    mutationFn: async (input: DeliveryUpdateInput) => {
      if (!currentBranch?.id) throw new Error('Branch tidak dipilih');

      const { data, error } = await supabase.rpc('update_delivery_atomic', {
        p_delivery_id: input.id,
        p_branch_id: currentBranch.id,
        p_items: input.items.map(item => ({
          product_id: item.productId,
          quantity: item.quantityDelivered,
          is_bonus: item.isBonus,
          notes: item.notes,
          width: item.width,
          height: item.height,
          unit: item.unit,
          product_name: item.productName
        })),
        p_driver_id: input.driverId || null,  // Empty string -> null for UUID
        p_helper_id: input.helperId || null,  // Empty string -> null for UUID
        p_delivery_date: input.deliveryDate ? input.deliveryDate.toISOString() : new Date().toISOString(),
        p_notes: input.notes,
        p_photo_url: input.photoUrl
      });

      if (error) throw error;
      const res = Array.isArray(data) ? data[0] : data;
      if (!res?.success) throw new Error(res?.error_message || 'Gagal mengupdate pengiriman');
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deliveries'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      queryClient.invalidateQueries({ queryKey: ['commissionEntries'] });
      queryClient.invalidateQueries({ queryKey: ['transactionsReadyForDelivery'] });
      toast({ title: 'Sukses', description: 'Pengiriman berhasil diupdate' });
    },
  });

  const deleteDelivery = useMutation({
    mutationFn: async (id: string) => {
      if (!currentBranch?.id) throw new Error('Branch tidak dipilih');

      const { data, error } = await supabase.rpc('void_delivery_atomic', {
        p_delivery_id: id,
        p_branch_id: currentBranch.id,
        p_reason: 'Delivery deleted by user'
      });

      if (error) throw error;
      const res = Array.isArray(data) ? data[0] : data;
      if (!res?.success) throw new Error(res?.error_message || 'Gagal membatalkan pengiriman');

      // Finally delete the record if RPC success (void_delivery_atomic in 07_void.sql doesn't delete the record)
      const { error: deleteError } = await supabase.from('deliveries').delete().eq('id', id);
      if (deleteError) throw deleteError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deliveries'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      queryClient.invalidateQueries({ queryKey: ['commissionEntries'] });
      queryClient.invalidateQueries({ queryKey: ['transactionsReadyForDelivery'] });
      toast({ title: 'Sukses', description: 'Pengiriman berhasil dihapus & stok dikembalikan' });
    },
  });

  return { deliveries, isLoading, createDelivery, createDeliveryNoStock, updateDelivery, deleteDelivery };
};

// Hook to get employees that can do delivery (drivers and helpers)
export const useDeliveryEmployees = () => {
  const { currentBranch } = useBranch();

  return useQuery<DeliveryEmployee[]>({
    queryKey: ['deliveryEmployees', currentBranch?.id],
    queryFn: async () => {
      // Use profiles table (localhost) - employees table is only on production
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('branch_id', currentBranch?.id)
        .in('role', ['supir', 'helper', 'driver', 'kernet'])
        .eq('status', 'Aktif');

      if (error) throw error;
      // Map full_name to name for compatibility
      return (data || []).map(emp => ({
        id: emp.id,
        name: emp.full_name || '',
        role: emp.role || ''
      }));
    },
    enabled: !!currentBranch,
  });
};

// Hook to get delivery history
export const useDeliveryHistory = () => {
  const { currentBranch } = useBranch();

  return useQuery<Delivery[]>({
    queryKey: ['deliveryHistory', currentBranch?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deliveries')
        .select(`
          *,
          delivery_items(*),
          transactions(total),
          driver:driver_id(full_name),
          helper:helper_id(full_name)
        `)
        .eq('branch_id', currentBranch?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []).map(fromDbToDelivery);
    },
    enabled: !!currentBranch,
  });
};

// Hook to get transactions ready for delivery
export const useTransactionsReadyForDelivery = () => {
  const { currentBranch } = useBranch();

  return useQuery<TransactionDeliveryInfo[]>({
    queryKey: ['transactionsReadyForDelivery', currentBranch?.id],
    queryFn: async () => {
      // Get transactions that have items not fully delivered
      // Filter transactions that are NOT delivered/completed (case-insensitive)
      // We use 'in' filter for pending statuses instead of 'neq' for delivered
      const { data, error } = await supabase
        .from('transactions')
        .select(`
          id,
          customer_id,
          customer_name,
          total,
          order_date,
          status,
          delivery_status,
          items,
          deliveries (
            *,
            delivery_items (*)
          )
        `)
        .eq('branch_id', currentBranch?.id)
        .neq('status', 'Dibatalkan')
        .order('order_date', { ascending: false });

      // Filter based on status column only
      // Show in delivery list: "Pesanan Masuk" and "Diantar Sebagian"
      // Hide from delivery list: "Selesai" (goes to history) and "Dibatalkan"
      const filteredData = (data || []).filter(txn => {
        const txnStatus = (txn.status || '').trim();

        // Only show transactions with status "Pesanan Masuk" or "Diantar Sebagian"
        return txnStatus === 'Pesanan Masuk' || txnStatus === 'Diantar Sebagian';
      });

      if (error) throw error;

      // Get customer details for addresses/phones
      const customerIds = [...new Set(filteredData.map(t => t.customer_id).filter(Boolean))];
      let customersMap: Record<string, { address?: string; phone?: string }> = {};
      if (customerIds.length > 0) {
        const { data: customers } = await supabase
          .from('customers')
          .select('id, address, phone')
          .in('id', customerIds);
        customersMap = (customers || []).reduce((acc, c) => {
          acc[c.id] = { address: c.address, phone: c.phone };
          return acc;
        }, {} as Record<string, { address?: string; phone?: string }>);
      }

      return filteredData.map(txn => {
        // Map deliveries (sorted by date ascending for correct delete logic using last element)
        const deliveries = (txn.deliveries || []).map(fromDbToDelivery)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

        // Calculate delivery summary
        const deliverySummary = (Array.isArray(txn.items) ? txn.items : []).map((item: any) => {
          const productId = item.product_id || item.productId || item.product?.id;

          // Calculate total delivered for this item across all deliveries
          const totalDelivered = deliveries.reduce((sum, d) => {
            const dItem = d.items.find(di => di.productId === productId);
            return sum + (dItem ? dItem.quantityDelivered : 0);
          }, 0);

          return {
            productId: productId,
            productName: item.product_name || item.productName || item.product?.name || 'Unknown Product',
            orderedQuantity: item.quantity,
            deliveredQuantity: totalDelivered,
            remainingQuantity: item.quantity - totalDelivered,
            unit: item.unit,
            isBonus: item.is_bonus || item.isBonus,
            width: item.width,
            height: item.height,
          };
        });

        return {
          id: txn.id,
          orderNumber: txn.id,
          customerName: txn.customer_name,
          customerAddress: customersMap[txn.customer_id]?.address || '',
          customerPhone: customersMap[txn.customer_id]?.phone || '',
          totalAmount: txn.total,
          total: txn.total,
          orderDate: new Date(txn.order_date),
          status: txn.status,
          deliveries,
          deliverySummary,
        };
      });
    },
    enabled: !!currentBranch,
  });
};

// Hook to get delivery info for a specific transaction
// Hook to get delivery info for a specific transaction
export const useTransactionDeliveryInfo = (transactionId: string, options?: { enabled?: boolean }) => {
  const { currentBranch } = useBranch();

  return useQuery<TransactionDeliveryInfo | null>({
    queryKey: ['transactionDeliveryInfo', transactionId, currentBranch?.id],
    queryFn: async () => {
      // Return null if explicitly disabled (though enabled flag should handle this, this is extra safety)
      if (options?.enabled === false) return null;
      if (!transactionId) return null;

      // 1. Fetch Transaction Details
      const { data: txn, error: txnError } = await supabase
        .from('transactions')
        .select(`
          id,
          customer_id,
          customer_name,
          total,
          order_date,
          status,
          delivery_status,
          items
        `)
        .eq('id', transactionId)
        .eq('branch_id', currentBranch?.id)
        .single();

      if (txnError) {
        if (txnError.code === 'PGRST116') return null; // Not found
        throw txnError;
      }

      if (!txn) return null;

      // 2. Fetch Deliveries Manually
      // Fetching separately avoids potential Foreign Key relationship detection issues in Supabase/PostgREST
      const { data: deliveriesData, error: delError } = await supabase
        .from('deliveries')
        .select(`
          *,
          delivery_items(*),
          driver:driver_id(full_name),
          helper:helper_id(full_name)
        `)
        .eq('transaction_id', transactionId)
        .eq('branch_id', currentBranch?.id)
        .order('created_at', { ascending: false });

      if (delError) throw delError;

      console.log('📦 Manual Delivery Fetch:', {
        txnId: transactionId,
        deliveriesFound: deliveriesData?.length,
        deliveries: deliveriesData
      });

      // Prepare data for mapping
      // Inject transaction total into deliveries for fromDbToDelivery to use
      const enhancedDeliveries = (deliveriesData || []).map(d => ({
        ...d,
        transactions: { total: txn.total }
      }));

      // Get customer details
      let customerAddress = '';
      let customerPhone = '';
      if (txn.customer_id) {
        const { data: customer } = await supabase
          .from('customers')
          .select('address, phone')
          .eq('id', txn.customer_id)
          .single();
        if (customer) {
          customerAddress = customer.address || '';
          customerPhone = customer.phone || '';
        }
      }

      // Map deliveries
      const deliveries = enhancedDeliveries.map(fromDbToDelivery)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      // Calculate delivery summary
      const deliverySummary = (Array.isArray(txn.items) ? txn.items : []).map((item: any) => {
        const productId = item.product_id || item.productId || item.product?.id;

        // Calculate total delivered for this item across all deliveries
        const totalDelivered = deliveries.reduce((sum: number, d: Delivery) => {
          const dItem = d.items.find((di: any) => di.productId === productId);
          return sum + (dItem ? dItem.quantityDelivered : 0);
        }, 0);

        return {
          productId: productId,
          productName: item.product_name || item.productName || item.product?.name || 'Unknown Product',
          orderedQuantity: item.quantity,
          deliveredQuantity: totalDelivered,
          remainingQuantity: item.quantity - totalDelivered,
          unit: item.unit,
          isBonus: item.is_bonus || item.isBonus,
          width: item.width,
          height: item.height,
        };
      });

      return {
        id: txn.id,
        orderNumber: txn.id,  // id is used as order number
        customerName: txn.customer_name,
        customerAddress,
        customerPhone,
        totalAmount: txn.total,
        total: txn.total,
        orderDate: new Date(txn.order_date),
        status: txn.status,
        deliveries,
        deliverySummary,
      };
    },
    enabled: !!transactionId && !!currentBranch && (options?.enabled ?? true),
  });
};