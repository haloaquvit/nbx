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
import { MoreHorizontal, PlusCircle, FileDown, Trash2, Search, X, Edit, Eye, FileText } from "lucide-react"
import * as XLSX from "xlsx"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { useNavigate } from "react-router-dom"

import { Badge, badgeVariants } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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


export function TransactionTable() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // Filter state
  const [paymentStatusFilter, setPaymentStatusFilter] = React.useState('all');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  
  // Create filters object for useTransactions
  const filters = React.useMemo(() => ({
    payment_status: paymentStatusFilter !== 'all' ? paymentStatusFilter : undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  }), [paymentStatusFilter, dateFrom, dateTo]);
  
  const { transactions, isLoading, deleteTransaction } = useTransactions(filters);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [selectedTransaction, setSelectedTransaction] = React.useState<Transaction | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = React.useState(false);
  const [transactionToEdit, setTransactionToEdit] = React.useState<Transaction | null>(null);
  


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

  const generateDeliveryNote = (transaction: Transaction) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    
    // Header
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('SURAT JALAN', 105, 20, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('AQUVIT', 105, 30, { align: 'center' });
    
    // Line separator
    doc.setLineWidth(0.5);
    doc.line(20, 35, 190, 35);
    
    // Transaction info
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Informasi Pesanan:', 20, 50);
    
    doc.setFont('helvetica', 'normal');
    doc.text(`No. Order: ${transaction.id}`, 20, 58);
    doc.text(`Pelanggan: ${transaction.customerName}`, 20, 66);
    doc.text(`Tanggal: ${format(new Date(transaction.orderDate), 'dd MMMM yyyy', { locale: id })}`, 20, 74);
    doc.text(`Kasir: ${transaction.cashierName}`, 20, 82);
    
    // Calculate delivery summary for each item
    const getDeliveryInfo = (productId: string) => {
      // If transaction has deliveries, calculate delivered amount
      if (transaction.deliveries && transaction.deliveries.length > 0) {
        let totalDelivered = 0;
        transaction.deliveries.forEach(delivery => {
          const deliveredItem = delivery.items?.find(item => item.productId === productId);
          if (deliveredItem) {
            totalDelivered += deliveredItem.quantityDelivered || 0;
          }
        });
        return totalDelivered;
      }
      return 0;
    };
    
    // Items table with delivery info
    const tableData = transaction.items.map((item, index) => {
      const deliveredQty = getDeliveryInfo(item.product.id);
      const remainingQty = item.quantity - deliveredQty;
      
      return [
        (index + 1).toString(),
        item.product.name,
        `${item.quantity} ${item.unit}`,
        `${deliveredQty} ${item.unit}`,
        `${remainingQty} ${item.unit}`,
        '___________'
      ];
    });
    
    autoTable(doc, {
      startY: 95,
      head: [['No', 'Produk', 'Pesan', 'Dikirim', 'Sisa', 'Diterima']],
      body: tableData,
      theme: 'grid',
      headStyles: { 
        fillColor: [71, 85, 105], 
        textColor: [255, 255, 255],
        fontSize: 12,
        fontStyle: 'bold'
      },
      bodyStyles: {
        fontSize: 11
      },
      columnStyles: {
        0: { cellWidth: 15, halign: 'center' },
        1: { cellWidth: 70 },
        2: { cellWidth: 25, halign: 'center' },
        3: { cellWidth: 25, halign: 'center' },
        4: { cellWidth: 25, halign: 'center' },
        5: { cellWidth: 30, halign: 'center' }
      }
    });
    
    // Notes section (show transaction notes if exists)
    let currentY = (doc as any).lastAutoTable.finalY + 15;
    
    if (transaction.notes && transaction.notes.trim()) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Catatan:', 20, currentY);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const notesLines = doc.splitTextToSize(transaction.notes, 150);
      doc.text(notesLines, 20, currentY + 8);
      
      currentY += 8 + (notesLines.length * 5) + 10;
    }
    
    // Individual item notes (if any item has notes)
    const itemsWithNotes = transaction.items.filter(item => item.notes && item.notes.trim());
    if (itemsWithNotes.length > 0) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Keterangan Item:', 20, currentY);
      currentY += 8;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      itemsWithNotes.forEach((item, index) => {
        const text = `${index + 1}. ${item.product.name}: ${item.notes}`;
        const textLines = doc.splitTextToSize(text, 150);
        doc.text(textLines, 25, currentY);
        currentY += textLines.length * 5 + 2;
      });
      currentY += 10;
    }
    
    // Signature section
    const finalY = currentY;
    
    doc.setFontSize(10);
    doc.text('Yang Mengirim:', 30, finalY);
    doc.text('Yang Menerima:', 130, finalY);
    
    // Signature boxes (smaller)
    doc.rect(30, finalY + 5, 45, 18);
    doc.rect(125, finalY + 5, 45, 18);
    
    doc.setFontSize(8);
    doc.text('Nama:', 32, finalY + 28);
    doc.text('Tanggal:', 32, finalY + 34);
    doc.text('TTD:', 32, finalY + 40);
    
    doc.text('Nama:', 127, finalY + 28);
    doc.text('Tanggal:', 127, finalY + 34);
    doc.text('TTD:', 127, finalY + 40);
    
    // Footer
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(`Dicetak pada: ${format(new Date(), 'dd MMMM yyyy HH:mm')}`, 105, 280, { align: 'center' });
    
    // Save PDF
    doc.save(`surat-jalan-${transaction.id}.pdf`);
    
    toast({
      title: "Surat Jalan Dicetak",
      description: `Surat jalan untuk order ${transaction.id} berhasil dibuat`
    });
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
      cell: ({ row }) => (
        <div className="max-w-[150px] truncate font-medium" title={row.getValue("customerName")}>
          {row.getValue("customerName")}
        </div>
      ),
    },
    {
      accessorKey: "orderDate",
      header: "Tgl Order",
      cell: ({ row }) => {
        const dateValue = row.getValue("orderDate");
        if (!dateValue) return "N/A";
        const date = new Date(dateValue as string | number | Date);
        return (
          <div className="min-w-[100px]">
            <div className="font-medium">{format(date, "d MMM yyyy", { locale: id })}</div>
            <div className="text-xs text-muted-foreground">
              {format(date, "HH:mm")}
            </div>
          </div>
        );
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
      id: "actions",
      header: "Aksi",
      cell: ({ row }) => {
        const transaction = row.original;
        return (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate(`/transactions/${transaction.id}`)}
              title="Lihat Detail"
              className="hover-glow"
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleEditClick(transaction)}
              title="Edit Transaksi"
              className="hover-glow"
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => generateDeliveryNote(transaction)}
              title="Cetak Surat Jalan"
              className="hover-glow"
            >
              <FileText className="h-4 w-4" />
            </Button>
            {isOwner(user) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDeleteClick(transaction)}
                title="Hapus Transaksi"
                className="text-red-500 hover:text-red-700 hover-glow"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
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
    <div className="w-full max-w-none">
      {/* Filter Controls */}
      <div className="flex flex-col gap-4 p-4 border rounded-lg mb-4 bg-background">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Filter Transaksi</h3>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => {
              setPaymentStatusFilter('all');
              setDateFrom('');
              setDateTo('');
            }}
          >
            <X className="h-4 w-4 mr-2" />
            Reset Filter
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
              className="input-glow"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Sampai Tanggal</label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="input-glow"
            />
          </div>
        </div>
        {(paymentStatusFilter !== 'all' || dateFrom || dateTo) && (
          <div className="text-sm text-muted-foreground">
            Menampilkan {transactions?.length || 0} transaksi yang difilter
          </div>
        )}
      </div>
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <div className="w-full sm:max-w-sm">
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
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <Button variant="outline" onClick={handleExportExcel} className="text-xs sm:text-sm hover-glow">
            <FileDown className="mr-2 h-3 w-3 sm:h-4 sm:w-4" /> 
            <span className="hidden sm:inline">Ekspor </span>Excel
          </Button>
          <Button variant="outline" onClick={handleExportPdf} className="text-xs sm:text-sm hover-glow">
            <FileDown className="mr-2 h-3 w-3 sm:h-4 sm:w-4" /> 
            <span className="hidden sm:inline">Ekspor </span>PDF
          </Button>
          <Button asChild>
            <Link to="/pos" className="text-xs sm:text-sm">
              <PlusCircle className="mr-2 h-3 w-3 sm:h-4 sm:w-4" /> 
              <span className="hidden sm:inline">Tambah </span>Transaksi
            </Link>
          </Button>
        </div>
      </div>
      <div className="rounded-md border overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="min-w-[800px]">
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
                  className="cursor-pointer table-row-hover"
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
      </div>
      <div className="flex items-center justify-end space-x-2 py-4">
        <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} className="hover-glow">Previous</Button>
        <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} className="hover-glow">Next</Button>
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