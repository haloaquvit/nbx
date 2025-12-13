import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { PurchaseOrder } from "@/types/purchaseOrder"
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders"
import { toast } from "sonner"

interface ReceivePODialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  purchaseOrder: PurchaseOrder | null
}

export function ReceivePODialog({ open, onOpenChange, purchaseOrder }: ReceivePODialogProps) {
  const [notes, setNotes] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { receivePurchaseOrder } = usePurchaseOrders()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!purchaseOrder) return

    setIsSubmitting(true)

    try {
      // Receive PO - this will:
      // 1. Add stock to material
      // 2. Create material movement record
      // 3. Update PO status to "Selesai"
      const poWithNotes = { ...purchaseOrder, notes: notes || purchaseOrder.notes }
      await receivePurchaseOrder.mutateAsync(poWithNotes)

      toast.success("Barang berhasil diterima dan stock telah ditambahkan")
      onOpenChange(false)

      // Reset form
      setNotes("")

    } catch (error) {
      console.error('Error receiving PO:', error)
      toast.error("Gagal menerima barang: " + (error instanceof Error ? error.message : "Terjadi kesalahan"))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!purchaseOrder) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Terima Barang - PO #{purchaseOrder.id}</DialogTitle>
          <DialogDescription>
            Tandai purchase order ini sebagai "Diterima" setelah barang sampai
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* PO Info */}
          <div className="bg-muted p-3 rounded-lg">
            <h4 className="font-medium mb-2">Detail Purchase Order</h4>
            <div className="text-sm space-y-1">
              <div>Material: <span className="font-medium">{purchaseOrder.materialName}</span></div>
              <div>Jumlah Pesanan: <span className="font-medium">{purchaseOrder.quantity} {purchaseOrder.unit}</span></div>
              <div>Supplier: <span className="font-medium">{purchaseOrder.supplierName || 'Tidak ada'}</span></div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Catatan Tambahan</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Catatan tambahan mengenai penerimaan barang..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Menyimpan..." : "Terima Barang"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}