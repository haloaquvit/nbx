import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Material } from '@/types/material'
import { supabase } from '@/integrations/supabase/client'

const fromDbToApp = (dbMaterial: any): Material => ({
  id: dbMaterial.id,
  name: dbMaterial.name,
  type: dbMaterial.type || 'Stock', // Default to Stock if not set
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
  if (type !== undefined) {
    dbData.type = type;
  }
  return dbData;
};

export const useMaterials = () => {
  const queryClient = useQueryClient();

  const { data: materials, isLoading } = useQuery<Material[]>({
    queryKey: ['materials'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('materials')
        .select('*');
      if (error) throw new Error(error.message);
      return data ? data.map(fromDbToApp) : [];
    }
  });

  const addStock = useMutation({
    mutationFn: async ({ materialId, quantity }: { materialId: string, quantity: number }): Promise<Material> => {
      // Get material data to determine how to handle the operation
      const { data: material, error: materialError } = await supabase
        .from('materials')
        .select('type, current_stock')
        .eq('id', materialId)
        .single();
      
      if (materialError) throw new Error(materialError.message);
      
      // For 'Stock' type: add to stock (purchase received)
      // For 'Beli'/'Jasa' type: track usage/consumption (increase usage counter)
      if (material.type === 'Stock') {
        // Regular stock addition for Stock type materials
        const { error } = await supabase.rpc('add_material_stock', {
          material_id: materialId,
          quantity_to_add: quantity
        });
        if (error) throw new Error(error.message);
      } else {
        // For Beli/Jasa: track usage by adding to stock field (used as usage counter)
        const { error } = await supabase.rpc('add_material_stock', {
          material_id: materialId,
          quantity_to_add: quantity
        });
        if (error) throw new Error(error.message);
      }
      
      return {} as Material;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
    },
  });

  const upsertMaterial = useMutation({
    mutationFn: async (material: Partial<Material>): Promise<Material> => {
      const dbData = fromAppToDb(material);
      const { data, error } = await supabase
        .from('materials')
        .upsert(dbData)
        .select()
        .single();
      if (error) throw new Error(error.message);
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

  return {
    materials,
    isLoading,
    addStock,
    upsertMaterial,
    deleteMaterial,
  }
}