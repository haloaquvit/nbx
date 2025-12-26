import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Product } from '@/types/product'
import { supabase } from '@/integrations/supabase/client'
import { logError, logDebug } from '@/utils/debugUtils'
import { useBranch } from '@/contexts/BranchContext'

// DB to App mapping
const fromDb = (dbProduct: any): Product => ({
  id: dbProduct.id,
  name: dbProduct.name,
  type: dbProduct.type || 'Produksi', // Use type from database or default
  basePrice: Number(dbProduct.base_price) || 0,
  costPrice: dbProduct.cost_price ? Number(dbProduct.cost_price) : undefined, // Harga pokok untuk Jual Langsung
  unit: dbProduct.unit || 'pcs',
  initialStock: Number(dbProduct.initial_stock || 0), // Stock awal untuk balancing
  currentStock: Number(dbProduct.current_stock || 0),
  minStock: Number(dbProduct.min_stock || 0),
  minOrder: Number(dbProduct.min_order) || 1,
  description: dbProduct.description || '',
  specifications: dbProduct.specifications || [],
  materials: dbProduct.materials || [],
  createdAt: new Date(dbProduct.created_at),
  updatedAt: new Date(dbProduct.updated_at),
});

// App to DB mapping - only include columns that exist in the database
const toDb = (appProduct: Partial<Product>) => {
  const { id, createdAt, updatedAt, basePrice, costPrice, minOrder, initialStock, currentStock, minStock, ...rest } = appProduct;
  const dbData: any = { ...rest };
  if (basePrice !== undefined) dbData.base_price = basePrice;
  if (costPrice !== undefined) dbData.cost_price = costPrice;
  if (minOrder !== undefined) dbData.min_order = minOrder;
  if (initialStock !== undefined) dbData.initial_stock = initialStock;
  if (currentStock !== undefined) dbData.current_stock = currentStock;
  if (minStock !== undefined) dbData.min_stock = minStock;

  // Don't send category since it's not used in the system
  // Remove category from the data to avoid constraint issues
  delete dbData.category;

  return dbData;
};


export const useProducts = () => {
  const queryClient = useQueryClient();
  const { currentBranch, canAccessAllBranches } = useBranch();

  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ['products', currentBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('products')
        .select('*')
        .order('name', { ascending: true });

      // Apply branch filter - ALWAYS filter by selected branch
      if (currentBranch?.id) {
        query = query.eq('branch_id', currentBranch.id);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data ? data.map(fromDb) : [];
    },
    enabled: !!currentBranch, // Only run when branch is loaded
    // Optimized for high-frequency POS usage
    staleTime: 10 * 60 * 1000, // 10 minutes - products don't change frequently
    gcTime: 15 * 60 * 1000, // 15 minutes cache
    refetchOnWindowFocus: false, // Critical: don't refetch on POS window focus
    refetchOnReconnect: false, // Don't refetch on reconnect
    retry: 1, // Only retry once
    retryDelay: 1000,
  })

  const upsertProduct = useMutation({
    mutationFn: async (product: Partial<Product>): Promise<Product> => {
      const dbData = toDb(product);
      
      logDebug('Product Upsert', { originalProduct: product, dbData });
      
      // Handle insert vs update
      if (product.id) {
        // Update existing product
        logDebug('Product Update', { id: product.id, updateData: dbData });
        
        // Use .order().limit(1) - PostgREST requires explicit order when using limit
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
        return fromDb(data);
      } else {
        // Insert new product - let database generate UUID automatically
        // Jika currentStock tidak di-set, gunakan initialStock sebagai nilai awal
        const insertData = {
          ...dbData,
          branch_id: currentBranch?.id || null,
          current_stock: dbData.current_stock || dbData.initial_stock || 0,
        };

        logDebug('Product Insert', { insertData });

        // Use .order().limit(1) - PostgREST requires explicit order when using limit
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
        return fromDb(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    }
  });

  const updateStock = useMutation({
    mutationFn: async ({ productId, newStock }: { productId: string, newStock: number }): Promise<Product> => {
      // Use .order().limit(1) - PostgREST requires explicit order when using limit
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
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    }
  });

  // Listen for production completion events to refresh products
  useEffect(() => {
    const handleProductionComplete = () => {
      console.log('Production completed, refreshing products...');
      queryClient.invalidateQueries({ queryKey: ['products'] });
    };

    window.addEventListener('production-completed', handleProductionComplete);
    return () => {
      window.removeEventListener('production-completed', handleProductionComplete);
    };
  }, [queryClient]);

  return {
    products,
    isLoading,
    upsertProduct,
    updateStock,
    deleteProduct,
  }
}