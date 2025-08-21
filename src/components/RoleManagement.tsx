import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Badge } from './ui/badge'
import { PlusCircle, Trash2, Edit, Shield, Users } from 'lucide-react'
import { useToast } from './ui/use-toast'
import { useRoles } from '@/hooks/useRoles'
import { CreateRoleData, DEFAULT_PERMISSIONS, PermissionKey } from '@/types/role'
import { Skeleton } from './ui/skeleton'
import { Switch } from './ui/switch'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Checkbox } from './ui/checkbox'

const PERMISSION_CATEGORIES = {
  'User Management': ['manage_users', 'create_users', 'edit_users', 'delete_users', 'view_users'],
  'Product Management': ['manage_products', 'create_products', 'edit_products', 'delete_products', 'view_products'],
  'Transaction Management': ['manage_transactions', 'create_transactions', 'edit_transactions', 'delete_transactions', 'view_transactions'],
  'Customer Management': ['manage_customers', 'create_customers', 'edit_customers', 'delete_customers', 'view_customers'],
  'Material Management': ['manage_materials', 'create_materials', 'edit_materials', 'delete_materials', 'view_materials'],
  'Financial Management': ['manage_finances', 'view_reports', 'manage_accounts'],
  'Quotation Management': ['create_quotations', 'edit_quotations', 'delete_quotations', 'view_quotations'],
  'Production': ['update_production', 'view_production'],
  'System Settings': ['manage_settings', 'manage_roles'],
  'Special': ['all']
};

const PERMISSION_LABELS: Record<PermissionKey, string> = {
  manage_users: 'Kelola Karyawan',
  create_users: 'Tambah Karyawan',
  edit_users: 'Edit Karyawan',
  delete_users: 'Hapus Karyawan',
  view_users: 'Lihat Karyawan',
  manage_products: 'Kelola Produk',
  create_products: 'Tambah Produk',
  edit_products: 'Edit Produk',
  delete_products: 'Hapus Produk',
  view_products: 'Lihat Produk',
  manage_transactions: 'Kelola Transaksi',
  create_transactions: 'Buat Transaksi',
  edit_transactions: 'Edit Transaksi',
  delete_transactions: 'Hapus Transaksi',
  view_transactions: 'Lihat Transaksi',
  manage_customers: 'Kelola Customer',
  create_customers: 'Tambah Customer',
  edit_customers: 'Edit Customer',
  delete_customers: 'Hapus Customer',
  view_customers: 'Lihat Customer',
  manage_materials: 'Kelola Bahan',
  create_materials: 'Tambah Bahan',
  edit_materials: 'Edit Bahan',
  delete_materials: 'Hapus Bahan',
  view_materials: 'Lihat Bahan',
  manage_finances: 'Kelola Keuangan',
  view_reports: 'Lihat Laporan',
  manage_accounts: 'Kelola Akun',
  create_quotations: 'Buat Quotation',
  edit_quotations: 'Edit Quotation',
  delete_quotations: 'Hapus Quotation',
  view_quotations: 'Lihat Quotation',
  update_production: 'Update Produksi',
  view_production: 'Lihat Produksi',
  manage_settings: 'Kelola Pengaturan',
  manage_roles: 'Kelola Role',
  all: 'Akses Penuh (Super Admin)'
};

