"use client"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "./ui/textarea"
import { useToast } from "./ui/use-toast"
import { Material } from "@/types/material"
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders"
import { useAuth } from "@/hooks/useAuth"

const poSchema = z.object({
  quantity: z.coerce.number().min(0.01, { message: "Jumlah harus lebih dari 0." }),
  notes: z.string().optional(),
})

type PoFormData = z.infer<typeof poSchema>

interface RequestPoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  material: Material | null
}

export function RequestPoDialog({ open, onOpenChange, material }: RequestPoDialogProps) {
  const { toast } = useToast()
  const { user } = useAuth()
  const { addPurchaseOrder } = usePurchaseOrders()
  const { register, handleSubmit, reset, formState: { errors } } = useForm<PoFormData>({
    resolver: zodResolver(poSchema),
    defaultValues: { quantity: 1, notes: '' }
  })

  const onSubmit = async (data: PoFormData) => {
    if (!material || !user) return;

    addPurchaseOrder.mutate({
      materialId: material.id,
      materialName: material.name,
      quantity: data.quantity,
      unit: material.unit,
      requestedBy: user.name,
      notes: data.notes,
    }, {
      onSuccess: () => {
        toast({
          title: "Sukses!",
          description: `Permintaan PO untuk ${material.name} berhasil dibuat.`,
        })
        reset()
        onOpenChange(false)
      },
      onError: (error) => {
        toast({
          variant: "destructive",
          title: "Gagal!",
          description: error.message,
        })
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Request Purchase Order (PO)</DialogTitle>
            <DialogDescription>
              Buat permintaan pembelian untuk material: <strong>{material?.name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="quantity">Jumlah yang Di-request ({material?.unit})</Label>
              <Input id="quantity" type="number" step="any" {...register("quantity")} />
              {errors.quantity && <p className="text-red-500 text-sm">{errors.quantity.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Catatan (Opsional)</Label>
              <Textarea id="notes" {...register("notes")} placeholder="Contoh: Butuh segera untuk project X" />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={addPurchaseOrder.isPending}>
              {addPurchaseOrder.isPending ? "Mengirim..." : "Kirim Permintaan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}