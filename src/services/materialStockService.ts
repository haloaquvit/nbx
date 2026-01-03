import { supabase } from '@/integrations/supabase/client'

// ============================================================================
// MATERIAL STOCK SERVICE
// ============================================================================
// materials.stock is DEPRECATED - stock derived from v_material_current_stock
// This service now uses consume_material_fifo_v2 RPC for FIFO consumption
// ============================================================================

export interface MaterialUsage {
  materialId: string;
  materialName: string;
  materialType: 'Stock' | 'Beli';
  quantity: number;
  unit: string;
}

interface MaterialFIFOResult {
  success: boolean;
  total_cost: number;
  quantity_consumed: number;
  batches_consumed: any[];
  error_message: string | null;
}

/**
 * Consume material stock using FIFO via database RPC
 */
async function consumeMaterialFIFO(
  materialId: string,
  quantity: number,
  referenceId: string,
  referenceType: string,
  branchId?: string | null,
  userId?: string,
  userName?: string
): Promise<MaterialFIFOResult> {
  if (quantity <= 0 || !materialId) {
    return {
      success: true,
      total_cost: 0,
      quantity_consumed: 0,
      batches_consumed: [],
      error_message: null
    };
  }

  try {
    const { data, error } = await supabase.rpc('consume_material_fifo_v2', {
      p_material_id: materialId,
      p_quantity: quantity,
      p_reference_id: referenceId,
      p_reference_type: referenceType,
      p_branch_id: branchId || null,
      p_user_id: userId || null,
      p_user_name: userName || null
    });

    if (error) {
      console.error('[consumeMaterialFIFO] RPC error:', error);
      // If RPC doesn't exist, fall back to legacy method
      if (error.message.includes('does not exist')) {
        console.warn('[consumeMaterialFIFO] RPC not found, using legacy method');
        return await consumeMaterialFIFOLegacy(materialId, quantity, referenceId, referenceType, branchId, userId, userName);
      }
      return {
        success: false,
        total_cost: 0,
        quantity_consumed: 0,
        batches_consumed: [],
        error_message: error.message
      };
    }

    const result = data?.[0] || data;
    console.log(`🧱 Material FIFO Consume: ${materialId.substring(0, 8)}, Qty: ${quantity}, Cost: ${result?.total_cost || 0}`);

    return {
      success: result?.success ?? true,
      total_cost: result?.total_cost ?? 0,
      quantity_consumed: result?.quantity_consumed ?? quantity,
      batches_consumed: result?.batches_consumed ?? [],
      error_message: result?.error_message ?? null
    };
  } catch (err: any) {
    console.error('[consumeMaterialFIFO] Exception:', err);
    return {
      success: false,
      total_cost: 0,
      quantity_consumed: 0,
      batches_consumed: [],
      error_message: err.message
    };
  }
}

/**
 * Legacy fallback when FIFO RPC not available
 * @deprecated Use consume_material_fifo_v2 RPC instead
 */
async function consumeMaterialFIFOLegacy(
  materialId: string,
  quantity: number,
  referenceId: string,
  referenceType: string,
  branchId?: string | null,
  userId?: string,
  userName?: string
): Promise<MaterialFIFOResult> {
  try {
    // Get current stock from materials table (legacy)
    const { data: materialRaw, error: fetchError } = await supabase
      .from('materials')
      .select('stock, name')
      .eq('id', materialId)
      .order('id').limit(1);
    const material = Array.isArray(materialRaw) ? materialRaw[0] : materialRaw;

    if (fetchError || !material) {
      return {
        success: false,
        total_cost: 0,
        quantity_consumed: 0,
        batches_consumed: [],
        error_message: fetchError?.message || 'Material not found'
      };
    }

    const currentStock = material.stock || 0;
    if (currentStock < quantity) {
      return {
        success: false,
        total_cost: 0,
        quantity_consumed: 0,
        batches_consumed: [],
        error_message: `Insufficient stock: need ${quantity}, have ${currentStock}`
      };
    }

    const newStock = currentStock - quantity;

    // Update materials.stock (legacy)
    const { error: updateError } = await supabase
      .from('materials')
      .update({ stock: newStock })
      .eq('id', materialId);

    if (updateError) {
      return {
        success: false,
        total_cost: 0,
        quantity_consumed: 0,
        batches_consumed: [],
        error_message: updateError.message
      };
    }

    // Log movement
    await supabase
      .from('material_stock_movements')
      .insert({
        material_id: materialId,
        material_name: material.name,
        type: 'OUT',
        reason: 'PRODUCTION_CONSUMPTION',
        quantity: quantity,
        previous_stock: currentStock,
        new_stock: newStock,
        notes: `Legacy FIFO for ${referenceId}`,
        reference_id: referenceId,
        reference_type: referenceType,
        user_id: userId,
        user_name: userName,
        branch_id: branchId
      });

    console.log(`🧱 Material FIFO Legacy: ${material.name} ${currentStock} → ${newStock}`);

    return {
      success: true,
      total_cost: 0, // Legacy doesn't track cost
      quantity_consumed: quantity,
      batches_consumed: [],
      error_message: null
    };
  } catch (err: any) {
    return {
      success: false,
      total_cost: 0,
      quantity_consumed: 0,
      batches_consumed: [],
      error_message: err.message
    };
  }
}

