"use client"
import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CalendarIcon, Plus } from "lucide-react"
import { format } from "date-fns"
import { id } from "date-fns/locale/id"
import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useMaterials } from "@/hooks/useMaterials"
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders"
import { useSuppliers } from "@/hooks/useSuppliers"
import { useAuth } from "@/hooks/useAuth"
import { useToast } from "@/components/ui/use-toast"

const formSchema = z.object({
  materialId: z.string().min(1, "Material harus dipilih"),
  quantity: z.number().min(1, "Jumlah minimal 1"),
  unitPrice: z.number().min(0, "Harga satuan tidak boleh negatif").optional(),
  supplierId: z.string().min(1, "Supplier harus dipilih"),
  quotedPrice: z.number().min(0, "Harga quote tidak boleh negatif"),
  expedition: z.string().optional(),
  expectedDeliveryDate: z.date().optional(),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

interface CreatePurchaseOrderDialogProps {
  materialId?: string
  children?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function CreatePurchaseOrderDialog({ materialId, children, open: externalOpen, onOpenChange: externalOnOpenChange }: CreatePurchaseOrderDialogProps) {
  const [internalOpen, setInternalOpen] = React.useState(false)
  
  // Use external open state if provided, otherwise use internal state
  const open = externalOpen !== undefined ? externalOpen : internalOpen
  const setOpen = externalOnOpenChange || setInternalOpen
  const { materials } = useMaterials()
  const { createPurchaseOrder } = usePurchaseOrders()
  const { activeSuppliers } = useSuppliers()
  const { user } = useAuth()
  const { toast } = useToast()
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: {
      materialId: materialId || "",
      quantity: 1,
      unitPrice: 0,
      supplierId: "",
      quotedPrice: 0,
      expedition: "",
      notes: "",
    },
  })

  // Auto-fill material when materialId prop changes
  React.useEffect(() => {
    if (materialId) {
      form.setValue("materialId", materialId)
    }
  }, [materialId, form])

  // Reset form when dialog closes
  React.useEffect(() => {
    if (!open) {
      form.reset({
        materialId: materialId || "",
        quantity: 1,
        unitPrice: 0,
        supplierId: "",
        quotedPrice: 0,
        expedition: "",
        notes: "",
      })
    }
  }, [open, materialId, form])

  const selectedMaterial = materials?.find(m => m.id === form.watch("materialId"))
  const selectedSupplier = activeSuppliers?.find(s => s.id === form.watch("supplierId"))
  const quantity = form.watch("quantity") || 0
  const unitPrice = form.watch("unitPrice") || 0
  const quotedPrice = form.watch("quotedPrice") || 0
  const totalCost = quantity * quotedPrice

  const onSubmit = async (values: FormValues) => {
    if (!user?.name) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "User tidak ditemukan"
      })
      return
    }

    const material = materials?.find(m => m.id === values.materialId)
    if (!material) {
      toast({
        variant: "destructive", 
        title: "Error",
        description: "Material tidak ditemukan"
      })
      return
    }

    const supplier = activeSuppliers?.find(s => s.id === values.supplierId)
    if (!supplier) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Supplier tidak ditemukan"
      })
      return
    }

    const poData = {
      materialId: values.materialId,
      materialName: material.name,
      quantity: values.quantity,
      unit: material.unit,
      unitPrice: values.unitPrice,
      quotedPrice: values.quotedPrice,
      totalCost: quantity * values.quotedPrice,
      requestedBy: user.name,
      status: 'Pending' as const,
      supplierId: values.supplierId,
      supplierName: supplier.name,
      expedition: values.expedition,
      expectedDeliveryDate: values.expectedDeliveryDate,
      notes: values.notes,
    }

    try {
      await createPurchaseOrder.mutateAsync(poData)
      toast({
        title: "Sukses",
        description: "Purchase Order berhasil dibuat"
      })
      setOpen(false)
      form.reset({
        materialId: materialId || "",
        quantity: 1,
        unitPrice: 0,
        supplierId: "",
        quotedPrice: 0,
        expedition: "",
        notes: "",
      })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Gagal",
        description: error instanceof Error ? error.message : "Terjadi kesalahan"
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Buat PO Baru
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Buat Purchase Order Baru</DialogTitle>
          <DialogDescription>
            Isi form di bawah untuk membuat permintaan pembelian bahan baku.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="material">Material</Label>
              <Select
                value={form.watch("materialId")}
                onValueChange={(value) => form.setValue("materialId", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih material" />
                </SelectTrigger>
                <SelectContent>
                  {materials?.map((material) => (
                    <SelectItem key={material.id} value={material.id}>
                      {material.name} ({material.unit})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.materialId && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.materialId.message}
                </p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="quantity">Jumlah</Label>
              <div className="flex items-center space-x-2">
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  {...form.register("quantity", { valueAsNumber: true })}
                />
                {selectedMaterial && (
                  <span className="text-sm text-muted-foreground">
                    {selectedMaterial.unit}
                  </span>
                )}
              </div>
              {form.formState.errors.quantity && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.quantity.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="supplier">Supplier</Label>
            <Select
              value={form.watch("supplierId")}
              onValueChange={(value) => form.setValue("supplierId", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih supplier" />
              </SelectTrigger>
              <SelectContent>
                {activeSuppliers?.map((supplier) => (
                  <SelectItem key={supplier.id} value={supplier.id}>
                    {supplier.code} - {supplier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.supplierId && (
              <p className="text-sm text-destructive">
                {form.formState.errors.supplierId.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="unitPrice">Harga Satuan (Estimasi)</Label>
              <Input
                id="unitPrice"
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                {...form.register("unitPrice", { valueAsNumber: true })}
              />
              {form.formState.errors.unitPrice && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.unitPrice.message}
                </p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="quotedPrice">Harga Quote dari Supplier</Label>
              <Input
                id="quotedPrice"
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                {...form.register("quotedPrice", { valueAsNumber: true })}
              />
              {form.formState.errors.quotedPrice && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.quotedPrice.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Total Cost (Berdasarkan Quote)</Label>
            <div className="px-3 py-2 bg-muted rounded-md">
              Rp {totalCost.toLocaleString('id-ID')}
            </div>
            {selectedSupplier && (
              <div className="text-sm text-muted-foreground">
                Payment Terms: {selectedSupplier.paymentTerms}
              </div>
            )}
          </div>


          <div className="space-y-2">
            <Label htmlFor="expedition">Ekspedisi</Label>
            <Input
              id="expedition"
              placeholder="Nama ekspedisi pengiriman (opsional)"
              {...form.register("expedition")}
            />
          </div>

          <div className="space-y-2">
            <Label>Tanggal Diharapkan</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !form.watch("expectedDeliveryDate") && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {form.watch("expectedDeliveryDate") ? (
                    format(form.watch("expectedDeliveryDate")!, "PPP", { locale: id })
                  ) : (
                    <span>Pilih tanggal pengiriman</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={form.watch("expectedDeliveryDate")}
                  onSelect={(date) => form.setValue("expectedDeliveryDate", date)}
                  disabled={(date) => date < new Date()}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Catatan</Label>
            <Textarea
              id="notes"
              placeholder="Catatan tambahan..."
              {...form.register("notes")}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button
              type="submit"
              disabled={createPurchaseOrder.isPending}
            >
              {createPurchaseOrder.isPending ? "Membuat..." : "Buat PO"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}