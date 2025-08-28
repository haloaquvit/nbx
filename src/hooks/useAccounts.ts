import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Account } from '@/types/account'
import { supabase } from '@/integrations/supabase/client'

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
  normalBalance: dbAccount.normal_balance || 'DEBIT',
  isHeader: dbAccount.is_header || false,
  isActive: dbAccount.is_active !== false, // Default to true if not specified
  sortOrder: dbAccount.sort_order || 0,
});

// Helper to map from App (camelCase) to DB (snake_case)
const fromAppToDb = (appAccount: Partial<Omit<Account, 'id' | 'createdAt'>>) => {
  const { 
    isPaymentAccount, 
    initialBalance, 
    parentId, 
    normalBalance, 
    isHeader, 
    isActive, 
    sortOrder,
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
  if (normalBalance !== undefined) {
    dbData.normal_balance = normalBalance;
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
  
  return dbData;
};

export const useAccounts = () => {
  const queryClient = useQueryClient()

  const { data: accounts, isLoading } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('accounts').select('*');
      if (error) throw new Error(error.message);
      return data ? data.map(fromDbToApp) : [];
    },
    // Optimized for Dashboard and POS usage  
    staleTime: 10 * 60 * 1000, // 10 minutes - accounts change infrequently
    gcTime: 15 * 60 * 1000, // 15 minutes cache
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
      const { data, error } = await supabase
        .from('accounts')
        .insert({ ...dbData, id: `acc-${Date.now()}` })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return fromDbToApp(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  const updateAccountBalance = useMutation({
    mutationFn: async ({ accountId, amount }: { accountId: string, amount: number }) => {
      const { data: currentAccount, error: fetchError } = await supabase.from('accounts').select('balance').eq('id', accountId).single();
      if (fetchError) throw fetchError;

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

      const { data, error: updateError } = await supabase.from('accounts').update({ balance: newBalance }).eq('id', accountId).select().single();
      if (updateError) throw updateError;
      return fromDbToApp(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    }
  })

  const updateAccount = useMutation({
    mutationFn: async ({ accountId, newData }: { accountId: string, newData: Partial<Account> }) => {
      const dbData = fromAppToDb(newData);
      const { data, error } = await supabase.from('accounts').update(dbData).eq('id', accountId).select().single();
      if (error) throw error;
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
      const { data: currentAccount, error: fetchError } = await supabase
        .from('accounts')
        .select('balance, initial_balance')
        .eq('id', accountId)
        .single();
      
      if (fetchError) throw fetchError;

      // Calculate how much the balance should change
      const balanceDifference = initialBalance - (currentAccount.initial_balance || 0);
      const newBalance = currentAccount.balance + balanceDifference;

      // Update both initial_balance and balance
      const { data, error } = await supabase
        .from('accounts')
        .update({ 
          initial_balance: initialBalance,
          balance: newBalance 
        })
        .eq('id', accountId)
        .select()
        .single();
        
      if (error) throw error;
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

      const { data, error } = await supabase
        .from('accounts')
        .update(updateData)
        .eq('id', accountId)
        .select()
        .single();
      if (error) throw error;
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
      normalBalance: string,
      isHeader: boolean,
      sortOrder: number
    }>) => {
      // First pass: Create accounts without parent relationships
      const accountsToCreate = coaTemplate.map(template => ({
        id: `acc-${template.code}`,
        code: template.code,
        name: template.name,
        type: template.type,
        balance: 0,
        initial_balance: 0,
        level: template.level,
        normal_balance: template.normalBalance,
        is_header: template.isHeader,
        is_active: true,
        is_payment_account: false,
        sort_order: template.sortOrder,
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
        const { data, error } = await supabase
          .from('accounts')
          .select('balance')
          .eq('id', accountId)
          .single();
        if (error) throw error;
        return Number(data.balance) || 0;
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