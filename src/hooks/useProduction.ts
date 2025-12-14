import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ProductionRecord, ProductionInput, BOMItem, ErrorInput } from '@/types/production';
import { Product } from '@/types/product';
import { Material } from '@/types/material';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';

export const useProduction = () => {
  const [productions, setProductions] = useState<ProductionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  // Fetch production history - memoized for stability
  const fetchProductions = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('production_records')
        .select(`
          *,
          products (name),
          profiles (name)
        `)
        .order('created_at', { ascending: false })
        .limit(50);

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
  }, [toast]); // Only depends on toast

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
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('*')
        .eq('id', input.productId)
        .single();

      if (productError) throw productError;

      // Get BOM snapshot if consuming BOM
      let bomSnapshot: BOMItem[] | null = null;
      if (input.consumeBOM) {
        bomSnapshot = await getBOM(input.productId);
      }

      // Start transaction
      const { data: productionRecord, error: productionError } = await supabase
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
          user_input_name: user?.name || user?.email || 'Unknown User'
        })
        .select()
        .single();

      if (productionError) throw productionError;

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
          const { data: material, error: materialError } = await supabase
            .from('materials')
            .select('stock')
            .eq('id', bomItem.materialId)
            .single();

          if (materialError) {
            console.warn(`Could not fetch material ${bomItem.materialId}:`, materialError);
            continue;
          }

          console.log(`Current stock for ${bomItem.materialName}: ${material.stock}`);

          // Check if there's enough stock
          if (material.stock < requiredQty) {
            toast({
              variant: "destructive",
              title: "Warning",
              description: `Insufficient stock for ${bomItem.materialName}. Required: ${requiredQty}, Available: ${material.stock}`
            });
            // Continue anyway - just log the warning
          }

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
                user_name: user?.name || user?.email || 'Unknown User'
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
      const { data: material, error: materialError } = await supabase
        .from('materials')
        .select('*')
        .eq('id', input.materialId)
        .single();

      if (materialError) throw materialError;

      // Calculate new stock first
      const newStock = Math.max(0, material.stock - input.quantity);

      // Use a transaction-like approach: batch the operations
      const operations = [];

      // 1. Record error entry directly in production_records table
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
            user_input_name: user?.name || user?.email || 'Unknown User'
          })
          .select('id')
          .single()
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

      const productionRecord = productionResult.value.data;
      if (productionResult.value.error) throw productionResult.value.error;
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
            user_name: user?.name || user?.email || 'Unknown User'
          });

        if (movementError) {
          console.warn('Failed to record material movement:', movementError);
          // Don't throw - the main operation (stock update) succeeded
        }
      } catch (movementErr) {
        console.warn('Error recording material movement:', movementErr);
        // Continue - main operation succeeded
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

      const { data: record, error: fetchError } = await supabase
        .from('production_records')
        .select('*')
        .eq('id', recordId)
        .single();

      if (fetchError) throw fetchError;

      // If normal production, restore stock
      if (record.quantity > 0 && record.product_id) {
        const bom = await getBOM(record.product_id);
        
        for (const bomItem of bom) {
          const requiredQty = bomItem.quantity * record.quantity;
          
          const { data: material, error: materialError } = await supabase
            .from('materials')
            .select('stock')
            .eq('id', bomItem.materialId)
            .single();

          if (!materialError && material) {
            const restoredStock = material.stock + requiredQty;
            await supabase
              .from('materials')
              .update({
                stock: restoredStock,
                updated_at: new Date().toISOString()
              })
              .eq('id', bomItem.materialId);

            await supabase
              .from('material_stock_movements')
              .insert({
                material_id: bomItem.materialId,
                material_name: bomItem.materialName,
                type: 'IN',
                reason: 'ADJUSTMENT', // Use existing reason until migration is applied
                quantity: requiredQty,
                previous_stock: material.stock,
                new_stock: restoredStock,
                notes: `PRODUCTION_DELETE_RESTORE: Production delete restore: ${record.ref}`,
                reference_id: record.id,
                reference_type: 'production',
                user_id: user?.id,
                user_name: user?.name || user?.email || 'Unknown User'
              });
          }
        }

        const { data: product, error: productError } = await supabase
          .from('products')
          .select('current_stock')
          .eq('id', record.product_id)
          .single();

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

      const { error: deleteError } = await supabase
        .from('production_records')
        .delete()
        .eq('id', recordId);

      if (deleteError) throw deleteError;

      toast({
        title: "Sukses",
        description: "Data produksi dihapus dan stock dikembalikan"
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