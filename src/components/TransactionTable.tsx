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
import { MoreHorizontal, PlusCircle, FileDown, Trash2, Search, X, Edit } from "lucide-react"
import * as XLSX from "xlsx"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { useNavigate } from "react-router-dom"

import { Badge, badgeVariants } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Link } from "react-router-dom"
import { Transaction, TransactionStatus } from "@/types/transaction"
import { format } from "date-fns"
import { id } from "date-fns/locale/id"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { useToast } from "./ui/use-toast"
import { cn } from "@/lib/utils"
import { useTransactions } from "@/hooks/useTransactions"
import { Skeleton } from "./ui/skeleton"
import { useAuth } from "@/hooks/useAuth"
import { UserRole } from "@/types/user"
import { EditTransactionDialog } from "./EditTransactionDialog"
import { isOwner } from '@/utils/roleUtils'

const statusOptions: TransactionStatus[] = [
  'Pesanan Masuk',
  'Siap Antar',
  'Diantar Sebagian',
  'Selesai',
  'Dibatalkan'
];

const getStatusVariant = (status: TransactionStatus) => {
  switch (status) {
    case 'Pesanan Masuk': return 'secondary';
    case 'Siap Antar': return 'default';
    case 'Diantar Sebagian': return 'secondary';
    case 'Selesai': return 'success';
    case 'Dibatalkan': return 'destructive';
    default: return 'outline';
  }
}

const getAvailableStatusOptions = (currentStatus: TransactionStatus, userRole: UserRole): TransactionStatus[] => {
  // Simplified workflow
  switch (currentStatus) {
    case 'Pesanan Masuk':
      return ['Pesanan Masuk', 'Siap Antar', 'Dibatalkan'];
      
    case 'Siap Antar':
      return ['Siap Antar']; // Auto-updated by delivery system
      
    case 'Diantar Sebagian':
      return ['Diantar Sebagian']; // Auto-updated by delivery system
    
    case 'Selesai':
      return ['Selesai']; // Cannot change from completed
    
    case 'Dibatalkan':
      return ['Dibatalkan']; // Cannot change from canceled
    
    default:
      return [currentStatus];
  }
};

