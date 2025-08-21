"use client"
import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useCustomers } from "@/hooks/useCustomers"
import { useToast } from "@/components/ui/use-toast"
import { Customer } from "@/types/customer"

const customerSchema = z.object({
  name: z.string().min(3, { message: "Nama harus diisi (minimal 3 karakter)." }),
  phone: z.string().min(10, { message: "Nomor telepon tidak valid." }),
  address: z.string().min(5, { message: "Alamat harus diisi (minimal 5 karakter)." }),
  jumlah_galon_titip: z.coerce.number().min(0, { message: "Jumlah galon tidak boleh negatif." }).optional(),
})

type CustomerFormData = z.infer<typeof customerSchema>

interface EditCustomerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customer: Customer | null
}

export function EditCustomerDialog({ open, onOpenChange, customer }: EditCustomerDialogProps) {
  const { toast } = useToast()
  const { updateCustomer, isLoading } = useCustomers()

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
  })

  // Set form values when customer changes
  useEffect(() => {
    if (customer && open) {
      setValue("name", customer.name)
      setValue("phone", customer.phone)
      setValue("address", customer.address)
      setValue("jumlah_galon_titip", customer.jumlah_galon_titip || 0)
    }
  }, [customer, open, setValue])

  const onSubmit = async (data: CustomerFormData) => {
    if (!customer) return

    updateCustomer.mutate({
      id: customer.id,
      name: data.name,
      phone: data.phone,
      address: data.address,
      jumlah_galon_titip: data.jumlah_galon_titip || 0,
    }, {
      onSuccess: (updatedCustomer) => {
        toast({
          title: "Sukses!",
          description: `Data pelanggan "${updatedCustomer.name}" berhasil diperbarui.`,
        })
        reset()
        onOpenChange(false)
      },
      onError: (error: any) => {
        toast({
          variant: "destructive",
          title: "Gagal!",
          description: error.message,
        })
      },
    })
  }

  const handleCancel = () => {
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Pelanggan</DialogTitle>
          <DialogDescription>
            Ubah informasi pelanggan. Klik simpan untuk menyimpan perubahan.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">Nama</Label>
              <Input id="name" {...register("name")} className="col-span-3" />
              {errors.name && <p className="col-span-4 text-red-500 text-sm text-right">{errors.name.message}</p>}
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="phone" className="text-right">Telepon</Label>
              <Input id="phone" {...register("phone")} className="col-span-3" />
              {errors.phone && <p className="col-span-4 text-red-500 text-sm text-right">{errors.phone.message}</p>}
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="address" className="text-right">Alamat</Label>
              <Textarea id="address" {...register("address")} className="col-span-3" />
              {errors.address && <p className="col-span-4 text-red-500 text-sm text-right">{errors.address.message}</p>}
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="jumlah_galon_titip" className="text-right">Galon Titip</Label>
              <Input 
                id="jumlah_galon_titip" 
                type="number" 
                min="0"
                {...register("jumlah_galon_titip")} 
                className="col-span-3" 
                placeholder="Jumlah galon yang dititip di pelanggan"
              />
              {errors.jumlah_galon_titip && <p className="col-span-4 text-red-500 text-sm text-right">{errors.jumlah_galon_titip.message}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel}>
              Batal
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}