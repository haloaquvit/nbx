"use client"
import * as React from "react"
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { FileDown, Calendar, ChevronDown, ChevronRight, BookOpen } from "lucide-react"
import * as XLSX from "xlsx"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { format, isWithinInterval, startOfDay, endOfDay } from "date-fns"
import { id } from "date-fns/locale/id"
import { Skeleton } from "./ui/skeleton"
import { supabase } from "@/integrations/supabase/client"
import { useBranch } from "@/contexts/BranchContext"

// ============================================================================
// CATATAN PENTING: BUKU BESAR DARI JOURNAL_ENTRIES
// ============================================================================
// Buku Besar sekarang membaca langsung dari journal_entries dan journal_entry_lines
// - Sumber kebenaran: journal_entries dengan status='posted' dan is_voided=false
// - Setiap jurnal memiliki lines dengan debit/credit per akun
// - Running balance dihitung berdasarkan tipe akun (debit/credit normal)
// ============================================================================

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  balance: number;
  initial_balance: number;
}

interface LedgerEntry {
  id: string;
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  reference: string;
  referenceType: string;
  journalNumber: string;
}

interface AccountLedger {
  account: Account;
  entries: LedgerEntry[];
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
}

export function GeneralLedgerTable() {
  const { currentBranch } = useBranch();
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = React.useState<string>("all");
  const [ledgerData, setLedgerData] = React.useState<AccountLedger[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [expandedAccounts, setExpandedAccounts] = React.useState<Set<string>>(new Set());
  const [dateRange, setDateRange] = React.useState<{ from: Date | undefined; to: Date | undefined }>({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1), // First day of current month
    to: new Date()
  });

  // Fetch accounts (global COA structure)
  React.useEffect(() => {
    const fetchAccounts = async () => {
      const { data, error } = await supabase
        .from('accounts')
        .select('id, code, name, type, balance, initial_balance')
        .eq('is_active', true)
        .order('code');

      if (error) {
        console.error('Error fetching accounts:', error);
        return;
      }

      setAccounts(data || []);
    };

    fetchAccounts();
  }, []);

  // Fetch ledger entries from journal_entries and journal_entry_lines
  React.useEffect(() => {
    const fetchLedgerEntries = async () => {
      if (accounts.length === 0 || !currentBranch?.id) return;

      setIsLoading(true);

      const fromDateStr = dateRange.from?.toISOString().split('T')[0] || '';
      const toDateStr = dateRange.to?.toISOString().split('T')[0] || '';

      // ============================================================================
      // QUERY JOURNAL_ENTRY_LINES WITH JOURNAL INFO
      // Only fetch posted, non-voided journals for the current branch
      // Note: PostgREST doesn't support !inner syntax, so we filter on client side
      // ============================================================================
      const { data: rawJournalLines, error: journalError } = await supabase
        .from('journal_entry_lines')
        .select(`
          id,
          account_id,
          account_code,
          account_name,
          debit_amount,
          credit_amount,
          description,
          journal_entries (
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
        `);

      // Filter on client side since PostgREST doesn't support nested filtering with !inner
      const journalLines = (rawJournalLines || []).filter((line: any) => {
        const journal = line.journal_entries;
        if (!journal) return false;

        // Match branch, status, and voided
        if (journal.branch_id !== currentBranch.id) return false;
        if (journal.status !== 'posted') return false;
        if (journal.is_voided !== false) return false;

        // Date filters
        const entryDate = journal.entry_date;
        if (fromDateStr && entryDate < fromDateStr) return false;
        if (toDateStr && entryDate > toDateStr) return false;

        return true;
      }).sort((a: any, b: any) => {
        // Sort by entry_date ascending
        return a.journal_entries.entry_date.localeCompare(b.journal_entries.entry_date);
      });

      if (journalError) {
        console.error('Error fetching journal lines:', journalError);
        setIsLoading(false);
        return;
      }

      // ============================================================================
      // GROUP ENTRIES BY ACCOUNT
      // ============================================================================
      const accountLedgers: Record<string, AccountLedger> = {};

      // Initialize ledgers for all accounts with initial_balance
      accounts.forEach(account => {
        accountLedgers[account.id] = {
          account,
          entries: [],
          openingBalance: account.initial_balance || 0,
          totalDebit: 0,
          totalCredit: 0,
          closingBalance: 0
        };
      });

      // Process journal lines
      (journalLines || []).forEach((line: any) => {
        const accountId = line.account_id;
        if (!accountId || !accountLedgers[accountId]) return;

        const journal = line.journal_entries;
        const debit = Number(line.debit_amount) || 0;
        const credit = Number(line.credit_amount) || 0;

        accountLedgers[accountId].entries.push({
          id: line.id,
          date: journal.entry_date,
          description: line.description || journal.description,
          debit,
          credit,
          balance: 0, // Will be calculated below
          reference: journal.reference_id || '',
          referenceType: journal.reference_type || '',
          journalNumber: journal.entry_number || ''
        });

        accountLedgers[accountId].totalDebit += debit;
        accountLedgers[accountId].totalCredit += credit;
      });

      // ============================================================================
      // CALCULATE RUNNING BALANCES
      // Based on account type (Aset/Beban = debit normal, Kewajiban/Modal/Pendapatan = credit normal)
      // ============================================================================
      Object.values(accountLedgers).forEach(ledger => {
        let runningBalance = ledger.openingBalance;
        const accountType = ledger.account.type;
        const isDebitNormal = ['Aset', 'Beban'].includes(accountType);

        // Sort entries by date, then by journal number for same-date entries
        ledger.entries.sort((a, b) => {
          const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime();
          if (dateCompare !== 0) return dateCompare;
          return (a.journalNumber || '').localeCompare(b.journalNumber || '');
        });

        ledger.entries.forEach(entry => {
          if (isDebitNormal) {
            // Aset & Beban: Debit +, Credit -
            runningBalance = runningBalance + entry.debit - entry.credit;
          } else {
            // Kewajiban, Modal, Pendapatan: Credit +, Debit -
            runningBalance = runningBalance + entry.credit - entry.debit;
          }
          entry.balance = runningBalance;
        });

        // Set closing balance
        ledger.closingBalance = runningBalance;
      });

      // Filter to only accounts with entries or non-zero balance
      const filteredLedgers = Object.values(accountLedgers)
        .filter(ledger =>
          ledger.entries.length > 0 ||
          ledger.openingBalance !== 0 ||
          ledger.closingBalance !== 0
        )
        .sort((a, b) => (a.account.code || '').localeCompare(b.account.code || ''));

      setLedgerData(filteredLedgers);
      setIsLoading(false);
    };

    fetchLedgerEntries();
  }, [accounts, dateRange, currentBranch?.id]);

  const toggleAccountExpansion = (accountId: string) => {
    const newExpanded = new Set(expandedAccounts);
    if (newExpanded.has(accountId)) {
      newExpanded.delete(accountId);
    } else {
      newExpanded.add(accountId);
    }
    setExpandedAccounts(newExpanded);
  };

  const expandAll = () => {
    setExpandedAccounts(new Set(ledgerData.map(l => l.account.id)));
  };

  const collapseAll = () => {
    setExpandedAccounts(new Set());
  };

  // Filter ledger data based on selected account
  const displayData = React.useMemo(() => {
    if (selectedAccountId === "all") {
      return ledgerData;
    }
    return ledgerData.filter(l => l.account.id === selectedAccountId);
  }, [ledgerData, selectedAccountId]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getReferenceTypeLabel = (refType: string) => {
    const labels: Record<string, string> = {
      'transaction': 'Penjualan',
      'expense': 'Pengeluaran',
      'payroll': 'Gaji',
      'advance': 'Panjar',
      'transfer': 'Transfer',
      'receivable': 'Piutang',
      'payable': 'Hutang',
      'manual': 'Manual',
      'adjustment': 'Penyesuaian',
      'closing': 'Penutup',
      'opening': 'Pembukaan'
    };
    return labels[refType] || refType;
  };

  const handleExportExcel = () => {
    const exportData: any[] = [];

    displayData.forEach(ledger => {
      // Add account header
      exportData.push({
        'Kode Akun': ledger.account.code,
        'Nama Akun': ledger.account.name,
        'No. Jurnal': '',
        'Tanggal': '',
        'Deskripsi': 'SALDO AWAL',
        'Jenis': '',
        'Debit': '',
        'Kredit': '',
        'Saldo': ledger.openingBalance
      });

      // Add entries
      ledger.entries.forEach(entry => {
        exportData.push({
          'Kode Akun': '',
          'Nama Akun': '',
          'No. Jurnal': entry.journalNumber,
          'Tanggal': entry.date ? format(new Date(entry.date), "d MMM yyyy", { locale: id }) : '',
          'Deskripsi': entry.description,
          'Jenis': getReferenceTypeLabel(entry.referenceType),
          'Debit': entry.debit || '',
          'Kredit': entry.credit || '',
          'Saldo': entry.balance
        });
      });

      // Add totals
      exportData.push({
        'Kode Akun': '',
        'Nama Akun': '',
        'No. Jurnal': '',
        'Tanggal': '',
        'Deskripsi': 'TOTAL',
        'Jenis': '',
        'Debit': ledger.totalDebit,
        'Kredit': ledger.totalCredit,
        'Saldo': ledger.closingBalance
      });

      // Add empty row
      exportData.push({});
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Buku Besar");

    const filename = dateRange.from && dateRange.to
      ? `buku-besar-${format(dateRange.from, 'yyyy-MM-dd')}-${format(dateRange.to, 'yyyy-MM-dd')}.xlsx`
      : "buku-besar.xlsx";

    XLSX.writeFile(workbook, filename);
  };

  const handleExportPdf = () => {
    const doc = new jsPDF('l', 'mm', 'a4');

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('BUKU BESAR (GENERAL LEDGER)', 148.5, 15, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Sumber: Journal Entries (Double-Entry Accounting)', 148.5, 21, { align: 'center' });

    if (dateRange.from && dateRange.to) {
      doc.setFontSize(11);
      doc.text(
        `Periode: ${format(dateRange.from, 'd MMM yyyy', { locale: id })} - ${format(dateRange.to, 'd MMM yyyy', { locale: id })}`,
        148.5, 27, { align: 'center' }
      );
    }

    let currentY = 35;

    displayData.forEach((ledger, index) => {
      if (currentY > 180) {
        doc.addPage();
        currentY = 20;
      }

      // Account header
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(`${ledger.account.code} - ${ledger.account.name} (${ledger.account.type})`, 14, currentY);
      currentY += 5;

      const tableData = [
        ['', '', 'Saldo Awal', '', '', formatCurrency(ledger.openingBalance)],
        ...ledger.entries.map(entry => [
          entry.journalNumber || '-',
          entry.date ? format(new Date(entry.date), "d MMM yy", { locale: id }) : '',
          entry.description.substring(0, 35),
          entry.debit ? formatCurrency(entry.debit) : '-',
          entry.credit ? formatCurrency(entry.credit) : '-',
          formatCurrency(entry.balance)
        ]),
        ['', '', 'TOTAL', formatCurrency(ledger.totalDebit), formatCurrency(ledger.totalCredit), formatCurrency(ledger.closingBalance)]
      ];

      autoTable(doc, {
        startY: currentY,
        head: [['No. Jurnal', 'Tanggal', 'Deskripsi', 'Debit', 'Kredit', 'Saldo']],
        body: tableData,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [71, 85, 105] },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 22 },
          2: { cellWidth: 70 },
          3: { cellWidth: 30, halign: 'right' },
          4: { cellWidth: 30, halign: 'right' },
          5: { cellWidth: 30, halign: 'right' }
        }
      });

      currentY = (doc as any).lastAutoTable.finalY + 10;
    });

    const filename = dateRange.from && dateRange.to
      ? `buku-besar-${format(dateRange.from, 'yyyy-MM-dd')}-${format(dateRange.to, 'yyyy-MM-dd')}.pdf`
      : "buku-besar.pdf";

    doc.save(filename);
  };

  return (
    <div className="space-y-4">
      {/* Header with info */}
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
        <p className="text-sm text-blue-700 dark:text-blue-300">
          <BookOpen className="inline-block h-4 w-4 mr-1" />
          Buku Besar ini diambil langsung dari <strong>Journal Entries</strong> (jurnal yang sudah di-posting).
          Semua mutasi akun tercatat secara double-entry.
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex gap-4 items-center flex-wrap">
          {/* Account Filter */}
          <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Pilih Akun" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Akun</SelectItem>
              {accounts.map(account => (
                <SelectItem key={account.id} value={account.id}>
                  {account.code} - {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date Range Filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-[280px] justify-start text-left font-normal",
                  !dateRange.from && !dateRange.to && "text-muted-foreground"
                )}
              >
                <Calendar className="mr-2 h-4 w-4" />
                {dateRange.from ? (
                  dateRange.to ? (
                    `${format(dateRange.from, "d MMM yyyy", { locale: id })} - ${format(dateRange.to, "d MMM yyyy", { locale: id })}`
                  ) : (
                    `${format(dateRange.from, "d MMM yyyy", { locale: id })} - ...`
                  )
                ) : (
                  "Pilih Rentang Tanggal"
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                initialFocus
                mode="range"
                defaultMonth={dateRange.from}
                selected={dateRange.from && dateRange.to ? { from: dateRange.from, to: dateRange.to } : undefined}
                onSelect={(range) => {
                  if (range) {
                    setDateRange({ from: range.from, to: range.to });
                  }
                }}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>

          <Button variant="outline" size="sm" onClick={expandAll}>
            Expand All
          </Button>
          <Button variant="outline" size="sm" onClick={collapseAll}>
            Collapse All
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExportExcel}>
            <FileDown className="mr-2 h-4 w-4" /> Ekspor Excel
          </Button>
          <Button variant="outline" onClick={handleExportPdf}>
            <FileDown className="mr-2 h-4 w-4" /> Ekspor PDF
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="text-sm text-muted-foreground">
        Menampilkan {displayData.length} akun dengan mutasi | Branch: {currentBranch?.name || 'Tidak dipilih'}
      </div>

      {/* Ledger Cards */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : !currentBranch?.id ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Pilih cabang terlebih dahulu untuk melihat Buku Besar
          </CardContent>
        </Card>
      ) : displayData.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Tidak ada jurnal yang di-posting untuk periode ini
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {displayData.map(ledger => (
            <Card key={ledger.account.id}>
              <CardHeader
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => toggleAccountExpansion(ledger.account.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {expandedAccounts.has(ledger.account.id) ? (
                      <ChevronDown className="h-5 w-5" />
                    ) : (
                      <ChevronRight className="h-5 w-5" />
                    )}
                    <BookOpen className="h-5 w-5 text-blue-600" />
                    <div>
                      <CardTitle className="text-lg">
                        {ledger.account.code} - {ledger.account.name}
                      </CardTitle>
                      <CardDescription>
                        {ledger.account.type} | {ledger.entries.length} jurnal entries
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex gap-6 text-right">
                    <div>
                      <p className="text-xs text-muted-foreground">Saldo Awal</p>
                      <p className="font-semibold">{formatCurrency(ledger.openingBalance)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Debit</p>
                      <p className="font-semibold text-green-600">{formatCurrency(ledger.totalDebit)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Kredit</p>
                      <p className="font-semibold text-red-600">{formatCurrency(ledger.totalCredit)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Saldo Akhir</p>
                      <p className={`font-bold ${ledger.closingBalance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        {formatCurrency(ledger.closingBalance)}
                      </p>
                    </div>
                  </div>
                </div>
              </CardHeader>

              {expandedAccounts.has(ledger.account.id) && (
                <CardContent>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[120px]">No. Jurnal</TableHead>
                          <TableHead className="w-[100px]">Tanggal</TableHead>
                          <TableHead>Deskripsi</TableHead>
                          <TableHead className="w-[100px]">Jenis</TableHead>
                          <TableHead className="text-right w-[120px]">Debit</TableHead>
                          <TableHead className="text-right w-[120px]">Kredit</TableHead>
                          <TableHead className="text-right w-[140px]">Saldo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {/* Opening Balance Row */}
                        <TableRow className="bg-muted/30">
                          <TableCell colSpan={4} className="font-medium">Saldo Awal</TableCell>
                          <TableCell className="text-right">-</TableCell>
                          <TableCell className="text-right">-</TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(ledger.openingBalance)}
                          </TableCell>
                        </TableRow>

                        {/* Transaction Rows */}
                        {ledger.entries.map(entry => (
                          <TableRow key={entry.id}>
                            <TableCell className="font-mono text-xs">
                              {entry.journalNumber || '-'}
                            </TableCell>
                            <TableCell>
                              {entry.date ? format(new Date(entry.date), "d MMM yyyy", { locale: id }) : '-'}
                            </TableCell>
                            <TableCell className="max-w-[250px] truncate" title={entry.description}>
                              {entry.description}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {getReferenceTypeLabel(entry.referenceType)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {entry.debit > 0 ? (
                                <span className="text-green-600 font-medium">{formatCurrency(entry.debit)}</span>
                              ) : '-'}
                            </TableCell>
                            <TableCell className="text-right">
                              {entry.credit > 0 ? (
                                <span className="text-red-600 font-medium">{formatCurrency(entry.credit)}</span>
                              ) : '-'}
                            </TableCell>
                            <TableCell className={`text-right font-semibold ${entry.balance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                              {formatCurrency(entry.balance)}
                            </TableCell>
                          </TableRow>
                        ))}

                        {/* Closing Balance Row */}
                        <TableRow className="bg-muted/50 font-bold">
                          <TableCell colSpan={4}>Saldo Akhir</TableCell>
                          <TableCell className="text-right text-green-600">
                            {formatCurrency(ledger.totalDebit)}
                          </TableCell>
                          <TableCell className="text-right text-red-600">
                            {formatCurrency(ledger.totalCredit)}
                          </TableCell>
                          <TableCell className={`text-right ${ledger.closingBalance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                            {formatCurrency(ledger.closingBalance)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
