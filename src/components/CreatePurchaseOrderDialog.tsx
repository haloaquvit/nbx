"use client"
import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CalendarIcon, Plus, Trash2 } from "lucide-react"
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
import { PurchaseOrderItem } from "@/types/purchaseOrder"

const formSchema = z.object({
  supplierId: z.string().min(1, "Supplier harus dipilih"),
  includePpn: z.boolean().default(false),
  expedition: z.string().optional(),
  orderDate: z.date().optional(),
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

  // State for PO items
  const [items, setItems] = React.useState<PurchaseOrderItem[]>([])

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: {
      supplierId: "",
      includePpn: false,
      expedition: "",
      orderDate: new Date(),
      notes: "",
    },
  })

  // Auto-add material if materialId prop is provided
  React.useEffect(() => {
    if (materialId && open) {
      const material = materials?.find(m => m.id === materialId)
      if (material && !items.find(item => item.materialId === materialId)) {
        addItem(materialId)
      }
    }
  }, [materialId, open, materials])

  // Reset form when dialog closes
  React.useEffect(() => {
    if (!open) {
      form.reset({
        supplierId: "",
        includePpn: false,
        expedition: "",
        orderDate: new Date(),
        notes: "",
      })
      setItems([])
    }
  }, [open, form])

  const selectedSupplier = activeSuppliers?.find(s => s.id === form.watch("supplierId"))
  const includePpn = form.watch("includePpn") || false

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0)
  const ppnAmount = includePpn ? subtotal * 0.11 : 0
  const totalCost = subtotal + ppnAmount

  // Add new item
  const addItem = (preselectedMaterialId?: string) => {
    const newItem: PurchaseOrderItem = {
      id: `temp-${Date.now()}`,
      materialId: preselectedMaterialId || "",
      quantity: 1,
      unitPrice: 0,
      notes: "",
    }
    setItems([...items, newItem])
  }

  // Update item
  const updateItem = (itemId: string, field: keyof PurchaseOrderItem, value: any) => {
    setItems(items.map(item => {
      if (item.id === itemId) {
        const updatedItem = { ...item, [field]: value }

        // Auto-populate material name and unit when material is selected
        if (field === 'materialId') {
          const material = materials?.find(m => m.id === value)
          if (material) {
            updatedItem.materialName = material.name
            updatedItem.unit = material.unit
          }
        }

        return updatedItem
      }
      return item
    }))
  }

  // Remove item
  const removeItem = (itemId: string) => {
    setItems(items.filter(item => item.id !== itemId))
  }

  const onSubmit = async (values: FormValues) => {
    if (!user?.name) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "User tidak ditemukan"
      })
      return
    }

    // Validate at least one item
    if (items.length === 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Tambahkan minimal satu item"
      })
      return
    }

    // Validate all items have material selected
    const invalidItems = items.filter(item => !item.materialId || item.quantity <= 0 || item.unitPrice < 0)
    if (invalidItems.length > 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Semua item harus memiliki material, jumlah, dan harga yang valid"
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
      includePpn: values.includePpn,
      ppnAmount: ppnAmount,
      totalCost: totalCost,
      requestedBy: user.name,
      status: 'Pending' as const,
      supplierId: values.supplierId,
      supplierName: supplier.name,
      expedition: values.expedition,
      orderDate: values.orderDate,
      expectedDeliveryDate: values.expectedDeliveryDate,
      notes: values.notes,
      items: items.map(item => ({
        materialId: item.materialId,
        materialName: item.materialName,
        unit: item.unit,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        notes: item.notes,
      })),
    }

    try {
      await createPurchaseOrder.mutateAsync(poData)
      toast({
        title: "Sukses",
        description: "Purchase Order berhasil dibuat"
      })
      setOpen(false)
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
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Buat Purchase Order Baru</DialogTitle>
          <DialogDescription>
            Isi form di bawah untuk membuat permintaan pembelian bahan baku.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label>Item yang Dipesan</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addItem()}
              >
                <Plus className="h-4 w-4 mr-2" />
                Tambah Item
              </Button>
            </div>

            {items.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-md">
                Belum ada item. Klik "Tambah Item" untuk menambahkan.
              </div>
            ) : (
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[300px]">Material</TableHead>
                      <TableHead className="w-[120px]">Jumlah</TableHead>
                      <TableHead className="w-[150px]">Harga Satuan</TableHead>
                      <TableHead className="w-[150px]">Subtotal</TableHead>
                      <TableHead className="w-[200px]">Catatan</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => {
                      const material = materials?.find(m => m.id === item.materialId)
                      const itemSubtotal = item.quantity * item.unitPrice

                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Select
                              value={item.materialId}
                              onValueChange={(value) => updateItem(item.id!, 'materialId', value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Pilih material" />
                              </SelectTrigger>
                              <SelectContent>
                                {materials?.map((mat) => (
                                  <SelectItem key={mat.id} value={mat.id}>
                                    {mat.name} ({mat.unit})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-2">
                              <NumberInput
                                value={item.quantity}
                                onChange={(value) => updateItem(item.id!, 'quantity', value || 0)}
                                min={0.01}
                                decimalPlaces={2}
                                className="w-20"
                              />
                              {material && (
                                <span className="text-xs text-muted-foreground">
                                  {material.unit}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <NumberInput
                              value={item.unitPrice}
                              onChange={(value) => updateItem(item.id!, 'unitPrice', value || 0)}
                              min={0}
                              decimalPlaces={2}
                              className="w-full"
                              placeholder="0"
                            />
                          </TableCell>
                          <TableCell>
                            <span className="font-mono text-sm">
                              Rp {itemSubtotal.toLocaleString('id-ID')}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Input
                              value={item.notes || ""}
                              onChange={(e) => updateItem(item.id!, 'notes', e.target.value)}
                              placeholder="Catatan..."
                              className="w-full"
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeItem(item.id!)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="includePpn"
                checked={form.watch("includePpn")}
                onCheckedChange={(checked) => form.setValue("includePpn", checked as boolean)}
              />
              <Label htmlFor="includePpn" className="cursor-pointer">
                Termasuk PPN 11%
              </Label>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Total Cost</Label>
            <div className="px-3 py-2 bg-muted rounded-md space-y-1">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Subtotal:</span>
                <span className="font-mono">Rp {subtotal.toLocaleString('id-ID')}</span>
              </div>
              {includePpn && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">PPN 11%:</span>
                  <span className="font-mono">Rp {ppnAmount.toLocaleString('id-ID')}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                <span>Total:</span>
                <span className="font-mono">Rp {totalCost.toLocaleString('id-ID')}</span>
              </div>
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tanggal PO Dibuat</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !form.watch("orderDate") && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.watch("orderDate") ? (
                      format(form.watch("orderDate")!, "PPP", { locale: id })
                    ) : (
                      <span>Pilih tanggal PO</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={form.watch("orderDate")}
                    onSelect={(date) => form.setValue("orderDate", date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Tanggal Diharapkan Diterima</Label>
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
              disabled={createPurchaseOrder.isPending || items.length === 0}
            >
              {createPurchaseOrder.isPending ? "Membuat..." : "Buat PO"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}