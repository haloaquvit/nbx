"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { TransactionDeliveryInfo, DeliveryFormData, Delivery } from "@/types/delivery"
import { useDeliveries, useDeliveryEmployees } from "@/hooks/useDeliveries"

interface DeliveryFormContentProps {
  transaction: TransactionDeliveryInfo;
  onSuccess?: () => void;
  onDeliveryCreated?: (delivery: Delivery, transaction: TransactionDeliveryInfo) => void;
}

export function DeliveryFormContent({ transaction, onSuccess, onDeliveryCreated }: DeliveryFormContentProps) {
  const { toast } = useToast()
  const { createDelivery } = useDeliveries()
  const { data: employees, isLoading: isLoadingEmployees } = useDeliveryEmployees()
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const [formData, setFormData] = useState<DeliveryFormData>(() => ({
    transactionId: transaction.id,
    deliveryDate: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    notes: "",
    driverId: "",
    helperId: "",
    items: transaction.deliverySummary.map((item, index) => ({
      itemId: `${item.productId}-${index}`, // Unique identifier per row
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
  }))
  
  // FIX: Update form items when transaction.deliverySummary changes (e.g., after delivery deletion)
  useEffect(() => {
    console.log('🔄 Updating form data due to transaction change:', {
      transactionId: transaction.id,
      deliverySummaryCount: transaction.deliverySummary.length,
      summary: transaction.deliverySummary.map(item => ({
        name: item.productName,
        remaining: item.remainingQuantity
      }))
    })
    
    setFormData(prev => ({
      ...prev,
      items: transaction.deliverySummary.map((item, index) => {
        // Try to preserve existing quantityToDeliver if item exists
        const existingItem = prev.items.find(existing => 
          existing.productId === item.productId && existing.productName === item.productName
        )
        
        return {
          itemId: `${item.productId}-${index}`,
          productId: item.productId,
          productName: item.productName,
          isBonus: item.productName.includes("BONUS") || item.productName.includes("(BONUS)"),
          orderedQuantity: item.orderedQuantity,
          deliveredQuantity: item.deliveredQuantity,
          remainingQuantity: item.remainingQuantity,
          quantityToDeliver: existingItem ? Math.min(existingItem.quantityToDeliver, item.remainingQuantity) : 0,
          unit: item.unit,
          width: item.width,
          height: item.height,
          notes: existingItem?.notes || "",
        }
      })
    }))
  }, [transaction.deliverySummary])

  const handleItemQuantityChange = (itemId: string, quantityToDeliver: number) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map(item => {
        if (item.itemId === itemId) {
          // Enforce strict limit: cannot exceed remaining quantity
          const clampedQuantity = Math.max(0, Math.min(quantityToDeliver, item.remainingQuantity))

          // Show toast warning if user tries to exceed limit
          if (quantityToDeliver > item.remainingQuantity) {
            toast({
              variant: "destructive",
              title: "Jumlah Melebihi Batas",
              description: `Jumlah antar untuk ${item.productName} tidak boleh melebihi sisa pesanan (${item.remainingQuantity} ${item.unit})`,
            })
          }

          console.log(`📦 Updating quantity for ${item.productName}:`, {
            requested: quantityToDeliver,
            remaining: item.remainingQuantity,
            clamped: clampedQuantity
          })

          return { ...item, quantityToDeliver: clampedQuantity }
        }
        return item
      })
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
      const deliveryItems = itemsToDeliver.map(item => ({
        productId: item.productId,
        productName: item.productName,
        quantityDelivered: item.quantityToDeliver,
        unit: item.unit,
        width: item.width,
        height: item.height,
        notes: item.notes || undefined,
      }))

      const result = await createDelivery.mutateAsync({
        transactionId: formData.transactionId,
        deliveryDate: new Date(formData.deliveryDate), // Use user's selected delivery date and time
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

      // Call the completion dialog callback if provided
      if (onDeliveryCreated && result) {
        onDeliveryCreated(result as Delivery, transaction)
      }

      onSuccess?.()
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

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label htmlFor="deliveryDate">Waktu Pengantaran</Label>
          <Input
            id="deliveryDate"
            type="datetime-local"
            value={formData.deliveryDate}
            onChange={(e) => setFormData(prev => ({ ...prev, deliveryDate: e.target.value }))}
          />
        </div>
        <div>
          <Label>Supir *</Label>
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
          <Label>Helper (Opsional)</Label>
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
              <TableRow key={item.itemId} className={item.isBonus ? "bg-orange-50" : ""}>
                <TableCell>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.productName}</span>
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
                  <div className="space-y-1">
                    <Input
                      type="number"
                      min="0"
                      max={item.remainingQuantity}
                      value={item.quantityToDeliver}
                      onChange={(e) => handleItemQuantityChange(item.itemId, parseInt(e.target.value) || 0)}
                      placeholder={`0`}
                      className={`w-24 ${item.quantityToDeliver > item.remainingQuantity ? 'border-red-500' : ''}`}
                      disabled={item.remainingQuantity === 0}
                    />
                    <p className="text-xs text-muted-foreground">
                      Maks: {item.remainingQuantity} {item.unit}
                    </p>
                  </div>
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

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
        <Button 
          onClick={handleSubmit} 
          disabled={isSubmitting}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {isSubmitting ? "Menyimpan..." : "Simpan Pengantaran"}
        </Button>
      </div>
    </div>
  )
}