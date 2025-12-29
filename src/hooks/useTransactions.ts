import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Transaction } from '@/types/transaction'
import { supabase } from '@/integrations/supabase/client'
import { useExpenses } from './useExpenses'
import { StockService } from '@/services/stockService'
import { MaterialStockService } from '@/services/materialStockService'
import { generateSalesCommission } from '@/utils/commissionUtils'
import { useBranch } from '@/contexts/BranchContext'
import { findAccountByLookup, findAllAccountsByLookup, AccountLookupType } from '@/services/accountLookupService'
import { Account } from '@/types/account'
import { createSalesJournal, createReceivablePaymentJournal } from '@/services/journalService'

// ============================================================================
// CATATAN PENTING: DOUBLE-ENTRY ACCOUNTING SYSTEM
// ============================================================================
// Semua saldo akun HANYA dihitung dari journal_entries (tidak ada update balance langsung)
// cash_history digunakan HANYA untuk Buku Kas Harian (monitoring), TIDAK update balance
// Jurnal otomatis dibuat melalui journalService untuk setiap transaksi
// HPP & Persediaan di-jurnal otomatis melalui createSalesJournal
// ============================================================================

// Helper to map DB account to App account format
const fromDbToAppAccount = (dbAccount: any): Account => ({
  id: dbAccount.id,
  name: dbAccount.name,
  type: dbAccount.type,
  balance: Number(dbAccount.balance) || 0,
  initialBalance: Number(dbAccount.initial_balance) || 0,
  isPaymentAccount: dbAccount.is_payment_account,
  createdAt: new Date(dbAccount.created_at),
  code: dbAccount.code || undefined,
  parentId: dbAccount.parent_id || undefined,
  level: dbAccount.level || 1,
  normalBalance: dbAccount.normal_balance || 'DEBIT',
  isHeader: dbAccount.is_header || false,
  isActive: dbAccount.is_active !== false,
  sortOrder: dbAccount.sort_order || 0,
  branchId: dbAccount.branch_id || undefined,
});

// Helper to get account by lookup type (using name/type based matching)
const getAccountByLookup = async (lookupType: AccountLookupType): Promise<{ id: string; name: string; code?: string; balance: number } | null> => {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .order('code');

  if (error || !data) {
    console.warn(`Failed to fetch accounts for ${lookupType} lookup:`, error?.message);
    return null;
  }

  const accounts = data.map(fromDbToAppAccount);
  const account = findAccountByLookup(accounts, lookupType);

  if (!account) {
    console.warn(`Account not found for lookup type: ${lookupType}`);
    return null;
  }

  return { id: account.id, name: account.name, code: account.code, balance: account.balance || 0 };
};

// Helper to extract sales info from items array
const extractSalesFromItems = (items: any[]) => {
  if (!Array.isArray(items)) {
    return { salesId: null, salesName: null, cleanItems: items || [] };
  }
  
  // Check if first element is sales metadata
  const firstItem = items[0];
  if (firstItem && firstItem._isSalesMeta) {
    const { salesId, salesName } = firstItem;
    const cleanItems = items.slice(1); // Remove metadata item
    console.log('🔄 Extracted sales info:', { salesId, salesName, itemCount: cleanItems.length });
    return { salesId, salesName, cleanItems };
  }
  
  return { salesId: null, salesName: null, cleanItems: items };
};

// Helper to map from DB (snake_case) to App (camelCase)
const fromDb = (dbTransaction: any): Transaction => {
  const salesInfo = extractSalesFromItems(dbTransaction.items);
  
  return {
    id: dbTransaction.id,
    customerId: dbTransaction.customer_id,
    customerName: dbTransaction.customer_name,
    cashierId: dbTransaction.cashier_id,
    cashierName: dbTransaction.cashier_name,
    salesId: dbTransaction.sales_id || salesInfo.salesId, // Try direct column first, then extract from items
    salesName: dbTransaction.sales_name || salesInfo.salesName, // Try direct column first, then extract from items
    designerId: dbTransaction.designer_id || null,
    operatorId: dbTransaction.operator_id || null,
    paymentAccountId: dbTransaction.payment_account_id || null,
    orderDate: new Date(dbTransaction.order_date),
    finishDate: dbTransaction.finish_date ? new Date(dbTransaction.finish_date) : null,
    items: salesInfo.cleanItems || [],
    subtotal: dbTransaction.subtotal ?? dbTransaction.total ?? 0, // Fallback untuk data lama
    ppnEnabled: dbTransaction.ppn_enabled ?? false,
    ppnMode: dbTransaction.ppn_mode || 'exclude',
    ppnPercentage: dbTransaction.ppn_percentage ?? 11,
    ppnAmount: dbTransaction.ppn_amount ?? 0,
    total: dbTransaction.total,
    paidAmount: dbTransaction.paid_amount || 0,
    paymentStatus: dbTransaction.payment_status,
    status: dbTransaction.status,
    notes: null, // Notes column not available
    isOfficeSale: dbTransaction.is_office_sale ?? false,
    dueDate: dbTransaction.due_date ? new Date(dbTransaction.due_date) : null,
    createdAt: new Date(dbTransaction.created_at),
  };
};

