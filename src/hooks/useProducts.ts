import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Product } from '@/types/product'
import { supabase } from '@/integrations/supabase/client'
import { logError, logDebug } from '@/utils/debugUtils'
import { useBranch } from '@/contexts/BranchContext'
import { createProductStockAdjustmentJournal } from '@/services/journalService'

// Calculate BOM cost for a product (HPP dari materials)
export const calculateBOMCost = async (productId: string): Promise<number> => {
  const { data: bomItems, error } = await supabase
    .from('product_materials')
    .select(`
      quantity,
      materials (price_per_unit)
    `)
    .eq('product_id', productId);

  if (error || !bomItems || bomItems.length === 0) return 0;

  return bomItems.reduce((total, item: any) => {
    const unitPrice = item.materials?.price_per_unit || 0;
    return total + (unitPrice * item.quantity);
  }, 0);
};

// Update product cost_price from BOM calculation
export const updateProductCostFromBOM = async (productId: string): Promise<number> => {
  const totalCost = await calculateBOMCost(productId);

  await supabase
    .from('products')
    .update({ cost_price: totalCost })
    .eq('id', productId);

  return totalCost;
};

// DB to App mapping
const fromDb = (dbProduct: any): Product => ({
  id: dbProduct.id,
  name: dbProduct.name,
  type: dbProduct.type || 'Produksi',
  basePrice: Number(dbProduct.base_price) || 0,
  costPrice: dbProduct.cost_price ? Number(dbProduct.cost_price) : undefined,
  unit: dbProduct.unit || 'pcs',
  initialStock: Number(dbProduct.initial_stock || 0),
  currentStock: Number(dbProduct.current_stock || 0),
  minStock: Number(dbProduct.min_stock || 0),
  minOrder: Number(dbProduct.min_order) || 1,
  description: dbProduct.description || '',
  specifications: dbProduct.specifications || [],
  materials: dbProduct.materials || [],
  createdAt: new Date(dbProduct.created_at),
  updatedAt: new Date(dbProduct.updated_at),
});

// App to DB mapping
const toDb = (appProduct: Partial<Product>) => {
  const { id, createdAt, updatedAt, basePrice, costPrice, minOrder, initialStock, currentStock, minStock, ...rest } = appProduct;
  const dbData: any = { ...rest };
  if (basePrice !== undefined) dbData.base_price = basePrice;
  if (costPrice !== undefined) dbData.cost_price = costPrice;
  if (minOrder !== undefined) dbData.min_order = minOrder;
  if (initialStock !== undefined) dbData.initial_stock = initialStock;
  if (currentStock !== undefined) dbData.current_stock = currentStock;
  if (minStock !== undefined) dbData.min_stock = minStock;
  delete dbData.category;
  return dbData;
};

