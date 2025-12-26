import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import {
  Delivery,
  DeliveryItem,
  TransactionDeliveryInfo,
  CreateDeliveryRequest,
  DeliverySummaryItem,
  DeliveryEmployee
} from '@/types/delivery'
import { PhotoUploadService } from '@/services/photoUploadService'
import { useBranch } from '@/contexts/BranchContext'
import { useAuth } from './useAuth'
import { createDeliveryJournal } from '@/services/journalService'

// Fetch employees with driver and helper roles from profiles table
export function useDeliveryEmployees() {
  return useQuery({
    queryKey: ['delivery-employees'],
    queryFn: async (): Promise<DeliveryEmployee[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .in('role', ['supir', 'helper'])
        .neq('status', 'Nonaktif')
        .order('role')
        .order('full_name')
      
      if (error) {
        console.warn('[useDeliveryEmployees] Failed to fetch delivery employees:', error)
        return []
      }
      
      return (data || []).map(emp => ({
        id: emp.id,
        name: emp.full_name || 'Unknown',
        position: emp.role, // Use role as position since we don't have separate position field
        role: emp.role as 'supir' | 'helper'
      }))
    },
  })
}

// Fetch transactions ready for delivery (exclude office sales)
export function useTransactionsReadyForDelivery() {
  const { currentBranch, canAccessAllBranches } = useBranch();

  return useQuery({
    queryKey: ['transactions-ready-for-delivery', currentBranch?.id],
    queryFn: async (): Promise<TransactionDeliveryInfo[]> => {
      // Get transactions that are ready for delivery (simplified approach without custom functions)
      let query = supabase
        .from('transactions')
        .select('*')
        .in('status', ['Pesanan Masuk', 'Diantar Sebagian'])
        .neq('is_office_sale', true)
        .order('order_date', { ascending: true });

      // Apply branch filter (only if not head office viewing all branches)
      if (currentBranch?.id) {
        query = query.eq('branch_id', currentBranch.id);
      }

      const { data: transactions, error } = await query;
      
      if (error) throw error
      if (!transactions) return []

      // For each transaction, fetch delivery history and calculate summary
      const transactionsWithDeliveryInfo = await Promise.all(
        transactions.map(async (transaction: any) => {
          // Get delivery history with driver and helper names from profiles table
          const { data: deliveriesData, error: deliveriesError } = await supabase
            .from('deliveries')
            .select(`
              *,
              items:delivery_items(*),
              driver:profiles!driver_id(id, full_name),
              helper:profiles!helper_id(id, full_name)
            `)
            .eq('transaction_id', transaction.id)
            .order('delivery_date', { ascending: false })

          if (deliveriesError) throw deliveriesError

          const deliveries: Delivery[] = (deliveriesData || []).map((d: any) => ({
            id: d.id,
            transactionId: d.transaction_id,
            deliveryNumber: d.delivery_number,
            deliveryDate: new Date(d.delivery_date),
            photoUrl: d.photo_url,
            notes: d.notes,
            driverId: d.driver_id,
            driverName: d.driver?.full_name || undefined,
            helperId: d.helper_id,
            helperName: d.helper?.full_name || undefined,
            items: (d.items || []).map((item: any) => ({
              id: item.id,
              deliveryId: item.delivery_id,
              productId: item.product_id,
              productName: item.product_name,
              quantityDelivered: item.quantity_delivered,
              unit: item.unit,
              width: item.width,
              height: item.height,
              notes: item.notes,
              createdAt: new Date(item.created_at),
            })),
            createdAt: new Date(d.created_at),
            updatedAt: new Date(d.updated_at),
          }))

          // Calculate delivery summary manually
          const deliverySummary: DeliverySummaryItem[] = []

          // Parse transaction items and filter out items without valid product IDs
          // Also filter out sales metadata items (those with _isSalesMeta flag)
          const transactionItems = transaction.items || []
          for (const item of transactionItems) {
            // Skip sales metadata items
            if (item._isSalesMeta) {
              continue
            }

            const productId = item.product?.id

            // Skip items without valid product ID
            if (!productId) {
              console.warn('[useTransactionsReadyForDelivery] Skipping item without product ID:', item)
              continue
            }
            
            const productName = item.product?.name || 'Unknown'
            const orderedQuantity = item.quantity || 0
            const unit = item.unit || 'pcs'
            const width = item.width
            const height = item.height

            // Calculate delivered quantity for this specific product name (to separate regular vs bonus)
            let deliveredQuantity = 0
            for (const delivery of deliveries) {
              for (const deliveryItem of delivery.items) {
                // Match by both productId AND productName to differentiate bonus vs regular items
                if (deliveryItem.productId === productId && deliveryItem.productName === productName) {
                  deliveredQuantity += deliveryItem.quantityDelivered
                }
              }
            }

            deliverySummary.push({
              productId,
              productName,
              orderedQuantity,
              deliveredQuantity,
              remainingQuantity: orderedQuantity - deliveredQuantity,
              unit,
              width,
              height,
            })
          }

          return {
            id: transaction.id,
            customerName: transaction.customer_name,
            orderDate: new Date(transaction.order_date),
            items: transaction.items,
            total: transaction.total,
            status: transaction.status,
            deliveries,
            deliverySummary,
          }
        })
      )

      return transactionsWithDeliveryInfo
    },
    enabled: !!currentBranch,
    // Optimized for complex delivery queries
    staleTime: 3 * 60 * 1000, // 3 minutes - delivery data changes more frequently
    gcTime: 10 * 60 * 1000, // 10 minutes cache
    refetchOnWindowFocus: false, // Don't refetch on window focus
    refetchOnReconnect: false, // Don't refetch on reconnect
    retry: 1, // Only retry once due to complex query
    retryDelay: 2000, // Longer delay for complex queries
  })
}