// Helper to map from App (camelCase) to DB (snake_case)
const toDb = (appTransaction: Partial<Omit<Transaction, 'createdAt'>>) => {
  // Store sales info as first element of items array with special marker
  let itemsWithSales = [...(appTransaction.items || [])];
  if (appTransaction.salesId && appTransaction.salesName) {
    // Add sales metadata as first element with special _isSalesMeta flag
    itemsWithSales.unshift({
      _isSalesMeta: true,
      salesId: appTransaction.salesId,
      salesName: appTransaction.salesName
    });
  }

  // Base object with required fields only (no notes column)
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
    due_date: appTransaction.dueDate || null, // Tanggal jatuh tempo untuk piutang
    items: itemsWithSales,
    subtotal: appTransaction.subtotal,
    ppn_enabled: appTransaction.ppnEnabled || false,
    ppn_mode: appTransaction.ppnMode || 'exclude',
    ppn_percentage: appTransaction.ppnPercentage || 11,
    ppn_amount: appTransaction.ppnAmount || 0,
    total: appTransaction.total,
    paid_amount: appTransaction.paidAmount,
    payment_status: appTransaction.paymentStatus,
    status: appTransaction.status,
    is_office_sale: appTransaction.isOfficeSale || false,
  };

  // Add retasi fields for driver POS transactions
  if (appTransaction.retasiId) {
    baseObj.retasi_id = appTransaction.retasiId;
  }
  if (appTransaction.retasiNumber) {
    baseObj.retasi_number = appTransaction.retasiNumber;
  }

  // Only add optional fields if they exist (for backward compatibility)
  // Note: These columns might not exist in older database schemas
  // The database insert will ignore unknown columns gracefully

  return baseObj;
};

