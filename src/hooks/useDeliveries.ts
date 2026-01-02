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
import { StockService } from '@/services/stockService'

// ============================================================================
// FIFO BATCH MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Deduct quantity from inventory batches using FIFO method
 * Called when delivery is created - reduces remaining_quantity from oldest batches first
 */
async function deductBatchFIFO(productId: string, quantity: number, branchId: string | null): Promise<void> {
  if (quantity <= 0 || !productId) return;

  try {
    // Get all batches with remaining stock, ordered by batch_date (FIFO)
    const { data: batches, error } = await supabase
      .from('inventory_batches')
      .select('id, remaining_quantity, batch_date')
      .eq('product_id', productId)
      .gt('remaining_quantity', 0)
      .order('batch_date', { ascending: true });

    if (error) {
      console.error('[deductBatchFIFO] Error fetching batches:', error);
      return;
    }

    if (!batches || batches.length === 0) {
      console.warn(`[deductBatchFIFO] No batches found for product ${productId}`);
      return;
    }

    let remainingToDeduct = quantity;

    for (const batch of batches) {
      if (remainingToDeduct <= 0) break;

      const batchRemaining = batch.remaining_quantity || 0;
      const deductFromBatch = Math.min(batchRemaining, remainingToDeduct);

      if (deductFromBatch > 0) {
        const newRemaining = batchRemaining - deductFromBatch;

        const { error: updateError } = await supabase
          .from('inventory_batches')
          .update({
            remaining_quantity: newRemaining,
            updated_at: new Date().toISOString()
          })
          .eq('id', batch.id);

        if (updateError) {
          console.error(`[deductBatchFIFO] Error updating batch ${batch.id}:`, updateError);
        } else {
          console.log(`📦 FIFO: Batch ${batch.id.substring(0, 8)} reduced by ${deductFromBatch} (${batchRemaining} → ${newRemaining})`);
        }

        remainingToDeduct -= deductFromBatch;
      }
    }

    if (remainingToDeduct > 0) {
      console.warn(`[deductBatchFIFO] Could not fully deduct ${quantity} from product ${productId}. Remaining: ${remainingToDeduct}`);
    }
  } catch (err) {
    console.error('[deductBatchFIFO] Exception:', err);
  }
}

/**
 * Restore quantity to inventory batches using FIFO method
 * Called when delivery is deleted - adds back to oldest depleted batch first
 */
async function restoreBatchFIFO(productId: string, quantity: number, branchId: string | null): Promise<void> {
  if (quantity <= 0 || !productId) return;

  try {
    // Get all batches ordered by batch_date ASC (oldest first for FIFO restore)
    const { data: batches, error } = await supabase
      .from('inventory_batches')
      .select('id, initial_quantity, remaining_quantity, batch_date')
      .eq('product_id', productId)
      .order('batch_date', { ascending: true });

    if (error) {
      console.error('[restoreBatchFIFO] Error fetching batches:', error);
      return;
    }

    if (!batches || batches.length === 0) {
      console.warn(`[restoreBatchFIFO] No batches found for product ${productId}`);
      return;
    }

    let remainingToRestore = quantity;

    for (const batch of batches) {
      if (remainingToRestore <= 0) break;

      const batchRemaining = batch.remaining_quantity || 0;
      const batchInitial = batch.initial_quantity || 0;
      const spaceInBatch = batchInitial - batchRemaining;

      if (spaceInBatch > 0) {
        const restoreToBatch = Math.min(spaceInBatch, remainingToRestore);
        const newRemaining = batchRemaining + restoreToBatch;

        const { error: updateError } = await supabase
          .from('inventory_batches')
          .update({
            remaining_quantity: newRemaining,
            updated_at: new Date().toISOString()
          })
          .eq('id', batch.id);

        if (updateError) {
          console.error(`[restoreBatchFIFO] Error updating batch ${batch.id}:`, updateError);
        } else {
          console.log(`📦 FIFO Restore: Batch ${batch.id.substring(0, 8)} restored by ${restoreToBatch} (${batchRemaining} → ${newRemaining})`);
        }

        remainingToRestore -= restoreToBatch;
      }
    }

    if (remainingToRestore > 0) {
      // If we couldn't restore to existing batches, add to the most recent one anyway
      const mostRecentBatch = batches[0];
      const newRemaining = (mostRecentBatch.remaining_quantity || 0) + remainingToRestore;

      await supabase
        .from('inventory_batches')
        .update({
          remaining_quantity: newRemaining,
          updated_at: new Date().toISOString()
        })
        .eq('id', mostRecentBatch.id);

      console.log(`📦 FIFO Restore (overflow): Batch ${mostRecentBatch.id.substring(0, 8)} increased to ${newRemaining}`);
    }
  } catch (err) {
    console.error('[restoreBatchFIFO] Exception:', err);
  }
}

