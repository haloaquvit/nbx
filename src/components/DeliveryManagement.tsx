"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"
import { Truck, Camera, Package, CheckCircle, Clock, AlertCircle, FileText, Trash2 } from "lucide-react"
import { DeliveryNotePDF } from "@/components/DeliveryNotePDF"
import { format } from "date-fns"
import { id as idLocale } from "date-fns/locale/id"
import { TransactionDeliveryInfo, DeliveryFormData, Delivery } from "@/types/delivery"
import { useDeliveries, useDeliveryEmployees } from "@/hooks/useDeliveries"
import { useAuth } from "@/hooks/useAuth"
import { Link } from "react-router-dom"

interface DeliveryManagementProps {
  transaction: TransactionDeliveryInfo;
  onClose?: () => void;
  embedded?: boolean; // Add embedded mode prop
  onDeliveryCreated?: (delivery: Delivery, transaction: TransactionDeliveryInfo) => void;
}

export function DeliveryManagement({ transaction, onClose, embedded = false, onDeliveryCreated }: DeliveryManagementProps) {
  const { toast } = useToast()
  const { user } = useAuth()
  const { createDelivery, deleteDelivery } = useDeliveries()
  const { data: employees, isLoading: isLoadingEmployees } = useDeliveryEmployees()
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  
  // Check if user is admin or owner
  const canDeleteDelivery = user?.role === 'admin' || user?.role === 'owner'
  
  const [formData, setFormData] = useState<DeliveryFormData>({
    transactionId: transaction.id,
    deliveryDate: "", // Not used anymore, server time will be used
    notes: "",
    driverId: "",
    helperId: "",
    items: transaction.deliverySummary.map((item, index) => ({
      itemId: `${item.productId}-${index}`,
      productId: item.productId,
      productName: item.productName,
      isBonus: item.productName.includes("BONUS") || item.productName.includes("(BONUS)"),
      orderedQuantity: item.orderedQuantity,
      deliveredQuantity: item.deliveredQuantity,
      remainingQuantity: item.remainingQuantity,
      quantityToDeliver: 0,
      unit: item.unit,
      width: item.width,
      height: item.height,
      notes: "",
    })),
    photo: undefined,
  })

  const handleItemQuantityChange = (itemId: string, quantityToDeliver: number) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map(item =>
        item.itemId === itemId
          ? { ...item, quantityToDeliver: Math.max(0, Math.min(quantityToDeliver, item.remainingQuantity)) }
          : item
      )
    }))
  }

  const handleItemNotesChange = (itemId: string, notes: string) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map(item =>
        item.itemId === itemId ? { ...item, notes } : item
      )
    }))
  }

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setFormData(prev => ({ ...prev, photo: file }))
    }
  }

  const handleSubmit = async () => {
    // Validate at least one item to deliver
    const itemsToDeliver = formData.items.filter(item => item.quantityToDeliver > 0)
    if (itemsToDeliver.length === 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Pilih minimal satu item untuk diantar"
      })
      return
    }

    // Validate driver
    if (!formData.driverId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Supir wajib dipilih"
      })
      return
    }

    // Validate no item exceeds remaining quantity
    const hasExcessiveQuantity = formData.items.some(item => 
      item.quantityToDeliver > item.remainingQuantity
    )
    if (hasExcessiveQuantity) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Jumlah antar tidak boleh melebihi sisa pesanan"
      })
      return
    }

    setIsSubmitting(true)
    try {
      // Debug: Log the items being delivered
      const deliveryItems = itemsToDeliver.map(item => ({
        productId: item.productId,
        productName: item.productName,
        quantityDelivered: item.quantityToDeliver,
        unit: item.unit,
        width: item.width,
        height: item.height,
        notes: item.notes || undefined,
      }))
      
      console.log('[DeliveryManagement] Items to deliver:', deliveryItems)
      
      // Validate all product IDs are present
      const invalidItems = deliveryItems.filter(item => !item.productId)
      if (invalidItems.length > 0) {
        console.error('[DeliveryManagement] Found items without product ID:', invalidItems)
        toast({
          variant: "destructive",
          title: "Error",
          description: "Beberapa item tidak memiliki ID produk yang valid"
        })
        return
      }

      const result = await createDelivery.mutateAsync({
        transactionId: formData.transactionId,
        deliveryDate: new Date(), // Use current time instead of input
        notes: formData.notes,
        driverId: formData.driverId,
        helperId: formData.helperId || undefined,
        items: deliveryItems,
        photo: formData.photo,
      })

      // Check if there were any invalid products that were skipped
      const hasInvalidProducts = (result as any)?._invalidProductIds?.length > 0
      
      if (hasInvalidProducts) {
        toast({
          title: "Pengantaran Berhasil Dicatat dengan Peringatan",
          description: `Pengantaran disimpan, tetapi beberapa item dilewati karena produk tidak ditemukan di database`,
          variant: "default",
        })
      } else {
        toast({
          title: "Pengantaran Berhasil Dicatat",
          description: `Pengantaran untuk transaksi ${transaction.id} berhasil disimpan`,
        })
      }

      // Call completion dialog callback if provided
      if (onDeliveryCreated && result) {
        onDeliveryCreated(result as Delivery, transaction)
      }

      // Reset form
      setFormData(prev => ({
        ...prev,
        deliveryDate: "", // Not used anymore
        notes: "",
        driverId: "",
        helperId: "",
        photo: undefined,
        items: prev.items.map(item => ({ ...item, quantityToDeliver: 0, notes: "" }))
      }))

      setIsOpen(false)
      onClose?.()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Gagal menyimpan pengantaran"
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteDelivery = async (deliveryId: string, deliveryNumber: number) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus pengantaran #${deliveryNumber}? Stock akan dikembalikan.`)) {
      return
    }

    setIsDeleting(deliveryId)
    try {
      await deleteDelivery.mutateAsync(deliveryId)
      toast({
        title: "Pengantaran Berhasil Dihapus",
        description: `Pengantaran #${deliveryNumber} telah dihapus dan stock dikembalikan`,
      })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Gagal menghapus pengantaran"
      })
    } finally {
      setIsDeleting(null)
    }
  }

  const getStatusIcon = (delivered: number, total: number) => {
    if (delivered === 0) return <Clock className="h-4 w-4 text-yellow-500" />
    if (delivered >= total) return <CheckCircle className="h-4 w-4 text-green-500" />
    return <AlertCircle className="h-4 w-4 text-blue-500" />
  }

  const getStatusText = (delivered: number, total: number) => {
    if (delivered === 0) return "Belum Diantar"
    if (delivered >= total) return "Selesai"
    return "Sebagian"
  }

  const getStatusVariant = (delivered: number, total: number) => {
    if (delivered === 0) return "secondary"
    if (delivered >= total) return "success"
    return "default"
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Pengantaran - {transaction.customerName}
            </CardTitle>
            <CardDescription>
              Order #{transaction.id} • {format(transaction.orderDate, "d MMMM yyyy", { locale: idLocale })}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {transaction.deliveries.length > 0 && (
              <DeliveryNotePDF 
                delivery={transaction.deliveries[0]} 
                transactionInfo={transaction}
              >
                <Button variant="outline" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Cetak Surat Jalan
                </Button>
              </DeliveryNotePDF>
            )}
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
              <DialogTrigger asChild>
                <Button className="flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  Buat Pengantaran
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Buat Pengantaran Baru</DialogTitle>
                <DialogDescription>
                  Catat pengantaran untuk order #{transaction.id} - {transaction.customerName}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-6">
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-sm text-blue-700">
                    💡 <strong>Waktu pengantaran akan otomatis dicatat saat pengantaran disimpan</strong>
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="driverId">Supir *</Label>
                    <Select
                      value={formData.driverId}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, driverId: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih Supir" />
                      </SelectTrigger>
                      <SelectContent>
                        {employees?.filter(emp => emp.role?.toLowerCase() === 'supir').map((driver) => (
                          <SelectItem key={driver.id} value={driver.id}>
                            {driver.name} - {driver.position}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {isLoadingEmployees && <div className="text-sm text-muted-foreground">Loading employees...</div>}
                  </div>
                  <div>
                    <Label htmlFor="helperId">Helper (Opsional)</Label>
                    <Select
                      value={formData.helperId || "no-helper"}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, helperId: value === "no-helper" ? "" : value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih Helper" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no-helper">Tidak ada helper</SelectItem>
                        {employees?.filter(emp => ['helper', 'supir'].includes(emp.role?.toLowerCase())).map((helper) => (
                          <SelectItem key={helper.id} value={helper.id}>
                            {helper.name} - {helper.position}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>Item yang Diantar</Label>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produk</TableHead>
                        <TableHead>Dipesan</TableHead>
                        <TableHead>Sudah Diantar</TableHead>
                        <TableHead>Sisa</TableHead>
                        <TableHead>Antar Sekarang</TableHead>
                        <TableHead>Catatan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {formData.items.map((item, index) => (
                        <TableRow key={`form-item-${item.productId}-${index}`} className={item.isBonus ? "bg-orange-50" : ""}>
                          <TableCell>
                            <div>
                              <div className="flex items-center gap-2">
                                <Link 
                                  to={`/products/${item.productId}`}
                                  className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
                                >
                                  {item.productName}
                                </Link>
                                {item.isBonus && (
                                  <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-800 border-orange-300">
                                    BONUS
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{item.orderedQuantity} {item.unit}</TableCell>
                          <TableCell>{item.deliveredQuantity} {item.unit}</TableCell>
                          <TableCell>{item.remainingQuantity} {item.unit}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              max={item.remainingQuantity}
                              value={item.quantityToDeliver}
                              onChange={(e) => handleItemQuantityChange(item.itemId, parseInt(e.target.value) || 0)}
                              placeholder={`Maks: ${item.remainingQuantity}`}
                              className="w-20"
                            />
                            {item.quantityToDeliver > item.remainingQuantity && (
                              <p className="text-xs text-red-600 mt-1">
                                Melebihi sisa ({item.remainingQuantity})
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            <Input
                              value={item.notes}
                              onChange={(e) => handleItemNotesChange(item.itemId, e.target.value)}
                              placeholder="Catatan..."
                              className="w-32"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div>
                  <Label htmlFor="notes">Catatan Pengantaran</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Catatan tambahan untuk pengantaran ini..."
                    rows={3}
                  />
                </div>

                <div>
                  <Label>Foto Laporan Pengantaran (Opsional)</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoCapture}
                    className="mt-2"
                  />
                  {formData.photo && (
                    <div className="mt-2">
                      <p className="text-sm text-muted-foreground">
                        File terpilih: {formData.photo.name}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setFormData(prev => ({ ...prev, photo: undefined }))}
                        className="mt-1"
                      >
                        Hapus foto
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsOpen(false)}>
                  Batal
                </Button>
                <Button onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? "Menyimpan..." : "Simpan Pengantaran"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Delivery Summary */}
          <div>
            <h4 className="font-medium mb-3">Status Pengantaran</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produk</TableHead>
                  <TableHead>Dipesan</TableHead>
                  <TableHead>Diantar</TableHead>
                  <TableHead>Sisa</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transaction.deliverySummary.map((item, index) => (
                  <TableRow key={`summary-${item.productId}-${index}`}>
                    <TableCell>
                      <div>
                        <Link 
                          to={`/products/${item.productId}`}
                          className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {item.productName}
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell>{item.orderedQuantity} {item.unit}</TableCell>
                    <TableCell>{item.deliveredQuantity} {item.unit}</TableCell>
                    <TableCell>{item.remainingQuantity} {item.unit}</TableCell>
                    <TableCell>
                      <Badge 
                        variant={getStatusVariant(item.deliveredQuantity, item.orderedQuantity)}
                        className="flex items-center gap-1 w-fit"
                      >
                        {getStatusIcon(item.deliveredQuantity, item.orderedQuantity)}
                        {getStatusText(item.deliveredQuantity, item.orderedQuantity)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Delivery History */}
          {transaction.deliveries.length > 0 && (
            <div>
              <h4 className="font-medium mb-3">Riwayat Pengantaran</h4>
              <div className="space-y-3">
                {transaction.deliveries.map((delivery) => (
                  <Card key={delivery.id} className="border-l-4 border-l-blue-500">
                    <CardContent className="pt-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-medium">
                            Pengantaran #{delivery.deliveryNumber}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {format(delivery.deliveryDate, "d MMMM yyyy, HH:mm", { locale: idLocale })}
                            {delivery.driverId && ` • Supir: ${delivery.driverName || delivery.driverId}`}
                            {delivery.helperId && ` • Helper: ${delivery.helperName || delivery.helperId}`}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <DeliveryNotePDF delivery={delivery} transactionInfo={transaction} />
                          {delivery.photoUrl && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(delivery.photoUrl, '_blank')}
                            >
                              <Camera className="h-4 w-4 mr-1" />
                              Lihat Foto
                            </Button>
                          )}
                          {canDeleteDelivery && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDeleteDelivery(delivery.id, delivery.deliveryNumber)}
                              disabled={isDeleting === delivery.id}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              {isDeleting === delivery.id ? "Menghapus..." : "Hapus"}
                            </Button>
                          )}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm font-medium mb-1">Item Diantar:</div>
                          <ul className="text-sm text-muted-foreground space-y-1">
                            {delivery.items.map((item, index) => (
                              <li key={`delivery-item-${delivery.id}-${item.productId}-${index}`}>
                                <Link 
                                  to={`/products/${item.productId}`}
                                  className="text-blue-600 hover:text-blue-800 hover:underline"
                                >
                                  {item.productName}
                                </Link>
                                : {item.quantityDelivered} {item.unit}
                                {item.notes && (
                                  <span className="text-blue-600"> • {item.notes}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                        
                        {delivery.notes && (
                          <div>
                            <div className="text-sm font-medium mb-1">Catatan:</div>
                            <div className="text-sm text-muted-foreground">{delivery.notes}</div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}