import { supabase } from '@/integrations/supabase/client'
import { Product } from '@/types/product'
import { StockMovementType, StockMovementReason, CreateStockMovementData } from '@/types/stockMovement'
import { TransactionItem } from '@/types/transaction'

// ============================================================================
// FIFO BATCH MANAGEMENT FUNCTIONS (Using Database RPC)
// ============================================================================

/**
 * Result type from FIFO RPC functions
 */
interface FIFOConsumeResult {
  success: boolean;
  total_hpp: number;
  batches_consumed: any[];
  remaining_to_consume: number;
  error_message: string | null;
}

interface FIFORestoreResult {
  success: boolean;
  total_restored: number;
  batches_restored: any[];
  error_message: string | null;
}

/**
 * Consume stock using FIFO method via database RPC
 * This is now atomic and handled entirely in the database
 */
async function consumeStockFIFO(
  productId: string,
  quantity: number,
  referenceId: string,
  referenceType: 'transaction' | 'delivery' | 'production',
  branchId?: string | null
): Promise<FIFOConsumeResult> {
  if (quantity <= 0 || !productId) {
    return {
      success: true,
      total_hpp: 0,
      batches_consumed: [],
      remaining_to_consume: 0,
      error_message: null
    };
  }

  try {
    const { data, error } = await supabase.rpc('consume_stock_fifo_v2', {
      p_product_id: productId,
      p_quantity: quantity,
      p_reference_id: referenceId,
      p_reference_type: referenceType,
      p_branch_id: branchId || null
    });

    if (error) {
      console.error('[consumeStockFIFO] RPC error:', error);
      // Fallback to old method if RPC doesn't exist
      if (error.message.includes('does not exist')) {
        console.warn('[consumeStockFIFO] RPC not found, using legacy method');
        await deductBatchFIFOLegacy(productId, quantity);
        return {
          success: true,
          total_hpp: 0,
          batches_consumed: [],
          remaining_to_consume: 0,
          error_message: 'Used legacy method'
        };
      }
      return {
        success: false,
        total_hpp: 0,
        batches_consumed: [],
        remaining_to_consume: quantity,
        error_message: error.message
      };
    }

    const result = data?.[0] || data;
    console.log(`📦 FIFO Consume (RPC): Product ${productId.substring(0, 8)}, Qty: ${quantity}, HPP: ${result?.total_hpp || 0}`);

    return {
      success: result?.success ?? true,
      total_hpp: result?.total_hpp ?? 0,
      batches_consumed: result?.batches_consumed ?? [],
      remaining_to_consume: result?.remaining_to_consume ?? 0,
      error_message: result?.error_message ?? null
    };
  } catch (err: any) {
    console.error('[consumeStockFIFO] Exception:', err);
    return {
      success: false,
      total_hpp: 0,
      batches_consumed: [],
      remaining_to_consume: quantity,
      error_message: err.message
    };
  }
}

/**
 * Restore stock using FIFO method via database RPC
 * Used when transaction is cancelled/voided
 */
async function restoreStockFIFO(
  productId: string,
  quantity: number,
  referenceId: string,
  referenceType: 'transaction' | 'delivery' | 'production',
  branchId?: string | null
): Promise<FIFORestoreResult> {
  if (quantity <= 0 || !productId) {
    return {
      success: true,
      total_restored: 0,
      batches_restored: [],
      error_message: null
    };
  }

  try {
    const { data, error } = await supabase.rpc('restore_stock_fifo_v2', {
      p_product_id: productId,
      p_quantity: quantity,
      p_reference_id: referenceId,
      p_reference_type: referenceType,
      p_branch_id: branchId || null
    });

    if (error) {
      console.error('[restoreStockFIFO] RPC error:', error);
      // Fallback to old method if RPC doesn't exist
      if (error.message.includes('does not exist')) {
        console.warn('[restoreStockFIFO] RPC not found, using legacy method');
        await restoreBatchFIFOLegacy(productId, quantity);
        return {
          success: true,
          total_restored: quantity,
          batches_restored: [],
          error_message: 'Used legacy method'
        };
      }
      return {
        success: false,
        total_restored: 0,
        batches_restored: [],
        error_message: error.message
      };
    }

    const result = data?.[0] || data;
    console.log(`📦 FIFO Restore (RPC): Product ${productId.substring(0, 8)}, Qty: ${quantity}`);

    return {
      success: result?.success ?? true,
      total_restored: result?.total_restored ?? quantity,
      batches_restored: result?.batches_restored ?? [],
      error_message: result?.error_message ?? null
    };
  } catch (err: any) {
    console.error('[restoreStockFIFO] Exception:', err);
    return {
      success: false,
      total_restored: 0,
      batches_restored: [],
      error_message: err.message
    };
  }
}

