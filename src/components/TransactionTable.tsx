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
import { MoreHorizontal, PlusCircle, FileDown, Trash2, Search, X, Edit, Eye, FileText, Calendar, Truck, Filter, ChevronDown, ChevronUp } from "lucide-react"
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
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
import { format, isWithinInterval, startOfDay, endOfDay } from "date-fns"
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

  // Check if mobile view
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768);

  React.useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Filter states
  const [showFilters, setShowFilters] = React.useState(false);
  const [dateRange, setDateRange] = React.useState<{ from: Date | undefined; to: Date | undefined }>({ from: undefined, to: undefined });
  const [ppnFilter, setPpnFilter] = React.useState<'all' | 'ppn' | 'non-ppn'>('all');
  const [deliveryFilter, setDeliveryFilter] = React.useState<'all' | 'pending-delivery'>('all');
  const [paymentFilter, setPaymentFilter] = React.useState<'all' | 'lunas' | 'belum-lunas' | 'jatuh-tempo' | 'piutang'>('all');
  const [retasiFilter, setRetasiFilter] = React.useState<string>('all'); // 'all' or retasi_number
  const [filteredTransactions, setFilteredTransactions] = React.useState<Transaction[]>([]);
  
  const { transactions, isLoading, deleteTransaction } = useTransactions();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [selectedTransaction, setSelectedTransaction] = React.useState<Transaction | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = React.useState(false);
  const [transactionToEdit, setTransactionToEdit] = React.useState<Transaction | null>(null);

  // Helper function to check if payment is overdue
  const isPaymentOverdue = (transaction: Transaction): boolean => {
    if (!transaction.dueDate || transaction.paymentStatus === 'Lunas') return false;
    return new Date() > new Date(transaction.dueDate);
  };

  // Helper function to categorize payment status
  const getPaymentCategory = (transaction: Transaction): string => {
    const paidAmount = transaction.paidAmount || 0;
    const total = transaction.total;
    
    if (paidAmount >= total) return 'lunas';
    if (paidAmount === 0) {
      if (transaction.paymentStatus === 'Kredit' && isPaymentOverdue(transaction)) {
        return 'jatuh-tempo';
      }
      return 'belum-lunas';
    }
    // Partial payment
    if (transaction.paymentStatus === 'Kredit' && isPaymentOverdue(transaction)) {
      return 'jatuh-tempo';
    }
    return 'piutang'; // Partial payment, still has remaining balance
  };

  // Filter logic
  React.useEffect(() => {
    if (!transactions) {
      setFilteredTransactions([]);
      return;
    }

    let filtered = [...transactions];

    // Filter by date range
    if (dateRange.from || dateRange.to) {
      filtered = filtered.filter(transaction => {
        if (!transaction.orderDate) return false;
        const transactionDate = new Date(transaction.orderDate);
        
        if (dateRange.from && dateRange.to) {
          return isWithinInterval(transactionDate, {
            start: startOfDay(dateRange.from),
            end: endOfDay(dateRange.to)
          });
        } else if (dateRange.from) {
          return transactionDate >= startOfDay(dateRange.from);
        } else if (dateRange.to) {
          return transactionDate <= endOfDay(dateRange.to);
        }
        
        return true;
      });
    }

    // Filter by PPN status
    if (ppnFilter !== 'all') {
      filtered = filtered.filter(transaction => {
        if (ppnFilter === 'ppn') {
          return transaction.ppnEnabled === true;
        } else if (ppnFilter === 'non-ppn') {
          return transaction.ppnEnabled === false;
        }
        return true;
      });
    }

    // Filter by delivery status
    if (deliveryFilter === 'pending-delivery') {
      filtered = filtered.filter(transaction => {
        return transaction.status === 'Pesanan Masuk' || transaction.status === 'Diantar Sebagian';
      });
    }

    // Filter by payment status
    if (paymentFilter !== 'all') {
      filtered = filtered.filter(transaction => {
        const category = getPaymentCategory(transaction);
        return category === paymentFilter;
      });
    }

    // Filter by retasi
    if (retasiFilter !== 'all') {
      filtered = filtered.filter(transaction => {
        return transaction.retasiNumber === retasiFilter;
      });
    }

    // Sort: ascending (oldest first) for mobile, descending (newest first) for desktop
    filtered.sort((a, b) => {
      const dateA = new Date(a.orderDate || 0).getTime();
      const dateB = new Date(b.orderDate || 0).getTime();
      return isMobile ? dateA - dateB : dateB - dateA; // Mobile: oldest first, Desktop: newest first
    });

    setFilteredTransactions(filtered);
  }, [transactions, dateRange, ppnFilter, deliveryFilter, paymentFilter, retasiFilter, isMobile]);

  const clearFilters = () => {
    setDateRange({ from: undefined, to: undefined });
    setPpnFilter('all');
    setDeliveryFilter('all');
    setPaymentFilter('all');
    setRetasiFilter('all');
  };

  // Get unique retasi numbers from transactions
  const uniqueRetasiNumbers = React.useMemo(() => {
    if (!transactions) return [];
    const retasiSet = new Set<string>();
    transactions.forEach(t => {
      if (t.retasiNumber) {
        retasiSet.add(t.retasiNumber);
      }
    });
    return Array.from(retasiSet).sort();
  }, [transactions]);
  


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
      cell: ({ row }) => (
        <div className="max-w-[150px] truncate font-medium" title={row.getValue("customerName")}>
          {row.getValue("customerName")}
        </div>
      ),
    },
    {
      accessorKey: "retasiNumber",
      header: "Retasi",
      cell: ({ row }) => {
        const retasiNumber = row.getValue("retasiNumber") as string | null;
        if (!retasiNumber) return <span className="text-xs text-muted-foreground">-</span>;
        return (
          <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
            <Truck className="h-3 w-3 mr-1" />
            {retasiNumber}
          </Badge>
        );
      },
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
        const category = getPaymentCategory(transaction);
        
        let statusText = "";
        let variant: "default" | "secondary" | "destructive" | "outline" | "success" = "default";
        
        switch (category) {
          case 'lunas':
            statusText = "Tunai";
            variant = "success";
            break;
          case 'belum-lunas':
            statusText = "Kredit";
            variant = "destructive";
            break;
          case 'piutang':
            statusText = "Kredit";
            variant = "secondary";
            break;
          case 'jatuh-tempo':
            statusText = "Jatuh Tempo";
            variant = "outline";
            break;
          default:
            statusText = "Unknown";
            variant = "default";
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
            {transaction.dueDate && category === 'jatuh-tempo' && (
              <div className="text-xs text-red-500 font-medium">
                Due: {format(new Date(transaction.dueDate), "dd MMM yyyy")}
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
              onClick={(e) => {
                e.stopPropagation()
                navigate(`/transactions/${transaction.id}`)
              }}
              className="bg-green-600 hover:bg-green-700 text-white text-xs px-2 py-1"
              title="Input Pengantaran"
            >
              <Truck className="h-3 w-3 sm:mr-1" />
              <span className="hidden sm:inline">Antar</span>
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
    data: filteredTransactions || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const handleExportExcel = () => {
    // Use filteredTransactions directly
    const exportTransactions = filteredTransactions;

    // Calculate summations
    const totalSum = exportTransactions.reduce((sum, t) => sum + t.total, 0);
    const paidSum = exportTransactions.reduce((sum, t) => sum + (t.paidAmount || 0), 0);
    const remainingSum = exportTransactions.reduce((sum, t) => sum + (t.total - (t.paidAmount || 0)), 0);
    const ppnSum = exportTransactions.reduce((sum, t) => sum + (t.ppnEnabled ? (t.ppnAmount || 0) : 0), 0);
    const subtotalSum = exportTransactions.reduce((sum, t) => sum + (t.ppnEnabled ? (t.subtotal || t.total - (t.ppnAmount || 0)) : t.total), 0);

    const exportData = exportTransactions.map(t => ({
      'No Order': t.id,
      'Pelanggan': t.customerName,
      'Tgl Order': t.orderDate ? format(new Date(t.orderDate), "d MMM yyyy, HH:mm", { locale: id }) : 'N/A',
      'Kasir': t.cashierName,
      'Produk': t.items.map(item => item.product.name).join(", "),
      'Subtotal (DPP)': t.ppnEnabled ? (t.subtotal || t.total - (t.ppnAmount || 0)) : t.total,
      'PPN': t.ppnEnabled ? (t.ppnAmount || 0) : 0,
      'Total': t.total,
      'Dibayar': t.paidAmount || 0,
      'Sisa': t.total - (t.paidAmount || 0),
      'Status Pembayaran': (t.paidAmount || 0) === 0 ? 'Kredit' :
                          (t.paidAmount || 0) >= t.total ? 'Tunai' : 'Kredit',
      'Status PPN': t.ppnEnabled ? (t.ppnMode === 'include' ? 'PPN Include' : 'PPN Exclude') : 'Non PPN'
    }));

    // Add summary row
    exportData.push({
      'No Order': '',
      'Pelanggan': '',
      'Tgl Order': '',
      'Kasir': '',
      'Produk': `TOTAL (${exportTransactions.length} transaksi)`,
      'Subtotal (DPP)': subtotalSum,
      'PPN': ppnSum,
      'Total': totalSum,
      'Dibayar': paidSum,
      'Sisa': remainingSum,
      'Status Pembayaran': '',
      'Status PPN': ''
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Transaksi");
    // Add filter info to filename
    let filename = `data-transaksi-${exportTransactions.length}-records`;
    if (dateRange.from && dateRange.to) {
      filename += `-${format(dateRange.from, 'yyyy-MM-dd')}-${format(dateRange.to, 'yyyy-MM-dd')}`;
    }
    if (ppnFilter !== 'all') {
      filename += `-${ppnFilter}`;
    }
    filename += '.xlsx';

    XLSX.writeFile(workbook, filename);
  };

  const handleExportPdf = () => {
    // Use filteredTransactions directly
    const exportTransactions = filteredTransactions;

    // Calculate summations
    const totalSum = exportTransactions.reduce((sum, t) => sum + t.total, 0);
    const paidSum = exportTransactions.reduce((sum, t) => sum + (t.paidAmount || 0), 0);
    const remainingSum = exportTransactions.reduce((sum, t) => sum + (t.total - (t.paidAmount || 0)), 0);
    const ppnSum = exportTransactions.reduce((sum, t) => sum + (t.ppnEnabled ? (t.ppnAmount || 0) : 0), 0);
    const subtotalSum = exportTransactions.reduce((sum, t) => sum + (t.ppnEnabled ? (t.subtotal || t.total - (t.ppnAmount || 0)) : t.total), 0);

    const doc = new jsPDF('landscape'); // Use landscape for more columns

    // Add title and filter info
    doc.setFontSize(16);
    doc.text('Data Transaksi', 14, 15);
    doc.setFontSize(10);
    doc.text(`Total Records: ${exportTransactions.length}`, 14, 25);
    if (dateRange.from && dateRange.to) {
      doc.text(`Filter Tanggal: ${format(dateRange.from, "d MMM yyyy", { locale: id })} - ${format(dateRange.to, "d MMM yyyy", { locale: id })}`, 14, 30);
      doc.text(`Export Date: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 35);
    } else {
      doc.text(`Export Date: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 30);
    }

    const formatCurrency = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(value);

    // Data table with PPN column
    autoTable(doc, {
      head: [['No. Order', 'Pelanggan', 'Tgl Order', 'DPP', 'PPN', 'Total', 'Dibayar', 'Sisa', 'Status', 'PPN']],
      body: [
        ...exportTransactions.map(t => {
          const subtotal = t.ppnEnabled ? (t.subtotal || t.total - (t.ppnAmount || 0)) : t.total;
          const ppn = t.ppnEnabled ? (t.ppnAmount || 0) : 0;
          return [
            t.id,
            t.customerName,
            t.orderDate ? format(new Date(t.orderDate), "dd/MM/yy", { locale: id }) : 'N/A',
            formatCurrency(subtotal),
            ppn > 0 ? formatCurrency(ppn) : '-',
            formatCurrency(t.total),
            formatCurrency(t.paidAmount || 0),
            formatCurrency(t.total - (t.paidAmount || 0)),
            (t.paidAmount || 0) === 0 ? 'Kredit' :
            (t.paidAmount || 0) >= t.total ? 'Tunai' : 'Kredit',
            t.ppnEnabled ? (t.ppnMode === 'include' ? 'Inc' : 'Exc') : '-'
          ];
        }),
        // Summary row
        [
          '',
          '',
          `TOTAL (${exportTransactions.length})`,
          formatCurrency(subtotalSum),
          formatCurrency(ppnSum),
          formatCurrency(totalSum),
          formatCurrency(paidSum),
          formatCurrency(remainingSum),
          '',
          ''
        ]
      ],
      startY: 35,
      styles: {
        fontSize: 7,
        cellPadding: 1.5
      },
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: 255,
        fontSize: 7,
        fontStyle: 'bold'
      },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 35 },
        2: { cellWidth: 20 },
        3: { cellWidth: 25, halign: 'right' },
        4: { cellWidth: 22, halign: 'right' },
        5: { cellWidth: 25, halign: 'right' },
        6: { cellWidth: 25, halign: 'right' },
        7: { cellWidth: 25, halign: 'right' },
        8: { cellWidth: 18, halign: 'center' },
        9: { cellWidth: 15, halign: 'center' }
      },
      didParseCell: function (data: any) {
        // Highlight summary row
        if (data.row.index === exportTransactions.length) {
          data.cell.styles.fillColor = [52, 152, 219];
          data.cell.styles.textColor = 255;
          data.cell.styles.fontStyle = 'bold';
        }
      }
    });
    
    // Add filter info to filename
    let filename = `data-transaksi-${exportTransactions.length}-records`;
    if (dateRange.from && dateRange.to) {
      filename += `-${format(dateRange.from, 'yyyy-MM-dd')}-${format(dateRange.to, 'yyyy-MM-dd')}`;
    }
    if (ppnFilter !== 'all') {
      filename += `-${ppnFilter}`;
    }
    filename += '.pdf';
    
    doc.save(filename);
  };


  // Calculate filtered summary
  const filteredSummary = React.useMemo(() => {
    const totalAmount = filteredTransactions.reduce((sum, t) => sum + t.total, 0);
    const paidAmount = filteredTransactions.reduce((sum, t) => sum + (t.paidAmount || 0), 0);
    const remainingAmount = totalAmount - paidAmount;
    
    return {
      count: filteredTransactions.length,
      totalAmount,
      paidAmount,
      remainingAmount
    };
  }, [filteredTransactions]);

  return (
    <div className="w-full max-w-none">
      {/* Filter Toggle Button */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowFilters(!showFilters)}
            className="gap-2"
          >
            <Filter className="h-4 w-4" />
            Filter Transaksi
            {showFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          {(dateRange.from || dateRange.to || ppnFilter !== 'all' || deliveryFilter !== 'all' || paymentFilter !== 'all' || retasiFilter !== 'all') && (
            <Badge variant="secondary" className="ml-2">
              Filter aktif
            </Badge>
          )}
        </div>
        {showFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4 mr-2" />
            Reset Filter
          </Button>
        )}
      </div>
      
      {/* Filter Controls */}
      {showFilters && (
        <div className="flex flex-col gap-4 p-4 border rounded-lg mb-4 bg-background">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Filter Transaksi</h3>
          </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Date Range Filter */}
          <div className="space-y-2 md:col-span-2 lg:col-span-1">
            <label className="text-sm font-medium">Rentang Tanggal</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
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
          </div>

          {/* Payment Status Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Status Pembayaran</label>
            <Select value={paymentFilter} onValueChange={(value: 'all' | 'lunas' | 'belum-lunas' | 'jatuh-tempo' | 'piutang') => setPaymentFilter(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih Status Pembayaran" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="lunas">Tunai</SelectItem>
                <SelectItem value="belum-lunas">Kredit</SelectItem>
                <SelectItem value="piutang">Kredit (Dibayar Sebagian)</SelectItem>
                <SelectItem value="jatuh-tempo">Jatuh Tempo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* PPN Status Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Status PPN</label>
            <Select value={ppnFilter} onValueChange={(value: 'all' | 'ppn' | 'non-ppn') => setPpnFilter(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih Status PPN" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="ppn">PPN</SelectItem>
                <SelectItem value="non-ppn">Non PPN</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Delivery Status Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Status Pengantaran</label>
            <Select value={deliveryFilter} onValueChange={(value: 'all' | 'pending-delivery') => setDeliveryFilter(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih Status Pengantaran" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="pending-delivery">Belum Selesai Pengantaran</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Retasi Filter */}
          {uniqueRetasiNumbers.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Retasi (Driver)</label>
              <Select value={retasiFilter} onValueChange={(value: string) => setRetasiFilter(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih Retasi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Retasi</SelectItem>
                  {uniqueRetasiNumbers.map(retasiNum => (
                    <SelectItem key={retasiNum} value={retasiNum}>
                      {retasiNum}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        </div>
      )}

      {/* Summary Cards - Hidden on mobile */}
      <div className="hidden md:grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-sm font-medium text-blue-700">Total Transaksi</div>
          <div className="text-2xl font-bold text-blue-600">{filteredSummary.count}</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="text-sm font-medium text-green-700">Total Nilai</div>
          <div className="text-2xl font-bold text-green-600">
            {new Intl.NumberFormat("id-ID", {
              style: "currency",
              currency: "IDR",
              minimumFractionDigits: 0,
            }).format(filteredSummary.totalAmount)}
          </div>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
          <div className="text-sm font-medium text-emerald-700">Dibayar</div>
          <div className="text-2xl font-bold text-emerald-600">
            {new Intl.NumberFormat("id-ID", {
              style: "currency",
              currency: "IDR",
              minimumFractionDigits: 0,
            }).format(filteredSummary.paidAmount)}
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-sm font-medium text-red-700">Sisa Tagihan</div>
          <div className="text-2xl font-bold text-red-600">
            {new Intl.NumberFormat("id-ID", {
              style: "currency",
              currency: "IDR",
              minimumFractionDigits: 0,
            }).format(filteredSummary.remainingAmount)}
          </div>
        </div>
      </div>
      
      {/* Info & Actions - Different for mobile/desktop */}
      {isMobile ? (
        <div className="text-sm text-muted-foreground py-2">
          {filteredTransactions.length} pesanan
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4">
          <div className="text-sm text-muted-foreground">
            Menampilkan {filteredTransactions.length} dari {transactions?.length || 0} transaksi
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
      )}
      {/* Mobile View - Simple Card List */}
      {isMobile ? (
        <div className="space-y-2">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-white border rounded-lg p-3">
                <Skeleton className="h-16 w-full" />
              </div>
            ))
          ) : filteredTransactions.length > 0 ? (
            filteredTransactions.map((transaction, index) => (
              <div
                key={transaction.id}
                className="bg-white border rounded-lg p-3 shadow-sm active:bg-gray-50"
              >
                <div
                  className="flex items-center justify-between"
                  onClick={() => navigate(`/transactions/${transaction.id}`)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded">
                        #{index + 1}
                      </span>
                      <span className="text-xs text-gray-500">
                        {transaction.orderDate ? format(new Date(transaction.orderDate), "d MMM", { locale: id }) : '-'}
                      </span>
                    </div>
                    <div className="font-medium text-sm truncate">{transaction.customerName}</div>
                    <div className="text-xs text-gray-500 truncate">
                      {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(transaction.total)}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/transactions/${transaction.id}`);
                    }}
                    className="bg-green-600 hover:bg-green-700 text-white ml-2 h-10 px-3"
                  >
                    <Truck className="h-4 w-4 mr-1" />
                    Antar
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-gray-500">Tidak ada transaksi</div>
          )}
        </div>
      ) : (
        /* Desktop View - Full Table */
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
      )}

      {/* Pagination - Desktop only */}
      {!isMobile && (
        <div className="flex items-center justify-end space-x-2 py-4">
          <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} className="hover-glow">Previous</Button>
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} className="hover-glow">Next</Button>
        </div>
      )}
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