export const useProducts = () => {
  const queryClient = useQueryClient();
  const { currentBranch, canAccessAllBranches } = useBranch();

  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ['products', currentBranch?.id],
    queryFn: async () => {
      // Fetch products
      let query = supabase.from('products').select('*').order('name', { ascending: true });
      if (currentBranch?.id) query = query.eq('branch_id', currentBranch.id);
      const { data, error } = await query;
      if (error) throw new Error(error.message);

      // Fetch actual stock from v_product_current_stock VIEW
      let stockQuery = supabase.from('v_product_current_stock').select('product_id, current_stock');
      if (currentBranch?.id) stockQuery = stockQuery.eq('branch_id', currentBranch.id);
      const { data: stockData } = await stockQuery;

      // Create stock map for quick lookup
      const stockMap = new Map<string, number>();
      if (stockData) {
        stockData.forEach((s: any) => stockMap.set(s.product_id, Number(s.current_stock) || 0));
      }

      // Map products with actual stock from VIEW
      return data ? data.map(p => {
        const product = fromDb(p);
        // Override current_stock with value from VIEW (source of truth)
        product.currentStock = stockMap.get(p.id) ?? product.currentStock;
        return product;
      }) : [];
    },
    enabled: !!currentBranch,
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    retryDelay: 1000,
  })

  const upsertProduct = useMutation({
    mutationFn: async (product: Partial<Product>): Promise<Product> => {
      const dbData = toDb(product);
      logDebug('Product Upsert', { originalProduct: product, dbData });

      if (product.id) {
        logDebug('Product Update', { id: product.id, updateData: dbData });

        const { data: currentProduct } = await supabase
          .from('products')
          .select('current_stock, initial_stock, cost_price')
          .eq('id', product.id)
          .order('id')
          .limit(1);

        const existing = Array.isArray(currentProduct) ? currentProduct[0] : currentProduct;
        const oldInitialStock = Number(existing?.initial_stock) || 0;
        const oldCurrentStock = Number(existing?.current_stock) || 0;

        // ============================================================================
        // products.current_stock is DEPRECATED - stok dihitung dari v_product_current_stock
        // Stock hanya di-track via inventory_batches (source of truth untuk FIFO HPP)
        // Perubahan initial_stock akan update inventory_batches di bawah
        // ============================================================================
        console.log('[Product Update] Stock managed via inventory_batches, not current_stock');

        // Remove current_stock from update to prevent confusion
        delete dbData.current_stock;

        const { data: dataRaw, error } = await supabase
          .from('products')
          .update(dbData)
          .eq('id', product.id)
          .select()
          .order('id')
          .limit(1);

        if (error) {
          logError('Product Update', error);
          throw new Error(`Update failed: ${error.message}${error.details ? ` - ${error.details}` : ''}${error.hint ? ` (${error.hint})` : ''}`);
        }

        const data = Array.isArray(dataRaw) ? dataRaw[0] : dataRaw;
        if (!data) throw new Error('Failed to update product');
        logDebug('Product Update Success', data);

        // Create/update inventory batch for FIFO HPP calculation
        const newInitialStock = dbData.initial_stock !== undefined ? dbData.initial_stock : oldInitialStock;
        const newCostPrice = dbData.cost_price || existing?.cost_price || 0;

        // AUTO-JOURNAL: Create adjustment journal when initial_stock changes
        if (dbData.initial_stock !== undefined && existing && currentBranch?.id) {
          const stockDiff = Number(dbData.initial_stock) - oldInitialStock;
          if (stockDiff !== 0) {
            // Use costPrice or 0 - journal will be created even if costPrice = 0 (with warning)
            const effectiveCostPrice = newCostPrice || 0;
            if (effectiveCostPrice === 0) {
              console.warn('⚠️ Creating stock journal with HPP = 0. Jurnal tetap dibuat tapi nilai = 0.');
            }
            const journalResult = await createProductStockAdjustmentJournal({
              productId: product.id!,
              productName: product.name || data.name || 'Unknown Product',
              oldStock: oldInitialStock,
              newStock: Number(dbData.initial_stock),
              costPrice: effectiveCostPrice,
              branchId: currentBranch.id,
            });
            if (journalResult.success) {
              logDebug('Auto-generated stock adjustment journal', { journalId: journalResult.journalId });
            } else {
              console.warn('Failed to create stock adjustment journal:', journalResult.error);
            }
          }
        }

        // Update batch "Stok Awal" - initial_stock adalah nilai awal yang ditambahkan ke total
        // Rumus: Stock = Initial Stock + PO + Produksi - Keluar - Penjualan
        if (dbData.initial_stock !== undefined) {
          // Cari batch "Stok Awal" yang ada
          const { data: existingBatch } = await supabase
            .from('inventory_batches')
            .select('id, initial_quantity, remaining_quantity')
            .eq('product_id', product.id)
            .eq('notes', 'Stok Awal')
            .order('batch_date')
            .limit(1);

          const batch = Array.isArray(existingBatch) ? existingBatch[0] : existingBatch;

          if (batch) {
            // Update batch yang ada: sesuaikan remaining berdasarkan perubahan initial
            const oldInitial = Number(batch.initial_quantity) || 0;
            const qtyDiff = newInitialStock - oldInitial;
            const newRemaining = (batch.remaining_quantity || 0) + qtyDiff;

            await supabase.from('inventory_batches').update({
              initial_quantity: newInitialStock,
              remaining_quantity: newRemaining,
              unit_cost: newCostPrice,
              updated_at: new Date().toISOString()
            }).eq('id', batch.id);

            logDebug('Updated Stok Awal batch', {
              batchId: batch.id,
              oldInitial,
              newInitialStock,
              qtyDiff,
              oldRemaining: batch.remaining_quantity,
              newRemaining
            });
          } else if (newInitialStock > 0) {
            // Buat batch baru jika belum ada
            await supabase.from('inventory_batches').insert({
              product_id: product.id,
              branch_id: currentBranch?.id || null,
              initial_quantity: newInitialStock,
              remaining_quantity: newInitialStock,
              unit_cost: newCostPrice,
              notes: 'Stok Awal'
            });
            logDebug('Created Stok Awal batch', { productId: product.id, initialStock: newInitialStock, costPrice: newCostPrice });
          }
        }

        return fromDb(data);
      } else {
        // ============================================================================
        // products.current_stock is DEPRECATED - stok dihitung dari v_product_current_stock
        // Stock hanya di-track via inventory_batches (dibuat di bawah setelah insert)
        // ============================================================================
        const insertData = {
          ...dbData,
          branch_id: currentBranch?.id || null,
        };
        delete insertData.current_stock; // Don't set current_stock, use inventory_batches
        logDebug('Product Insert', { insertData });

        const { data: dataRaw, error } = await supabase
          .from('products')
          .insert(insertData)
          .select()
          .order('id')
          .limit(1);

        if (error) {
          logError('Product Insert', error);
          throw new Error(`Insert failed: ${error.message}${error.details ? ` - ${error.details}` : ''}${error.hint ? ` (${error.hint})` : ''}`);
        }

        const data = Array.isArray(dataRaw) ? dataRaw[0] : dataRaw;
        if (!data) throw new Error('Failed to insert product');
        logDebug('Product Insert Success', data);

        // Create inventory batch for new product
        const initialStock = dbData.initial_stock || 0;
        const costPrice = dbData.cost_price || 0;

        if (initialStock > 0 && costPrice > 0) {
          await supabase.from('inventory_batches').insert({
            product_id: data.id,
            branch_id: currentBranch?.id || null,
            initial_quantity: initialStock,
            remaining_quantity: initialStock,
            unit_cost: costPrice,
            notes: 'Stok Awal'
          });
          logDebug('Created inventory batch for new product HPP', { productId: data.id, initialStock, costPrice });
        }

        return fromDb(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    }
  });

  // ============================================================================
  // DEPRECATED: updateStock - products.current_stock tidak lagi digunakan
  // Stock dihitung dari v_product_current_stock (sum inventory_batches.remaining_quantity)
  // Gunakan inventory_batches untuk track stock secara FIFO
  // ============================================================================
  const updateStock = useMutation({
    mutationFn: async ({ productId, newStock }: { productId: string, newStock: number }): Promise<Product> => {
      console.warn('⚠️ updateStock is DEPRECATED - stock should be managed via inventory_batches');
      // Return current product without update
      const { data: dataRaw, error } = await supabase
        .from('products')
        .select()
        .eq('id', productId)
        .order('id')
        .limit(1);
      if (error) throw new Error(error.message);
      const data = Array.isArray(dataRaw) ? dataRaw[0] : dataRaw;
      if (!data) throw new Error('Product not found');
      return fromDb(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    }
  });

  const deleteProduct = useMutation({
    mutationFn: async (productId: string): Promise<void> => {
      const { error } = await supabase.from('products').delete().eq('id', productId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    }
  });

  useEffect(() => {
    const handleProductionComplete = () => {
      console.log('Production completed, refreshing products...');
      queryClient.invalidateQueries({ queryKey: ['products'] });
    };
    window.addEventListener('production-completed', handleProductionComplete);
    return () => window.removeEventListener('production-completed', handleProductionComplete);
  }, [queryClient]);

  return { products, isLoading, upsertProduct, updateStock, deleteProduct }
}
