import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranch } from '@/contexts/BranchContext';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  JournalEntry,
  JournalEntryLine,
  JournalEntryFormData,
  DbJournalEntry,
  DbJournalEntryLine
} from '@/types/journal';

// Convert DB to App format
const fromDbToApp = (db: DbJournalEntry, lines: DbJournalEntryLine[] = []): JournalEntry => ({
  id: db.id,
  entryNumber: db.entry_number,
  entryDate: new Date(db.entry_date),
  description: db.description,
  referenceType: db.reference_type as JournalEntry['referenceType'],
  referenceId: db.reference_id,
  status: db.status as JournalEntry['status'],
  totalDebit: Number(db.total_debit) || 0,
  totalCredit: Number(db.total_credit) || 0,
  createdBy: db.created_by,
  createdByName: db.created_by_name,
  createdAt: new Date(db.created_at),
  approvedBy: db.approved_by,
  approvedByName: db.approved_by_name,
  approvedAt: db.approved_at ? new Date(db.approved_at) : undefined,
  isVoided: db.is_voided,
  voidedBy: db.voided_by,
  voidedByName: db.voided_by_name,
  voidedAt: db.voided_at ? new Date(db.voided_at) : undefined,
  voidReason: db.void_reason,
  branchId: db.branch_id,
  lines: lines.map(line => ({
    id: line.id,
    journalEntryId: line.journal_entry_id,
    lineNumber: line.line_number,
    accountId: line.account_id,
    accountCode: line.account_code,
    accountName: line.account_name,
    debitAmount: Number(line.debit_amount) || 0,
    creditAmount: Number(line.credit_amount) || 0,
    description: line.description,
    createdAt: new Date(line.created_at)
  }))
});

// Generate journal number
const generateJournalNumber = async (): Promise<string> => {
  const currentYear = new Date().getFullYear();
  const prefix = `JE-${currentYear}-`;

  const { data, error } = await supabase
    .from('journal_entries')
    .select('entry_number')
    .like('entry_number', `${prefix}%`)
    .order('entry_number', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Error generating journal number:', error);
    return `${prefix}000001`;
  }

  if (data && data.length > 0) {
    const lastNumber = data[0].entry_number;
    const match = lastNumber.match(/JE-\d{4}-(\d+)/);
    if (match) {
      const parsed = parseInt(match[1], 10);
      // Validasi NaN untuk mencegah error "0NaN"
      if (!isNaN(parsed) && parsed > 0) {
        const nextNum = parsed + 1;
        return `${prefix}${nextNum.toString().padStart(6, '0')}`;
      } else {
        console.warn(`[useJournalEntries] Invalid entry_number format: ${lastNumber}`);
      }
    }
  }

  return `${prefix}000001`;
};

