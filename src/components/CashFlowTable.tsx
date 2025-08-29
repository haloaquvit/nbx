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
import { MoreHorizontal, Trash2, BookOpen } from "lucide-react"
import { TransferAccountDialog } from "./TransferAccountDialog"
import { JournalViewTable } from "./JournalViewTable"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAccounts } from "@/hooks/useAccounts"

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
      'transfer_keluar': 'Transfer Keluar'
    };
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
    return ['pengeluaran', 'panjar_pengambilan', 'pembayaran_po', 'kas_keluar_manual'].includes(item.type);
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

export function CashFlowTable({ data, isLoading }: CashFlowTableProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { accounts } = useAccounts();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [selectedRecord, setSelectedRecord] = React.useState<CashHistory | null>(null);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = React.useState(false);
  const [dateRange, setDateRange] = React.useState<{ from: Date | undefined; to: Date | undefined }>({ from: undefined, to: undefined });
  const [filteredData, setFilteredData] = React.useState<CashHistory[]>([]);

  // Initialize filtered data when data changes
  React.useEffect(() => {
    if (Array.isArray(data)) {
      setFilteredData(data);
    } else {
      setFilteredData([]);
    }
  }, [data]);

  // Filter data based on date range
  React.useEffect(() => {
    if (!Array.isArray(data)) {
      return;
    }

    if (!dateRange.from) {
      setFilteredData(data);
      return;
    }

    try {
      if (dateRange.from && !dateRange.to) {
        // Only start date selected
        const filtered = data.filter(item => {
          if (!item.created_at) return false;
          const itemDate = new Date(item.created_at);
          return itemDate >= startOfDay(dateRange.from!);
        });
        setFilteredData(filtered);
        return;
      }

      if (dateRange.from && dateRange.to) {
        // Both dates selected
        const filtered = data.filter(item => {
          if (!item.created_at) return false;
          const itemDate = new Date(item.created_at);
          return isWithinInterval(itemDate, {
            start: startOfDay(dateRange.from!),
            end: endOfDay(dateRange.to!)
          });
        });
        setFilteredData(filtered);
        return;
      }

      setFilteredData(data);
    } catch (error) {
      console.error('Error filtering cash flow data:', error);
      setFilteredData(data);
    }
  }, [data, dateRange]);

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
  const columns: ColumnDef<CashHistory>[] = [
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
    },
    {
      id: "transactionType",
      header: "Jenis Transaksi",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <Badge variant={getTypeVariant(item)}>
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
          <div className="max-w-[300px] truncate" title={description}>
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
        if (!refName && !refId) return "-";
        return (
          <div className="text-sm">
            {refName && <div className="font-medium">{refName}</div>}
            {refId && <div className="text-muted-foreground">{refId}</div>}
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
      id: "createdBy",
      header: "Dibuat Oleh",
      cell: ({ row }) => {
        const item = row.original;
        return item.user_name || item.created_by_name || 'Unknown';
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
    data: filteredData || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const handleExportExcel = () => {
    const exportData = (filteredData || []).map(item => ({
      'Tanggal': item.created_at ? format(new Date(item.created_at), "d MMM yyyy, HH:mm", { locale: id }) : 'N/A',
      'Akun Keuangan': item.account_name || 'Unknown Account',
      'Jenis Transaksi': getTypeLabel(item),
      'Deskripsi': item.description,
      'Referensi': item.reference_name || item.reference_id || item.reference_number || '-',
      'Kas Masuk': isIncomeType(item) ? item.amount : 0,
      'Kas Keluar': isExpenseType(item) ? item.amount : 0,
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
    const doc = new jsPDF('p', 'mm', 'a4'); // portrait orientation
    
    // Calculate totals for filtered data
    const totalIncome = filteredData
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
    
    const totalExpense = filteredData
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
    
    // Table with larger fonts and portrait layout
    autoTable(doc, {
      startY: currentY,
      head: [['Tanggal', 'Jenis', 'Deskripsi', 'Kas Masuk', 'Kas Keluar']],
      body: (filteredData || []).map(item => [
        item.created_at ? format(new Date(item.created_at), "d MMM yyyy", { locale: id }) : 'N/A',
        getTypeLabel(item),
        item.description?.length > 25 ? item.description.substring(0, 25) + '...' : item.description || '',
        isIncomeType(item) ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(item.amount) : '-',
        isExpenseType(item) ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(item.amount) : '-'
      ]),
      styles: { 
        fontSize: 10,
        cellPadding: 3
      },
      headStyles: { 
        fillColor: [71, 85, 105],
        fontSize: 11,
        fontStyle: 'bold'
      },
      columnStyles: {
        0: { cellWidth: 25 }, // Tanggal
        1: { cellWidth: 35 }, // Jenis
        2: { cellWidth: 50 }, // Deskripsi
        3: { cellWidth: 35, halign: 'right' }, // Kas Masuk
        4: { cellWidth: 35, halign: 'right' }  // Kas Keluar
      }
    });
    
    // Add total row at the end - aligned with table columns
    const finalY = (doc as any).lastAutoTable.finalY + 5;
    
    // Draw a line separator
    doc.setLineWidth(0.5);
    doc.line(20, finalY, 190, finalY);
    
    const totalRowY = finalY + 8;
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL:', 20, totalRowY);
    
    // Position total amounts to align with table columns
    // Column positions: 20 (start) + 25 (tanggal) + 35 (jenis) + 50 (deskripsi) = 130 for kas masuk column
    // 130 + 35 (kas masuk width) = 165 for kas keluar column
    doc.setTextColor(0, 128, 0); // Green for income
    doc.text(new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(totalIncome), 155, totalRowY, { align: 'right' });
    
    doc.setTextColor(255, 0, 0); // Red for expense  
    doc.text(new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(totalExpense), 190, totalRowY, { align: 'right' });
    
    doc.setTextColor(0, 0, 0); // Reset to black
    
    // Add generation timestamp
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Dicetak pada: ${format(new Date(), 'dd MMM yyyy HH:mm')}`, 105, 285, { align: 'center' });
    
    // Add date range to filename if filtered
    const filename = dateRange.from && dateRange.to 
      ? `arus-kas-${format(dateRange.from, 'yyyy-MM-dd')}-${format(dateRange.to, 'yyyy-MM-dd')}.pdf`
      : "arus-kas.pdf";
    
    doc.save(filename);
  };


  return (
    <div className="w-full space-y-4">
      <TransferAccountDialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen} />
      
      <Tabs defaultValue="cashflow" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="cashflow">Cash Flow View</TabsTrigger>
          <TabsTrigger value="journal" className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Journal View
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="cashflow" className="space-y-4 mt-4">
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
                  Menampilkan {filteredData.length} dari {data?.length || 0} transaksi
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
                  <>
                    {table.getRowModel().rows.map((row) => {
                      console.log('Rendering row:', row.id, row.original);
                      return (
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
                      );
                    })}
                  </>
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
          <div className="flex items-center justify-end space-x-2">
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
          </div>
        </TabsContent>
        
        <TabsContent value="journal" className="space-y-4 mt-4">
          <JournalViewTable 
            cashHistory={data || []}
            accounts={accounts || []}
            isLoading={isLoading}
            dateRange={dateRange}
          />
        </TabsContent>
      </Tabs>

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