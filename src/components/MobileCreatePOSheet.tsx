"use client"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Package, Building2, Hash, DollarSign, FileText, Loader2 } from "lucide-react"
import { useMaterials } from "@/hooks/useMaterials"
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders"
import { useSuppliers } from "@/hooks/useSuppliers"
import { useAuth } from "@/hooks/useAuth"
import { useToast } from "@/components/ui/use-toast"
import { Card, CardContent } from "@/components/ui/card"

interface MobileCreatePOSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  materialId?: string
}

export function MobileCreatePOSheet({ open, onOpenChange, materialId }: MobileCreatePOSheetProps) {
  const { materials } = useMaterials()
  const { createPurchaseOrder } = usePurchaseOrders()
  const { activeSuppliers } = useSuppliers()
  const { user } = useAuth()
  const { toast } = useToast()

  const [selectedMaterialId, setSelectedMaterialId] = React.useState<string>("")
  const [selectedSupplierId, setSelectedSupplierId] = React.useState<string>("")
  const [quantity, setQuantity] = React.useState<string>("1")
  const [unitPrice, setUnitPrice] = React.useState<string>("0")
  const [notes, setNotes] = React.useState<string>("")
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  // Auto-select material if materialId prop is provided
  React.useEffect(() => {
    if (materialId && open) {
      setSelectedMaterialId(materialId)
    }
  }, [materialId, open])

  // Reset form when dialog closes
  React.useEffect(() => {
    if (!open) {
      setSelectedMaterialId("")
      setSelectedSupplierId("")
      setQuantity("1")
      setUnitPrice("0")
      setNotes("")
    }
  }, [open])

  const selectedMaterial = materials?.find(m => m.id === selectedMaterialId)
  const selectedSupplier = activeSuppliers?.find(s => s.id === selectedSupplierId)

  const qty = parseFloat(quantity) || 0
  const price = parseFloat(unitPrice) || 0
  const totalCost = qty * price

  const handleSubmit = async () => {
    if (!user?.name) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "User tidak ditemukan"
      })
      return
    }

    if (!selectedMaterialId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Pilih material terlebih dahulu"
      })
      return
    }

    if (!selectedSupplierId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Pilih supplier terlebih dahulu"
      })
      return
    }

    if (qty <= 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Jumlah harus lebih dari 0"
      })
      return
    }

    setIsSubmitting(true)

    const poData = {
      includePpn: false,
      ppnMode: 'exclude' as const,
      ppnAmount: 0,
      subtotal: totalCost,
      totalCost: totalCost,
      requestedBy: user.name,
      status: 'Pending' as const,
      supplierId: selectedSupplierId,
      supplierName: selectedSupplier?.name || '',
      orderDate: new Date(),
      notes: notes,
      items: [{
        materialId: selectedMaterialId,
        materialName: selectedMaterial?.name,
        unit: selectedMaterial?.unit,
        quantity: qty,
        unitPrice: price,
        itemType: 'material' as const,
        notes: '',
      }],
    }

    try {
      await createPurchaseOrder.mutateAsync(poData)
      toast({
        title: "Sukses",
        description: "Purchase Order berhasil dibuat"
      })
      onOpenChange(false)
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Gagal",
        description: error instanceof Error ? error.message : "Terjadi kesalahan"
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-xl">
        <SheetHeader className="text-left pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Pesan Bahan Baku
          </SheetTitle>
          <SheetDescription>
            Buat Purchase Order untuk mengisi stok
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 overflow-y-auto pb-20" style={{ maxHeight: 'calc(85vh - 180px)' }}>
          {/* Material Selection */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              Material
            </Label>
            <Select value={selectedMaterialId} onValueChange={setSelectedMaterialId}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder="Pilih material..." />
              </SelectTrigger>
              <SelectContent>
                {materials?.filter(m => m.type === 'Stock').map((material) => (
                  <SelectItem key={material.id} value={material.id}>
                    <div className="flex flex-col">
                      <span>{material.name}</span>
                      <span className="text-xs text-muted-foreground">
                        Stok: {material.stock} {material.unit} | Min: {material.minStock || 0}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Supplier Selection */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Supplier
            </Label>
            <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder="Pilih supplier..." />
              </SelectTrigger>
              <SelectContent>
                {activeSuppliers?.map((supplier) => (
                  <SelectItem key={supplier.id} value={supplier.id}>
                    {supplier.code} - {supplier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quantity */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-muted-foreground" />
              Jumlah {selectedMaterial?.unit ? `(${selectedMaterial.unit})` : ''}
            </Label>
            <Input
              type="number"
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Masukkan jumlah"
              className="h-12 text-lg"
            />
          </div>

          {/* Unit Price */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              Harga Satuan (Rp)
            </Label>
            <Input
              type="number"
              inputMode="numeric"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              placeholder="Masukkan harga"
              className="h-12 text-lg"
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Catatan (opsional)
            </Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Catatan tambahan..."
              className="h-12"
            />
          </div>

          {/* Total Summary */}
          <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
            <CardContent className="p-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Total Pesanan</span>
                <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
                  Rp {totalCost.toLocaleString('id-ID')}
                </span>
              </div>
              {selectedMaterial && (
                <p className="text-xs text-muted-foreground mt-2">
                  {selectedMaterial.name} × {qty} {selectedMaterial.unit}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <SheetFooter className="absolute bottom-0 left-0 right-0 p-4 bg-white dark:bg-gray-900 border-t">
          <div className="flex gap-3 w-full">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 h-12"
              disabled={isSubmitting}
            >
              Batal
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !selectedMaterialId || !selectedSupplierId || qty <= 0}
              className="flex-1 h-12 bg-blue-600 hover:bg-blue-700"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Membuat...
                </>
              ) : (
                'Buat PO'
              )}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
