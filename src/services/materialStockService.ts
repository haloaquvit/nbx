import { supabase } from '@/integrations/supabase/client'

export interface MaterialUsage {
  materialId: string;
  materialName: string;
  materialType: 'Stock' | 'Beli';
  quantity: number;
  unit: string;
}

export class MaterialStockService {
  /**
   * Process material stock changes when transaction status changes to "Proses Produksi"
   * - Stock type materials: Decrease stock (consumed during production)
   * - Beli type materials: Increase stock (purchased/acquired during production)
   */
  static async processProductionStockChanges(
    transactionId: string,
    materialUsages: MaterialUsage[],
    userId: string,
    userName: string
  ): Promise<void> {
    try {
      // Process each material usage
      for (const usage of materialUsages) {
        const { materialId, materialType, quantity, materialName, unit } = usage;

        // Get current stock
        const { data: material, error: fetchError } = await supabase
          .from('materials')
          .select('stock')
          .eq('id', materialId)
          .single();

        if (fetchError) {
          throw new Error(`Failed to fetch material ${materialName}: ${fetchError.message}`);
        }

        const currentStock = material.stock;
        let newStock: number;
        let movementType: 'IN' | 'OUT';
        let reason: string;

        // Determine stock change based on material type
        if (materialType === 'Stock') {
          // Stock type: Decrease during production (consumed)
          newStock = currentStock - quantity;
          movementType = 'OUT';
          reason = 'PRODUCTION_CONSUMPTION';
          
          // Check if there's enough stock
          if (newStock < 0) {
            throw new Error(`Insufficient stock for ${materialName}. Current: ${currentStock} ${unit}, Required: ${quantity} ${unit}`);
          }
        } else if (materialType === 'Beli' || materialType === 'Jasa') {
          // Beli/Jasa type: Track usage/consumption (like service contracts, outsourced materials)
          // For service contracts like Astragraphia, we track consumption via stock field
          // Stock represents cumulative consumption/usage, always increasing
          newStock = currentStock + quantity;
          movementType = 'OUT'; // This represents usage/consumption
          reason = 'PRODUCTION_CONSUMPTION';
        } else {
          throw new Error(`Unknown material type: ${materialType}`);
        }

        // Update material stock
        const { error: updateError } = await supabase
          .from('materials')
          .update({ stock: newStock })
          .eq('id', materialId);

        if (updateError) {
          throw new Error(`Failed to update stock for ${materialName}: ${updateError.message}`);
        }

        // Log stock movement (if stock_movements table exists for materials)
        try {
          await supabase
            .from('material_stock_movements')
            .insert({
              material_id: materialId,
              material_name: materialName,
              type: movementType,
              reason: reason,
              quantity: quantity,
              previous_stock: currentStock,
              new_stock: newStock,
              notes: `Production process for transaction ${transactionId}`,
              reference_id: transactionId,
              reference_type: 'transaction',
              user_id: userId,
              user_name: userName,
            });
        } catch (logError) {
          // Log error but don't fail the main operation
          console.warn('Failed to log material stock movement:', logError);
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