// Fetch delivery details for a specific transaction
export function useTransactionDeliveryInfo(transactionId: string) {
  return useQuery({
    queryKey: ['transaction-delivery-info', transactionId],
    queryFn: async (): Promise<TransactionDeliveryInfo | null> => {
      // Get transaction details
      // Use .order('id').limit(1) instead of .single() because our client forces Accept: application/json
      // which causes .single() to return an array instead of an object
      const { data: transactionRawData, error: transactionError } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', transactionId)
        .order('id').limit(1)

      if (transactionError) throw transactionError

      // Handle array response from PostgREST
      const transactionData = Array.isArray(transactionRawData) ? transactionRawData[0] : transactionRawData
      if (!transactionData) return null

      // Get delivery history with driver and helper names from profiles table
      const { data: deliveriesData, error: deliveriesError } = await supabase
        .from('deliveries')
        .select(`
          *,
          items:delivery_items(*),
          driver:profiles!driver_id(id, full_name),
          helper:profiles!helper_id(id, full_name)
        `)
        .eq('transaction_id', transactionId)
        .order('delivery_date', { ascending: false })

      if (deliveriesError) throw deliveriesError

      const deliveries: Delivery[] = (deliveriesData || []).map((d: any) => ({
        id: d.id,
        transactionId: d.transaction_id,
        deliveryNumber: d.delivery_number,
        deliveryDate: new Date(d.delivery_date),
        photoUrl: d.photo_url,
        notes: d.notes,
        driverId: d.driver_id,
        driverName: d.driver?.full_name || undefined,
        helperId: d.helper_id,
        helperName: d.helper?.full_name || undefined,
        items: (d.items || []).map((item: any) => ({
          id: item.id,
          deliveryId: item.delivery_id,
          productId: item.product_id,
          productName: item.product_name,
          quantityDelivered: item.quantity_delivered,
          unit: item.unit,
          width: item.width,
          height: item.height,
          notes: item.notes,
          isBonus: item.is_bonus || false,
          createdAt: new Date(item.created_at),
        })),
        createdAt: new Date(d.created_at),
        updatedAt: new Date(d.updated_at),
      }))

      // Calculate delivery summary manually - IMPROVED VERSION
      const deliverySummary: DeliverySummaryItem[] = []

      // Parse transaction items and filter out items without valid product IDs
      // Also filter out sales metadata items (those with _isSalesMeta flag)
      const transactionItems = transactionData.items || []
      for (const item of transactionItems) {
        // Skip sales metadata items
        if (item._isSalesMeta) {
          continue
        }

        const productId = item.product?.id

        // Skip items without valid product ID
        if (!productId) {
          console.warn('⚠️ Skipping transaction item without product ID:', item)
          continue
        }
        
        const productName = item.product?.name || 'Unknown'
        const orderedQuantity = item.quantity || 0
        const unit = item.unit || 'pcs'
        const width = item.width
        const height = item.height

        // Calculate delivered quantity for this specific product name (to separate regular vs bonus)
        let deliveredQuantity = 0
        let deliveryItemsFound = 0
        
        for (const delivery of deliveries) {
          for (const deliveryItem of delivery.items) {
            // Match by both productId AND productName to differentiate bonus vs regular items
            if (deliveryItem.productId === productId && deliveryItem.productName === productName) {
              deliveredQuantity += deliveryItem.quantityDelivered
              deliveryItemsFound++
            }
          }
        }

        // Calculate remaining quantity with validation
        const remainingQuantity = Math.max(0, orderedQuantity - deliveredQuantity)

        deliverySummary.push({
          productId,
          productName,
          orderedQuantity,
          deliveredQuantity,
          remainingQuantity,
          unit,
          width,
          height,
        })
      }

      return {
        id: transactionData.id,
        customerName: transactionData.customer_name,
        orderDate: new Date(transactionData.order_date),
        items: transactionData.items,
        total: transactionData.total,
        status: transactionData.status,
        deliveries,
        deliverySummary,
      }
    },
    enabled: !!transactionId,
    // Optimized for single transaction delivery info - REDUCED CACHE TIME FOR BETTER CONSISTENCY
    staleTime: 30 * 1000, // 30 seconds - shorter for more accurate delivery tracking
    gcTime: 5 * 60 * 1000, // 5 minutes cache
    refetchOnWindowFocus: true, // Enable refetch on focus for better UX
    refetchOnReconnect: true, // Enable refetch on reconnect
    retry: 2, // More retries for delivery info
    retryDelay: 1000,
  })
}

