import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MaterialMovement, CreateMaterialMovementData } from '@/types/materialMovement'
import { supabase } from '@/integrations/supabase/client'

// Helper to map from DB (snake_case) to App (camelCase)
const fromDbToApp = (dbMovement: any): MaterialMovement => ({
  id: dbMovement.id,
  materialId: dbMovement.material_id,
  materialName: dbMovement.material_name,
  type: dbMovement.type,
  reason: dbMovement.reason,
  quantity: Number(dbMovement.quantity),
  previousStock: Number(dbMovement.previous_stock),
  newStock: Number(dbMovement.new_stock),
  referenceId: dbMovement.reference_id,
  referenceType: dbMovement.reference_type,
  notes: dbMovement.notes,
  userId: dbMovement.user_id,
  userName: dbMovement.user_name,
  createdAt: dbMovement.created_at,
});

// Helper to map from App (camelCase) to DB (snake_case)
const fromAppToDb = (appMovement: CreateMaterialMovementData) => ({
  material_id: appMovement.materialId,
  material_name: appMovement.materialName,
  type: appMovement.type,
  reason: appMovement.reason,
  quantity: appMovement.quantity,
  previous_stock: appMovement.previousStock,
  new_stock: appMovement.newStock,
  reference_id: appMovement.referenceId,
  reference_type: appMovement.referenceType,
  notes: appMovement.notes,
  user_id: appMovement.userId,
  user_name: appMovement.userName,
});

export const useMaterialMovements = () => {
  const queryClient = useQueryClient()

  const { data: stockMovements, isLoading } = useQuery({
    queryKey: ['materialMovements'],
    queryFn: async (): Promise<MaterialMovement[]> => {
      const { data, error } = await supabase
        .from('material_stock_movements')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching material movements:', error);
        // If table doesn't exist, return empty array for now
        if (error.code === '42P01') {
          console.warn('material_stock_movements table does not exist, returning empty array');
          return [];
        }
        throw new Error(error.message);
      }
      return data ? data.map(fromDbToApp) : [];
    }
  });

  const createMaterialMovement = useMutation({
    mutationFn: async (movementData: CreateMaterialMovementData): Promise<MaterialMovement> => {
      const dbData = fromAppToDb(movementData);
      const { data, error } = await supabase
        .from('material_stock_movements')
        .insert(dbData)
        .select()
        .single();
      
      if (error) {
        console.error('Error creating material movement:', error);
        throw new Error(error.message);
      }
      return fromDbToApp(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materialMovements'] });
      queryClient.invalidateQueries({ queryKey: ['materials'] });
    },
  });

  const getMovementsByMaterial = async (materialId: string): Promise<MaterialMovement[]> => {
    const { data, error } = await supabase
      .from('material_stock_movements')
      .select('*')
      .eq('material_id', materialId)
      .order('created_at', { ascending: false });

    if (error) {
      if (error.code === '42P01') {
        return [];
      }
      throw new Error(error.message);
    }
    return data ? data.map(fromDbToApp) : [];
  };

  const getMovementsByDateRange = async (from: Date, to: Date): Promise<MaterialMovement[]> => {
    const { data, error } = await supabase
      .from('material_stock_movements')
      .select('*')
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      if (error.code === '42P01') {
        return [];
      }
      throw new Error(error.message);
    }
    return data ? data.map(fromDbToApp) : [];
  };

  return {
    stockMovements,
    isLoading,
    createMaterialMovement,
    getMovementsByMaterial,
    getMovementsByDateRange,
  }
}