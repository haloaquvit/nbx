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
import { MoreHorizontal, ChevronDown, ChevronRight, CheckCircle, Clock, AlertTriangle, Calendar, Filter, Printer } from "lucide-react"
import { Input } from "./ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { Badge } from "./ui/badge"
import { useAuthContext } from "@/contexts/AuthContext"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./ui/alert-dialog"
import { showSuccess } from "@/utils/toast"
import { isOwner } from '@/utils/roleUtils'

export function ReceivablesTable() {
  const { transactions, isLoading, deleteReceivable } = useTransactions()
  const { user } = useAuthContext()
  const [isPayDialogOpen, setIsPayDialogOpen] = React.useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false)
  const [selectedTransaction, setSelectedTransaction] = React.useState<Transaction | null>(null)
  const [expandedRows, setExpandedRows] = React.useState<Set<string>>(new Set())
  const [filterStatus, setFilterStatus] = React.useState<string>('all')

  const getDueStatus = (transaction: Transaction) => {
    if (!transaction.dueDate) return 'no-due-date'
    
    const today = new Date()
    const dueDate = new Date(transaction.dueDate)
    const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    
    if (diffDays < 0) return 'overdue'
    if (diffDays <= 3) return 'due-soon'
    return 'normal'
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

    return filtered
  }, [transactions, filterStatus])

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
        const dueDate = row.original.dueDate
        if (!dueDate) return <span className="text-gray-400">-</span>
        
        const status = getDueStatus(row.original)
        let colorClass = ''
        
        if (status === 'overdue') colorClass = 'text-red-600 font-bold'
        else if (status === 'due-soon') colorClass = 'text-orange-600 font-medium'
        else colorClass = 'text-gray-700'
        
        return (
          <div className={colorClass}>
            {format(new Date(dueDate), "d MMM yyyy", { locale: id })}
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

  return (
    <>
      {/* Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex gap-2">
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
          <ReceivablesReportPDF 
            receivables={receivables}
            filterStatus={filterStatus}
          />
        </div>
      </div>

      {/* Summary Cards */}
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
          <p className="text-2xl font-bold text-blue-600">{receivables.length}</p>
          <p className="text-sm text-blue-700">Belum lunas</p>
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