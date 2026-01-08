"use client"

import { useState, useEffect } from "react"
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
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"
import { Pencil } from "lucide-react"
import { Delivery } from "@/types/delivery"
import { useDeliveries, useDeliveryEmployees } from "@/hooks/useDeliveries"

interface EditDeliveryDialogProps {
  delivery: Delivery
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditDeliveryDialog({ delivery, open, onOpenChange }: EditDeliveryDialogProps) {
  const { toast } = useToast()
  const { updateDelivery } = useDeliveries()
  const { data: employees, isLoading: isLoadingEmployees } = useDeliveryEmployees()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [driverId, setDriverId] = useState(delivery.driverId || "")
  const [helperId, setHelperId] = useState(delivery.helperId || "")
  const [notes, setNotes] = useState(delivery.notes || "")
  const [items, setItems] = useState<Array<{
    id: string
    productId: string
    productName: string
    quantityDelivered: number
    unit: string
    notes: string
    isBonus?: boolean
  }>>([])

  // Reset form when delivery changes
  useEffect(() => {
    if (delivery) {
      setDriverId(delivery.driverId || "")
      setHelperId(delivery.helperId || "")
      setNotes(delivery.notes || "")
      setItems(delivery.items.map(item => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        quantityDelivered: item.quantityDelivered,
        unit: item.unit,
        notes: item.notes || "",
        isBonus: item.isBonus
      })))
    }
  }, [delivery])

  const handleItemQuantityChange = (itemId: string, quantity: number) => {
    setItems(prev => prev.map(item =>
      item.id === itemId
        ? { ...item, quantityDelivered: Math.max(0, quantity) }
        : item
    ))
  }

  const handleItemNotesChange = (itemId: string, notes: string) => {
    setItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, notes } : item
    ))
  }

  const handleSubmit = async () => {
    // Validate at least one item has quantity > 0
    const hasValidItems = items.some(item => item.quantityDelivered > 0)
    if (!hasValidItems) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Minimal satu item harus memiliki jumlah > 0"
      })
      return
    }

    setIsSubmitting(true)
    try {
      await updateDelivery.mutateAsync({
        id: delivery.id, // Fixed: deliveryId -> id
        driverId: (!driverId || driverId === "no-driver") ? null : driverId, // Handle null
        helperId: (!helperId || helperId === "no-helper") ? undefined : helperId,
        notes,
        items: items.map(item => ({
          productId: item.productId,
          productName: item.productName,
          quantityDelivered: item.quantityDelivered,
          unit: item.unit,
          notes: item.notes,
          isBonus: item.isBonus
        }))
      })

      toast({
        title: "Sukses",
        description: `Pengantaran #${delivery.deliveryNumber} berhasil diupdate`
      })

      onOpenChange(false)
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Gagal mengupdate pengantaran"
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            Edit Pengantaran #{delivery.deliveryNumber}
          </DialogTitle>
          <DialogDescription>
            Edit data pengantaran. Perubahan jumlah akan menyesuaikan stok otomatis.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          {/* Driver & Helper */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="driverId">Supir *</Label>
              <Select value={driverId || "no-driver"} onValueChange={setDriverId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih Supir" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no-driver">Tanpa Supir</SelectItem>
                  {employees?.filter(emp => emp.role?.toLowerCase() === 'supir').map((driver) => (
                    <SelectItem key={driver.id} value={driver.id}>
                      {driver.name} - {driver.position}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isLoadingEmployees && <div className="text-sm text-muted-foreground">Loading...</div>}
            </div>
            <div>
              <Label htmlFor="helperId">Helper (Opsional)</Label>
              <Select
                value={helperId || "no-helper"}
                onValueChange={(value) => setHelperId(value === "no-helper" ? "" : value)}
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

          {/* Items */}
          <div>
            <Label>Item Pengantaran</Label>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produk</TableHead>
                  <TableHead>Jumlah</TableHead>
                  <TableHead>Satuan</TableHead>
                  <TableHead>Catatan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.productName}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        value={item.quantityDelivered}
                        onChange={(e) => handleItemQuantityChange(item.id, parseInt(e.target.value) || 0)}
                        className="w-24"
                      />
                    </TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell>
                      <Input
                        value={item.notes}
                        onChange={(e) => handleItemNotesChange(item.id, e.target.value)}
                        placeholder="Catatan..."
                        className="w-32"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes">Catatan Pengantaran</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Catatan tambahan..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
