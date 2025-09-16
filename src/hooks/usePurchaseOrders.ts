import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PurchaseOrder, PurchaseOrderStatus } from '@/types/purchaseOrder'
import { supabase } from '@/integrations/supabase/client'
import { useExpenses } from './useExpenses'
import { useMaterials } from './useMaterials'
import { useMaterialMovements } from './useMaterialMovements'
import { useAccountsPayable } from './useAccountsPayable'
import { useAuth } from './useAuth'

const fromDb = (dbPo: any): PurchaseOrder => ({
  id: dbPo.id,
  materialId: dbPo.material_id,
  materialName: dbPo.material_name,
  quantity: dbPo.quantity,
  unit: dbPo.unit,
  unitPrice: dbPo.unit_price,
  requestedBy: dbPo.requested_by,
  status: dbPo.status,
  createdAt: new Date(dbPo.created_at),
  notes: dbPo.notes,
  totalCost: dbPo.total_cost,
  paymentAccountId: dbPo.payment_account_id,
  paymentDate: dbPo.payment_date ? new Date(dbPo.payment_date) : undefined,
  supplierName: dbPo.supplier_name,
  supplierContact: dbPo.supplier_contact,
  supplierId: dbPo.supplier_id,
  quotedPrice: dbPo.quoted_price,
  expedition: dbPo.expedition,
  expectedDeliveryDate: dbPo.expected_delivery_date ? new Date(dbPo.expected_delivery_date) : undefined,
  receivedDate: dbPo.received_date ? new Date(dbPo.received_date) : undefined,
  deliveryNotePhoto: dbPo.delivery_note_photo,
  receivedBy: dbPo.received_by,
  receivedQuantity: dbPo.received_quantity,
  expeditionReceiver: dbPo.expedition_receiver,
});

const toDb = (appPo: Partial<PurchaseOrder>) => ({
  id: appPo.id,
  material_id: appPo.materialId,
  material_name: appPo.materialName,
  quantity: appPo.quantity,
  unit: appPo.unit,
  unit_price: appPo.unitPrice || null,
  requested_by: appPo.requestedBy,
  status: appPo.status,
  notes: appPo.notes || null,
  total_cost: appPo.totalCost || null,
  payment_account_id: appPo.paymentAccountId || null,
  payment_date: appPo.paymentDate || null,
  supplier_name: appPo.supplierName || null,
  supplier_contact: appPo.supplierContact || null,
  supplier_id: appPo.supplierId || null,
  quoted_price: appPo.quotedPrice || null,
  expedition: appPo.expedition || null,
  expected_delivery_date: appPo.expectedDeliveryDate || null,
  received_date: appPo.receivedDate || null,
  delivery_note_photo: appPo.deliveryNotePhoto || null,
  received_by: appPo.receivedBy || null,
  received_quantity: appPo.receivedQuantity || null,
  expedition_receiver: appPo.expeditionReceiver || null,
});

