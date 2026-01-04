import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useBranch } from '@/contexts/BranchContext'
import { createTaxPaymentJournal } from '@/services/journalService'

// ============================================================================
// PAJAK ACCOUNTS:
// - 1230: PPN Masukan / Piutang Pajak (Aset) - Pajak yang bisa dikreditkan
// - 2130: PPN Keluaran / Hutang Pajak (Kewajiban) - Pajak yang harus disetor
// ============================================================================

export interface TaxSummary {
  ppnMasukan: {
    accountId: string;
    accountCode: string;
    accountName: string;
    balance: number; // Saldo piutang pajak (yang bisa diklaim)
  } | null;
  ppnKeluaran: {
    accountId: string;
    accountCode: string;
    accountName: string;
    balance: number; // Saldo hutang pajak (yang harus disetor)
  } | null;
  netTaxPayable: number; // Hutang Pajak - Piutang Pajak (jika positif = harus bayar)
  taxPeriod: string; // Format: "YYYY-MM"
}

export interface TaxTransaction {
  id: string;
  date: Date;
  description: string;
  referenceType: string;
  referenceId: string;
  ppnMasukanAmount: number;
  ppnKeluaranAmount: number;
  journalEntryId: string;
}

export interface TaxPayment {
  id: string;
  paymentDate: Date;
  period: string; // "YYYY-MM"
  ppnMasukanUsed: number;
  ppnKeluaranPaid: number;
  netPayment: number;
  paymentAccountId: string;
  paymentAccountName: string;
  notes: string;
  journalEntryId: string;
}