// Create new delivery
export function useDeliveries() {
  const queryClient = useQueryClient();
  const { currentBranch } = useBranch();
  const { user } = useAuth();

  const createDelivery = useMutation({
    mutationFn: async (request: CreateDeliveryRequest): Promise<Delivery> => {
      let photoUrl: string | undefined

      // Upload photo via VPS server
      if (request.photo) {
        try {
          const uploadResult = await PhotoUploadService.uploadPhoto(
            request.photo,
            request.transactionId,
            'deliveries' // category folder
          )
          if (uploadResult) {
            photoUrl = uploadResult.webViewLink
          }
        } catch (error) {
          console.error('Failed to upload photo to VPS:', error)
          // Continue without photo rather than failing the entire delivery
        }
      }

      // Get customer name and address from transaction
      // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
      const { data: transactionRawData, error: transactionError } = await supabase
        .from('transactions')
        .select('customer_name, customer_id, customers(address, phone)')
        .eq('id', request.transactionId)
        .order('id').limit(1)

      if (transactionError) {
        console.error('[useDeliveries] Transaction fetch error:', transactionError)

        // Handle network connection issues
        if (transactionError.message?.includes('Failed to fetch') ||
            transactionError.message?.includes('ERR_CONNECTION_CLOSED')) {
          throw new Error('Koneksi internet bermasalah. Silakan periksa koneksi dan coba lagi.')
        }

        throw new Error(`Tidak dapat mengambil data transaksi: ${transactionError.message}`)
      }

      // Handle array response from PostgREST
      const transactionData = Array.isArray(transactionRawData) ? transactionRawData[0] : transactionRawData

      // Get next delivery number for this transaction
      const { data: existingDeliveries } = await supabase
        .from('deliveries')
        .select('delivery_number')
        .eq('transaction_id', request.transactionId)
        .order('delivery_number', { ascending: false })
        .limit(1);

      const nextDeliveryNumber = existingDeliveries && existingDeliveries.length > 0 
        ? existingDeliveries[0].delivery_number + 1 
        : 1;

      console.log(`📦 Creating delivery #${nextDeliveryNumber} for transaction ${request.transactionId}`);

      // Create delivery record using RPC function (SECURITY DEFINER)
      // This bypasses RLS SELECT restrictions and guarantees RETURNING works
      let deliveryData;
      const { data: rpcResult, error: deliveryError } = await supabase
        .rpc('insert_delivery', {
          p_transaction_id: request.transactionId,
          p_delivery_number: nextDeliveryNumber,
          p_customer_name: transactionData?.customer_name || '',
          p_customer_address: transactionData?.customers?.address || '',
          p_customer_phone: transactionData?.customers?.phone || '',
          p_delivery_date: new Date().toISOString(),
          p_photo_url: photoUrl || null,
          p_notes: request.notes || null,
          p_driver_id: request.driverId || null,
          p_helper_id: request.helperId || null,
          p_branch_id: currentBranch?.id || null,
        })

      // RPC returns array, get first item
      const initialDeliveryData = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;

      if (!deliveryError && initialDeliveryData) {
        deliveryData = initialDeliveryData;
      }

      if (deliveryError) {
        console.error('[useDeliveries] Delivery creation error:', deliveryError)

        if (deliveryError.message.includes('relation "deliveries" does not exist')) {
          throw new Error('Tabel pengantaran belum tersedia. Silakan jalankan database migration terlebih dahulu.')
        }

        if (deliveryError.code === '23505' && (deliveryError.message.includes('deliveries_delivery_number_key') || deliveryError.message.includes('deliveries_transaction_delivery_number_key'))) {

          // Retry with next available number
          const { data: retryDeliveries } = await supabase
            .from('deliveries')
            .select('delivery_number')
            .eq('transaction_id', request.transactionId)
            .order('delivery_number', { ascending: false })
            .limit(1);

          const retryDeliveryNumber = retryDeliveries && retryDeliveries.length > 0
            ? retryDeliveries[0].delivery_number + 1
            : 1;

          // Try again with updated number using RPC
          const { data: retryRpcResult, error: retryError } = await supabase
            .rpc('insert_delivery', {
              p_transaction_id: request.transactionId,
              p_delivery_number: retryDeliveryNumber,
              p_customer_name: transactionData?.customer_name || '',
              p_customer_address: transactionData?.customers?.address || '',
              p_customer_phone: transactionData?.customers?.phone || '',
              p_delivery_date: new Date().toISOString(),
              p_photo_url: photoUrl || null,
              p_notes: request.notes || null,
              p_driver_id: request.driverId || null,
              p_helper_id: request.helperId || null,
              p_branch_id: currentBranch?.id || null,
            });

          if (retryError) {
            throw new Error(`Failed to create delivery after retry: ${retryError.message}`);
          }

          // RPC returns array, get first item
          const retryDeliveryData = Array.isArray(retryRpcResult) ? retryRpcResult[0] : retryRpcResult;

          // Use retry data for the rest of the function
          deliveryData = retryDeliveryData;
        } else {
          throw new Error(`Database error: ${deliveryError.message}`)
        }
      }

      // Validate product IDs exist in products table first
      const productIds = request.items
        .filter(item => item.quantityDelivered > 0 && item.productId)
        .map(item => item.productId)
      
      let validProductIds = new Set<string>()
      
      if (productIds.length > 0) {
        const { data: existingProducts, error: productError } = await supabase
          .from('products')
          .select('id')
          .in('id', productIds)
        
        if (productError) {
          console.error('[useDeliveries] Product validation error:', productError)
          throw new Error(`Gagal memvalidasi produk: ${productError.message}`)
        }
        
        validProductIds = new Set(existingProducts?.map(p => p.id) || [])
        const invalidProductIds = productIds.filter(id => !validProductIds.has(id))
        
        if (invalidProductIds.length > 0) {
          // Store invalid product info for user notification
          (deliveryData as any)._invalidProductIds = invalidProductIds
        }
      }

      // Validate deliveryData.id exists before creating delivery items
      if (!deliveryData || !deliveryData.id) {
        throw new Error('Gagal membuat record pengantaran - delivery ID tidak ditemukan')
      }

      // Create delivery items with minimal columns first (defensive approach)
      const deliveryItems = request.items
        .filter(item =>
          item.quantityDelivered > 0 &&
          item.productId &&
          validProductIds.has(item.productId) // Only include items with valid product IDs
        )
        .map(item => {
          // Start with absolute minimum required columns
          const itemData: any = {
            delivery_id: deliveryData.id,
            product_id: item.productId, // This is now validated to exist
            product_name: item.productName || 'Unknown Product',
            quantity_delivered: item.quantityDelivered,
            unit: item.unit || 'pcs',
          }
          
          // Add optional fields only if they have valid values
          if (item.notes) itemData.notes = item.notes
          if (item.width !== undefined && item.width !== null) {
            itemData.width = item.width
          }
          if (item.height !== undefined && item.height !== null) {
            itemData.height = item.height
          }
          
          // Add isBonus field for commission calculation
          if (item.isBonus !== undefined) {
            itemData.is_bonus = item.isBonus
          }
          
          return itemData
        })
        
      // Skip delivery_items insert if no valid items
      if (deliveryItems.length === 0) {
        console.warn('[useDeliveries] No valid delivery items to insert')
        
        // Return delivery object without items
        const emptyResult = {
          id: deliveryData.id,
          transactionId: deliveryData.transaction_id,
          deliveryNumber: deliveryData.delivery_number,
          deliveryDate: new Date(deliveryData.delivery_date),
          photoUrl: deliveryData.photo_url,
          notes: deliveryData.notes,
          driverId: deliveryData.driver_id,
          helperId: deliveryData.helper_id,
          items: [],
          createdAt: new Date(deliveryData.created_at),
          updatedAt: new Date(deliveryData.updated_at),
        } as any;
        
        // Add invalid product info if it exists
        if ((deliveryData as any)._invalidProductIds) {
          emptyResult._invalidProductIds = (deliveryData as any)._invalidProductIds;
        }
        
        return emptyResult;
      }

      // Try to insert delivery items, but gracefully handle schema issues
      let itemsData: any[] = []
      try {
        const { data, error: itemsError } = await supabase
          .from('delivery_items')
          .insert(deliveryItems)
          .select('*')

        if (itemsError) {
          console.error('[useDeliveries] Delivery items creation error:', itemsError)
          console.error('[useDeliveries] Delivery items data was:', deliveryItems)
          
          // Handle missing column errors gracefully
          if (itemsError.code === 'PGRST204' || itemsError.message?.includes('Could not find the') ||
              itemsError.message?.includes('column') && itemsError.message?.includes('does not exist')) {
            console.warn('[useDeliveries] Delivery items schema mismatch, skipping items insert')
            // Continue without delivery items rather than failing the entire delivery
          } else {
            throw new Error(`Gagal menyimpan item pengantaran: ${itemsError.message}`)
          }
        } else {
          itemsData = data || []
          console.log('[useDeliveries] Delivery items created successfully:', itemsData)
        }
      } catch (schemaError: any) {
        console.warn('[useDeliveries] Schema error with delivery_items, continuing without items:', schemaError.message)
        // Continue with delivery creation even if items fail due to schema issues
      }

      // Note: Material stock movements are NOT processed during delivery
      // Delivery tracks PRODUCT delivery to customers, not material consumption
      // Material stock movements should happen during production/manufacturing process
      console.log('📦 Delivery created - product stock will be updated via product_stock table, not material_stock_movements');

      // Update transaction status automatically based on delivery completion
      try {
        // Get transaction details to check if all items are delivered
        // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
        const { data: updatedTransactionRaw, error: transactionError } = await supabase
          .from('transactions')
          .select('*')
          .eq('id', request.transactionId)
          .order('id').limit(1)

        // Handle array response from PostgREST
        const updatedTransaction = Array.isArray(updatedTransactionRaw) ? updatedTransactionRaw[0] : updatedTransactionRaw

        if (transactionError) {
          console.error('Failed to fetch transaction for status update:', transactionError)
        } else if (updatedTransaction) {
          // Calculate total ordered vs delivered quantities
          // Filter out sales metadata items (those with _isSalesMeta flag)
          const transactionItems = (updatedTransaction.items || []).filter((item: any) => !item._isSalesMeta)
          const deliveryItemsForThisTransaction = request.items.filter(item => item.quantityDelivered > 0)

          let allItemsDelivered = true
          let anyItemsDelivered = false

          for (const transactionItem of transactionItems) {
            const productId = transactionItem.product?.id
            if (!productId) continue
            
            const orderedQuantity = transactionItem.quantity || 0
            
            // Calculate total delivered quantity for this product across all deliveries
            const { data: allDeliveries, error: deliveryError } = await supabase
              .from('deliveries')
              .select(`
                items:delivery_items(*)
              `)
              .eq('transaction_id', request.transactionId)
            
            let totalDelivered = 0
            if (allDeliveries && !deliveryError) {
              for (const delivery of allDeliveries) {
                for (const deliveryItem of (delivery.items || [])) {
                  if (deliveryItem.product_id === productId) {
                    totalDelivered += deliveryItem.quantity_delivered
                  }
                }
              }
            }
            
            if (totalDelivered > 0) anyItemsDelivered = true
            if (totalDelivered < orderedQuantity) allItemsDelivered = false
          }
          
          // Determine new status
          let newStatus = updatedTransaction.status
          if (allItemsDelivered && anyItemsDelivered) {
            newStatus = 'Selesai'
          } else if (anyItemsDelivered) {
            newStatus = 'Diantar Sebagian'
          }
          
          // Update status if changed
          if (newStatus !== updatedTransaction.status) {
            const { error: statusUpdateError } = await supabase
              .from('transactions')
              .update({ status: newStatus })
              .eq('id', request.transactionId)
              
            if (statusUpdateError) {
              console.error('Failed to update transaction status:', statusUpdateError)
            } else {
              console.log(`Transaction ${request.transactionId} status updated to: ${newStatus}`)
            }
          }
        }
      } catch (statusError) {
        console.error('Error updating transaction status after delivery:', statusError)
        // Don't fail delivery creation if status update fails
      }

      // Fetch driver and helper names if IDs are provided
      let driverName: string | undefined;
      let helperName: string | undefined;

      console.log('[useDeliveries] Fetching driver/helper names:', {
        driverId: deliveryData.driver_id,
        helperId: deliveryData.helper_id
      });

      if (deliveryData.driver_id) {
        try {
          const { data: driverData, error: driverError } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', deliveryData.driver_id)
            .order('id').limit(1);

          console.log('[useDeliveries] Driver fetch result:', {
            driverData,
            driverError,
            type: typeof driverData,
            isArray: Array.isArray(driverData)
          });

          // PostgREST always returns array, get first item
          if (driverData && Array.isArray(driverData) && driverData.length > 0) {
            driverName = driverData[0].full_name || undefined;
          } else if (driverData && !Array.isArray(driverData)) {
            // Fallback for object response
            driverName = (driverData as any).full_name || undefined;
          }

          console.log('[useDeliveries] Extracted driverName:', driverName);
        } catch (err) {
          console.error('[useDeliveries] Error fetching driver:', err);
        }
      }

      if (deliveryData.helper_id) {
        try {
          const { data: helperData, error: helperError } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', deliveryData.helper_id)
            .order('id').limit(1);

          console.log('[useDeliveries] Helper fetch result:', {
            helperData,
            helperError,
            type: typeof helperData,
            isArray: Array.isArray(helperData)
          });

          // PostgREST always returns array, get first item
          if (helperData && Array.isArray(helperData) && helperData.length > 0) {
            helperName = helperData[0].full_name || undefined;
          } else if (helperData && !Array.isArray(helperData)) {
            // Fallback for object response
            helperName = (helperData as any).full_name || undefined;
          }

          console.log('[useDeliveries] Extracted helperName:', helperName);
        } catch (err) {
          console.error('[useDeliveries] Error fetching helper:', err);
        }
      }

      console.log('[useDeliveries] Final names:', { driverName, helperName });

      // Return complete delivery object
      const result = {
        id: deliveryData.id,
        transactionId: deliveryData.transaction_id,
        deliveryNumber: deliveryData.delivery_number,
        deliveryDate: new Date(deliveryData.delivery_date),
        photoUrl: deliveryData.photo_url,
        notes: deliveryData.notes,
        driverId: deliveryData.driver_id,
        driverName,
        helperId: deliveryData.helper_id,
        helperName,
        branchId: deliveryData.branch_id || currentBranch?.id || null, // Untuk commission entry
        items: itemsData.map((item: any) => ({
          id: item.id,
          deliveryId: item.delivery_id,
          productId: item.product_id,
          productName: item.product_name,
          quantityDelivered: item.quantity_delivered,
          unit: item.unit,
          width: item.width,
          height: item.height,
          notes: item.notes,
          isBonus: item.is_bonus || false,
          createdAt: new Date(item.created_at),
        })),
        createdAt: new Date(deliveryData.created_at),
        updatedAt: new Date(deliveryData.updated_at),
      } as any;
      
      // Add invalid product info if it exists
      if ((deliveryData as any)._invalidProductIds) {
        result._invalidProductIds = (deliveryData as any)._invalidProductIds;
      }

      // Generate delivery commission for driver and helper
      try {
        const { generateDeliveryCommission } = await import('@/utils/commissionUtils');
        await generateDeliveryCommission(result);
      } catch (commissionError) {
        // Don't fail delivery creation if commission generation fails
      }

      // ============================================================================
      // CREATE DELIVERY JOURNAL (for non-office sale transactions)
      // Jurnal: Dr. Hutang Barang Dagang (2140), Cr. Persediaan Barang Dagang (1310)
      //
      // Ini menandakan kewajiban kirim barang sudah terpenuhi dan persediaan berkurang.
      // Untuk "Laku Kantor" (isOfficeSale=true), persediaan sudah berkurang saat transaksi.
      // ============================================================================
      try {
        // Get transaction data untuk cek apakah ini office sale atau bukan
        // Use .order('id').limit(1) and handle array response
        const { data: txnRaw } = await supabase
          .from('transactions')
          .select('id, is_office_sale, transaction_number, items')
          .eq('id', request.transactionId)
          .order('id').limit(1);

        const txnData = Array.isArray(txnRaw) ? txnRaw[0] : txnRaw;

        // Only create delivery journal for non-office sale
        if (txnData && !txnData.is_office_sale && itemsData.length > 0) {
          console.log('📒 Creating delivery journal for non-office sale...');

          // Calculate HPP per unit from transaction items
          const txnItems = txnData.items || [];
          const deliveryJournalItems = itemsData.map((item: any) => {
            // Find matching transaction item to get HPP
            const txnItem = txnItems.find((ti: any) =>
              ti.product?.id === item.product_id && !ti._isSalesMeta && !ti.isBonus
            );

            // Calculate HPP per unit (use hppPerUnit from transaction if available)
            // Otherwise calculate from total HPP / quantity
            let hppPerUnit = 0;
            if (txnItem) {
              if (txnItem.hppPerUnit) {
                hppPerUnit = txnItem.hppPerUnit;
              } else if (txnItem.hpp && txnItem.quantity > 0) {
                hppPerUnit = txnItem.hpp / txnItem.quantity;
              } else if (txnItem.product?.cost_price) {
                hppPerUnit = txnItem.product.cost_price;
              }
            }

            return {
              productId: item.product_id,
              productName: item.product_name,
              quantity: item.quantity_delivered,
              hppPerUnit
            };
          }).filter((item: any) => item.hppPerUnit > 0); // Only include items with valid HPP

          if (deliveryJournalItems.length > 0) {
            const journalResult = await createDeliveryJournal({
              deliveryId: deliveryData.id,
              deliveryDate: new Date(deliveryData.delivery_date),
              transactionId: request.transactionId,
              transactionNumber: txnData.transaction_number || `TXN-${request.transactionId}`,
              items: deliveryJournalItems,
              branchId: currentBranch?.id || deliveryData.branch_id || ''
            });

            if (journalResult.success) {
              console.log('✅ Delivery journal created:', journalResult.journalId);
            } else {
              console.warn('⚠️ Failed to create delivery journal:', journalResult.error);
            }
          } else {
            console.log('ℹ️ No items with valid HPP for delivery journal');
          }
        } else if (txnData?.is_office_sale) {
          console.log('ℹ️ Skipping delivery journal for office sale (laku kantor)');
        }
      } catch (journalError) {
        console.error('❌ Error creating delivery journal:', journalError);
        // Don't fail delivery creation if journal creation fails
      }

      // ============================================================================
      // REDUCE PRODUCT STOCK when delivery is created (for non-office sale)
      // Laku Kantor: stok berkurang saat transaksi
      // Bukan Laku Kantor: stok berkurang saat DELIVERY (ini)
      // ============================================================================
      try {
        if (itemsData && itemsData.length > 0) {
          console.log('📦 Reducing product stock for delivery items...');

          for (const item of itemsData) {
            if (item.product_id && item.quantity_delivered > 0) {
              // Get current stock
              // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
              const { data: productRawData } = await supabase
                .from('products')
                .select('current_stock, name')
                .eq('id', item.product_id)
                .order('id').limit(1);

              // Handle array response from PostgREST
              const productData = Array.isArray(productRawData) ? productRawData[0] : productRawData;

              if (productData) {
                const currentStock = productData.current_stock || 0;
                const newStock = currentStock - item.quantity_delivered;

                const { error: stockError } = await supabase
                  .from('products')
                  .update({ current_stock: newStock })
                  .eq('id', item.product_id);

                if (stockError) {
                  console.error(`Failed to reduce stock for ${productData.name}:`, stockError);
                } else {
                  console.log(`📦 Stock reduced for ${productData.name}: ${currentStock} → ${newStock}`);
                }
              }
            }
          }
        }
      } catch (stockError) {
        console.error('Error reducing product stock:', stockError);
        // Don't fail delivery creation if stock update fails
      }

      // Note: Bonus accounting is now handled in useTransactions.ts when transaction is created
      // Note: Revenue Recognition & HPP Penjualan is also handled in useTransactions.ts
      // This ensures consistent accounting - all journal entries at transaction level

      return result;
    },
    onSuccess: () => {
      // Only invalidate essential queries for better performance
      queryClient.invalidateQueries({ queryKey: ['transactions-ready-for-delivery'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['products'] }) // Refresh product stock
    },
  })

  // Delete delivery and restore stock (for non-office sale transactions)
  // Alur stok:
  // - Laku Kantor: Stok berkurang saat transaksi → restore saat delete transaksi
  // - Bukan Laku Kantor: Stok berkurang saat delivery → restore saat delete delivery
  const deleteDelivery = useMutation({
    mutationFn: async (deliveryId: string): Promise<void> => {
      // Check user permission using context user (works with both Supabase and PostgREST)
      if (!user) {
        throw new Error('User tidak terautentikasi')
      }

      const userRole = user.role || 'user'

      if (userRole !== 'admin' && userRole !== 'owner') {
        throw new Error('Hanya admin dan owner yang dapat menghapus pengantaran')
      }

      // Get delivery details including items
      // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
      const { data: deliveryRawData, error: deliveryError } = await supabase
        .from('deliveries')
        .select(`
          *,
          items:delivery_items(*)
        `)
        .eq('id', deliveryId)
        .order('id').limit(1)

      if (deliveryError) {
        throw new Error(`Gagal mengambil data pengantaran: ${deliveryError.message}`)
      }

      // Handle array response from PostgREST
      const deliveryData = Array.isArray(deliveryRawData) ? deliveryRawData[0] : deliveryRawData

      if (!deliveryData) {
        throw new Error('Data pengantaran tidak ditemukan')
      }

      // Restore stock for each delivered item
      // Stok berkurang saat delivery untuk transaksi non-office sale
      // Jadi harus di-restore saat delivery dihapus
      try {
        if (user && deliveryData.items?.length > 0) {
          console.log('🔄 Starting stock restoration for deleted delivery:', {
            deliveryId,
            deliveryNumber: deliveryData.delivery_number,
            itemsCount: deliveryData.items.length
          })

          // Process each item individually for better error handling
          for (const item of deliveryData.items) {
            try {
              // Get current product data
              // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
              const { data: productRawData, error: productError } = await supabase
                .from('products')
                .select('id, name, type, current_stock')
                .eq('id', item.product_id)
                .order('id').limit(1)

              if (productError) {
                console.error(`❌ Error getting product data for ${item.product_name}:`, productError)
                continue
              }

              // Handle array response from PostgREST
              const productData = Array.isArray(productRawData) ? productRawData[0] : productRawData

              if (!productData) {
                console.error(`❌ Product not found for ${item.product_name} (${item.product_id})`)
                continue
              }

              // Calculate new stock (restore delivered quantity)
              const newStock = productData.current_stock + item.quantity_delivered
              
              console.log(`📦 Restoring stock for ${item.product_name}:`, {
                productId: item.product_id,
                currentStock: productData.current_stock,
                quantityToRestore: item.quantity_delivered,
                newStock: newStock
              })

              // Update product stock directly
              const { error: stockUpdateError } = await supabase
                .from('products')
                .update({ current_stock: newStock })
                .eq('id', item.product_id)

              if (stockUpdateError) {
                console.error(`❌ Error updating stock for ${item.product_name}:`, stockUpdateError)
                continue
              }

              // Create stock movement record for audit trail
              const { error: movementError } = await supabase
                .from('stock_movements')
                .insert({
                  product_id: item.product_id,
                  product_name: item.product_name,
                  movement_type: 'restore',
                  quantity: item.quantity_delivered,
                  reference_id: deliveryId,
                  reference_type: 'delivery_deletion',
                  notes: `Stock restored from deleted delivery ${deliveryData.delivery_number}`,
                  created_by: user?.id || null,
                  created_by_name: user?.name || user?.email || 'Unknown User'
                })

              if (movementError) {
                console.error(`❌ Error creating stock movement for ${item.product_name}:`, movementError)
                // Continue even if movement record fails
              }

              console.log(`✅ Stock restored successfully for ${item.product_name}`)
            } catch (itemError) {
              console.error(`❌ Error processing stock restoration for ${item.product_name}:`, itemError)
              // Continue with other items
            }
          }

          console.log('✅ Stock restoration process completed for delivery:', deliveryId)
        }
      } catch (stockError) {
        console.error('❌ Failed to restore stock for deleted delivery:', stockError)
        // Continue with deletion even if stock restoration fails
        // Note: We don't throw here to allow delivery deletion to proceed
      }

      // Delete delivery commissions
      try {
        console.log('🔄 Deleting delivery commissions for:', deliveryId)
        const { error: commissionError } = await supabase
          .from('commission_entries')
          .delete()
          .eq('delivery_id', deliveryId)

        if (commissionError) {
          console.error('❌ Failed to delete delivery commissions:', commissionError)
        } else {
          console.log('✅ Delivery commissions deleted for:', deliveryId)
        }
      } catch (commissionError) {
        console.error('❌ Error deleting delivery commissions:', commissionError)
        // Don't throw - commission deletion is not critical
      }

      // Note: Bonus accounting rollback is now handled in useTransactions.ts when transaction is deleted
      // This ensures consistent accounting - bonus is recorded at transaction level, not delivery level

      // Void delivery journal (Hutang Barang Dagang reversal)
      // Jurnal asli: Dr. Hutang Barang Dagang, Cr. Persediaan
      // Saat void: jurnal di-void/delete, saldo kembali
      try {
        console.log('🔄 Voiding delivery journal for:', deliveryId)
        const { error: voidError } = await supabase
          .from('journal_entries')
          .update({
            is_voided: true,
            voided_at: new Date().toISOString(),
            voided_reason: 'Pengantaran dihapus'
          })
          .eq('reference_id', deliveryId)
          .eq('reference_type', 'adjustment')

        if (voidError) {
          console.error('❌ Failed to void delivery journal:', voidError)
        } else {
          console.log('✅ Delivery journal voided for:', deliveryId)
        }
      } catch (voidJournalError) {
        console.error('❌ Error voiding delivery journal:', voidJournalError)
        // Don't throw - journal void is not critical for deletion
      }

      // Delete delivery items first
      const { error: itemsError } = await supabase
        .from('delivery_items')
        .delete()
        .eq('delivery_id', deliveryId)

      if (itemsError) {
        console.error('Failed to delete delivery items:', itemsError)
        // Continue with delivery deletion even if items deletion fails
      }

      // Delete delivery record
      const { error: deliveryDeleteError } = await supabase
        .from('deliveries')
        .delete()
        .eq('id', deliveryId)

      if (deliveryDeleteError) {
        throw new Error(`Gagal menghapus pengantaran: ${deliveryDeleteError.message}`)
      }

      // Update transaction status based on remaining deliveries
      try {
        const transactionId = deliveryData.transaction_id

        // Get remaining deliveries for this transaction
        const { data: remainingDeliveries } = await supabase
          .from('deliveries')
          .select(`
            items:delivery_items(*)
          `)
          .eq('transaction_id', transactionId)

        // Get transaction details
        // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
        const { data: transactionRawData } = await supabase
          .from('transactions')
          .select('*')
          .eq('id', transactionId)
          .order('id').limit(1)

        // Handle array response from PostgREST
        const transactionData = Array.isArray(transactionRawData) ? transactionRawData[0] : transactionRawData

        if (transactionData) {
          let allItemsDelivered = true
          let anyItemsDelivered = false

          // Filter out sales metadata items (those with _isSalesMeta flag)
          const transactionItems = (transactionData.items || []).filter((item: any) => !item._isSalesMeta)

          for (const transactionItem of transactionItems) {
            const productId = transactionItem.product?.id
            if (!productId) continue

            const orderedQuantity = transactionItem.quantity || 0

            // Calculate total delivered quantity from remaining deliveries
            let totalDelivered = 0
            if (remainingDeliveries) {
              for (const delivery of remainingDeliveries) {
                for (const deliveryItem of (delivery.items || [])) {
                  if (deliveryItem.product_id === productId) {
                    totalDelivered += deliveryItem.quantity_delivered
                  }
                }
              }
            }

            if (totalDelivered > 0) anyItemsDelivered = true
            if (totalDelivered < orderedQuantity) allItemsDelivered = false
          }

          // Determine new status - IMPROVED LOGIC
          let newStatus = 'Pesanan Masuk' // Default back to initial status
          if (allItemsDelivered && anyItemsDelivered) {
            newStatus = 'Selesai'
          } else if (anyItemsDelivered) {
            newStatus = 'Diantar Sebagian'
          }

          console.log('📊 Updating transaction status after delivery deletion:', {
            transactionId,
            oldStatus: transactionData.status,
            newStatus,
            allItemsDelivered,
            anyItemsDelivered,
            remainingDeliveriesCount: remainingDeliveries?.length || 0
          })

          // Update transaction status
          const { error: statusUpdateError } = await supabase
            .from('transactions')
            .update({ status: newStatus })
            .eq('id', transactionId)

          if (statusUpdateError) {
            console.error('❌ Error updating transaction status:', statusUpdateError)
            throw statusUpdateError // This is important enough to fail the deletion
          }

          console.log('✅ Transaction status updated successfully:', newStatus)
        }
      } catch (statusError) {
        console.error('❌ Critical error updating transaction status after delivery deletion:', statusError)
        // This is critical - if we can't update status properly, the transaction might be in an inconsistent state
        throw new Error(`Failed to update transaction status after delivery deletion: ${statusError.message}`)
      }
    },
    onSuccess: () => {
      // IMPROVED: Comprehensive cache invalidation
      console.log('🧹 Invalidating caches after delivery deletion')
      
      // Force refetch all related queries
      queryClient.invalidateQueries({ queryKey: ['transactions-ready-for-delivery'] })
      queryClient.invalidateQueries({ queryKey: ['transaction-delivery-info'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['delivery-history'] })
      queryClient.invalidateQueries({ queryKey: ['products'] }) // Important for stock updates
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] }) // For audit trail
      
      // Also refetch data immediately to ensure UI is up-to-date
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ['transactions-ready-for-delivery'] })
        queryClient.refetchQueries({ queryKey: ['transaction-delivery-info'] })
        queryClient.refetchQueries({ queryKey: ['transactions'] })
      }, 500) // Small delay to ensure DB operations are complete
      
      console.log('✅ Cache invalidation completed')
    },
  })

  return {
    createDelivery,
    deleteDelivery,
  }
}

