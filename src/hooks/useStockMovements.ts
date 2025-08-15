import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { StockMovement, CreateStockMovementData, StockConsumptionReport } from '@/types/stockMovement'
import { supabase } from '@/integrations/supabase/client'
import { startOfMonth, endOfMonth } from 'date-fns'

// Helper to map from DB (snake_case) to App (camelCase)
const fromDbToApp = (dbMovement: any): StockMovement => ({
  id: dbMovement.id,
  productId: dbMovement.product_id,
  productName: dbMovement.product_name,
  type: dbMovement.type,
  reason: dbMovement.reason,
  quantity: Number(dbMovement.quantity),
  previousStock: Number(dbMovement.previous_stock),
  newStock: Number(dbMovement.new_stock),
  notes: dbMovement.notes,
  referenceId: dbMovement.reference_id,
  referenceType: dbMovement.reference_type,
  userId: dbMovement.user_id,
  userName: dbMovement.user_name,
  createdAt: new Date(dbMovement.created_at),
});

// Helper to map from App (camelCase) to DB (snake_case)
const fromAppToDb = (appMovement: CreateStockMovementData) => ({
  product_id: appMovement.productId,
  product_name: appMovement.productName,
  type: appMovement.type,
  reason: appMovement.reason,
  quantity: appMovement.quantity,
  previous_stock: appMovement.previousStock,
  new_stock: appMovement.newStock,
  notes: appMovement.notes,
  reference_id: appMovement.referenceId,
  reference_type: appMovement.referenceType,
  user_id: appMovement.userId,
  user_name: appMovement.userName,
});

export const useStockMovements = () => {
  const queryClient = useQueryClient()

  const { data: movements, isLoading } = useQuery({
    queryKey: ['stockMovements'],
    queryFn: async (): Promise<StockMovement[]> => {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching stock movements:', error);
        // If table doesn't exist, return empty array instead of throwing
        if (error.code === '42P01') {
          console.warn('stock_movements table does not exist, returning empty array');
          return [];
        }
        throw new Error(error.message);
      }
      return data ? data.map(fromDbToApp) : [];
    }
  });

  const createStockMovement = useMutation({
    mutationFn: async (movementData: CreateStockMovementData): Promise<StockMovement> => {
      const dbData = fromAppToDb(movementData);
      const { data, error } = await supabase
        .from('stock_movements')
        .insert(dbData)
        .select()
        .single();
      
      if (error) {
        console.error('Error creating stock movement:', error);
        throw new Error(error.message);
      }
      return fromDbToApp(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockMovements'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const getMovementsByProduct = async (productId: string): Promise<StockMovement[]> => {
    const { data, error } = await supabase
      .from('stock_movements')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data ? data.map(fromDbToApp) : [];
  };

  const getMovementsByDateRange = async (from: Date, to: Date): Promise<StockMovement[]> => {
    const { data, error } = await supabase
      .from('stock_movements')
      .select('*')
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString())
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data ? data.map(fromDbToApp) : [];
  };

  const getMonthlyConsumptionReport = async (year: number, month: number): Promise<StockConsumptionReport[]> => {
    const startDate = startOfMonth(new Date(year, month - 1));
    const endDate = endOfMonth(new Date(year, month - 1));

    // Get all movements for the month
    const movements = await getMovementsByDateRange(startDate, endDate);

    // Get all products
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, type, unit, current_stock');

    if (productsError) throw new Error(productsError.message);

    // Group movements by product
    const productMovements = movements.reduce((acc, movement) => {
      if (!acc[movement.productId]) {
        acc[movement.productId] = [];
      }
      acc[movement.productId].push(movement);
      return acc;
    }, {} as Record<string, StockMovement[]>);

    // Create report for each product that had movements
    const reports: StockConsumptionReport[] = [];

    for (const product of products || []) {
      const productMovs = productMovements[product.id] || [];
      
      if (productMovs.length > 0 || product.type !== 'Jasa') {
        const totalIn = productMovs
          .filter(m => m.type === 'IN')
          .reduce((sum, m) => sum + m.quantity, 0);
          
        const totalOut = productMovs
          .filter(m => m.type === 'OUT')
          .reduce((sum, m) => sum + m.quantity, 0);

        const netMovement = totalIn - totalOut;
        const endingStock = Number(product.current_stock) || 0;
        const startingStock = endingStock - netMovement;

        reports.push({
          productId: product.id,
          productName: product.name,
          productType: product.type || 'Stock',
          unit: product.unit || 'pcs',
          totalIn,
          totalOut,
          netMovement,
          startingStock,
          endingStock,
          movements: productMovs
        });
      }
    }

    return reports.sort((a, b) => a.productName.localeCompare(b.productName));
  };

  return {
    movements,
    isLoading,
    createStockMovement,
    getMovementsByProduct,
    getMovementsByDateRange,
    getMonthlyConsumptionReport,
  }
}