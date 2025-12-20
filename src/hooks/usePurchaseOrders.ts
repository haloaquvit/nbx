import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PurchaseOrder, PurchaseOrderStatus } from '@/types/purchaseOrder'
import { supabase } from '@/integrations/supabase/client'
import { useExpenses } from './useExpenses'
import { useMaterials } from './useMaterials'
import { useProducts } from './useProducts'
import { useMaterialMovements } from './useMaterialMovements'
import { useAccountsPayable } from './useAccountsPayable'
import { useAuth } from './useAuth'
import { useBranch } from '@/contexts/BranchContext'

const fromDb = (dbPo: any): PurchaseOrder => ({
  id: dbPo.id,
  poNumber: dbPo.po_number,
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
  includePpn: dbPo.include_ppn,
  ppnAmount: dbPo.ppn_amount,
  paymentAccountId: dbPo.payment_account_id,
  orderDate: dbPo.order_date ? new Date(dbPo.order_date) : undefined,
  receivedDate: dbPo.received_date ? new Date(dbPo.received_date) : undefined,
  paymentDate: dbPo.payment_date ? new Date(dbPo.payment_date) : undefined,
  supplierName: dbPo.supplier_name,
  supplierContact: dbPo.supplier_contact,
  supplierId: dbPo.supplier_id,
  quotedPrice: dbPo.quoted_price,
  expedition: dbPo.expedition,
  expectedDeliveryDate: dbPo.expected_delivery_date ? new Date(dbPo.expected_delivery_date) : undefined,
  branchId: dbPo.branch_id,
  updatedAt: dbPo.updated_at ? new Date(dbPo.updated_at) : undefined,
  approvedAt: dbPo.approved_at ? new Date(dbPo.approved_at) : undefined,
  approvedBy: dbPo.approved_by,
});

const toDb = (appPo: Partial<PurchaseOrder>) => ({
  id: appPo.id,
  po_number: appPo.poNumber || null,
  material_id: appPo.materialId,
  material_name: appPo.materialName,
  quantity: appPo.quantity,
  unit: appPo.unit,
  unit_price: appPo.unitPrice || null,
  requested_by: appPo.requestedBy,
  status: appPo.status,
  notes: appPo.notes || null,
  total_cost: appPo.totalCost || null,
  include_ppn: appPo.includePpn || false,
  ppn_amount: appPo.ppnAmount || 0,
  payment_account_id: appPo.paymentAccountId || null,
  order_date: appPo.orderDate || null,
  received_date: appPo.receivedDate || null,
  payment_date: appPo.paymentDate || null,
  supplier_name: appPo.supplierName || null,
  supplier_contact: appPo.supplierContact || null,
  supplier_id: appPo.supplierId || null,
  quoted_price: appPo.quotedPrice || null,
  expedition: appPo.expedition || null,
  expected_delivery_date: appPo.expectedDeliveryDate || null,
  branch_id: appPo.branchId || null,
  approved_by: appPo.approvedBy || null,
  approved_at: appPo.approvedAt || null,
});

