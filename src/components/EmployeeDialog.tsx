"use client"
import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "./ui/textarea"
import { useToast } from "./ui/use-toast"
import { Employee, UserRole, EmployeeStatus } from "@/types/employee"
import { useEmployees } from "@/hooks/useEmployees"
import { PasswordInput } from "./PasswordInput"

const baseSchema = {
  name: z.string().min(3, "Nama minimal 3 karakter.").transform(val => val.trim()),
  username: z.string().min(3, "Username minimal 3 karakter").regex(/^[a-z0-9_]+$/, "Username hanya boleh berisi huruf kecil, angka, dan underscore.").transform(val => val.trim().toLowerCase()).nullable(),
  email: z.string().email("Email tidak valid.").transform(val => val.trim().toLowerCase()),
  phone: z.string().min(10, "Nomor telepon tidak valid.").transform(val => val.trim()),
  address: z.string().min(5, "Alamat minimal 5 karakter.").transform(val => val.trim()),
  role: z.enum(['cashier', 'designer', 'operator', 'admin', 'supervisor', 'owner', 'me', 'ceo']),
  status: z.enum(['Aktif', 'Tidak Aktif']),
};

const createEmployeeSchema = z.object({
  ...baseSchema,
  password: z.string().min(6, "Password minimal 6 karakter."),
});

const updateEmployeeSchema = z.object(baseSchema);

type CreateEmployeeFormData = z.infer<typeof createEmployeeSchema>;
type UpdateEmployeeFormData = z.infer<typeof updateEmployeeSchema>;

const roles: UserRole[] = ['cashier', 'designer', 'operator', 'admin', 'supervisor', 'owner'];
const statuses: EmployeeStatus[] = ['Aktif', 'Tidak Aktif'];

interface EmployeeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee: Employee | null
}

export function EmployeeDialog({ open, onOpenChange, employee }: EmployeeDialogProps) {
  const { toast } = useToast()
  const { createEmployee, updateEmployee } = useEmployees()
  const isEditing = !!employee;

  const form = useForm<CreateEmployeeFormData | UpdateEmployeeFormData>({
    resolver: zodResolver(isEditing ? updateEmployeeSchema : createEmployeeSchema),
  })

  useEffect(() => {
    if (open) {
      if (employee) {
        form.reset({
          name: employee.name,
          username: employee.username,
          email: employee.email,
          phone: employee.phone,
          address: employee.address,
          role: employee.role,
          status: employee.status,
        })
      } else {
        form.reset({
          name: '', username: '', email: '', phone: '', address: '', role: 'cashier', status: 'Aktif', password: ''
        })
      }
    }
  }, [employee, open, form])

  const onSubmit = async (data: CreateEmployeeFormData | UpdateEmployeeFormData) => {
    if (isEditing) {
      // Update logic
      updateEmployee.mutate({ ...(data as UpdateEmployeeFormData), id: employee.id }, {
        onSuccess: () => {
          toast({ title: "Sukses!", description: `Data karyawan "${data.name}" berhasil diperbarui.` })
          onOpenChange(false)
        },
        onError: (error: any) => {
          toast({ variant: "destructive", title: "Gagal!", description: error.message })
        },
      })
    } else {
      // Create logic
      const createData = data as CreateEmployeeFormData;
      createEmployee.mutate({
        email: createData.email,
        password: createData.password,
        full_name: createData.name,
        username: createData.username,
        role: createData.role,
        phone: createData.phone,
        address: createData.address,
        status: createData.status,
      }, {
        onSuccess: () => {
          toast({ title: "Sukses!", description: `Karyawan "${data.name}" berhasil dibuat.` })
          onOpenChange(false)
        },
        onError: (error: any) => {
          toast({ variant: "destructive", title: "Gagal!", description: error.message })
        },
      })
    }
  }

  const isLoading = createEmployee.isPending || updateEmployee.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit Karyawan' : 'Tambah Karyawan Baru'}</DialogTitle>
            <DialogDescription>
              {isEditing ? 'Perbarui detail informasi karyawan.' : 'Isi data untuk membuat akun karyawan baru.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nama Lengkap</Label>
              <Input id="name" {...form.register("name")} />
              {form.formState.errors.name && <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input id="username" {...form.register("username")} />
              {form.formState.errors.username && <p className="text-sm text-destructive">{form.formState.errors.username.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email (untuk login)</Label>
              <Input id="email" type="email" {...form.register("email")} disabled={isEditing} />
              {form.formState.errors.email && <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">No. Telepon</Label>
              <Input id="phone" {...form.register("phone")} />
              {form.formState.errors.phone && <p className="text-sm text-destructive">{form.formState.errors.phone.message}</p>}
            </div>
            {!isEditing && (
              <div className="space-y-2">
                <Label htmlFor="password">Password Awal</Label>
                <PasswordInput id="password" {...form.register("password")} />
                {(form.formState.errors as any).password && <p className="text-sm text-destructive">{(form.formState.errors as any).password.message}</p>}
              </div>
            )}
            <div className="col-span-2 space-y-2">
              <Label htmlFor="address">Alamat</Label>
              <Textarea id="address" {...form.register("address")} />
              {form.formState.errors.address && <p className="text-sm text-destructive">{form.formState.errors.address.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Jabatan (Role)</Label>
              <Select onValueChange={(value: UserRole) => form.setValue("role", value)} defaultValue={employee?.role || 'cashier'}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{roles.map(r => <SelectItem key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select onValueChange={(value: EmployeeStatus) => form.setValue("status", value)} defaultValue={employee?.status || 'Aktif'}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{statuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}