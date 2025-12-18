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
import { FileDown, Search, X, Calendar } from "lucide-react"
import * as XLSX from "xlsx"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { CashHistory } from "@/types/cashFlow"
import { format, isWithinInterval, startOfDay, endOfDay } from "date-fns"
import { id } from "date-fns/locale/id"
import { Skeleton } from "./ui/skeleton"
import { useAuth } from "@/hooks/useAuth"
import { useToast } from "@/components/ui/use-toast"
import { supabase } from "@/integrations/supabase/client"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MoreHorizontal, Trash2 } from "lucide-react"
import { TransferAccountDialog } from "./TransferAccountDialog"

const getTypeVariant = (item: CashHistory) => {
  // Handle transfers with special color
  if (item.source_type === 'transfer_masuk' || item.source_type === 'transfer_keluar') {
    return 'secondary'; // Different color for transfers
  }

  // Handle new format with 'type' field
  if (item.type) {
    switch (item.type) {
      case 'orderan':
      case 'kas_masuk_manual': 
      case 'transfer_masuk':
      case 'panjar_pelunasan':
      case 'pembayaran_piutang':
        return 'success';
      case 'kas_keluar_manual':
      case 'pengeluaran':
      case 'pembayaran_po':
      case 'transfer_keluar':
      case 'panjar_pengambilan':
      case 'gaji_karyawan':
      case 'pembayaran_gaji':
        return 'destructive';
      default: 
        return 'outline';
    }
  }
  
  // Handle old format with 'transaction_type' field
  if (item.transaction_type) {
    return item.transaction_type === 'income' ? 'success' : 'destructive';
  }
  
  return 'outline';
}

const getTypeLabel = (item: CashHistory) => {
  // Handle transfers first
  if (item.source_type === 'transfer_masuk') {
    return 'Transfer Masuk';
  } else if (item.source_type === 'transfer_keluar') {
    return 'Transfer Keluar';
  }

  // Handle new format with 'type' field
  if (item.type) {
    const labels = {
      'orderan': 'Orderan',
      'kas_masuk_manual': 'Kas Masuk Manual',
      'kas_keluar_manual': 'Kas Keluar Manual',
      'panjar_pengambilan': 'Panjar Pengambilan',
      'panjar_pelunasan': 'Panjar Pelunasan',
      'pengeluaran': 'Pengeluaran',
      'pembayaran_po': 'Pembayaran PO',
      'pembayaran_piutang': 'Pembayaran Piutang',
      'transfer_masuk': 'Transfer Masuk',
      'transfer_keluar': 'Transfer Keluar',
      'gaji_karyawan': 'Pembayaran Gaji',
      'pembayaran_gaji': 'Pembayaran Gaji'
    };

    // Check if it's a payroll payment (either direct type or description contains payroll indicators)
    if (item.type === 'kas_keluar_manual' &&
        (item.description?.includes('Pembayaran gaji') ||
         item.description?.includes('Payroll Payment') ||
         item.reference_name?.includes('Payroll'))) {
      return 'Pembayaran Gaji';
    }
    return labels[item.type as keyof typeof labels] || item.type;
  }
  
  // Handle old format - detect from source_type and transaction_type
  if (item.source_type) {
    switch (item.source_type) {
      case 'receivables_payment':
        return 'Pembayaran Piutang';
      case 'pos_direct':
        return 'Penjualan (POS)';
      case 'manual_expense':
        return 'Pengeluaran Manual';
      case 'employee_advance':
        return 'Panjar Karyawan';
      case 'po_payment':
        return 'Pembayaran PO';
      case 'receivables_writeoff':
        return 'Pembayaran Piutang';
      case 'transfer_masuk':
        return 'Transfer Masuk';
      case 'transfer_keluar':
        return 'Transfer Keluar';
      default:
        return item.source_type;
    }
  }
  
  if (item.transaction_type) {
    return item.transaction_type === 'income' ? 'Kas Masuk' : 'Kas Keluar';
  }
  
  return 'Tidak Diketahui';
}