/**
 * Legacy FIFO deduct - used as fallback if RPC not available
 * @deprecated Use consumeStockFIFO instead
 */
async function deductBatchFIFOLegacy(productId: string, quantity: number): Promise<void> {
  if (quantity <= 0 || !productId) return;

  try {
    const { data: batches, error } = await supabase
      .from('inventory_batches')
      .select('id, remaining_quantity, batch_date')
      .eq('product_id', productId)
      .gt('remaining_quantity', 0)
      .order('batch_date', { ascending: true });

    if (error || !batches || batches.length === 0) return;

    let remainingToDeduct = quantity;

    for (const batch of batches) {
      if (remainingToDeduct <= 0) break;

      const batchRemaining = batch.remaining_quantity || 0;
      const deductFromBatch = Math.min(batchRemaining, remainingToDeduct);

      if (deductFromBatch > 0) {
        await supabase
          .from('inventory_batches')
          .update({
            remaining_quantity: batchRemaining - deductFromBatch,
            updated_at: new Date().toISOString()
          })
          .eq('id', batch.id);

        console.log(`📦 FIFO Legacy: Batch ${batch.id.substring(0, 8)} reduced by ${deductFromBatch}`);
        remainingToDeduct -= deductFromBatch;
      }
    }
  } catch (err) {
    console.error('[deductBatchFIFOLegacy] Exception:', err);
  }
}

/**
 * Legacy FIFO restore - used as fallback if RPC not available
 * @deprecated Use restoreStockFIFO instead
 */
async function restoreBatchFIFOLegacy(productId: string, quantity: number): Promise<void> {
  if (quantity <= 0 || !productId) return;

  try {
    const { data: batches, error } = await supabase
      .from('inventory_batches')
      .select('id, initial_quantity, remaining_quantity, batch_date')
      .eq('product_id', productId)
      .order('batch_date', { ascending: true });

    if (error || !batches || batches.length === 0) return;

    let remainingToRestore = quantity;

    for (const batch of batches) {
      if (remainingToRestore <= 0) break;

      const batchRemaining = batch.remaining_quantity || 0;
      const batchInitial = batch.initial_quantity || 0;
      const spaceInBatch = batchInitial - batchRemaining;

      if (spaceInBatch > 0) {
        const restoreToBatch = Math.min(spaceInBatch, remainingToRestore);
        const newRemaining = batchRemaining + restoreToBatch;

        await supabase
          .from('inventory_batches')
          .update({
            remaining_quantity: newRemaining,
            updated_at: new Date().toISOString()
          })
          .eq('id', batch.id);

        console.log(`📦 FIFO Restore Legacy: Batch ${batch.id.substring(0, 8)} restored by ${restoreToBatch}`);
        remainingToRestore -= restoreToBatch;
      }
    }

    if (remainingToRestore > 0 && batches.length > 0) {
      const mostRecentBatch = batches[batches.length - 1];
      const newRemaining = (mostRecentBatch.remaining_quantity || 0) + remainingToRestore;

      await supabase
        .from('inventory_batches')
        .update({
          remaining_quantity: newRemaining,
          updated_at: new Date().toISOString()
        })
        .eq('id', mostRecentBatch.id);

      console.log(`📦 FIFO Restore Legacy (overflow): Batch ${mostRecentBatch.id.substring(0, 8)} increased to ${newRemaining}`);
    }
  } catch (err) {
    console.error('[restoreBatchFIFOLegacy] Exception:', err);
  }
}

