import { supabase } from '@/integrations/supabase/client'
import { Transaction } from '@/types/transaction'
import { Material } from '@/types/material'
import { MaterialMovement, CreateMaterialMovementData } from '@/types/materialMovement'

export class MaterialMovementService {
  
  /**
   * Generate material movements from a completed transaction
   * This should be called when transaction status changes to 'Proses Produksi' or 'Pesanan Selesai'
   */
  static async generateMovementsFromTransaction(
    transaction: Transaction, 
    materials: Material[]
  ): Promise<void> {
    const movements: CreateMaterialMovementData[] = [];

    // Process each item in the transaction
    for (const item of transaction.items) {
      if (!item.product.materials || item.product.materials.length === 0) {
        continue; // Skip products without BOM
      }

      // Calculate material consumption for each material in the BOM
      for (const productMaterial of item.product.materials) {
        const material = materials.find(m => m.id === productMaterial.materialId);
        if (!material) continue;

        const totalMaterialUsed = productMaterial.quantity * item.quantity;
        const currentStock = material.stock || 0;
        const newStock = Math.max(0, currentStock - totalMaterialUsed);

        const movement: CreateMaterialMovementData = {
          materialId: productMaterial.materialId,
          materialName: material.name,
          type: 'OUT',
          reason: 'PRODUCTION_CONSUMPTION',
          quantity: totalMaterialUsed,
          previousStock: currentStock,
          newStock: newStock,
          referenceId: transaction.id,
          referenceType: 'transaction',
          notes: `Digunakan untuk produksi ${item.product.name} (${item.quantity} unit) - Order: ${transaction.id}`,
          userId: transaction.cashierId,
          userName: transaction.cashierName,
        };

        movements.push(movement);
      }
    }

    // Save all movements to database
    if (movements.length > 0) {
      await this.createMaterialMovements(movements);
      // Also update material stock
      await this.updateMaterialStocks(movements);
    }
  }

  /**
   * Create material movement records in database
   */
  private static async createMaterialMovements(movements: CreateMaterialMovementData[]): Promise<void> {
    const dbMovements = movements.map(movement => ({
      material_id: movement.materialId,
      material_name: movement.materialName,
      type: movement.type,
      reason: movement.reason,
      quantity: movement.quantity,
      previous_stock: movement.previousStock,
      new_stock: movement.newStock,
      reference_id: movement.referenceId,
      reference_type: movement.referenceType,
      notes: movement.notes,
      user_id: movement.userId,
      user_name: movement.userName,
    }));

    const { error } = await supabase
      .from('material_stock_movements')
      .insert(dbMovements);

    if (error) {
      console.error('Failed to create material movements:', error);
      throw new Error(`Failed to create material movements: ${error.message}`);
    }
  }

  /**
   * Update material stock based on movements
   */
  private static async updateMaterialStocks(movements: CreateMaterialMovementData[]): Promise<void> {
    for (const movement of movements) {
      const { error } = await supabase
        .from('materials')
        .update({ stock: movement.newStock })
        .eq('id', movement.materialId);

      if (error) {
        console.error(`Failed to update stock for material ${movement.materialId}:`, error);
        throw new Error(`Failed to update material stock: ${error.message}`);
      }
    }
  }

  /**
   * Get material movements with transaction data for reporting
   */
  static async getMaterialMovementsWithTransactions(
    dateFrom?: Date,
    dateTo?: Date
  ): Promise<any[]> {
    let query = supabase
      .from('material_stock_movements')
      .select(`
        *,
        materials!inner(name, type, unit, price_per_unit)
      `)
      .order('created_at', { ascending: false });

    if (dateFrom) {
      query = query.gte('created_at', dateFrom.toISOString());
    }
    if (dateTo) {
      query = query.lte('created_at', dateTo.toISOString());
    }

    const { data: movements, error } = await query;
    
    if (error) {
      console.error('Error fetching material movements:', error);
      return [];
    }

    // Enrich with transaction data
    const enrichedMovements = await Promise.all(
      (movements || []).map(async (movement) => {
        let transactionData = null;
        
        if (movement.reference_type === 'transaction' && movement.reference_id) {
          const { data: transaction } = await supabase
            .from('transactions')
            .select('id, customer_name, order_date, status')
            .eq('id', movement.reference_id)
            .single();
          
          transactionData = transaction;
        }

        return {
          ...movement,
          transactionData,
          materialName: movement.material_name,
        };
      })
    );

    return enrichedMovements;
  }
}