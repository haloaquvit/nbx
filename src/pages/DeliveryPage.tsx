"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"
import { Truck, Package, Search, RefreshCw, Clock, CheckCircle, AlertCircle } from "lucide-react"
import { format } from "date-fns"
import { id as idLocale } from "date-fns/locale/id"
import { useTransactionsReadyForDelivery } from "@/hooks/useDeliveries"
import { DeliveryManagement } from "@/components/DeliveryManagement"
import { TransactionDeliveryInfo } from "@/types/delivery"
import { Skeleton } from "@/components/ui/skeleton"

export default function DeliveryPage() {
  const { toast } = useToast()
  const { data: transactions, isLoading, refetch } = useTransactionsReadyForDelivery()
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionDeliveryInfo | null>(null)

  const filteredTransactions = transactions?.filter(transaction =>
    transaction.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    transaction.id.toLowerCase().includes(searchQuery.toLowerCase())
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
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Truck className="h-8 w-8" />
            Manajemen Pengantaran
          </h1>
          <p className="text-muted-foreground mt-1">
            Kelola pengantaran pesanan pelanggan dengan sistem partial delivery
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            onClick={() => refetch()} 
            variant="outline" 
            size="sm"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
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
            <Truck className="h-4 w-4 mr-2" />
            Buat Pengantaran
          </Button>
        </div>
      </div>

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

        {/* Transactions List */}
        <div className="grid gap-4">
          {isLoading ? (
            // Loading skeleton
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-6 w-32" />
                      <Skeleton className="h-6 w-20" />
                    </div>
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-4 w-64" />
                  </div>
                </CardContent>
              </Card>
            ))
          ) : filteredTransactions.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Tidak Ada Pengantaran</h3>
                <p className="text-muted-foreground">
                  {searchQuery 
                    ? "Tidak ada transaksi yang cocok dengan pencarian Anda" 
                    : "Tidak ada transaksi yang perlu diantar saat ini"}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredTransactions.map((transaction) => {
              const overallStatus = getOverallStatus(transaction)
              const StatusIcon = overallStatus.icon
              
              return (
                <Card key={transaction.id} className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold">Order #{transaction.id}</h3>
                          <Badge variant={overallStatus.variant} className="flex items-center gap-1">
                            <StatusIcon className="h-3 w-3" />
                            {overallStatus.status}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground">{transaction.customerName}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(transaction.orderDate, "d MMMM yyyy, HH:mm", { locale: idLocale })}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold text-green-600">
                          {new Intl.NumberFormat("id-ID", {
                            style: "currency",
                            currency: "IDR",
                            minimumFractionDigits: 0,
                          }).format(transaction.total)}
                        </div>
                        <div className="flex flex-col gap-2 mt-2">
                          <Button 
                            onClick={() => setSelectedTransaction(transaction)}
                            className="bg-green-600 hover:bg-green-700 text-white"
                            size="sm"
                          >
                            <Truck className="h-4 w-4 mr-2" />
                            Buat Pengantaran
                          </Button>
                          <Button 
                            variant="outline" 
                            onClick={() => setSelectedTransaction(transaction)}
                            size="sm"
                          >
                            <Package className="h-4 w-4 mr-2" />
                            Kelola Pengantaran
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Items Summary */}
                    <div className="border-t pt-4">
                      <h4 className="font-medium mb-3">Ringkasan Item</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {transaction.deliverySummary.map((item) => {
                          const isComplete = item.deliveredQuantity >= item.orderedQuantity
                          const isPartial = item.deliveredQuantity > 0 && item.deliveredQuantity < item.orderedQuantity
                          
                          return (
                            <div key={item.productId} className="bg-muted/50 rounded-lg p-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-medium text-sm">{item.productName}</span>
                                {isComplete ? (
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                ) : isPartial ? (
                                  <AlertCircle className="h-4 w-4 text-blue-500" />
                                ) : (
                                  <Clock className="h-4 w-4 text-yellow-500" />
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                <div>Dipesan: {item.orderedQuantity} {item.unit}</div>
                                <div>Diantar: {item.deliveredQuantity} {item.unit}</div>
                                {item.remainingQuantity > 0 && (
                                  <div className="text-orange-600 font-medium">
                                    Sisa: {item.remainingQuantity} {item.unit}
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Delivery History Summary */}
                    {transaction.deliveries.length > 0 && (
                      <div className="border-t pt-4 mt-4">
                        <h4 className="font-medium mb-2">Riwayat Pengantaran</h4>
                        <div className="text-sm text-muted-foreground">
                          {transaction.deliveries.length} pengantaran terakhir: {" "}
                          {format(transaction.deliveries[0].deliveryDate, "d MMM yyyy", { locale: idLocale })}
                          {transaction.deliveries[0].driverId && ` • Supir: ${transaction.deliveries[0].driverName || transaction.deliveries[0].driverId}`}
                          {transaction.deliveries[0].helperId && ` • Helper: ${transaction.deliveries[0].helperName || transaction.deliveries[0].helperId}`}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      </div>

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
    </div>
  )
}