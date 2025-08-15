import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Transaction } from '@/types/transaction'
import { supabase } from '@/integrations/supabase/client'
import { useExpenses } from './useExpenses'
import { StockService } from '@/services/stockService'
import { MaterialStockService } from '@/services/materialStockService'

// Helper to map from DB (snake_case) to App (camelCase)
const fromDb = (dbTransaction: any): Transaction => ({
  id: dbTransaction.id,
  customerId: dbTransaction.customer_id,
  customerName: dbTransaction.customer_name,
  cashierId: dbTransaction.cashier_id,
  cashierName: dbTransaction.cashier_name,
  designerId: dbTransaction.designer_id,
  operatorId: dbTransaction.operator_id,
  paymentAccountId: dbTransaction.payment_account_id,
  orderDate: new Date(dbTransaction.order_date),
  finishDate: dbTransaction.finish_date ? new Date(dbTransaction.finish_date) : null,
  items: dbTransaction.items || [],
  subtotal: dbTransaction.subtotal ?? dbTransaction.total ?? 0, // Fallback untuk data lama
  ppnEnabled: dbTransaction.ppn_enabled ?? false,
  ppnPercentage: dbTransaction.ppn_percentage ?? 11,
  ppnAmount: dbTransaction.ppn_amount ?? 0,
  total: dbTransaction.total,
  paidAmount: dbTransaction.paid_amount || 0,
  paymentStatus: dbTransaction.payment_status,
  status: dbTransaction.status,
  createdAt: new Date(dbTransaction.created_at),
});

// Helper to map from App (camelCase) to DB (snake_case)
const toDb = (appTransaction: Partial<Omit<Transaction, 'createdAt'>>) => {
  // Base object with required fields
  const baseObj: any = {
    id: appTransaction.id,
    customer_id: appTransaction.customerId,
    customer_name: appTransaction.customerName,
    cashier_id: appTransaction.cashierId,
    cashier_name: appTransaction.cashierName,
    designer_id: appTransaction.designerId || null,
    operator_id: appTransaction.operatorId || null,
    payment_account_id: appTransaction.paymentAccountId || null,
    order_date: appTransaction.orderDate,
    finish_date: appTransaction.finishDate || null,
    items: appTransaction.items,
    total: appTransaction.total,
    paid_amount: appTransaction.paidAmount,
    payment_status: appTransaction.paymentStatus,
    status: appTransaction.status,
  };

  // Only add PPN fields if they exist (for backward compatibility)
  if (appTransaction.subtotal !== undefined) baseObj.subtotal = appTransaction.subtotal;
  if (appTransaction.ppnEnabled !== undefined) baseObj.ppn_enabled = appTransaction.ppnEnabled;
  if (appTransaction.ppnPercentage !== undefined) baseObj.ppn_percentage = appTransaction.ppnPercentage;
  if (appTransaction.ppnAmount !== undefined) baseObj.ppn_amount = appTransaction.ppnAmount;

  return baseObj;
};

