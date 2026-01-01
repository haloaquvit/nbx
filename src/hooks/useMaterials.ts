import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Material } from '@/types/material'
import { supabase } from '@/integrations/supabase/client'
import { useBranch } from '@/contexts/BranchContext'
import { createMaterialStockAdjustmentJournal } from '@/services/journalService'

const fromDbToApp = (dbMaterial: any): Material => ({
  id: dbMaterial.id,
  name: dbMaterial.name,
  type: dbMaterial.type || 'Stock', // Default to Stock if not set (field may not exist yet)
  unit: dbMaterial.unit,
  pricePerUnit: dbMaterial.price_per_unit,
  stock: dbMaterial.stock,
  minStock: dbMaterial.min_stock,
  description: dbMaterial.description,
  createdAt: new Date(dbMaterial.created_at),
  updatedAt: new Date(dbMaterial.updated_at),
});

const fromAppToDb = (appMaterial: Partial<Omit<Material, 'id' | 'createdAt' | 'updatedAt'>>) => {
  const { pricePerUnit, minStock, type, ...rest } = appMaterial;
  const dbData: any = { ...rest };
  if (pricePerUnit !== undefined) {
    dbData.price_per_unit = pricePerUnit;
  }
  if (minStock !== undefined) {
    dbData.min_stock = minStock;
  }
  // Skip type field as it doesn't exist in database yet
  // if (type !== undefined) {
  //   dbData.type = type;
  // }
  return dbData;
};

export const useMaterials = () => {
  const queryClient = useQueryClient();
  const { currentBranch, canAccessAllBranches } = useBranch();

  const { data: materials, isLoading } = useQuery<Material[]>({
    queryKey: ['materials', currentBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('materials')
        .select('*');

      // Apply branch filter - include branch-specific OR shared materials (branch_id is null)
      if (currentBranch?.id) {
        query = query.or(`branch_id.eq.${currentBranch.id},branch_id.is.null`);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data ? data.map(fromDbToApp) : [];
    },
    enabled: !!currentBranch,
    // Optimized for material management pages
    staleTime: 5 * 60 * 1000, // 5 minutes - materials change more frequently than products
    gcTime: 10 * 60 * 1000, // 10 minutes cache
    refetchOnWindowFocus: false, // Don't refetch on window focus
    refetchOnReconnect: false, // Don't refetch on reconnect
    retry: 1, // Only retry once
    retryDelay: 1000,
  });

  const addStock = useMutation({
    mutationFn: async ({ materialId, quantity }: { materialId: string, quantity: number }): Promise<Material> => {
      console.log('[addStock] Calling RPC with:', { materialId, quantity });

      // Simplified: just add stock using the RPC function
      // Type handling will be implemented when database migration is complete
      const { data, error } = await supabase.rpc('add_material_stock', {
        material_id: materialId,
        quantity_to_add: quantity
      });

      if (error) {
        console.error('[addStock] RPC error:', error);
        throw new Error(error.message);
      }

      console.log('[addStock] RPC call successful, response:', data);

      // Fetch the updated material to verify the update
      // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
      const { data: updatedMaterialRaw, error: fetchError } = await supabase
        .from('materials')
        .select('*')
        .eq('id', materialId)
        .order('id').limit(1);

      const updatedMaterial = Array.isArray(updatedMaterialRaw) ? updatedMaterialRaw[0] : updatedMaterialRaw;
      if (fetchError) {
        console.error('[addStock] Error fetching updated material:', fetchError);
      } else if (updatedMaterial) {
        console.log('[addStock] Updated material stock:', updatedMaterial.stock);
      }

      return {} as Material;
    },
    onSuccess: () => {
      console.log('[addStock] Success! Invalidating materials query...');
      queryClient.invalidateQueries({ queryKey: ['materials'] });
    },
  });

  const upsertMaterial = useMutation({
    mutationFn: async (material: Partial<Material>): Promise<Material> => {
      const dbData = {
        ...fromAppToDb(material),
        branch_id: currentBranch?.id || null,
      };

      // Get existing material data to check stock changes
      let oldStock = 0;
      let oldPricePerUnit = 0;
      if (material.id) {
        const { data: existingRaw } = await supabase
          .from('materials')
          .select('stock, price_per_unit, name')
          .eq('id', material.id)
          .order('id').limit(1);
        const existing = Array.isArray(existingRaw) ? existingRaw[0] : existingRaw;
        if (existing) {
          oldStock = Number(existing.stock) || 0;
          oldPricePerUnit = Number(existing.price_per_unit) || 0;
        }
      }

      // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
      const { data: dataRaw, error } = await supabase
        .from('materials')
        .upsert(dbData)
        .select()
        .order('id').limit(1);
      if (error) throw new Error(error.message);
      const data = Array.isArray(dataRaw) ? dataRaw[0] : dataRaw;
      if (!data) throw new Error('Failed to upsert material');

      // AUTO-JOURNAL: Create adjustment journal when stock changes
      const newStock = Number(data.stock) || 0;
      const pricePerUnit = Number(data.price_per_unit) || oldPricePerUnit;
      const stockDiff = newStock - oldStock;

      if (material.id && stockDiff !== 0 && pricePerUnit > 0 && currentBranch?.id) {
        const journalResult = await createMaterialStockAdjustmentJournal({
          materialId: material.id,
          materialName: data.name || material.name || 'Unknown Material',
          oldStock,
          newStock,
          pricePerUnit,
          branchId: currentBranch.id,
        });
        if (journalResult.success) {
          console.log('✅ Auto-generated material stock adjustment journal:', journalResult.journalId);
        } else {
          console.warn('⚠️ Failed to create material stock adjustment journal:', journalResult.error);
        }
      }

      return fromDbToApp(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
    },
  });

  const deleteMaterial = useMutation({
    mutationFn: async (materialId: string): Promise<void> => {
      const { error } = await supabase
        .from('materials')
        .delete()
        .eq('id', materialId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
    },
  });

  // Listen for production completion events to refresh materials
  useEffect(() => {
    const handleProductionComplete = () => {
      console.log('Production completed, refreshing materials...');
      queryClient.invalidateQueries({ queryKey: ['materials'] });
    };

    window.addEventListener('production-completed', handleProductionComplete);
    return () => {
      window.removeEventListener('production-completed', handleProductionComplete);
    };
  }, [queryClient]);

  return {
    materials,
    isLoading,
    addStock,
    upsertMaterial,
    deleteMaterial,
  }
}