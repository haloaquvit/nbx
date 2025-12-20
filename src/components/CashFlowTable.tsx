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
import { FileDown, X, Calendar } from "lucide-react"
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
import { MoreHorizontal, Trash2, Eye } from "lucide-react"
import { TransferAccountDialog } from "./TransferAccountDialog"
import { Card, CardContent } from "@/components/ui/card"
import { TrendingUp, TrendingDown, Wallet } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"

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
      case 'pembayaran_hutang':
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
      'pembayaran_hutang': 'Pembayaran Hutang',
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
    return ['pengeluaran', 'panjar_pengambilan', 'pembayaran_po', 'kas_keluar_manual', 'gaji_karyawan', 'pembayaran_gaji', 'pembayaran_hutang'].includes(item.type);
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

// Extended type to include calculated balances and COA info
interface CashHistoryWithBalance extends CashHistory {
  previousBalance?: number;
  afterBalance?: number;
  accountCode?: string;
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
  const [accountCodes, setAccountCodes] = React.useState<Record<string, string>>({});
  const [isDetailDialogOpen, setIsDetailDialogOpen] = React.useState(false);
  const [detailRecord, setDetailRecord] = React.useState<CashHistoryWithBalance | null>(null);

  // Fetch current account balances and codes
  React.useEffect(() => {
    const fetchAccountBalances = async () => {
      const { data: accounts, error } = await supabase
        .from('accounts')
        .select('id, balance, code');

      if (error) {
        console.error('Error fetching account balances:', error);
        return;
      }

      const balances: Record<string, number> = {};
      const codes: Record<string, string> = {};
      accounts?.forEach(account => {
        balances[account.id] = account.balance || 0;
        codes[account.id] = account.code || '';
      });
      setAccountBalances(balances);
      setAccountCodes(codes);
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
        afterBalance,
        accountCode: accountCodes[accountId] || ''
      });

      // Update running balance for next iteration (going backwards in time)
      accountRunningBalances[accountId] = previousBalance;
    }

