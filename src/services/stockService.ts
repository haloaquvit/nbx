import { supabase } from '@/integrations/supabase/client'
import { Product, ProductType } from '@/types/product'
import { StockMovementType, StockMovementReason, CreateStockMovementData } from '@/types/stockMovement'
import { TransactionItem } from '@/types/transaction'

export class StockService {
  
  /**
   * Process stock movements when a transaction is created
   */
  static async processTransactionStock(
    transactionId: string,
    items: TransactionItem[],
    userId: string,
    userName: string
  ): Promise<void> {
    const movements: CreateStockMovementData[] = [];

    for (const item of items) {
      const product = item.product;
      const currentStock = product.currentStock || 0;
      let newStock = currentStock;
      let movementType: StockMovementType;
      let reason: StockMovementReason = 'SALES';

      // Determine stock movement based on product type
      if (product.type === 'Stock') {
        // Stock items: production reduces stock
        newStock = currentStock - item.quantity;
        movementType = 'OUT';
        reason = 'PRODUCTION';
      } else if (product.type === 'Beli') {
        // Beli items: track usage/consumption (no actual stock reduction but track usage)
        newStock = currentStock + item.quantity; // Track cumulative usage
        movementType = 'OUT'; // This is consumption/usage
        reason = 'SALES'; // Changed from PURCHASE to SALES since this is a sale transaction
      } else {
        // Default to stock behavior
        newStock = currentStock - item.quantity;
        movementType = 'OUT';
        reason = 'PRODUCTION';
      }

      // Create stock movement record
      const movement: CreateStockMovementData = {
        productId: product.id,
        productName: product.name,
        type: movementType,
        reason,
        quantity: item.quantity,
        previousStock: currentStock,
        newStock,
        notes: `Transaksi: ${transactionId} - ${item.notes || ''}`,
        referenceId: transactionId,
        referenceType: 'transaction',
        userId,
        userName,
      };

      movements.push(movement);

      // Update product stock
      await StockService.updateProductStock(product.id, newStock);
    }

    // Save all stock movements
    if (movements.length > 0) {
      await StockService.createStockMovements(movements);
    }
  }

  /**
   * Update product stock in database
   */
  static async updateProductStock(productId: string, newStock: number): Promise<void> {
    const { error } = await supabase
      .from('products')
      .update({ current_stock: newStock })
      .eq('id', productId);

    if (error) {
      throw new Error(`Failed to update stock for product ${productId}: ${error.message}`);
    }
  }

  /**
   * Create stock movement records
   */
  static async createStockMovements(movements: CreateStockMovementData[]): Promise<void> {
    const dbMovements = movements.map(movement => ({
      product_id: movement.productId,
      product_name: movement.productName,
      type: movement.type,
      reason: movement.reason,
      quantity: movement.quantity,
      previous_stock: movement.previousStock,
      new_stock: movement.newStock,
      notes: movement.notes,
      reference_id: movement.referenceId,
      reference_type: movement.referenceType,
      user_id: movement.userId,
      user_name: movement.userName,
    }));

    const { error } = await supabase
      .from('stock_movements')
      .insert(dbMovements);

    if (error) {
      throw new Error(`Failed to create stock movements: ${error.message}`);
    }
  }

  /**
   * Get products with low stock
   */
  static async getLowStockProducts(): Promise<Product[]> {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .lt('current_stock', supabase.raw('min_stock'))
      .order('name');

    if (error) {
      throw new Error(`Failed to get low stock products: ${error.message}`);
    }

    return data ? data.map(product => ({
      id: product.id,
      name: product.name,
      category: product.category,
      type: product.type || 'Stock',
      basePrice: Number(product.base_price) || 0,
      unit: product.unit || 'pcs',
      currentStock: Number(product.current_stock) || 0,
      minStock: Number(product.min_stock) || 0,
      minOrder: Number(product.min_order) || 1,
      description: product.description || '',
      specifications: product.specifications || [],
      materials: product.materials || [],
      createdAt: new Date(product.created_at),
      updatedAt: new Date(product.updated_at),
    })) : [];
  }

  /**
   * Manual stock adjustment
   */
  static async adjustStock(
    productId: string,
    productName: string,
    currentStock: number,
    newStock: number,
    reason: string,
    userId: string,
    userName: string
  ): Promise<void> {
    const quantity = Math.abs(newStock - currentStock);
    const movementType: StockMovementType = newStock > currentStock ? 'IN' : 'OUT';

    // Create stock movement
    const movement: CreateStockMovementData = {
      productId,
      productName,
      type: movementType,
      reason: 'ADJUSTMENT',
      quantity,
      previousStock: currentStock,
      newStock,
      notes: reason,
      userId,
      userName,
    };

    // Update stock and create movement
    await StockService.updateProductStock(productId, newStock);
    await StockService.createStockMovements([movement]);
  }
}