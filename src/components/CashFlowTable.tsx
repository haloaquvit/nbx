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
import { FileDown, Search, X } from "lucide-react"
import * as XLSX from "xlsx"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CashHistory } from "@/types/cashFlow"
import { format } from "date-fns"
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
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [selectedRecord, setSelectedRecord] = React.useState<CashHistory | null>(null);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = React.useState(false);

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
            <div className="text-right font-medium text-green-600">
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
    data: data || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const handleExportExcel = () => {
    const exportData = (data || []).map(item => ({
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
    XLSX.writeFile(workbook, "arus-kas.xlsx");
  };

  const handleExportPdf = () => {
    const doc = new jsPDF('l', 'mm', 'a4'); // landscape orientation for more columns
    autoTable(doc, {
      head: [['Tanggal', 'Akun', 'Jenis', 'Deskripsi', 'Kas Masuk', 'Kas Keluar', 'User']],
      body: (data || []).map(item => [
        item.created_at ? format(new Date(item.created_at), "d MMM yyyy, HH:mm", { locale: id }) : 'N/A',
        item.account_name || 'Unknown Account',
        getTypeLabel(item),
        item.description,
        isIncomeType(item) ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(item.amount) : '-',
        isExpenseType(item) ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(item.amount) : '-',
        item.user_name || item.created_by_name || 'Unknown'
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [71, 85, 105] },
    });
    doc.save('arus-kas.pdf');
  };

  // Calculate summary (exclude ONLY internal transfers, include other transfers)
  const summary = React.useMemo(() => {
    if (!data) return { totalIncome: 0, totalExpense: 0, netFlow: 0 };
    
    const totalIncome = data
      .filter(item => {
        if (isIncomeType(item)) {
          // Exclude only internal transfers (transfer antar kas)
          if (item.source_type === 'transfer_masuk' || item.source_type === 'transfer_keluar') {
            return false;
          }
          return true;
        }
        return false;
      })
      .reduce((sum, item) => sum + item.amount, 0);
    
    const totalExpense = data
      .filter(item => {
        if (isExpenseType(item)) {
          // Exclude only internal transfers (transfer antar kas)
          if (item.source_type === 'transfer_masuk' || item.source_type === 'transfer_keluar') {
            return false;
          }
          return true;
        }
        return false;
      })
      .reduce((sum, item) => sum + item.amount, 0);
    
    return {
      totalIncome,
      totalExpense,
      netFlow: totalIncome - totalExpense
    };
  }, [data]);

  return (
    <div className="w-full space-y-4">
      <TransferAccountDialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen} />
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="text-sm font-medium text-green-700">Total Kas Masuk</div>
          <div className="text-2xl font-bold text-green-600">
            {new Intl.NumberFormat("id-ID", {
              style: "currency",
              currency: "IDR",
              minimumFractionDigits: 0,
            }).format(summary.totalIncome)}
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-sm font-medium text-red-700">Total Kas Keluar</div>
          <div className="text-2xl font-bold text-red-600">
            {new Intl.NumberFormat("id-ID", {
              style: "currency",
              currency: "IDR",
              minimumFractionDigits: 0,
            }).format(summary.totalExpense)}
          </div>
        </div>
        <div className={`border rounded-lg p-4 ${summary.netFlow >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
          <div className={`text-sm font-medium ${summary.netFlow >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
            Arus Kas Bersih
          </div>
          <div className={`text-2xl font-bold ${summary.netFlow >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
            {new Intl.NumberFormat("id-ID", {
              style: "currency",
              currency: "IDR",
              minimumFractionDigits: 0,
            }).format(summary.netFlow)}
          </div>
        </div>
      </div>

      {/* Filters and Actions */}
      <div className="flex items-center justify-between">
        <div className="flex gap-4 items-center">
          {(table.getState().columnFilters.length > 0) && (
            <div className="flex items-center gap-2">
              <div className="text-sm text-muted-foreground">
                Menampilkan {table.getFilteredRowModel().rows.length} dari {table.getCoreRowModel().rows.length} transaksi
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => table.resetColumnFilters()}
                className="h-8 px-2"
              >
                <X className="h-4 w-4" />
                Clear
              </Button>
            </div>
          )}
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
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
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
              table.getRowModel().rows.map((row) => {
                console.log('Rendering row:', row.id, row.original);
                return (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
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