import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranchContext } from '@/contexts/BranchContext';
import { useMemo } from 'react';

export interface AccountBalanceSummary {
  totalAset: number;
  totalKewajiban: number;
  totalModal: number;
  totalPendapatan: number;
  totalBeban: number;
  totalHpp: number;
  labaRugiBersih: number;
  isBalanced: boolean;
}

export interface AccountBalance {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  balance: number;
}

/**
 * Hook to get pre-calculated account balance summary
 * Uses aggressive caching to reduce database queries
 */
export function useAccountBalanceSummary(asOfDate?: Date) {
  const { currentBranch } = useBranchContext();
  const branchId = currentBranch?.id;

  // Cache key includes branch and date
  const dateKey = asOfDate ? asOfDate.toISOString().split('T')[0] : 'current';

  const {
    data: balanceData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['account-balance-summary', branchId, dateKey],
    queryFn: async () => {
      if (!branchId) return null;

      // Get all accounts for the branch
      const { data: accounts, error: accountsError } = await supabase
        .from('accounts')
        .select('id, code, name, type, initial_balance, is_header')
        .eq('branch_id', branchId)
        .eq('is_active', true)
        .order('code');

      if (accountsError) throw accountsError;

      // Get journal entry lines aggregated by account
      // This is more efficient than fetching all lines
      const asOfDateStr = asOfDate ? asOfDate.toISOString().split('T')[0] : null;

      const { data: journalLines, error: journalError } = await supabase
        .from('journal_entry_lines')
        .select(`
          account_id,
          debit_amount,
          credit_amount,
          journal_entries!inner (
            branch_id,
            status,
            is_voided,
            entry_date,
            reference_type
          )
        `)
        .eq('journal_entries.branch_id', branchId)
        .eq('journal_entries.status', 'posted')
        .eq('journal_entries.is_voided', false);

      if (journalError) throw journalError;

      // Check which accounts have opening balance journals
      const accountsWithOpeningJournal = new Set<string>();
      (journalLines || []).forEach((line: any) => {
        if (line.journal_entries?.reference_type === 'opening') {
          accountsWithOpeningJournal.add(line.account_id);
        }
      });

      // Filter by date if needed
      const filteredLines = asOfDateStr
        ? (journalLines || []).filter((line: any) =>
            line.journal_entries?.entry_date <= asOfDateStr
          )
        : journalLines || [];

      // Calculate balances
      const balanceMap = new Map<string, number>();
      const accountTypeMap = new Map<string, string>();

      // Initialize with initial_balance (only if no opening journal)
      (accounts || []).forEach((acc: any) => {
        if (!acc.is_header) {
          const hasOpening = accountsWithOpeningJournal.has(acc.id);
          balanceMap.set(acc.id, hasOpening ? 0 : (Number(acc.initial_balance) || 0));
          accountTypeMap.set(acc.id, acc.type);
        }
      });

      // Add journal movements
      filteredLines.forEach((line: any) => {
        if (!line.account_id) return;

        const currentBalance = balanceMap.get(line.account_id) || 0;
        const debit = Number(line.debit_amount) || 0;
        const credit = Number(line.credit_amount) || 0;
        const type = (accountTypeMap.get(line.account_id) || 'Aset').toLowerCase();

        const isDebitNormal =
          type.includes('aset') || type.includes('asset') ||
          type.includes('beban') || type.includes('expense') ||
          type.includes('hpp');

        const change = isDebitNormal ? (debit - credit) : (credit - debit);
        balanceMap.set(line.account_id, currentBalance + change);
      });

      // Calculate summaries by type
      let totalAset = 0;
      let totalKewajiban = 0;
      let totalModal = 0;
      let totalPendapatan = 0;
      let totalBeban = 0;
      let totalHpp = 0;

      const accountBalances: AccountBalance[] = [];

      (accounts || []).forEach((acc: any) => {
        if (acc.is_header) return;

        const balance = balanceMap.get(acc.id) || 0;
        const type = (acc.type || 'Aset').toLowerCase();

        accountBalances.push({
          accountId: acc.id,
          accountCode: acc.code || '',
          accountName: acc.name,
          accountType: acc.type,
          balance,
        });

        if (type.includes('aset') || type.includes('asset')) {
          totalAset += balance;
        } else if (type.includes('kewajiban') || type.includes('liabilit')) {
          totalKewajiban += balance;
        } else if (type.includes('modal') || type.includes('ekuitas') || type.includes('equity')) {
          totalModal += balance;
        } else if (type.includes('pendapatan') || type.includes('revenue') || type.includes('income')) {
          totalPendapatan += balance;
        } else if (type.includes('hpp') || (acc.code && acc.code.startsWith('5'))) {
          totalHpp += balance;
        } else if (type.includes('beban') || type.includes('expense')) {
          totalBeban += balance;
        }
      });

      const labaRugiBersih = totalPendapatan - totalHpp - totalBeban;

      // Check if balance sheet is balanced
      // Aset = Kewajiban + Modal + Laba Ditahan
      const isBalanced = Math.abs(totalAset - (totalKewajiban + totalModal + labaRugiBersih)) < 1;

      return {
        summary: {
          totalAset,
          totalKewajiban,
          totalModal,
          totalPendapatan,
          totalBeban,
          totalHpp,
          labaRugiBersih,
          isBalanced,
        } as AccountBalanceSummary,
        accountBalances,
      };
    },
    enabled: !!branchId,
    staleTime: 2 * 60 * 1000, // 2 minutes cache
    gcTime: 10 * 60 * 1000, // 10 minutes garbage collection (previously cacheTime)
  });

  // Memoized getters
  const getAccountBalance = useMemo(() => {
    const map = new Map<string, AccountBalance>();
    (balanceData?.accountBalances || []).forEach(ab => {
      map.set(ab.accountId, ab);
      map.set(ab.accountCode, ab);
    });

    return (idOrCode: string): number => {
      return map.get(idOrCode)?.balance ?? 0;
    };
  }, [balanceData?.accountBalances]);

  const getAccountsByType = useMemo(() => {
    return (type: string): AccountBalance[] => {
      const typeL = type.toLowerCase();
      return (balanceData?.accountBalances || []).filter(ab =>
        ab.accountType.toLowerCase().includes(typeL)
      );
    };
  }, [balanceData?.accountBalances]);

  return {
    summary: balanceData?.summary || null,
    accountBalances: balanceData?.accountBalances || [],
    isLoading,
    error,
    refetch,
    getAccountBalance,
    getAccountsByType,
  };
}
