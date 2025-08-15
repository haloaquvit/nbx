import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PurchaseOrder, PurchaseOrderStatus } from '@/types/purchaseOrder'
import { supabase } from '@/integrations/supabase/client'
import { useExpenses } from './useExpenses'
import { useMaterials } from './useMaterials'
import { useMaterialMovements } from './useMaterialMovements'

const fromDb = (dbPo: any): PurchaseOrder => ({
  id: dbPo.id,
  materialId: dbPo.material_id,
  materialName: dbPo.material_name,
  quantity: dbPo.quantity,
  unit: dbPo.unit,
  requestedBy: dbPo.requested_by,
  status: dbPo.status,
  createdAt: new Date(dbPo.created_at),
  notes: dbPo.notes,
  totalCost: dbPo.total_cost,
  paymentAccountId: dbPo.payment_account_id,
  paymentDate: dbPo.payment_date ? new Date(dbPo.payment_date) : undefined,
});

const toDb = (appPo: Partial<PurchaseOrder>) => ({
  id: appPo.id,
  material_id: appPo.materialId,
  material_name: appPo.materialName,
  quantity: appPo.quantity,
  unit: appPo.unit,
  requested_by: appPo.requestedBy,
  status: appPo.status,
  notes: appPo.notes,
  total_cost: appPo.totalCost,
  payment_account_id: appPo.paymentAccountId,
  payment_date: appPo.paymentDate,
});

export const usePurchaseOrders = () => {
  const queryClient = useQueryClient();
  const { addExpense } = useExpenses();
  const { addStock } = useMaterials();
  const { createMaterialMovement } = useMaterialMovements();

  const { data: purchaseOrders, isLoading } = useQuery<PurchaseOrder[]>({
    queryKey: ['purchaseOrders'],
    queryFn: async () => {
      const { data, error } = await supabase.from('purchase_orders').select('*').order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data ? data.map(fromDb) : [];
    }
  });

  const addPurchaseOrder = useMutation({
    mutationFn: async (newPoData: Omit<PurchaseOrder, 'id' | 'createdAt' | 'status'>): Promise<PurchaseOrder> => {
      const dbData = toDb({
        ...newPoData,
        id: `PO-${Date.now().toString().slice(-4)}`,
        status: 'Pending',
      });
      const { data, error } = await supabase.from('purchase_orders').insert(dbData).select().single();
      if (error) throw new Error(error.message);
      return fromDb(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
    },
  });

  const updatePoStatus = useMutation({
    mutationFn: async ({ poId, status }: { poId: string, status: PurchaseOrderStatus }): Promise<PurchaseOrder> => {
      const { data, error } = await supabase.from('purchase_orders').update({ status }).eq('id', poId).select().single();
      if (error) throw new Error(error.message);
      return fromDb(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
    },
  });

  const payPurchaseOrder = useMutation({
    mutationFn: async ({ poId, totalCost, paymentAccountId }: { poId: string, totalCost: number, paymentAccountId: string }) => {
      const paymentDate = new Date();
      const { data: updatedPo, error } = await supabase.from('purchase_orders').update({
        status: 'Dibayar',
        total_cost: totalCost,
        payment_account_id: paymentAccountId,
        payment_date: paymentDate,
      }).eq('id', poId).select().single();

      if (error) throw error;

      await addExpense.mutateAsync({
        description: `Pembayaran PO #${updatedPo.id} - ${updatedPo.material_name}`,
        amount: totalCost,
        accountId: paymentAccountId,
        accountName: '', // Will be filled by useExpenses hook
        date: paymentDate,
        category: 'Pembelian Bahan',
      });

      return fromDb(updatedPo);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    }
  });

  const receivePurchaseOrder = useMutation({
    mutationFn: async (po: PurchaseOrder) => {
      // Get current material data including type
      const { data: material, error: materialError } = await supabase
        .from('materials')
        .select('current_stock, name, type')
        .eq('id', po.materialId)
        .single();
      
      if (materialError) throw materialError;

      const previousStock = Number(material.current_stock) || 0;
      const newStock = previousStock + po.quantity;

      // Determine movement type based on material type
      const movementType = material.type === 'Stock' ? 'IN' : 'OUT';
      const reason = material.type === 'Stock' ? 'PURCHASE' : 'PRODUCTION_CONSUMPTION';
      const notes = material.type === 'Stock' 
        ? `Purchase order ${po.id} - Stock received`
        : `Purchase order ${po.id} - Usage/consumption tracked`;

      // 1. Create material movement with proper reference
      await createMaterialMovement.mutateAsync({
        materialId: po.materialId,
        materialName: material.name,
        type: movementType,
        reason: reason,
        quantity: po.quantity,
        previousStock,
        newStock,
        referenceId: po.id,
        referenceType: 'purchase_order',
        notes: notes,
        userId: po.requestedBy,
        userName: po.requestedBy,
      });

      // 2. Update material stock/usage counter
      await addStock.mutateAsync({ materialId: po.materialId, quantity: po.quantity });

      // 3. Update PO status
      const { data, error } = await supabase.from('purchase_orders').update({ status: 'Selesai' }).eq('id', po.id).select().single();
      if (error) throw error;

      return fromDb(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      queryClient.invalidateQueries({ queryKey: ['materialMovements'] });
    }
  });

  const deletePurchaseOrder = useMutation({
    mutationFn: async (poId: string) => {
      const { error } = await supabase.from('purchase_orders').delete().eq('id', poId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
    },
  });

  return {
    purchaseOrders,
    isLoading,
    addPurchaseOrder,
    updatePoStatus,
    payPurchaseOrder,
    receivePurchaseOrder,
    deletePurchaseOrder,
  }
}