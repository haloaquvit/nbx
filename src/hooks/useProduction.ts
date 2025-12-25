import { useState, useEffect, useCallback } from 'react';
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

  // Process production - memoized for stability
  const processProduction = useCallback(async (input: ProductionInput): Promise<boolean> => {
    try {
      setIsLoading(true);

      // Generate production reference
      const ref = `PRD-${format(new Date(), 'yyMMdd')}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

      // Get product details
      // Use .limit(1) and handle array response because our client forces Accept: application/json
      const { data: productRaw, error: productError } = await supabase
        .from('products')
        .select('*')
        .eq('id', input.productId)
        .limit(1);

      const product = Array.isArray(productRaw) ? productRaw[0] : productRaw;
      if (productError) throw productError;
      if (!product) throw new Error('Product not found');

      // Get BOM snapshot if consuming BOM
      let bomSnapshot: BOMItem[] | null = null;
      if (input.consumeBOM) {
        bomSnapshot = await getBOM(input.productId);

        // ============================================================================
        // VALIDASI STOK MATERIAL SEBELUM PRODUKSI
        // Produksi dibatalkan jika stok material tidak mencukupi
        // ============================================================================
        const insufficientMaterials: { name: string; required: number; available: number }[] = [];

        for (const bomItem of bomSnapshot) {
          const requiredQty = bomItem.quantity * input.quantity;

          // Get current material stock
          // Use .limit(1) and handle array response because our client forces Accept: application/json
          const { data: materialRaw, error: materialError } = await supabase
            .from('materials')
            .select('stock, name')
            .eq('id', bomItem.materialId)
            .limit(1);
          const material = Array.isArray(materialRaw) ? materialRaw[0] : materialRaw;

          if (materialError || !material) {
            console.error(`Could not fetch material ${bomItem.materialId}:`, materialError);
            insufficientMaterials.push({
              name: bomItem.materialName,
              required: requiredQty,
              available: 0
            });
            continue;
          }

          // Check if there's enough stock
          if ((material.stock || 0) < requiredQty) {
            insufficientMaterials.push({
              name: bomItem.materialName,
              required: requiredQty,
              available: material.stock || 0
            });
          }
        }

        // Jika ada material yang stoknya kurang, batalkan produksi
        if (insufficientMaterials.length > 0) {
          const errorMessages = insufficientMaterials.map(m =>
            `${m.name}: butuh ${m.required}, tersedia ${m.available}`
          ).join('\n');

          toast({
            variant: "destructive",
            title: "Stok Material Tidak Cukup",
            description: `Produksi dibatalkan karena stok material tidak mencukupi:\n${errorMessages}`
          });

          console.error('❌ Production cancelled due to insufficient material stock:', insufficientMaterials);
          return false;
        }

        console.log('✅ Material stock validation passed - all materials have sufficient stock');
      }

      // Start transaction
      // Use .limit(1) and handle array response because our client forces Accept: application/json
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
        .limit(1);

      const productionRecord = Array.isArray(productionRecordRaw) ? productionRecordRaw[0] : productionRecordRaw;
      if (productionError) throw productionError;
      if (!productionRecord) throw new Error('Failed to create production record');

      // Update product stock
      const newStock = (product.current_stock || 0) + input.quantity;
      console.log(`Updating product ${input.productId} stock from ${product.current_stock} to ${newStock}`);
      
      const { error: stockError } = await supabase
        .from('products')
        .update({
          current_stock: newStock,
          updated_at: new Date().toISOString()
        })
        .eq('id', input.productId);

      if (stockError) {
        console.error('Error updating product stock:', stockError);
        throw stockError;
      }

      console.log('Product stock updated successfully');

      // If consume BOM is enabled, reduce material stocks
      if (input.consumeBOM) {
        console.log('Consuming BOM for production...');
        const bom = await getBOM(input.productId);
        console.log('BOM items:', bom);
        
        for (const bomItem of bom) {
          const requiredQty = bomItem.quantity * input.quantity;
          console.log(`Processing BOM item: ${bomItem.materialName}, required qty: ${requiredQty}`);
          
          // Get current material stock
          // Use .limit(1) and handle array response because our client forces Accept: application/json
          const { data: materialRaw2, error: materialError } = await supabase
            .from('materials')
            .select('stock')
            .eq('id', bomItem.materialId)
            .limit(1);
          const material = Array.isArray(materialRaw2) ? materialRaw2[0] : materialRaw2;

          if (materialError || !material) {
            console.warn(`Could not fetch material ${bomItem.materialId}:`, materialError);
            continue;
          }

          console.log(`Current stock for ${bomItem.materialName}: ${material.stock}`);

          // Note: Stock validation sudah dilakukan di awal processProduction
          // Jika sampai di sini, stok pasti cukup

          // Update material stock
          const newMaterialStock = Math.max(0, material.stock - requiredQty);
          console.log(`Updating ${bomItem.materialName} stock from ${material.stock} to ${newMaterialStock}`);
          
          const { error: updateError } = await supabase
            .from('materials')
            .update({
              stock: newMaterialStock,
              updated_at: new Date().toISOString()
            })
            .eq('id', bomItem.materialId);

          if (updateError) {
            console.error(`Could not update material stock for ${bomItem.materialId}:`, updateError);
          } else {
            console.log(`Successfully updated stock for ${bomItem.materialName}`);
          }

          // Record material movement using correct table and schema
          try {
            const { error: movementError } = await supabase
              .from('material_stock_movements')
              .insert({
                material_id: bomItem.materialId,
                material_name: bomItem.materialName,
                type: 'OUT',
                reason: 'PRODUCTION_CONSUMPTION',
                quantity: requiredQty,
                previous_stock: material.stock,
                new_stock: newMaterialStock,
                notes: `Production: ${ref} (${product.name})`,
                reference_id: productionRecord.id,
                reference_type: 'production',
                user_id: input.createdBy,
                user_name: user?.name || user?.email || 'Unknown User',
                branch_id: currentBranch?.id || null
              });

            if (movementError) {
              console.error(`Error recording material movement for ${bomItem.materialName}:`, movementError);
            } else {
              console.log(`Successfully recorded material movement for ${bomItem.materialName}`);
            }
          } catch (movementRecordError) {
            console.error('Error recording material movement:', movementRecordError);
          }
        }

        // ============================================================================
        // PRODUCTION OUTPUT ACCOUNTING VIA JOURNAL + FIFO CONSUMPTION
        // Auto-generate journal:
        // Dr. Persediaan Barang Dagang (1310) - Hasil produksi masuk ke inventori
        // Cr. Persediaan Bahan Baku (1320)    - Bahan baku keluar dari inventori
        //
        // Note: HPP dicatat saat PENJUALAN, bukan saat produksi
        // FIFO: Harga bahan baku diambil dari batch tertua (harga beli dari PO)
        // ============================================================================
        try {
          // Calculate total material cost consumed using FIFO
          let totalMaterialCost = 0;
          const materialDetails: string[] = [];

          for (const bomItem of bom) {
            const requiredQty = bomItem.quantity * input.quantity;

            // Try FIFO consumption first - this will use actual purchase prices
            // Use .limit(1) and handle array response because our client forces Accept: application/json
            const { data: fifoResultRaw, error: fifoError } = await supabase
              .rpc('consume_inventory_fifo', {
                p_product_id: null,
                p_branch_id: currentBranch?.id || null,
                p_quantity: requiredQty,
                p_transaction_id: ref,
                p_material_id: bomItem.materialId
              })
              .limit(1);
            const fifoResult = Array.isArray(fifoResultRaw) ? fifoResultRaw[0] : fifoResultRaw;

            if (!fifoError && fifoResult && fifoResult.total_hpp > 0) {
              // FIFO berhasil - gunakan harga dari batch
              const materialCost = fifoResult.total_hpp;
              totalMaterialCost += materialCost;
              materialDetails.push(`${bomItem.materialName} x${requiredQty} (FIFO: Rp${Math.round(materialCost).toLocaleString()})`);
              console.log(`✅ FIFO consumed for ${bomItem.materialName}: ${requiredQty} units @ Rp${Math.round(materialCost / requiredQty)}/unit = Rp${Math.round(materialCost)}`);
            } else {
              // Fallback: Get material cost price from materials table
              console.log(`⚠️ FIFO fallback for ${bomItem.materialName}:`, fifoError?.message || 'No batches available');

              // Use .limit(1) and handle array response because our client forces Accept: application/json
              const { data: materialDataRaw } = await supabase
                .from('materials')
                .select('cost_price, price_per_unit, name')
                .eq('id', bomItem.materialId)
                .limit(1);
              const materialData = Array.isArray(materialDataRaw) ? materialDataRaw[0] : materialDataRaw;

              // Use cost_price if available, otherwise fallback to price_per_unit
              const unitCost = materialData?.cost_price || materialData?.price_per_unit || 0;
              const materialCost = unitCost * requiredQty;
              totalMaterialCost += materialCost;
              materialDetails.push(`${bomItem.materialName} x${requiredQty}`);
            }
          }

          if (totalMaterialCost > 0 && currentBranch?.id) {
            const journalResult = await createProductionOutputJournal({
              productionId: productionRecord.id,
              productionRef: ref,
              productionDate: new Date(),
              amount: totalMaterialCost,
              productName: `${product.name} x${input.quantity}`,
              materialDetails: materialDetails.join(', '),
              branchId: currentBranch.id,
            });

            if (journalResult.success) {
              console.log('✅ Production output journal auto-generated:', journalResult.journalId);
            } else {
              console.warn('⚠️ Failed to create production output journal:', journalResult.error);
            }

            // Record in cash_history for audit trail (MONITORING ONLY)
            try {
              await supabase
                .from('cash_history')
                .insert({
                  account_id: null,
                  type: 'produksi',
                  amount: totalMaterialCost,
                  description: `Produksi ${ref}: ${materialDetails.join(', ')} -> ${product.name} x${input.quantity}`,
                  reference_id: productionRecord.id,
                  reference_name: `Produksi ${ref}`,
                  branch_id: currentBranch.id,
                  source_type: 'production',
                });
            } catch (historyError) {
              console.warn('cash_history recording failed (non-critical):', historyError);
            }
          }
        } catch (productionAccountingError) {
          console.error('Error creating production output accounting:', productionAccountingError);
          // Don't fail production if accounting fails
        }
      }

      toast({
        title: "Success",
        description: `Production completed successfully. Ref: ${ref}`
      });

      // Refresh data - invalidate all related caches
      await fetchProductions();
      
      // Trigger refresh of products and materials data in other components
      window.dispatchEvent(new CustomEvent('production-completed', { 
        detail: { productId: input.productId, quantity: input.quantity } 
      }));
      
      return true;
    } catch (error: any) {
      console.error('Error processing production:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to process production"
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [toast, user, getBOM]); // Dependencies: toast for error messages, user for created_by, getBOM function


  // Process error input
  const processError = useCallback(async (input: ErrorInput): Promise<boolean> => {
    try {
      setIsLoading(true);

      // Generate error reference
      const ref = `ERR-${format(new Date(), 'yyMMdd')}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

      // Get material details
      // Use .limit(1) and handle array response because our client forces Accept: application/json
      const { data: materialRaw, error: materialError } = await supabase
        .from('materials')
        .select('*')
        .eq('id', input.materialId)
        .limit(1);
      const material = Array.isArray(materialRaw) ? materialRaw[0] : materialRaw;

      if (materialError) throw materialError;
      if (!material) throw new Error('Material not found');

      // Calculate new stock first
      const newStock = Math.max(0, material.stock - input.quantity);

      // Use a transaction-like approach: batch the operations
      const operations = [];

      // 1. Record error entry directly in production_records table
      // Use .limit(1) instead of .single() because our client forces Accept: application/json
      operations.push(
        supabase
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
          .limit(1)
      );

      // 2. Reduce material stock
      operations.push(
        supabase
          .from('materials')
          .update({
            stock: newStock,
            updated_at: new Date().toISOString()
          })
          .eq('id', input.materialId)
      );

      // Execute the first two critical operations
      const [productionResult, stockResult] = await Promise.allSettled(operations);

      if (productionResult.status === 'rejected') {
        throw productionResult.reason;
      }
      if (stockResult.status === 'rejected') {
        throw stockResult.reason;
      }

      const productionRecordData = productionResult.value.data;
      const productionRecord = Array.isArray(productionRecordData) ? productionRecordData[0] : productionRecordData;
      if (productionResult.value.error) throw productionResult.value.error;
      if (!productionRecord) throw new Error('Failed to create production record');
      if (stockResult.value.error) throw stockResult.value.error;

      // 3. Record material movement (non-critical - can fail without breaking the process)
      try {
        const { error: movementError } = await supabase
          .from('material_stock_movements')
          .insert({
            material_id: input.materialId,
            material_name: material.name,
            type: 'OUT',
            reason: 'PRODUCTION_ERROR',
            quantity: input.quantity,
            previous_stock: material.stock,
            new_stock: newStock,
            notes: `PRODUCTION_ERROR: Bahan rusak: ${ref} (${material.name})`,
            reference_id: productionRecord.id,
            reference_type: 'production',
            user_id: input.createdBy,
            user_name: user?.name || user?.email || 'Unknown User',
            branch_id: currentBranch?.id || null
          });

        if (movementError) {
          console.warn('Failed to record material movement:', movementError);
          // Don't throw - the main operation (stock update) succeeded
        }
      } catch (movementErr) {
        console.warn('Error recording material movement:', movementErr);
        // Continue - main operation succeeded
      }

      // 4. Create journal entry for spoilage (Dr. Beban Bahan Rusak, Cr. Persediaan)
      if (currentBranch?.id) {
        try {
          // Calculate spoilage amount based on material price
          const spoilageAmount = input.quantity * (material.price_per_unit || 0);

          if (spoilageAmount > 0) {
            const journalResult = await createSpoilageJournal({
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

            if (journalResult.success) {
              console.log('✅ Jurnal bahan rusak auto-generated:', journalResult.journalId);
            } else {
              console.warn('⚠️ Gagal membuat jurnal bahan rusak:', journalResult.error);
            }
          } else {
            console.warn('⚠️ Skipping journal - material price is 0');
          }
        } catch (journalError) {
          console.error('Error creating spoilage journal:', journalError);
          // Don't fail the whole operation - journal is secondary
        }
      }

      toast({
        title: "Sukses",
        description: `Bahan rusak ${ref} berhasil dicatat. Stock ${material.name} berkurang ${input.quantity}.`
      });

      // Refresh productions in background - don't wait for it
      setTimeout(() => {
        fetchProductions().catch(err => 
          console.warn('Failed to refresh productions after error input:', err)
        );
      }, 100);
      
      return true;
    } catch (error: any) {
      console.error('Error processing error input:', error);
      
      // Handle different types of errors
      let errorMessage = "Gagal mencatat bahan rusak";
      let errorTitle = "Error";
      
      if (error.message && error.message.includes('Failed to fetch')) {
        // Network error - data might still be saved
        errorTitle = "Peringatan Jaringan";
        errorMessage = "Koneksi terputus. Periksa apakah data sudah tersimpan dengan memuat ulang halaman.";
      } else if (error.code === '23514') {
        // Check constraint error
        errorMessage = "Error validasi data. Periksa constraint database.";
      } else if (error.code === '42P01') {
        // Table doesn't exist
        errorMessage = "Tabel tidak ditemukan. Jalankan migrasi database.";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        variant: "destructive",
        title: errorTitle,
        description: errorMessage
      });
      
      // Even if there's an error, the data might have been saved
      // Return false only for critical errors
      if (error.message && error.message.includes('Failed to fetch')) {
        // For network errors, still refresh to see if data was saved
        setTimeout(() => {
          fetchProductions().catch(console.warn);
        }, 1000);
      }
      
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [toast, user]);

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

      // Use .limit(1) and handle array response because our client forces Accept: application/json
      const { data: recordRaw, error: fetchError } = await supabase
        .from('production_records')
        .select('*')
        .eq('id', recordId)
        .limit(1);
      const record = Array.isArray(recordRaw) ? recordRaw[0] : recordRaw;

      if (fetchError) throw fetchError;
      if (!record) throw new Error('Production record not found');

      // If normal production, restore stock
      if (record.quantity > 0 && record.product_id) {
        const bom = await getBOM(record.product_id);

        for (const bomItem of bom) {
          const requiredQty = bomItem.quantity * record.quantity;

          // Use .limit(1) and handle array response because our client forces Accept: application/json
          const { data: materialRaw3, error: materialError } = await supabase
            .from('materials')
            .select('stock')
            .eq('id', bomItem.materialId)
            .limit(1);
          const material = Array.isArray(materialRaw3) ? materialRaw3[0] : materialRaw3;

          if (!materialError && material) {
            const restoredStock = material.stock + requiredQty;
            await supabase
              .from('materials')
              .update({
                stock: restoredStock,
                updated_at: new Date().toISOString()
              })
              .eq('id', bomItem.materialId);

            // DELETE the original OUT movement instead of creating IN movement
            // This ensures HPP is correctly reduced in financial reports
            const { error: deleteMovementError } = await supabase
              .from('material_stock_movements')
              .delete()
              .eq('reference_id', record.id)
              .eq('reference_type', 'production')
              .eq('material_id', bomItem.materialId)
              .eq('type', 'OUT');

            if (deleteMovementError) {
              console.warn('Could not delete material movement:', deleteMovementError);
              // Fallback: create IN movement if delete fails
              await supabase
                .from('material_stock_movements')
                .insert({
                  material_id: bomItem.materialId,
                  material_name: bomItem.materialName,
                  type: 'IN',
                  reason: 'ADJUSTMENT',
                  quantity: requiredQty,
                  previous_stock: material.stock,
                  new_stock: restoredStock,
                  notes: `PRODUCTION_DELETE_RESTORE: Production delete restore: ${record.ref}`,
                  reference_id: record.id,
                  reference_type: 'production',
                  user_id: user?.id,
                  user_name: user?.name || user?.email || 'Unknown User',
                  branch_id: currentBranch?.id || null
                });
            }
          }
        }

        // Use .limit(1) and handle array response because our client forces Accept: application/json
        const { data: productRaw2, error: productError } = await supabase
          .from('products')
          .select('current_stock')
          .eq('id', record.product_id)
          .limit(1);
        const product = Array.isArray(productRaw2) ? productRaw2[0] : productRaw2;

        if (!productError && product) {
          const newProductStock = Math.max(0, product.current_stock - record.quantity);
          await supabase
            .from('products')
            .update({
              current_stock: newProductStock,
              updated_at: new Date().toISOString()
            })
            .eq('id', record.product_id);
        }
      }

      // ============================================================================
      // ROLLBACK PRODUCTION ACCOUNTING VIA VOID JOURNAL
      // Find and void the journal entry created for this production
      // ============================================================================
      if (record.consume_bom && record.quantity > 0 && record.product_id) {
        try {
          // Find journal entry for this production
          // Use .limit(1) and handle array response because our client forces Accept: application/json
          const { data: journalEntryRaw } = await supabase
            .from('journal_entries')
            .select('id')
            .eq('reference_id', record.id)
            .eq('reference_type', 'adjustment')
            .eq('is_voided', false)
            .limit(1);
          const journalEntry = Array.isArray(journalEntryRaw) ? journalEntryRaw[0] : journalEntryRaw;

          if (journalEntry) {
            const voidResult = await voidJournalEntry(journalEntry.id, 'Production record deleted');
            if (voidResult.success) {
              console.log('✅ Production output journal voided:', journalEntry.id);
            } else {
              console.warn('⚠️ Failed to void production output journal:', voidResult.error);
            }
          }

          // Delete cash_history record for this production
          await supabase
            .from('cash_history')
            .delete()
            .eq('reference_id', record.id);

          console.log('✅ Production accounting reversed');
        } catch (productionRollbackError) {
          console.error('Error reversing production accounting:', productionRollbackError);
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
  }, [user, getBOM, toast, fetchProductions]);

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