export const useTax = () => {
  const queryClient = useQueryClient()
  const { currentBranch } = useBranch()

  // ============================================================================
  // FETCH TAX SUMMARY - Calculate balances from journal entries
  // ============================================================================
  const { data: taxSummary, isLoading: isLoadingSummary } = useQuery<TaxSummary>({
    queryKey: ['taxSummary', currentBranch?.id],
    queryFn: async () => {
      if (!currentBranch?.id) {
        return {
          ppnMasukan: null,
          ppnKeluaran: null,
          netTaxPayable: 0,
          taxPeriod: new Date().toISOString().slice(0, 7),
        };
      }

      // Get PPN Masukan account (1230)
      const { data: ppnMasukanAccountRaw } = await supabase
        .from('accounts')
        .select('id, code, name')
        .eq('code', '1230')
        .eq('branch_id', currentBranch.id)
        .order('id').limit(1);
      const ppnMasukanAccount = Array.isArray(ppnMasukanAccountRaw) ? ppnMasukanAccountRaw[0] : ppnMasukanAccountRaw;

      // Get PPN Keluaran account (2130)
      const { data: ppnKeluaranAccountRaw } = await supabase
        .from('accounts')
        .select('id, code, name')
        .eq('code', '2130')
        .eq('branch_id', currentBranch.id)
        .order('id').limit(1);
      const ppnKeluaranAccount = Array.isArray(ppnKeluaranAccountRaw) ? ppnKeluaranAccountRaw[0] : ppnKeluaranAccountRaw;

      let ppnMasukanBalance = 0;
      let ppnKeluaranBalance = 0;

      // Calculate PPN Masukan balance from journal entries
      if (ppnMasukanAccount) {
        const { data: masukanLines } = await supabase
          .from('journal_entry_lines')
          .select(`
            debit_amount,
            credit_amount,
            journal_entries!inner (is_voided, status, branch_id)
          `)
          .eq('account_id', ppnMasukanAccount.id);

        for (const line of masukanLines || []) {
          const je = line.journal_entries as any;
          if (je && je.branch_id === currentBranch.id && je.status === 'posted' && !je.is_voided) {
            ppnMasukanBalance += (Number(line.debit_amount) || 0) - (Number(line.credit_amount) || 0);
          }
        }
      }

      // Calculate PPN Keluaran balance from journal entries
      if (ppnKeluaranAccount) {
        const { data: keluaranLines } = await supabase
          .from('journal_entry_lines')
          .select(`
            debit_amount,
            credit_amount,
            journal_entries!inner (is_voided, status, branch_id)
          `)
          .eq('account_id', ppnKeluaranAccount.id);

        for (const line of keluaranLines || []) {
          const je = line.journal_entries as any;
          if (je && je.branch_id === currentBranch.id && je.status === 'posted' && !je.is_voided) {
            // Kewajiban: Credit - Debit
            ppnKeluaranBalance += (Number(line.credit_amount) || 0) - (Number(line.debit_amount) || 0);
          }
        }
      }

      return {
        ppnMasukan: ppnMasukanAccount ? {
          accountId: ppnMasukanAccount.id,
          accountCode: ppnMasukanAccount.code,
          accountName: ppnMasukanAccount.name,
          balance: ppnMasukanBalance,
        } : null,
        ppnKeluaran: ppnKeluaranAccount ? {
          accountId: ppnKeluaranAccount.id,
          accountCode: ppnKeluaranAccount.code,
          accountName: ppnKeluaranAccount.name,
          balance: ppnKeluaranBalance,
        } : null,
        netTaxPayable: ppnKeluaranBalance - ppnMasukanBalance,
        taxPeriod: new Date().toISOString().slice(0, 7),
      };
    },
    enabled: !!currentBranch,
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: false,
  });

  // ============================================================================
  // FETCH TAX TRANSACTIONS - Get journal entries related to PPN
  // ============================================================================
  const { data: taxTransactions, isLoading: isLoadingTransactions } = useQuery<TaxTransaction[]>({
    queryKey: ['taxTransactions', currentBranch?.id],
    queryFn: async () => {
      if (!currentBranch?.id) return [];

      // Get both PPN accounts
      const { data: ppnAccounts } = await supabase
        .from('accounts')
        .select('id, code, name')
        .in('code', ['1230', '2130'])
        .eq('branch_id', currentBranch.id);

      if (!ppnAccounts || ppnAccounts.length === 0) return [];

      const accountIds = ppnAccounts.map(a => a.id);

      // Get journal lines for PPN accounts
      const { data: lines } = await supabase
        .from('journal_entry_lines')
        .select(`
          id,
          account_id,
          account_code,
          debit_amount,
          credit_amount,
          description,
          journal_entries!inner (
            id,
            entry_number,
            entry_date,
            description,
            reference_type,
            reference_id,
            status,
            is_voided,
            branch_id
          )
        `)
        .in('account_id', accountIds)
        .order('created_at', { ascending: false });

      const transactions: TaxTransaction[] = [];
      const processedJournals = new Set<string>();

      for (const line of lines || []) {
        const je = line.journal_entries as any;
        if (!je || je.is_voided || je.status !== 'posted' || je.branch_id !== currentBranch.id) continue;
        if (processedJournals.has(je.id)) continue;
        processedJournals.add(je.id);

        // Find all PPN lines in this journal
        const journalPpnLines = (lines || []).filter(l => (l.journal_entries as any)?.id === je.id);

        let ppnMasukanAmount = 0;
        let ppnKeluaranAmount = 0;

        for (const pLine of journalPpnLines) {
          if (pLine.account_code === '1230') {
            ppnMasukanAmount += (Number(pLine.debit_amount) || 0) - (Number(pLine.credit_amount) || 0);
          } else if (pLine.account_code === '2130') {
            ppnKeluaranAmount += (Number(pLine.credit_amount) || 0) - (Number(pLine.debit_amount) || 0);
          }
        }

        transactions.push({
          id: je.id,
          date: new Date(je.entry_date),
          description: je.description,
          referenceType: je.reference_type,
          referenceId: je.reference_id || '',
          ppnMasukanAmount,
          ppnKeluaranAmount,
          journalEntryId: je.id,
        });
      }

      return transactions.sort((a, b) => b.date.getTime() - a.date.getTime());
    },
    enabled: !!currentBranch,
    staleTime: 2 * 60 * 1000,
  });

  // ============================================================================
  // FETCH TAX PAYMENTS - Get payments made for tax
  // ============================================================================
  const { data: taxPayments, isLoading: isLoadingPayments } = useQuery<TaxPayment[]>({
    queryKey: ['taxPayments', currentBranch?.id],
    queryFn: async () => {
      if (!currentBranch?.id) return [];

      // Tax payments are journal entries with reference_type = 'tax_payment'
      const { data: journals } = await supabase
        .from('journal_entries')
        .select(`
          id,
          entry_number,
          entry_date,
          description,
          reference_id,
          status,
          is_voided,
          journal_entry_lines (
            account_id,
            account_code,
            account_name,
            debit_amount,
            credit_amount
          )
        `)
        .eq('reference_type', 'tax_payment')
        .eq('branch_id', currentBranch.id)
        .eq('is_voided', false)
        .eq('status', 'posted')
        .order('entry_date', { ascending: false });

      const payments: TaxPayment[] = [];

      for (const je of journals || []) {
        const lines = je.journal_entry_lines as any[] || [];

        let ppnMasukanUsed = 0;
        let ppnKeluaranPaid = 0;
        let netPayment = 0;
        let paymentAccountId = '';
        let paymentAccountName = '';

        for (const line of lines) {
          if (line.account_code === '1230') {
            // Credit to PPN Masukan = using the credit
            ppnMasukanUsed = Number(line.credit_amount) || 0;
          } else if (line.account_code === '2130') {
            // Debit to PPN Keluaran = paying the liability
            ppnKeluaranPaid = Number(line.debit_amount) || 0;
          } else if (Number(line.credit_amount) > 0) {
            // Credit to Cash/Bank = net payment
            netPayment = Number(line.credit_amount) || 0;
            paymentAccountId = line.account_id;
            paymentAccountName = line.account_name;
          }
        }

        // Parse period from reference_id (format: "TAX-YYYYMM-xxx")
        const periodMatch = je.reference_id?.match(/TAX-(\d{6})/);
        const period = periodMatch ? `${periodMatch[1].slice(0, 4)}-${periodMatch[1].slice(4, 6)}` : '';

        payments.push({
          id: je.id,
          paymentDate: new Date(je.entry_date),
          period,
          ppnMasukanUsed,
          ppnKeluaranPaid,
          netPayment,
          paymentAccountId,
          paymentAccountName,
          notes: je.description,
          journalEntryId: je.id,
        });
      }

      return payments;
    },
    enabled: !!currentBranch,
    staleTime: 2 * 60 * 1000,
  });

  // ============================================================================
  // PAY TAX - Create tax payment journal
  // ============================================================================
  const payTax = useMutation({
    mutationFn: async ({
      period,
      ppnMasukanToUse,
      ppnKeluaranToPay,
      paymentAccountId,
      notes,
    }: {
      period: string; // "YYYY-MM"
      ppnMasukanToUse: number;
      ppnKeluaranToPay: number;
      paymentAccountId: string;
      notes?: string;
    }) => {
      if (!currentBranch?.id) throw new Error('Branch not selected');

      const netPayment = ppnKeluaranToPay - ppnMasukanToUse;
      if (netPayment < 0) {
        throw new Error('PPN Masukan tidak bisa lebih besar dari PPN Keluaran yang dibayar');
      }

      // Create tax payment journal
      const result = await createTaxPaymentJournal({
        paymentDate: new Date(),
        period,
        ppnMasukanUsed: ppnMasukanToUse,
        ppnKeluaranPaid: ppnKeluaranToPay,
        netPayment,
        paymentAccountId,
        branchId: currentBranch.id,
        notes: notes || `Pembayaran Pajak Periode ${period}`,
      });

      if (!result.success) {
        throw new Error(result.error || 'Gagal membuat jurnal pembayaran pajak');
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taxSummary'] });
      queryClient.invalidateQueries({ queryKey: ['taxTransactions'] });
      queryClient.invalidateQueries({ queryKey: ['taxPayments'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
    },
  });

  // ============================================================================
  // CHECK TAX REMINDER - Returns true if tax payment is due
  // ============================================================================
  const checkTaxReminder = (): { isDue: boolean; message: string; daysUntilDue: number } => {
    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    // Tax payment due on the 5th of each month for the previous month
    const dueDay = 5;

    // Check if we're past the 5th
    if (currentDay > dueDay) {
      // Check if tax for previous month has been paid
      const previousMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const previousYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      const previousPeriod = `${previousYear}-${String(previousMonth + 1).padStart(2, '0')}`;

      const hasPaid = taxPayments?.some(p => p.period === previousPeriod);

      if (!hasPaid && (taxSummary?.netTaxPayable || 0) > 0) {
        return {
          isDue: true,
          message: `Pembayaran pajak periode ${previousPeriod} sudah melewati tanggal jatuh tempo (tanggal 5)!`,
          daysUntilDue: 0,
        };
      }
    }

    // Calculate days until next due date
    let nextDueDate: Date;
    if (currentDay <= dueDay) {
      nextDueDate = new Date(currentYear, currentMonth, dueDay);
    } else {
      nextDueDate = new Date(currentYear, currentMonth + 1, dueDay);
    }

    const daysUntilDue = Math.ceil((nextDueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    // Warn if within 5 days of due date
    if (daysUntilDue <= 5 && (taxSummary?.netTaxPayable || 0) > 0) {
      return {
        isDue: false,
        message: `Pembayaran pajak jatuh tempo dalam ${daysUntilDue} hari (tanggal 5)`,
        daysUntilDue,
      };
    }

    return {
      isDue: false,
      message: '',
      daysUntilDue,
    };
  };

  return {
    taxSummary,
    taxTransactions,
    taxPayments,
    isLoading: isLoadingSummary || isLoadingTransactions || isLoadingPayments,
    isLoadingSummary,
    isLoadingTransactions,
    isLoadingPayments,
    payTax,
    checkTaxReminder,
  };
};
