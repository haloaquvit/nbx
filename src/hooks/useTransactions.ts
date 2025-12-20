import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Transaction } from '@/types/transaction'
import { supabase } from '@/integrations/supabase/client'
import { useExpenses } from './useExpenses'
import { StockService } from '@/services/stockService'
import { MaterialStockService } from '@/services/materialStockService'
import { generateSalesCommission } from '@/utils/commissionUtils'
import { useBranch } from '@/contexts/BranchContext'

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
    items: itemsWithSales,
    total: appTransaction.total,
    paid_amount: appTransaction.paidAmount,
    payment_status: appTransaction.paymentStatus,
    status: appTransaction.status,
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
          const { data: accountData, error: accountError } = await supabase
            .from('accounts')
            .select('name')
            .eq('id', newTransaction.paymentAccountId)
            .single();

          if (accountError) {
            console.error('Failed to fetch account name:', accountError.message);
          }

          const cashFlowRecord = {
            account_id: newTransaction.paymentAccountId,
            account_name: accountData?.name || 'Unknown Account', // Add required account_name field
            type: 'orderan',
            amount: newTransaction.paidAmount,
            description: `Pembayaran orderan ${savedTransaction.id} - ${newTransaction.customerName}`,
            reference_id: savedTransaction.id,
            reference_name: `Orderan ${savedTransaction.id}`,
            user_id: newTransaction.cashierId,
            user_name: newTransaction.cashierName,
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
      // BONUS ITEM ACCOUNTING FOR ALL TRANSACTIONS
      // Bonus is recorded when transaction is created (not during delivery)
      // Journal: Debit Beban Promosi (6150), Credit Persediaan (1400)
      // ============================================================================
      try {
        // Filter bonus items from transaction
        const bonusItems = newTransaction.items?.filter((item: any) => item.isBonus === true) || [];

        if (bonusItems.length > 0) {
          console.log('🎁 Processing bonus items for transaction:', bonusItems.length);

            // Get product cost prices (HPP) for bonus items
            const bonusProductIds = bonusItems.map((item: any) => item.product?.id).filter(Boolean);

            if (bonusProductIds.length > 0) {
              const { data: productsWithCost } = await supabase
                .from('products')
                .select('id, name, cost_price, base_price')
                .in('id', bonusProductIds);

              // Calculate total bonus cost
              let totalBonusCost = 0;
              const bonusDetails: string[] = [];

              for (const bonusItem of bonusItems) {
                const productId = bonusItem.product?.id;
                const product = productsWithCost?.find(p => p.id === productId);
                // Use cost_price (HPP) if available, otherwise estimate as 70% of base_price
                const costPrice = product?.cost_price || (product?.base_price ? product.base_price * 0.7 : 0);
                const itemCost = costPrice * (bonusItem.quantity || 0);
                totalBonusCost += itemCost;
                bonusDetails.push(`${bonusItem.product?.name || 'Unknown'} x${bonusItem.quantity}`);
              }

              if (totalBonusCost > 0) {
                // Find Beban Promosi account (6150)
                const { data: bebanPromosiAccount } = await supabase
                  .from('accounts')
                  .select('id, name, code, balance')
                  .eq('code', '6150')
                  .single();

                // Find Persediaan Barang account (1400 or 1410)
                const { data: persediaanAccount } = await supabase
                  .from('accounts')
                  .select('id, name, code, balance')
                  .or('code.eq.1400,code.eq.1410')
                  .limit(1)
                  .single();

                if (bebanPromosiAccount && persediaanAccount) {
                  // Update Beban Promosi (Debit - increase expense)
                  const newBebanBalance = (bebanPromosiAccount.balance || 0) + totalBonusCost;
                  await supabase
                    .from('accounts')
                    .update({ balance: newBebanBalance })
                    .eq('id', bebanPromosiAccount.id);

                  // Update Persediaan (Credit - decrease asset)
                  const newPersediaanBalance = (persediaanAccount.balance || 0) - totalBonusCost;
                  await supabase
                    .from('accounts')
                    .update({ balance: newPersediaanBalance })
                    .eq('id', persediaanAccount.id);

                  // Record in cash_history for audit trail
                  const bonusDescription = `Bonus promosi: ${bonusDetails.join(', ')} - ${newTransaction.customerName}`;

                  await supabase
                    .from('cash_history')
                    .insert({
                      account_id: bebanPromosiAccount.id,
                      account_name: bebanPromosiAccount.name,
                      type: 'pengeluaran',
                      amount: totalBonusCost,
                      description: bonusDescription,
                      reference_id: savedTransaction.id,
                      reference_name: `Transaksi ${savedTransaction.id}`,
                      user_id: newTransaction.cashierId || null,
                      user_name: newTransaction.cashierName || null,
                      branch_id: currentBranch?.id || null,
                      expense_account_id: bebanPromosiAccount.id,
                      expense_account_name: bebanPromosiAccount.name,
                    });

                  console.log('✅ Bonus accounting entries created:', {
                    bebanPromosi: { account: bebanPromosiAccount.code, amount: totalBonusCost },
                    persediaan: { account: persediaanAccount.code, amount: -totalBonusCost },
                    bonusItems: bonusDetails
                  });
                } else {
                  console.warn('⚠️ Beban Promosi (6150) or Persediaan (1400/1410) account not found in COA');
                }
              }
            }
          }
      } catch (bonusAccountingError) {
        console.error('Error creating bonus accounting entries:', bonusAccountingError);
        // Don't fail transaction creation if bonus accounting fails
      }

      // ============================================================================
      // REVENUE RECOGNITION & HPP PENJUALAN
      // Journal for sales transaction:
      // 1. Credit: 4100 Pendapatan Penjualan (increase revenue) = transaction total
      // 2. Debit: 5100 HPP (increase cost)
      // 3. Credit: 1320/1400 Persediaan Produk (decrease inventory)
      // Note: Cash/Receivable is already recorded via cash_history
      // ============================================================================
      try {
        // Calculate HPP for non-bonus items
        let totalHPP = 0;
        const soldProducts: string[] = [];

        const regularItems = newTransaction.items?.filter((item: any) => !item.isBonus) || [];

        if (regularItems.length > 0) {
          const productIds = regularItems.map((item: any) => item.product?.id).filter(Boolean);

          if (productIds.length > 0) {
            const { data: productsData } = await supabase
              .from('products')
              .select('id, name, cost_price, base_price')
              .in('id', productIds);

            for (const item of regularItems) {
              const product = productsData?.find(p => p.id === item.product?.id);
              if (product) {
                // Calculate HPP (Cost of Goods Sold)
                const itemHPP = (product.cost_price || product.base_price * 0.7) * (item.quantity || 0);
                totalHPP += itemHPP;
                soldProducts.push(`${product.name} x${item.quantity}`);
              }
            }
          }
        }

        // Find Pendapatan Penjualan account (4100)
        const { data: pendapatanAccount } = await supabase
          .from('accounts')
          .select('id, name, code, balance')
          .eq('code', '4100')
          .single();

        // Update Pendapatan (Credit - increase revenue)
        if (pendapatanAccount && newTransaction.total > 0) {
          const newPendapatanBalance = (pendapatanAccount.balance || 0) + newTransaction.total;
          await supabase
            .from('accounts')
            .update({ balance: newPendapatanBalance })
            .eq('id', pendapatanAccount.id);

          console.log('✅ Pendapatan Penjualan recorded:', {
            account: pendapatanAccount.code,
            amount: newTransaction.total
          });
        }

        // Update HPP & Persediaan for COGS
        if (totalHPP > 0) {
          // Find HPP account (5100)
          const { data: hppAccount } = await supabase
            .from('accounts')
            .select('id, name, code, balance')
            .eq('code', '5100')
            .single();

          // Find Persediaan Produk Jadi account (1320 or 1400)
          const { data: persediaanProdukAccount } = await supabase
            .from('accounts')
            .select('id, name, code, balance')
            .or('code.eq.1320,code.eq.1400')
            .limit(1)
            .single();

          if (hppAccount && persediaanProdukAccount) {
            // Update HPP (Debit - increase cost)
            const newHppBalance = (hppAccount.balance || 0) + totalHPP;
            await supabase
              .from('accounts')
              .update({ balance: newHppBalance })
              .eq('id', hppAccount.id);

            // Update Persediaan Produk (Credit - decrease inventory)
            const newPersediaanBalance = (persediaanProdukAccount.balance || 0) - totalHPP;
            await supabase
              .from('accounts')
              .update({ balance: newPersediaanBalance })
              .eq('id', persediaanProdukAccount.id);

            console.log('✅ HPP Penjualan recorded:', {
              hpp: { account: hppAccount.code, amount: totalHPP },
              persediaan: { account: persediaanProdukAccount.code, amount: -totalHPP },
              products: soldProducts
            });
          }
        }
      } catch (revenueAccountingError) {
        console.error('Error creating revenue/HPP accounting:', revenueAccountingError);
        // Don't fail transaction if accounting fails
      }

      // ============================================================================
      // UPDATE PIUTANG USAHA IN COA (for credit/unpaid transactions)
      // ============================================================================
      // If transaction is not fully paid, increase Piutang Usaha account
      const receivableAmount = newTransaction.total - (newTransaction.paidAmount || 0);
      if (receivableAmount > 0 && (newTransaction.paymentStatus === 'Belum Lunas' || newTransaction.paymentStatus === 'Kredit')) {
        try {
          // Find Piutang Usaha account (code 1200 or 1210)
          const { data: piutangAccount, error: piutangError } = await supabase
            .from('accounts')
            .select('id, name, code, balance')
            .or('code.eq.1200,code.eq.1210')
            .limit(1)
            .single();

          if (piutangError) {
            // Try alternative: find by name
            const { data: piutangByName } = await supabase
              .from('accounts')
              .select('id, name, code, balance')
              .ilike('name', '%piutang usaha%')
              .limit(1)
              .single();

            if (piutangByName) {
              const newBalance = (piutangByName.balance || 0) + receivableAmount;
              await supabase
                .from('accounts')
                .update({ balance: newBalance })
                .eq('id', piutangByName.id);

              console.log('✅ Piutang Usaha increased (by name):', {
                account: piutangByName.name,
                code: piutangByName.code,
                amount: receivableAmount,
                newBalance
              });
            } else {
              console.warn('⚠️ Piutang Usaha account (1200/1210) not found in COA');
            }
          } else if (piutangAccount) {
            const newBalance = (piutangAccount.balance || 0) + receivableAmount;
            await supabase
              .from('accounts')
              .update({ balance: newBalance })
              .eq('id', piutangAccount.id);

            console.log('✅ Piutang Usaha increased:', {
              account: piutangAccount.name,
              code: piutangAccount.code,
              amount: receivableAmount,
              newBalance
            });
          }
        } catch (error) {
          console.error('Error updating Piutang Usaha:', error);
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

  const updateTransaction = useMutation({
    mutationFn: async (updatedTransaction: Transaction): Promise<Transaction> => {
      const dbData = toDb(updatedTransaction);
      const { data: savedTransaction, error } = await supabase
        .from('transactions')
        .update(dbData)
        .eq('id', updatedTransaction.id)
        .select()
        .single();
      
      if (error) throw new Error(error.message);
      
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
      const { data: transaction, error: fetchError } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', transactionId)
        .single();
        
      if (fetchError) throw new Error(`Failed to fetch transaction: ${fetchError.message}`);
      
      // Step 2: Stock restoration is handled by delivery deletion (see Step 8)
      // Transaction creation doesn't reduce stock - only delivery does
      // So we don't need to restore stock from transaction items here
      console.log('Stock restoration will be handled by delivery deletion (Step 8)');
      
      // Step 3: Rollback account balance if there was payment
      if (transaction.paid_amount > 0 && transaction.payment_account_id) {
        console.log(`Reversing payment of ${transaction.paid_amount} from account ${transaction.payment_account_id}`);
        try {
          // Get current account balance
          const { data: account, error: accountError } = await supabase
            .from('accounts')
            .select('balance')
            .eq('id', transaction.payment_account_id)
            .single();
            
          if (accountError) {
            console.error('Failed to get account:', accountError);
          } else {
            // Subtract the payment amount from account balance
            const newBalance = (account.balance || 0) - transaction.paid_amount;
            console.log(`Reversing account balance: ${account.balance} - ${transaction.paid_amount} = ${newBalance}`);
            
            const { error: balanceError } = await supabase
              .from('accounts')
              .update({ balance: newBalance })
              .eq('id', transaction.payment_account_id);
              
            if (balanceError) {
              console.error('Failed to reverse account balance:', balanceError);
            }
          }
        } catch (error) {
          console.error('Error reversing account balance:', error);
        }
      }
      
      // Step 3.5: Rollback bonus accounting for all transactions
      try {
        console.log('🎁 Rolling back bonus accounting for transaction:', transactionId);

          // Filter bonus items from transaction
          const transactionItems = transaction.items || [];
          const bonusItems = transactionItems.filter((item: any) => item.isBonus === true);

          if (bonusItems.length > 0) {
            // Get product cost prices (HPP) for bonus items
            const bonusProductIds = bonusItems.map((item: any) => item.product?.id).filter(Boolean);

            if (bonusProductIds.length > 0) {
              const { data: productsWithCost } = await supabase
                .from('products')
                .select('id, name, cost_price, base_price')
                .in('id', bonusProductIds);

              // Calculate total bonus cost to reverse
              let totalBonusCost = 0;

              for (const bonusItem of bonusItems) {
                const productId = bonusItem.product?.id;
                const product = productsWithCost?.find(p => p.id === productId);
                const costPrice = product?.cost_price || (product?.base_price ? product.base_price * 0.7 : 0);
                const itemCost = costPrice * (bonusItem.quantity || 0);
                totalBonusCost += itemCost;
              }

              if (totalBonusCost > 0) {
                // Find accounts
                const { data: bebanPromosiAccount } = await supabase
                  .from('accounts')
                  .select('id, name, code, balance')
                  .eq('code', '6150')
                  .single();

                const { data: persediaanAccount } = await supabase
                  .from('accounts')
                  .select('id, name, code, balance')
                  .or('code.eq.1400,code.eq.1410')
                  .limit(1)
                  .single();

                if (bebanPromosiAccount && persediaanAccount) {
                  // Reverse Beban Promosi (Credit - decrease expense)
                  const newBebanBalance = (bebanPromosiAccount.balance || 0) - totalBonusCost;
                  await supabase
                    .from('accounts')
                    .update({ balance: newBebanBalance })
                    .eq('id', bebanPromosiAccount.id);

                  // Reverse Persediaan (Debit - increase asset)
                  const newPersediaanBalance = (persediaanAccount.balance || 0) + totalBonusCost;
                  await supabase
                    .from('accounts')
                    .update({ balance: newPersediaanBalance })
                    .eq('id', persediaanAccount.id);

                  console.log('✅ Bonus accounting reversed:', {
                    bebanPromosi: { account: bebanPromosiAccount.code, amount: -totalBonusCost },
                    persediaan: { account: persediaanAccount.code, amount: totalBonusCost }
                  });
                }
              }
            }
          }
      } catch (bonusRollbackError) {
        console.error('Error rolling back bonus accounting:', bonusRollbackError);
        // Don't fail deletion if bonus rollback fails
      }

      // Step 3.6: Rollback Revenue & HPP Penjualan accounting
      try {
        console.log('💰 Rolling back revenue & HPP accounting for transaction:', transactionId);

        // Rollback Pendapatan (Debit - decrease revenue)
        if (transaction.total > 0) {
          const { data: pendapatanAccount } = await supabase
            .from('accounts')
            .select('id, balance')
            .eq('code', '4100')
            .single();

          if (pendapatanAccount) {
            await supabase
              .from('accounts')
              .update({ balance: (pendapatanAccount.balance || 0) - transaction.total })
              .eq('id', pendapatanAccount.id);

            console.log('✅ Pendapatan Penjualan reversed:', { amount: -transaction.total });
          }
        }

        // Calculate and rollback HPP for non-bonus items
        const transactionItems = transaction.items || [];
        const regularItems = transactionItems.filter((item: any) => !item.isBonus);

        if (regularItems.length > 0) {
          const productIds = regularItems.map((item: any) => item.product?.id).filter(Boolean);

          if (productIds.length > 0) {
            const { data: productsData } = await supabase
              .from('products')
              .select('id, cost_price, base_price')
              .in('id', productIds);

            let totalHPP = 0;
            for (const item of regularItems) {
              const product = productsData?.find(p => p.id === item.product?.id);
              if (product) {
                totalHPP += (product.cost_price || product.base_price * 0.7) * (item.quantity || 0);
              }
            }

            if (totalHPP > 0) {
              // Reverse HPP (Credit - decrease cost)
              const { data: hppAccount } = await supabase
                .from('accounts')
                .select('id, balance')
                .eq('code', '5100')
                .single();

              // Reverse Persediaan (Debit - increase inventory)
              const { data: persediaanProdukAccount } = await supabase
                .from('accounts')
                .select('id, balance')
                .or('code.eq.1320,code.eq.1400')
                .limit(1)
                .single();

              if (hppAccount && persediaanProdukAccount) {
                await supabase
                  .from('accounts')
                  .update({ balance: (hppAccount.balance || 0) - totalHPP })
                  .eq('id', hppAccount.id);

                await supabase
                  .from('accounts')
                  .update({ balance: (persediaanProdukAccount.balance || 0) + totalHPP })
                  .eq('id', persediaanProdukAccount.id);

                console.log('✅ HPP Penjualan reversed:', { amount: -totalHPP });
              }
            }
          }
        }
      } catch (revenueRollbackError) {
        console.error('Error rolling back revenue/HPP accounting:', revenueRollbackError);
        // Don't fail deletion if rollback fails
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
      const { data: existingCashHistory } = await supabase
        .from('cash_history')
        .select('*')
        .or(`reference_id.eq.${transactionId},description.ilike.%${transactionId}%`);
        
      console.log('Found cash_history records to delete:', existingCashHistory);
      
      // Also check with exact patterns used when saving
      const { data: exactPattern } = await supabase
        .from('cash_history')
        .select('*')
        .like('description', `%Pembayaran orderan ${transactionId}%`);
        
      console.log('Found with exact pattern:', exactPattern);
      
      // Delete by reference_id (primary method)
      const { data: deleted1, error: cashHistoryError1 } = await supabase
        .from('cash_history')
        .delete()
        .eq('reference_id', transactionId)
        .select();
      
      console.log('Deleted by reference_id:', deleted1, 'Error:', cashHistoryError1);
      
      // If no records deleted by reference_id, log the actual records for debugging
      if ((!deleted1 || deleted1.length === 0) && existingCashHistory && existingCashHistory.length > 0) {
        console.log('Records exist but were not deleted. First record details:', {
          id: existingCashHistory[0].id,
          reference_id: existingCashHistory[0].reference_id,
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
        .or(`reference_id.eq.${transactionId},description.like.%${transactionId}%`);
        
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
          .limit(1);
          
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
          .limit(1);
          
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
          
          // First restore stock for each delivery before deletion
          for (const delivery of deliveries) {
            try {
              // Get delivery details and items for stock restoration
              const { data: deliveryData, error: deliveryError } = await supabase
                .from('deliveries')
                .select(`
                  *,
                  items:delivery_items(*)
                `)
                .eq('id', delivery.id)
                .single();

              if (deliveryError) {
                console.error(`Failed to get delivery ${delivery.id}:`, deliveryError);
                continue;
              }

              if (deliveryData.items && deliveryData.items.length > 0) {
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
                      const newStock = currentStock + item.quantity_delivered; // Add back delivered quantity
                      
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
              // Continue with other deliveries
            }

            // Now delete delivery items
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

  return { transactions, isLoading, addTransaction, updateTransaction, payReceivable, deleteReceivable, updateTransactionStatus, deductMaterials, deleteTransaction }
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