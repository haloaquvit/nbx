import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon, Upload, X } from "lucide-react"
import { format } from "date-fns"
import { id } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { PurchaseOrder } from "@/types/purchaseOrder"
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders"
import { toast } from "sonner"

interface ReceivePODialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  purchaseOrder: PurchaseOrder | null
}

export function ReceivePODialog({ open, onOpenChange, purchaseOrder }: ReceivePODialogProps) {
  const [receivedDate, setReceivedDate] = useState<Date>(new Date())
  const [receivedQuantity, setReceivedQuantity] = useState<number>(purchaseOrder?.quantity || 0)
  const [receivedBy, setReceivedBy] = useState("")
  const [expeditionReceiver, setExpeditionReceiver] = useState("")
  const [deliveryNotePhoto, setDeliveryNotePhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string>("")
  const [notes, setNotes] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { updatePoStatus } = usePurchaseOrders()

  const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setDeliveryNotePhoto(file)
      const reader = new FileReader()
      reader.onload = (e) => {
        setPhotoPreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const removePhoto = () => {
    setDeliveryNotePhoto(null)
    setPhotoPreview("")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!purchaseOrder) return
    
    if (!receivedBy.trim()) {
      toast.error("Nama penerima harus diisi")
      return
    }

    if (receivedQuantity <= 0) {
      toast.error("Jumlah barang yang diterima harus lebih dari 0")
      return
    }

    if (receivedQuantity > purchaseOrder.quantity) {
      toast.error("Jumlah yang diterima tidak boleh melebihi jumlah yang dipesan")
      return
    }

    setIsSubmitting(true)
    
    try {
      // TODO: Upload photo to storage if exists
      let photoUrl = ""
      if (deliveryNotePhoto) {
        // For now, we'll store the file name. In production, upload to Supabase storage
        photoUrl = deliveryNotePhoto.name
      }

      // Update PO with received information
      await updatePoStatus.mutateAsync({
        poId: purchaseOrder.id,
        status: 'Diterima',
        updateData: {
          receivedDate,
          receivedQuantity,
          receivedBy,
          expeditionReceiver,
          deliveryNotePhoto: photoUrl,
          notes
        }
      })

      toast.success("Barang berhasil diterima dan dicatat")
      onOpenChange(false)
      
      // Reset form
      setReceivedDate(new Date())
      setReceivedQuantity(0)
      setReceivedBy("")
      setExpeditionReceiver("")
      setDeliveryNotePhoto(null)
      setPhotoPreview("")
      setNotes("")
      
    } catch (error) {
      console.error('Error receiving PO:', error)
      toast.error("Gagal mencatat penerimaan barang")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Reset form when dialog opens with new PO
  useState(() => {
    if (purchaseOrder && open) {
      setReceivedQuantity(purchaseOrder.quantity)
    }
  }, [purchaseOrder, open])

  if (!purchaseOrder) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Penerimaan Barang - PO #{purchaseOrder.id}</DialogTitle>
          <DialogDescription>
            Catat detail penerimaan barang untuk purchase order ini
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

          {/* Received Date */}
          <div className="space-y-2">
            <Label htmlFor="receivedDate">Tanggal Diterima *</Label>
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
                  {receivedDate ? format(receivedDate, "PPP", { locale: id }) : "Pilih tanggal"}
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

          {/* Received Quantity */}
          <div className="space-y-2">
            <Label htmlFor="receivedQuantity">Jumlah Diterima *</Label>
            <div className="flex gap-2">
              <Input
                id="receivedQuantity"
                type="number"
                value={receivedQuantity}
                onChange={(e) => setReceivedQuantity(Number(e.target.value))}
                min="0"
                max={purchaseOrder.quantity}
                className="flex-1"
              />
              <div className="flex items-center text-sm text-muted-foreground px-3 border rounded-md bg-muted">
                {purchaseOrder.unit}
              </div>
            </div>
          </div>

          {/* Received By */}
          <div className="space-y-2">
            <Label htmlFor="receivedBy">Nama Penerima *</Label>
            <Input
              id="receivedBy"
              value={receivedBy}
              onChange={(e) => setReceivedBy(e.target.value)}
              placeholder="Masukkan nama penerima"
            />
          </div>

          {/* Expedition Receiver */}
          <div className="space-y-2">
            <Label htmlFor="expeditionReceiver">Nama Penerima dari Ekspedisi</Label>
            <Input
              id="expeditionReceiver"
              value={expeditionReceiver}
              onChange={(e) => setExpeditionReceiver(e.target.value)}
              placeholder="Masukkan nama penerima dari ekspedisi"
            />
          </div>

          {/* Delivery Note Photo */}
          <div className="space-y-2">
            <Label>Foto Surat Jalan</Label>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => document.getElementById('photo-upload')?.click()}
                  className="w-full"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {deliveryNotePhoto ? 'Ganti Foto' : 'Upload Foto Surat Jalan'}
                </Button>
                <input
                  id="photo-upload"
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </div>
              
              {photoPreview && (
                <div className="relative inline-block">
                  <img
                    src={photoPreview}
                    alt="Preview surat jalan"
                    className="max-w-full h-32 object-cover rounded-lg border"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0"
                    onClick={removePhoto}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
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