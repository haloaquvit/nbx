import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranch } from '@/contexts/BranchContext';
import { useAuth } from './useAuth';
import { consumeStockFIFO, restoreStockFIFO } from '@/services/stockService';

export interface ProductStockMovement {
  id: string;
  productId: string;
  productName?: string;
  branchId?: string;
  type: 'IN' | 'OUT';
  reason: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  referenceId?: string;
  referenceType?: string;
  notes?: string;
  userId?: string;
  userName?: string;
  createdAt: Date;
}

export interface CreateStockOutData {
  productId: string;
  quantity: number;
  reason: string;
  notes?: string;
}

// Reason options for stock out
export const STOCK_OUT_REASONS = [
  { value: 'DAMAGED', label: 'Barang Rusak' },
  { value: 'EXPIRED', label: 'Kadaluarsa' },
  { value: 'LOST', label: 'Hilang' },
  { value: 'SAMPLE', label: 'Sample/Contoh' },
  { value: 'GIFT', label: 'Hadiah/Bonus' },
  { value: 'INTERNAL_USE', label: 'Pemakaian Internal' },
  { value: 'ADJUSTMENT', label: 'Penyesuaian Stok' },
  { value: 'OTHER', label: 'Lainnya' },
];

const fromDb = (row: any): ProductStockMovement => ({
  id: row.id,
  productId: row.product_id,
  productName: row.products?.name || row.product_name,
  branchId: row.branch_id,
  type: row.type,
  reason: row.reason,
  quantity: Number(row.quantity) || 0,
  previousStock: Number(row.previous_stock) || 0,
  newStock: Number(row.new_stock) || 0,
  referenceId: row.reference_id,
  referenceType: row.reference_type,
  notes: row.notes,
  userId: row.user_id,
  userName: row.user_name,
  createdAt: new Date(row.created_at),
});