export function TransactionTable() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // Filter state
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [paymentStatusFilter, setPaymentStatusFilter] = React.useState('all');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  
  // Create filters object for useTransactions
  const filters = React.useMemo(() => ({
    status: statusFilter !== 'all' ? statusFilter : undefined,
    payment_status: paymentStatusFilter !== 'all' ? paymentStatusFilter : undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  }), [statusFilter, paymentStatusFilter, dateFrom, dateTo]);
  
  const { transactions, isLoading, updateTransactionStatus, deductMaterials, deleteTransaction } = useTransactions(filters);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [selectedTransaction, setSelectedTransaction] = React.useState<Transaction | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = React.useState(false);
  const [transactionToEdit, setTransactionToEdit] = React.useState<Transaction | null>(null);
  
  // State preservation for better UX when updating status
  const [savedScrollPosition, setSavedScrollPosition] = React.useState(0);
  const [savedTableState, setSavedTableState] = React.useState<{
    pagination: any;
    columnFilters: any;
    sorting: any;
  } | null>(null);

  const handleStatusChange = (transactionId: string, newStatus: TransactionStatus) => {
    // Save current state before making changes
    setSavedScrollPosition(window.pageYOffset);
    setSavedTableState({
      pagination: table.getState().pagination,
      columnFilters: table.getState().columnFilters,
      sorting: table.getState().sorting,
    });

    // Simplified cancellation logic - no special warnings needed
    // since we removed production status

    // Proceed with normal status update
    updateTransactionStatus.mutate({ transactionId, status: newStatus }, {
      onSuccess: () => {
        toast({
          title: "Status Diperbarui",
          description: `Status untuk pesanan ${transactionId} diubah menjadi "${newStatus}".`,
        });
        
        // Restore table state after successful update
        setTimeout(() => {
          if (savedTableState) {
            table.setPageIndex(savedTableState.pagination.pageIndex);
            table.setColumnFilters(savedTableState.columnFilters);
            table.setSorting(savedTableState.sorting);
          }
          window.scrollTo(0, savedScrollPosition);
        }, 100);
        
        // Material deduction logic removed since 'Proses Produksi' status is removed
      },
      onError: (error) => {
        toast({ variant: "destructive", title: "Gagal", description: error.message });
      }
    });
  };

  // confirmCancelProduction function removed - no longer needed

  const handleDeleteClick = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setIsDeleteDialogOpen(true);
  };

  const handleEditClick = (transaction: Transaction) => {
    setTransactionToEdit(transaction);
    setIsEditDialogOpen(true);
  };

  const confirmDelete = () => {
    if (selectedTransaction) {
      deleteTransaction.mutate(selectedTransaction.id, {
        onSuccess: () => {
          toast({ title: "Transaksi Dihapus", description: `Transaksi ${selectedTransaction.id} berhasil dihapus.` });
          setIsDeleteDialogOpen(false);
        },
        onError: (error) => {
          toast({ variant: "destructive", title: "Gagal Hapus", description: error.message });
        }
      });
    }
  };

  const columns: ColumnDef<Transaction>[] = [
    {
      accessorKey: "id",
      header: "No. Order",
      cell: ({ row }) => <Badge variant="outline">{row.getValue("id")}</Badge>,
    },
    {
      accessorKey: "customerName",
      header: "Pelanggan",
    },
    {
      accessorKey: "orderDate",
      header: "Tgl Order",
      cell: ({ row }) => {
        const dateValue = row.getValue("orderDate");
        if (!dateValue) return "N/A";
        const date = new Date(dateValue as string | number | Date);
        return format(date, "d MMM yyyy, HH:mm", { locale: id });
      },
    },
    {
      accessorKey: "cashierName",
      header: "Kasir",
    },
    {
      id: "products",
      header: "Produk",
      cell: ({ row }) => {
        const transaction = row.original;
        const productNames = transaction.items.map(item => item.product.name).join(", ");
        return (
          <div className="max-w-[200px] truncate" title={productNames}>
            {productNames}
          </div>
        );
      },
      filterFn: (row, id, value) => {
        const transaction = row.original;
        const productNames = transaction.items.map(item => item.product.name.toLowerCase()).join(" ");
        return productNames.includes(value.toLowerCase());
      },
    },
    {
      id: "ppnStatus",
      header: "Status PPN",
      cell: ({ row }) => {
        const transaction = row.original;
        if (!transaction.ppnEnabled) {
          return <Badge variant="secondary">Non PPN</Badge>;
        }
        const mode = transaction.ppnMode || 'exclude';
        return (
          <Badge variant="default">
            PPN {mode === 'include' ? 'Include' : 'Exclude'}
          </Badge>
        );
      },
      filterFn: (row, id, value) => {
        const transaction = row.original;
        if (value === "ppn") {
          return transaction.ppnEnabled === true;
        } else if (value === "non-ppn") {
          return transaction.ppnEnabled === false;
        }
        return true; // show all for 'all' or empty value
      },
    },
    {
      accessorKey: "total",
      header: () => <div className="text-right">Total</div>,
      cell: ({ row }) => {
        const amount = parseFloat(row.getValue("total"))
        const formatted = new Intl.NumberFormat("id-ID", {
          style: "currency",
          currency: "IDR",
          minimumFractionDigits: 0,
        }).format(amount)
        return <div className="text-right font-medium">{formatted}</div>
      },
    },
    {
      id: "paymentStatus",
      header: "Status Pembayaran",
      cell: ({ row }) => {
        const transaction = row.original;
        const total = transaction.total;
        const paidAmount = transaction.paidAmount || 0;
        
        let statusText = "";
        let variant: "default" | "secondary" | "destructive" | "outline" | "success" = "default";
        
        if (paidAmount === 0) {
          statusText = "Belum Lunas";
          variant = "destructive";
        } else if (paidAmount >= total) {
          statusText = "Lunas";
          variant = "success";
        } else {
          statusText = "Sebagian";
          variant = "secondary";
        }
        
        return (
          <div className="space-y-1">
            <Badge variant={variant}>{statusText}</Badge>
            <div className="text-xs text-muted-foreground">
              Dibayar: {new Intl.NumberFormat("id-ID", {
                style: "currency",
                currency: "IDR",
                minimumFractionDigits: 0,
              }).format(paidAmount)}
            </div>
            {paidAmount < total && (
              <div className="text-xs text-destructive">
                Sisa: {new Intl.NumberFormat("id-ID", {
                  style: "currency",
                  currency: "IDR",
                  minimumFractionDigits: 0,
                }).format(total - paidAmount)}
              </div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const transaction = row.original;
        const availableOptions = user ? getAvailableStatusOptions(transaction.status, user.role) : [transaction.status];
        
        return (
          <Select
            value={transaction.status}
            onValueChange={(value: TransactionStatus) => handleStatusChange(transaction.id, value)}
            disabled={availableOptions.length <= 1 || updateTransactionStatus.isPending}
          >
            <SelectTrigger className={cn("w-[180px] border-0 focus:ring-0 focus:ring-offset-0", badgeVariants({ variant: getStatusVariant(transaction.status) }))}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableOptions.map(status => (
                <SelectItem key={status} value={status}>{status}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const transaction = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button aria-haspopup="true" size="icon" variant="ghost" onClick={(e) => e.stopPropagation()}>
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuLabel>Aksi</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => navigate(`/transactions/${transaction.id}`)}>Lihat Detail</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleEditClick(transaction)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit Transaksi
              </DropdownMenuItem>
              {isOwner(user) && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-red-500 focus:text-red-500"
                    onClick={() => handleDeleteClick(transaction)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Hapus Transaksi
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

  const table = useReactTable({
    data: transactions || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const handleExportExcel = () => {
    // Get filtered data from table
    const filteredRows = table.getFilteredRowModel().rows;
    const filteredTransactions = filteredRows.map(row => row.original);
    
    // Calculate summations
    const totalSum = filteredTransactions.reduce((sum, t) => sum + t.total, 0);
    const paidSum = filteredTransactions.reduce((sum, t) => sum + (t.paidAmount || 0), 0);
    const remainingSum = filteredTransactions.reduce((sum, t) => sum + (t.total - (t.paidAmount || 0)), 0);
    
    const exportData = filteredTransactions.map(t => ({
      'No Order': t.id,
      'Pelanggan': t.customerName,
      'Tgl Order': t.orderDate ? format(new Date(t.orderDate), "d MMM yyyy, HH:mm", { locale: id }) : 'N/A',
      'Kasir': t.cashierName,
      'Produk': t.items.map(item => item.product.name).join(", "),
      'Total': t.total,
      'Dibayar': t.paidAmount || 0,
      'Sisa': t.total - (t.paidAmount || 0),
      'Status Pembayaran': (t.paidAmount || 0) === 0 ? 'Belum Lunas' : 
                          (t.paidAmount || 0) >= t.total ? 'Lunas' : 'Sebagian',
      'Status Order': t.status,
      'Status PPN': t.ppnEnabled ? (t.ppnMode === 'include' ? 'PPN Include' : 'PPN Exclude') : 'Non PPN'
    }));
    
    // Add summary row
    exportData.push({
      'No Order': '',
      'Pelanggan': '',
      'Tgl Order': '',
      'Kasir': '',
      'Produk': `TOTAL (${filteredTransactions.length} transaksi)`,
      'Total': totalSum,
      'Dibayar': paidSum,
      'Sisa': remainingSum,
      'Status Pembayaran': '',
      'Status Order': '',
      'Status PPN': ''
    });
    
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Transaksi");
    XLSX.writeFile(workbook, `data-transaksi-${filteredTransactions.length}-records.xlsx`);
  };

  const handleExportPdf = () => {
    // Get filtered data from table
    const filteredRows = table.getFilteredRowModel().rows;
    const filteredTransactions = filteredRows.map(row => row.original);
    
    // Calculate summations
    const totalSum = filteredTransactions.reduce((sum, t) => sum + t.total, 0);
    const paidSum = filteredTransactions.reduce((sum, t) => sum + (t.paidAmount || 0), 0);
    const remainingSum = filteredTransactions.reduce((sum, t) => sum + (t.total - (t.paidAmount || 0)), 0);
    
    const doc = new jsPDF();
    
    // Add title and filter info
    doc.setFontSize(16);
    doc.text('Data Transaksi', 14, 15);
    doc.setFontSize(10);
    doc.text(`Total Records: ${filteredTransactions.length}`, 14, 25);
    doc.text(`Export Date: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 30);
    
    // Data table
    autoTable(doc, {
      head: [['No. Order', 'Pelanggan', 'Tgl Order', 'Total', 'Dibayar', 'Sisa', 'Status Bayar', 'Status PPN']],
      body: [
        ...filteredTransactions.map(t => [
          t.id,
          t.customerName,
          t.orderDate ? format(new Date(t.orderDate), "dd/MM/yy", { locale: id }) : 'N/A',
          new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(t.total),
          new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(t.paidAmount || 0),
          new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(t.total - (t.paidAmount || 0)),
          (t.paidAmount || 0) === 0 ? 'Belum Lunas' : 
          (t.paidAmount || 0) >= t.total ? 'Lunas' : 'Sebagian',
          t.ppnEnabled ? (t.ppnMode === 'include' ? 'PPN Inc' : 'PPN Exc') : 'Non PPN'
        ]),
        // Summary row
        [
          '',
          '',
          `TOTAL (${filteredTransactions.length})`,
          new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(totalSum),
          new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(paidSum),
          new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(remainingSum),
          '',
          ''
        ]
      ],
      startY: 35,
      styles: {
        fontSize: 8,
        cellPadding: 1.5
      },
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: 255,
        fontSize: 8,
        fontStyle: 'bold'
      },
      didParseCell: function (data: any) {
        // Highlight summary row
        if (data.row.index === filteredTransactions.length) {
          data.cell.styles.fillColor = [52, 152, 219];
          data.cell.styles.textColor = 255;
          data.cell.styles.fontStyle = 'bold';
        }
      }
    });
    
    doc.save(`data-transaksi-${filteredTransactions.length}-records.pdf`);
  };

  return (
    <div className="w-full">
      {/* Filter Controls */}
      <div className="flex flex-col gap-4 p-4 border rounded-lg mb-4 bg-background">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Filter Transaksi</h3>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => {
              setStatusFilter('all');
              setPaymentStatusFilter('all');
              setDateFrom('');
              setDateTo('');
            }}
          >
            <X className="h-4 w-4 mr-2" />
            Reset Filter
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Status Transaksi</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                {statusOptions.map(status => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Status Pembayaran</label>
            <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih Status Pembayaran" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="Lunas">Lunas</SelectItem>
                <SelectItem value="Belum Lunas">Belum Lunas</SelectItem>
                <SelectItem value="Kredit">Kredit</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Dari Tanggal</label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className=""
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Sampai Tanggal</label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className=""
            />
          </div>
        </div>
        {(statusFilter !== 'all' || paymentStatusFilter !== 'all' || dateFrom || dateTo) && (
          <div className="text-sm text-muted-foreground">
            Menampilkan {transactions?.length || 0} transaksi yang difilter
          </div>
        )}
      </div>
      
      <div className="flex items-center justify-between py-4">
        <div className="flex gap-4 items-center">
          <div className="max-w-sm">
            <Select
              value={(table.getColumn("ppnStatus")?.getFilterValue() as string) ?? "all"}
              onValueChange={(value) => {
                table.getColumn("ppnStatus")?.setFilterValue(value === "all" ? "" : value)
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Filter PPN" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua</SelectItem>
                <SelectItem value="ppn">PPN</SelectItem>
                <SelectItem value="non-ppn">Non PPN</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
          <Button variant="outline" onClick={handleExportExcel}><FileDown className="mr-2 h-4 w-4" /> Ekspor Excel</Button>
          <Button variant="outline" onClick={handleExportPdf}><FileDown className="mr-2 h-4 w-4" /> Ekspor PDF</Button>
          <Button asChild><Link to="/pos"><PlusCircle className="mr-2 h-4 w-4" /> Tambah Transaksi</Link></Button>
        </div>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>{headerGroup.headers.map((header) => (<TableHead key={header.id}>{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</TableHead>))}</TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (<TableRow key={i}><TableCell colSpan={columns.length}><Skeleton className="h-8 w-full" /></TableCell></TableRow>))
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={() => navigate(`/transactions/${row.original.id}`)}
                  className="cursor-pointer hover:bg-muted"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow><TableCell colSpan={columns.length} className="h-24 text-center">No results.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end space-x-2 py-4">
        <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>Previous</Button>
        <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Next</Button>
      </div>
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apakah Anda yakin?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini tidak dapat dibatalkan. Ini akan menghapus data transaksi dengan nomor order <strong>{selectedTransaction?.id}</strong> secara permanen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className={cn(badgeVariants({ variant: "destructive" }))}
              onClick={confirmDelete}
              disabled={deleteTransaction.isPending}
            >
              {deleteTransaction.isPending ? "Menghapus..." : "Ya, Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Production cancellation warning dialog removed - no longer needed */}

      {transactionToEdit && (
        <EditTransactionDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          transaction={transactionToEdit}
        />
      )}
    </div>
  )
}