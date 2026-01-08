import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Account } from '@/types/account'
import { supabase } from '@/integrations/supabase/client'
import { useBranch } from '@/contexts/BranchContext'

// Helper to map from DB (snake_case) to App (camelCase)
const fromDbToApp = (dbAccount: any): Account => ({
  id: dbAccount.id,
  name: dbAccount.name,
  type: dbAccount.type,
  balance: Number(dbAccount.balance) || 0,
  initialBalance: Number(dbAccount.initial_balance) || 0,
  isPaymentAccount: dbAccount.is_payment_account,
  createdAt: new Date(dbAccount.created_at),

  // Enhanced Chart of Accounts fields
  code: dbAccount.code || undefined,
  parentId: dbAccount.parent_id || undefined,
  level: dbAccount.level || 1,
  isHeader: dbAccount.is_header || false,
  isActive: dbAccount.is_active !== false,
  sortOrder: dbAccount.sort_order || 0,
  branchId: dbAccount.branch_id || undefined,

  // Employee assignment for cash accounts
  employeeId: dbAccount.employee_id || undefined,
  employeeName: dbAccount.profiles?.name || dbAccount.profiles?.full_name || undefined,
});

export const useAccounts = () => {
  const queryClient = useQueryClient()
  const { currentBranch } = useBranch()

  const { data: accounts, isLoading } = useQuery<Account[]>({
    queryKey: ['accounts', currentBranch?.id],
    queryFn: async () => {
      // Get accounts for current branch only
      let accountsQuery = supabase
        .from('accounts')
        .select('*, profiles:employee_id(name, full_name)');

      if (currentBranch?.id) {
        accountsQuery = accountsQuery.eq('branch_id', currentBranch.id);
      }

      const { data: accountsData, error } = await accountsQuery.order('code');

      if (error) throw new Error(error.message);

      const baseAccounts = accountsData ? accountsData.map(fromDbToApp) : [];

      // Calculate Balance from Journals (Client-side for now, but safer would be view)
      if (!currentBranch?.id) {
        return baseAccounts.map(acc => ({ ...acc, balance: acc.initialBalance || 0 }));
      }

      // Get journal lines for balance calculation
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
        console.warn('Error fetching journal_entry_lines:', journalError.message);
        return baseAccounts.map(acc => ({ ...acc, balance: acc.initialBalance || 0 }));
      }

      const accountBalanceMap = new Map<string, number>();
      baseAccounts.forEach(acc => accountBalanceMap.set(acc.id, 0)); // Start at 0, pure journal calc

      const accountTypes = new Map<string, string>();
      baseAccounts.forEach(acc => accountTypes.set(acc.id, acc.type));

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

        // Double Entry Logic
        const isDebitNormal = ['Aset', 'Beban'].includes(accountType);
        const balanceChange = isDebitNormal ? (debitAmount - creditAmount) : (creditAmount - debitAmount);

        accountBalanceMap.set(line.account_id, currentBalance + balanceChange);
      });

      return baseAccounts.map(acc => ({
        ...acc,
        balance: accountBalanceMap.get(acc.id) ?? 0
      }));
    },
    enabled: !!currentBranch,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    retry: 1,
  })

  // CREATE ACCOUNT - RPC
  const addAccount = useMutation({
    mutationFn: async (newAccountData: Omit<Account, 'id' | 'createdAt'>): Promise<Account> => {
      if (!currentBranch?.id) throw new Error('Branch required');

      const { data: rpcResultRaw, error } = await supabase.rpc('create_account', {
        p_branch_id: currentBranch.id,
        p_name: newAccountData.name,
        p_code: newAccountData.code || '',
        p_type: newAccountData.type,
        p_initial_balance: newAccountData.initialBalance ?? newAccountData.balance ?? 0,
        p_is_payment_account: newAccountData.isPaymentAccount ?? false,
        p_parent_id: newAccountData.parentId || null,
        p_level: newAccountData.level ?? 1,
        p_is_header: newAccountData.isHeader ?? false,
        p_sort_order: newAccountData.sortOrder ?? 0,
        p_employee_id: newAccountData.employeeId || null
      });

      if (error) throw error;

      const rpcResult = Array.isArray(rpcResultRaw) ? rpcResultRaw[0] : rpcResultRaw;
      if (!rpcResult?.success) throw new Error(rpcResult?.error_message || 'Failed to create account');

      // Fetch created account to return proper object
      const { data: createdRaw } = await supabase.from('accounts').select('*').eq('id', rpcResult.account_id).single();
      return fromDbToApp(createdRaw);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  // UPDATE ACCOUNT - RPC
  const updateAccount = useMutation({
    mutationFn: async ({ accountId, newData }: { accountId: string, newData: Partial<Account> }) => {
      if (!currentBranch?.id) throw new Error('Branch required');

      // We need existing data to merge, or pass all fields?
      // For simplicity/robustness, we fetch current state first or assume newData is partial
      // But RPC expects arguments. Better to pass what we have.
      // However, fields that are NOT in newData will be undefined.
      // The RPC uses COALESCE so undefined/null means "don't change" (except logic there might treat null as null).
      // Let's first fetch the account to ensure we pass correct values for everything?
      // No, RPC COALESCE(p_name, name) works if we pass NULL. But undefined in JS is not NULL in SQL if passed as param.
      // Supabase client might filter undefined.
      // Actually, my RPC uses COALESCE(p_val, val) logic? Yes.
      // So passing NULL means "no change"? No, usually NULL means "set to NULL".
      // Wait, let's check RPC code: `name = COALESCE(p_name, name)`. If p_name is NULL, it keeps old value.
      // But what if I WANT to set parent_id to NULL? I passed `p_parent_id` directly without COALESCE in SQL `parent_id = p_parent_id`. 
      // Ah, my RPC implementation for `parent_id` was `parent_id = p_parent_id`. This means if I pass NULL, it sets to NULL.
      // This is risky for Partial updates.
      // FIX: The RPC above for `parent_id` was: `parent_id = p_parent_id`.
      // This implies I MUST pass the correct value.
      // To support partial updates, I should fetch the existing account first OR update the RPC to use COALESCE for nullable fields carefully.
      // Given I cannot easily change the RPC "live" without rewriting it again (which I did), let's assume I need to pass ALL fields or correct fields.

      // Strategy: Fetch existing account, merge, then call RPC.
      const { data: existing } = await supabase.from('accounts').select('*').eq('id', accountId).single();
      if (!existing) throw new Error('Account not found');

      const merged = { ...existing, ...newData }; // Note: newData keys are camelCase, existing is snake_case. Logic hazard.

      // Let's map newData to snake_case first or just use newData properties if they exist, else existing snake_case
      const p_name = newData.name ?? existing.name;
      const p_code = newData.code ?? existing.code;
      const p_type = newData.type ?? existing.type;
      const p_initial = newData.initialBalance ?? existing.initial_balance;
      const p_pay = newData.isPaymentAccount ?? existing.is_payment_account;
      const p_parent = newData.parentId !== undefined ? (newData.parentId || null) : existing.parent_id;
      const p_level = newData.level ?? existing.level;
      const p_header = newData.isHeader ?? existing.is_header;
      const p_active = newData.isActive ?? existing.is_active;
      const p_sort = newData.sortOrder ?? existing.sort_order;
      const p_emp = newData.employeeId !== undefined ? (newData.employeeId || null) : existing.employee_id;

      const { data: rpcResultRaw, error } = await supabase.rpc('update_account', {
        p_account_id: accountId,
        p_branch_id: currentBranch.id, // Security check inside RPC
        p_name,
        p_code: p_code || '',
        p_type,
        p_initial_balance: p_initial ?? 0,
        p_is_payment_account: p_pay ?? false,
        p_parent_id: p_parent ?? null,
        p_level: p_level ?? 1,
        p_is_header: p_header ?? false,
        p_is_active: p_active ?? true,
        p_sort_order: p_sort ?? 0,
        p_employee_id: p_emp ?? null
      });

      if (error) throw error;
      const rpcResult = Array.isArray(rpcResultRaw) ? rpcResultRaw[0] : rpcResultRaw;
      if (!rpcResult?.success) throw new Error(rpcResult?.error_message || 'Failed to update account');

      return fromDbToApp({ ...existing, ...newData }); // Optimistic return or refetch
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    }
  })

  // DELETE ACCOUNT - RPC
  const deleteAccount = useMutation({
    mutationFn: async (accountId: string): Promise<void> => {
      const { data: rpcResultRaw, error } = await supabase.rpc('delete_account', {
        p_account_id: accountId
      });

      if (error) throw error;
      const rpcResult = Array.isArray(rpcResultRaw) ? rpcResultRaw[0] : rpcResultRaw;
      if (!rpcResult?.success) throw new Error(rpcResult?.error_message || 'Failed to delete account');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  // GET OPENING BALANCE - Ambil saldo awal dari jurnal opening_balance
  const getOpeningBalance = useMutation({
    mutationFn: async (accountId: string): Promise<{ openingBalance: number; journalId: string | null; lastUpdated: string | null }> => {
      if (!currentBranch?.id) throw new Error('Branch required');

      const { data: rpcResultRaw, error } = await supabase.rpc('get_account_opening_balance', {
        p_account_id: accountId,
        p_branch_id: currentBranch.id
      });

      if (error) {
        console.error('[getOpeningBalance] RPC error:', error);
        throw new Error(error.message);
      }

      const rpcResult = Array.isArray(rpcResultRaw) ? rpcResultRaw[0] : rpcResultRaw;
      return {
        openingBalance: Number(rpcResult?.opening_balance) || 0,
        journalId: rpcResult?.journal_id || null,
        lastUpdated: rpcResult?.last_updated || null
      };
    }
  });

  // UPDATE INITIAL BALANCE - RPC Atomik (void jurnal lama, buat baru)
  const updateInitialBalance = useMutation({
    mutationFn: async ({ accountId, initialBalance }: { accountId: string, initialBalance: number }): Promise<void> => {
      if (!currentBranch?.id) throw new Error('Branch required');

      console.log('[updateInitialBalance] Calling RPC:', { accountId, initialBalance });

      const { data: rpcResultRaw, error } = await supabase.rpc('update_account_initial_balance_atomic', {
        p_account_id: accountId,
        p_new_initial_balance: initialBalance,
        p_branch_id: currentBranch.id
      });

      if (error) {
        console.error('[updateInitialBalance] RPC error:', error);
        throw new Error(error.message);
      }

      const rpcResult = Array.isArray(rpcResultRaw) ? rpcResultRaw[0] : rpcResultRaw;
      if (!rpcResult?.success) {
        throw new Error(rpcResult?.error_message || 'Failed to update initial balance');
      }

      console.log('[updateInitialBalance] Success, journal id:', rpcResult.journal_id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      queryClient.invalidateQueries({ queryKey: ['openingBalances'] });
    },
  });

  // MOVE ACCOUNT - Uses updateAccount wrapper (RPC)
  const moveAccount = useMutation({
    mutationFn: async ({ accountId, newParentId, newSortOrder }: {
      accountId: string,
      newParentId?: string,
      newSortOrder?: number
    }) => {
      // Just delegate to updateAccount which uses RPC
      return updateAccount.mutateAsync({
        accountId,
        newData: {
          parentId: newParentId,
          sortOrder: newSortOrder
        }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    }
  });

  // BULK UPDATE - Loop over updateAccount (RPC)
  const bulkUpdateAccountCodes = useMutation({
    mutationFn: async (updates: Array<{ accountId: string, code: string, sortOrder?: number }>) => {
      // Execute in parallel
      const promises = updates.map(u =>
        updateAccount.mutateAsync({
          accountId: u.accountId,
          newData: { code: u.code, sortOrder: u.sortOrder }
        })
      );
      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    }
  });

  // IMPORT STANDARD COA - RPC
  const importStandardCoA = useMutation({
    mutationFn: async (coaTemplate: Array<any>) => {
      if (!currentBranch?.id) throw new Error('Branch required');

      // Transform to simplified object for JSONB
      const simplifiedTemplate = coaTemplate.map(t => ({
        code: t.code,
        name: t.name,
        type: t.type,
        level: t.level,
        isHeader: t.isHeader,
        sortOrder: t.sortOrder,
        parentCode: t.parentCode
      }));

      const { data: rpcResultRaw, error } = await supabase.rpc('import_standard_coa', {
        p_branch_id: currentBranch.id,
        p_items: simplifiedTemplate
      });

      if (error) throw error;
      const rpcResult = Array.isArray(rpcResultRaw) ? rpcResultRaw[0] : rpcResultRaw;
      if (!rpcResult?.success) throw new Error(rpcResult?.error_message || 'Import failed');

      return rpcResult.imported_count;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    }
  });

  const getAccountsHierarchy = useMutation({
    mutationFn: async () => {
      // Read-only, no RPC needed unless complex recursive
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw new Error(error.message);
      return data ? data.map(fromDbToApp) : [];
    },
  });

  const getAccountBalance = useMutation({
    mutationFn: async (accountId: string, includeChildren = false) => {
      if (!includeChildren) {
        const { data: dataRaw, error } = await supabase
          .from('accounts')
          .select('balance')
          .eq('id', accountId)
          .single(); // Use single()
        if (error) throw error;
        return Number(dataRaw?.balance) || 0;
      }

      // RPC for hierarchical balance
      const { data, error } = await supabase
        .rpc('get_account_balance_with_children', { account_id: accountId });
      if (error) throw error;
      return Number(data) || 0;
    }
  });

  const getEmployeeCashAccount = (employeeId: string): Account | undefined => {
    if (!accounts) return undefined;
    return accounts.find(acc =>
      acc.isPaymentAccount &&
      acc.employeeId === employeeId &&
      acc.isActive !== false
    );
  };

  const getCashAccountsWithEmployees = (): Account[] => {
    if (!accounts) return [];
    return accounts.filter(acc =>
      acc.isPaymentAccount &&
      !acc.isHeader &&
      acc.isActive !== false
    );
  };

  const getUnassignedCashAccounts = (): Account[] => {
    if (!accounts) return [];
    return accounts.filter(acc =>
      acc.isPaymentAccount &&
      !acc.isHeader &&
      !acc.employeeId &&
      acc.isActive !== false
    );
  };

  // SYNC ACCOUNT BALANCES - Hitung ulang saldo dari initial_balance + jurnal (non-void)
  // HANYA untuk branch yang dipilih saat ini
  const syncAccountBalances = useMutation({
    mutationFn: async (): Promise<{
      updated: number;
      branchId: string;
      branchName: string;
      details: Array<{
        code: string;
        name: string;
        oldBalance: number;
        newBalance: number;
        difference: number;
      }>;
    }> => {
      if (!currentBranch?.id) throw new Error('Pilih branch terlebih dahulu');

      const branchId = currentBranch.id;
      const branchName = currentBranch.name || 'Unknown';

      console.log(`[syncAccountBalances] Starting sync for branch: ${branchName} (${branchId})`);

      // 1. Get all accounts for this branch ONLY
      const { data: accountsData, error: accError } = await supabase
        .from('accounts')
        .select('id, code, name, type, balance, initial_balance, branch_id')
        .eq('branch_id', branchId)
        .eq('is_header', false)
        .eq('is_active', true);

      if (accError) throw new Error(`Gagal mengambil data akun: ${accError.message}`);
      if (!accountsData || accountsData.length === 0) {
        return { updated: 0, branchId, branchName, details: [] };
      }

      console.log(`[syncAccountBalances] Found ${accountsData.length} accounts for branch ${branchName}`);

      // 2. Get account IDs for this branch
      const accountIds = accountsData.map(acc => acc.id);

      // 3. Get all journal lines for non-voided journals in this branch
      // Filter by account_id IN accountIds to ensure we only get relevant lines
      const { data: journalLines, error: jlError } = await supabase
        .from('journal_entry_lines')
        .select(`
          account_id,
          debit_amount,
          credit_amount,
          journal_entries!inner (
            branch_id,
            is_voided
          )
        `)
        .in('account_id', accountIds)
        .eq('journal_entries.branch_id', branchId)
        .eq('journal_entries.is_voided', false);

      if (jlError) throw new Error(`Gagal mengambil data jurnal: ${jlError.message}`);

      console.log(`[syncAccountBalances] Found ${journalLines?.length || 0} journal lines`);

      // 4. Calculate journal movements per account
      const journalMovements = new Map<string, number>();
      const accountTypes = new Map<string, string>();

      accountsData.forEach(acc => {
        journalMovements.set(acc.id, 0);
        accountTypes.set(acc.id, acc.type);
      });

      (journalLines || []).forEach((line: any) => {
        if (!line.account_id) return;
        // Double check account belongs to this branch
        if (!accountIds.includes(line.account_id)) return;

        const currentMovement = journalMovements.get(line.account_id) || 0;
        const debit = Number(line.debit_amount) || 0;
        const credit = Number(line.credit_amount) || 0;
        const accType = accountTypes.get(line.account_id) || 'Aset';

        // Aset & Beban: Debit menambah, Credit mengurangi
        // Kewajiban, Modal, Pendapatan: Credit menambah, Debit mengurangi
        const isDebitNormal = ['Aset', 'Beban'].includes(accType);
        const movement = isDebitNormal ? (debit - credit) : (credit - debit);

        journalMovements.set(line.account_id, currentMovement + movement);
      });

      // 5. Calculate new balance = initial_balance + journal_movement
      const updates: Array<{
        id: string;
        code: string;
        name: string;
        oldBalance: number;
        newBalance: number;
        difference: number;
      }> = [];

      for (const acc of accountsData) {
        // Extra safety: verify branch_id matches
        if (acc.branch_id !== branchId) continue;

        const initialBalance = Number(acc.initial_balance) || 0;
        const journalMovement = journalMovements.get(acc.id) || 0;
        const newBalance = initialBalance + journalMovement;
        const oldBalance = Number(acc.balance) || 0;
        const difference = newBalance - oldBalance;

        // Only update if there's a difference > 0.01
        if (Math.abs(difference) > 0.01) {
          updates.push({
            id: acc.id,
            code: acc.code || '',
            name: acc.name,
            oldBalance,
            newBalance,
            difference
          });
        }
      }

      console.log(`[syncAccountBalances] ${updates.length} accounts need update`);

      // 6. Update accounts in database - ONLY for this branch
      if (updates.length > 0) {
        for (const update of updates) {
          const { error: updateError } = await supabase
            .from('accounts')
            .update({
              balance: update.newBalance,
              updated_at: new Date().toISOString()
            })
            .eq('id', update.id)
            .eq('branch_id', branchId); // Extra safety: ensure branch matches

          if (updateError) {
            console.error(`[syncAccountBalances] Failed to update account ${update.code}:`, updateError);
          }
        }
      }

      console.log(`[syncAccountBalances] Sync completed for branch ${branchName}`);

      return {
        updated: updates.length,
        branchId,
        branchName,
        details: updates.map(u => ({
          code: u.code,
          name: u.name,
          oldBalance: u.oldBalance,
          newBalance: u.newBalance,
          difference: u.difference
        }))
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    }
  });

  return {
    accounts,
    isLoading,
    addAccount,
    updateAccount,
    updateInitialBalance,
    getOpeningBalance,
    deleteAccount,
    getAccountsHierarchy,
    moveAccount,
    bulkUpdateAccountCodes,
    importStandardCoA,
    getAccountBalance,
    getEmployeeCashAccount,
    getCashAccountsWithEmployees,
    getUnassignedCashAccounts,
    syncAccountBalances,
  }
}