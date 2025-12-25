import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Account } from '@/types/account'
import { supabase } from '@/integrations/supabase/client'
import { useBranch } from '@/contexts/BranchContext'

// Helper to map from DB (snake_case) to App (camelCase)
const fromDbToApp = (dbAccount: any): Account => ({
  id: dbAccount.id,
  name: dbAccount.name,
  type: dbAccount.type,
  balance: Number(dbAccount.balance) || 0, // Ensure balance is a number
  initialBalance: Number(dbAccount.initial_balance) || 0, // Ensure initialBalance is a number
  isPaymentAccount: dbAccount.is_payment_account,
  createdAt: new Date(dbAccount.created_at),

  // Enhanced Chart of Accounts fields
  code: dbAccount.code || undefined,
  parentId: dbAccount.parent_id || undefined,
  level: dbAccount.level || 1,
  isHeader: dbAccount.is_header || false,
  isActive: dbAccount.is_active !== false, // Default to true if not specified
  sortOrder: dbAccount.sort_order || 0,
  branchId: dbAccount.branch_id || undefined, // Branch ID for multi-branch COA
});

// Helper to map from App (camelCase) to DB (snake_case)
const fromAppToDb = (appAccount: Partial<Omit<Account, 'id' | 'createdAt'>>) => {
  const {
    isPaymentAccount,
    initialBalance,
    parentId,
    isHeader,
    isActive,
    sortOrder,
    branchId,
    ...rest
  } = appAccount as any;

  const dbData: any = { ...rest };

  // Legacy fields
  if (isPaymentAccount !== undefined) {
    dbData.is_payment_account = isPaymentAccount;
  }
  if (initialBalance !== undefined) {
    dbData.initial_balance = initialBalance;
  }

  // Enhanced CoA fields
  if (parentId !== undefined) {
    dbData.parent_id = parentId || null;
  }
  if (isHeader !== undefined) {
    dbData.is_header = isHeader;
  }
  if (isActive !== undefined) {
    dbData.is_active = isActive;
  }
  if (sortOrder !== undefined) {
    dbData.sort_order = sortOrder;
  }
  if (branchId !== undefined) {
    dbData.branch_id = branchId || null;
  }

  return dbData;
};