export const usePurchaseOrders = () => {
  const queryClient = useQueryClient();
  const { addExpense } = useExpenses();
  const { addStock } = useMaterials();
  const { createMaterialMovement } = useMaterialMovements();
  const { createAccountsPayable, payAccountsPayable } = useAccountsPayable();
  const { user } = useAuth();

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
      console.log('[addPurchaseOrder] Input data:', newPoData);
      
      const poId = `PO-${Date.now()}`;
      const dbData = toDb({
        ...newPoData,
        id: poId,
        status: 'Pending',
        createdAt: new Date(),
      });
      
      console.log('[addPurchaseOrder] DB data to insert:', dbData);
      
      const { data, error } = await supabase.from('purchase_orders').insert(dbData).select().single();
      
      if (error) {
        console.error('[addPurchaseOrder] Database error:', error);
        throw new Error(error.message);
      }
      
      console.log('[addPurchaseOrder] Success:', data);
      return fromDb(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
    },
  });

  const updatePoStatus = useMutation({
    mutationFn: async ({ poId, status, updateData }: { poId: string, status: PurchaseOrderStatus, updateData?: any }): Promise<PurchaseOrder> => {
      const dbUpdateData = { status, ...updateData };
      // Convert any nested date objects or other data if needed
      if (updateData?.receivedDate) {
        dbUpdateData.received_date = updateData.receivedDate;
        delete dbUpdateData.receivedDate;
      }
      if (updateData?.deliveryNotePhoto) {
        dbUpdateData.delivery_note_photo = updateData.deliveryNotePhoto;
        delete dbUpdateData.deliveryNotePhoto;
      }
      if (updateData?.receivedBy) {
        dbUpdateData.received_by = updateData.receivedBy;
        delete dbUpdateData.receivedBy;
      }
      if (updateData?.receivedQuantity) {
        dbUpdateData.received_quantity = updateData.receivedQuantity;
        delete dbUpdateData.receivedQuantity;
      }
      if (updateData?.expeditionReceiver) {
        dbUpdateData.expedition_receiver = updateData.expeditionReceiver;
        delete dbUpdateData.expeditionReceiver;
      }
      
      const { data, error } = await supabase.from('purchase_orders').update(dbUpdateData).eq('id', poId).select().single();
      if (error) throw new Error(error.message);
      
      // Create accounts payable when PO is approved
      if (status === 'Approved' && data.total_cost && data.supplier_name) {
        await createAccountsPayable.mutateAsync({
          purchaseOrderId: data.id,
          supplierName: data.supplier_name,
          amount: data.total_cost,
          description: `Purchase Order ${data.id} - ${data.material_name}`,
          status: 'Outstanding',
        });
      }
      
      return fromDb(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      queryClient.invalidateQueries({ queryKey: ['accountsPayable'] });
    },
  });

  const payPurchaseOrder = useMutation({
    mutationFn: async ({ poId, totalCost, paymentAccountId }: { poId: string, totalCost: number, paymentAccountId: string }) => {
      const paymentDate = new Date();
      
      // Update PO status to Dibayar
      const { data: updatedPo, error } = await supabase.from('purchase_orders').update({
        status: 'Dibayar',
        total_cost: totalCost,
        payment_account_id: paymentAccountId,
        payment_date: paymentDate,
      }).eq('id', poId).select().single();

      if (error) throw error;

      // Find corresponding accounts payable and pay it
      const { data: payableData, error: payableError } = await supabase
        .from('accounts_payable')
        .select('*')
        .eq('purchase_order_id', poId)
        .eq('status', 'Outstanding')
        .single();

      if (payableError && payableError.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.warn('No accounts payable found for PO:', poId);
      }

      if (payableData) {
        // Pay the accounts payable (this will create the expense record)
        await payAccountsPayable.mutateAsync({
          payableId: payableData.id,
          amount: totalCost,
          paymentAccountId,
          notes: `Payment for PO #${poId}`,
        });
      } else {
        // Fallback: create expense record directly if no accounts payable exists
        await addExpense.mutateAsync({
          description: `Pembayaran PO #${updatedPo.id} - ${updatedPo.material_name}`,
          amount: totalCost,
          accountId: paymentAccountId,
          accountName: '', // Will be filled by useExpenses hook
          date: paymentDate,
          category: 'Pembelian Bahan',
        });
      }

      // Record in cash_history for PO payment tracking
      if (paymentAccountId && user) {
        try {
          // Get account name for the payment account
          const { data: account } = await supabase
            .from('accounts')
            .select('name')
            .eq('id', paymentAccountId)
            .single();

          const cashFlowRecord = {
            account_id: paymentAccountId,
            account_name: account?.name || 'Unknown Account',
            type: 'pembayaran_po',
            amount: totalCost,
            description: `Pembayaran PO #${updatedPo.id} - ${updatedPo.material_name}`,
            reference_id: poId,
            reference_name: `Purchase Order ${poId}`,
            user_id: user.id,
            user_name: user.name || user.email || 'Unknown User',
            transaction_type: 'expense'
          };

          console.log('Recording PO payment in cash history:', cashFlowRecord);

          const { error: cashFlowError } = await supabase
            .from('cash_history')
            .insert(cashFlowRecord);

          if (cashFlowError) {
            console.error('Failed to record PO payment in cash flow:', cashFlowError.message);
          } else {
            console.log('Successfully recorded PO payment in cash history');
          }
        } catch (error) {
          console.error('Error recording PO payment cash flow:', error);
        }
      } else {
        console.log('Skipping PO payment cash flow record - missing paymentAccountId or user:', {
          paymentAccountId,
          user: user ? 'exists' : 'missing'
        });
      }

      return fromDb(updatedPo);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['accountsPayable'] });
      queryClient.invalidateQueries({ queryKey: ['cashFlow'] });
      queryClient.invalidateQueries({ queryKey: ['cashBalance'] });
    }
  });

  const receivePurchaseOrder = useMutation({
    mutationFn: async (po: PurchaseOrder) => {
      // Get current material data including type
      const { data: material, error: materialError } = await supabase
        .from('materials')
        .select('stock, name, type')
        .eq('id', po.materialId)
        .single();
      
      if (materialError) throw materialError;

      const previousStock = Number(material.stock) || 0;
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
    createPurchaseOrder: addPurchaseOrder, // Alias for create dialog
    updatePoStatus,
    payPurchaseOrder,
    receivePurchaseOrder,
    deletePurchaseOrder,
  }
}