export const RoleManagement = () => {
  const { toast } = useToast()
  const { roles, isLoading, createRole, updateRole, deleteRole } = useRoles()
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<any>(null)
  const [formData, setFormData] = useState<CreateRoleData>({
    name: '',
    displayName: '',
    description: '',
    permissions: {}
  })

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name || !formData.displayName) {
      toast({ variant: "destructive", title: "Error", description: "Nama dan display name wajib diisi." })
      return
    }

    try {
      await createRole.mutateAsync(formData)
      toast({ title: "Sukses!", description: `Role "${formData.displayName}" berhasil dibuat.` })
      setIsCreateDialogOpen(false)
      setFormData({ name: '', displayName: '', description: '', permissions: {} })
    } catch (error: any) {
      toast({ variant: "destructive", title: "Gagal!", description: error.message })
    }
  }

  const handleEditRole = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!editingRole) return

    // Check if it's a default/system role
    const isDefaultRole = editingRole.id.includes('-default');
    
    if (isDefaultRole) {
      toast({ 
        variant: "destructive", 
        title: "Tidak Dapat Menyimpan", 
        description: "Untuk menyimpan perubahan role system, jalankan migration script 'create_dynamic_roles_system.sql' terlebih dahulu di Supabase SQL Editor." 
      })
      return
    }

    try {
      await updateRole.mutateAsync({
        id: editingRole.id,
        displayName: formData.displayName,
        description: formData.description,
        permissions: formData.permissions
      })
      toast({ title: "Sukses!", description: `Role "${formData.displayName}" berhasil diperbarui.` })
      setIsEditDialogOpen(false)
      setEditingRole(null)
      setFormData({ name: '', displayName: '', description: '', permissions: {} })
    } catch (error: any) {
      toast({ variant: "destructive", title: "Gagal!", description: error.message })
    }
  }

  const handleDeleteRole = async (roleId: string, roleName: string) => {
    try {
      await deleteRole.mutateAsync(roleId)
      toast({ title: "Sukses!", description: `Role "${roleName}" berhasil dihapus.` })
    } catch (error: any) {
      toast({ variant: "destructive", title: "Gagal!", description: error.message })
    }
  }

  const openEditDialog = (role: any) => {
    setEditingRole(role)
    setFormData({
      name: role.name,
      displayName: role.displayName,
      description: role.description || '',
      permissions: role.permissions || {}
    })
    setIsEditDialogOpen(true)
  }

  const handlePermissionChange = (permission: PermissionKey, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [permission]: checked
      }
    }))
  }

  const PermissionSection = ({ permissions }: { permissions: Record<string, boolean> }) => (
    <div className="space-y-6">
      {Object.entries(PERMISSION_CATEGORIES).map(([category, perms]) => (
        <div key={category} className="space-y-3">
          <h4 className="font-medium text-sm text-muted-foreground">{category}</h4>
          <div className="grid grid-cols-2 gap-3">
            {perms.map((perm) => (
              <div key={perm} className="flex items-center space-x-2">
                <Checkbox
                  id={perm}
                  checked={permissions[perm] || false}
                  onCheckedChange={(checked) => handlePermissionChange(perm as PermissionKey, checked as boolean)}
                />
                <Label htmlFor={perm} className="text-sm">
                  {PERMISSION_LABELS[perm as PermissionKey]}
                </Label>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Manajemen Role/Jabatan
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Kelola role dan permission yang dapat diassign ke karyawan
              </p>
            </div>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="flex items-center gap-2">
                  <PlusCircle className="h-4 w-4" />
                  Tambah Role
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Tambah Role Baru</DialogTitle>
                  <DialogDescription>
                    Buat role/jabatan baru dengan permission yang dapat dikustomisasi sesuai kebutuhan.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateRole} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nama Role (ID)</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value.toLowerCase().replace(/\s+/g, '_')})}
                        placeholder="manager, staff, dll"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="displayName">Nama Tampilan</Label>
                      <Input
                        id="displayName"
                        value={formData.displayName}
                        onChange={(e) => setFormData({...formData, displayName: e.target.value})}
                        placeholder="Manager, Staff, dll"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Deskripsi</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      placeholder="Deskripsi role ini..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Permission</Label>
                    <PermissionSection permissions={formData.permissions || {}} />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                      Batal
                    </Button>
                    <Button type="submit" disabled={createRole.isPending}>
                      {createRole.isPending ? 'Menyimpan...' : 'Simpan'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>Deskripsi</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead>Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5}><Skeleton className="h-6 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : roles?.map((role) => (
                <TableRow key={role.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{role.displayName}</div>
                      <div className="text-sm text-muted-foreground">{role.name}</div>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <span className="text-sm">{role.description || '-'}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant={role.isSystemRole ? "default" : "secondary"}>
                        {role.isSystemRole ? 'System' : 'Custom'}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {role.isSystemRole ? 'Tidak dapat dihapus' : 'Dapat dihapus'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-muted-foreground">
                      {Object.keys(role.permissions).length} permission
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Dialog open={isEditDialogOpen && editingRole?.id === role.id} onOpenChange={setIsEditDialogOpen}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" onClick={() => openEditDialog(role)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Edit Role: {role.displayName}</DialogTitle>
                            <DialogDescription>
                              Ubah permission dan setting untuk role ini. System role tidak dapat dihapus tapi permission bisa diubah.
                            </DialogDescription>
                          </DialogHeader>
                          <form onSubmit={handleEditRole} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label htmlFor="editName">Nama Role (ID)</Label>
                                <Input
                                  id="editName"
                                  value={formData.name}
                                  disabled
                                  className="bg-muted"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="editDisplayName">Nama Tampilan</Label>
                                <Input
                                  id="editDisplayName"
                                  value={formData.displayName}
                                  onChange={(e) => setFormData({...formData, displayName: e.target.value})}
                                  required
                                />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="editDescription">Deskripsi</Label>
                              <Textarea
                                id="editDescription"
                                value={formData.description}
                                onChange={(e) => setFormData({...formData, description: e.target.value})}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Permission</Label>
                              <PermissionSection permissions={formData.permissions || {}} />
                            </div>
                            <div className="flex justify-end gap-2">
                              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                                Batal
                              </Button>
                              <Button type="submit" disabled={updateRole.isPending}>
                                {updateRole.isPending ? 'Menyimpan...' : 'Simpan'}
                              </Button>
                            </div>
                          </form>
                        </DialogContent>
                      </Dialog>
                      
                      {!role.isSystemRole && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm" title="Hapus Role Custom">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Hapus Role</AlertDialogTitle>
                              <AlertDialogDescription>
                                Anda yakin ingin menghapus role "{role.displayName}"? 
                                Tindakan ini tidak dapat dibatalkan.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Batal</AlertDialogCancel>
                              <AlertDialogAction 
                                onClick={() => handleDeleteRole(role.id, role.displayName)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Ya, Hapus
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}