export const useJournalEntries = () => {
  const { currentBranch } = useBranch();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all journal entries with lines in a single query (avoid N+1 problem)
  const {
    data: journalEntries,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['journalEntries', currentBranch?.id],
    queryFn: async () => {
      // Fetch entries with nested lines in ONE query
      let query = supabase
        .from('journal_entries')
        .select(`
          *,
          journal_entry_lines (*)
        `)
        .order('created_at', { ascending: false });

      if (currentBranch?.id) {
        query = query.eq('branch_id', currentBranch.id);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Transform to app format - lines are already included
      const entries: JournalEntry[] = (data || []).map((entry: any) => {
        const lines = (entry.journal_entry_lines || []).sort(
          (a: any, b: any) => a.line_number - b.line_number
        );
        return fromDbToApp(entry as DbJournalEntry, lines as DbJournalEntryLine[]);
      });

      console.log(`[useJournalEntries] Loaded ${entries.length} journal entries`);
      return entries;
    },
    enabled: !!currentBranch,
    staleTime: 1000 * 60 * 2, // 2 minutes
    gcTime: 1000 * 60 * 5, // 5 minutes cache
    refetchOnWindowFocus: false,
  });

  // Fetch single journal entry
  const fetchJournalEntry = async (id: string): Promise<JournalEntry | null> => {
    // Guard: pastikan id tidak undefined
    if (!id) {
      console.warn('[useJournalEntries] fetchJournalEntry called with undefined id');
      return null;
    }

    // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
    const { data: entryRaw, error } = await supabase
      .from('journal_entries')
      .select('*')
      .eq('id', id)
      .order('id').limit(1);

    const entry = Array.isArray(entryRaw) ? entryRaw[0] : entryRaw;
    if (error || !entry) return null;

    const { data: lines } = await supabase
      .from('journal_entry_lines')
      .select('*')
      .eq('journal_entry_id', id)
      .order('line_number');

    return fromDbToApp(entry as DbJournalEntry, (lines || []) as DbJournalEntryLine[]);
  };

  // Create journal entry
  const createMutation = useMutation({
    mutationFn: async (formData: JournalEntryFormData) => {
      // Validate balance
      const totalDebit = formData.lines.reduce((sum, line) => sum + (line.debitAmount || 0), 0);
      const totalCredit = formData.lines.reduce((sum, line) => sum + (line.creditAmount || 0), 0);

      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        throw new Error('Debit dan Credit harus seimbang');
      }

      if (formData.lines.length < 2) {
        throw new Error('Minimal harus ada 2 baris jurnal');
      }

      // Generate entry number
      const entryNumber = await generateJournalNumber();

      // Insert header
      // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
      const { data: entryRaw, error: headerError } = await supabase
        .from('journal_entries')
        .insert({
          entry_number: entryNumber,
          entry_date: formData.entryDate.toISOString().split('T')[0],
          description: formData.description,
          reference_type: formData.referenceType || 'manual',
          reference_id: formData.referenceId,
          status: 'draft',
          total_debit: totalDebit,
          total_credit: totalCredit,
          created_by: user?.id,
          created_by_name: user?.name || user?.email,
          branch_id: currentBranch?.id
        })
        .select()
        .order('id').limit(1);

      if (headerError) throw headerError;
      const entry = Array.isArray(entryRaw) ? entryRaw[0] : entryRaw;
      if (!entry) throw new Error('Failed to create journal entry');

      // Insert lines
      const linesToInsert = formData.lines.map((line, index) => ({
        journal_entry_id: entry.id,
        line_number: index + 1,
        account_id: line.accountId,
        account_code: line.accountCode,
        account_name: line.accountName,
        debit_amount: line.debitAmount || 0,
        credit_amount: line.creditAmount || 0,
        description: line.description
      }));

      const { error: linesError } = await supabase
        .from('journal_entry_lines')
        .insert(linesToInsert);

      if (linesError) throw linesError;

      return entry;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      toast({
        title: 'Berhasil',
        description: 'Jurnal berhasil dibuat',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Gagal',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Post journal entry (change status to posted)
  const postMutation = useMutation({
    mutationFn: async (id: string) => {
      // Guard: pastikan id tidak undefined
      if (!id) {
        throw new Error('Journal entry ID is required for posting');
      }

      // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
      const { data: dataRaw, error } = await supabase
        .from('journal_entries')
        .update({
          status: 'posted',
          approved_by: user?.id,
          approved_by_name: user?.name || user?.email,
          approved_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('status', 'draft')
        .select()
        .order('id').limit(1);

      if (error) throw error;
      const data = Array.isArray(dataRaw) ? dataRaw[0] : dataRaw;
      if (!data) throw new Error('Failed to post journal entry');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      toast({
        title: 'Berhasil',
        description: 'Jurnal berhasil diposting',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Gagal',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Void journal entry
  const voidMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      // Guard: pastikan id tidak undefined
      if (!id) {
        throw new Error('Journal entry ID is required for voiding');
      }

      // 1. Get journal entry lines to know which accounts to recalculate
      const { data: journalLines } = await supabase
        .from('journal_entry_lines')
        .select('account_id')
        .eq('journal_entry_id', id);

      const affectedAccountIds = new Set<string>();
      for (const line of journalLines || []) {
        if (line.account_id) {
          affectedAccountIds.add(line.account_id);
        }
      }

      // 2. Void the journal entry
      // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
      const { data: dataRaw, error } = await supabase
        .from('journal_entries')
        .update({
          is_voided: true,
          voided_by: user?.id,
          voided_by_name: user?.name || user?.email,
          voided_at: new Date().toISOString(),
          void_reason: reason
        })
        .eq('id', id)
        .select('*, branch_id')
        .order('id').limit(1);

      if (error) throw error;
      const data = Array.isArray(dataRaw) ? dataRaw[0] : dataRaw;
      if (!data) throw new Error('Failed to void journal entry');

      // 3. Recalculate balance for all affected accounts
      const branchId = data.branch_id;
      if (affectedAccountIds.size > 0 && branchId) {
        console.log('Recalculating balance for accounts after void:', Array.from(affectedAccountIds));

        for (const accountId of affectedAccountIds) {
          // Get account type first
          const { data: accountData } = await supabase
            .from('accounts')
            .select('id, type, initial_balance')
            .eq('id', accountId)
            .single();

          if (accountData) {
            // Calculate balance from non-voided journal entries
            const { data: accJournalLines } = await supabase
              .from('journal_entry_lines')
              .select(`
                debit_amount,
                credit_amount,
                journal_entries!inner (is_voided, status, branch_id)
              `)
              .eq('account_id', accountId);

            let totalDebit = 0;
            let totalCredit = 0;

            for (const line of accJournalLines || []) {
              const journal = line.journal_entries as any;
              if (journal &&
                  journal.branch_id === branchId &&
                  journal.status === 'posted' &&
                  journal.is_voided === false) {
                totalDebit += Number(line.debit_amount) || 0;
                totalCredit += Number(line.credit_amount) || 0;
              }
            }

            // Calculate balance based on account type
            const isDebitNormal = ['Aset', 'Beban'].includes(accountData.type);
            const calculatedBalance = isDebitNormal
              ? (totalDebit - totalCredit)
              : (totalCredit - totalDebit);

            // Update account balance
            await supabase
              .from('accounts')
              .update({ balance: calculatedBalance })
              .eq('id', accountId);

            console.log(`Updated account ${accountId}: ${calculatedBalance}`);
          }
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      toast({
        title: 'Berhasil',
        description: 'Jurnal berhasil dibatalkan (void) dan saldo akun diperbarui',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Gagal',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Delete draft journal entry
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Guard: pastikan id tidak undefined
      if (!id) {
        throw new Error('Journal entry ID is required for deletion');
      }

      // Only allow deleting draft entries
      const { error } = await supabase
        .from('journal_entries')
        .delete()
        .eq('id', id)
        .eq('status', 'draft');

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      toast({
        title: 'Berhasil',
        description: 'Jurnal draft berhasil dihapus',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Gagal',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Fetch all journal entry lines (for separate tab view)
  const {
    data: allJournalLines,
    isLoading: isLoadingLines,
    refetch: refetchLines
  } = useQuery({
    queryKey: ['journalEntryLines', currentBranch?.id],
    queryFn: async () => {
      // Fetch all lines with their journal entry info
      const { data, error } = await supabase
        .from('journal_entry_lines')
        .select(`
          *,
          journal_entries!inner (
            id,
            entry_number,
            entry_date,
            description,
            status,
            is_voided,
            reference_type,
            branch_id
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Filter by branch and map to app format
      const filteredData = (data || []).filter((line: any) => {
        if (!currentBranch?.id) return true;
        return line.journal_entries?.branch_id === currentBranch.id;
      });

      return filteredData.map((line: any) => ({
        id: line.id,
        journalEntryId: line.journal_entry_id,
        entryNumber: line.journal_entries?.entry_number || '',
        entryDate: line.journal_entries?.entry_date ? new Date(line.journal_entries.entry_date) : null,
        journalDescription: line.journal_entries?.description || '',
        journalStatus: line.journal_entries?.status || '',
        isVoided: line.journal_entries?.is_voided || false,
        referenceType: line.journal_entries?.reference_type || '',
        lineNumber: line.line_number,
        accountId: line.account_id,
        accountCode: line.account_code,
        accountName: line.account_name,
        debitAmount: Number(line.debit_amount) || 0,
        creditAmount: Number(line.credit_amount) || 0,
        description: line.description,
        createdAt: new Date(line.created_at)
      }));
    },
    enabled: !!currentBranch,
    staleTime: 1000 * 60 * 2, // 2 minutes
    gcTime: 1000 * 60 * 5, // 5 minutes cache
    refetchOnWindowFocus: false,
  });

  return {
    journalEntries,
    isLoading,
    error,
    refetch,
    fetchJournalEntry,
    createJournalEntry: createMutation.mutate,
    isCreating: createMutation.isPending,
    postJournalEntry: postMutation.mutate,
    isPosting: postMutation.isPending,
    voidJournalEntry: voidMutation.mutate,
    isVoiding: voidMutation.isPending,
    deleteJournalEntry: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
    // New: all journal lines
    allJournalLines,
    isLoadingLines,
    refetchLines,
  };
};
