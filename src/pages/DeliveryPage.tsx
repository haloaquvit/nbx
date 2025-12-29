"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Truck, Package, Search, RefreshCw, Clock, CheckCircle, AlertCircle, Plus, History, Eye, Camera, Download, Filter, Calendar, Trash2, Loader2, Pencil } from "lucide-react"
import { format } from "date-fns"
import { id as idLocale } from "date-fns/locale/id"
import { useTransactionsReadyForDelivery, useDeliveryHistory, useDeliveries } from "@/hooks/useDeliveries"
import { DeliveryManagement } from "@/components/DeliveryManagement"
import { DeliveryDetailModal } from "@/components/DeliveryDetailModal"
import { DeliveryFormContent } from "@/components/DeliveryFormContent"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { TransactionDeliveryInfo } from "@/types/delivery"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/hooks/useAuth"
import { useGranularPermission } from "@/hooks/useGranularPermission"
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { DeliveryNotePDF } from "@/components/DeliveryNotePDF"
import { DeliveryCompletionDialog } from "@/components/DeliveryCompletionDialog"
import { EditDeliveryDialog } from "@/components/EditDeliveryDialog"
import { Delivery } from "@/types/delivery"
import { PhotoUploadService } from "@/services/photoUploadService"

export default function DeliveryPage() {
  const { toast } = useToast()
  const { user } = useAuth()
  const { canCreateDelivery } = useGranularPermission()
  const { data: transactions, isLoading, refetch } = useTransactionsReadyForDelivery()
  const { data: deliveryHistory, isLoading: isLoadingHistory, refetch: refetchHistory } = useDeliveryHistory()
  const { deleteDelivery } = useDeliveries()
  const [searchQuery, setSearchQuery] = useState("")
  const [historySearchQuery, setHistorySearchQuery] = useState("")
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionDeliveryInfo | null>(null)
  const [selectedDelivery, setSelectedDelivery] = useState<any>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("active")
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false)
  const [completedDelivery, setCompletedDelivery] = useState<Delivery | null>(null)
  const [completedTransaction, setCompletedTransaction] = useState<TransactionDeliveryInfo | null>(null)

  // Handle delivery completion
  const handleDeliveryCompleted = (delivery: Delivery, transaction: TransactionDeliveryInfo) => {
    setCompletedDelivery(delivery)
    setCompletedTransaction(transaction)
    setCompletionDialogOpen(true)
    setIsDeliveryDialogOpen(false) // Close the form dialog
  }
  const [isDeliveryDialogOpen, setIsDeliveryDialogOpen] = useState(false)
  const [selectedDeliveryTransaction, setSelectedDeliveryTransaction] = useState<TransactionDeliveryInfo | null>(null)
  
  // New filter states for history
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [selectedDriver, setSelectedDriver] = useState("all")
  const [selectedHelper, setSelectedHelper] = useState("all")
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false)

  // Delete confirmation state
  const [deliveryToDelete, setDeliveryToDelete] = useState<any>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Edit delivery state
  const [editingDelivery, setEditingDelivery] = useState<Delivery | null>(null)

  // Check if user is owner (for delete permission)
  const isOwner = user?.role === 'owner'

  // Check if user has access to history tab
  const canAccessHistory = user?.role && ['admin', 'owner'].includes(user.role)

  const filteredTransactions = transactions?.filter(transaction =>
    transaction.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    transaction.id.toLowerCase().includes(searchQuery.toLowerCase())
  ) || []
  
  // Get unique drivers and helpers for filter options
  const uniqueDrivers = Array.from(new Set(
    deliveryHistory?.map(d => d.driverName).filter(Boolean) || []
  )).sort()
  
  const uniqueHelpers = Array.from(new Set(
    deliveryHistory?.map(d => d.helperName).filter(Boolean) || []
  )).sort()

  const filteredDeliveryHistory = deliveryHistory?.filter(delivery => {
    // Text search filter
    const matchesSearch = !historySearchQuery || (
      delivery.customerName.toLowerCase().includes(historySearchQuery.toLowerCase()) ||
      delivery.transactionId.toLowerCase().includes(historySearchQuery.toLowerCase()) ||
      delivery.driverName?.toLowerCase().includes(historySearchQuery.toLowerCase()) ||
      delivery.helperName?.toLowerCase().includes(historySearchQuery.toLowerCase())
    )
    
    // Date range filter
    const deliveryDate = new Date(delivery.deliveryDate)
    const startDateObj = startDate ? new Date(startDate + "T00:00:00") : null
    const endDateObj = endDate ? new Date(endDate + "T23:59:59") : null
    
    const matchesDateRange = (!startDateObj || deliveryDate >= startDateObj) &&
                            (!endDateObj || deliveryDate <= endDateObj)
    
    // Driver filter
    const matchesDriver = selectedDriver === "all" || 
                         (selectedDriver === "no-driver" && !delivery.driverName) ||
                         delivery.driverName === selectedDriver
    
    // Helper filter  
    const matchesHelper = selectedHelper === "all" || 
                         (selectedHelper === "no-helper" && !delivery.helperName) ||
                         delivery.helperName === selectedHelper
    
    return matchesSearch && matchesDateRange && matchesDriver && matchesHelper
  }) || []

  const getOverallStatus = (transaction: TransactionDeliveryInfo) => {
    const totalItems = transaction.deliverySummary.reduce((sum, item) => sum + item.orderedQuantity, 0)
    const deliveredItems = transaction.deliverySummary.reduce((sum, item) => sum + item.deliveredQuantity, 0)

    if (deliveredItems === 0) return { status: "Belum Diantar", variant: "secondary" as const, icon: Clock }
    if (deliveredItems >= totalItems) return { status: "Selesai", variant: "success" as const, icon: CheckCircle }
    return { status: "Sebagian", variant: "default" as const, icon: AlertCircle }
  }

  // Handle delete delivery (owner only)
  const handleDeleteDelivery = async () => {
    if (!deliveryToDelete) return

    setIsDeleting(true)
    try {
      await deleteDelivery.mutateAsync(deliveryToDelete.id)
      toast({
        title: "Berhasil",
        description: `Pengantaran #${deliveryToDelete.deliveryNumber || deliveryToDelete.id.slice(-6)} berhasil dihapus dan jurnal telah di-void`
      })
      setIsDeleteDialogOpen(false)
      setDeliveryToDelete(null)
      refetchHistory()
      refetch() // Also refresh active transactions
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal Menghapus",
        description: error.message || "Terjadi kesalahan saat menghapus pengantaran"
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const generateHistoryPDF = async () => {
    setIsGeneratingPDF(true)
    
    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      })

      const pageWidth = 297
      const margin = 15

      // Header
      doc.setFontSize(18)
      doc.setFont(undefined, 'bold')
      doc.text('LAPORAN HISTORY PENGANTARAN', pageWidth/2, 20, { align: 'center' })
      
      // Filter info
      doc.setFontSize(10)
      doc.setFont(undefined, 'normal')
      let yPos = 35
      
      let filterInfo = []
      if (startDate || endDate) {
        const dateRange = `${startDate ? format(new Date(startDate), 'dd/MM/yyyy') : 'Awal'} - ${endDate ? format(new Date(endDate), 'dd/MM/yyyy') : 'Akhir'}`
        filterInfo.push(`Periode: ${dateRange}`)
      }
      if (selectedDriver !== "all") {
        filterInfo.push(`Driver: ${selectedDriver === "no-driver" ? "Tanpa Driver" : selectedDriver}`)
      }
      if (selectedHelper !== "all") {
        filterInfo.push(`Helper: ${selectedHelper === "no-helper" ? "Tanpa Helper" : selectedHelper}`)
      }
      if (historySearchQuery) {
        filterInfo.push(`Pencarian: "${historySearchQuery}"`)
      }
      
      if (filterInfo.length > 0) {
        doc.text(`Filter: ${filterInfo.join(' | ')}`, margin, yPos)
        yPos += 10
      }

      // Summary
      const totalDeliveries = filteredDeliveryHistory.length
      const totalItems = filteredDeliveryHistory.reduce((sum, d) => sum + (d.items?.reduce((itemSum: number, item: any) => itemSum + item.quantityDelivered, 0) || 0), 0)
      const totalOrderValue = filteredDeliveryHistory.reduce((sum, d) => sum + (d.transactionTotal || 0), 0)
      
      doc.text(`Total Pengantaran: ${totalDeliveries}`, margin, yPos)
      yPos += 7
      doc.text(`Total Item Diantar: ${totalItems}`, margin, yPos)
      yPos += 7
      doc.text(`Total Nilai Order: ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(totalOrderValue)}`, margin, yPos)
      yPos += 15

      // Table data
      const tableData = filteredDeliveryHistory.map((delivery, index) => [
        (index + 1).toString(),
        delivery.deliveryNumber?.toString() || delivery.id.slice(-6),
        delivery.transactionId,
        delivery.customerName,
        format(new Date(delivery.deliveryDate), 'dd/MM/yyyy HH:mm'),
        delivery.driverName || '-',
        delivery.helperName || '-',
        delivery.items?.length?.toString() || '0',
        delivery.items?.reduce((sum: number, item: any) => sum + item.quantityDelivered, 0)?.toString() || '0',
        new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(delivery.transactionTotal || 0),
        delivery.photoUrl ? 'Ya' : 'Tidak'
      ])

      // Calculate table width and center it
      const totalTableWidth = 12 + 18 + 22 + 35 + 30 + 25 + 25 + 15 + 15 + 35 + 15 // Sum of all cellWidths
      const tableStartX = (pageWidth - totalTableWidth) / 2 // Center the table

      // Table
      autoTable(doc, {
        head: [['No', 'ID#', 'Order ID', 'Pelanggan', 'Tanggal Antar', 'Driver', 'Helper', 'Jenis', 'Total', 'Nilai Order', 'Foto']],
        body: tableData,
        startY: yPos,
        margin: { left: tableStartX, right: tableStartX },
        tableWidth: totalTableWidth,
        styles: {
          fontSize: 8,
          cellPadding: 2,
          halign: 'left'
        },
        headStyles: {
          fillColor: [79, 70, 229],
          textColor: 255,
          fontSize: 8,
          fontStyle: 'bold',
          halign: 'center'
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 12 },    // No
          1: { halign: 'center', cellWidth: 18 },    // ID#
          2: { halign: 'center', cellWidth: 22 },    // Order ID
          3: { halign: 'left', cellWidth: 35 },      // Pelanggan
          4: { halign: 'center', cellWidth: 30 },    // Tanggal
          5: { halign: 'left', cellWidth: 25 },      // Driver
          6: { halign: 'left', cellWidth: 25 },      // Helper
          7: { halign: 'center', cellWidth: 15 },    // Jenis
          8: { halign: 'center', cellWidth: 15 },    // Total
          9: { halign: 'right', cellWidth: 35 },     // Nilai Order
          10: { halign: 'center', cellWidth: 15 }    // Foto
        },
        didDrawPage: (data) => {
          // Footer with print info
          const pageHeight = doc.internal.pageSize.height
          doc.setFontSize(8)
          doc.setTextColor(128, 128, 128)
          doc.text(`Dicetak oleh: ${user?.name || user?.email || 'System'} pada ${format(new Date(), 'dd/MM/yyyy HH:mm:ss')}`, margin, pageHeight - 10)
          doc.text(`Halaman ${data.pageNumber}`, pageWidth - margin, pageHeight - 10, { align: 'right' })
        }
      })

      // Save PDF
      const fileName = `laporan-history-pengantaran-${format(new Date(), 'yyyy-MM-dd-HHmm')}.pdf`
      doc.save(fileName)

      toast({
        title: "PDF Berhasil Dibuat",
        description: `Laporan history pengantaran berhasil diunduh sebagai ${fileName}`
      })

    } catch (error) {
      console.error('Error generating PDF:', error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal membuat PDF. Silakan coba lagi."
      })
    } finally {
      setIsGeneratingPDF(false)
    }
  }

  if (selectedTransaction) {
    return (
      <div className="container mx-auto p-6">
        <div className="mb-6">
          <Button
            variant="outline"
            onClick={() => setSelectedTransaction(null)}
            className="mb-4"
          >
            ← Kembali ke Daftar
          </Button>
        </div>
        <DeliveryManagement
          transaction={selectedTransaction}
          onClose={() => {
            setSelectedTransaction(null)
            refetch()
          }}
        />
      </div>
    )
  }

  return (
    <div className="w-full max-w-none p-4 lg:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Truck className="h-6 w-6 sm:h-8 sm:w-8 flex-shrink-0" />
            <span className="truncate">Manajemen Pengantaran</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Kelola pengantaran pesanan pelanggan dengan sistem partial delivery.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button 
            onClick={() => refetch()} 
            variant="outline" 
            size="sm"
          >
            <RefreshCw className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          {canCreateDelivery() && (
            <Button
              onClick={() => {
                // Navigate to first available transaction for delivery
                if (filteredTransactions.length > 0) {
                  setSelectedTransaction(filteredTransactions[0])
                } else {
                  toast({
                    variant: "destructive",
                    title: "Tidak Ada Transaksi",
                    description: "Tidak ada transaksi yang siap untuk diantar."
                  })
                }
              }}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Truck className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Buat Pengantaran</span>
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className={`grid w-full max-w-md mx-auto mb-6 ${canAccessHistory ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <TabsTrigger value="active" className="flex items-center gap-2">
            <Truck className="h-4 w-4" />
            Pengantaran Aktif
          </TabsTrigger>
          {canAccessHistory && (
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              History
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="active" className="space-y-6">
          <div className="grid gap-6">

        {/* Search and Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Filter Pengantaran</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Cari berdasarkan nama pelanggan atau nomor order..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="text-sm text-muted-foreground">
                {filteredTransactions.length} dari {transactions?.length || 0} transaksi
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Transactions Table */}
        <Card>
          <CardHeader>
            <CardTitle>Daftar Pengantaran</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredTransactions.length === 0 ? (
              <div className="text-center py-12">
                <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Tidak Ada Pengantaran</h3>
                <p className="text-muted-foreground">
                  {searchQuery 
                    ? "Tidak ada transaksi yang cocok dengan pencarian Anda" 
                    : "Tidak ada transaksi yang perlu diantar saat ini"}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[900px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Order ID</TableHead>
                      <TableHead className="min-w-[150px]">Pelanggan</TableHead>
                      <TableHead className="min-w-[140px]">Tanggal Order</TableHead>
                      <TableHead className="min-w-[120px]">Total</TableHead>
                      <TableHead className="min-w-[100px]">Status</TableHead>
                      <TableHead className="min-w-[100px]">Supir</TableHead>
                      <TableHead className="min-w-[80px]">Item Sisa</TableHead>
                      <TableHead className="w-[100px]">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransactions.map((transaction) => {
                      const overallStatus = getOverallStatus(transaction)
                      const StatusIcon = overallStatus.icon
                      const remainingItems = transaction.deliverySummary.reduce((sum, item) => sum + item.remainingQuantity, 0)
                      
                      return (
                        <TableRow 
                          key={transaction.id} 
                          className="cursor-pointer hover:bg-muted"
                          onClick={() => {
                            setSelectedTransaction(transaction)
                          }}
                        >
                          <TableCell>
                            <Badge variant="outline" className="text-xs">#{transaction.id}</Badge>
                          </TableCell>
                          <TableCell className="font-medium">
                            <div className="truncate max-w-[150px]" title={transaction.customerName}>
                              {transaction.customerName}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            <div>{format(transaction.orderDate, "d MMM yyyy", { locale: idLocale })}</div>
                            <div className="text-xs text-muted-foreground">
                              {format(transaction.orderDate, "HH:mm", { locale: idLocale })}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-semibold text-green-600 text-sm">
                              {new Intl.NumberFormat("id-ID", {
                                style: "currency",
                                currency: "IDR",
                                minimumFractionDigits: 0
                              }).format(transaction.total)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={overallStatus.variant} className="flex items-center gap-1 w-fit text-xs">
                              <StatusIcon className="h-3 w-3" />
                              <span className="hidden sm:inline">{overallStatus.status}</span>
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {transaction.deliveries.length > 0 ? (
                              <div className="text-sm">
                                {/* Show unique driver names from all deliveries */}
                                {(() => {
                                  const driverNames = [...new Set(
                                    transaction.deliveries
                                      .map(d => d.driverName)
                                      .filter(Boolean)
                                  )];
                                  return driverNames.length > 0
                                    ? driverNames.join(', ')
                                    : <span className="text-muted-foreground">-</span>;
                                })()}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div>{remainingItems} item</div>
                              <div className="text-muted-foreground text-xs">
                                {transaction.deliveries.length} pengantaran
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button 
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedDeliveryTransaction(transaction)
                                setIsDeliveryDialogOpen(true)
                              }}
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 text-white text-xs px-2 py-1"
                            >
                              <Truck className="h-3 w-3 sm:mr-1" />
                              <span className="hidden sm:inline">Antar</span>
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
          </div>

        </TabsContent>

        {/* History Tab - Only visible to admin/owner */}
        {canAccessHistory && (
          <TabsContent value="history" className="space-y-6">
            <div className="grid gap-6">
              {/* History Search and Filters */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Filter className="h-5 w-5" />
                    Filter History Pengantaran
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Search */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                      <Input
                        placeholder="Cari berdasarkan pelanggan, order ID, driver, atau helper..."
                        value={historySearchQuery}
                        onChange={(e) => setHistorySearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    
                    {/* Filter Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* Date Range */}
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">
                          <Calendar className="inline h-4 w-4 mr-1" />
                          Dari Tanggal
                        </label>
                        <Input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="text-sm"
                        />
                      </div>
                      
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">
                          <Calendar className="inline h-4 w-4 mr-1" />
                          Sampai Tanggal
                        </label>
                        <Input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="text-sm"
                        />
                      </div>
                      
                      {/* Driver Filter */}
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">
                          Driver
                        </label>
                        <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                          <SelectTrigger className="text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Semua Driver</SelectItem>
                            <SelectItem value="no-driver">Tanpa Driver</SelectItem>
                            {uniqueDrivers.map(driver => (
                              <SelectItem key={driver} value={driver}>
                                {driver}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {/* Helper Filter */}
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">
                          Helper
                        </label>
                        <Select value={selectedHelper} onValueChange={setSelectedHelper}>
                          <SelectTrigger className="text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Semua Helper</SelectItem>
                            <SelectItem value="no-helper">Tanpa Helper</SelectItem>
                            {uniqueHelpers.map(helper => (
                              <SelectItem key={helper} value={helper}>
                                {helper}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    {/* Summary and Actions */}
                    <div className="flex items-center justify-between pt-4 border-t">
                      <div className="text-sm text-muted-foreground">
                        Menampilkan {filteredDeliveryHistory.length} dari {deliveryHistory?.length || 0} pengantaran
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          onClick={() => {
                            setHistorySearchQuery("")
                            setStartDate("")
                            setEndDate("")
                            setSelectedDriver("all")
                            setSelectedHelper("all")
                          }}
                          variant="outline" 
                          size="sm"
                        >
                          Reset Filter
                        </Button>
                        <Button 
                          onClick={generateHistoryPDF}
                          disabled={isGeneratingPDF}
                          variant="outline" 
                          size="sm"
                        >
                          {isGeneratingPDF ? (
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4 mr-2" />
                          )}
                          {isGeneratingPDF ? "Generating..." : "Export PDF"}
                        </Button>
                        <Button 
                          onClick={() => refetchHistory()} 
                          variant="outline" 
                          size="sm"
                        >
                          <RefreshCw className="h-4 w-4 sm:mr-2" />
                          <span className="hidden sm:inline">Refresh</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* History Table */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>History Pengantaran</span>
                    <Badge variant="secondary" className="text-xs">
                      {deliveryHistory?.length || 0} total pengantaran
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoadingHistory ? (
                    <div className="space-y-3">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : filteredDeliveryHistory.length === 0 ? (
                    <div className="text-center py-12">
                      <History className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-medium mb-2">Tidak Ada History</h3>
                      <p className="text-muted-foreground">
                        {historySearchQuery 
                          ? "Tidak ada pengantaran yang cocok dengan pencarian Anda" 
                          : "Belum ada history pengantaran yang tercatat"}
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table className="min-w-[1000px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[100px]">Nomor</TableHead>
                            <TableHead className="min-w-[100px]">Order ID</TableHead>
                            <TableHead className="min-w-[150px]">Pelanggan</TableHead>
                            <TableHead className="min-w-[140px]">Tanggal Antar</TableHead>
                            <TableHead className="min-w-[120px]">Driver</TableHead>
                            <TableHead className="min-w-[100px]">Helper</TableHead>
                            <TableHead className="min-w-[100px]">Total Item</TableHead>
                            <TableHead className="min-w-[120px]">Total Order</TableHead>
                            <TableHead className="w-[80px]">Foto</TableHead>
                            <TableHead className="min-w-[100px]">Status</TableHead>
                            <TableHead className="w-[100px]">Aksi</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredDeliveryHistory.map((delivery: any, index: number) => (
                            <TableRow key={delivery.id} className="hover:bg-muted">
                              <TableCell>
                                <Badge variant="outline" className="text-xs">
                                  #{index + 1}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="text-xs">
                                  {delivery.transactionId}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-medium">
                                <div className="truncate max-w-[150px]" title={delivery.customerName}>
                                  {delivery.customerName}
                                </div>
                                {delivery.customerAddress && (
                                  <div className="text-xs text-muted-foreground truncate max-w-[150px]">
                                    {delivery.customerAddress}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-sm">
                                <div>{format(delivery.deliveryDate, "d MMM yyyy", { locale: idLocale })}</div>
                                <div className="text-xs text-muted-foreground">
                                  {format(delivery.deliveryDate, "HH:mm", { locale: idLocale })}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm">
                                  {delivery.driverName || '-'}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm">
                                  {delivery.helperName || '-'}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm">
                                  {delivery.items?.length || 0} jenis
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {delivery.items?.reduce((sum: number, item: any) => sum + item.quantityDelivered, 0) || 0} total
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="font-semibold text-green-600 text-sm">
                                  {new Intl.NumberFormat("id-ID", {
                                    style: "currency",
                                    currency: "IDR",
                                    minimumFractionDigits: 0
                                  }).format(delivery.transactionTotal)}
                                </div>
                              </TableCell>
                              <TableCell>
                                {delivery.photoUrl ? (
                                  <img
                                    src={PhotoUploadService.getPhotoUrl(delivery.photoUrl, 'deliveries')}
                                    alt={`Foto pengantaran ${delivery.deliveryNumber || delivery.id.slice(-6)}`}
                                    className="w-12 h-12 object-cover rounded-md cursor-pointer hover:opacity-80 transition-opacity"
                                    onClick={() => window.open(PhotoUploadService.getPhotoUrl(delivery.photoUrl, 'deliveries'), '_blank')}
                                    onError={(e) => {
                                      const target = e.target as HTMLImageElement;
                                      target.style.display = 'none';
                                      const parent = target.parentElement;
                                      if (parent) {
                                        parent.innerHTML = `
                                          <div class="w-12 h-12 bg-gray-100 rounded-md flex items-center justify-center">
                                            <svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                          </div>
                                        `;
                                      }
                                    }}
                                  />
                                ) : (
                                  <div className="w-12 h-12 bg-gray-100 rounded-md flex items-center justify-center">
                                    <Camera className="h-4 w-4 text-gray-400" />
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge variant="success" className="flex items-center gap-1 w-fit text-xs">
                                  <CheckCircle className="h-3 w-3" />
                                  <span className="hidden sm:inline">Selesai</span>
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  <DeliveryNotePDF delivery={delivery} />
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-xs px-2 py-1"
                                    onClick={() => {
                                      setSelectedDelivery(delivery)
                                      setIsDetailModalOpen(true)
                                    }}
                                  >
                                    <Eye className="h-3 w-3 sm:mr-1" />
                                    <span className="hidden sm:inline">Detail</span>
                                  </Button>
                                  {/* Owner-only edit button */}
                                  {isOwner && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-xs px-2 py-1"
                                      onClick={() => setEditingDelivery(delivery)}
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                  )}
                                  {/* Owner-only delete button */}
                                  {isOwner && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-xs px-2 py-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                                      onClick={() => {
                                        setDeliveryToDelete(delivery)
                                        setIsDeleteDialogOpen(true)
                                      }}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}
      </Tabs>

      {/* Floating Action Button for Quick Delivery Creation */}
      <Button
        onClick={() => {
          if (filteredTransactions.length > 0) {
            setSelectedTransaction(filteredTransactions[0])
          } else {
            toast({
              variant: "destructive",
              title: "Tidak Ada Transaksi",
              description: "Tidak ada transaksi yang siap untuk diantar."
            })
          }
        }}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-green-600 hover:bg-green-700 shadow-lg hover:shadow-xl transition-all duration-200 md:hidden"
        size="icon"
      >
        <Truck className="h-6 w-6 text-white" />
      </Button>

      {/* Delivery Detail Modal */}
      <DeliveryDetailModal
        delivery={selectedDelivery}
        open={isDetailModalOpen}
        onOpenChange={setIsDetailModalOpen}
      />

      {/* Delivery Dialog */}
      {selectedDeliveryTransaction && (
        <Dialog open={isDeliveryDialogOpen} onOpenChange={setIsDeliveryDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Buat Pengantaran Baru</DialogTitle>
              <DialogDescription>
                Catat pengantaran untuk order #{selectedDeliveryTransaction.id} - {selectedDeliveryTransaction.customerName}
              </DialogDescription>
            </DialogHeader>
            
            <DeliveryFormContent
              transaction={selectedDeliveryTransaction}
              onSuccess={() => {
                setSelectedDeliveryTransaction(null)
                refetch()
              }}
              onDeliveryCreated={handleDeliveryCompleted}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Delivery Completion Dialog */}
      <DeliveryCompletionDialog
        open={completionDialogOpen}
        onOpenChange={setCompletionDialogOpen}
        delivery={completedDelivery}
        transaction={completedTransaction}
      />

      {/* Delete Confirmation Dialog - Owner Only */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Hapus Pengantaran
            </DialogTitle>
            <DialogDescription>
              Anda yakin ingin menghapus pengantaran ini? Tindakan ini tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>

          {deliveryToDelete && (
            <div className="space-y-3 py-4">
              <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">No. Pengantaran</span>
                  <span className="font-medium">#{deliveryToDelete.deliveryNumber || deliveryToDelete.id.slice(-6)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Customer</span>
                  <span className="font-medium">{deliveryToDelete.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Tanggal</span>
                  <span className="font-medium">
                    {format(new Date(deliveryToDelete.deliveryDate), "d MMM yyyy HH:mm", { locale: idLocale })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Driver</span>
                  <span className="font-medium">{deliveryToDelete.driverName || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Item Diantar</span>
                  <span className="font-medium">
                    {deliveryToDelete.items?.length || 0} jenis ({deliveryToDelete.items?.reduce((sum: number, item: any) => sum + item.quantityDelivered, 0) || 0} total)
                  </span>
                </div>
              </div>

              <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  <strong>Perhatian:</strong> Menghapus pengantaran akan:
                </p>
                <ul className="text-sm text-yellow-700 dark:text-yellow-300 list-disc list-inside mt-1">
                  <li>Void jurnal terkait (Hutang Barang Dagang)</li>
                  <li>Mengembalikan stok produk</li>
                  <li>Mengubah status transaksi jika perlu</li>
                  <li>Menghapus komisi driver/helper terkait</li>
                </ul>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsDeleteDialogOpen(false)
                setDeliveryToDelete(null)
              }}
              disabled={isDeleting}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteDelivery}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Menghapus...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Hapus Pengantaran
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Delivery Dialog (Owner only) */}
      {editingDelivery && (
        <EditDeliveryDialog
          delivery={editingDelivery}
          open={!!editingDelivery}
          onOpenChange={(open) => {
            if (!open) {
              setEditingDelivery(null)
              refetchHistory()
            }
          }}
        />
      )}
    </div>
  )
}