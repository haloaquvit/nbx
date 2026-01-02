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

  // Employee assignment for cash accounts
  employeeId: dbAccount.employee_id || undefined,
  employeeName: dbAccount.profiles?.name || dbAccount.profiles?.full_name || undefined, // From join with profiles table
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
    employeeId,
    employeeName, // Exclude from DB data (it's from join)
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

  // Employee assignment for cash accounts
  if (employeeId !== undefined) {
    dbData.employee_id = employeeId || null;
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
      // COA STRUCTURE IS PER BRANCH, BALANCE IS PER BRANCH
      // ============================================================================
      // - Setiap branch memiliki COA sendiri dengan branch_id
      // - Saldo dihitung dari journal_entry_lines per branch
      // - journal_entries adalah sumber kebenaran untuk akuntansi
      // - PENTING: Filter accounts berdasarkan branch_id untuk menghindari
      //   data tercampur antar branch
      // ============================================================================

      // Get accounts for current branch only (or accounts without branch_id for backward compat)
      // Include join with profiles table to get employee name for cash accounts
      let accountsQuery = supabase
        .from('accounts')
        .select('*, profiles:employee_id(name, full_name)');

      // Filter by branch_id if currentBranch is available
      if (currentBranch?.id) {
        // Get accounts that belong to current branch OR have no branch_id (legacy/global accounts)
        accountsQuery = accountsQuery.or(`branch_id.eq.${currentBranch.id},branch_id.is.null`);
      }

      const { data: accountsData, error } = await accountsQuery.order('code');

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

      // Calculate balance per account from journal_entry_lines ONLY
      // ============================================================================
      // PENTING: Saldo dihitung HANYA dari jurnal, TANPA initial_balance
      // initial_balance hanya digunakan sebagai referensi untuk membuat jurnal opening
      // Ini mencegah duplikasi saldo jika sudah ada jurnal saldo awal
      // ============================================================================
      const accountBalanceMap = new Map<string, number>();

      // Initialize with 0 (not initial_balance) - saldo murni dari jurnal
      baseAccounts.forEach(acc => {
        accountBalanceMap.set(acc.id, 0);
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
      // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
      const { data: dataRaw, error } = await supabase
        .from('accounts')
        .insert({ ...dbData, id: `acc-${Date.now()}` })
        .select()
        .order('id').limit(1);
      if (error) throw new Error(error.message);
      const data = Array.isArray(dataRaw) ? dataRaw[0] : dataRaw;
      if (!data) throw new Error('Failed to create account');
      return fromDbToApp(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  // NOTE: updateAccountBalance telah dihapus karena merupakan dead code.
  // Saldo akun HANYA dihitung dari journal_entry_lines (double-entry accounting).
  // Kolom accounts.balance tidak digunakan sebagai source of truth.
  // Gunakan updateInitialBalance untuk mengubah saldo awal (akan auto-create opening journal).

  const updateAccount = useMutation({
    mutationFn: async ({ accountId, newData }: { accountId: string, newData: Partial<Account> }) => {
      const dbData = fromAppToDb(newData);
      // Use .order().limit(1) - PostgREST requires explicit order when using limit
      const { data: dataRaw, error } = await supabase.from('accounts').update(dbData).eq('id', accountId).select().order('id').limit(1);
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
      // Get current account data for journal creation
      const { data: currentAccountRaw, error: fetchError } = await supabase
        .from('accounts')
        .select('id, code, name, type, balance, initial_balance, branch_id')
        .eq('id', accountId)
        .order('id').limit(1);

      if (fetchError) throw fetchError;
      const currentAccount = Array.isArray(currentAccountRaw) ? currentAccountRaw[0] : currentAccountRaw;
      if (!currentAccount) throw new Error('Account not found');

      // Update initial_balance in database (balance is calculated from journals now)
      const { data: dataRaw, error } = await supabase
        .from('accounts')
        .update({
          initial_balance: initialBalance,
        })
        .eq('id', accountId)
        .select()
        .order('id').limit(1);

      if (error) throw error;
      const data = Array.isArray(dataRaw) ? dataRaw[0] : dataRaw;
      if (!data) throw new Error('Failed to update initial balance');

      // ============================================================================
      // AUTO-CREATE/UPDATE OPENING JOURNAL
      // Sekarang saldo dihitung HANYA dari jurnal, jadi kita perlu buat jurnal opening
      // setiap kali initial_balance diubah
      // ============================================================================
      const branchIdForJournal = currentAccount.branch_id || currentBranch?.id;

      if (!branchIdForJournal) {
        console.warn('[useAccounts] Cannot create opening journal: no branch_id available');
        return fromDbToApp(data);
      }

      console.log('[useAccounts] Creating opening journal for:', {
        accountId: currentAccount.id,
        accountCode: currentAccount.code,
        accountName: currentAccount.name,
        accountType: currentAccount.type,
        initialBalance,
        branchId: branchIdForJournal,
      });

      try {
        const { createOrUpdateAccountOpeningJournal } = await import('@/services/journalService');

        const journalResult = await createOrUpdateAccountOpeningJournal({
          accountId: currentAccount.id,
          accountCode: currentAccount.code || '',
          accountName: currentAccount.name,
          accountType: currentAccount.type,
          initialBalance: initialBalance,
          branchId: branchIdForJournal,
        });

        if (!journalResult.success) {
          console.warn('[useAccounts] Failed to create opening journal:', journalResult.error);
          // Don't throw - initial_balance sudah terupdate, jurnal bisa dibuat manual nanti
        } else {
          console.log('[useAccounts] Opening journal created/updated:', journalResult.journalId);
        }
      } catch (journalError) {
        console.error('[useAccounts] Error creating opening journal:', journalError);
        // Don't throw - initial_balance sudah terupdate, jurnal bisa dibuat manual nanti
      }

      return fromDbToApp(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
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

      // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
      const { data: dataRaw, error } = await supabase
        .from('accounts')
        .update(updateData)
        .eq('id', accountId)
        .select()
        .order('id').limit(1);
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
        // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
        const { data: dataRaw, error } = await supabase
          .from('accounts')
          .select('balance')
          .eq('id', accountId)
          .order('id').limit(1);
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

  // Get cash account assigned to a specific employee
  const getEmployeeCashAccount = (employeeId: string): Account | undefined => {
    if (!accounts) return undefined;
    return accounts.find(acc =>
      acc.isPaymentAccount &&
      acc.employeeId === employeeId &&
      acc.isActive !== false
    );
  };

  // Get all cash accounts with employee assignments
  const getCashAccountsWithEmployees = (): Account[] => {
    if (!accounts) return [];
    return accounts.filter(acc =>
      acc.isPaymentAccount &&
      !acc.isHeader &&
      acc.isActive !== false
    );
  };

  // Get unassigned cash accounts (no employee linked)
  const getUnassignedCashAccounts = (): Account[] => {
    if (!accounts) return [];
    return accounts.filter(acc =>
      acc.isPaymentAccount &&
      !acc.isHeader &&
      !acc.employeeId &&
      acc.isActive !== false
    );
  };

  return {
    accounts,
    isLoading,
    addAccount,
    updateAccount,
    updateInitialBalance,
    deleteAccount,
    // Enhanced CoA functions
    getAccountsHierarchy,
    moveAccount,
    bulkUpdateAccountCodes,
    importStandardCoA,
    getAccountBalance,
    // Employee cash account functions
    getEmployeeCashAccount,
    getCashAccountsWithEmployees,
    getUnassignedCashAccounts,
  }
}