export const usePurchaseOrders = () => {
  const queryClient = useQueryClient();
  const { addExpense } = useExpenses();
  const { addStock } = useMaterials();
  const { updateStock: updateProductStock } = useProducts();
  const { createMaterialMovement } = useMaterialMovements();
  const { createAccountsPayable, payAccountsPayable } = useAccountsPayable();
  const { user } = useAuth();
  const { currentBranch, canAccessAllBranches } = useBranch();

  const { data: purchaseOrders, isLoading } = useQuery<PurchaseOrder[]>({
    queryKey: ['purchaseOrders', currentBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('purchase_orders')
        .select('*')
        .order('created_at', { ascending: false });

      // Apply branch filter (only if not head office viewing all branches)
      if (currentBranch?.id) {
        query = query.eq('branch_id', currentBranch.id);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data ? data.map(fromDb) : [];
    },
    enabled: !!currentBranch,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes cache
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const addPurchaseOrder = useMutation({
    mutationFn: async (newPoData: any): Promise<PurchaseOrder> => {
      console.log('[addPurchaseOrder] Input data:', newPoData);

      const poId = `PO-${Date.now()}`;

      // If multi-item PO (has items array)
      if (newPoData.items && newPoData.items.length > 0) {
        // Insert PO header
        const poHeader = {
          id: poId,
          status: 'Pending',
          requested_by: newPoData.requestedBy,
          supplier_id: newPoData.supplierId,
          supplier_name: newPoData.supplierName,
          total_cost: newPoData.totalCost,
          include_ppn: newPoData.includePpn || false,
          ppn_amount: newPoData.ppnAmount || 0,
          expedition: newPoData.expedition || null,
          order_date: newPoData.orderDate || new Date(),
          expected_delivery_date: newPoData.expectedDeliveryDate || null,
          notes: newPoData.notes || null,
          branch_id: currentBranch?.id || null,
          created_at: new Date(),
        };

        console.log('[addPurchaseOrder] Inserting PO header:', poHeader);

        const { data: poData, error: poError } = await supabase
          .from('purchase_orders')
          .insert(poHeader)
          .select()
          .single();

        if (poError) {
          console.error('[addPurchaseOrder] PO header insert error:', poError);
          throw new Error(poError.message);
        }

        // Insert PO items
        const poItems = newPoData.items.map((item: any) => ({
          purchase_order_id: poId,
          material_id: item.materialId || null,
          product_id: item.productId || null,
          item_type: item.itemType || (item.materialId ? 'material' : 'product'),
          quantity: item.quantity,
          unit_price: item.unitPrice,
          notes: item.notes || null,
        }));

        console.log('[addPurchaseOrder] Inserting PO items:', poItems);

        const { error: itemsError } = await supabase
          .from('purchase_order_items')
          .insert(poItems);

        if (itemsError) {
          console.error('[addPurchaseOrder] PO items insert error:', itemsError);
          throw new Error(itemsError.message);
        }

        console.log('[addPurchaseOrder] Multi-item PO created successfully');
        return fromDb(poData);
      } else {
        // Legacy single-item PO
        const dbData = toDb({
          ...newPoData,
          id: poId,
          status: 'Pending',
          createdAt: new Date(),
        });

        console.log('[addPurchaseOrder] DB data to insert (legacy):', dbData);

        const { data, error } = await supabase.from('purchase_orders').insert(dbData).select().single();

        if (error) {
          console.error('[addPurchaseOrder] Database error:', error);
          throw new Error(error.message);
        }

        console.log('[addPurchaseOrder] Success:', data);
        return fromDb(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
    },
  });

  const updatePoStatus = useMutation({
    mutationFn: async ({ poId, status, updateData }: { poId: string, status: PurchaseOrderStatus, updateData?: any }): Promise<PurchaseOrder> => {
      const dbUpdateData = { status, ...updateData };

      const { data, error } = await supabase.from('purchase_orders').update(dbUpdateData).eq('id', poId).select().single();
      if (error) throw new Error(error.message);

      // Create accounts payable when PO is approved
      if (status === 'Approved' && data.total_cost && data.supplier_name) {
        let dueDate: Date | undefined;

        // Calculate due date based on supplier's payment terms
        if (data.supplier_id) {
          const { data: supplierData } = await supabase
            .from('suppliers')
            .select('payment_terms')
            .eq('id', data.supplier_id)
            .single();

          if (supplierData?.payment_terms) {
            const paymentTerms = supplierData.payment_terms;
            const today = new Date();

            // Parse payment terms (e.g., "Net 30", "Net 60", "Cash")
            if (paymentTerms.toLowerCase().includes('net')) {
              const days = parseInt(paymentTerms.match(/\d+/)?.[0] || '30');
              dueDate = new Date(today);
              dueDate.setDate(today.getDate() + days);
            } else if (paymentTerms.toLowerCase() === 'cash') {
              // For cash, due date is same day
              dueDate = today;
            }
          }
        }

        await createAccountsPayable.mutateAsync({
          purchaseOrderId: data.id,
          supplierName: data.supplier_name,
          amount: data.total_cost,
          dueDate: dueDate,
          description: `Purchase Order ${data.id} - ${data.material_name}`,
          status: 'Outstanding',
          paidAmount: 0, // Always start with 0
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
            transaction_type: 'expense',
            branch_id: currentBranch?.id || null,
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
      // Get current user ID
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) throw new Error('User not authenticated');

      // Fetch PO items from database
      const { data: poItemsData, error: itemsError } = await supabase
        .from('purchase_order_items')
        .select('*, materials:material_id(name, type), products:product_id(name, current_stock)')
        .eq('purchase_order_id', po.id);

      if (itemsError) throw itemsError;

      interface ItemToProcess {
        itemType: 'material' | 'product';
        materialId?: string;
        productId?: string;
        quantity: number;
        itemName: string;
        materialType?: string;
      }

      let itemsToProcess: ItemToProcess[] = [];

      // Check if we have items in database or fall back to legacy
      if (poItemsData && poItemsData.length > 0) {
        // Multi-item PO
        itemsToProcess = poItemsData.map((item: any) => ({
          itemType: item.item_type || (item.material_id ? 'material' : 'product'),
          materialId: item.material_id,
          productId: item.product_id,
          quantity: item.quantity,
          itemName: item.item_type === 'product'
            ? (item.products?.name || 'Unknown Product')
            : (item.materials?.name || 'Unknown Material'),
          materialType: item.materials?.type || 'Stock',
        }));
      } else if (po.materialId) {
        // Legacy single-item PO (material only)
        const { data: material } = await supabase
          .from('materials')
          .select('name, type')
          .eq('id', po.materialId)
          .single();

        itemsToProcess = [{
          itemType: 'material',
          materialId: po.materialId,
          quantity: po.quantity || 0,
          itemName: material?.name || po.materialName || 'Unknown',
          materialType: material?.type || 'Stock',
        }];
      } else {
        throw new Error('No items found in this PO');
      }

      // Process each item: create movements and update stock
      for (const item of itemsToProcess) {
        if (item.itemType === 'material' && item.materialId) {
          // Process MATERIAL
          const { data: material } = await supabase
            .from('materials')
            .select('stock')
            .eq('id', item.materialId)
            .single();

          const previousStock = Number(material?.stock) || 0;
          const newStock = previousStock + item.quantity;

          // Determine movement type based on material type
          const movementType = item.materialType === 'Stock' ? 'IN' : 'OUT';
          const reason = item.materialType === 'Stock' ? 'PURCHASE' : 'PRODUCTION_CONSUMPTION';
          const notes = item.materialType === 'Stock'
            ? `Purchase order ${po.id} - Stock received`
            : `Purchase order ${po.id} - Usage/consumption tracked`;

          // Create material movement
          console.log('Creating material movement:', {
            materialId: item.materialId,
            materialName: item.itemName,
            type: movementType,
            reason: reason,
            quantity: item.quantity,
            previousStock,
            newStock,
            referenceId: po.id,
            referenceType: 'purchase_order',
          });

          await createMaterialMovement.mutateAsync({
            materialId: item.materialId,
            materialName: item.itemName,
            type: movementType,
            reason: reason,
            quantity: item.quantity,
            previousStock,
            newStock,
            referenceId: po.id,
            referenceType: 'purchase_order',
            notes: notes,
            userId: currentUser.id,
            userName: po.requestedBy,
            branchId: currentBranch?.id || null,
          });

          // Update material stock
          await addStock.mutateAsync({ materialId: item.materialId, quantity: item.quantity });

        } else if (item.itemType === 'product' && item.productId) {
          // Process PRODUCT (Jual Langsung)
          const { data: product } = await supabase
            .from('products')
            .select('current_stock')
            .eq('id', item.productId)
            .single();

          const previousStock = Number(product?.current_stock) || 0;
          const newStock = previousStock + item.quantity;

          console.log('Updating product stock:', {
            productId: item.productId,
            productName: item.itemName,
            quantity: item.quantity,
            previousStock,
            newStock,
          });

          // Update product stock directly in database
          const { error: updateError } = await supabase
            .from('products')
            .update({ current_stock: newStock })
            .eq('id', item.productId);

          if (updateError) {
            console.error('Failed to update product stock:', updateError);
            throw new Error(`Failed to update stock for product ${item.itemName}`);
          }

          console.log('Product stock updated successfully');
        }
      }

      // Update PO status to Diterima with received_date
      const { data, error } = await supabase
        .from('purchase_orders')
        .update({
          status: 'Diterima',
          received_date: po.receivedDate || new Date()
        })
        .eq('id', po.id)
        .select()
        .single();

      if (error) throw error;

      return fromDb(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      queryClient.invalidateQueries({ queryKey: ['products'] }); // Also refresh products
      queryClient.invalidateQueries({ queryKey: ['receiveGoods'] });
      queryClient.invalidateQueries({ queryKey: ['materialMovements'] });
    }
  });

  const deletePurchaseOrder = useMutation({
    mutationFn: async (poId: string) => {
      // Delete related accounts payable first
      const { error: apError } = await supabase
        .from('accounts_payable')
        .delete()
        .eq('purchase_order_id', poId);

      if (apError) {
        console.warn('Failed to delete accounts payable:', apError.message);
        // Continue anyway, accounts payable might not exist
      }

      // Delete purchase order
      const { error } = await supabase.from('purchase_orders').delete().eq('id', poId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      queryClient.invalidateQueries({ queryKey: ['accountsPayable'] });
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