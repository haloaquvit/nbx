import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Product } from '@/types/product'
import { supabase } from '@/integrations/supabase/client'
import { logError, logDebug } from '@/utils/debugUtils'

// DB to App mapping
const fromDb = (dbProduct: any): Product => ({
  id: dbProduct.id,
  name: dbProduct.name,
  category: dbProduct.category,
  type: dbProduct.type || 'Stock',
  basePrice: Number(dbProduct.base_price) || 0,
  unit: dbProduct.unit || 'pcs',
  currentStock: Number(dbProduct.current_stock) || 0,
  minStock: Number(dbProduct.min_stock) || 0,
  minOrder: Number(dbProduct.min_order) || 1,
  description: dbProduct.description || '',
  specifications: dbProduct.specifications || [],
  materials: dbProduct.materials || [],
  createdAt: new Date(dbProduct.created_at),
  updatedAt: new Date(dbProduct.updated_at),
});

// App to DB mapping
const toDb = (appProduct: Partial<Product>) => {
  const { id, createdAt, updatedAt, basePrice, minOrder, currentStock, minStock, ...rest } = appProduct;
  const dbData: any = { ...rest };
  if (basePrice !== undefined) dbData.base_price = basePrice;
  if (minOrder !== undefined) dbData.min_order = minOrder;
  if (currentStock !== undefined) dbData.current_stock = currentStock;
  if (minStock !== undefined) dbData.min_stock = minStock;
  return dbData;
};


export const useProducts = () => {
  const queryClient = useQueryClient();

  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw new Error(error.message);
      return data ? data.map(fromDb) : [];
    }
  })

  const upsertProduct = useMutation({
    mutationFn: async (product: Partial<Product>): Promise<Product> => {
      const dbData = toDb(product);
      
      logDebug('Product Upsert', { originalProduct: product, dbData });
      
      // Handle insert vs update
      if (product.id) {
        // Update existing product
        logDebug('Product Update', { id: product.id, updateData: dbData });
        
        const { data, error } = await supabase
          .from('products')
          .update(dbData)
          .eq('id', product.id)
          .select()
          .single();
          
        if (error) {
          logError('Product Update', error);
          throw new Error(`Update failed: ${error.message}${error.details ? ` - ${error.details}` : ''}${error.hint ? ` (${error.hint})` : ''}`);
        }
        
        logDebug('Product Update Success', data);
        return fromDb(data);
      } else {
        // Insert new product - let database generate UUID automatically
        const insertData = { ...dbData };
        
        logDebug('Product Insert', { insertData });
        
        const { data, error } = await supabase
          .from('products')
          .insert(insertData)
          .select()
          .single();
          
        if (error) {
          logError('Product Insert', error);
          throw new Error(`Insert failed: ${error.message}${error.details ? ` - ${error.details}` : ''}${error.hint ? ` (${error.hint})` : ''}`);
        }
        
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
      const { data, error } = await supabase
        .from('products')
        .update({ current_stock: newStock })
        .eq('id', productId)
        .select()
        .single();
      if (error) throw new Error(error.message);
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

  return {
    products,
    isLoading,
    upsertProduct,
    updateStock,
    deleteProduct,
  }
}