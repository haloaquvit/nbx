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
import { Factory, Hash, FileText, Loader2, AlertTriangle } from "lucide-react"
import { useProduction } from "@/hooks/useProduction"
import { useProducts } from "@/hooks/useProducts"
import { useAuth } from "@/hooks/useAuth"
import { useToast } from "@/components/ui/use-toast"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"

interface MobileRequestProductionSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  productId?: string
}

export function MobileRequestProductionSheet({ open, onOpenChange, productId }: MobileRequestProductionSheetProps) {
  const { products } = useProducts()
  const { processProduction, getBOM, isLoading: isProductionLoading } = useProduction()
  const { user } = useAuth()
  const { toast } = useToast()

  const [quantity, setQuantity] = React.useState<string>("1")
  const [notes, setNotes] = React.useState<string>("")
  const [consumeBOM, setConsumeBOM] = React.useState<boolean>(true)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [bomItems, setBomItems] = React.useState<any[]>([])
  const [isLoadingBOM, setIsLoadingBOM] = React.useState(false)

  const selectedProduct = products?.find(p => p.id === productId)

  // Load BOM when product is selected
  React.useEffect(() => {
    const loadBOM = async () => {
      if (productId && open) {
        setIsLoadingBOM(true)
        try {
          const bom = await getBOM(productId)
          setBomItems(bom)
        } catch (error) {
          console.error('Error loading BOM:', error)
        } finally {
          setIsLoadingBOM(false)
        }
      }
    }
    loadBOM()
  }, [productId, open, getBOM])

  // Reset form when sheet closes
  React.useEffect(() => {
    if (!open) {
      setQuantity("1")
      setNotes("")
      setConsumeBOM(true)
      setBomItems([])
    }
  }, [open])

  const qty = parseFloat(quantity) || 0

  const handleSubmit = async () => {
    if (!user?.id) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "User tidak ditemukan"
      })
      return
    }

    if (!productId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Pilih produk terlebih dahulu"
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

    try {
      const success = await processProduction({
        productId: productId,
        quantity: qty,
        note: notes || undefined,
        consumeBOM: consumeBOM,
        createdBy: user.id,
      })

      if (success) {
        onOpenChange(false)
      }
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
            <Factory className="h-5 w-5" />
            Proses Produksi
          </SheetTitle>
          <SheetDescription>
            Buat record produksi untuk menambah stok produk
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 overflow-y-auto pb-20" style={{ maxHeight: 'calc(85vh - 180px)' }}>
          {/* Selected Product Info */}
          {selectedProduct && (
            <Card className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold dark:text-white">{selectedProduct.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Stok: {selectedProduct.currentStock} {selectedProduct.unit}
                    </p>
                  </div>
                  <Badge className="bg-amber-500">Produksi</Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quantity */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-muted-foreground" />
              Jumlah Produksi {selectedProduct?.unit ? `(${selectedProduct.unit})` : ''}
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

          {/* Consume BOM Checkbox */}
          <div className="flex items-center space-x-3 p-3 border rounded-lg dark:border-gray-700">
            <Checkbox
              id="consumeBOM"
              checked={consumeBOM}
              onCheckedChange={(checked) => setConsumeBOM(checked as boolean)}
            />
            <div className="flex-1">
              <Label htmlFor="consumeBOM" className="cursor-pointer font-medium">
                Kurangi Bahan Baku (BOM)
              </Label>
              <p className="text-xs text-muted-foreground">
                Stok bahan baku akan dikurangi sesuai resep
              </p>
            </div>
          </div>

          {/* BOM Preview */}
          {consumeBOM && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Bahan yang Dibutuhkan:</Label>
              {isLoadingBOM ? (
                <div className="text-center py-4 text-muted-foreground">
                  <Loader2 className="h-5 w-5 mx-auto animate-spin" />
                  <p className="text-sm mt-2">Memuat BOM...</p>
                </div>
              ) : bomItems.length === 0 ? (
                <Card className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
                  <CardContent className="p-3 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <p className="text-sm text-yellow-700 dark:text-yellow-400">
                      Produk ini belum memiliki BOM (Bill of Materials)
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {bomItems.map((item) => {
                    const requiredQty = item.quantity * qty
                    return (
                      <Card key={item.id} className="dark:bg-gray-800">
                        <CardContent className="p-3 flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm dark:text-white">{item.materialName}</p>
                            <p className="text-xs text-muted-foreground">{item.unit}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-amber-600 dark:text-amber-400">
                              {requiredQty.toFixed(2)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              ({item.quantity} × {qty})
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </div>
          )}

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

          {/* Summary */}
          <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
            <CardContent className="p-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Hasil Produksi</span>
                <span className="text-xl font-bold text-green-600 dark:text-green-400">
                  +{qty} {selectedProduct?.unit || 'pcs'}
                </span>
              </div>
              {selectedProduct && (
                <p className="text-xs text-muted-foreground mt-2">
                  Stok akan bertambah: {selectedProduct.currentStock} → {selectedProduct.currentStock + qty} {selectedProduct.unit}
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
              disabled={isSubmitting || isProductionLoading}
            >
              Batal
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || isProductionLoading || !productId || qty <= 0}
              className="flex-1 h-12 bg-amber-600 hover:bg-amber-700"
            >
              {isSubmitting || isProductionLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Memproses...
                </>
              ) : (
                <>
                  <Factory className="h-4 w-4 mr-2" />
                  Proses Produksi
                </>
              )}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
