"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "./ui/textarea"
import { useCustomers } from "@/hooks/useCustomers"
import { useToast } from "./ui/use-toast"
import { Customer } from "@/types/customer"

const customerSchema = z.object({
  name: z.string().min(3, { message: "Nama harus diisi (minimal 3 karakter)." }),
  phone: z.string().min(10, { message: "Nomor telepon tidak valid." }),
  address: z.string().min(5, { message: "Alamat harus diisi (minimal 5 karakter)." }),
})

type CustomerFormData = z.infer<typeof customerSchema>

interface AddCustomerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCustomerAdded?: (customer: Customer) => void
}

export function AddCustomerDialog({ open, onOpenChange, onCustomerAdded }: AddCustomerDialogProps) {
  const { toast } = useToast()
  const { addCustomer, isLoading } = useCustomers()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: "",
      phone: "",
      address: "",
    },
  })

  const onSubmit = async (data: CustomerFormData) => {
    const newCustomerData = {
      name: data.name,
      phone: data.phone,
      address: data.address,
    };
    addCustomer.mutate(newCustomerData, {
      onSuccess: (newCustomer) => {
        toast({
          title: "Sukses!",
          description: `Pelanggan "${newCustomer.name}" berhasil ditambahkan.`,
        })
        reset()
        onOpenChange(false)
        if (onCustomerAdded) {
          onCustomerAdded(newCustomer)
        }
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: "Gagal!",
          description: "Terjadi kesalahan saat menambah pelanggan.",
        })
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Tambah Pelanggan Baru</DialogTitle>
            <DialogDescription>
              Isi detail pelanggan di bawah ini. Klik simpan jika sudah selesai.
            </DialogDescription>
          </DialogHeader>
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
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Menyimpan..." : "Simpan Pelanggan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}