// ============================================================================

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
      // Product types in database: 'Produksi' or 'Jual Langsung'
      // Both should reduce stock when sold!
      if (item.quantity < 0) {
        // Restoring stock (negative quantity means restore)
        newStock = currentStock - item.quantity; // Add back to stock (subtract negative)
        movementType = 'IN';
        reason = 'ADJUSTMENT';
      } else {
        // All product types: reduce stock when sold
        newStock = currentStock - item.quantity;
        movementType = 'OUT';
        reason = 'PRODUCTION_CONSUMPTION';
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

      // Update product stock based on reference type and isOfficeSale flag:
      //
      // LAKU KANTOR (isOfficeSale=true): Stock berkurang saat TRANSAKSI (tidak ada delivery)
      // BUKAN LAKU KANTOR (isOfficeSale=false): Stock berkurang saat DELIVERY (diantar ke customer)
      //
      // Ini memastikan stok tidak berkurang 2x untuk transaksi dengan delivery
      const isOfficeSale = (item as any).isOfficeSale === true;
      const shouldUpdateStock = referenceType === 'delivery' ||
                                (referenceType === 'transaction' && isOfficeSale);

      if (shouldUpdateStock) {
        console.log(`📦 Updating stock for ${product.name} (${product.type}, officeSale=${isOfficeSale}): ${currentStock} → ${newStock}`);

        // Use database RPC for atomic FIFO operations
        // The RPC also updates products.current_stock automatically
        const branchId = (item as any).branchId || null;

        if (item.quantity > 0) {
          // Consume stock using FIFO (sale/delivery)
          const result = await consumeStockFIFO(
            product.id,
            item.quantity,
            referenceId,
            referenceType,
            branchId
          );
          if (!result.success) {
            console.error(`[processTransactionStock] FIFO consume failed: ${result.error_message}`);
            // Fallback: direct update if RPC failed
            await StockService.updateProductStock(product.id, newStock);
          }
        } else if (item.quantity < 0) {
          // Restore stock using FIFO (refund/cancel)
          const result = await restoreStockFIFO(
            product.id,
            Math.abs(item.quantity),
            referenceId,
            referenceType,
            branchId
          );
          if (!result.success) {
            console.error(`[processTransactionStock] FIFO restore failed: ${result.error_message}`);
            // Fallback: direct update if RPC failed
            await StockService.updateProductStock(product.id, newStock);
          }
        }
      }
    }

    // Save all stock movements
    if (movements.length > 0) {
      await StockService.createStockMovements(movements, referenceType);
    }
  }

  /**
   * @deprecated DO NOT USE - products.current_stock is deprecated
   * Stock is derived from inventory_batches via v_product_current_stock
   * Use consumeStockFIFO/restoreStockFIFO instead
   */
  static async updateProductStock(_productId: string, _newStock: number): Promise<void> {
    console.warn('⚠️ updateProductStock is DEPRECATED - stock managed via inventory_batches');
    // No-op: we no longer update current_stock directly
    // The FIFO RPC functions handle batch management
  }

  /**
   * Create stock movement records
   */
  static async createStockMovements(movements: CreateStockMovementData[], referenceType: string = 'transaction'): Promise<void> {
    console.log('Creating stock movements:', movements);

    // For transaction creation, we still skip recording movements to material_stock_movements table
    // But for 'Jual Langsung' products, actual stock is deducted in processTransactionStock
    // Stock movements table logging is skipped for transactions but actual stock is updated
    if (referenceType === 'transaction') {
      console.log('Stock movement logging skipped for transaction creation - actual stock updates happen separately');
      return;
    }
    
    // First, check if the table exists and what columns are available
    const { error: tableError } = await supabase
      .from('material_stock_movements')
      .select('id')
      .order('id').limit(1);
      
    if (tableError) {
      console.error('Table check error:', tableError);
      if (tableError.code === 'PGRST204' || tableError.message.includes('does not exist')) {
        console.warn('material_stock_movements table does not exist, skipping stock movements');
        return; // Skip stock movements if table doesn't exist
      }
    }
    
    // Check which columns exist in the table
    console.log('Checking material_stock_movements table structure...');
    
    // First, check which products exist in materials table
    const productIds = movements.map(m => m.productId);
    const { data: existingMaterials } = await supabase
      .from('materials')
      .select('id')
      .in('id', productIds);

    const existingMaterialIds = new Set((existingMaterials || []).map(m => m.id));

    // Filter movements to only include products that exist in materials table
    const validMovements = movements.filter(m => existingMaterialIds.has(m.productId));

    if (validMovements.length === 0) {
      console.warn('No valid materials found for stock movements, skipping...');
      return;
    }

    if (validMovements.length < movements.length) {
      console.warn(`Skipping ${movements.length - validMovements.length} stock movements for products not in materials table`);
    }

    const dbMovements = validMovements.map(movement => {
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
   * Uses v_product_current_stock VIEW as source of truth
   */
  static async getLowStockProducts(): Promise<Product[]> {
    // Use VIEW for accurate stock from inventory_batches
    const { data, error } = await supabase
      .from('v_product_current_stock')
      .select('product_id, product_name, current_stock, branch_id')
      .order('product_name');

    if (error) {
      console.error('[getLowStockProducts] VIEW query failed, using fallback:', error);
      // Fallback to direct query if VIEW doesn't exist
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('products')
        .select('*')
        .order('name');

      if (fallbackError) {
        throw new Error(`Failed to get low stock products: ${fallbackError.message}`);
      }

      // Filter in app since we can't compare columns in PostgREST easily
      return (fallbackData || [])
        .filter(p => (Number(p.current_stock) || 0) < (Number(p.min_stock) || 0))
        .map(product => ({
          id: product.id,
          name: product.name,
          category: product.category,
          type: product.type || 'Stock',
          basePrice: Number(product.base_price) || 0,
          unit: product.unit || 'pcs',
          initialStock: Number(product.initial_stock) || 0,
          currentStock: Number(product.current_stock) || 0,
          minStock: Number(product.min_stock) || 0,
          minOrder: Number(product.min_order) || 1,
          description: product.description || '',
          specifications: product.specifications || [],
          materials: product.materials || [],
          createdAt: new Date(product.created_at),
          updatedAt: new Date(product.updated_at),
        }));
    }

    // Get product details for low stock items
    const stockData = data || [];
    if (stockData.length === 0) return [];

    // Get min_stock from products table to compare
    const { data: productsData } = await supabase
      .from('products')
      .select('*');

    const productsMap = new Map((productsData || []).map(p => [p.id, p]));

    // Filter products where current_stock < min_stock
    return stockData
      .filter(s => {
        const product = productsMap.get(s.product_id);
        if (!product) return false;
        return s.current_stock < (Number(product.min_stock) || 0);
      })
      .map(s => {
        const product = productsMap.get(s.product_id)!;
        return {
          id: product.id,
          name: product.name,
          category: product.category,
          type: product.type || 'Stock',
          basePrice: Number(product.base_price) || 0,
          unit: product.unit || 'pcs',
          initialStock: Number(product.initial_stock) || 0,
          currentStock: s.current_stock, // From VIEW (accurate)
          minStock: Number(product.min_stock) || 0,
          minOrder: Number(product.min_order) || 1,
          description: product.description || '',
          specifications: product.specifications || [],
          materials: product.materials || [],
          createdAt: new Date(product.created_at),
          updatedAt: new Date(product.updated_at),
        };
      });
  }

  /**
   * @deprecated Use inventory_batches for stock adjustments instead
   * Manual stock adjustment - creates/adjusts inventory batch
   */
  static async adjustStock(
    productId: string,
    productName: string,
    currentStock: number,
    newStock: number,
    reason: string,
    userId: string,
    userName: string,
    branchId?: string | null
  ): Promise<void> {
    const quantity = Math.abs(newStock - currentStock);
    const movementType: StockMovementType = newStock > currentStock ? 'IN' : 'OUT';

    console.warn('⚠️ adjustStock should use inventory_batches directly for proper FIFO');

    // For stock increase, create a new batch
    if (newStock > currentStock) {
      const { error } = await supabase
        .from('inventory_batches')
        .insert({
          product_id: productId,
          branch_id: branchId || null,
          initial_quantity: quantity,
          remaining_quantity: quantity,
          unit_cost: 0, // Adjustment has no cost basis
          batch_date: new Date().toISOString(),
          notes: `Adjustment: ${reason}`
        });

      if (error) {
        console.error('[adjustStock] Failed to create batch:', error);
      }
    } else {
      // For stock decrease, use FIFO consume
      await consumeStockFIFO(
        productId,
        quantity,
        `ADJ-${Date.now()}`,
        'transaction',
        branchId
      );
    }

    // Create stock movement for audit trail
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

    await StockService.createStockMovements([movement]);
  }

  // ============================================================================
  // FIFO HPP CALCULATION
  // ============================================================================

  /**
   * Calculate HPP (Cost of Goods Sold) using FIFO method for a product
   *
   * Logic:
   * 1. Get all batches with remaining_quantity > 0, ordered by batch_date ASC
   * 2. Calculate weighted average from oldest batches first
   * 3. If no batches found, fallback to product.cost_price or BOM calculation
   *
   * @param productId - Product ID to calculate HPP for
   * @param quantity - Quantity to calculate HPP for (optional, defaults to 1)
   * @returns HPP per unit based on FIFO
   */
  static async calculateFIFOHpp(productId: string, quantity: number = 1): Promise<number> {
    try {
      // Get batches with remaining stock, ordered by date (FIFO)
      const { data: batches, error } = await supabase
        .from('inventory_batches')
        .select('id, remaining_quantity, unit_cost, batch_date')
        .eq('product_id', productId)
        .gt('remaining_quantity', 0)
        .order('batch_date', { ascending: true });

      if (error) {
        console.error('[calculateFIFOHpp] Error fetching batches:', error);
        return await StockService.getFallbackHpp(productId);
      }

      if (!batches || batches.length === 0) {
        console.log(`[calculateFIFOHpp] No batches found for product ${productId}, using fallback`);
        return await StockService.getFallbackHpp(productId);
      }

      // Calculate FIFO HPP for the requested quantity
      let remainingQty = quantity;
      let totalCost = 0;
      let totalQtyUsed = 0;

      for (const batch of batches) {
        if (remainingQty <= 0) break;

        const batchRemaining = batch.remaining_quantity || 0;
        const batchCost = batch.unit_cost || 0;
        const qtyFromBatch = Math.min(batchRemaining, remainingQty);

        if (qtyFromBatch > 0 && batchCost > 0) {
          totalCost += qtyFromBatch * batchCost;
          totalQtyUsed += qtyFromBatch;
          remainingQty -= qtyFromBatch;
        }
      }

      if (totalQtyUsed > 0) {
        const hppPerUnit = totalCost / totalQtyUsed;
        console.log(`[calculateFIFOHpp] Product ${productId}: HPP = ${hppPerUnit} (qty: ${quantity})`);
        return hppPerUnit;
      }

      // If all batches have 0 unit_cost, use fallback
      return await StockService.getFallbackHpp(productId);
    } catch (err) {
      console.error('[calculateFIFOHpp] Exception:', err);
      return await StockService.getFallbackHpp(productId);
    }
  }

  /**
   * Get fallback HPP when no FIFO batches available
   * 1. Check product.cost_price
   * 2. If product type is "Produksi", calculate from BOM
   */
  static async getFallbackHpp(productId: string): Promise<number> {
    try {
      // First, check product's cost_price
      const { data: product, error } = await supabase
        .from('products')
        .select('cost_price, type')
        .eq('id', productId)
        .single();

      if (error) {
        console.error('[getFallbackHpp] Error fetching product:', error);
        return 0;
      }

      if (product?.cost_price && product.cost_price > 0) {
        return Number(product.cost_price);
      }

      // If product type is "Produksi", calculate from BOM
      if (product?.type === 'Produksi') {
        const bomCost = await StockService.calculateBOMCost(productId);
        if (bomCost > 0) {
          return bomCost;
        }
      }

      return 0;
    } catch (err) {
      console.error('[getFallbackHpp] Exception:', err);
      return 0;
    }
  }

  /**
   * Calculate BOM (Bill of Materials) cost for a product
   * Uses FIFO HPP for each material
   */
  static async calculateBOMCost(productId: string): Promise<number> {
    try {
      const { data: bomItems, error } = await supabase
        .from('product_materials')
        .select('quantity, material_id')
        .eq('product_id', productId);

      if (error || !bomItems || bomItems.length === 0) {
        return 0;
      }

      let totalCost = 0;

      for (const item of bomItems) {
        // Get material's FIFO HPP from material_inventory_batches
        const materialHpp = await StockService.calculateMaterialFIFOHpp(item.material_id);
        totalCost += materialHpp * item.quantity;
      }

      return totalCost;
    } catch (err) {
      console.error('[calculateBOMCost] Exception:', err);
      return 0;
    }
  }

  /**
   * Calculate HPP for materials using FIFO from material_inventory_batches
   * Fallback to materials.price_per_unit if no batches
   */
  static async calculateMaterialFIFOHpp(materialId: string): Promise<number> {
    try {
      // Get batches from material_inventory_batches
      const { data: batches, error } = await supabase
        .from('material_inventory_batches')
        .select('id, remaining_quantity, unit_cost, batch_date')
        .eq('material_id', materialId)
        .gt('remaining_quantity', 0)
        .order('batch_date', { ascending: true });

      if (error) {
        console.error('[calculateMaterialFIFOHpp] Error:', error);
        return await StockService.getMaterialFallbackHpp(materialId);
      }

      if (!batches || batches.length === 0) {
        return await StockService.getMaterialFallbackHpp(materialId);
      }

      // Use oldest batch's unit_cost (FIFO)
      const oldestBatch = batches[0];
      if (oldestBatch.unit_cost && oldestBatch.unit_cost > 0) {
        return oldestBatch.unit_cost;
      }

      return await StockService.getMaterialFallbackHpp(materialId);
    } catch (err) {
      console.error('[calculateMaterialFIFOHpp] Exception:', err);
      return await StockService.getMaterialFallbackHpp(materialId);
    }
  }

  /**
   * Get fallback HPP for material from materials.price_per_unit
   */
  static async getMaterialFallbackHpp(materialId: string): Promise<number> {
    try {
      const { data: material, error } = await supabase
        .from('materials')
        .select('price_per_unit')
        .eq('id', materialId)
        .single();

      if (error || !material) {
        return 0;
      }

      return Number(material.price_per_unit) || 0;
    } catch (err) {
      console.error('[getMaterialFallbackHpp] Exception:', err);
      return 0;
    }
  }

  // ============================================================================
  // STOCK RECONCILIATION (DEPRECATED)
  // These functions exist for one-time migration purposes only.
  // In production, products.current_stock should NOT be used.
  // Stock is derived from v_product_current_stock VIEW.
  // ============================================================================

  /**
   * @deprecated ADMIN/MIGRATION ONLY - Do not use in production code
   * Reconcile product stock with inventory batches
   * Sets current_stock = SUM(remaining_quantity) from all batches
   */
  static async reconcileProductStock(productId: string): Promise<{
    success: boolean;
    oldStock: number;
    newStock: number;
    message: string
  }> {
    try {
      // Get current stock
      const { data: product, error: prodError } = await supabase
        .from('products')
        .select('current_stock, name')
        .eq('id', productId)
        .single();

      if (prodError || !product) {
        return { success: false, oldStock: 0, newStock: 0, message: 'Product not found' };
      }

      const oldStock = Number(product.current_stock) || 0;

      // Get sum of batch remaining quantities
      const { data: batches, error: batchError } = await supabase
        .from('inventory_batches')
        .select('remaining_quantity')
        .eq('product_id', productId);

      if (batchError) {
        return { success: false, oldStock, newStock: oldStock, message: batchError.message };
      }

      const newStock = (batches || []).reduce((sum, b) => sum + (Number(b.remaining_quantity) || 0), 0);

      if (oldStock === newStock) {
        return { success: true, oldStock, newStock, message: 'Stock already in sync' };
      }

      // Update current_stock
      const { error: updateError } = await supabase
        .from('products')
        .update({ current_stock: newStock })
        .eq('id', productId);

      if (updateError) {
        return { success: false, oldStock, newStock: oldStock, message: updateError.message };
      }

      console.log(`[reconcileProductStock] ${product.name}: ${oldStock} → ${newStock}`);
      return {
        success: true,
        oldStock,
        newStock,
        message: `Stock updated: ${oldStock} → ${newStock}`
      };
    } catch (err: any) {
      console.error('[reconcileProductStock] Exception:', err);
      return { success: false, oldStock: 0, newStock: 0, message: err.message };
    }
  }

  /**
   * @deprecated ADMIN/MIGRATION ONLY - Do not use in production code
   * Reconcile all products in a branch with their inventory batches
   */
  static async reconcileAllProductStock(branchId: string | null): Promise<{
    total: number;
    updated: number;
    errors: string[];
  }> {
    const result = { total: 0, updated: 0, errors: [] as string[] };

    try {
      let query = supabase.from('products').select('id, name');
      if (branchId) {
        query = query.eq('branch_id', branchId);
      }

      const { data: products, error } = await query;

      if (error || !products) {
        result.errors.push(error?.message || 'Failed to fetch products');
        return result;
      }

      result.total = products.length;

      for (const product of products) {
        const reconcileResult = await StockService.reconcileProductStock(product.id);
        if (reconcileResult.success && reconcileResult.oldStock !== reconcileResult.newStock) {
          result.updated++;
        }
        if (!reconcileResult.success) {
          result.errors.push(`${product.name}: ${reconcileResult.message}`);
        }
      }

      console.log(`[reconcileAllProductStock] Total: ${result.total}, Updated: ${result.updated}`);
      return result;
    } catch (err: any) {
      console.error('[reconcileAllProductStock] Exception:', err);
      result.errors.push(err.message);
      return result;
    }
  }

  /**
   * @deprecated ADMIN/MIGRATION ONLY - Use v_product_current_stock VIEW instead
   * Get products with stock mismatch (current_stock != batch sum)
   */
  static async getStockMismatches(branchId: string | null): Promise<Array<{
    id: string;
    name: string;
    currentStock: number;
    batchSum: number;
    difference: number;
  }>> {
    try {
      let query = supabase.from('products').select('id, name, current_stock');
      if (branchId) {
        query = query.eq('branch_id', branchId);
      }

      const { data: products, error } = await query;

      if (error || !products) {
        console.error('[getStockMismatches] Error:', error);
        return [];
      }

      const mismatches = [];

      for (const product of products) {
        const { data: batches } = await supabase
          .from('inventory_batches')
          .select('remaining_quantity')
          .eq('product_id', product.id);

        const batchSum = (batches || []).reduce((sum, b) => sum + (Number(b.remaining_quantity) || 0), 0);
        const currentStock = Number(product.current_stock) || 0;

        if (currentStock !== batchSum) {
          mismatches.push({
            id: product.id,
            name: product.name,
            currentStock,
            batchSum,
            difference: currentStock - batchSum
          });
        }
      }

      return mismatches;
    } catch (err) {
      console.error('[getStockMismatches] Exception:', err);
      return [];
    }
  }
}

// Export FIFO functions for use in other modules
export { consumeStockFIFO, restoreStockFIFO };
export type { FIFOConsumeResult, FIFORestoreResult };