const isIncomeType = (item: CashHistory) => {
  // Handle new format with 'type' field
  if (item.type) {
    return ['orderan', 'kas_masuk_manual', 'panjar_pelunasan', 'pembayaran_piutang'].includes(item.type);
  }
  
  // Handle format with 'transaction_type' field
  if (item.transaction_type) {
    return item.transaction_type === 'income';
  }
  
  return false;
}

const isExpenseType = (item: CashHistory) => {
  // Handle new format with 'type' field
  if (item.type) {
    return ['pengeluaran', 'panjar_pengambilan', 'pembayaran_po', 'kas_keluar_manual', 'gaji_karyawan', 'pembayaran_gaji'].includes(item.type);
  }
  
  // Handle format with 'transaction_type' field
  if (item.transaction_type) {
    return item.transaction_type === 'expense';
  }
  
  return false;
}

interface CashFlowTableProps {
  data: CashHistory[];
  isLoading: boolean;
}

// Extended type to include calculated balances
interface CashHistoryWithBalance extends CashHistory {
  previousBalance?: number;
  afterBalance?: number;
}

export function CashFlowTable({ data, isLoading }: CashFlowTableProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [selectedRecord, setSelectedRecord] = React.useState<CashHistory | null>(null);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = React.useState(false);
  const [dateRange, setDateRange] = React.useState<{ from: Date | undefined; to: Date | undefined }>({ from: undefined, to: undefined });
  const [filteredData, setFilteredData] = React.useState<CashHistoryWithBalance[]>([]);
  const [accountBalances, setAccountBalances] = React.useState<Record<string, number>>({});

  // Fetch current account balances
  React.useEffect(() => {
    const fetchAccountBalances = async () => {
      const { data: accounts, error } = await supabase
        .from('accounts')
        .select('id, balance');

      if (error) {
        console.error('Error fetching account balances:', error);
        return;
      }

      const balances: Record<string, number> = {};
      accounts?.forEach(account => {
        balances[account.id] = account.balance || 0;
      });
      setAccountBalances(balances);
    };

    fetchAccountBalances();
  }, []);

  // Initialize filtered data with calculated balances
  React.useEffect(() => {
    if (!Array.isArray(data) || Object.keys(accountBalances).length === 0) {
      setFilteredData([]);
      return;
    }

    // Calculate balances for each transaction
    // We need to process from newest to oldest to calculate previous balances
    const dataWithBalances: CashHistoryWithBalance[] = [];
    const accountRunningBalances: Record<string, number> = { ...accountBalances };

    // Process from newest to oldest (data is already sorted by created_at DESC)
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      const accountId = item.account_id;

      // Current balance for this account
      const currentBalance = accountRunningBalances[accountId] || 0;

      // Calculate the effect of this transaction
      let transactionEffect = 0;
      if (isIncomeType(item)) {
        transactionEffect = item.amount;
      } else if (isExpenseType(item)) {
        transactionEffect = -item.amount;
      } else if (item.source_type === 'transfer_masuk') {
        transactionEffect = item.amount;
      } else if (item.source_type === 'transfer_keluar') {
        transactionEffect = -item.amount;
      }

      // After balance is the current balance
      const afterBalance = currentBalance;
      // Previous balance is current balance minus the transaction effect
      const previousBalance = currentBalance - transactionEffect;

      dataWithBalances.push({
        ...item,
        previousBalance,
        afterBalance
      });

      // Update running balance for next iteration (going backwards in time)
      accountRunningBalances[accountId] = previousBalance;
    }

    setFilteredData(dataWithBalances);
  }, [data, accountBalances]);

  // Compute filtered and display data based on date range
  const displayData = React.useMemo(() => {
    if (!dateRange.from || !Array.isArray(filteredData)) {
      return filteredData;
    }

    try {
      if (dateRange.from && !dateRange.to) {
        // Only start date selected
        return filteredData.filter(item => {
          if (!item.created_at) return false;
          const itemDate = new Date(item.created_at);
          return itemDate >= startOfDay(dateRange.from!);
        });
      }

      if (dateRange.from && dateRange.to) {
        // Both dates selected
        return filteredData.filter(item => {
          if (!item.created_at) return false;
          const itemDate = new Date(item.created_at);
          return isWithinInterval(itemDate, {
            start: startOfDay(dateRange.from!),
            end: endOfDay(dateRange.to!)
          });
        });
      }

      return filteredData;
    } catch (error) {
      console.error('Error filtering cash flow data:', error);
      return filteredData;
    }
  }, [filteredData, dateRange]);

  const clearDateFilter = () => {
    setDateRange({ from: undefined, to: undefined });
  };

  const handleDeleteCashHistory = async () => {
    if (!selectedRecord) return;

    try {
      // First, determine the impact on account balance
      const isIncome = isIncomeType(selectedRecord);
      const isExpense = isExpenseType(selectedRecord);
      const balanceChange = isIncome ? -selectedRecord.amount : (isExpense ? selectedRecord.amount : 0);

      // Update account balance to reverse the transaction effect
      if (selectedRecord.account_id) {
        // Get current account balance first
        const { data: account, error: fetchError } = await supabase
          .from('accounts')
          .select('balance')
          .eq('id', selectedRecord.account_id)
          .single();

        if (fetchError) throw new Error(`Failed to fetch account: ${fetchError.message}`);

        let newBalance;
        
        if (selectedRecord.source_type === 'transfer_masuk' || selectedRecord.source_type === 'transfer_keluar') {
          // For transfers, reverse the direction
          if (selectedRecord.source_type === 'transfer_masuk') {
            // This was money coming in, so subtract it back
            newBalance = (account.balance || 0) - selectedRecord.amount;
          } else if (selectedRecord.source_type === 'transfer_keluar') {
            // This was money going out, so add it back
            newBalance = (account.balance || 0) + selectedRecord.amount;
          } else {
            newBalance = account.balance; // No change for other transfer types
          }
        } else {
          // For regular transactions, reverse the effect
          newBalance = (account.balance || 0) + balanceChange;
        }

        // Update the account balance
        const { error: updateError } = await supabase
          .from('accounts')
          .update({ balance: newBalance })
          .eq('id', selectedRecord.account_id);

        if (updateError) throw new Error(`Failed to update account balance: ${updateError.message}`);
      }

      // Now delete the cash history record
      const { error } = await supabase
        .from('cash_history')
        .delete()
        .eq('id', selectedRecord.id);

      if (error) throw error;

      toast({
        title: "Berhasil",
        description: "Data arus kas berhasil dihapus dan saldo akun diperbarui."
      });

      // Refresh the page or invalidate query
      window.location.reload();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Gagal",
        description: error instanceof Error ? error.message : "Terjadi kesalahan"
      });
    } finally {
      setIsDeleteDialogOpen(false);
      setSelectedRecord(null);
    }
  };
  const columns: ColumnDef<CashHistoryWithBalance>[] = [
    {
      accessorKey: "created_at",
      header: "Tanggal",
      cell: ({ row }) => {
        const dateValue = row.getValue("created_at");
        if (!dateValue) return "N/A";
        const date = new Date(dateValue as string);
        return format(date, "d MMM yyyy, HH:mm", { locale: id });
      },
    },
    {
      accessorKey: "account_name",
      header: "Akun Keuangan",
      cell: ({ row }) => {
        const accountName = row.getValue("account_name") as string;
        return (
          <div className="max-w-[120px] truncate" title={accountName}>
            {accountName}
          </div>
        );
      },
    },
    {
      id: "transactionType",
      header: "Jenis Transaksi",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <Badge variant={getTypeVariant(item)} className="text-xs whitespace-nowrap">
            {getTypeLabel(item)}
          </Badge>
        );
      },
    },
    {
      accessorKey: "description",
      header: "Deskripsi",
      cell: ({ row }) => {
        const description = row.getValue("description") as string;
        return (
          <div className="max-w-[200px] truncate" title={description}>
            {description}
          </div>
        );
      },
    },
    {
      accessorKey: "reference_name",
      header: "Referensi",
      cell: ({ row }) => {
        const refName = row.getValue("reference_name") as string;
        const refId = row.original.reference_id;
        const refNumber = row.original.reference_number;

        // Use reference_name or reference_number, whichever is available
        const displayRef = refName || refNumber || refId;

        if (!displayRef) return "-";

        return (
          <div className="max-w-[150px] truncate text-sm" title={displayRef}>
            {displayRef}
          </div>
        );
      },
    },
    {
      id: "cashFlow",
      header: "Kas Masuk",
      cell: ({ row }) => {
        const item = row.original;
        const amount = item.amount;
        
        if (isIncomeType(item)) {
          return (
            <div className="text-right font-semibold text-green-600 text-base">
              {new Intl.NumberFormat("id-ID", {
                style: "currency",
                currency: "IDR",
                minimumFractionDigits: 0,
              }).format(amount)}
            </div>
          );
        }
        return <div className="text-right text-base">-</div>;
      },
    },
    {
      id: "cashOut",
      header: "Kas Keluar",
      cell: ({ row }) => {
        const item = row.original;
        const amount = item.amount;

        if (isExpenseType(item)) {
          return (
            <div className="text-right font-medium text-red-600">
              {new Intl.NumberFormat("id-ID", {
                style: "currency",
                currency: "IDR",
                minimumFractionDigits: 0,
              }).format(amount)}
            </div>
          );
        }
        return <div className="text-right">-</div>;
      },
    },
    {
      id: "previousBalance",
      header: "Saldo Sebelumnya",
      cell: ({ row }) => {
        const item = row.original;
        const balance = item.previousBalance;

        if (balance === undefined || balance === null) {
          return <div className="text-right text-muted-foreground">-</div>;
        }

        return (
          <div className={`text-right font-medium ${balance < 0 ? 'text-red-600' : 'text-blue-600'}`}>
            {new Intl.NumberFormat("id-ID", {
              style: "currency",
              currency: "IDR",
              minimumFractionDigits: 0,
            }).format(balance)}
          </div>
        );
      },
    },
    {
      id: "afterBalance",
      header: "Saldo Setelah",
      cell: ({ row }) => {
        const item = row.original;
        const balance = item.afterBalance;

        if (balance === undefined || balance === null) {
          return <div className="text-right text-muted-foreground">-</div>;
        }

        return (
          <div className={`text-right font-bold ${balance < 0 ? 'text-red-600' : 'text-green-600'}`}>
            {new Intl.NumberFormat("id-ID", {
              style: "currency",
              currency: "IDR",
              minimumFractionDigits: 0,
            }).format(balance)}
          </div>
        );
      },
    },
    {
      id: "createdBy",
      header: "Dibuat Oleh",
      cell: ({ row }) => {
        const item = row.original;
        const userName = item.user_name || item.created_by_name || 'Unknown';
        return (
          <div className="max-w-[100px] truncate text-sm" title={userName}>
            {userName}
          </div>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const item = row.original;
        
        // Only show actions for owner
        if (!user || user.role !== 'owner') {
          return null;
        }
        
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button aria-haspopup="true" size="icon" variant="ghost">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Aksi</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-500 focus:text-red-500"
                onClick={() => {
                  setSelectedRecord(item);
                  setIsDeleteDialogOpen(true);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Hapus Data
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ]

  const table = useReactTable({
    data: displayData || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    initialState: {
      pagination: {
        pageSize: 7, // Show 7 rows per page
      },
    },
  })

  const handleExportExcel = () => {
    const exportData = (displayData || []).map(item => ({
      'Tanggal': item.created_at ? format(new Date(item.created_at), "d MMM yyyy, HH:mm", { locale: id }) : 'N/A',
      'Akun Keuangan': item.account_name || 'Unknown Account',
      'Jenis Transaksi': getTypeLabel(item),
      'Deskripsi': item.description,
      'Referensi': item.reference_name || item.reference_id || item.reference_number || '-',
      'Kas Masuk': isIncomeType(item) ? item.amount : 0,
      'Kas Keluar': isExpenseType(item) ? item.amount : 0,
      'Saldo Sebelumnya': item.previousBalance || 0,
      'Saldo Setelah': item.afterBalance || 0,
      'Dibuat Oleh': item.user_name || item.created_by_name || 'Unknown'
    }));
    
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Arus Kas");
    
    // Add date range to filename if filtered
    const filename = dateRange.from && dateRange.to 
      ? `arus-kas-${format(dateRange.from, 'yyyy-MM-dd')}-${format(dateRange.to, 'yyyy-MM-dd')}.xlsx`
      : "arus-kas.xlsx";
    
    XLSX.writeFile(workbook, filename);
  };

  const handleExportPdf = () => {
    const doc = new jsPDF('l', 'mm', 'a4'); // landscape orientation for wider table

    // Calculate totals for filtered data
    const totalIncome = displayData
      .filter(item => {
        if (isIncomeType(item)) {
          // Exclude only internal transfers
          if (item.source_type === 'transfer_masuk' || item.source_type === 'transfer_keluar') {
            return false;
          }
          return true;
        }
        return false;
      })
      .reduce((sum, item) => sum + item.amount, 0);

    const totalExpense = displayData
      .filter(item => {
        if (isExpenseType(item)) {
          // Exclude only internal transfers
          if (item.source_type === 'transfer_masuk' || item.source_type === 'transfer_keluar') {
            return false;
          }
          return true;
        }
        return false;
      })
      .reduce((sum, item) => sum + item.amount, 0);

    const netFlow = totalIncome - totalExpense;
    
    // Add title and date range if filtered
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('LAPORAN ARUS KAS', 105, 20, { align: 'center' });
    
    let currentY = 35;
    
    if (dateRange.from && dateRange.to) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text(`Periode: ${format(dateRange.from, 'd MMM yyyy', { locale: id })} - ${format(dateRange.to, 'd MMM yyyy', { locale: id })}`, 105, currentY, { align: 'center' });
      currentY += 10;
    }

    // Add summary totals
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('RINGKASAN:', 20, currentY);
    currentY += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Total Kas Masuk: ${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(totalIncome)}`, 20, currentY);
    currentY += 6;
    
    doc.text(`Total Kas Keluar: ${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(totalExpense)}`, 20, currentY);
    currentY += 6;
    
    doc.setFont('helvetica', 'bold');
    const netColor = netFlow >= 0 ? [0, 128, 0] : [255, 0, 0]; // Green for positive, red for negative
    doc.setTextColor(...netColor);
    doc.text(`Arus Kas Bersih: ${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(netFlow)}`, 20, currentY);
    doc.setTextColor(0, 0, 0); // Reset to black
    currentY += 15;
    
    // Table with larger fonts and landscape layout
    autoTable(doc, {
      startY: currentY,
      head: [['Tanggal', 'Jenis', 'Deskripsi', 'Kas Masuk', 'Kas Keluar', 'Saldo Sebelum', 'Saldo Setelah']],
      body: (displayData || []).map(item => [
        item.created_at ? format(new Date(item.created_at), "d MMM yyyy", { locale: id }) : 'N/A',
        getTypeLabel(item),
        item.description?.length > 20 ? item.description.substring(0, 20) + '...' : item.description || '',
        isIncomeType(item) ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(item.amount) : '-',
        isExpenseType(item) ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(item.amount) : '-',
        item.previousBalance !== undefined ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(item.previousBalance) : '-',
        item.afterBalance !== undefined ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(item.afterBalance) : '-'
      ]),
      styles: {
        fontSize: 8,
        cellPadding: 2
      },
      headStyles: {
        fillColor: [71, 85, 105],
        fontSize: 9,
        fontStyle: 'bold'
      },
      columnStyles: {
        0: { cellWidth: 25 }, // Tanggal
        1: { cellWidth: 30 }, // Jenis
        2: { cellWidth: 45 }, // Deskripsi
        3: { cellWidth: 30, halign: 'right' }, // Kas Masuk
        4: { cellWidth: 30, halign: 'right' }, // Kas Keluar
        5: { cellWidth: 35, halign: 'right' }, // Saldo Sebelum
        6: { cellWidth: 35, halign: 'right' }  // Saldo Setelah
      }
    });
    
    // Add total row at the end - aligned with table columns
    const finalY = (doc as any).lastAutoTable.finalY + 5;

    // Draw a line separator (landscape width)
    doc.setLineWidth(0.5);
    doc.line(20, finalY, 277, finalY); // 297mm is landscape width, leaving margin

    const totalRowY = finalY + 8;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL:', 20, totalRowY);

    // Position total amounts to align with table columns
    // Landscape layout column positions: 20 + 25 (tanggal) + 30 (jenis) + 45 (deskripsi) = 120 for kas masuk
    // 120 + 30 (kas masuk) = 150 for kas keluar
    doc.setTextColor(0, 128, 0); // Green for income
    doc.text(new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(totalIncome), 145, totalRowY, { align: 'right' });

    doc.setTextColor(255, 0, 0); // Red for expense
    doc.text(new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(totalExpense), 175, totalRowY, { align: 'right' });

    doc.setTextColor(0, 0, 0); // Reset to black

    // Add generation timestamp (landscape - center at 148.5mm)
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Dicetak pada: ${format(new Date(), 'dd MMM yyyy HH:mm')}`, 148.5, 200, { align: 'center' });
    
    // Add date range to filename if filtered
    const filename = dateRange.from && dateRange.to 
      ? `arus-kas-${format(dateRange.from, 'yyyy-MM-dd')}-${format(dateRange.to, 'yyyy-MM-dd')}.pdf`
      : "arus-kas.pdf";
    
    doc.save(filename);
  };


  return (
    <div className="w-full space-y-4">
      <TransferAccountDialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen} />

      {/* Filters and Actions */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex gap-4 items-center flex-wrap">
          {/* Date Range Filter */}
          <div className="flex items-center gap-2">
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
                      selected={dateRange.from && dateRange.to ? { from: dateRange.from, to: dateRange.to } : dateRange.from ? { from: dateRange.from, to: undefined } : undefined}
                      onSelect={(range) => {
                        if (range) {
                          setDateRange({ from: range.from, to: range.to });
                        } else {
                          setDateRange({ from: undefined, to: undefined });
                        }
                      }}
                      numberOfMonths={2}
                    />
                  </PopoverContent>
                </Popover>
                
                {(dateRange.from || dateRange.to) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearDateFilter}
                    className="h-8 px-2"
                  >
                    <X className="h-4 w-4" />
                    Clear
                  </Button>
                )}
              </div>

              {/* Filter Info */}
              <div className="flex items-center gap-2">
                <div className="text-sm text-muted-foreground">
                  Menampilkan {displayData.length} dari {data?.length || 0} transaksi
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleExportExcel}>
                <FileDown className="mr-2 h-4 w-4" /> Ekspor Excel
              </Button>
              <Button variant="outline" onClick={handleExportPdf}>
                <FileDown className="mr-2 h-4 w-4" /> Ekspor PDF
              </Button>
              <Button variant="outline" className="text-blue-600 border-blue-600 hover:bg-blue-50" onClick={() => setIsTransferDialogOpen(true)}>
                <MoreHorizontal className="mr-2 h-4 w-4" /> Transfer Antar Kas
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-md border">
            <Table className="text-base">
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id} className="text-base font-semibold h-12">
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={columns.length}>
                        <Skeleton className="h-8 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className="text-base py-4">
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center text-base">
                      Tidak ada data arus kas.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          
          {/* Pagination */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Halaman {table.getState().pagination.pageIndex + 1} dari {table.getPageCount()}
              {' '}(Menampilkan {table.getRowModel().rows.length} dari {displayData.length} baris)
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
              >
                First
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                Next
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
              >
                Last
              </Button>
            </div>
          </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Data Arus Kas</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus data arus kas ini? 
              <br /><br />
              <strong>Deskripsi:</strong> {selectedRecord?.description}
              <br />
              <strong>Jumlah:</strong> {selectedRecord?.amount && new Intl.NumberFormat("id-ID", {
                style: "currency",
                currency: "IDR",
                minimumFractionDigits: 0,
              }).format(selectedRecord.amount)}
              <br /><br />
              <span className="text-destructive">Tindakan ini tidak dapat dibatalkan.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteCashHistory}
            >
              Ya, Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}