export class MaterialStockService {
  /**
   * Process material stock changes when transaction status changes to "Proses Produksi"
   * Uses FIFO consumption via database RPC
   * - Stock type materials: Consume from oldest batches first
   * - Beli type materials: Track usage (no batch consumption)
   */
  static async processProductionStockChanges(
    transactionId: string,
    materialUsages: MaterialUsage[],
    userId: string,
    userName: string,
    branchId?: string | null
  ): Promise<void> {
    try {
      // Process each material usage using FIFO
      for (const usage of materialUsages) {
        const { materialId, materialType, quantity, materialName, unit } = usage;

        if (materialType === 'Stock') {
          // Stock type: Use FIFO consumption
          const result = await consumeMaterialFIFO(
            materialId,
            quantity,
            transactionId,
            'transaction',
            branchId,
            userId,
            userName
          );

          if (!result.success) {
            throw new Error(`Insufficient stock for ${materialName}: ${result.error_message}`);
          }

          console.log(`🧱 Material consumed: ${materialName} x${quantity} ${unit}, Cost: ${result.total_cost}`);

        } else if (materialType === 'Beli') {
          // Beli type: Track usage in movements only (no stock deduction)
          // This represents outsourced or purchased-per-use materials
          try {
            await supabase
              .from('material_stock_movements')
              .insert({
                material_id: materialId,
                material_name: materialName,
                type: 'OUT',
                reason: 'PRODUCTION_CONSUMPTION',
                quantity: quantity,
                previous_stock: 0,
                new_stock: 0,
                notes: `Beli-type material usage for transaction ${transactionId}`,
                reference_id: transactionId,
                reference_type: 'transaction',
                user_id: userId,
                user_name: userName,
                branch_id: branchId
              });
          } catch (logError) {
            console.warn('Failed to log Beli-type material usage:', logError);
          }
        }
      }
    } catch (error) {
      throw new Error(`Material stock processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract material usage from transaction items
   */
  static extractMaterialUsageFromTransaction(transactionItems: any[]): MaterialUsage[] {
    const materialUsages: MaterialUsage[] = [];

    transactionItems.forEach(item => {
      if (item.product?.materials && Array.isArray(item.product.materials)) {
        item.product.materials.forEach((material: any) => {
          const totalQuantity = material.quantity * item.quantity;
          
          materialUsages.push({
            materialId: material.materialId,
            materialName: material.materialName || 'Unknown Material',
            materialType: material.materialType || 'Stock',
            quantity: totalQuantity,
            unit: material.unit || 'pcs',
          });
        });
      }
    });

    return materialUsages;
  }

  /**
   * Process material stock when transaction status changes to "Proses Produksi"
   */
  static async processTransactionProduction(
    transactionId: string,
    transactionItems: any[],
    userId: string,
    userName: string
  ): Promise<void> {
    const materialUsages = this.extractMaterialUsageFromTransaction(transactionItems);
    
    if (materialUsages.length === 0) {
      return; // No materials to process
    }

    await this.processProductionStockChanges(
      transactionId,
      materialUsages,
      userId,
      userName
    );
  }
}