export const useTransactions = (filters?: {
  status?: string;
  payment_status?: string;
  customer_id?: string;
  date_from?: string;
  date_to?: string;
}) => {
  const queryClient = useQueryClient()
  const { addExpense } = useExpenses()
  const { currentBranch, canAccessAllBranches } = useBranch()

  const { data: transactions, isLoading } = useQuery<Transaction[]>({
    queryKey: ['transactions', filters, currentBranch?.id],
    queryFn: async () => {
      // Use only essential columns that definitely exist in the original schema
      const selectFields = '*'; // Let Supabase handle available columns automatically

      let query = supabase
        .from('transactions')
        .select(selectFields)
        .order('created_at', { ascending: false });

      // Apply branch filter - ALWAYS filter by selected branch
      if (currentBranch?.id) {
        query = query.eq('branch_id', currentBranch.id);
      }

      // Apply other filters
      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      if (filters?.payment_status && filters.payment_status !== 'all') {
        query = query.eq('payment_status', filters.payment_status);
      }
      if (filters?.customer_id) {
        query = query.eq('customer_id', filters.customer_id);
      }
      if (filters?.date_from) {
        query = query.gte('order_date', filters.date_from);
      }
      if (filters?.date_to) {
        query = query.lte('order_date', filters.date_to);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data ? data.map(fromDb) : [];
    },
    enabled: !!currentBranch, // Only run query when branch is loaded
    // Optimized settings to reduce unnecessary traffic
    staleTime: 2 * 60 * 1000, // 2 minutes - data considered fresh
    gcTime: 5 * 60 * 1000, // 5 minutes - cache garbage collection
    refetchOnWindowFocus: false, // Don't refetch when window gains focus
    refetchOnReconnect: false, // Don't refetch when reconnecting
    retry: 1, // Only retry once on failure
    retryDelay: 1000, // 1 second delay between retries
  })

  const addTransaction = useMutation({
    mutationFn: async ({ newTransaction, quotationId }: { newTransaction: Omit<Transaction, 'createdAt'>, quotationId?: string | null }): Promise<Transaction> => {
      let dbData = {
        ...toDb(newTransaction),
        branch_id: currentBranch?.id || null,
      };

      // Insert transaction - sales info is now embedded in notes field
      // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
      const { data: initialTransactionRaw, error } = await supabase
        .from('transactions')
        .insert([dbData])
        .select()
        .order('id').limit(1);

      if (error) throw new Error(error.message);

      // Handle array response from PostgREST
      const initialTransaction = Array.isArray(initialTransactionRaw) ? initialTransactionRaw[0] : initialTransactionRaw;

      // Fallback: If insert succeeded but no data returned, fetch by ID
      let savedTransaction = initialTransaction;
      if (!savedTransaction || !savedTransaction.id) {
        console.warn('[useTransactions] Insert succeeded but no data returned - trying to fetch by ID');

        // The ID should be in dbData since we generate it client-side
        const transactionId = dbData.id;
        if (transactionId) {
          // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
          const { data: fetchedTransactionRaw, error: fetchError } = await supabase
            .from('transactions')
            .select('*')
            .eq('id', transactionId)
            .order('id').limit(1);

          const fetchedTransaction = Array.isArray(fetchedTransactionRaw) ? fetchedTransactionRaw[0] : fetchedTransactionRaw;
          if (fetchError || !fetchedTransaction) {
            console.error('[useTransactions] Failed to fetch transaction after insert:', fetchError);
            throw new Error('Gagal menyimpan transaksi - data tidak dapat diambil dari database');
          }

          savedTransaction = fetchedTransaction;
          console.log('[useTransactions] Successfully fetched transaction after insert:', savedTransaction.id);
        } else {
          console.error('[useTransactions] No transaction ID available for fallback fetch');
          throw new Error('Gagal menyimpan transaksi - ID tidak tersedia');
        }
      }

      // Process stock movements for this transaction
      // Pass isOfficeSale flag to each item so StockService knows whether to update stock immediately
      try {
        const itemsWithOfficeSale = newTransaction.items.map(item => ({
          ...item,
          isOfficeSale: newTransaction.isOfficeSale || false
        }));
        await StockService.processTransactionStock(
          savedTransaction.id,
          itemsWithOfficeSale,
          newTransaction.cashierId,
          newTransaction.cashierName
        );
      } catch (stockError) {
        // Note: We don't throw here to avoid breaking the transaction creation
      }

      // Generate sales commission for this transaction
      try {
        const transactionWithCreatedAt = {
          ...newTransaction,
          id: savedTransaction.id,
          createdAt: new Date()
        };
        
        await generateSalesCommission(transactionWithCreatedAt);
      } catch (commissionError) {
        // Note: We don't throw here to avoid breaking the transaction creation
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
          // First, fetch the account name
          // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
          const { data: accountDataRaw, error: accountError } = await supabase
            .from('accounts')
            .select('name')
            .eq('id', newTransaction.paymentAccountId)
            .order('id').limit(1);

          const accountData = Array.isArray(accountDataRaw) ? accountDataRaw[0] : accountDataRaw;
          if (accountError) {
            console.error('Failed to fetch account name:', accountError.message);
          }

          // cash_history table columns: id, account_id, transaction_type, amount, description,
          // reference_number, created_by, created_by_name, source_type, created_at, branch_id, type
          // IMPORTANT: transaction_type must be 'income' or 'expense' (database constraint)
          const cashFlowRecord = {
            account_id: newTransaction.paymentAccountId,
            transaction_type: 'income',
            type: 'orderan',
            amount: newTransaction.paidAmount,
            description: `Pembayaran orderan ${savedTransaction.id} - ${newTransaction.customerName}`,
            reference_number: savedTransaction.id,
            created_by: newTransaction.cashierId,
            created_by_name: newTransaction.cashierName,
            source_type: 'transaction',
            branch_id: currentBranch?.id || null,
          };

          const { error: cashFlowError } = await supabase
            .from('cash_history')
            .insert(cashFlowRecord);

          if (cashFlowError) {
            // If cash_history table doesn't exist or has constraint issues, just log a warning but continue
            if (cashFlowError.code === '42P01' || cashFlowError.code === 'PGRST116' || cashFlowError.code === 'PGRST205') {
              console.warn('cash_history table does not exist, transaction completed without history tracking');
            } else {
              console.error('Failed to record cash flow:', cashFlowError.message);
            }
          }
        } catch (error) {
          console.error('Error recording cash flow:', error);
        }
      }

      // ============================================================================
      // BALANCE UPDATE LANGSUNG DIHAPUS
      // Semua saldo sekarang dihitung dari journal_entries
      // Bonus, HPP, Persediaan, Revenue semua di-jurnal via createSalesJournal
      // ============================================================================

      // ============================================================================
      // AUTO-GENERATE JOURNAL ENTRY FOR SALES (dengan HPP & Persediaan)
      // ============================================================================
      // Jurnal otomatis untuk penjualan:
      // Dr. Kas/Piutang           xxx
      // Dr. HPP                   xxx
      //   Cr. Pendapatan              xxx
      //   Cr. Persediaan              xxx
      // ============================================================================
      if (currentBranch?.id && newTransaction.total > 0) {
        try {
          // Calculate HPP (Cost of Goods Sold) for non-bonus items
          let totalHPP = 0;
          const regularItems = newTransaction.items?.filter((item: any) => !item.isBonus) || [];

          if (regularItems.length > 0) {
            // Use FIFO method to calculate HPP from inventory batches
            for (const item of regularItems) {
              const productId = item.product?.id;
              const quantity = item.quantity || 0;

              if (productId && quantity > 0) {
                try {
                  // Call consume_inventory_fifo to consume stock and get HPP
                  const { data: fifoResult, error: fifoError } = await supabase
                    .rpc('consume_inventory_fifo', {
                      p_product_id: productId,
                      p_branch_id: currentBranch?.id || null,
                      p_quantity: quantity,
                      p_transaction_id: savedTransaction.id,
                    });

                  if (fifoError) {
                    console.warn('FIFO consumption failed, using fallback:', fifoError.message);
                    // Fallback: Use product's cost_price or base_price directly
                    // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
                    const { data: productDataRaw } = await supabase
                      .from('products')
                      .select('cost_price, base_price')
                      .eq('id', productId)
                      .order('id').limit(1);
                    const productData = Array.isArray(productDataRaw) ? productDataRaw[0] : productDataRaw;
                    // Use cost_price if available, otherwise use base_price (selling price as approximation)
                    const costPrice = productData?.cost_price || productData?.base_price || 0;
                    totalHPP += costPrice * quantity;
                    console.log('Fallback HPP calculated:', { productId, quantity, costPrice, itemHPP: costPrice * quantity });
                  } else if (fifoResult && fifoResult.length > 0) {
                    // FIFO returned result - check if it consumed enough quantity
                    const fifoHpp = Number(fifoResult[0].total_hpp) || 0;

                    // Parse batches_consumed to get total consumed quantity
                    let consumedQty = 0;
                    try {
                      const batchesConsumed = typeof fifoResult[0].batches_consumed === 'string'
                        ? JSON.parse(fifoResult[0].batches_consumed)
                        : fifoResult[0].batches_consumed;
                      consumedQty = Array.isArray(batchesConsumed)
                        ? batchesConsumed.reduce((sum: number, b: any) => sum + Number(b.quantity || 0), 0)
                        : 0;
                    } catch (parseErr) {
                      console.warn('Could not parse batches_consumed:', parseErr);
                    }

                    if (fifoHpp > 0 && consumedQty >= quantity) {
                      // FIFO berhasil consume semua qty
                      totalHPP += fifoHpp;
                      console.log('FIFO HPP calculated (full):', {
                        productId,
                        quantity,
                        hpp: fifoHpp,
                        batches: fifoResult[0].batches_consumed,
                      });
                    } else {
                      // FIFO tidak cukup - hitung fallback untuk sisa qty
                      const remainingQty = quantity - consumedQty;

                      // Get product cost_price for fallback
                      const { data: productDataRaw3 } = await supabase
                        .from('products')
                        .select('cost_price, base_price')
                        .eq('id', productId)
                        .order('id').limit(1);
                      const productData3 = Array.isArray(productDataRaw3) ? productDataRaw3[0] : productDataRaw3;
                      const costPrice = productData3?.cost_price || productData3?.base_price || 0;

                      // HPP = FIFO portion + Fallback portion
                      const fallbackHpp = costPrice * remainingQty;
                      totalHPP += fifoHpp + fallbackHpp;

                      console.log('HPP calculated (FIFO + Fallback):', {
                        productId,
                        requestedQty: quantity,
                        fifoConsumedQty: consumedQty,
                        fifoHpp,
                        remainingQty,
                        fallbackCostPrice: costPrice,
                        fallbackHpp,
                        totalItemHPP: fifoHpp + fallbackHpp
                      });
                    }
                  }
                } catch (err) {
                  console.error('Error calling FIFO:', err);
                  // Fallback to direct cost_price or base_price
                  // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
                  const { data: productDataRaw2 } = await supabase
                    .from('products')
                    .select('cost_price, base_price')
                    .eq('id', productId)
                    .order('id').limit(1);
                  const productData = Array.isArray(productDataRaw2) ? productDataRaw2[0] : productDataRaw2;
                  const costPrice = productData?.cost_price || productData?.base_price || 0;
                  totalHPP += costPrice * quantity;
                  console.log('Fallback HPP (catch):', { productId, quantity, costPrice, itemHPP: costPrice * quantity });
                }
              }
            }
          }

          const paymentMethod = newTransaction.paymentStatus === 'Lunas' ? 'cash' : 'credit';
          const journalResult = await createSalesJournal({
            transactionId: savedTransaction.id,
            transactionNumber: savedTransaction.id,
            transactionDate: new Date(newTransaction.orderDate),
            totalAmount: newTransaction.total,
            paymentMethod: paymentMethod,
            customerName: newTransaction.customerName,
            branchId: currentBranch.id,
            hppAmount: totalHPP, // Include HPP for proper accounting
            // PPN (Sales Tax) data
            ppnEnabled: newTransaction.ppnEnabled,
            ppnAmount: newTransaction.ppnAmount,
            subtotal: newTransaction.subtotal,
            // Office Sale flag - determines HPP credit account:
            // - isOfficeSale=true: Cr. Persediaan (stok langsung berkurang)
            // - isOfficeSale=false: Cr. Hutang Barang Dagang (kewajiban kirim)
            isOfficeSale: newTransaction.isOfficeSale || false,
          });

          if (journalResult.success) {
            console.log('✅ Jurnal penjualan auto-generated:', journalResult.journalId, {
              totalHPP,
              ppnEnabled: newTransaction.ppnEnabled,
              ppnAmount: newTransaction.ppnAmount,
              subtotal: newTransaction.subtotal
            });
          } else {
            console.warn('⚠️ Gagal membuat jurnal penjualan otomatis:', journalResult.error);
          }
        } catch (journalError) {
          console.error('Error creating sales journal:', journalError);
        }
      }

      // ============================================================================
      // PIUTANG USAHA: Sudah dihandle via createSalesJournal
      // Jika kredit: Dr. Piutang, Cr. Pendapatan
      // ============================================================================

      return fromDb(savedTransaction);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['quotations'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['stockMovements'] })
      queryClient.invalidateQueries({ queryKey: ['cashFlow'] })
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] })
    }
  })

  const updateTransaction = useMutation({
    mutationFn: async (updatedTransaction: Transaction): Promise<Transaction> => {
      const dbData = toDb(updatedTransaction);
      // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
      const { data: savedTransactionRaw, error } = await supabase
        .from('transactions')
        .update(dbData)
        .eq('id', updatedTransaction.id)
        .select()
        .order('id').limit(1);

      if (error) throw new Error(error.message);

      const savedTransaction = Array.isArray(savedTransactionRaw) ? savedTransactionRaw[0] : savedTransactionRaw;
      if (!savedTransaction) throw new Error('Failed to update transaction');

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
      // Get transaction data for customer name
      // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
      const { data: transactionDataRaw, error: fetchError } = await supabase
        .from('transactions')
        .select('customer_name, id')
        .eq('id', transactionId)
        .order('id').limit(1);

      const transactionData = Array.isArray(transactionDataRaw) ? transactionDataRaw[0] : transactionDataRaw;
      if (fetchError) {
        console.error('Failed to fetch transaction for receivable payment:', fetchError);
      }

      // Call RPC to update payment
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

      // ============================================================================
      // AUTO-GENERATE JOURNAL ENTRY FOR PEMBAYARAN PIUTANG
      // ============================================================================
      // Jurnal otomatis untuk pembayaran piutang:
      // Dr. Kas/Bank           xxx
      //   Cr. Piutang Usaha        xxx
      // ============================================================================
      if (currentBranch?.id && amount > 0) {
        try {
          const journalResult = await createReceivablePaymentJournal({
            receivableId: transactionId,
            paymentDate: new Date(),
            amount: amount,
            customerName: transactionData?.customer_name || 'Pelanggan',
            invoiceNumber: transactionId,
            branchId: currentBranch.id,
          });

          if (journalResult.success) {
            console.log('✅ Jurnal pembayaran piutang auto-generated:', journalResult.journalId);
          } else {
            console.warn('⚠️ Gagal membuat jurnal pembayaran piutang otomatis:', journalResult.error);
          }
        } catch (journalError) {
          console.error('Error creating receivable payment journal:', journalError);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['paymentHistory'] });
      queryClient.invalidateQueries({ queryKey: ['paymentHistoryBatch'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['cashFlow'] });
      queryClient.invalidateQueries({ queryKey: ['cashBalance'] });
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
    }
  });

  const deleteReceivable = useMutation({
    mutationFn: async (transactionId: string) => {
      // Delete the receivable by marking it as cancelled/deleted
      const { error: deleteError } = await supabase
        .from('transactions')
        .delete()
        .eq('id', transactionId);

      if (deleteError) {
        throw new Error(`Gagal menghapus piutang: ${deleteError.message}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['cashFlow'] });
    }
  });

  const updateTransactionStatus = useMutation({
    mutationFn: async ({ transactionId, status, userId, userName }: { transactionId: string, status: string, userId?: string, userName?: string }) => {
      // Get transaction data before updating status
      // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
      const { data: transactionRaw, error: fetchError } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', transactionId)
        .order('id').limit(1);

      const transaction = Array.isArray(transactionRaw) ? transactionRaw[0] : transactionRaw;
      if (fetchError) throw new Error(fetchError.message);
      if (!transaction) throw new Error('Transaction not found');

      // Update transaction status
      const { error } = await supabase
        .from('transactions')
        .update({ status })
        .eq('id', transactionId);
      if (error) throw new Error(error.message);

      // Material stock processing removed since 'Proses Produksi' status is removed
    },
    onSuccess: (data, variables) => {
      // Force invalidate all related queries to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['deliveries'] });
      queryClient.invalidateQueries({ queryKey: ['materials'] });
    }
  });

  const deleteTransaction = useMutation({
    mutationFn: async (transactionId: string) => {
      // Step 1: Get transaction data before deletion
      // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
      const { data: transactionRaw, error: fetchError } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', transactionId)
        .order('id').limit(1);

      if (fetchError) throw new Error(`Failed to fetch transaction: ${fetchError.message}`);

      // Handle array response from PostgREST
      const transaction = Array.isArray(transactionRaw) ? transactionRaw[0] : transactionRaw;
      if (!transaction) throw new Error('Transaction not found');

      // Step 2: Restore product stock from transaction items (ONLY for Laku Kantor)
      // Laku Kantor (isOfficeSale=true): Stok berkurang saat transaksi, restore saat delete
      // Bukan Laku Kantor: Stok berkurang saat delivery, restore saat delete delivery (Step 8)
      const isOfficeSale = transaction.is_office_sale === true;
      if (isOfficeSale) {
        console.log('Restoring stock from transaction items (Laku Kantor)...');
        try {
          const transactionItems = transaction.items || [];
          console.log('Transaction items to restore:', JSON.stringify(transactionItems, null, 2));

          for (const item of transactionItems) {
            // Skip sales metadata items
            if (item._isSalesMeta) continue;

            // Handle both formats: item.product.id (new) and item.productId (legacy)
            const productId = item.product?.id || item.productId;
            const productName = item.product?.name || item.productName || 'Unknown';
            const quantity = item.quantity || 0;

            console.log(`Processing item: productId=${productId}, productName=${productName}, quantity=${quantity}`);

            if (productId && quantity > 0) {
              // Get current stock - use .order('id').limit(1) and handle array response
              const { data: productRaw } = await supabase
                .from('products')
                .select('current_stock, name')
                .eq('id', productId)
                .order('id').limit(1);

              const productData = Array.isArray(productRaw) ? productRaw[0] : productRaw;
              if (productData) {
                const currentStock = productData.current_stock || 0;
                const newStock = currentStock + quantity; // Restore stock

                const { error: stockError } = await supabase
                  .from('products')
                  .update({ current_stock: newStock })
                  .eq('id', productId);

                if (stockError) {
                  console.error(`Failed to restore stock for ${productData.name}:`, stockError);
                } else {
                  console.log(`📦 Stock restored for ${productData.name}: ${currentStock} → ${newStock}`);
                }
              } else {
                console.warn(`Product not found for ID: ${productId}`);
              }
            } else {
              console.warn(`Skipping item - no productId or quantity: productId=${productId}, quantity=${quantity}`);
            }
          }
        } catch (stockRestoreError) {
          console.error('Error restoring stock:', stockRestoreError);
          // Continue with deletion even if stock restore fails
        }
      } else {
        console.log('Stock restoration will be handled by delivery deletion (not Laku Kantor)');
      }

      // ============================================================================
      // Step 3: VOID JURNAL TRANSAKSI
      // Balance otomatis ter-rollback karena dihitung dari journal_entries
      // useAccounts.ts filter: status === 'posted' && is_voided === false
      // ============================================================================
      try {
        const { data: voidedJournals, error: voidError } = await supabase
          .from('journal_entries')
          .update({
            status: 'voided',
            is_voided: true,
            voided_at: new Date().toISOString()
          })
          .eq('reference_id', transactionId)
          .eq('reference_type', 'transaction')
          .select('id, entry_number');

        if (voidError) {
          console.error('Failed to void sales journal:', voidError.message);
        } else {
          console.log('✅ Sales journal voided:', transactionId, 'Journals:', voidedJournals?.length || 0);
        }

        // Also void any receivable payment journals linked to this transaction
        const { data: voidedReceivableJournals, error: receivableVoidError } = await supabase
          .from('journal_entries')
          .update({
            status: 'voided',
            is_voided: true,
            voided_at: new Date().toISOString()
          })
          .eq('reference_id', transactionId)
          .eq('reference_type', 'receivable')
          .select('id, entry_number');

        if (receivableVoidError) {
          console.error('Failed to void receivable payment journals:', receivableVoidError.message);
        } else if (voidedReceivableJournals && voidedReceivableJournals.length > 0) {
          console.log('✅ Receivable payment journals voided:', voidedReceivableJournals.length);
        }
      } catch (err) {
        console.error('Error voiding sales journal:', err);
      }

      // Step 4: Delete stock movements for this transaction
      console.log('Attempting to delete stock movements for transaction:', transactionId);

      // Try to delete stock movements (reference_id is TEXT, not UUID)
      const { data: deletedMovements, error: stockMovementError } = await supabase
        .from('material_stock_movements')
        .delete()
        .eq('reference_id', transactionId)
        .select();
        
      if (stockMovementError) {
        console.error('Failed to delete stock movements:', stockMovementError);
        // If it's a UUID error, try with different approach
        if (stockMovementError.message.includes('uuid')) {
          console.warn('UUID error detected, trying alternative approach for stock movements');
          // Try to delete by notes pattern instead
          const { data: altDelete, error: altError } = await supabase
            .from('material_stock_movements')
            .delete()
            .like('notes', `%${transactionId}%`)
            .select();
            
          console.log('Alternative stock movement deletion:', altDelete, altError);
        }
      } else {
        console.log('Deleted stock movements for transaction:', deletedMovements);
      }
      
      // Step 5: Delete related cash_history records
      console.log('Attempting to delete cash_history records for transaction:', transactionId);
      
      // Get all cash_history records for this transaction first (for debugging)
      // Note: The column is 'reference_number' not 'reference_id'
      const { data: existingCashHistory } = await supabase
        .from('cash_history')
        .select('*')
        .or(`reference_number.eq.${transactionId},description.ilike.%${transactionId}%`);

      console.log('Found cash_history records to delete:', existingCashHistory);
      
      // Also check with exact patterns used when saving
      const { data: exactPattern } = await supabase
        .from('cash_history')
        .select('*')
        .like('description', `%Pembayaran orderan ${transactionId}%`);
        
      console.log('Found with exact pattern:', exactPattern);
      
      // Delete by reference_number (primary method)
      const { data: deleted1, error: cashHistoryError1 } = await supabase
        .from('cash_history')
        .delete()
        .eq('reference_number', transactionId)
        .select();

      console.log('Deleted by reference_number:', deleted1, 'Error:', cashHistoryError1);

      // If no records deleted by reference_number, log the actual records for debugging
      if ((!deleted1 || deleted1.length === 0) && existingCashHistory && existingCashHistory.length > 0) {
        console.log('Records exist but were not deleted. First record details:', {
          id: existingCashHistory[0].id,
          reference_number: existingCashHistory[0].reference_number,
          description: existingCashHistory[0].description,
          user_id: existingCashHistory[0].user_id,
          type: existingCashHistory[0].type
        });
      }
      
      // Delete by type 'orderan' and specific description pattern
      const { data: deleted2, error: cashHistoryError2 } = await supabase
        .from('cash_history')
        .delete()
        .eq('type', 'orderan')
        .like('description', `%Pembayaran orderan ${transactionId}%`)
        .select();
        
      console.log('Deleted by specific description pattern:', deleted2, cashHistoryError2);
      
      // Delete any remaining records by description containing transaction ID (case insensitive)
      const { data: deleted3, error: cashHistoryError3 } = await supabase
        .from('cash_history')
        .delete()
        .ilike('description', `%${transactionId}%`)
        .select();
        
      console.log('Deleted by description:', deleted3, cashHistoryError3);
      
      // Final check - count remaining records
      const { count } = await supabase
        .from('cash_history')
        .select('*', { count: 'exact', head: true })
        .or(`reference_number.eq.${transactionId},description.like.%${transactionId}%`);
        
      console.log('Remaining cash_history records for this transaction:', count);
      
      // If records still exist after all delete attempts, try RPC function as last resort
      if (count && count > 0) {
        console.warn(`${count} cash_history records still exist after deletion attempts. This may be due to RLS policies.`);
        console.log('Consider running manual cleanup SQL or checking RLS policies for cash_history table');
        
        // Try one more direct approach - delete by individual IDs
        if (existingCashHistory && existingCashHistory.length > 0) {
          for (const record of existingCashHistory) {
            try {
              const { data: directDelete, error: directError } = await supabase
                .from('cash_history')
                .delete()
                .eq('id', record.id)
                .select();
                
              console.log(`Direct delete record ${record.id}:`, directDelete, directError);
            } catch (error) {
              console.error('Direct delete error:', error);
            }
          }
        }
      }
      
      // Step 6: Delete commission entries (if table exists)
      try {
        console.log('Attempting to delete commission entries for transaction:', transactionId);
        
        // First check if commission_entries table exists by trying to select from it
        const { error: commissionTableCheckError } = await supabase
          .from('commission_entries')
          .select('id')
          .order('id').limit(1);
          
        if (commissionTableCheckError && (commissionTableCheckError.code === 'PGRST205' || commissionTableCheckError.message.includes('does not exist'))) {
          console.warn('commission_entries table does not exist, skipping commission entries deletion');
        } else {
          // Table exists, proceed with deletion
          const { data: deletedCommissions, error: commissionDeleteError } = await supabase
            .from('commission_entries')
            .delete()
            .eq('transaction_id', transactionId)
            .select();
            
          if (commissionDeleteError) {
            console.error('Failed to delete commission entries:', commissionDeleteError);
          } else {
            console.log('Deleted commission entries:', deletedCommissions);
          }
        }
      } catch (error) {
        console.error('Error during commission entries deletion:', error);
      }

      // Step 7: Delete payment history records (if table exists)
      try {
        console.log('Attempting to delete payment history for transaction:', transactionId);
        
        // First check if payment_history table exists by trying to select from it
        const { error: tableCheckError } = await supabase
          .from('payment_history')
          .select('id')
          .order('id').limit(1);
          
        if (tableCheckError && (tableCheckError.code === 'PGRST205' || tableCheckError.message.includes('does not exist'))) {
          console.warn('payment_history table does not exist, skipping payment history deletion');
        } else {
          // Table exists, proceed with deletion
          const { data: deletedPayments, error: paymentHistoryError } = await supabase
            .from('payment_history')
            .delete()
            .eq('transaction_id', transactionId)
            .select();
            
          if (paymentHistoryError) {
            console.error('Failed to delete payment history:', paymentHistoryError);
          } else {
            console.log('Deleted payment history records:', deletedPayments);
          }
        }
      } catch (error) {
        console.error('Error deleting payment history:', error);
      }
      
      // Step 7: Reset quotation if it was linked
      try {
        const { error: quotationError } = await supabase
          .from('quotations')
          .update({ 
            transaction_id: null, 
            status: 'Menunggu Persetujuan' 
          })
          .eq('transaction_id', transactionId);
          
        if (quotationError) {
          console.error('Failed to reset quotation:', quotationError);
        } else {
          console.log('Reset linked quotation');
        }
      } catch (error) {
        console.error('Error resetting quotation:', error);
      }

      // Step 7.5: Delete commission entries and expenses for this transaction
      console.log('Attempting to delete commission entries and expenses for transaction:', transactionId);
      try {
        // Import the function dynamically to avoid circular dependency
        const { deleteTransactionCommissionExpenses } = await import('@/utils/financialIntegration');
        
        // Delete commission expenses first
        await deleteTransactionCommissionExpenses(transactionId);
        
        // Then delete commission entries (both transaction and delivery commissions)
        const { data: deletedCommissions, error: commissionError } = await supabase
          .from('commission_entries')
          .delete()
          .eq('transaction_id', transactionId)
          .select();
          
        // Also delete delivery commissions if any deliveries exist for this transaction  
        // First get all delivery IDs for this transaction
        const { data: deliveries, error: deliveryFetchError } = await supabase
          .from('deliveries')
          .select('id')
          .eq('transaction_id', transactionId);
          
        if (!deliveryFetchError && deliveries && deliveries.length > 0) {
          const deliveryIds = deliveries.map(d => d.id);
          console.log(`Found ${deliveryIds.length} deliveries for transaction, checking for delivery commissions...`);
          
          // Get delivery commission entries
          const { data: deliveryCommissions, error: deliveryCommissionError } = await supabase
            .from('commission_entries')
            .select('id')
            .in('delivery_id', deliveryIds);
            
          if (!deliveryCommissionError && deliveryCommissions && deliveryCommissions.length > 0) {
            console.log(`Found ${deliveryCommissions.length} delivery commission entries to delete`);
            
            // Delete the delivery commission entries
            const { data: deletedDeliveryCommissions, error: deleteDeliveryCommError } = await supabase
              .from('commission_entries')
              .delete()
              .in('delivery_id', deliveryIds)
              .select();
              
            if (!deleteDeliveryCommError && deletedDeliveryCommissions) {
              console.log(`Deleted ${deletedDeliveryCommissions.length} delivery commission entries`);
            } else if (deleteDeliveryCommError) {
              console.error('Error deleting delivery commission entries:', deleteDeliveryCommError);
            }
          }
        }
          
        if (commissionError && commissionError.code !== 'PGRST116') {
          console.error('Failed to delete commission entries:', commissionError);
          // Don't throw error here - commission table might not exist
        } else if (deletedCommissions) {
          console.log(`Deleted ${deletedCommissions.length} commission entries and expenses for transaction`);
        }
      } catch (error) {
        console.error('Error deleting commission entries and expenses:', error);
        // Don't throw - commission system might not be set up yet
      }

      // Step 8: Delete deliveries and delivery_items for this transaction
      console.log('Attempting to delete deliveries and delivery_items for transaction:', transactionId);
      try {
        // First get all deliveries for this transaction
        const { data: deliveries, error: deliveriesError } = await supabase
          .from('deliveries')
          .select('id')
          .eq('transaction_id', transactionId);

        if (deliveriesError) {
          console.error('Failed to get deliveries:', deliveriesError);
        } else if (deliveries && deliveries.length > 0) {
          console.log(`Found ${deliveries.length} deliveries to delete with stock restoration`);

          // For non-office sale transactions, stock was reduced at delivery
          // So we need to restore stock when deleting deliveries
          if (!isOfficeSale) {
            for (const delivery of deliveries) {
              try {
                // Get delivery details and items for stock restoration
                const { data: deliveryRaw, error: deliveryError } = await supabase
                  .from('deliveries')
                  .select(`
                    *,
                    items:delivery_items(*)
                  `)
                  .eq('id', delivery.id)
                  .order('id').limit(1);

                if (deliveryError) {
                  console.error(`Failed to get delivery ${delivery.id}:`, deliveryError);
                  continue;
                }

                const deliveryData = Array.isArray(deliveryRaw) ? deliveryRaw[0] : deliveryRaw;
                if (deliveryData?.items && deliveryData.items.length > 0) {
                  // Get all unique product IDs
                  const productIds = [...new Set(deliveryData.items.map((item: any) => item.product_id))];

                  if (productIds.length > 0) {
                    const { data: productsData } = await supabase
                      .from('products')
                      .select('id, name, current_stock')
                      .in('id', productIds);

                    // Restore stock for each delivered item
                    for (const item of deliveryData.items) {
                      const productData = productsData?.find(p => p.id === item.product_id);

                      if (productData) {
                        const currentStock = productData.current_stock || 0;
                        const newStock = currentStock + item.quantity_delivered;

                        console.log(`📦 Restoring stock for ${item.product_name}: ${currentStock} + ${item.quantity_delivered} = ${newStock}`);

                        const { error: updateError } = await supabase
                          .from('products')
                          .update({ current_stock: newStock })
                          .eq('id', item.product_id);

                        if (updateError) {
                          console.error(`Failed to restore stock for ${item.product_name}:`, updateError);
                        } else {
                          console.log(`✅ Stock restored for ${item.product_name}`);
                        }
                      }
                    }
                  }
                }
              } catch (stockError) {
                console.error(`Error restoring stock for delivery ${delivery.id}:`, stockError);
              }
            }
          }

          // Void delivery journals (Hutang Barang Dagang) for each delivery
          for (const delivery of deliveries) {
            try {
              const { error: voidDeliveryJournalError } = await supabase
                .from('journal_entries')
                .update({
                  status: 'voided',
                  is_voided: true,
                  voided_at: new Date().toISOString()
                })
                .eq('reference_id', delivery.id)
                .eq('reference_type', 'adjustment');

              if (voidDeliveryJournalError) {
                console.error(`Failed to void delivery journal for ${delivery.id}:`, voidDeliveryJournalError);
              } else {
                console.log(`✅ Voided delivery journal for ${delivery.id}`);
              }
            } catch (voidError) {
              console.error(`Error voiding delivery journal for ${delivery.id}:`, voidError);
            }
          }

          // Delete delivery items for each delivery
          for (const delivery of deliveries) {
            // Delete delivery items
            const { data: deletedItems, error: itemsError } = await supabase
              .from('delivery_items')
              .delete()
              .eq('delivery_id', delivery.id)
              .select();

            if (itemsError) {
              console.error(`Failed to delete items for delivery ${delivery.id}:`, itemsError);
            } else {
              console.log(`Deleted ${deletedItems?.length || 0} delivery items for delivery ${delivery.id}`);
            }
          }

          // Delete deliveries
          const { data: deletedDeliveries, error: deleteDeliveriesError } = await supabase
            .from('deliveries')
            .delete()
            .eq('transaction_id', transactionId)
            .select();

          if (deleteDeliveriesError) {
            console.error('Failed to delete deliveries:', deleteDeliveriesError);
          } else {
            console.log(`Deleted ${deletedDeliveries?.length || 0} deliveries for transaction`);
          }
        } else {
          console.log('No deliveries found for this transaction');
        }
      } catch (error) {
        console.error('Error deleting deliveries and delivery_items:', error);
        // Don't throw - delivery system might not be set up yet
      }

      // Step 9: Delete the main transaction
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', transactionId);
      
      if (error) throw new Error(`Failed to delete transaction: ${error.message}`);

      console.log(`Successfully deleted transaction ${transactionId} and rolled back all related data`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stockMovements'] });
      queryClient.invalidateQueries({ queryKey: ['cashFlow'] });
      queryClient.invalidateQueries({ queryKey: ['cash_history'] });
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
      queryClient.invalidateQueries({ queryKey: ['paymentHistory'] });
      queryClient.invalidateQueries({ queryKey: ['deliveries'] });
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: ['commission-rules'] });
      queryClient.invalidateQueries({ queryKey: ['commission-entries'] });
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

  // Update due date for receivables
  const updateDueDate = useMutation({
    mutationFn: async ({ transactionId, dueDate }: { transactionId: string; dueDate: Date | null }) => {
      const { error } = await supabase
        .from('transactions')
        .update({ due_date: dueDate ? dueDate.toISOString() : null })
        .eq('id', transactionId);

      if (error) throw new Error(`Gagal mengubah jatuh tempo: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });

  return { transactions, isLoading, addTransaction, updateTransaction, payReceivable, deleteReceivable, updateTransactionStatus, deductMaterials, deleteTransaction, updateDueDate }
}

export const useTransactionById = (id: string) => {
  const { data: transaction, isLoading } = useQuery<Transaction | undefined>({
    queryKey: ['transaction', id],
    queryFn: async () => {
      const { data: rawData, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', id)
        .order('id').limit(1);
      if (error) {
        console.error(error.message);
        return undefined;
      }
      const data = Array.isArray(rawData) ? rawData[0] : rawData;
      if (!data) return undefined;
      return fromDb(data);
    },
    enabled: !!id,
    // Optimized settings for single transaction
    staleTime: 5 * 60 * 1000, // 5 minutes - single transaction changes less frequently
    gcTime: 10 * 60 * 1000, // 10 minutes cache
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
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
        // Optimized settings for customer transactions
        staleTime: 3 * 60 * 1000, // 3 minutes
        gcTime: 10 * 60 * 1000, // 10 minutes cache
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: 1,
    });
    return { transactions, isLoading };
}