    setFilteredData(dataWithBalances);
  }, [data, accountBalances, accountCodes]);

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

  // Calculate totals for summary cards
  const totals = React.useMemo(() => {
    const totalIncome = displayData
      .filter(item => isIncomeType(item) && item.source_type !== 'transfer_masuk')
      .reduce((sum, item) => sum + item.amount, 0);

    const totalExpense = displayData
      .filter(item => isExpenseType(item) && item.source_type !== 'transfer_keluar')
      .reduce((sum, item) => sum + item.amount, 0);

    const netFlow = totalIncome - totalExpense;

    return { totalIncome, totalExpense, netFlow };
  }, [displayData]);

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
  // Helper to format compact currency
  const formatCompactCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Helper to format full currency with Rp
  const formatFullCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  // Open detail dialog
  const handleRowClick = (item: CashHistoryWithBalance) => {
    setDetailRecord(item);
    setIsDetailDialogOpen(true);
  };

  const columns: ColumnDef<CashHistoryWithBalance>[] = [
    {
      accessorKey: "created_at",
      header: "Tanggal",
      cell: ({ row }) => {
        const dateValue = row.getValue("created_at");
        if (!dateValue) return "-";
        const date = new Date(dateValue as string);
        return (
          <div className="text-xs whitespace-nowrap">
            <div className="font-medium">{format(date, "d MMM", { locale: id })}</div>
            <div className="text-muted-foreground">{format(date, "HH:mm")}</div>
          </div>
        );
      },
    },
    {
      accessorKey: "account_name",
      header: "Akun",
      cell: ({ row }) => {
        const accountName = row.getValue("account_name") as string;
        return (
          <div className="max-w-[100px] text-xs truncate" title={accountName}>
            {accountName}
          </div>
        );
      },
    },
    {
      id: "transactionType",
      header: "Jenis",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <Badge variant={getTypeVariant(item)} className="text-[10px] px-1.5 py-0.5 whitespace-nowrap">
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
          <div className="max-w-[150px] text-xs truncate" title={description}>
            {description}
          </div>
        );
      },
    },
    {
      id: "cashIn",
      header: () => <div className="text-right text-xs">Masuk</div>,
      cell: ({ row }) => {
        const item = row.original;
        if (isIncomeType(item)) {
          return (
            <div className="text-right font-medium text-green-600 text-xs whitespace-nowrap">
              +{formatCompactCurrency(item.amount)}
            </div>
          );
        }
        return <div className="text-right text-muted-foreground text-xs">-</div>;
      },
    },
    {
      id: "cashOut",
      header: () => <div className="text-right text-xs">Keluar</div>,
      cell: ({ row }) => {
        const item = row.original;
        if (isExpenseType(item)) {
          return (
            <div className="text-right font-medium text-red-600 text-xs whitespace-nowrap">
              -{formatCompactCurrency(item.amount)}
            </div>
          );
        }
        return <div className="text-right text-muted-foreground text-xs">-</div>;
      },
    },
    {
      id: "afterBalance",
      header: () => <div className="text-right text-xs">Saldo</div>,
      cell: ({ row }) => {
        const item = row.original;
        const balance = item.afterBalance;
        if (balance === undefined) return <div className="text-right text-xs">-</div>;
        return (
          <div className={`text-right font-semibold text-xs whitespace-nowrap ${balance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
            {formatCompactCurrency(balance)}
          </div>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const item = row.original;

        return (
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                handleRowClick(item);
              }}
            >
              <Eye className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
            {user && user.role === 'owner' && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button aria-haspopup="true" size="icon" variant="ghost" className="h-7 w-7">
                    <MoreHorizontal className="h-3.5 w-3.5" />
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
            )}
          </div>
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
      'Tanggal': item.created_at ? format(new Date(item.created_at), "d/M/yy HH:mm", { locale: id }) : '-',
      'Jenis': getTypeLabel(item),
      'Akun': item.account_name || '-',
      'Deskripsi': item.description || '-',
      'Referensi': item.reference_name || item.reference_number || '-',
      'Kas Masuk': isIncomeType(item) ? item.amount : '',
      'Kas Keluar': isExpenseType(item) ? item.amount : '',
      'Saldo Awal': item.previousBalance || 0,
      'Saldo Akhir': item.afterBalance || 0
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
    if (netFlow >= 0) {
      doc.setTextColor(0, 128, 0); // Green for positive
    } else {
      doc.setTextColor(255, 0, 0); // Red for negative
    }
    doc.text(`Arus Kas Bersih: ${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(netFlow)}`, 20, currentY);
    doc.setTextColor(0, 0, 0); // Reset to black
    currentY += 15;
    
    // Table with compact layout
    autoTable(doc, {
      startY: currentY,
      head: [['Tgl', 'Jenis', 'Akun', 'Deskripsi', 'Jumlah', 'Saldo']],
      body: (displayData || []).map(item => {
        const isIncome = isIncomeType(item);
        const isExpense = isExpenseType(item);
        const amountStr = isIncome
          ? `+${formatCompactCurrency(item.amount)}`
          : isExpense
          ? `-${formatCompactCurrency(item.amount)}`
          : '-';

        return [
          item.created_at ? format(new Date(item.created_at), "d/M", { locale: id }) : '-',
          getTypeLabel(item),
          item.account_name?.substring(0, 12) || '-',
          item.description?.length > 25 ? item.description.substring(0, 25) + '...' : item.description || '',
          amountStr,
          item.afterBalance !== undefined ? formatCompactCurrency(item.afterBalance) : '-'
        ];
      }),
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
        0: { cellWidth: 18 }, // Tgl
        1: { cellWidth: 28 }, // Jenis
        2: { cellWidth: 30 }, // Akun
        3: { cellWidth: 55 }, // Deskripsi
        4: { cellWidth: 28, halign: 'right' }, // Jumlah
        5: { cellWidth: 30, halign: 'right' }  // Saldo
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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 border-green-200 dark:border-green-800">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-700 dark:text-green-400">Total Kas Masuk</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-300">
                  {new Intl.NumberFormat("id-ID", {
                    style: "currency",
                    currency: "IDR",
                    minimumFractionDigits: 0,
                  }).format(totals.totalIncome)}
                </p>
              </div>
              <div className="p-3 bg-green-200 dark:bg-green-800 rounded-full">
                <TrendingUp className="h-6 w-6 text-green-600 dark:text-green-300" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 border-red-200 dark:border-red-800">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-700 dark:text-red-400">Total Kas Keluar</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-300">
                  {new Intl.NumberFormat("id-ID", {
                    style: "currency",
                    currency: "IDR",
                    minimumFractionDigits: 0,
                  }).format(totals.totalExpense)}
                </p>
              </div>
              <div className="p-3 bg-red-200 dark:bg-red-800 rounded-full">
                <TrendingDown className="h-6 w-6 text-red-600 dark:text-red-300" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`bg-gradient-to-br ${totals.netFlow >= 0
          ? 'from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-200 dark:border-blue-800'
          : 'from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 border-orange-200 dark:border-orange-800'}`}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm font-medium ${totals.netFlow >= 0
                  ? 'text-blue-700 dark:text-blue-400'
                  : 'text-orange-700 dark:text-orange-400'}`}>
                  Arus Kas Bersih
                </p>
                <p className={`text-2xl font-bold ${totals.netFlow >= 0
                  ? 'text-blue-600 dark:text-blue-300'
                  : 'text-orange-600 dark:text-orange-300'}`}>
                  {new Intl.NumberFormat("id-ID", {
                    style: "currency",
                    currency: "IDR",
                    minimumFractionDigits: 0,
                  }).format(totals.netFlow)}
                </p>
              </div>
              <div className={`p-3 rounded-full ${totals.netFlow >= 0
                ? 'bg-blue-200 dark:bg-blue-800'
                : 'bg-orange-200 dark:bg-orange-800'}`}>
                <Wallet className={`h-6 w-6 ${totals.netFlow >= 0
                  ? 'text-blue-600 dark:text-blue-300'
                  : 'text-orange-600 dark:text-orange-300'}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

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
                    <TableRow
                      key={row.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleRowClick(row.original)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className="py-2">
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

      {/* Detail Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Detail Transaksi
            </DialogTitle>
          </DialogHeader>
          {detailRecord && (
            <div className="space-y-4">
              {/* Transaction Type Badge */}
              <div className="flex justify-center">
                <Badge variant={getTypeVariant(detailRecord)} className="text-sm px-3 py-1">
                  {getTypeLabel(detailRecord)}
                </Badge>
              </div>

              <Separator />

              {/* Amount Display */}
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-1">Jumlah</p>
                <p className={`text-3xl font-bold ${isIncomeType(detailRecord) ? 'text-green-600' : isExpenseType(detailRecord) ? 'text-red-600' : 'text-blue-600'}`}>
                  {isIncomeType(detailRecord) ? '+' : isExpenseType(detailRecord) ? '-' : ''}
                  {formatFullCurrency(detailRecord.amount)}
                </p>
              </div>

              <Separator />

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Tanggal</p>
                  <p className="font-medium">
                    {detailRecord.created_at
                      ? format(new Date(detailRecord.created_at), "d MMMM yyyy", { locale: id })
                      : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Waktu</p>
                  <p className="font-medium">
                    {detailRecord.created_at
                      ? format(new Date(detailRecord.created_at), "HH:mm:ss")
                      : '-'}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">Akun</p>
                  <p className="font-medium">
                    {detailRecord.accountCode && <span className="text-muted-foreground">[{detailRecord.accountCode}] </span>}
                    {detailRecord.account_name || '-'}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">Deskripsi</p>
                  <p className="font-medium">{detailRecord.description || '-'}</p>
                </div>
                {(detailRecord.reference_name || detailRecord.reference_number) && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Referensi</p>
                    <p className="font-medium">
                      {detailRecord.reference_name || detailRecord.reference_number || '-'}
                    </p>
                  </div>
                )}
                {detailRecord.expense_account_name && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Akun Beban</p>
                    <p className="font-medium">{detailRecord.expense_account_name}</p>
                  </div>
                )}
              </div>

              <Separator />

              {/* Balance Info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Saldo Sebelum</p>
                  <p className="font-medium text-gray-600">
                    {detailRecord.previousBalance !== undefined
                      ? formatFullCurrency(detailRecord.previousBalance)
                      : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Saldo Sesudah</p>
                  <p className={`font-medium ${(detailRecord.afterBalance || 0) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    {detailRecord.afterBalance !== undefined
                      ? formatFullCurrency(detailRecord.afterBalance)
                      : '-'}
                  </p>
                </div>
              </div>

              {/* Created By Info */}
              {(detailRecord.created_by_name || detailRecord.user_name) && (
                <>
                  <Separator />
                  <div className="text-sm">
                    <p className="text-muted-foreground">Dibuat oleh</p>
                    <p className="font-medium">{detailRecord.created_by_name || detailRecord.user_name || '-'}</p>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}