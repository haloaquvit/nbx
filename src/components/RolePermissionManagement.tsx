"use client"
import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/use-toast'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Shield, Save, RotateCcw, Users, Settings, Eye, Plus, Edit, Trash2, Building2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useRoles } from '@/hooks/useRoles'
import { useBranches } from '@/hooks/useBranches'
import { isOwner } from '@/utils/roleUtils'

// Define default color for roles
const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-purple-100 text-purple-800',
  admin: 'bg-blue-100 text-blue-800',
  supervisor: 'bg-green-100 text-green-800',
  cashier: 'bg-orange-100 text-orange-800',
  designer: 'bg-pink-100 text-pink-800',
  operator: 'bg-gray-100 text-gray-800',
}

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
      { id: 'production_view', name: 'Lihat Produksi', icon: Eye },
      { id: 'production_create', name: 'Proses Produksi', icon: Plus },
      { id: 'production_delete', name: 'Hapus Produksi', icon: Trash2 },
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
    category: 'Supplier & Purchase',
    items: [
      { id: 'suppliers_view', name: 'Lihat Supplier', icon: Eye },
      { id: 'suppliers_create', name: 'Tambah Supplier', icon: Plus },
      { id: 'suppliers_edit', name: 'Edit Supplier', icon: Edit },
      { id: 'suppliers_delete', name: 'Hapus Supplier', icon: Trash2 },
      { id: 'purchase_orders_view', name: 'Lihat Purchase Order', icon: Eye },
      { id: 'purchase_orders_create', name: 'Buat Purchase Order', icon: Plus },
      { id: 'purchase_orders_edit', name: 'Edit Purchase Order', icon: Edit },
      { id: 'purchase_orders_delete', name: 'Hapus Purchase Order', icon: Trash2 },
    ]
  },
  {
    category: 'Delivery & Retasi',
    items: [
      { id: 'delivery_view', name: 'Lihat Pengantaran', icon: Eye },
      { id: 'delivery_create', name: 'Buat Pengantaran', icon: Plus },
      { id: 'delivery_edit', name: 'Edit Pengantaran', icon: Edit },
      { id: 'delivery_delete', name: 'Hapus Pengantaran', icon: Trash2 },
      { id: 'retasi_view', name: 'Lihat Retasi', icon: Eye },
      { id: 'retasi_create', name: 'Buat Retasi', icon: Plus },
      { id: 'retasi_edit', name: 'Edit Retasi', icon: Edit },
      { id: 'retasi_delete', name: 'Hapus Retasi', icon: Trash2 },
    ]
  },
  {
    category: 'Keuangan',
    items: [
      { id: 'accounts_view', name: 'Lihat Akun Keuangan', icon: Eye },
      { id: 'accounts_create', name: 'Tambah Akun', icon: Plus },
      { id: 'accounts_edit', name: 'Edit Akun', icon: Edit },
      { id: 'accounts_delete', name: 'Hapus Akun', icon: Trash2 },
      { id: 'receivables_view', name: 'Lihat Piutang', icon: Eye },
      { id: 'receivables_edit', name: 'Edit Piutang', icon: Edit },
      { id: 'payables_view', name: 'Lihat Hutang', icon: Eye },
      { id: 'payables_create', name: 'Tambah Hutang', icon: Plus },
      { id: 'payables_edit', name: 'Edit Hutang', icon: Edit },
      { id: 'payables_delete', name: 'Hapus Hutang', icon: Trash2 },
      { id: 'expenses_view', name: 'Lihat Pengeluaran', icon: Eye },
      { id: 'expenses_create', name: 'Tambah Pengeluaran', icon: Plus },
      { id: 'expenses_edit', name: 'Edit Pengeluaran', icon: Edit },
      { id: 'expenses_delete', name: 'Hapus Pengeluaran', icon: Trash2 },
      { id: 'advances_view', name: 'Lihat Panjar', icon: Eye },
      { id: 'advances_create', name: 'Tambah Panjar', icon: Plus },
      { id: 'advances_edit', name: 'Edit Panjar', icon: Edit },
      { id: 'cash_flow_view', name: 'Lihat Buku Besar', icon: Eye },
      { id: 'financial_reports', name: 'Laporan Keuangan', icon: Eye },
    ]
  },
  {
    category: 'Payroll & Commission',
    items: [
      { id: 'payroll_view', name: 'Lihat Gaji', icon: Eye },
      { id: 'payroll_process', name: 'Proses Gaji', icon: Plus },
      { id: 'commission_view', name: 'Lihat Komisi', icon: Eye },
      { id: 'commission_manage', name: 'Kelola Pengaturan Komisi', icon: Settings },
      { id: 'commission_report', name: 'Laporan Komisi', icon: Eye },
    ]
  },
  {
    category: 'Assets & Maintenance',
    items: [
      { id: 'assets_view', name: 'Lihat Aset', icon: Eye },
      { id: 'assets_create', name: 'Tambah Aset', icon: Plus },
      { id: 'assets_edit', name: 'Edit Aset', icon: Edit },
      { id: 'assets_delete', name: 'Hapus Aset', icon: Trash2 },
      { id: 'maintenance_view', name: 'Lihat Maintenance', icon: Eye },
      { id: 'maintenance_create', name: 'Jadwalkan Maintenance', icon: Plus },
      { id: 'maintenance_edit', name: 'Edit Maintenance', icon: Edit },
    ]
  },
  {
    category: 'Zakat & Sedekah',
    items: [
      { id: 'zakat_view', name: 'Lihat Zakat', icon: Eye },
      { id: 'zakat_create', name: 'Tambah Zakat', icon: Plus },
      { id: 'zakat_edit', name: 'Edit Zakat', icon: Edit },
    ]
  },
  {
    category: 'Laporan',
    items: [
      { id: 'stock_reports', name: 'Laporan Stock', icon: Eye },
      { id: 'transaction_reports', name: 'Laporan Transaksi', icon: Eye },
      { id: 'transaction_items_report', name: 'Laporan Item Keluar', icon: Eye },
      { id: 'material_movement_report', name: 'Laporan Pergerakan Bahan', icon: Eye },
      { id: 'attendance_reports', name: 'Laporan Absensi', icon: Eye },
    ]
  },
  {
    category: 'Sistem',
    items: [
      { id: 'settings_access', name: 'Akses Pengaturan', icon: Settings },
      { id: 'role_management', name: 'Kelola Role', icon: Users },
      { id: 'branches_view', name: 'Lihat Cabang', icon: Eye },
      { id: 'branches_create', name: 'Tambah Cabang', icon: Plus },
      { id: 'branches_edit', name: 'Edit Cabang', icon: Edit },
      { id: 'branches_delete', name: 'Hapus Cabang', icon: Trash2 },
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
    production_view: true, production_create: true, production_delete: false,
    customers_view: true, customers_create: true, customers_edit: true, customers_delete: false,
    employees_view: true, employees_create: false, employees_edit: false, employees_delete: false,

    // Supplier & Purchase
    suppliers_view: true, suppliers_create: true, suppliers_edit: true, suppliers_delete: false,
    purchase_orders_view: true, purchase_orders_create: true, purchase_orders_edit: true, purchase_orders_delete: false,

    // Delivery & Retasi
    delivery_view: true, delivery_create: true, delivery_edit: true, delivery_delete: false,
    retasi_view: true, retasi_create: true, retasi_edit: true, retasi_delete: false,

    // Finance
    accounts_view: true, accounts_create: false, accounts_edit: false, accounts_delete: false,
    receivables_view: true, receivables_edit: true,
    payables_view: true, payables_create: true, payables_edit: true, payables_delete: false,
    expenses_view: true, expenses_create: true, expenses_edit: true, expenses_delete: false,
    advances_view: true, advances_create: true, advances_edit: true,
    cash_flow_view: true,
    financial_reports: true,

    // Payroll & Commission
    payroll_view: true, payroll_process: false,
    commission_view: true, commission_manage: false, commission_report: true,

    // Assets & Maintenance
    assets_view: true, assets_create: true, assets_edit: true, assets_delete: false,
    maintenance_view: true, maintenance_create: true, maintenance_edit: true,

    // Zakat
    zakat_view: true, zakat_create: true, zakat_edit: true,

    // Reports
    stock_reports: true, transaction_reports: true, transaction_items_report: true,
    material_movement_report: true, attendance_reports: true,

    // System
    settings_access: false, role_management: false,
    branches_view: true, branches_create: false, branches_edit: false, branches_delete: false,
    attendance_access: true,
  },
  cashier: {
    // Cashier focused on POS and transactions
    products_view: true, products_create: true, products_edit: true, products_delete: false,
    materials_view: true, materials_create: false, materials_edit: false, materials_delete: false,
    pos_access: true,
    transactions_view: true, transactions_create: true, transactions_edit: true, transactions_delete: false,
    production_view: false, production_create: false, production_delete: false,
    customers_view: true, customers_create: true, customers_edit: true, customers_delete: false,
    employees_view: false, employees_create: false, employees_edit: false, employees_delete: false,

    // Supplier & Purchase - limited
    suppliers_view: true, suppliers_create: false, suppliers_edit: false, suppliers_delete: false,
    purchase_orders_view: false, purchase_orders_create: false, purchase_orders_edit: false, purchase_orders_delete: false,

    // Delivery & Retasi - view only
    delivery_view: true, delivery_create: false, delivery_edit: false, delivery_delete: false,
    retasi_view: true, retasi_create: false, retasi_edit: false, retasi_delete: false,

    // Finance - limited
    accounts_view: false, accounts_create: false, accounts_edit: false, accounts_delete: false,
    receivables_view: true, receivables_edit: false,
    payables_view: false, payables_create: false, payables_edit: false, payables_delete: false,
    expenses_view: false, expenses_create: false, expenses_edit: false, expenses_delete: false,
    advances_view: false, advances_create: false, advances_edit: false,
    cash_flow_view: false,
    financial_reports: false,

    // Payroll & Commission - no access
    payroll_view: false, payroll_process: false,
    commission_view: false, commission_manage: false, commission_report: false,

    // Assets & Maintenance - no access
    assets_view: false, assets_create: false, assets_edit: false, assets_delete: false,
    maintenance_view: false, maintenance_create: false, maintenance_edit: false,

    // Zakat - no access
    zakat_view: false, zakat_create: false, zakat_edit: false,

    // Reports - limited
    stock_reports: false, transaction_reports: false, transaction_items_report: false,
    material_movement_report: false, attendance_reports: false,

    // System
    settings_access: false, role_management: false,
    branches_view: false, branches_create: false, branches_edit: false, branches_delete: false,
    attendance_access: true,
  },
  designer: {
    // Designer focused on products and design-related tasks
    products_view: true, products_create: true, products_edit: true, products_delete: false,
    materials_view: true, materials_create: false, materials_edit: false, materials_delete: false,
    pos_access: false,
    transactions_view: true, transactions_create: false, transactions_edit: false, transactions_delete: false,
    production_view: true, production_create: false, production_delete: false,
    customers_view: true, customers_create: false, customers_edit: false, customers_delete: false,
    employees_view: false, employees_create: false, employees_edit: false, employees_delete: false,

    // All new permissions - no access for designer
    suppliers_view: false, suppliers_create: false, suppliers_edit: false, suppliers_delete: false,
    purchase_orders_view: false, purchase_orders_create: false, purchase_orders_edit: false, purchase_orders_delete: false,
    delivery_view: false, delivery_create: false, delivery_edit: false, delivery_delete: false,
    retasi_view: false, retasi_create: false, retasi_edit: false, retasi_delete: false,
    accounts_view: false, accounts_create: false, accounts_edit: false, accounts_delete: false,
    receivables_view: false, receivables_edit: false,
    payables_view: false, payables_create: false, payables_edit: false, payables_delete: false,
    expenses_view: false, expenses_create: false, expenses_edit: false, expenses_delete: false,
    advances_view: false, advances_create: false, advances_edit: false,
    cash_flow_view: false, financial_reports: false,
    payroll_view: false, payroll_process: false,
    commission_view: false, commission_manage: false, commission_report: false,
    assets_view: false, assets_create: false, assets_edit: false, assets_delete: false,
    maintenance_view: false, maintenance_create: false, maintenance_edit: false,
    zakat_view: false, zakat_create: false, zakat_edit: false,
    stock_reports: true, transaction_reports: false, transaction_items_report: false,
    material_movement_report: false, attendance_reports: false,
    settings_access: false, role_management: false,
    branches_view: false, branches_create: false, branches_edit: false, branches_delete: false,
    attendance_access: true,
  },
  operator: {
    // Operator has minimal permissions - only attendance
    products_view: false, products_create: false, products_edit: false, products_delete: false,
    materials_view: false, materials_create: false, materials_edit: false, materials_delete: false,
    pos_access: false,
    transactions_view: false, transactions_create: false, transactions_edit: false, transactions_delete: false,
    production_view: false, production_create: false, production_delete: false,
    customers_view: false, customers_create: false, customers_edit: false, customers_delete: false,
    employees_view: false, employees_create: false, employees_edit: false, employees_delete: false,

    // All other permissions - no access for operator
    suppliers_view: false, suppliers_create: false, suppliers_edit: false, suppliers_delete: false,
    purchase_orders_view: false, purchase_orders_create: false, purchase_orders_edit: false, purchase_orders_delete: false,
    delivery_view: false, delivery_create: false, delivery_edit: false, delivery_delete: false,
    retasi_view: false, retasi_create: false, retasi_edit: false, retasi_delete: false,
    accounts_view: false, accounts_create: false, accounts_edit: false, accounts_delete: false,
    receivables_view: false, receivables_edit: false,
    payables_view: false, payables_create: false, payables_edit: false, payables_delete: false,
    expenses_view: false, expenses_create: false, expenses_edit: false, expenses_delete: false,
    advances_view: false, advances_create: false, advances_edit: false,
    cash_flow_view: false, financial_reports: false,
    payroll_view: false, payroll_process: false,
    commission_view: false, commission_manage: false, commission_report: false,
    assets_view: false, assets_create: false, assets_edit: false, assets_delete: false,
    maintenance_view: false, maintenance_create: false, maintenance_edit: false,
    zakat_view: false, zakat_create: false, zakat_edit: false,
    stock_reports: false, transaction_reports: false, transaction_items_report: false,
    material_movement_report: false, attendance_reports: false,
    settings_access: false, role_management: false,
    branches_view: false, branches_create: false, branches_edit: false, branches_delete: false,
    attendance_access: true,
  }
}