// ============================================================================

// Fetch employees with driver and helper roles from profiles table
export function useDeliveryEmployees() {
  const { currentBranch } = useBranch();

  return useQuery({
    queryKey: ['delivery-employees', currentBranch?.id],
    queryFn: async (): Promise<DeliveryEmployee[]> => {
      let query = supabase
        .from('profiles')
        .select('id, full_name, role, branch_id')
        .in('role', ['supir', 'helper'])
        .neq('status', 'Nonaktif')
        .order('role')
        .order('full_name');

      // Always apply branch filter based on selected branch
      if (currentBranch?.id) {
        query = query.eq('branch_id', currentBranch.id);
      }

      const { data, error } = await query;

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
    enabled: !!currentBranch, // Only run when branch is loaded
  })
}

// Fetch transactions ready for delivery (exclude office sales)
export function useTransactionsReadyForDelivery() {
  const { currentBranch } = useBranch();

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
            cashierName: transaction.cashier_name || undefined,
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
      // ============================================================================
      // VALIDASI: Jika transaksi dari Driver POS (ada retasi_id), driver delivery
      // harus sama dengan driver retasi. Ini mencegah driver lain menginput
      // delivery untuk transaksi yang bukan miliknya.
      // ============================================================================
      let effectiveDriverId = request.driverId // Driver yang akan digunakan (bisa di-override)

      const { data: txnForValidation, error: txnValidationError } = await supabase
        .from('transactions')
        .select('id, retasi_id, cashier_id, cashier_name')
        .eq('id', request.transactionId)
        .order('id').limit(1)

      if (txnValidationError) {
        throw new Error(`Gagal memvalidasi transaksi: ${txnValidationError.message}`)
      }

      const txnData = Array.isArray(txnForValidation) ? txnForValidation[0] : txnForValidation

      if (!txnData) {
        throw new Error('Transaksi tidak ditemukan')
      }

      // Jika transaksi dari Driver POS (ada retasi_id), validasi driver
      if (txnData.retasi_id) {
        // Ambil driver_id dari retasi, atau gunakan cashier_id jika retasi tidak punya driver_id
        const { data: retasiData, error: retasiError } = await supabase
          .from('retasi')
          .select('id, driver_id, driver_name')
          .eq('id', txnData.retasi_id)
          .order('id').limit(1)

        if (retasiError) {
          console.warn('Gagal mengambil data retasi untuk validasi:', retasiError)
        } else {
          const retasi = Array.isArray(retasiData) ? retasiData[0] : retasiData

          if (retasi) {
            // Gunakan driver_id dari retasi, atau fallback ke cashier_id transaksi
            const expectedDriverId = retasi.driver_id || txnData.cashier_id
            const expectedDriverName = retasi.driver_name || txnData.cashier_name

            // Validasi: driver yang dipilih harus sama dengan driver retasi/kasir
            if (request.driverId && expectedDriverId && request.driverId !== expectedDriverId) {
              throw new Error(
                `Transaksi ini berasal dari Driver POS milik ${expectedDriverName}. ` +
                `Hanya ${expectedDriverName} yang dapat menginput pengantaran untuk transaksi ini.`
              )
            }

            // Jika tidak ada driver yang dipilih, gunakan driver retasi/kasir secara otomatis
            if (!request.driverId && expectedDriverId) {
              console.log(`📦 Auto-assigning driver dari retasi: ${expectedDriverName}`)
              effectiveDriverId = expectedDriverId
            }
          }
        }
      }

      let photoUrl: string | undefined

      // Upload photo via VPS server
      if (request.photo) {
        try {
          const uploadResult = await PhotoUploadService.uploadPhoto(
            request.photo,
            request.transactionId,
            'deliveries'
          )
          if (uploadResult) {
            photoUrl = uploadResult.webViewLink
          } else {
            throw new Error('Gagal upload foto - tidak ada hasil upload')
          }
        } catch (error: any) {
          throw new Error(`Gagal upload foto pengantaran: ${error.message || 'Koneksi ke server gagal'}`)
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

      // Create delivery record using RPC function (SECURITY DEFINER)
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
          p_driver_id: effectiveDriverId || null,
          p_helper_id: request.helperId || null,
          p_branch_id: currentBranch?.id || null,
        })

      const initialDeliveryData = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;

      if (!deliveryError && initialDeliveryData) {
        deliveryData = initialDeliveryData;
      }

      if (deliveryError) {

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
              p_driver_id: effectiveDriverId || null,
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
          throw new Error(`Gagal menyimpan item pengantaran: ${itemsError.message}`)
        } else {
          itemsData = data || []
        }
      } catch (schemaError: any) {
        throw new Error(`Gagal menyimpan item pengantaran: ${schemaError.message}`)
      }

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

      if (deliveryData.driver_id) {
        try {
          const { data: driverData } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', deliveryData.driver_id)
            .order('id').limit(1);

          if (driverData && Array.isArray(driverData) && driverData.length > 0) {
            driverName = driverData[0].full_name || undefined;
          } else if (driverData && !Array.isArray(driverData)) {
            driverName = (driverData as any).full_name || undefined;
          }
        } catch (err) {
          // Silent fail - driver name is optional
        }
      }

      if (deliveryData.helper_id) {
        try {
          const { data: helperData } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', deliveryData.helper_id)
            .order('id').limit(1);

          if (helperData && Array.isArray(helperData) && helperData.length > 0) {
            helperName = helperData[0].full_name || undefined;
          } else if (helperData && !Array.isArray(helperData)) {
            helperName = (helperData as any).full_name || undefined;
          }
        } catch (err) {
          // Silent fail - helper name is optional
        }
      }

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
        console.warn('Failed to generate commission:', commissionError);
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
        // Note: transaction_number column doesn't exist, use id as reference
        const { data: txnRaw, error: txnError } = await supabase
          .from('transactions')
          .select('id, is_office_sale, items')
          .eq('id', request.transactionId)
          .order('id').limit(1);

        if (txnError) {
          console.error('❌ Error fetching transaction for delivery journal:', txnError.message);
        }

        const txnData = Array.isArray(txnRaw) ? txnRaw[0] : txnRaw;

        // Only create delivery journal for non-office sale
        if (txnData && !txnData.is_office_sale && itemsData.length > 0) {
          console.log('📒 Creating delivery journal for non-office sale...');

          // Calculate HPP per unit from transaction items or product cost_price
          const txnItems = txnData.items || [];
          const deliveryJournalItems: Array<{ productId: string; productName: string; quantity: number; hppPerUnit: number }> = [];

          for (const item of itemsData) {
            // Find matching transaction item to get HPP
            const txnItem = txnItems.find((ti: any) =>
              ti.product?.id === item.product_id && !ti._isSalesMeta && !ti.isBonus
            );

            // Calculate HPP per unit using FIFO from inventory batches
            // Priority: 1) FIFO batches 2) txnItem.hppPerUnit 3) txnItem.hpp 4) cost_price
            let hppPerUnit = 0;

            // FIFO: Calculate from inventory_batches first
            if (item.product_id) {
              hppPerUnit = await StockService.calculateFIFOHpp(item.product_id, item.quantity_delivered);
              if (hppPerUnit > 0) {
                console.log(`📦 FIFO HPP for ${item.product_name}: ${hppPerUnit}`);
              }
            }

            // Fallback chain if FIFO returns 0
            if (hppPerUnit <= 0 && txnItem) {
              if (txnItem.hppPerUnit) {
                hppPerUnit = txnItem.hppPerUnit;
                console.log(`📦 Fallback (txnItem.hppPerUnit) for ${item.product_name}: ${hppPerUnit}`);
              } else if (txnItem.hpp && txnItem.quantity > 0) {
                hppPerUnit = txnItem.hpp / txnItem.quantity;
                console.log(`📦 Fallback (txnItem.hpp) for ${item.product_name}: ${hppPerUnit}`);
              } else if (txnItem.product?.cost_price) {
                hppPerUnit = txnItem.product.cost_price;
                console.log(`📦 Fallback (txnItem.product.cost_price) for ${item.product_name}: ${hppPerUnit}`);
              }
            }

            // Final fallback: Get cost_price from products table
            if (hppPerUnit <= 0 && item.product_id) {
              const { data: productDataRaw } = await supabase
                .from('products')
                .select('cost_price')
                .eq('id', item.product_id)
                .order('id').limit(1);
              const productData = Array.isArray(productDataRaw) ? productDataRaw[0] : productDataRaw;
              hppPerUnit = productData?.cost_price || 0;
              if (hppPerUnit > 0) {
                console.log(`📦 Final fallback (products.cost_price) for ${item.product_name}: ${hppPerUnit}`);
              } else {
                console.warn(`⚠️ No HPP found for ${item.product_name}, skipping HPP journal`);
              }
            }

            if (hppPerUnit > 0) {
              deliveryJournalItems.push({
                productId: item.product_id,
                productName: item.product_name,
                quantity: item.quantity_delivered,
                hppPerUnit
              });
            }
          }

          if (deliveryJournalItems.length > 0) {
            const journalResult = await createDeliveryJournal({
              deliveryId: deliveryData.id,
              deliveryDate: new Date(deliveryData.delivery_date),
              transactionId: request.transactionId,
              transactionNumber: txnData.id || request.transactionId,
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

                  // Also deduct from inventory batches (FIFO)
                  await deductBatchFIFO(item.product_id, item.quantity_delivered, currentBranch?.id || null);
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

              // Also restore to inventory batches (FIFO)
              await restoreBatchFIFO(item.product_id, item.quantity_delivered, deliveryData.branch_id || null);

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
            status: 'voided',
            is_voided: true,
            voided_at: new Date().toISOString()
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

  // Update delivery (owner only)
  const updateDelivery = useMutation({
    mutationFn: async (request: {
      deliveryId: string;
      driverId?: string;
      helperId?: string;
      notes?: string;
      items?: Array<{
        id: string;
        quantityDelivered: number;
        notes?: string;
      }>;
    }): Promise<void> => {
      // Check user permission (owner only)
      if (!user) {
        throw new Error('User tidak terautentikasi')
      }

      const userRole = user.role || 'user'

      if (userRole !== 'owner') {
        throw new Error('Hanya owner yang dapat mengedit pengantaran')
      }

      // Get current delivery data for stock adjustment
      const { data: deliveryRawData, error: deliveryError } = await supabase
        .from('deliveries')
        .select(`
          *,
          items:delivery_items(*)
        `)
        .eq('id', request.deliveryId)
        .order('id').limit(1)

      if (deliveryError) {
        throw new Error(`Gagal mengambil data pengantaran: ${deliveryError.message}`)
      }

      const deliveryData = Array.isArray(deliveryRawData) ? deliveryRawData[0] : deliveryRawData

      if (!deliveryData) {
        throw new Error('Data pengantaran tidak ditemukan')
      }

      // Update delivery record (driver, helper, notes)
      const updateData: any = {}
      if (request.driverId !== undefined) updateData.driver_id = request.driverId || null
      if (request.helperId !== undefined) updateData.helper_id = request.helperId || null
      if (request.notes !== undefined) updateData.notes = request.notes

      if (Object.keys(updateData).length > 0) {
        const { error: updateError } = await supabase
          .from('deliveries')
          .update(updateData)
          .eq('id', request.deliveryId)

        if (updateError) {
          throw new Error(`Gagal update pengantaran: ${updateError.message}`)
        }
      }

      // Update delivery items if provided
      if (request.items && request.items.length > 0) {
        for (const item of request.items) {
          // Find original item
          const originalItem = deliveryData.items?.find((i: any) => i.id === item.id)
          if (!originalItem) continue

          const quantityDiff = item.quantityDelivered - originalItem.quantity_delivered

          // Update item
          const itemUpdateData: any = {
            quantity_delivered: item.quantityDelivered
          }
          if (item.notes !== undefined) itemUpdateData.notes = item.notes

          const { error: itemError } = await supabase
            .from('delivery_items')
            .update(itemUpdateData)
            .eq('id', item.id)

          if (itemError) {
            throw new Error(`Gagal update item pengantaran: ${itemError.message}`)
          }

          // Adjust stock if quantity changed
          if (quantityDiff !== 0) {
            const { data: productRawData } = await supabase
              .from('products')
              .select('current_stock, name')
              .eq('id', originalItem.product_id)
              .order('id').limit(1)

            const productData = Array.isArray(productRawData) ? productRawData[0] : productRawData

            if (productData) {
              // If quantity increased, reduce more stock. If decreased, restore stock.
              const newStock = productData.current_stock - quantityDiff

              const { error: stockError } = await supabase
                .from('products')
                .update({ current_stock: newStock })
                .eq('id', originalItem.product_id)

              if (stockError) {
                console.error(`Failed to adjust stock for ${productData.name}:`, stockError)
              } else {
                console.log(`📦 Stock adjusted for ${productData.name}: ${productData.current_stock} → ${newStock} (diff: ${quantityDiff})`)

                // Also adjust inventory batches (FIFO)
                if (quantityDiff > 0) {
                  // More delivered = deduct more from batch
                  await deductBatchFIFO(originalItem.product_id, quantityDiff, deliveryData.branch_id || null);
                } else {
                  // Less delivered = restore to batch
                  await restoreBatchFIFO(originalItem.product_id, Math.abs(quantityDiff), deliveryData.branch_id || null);
                }

                // Create stock movement record
                await supabase.from('stock_movements').insert({
                  product_id: originalItem.product_id,
                  product_name: originalItem.product_name,
                  movement_type: quantityDiff > 0 ? 'out' : 'in',
                  quantity: Math.abs(quantityDiff),
                  reference_id: request.deliveryId,
                  reference_type: 'delivery_edit',
                  notes: `Delivery edit adjustment: ${quantityDiff > 0 ? 'increased' : 'decreased'} by ${Math.abs(quantityDiff)}`,
                  created_by: user?.id || null,
                  created_by_name: user?.name || user?.email || 'Unknown User'
                })
              }
            }
          }
        }

        // ============================================================================
        // UPDATE DELIVERY JOURNAL - Edit jurnal langsung (bukan void + recreate)
        // Jurnal Delivery: Dr. Hutang Barang Dagang (2140), Cr. Persediaan (1310)
        // ============================================================================
        try {
          // Find existing delivery journal
          const { data: existingJournalRaw } = await supabase
            .from('journal_entries')
            .select('id, entry_number')
            .eq('reference_id', request.deliveryId)
            .eq('reference_type', 'delivery')
            .eq('status', 'posted')
            .order('created_at', { ascending: false })
            .limit(1)

          const existingJournal = Array.isArray(existingJournalRaw) ? existingJournalRaw[0] : existingJournalRaw

          if (existingJournal) {
            console.log('📝 Updating delivery journal:', existingJournal.entry_number)

            // Get branch ID from delivery
            const branchId = deliveryData.branch_id

            // Get account IDs
            const hutangBDAccount = await supabase.from('accounts').select('id').eq('branch_id', branchId).eq('code', '2140').limit(1)
            const persediaanAccount = await supabase.from('accounts').select('id').eq('branch_id', branchId).eq('code', '1310').limit(1)

            const hutangBDId = hutangBDAccount.data?.[0]?.id
            const persediaanId = persediaanAccount.data?.[0]?.id

            if (hutangBDId && persediaanId) {
              // Calculate new total HPP based on updated quantities
              let newTotalHPP = 0
              const updatedItems = request.items || []

              for (const item of updatedItems) {
                const originalItem = deliveryData.items?.find((i: any) => i.id === item.id)
                if (originalItem) {
                  // Get product HPP
                  const { data: productRaw } = await supabase
                    .from('products')
                    .select('cost_price, base_price')
                    .eq('id', originalItem.product_id)
                    .limit(1)
                  const product = Array.isArray(productRaw) ? productRaw[0] : productRaw
                  const hppPerUnit = product?.cost_price || product?.base_price || 0
                  newTotalHPP += hppPerUnit * item.quantityDelivered
                }
              }

              if (newTotalHPP > 0) {
                // Delete existing journal lines
                await supabase.from('journal_entry_lines').delete().eq('journal_entry_id', existingJournal.id)

                // Insert new journal lines
                const newLines = [
                  {
                    journal_entry_id: existingJournal.id,
                    account_id: hutangBDId,
                    debit_amount: newTotalHPP,
                    credit_amount: 0,
                    description: 'Hutang barang dagang terbayar (edit)',
                    line_number: 1
                  },
                  {
                    journal_entry_id: existingJournal.id,
                    account_id: persediaanId,
                    debit_amount: 0,
                    credit_amount: newTotalHPP,
                    description: 'Pengurangan persediaan (edit)',
                    line_number: 2
                  }
                ]

                await supabase.from('journal_entry_lines').insert(newLines)
                console.log('✅ Delivery journal updated, new HPP:', newTotalHPP)
              }
            }
          }
        } catch (journalError) {
          console.error('Error updating delivery journal:', journalError)
          // Don't fail the update if journal update fails
        }
      }

      console.log('✅ Delivery updated successfully:', request.deliveryId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions-ready-for-delivery'] })
      queryClient.invalidateQueries({ queryKey: ['transaction-delivery-info'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['delivery-history'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] })
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] })
    },
  })

  return {
    createDelivery,
    deleteDelivery,
    updateDelivery,
  }
}

// Fetch all delivery history for admin/owner
export function useDeliveryHistory() {
  const { currentBranch } = useBranch();

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