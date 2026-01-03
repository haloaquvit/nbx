"use client"

import { useState, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Activity,
  Database,
  Download,
  Upload,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Server,
  HardDrive,
  Clock,
  FileJson,
  Trash2,
  ShoppingCart,
  Package,
  DollarSign,
  Users,
  Truck,
  Settings,
  Building2,
  HandCoins,
  Heart,
  BookOpen,
  FileArchive,
  List
} from 'lucide-react'
import { supabase, isPostgRESTMode, getTenantConfigDynamic } from '@/integrations/supabase/client'
import { postgrestAuth } from '@/integrations/supabase/postgrestAuth'
import { backupRestoreService, BackupData, BackupProgress, RestoreProgress } from '@/services/backupRestoreService'
import { useAuth } from '@/hooks/useAuth'
import { useBranch } from '@/contexts/BranchContext'
import { isOwner } from '@/utils/roleUtils'
import { useToast } from '@/components/ui/use-toast'
import { toast as sonnerToast } from 'sonner'
import { format } from 'date-fns'
import { id } from 'date-fns/locale'

// =============================================
// RESET DATABASE TYPES & CONFIG
// =============================================
interface DataCategory {
  id: string
  name: string
  description: string
  icon: React.ReactNode
  tables: string[]
  dependencies?: string[]
}

const dataCategories: DataCategory[] = [
  {
    id: 'sales',
    name: 'Sales & Revenue',
    description: 'Transaksi penjualan, quotasi, dan pengiriman',
    icon: <ShoppingCart className="w-4 h-4" />,
    tables: ['transactions', 'transaction_items', 'quotations', 'deliveries', 'delivery_items', 'payment_history', 'stock_pricings', 'bonus_pricings'],
    dependencies: ['customers']
  },
  {
    id: 'customers',
    name: 'Customer Data',
    description: 'Data pelanggan dan kontak',
    icon: <Users className="w-4 h-4" />,
    tables: ['customers']
  },
  {
    id: 'inventory',
    name: 'Inventory & Materials',
    description: 'Produk, material, dan pergerakan stok',
    icon: <Package className="w-4 h-4" />,
    tables: ['products', 'materials', 'material_stock_movements', 'material_inventory_batches', 'material_usage_history', 'stock_movements', 'product_materials']
  },
  {
    id: 'production',
    name: 'Production History',
    description: 'Riwayat produksi',
    icon: <Package className="w-4 h-4" />,
    tables: ['production_records']
  },
  {
    id: 'purchasing',
    name: 'Purchasing & Suppliers',
    description: 'Purchase orders, suppliers, dan hutang dagang',
    icon: <Truck className="w-4 h-4" />,
    tables: ['purchase_orders', 'purchase_order_items', 'suppliers', 'supplier_materials', 'accounts_payable']
  },
  {
    id: 'journal',
    name: 'Journal Entries',
    description: 'Jurnal umum dan semua transaksi akuntansi',
    icon: <BookOpen className="w-4 h-4" />,
    tables: ['journal_entry_lines', 'journal_entries']
  },
  {
    id: 'finance',
    name: 'Finance & Accounting',
    description: 'Pengeluaran, kas, dan laporan keuangan',
    icon: <DollarSign className="w-4 h-4" />,
    tables: ['expenses', 'expense_categories', 'expense_category_mapping', 'account_transfers'],
    dependencies: ['journal']
  },
  {
    id: 'accounts',
    name: 'Chart of Accounts (Reset Balance)',
    description: 'Reset saldo akun ke 0 (struktur akun tetap)',
    icon: <DollarSign className="w-4 h-4" />,
    tables: ['accounts_balance_only'],
    dependencies: ['journal']
  },
  {
    id: 'accounts_delete',
    name: 'Chart of Accounts (Hapus Semua)',
    description: 'HAPUS SEMUA AKUN - Reset COA sepenuhnya',
    icon: <Trash2 className="w-4 h-4" />,
    tables: ['accounts'],
    dependencies: ['journal']
  },
  {
    id: 'hr',
    name: 'Human Resources',
    description: 'Karyawan, absensi, kasbon, payroll, dan komisi',
    icon: <Users className="w-4 h-4" />,
    tables: ['employee_advances', 'advance_repayments', 'attendance', 'commission_rules', 'commission_entries', 'employee_salaries', 'payroll_records']
  },
  {
    id: 'operations',
    name: 'Operations & Logistics',
    description: 'Pengantaran dan operasional',
    icon: <Truck className="w-4 h-4" />,
    tables: ['retasi']
  },
  {
    id: 'branches',
    name: 'Branch Management',
    description: 'Data cabang dan transfer antar cabang',
    icon: <Building2 className="w-4 h-4" />,
    tables: ['companies', 'branches', 'branch_transfers']
  },
  {
    id: 'assets',
    name: 'Asset Management',
    description: 'Aset perusahaan dan maintenance',
    icon: <Package className="w-4 h-4" />,
    tables: ['assets', 'asset_maintenance']
  },
  {
    id: 'loans',
    name: 'Loans & Financing',
    description: 'Pinjaman dan pembayaran cicilan',
    icon: <HandCoins className="w-4 h-4" />,
    tables: ['loans', 'loan_payments', 'loan_payment_schedules']
  },
  {
    id: 'zakat',
    name: 'Zakat & Charity',
    description: 'Pencatatan zakat dan nishab',
    icon: <Heart className="w-4 h-4" />,
    tables: ['zakat_records', 'nishab_reference']
  }
]

