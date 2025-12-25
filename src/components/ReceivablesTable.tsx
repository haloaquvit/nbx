"use client"
import * as React from "react"
import { ColumnDef, flexRender, getCoreRowModel, useReactTable, Row } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Transaction } from "@/types/transaction"
import { useTransactions } from "@/hooks/useTransactions"
// import { usePaymentHistoryBatch } from "@/hooks/usePaymentHistory" // Removed
import { format } from "date-fns"
import { id } from "date-fns/locale/id"
import { PayReceivableDialog } from "./PayReceivableDialog"
import { ReceivablesReportPDF } from "./ReceivablesReportPDF"
// import { PaymentHistoryRow } from "./PaymentHistoryRow" // Removed
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu"
import { MoreHorizontal, ChevronDown, ChevronRight, CheckCircle, Clock, AlertTriangle, Calendar, Filter, Printer, Pencil } from "lucide-react"
import { Input } from "./ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { Badge } from "./ui/badge"
import { useAuthContext } from "@/contexts/AuthContext"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./ui/alert-dialog"
import { showSuccess, showError } from "@/utils/toast"
import { isOwner } from '@/utils/roleUtils'
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover"
import { Calendar as CalendarComponent } from "./ui/calendar"

export function ReceivablesTable() {
  const { transactions, isLoading, deleteReceivable, updateDueDate } = useTransactions()
  const { user } = useAuthContext()
  const [isPayDialogOpen, setIsPayDialogOpen] = React.useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false)
  const [selectedTransaction, setSelectedTransaction] = React.useState<Transaction | null>(null)
  const [expandedRows, setExpandedRows] = React.useState<Set<string>>(new Set())
  const [filterStatus, setFilterStatus] = React.useState<string>('all')
  const [filterAging, setFilterAging] = React.useState<string>('all')
  const [editingDueDateId, setEditingDueDateId] = React.useState<string | null>(null)
  const [tempDueDate, setTempDueDate] = React.useState<Date | undefined>(undefined)

  const getDueStatus = (transaction: Transaction) => {
    if (!transaction.dueDate) return 'no-due-date'

    const today = new Date()
    const dueDate = new Date(transaction.dueDate)
    const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays < 0) return 'overdue'
    if (diffDays <= 3) return 'due-soon'
    return 'normal'
  }

  // Calculate aging in days from order date
  const getAgingDays = (orderDate: Date | string) => {
    const today = new Date()
    const order = new Date(orderDate)
    return Math.floor((today.getTime() - order.getTime()) / (1000 * 60 * 60 * 24))
  }

  // Get aging category based on days
  const getAgingCategory = (days: number): { label: string; color: string; bgColor: string } => {
    if (days <= 30) return { label: '0-30 hari', color: 'text-green-700', bgColor: 'bg-green-100' }
    if (days <= 60) return { label: '31-60 hari', color: 'text-yellow-700', bgColor: 'bg-yellow-100' }
    if (days <= 90) return { label: '61-90 hari', color: 'text-orange-700', bgColor: 'bg-orange-100' }
    return { label: '>90 hari', color: 'text-red-700', bgColor: 'bg-red-100' }
  }

  const receivables = React.useMemo(() => {
    let filtered = transactions?.filter(t =>
      t.paymentStatus === 'Belum Lunas' || t.paymentStatus === 'Partial'
    ) || []


    // Filter by status
    if (filterStatus !== 'all') {
      filtered = filtered.filter(t => {
        const status = getDueStatus(t)
        return status === filterStatus
      })
    }

    // Filter by aging
    if (filterAging !== 'all') {
      filtered = filtered.filter(t => {
        const days = getAgingDays(t.orderDate)
        switch (filterAging) {
          case '0-30': return days <= 30
          case '31-60': return days > 30 && days <= 60
          case '61-90': return days > 60 && days <= 90
          case '>90': return days > 90
          default: return true
        }
      })
    }

    return filtered
  }, [transactions, filterStatus, filterAging])

  const receivableIds = React.useMemo(() => {
    return receivables.map(r => r.id)
  }, [receivables])

  // const { paymentHistories, isLoading: isLoadingHistory } = usePaymentHistoryBatch(receivableIds) // Removed
  const paymentHistories: any[] = [];
  const isLoadingHistory = false;

  const handlePayClick = (transaction: Transaction) => {
    setSelectedTransaction(transaction)
    setIsPayDialogOpen(true)
  }

  const handleDeleteClick = (transaction: Transaction) => {
    setSelectedTransaction(transaction)
    setIsDeleteDialogOpen(true)
  }

  const toggleRowExpansion = (transactionId: string) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(transactionId)) {
      newExpanded.delete(transactionId)
    } else {
      newExpanded.add(transactionId)
    }
    setExpandedRows(newExpanded)
  }

  const handleConfirmDelete = async () => {
    if (!selectedTransaction) return

    try {
      await deleteReceivable.mutateAsync(selectedTransaction.id)
      showSuccess(`Piutang untuk No. Order ${selectedTransaction.id} berhasil dihapus.`)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Gagal menghapus piutang."
      showError(errorMessage)
    } finally {
      setIsDeleteDialogOpen(false)
      setSelectedTransaction(null)
    }
  }

  const handleEditDueDate = (transaction: Transaction) => {
    setEditingDueDateId(transaction.id)
    setTempDueDate(transaction.dueDate ? new Date(transaction.dueDate) : undefined)
  }

  const handleSaveDueDate = async (transactionId: string) => {
    try {
      await updateDueDate.mutateAsync({
        transactionId,
        dueDate: tempDueDate || null
      })
      showSuccess('Tanggal jatuh tempo berhasil diperbarui')
      setEditingDueDateId(null)
      setTempDueDate(undefined)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Gagal mengubah jatuh tempo"
      showError(errorMessage)
    }
  }

  const handleCancelEditDueDate = () => {
    setEditingDueDateId(null)
    setTempDueDate(undefined)
  }


  const columns: ColumnDef<Transaction>[] = [
    {
      id: "expand",
      header: "",
      cell: ({ row }) => {
        const isExpanded = expandedRows.has(row.original.id)
        const hasPaymentHistory = paymentHistories[row.original.id]?.length > 0
        
        return hasPaymentHistory ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => toggleRowExpansion(row.original.id)}
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </Button>
        ) : null
      }
    },
    { accessorKey: "id", header: "No. Order" },
    { accessorKey: "customerName", header: "Pelanggan" },
    { accessorKey: "orderDate", header: "Tgl Order", cell: ({ row }) => format(new Date(row.getValue("orderDate")), "d MMM yyyy", { locale: id }) },
    {
      id: "dueDate",
      header: "Tgl Jatuh Tempo",
      cell: ({ row }) => {
        const transaction = row.original
        const dueDate = transaction.dueDate
        const isEditing = editingDueDateId === transaction.id

        const status = getDueStatus(transaction)
        let colorClass = ''

        if (status === 'overdue') colorClass = 'text-red-600 font-bold'
        else if (status === 'due-soon') colorClass = 'text-orange-600 font-medium'
        else colorClass = 'text-gray-700'

        if (isEditing) {
          return (
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 w-32 justify-start text-left font-normal">
                    <Calendar className="mr-2 h-4 w-4" />
                    {tempDueDate ? format(tempDueDate, "d MMM yyyy", { locale: id }) : "Pilih tanggal"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={tempDueDate}
                    onSelect={setTempDueDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <Button size="sm" variant="default" className="h-8 px-2" onClick={() => handleSaveDueDate(transaction.id)}>
                Simpan
              </Button>
              <Button size="sm" variant="ghost" className="h-8 px-2" onClick={handleCancelEditDueDate}>
                Batal
              </Button>
            </div>
          )
        }

        return (
          <div className="flex items-center gap-2">
            <div className={colorClass}>
              {dueDate ? format(new Date(dueDate), "d MMM yyyy", { locale: id }) : <span className="text-gray-400">-</span>}
              {status === 'overdue' && (
                <Badge variant="destructive" className="ml-2 text-xs">
                  Terlambat
                </Badge>
              )}
              {status === 'due-soon' && (
                <Badge variant="secondary" className="ml-2 text-xs bg-orange-100 text-orange-700">
                  Segera
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 opacity-50 hover:opacity-100"
              onClick={() => handleEditDueDate(transaction)}
            >
              <Pencil className="h-3 w-3" />
            </Button>
          </div>
        )
      }
    },
    { accessorKey: "total", header: "Total Tagihan", cell: ({ row }) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(row.getValue("total")) },
    { accessorKey: "paidAmount", header: "Telah Dibayar", cell: ({ row }) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(row.getValue("paidAmount") || 0) },
    {
      id: "paymentStatus",
      header: "Status Pembayaran",
      cell: ({ row }) => {
        const total = row.original.total
        const paid = row.original.paidAmount || 0
        let status: string
        let statusLabel: string
        let statusColor: string
        let statusIcon: React.ReactNode
        
        if (paid === 0) {
          status = 'unpaid'
          statusLabel = 'Belum Bayar'
          statusColor = 'bg-red-100 text-red-800'
          statusIcon = <AlertTriangle className="h-3 w-3" />
        } else if (paid >= total) {
          status = 'paid'
          statusLabel = 'Tunai'
          statusColor = 'bg-green-100 text-green-800'
          statusIcon = <CheckCircle className="h-3 w-3" />
        } else {
          status = 'partial'
          statusLabel = 'Kredit'
          statusColor = 'bg-yellow-100 text-yellow-800'
          statusIcon = <Clock className="h-3 w-3" />
        }
        
        return (
          <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusColor}`}>
            {statusIcon}
            {statusLabel}
          </div>
        )
      }
    },
    {
      id: "remainingAmount",
      header: "Sisa Tagihan",
      cell: ({ row }) => {
        const remaining = row.original.total - (row.original.paidAmount || 0)
        return <span className="font-bold text-destructive">{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(remaining)}</span>
      }
    },
    {
      id: "aging",
      header: "Umur Piutang",
      cell: ({ row }) => {
        const days = getAgingDays(row.original.orderDate)
        const category = getAgingCategory(days)
        return (
          <div className="flex flex-col items-start gap-1">
            <span className={`font-bold ${category.color}`}>{days} hari</span>
            <Badge className={`text-xs ${category.bgColor} ${category.color} border-0`}>
              {category.label}
            </Badge>
          </div>
        )
      }
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Buka menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handlePayClick(row.original)}>
              Bayar
            </DropdownMenuItem>
            {(user?.role === 'admin' || user?.role === 'owner') && (
              <DropdownMenuItem
                className="text-red-600 focus:text-red-600 focus:bg-red-50"
                onClick={() => handleDeleteClick(row.original)}
              >
                Hapus Piutang
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  const table = useReactTable({
    data: receivables,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  const overdueCount = React.useMemo(() => {
    return receivables.filter(t => getDueStatus(t) === 'overdue').length
  }, [receivables])

  const dueSoonCount = React.useMemo(() => {
    return receivables.filter(t => getDueStatus(t) === 'due-soon').length
  }, [receivables])

  // Aging counts based on all receivables (not filtered)
  const allReceivables = React.useMemo(() => {
    return transactions?.filter(t =>
      t.paymentStatus === 'Belum Lunas' || t.paymentStatus === 'Partial'
    ) || []
  }, [transactions])

  const agingCounts = React.useMemo(() => {
    const counts = { '0-30': 0, '31-60': 0, '61-90': 0, '>90': 0 }
    const amounts = { '0-30': 0, '31-60': 0, '61-90': 0, '>90': 0 }

    allReceivables.forEach(t => {
      const days = getAgingDays(t.orderDate)
      const remaining = t.total - (t.paidAmount || 0)
      if (days <= 30) { counts['0-30']++; amounts['0-30'] += remaining }
      else if (days <= 60) { counts['31-60']++; amounts['31-60'] += remaining }
      else if (days <= 90) { counts['61-90']++; amounts['61-90'] += remaining }
      else { counts['>90']++; amounts['>90'] += remaining }
    })

    return { counts, amounts }
  }, [allReceivables])

  return (
    <>
      {/* Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex flex-wrap gap-2">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              <SelectItem value="overdue">Jatuh Tempo ({overdueCount})</SelectItem>
              <SelectItem value="due-soon">Segera Jatuh Tempo ({dueSoonCount})</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="no-due-date">Tanpa Jatuh Tempo</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterAging} onValueChange={setFilterAging}>
            <SelectTrigger className="w-48">
              <Clock className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filter Umur" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Umur</SelectItem>
              <SelectItem value="0-30">0-30 hari ({agingCounts.counts['0-30']})</SelectItem>
              <SelectItem value="31-60">31-60 hari ({agingCounts.counts['31-60']})</SelectItem>
              <SelectItem value="61-90">61-90 hari ({agingCounts.counts['61-90']})</SelectItem>
              <SelectItem value=">90">&gt;90 hari ({agingCounts.counts['>90']})</SelectItem>
            </SelectContent>
          </Select>
          <ReceivablesReportPDF
            receivables={receivables}
            filterStatus={filterStatus}
          />
        </div>
      </div>

      {/* Summary Cards - Due Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <h3 className="font-medium text-red-900">Jatuh Tempo</h3>
          </div>
          <p className="text-2xl font-bold text-red-600">{overdueCount}</p>
          <p className="text-sm text-red-700">Transaksi terlambat</p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-orange-600" />
            <h3 className="font-medium text-orange-900">Segera Jatuh Tempo</h3>
          </div>
          <p className="text-2xl font-bold text-orange-600">{dueSoonCount}</p>
          <p className="text-sm text-orange-700">≤ 3 hari lagi</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            <h3 className="font-medium text-blue-900">Total Piutang</h3>
          </div>
          <p className="text-2xl font-bold text-blue-600">{allReceivables.length}</p>
          <p className="text-sm text-blue-700">Belum lunas</p>
        </div>
      </div>

      {/* Aging Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div
          className={`border rounded-lg p-4 cursor-pointer transition-all ${filterAging === '0-30' ? 'ring-2 ring-green-500' : ''} bg-green-50 border-green-200 hover:shadow-md`}
          onClick={() => setFilterAging(filterAging === '0-30' ? 'all' : '0-30')}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <h3 className="font-medium text-green-900 text-sm">0-30 Hari</h3>
          </div>
          <p className="text-xl font-bold text-green-700">{agingCounts.counts['0-30']}</p>
          <p className="text-xs text-green-600">{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(agingCounts.amounts['0-30'])}</p>
        </div>
        <div
          className={`border rounded-lg p-4 cursor-pointer transition-all ${filterAging === '31-60' ? 'ring-2 ring-yellow-500' : ''} bg-yellow-50 border-yellow-200 hover:shadow-md`}
          onClick={() => setFilterAging(filterAging === '31-60' ? 'all' : '31-60')}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <h3 className="font-medium text-yellow-900 text-sm">31-60 Hari</h3>
          </div>
          <p className="text-xl font-bold text-yellow-700">{agingCounts.counts['31-60']}</p>
          <p className="text-xs text-yellow-600">{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(agingCounts.amounts['31-60'])}</p>
        </div>
        <div
          className={`border rounded-lg p-4 cursor-pointer transition-all ${filterAging === '61-90' ? 'ring-2 ring-orange-500' : ''} bg-orange-50 border-orange-200 hover:shadow-md`}
          onClick={() => setFilterAging(filterAging === '61-90' ? 'all' : '61-90')}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-3 rounded-full bg-orange-500" />
            <h3 className="font-medium text-orange-900 text-sm">61-90 Hari</h3>
          </div>
          <p className="text-xl font-bold text-orange-700">{agingCounts.counts['61-90']}</p>
          <p className="text-xs text-orange-600">{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(agingCounts.amounts['61-90'])}</p>
        </div>
        <div
          className={`border rounded-lg p-4 cursor-pointer transition-all ${filterAging === '>90' ? 'ring-2 ring-red-500' : ''} bg-red-50 border-red-200 hover:shadow-md`}
          onClick={() => setFilterAging(filterAging === '>90' ? 'all' : '>90')}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <h3 className="font-medium text-red-900 text-sm">&gt;90 Hari</h3>
          </div>
          <p className="text-xl font-bold text-red-700">{agingCounts.counts['>90']}</p>
          <p className="text-xs text-red-600">{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(agingCounts.amounts['>90'])}</p>
        </div>
      </div>

      <PayReceivableDialog open={isPayDialogOpen} onOpenChange={setIsPayDialogOpen} transaction={selectedTransaction} />
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anda yakin ingin menghapus piutang ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini akan menghapus piutang untuk <strong>No. Order {selectedTransaction?.id}</strong> sebesar <strong>{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(selectedTransaction ? selectedTransaction.total - (selectedTransaction.paidAmount || 0) : 0)}</strong>.
              <br /><br />
              <span className="text-red-600 font-medium">Tindakan ini tidak dapat dibatalkan.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Ya, Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="rounded-md border">
        <Table>
          <TableHeader>{table.getHeaderGroups().map(hg => <TableRow key={hg.id}>{hg.headers.map(h => <TableHead key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</TableHead>)}</TableRow>)}</TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={columns.length}>Memuat...</TableCell></TableRow> :
              table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map(row => (
                  <React.Fragment key={row.id}>
                    <TableRow>
                      {row.getVisibleCells().map(cell => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}
                    </TableRow>
                    {expandedRows.has(row.original.id) && (
                      <TableRow>
                        <TableCell colSpan={columns.length} className="p-4 bg-muted/30">
                          <div className="text-sm text-muted-foreground">
                            Riwayat pembayaran tidak tersedia - fitur telah dihapus
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))
              ) : (
                <TableRow><TableCell colSpan={columns.length} className="h-24 text-center">Tidak ada piutang.</TableCell></TableRow>
              )}
          </TableBody>
        </Table>
      </div>
    </>
  )
}