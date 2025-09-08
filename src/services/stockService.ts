import { supabase } from '@/integrations/supabase/client'
import { Product } from '@/types/product'
import { StockMovementType, StockMovementReason, CreateStockMovementData } from '@/types/stockMovement'
import { TransactionItem } from '@/types/transaction'

export class StockService {
  
  /**
   * Process stock movements when a transaction is created or when items are delivered
   */
  static async processTransactionStock(
    referenceId: string,
    items: TransactionItem[],
    userId: string,
    userName: string,
    referenceType: 'transaction' | 'delivery' = 'transaction'
  ): Promise<void> {
    const movements: CreateStockMovementData[] = [];

    for (const item of items) {
      const product = item.product;
      const currentStock = product.currentStock || 0;
      let newStock = currentStock;
      let movementType: StockMovementType;
      let reason: StockMovementReason = 'PRODUCTION_CONSUMPTION';

      // Determine stock movement based on product type and quantity (negative for restore)  
      if (product.type === 'Stock' as any) {
        if (item.quantity < 0) {
          // Restoring stock (negative quantity means restore)
          newStock = currentStock - item.quantity; // Add back to stock (subtract negative)
          movementType = 'IN';
          reason = 'ADJUSTMENT';
        } else {
          // Stock items: production reduces stock
          newStock = currentStock - item.quantity;
          movementType = 'OUT';
          reason = 'PRODUCTION_CONSUMPTION';
        }
      } else if (product.type === 'Beli' as any) {
        if (item.quantity < 0) {
          // Restoring usage tracking
          newStock = currentStock - item.quantity; // Reverse the usage tracking
          movementType = 'IN';
          reason = 'ADJUSTMENT';
        } else {
          // Beli items: track usage/consumption (no actual stock reduction but track usage)
          newStock = currentStock + item.quantity; // Track cumulative usage
          movementType = 'OUT'; // This is consumption/usage
          reason = 'PRODUCTION_CONSUMPTION'; // Changed to valid constraint value
        }
      } else {
        if (item.quantity < 0) {
          // Default restore behavior
          newStock = currentStock - item.quantity; // Add back to stock
          movementType = 'IN';
          reason = 'ADJUSTMENT';
        } else {
          // Default to stock behavior
          newStock = currentStock - item.quantity;
          movementType = 'OUT';
          reason = 'PRODUCTION_CONSUMPTION';
        }
      }

      // Create stock movement record
      const movement: CreateStockMovementData = {
        productId: product.id,
        productName: product.name,
        type: movementType,
        reason,
        quantity: Math.abs(item.quantity), // Always store positive quantity in movement records
        previousStock: currentStock,
        newStock,
        notes: referenceType === 'delivery' 
          ? `Pengantaran: ${referenceId} - ${item.notes || ''}` 
          : `Transaksi: ${referenceId} - ${item.notes || ''}`,
        referenceId: referenceId,
        referenceType: referenceType,
        userId,
        userName,
      };

      movements.push(movement);

      // Update product stock only during delivery, not during transaction creation
      if (referenceType === 'delivery') {
        await StockService.updateProductStock(product.id, newStock);
      }
    }

    // Save all stock movements
    if (movements.length > 0) {
      await StockService.createStockMovements(movements, referenceType);
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
  static async createStockMovements(movements: CreateStockMovementData[], referenceType: string = 'transaction'): Promise<void> {
    console.log('Creating stock movements:', movements);
    
    // Only disable stock movements for transaction creation per user request
    // Stock movements should execute during delivery, not during transaction creation
    const DISABLE_FOR_TRANSACTIONS = referenceType === 'transaction';
    if (DISABLE_FOR_TRANSACTIONS) {
      console.warn('Stock movements disabled for transaction creation - will execute during delivery instead');
      return;
    }
    
    // First, check if the table exists and what columns are available
    const { error: tableError } = await supabase
      .from('material_stock_movements')
      .select('id')
      .limit(1);
      
    if (tableError) {
      console.error('Table check error:', tableError);
      if (tableError.code === 'PGRST204' || tableError.message.includes('does not exist')) {
        console.warn('material_stock_movements table does not exist, skipping stock movements');
        return; // Skip stock movements if table doesn't exist
      }
    }
    
    // Check which columns exist in the table
    console.log('Checking material_stock_movements table structure...');
    
    const dbMovements = movements.map(movement => {
      // Start with minimal required fields
      const dbMovement: any = {
        material_id: movement.productId,
        quantity: movement.quantity,
        previous_stock: movement.previousStock,
        new_stock: movement.newStock,
        user_name: movement.userName,
        notes: movement.notes || `Stock movement for ${movement.productName}`,
      };
      
      // Add optional fields if available
      if (movement.productName) dbMovement.material_name = movement.productName;
      if (movement.type) dbMovement.type = movement.type;
      if (movement.reason) dbMovement.reason = movement.reason;
      if (movement.referenceId) dbMovement.reference_id = movement.referenceId;
      if (movement.referenceType) dbMovement.reference_type = movement.referenceType;
      if (movement.userId) dbMovement.user_id = movement.userId;
      
      return dbMovement;
    });

    console.log('Inserting stock movements:', dbMovements);

    const { error } = await supabase
      .from('material_stock_movements')
      .insert(dbMovements);

    if (error) {
      console.error('Stock movements error:', error);
      
      // If the error is about missing column, try without material_name
      if (error.message.includes('material_name')) {
        console.warn('Retrying without material_name column...');
        
        const fallbackMovements = dbMovements.map(({ material_name: _material_name, ...rest }) => rest);
        
        const { error: fallbackError } = await supabase
          .from('material_stock_movements')
          .insert(fallbackMovements);
          
        if (fallbackError) {
          console.error('Fallback stock movements error:', fallbackError);
          throw new Error(`Failed to create stock movements (fallback): ${fallbackError.message}`);
        } else {
          console.log('Stock movements created successfully (without material_name)');
        }
      } else {
        throw new Error(`Failed to create stock movements: ${error.message}`);
      }
    } else {
      console.log('Stock movements created successfully');
    }
  }

  /**
   * Get products with low stock
   */
  static async getLowStockProducts(): Promise<Product[]> {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .filter('current_stock', 'lt', 'min_stock')
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