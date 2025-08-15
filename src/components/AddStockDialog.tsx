"use client"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useMaterials } from "@/hooks/useMaterials"
import { useToast } from "./ui/use-toast"
import { Material } from "@/types/material"

const addStockSchema = z.object({
  quantity: z.number().min(0.01, { message: "Jumlah harus lebih dari 0." }),
})

type AddStockFormData = z.infer<typeof addStockSchema>

interface AddStockDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  material: Material | null
}

export function AddStockDialog({ open, onOpenChange, material }: AddStockDialogProps) {
  const { toast } = useToast()
  const { addStock: addStockMutation } = useMaterials()
  const { register, handleSubmit, reset, formState: { errors } } = useForm<AddStockFormData>({
    resolver: zodResolver(addStockSchema),
    defaultValues: { quantity: 1 }
  })

  const onSubmit = async (data: AddStockFormData) => {
    if (!material) return;

    addStockMutation.mutate({ materialId: material.id, quantity: data.quantity }, {
      onSuccess: () => {
        toast({
          title: "Sukses!",
          description: `Stok untuk ${material.name} berhasil ditambahkan.`,
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
            <DialogTitle>Tambah Stok: {material?.name}</DialogTitle>
            <DialogDescription>
              Masukkan jumlah stok yang ingin ditambahkan. Stok saat ini: {material?.stock} {material?.unit}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="quantity">Jumlah Tambahan</Label>
              <Input id="quantity" type="number" step="any" {...register("quantity", { valueAsNumber: true })} />
              {errors.quantity && <p className="text-red-500 text-sm">{errors.quantity.message}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={addStockMutation.isPending}>
              {addStockMutation.isPending ? "Menyimpan..." : "Simpan Stok"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}