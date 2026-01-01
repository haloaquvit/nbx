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
      let query = supabase.from('products').select('*').order('name', { ascending: true });
      if (currentBranch?.id) query = query.eq('branch_id', currentBranch.id);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data ? data.map(fromDb) : [];
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

        console.log('[Product Update] Stock check:', {
          'product.initialStock': product.initialStock,
          'dbData.initial_stock': dbData.initial_stock,
          oldInitialStock,
          oldCurrentStock,
          existing
        });

        // Always recalculate current_stock when initial_stock is provided (even if 0)
        if (dbData.initial_stock !== undefined && existing) {
          const newInitialStock = Number(dbData.initial_stock);
          const stockDiff = newInitialStock - oldInitialStock;

          if (stockDiff !== 0) {
            // Add the difference to current_stock
            // Example: oldInitial=10, oldCurrent=8 (sold 2), newInitial=15
            // stockDiff = 15-10 = 5, newCurrent = 8+5 = 13
            dbData.current_stock = oldCurrentStock + stockDiff;
            logDebug('Adjusting current_stock based on initial_stock change', {
              oldInitialStock,
              newInitialStock,
              oldCurrentStock,
              stockDiff,
              newCurrentStock: dbData.current_stock
            });
          }
        }

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
          if (stockDiff !== 0 && newCostPrice > 0) {
            const journalResult = await createProductStockAdjustmentJournal({
              productId: product.id!,
              productName: product.name || data.name || 'Unknown Product',
              oldStock: oldInitialStock,
              newStock: Number(dbData.initial_stock),
              costPrice: newCostPrice,
              branchId: currentBranch.id,
            });
            if (journalResult.success) {
              logDebug('Auto-generated stock adjustment journal', { journalId: journalResult.journalId });
            } else {
              console.warn('Failed to create stock adjustment journal:', journalResult.error);
            }
          }
        }

        if (newInitialStock > 0 && newCostPrice > 0) {
          const { data: existingBatch } = await supabase
            .from('inventory_batches')
            .select('id, initial_quantity, remaining_quantity')
            .eq('product_id', product.id)
            .eq('notes', 'Stok Awal')
            .order('batch_date')
            .limit(1);

          const batch = Array.isArray(existingBatch) ? existingBatch[0] : existingBatch;

          if (batch) {
            const qtyDiff = newInitialStock - oldInitialStock;
            const newRemaining = Math.max(0, (batch.remaining_quantity || 0) + qtyDiff);
            await supabase.from('inventory_batches').update({
              initial_quantity: newInitialStock,
              remaining_quantity: newRemaining,
              unit_cost: newCostPrice,
              updated_at: new Date().toISOString()
            }).eq('id', batch.id);
            logDebug('Updated inventory batch for HPP', { batchId: batch.id, newInitialStock, newRemaining, newCostPrice });
          } else {
            await supabase.from('inventory_batches').insert({
              product_id: product.id,
              branch_id: currentBranch?.id || null,
              initial_quantity: newInitialStock,
              remaining_quantity: newInitialStock,
              unit_cost: newCostPrice,
              notes: 'Stok Awal'
            });
            logDebug('Created inventory batch for HPP', { productId: product.id, initialStock: newInitialStock, costPrice: newCostPrice });
          }
        }

        return fromDb(data);
      } else {
        const insertData = {
          ...dbData,
          branch_id: currentBranch?.id || null,
          current_stock: dbData.current_stock || dbData.initial_stock || 0,
        };
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

  const updateStock = useMutation({
    mutationFn: async ({ productId, newStock }: { productId: string, newStock: number }): Promise<Product> => {
      const { data: dataRaw, error } = await supabase
        .from('products')
        .update({ current_stock: newStock })
        .eq('id', productId)
        .select()
        .order('id')
        .limit(1);
      if (error) throw new Error(error.message);
      const data = Array.isArray(dataRaw) ? dataRaw[0] : dataRaw;
      if (!data) throw new Error('Failed to update stock');
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