export const useProductStockMovements = () => {
  const queryClient = useQueryClient();
  const { currentBranch } = useBranch();
  const { user, profile } = useAuth();

  // Fetch all movements
  const { data: movements, isLoading } = useQuery<ProductStockMovement[]>({
    queryKey: ['product_stock_movements', currentBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('product_stock_movements')
        .select('*, products(name)')
        .order('created_at', { ascending: false });

      if (currentBranch?.id) {
        query = query.eq('branch_id', currentBranch.id);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data ? data.map(fromDb) : [];
    },
    enabled: !!currentBranch,
  });

  // Create stock out (reduce stock)
  const createStockOut = useMutation({
    mutationFn: async (data: CreateStockOutData) => {
      const { productId, quantity, reason, notes } = data;

      if (quantity <= 0) {
        throw new Error('Jumlah harus lebih dari 0');
      }

      // Get current stock from VIEW
      const { data: stockData } = await supabase
        .from('v_product_current_stock')
        .select('current_stock')
        .eq('product_id', productId)
        .single();

      const previousStock = Number(stockData?.current_stock) || 0;

      if (quantity > previousStock) {
        throw new Error(`Stok tidak cukup. Stok tersedia: ${previousStock}`);
      }

      // Use FIFO to consume stock
      const referenceId = `STOCK-OUT-${Date.now()}`;
      const fifoResult = await consumeStockFIFO(
        productId,
        quantity,
        referenceId,
        'transaction', // Using 'transaction' as generic type
        currentBranch?.id
      );

      if (!fifoResult.success) {
        throw new Error(fifoResult.error_message || 'Gagal mengurangi stok');
      }

      const newStock = previousStock - quantity;

      // Record the movement
      const { data: movement, error } = await supabase
        .from('product_stock_movements')
        .insert({
          product_id: productId,
          branch_id: currentBranch?.id,
          type: 'OUT',
          reason,
          quantity,
          previous_stock: previousStock,
          new_stock: newStock,
          reference_id: referenceId,
          reference_type: 'stock_out',
          notes,
          user_id: user?.id,
          user_name: profile?.full_name || user?.email,
          unit_cost: fifoResult.success && fifoResult.total_hpp ? fifoResult.total_hpp / quantity : 0
        })
        .select('*, products(name)')
        .single();

      if (error) throw new Error(error.message);

      console.log(`✅ Stock OUT: ${quantity} units, HPP: ${fifoResult.total_hpp}`);
      return fromDb(movement);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product_stock_movements'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  // Create stock in (add stock) - for adjustments
  const createStockIn = useMutation({
    mutationFn: async (data: CreateStockOutData) => {
      const { productId, quantity, reason, notes } = data;

      if (quantity <= 0) {
        throw new Error('Jumlah harus lebih dari 0');
      }

      // Get current stock from VIEW
      const { data: stockData } = await supabase
        .from('v_product_current_stock')
        .select('current_stock')
        .eq('product_id', productId)
        .single();

      const previousStock = Number(stockData?.current_stock) || 0;

      // Get product cost price just for reference
      const { data: product } = await supabase
        .from('products')
        .select('cost_price')
        .eq('id', productId)
        .single();

      const unitCost = Number(product?.cost_price) || 0;
      const referenceId = `STOCK-IN-${Date.now()}`;

      // Use RPC to create new inventory batch (Atomic)
      const restoreResult = await restoreStockFIFO(
        productId,
        quantity,
        referenceId,
        'stock_in', // Custom reference type
        currentBranch?.id,
        unitCost
      );

      if (!restoreResult.success) {
        throw new Error(restoreResult.error_message || 'Gagal menambahkan stok');
      }

      const newStock = previousStock + quantity;

      // Record the movement
      const { data: movement, error } = await supabase
        .from('product_stock_movements')
        .insert({
          product_id: productId,
          branch_id: currentBranch?.id,
          type: 'IN',
          reason,
          quantity,
          previous_stock: previousStock,
          new_stock: newStock,
          reference_id: referenceId,
          reference_type: 'stock_in',
          notes,
          user_id: user?.id,
          user_name: profile?.full_name || user?.email,
          unit_cost: unitCost
        })
        .select('*, products(name)')
        .single();

      if (error) throw new Error(error.message);

      console.log(`✅ Stock IN: ${quantity} units via RPC`);
      return fromDb(movement);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product_stock_movements'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  // Cancel/void a movement
  const voidMovement = useMutation({
    mutationFn: async (movementId: string) => {
      // Get movement details
      const { data: movement, error: fetchError } = await supabase
        .from('product_stock_movements')
        .select('*')
        .eq('id', movementId)
        .single();

      if (fetchError || !movement) {
        throw new Error('Movement tidak ditemukan');
      }

      // Reverse the movement
      if (movement.type === 'OUT') {
        // Was OUT, so Restore stock (IN)
        const restoreResult = await restoreStockFIFO(
          movement.product_id,
          movement.quantity,
          movement.reference_id || movementId,
          'void_movement',
          movement.branch_id
        );

        if (!restoreResult.success) {
          throw new Error(restoreResult.error_message || 'Gagal mengembalikan stok');
        }
      } else {
        // Was IN, so Consume stock (OUT)
        // This handles voiding a "stock in" or adjustment
        const consumeResult = await consumeStockFIFO(
          movement.product_id,
          movement.quantity,
          movement.reference_id || movementId,
          'void_movement',
          movement.branch_id
        );

        if (!consumeResult.success) {
          throw new Error(consumeResult.error_message || 'Gagal membatalkan stock in');
        }
      }

      // Delete the movement record
      const { error: deleteError } = await supabase
        .from('product_stock_movements')
        .delete()
        .eq('id', movementId);

      if (deleteError) throw new Error(deleteError.message);

      console.log(`✅ Movement voided: ${movementId}`);
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product_stock_movements'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  return {
    movements,
    isLoading,
    createStockOut,
    createStockIn,
    voidMovement,
  };
};
