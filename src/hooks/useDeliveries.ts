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
import { googleDriveService } from '@/services/googleDriveService'

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
  return useQuery({
    queryKey: ['transactions-ready-for-delivery'],
    queryFn: async (): Promise<TransactionDeliveryInfo[]> => {
      // Get transactions that are ready for delivery (simplified approach without custom functions)
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('*')
        .in('status', ['Siap Antar', 'Diantar Sebagian'])
        .neq('is_office_sale', true)
        .order('order_date', { ascending: true })
      
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
            photoDriveId: d.photo_drive_id,
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
          const transactionItems = transaction.items || []
          for (const item of transactionItems) {
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

            // Calculate delivered quantity for this product
            let deliveredQuantity = 0
            for (const delivery of deliveries) {
              for (const deliveryItem of delivery.items) {
                if (deliveryItem.productId === productId) {
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
  })
}

// Fetch delivery details for a specific transaction
export function useTransactionDeliveryInfo(transactionId: string) {
  return useQuery({
    queryKey: ['transaction-delivery-info', transactionId],
    queryFn: async (): Promise<TransactionDeliveryInfo | null> => {
      // Get transaction details
      const { data: transactionData, error: transactionError } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', transactionId)
        .single()

      if (transactionError) throw transactionError
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
        photoDriveId: d.photo_drive_id,
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
      const transactionItems = transactionData.items || []
      for (const item of transactionItems) {
        const productId = item.product?.id
        
        // Skip items without valid product ID
        if (!productId) {
          console.warn('[useTransactionDeliveryInfo] Skipping item without product ID:', item)
          continue
        }
        
        const productName = item.product?.name || 'Unknown'
        const orderedQuantity = item.quantity || 0
        const unit = item.unit || 'pcs'
        const width = item.width
        const height = item.height

        // Calculate delivered quantity for this product
        let deliveredQuantity = 0
        for (const delivery of deliveries) {
          for (const deliveryItem of delivery.items) {
            if (deliveryItem.productId === productId) {
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
  })
}

// Create new delivery
export function useDeliveries() {
  const queryClient = useQueryClient()

  const createDelivery = useMutation({
    mutationFn: async (request: CreateDeliveryRequest): Promise<Delivery> => {
      /* DELIVERY FUNCTIONALITY RESTORED - REMOVE COMMENT WHEN READY */
      let photoUrl: string | undefined
      let photoDriveId: string | undefined

      // Upload photo to Google Drive if provided
      if (request.photo) {
        try {
          const uploadResult = await googleDriveService.uploadFile(
            request.photo,
            `delivery-${request.transactionId}-${Date.now()}.jpg`,
            'delivery-photos'
          )
          photoUrl = uploadResult.webViewLink
          photoDriveId = uploadResult.id
        } catch (error) {
          console.error('Failed to upload photo to Google Drive:', error)
          // Continue without photo rather than failing the entire delivery
        }
      }

      // Get customer name and address from transaction
      const { data: transactionData, error: transactionError } = await supabase
        .from('transactions')
        .select('customer_name, customer_id, customers(address, phone)')
        .eq('id', request.transactionId)
        .single()

      if (transactionError) {
        console.error('[useDeliveries] Transaction fetch error:', transactionError)
        
        // Handle network connection issues
        if (transactionError.message?.includes('Failed to fetch') || 
            transactionError.message?.includes('ERR_CONNECTION_CLOSED')) {
          throw new Error('Koneksi internet bermasalah. Silakan periksa koneksi dan coba lagi.')
        }
        
        throw new Error(`Tidak dapat mengambil data transaksi: ${transactionError.message}`)
      }

      // Create delivery record (handle table not existing gracefully)
      const { data: deliveryData, error: deliveryError } = await supabase
        .from('deliveries')
        .insert({
          transaction_id: request.transactionId,
          customer_name: transactionData?.customer_name || '',
          customer_address: transactionData?.customers?.address || '',
          customer_phone: transactionData?.customers?.phone || '',
          delivery_date: request.deliveryDate.toISOString(),
          photo_url: photoUrl,
          photo_drive_id: photoDriveId,
          notes: request.notes,
          driver_id: request.driverId,
          helper_id: request.helperId,
        })
        .select()
        .single()

      if (deliveryError) {
        console.error('[useDeliveries] Delivery creation error:', deliveryError)
        console.error('[useDeliveries] Insert data was:', {
          transaction_id: request.transactionId,
          customer_name: transactionData?.customer_name || '',
          customer_address: transactionData?.customers?.address || '',
          customer_phone: transactionData?.customers?.phone || '',
          delivery_date: request.deliveryDate.toISOString(),
          photo_url: photoUrl,
          photo_drive_id: photoDriveId,
          notes: request.notes,
          driver_id: request.driverId,
          helper_id: request.helperId,
        })
        
        if (deliveryError.message.includes('relation "deliveries" does not exist')) {
          throw new Error('Tabel pengantaran belum tersedia. Silakan jalankan database migration terlebih dahulu.')
        }
        
        if (deliveryError.code === '23505' && deliveryError.message.includes('deliveries_delivery_number_key')) {
          throw new Error('Terjadi konflik nomor pengantaran. Silakan coba lagi dalam beberapa saat.')
        }
        
        throw new Error(`Database error: ${deliveryError.message}`)
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
          console.warn('[useDeliveries] Invalid product IDs found, will skip these items:', invalidProductIds)
          // Instead of failing completely, we'll filter out invalid products and continue
          // This handles cases where transaction items reference deleted/invalid products
          
          // We'll let the component handle user notification by checking the result
          // Store invalid product info for user notification
          (deliveryData as any)._invalidProductIds = invalidProductIds
        }
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
          photoDriveId: deliveryData.photo_drive_id,
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
          .select()

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

      // Process stock movements now that items are actually delivered
      // This is where stock movements should happen according to user request
      try {
        const { StockService } = await import('@/services/stockService')
        const { data: userData } = await supabase.auth.getUser()
        
        if (userData?.user) {
          // Get user profile for stock movement records
          const { data: profileData } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', userData.user.id)
            .single()
          
          // Fetch actual product data for accurate stock processing
          const productIds = request.items.map(item => item.productId)
          const { data: productsData } = await supabase
            .from('products')
            .select('id, name, type, current_stock')
            .in('id', productIds)

          // Create transaction items format for stock processing
          const transactionItems = request.items.map(item => {
            const productData = productsData?.find(p => p.id === item.productId)
            return {
              product: {
                id: item.productId,
                name: item.productName,
                type: productData?.type || 'Stock',
                currentStock: productData?.current_stock || 0,
              },
              quantity: item.quantityDelivered, // Use delivered quantity, not ordered quantity
              notes: `Delivered via delivery ${deliveryData.delivery_number}`,
            }
          })

          // Process stock movements for the delivered items
          await StockService.processTransactionStock(
            deliveryData.id, // Use delivery ID as reference
            transactionItems,
            userData.user.id,
            profileData?.full_name || 'Unknown User',
            'delivery' // Specify this is a delivery, not a transaction
          )
        }
      } catch (stockError) {
        console.error('Failed to process stock movements for delivery:', stockError)
        // Don't fail the delivery creation if stock movements fail
        // This maintains the delivery functionality while adding stock tracking
      }

      // Return complete delivery object
      const result = {
        id: deliveryData.id,
        transactionId: deliveryData.transaction_id,
        deliveryNumber: deliveryData.delivery_number,
        deliveryDate: new Date(deliveryData.delivery_date),
        photoUrl: deliveryData.photo_url,
        photoDriveId: deliveryData.photo_drive_id,
        notes: deliveryData.notes,
        driverId: deliveryData.driver_id,
        helperId: deliveryData.helper_id,
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
          createdAt: new Date(item.created_at),
        })),
        createdAt: new Date(deliveryData.created_at),
        updatedAt: new Date(deliveryData.updated_at),
      } as any;
      
      // Add invalid product info if it exists
      if ((deliveryData as any)._invalidProductIds) {
        result._invalidProductIds = (deliveryData as any)._invalidProductIds;
      }
      
      return result;
    },
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['transactions-ready-for-delivery'] })
      queryClient.invalidateQueries({ queryKey: ['transaction-delivery-info'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
  })

  return {
    createDelivery,
  }
}