export const RolePermissionManagement = () => {
  const { user } = useAuth()
  const { toast } = useToast()
  const { roles: dbRoles, isLoading: rolesLoading } = useRoles()
  const { branches, isLoading: branchesLoading } = useBranches()
  const [permissions, setPermissions] = useState(DEFAULT_PERMISSIONS)
  const [hasChanges, setHasChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [selectedRole, setSelectedRole] = useState<string>('')

  // Only owner can access this component
  const canManageRoles = isOwner(user)

  // Convert database roles to format needed for this component
  const ROLES = useMemo(() => {
    if (!dbRoles) return []

    return dbRoles.map(role => ({
      id: role.name,
      name: role.displayName,
      color: ROLE_COLORS[role.name] || 'bg-gray-100 text-gray-800',
      isSystem: role.isSystemRole
    }))
  }, [dbRoles])

  // Create dynamic branch access permissions
  const BRANCH_ACCESS_FEATURES = useMemo(() => {
    if (!branches || branches.length === 0) return []

    return [{
      category: 'Akses Cabang',
      items: branches.map(branch => ({
        id: `branch_access_${branch.id}`,
        name: `Akses ${branch.name} (${branch.code})`,
        icon: Building2,
        branchId: branch.id
      }))
    }]
  }, [branches])

  // Combine static features with dynamic branch features (branches first)
  const ALL_FEATURES = useMemo(() => {
    return [...BRANCH_ACCESS_FEATURES, ...FEATURES]
  }, [BRANCH_ACCESS_FEATURES])

  // Set first role as default selected role
  useEffect(() => {
    if (ROLES.length > 0 && !selectedRole) {
      setSelectedRole(ROLES[0].id)
    }
  }, [ROLES, selectedRole])

  useEffect(() => {
    // Load permissions from localStorage or API
    const savedPermissions = localStorage.getItem('rolePermissions')
    if (savedPermissions) {
      try {
        const loadedPerms = JSON.parse(savedPermissions)

        // Auto-add branch access permissions for new branches
        if (branches && branches.length > 0) {
          const updatedPerms = { ...loadedPerms }

          ROLES.forEach(role => {
            if (!updatedPerms[role.id]) {
              updatedPerms[role.id] = {}
            }

            // Add branch access permissions if not exists
            branches.forEach(branch => {
              const branchPermKey = `branch_access_${branch.id}`
              if (!(branchPermKey in updatedPerms[role.id])) {
                // Owner and admin get all branch access by default
                updatedPerms[role.id][branchPermKey] = ['owner', 'admin'].includes(role.id)
              }
            })
          })

          setPermissions(updatedPerms)
        } else {
          setPermissions(loadedPerms)
        }
      } catch (error) {
        console.error('Error loading permissions:', error)
      }
    } else if (branches && branches.length > 0) {
      // If no saved permissions, create default with branch access
      const defaultPermsWithBranches = { ...DEFAULT_PERMISSIONS }

      ROLES.forEach(role => {
        if (!defaultPermsWithBranches[role.id]) {
          defaultPermsWithBranches[role.id] = {}
        }

        branches.forEach(branch => {
          const branchPermKey = `branch_access_${branch.id}`
          // Owner and admin get all branch access by default
          defaultPermsWithBranches[role.id][branchPermKey] = ['owner', 'admin'].includes(role.id)
        })
      })

      setPermissions(defaultPermsWithBranches)
    }
  }, [branches, ROLES])

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
      // Save to localStorage
      localStorage.setItem('rolePermissions', JSON.stringify(permissions))

      // Trigger storage event manually for same window
      window.dispatchEvent(new Event('storage'))

      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000))

      setHasChanges(false)
      toast({
        title: "Sukses!",
        description: "Permission berhasil disimpan. Refresh halaman untuk melihat perubahan menu.",
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
      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="space-y-2 text-sm">
              <p className="font-semibold text-blue-900">
                Cara Kerja Permission System:
              </p>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li>Permission yang dicentang akan menentukan <strong>menu yang tampil di sidebar</strong></li>
                <li>Jika permission dimatikan (tidak dicentang), menu terkait akan <strong>hilang dari sidebar</strong></li>
                <li>Perubahan akan berlaku setelah <strong>klik "Simpan Perubahan"</strong> dan <strong>refresh halaman</strong></li>
                <li><strong>Owner</strong> selalu punya akses penuh ke semua menu</li>
                <li><strong>Admin</strong> punya akses hampir semua kecuali Management Roles</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Kelola Role & Permission
          </CardTitle>
          <CardDescription>
            Pilih role dan atur permission-nya. Perubahan akan berlaku untuk semua user dengan role tersebut.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Role Selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Pilih Role:</label>
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger className="w-full max-w-sm">
                <SelectValue placeholder="Pilih role untuk diatur permission-nya" />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className={role.color}>
                        {role.name}
                      </Badge>
                      {role.isSystem && (
                        <span className="text-xs text-muted-foreground">(System Role)</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
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
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800 font-semibold">
                ⚠️ Ada perubahan yang belum disimpan. Klik "Simpan Perubahan" untuk menerapkan.
              </p>
              <p className="text-xs text-yellow-700 mt-1">
                Setelah simpan, refresh halaman (F5) untuk melihat perubahan menu di sidebar.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedRole && ALL_FEATURES.map((category) => (
        <Card key={category.category}>
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              <span>{category.category}</span>
              <Badge variant="secondary" className={ROLES.find(r => r.id === selectedRole)?.color}>
                {ROLES.find(r => r.id === selectedRole)?.name}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {category.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-center gap-2 flex-1">
                    <item.icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{item.name}</span>
                  </div>
                  <Switch
                    checked={permissions[selectedRole]?.[item.id] || false}
                    onCheckedChange={() => togglePermission(selectedRole, item.id)}
                    disabled={!canManageRoles}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Permission Summary for Selected Role */}
      {selectedRole && (
        <Card>
          <CardHeader>
            <CardTitle>Ringkasan Permission - {ROLES.find(r => r.id === selectedRole)?.name}</CardTitle>
            <CardDescription>
              Total permission yang dimiliki role ini
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(() => {
                const rolePermissions = permissions[selectedRole] || {}
                const totalPermissions = Object.keys(rolePermissions).length
                const activePermissions = Object.values(rolePermissions).filter(Boolean).length
                const percentage = totalPermissions > 0 ? Math.round((activePermissions / totalPermissions) * 100) : 0

                return (
                  <>
                    <Card>
                      <CardContent className="p-6 text-center">
                        <div className="text-4xl font-bold text-green-600">{activePermissions}</div>
                        <div className="text-sm text-muted-foreground mt-2">
                          Permission Aktif
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-6 text-center">
                        <div className="text-4xl font-bold text-blue-600">{totalPermissions}</div>
                        <div className="text-sm text-muted-foreground mt-2">
                          Total Permission
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-6 text-center">
                        <div className="text-4xl font-bold text-purple-600">{percentage}%</div>
                        <div className="text-sm text-muted-foreground mt-2">
                          Akses
                        </div>
                      </CardContent>
                    </Card>
                  </>
                )
              })()}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}