export const useTransactions = () => {
  const queryClient = useQueryClient()
  const { addExpense } = useExpenses()

  const { data: transactions, isLoading } = useQuery<Transaction[]>({
    queryKey: ['transactions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data ? data.map(fromDb) : [];
    }
  })

  const addTransaction = useMutation({
    mutationFn: async ({ newTransaction, quotationId }: { newTransaction: Omit<Transaction, 'createdAt'>, quotationId?: string | null }): Promise<Transaction> => {
      const dbData = toDb(newTransaction);
      const { data: savedTransaction, error } = await supabase
        .from('transactions')
        .insert([dbData])
        .select()
        .single();
      if (error) throw new Error(error.message);

      // Process stock movements for this transaction
      try {
        await StockService.processTransactionStock(
          savedTransaction.id,
          newTransaction.items,
          newTransaction.cashierId,
          newTransaction.cashierName
        );
        console.log('Stock movements processed successfully for transaction:', savedTransaction.id);
      } catch (stockError) {
        console.error('Failed to process stock movements:', stockError);
        // Note: We don't throw here to avoid breaking the transaction creation
        // Stock movements can be adjusted manually later if needed
      }

      // If it came from a quotation, update the quotation
      if (quotationId) {
        const { error: quotationError } = await supabase
          .from('quotations')
          .update({ transaction_id: savedTransaction.id, status: 'Disetujui' })
          .eq('id', quotationId);
        if (quotationError) console.error("Failed to update quotation:", quotationError.message);
      }

      // Record cash flow if there's a direct payment (paidAmount > 0)
      if (newTransaction.paidAmount > 0 && newTransaction.paymentAccountId) {
        try {
          // Get account name for the cash flow record
          const { data: account } = await supabase
            .from('accounts')
            .select('name')
            .eq('id', newTransaction.paymentAccountId)
            .single();

          const cashFlowRecord = {
            account_id: newTransaction.paymentAccountId,
            transaction_type: 'income', // Use same format as pembayaran piutang
            amount: newTransaction.paidAmount,
            description: `Pembayaran orderan dari ${newTransaction.customerName} - Order: ${savedTransaction.id}`,
            reference_number: `ORDER-${savedTransaction.id.slice(0, 8)}`,
            source_type: 'pos_direct',
            created_by: newTransaction.cashierId,
            created_by_name: newTransaction.cashierName
          };

          const { error: cashFlowError } = await supabase
            .from('cash_history')
            .insert(cashFlowRecord);

          if (cashFlowError) {
            console.error('Failed to record cash flow:', cashFlowError.message);
          }
        } catch (error) {
          console.error('Error recording cash flow:', error);
        }
      }

      return fromDb(savedTransaction);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['quotations'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['stockMovements'] })
      queryClient.invalidateQueries({ queryKey: ['cashFlow'] })
    }
  })

  const payReceivable = useMutation({
    mutationFn: async ({ 
      transactionId, 
      amount, 
      accountId,
      accountName,
      notes,
      recordedBy,
      recordedByName 
    }: { 
      transactionId: string; 
      amount: number;
      accountId?: string;
      accountName?: string;
      notes?: string;
      recordedBy?: string;
      recordedByName?: string;
    }): Promise<void> => {
      const { error } = await supabase.rpc('pay_receivable_with_history', {
        p_transaction_id: transactionId,
        p_amount: amount,
        p_account_id: accountId,
        p_account_name: accountName,
        p_notes: notes,
        p_recorded_by: recordedBy,
        p_recorded_by_name: recordedByName
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['paymentHistory'] });
      queryClient.invalidateQueries({ queryKey: ['paymentHistoryBatch'] });
    }
  });

  const writeOffReceivable = useMutation({
    mutationFn: async (transaction: Transaction) => {
      const amountToWriteOff = transaction.total - (transaction.paidAmount || 0);
      if (amountToWriteOff <= 0) {
        throw new Error("Piutang ini sudah lunas atau tidak ada sisa tagihan.");
      }

      // Step 1: Create an expense for the written-off amount
      await addExpense.mutateAsync({
        description: `Penghapusan Piutang No. Order ${transaction.id}`,
        amount: amountToWriteOff,
        date: new Date(),
        category: 'Penghapusan Piutang',
      });

      // Step 2: Update the transaction to mark it as fully paid
      const { error: updateError } = await supabase
        .from('transactions')
        .update({
          paid_amount: transaction.total,
          payment_status: 'Lunas'
        })
        .eq('id', transaction.id);

      if (updateError) {
        throw new Error(`Gagal memperbarui transaksi: ${updateError.message}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    }
  });

  const updateTransactionStatus = useMutation({
    mutationFn: async ({ transactionId, status, userId, userName }: { transactionId: string, status: string, userId?: string, userName?: string }) => {
      // Get transaction data before updating status
      const { data: transaction, error: fetchError } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', transactionId)
        .single();
      
      if (fetchError) throw new Error(fetchError.message);

      // Update transaction status
      const { error } = await supabase
        .from('transactions')
        .update({ status })
        .eq('id', transactionId);
      if (error) throw new Error(error.message);

      // If status is changing to "Proses Produksi", process material stock changes
      if (status === 'Proses Produksi' && transaction.items && userId && userName) {
        try {
          await MaterialStockService.processTransactionProduction(
            transactionId,
            transaction.items,
            userId,
            userName
          );
          console.log('Material stock processed successfully for transaction:', transactionId);
        } catch (materialError) {
          console.error('Failed to process material stock:', materialError);
          // Note: We don't throw here to avoid breaking the status update
          // Material stock can be adjusted manually later if needed
        }
      }
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(['transactions'], (oldData: Transaction[] | undefined) => {
        return oldData ? oldData.map(t => t.id === variables.transactionId ? { ...t, status: variables.status } : t) : [];
      });
      // Invalidate materials to refresh stock data
      queryClient.invalidateQueries({ queryKey: ['materials'] });
    }
  });

  const deleteTransaction = useMutation({
    mutationFn: async (transactionId: string) => {
      // Delete related cash_history records first
      const { error: cashHistoryError } = await supabase
        .from('cash_history')
        .delete()
        .or(`reference_number.like.%${transactionId}%,description.like.%${transactionId}%`);
      
      if (cashHistoryError) {
        console.error('Failed to delete related cash history:', cashHistoryError.message);
        // Continue anyway, don't throw
      }

      // Delete the main transaction
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', transactionId);
      
      if (error) throw new Error(error.message);

      console.log(`Deleted transaction ${transactionId} and related cash history records`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['cashFlow'] });
    },
  });

  const deductMaterials = useMutation({
    mutationFn: async (transactionId: string) => {
      const { error } = await supabase.rpc('deduct_materials_for_transaction', {
        p_transaction_id: transactionId,
      });
      if (error) throw new Error(`Gagal mengurangi stok: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
    },
  });

  return { transactions, isLoading, addTransaction, payReceivable, writeOffReceivable, updateTransactionStatus, deductMaterials, deleteTransaction }
}

export const useTransactionById = (id: string) => {
  const { data: transaction, isLoading } = useQuery<Transaction | undefined>({
    queryKey: ['transaction', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', id)
        .single();
      if (error) {
        console.error(error.message);
        return undefined;
      };
      return fromDb(data);
    },
    enabled: !!id,
  });
  return { transaction, isLoading };
}

export const useTransactionsByCustomer = (customerId: string) => {
    const { data: transactions, isLoading } = useQuery<Transaction[]>({
        queryKey: ['transactions', 'customer', customerId],
        queryFn: async () => {
            const { data, error } = await supabase
              .from('transactions')
              .select('*')
              .eq('customer_id', customerId);
            if (error) throw new Error(error.message);
            return data ? data.map(fromDb) : [];
        },
        enabled: !!customerId,
    });
    return { transactions, isLoading };
}