export const useAccounts = () => {
  const queryClient = useQueryClient()
  const { currentBranch } = useBranch()

  const { data: accounts, isLoading } = useQuery<Account[]>({
    queryKey: ['accounts', currentBranch?.id], // Include branch to recalculate balances
    queryFn: async () => {
      // ============================================================================
      // COA STRUCTURE IS GLOBAL, BALANCE IS PER BRANCH
      // ============================================================================
      // - Struktur COA (kode, nama, tipe) sama untuk semua branch
      // - Saldo dihitung dari journal_entry_lines per branch (BUKAN cash_history)
      // - journal_entries adalah sumber kebenaran untuk akuntansi
      // - cash_history hanya untuk monitoring Buku Kas Harian
      // ============================================================================

      // Get ALL accounts (struktur COA global)
      const { data: accountsData, error } = await supabase
        .from('accounts')
        .select('*')
        .order('code');

      if (error) throw new Error(error.message);

      const baseAccounts = accountsData ? accountsData.map(fromDbToApp) : [];

      // ============================================================================
      // CALCULATE BALANCE PER BRANCH FROM JOURNAL_ENTRY_LINES
      // ============================================================================
      if (!currentBranch?.id) {
        console.log('📊 No branch selected, returning accounts with initial balance only');
        // Return accounts with initial_balance as balance (no transactions)
        return baseAccounts.map(acc => ({
          ...acc,
          balance: acc.initialBalance || 0
        }));
      }

      // Get all journal_entry_lines for current branch to calculate per-branch balance
      // Only include POSTED journals that are NOT voided
      // Note: PostgREST doesn't support !inner syntax, so we filter on client side
      const { data: journalLines, error: journalError } = await supabase
        .from('journal_entry_lines')
        .select(`
          account_id,
          debit_amount,
          credit_amount,
          journal_entries (
            branch_id,
            status,
            is_voided
          )
        `);

      if (journalError) {
        console.warn('Error fetching journal_entry_lines for balance calculation:', journalError.message);
        // Fallback to initial_balance only
        return baseAccounts.map(acc => ({
          ...acc,
          balance: acc.initialBalance || 0
        }));
      }

      // Calculate balance per account from journal_entry_lines
      const accountBalanceMap = new Map<string, number>();

      // Initialize with initial_balance for each account
      baseAccounts.forEach(acc => {
        accountBalanceMap.set(acc.id, acc.initialBalance || 0);
      });

      // ============================================================================
      // PERHITUNGAN SALDO DARI JOURNAL_ENTRY_LINES
      // ============================================================================
      // Berdasarkan prinsip akuntansi double-entry:
      // - Aset & Beban: Debit (+), Credit (-)
      // - Kewajiban, Modal, Pendapatan: Debit (-), Credit (+)
      // ============================================================================
      const accountTypes = new Map<string, string>();
      baseAccounts.forEach(acc => {
        accountTypes.set(acc.id, acc.type);
      });

      // Filter journal lines on client side (PostgREST doesn't support !inner)
      const filteredJournalLines = (journalLines || []).filter((line: any) => {
        const journal = line.journal_entries;
        if (!journal) return false;
        return journal.branch_id === currentBranch.id &&
               journal.status === 'posted' &&
               journal.is_voided === false;
      });

      filteredJournalLines.forEach((line: any) => {
        if (!line.account_id) return;

        const currentBalance = accountBalanceMap.get(line.account_id) || 0;
        const debitAmount = Number(line.debit_amount) || 0;
        const creditAmount = Number(line.credit_amount) || 0;
        const accountType = accountTypes.get(line.account_id) || 'Aset';

        // Determine balance change based on account type
        const isDebitNormal = ['Aset', 'Beban'].includes(accountType);

        let balanceChange = 0;
        if (isDebitNormal) {
          // Aset & Beban: Debit increases, Credit decreases
          balanceChange = debitAmount - creditAmount;
        } else {
          // Kewajiban, Modal, Pendapatan: Credit increases, Debit decreases
          balanceChange = creditAmount - debitAmount;
        }

        accountBalanceMap.set(line.account_id, currentBalance + balanceChange);
      });

      // Apply calculated balances to accounts
      const accountsWithBranchBalance = baseAccounts.map(acc => ({
        ...acc,
        balance: accountBalanceMap.get(acc.id) ?? 0
      }));

      console.log('📊 Accounts loaded from journal_entries for branch:', currentBranch?.name, 'Count:', accountsWithBranchBalance.length);

      return accountsWithBranchBalance;
    },
    // Enable when branch is selected
    enabled: !!currentBranch,
    // Optimized for Dashboard and POS usage
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes cache
    refetchOnMount: true, // Auto-refetch when switching branches
    refetchOnWindowFocus: false, // Don't refetch on window focus
    refetchOnReconnect: false, // Don't refetch on reconnect
    retry: 1, // Only retry once
    retryDelay: 1000,
  })

  const addAccount = useMutation({
    mutationFn: async (newAccountData: Omit<Account, 'id' | 'createdAt'>): Promise<Account> => {
      const dbData = fromAppToDb(newAccountData);
      // Set initial_balance equal to balance when creating new account
      if (!dbData.initial_balance && dbData.balance) {
        dbData.initial_balance = dbData.balance;
      }
      // Set branch_id if not provided and currentBranch is available
      if (!dbData.branch_id && currentBranch?.id) {
        dbData.branch_id = currentBranch.id;
      }
      // Use .limit(1) and handle array response because our client forces Accept: application/json
      const { data: dataRaw, error } = await supabase
        .from('accounts')
        .insert({ ...dbData, id: `acc-${Date.now()}` })
        .select()
        .limit(1);
      if (error) throw new Error(error.message);
      const data = Array.isArray(dataRaw) ? dataRaw[0] : dataRaw;
      if (!data) throw new Error('Failed to create account');
      return fromDbToApp(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  const updateAccountBalance = useMutation({
    mutationFn: async ({ accountId, amount }: { accountId: string, amount: number }) => {
      // Use .limit(1) and handle array response because our client forces Accept: application/json
      const { data: currentAccountRaw, error: fetchError } = await supabase.from('accounts').select('balance').eq('id', accountId).limit(1);
      if (fetchError) throw fetchError;
      const currentAccount = Array.isArray(currentAccountRaw) ? currentAccountRaw[0] : currentAccountRaw;
      if (!currentAccount) throw new Error('Account not found');

      // Ensure both values are numbers to prevent string concatenation
      const currentBalance = Number(currentAccount.balance) || 0;
      const amountToAdd = Number(amount) || 0;
      const newBalance = currentBalance + amountToAdd;

      console.log(`Updating account ${accountId}:`, {
        currentBalance,
        amountToAdd,
        newBalance,
        currentBalanceType: typeof currentBalance,
        amountType: typeof amountToAdd
      });

      // Use .limit(1) and handle array response because our client forces Accept: application/json
      const { data: updateDataRaw, error: updateError } = await supabase.from('accounts').update({ balance: newBalance }).eq('id', accountId).select().limit(1);
      if (updateError) throw updateError;
      const data = Array.isArray(updateDataRaw) ? updateDataRaw[0] : updateDataRaw;
      if (!data) throw new Error('Failed to update account balance');
      return fromDbToApp(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    }
  })

  const updateAccount = useMutation({
    mutationFn: async ({ accountId, newData }: { accountId: string, newData: Partial<Account> }) => {
      const dbData = fromAppToDb(newData);
      // Use .limit(1) and handle array response because our client forces Accept: application/json
      const { data: dataRaw, error } = await supabase.from('accounts').update(dbData).eq('id', accountId).select().limit(1);
      if (error) throw error;
      const data = Array.isArray(dataRaw) ? dataRaw[0] : dataRaw;
      if (!data) throw new Error('Failed to update account');
      return fromDbToApp(data);
    },
    onSuccess: () => {
      // Force refresh accounts cache
      queryClient.removeQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    }
  })

  const updateInitialBalance = useMutation({
    mutationFn: async ({ accountId, initialBalance }: { accountId: string, initialBalance: number }) => {
      // Get current balance and calculate the difference
      // Use .limit(1) and handle array response because our client forces Accept: application/json
      const { data: currentAccountRaw, error: fetchError } = await supabase
        .from('accounts')
        .select('balance, initial_balance')
        .eq('id', accountId)
        .limit(1);

      if (fetchError) throw fetchError;
      const currentAccount = Array.isArray(currentAccountRaw) ? currentAccountRaw[0] : currentAccountRaw;
      if (!currentAccount) throw new Error('Account not found');

      // Calculate how much the balance should change
      const balanceDifference = initialBalance - (currentAccount.initial_balance || 0);
      const newBalance = currentAccount.balance + balanceDifference;

      // Update both initial_balance and balance
      // Use .limit(1) and handle array response because our client forces Accept: application/json
      const { data: dataRaw, error } = await supabase
        .from('accounts')
        .update({
          initial_balance: initialBalance,
          balance: newBalance
        })
        .eq('id', accountId)
        .select()
        .limit(1);

      if (error) throw error;
      const data = Array.isArray(dataRaw) ? dataRaw[0] : dataRaw;
      if (!data) throw new Error('Failed to update initial balance');
      return fromDbToApp(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    }
  })

  const deleteAccount = useMutation({
    mutationFn: async (accountId: string): Promise<void> => {
      const { error } = await supabase
        .from('accounts')
        .delete()
        .eq('id', accountId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      // Force complete cache refresh for accounts
      queryClient.removeQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      
      // Also invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['cashFlow'] });
      queryClient.invalidateQueries({ queryKey: ['cashBalance'] });
    },
  });

  // Enhanced CoA functions
  const getAccountsHierarchy = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw new Error(error.message);
      return data ? data.map(fromDbToApp) : [];
    },
  });

  const moveAccount = useMutation({
    mutationFn: async ({ accountId, newParentId, newSortOrder }: {
      accountId: string,
      newParentId?: string,
      newSortOrder?: number
    }) => {
      const updateData: any = {};
      if (newParentId !== undefined) {
        updateData.parent_id = newParentId || null;
      }
      if (newSortOrder !== undefined) {
        updateData.sort_order = newSortOrder;
      }

      // Use .limit(1) and handle array response because our client forces Accept: application/json
      const { data: dataRaw, error } = await supabase
        .from('accounts')
        .update(updateData)
        .eq('id', accountId)
        .select()
        .limit(1);
      if (error) throw error;
      const data = Array.isArray(dataRaw) ? dataRaw[0] : dataRaw;
      if (!data) throw new Error('Failed to move account');
      return fromDbToApp(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    }
  });

  const bulkUpdateAccountCodes = useMutation({
    mutationFn: async (updates: Array<{ accountId: string, code: string, sortOrder?: number }>) => {
      const updatePromises = updates.map(({ accountId, code, sortOrder }) =>
        supabase
          .from('accounts')
          .update({ 
            code, 
            ...(sortOrder !== undefined && { sort_order: sortOrder })
          })
          .eq('id', accountId)
      );

      const results = await Promise.all(updatePromises);
      const errors = results.filter(result => result.error);
      if (errors.length > 0) {
        throw new Error(`Failed to update ${errors.length} accounts`);
      }
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    }
  });

  const importStandardCoA = useMutation({
    mutationFn: async (coaTemplate: Array<{
      code: string,
      name: string,
      type: string,
      parentCode?: string,
      level: number,
      isHeader: boolean,
      sortOrder: number
    }>) => {
      // First pass: Create accounts without parent relationships
      // Include branch_id from current active branch
      const accountsToCreate = coaTemplate.map(template => ({
        id: `acc-${template.code}`,
        code: template.code,
        name: template.name,
        type: template.type,
        balance: 0,
        initial_balance: 0,
        level: template.level,
        is_header: template.isHeader,
        is_active: true,
        is_payment_account: false,
        sort_order: template.sortOrder,
        branch_id: currentBranch?.id || null,
        created_at: new Date().toISOString()
      }));

      // Use upsert to handle duplicates
      const { error: insertError } = await supabase
        .from('accounts')
        .upsert(accountsToCreate, { onConflict: 'id' });

      if (insertError) {
        throw new Error(insertError.message);
      }

      // Second pass: Update parent relationships
      const parentUpdates = coaTemplate
        .filter(template => template.parentCode)
        .map(template => ({
          accountCode: template.code,
          parentCode: template.parentCode
        }));

      for (const update of parentUpdates) {
        const { error } = await supabase
          .from('accounts')
          .update({ parent_id: `acc-${update.parentCode}` })
          .eq('code', update.accountCode);

        if (error) {
          console.warn(`Failed to set parent for ${update.accountCode}:`, error);
        }
      }

      return accountsToCreate.length;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    }
  });

  const getAccountBalance = useMutation({
    mutationFn: async (accountId: string, includeChildren = false) => {
      if (!includeChildren) {
        // Use .limit(1) and handle array response because our client forces Accept: application/json
        const { data: dataRaw, error } = await supabase
          .from('accounts')
          .select('balance')
          .eq('id', accountId)
          .limit(1);
        if (error) throw error;
        const data = Array.isArray(dataRaw) ? dataRaw[0] : dataRaw;
        return Number(data?.balance) || 0;
      }

      // Use the database function for hierarchical balance calculation
      const { data, error } = await supabase
        .rpc('get_account_balance_with_children', { account_id: accountId });
      if (error) throw error;
      return Number(data) || 0;
    }
  });

  return {
    accounts,
    isLoading,
    addAccount,
    updateAccountBalance,
    updateAccount,
    updateInitialBalance,
    deleteAccount,
    // Enhanced CoA functions
    getAccountsHierarchy,
    moveAccount,
    bulkUpdateAccountCodes,
    importStandardCoA,
    getAccountBalance,
  }
}