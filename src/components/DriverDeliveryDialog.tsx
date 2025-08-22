"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import { Truck, Package, User, MapPin, Check } from "lucide-react"
import { Transaction } from "@/types/transaction"
import { useDrivers, Driver } from "@/hooks/useDrivers"
import { useDeliveries } from "@/hooks/useDeliveries"
import { CreateDeliveryRequest } from "@/types/delivery"
import { format } from "date-fns"
import { id as idLocale } from "date-fns/locale/id"

interface DriverDeliveryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction: Transaction
  onDeliveryComplete: () => void
}

export function DriverDeliveryDialog({
  open,
  onOpenChange,
  transaction,
  onDeliveryComplete
}: DriverDeliveryDialogProps) {
  const { toast } = useToast()
  const { drivers } = useDrivers()
  const { createDelivery } = useDeliveries()

  const [driverId, setDriverId] = useState("")
  const [helperId, setHelperId] = useState("")
  const [notes, setNotes] = useState("")
  const [itemQuantities, setItemQuantities] = useState<Record<string, number>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Initialize item quantities
  useEffect(() => {
    if (transaction?.items) {
      const initialQuantities: Record<string, number> = {}
      transaction.items.forEach((item, index) => {
        initialQuantities[`${item.product.id}_${index}`] = item.quantity
      })
      setItemQuantities(initialQuantities)
    }
  }, [transaction])

  const handleQuantityChange = (itemKey: string, quantity: number) => {
    setItemQuantities(prev => ({
      ...prev,
      [itemKey]: Math.max(0, quantity)
    }))
  }

  const handleSubmit = async () => {
    if (!driverId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Pilih supir terlebih dahulu"
      })
      return
    }

    // Validate at least one item has quantity > 0
    const hasItemsToDeliver = Object.values(itemQuantities).some(qty => qty > 0)
    if (!hasItemsToDeliver) {
      toast({
        variant: "destructive",
        title: "Error", 
        description: "Minimal satu item harus diantar"
      })
      return
    }

    setIsSubmitting(true)

    try {
      const selectedDriver = (drivers as Driver[])?.find((d: Driver) => d.id === driverId)
      const selectedHelper = helperId && helperId !== "no-helper" ? (drivers as Driver[])?.find((d: Driver) => d.id === helperId) : undefined

      // Create delivery items
      const deliveryItems: {
        productId: string;
        productName: string;
        quantityDelivered: number;
        unit: string;
        notes?: string;
      }[] = []
      transaction.items.forEach((item, index) => {
        const itemKey = `${item.product.id}_${index}`
        const quantityToDeliver = itemQuantities[itemKey] || 0
        
        if (quantityToDeliver > 0) {
          deliveryItems.push({
            productId: item.product.id,
            productName: item.product.name,
            quantityDelivered: quantityToDeliver,
            unit: item.unit,
            notes: item.notes || ""
          })
        }
      })

      const deliveryRequest: CreateDeliveryRequest = {
        transactionId: transaction.id,
        driverId: selectedDriver?.id,
        helperId: selectedHelper?.id || undefined,
        deliveryDate: new Date(),
        items: deliveryItems,
        notes: notes.trim() || undefined
      }

      await createDelivery.mutateAsync(deliveryRequest)

      toast({
        title: "Pengantaran Berhasil",
        description: `Pengantaran untuk transaksi ${transaction.id} berhasil dibuat`
      })

      onDeliveryComplete()

    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Gagal membuat pengantaran"
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const totalItemsOrdered = transaction.items?.reduce((sum, item) => sum + item.quantity, 0) || 0
  const totalItemsToDeliver = Object.values(itemQuantities).reduce((sum, qty) => sum + qty, 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Buat Pengantaran
          </DialogTitle>
          <DialogDescription>
            Transaksi {transaction.id} - {transaction.customerName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Transaction Info */}
          <Card className="bg-blue-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="h-4 w-4" />
                Info Transaksi
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div className="flex justify-between">
                <span>Tanggal:</span>
                <span>{format(transaction.orderDate, "d MMM yyyy, HH:mm", { locale: idLocale })}</span>
              </div>
              <div className="flex justify-between">
                <span>Total:</span>
                <span className="font-medium text-green-600">
                  {new Intl.NumberFormat("id-ID", {
                    style: "currency",
                    currency: "IDR",
                    minimumFractionDigits: 0
                  }).format(transaction.total)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Driver & Helper */}
          <div className="space-y-3">
            <div>
              <Label className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Supir *
              </Label>
              <Select value={driverId} onValueChange={setDriverId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih Supir" />
                </SelectTrigger>
                <SelectContent>
                  {(drivers as Driver[])?.map((driver: Driver) => (
                    <SelectItem key={driver.id} value={driver.id}>
                      {driver.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Helper (Opsional)</Label>
              <Select value={helperId} onValueChange={setHelperId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih Helper" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no-helper">Tidak ada helper</SelectItem>
                  {(drivers as Driver[])?.map((driver: Driver) => (
                    <SelectItem key={driver.id} value={driver.id}>
                      {driver.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

          </div>

          {/* Items to Deliver */}
          <div>
            <Label className="flex items-center gap-2 mb-3">
              <Package className="h-4 w-4" />
              Item yang Diantar
            </Label>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {transaction.items?.map((item, index) => {
                const itemKey = `${item.product.id}_${index}`
                const quantityToDeliver = itemQuantities[itemKey] || 0
                
                return (
                  <div key={itemKey} className="bg-gray-50 p-3 rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{item.product.name}</div>
                        <div className="text-xs text-muted-foreground">
                          Dipesan: {item.quantity} {item.unit}
                        </div>
                        {item.notes && (
                          <div className="text-xs text-blue-600 mt-1">{item.notes}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">Antar:</Label>
                      <Input
                        type="number"
                        value={quantityToDeliver}
                        onChange={(e) => handleQuantityChange(itemKey, parseInt(e.target.value) || 0)}
                        min="0"
                        max={item.quantity}
                        className="h-8 text-sm"
                      />
                      <span className="text-xs text-muted-foreground">{item.unit}</span>
                    </div>
                  </div>
                )
              })}
            </div>
            
            {/* Delivery Summary */}
            <div className="bg-blue-50 p-3 rounded-lg mt-3">
              <div className="flex justify-between text-sm">
                <span>Total Dipesan:</span>
                <span className="font-medium">{totalItemsOrdered} item</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Total Diantar:</span>
                <span className="font-medium text-blue-600">{totalItemsToDeliver} item</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label>Catatan Pengantaran</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Catatan tambahan untuk pengantaran..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Batal
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !driverId}
            className="bg-green-600 hover:bg-green-700"
          >
            <Check className="h-4 w-4 mr-2" />
            {isSubmitting ? "Memproses..." : "Buat Pengantaran"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}