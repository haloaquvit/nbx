"use client"
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/use-toast'
import { Shield, Save, RotateCcw, Users, Settings, Eye, Plus, Edit, Trash2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

// Define all roles in the system
const ROLES = [
  { id: 'owner', name: 'Owner', color: 'bg-purple-100 text-purple-800' },
  { id: 'admin', name: 'Admin', color: 'bg-blue-100 text-blue-800' },
  { id: 'supervisor', name: 'Supervisor', color: 'bg-green-100 text-green-800' },
  { id: 'cashier', name: 'Cashier', color: 'bg-orange-100 text-orange-800' },
  { id: 'designer', name: 'Designer', color: 'bg-pink-100 text-pink-800' },
  { id: 'operator', name: 'Operator', color: 'bg-gray-100 text-gray-800' },
]

// Define all features and their permissions
const FEATURES = [
  {
    category: 'Produk & Inventory',
    items: [
      { id: 'products_view', name: 'Lihat Produk', icon: Eye },
      { id: 'products_create', name: 'Tambah Produk', icon: Plus },
      { id: 'products_edit', name: 'Edit Produk', icon: Edit },
      { id: 'products_delete', name: 'Hapus Produk', icon: Trash2 },
      { id: 'materials_view', name: 'Lihat Bahan', icon: Eye },
      { id: 'materials_create', name: 'Tambah Bahan', icon: Plus },
      { id: 'materials_edit', name: 'Edit Bahan', icon: Edit },
      { id: 'materials_delete', name: 'Hapus Bahan', icon: Trash2 },
    ]
  },
  {
    category: 'Transaksi & POS',
    items: [
      { id: 'pos_access', name: 'Akses POS', icon: Eye },
      { id: 'transactions_view', name: 'Lihat Transaksi', icon: Eye },
      { id: 'transactions_create', name: 'Buat Transaksi', icon: Plus },
      { id: 'transactions_edit', name: 'Edit Transaksi', icon: Edit },
      { id: 'transactions_delete', name: 'Hapus Transaksi', icon: Trash2 },
      { id: 'quotations_view', name: 'Lihat Penawaran', icon: Eye },
      { id: 'quotations_create', name: 'Buat Penawaran', icon: Plus },
      { id: 'quotations_edit', name: 'Edit Penawaran', icon: Edit },
    ]
  },
  {
    category: 'Customer & Employee',
    items: [
      { id: 'customers_view', name: 'Lihat Pelanggan', icon: Eye },
      { id: 'customers_create', name: 'Tambah Pelanggan', icon: Plus },
      { id: 'customers_edit', name: 'Edit Pelanggan', icon: Edit },
      { id: 'customers_delete', name: 'Hapus Pelanggan', icon: Trash2 },
      { id: 'employees_view', name: 'Lihat Karyawan', icon: Eye },
      { id: 'employees_create', name: 'Tambah Karyawan', icon: Plus },
      { id: 'employees_edit', name: 'Edit Karyawan', icon: Edit },
      { id: 'employees_delete', name: 'Hapus Karyawan', icon: Trash2 },
    ]
  },
  {
    category: 'Keuangan',
    items: [
      { id: 'accounts_view', name: 'Lihat Akun Keuangan', icon: Eye },
      { id: 'accounts_create', name: 'Tambah Akun', icon: Plus },
      { id: 'accounts_edit', name: 'Edit Akun', icon: Edit },
      { id: 'receivables_view', name: 'Lihat Piutang', icon: Eye },
      { id: 'expenses_view', name: 'Lihat Pengeluaran', icon: Eye },
      { id: 'expenses_create', name: 'Tambah Pengeluaran', icon: Plus },
      { id: 'advances_view', name: 'Lihat Panjar', icon: Eye },
      { id: 'advances_create', name: 'Tambah Panjar', icon: Plus },
      { id: 'financial_reports', name: 'Laporan Keuangan', icon: Eye },
    ]
  },
  {
    category: 'Laporan',
    items: [
      { id: 'stock_reports', name: 'Laporan Stock', icon: Eye },
      { id: 'transaction_reports', name: 'Laporan Transaksi', icon: Eye },
      { id: 'attendance_reports', name: 'Laporan Absensi', icon: Eye },
    ]
  },
  {
    category: 'Sistem',
    items: [
      { id: 'settings_access', name: 'Akses Pengaturan', icon: Settings },
      { id: 'role_management', name: 'Kelola Role', icon: Users },
      { id: 'attendance_access', name: 'Akses Absensi', icon: Eye },
    ]
  }
]

// Default permissions for each role
const DEFAULT_PERMISSIONS = {
  owner: {
    // Owner has all permissions
    ...Object.fromEntries(
      FEATURES.flatMap(category => category.items.map(item => [item.id, true]))
    )
  },
  admin: {
    // Admin has most permissions except some sensitive ones
    ...Object.fromEntries(
      FEATURES.flatMap(category => category.items.map(item => [item.id, true]))
    ),
    role_management: false, // Only owner can manage roles
  },
  supervisor: {
    // Supervisor can view and manage most things but not delete critical data
    products_view: true, products_create: true, products_edit: true, products_delete: false,
    materials_view: true, materials_create: true, materials_edit: true, materials_delete: false,
    pos_access: true,
    transactions_view: true, transactions_create: true, transactions_edit: true, transactions_delete: false,
    quotations_view: true, quotations_create: true, quotations_edit: true,
    customers_view: true, customers_create: true, customers_edit: true, customers_delete: false,
    employees_view: true, employees_create: false, employees_edit: false, employees_delete: false,
    accounts_view: true, accounts_create: false, accounts_edit: false,
    receivables_view: true,
    expenses_view: true, expenses_create: true,
    advances_view: true, advances_create: true,
    financial_reports: true,
    stock_reports: true, transaction_reports: true, attendance_reports: true,
    settings_access: false, role_management: false, attendance_access: true,
  },
  cashier: {
    // Cashier focused on POS and transactions
    products_view: true, products_create: true, products_edit: true, products_delete: false,
    materials_view: true, materials_create: false, materials_edit: false, materials_delete: false,
    pos_access: true,
    transactions_view: true, transactions_create: true, transactions_edit: true, transactions_delete: false,
    quotations_view: true, quotations_create: true, quotations_edit: true,
    customers_view: true, customers_create: true, customers_edit: true, customers_delete: false,
    employees_view: false, employees_create: false, employees_edit: false, employees_delete: false,
    accounts_view: false, accounts_create: false, accounts_edit: false,
    receivables_view: true,
    expenses_view: false, expenses_create: false,
    advances_view: false, advances_create: false,
    financial_reports: false,
    stock_reports: false, transaction_reports: false, attendance_reports: false,
    settings_access: false, role_management: false, attendance_access: true,
  },
  designer: {
    // Designer focused on products and design-related tasks
    products_view: true, products_create: true, products_edit: true, products_delete: false,
    materials_view: true, materials_create: false, materials_edit: false, materials_delete: false,
    pos_access: false,
    transactions_view: true, transactions_create: false, transactions_edit: false, transactions_delete: false,
    quotations_view: true, quotations_create: true, quotations_edit: true,
    customers_view: true, customers_create: false, customers_edit: false, customers_delete: false,
    employees_view: false, employees_create: false, employees_edit: false, employees_delete: false,
    accounts_view: false, accounts_create: false, accounts_edit: false,
    receivables_view: false,
    expenses_view: false, expenses_create: false,
    advances_view: false, advances_create: false,
    stock_reports: true, transaction_reports: false, attendance_reports: false,
    settings_access: false, role_management: false, attendance_access: true,
  },
  operator: {
    // Operator has minimal permissions
    products_view: false, products_create: false, products_edit: false, products_delete: false,
    materials_view: false, materials_create: false, materials_edit: false, materials_delete: false,
    pos_access: false,
    transactions_view: false, transactions_create: false, transactions_edit: false, transactions_delete: false,
    quotations_view: false, quotations_create: false, quotations_edit: false,
    customers_view: false, customers_create: false, customers_edit: false, customers_delete: false,
    employees_view: false, employees_create: false, employees_edit: false, employees_delete: false,
    accounts_view: false, accounts_create: false, accounts_edit: false,
    receivables_view: false,
    expenses_view: false, expenses_create: false,
    advances_view: false, advances_create: false,
    financial_reports: false,
    stock_reports: false, transaction_reports: false, attendance_reports: false,
    settings_access: false, role_management: false, attendance_access: true,
  }
}

export const RolePermissionManagement = () => {
  const { user } = useAuth()
  const { toast } = useToast()
  const [permissions, setPermissions] = useState(DEFAULT_PERMISSIONS)
  const [hasChanges, setHasChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Only owner can access this component
  const canManageRoles = user && user.role === 'owner'

  useEffect(() => {
    // Load permissions from localStorage or API
    const savedPermissions = localStorage.getItem('rolePermissions')
    if (savedPermissions) {
      try {
        setPermissions(JSON.parse(savedPermissions))
      } catch (error) {
        console.error('Error loading permissions:', error)
      }
    }
  }, [])

  const togglePermission = (roleId: string, permissionId: string) => {
    if (!canManageRoles) return

    setPermissions(prev => ({
      ...prev,
      [roleId]: {
        ...prev[roleId],
        [permissionId]: !prev[roleId]?.[permissionId]
      }
    }))
    setHasChanges(true)
  }

  const resetToDefaults = () => {
    setPermissions(DEFAULT_PERMISSIONS)
    setHasChanges(true)
    toast({
      title: "Reset ke Default",
      description: "Semua permission telah di-reset ke pengaturan default.",
    })
  }

  const savePermissions = async () => {
    if (!canManageRoles) return

    setIsSaving(true)
    try {
      // Save to localStorage (in real app, this would be API call)
      localStorage.setItem('rolePermissions', JSON.stringify(permissions))
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      setHasChanges(false)
      toast({
        title: "Sukses!",
        description: "Permission berhasil disimpan.",
      })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Gagal!",
        description: "Terjadi kesalahan saat menyimpan permission.",
      })
    } finally {
      setIsSaving(false)
    }
  }

  if (!canManageRoles) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Shield className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Akses Terbatas</h3>
          <p className="text-muted-foreground text-center">
            Hanya Owner yang dapat mengakses pengaturan role dan permission.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Kelola Role & Permission
          </CardTitle>
          <CardDescription>
            Atur akses dan permission untuk setiap role dalam sistem. 
            Perubahan akan berlaku untuk semua user dengan role tersebut.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-6">
            <Button 
              onClick={savePermissions} 
              disabled={!hasChanges || isSaving}
              className="flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
            </Button>
            <Button 
              variant="outline" 
              onClick={resetToDefaults}
              className="flex items-center gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Reset ke Default
            </Button>
          </div>

          {hasChanges && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                ⚠️ Ada perubahan yang belum disimpan. Klik "Simpan Perubahan" untuk menerapkan.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {FEATURES.map((category) => (
        <Card key={category.category}>
          <CardHeader>
            <CardTitle className="text-lg">{category.category}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">Permission</TableHead>
                    {ROLES.map((role) => (
                      <TableHead key={role.id} className="text-center min-w-[100px]">
                        <Badge variant="secondary" className={role.color}>
                          {role.name}
                        </Badge>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {category.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <item.icon className="h-4 w-4 text-muted-foreground" />
                          {item.name}
                        </div>
                      </TableCell>
                      {ROLES.map((role) => (
                        <TableCell key={role.id} className="text-center">
                          <Switch
                            checked={permissions[role.id]?.[item.id] || false}
                            onCheckedChange={() => togglePermission(role.id, item.id)}
                            disabled={!canManageRoles}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Permission Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Ringkasan Permission</CardTitle>
          <CardDescription>
            Lihat total permission yang dimiliki setiap role
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {ROLES.map((role) => {
              const rolePermissions = permissions[role.id] || {}
              const totalPermissions = Object.keys(rolePermissions).length
              const activePermissions = Object.values(rolePermissions).filter(Boolean).length
              const percentage = totalPermissions > 0 ? Math.round((activePermissions / totalPermissions) * 100) : 0

              return (
                <Card key={role.id}>
                  <CardContent className="p-4 text-center">
                    <Badge variant="secondary" className={`${role.color} mb-2`}>
                      {role.name}
                    </Badge>
                    <div className="text-2xl font-bold">{activePermissions}</div>
                    <div className="text-sm text-muted-foreground">
                      dari {totalPermissions} permission
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {percentage}% akses
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}