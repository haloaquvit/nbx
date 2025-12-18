import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Badge } from './ui/badge'
import { PlusCircle, Trash2, Edit, Users } from 'lucide-react'
import { useToast } from './ui/use-toast'
import { useRoles } from '@/hooks/useRoles'
import { CreateRoleData } from '@/types/role'
import { Skeleton } from './ui/skeleton'
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
                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      <strong>Note:</strong> Setelah membuat role, Anda dapat mengatur permission-nya di tab <strong>"Permission"</strong> di atas.
                    </p>
                  </div>

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
                              Ubah nama dan deskripsi role ini. Untuk mengatur permission, gunakan tab <strong>"Permission"</strong> di atas.
                            </DialogDescription>
                          </DialogHeader>
                          <form onSubmit={handleEditRole} className="space-y-4">
                            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                              <p className="text-sm text-blue-800 dark:text-blue-200">
                                <strong>Note:</strong> Permission untuk role ini dapat diatur di tab <strong>"Permission"</strong> di atas untuk kontrol yang lebih detail.
                              </p>
                            </div>

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