// Fetch all delivery history for admin/owner
export function useDeliveryHistory() {
  const { currentBranch, canAccessAllBranches } = useBranch();

  return useQuery({
    queryKey: ['delivery-history', currentBranch?.id],
    queryFn: async (): Promise<Delivery[]> => {
      let query = supabase
        .from('deliveries')
        .select(`
          *,
          items:delivery_items(*),
          driver:profiles!driver_id(id, full_name),
          helper:profiles!helper_id(id, full_name),
          transaction:transactions!transaction_id(id, customer_name, total, order_date)
        `)
        .order('delivery_date', { ascending: false })
        .limit(100); // Limit for performance

      // Apply branch filter (only if not head office viewing all branches)
      if (currentBranch?.id) {
        query = query.eq('branch_id', currentBranch.id);
      }

      const { data, error } = await query;
      
      if (error) {
        console.error('[useDeliveryHistory] Error fetching delivery history:', error)
        throw error
      }

      return (data || []).map((d: any) => ({
        id: d.id,
        transactionId: d.transaction_id,
        deliveryNumber: d.delivery_number,
        deliveryDate: new Date(d.delivery_date),
        photoUrl: d.photo_url,
        notes: d.notes,
        driverId: d.driver_id,
        driverName: d.driver?.full_name || undefined,
        helperId: d.helper_id,
        helperName: d.helper?.full_name || undefined,
        customerName: d.transaction?.customer_name || 'Unknown',
        customerAddress: d.customer_address || '',
        customerPhone: d.customer_phone || '',
        transactionTotal: d.transaction?.total || 0,
        transactionDate: d.transaction?.order_date ? new Date(d.transaction.order_date) : new Date(),
        items: (d.items || []).map((item: any) => ({
          id: item.id,
          deliveryId: item.delivery_id,
          productId: item.product_id,
          productName: item.product_name,
          quantityDelivered: item.quantity_delivered,
          unit: item.unit,
          width: item.width,
          height: item.height,
          notes: item.notes,
          isBonus: item.is_bonus || false,
          createdAt: new Date(item.created_at),
        })),
        createdAt: new Date(d.created_at),
        updatedAt: new Date(d.updated_at),
      } as Delivery & {
        customerName: string
        customerAddress: string
        customerPhone: string
        transactionTotal: number
        transactionDate: Date
      }))
    },
    enabled: !!currentBranch,
  })
}