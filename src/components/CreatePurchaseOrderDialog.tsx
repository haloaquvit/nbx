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
import { useAuth } from "@/hooks/useAuth"
import { useToast } from "@/components/ui/use-toast"

const formSchema = z.object({
  materialId: z.string().min(1, "Material harus dipilih"),
  quantity: z.number().min(1, "Jumlah minimal 1"),
  unitPrice: z.number().min(0, "Harga satuan tidak boleh negatif"),
  supplierName: z.string().min(1, "Nama supplier harus diisi"),
  supplierContact: z.string().optional(),
  expectedDeliveryDate: z.date().optional(),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

interface CreatePurchaseOrderDialogProps {
  materialId?: string
  children?: React.ReactNode
}

export function CreatePurchaseOrderDialog({ materialId, children }: CreatePurchaseOrderDialogProps) {
  const [open, setOpen] = React.useState(false)
  const { materials } = useMaterials()
  const { createPurchaseOrder } = usePurchaseOrders()
  const { user } = useAuth()
  const { toast } = useToast()
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      materialId: materialId || "",
      quantity: 1,
      unitPrice: 0,
      supplierName: "",
      supplierContact: "",
      notes: "",
    },
  })

  const selectedMaterial = materials?.find(m => m.id === form.watch("materialId"))
  const quantity = form.watch("quantity") || 0
  const unitPrice = form.watch("unitPrice") || 0
  const totalCost = quantity * unitPrice

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

    const poData = {
      materialId: values.materialId,
      materialName: material.name,
      quantity: values.quantity,
      unit: material.unit,
      unitPrice: values.unitPrice,
      totalCost: quantity * values.unitPrice,
      requestedBy: user.name,
      status: 'Pending' as const,
      supplierName: values.supplierName,
      supplierContact: values.supplierContact,
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
      form.reset()
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="unitPrice">Harga Satuan</Label>
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
              <Label>Total Cost</Label>
              <div className="px-3 py-2 bg-muted rounded-md">
                Rp {totalCost.toLocaleString('id-ID')}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="supplierName">Nama Supplier</Label>
              <Input
                id="supplierName"
                placeholder="Nama supplier"
                {...form.register("supplierName")}
              />
              {form.formState.errors.supplierName && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.supplierName.message}
                </p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="supplierContact">Kontak Supplier</Label>
              <Input
                id="supplierContact"
                placeholder="Nomor HP / Email"
                {...form.register("supplierContact")}
              />
            </div>
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
              disabled={createPurchaseOrder.isPending || !form.formState.isValid}
            >
              {createPurchaseOrder.isPending ? "Membuat..." : "Buat PO"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}