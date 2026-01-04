import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ProductionRecord, ProductionInput, BOMItem, ErrorInput } from '@/types/production';
import { Product } from '@/types/product';
import { Material } from '@/types/material';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useBranch } from '@/contexts/BranchContext';
import { format } from 'date-fns';
import { createProductionOutputJournal, createSpoilageJournal, voidJournalEntry } from '@/services/journalService';

// ============================================================================
// CATATAN PENTING: DOUBLE-ENTRY ACCOUNTING SYSTEM
// ============================================================================
// Semua saldo akun HANYA dihitung dari journal_entries (tidak ada update balance langsung)
// Produksi menggunakan createProductionOutputJournal dari journalService:
// - Dr. Persediaan Barang Dagang (1310) - Hasil produksi masuk
// - Cr. Persediaan Bahan Baku (1320)    - Bahan baku keluar
// HPP dicatat saat PENJUALAN, bukan saat produksi
// ============================================================================

export const useProduction = () => {
  const [productions, setProductions] = useState<ProductionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const { currentBranch } = useBranch();

  // Fetch production history - memoized for stability
  const fetchProductions = useCallback(async () => {
    try {
      setIsLoading(true);

      let query = supabase
        .from('production_records')
        .select(`
          *,
          products (name),
          profiles (name)
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      // Apply branch filter - ALWAYS filter by selected branch
      if (currentBranch?.id) {
        query = query.eq('branch_id', currentBranch.id);
      }

      const { data, error } = await query;

      if (error) throw error;

      const formattedData: ProductionRecord[] = data?.map(record => ({
        id: record.id,
        ref: record.ref,
        productId: record.product_id,
        productName: record.product_id ? (record.products?.name || 'Unknown Product') : 'Bahan Rusak',
        quantity: record.quantity,
        note: record.note,
        consumeBOM: record.consume_bom,
        bomSnapshot: record.bom_snapshot ? JSON.parse(record.bom_snapshot) : undefined,
        createdBy: record.created_by,
        createdByName: record.profiles?.name || record.user_input_name || 'Unknown',
        user_input_name: record.user_input_name, // Include for fallback display
        createdAt: new Date(record.created_at),
        updatedAt: new Date(record.updated_at)
      })) || [];

      setProductions(formattedData);
    } catch (error: any) {
      console.error('Error fetching productions:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch production records"
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast, currentBranch]); // Depends on toast and currentBranch for auto-refresh

  // Get BOM for a product - memoized to prevent infinite re-renders
  const getBOM = useCallback(async (productId: string): Promise<BOMItem[]> => {
    try {
      const { data, error } = await supabase
        .from('product_materials')
        .select(`
          *,
          materials (name, unit)
        `)
        .eq('product_id', productId);

      if (error) throw error;

      return data?.map(item => ({
        id: item.id,
        materialId: item.material_id,
        materialName: item.materials?.name || 'Unknown Material',
        quantity: item.quantity,
        unit: item.materials?.unit || 'pcs',
        notes: item.notes
      })) || [];
    } catch (error) {
      console.error('Error fetching BOM:', error);
      return [];
    }
  }, []); // No dependencies needed as this function is pure

  // ============================================================================
  // PROCESS PRODUCTION - Using Atomic RPC (process_production_atomic)
  // This handles: material consume + product batch + journal in one transaction
  // Falls back to legacy method if RPC not deployed
  // ============================================================================
  const processProduction = useCallback(async (input: ProductionInput): Promise<boolean> => {
    try {
      setIsLoading(true);

      // Validate branch
      if (!currentBranch?.id) {
        toast({
          variant: "destructive",
          title: "Branch Tidak Dipilih",
          description: "Silakan pilih branch terlebih dahulu sebelum melakukan produksi."
        });
        return false;
      }

      // Try atomic RPC first
      const { data: rpcResultRaw, error: rpcError } = await supabase
        .rpc('process_production_atomic', {
          p_product_id: input.productId,
          p_quantity: input.quantity,
          p_consume_bom: input.consumeBOM,
          p_note: input.note || null,
          p_branch_id: currentBranch.id,
          p_user_id: input.createdBy,
          p_user_name: user?.name || user?.email || 'Unknown User'
        });

      // Check if RPC exists - if not, fall back to legacy
      if (rpcError?.message?.includes('does not exist')) {
        console.log('⚠️ process_production_atomic RPC not found, using legacy method');
        return await processProductionLegacy(input);
      }

      if (rpcError) throw new Error(rpcError.message);

      const rpcResult = Array.isArray(rpcResultRaw) ? rpcResultRaw[0] : rpcResultRaw;
      if (!rpcResult?.success) {
        throw new Error(rpcResult?.error_message || 'Production failed');
      }

      console.log(`✅ Production completed via RPC:`, {
        ref: rpcResult.production_ref,
        materialCost: rpcResult.total_material_cost,
        journalId: rpcResult.journal_id
      });

      toast({
        title: "Sukses",
        description: `Produksi berhasil. Ref: ${rpcResult.production_ref}`
      });

      // Refresh data
      await fetchProductions();
      window.dispatchEvent(new CustomEvent('production-completed', {
        detail: { productId: input.productId, quantity: input.quantity }
      }));

      return true;
    } catch (error: any) {
      console.error('Error processing production:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Gagal memproses produksi"
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [toast, user, currentBranch, fetchProductions]);

  // Legacy production method (fallback if RPC not deployed yet)
  const processProductionLegacy = useCallback(async (input: ProductionInput): Promise<boolean> => {
    const ref = `PRD-${format(new Date(), 'yyMMdd')}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

    // Get product details
    const { data: productRaw, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('id', input.productId)
      .order('id').limit(1);

    const product = Array.isArray(productRaw) ? productRaw[0] : productRaw;
    if (productError) throw productError;
    if (!product) throw new Error('Product not found');

    // Validate branch match
    if (product.branch_id && product.branch_id !== currentBranch?.id) {
      throw new Error('Product belongs to different branch');
    }

    // Get BOM snapshot if consuming BOM
    let bomSnapshot: BOMItem[] | null = null;
    if (input.consumeBOM) {
      bomSnapshot = await getBOM(input.productId);

      // Validate material stock
      for (const bomItem of bomSnapshot) {
        const requiredQty = bomItem.quantity * input.quantity;
        const { data: materialRaw } = await supabase
          .from('materials')
          .select('stock, name')
          .eq('id', bomItem.materialId)
          .order('id').limit(1);
        const material = Array.isArray(materialRaw) ? materialRaw[0] : materialRaw;

        if (!material || (material.stock || 0) < requiredQty) {
          throw new Error(`Stok ${bomItem.materialName} tidak cukup: butuh ${requiredQty}, tersedia ${material?.stock || 0}`);
        }
      }
    }

    // Create production record
    const { data: productionRecordRaw, error: productionError } = await supabase
      .from('production_records')
      .insert({
        ref,
        product_id: input.productId,
        quantity: input.quantity,
        note: input.note,
        consume_bom: input.consumeBOM,
        bom_snapshot: bomSnapshot ? JSON.stringify(bomSnapshot) : null,
        created_by: input.createdBy,
        user_input_id: input.createdBy,
        user_input_name: user?.name || user?.email || 'Unknown User',
        branch_id: currentBranch?.id || null
      })
      .select()
      .order('id').limit(1);

    const productionRecord = Array.isArray(productionRecordRaw) ? productionRecordRaw[0] : productionRecordRaw;
    if (productionError) throw productionError;
    if (!productionRecord) throw new Error('Failed to create production record');

    // Consume materials and create journal
    if (input.consumeBOM && bomSnapshot) {
      let totalMaterialCost = 0;
      const materialDetails: string[] = [];

      for (const bomItem of bomSnapshot) {
        const requiredQty = bomItem.quantity * input.quantity;

        // Consume via FIFO
        const { data: fifoResultRaw } = await supabase
          .rpc('consume_material_fifo_v2', {
            p_material_id: bomItem.materialId,
            p_quantity: requiredQty,
            p_reference_id: ref,
            p_reference_type: 'production',
            p_branch_id: currentBranch?.id || null,
            p_user_id: input.createdBy,
            p_user_name: user?.name || user?.email || 'Unknown User'
          });
        const fifoResult = Array.isArray(fifoResultRaw) ? fifoResultRaw[0] : fifoResultRaw;

        if (fifoResult?.success && fifoResult.total_cost > 0) {
          totalMaterialCost += fifoResult.total_cost;
          materialDetails.push(`${bomItem.materialName} x${requiredQty} (Rp${Math.round(fifoResult.total_cost)})`);
        }
      }

      // Create journal
      if (totalMaterialCost > 0 && currentBranch?.id) {
        await createProductionOutputJournal({
          productionId: productionRecord.id,
          productionRef: ref,
          productionDate: new Date(),
          amount: totalMaterialCost,
          productName: `${product.name} x${input.quantity}`,
          materialDetails: materialDetails.join(', '),
          branchId: currentBranch.id,
        });
      }

      // Create inventory batch
      const unitCost = totalMaterialCost > 0 ? (totalMaterialCost / input.quantity) : 0;
      await supabase
        .from('inventory_batches')
        .insert({
          product_id: input.productId,
          branch_id: currentBranch?.id,
          initial_quantity: input.quantity,
          remaining_quantity: input.quantity,
          unit_cost: unitCost,
          batch_date: new Date().toISOString(),
          notes: `Produksi ${ref}`,
          production_id: productionRecord.id,
        });
    }

    toast({
      title: "Sukses",
      description: `Produksi berhasil (legacy). Ref: ${ref}`
    });

    await fetchProductions();
    return true;
  }, [toast, user, getBOM, currentBranch, fetchProductions]); // Dependencies for legacy method


  // ============================================================================
  // PROCESS ERROR/SPOILAGE - Using Atomic RPC (process_spoilage_atomic)
  // This handles: material consume + journal in one transaction
  // Falls back to legacy method if RPC not deployed
  // ============================================================================
  const processError = useCallback(async (input: ErrorInput): Promise<boolean> => {
    try {
      setIsLoading(true);

      // Try atomic RPC first
      const { data: rpcResultRaw, error: rpcError } = await supabase
        .rpc('process_spoilage_atomic', {
          p_material_id: input.materialId,
          p_quantity: input.quantity,
          p_note: input.note || null,
          p_branch_id: currentBranch?.id || null,
          p_user_id: input.createdBy,
          p_user_name: user?.name || user?.email || 'Unknown User'
        });

      // Check if RPC exists - if not, fall back to legacy
      if (rpcError?.message?.includes('does not exist')) {
        console.log('⚠️ process_spoilage_atomic RPC not found, using legacy method');
        return await processErrorLegacy(input);
      }

      if (rpcError) throw new Error(rpcError.message);

      const rpcResult = Array.isArray(rpcResultRaw) ? rpcResultRaw[0] : rpcResultRaw;
      if (!rpcResult?.success) {
        throw new Error(rpcResult?.error_message || 'Spoilage processing failed');
      }

      console.log(`✅ Spoilage processed via RPC:`, {
        ref: rpcResult.record_ref,
        cost: rpcResult.spoilage_cost,
        journalId: rpcResult.journal_id
      });

      toast({
        title: "Sukses",
        description: `Bahan rusak ${rpcResult.record_ref} berhasil dicatat.`
      });

      // Refresh productions
      await fetchProductions();
      return true;
    } catch (error: any) {
      console.error('Error processing spoilage:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Gagal mencatat bahan rusak"
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [toast, user, currentBranch, fetchProductions]);

  // Legacy error processing method (fallback if RPC not deployed)
  const processErrorLegacy = useCallback(async (input: ErrorInput): Promise<boolean> => {
    const ref = `ERR-${format(new Date(), 'yyMMdd')}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

    // Get material details
    const { data: materialRaw, error: materialError } = await supabase
      .from('materials')
      .select('*')
      .eq('id', input.materialId)
      .order('id').limit(1);
    const material = Array.isArray(materialRaw) ? materialRaw[0] : materialRaw;

    if (materialError) throw materialError;
    if (!material) throw new Error('Material not found');

    // Consume via FIFO
    let spoilageAmount = 0;
    const { data: fifoResultRaw } = await supabase
      .rpc('consume_material_fifo_v2', {
        p_material_id: input.materialId,
        p_quantity: input.quantity,
        p_reference_id: ref,
        p_reference_type: 'production_error',
        p_branch_id: currentBranch?.id || null,
        p_user_id: input.createdBy,
        p_user_name: user?.name || user?.email || 'Unknown User'
      });
    const fifoResult = Array.isArray(fifoResultRaw) ? fifoResultRaw[0] : fifoResultRaw;

    if (fifoResult?.success && fifoResult.total_cost > 0) {
      spoilageAmount = fifoResult.total_cost;
    } else {
      spoilageAmount = input.quantity * (material.cost_price || material.price_per_unit || 0);
    }

    // Create production record
    const { data: productionRecordRaw, error: productionError } = await supabase
      .from('production_records')
      .insert({
        ref: ref,
        product_id: null,
        quantity: -input.quantity,
        note: `BAHAN RUSAK: ${material.name} - ${input.note || 'Tidak ada catatan'}`,
        consume_bom: false,
        created_by: input.createdBy,
        user_input_id: input.createdBy,
        user_input_name: user?.name || user?.email || 'Unknown User',
        branch_id: currentBranch?.id || null
      })
      .select('id')
      .order('id').limit(1);

    const productionRecord = Array.isArray(productionRecordRaw) ? productionRecordRaw[0] : productionRecordRaw;
    if (productionError) throw productionError;

    // Update materials.stock
    const newStock = Math.max(0, material.stock - input.quantity);
    await supabase
      .from('materials')
      .update({ stock: newStock, updated_at: new Date().toISOString() })
      .eq('id', input.materialId);

    // Create journal
    if (currentBranch?.id && spoilageAmount > 0 && productionRecord) {
      await createSpoilageJournal({
        errorId: productionRecord.id,
        errorRef: ref,
        errorDate: new Date(),
        amount: spoilageAmount,
        materialName: material.name,
        quantity: input.quantity,
        unit: material.unit || 'pcs',
        notes: input.note,
        branchId: currentBranch.id,
      });
    }

    toast({
      title: "Sukses",
      description: `Bahan rusak ${ref} berhasil dicatat (legacy).`
    });

    await fetchProductions();
    return true;
  }, [toast, user, currentBranch, fetchProductions]);


  // Helper function to get appropriate reason for material movement
  const getMaterialMovementReason = (intendedReason: string) => {
    // For now, use ADJUSTMENT as fallback until migration is applied
    // TODO: Remove this when constraint is updated in production
    const supportedReasons = ['PURCHASE', 'PRODUCTION_CONSUMPTION', 'PRODUCTION_ACQUISITION', 'ADJUSTMENT', 'RETURN'];
    
    if (supportedReasons.includes(intendedReason)) {
      return intendedReason;
    }
    
    // Use ADJUSTMENT as fallback and add the intended reason to notes
    return 'ADJUSTMENT';
  };

  // Delete production record (admin/owner only)
  const deleteProduction = useCallback(async (recordId: string): Promise<boolean> => {
    try {
      setIsLoading(true);

      // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
      const { data: recordRaw, error: fetchError } = await supabase
        .from('production_records')
        .select('*')
        .eq('id', recordId)
        .order('id').limit(1);
      const record = Array.isArray(recordRaw) ? recordRaw[0] : recordRaw;

      if (fetchError) throw fetchError;
      if (!record) throw new Error('Production record not found');

      // If normal production, restore material stock via FIFO batch restoration
      if (record.quantity > 0 && record.product_id && record.consume_bom) {
        // ============================================================================
        // RESTORE MATERIAL BATCHES FROM CONSUMPTION LOG
        // When production is deleted, we need to restore the material batches
        // that were consumed. This is done by reading inventory_batch_consumptions
        // and adding back the quantities to the original batches.
        // ============================================================================

        // First, try to restore from consumption log (preferred - FIFO accurate)
        const { data: consumptions } = await supabase
          .from('inventory_batch_consumptions')
          .select('batch_id, quantity_consumed')
          .eq('reference_id', record.ref)
          .eq('reference_type', 'production');

        if (consumptions && consumptions.length > 0) {
          console.log(`📦 Found ${consumptions.length} consumption records to restore`);

          for (const consumption of consumptions) {
            // Restore remaining_quantity to the original batch
            const { error: restoreError } = await supabase
              .from('inventory_batches')
              .update({
                remaining_quantity: supabase.rpc('increment_remaining', {
                  batch_id: consumption.batch_id,
                  qty: consumption.quantity_consumed
                })
              })
              .eq('id', consumption.batch_id);

            // Direct update if RPC doesn't exist
            if (restoreError) {
              // Fallback: direct update
              const { data: batchRaw } = await supabase
                .from('inventory_batches')
                .select('remaining_quantity')
                .eq('id', consumption.batch_id)
                .order('id').limit(1);
              const batch = Array.isArray(batchRaw) ? batchRaw[0] : batchRaw;

              if (batch) {
                const newRemaining = (batch.remaining_quantity || 0) + consumption.quantity_consumed;
                await supabase
                  .from('inventory_batches')
                  .update({
                    remaining_quantity: newRemaining,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', consumption.batch_id);
                console.log(`✅ Batch ${consumption.batch_id} restored: +${consumption.quantity_consumed}`);
              }
            }
          }

          // Delete consumption records
          await supabase
            .from('inventory_batch_consumptions')
            .delete()
            .eq('reference_id', record.ref)
            .eq('reference_type', 'production');

          console.log('✅ Material batch consumptions deleted and restored');
        } else {
          // Fallback: Restore using BOM calculation (less accurate but works if no consumption log)
          console.log('⚠️ No consumption log found, falling back to BOM-based restoration');

          const bom = await getBOM(record.product_id);

          for (const bomItem of bom) {
            const requiredQty = bomItem.quantity * record.quantity;

            // Find the most recent batch for this material and restore to it
            const { data: latestBatchRaw } = await supabase
              .from('inventory_batches')
              .select('id, remaining_quantity')
              .eq('material_id', bomItem.materialId)
              .eq('branch_id', currentBranch?.id)
              .order('batch_date', { ascending: false })
              .limit(1);
            const latestBatch = Array.isArray(latestBatchRaw) ? latestBatchRaw[0] : latestBatchRaw;

            if (latestBatch) {
              const newRemaining = (latestBatch.remaining_quantity || 0) + requiredQty;
              await supabase
                .from('inventory_batches')
                .update({
                  remaining_quantity: newRemaining,
                  updated_at: new Date().toISOString()
                })
                .eq('id', latestBatch.id);
              console.log(`✅ Material ${bomItem.materialName} restored to batch: +${requiredQty}`);
            } else {
              // No batch exists - create a restoration batch
              await supabase
                .from('inventory_batches')
                .insert({
                  material_id: bomItem.materialId,
                  branch_id: currentBranch?.id || null,
                  initial_quantity: requiredQty,
                  remaining_quantity: requiredQty,
                  unit_cost: 0,
                  notes: `Restoration from deleted production ${record.ref}`,
                  batch_date: new Date().toISOString()
                });
              console.log(`✅ Created restoration batch for ${bomItem.materialName}: ${requiredQty}`);
            }
          }
        }

        // Also update materials.stock for backward compatibility (deprecated but some UI may use it)
        const bom = await getBOM(record.product_id);
        for (const bomItem of bom) {
          const requiredQty = bomItem.quantity * record.quantity;
          const { data: materialRaw3 } = await supabase
            .from('materials')
            .select('stock')
            .eq('id', bomItem.materialId)
            .order('id').limit(1);
          const material = Array.isArray(materialRaw3) ? materialRaw3[0] : materialRaw3;

          if (material) {
            const restoredStock = (material.stock || 0) + requiredQty;
            await supabase
              .from('materials')
              .update({
                stock: restoredStock,
                updated_at: new Date().toISOString()
              })
              .eq('id', bomItem.materialId);
          }
        }

        // Delete material movement records
        await supabase
          .from('material_stock_movements')
          .delete()
          .eq('reference_id', record.id)
          .eq('reference_type', 'production')
          .eq('type', 'OUT');

        console.log(`📦 Production delete: Material stock restored via FIFO batch restoration`);
      }

      // ============================================================================
      // ROLLBACK PRODUCTION ACCOUNTING VIA VOID JOURNAL
      // Find and void the journal entry created for this production/error
      // Handles both:
      // 1. Normal production (consume_bom && quantity > 0 && product_id)
      // 2. Bahan rusak/error input (quantity < 0 && !product_id)
      // ============================================================================
      const isNormalProduction = record.consume_bom && record.quantity > 0 && record.product_id;
      const isErrorInput = record.quantity < 0 && !record.product_id;

      if (isNormalProduction || isErrorInput) {
        try {
          // Find journal entry for this production/error
          // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
          const { data: journalEntryRaw } = await supabase
            .from('journal_entries')
            .select('id')
            .eq('reference_id', record.id)
            .eq('reference_type', 'adjustment')
            .eq('is_voided', false)
            .order('id').limit(1);
          const journalEntry = Array.isArray(journalEntryRaw) ? journalEntryRaw[0] : journalEntryRaw;

          if (journalEntry) {
            const voidReason = isErrorInput ? 'Bahan rusak record deleted' : 'Production record deleted';
            const voidResult = await voidJournalEntry(journalEntry.id, voidReason);
            if (voidResult.success) {
              console.log(`✅ ${isErrorInput ? 'Spoilage' : 'Production output'} journal voided:`, journalEntry.id);
            } else {
              console.warn(`⚠️ Failed to void ${isErrorInput ? 'spoilage' : 'production output'} journal:`, voidResult.error);
            }
          }

          // cash_history SUDAH DIHAPUS - tidak perlu delete lagi

          console.log('✅ Production/error accounting reversed');
        } catch (productionRollbackError) {
          console.error('Error reversing production/error accounting:', productionRollbackError);
        }
      }

      // ============================================================================
      // ROLLBACK MATERIAL MOVEMENT FOR BAHAN RUSAK
      // Delete the OUT movement and restore material stock
      // ============================================================================
      if (isErrorInput) {
        try {
          // Parse notes to get material_id (note format: "BAHAN RUSAK: {materialName} - {notes}")
          // We need to find the movement by reference_id
          const { data: movements } = await supabase
            .from('material_stock_movements')
            .select('material_id, quantity')
            .eq('reference_id', record.id)
            .eq('reference_type', 'production')
            .eq('type', 'OUT');

          if (movements && movements.length > 0) {
            for (const movement of movements) {
              // Restore material stock
              const { data: materialRaw } = await supabase
                .from('materials')
                .select('stock')
                .eq('id', movement.material_id)
                .order('id').limit(1);
              const material = Array.isArray(materialRaw) ? materialRaw[0] : materialRaw;

              if (material) {
                const restoredStock = (material.stock || 0) + movement.quantity;
                await supabase
                  .from('materials')
                  .update({ stock: restoredStock, updated_at: new Date().toISOString() })
                  .eq('id', movement.material_id);
                console.log(`✅ Material stock restored: +${movement.quantity}`);
              }

              // Delete the movement record
              await supabase
                .from('material_stock_movements')
                .delete()
                .eq('reference_id', record.id)
                .eq('material_id', movement.material_id);
              console.log('✅ Material movement record deleted');
            }
          }
        } catch (errorRollbackError) {
          console.error('Error reversing bahan rusak material movement:', errorRollbackError);
        }
      }

      // ============================================================================
      // DELETE INVENTORY BATCH FOR THIS PRODUCTION
      // This removes the product batch created during production
      // Uses notes field to match "Produksi {ref}" pattern
      // ============================================================================
      if (isNormalProduction && record.ref) {
        try {
          const { error: batchDeleteError } = await supabase
            .from('inventory_batches')
            .delete()
            .eq('product_id', record.product_id)
            .eq('notes', `Produksi ${record.ref}`);

          if (batchDeleteError) {
            console.warn('⚠️ Failed to delete inventory batch:', batchDeleteError);
          } else {
            console.log('✅ Inventory batch deleted for production:', record.ref);
          }
        } catch (batchError) {
          console.error('Error deleting inventory batch:', batchError);
        }
      }

      const { error: deleteError } = await supabase
        .from('production_records')
        .delete()
        .eq('id', recordId);

      if (deleteError) throw deleteError;

      toast({
        title: "Sukses",
        description: "Data produksi dihapus, stock dikembalikan, dan HPP disesuaikan"
      });

      // Invalidate related queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ['materialMovements'] });
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });

      fetchProductions();

      return true;
    } catch (error: any) {
      console.error('Error deleting production:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Gagal menghapus data produksi"
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user, getBOM, toast, fetchProductions, queryClient, currentBranch]);

  useEffect(() => {
    fetchProductions();
  }, [fetchProductions]);

  return {
    productions,
    isLoading,
    getBOM,
    processProduction,
    processError,
    deleteProduction,
    refreshProductions: fetchProductions
  };
};