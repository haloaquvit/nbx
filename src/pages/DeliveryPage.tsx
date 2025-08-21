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
import { Truck, Package, Search, RefreshCw, Clock, CheckCircle, AlertCircle, Plus, History, Eye, Camera } from "lucide-react"
import { format } from "date-fns"
import { id as idLocale } from "date-fns/locale/id"
import { useTransactionsReadyForDelivery, useDeliveryHistory } from "@/hooks/useDeliveries"
import { DeliveryManagement } from "@/components/DeliveryManagement"
import { DeliveryDetailModal } from "@/components/DeliveryDetailModal"
import { TransactionDeliveryInfo } from "@/types/delivery"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/useAuth"

export default function DeliveryPage() {
  const { toast } = useToast()
  const { user } = useAuth()
  const { data: transactions, isLoading, refetch } = useTransactionsReadyForDelivery()
  const { data: deliveryHistory, isLoading: isLoadingHistory, refetch: refetchHistory } = useDeliveryHistory()
  const [searchQuery, setSearchQuery] = useState("")
  const [historySearchQuery, setHistorySearchQuery] = useState("")
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionDeliveryInfo | null>(null)
  const [selectedDelivery, setSelectedDelivery] = useState<any>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("active")
  
  // Check if user has access to history tab
  const canAccessHistory = user?.role && ['admin', 'owner'].includes(user.role)

  const filteredTransactions = transactions?.filter(transaction =>
    transaction.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    transaction.id.toLowerCase().includes(searchQuery.toLowerCase())
  ) || []
  
  const filteredDeliveryHistory = deliveryHistory?.filter(delivery =>
    delivery.customerName.toLowerCase().includes(historySearchQuery.toLowerCase()) ||
    delivery.transactionId.toLowerCase().includes(historySearchQuery.toLowerCase()) ||
    delivery.driverName?.toLowerCase().includes(historySearchQuery.toLowerCase())
  ) || []

  const getOverallStatus = (transaction: TransactionDeliveryInfo) => {
    const totalItems = transaction.deliverySummary.reduce((sum, item) => sum + item.orderedQuantity, 0)
    const deliveredItems = transaction.deliverySummary.reduce((sum, item) => sum + item.deliveredQuantity, 0)
    
    if (deliveredItems === 0) return { status: "Belum Diantar", variant: "secondary" as const, icon: Clock }
    if (deliveredItems >= totalItems) return { status: "Selesai", variant: "success" as const, icon: CheckCircle }
    return { status: "Sebagian", variant: "default" as const, icon: AlertCircle }
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
        {/* Quick Actions */}
        <Card className="bg-gradient-to-r from-green-50 to-blue-50 border-green-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-green-800">Aksi Cepat Pengantaran</h3>
                <p className="text-sm text-green-600">Buat pengantaran baru atau kelola pengantaran yang ada</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right text-sm text-muted-foreground">
                  <div>{filteredTransactions.length} transaksi siap antar</div>
                  <div className="text-xs">{transactions?.reduce((sum, t) => sum + t.deliverySummary.reduce((itemSum, item) => itemSum + item.remainingQuantity, 0), 0) || 0} item menunggu</div>
                </div>
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
                  className="bg-green-600 hover:bg-green-700 text-white"
                  disabled={filteredTransactions.length === 0}
                >
                  <Truck className="h-4 w-4 mr-2" />
                  Mulai Pengantaran
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

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
            <CardTitle className="flex items-center justify-between">
              <span>Daftar Pengantaran</span>
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
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Plus className="h-4 w-4 mr-2" />
                Tambah Pengantaran
              </Button>
            </CardTitle>
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
                <Table className="min-w-[800px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Order ID</TableHead>
                      <TableHead className="min-w-[150px]">Pelanggan</TableHead>
                      <TableHead className="min-w-[140px]">Tanggal Order</TableHead>
                      <TableHead className="min-w-[120px]">Total</TableHead>
                      <TableHead className="min-w-[100px]">Status</TableHead>
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
                          onClick={() => setSelectedTransaction(transaction)}
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
                                minimumFractionDigits: 0,
                                notation: "compact"
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
                                setSelectedTransaction(transaction)
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
                  <CardTitle className="text-lg">Filter History Pengantaran</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <div className="relative flex-1 max-w-md">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                      <Input
                        placeholder="Cari berdasarkan pelanggan, order ID, atau driver..."
                        value={historySearchQuery}
                        onChange={(e) => setHistorySearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {filteredDeliveryHistory.length} dari {deliveryHistory?.length || 0} pengantaran
                    </div>
                    <Button 
                      onClick={() => refetchHistory()} 
                      variant="outline" 
                      size="sm"
                    >
                      <RefreshCw className="h-4 w-4 sm:mr-2" />
                      <span className="hidden sm:inline">Refresh</span>
                    </Button>
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
                          {filteredDeliveryHistory.map((delivery: any) => (
                            <TableRow key={delivery.id} className="hover:bg-muted">
                              <TableCell>
                                <Badge variant="outline" className="text-xs">
                                  #{delivery.deliveryNumber || delivery.id.slice(-6)}
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
                                    minimumFractionDigits: 0,
                                    notation: "compact"
                                  }).format(delivery.transactionTotal)}
                                </div>
                              </TableCell>
                              <TableCell>
                                {delivery.photoUrl ? (
                                  <img
                                    src={delivery.photoUrl}
                                    alt={`Foto pengantaran ${delivery.deliveryNumber || delivery.id.slice(-6)}`}
                                    className="w-12 h-12 object-cover rounded-md cursor-pointer hover:opacity-80 transition-opacity"
                                    onClick={() => window.open(delivery.photoUrl, '_blank')}
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
    </div>
  )
}