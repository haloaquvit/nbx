"use client"
import { useEffect, useState } from "react"
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
import { useRoles } from "@/hooks/useRoles"
import { PasswordInput } from "./PasswordInput"
import { supabase } from "@/integrations/supabase/client"
import { useBranch } from "@/contexts/BranchContext"

const baseSchema = {
  name: z.string().min(3, "Nama minimal 3 karakter.").transform(val => val.trim()),
  username: z.string().min(3, "Username minimal 3 karakter").regex(/^[a-z0-9_]+$/, "Username hanya boleh berisi huruf kecil, angka, dan underscore.").transform(val => val.trim().toLowerCase()).nullable(),
  email: z.string().email("Email tidak valid.").transform(val => val.trim().toLowerCase()),
  phone: z.string().min(10, "Nomor telepon tidak valid.").transform(val => val.trim()),
  address: z.string().min(5, "Alamat minimal 5 karakter.").transform(val => val.trim()),
  role: z.string().min(1, "Role harus dipilih"),
  status: z.enum(['Aktif', 'Tidak Aktif']),
  branchId: z.string().min(1, "Cabang harus dipilih"),
};

const createEmployeeSchema = z.object({
  ...baseSchema,
  password: z.string().min(6, "Password minimal 6 karakter."),
});

const updateEmployeeSchema = z.object(baseSchema);

type CreateEmployeeFormData = z.infer<typeof createEmployeeSchema>;
type UpdateEmployeeFormData = z.infer<typeof updateEmployeeSchema>;

const statuses: EmployeeStatus[] = ['Aktif', 'Tidak Aktif'];

// Role interface is now imported from types/role.ts

interface EmployeeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee: Employee | null
}

export function EmployeeDialog({ open, onOpenChange, employee }: EmployeeDialogProps) {
  const { toast } = useToast()
  const { createEmployee, updateEmployee } = useEmployees()
  const isEditing = !!employee;
  const { roles, isLoading: rolesLoading } = useRoles();
  const { currentBranch, availableBranches, canAccessAllBranches } = useBranch();

  const form = useForm<CreateEmployeeFormData | UpdateEmployeeFormData>({
    resolver: zodResolver(isEditing ? updateEmployeeSchema : createEmployeeSchema),
  })

  // Roles are now loaded via useRoles hook

  // Initialize form when dialog opens

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
          branchId: (employee as any).branchId || currentBranch?.id || '',
        })
      } else {
        // Set default role to first available role when creating new employee
        const defaultRole = roles && roles.length > 0 ? roles[0].name : '';
        form.reset({
          name: '', username: '', email: '', phone: '', address: '', role: defaultRole, status: 'Aktif', password: '',
          branchId: currentBranch?.id || '',
        })
      }
    }
  }, [employee, open, form, roles, currentBranch])

  const onSubmit = async (data: CreateEmployeeFormData | UpdateEmployeeFormData) => {
    if (isEditing) {
      // Update logic with better error handling
      updateEmployee.mutate({ ...(data as UpdateEmployeeFormData), id: employee.id }, {
        onSuccess: () => {
          toast({ title: "Sukses!", description: `Data karyawan "${data.name}" berhasil diperbarui.` })
          onOpenChange(false)
        },
        onError: (error: any) => {
          console.error('[EmployeeDialog] Update error:', error);
          const errorMessage = error?.message || 'Terjadi kesalahan saat mengupdate karyawan';
          
          // Provide more specific error messages
          let userMessage = errorMessage;
          if (errorMessage.includes('RLS') || errorMessage.includes('policy')) {
            userMessage = 'Tidak dapat mengupdate karyawan. Periksa permissions di database.';
          } else if (errorMessage.includes('permission denied')) {
            userMessage = 'Akses ditolak. Hubungi administrator untuk mengatur permissions.';
          }
          
          toast({ 
            variant: "destructive", 
            title: "Gagal Update!", 
            description: userMessage,
            duration: 5000
          });
        },
      })
    } else {
      // Create logic with better error handling
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
        branch_id: createData.branchId,
      }, {
        onSuccess: () => {
          toast({ title: "Sukses!", description: `Karyawan "${data.name}" berhasil dibuat.` })
          onOpenChange(false)
        },
        onError: (error: any) => {
          console.error('[EmployeeDialog] Create error:', error);
          const errorMessage = error?.message || 'Terjadi kesalahan saat membuat karyawan';
          
          // Provide more specific error messages
          let userMessage = errorMessage;
          if (errorMessage.includes('already exists') || errorMessage.includes('sudah digunakan')) {
            userMessage = 'Email sudah terdaftar. Gunakan email lain.';
          } else if (errorMessage.includes('RLS') || errorMessage.includes('policy')) {
            userMessage = 'Tidak dapat membuat karyawan. Periksa permissions di database.';
          } else if (errorMessage.includes('permission denied')) {
            userMessage = 'Akses ditolak. Hubungi administrator untuk mengatur permissions.';
          }
          
          toast({ 
            variant: "destructive", 
            title: "Gagal Buat Karyawan!", 
            description: userMessage,
            duration: 5000
          });
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
              <Input id="email" type="email" {...form.register("email")} disabled={isEditing} placeholder="contoh: nama@perusahaan.com" />
              {form.formState.errors.email && <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>}
              {!isEditing && <p className="text-xs text-muted-foreground">Gunakan email yang unik, belum pernah digunakan sebelumnya</p>}
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
              <Select 
                onValueChange={(value) => form.setValue("role", value)} 
                defaultValue={employee?.role || (roles && roles.length > 0 ? roles[0].name : '')}
                disabled={rolesLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={rolesLoading ? "Loading roles..." : "Pilih role..."} />
                </SelectTrigger>
                <SelectContent>
                  {roles?.map(role => (
                    <SelectItem key={role.id} value={role.name}>
                      {role.displayName} - {role.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {roles && roles.length === 0 && !rolesLoading && (
                <p className="text-sm text-muted-foreground">
                  Tidak ada role tersedia. Tambahkan role di menu Manajemen Roles.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select onValueChange={(value: EmployeeStatus) => form.setValue("status", value)} defaultValue={employee?.status || 'Aktif'}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{statuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="branchId">Cabang *</Label>
              {canAccessAllBranches && availableBranches.length > 1 ? (
                <Select
                  onValueChange={(value) => form.setValue("branchId", value)}
                  defaultValue={currentBranch?.id || ''}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih cabang..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableBranches.map(branch => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={currentBranch?.name || 'N/A'}
                  disabled
                  className="bg-gray-100"
                />
              )}
              {form.formState.errors.branchId && <p className="text-sm text-destructive">{(form.formState.errors as any).branchId.message}</p>}
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