// =============================================
// MAIN COMPONENT
// =============================================
export default function WebManagementPage() {
  const { user } = useAuth()
  const branchContext = useBranch()
  const currentBranch = branchContext?.currentBranch
  const { toast } = useToast()

  // Check if user is owner
  if (!isOwner(user)) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Akses Ditolak
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Halaman ini hanya dapat diakses oleh Owner.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Server className="h-6 w-6" />
          Web Management
        </h1>
        <p className="text-muted-foreground">
          Kelola kesehatan sistem, reset database, dan backup/restore data.
        </p>
      </div>

      <Tabs defaultValue="healthy" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="healthy" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Healthy
          </TabsTrigger>
          <TabsTrigger value="reset" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Reset Database
          </TabsTrigger>
          <TabsTrigger value="backup" className="flex items-center gap-2">
            <HardDrive className="h-4 w-4" />
            Import / Export
          </TabsTrigger>
        </TabsList>

        {/* HEALTHY TAB */}
        <TabsContent value="healthy">
          <HealthyTab />
        </TabsContent>

        {/* RESET DATABASE TAB */}
        <TabsContent value="reset">
          <ResetDatabaseTab user={user} />
        </TabsContent>

        {/* BACKUP/RESTORE TAB */}
        <TabsContent value="backup">
          <BackupRestoreTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// =============================================
// HEALTHY TAB
// =============================================
function HealthyTab() {
  const [isChecking, setIsChecking] = useState(false)
  const [healthStatus, setHealthStatus] = useState<{
    database: 'unknown' | 'healthy' | 'error'
    api: 'unknown' | 'healthy' | 'error'
    lastCheck: Date | null
    details: string[]
  }>({
    database: 'unknown',
    api: 'unknown',
    lastCheck: null,
    details: []
  })

  const checkHealth = async () => {
    setIsChecking(true)
    const details: string[] = []
    let dbStatus: 'healthy' | 'error' = 'healthy'
    let apiStatus: 'healthy' | 'error' = 'healthy'

    try {
      // Check database connection - use 'profiles' table which always has 'id'
      const startDb = Date.now()
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .order('id').limit(1)

      if (error) {
        dbStatus = 'error'
        details.push(`Database Error: ${error.message}`)
      } else {
        const dbTime = Date.now() - startDb
        details.push(`Database OK (${dbTime}ms)`)
      }

      // Check Auth API - use /auth/login endpoint with OPTIONS or simple check
      const startApi = Date.now()
      try {
        // Just check if auth server responds (even with error, it means server is up)
        const response = await fetch(`${window.location.origin}/auth/login`, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({}) // Empty body will return error but confirms server is up
        })
        const apiTime = Date.now() - startApi

        // Any response means the server is up (even 400/401 is OK)
        if (response.status < 500) {
          details.push(`Auth API OK (${apiTime}ms)`)
        } else {
          apiStatus = 'error'
          details.push(`Auth API Error: ${response.status}`)
        }
      } catch (e: any) {
        apiStatus = 'error'
        details.push(`Auth API Error: ${e.message}`)
      }

      // Check tables count
      const tables = ['customers', 'products', 'transactions', 'accounts']
      for (const table of tables) {
        try {
          const { count, error: countError } = await supabase
            .from(table)
            .select('*', { count: 'exact', head: true })

          if (countError) {
            details.push(`${table}: Error`)
          } else {
            details.push(`${table}: ${count || 0} records`)
          }
        } catch {
          details.push(`${table}: Error`)
        }
      }

    } catch (e: any) {
      dbStatus = 'error'
      details.push(`General Error: ${e.message}`)
    }

    setHealthStatus({
      database: dbStatus,
      api: apiStatus,
      lastCheck: new Date(),
      details
    })
    setIsChecking(false)
  }

  const getStatusBadge = (status: 'unknown' | 'healthy' | 'error') => {
    switch (status) {
      case 'healthy':
        return <Badge className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" /> Healthy</Badge>
      case 'error':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Error</Badge>
      default:
        return <Badge variant="secondary">Unknown</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            System Health Check
          </CardTitle>
          <CardDescription>
            Periksa status koneksi database dan API server.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-blue-500" />
                    <span className="font-medium">Database</span>
                  </div>
                  {getStatusBadge(healthStatus.database)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="h-5 w-5 text-purple-500" />
                    <span className="font-medium">Auth API</span>
                  </div>
                  {getStatusBadge(healthStatus.api)}
                </div>
              </CardContent>
            </Card>
          </div>

          {healthStatus.lastCheck && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Last check: {format(healthStatus.lastCheck, "d MMM yyyy, HH:mm:ss", { locale: id })}
            </div>
          )}

          {healthStatus.details.length > 0 && (
            <Card className="bg-gray-50">
              <CardContent className="pt-4">
                <Label className="text-sm font-medium">Details:</Label>
                <ScrollArea className="h-40 mt-2 rounded-md border p-3 bg-gray-900 text-gray-100 font-mono text-xs">
                  {healthStatus.details.map((detail, i) => (
                    <div key={i} className="py-0.5">
                      {detail.includes('OK') || detail.includes('records') ? (
                        <span className="text-green-400">{detail}</span>
                      ) : detail.includes('Error') ? (
                        <span className="text-red-400">{detail}</span>
                      ) : (
                        detail
                      )}
                    </div>
                  ))}
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          <Button onClick={checkHealth} disabled={isChecking} className="w-full">
            {isChecking ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Run Health Check
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

// =============================================
// RESET DATABASE TAB
// =============================================
function ResetDatabaseTab({ user }: { user: any }) {
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [selectAll, setSelectAll] = useState(false)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)

  const handleCategoryToggle = (categoryId: string, checked: boolean) => {
    if (checked) {
      const category = dataCategories.find(cat => cat.id === categoryId)
      if (category?.dependencies) {
        const missingDeps = category.dependencies.filter(depId => !selectedCategories.includes(depId))
        if (missingDeps.length > 0) {
          const depNames = missingDeps.map(depId => dataCategories.find(cat => cat.id === depId)?.name).join(', ')
          sonnerToast.warning(`Warning: ${category.name} depends on ${depNames}`)
        }
      }
      setSelectedCategories(prev => [...prev, categoryId])
    } else {
      setSelectedCategories(prev => prev.filter(id => id !== categoryId))
      setSelectAll(false)
    }
  }

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked)
    if (checked) {
      setSelectedCategories(dataCategories.map(cat => cat.id))
    } else {
      setSelectedCategories([])
    }
  }

  const getTablesToClear = () => {
    const tables: string[] = []
    selectedCategories.forEach(categoryId => {
      const category = dataCategories.find(cat => cat.id === categoryId)
      if (category) {
        tables.push(...category.tables)
      }
    })
    return [...new Set(tables)]
  }

  const resetDatabase = async () => {
    if (!password) {
      sonnerToast.error('Masukkan password untuk konfirmasi')
      return
    }

    if (selectedCategories.length === 0) {
      sonnerToast.error('Pilih minimal satu kategori data untuk direset')
      return
    }

    setIsLoading(true)
    sonnerToast.info('Memulai proses reset database...')

    try {
      // Verify password
      let authError: Error | null = null
      if (isPostgRESTMode) {
        const result = await postgrestAuth.signInWithPassword({
          email: user?.email || '',
          password: password
        })
        authError = result.error
      } else {
        const result = await supabase.auth.signInWithPassword({
          email: user?.email || '',
          password: password
        })
        authError = result.error
      }

      if (authError) {
        sonnerToast.error('Password salah')
        setIsLoading(false)
        return
      }

      const tablesToClear = getTablesToClear().filter(t => t !== 'accounts_balance_only')
      let clearedTables: string[] = []
      let failedTables: string[] = []

      // Clear tables in reverse order
      const reversedTables = [...tablesToClear].reverse()

      for (const table of reversedTables) {
        try {
          const { error: deleteError } = await supabase
            .from(table)
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000')

          if (deleteError) {
            failedTables.push(table)
          } else {
            clearedTables.push(table)
            sonnerToast.success(`Berhasil menghapus data dari ${table}`)
          }
        } catch {
          failedTables.push(table)
        }
      }

      // Reset account balances if selected
      if (selectedCategories.includes('accounts')) {
        try {
          await supabase
            .from('accounts')
            .update({ balance: 0, initial_balance: 0 })
            .neq('id', '00000000-0000-0000-0000-000000000000')
          clearedTables.push('accounts (balance reset)')
        } catch {
          failedTables.push('accounts (balance reset)')
        }
      }

      // Delete all accounts if selected
      if (selectedCategories.includes('accounts_delete')) {
        try {
          await supabase
            .from('accounts')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000')
          clearedTables.push('accounts')
        } catch {
          failedTables.push('accounts')
        }
      }

      sonnerToast.success(`Reset selesai! ${clearedTables.length} tabel berhasil, ${failedTables.length} gagal.`)

      setIsConfirmOpen(false)
      setPassword('')
      setSelectedCategories([])
      setSelectAll(false)

      setTimeout(() => window.location.reload(), 2000)

    } catch (error: any) {
      sonnerToast.error('Gagal mereset database: ' + error.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-red-600 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Reset Database
          </CardTitle>
          <CardDescription>
            Hapus data secara selektif berdasarkan kategori. Data karyawan dan login tetap aman.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Select All */}
          <div className="flex items-center space-x-2 p-3 bg-gray-50 rounded-lg">
            <Checkbox
              id="select-all"
              checked={selectAll}
              onCheckedChange={handleSelectAll}
            />
            <Label htmlFor="select-all" className="font-medium cursor-pointer">
              Select All Categories
            </Label>
          </div>

          <Separator />

          {/* Categories Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {dataCategories.map((category) => (
              <div
                key={category.id}
                className={`flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50 transition-colors ${
                  selectedCategories.includes(category.id) ? 'border-red-300 bg-red-50' : ''
                }`}
              >
                <Checkbox
                  id={category.id}
                  checked={selectedCategories.includes(category.id)}
                  onCheckedChange={(checked) => handleCategoryToggle(category.id, checked as boolean)}
                />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    {category.icon}
                    <Label htmlFor={category.id} className="font-medium cursor-pointer">
                      {category.name}
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground">{category.description}</p>
                  {category.dependencies && (
                    <p className="text-xs text-orange-600">
                      Depends on: {category.dependencies.join(', ')}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Selected Summary */}
          {selectedCategories.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>{getTablesToClear().length} tabel</strong> akan dihapus:
                <span className="text-xs block mt-1">{getTablesToClear().join(', ')}</span>
              </AlertDescription>
            </Alert>
          )}

          {/* Password & Confirm */}
          <div className="space-y-4 pt-4 border-t">
            <div className="space-y-2">
              <Label htmlFor="password">Password untuk konfirmasi:</Label>
              <Input
                id="password"
                type="password"
                placeholder="Masukkan password Anda"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <Button
              variant="destructive"
              onClick={() => setIsConfirmOpen(true)}
              disabled={!password || selectedCategories.length === 0 || isLoading}
              className="w-full"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Reset {selectedCategories.length} Kategori
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Confirm Dialog */}
      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600">
              Konfirmasi Reset Database
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Apakah Anda YAKIN? Tindakan ini TIDAK DAPAT DIBATALKAN!</p>
                <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                  <strong>{getTablesToClear().length} tabel</strong> akan dihapus permanen!
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                resetDatabase()
              }}
              disabled={isLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {isLoading ? 'Mereset...' : 'Ya, Reset Sekarang'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// =============================================
// SQL Backup Types
// =============================================
interface SqlBackupFile {
  filename: string
  path: string
  size: number
  sizeFormatted: string
  createdAt: string
}

// =============================================
// BACKUP/RESTORE TAB
// =============================================
function BackupRestoreTab() {
  const { toast } = useToast()
  const branchContext = useBranch()
  const currentBranch = branchContext?.currentBranch
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Backup state
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [backupProgress, setBackupProgress] = useState<BackupProgress | null>(null)

  // Restore state
  const [isRestoring, setIsRestoring] = useState(false)
  const [restoreProgress, setRestoreProgress] = useState<RestoreProgress | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [parsedBackup, setParsedBackup] = useState<BackupData | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [restoreDetails, setRestoreDetails] = useState<string[]>([])

  // Restore options
  const [clearExisting, setClearExisting] = useState(false)
  const [skipUsers, setSkipUsers] = useState(true)

  // SQL Backup state
  const [isSqlBackingUp, setIsSqlBackingUp] = useState(false)
  const [sqlBackups, setSqlBackups] = useState<SqlBackupFile[]>([])
  const [isLoadingBackups, setIsLoadingBackups] = useState(false)
  const [lastSqlBackup, setLastSqlBackup] = useState<SqlBackupFile | null>(null)

  // Handle backup
  const handleBackup = async () => {
    setIsBackingUp(true)
    setBackupProgress(null)

    try {
      await backupRestoreService.downloadBackup((progress) => {
        setBackupProgress(progress)
      })

      toast({
        title: "Backup Berhasil",
        description: "File backup telah diunduh.",
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Backup Gagal",
        description: err.message,
      })
    } finally {
      setIsBackingUp(false)
    }
  }

  // Handle file selection
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setSelectedFile(file)
    setParsedBackup(null)
    setParseError(null)
    setRestoreDetails([])

    try {
      const data = await backupRestoreService.parseBackupFile(file)
      const validation = backupRestoreService.validateBackupFile(data)

      if (!validation.valid) {
        setParseError(validation.error!)
        return
      }

      setParsedBackup(data)
    } catch (err: any) {
      setParseError(err.message)
    }
  }

  // Handle restore
  const handleRestore = async () => {
    if (!parsedBackup) return

    const confirmed = window.confirm(
      clearExisting
        ? "PERINGATAN: Semua data existing akan DIHAPUS. Lanjutkan?"
        : "Data dari backup akan di-merge dengan data existing. Lanjutkan?"
    )

    if (!confirmed) return

    setIsRestoring(true)
    setRestoreProgress(null)
    setRestoreDetails([])

    try {
      const result = await backupRestoreService.restoreFromBackup(
        parsedBackup,
        {
          clearExisting,
          skipUsers,
          activeBranchId: currentBranch?.id // Remap semua data ke branch aktif
        },
        (progress) => {
          setRestoreProgress(progress)
        }
      )

      setRestoreDetails(result.details)

      toast({
        title: result.success ? "Restore Berhasil" : "Restore Selesai dengan Error",
        description: result.message,
        variant: result.success ? "default" : "destructive"
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Restore Gagal",
        description: err.message,
      })
    } finally {
      setIsRestoring(false)
    }
  }

  // Reset state
  const resetState = () => {
    setSelectedFile(null)
    setParsedBackup(null)
    setParseError(null)
    setRestoreDetails([])
    setRestoreProgress(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Get auth token for API calls
  const getAuthToken = () => {
    return postgrestAuth.getAccessToken() || ''
  }

  // Get auth URL from tenant config (works for localhost dev and production)
  const getAuthUrl = () => {
    const config = getTenantConfigDynamic()
    return config.authUrl
  }

  // Load SQL backups list
  const loadSqlBackups = async () => {
    setIsLoadingBackups(true)
    try {
      const response = await fetch(`${getAuthUrl()}/v1/admin/backups`, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
          'Accept': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        setSqlBackups(data.backups || [])
      } else {
        console.error('Failed to load backups:', response.status)
      }
    } catch (err: any) {
      console.error('Error loading backups:', err)
    } finally {
      setIsLoadingBackups(false)
    }
  }

  // Create SQL backup
  const handleSqlBackup = async () => {
    setIsSqlBackingUp(true)
    setLastSqlBackup(null)

    try {
      const response = await fetch(`${getAuthUrl()}/v1/admin/backup`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setLastSqlBackup(data.backup)
        toast({
          title: "SQL Backup Berhasil",
          description: `File: ${data.backup.filename} (${data.backup.sizeFormatted})`,
        })
        // Reload backup list
        loadSqlBackups()
      } else {
        toast({
          variant: "destructive",
          title: "SQL Backup Gagal",
          description: data.error_description || data.error || 'Unknown error',
        })
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "SQL Backup Gagal",
        description: err.message,
      })
    } finally {
      setIsSqlBackingUp(false)
    }
  }

  // Download SQL backup
  const handleDownloadSqlBackup = async (filename: string) => {
    try {
      const response = await fetch(`${getAuthUrl()}/v1/admin/backup/download/${encodeURIComponent(filename)}`, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      } else {
        toast({
          variant: "destructive",
          title: "Download Gagal",
          description: "File tidak ditemukan atau akses ditolak",
        })
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Download Gagal",
        description: err.message,
      })
    }
  }

  // Delete SQL backup
  const handleDeleteSqlBackup = async (filename: string) => {
    if (!window.confirm(`Hapus backup ${filename}?`)) return

    try {
      const response = await fetch(`${getAuthUrl()}/v1/admin/backup/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      })

      if (response.ok) {
        toast({
          title: "Backup Dihapus",
          description: filename,
        })
        loadSqlBackups()
      } else {
        toast({
          variant: "destructive",
          title: "Hapus Gagal",
          description: "Gagal menghapus file backup",
        })
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Hapus Gagal",
        description: err.message,
      })
    }
  }

  return (
    <div className="space-y-6">
      {/* SQL FULL BACKUP SECTION */}
      <Card className="border-purple-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileArchive className="h-5 w-5 text-purple-500" />
            SQL Full Backup (Server)
          </CardTitle>
          <CardDescription>
            Backup lengkap database termasuk schema, RLS policies, functions, dan semua data.
            Backup disimpan di server VPS.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button
              onClick={handleSqlBackup}
              disabled={isSqlBackingUp}
              className="flex-1 bg-purple-600 hover:bg-purple-700"
            >
              {isSqlBackingUp ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Creating Backup...
                </>
              ) : (
                <>
                  <Database className="h-4 w-4 mr-2" />
                  Create SQL Backup
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={loadSqlBackups}
              disabled={isLoadingBackups}
            >
              {isLoadingBackups ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <List className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Last backup info */}
          {lastSqlBackup && (
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription>
                <div className="text-sm text-green-700">
                  <strong>Backup berhasil dibuat:</strong><br />
                  {lastSqlBackup.filename} ({lastSqlBackup.sizeFormatted})
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Backup list */}
          {sqlBackups.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Backup Files di Server:</Label>
              <ScrollArea className="h-48 rounded-md border">
                <div className="p-2 space-y-2">
                  {sqlBackups.map((backup) => (
                    <div
                      key={backup.filename}
                      className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-sm"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{backup.filename}</div>
                        <div className="text-xs text-muted-foreground">
                          {backup.sizeFormatted} • {format(new Date(backup.createdAt), "d MMM yyyy, HH:mm", { locale: id })}
                        </div>
                      </div>
                      <div className="flex gap-1 ml-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDownloadSqlBackup(backup.filename)}
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteSqlBackup(backup.filename)}
                          className="text-red-500 hover:text-red-700"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Backup SQL lengkap termasuk: Schema, RLS Policies (72), Functions, Triggers, dan Data.
            Backup otomatis dihapus setelah 7 hari.
          </p>
        </CardContent>
      </Card>

      {/* JSON BACKUP SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* EXPORT/BACKUP CARD */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-blue-500" />
            Export (Backup)
          </CardTitle>
          <CardDescription>
            Download seluruh data database sebagai file JSON.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {backupProgress && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>{backupProgress.message}</span>
                <Badge variant={backupProgress.status === 'completed' ? 'default' : 'secondary'}>
                  {backupProgress.currentIndex}/{backupProgress.totalTables}
                </Badge>
              </div>
              <Progress
                value={(backupProgress.currentIndex / backupProgress.totalTables) * 100}
              />
            </div>
          )}

          <Button
            onClick={handleBackup}
            disabled={isBackingUp}
            className="w-full"
          >
            {isBackingUp ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Memproses Backup...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Download Backup
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* IMPORT/RESTORE CARD */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-green-500" />
            Import (Restore)
          </CardTitle>
          <CardDescription>
            Restore data dari file backup JSON.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* File Input */}
          <div className="space-y-2">
            <Label htmlFor="backup-file">Pilih File Backup</Label>
            <input
              ref={fileInputRef}
              id="backup-file"
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-green-50 file:text-green-700
                hover:file:bg-green-100
                cursor-pointer"
            />
          </div>

          {/* Parse Error */}
          {parseError && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{parseError}</AlertDescription>
            </Alert>
          )}

          {/* Backup Info */}
          {parsedBackup && (
            <div className="space-y-4">
              <Alert>
                <FileJson className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1 text-sm">
                    <div><strong>Dibuat:</strong> {format(new Date(parsedBackup.createdAt), "d MMM yyyy, HH:mm", { locale: id })}</div>
                    <div><strong>Server:</strong> {parsedBackup.serverUrl}</div>
                    <div><strong>Data:</strong> {parsedBackup.metadata.totalRecords} record dari {parsedBackup.metadata.tableCount} tabel</div>
                  </div>
                </AlertDescription>
              </Alert>

              {/* Restore Options */}
              <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
                <Label className="text-sm font-medium">Opsi Restore</Label>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="clear-existing"
                    checked={clearExisting}
                    onCheckedChange={(checked) => setClearExisting(checked as boolean)}
                  />
                  <Label htmlFor="clear-existing" className="text-sm text-gray-600 cursor-pointer">
                    Hapus semua data existing sebelum restore
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="skip-users"
                    checked={skipUsers}
                    onCheckedChange={(checked) => setSkipUsers(checked as boolean)}
                  />
                  <Label htmlFor="skip-users" className="text-sm text-gray-600 cursor-pointer">
                    Jangan restore data users (lebih aman)
                  </Label>
                </div>

                {clearExisting && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Semua data existing akan DIHAPUS PERMANEN!
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              {/* Progress */}
              {restoreProgress && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>{restoreProgress.message}</span>
                    <Badge variant={restoreProgress.status === 'completed' ? 'default' : 'secondary'}>
                      {restoreProgress.currentIndex}/{restoreProgress.totalTables}
                    </Badge>
                  </div>
                  <Progress
                    value={(restoreProgress.currentIndex / restoreProgress.totalTables) * 100}
                  />
                </div>
              )}

              {/* Restore Details */}
              {restoreDetails.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Detail Restore</Label>
                  <ScrollArea className="h-32 rounded-md border p-3 bg-gray-900 text-gray-100 font-mono text-xs">
                    {restoreDetails.map((detail, i) => (
                      <div key={i} className="py-0.5">
                        {detail}
                      </div>
                    ))}
                  </ScrollArea>
                </div>
              )}

              {/* Restore Button */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={resetState}
                  className="flex-1"
                >
                  Reset
                </Button>
                <Button
                  onClick={handleRestore}
                  disabled={isRestoring}
                  variant={clearExisting ? "destructive" : "default"}
                  className="flex-1"
                >
                  {isRestoring ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Restoring...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      {clearExisting ? 'Restore (Replace)' : 'Restore (Merge)'}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  )
}
