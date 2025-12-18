import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon } from "lucide-react"
import { format } from "date-fns"
import { id } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { PurchaseOrder, PurchaseOrderItem } from "@/types/purchaseOrder"
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders"
import { toast } from "sonner"
import { supabase } from "@/integrations/supabase/client"

interface ReceivePODialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  purchaseOrder: PurchaseOrder | null
}

export function ReceivePODialog({ open, onOpenChange, purchaseOrder }: ReceivePODialogProps) {
  const [notes, setNotes] = useState("")
  const [receivedDate, setReceivedDate] = useState<Date>(new Date())
  const [paymentDate, setPaymentDate] = useState<Date | undefined>(undefined)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [poItems, setPoItems] = useState<PurchaseOrderItem[]>([])
  const [isLoadingItems, setIsLoadingItems] = useState(false)

  const { receivePurchaseOrder } = usePurchaseOrders()

  // Fetch PO items when dialog opens
  useEffect(() => {
    const fetchPoItems = async () => {
      if (!purchaseOrder || !open) return

      setIsLoadingItems(true)
      try {
        const { data, error } = await supabase
          .from('purchase_order_items')
          .select(`
            id,
            material_id,
            quantity,
            unit_price,
            quantity_received,
            notes,
            materials:material_id (
              name,
              unit
            )
          `)
          .eq('purchase_order_id', purchaseOrder.id)

        if (error) throw error

        if (data && data.length > 0) {
          const items: PurchaseOrderItem[] = data.map((item: any) => ({
            id: item.id,
            materialId: item.material_id,
            materialName: item.materials?.name,
            unit: item.materials?.unit,
            quantity: item.quantity,
            unitPrice: item.unit_price,
            quantityReceived: item.quantity_received,
            notes: item.notes,
          }))
          setPoItems(items)
        } else if (purchaseOrder.materialId) {
          // Fallback to legacy single-item
          setPoItems([{
            materialId: purchaseOrder.materialId,
            materialName: purchaseOrder.materialName,
            unit: purchaseOrder.unit,
            quantity: purchaseOrder.quantity || 0,
            unitPrice: purchaseOrder.unitPrice || 0,
          }])
        }
      } catch (error) {
        console.error('Error fetching PO items:', error)
        toast.error("Gagal memuat item PO")
      } finally {
        setIsLoadingItems(false)
      }
    }

    fetchPoItems()
  }, [purchaseOrder, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!purchaseOrder) return

    setIsSubmitting(true)

    try {
      // Receive PO - this will:
      // 1. Add stock to material
      // 2. Create material movement record
      // 3. Update PO status to "Diterima"
      // 4. Set received_date
      const poWithData = {
        ...purchaseOrder,
        notes: notes || purchaseOrder.notes,
        receivedDate,
      }
      await receivePurchaseOrder.mutateAsync(poWithData)

      toast.success("Barang berhasil diterima dan stock telah ditambahkan")
      onOpenChange(false)

      // Reset form
      setNotes("")
      setReceivedDate(new Date())
      setPaymentDate(undefined)

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
            <div className="text-sm space-y-2">
              <div>Supplier: <span className="font-medium">{purchaseOrder.supplierName || 'Tidak ada'}</span></div>
              <div>
                <div className="font-medium mb-1">Item yang Dipesan:</div>
                {isLoadingItems ? (
                  <div className="text-muted-foreground">Memuat...</div>
                ) : poItems.length > 0 ? (
                  <ul className="space-y-1 ml-4">
                    {poItems.map((item, index) => (
                      <li key={item.id || index} className="text-sm">
                        • {item.materialName} - {item.quantity} {item.unit}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-muted-foreground">Tidak ada item</div>
                )}
              </div>
            </div>
          </div>

          {/* Received Date */}
          <div className="space-y-2">
            <Label>Tanggal Barang Diterima</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !receivedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {receivedDate ? (
                    format(receivedDate, "PPP", { locale: id })
                  ) : (
                    <span>Pilih tanggal diterima</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={receivedDate}
                  onSelect={(date) => date && setReceivedDate(date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Payment Date */}
          <div className="space-y-2">
            <Label>Tanggal Nota Dibayar (Opsional)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !paymentDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {paymentDate ? (
                    format(paymentDate, "PPP", { locale: id })
                  ) : (
                    <span>Pilih tanggal pembayaran (jika sudah dibayar)</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={paymentDate}
                  onSelect={(date) => setPaymentDate(date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
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