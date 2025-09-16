"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"
import { useSuppliers } from "@/hooks/useSuppliers"
import { CreateSupplierData, UpdateSupplierData } from "@/types/supplier"
import { Plus, Edit2, Trash2, Building } from "lucide-react"
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

const supplierSchema = z.object({
  name: z.string().min(2, "Nama supplier minimal 2 karakter"),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Email tidak valid").optional().or(z.literal("")),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  paymentTerms: z.string().default("Cash"),
  taxNumber: z.string().optional(),
  bankAccount: z.string().optional(),
  bankName: z.string().optional(),
  notes: z.string().optional(),
})

type SupplierFormData = z.infer<typeof supplierSchema>

export function SupplierManagement() {
  const { suppliers, isLoading, createSupplier, updateSupplier, deleteSupplier } = useSuppliers()
  const { toast } = useToast()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<string | null>(null)

  const { register, handleSubmit, setValue, reset, watch, formState: { errors } } = useForm<SupplierFormData>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: "",
      contactPerson: "",
      phone: "",
      email: "",
      address: "",
      city: "",
      postalCode: "",
      paymentTerms: "Cash",
      taxNumber: "",
      bankAccount: "",
      bankName: "",
      notes: "",
    }
  })

  const onSubmit = (data: SupplierFormData) => {
    const supplierData: CreateSupplierData | UpdateSupplierData = {
      name: data.name,
      contactPerson: data.contactPerson || undefined,
      phone: data.phone || undefined,
      email: data.email || undefined,
      address: data.address || undefined,
      city: data.city || undefined,
      postalCode: data.postalCode || undefined,
      paymentTerms: data.paymentTerms,
      taxNumber: data.taxNumber || undefined,
      bankAccount: data.bankAccount || undefined,
      bankName: data.bankName || undefined,
      notes: data.notes || undefined,
    }

    if (editingSupplier) {
      updateSupplier.mutate({ id: editingSupplier, data: supplierData }, {
        onSuccess: () => {
          toast({ title: "Sukses", description: "Supplier berhasil diperbarui" })
          resetForm()
        },
        onError: (error) => {
          toast({ variant: "destructive", title: "Error", description: error.message })
        }
      })
    } else {
      createSupplier.mutate(supplierData, {
        onSuccess: () => {
          toast({ title: "Sukses", description: "Supplier berhasil ditambahkan" })
          resetForm()
        },
        onError: (error) => {
          toast({ variant: "destructive", title: "Error", description: error.message })
        }
      })
    }
  }

  const handleEdit = (supplierId: string) => {
    const supplier = suppliers?.find(s => s.id === supplierId)
    if (supplier) {
      setValue("name", supplier.name)
      setValue("contactPerson", supplier.contactPerson || "")
      setValue("phone", supplier.phone || "")
      setValue("email", supplier.email || "")
      setValue("address", supplier.address || "")
      setValue("city", supplier.city || "")
      setValue("postalCode", supplier.postalCode || "")
      setValue("paymentTerms", supplier.paymentTerms)
      setValue("taxNumber", supplier.taxNumber || "")
      setValue("bankAccount", supplier.bankAccount || "")
      setValue("bankName", supplier.bankName || "")
      setValue("notes", supplier.notes || "")
      setEditingSupplier(supplierId)
      setIsDialogOpen(true)
    }
  }

  const handleDelete = (supplierId: string) => {
    deleteSupplier.mutate(supplierId, {
      onSuccess: () => {
        toast({ title: "Sukses", description: "Supplier berhasil dihapus" })
      },
      onError: (error) => {
        toast({ variant: "destructive", title: "Error", description: error.message })
      }
    })
  }

  const resetForm = () => {
    reset()
    setEditingSupplier(null)
    setIsDialogOpen(false)
  }

  const paymentTermsOptions = [
    "Cash",
    "Net 7",
    "Net 14",
    "Net 30",
    "Net 60",
    "Net 90"
  ]

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              Master Data Supplier
            </CardTitle>
            <CardDescription>
              Kelola data supplier untuk purchase order dan inventory management
            </CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => resetForm()}>
                <Plus className="h-4 w-4 mr-2" />
                Tambah Supplier
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {editingSupplier ? "Edit Supplier" : "Tambah Supplier Baru"}
                </DialogTitle>
                <DialogDescription>
                  Isi informasi supplier dengan lengkap untuk memudahkan pengelolaan purchase order
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nama Supplier *</Label>
                    <Input id="name" {...register("name")} placeholder="PT. Supplier ABC" />
                    {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contactPerson">Nama Kontak</Label>
                    <Input id="contactPerson" {...register("contactPerson")} placeholder="Budi Santoso" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telepon</Label>
                    <Input id="phone" {...register("phone")} placeholder="021-1234567" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" {...register("email")} placeholder="info@supplier.com" />
                    {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="address">Alamat</Label>
                    <Textarea id="address" {...register("address")} placeholder="Jl. Industri No. 123" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">Kota</Label>
                    <Input id="city" {...register("city")} placeholder="Jakarta" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="postalCode">Kode Pos</Label>
                    <Input id="postalCode" {...register("postalCode")} placeholder="12345" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="paymentTerms">Terms Pembayaran</Label>
                    <Select onValueChange={(value) => setValue("paymentTerms", value)} value={watch("paymentTerms")}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih terms pembayaran" />
                      </SelectTrigger>
                      <SelectContent>
                        {paymentTermsOptions.map(term => (
                          <SelectItem key={term} value={term}>{term}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="taxNumber">NPWP</Label>
                    <Input id="taxNumber" {...register("taxNumber")} placeholder="12.345.678.9-123.000" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bankName">Nama Bank</Label>
                    <Input id="bankName" {...register("bankName")} placeholder="Bank BCA" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bankAccount">No. Rekening</Label>
                    <Input id="bankAccount" {...register("bankAccount")} placeholder="1234567890" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="notes">Catatan</Label>
                    <Textarea id="notes" {...register("notes")} placeholder="Catatan tambahan tentang supplier" />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Batal
                  </Button>
                  <Button type="submit" disabled={createSupplier.isPending || updateSupplier.isPending}>
                    {editingSupplier ? "Perbarui" : "Simpan"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kode</TableHead>
                <TableHead>Nama Supplier</TableHead>
                <TableHead>Kontak</TableHead>
                <TableHead>Kota</TableHead>
                <TableHead>Payment Terms</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center">Loading...</TableCell>
                </TableRow>
              ) : suppliers?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center">Belum ada data supplier</TableCell>
                </TableRow>
              ) : (
                suppliers?.map(supplier => (
                  <TableRow key={supplier.id}>
                    <TableCell className="font-mono">{supplier.code}</TableCell>
                    <TableCell className="font-medium">{supplier.name}</TableCell>
                    <TableCell>
                      {supplier.contactPerson && (
                        <div className="text-sm">
                          <div>{supplier.contactPerson}</div>
                          {supplier.phone && <div className="text-muted-foreground">{supplier.phone}</div>}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{supplier.city}</TableCell>
                    <TableCell>
                      <Badge variant={supplier.paymentTerms === 'Cash' ? 'default' : 'secondary'}>
                        {supplier.paymentTerms}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={supplier.isActive ? 'default' : 'destructive'}>
                        {supplier.isActive ? 'Aktif' : 'Tidak Aktif'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(supplier.id)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Hapus Supplier</AlertDialogTitle>
                              <AlertDialogDescription>
                                Apakah Anda yakin ingin menghapus supplier {supplier.name}? 
                                Tindakan ini tidak dapat dibatalkan.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Batal</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(supplier.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Hapus
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}