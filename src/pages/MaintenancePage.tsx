"use client"
import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Plus,
  Edit,
  Trash2,
  Wrench,
  Calendar,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  DollarSign,
  User,
  FileText,
  RotateCw,
} from "lucide-react"
import { useMaintenance, useMaintenanceSummary, useDeleteMaintenance, useCompleteMaintenance } from "@/hooks/useMaintenance"
import { AssetMaintenance } from "@/types/assets"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/use-toast"
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
import { formatCurrency } from "@/lib/utils"
import { format, isPast, isFuture, isToday } from "date-fns"
import { id as localeId } from "date-fns/locale"
import { MaintenanceDialog } from "@/components/MaintenanceDialog"

export default function MaintenancePage() {
  const [selectedMaintenance, setSelectedMaintenance] = useState<AssetMaintenance | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [filterType, setFilterType] = useState<string>("all")

  const { toast } = useToast()
  const { data: maintenanceRecords = [], isLoading } = useMaintenance()
  const { data: summary } = useMaintenanceSummary()
  const deleteMaintenance = useDeleteMaintenance()
  const completeMaintenance = useCompleteMaintenance()

  const handleDeleteMaintenance = async (id: string) => {
    try {
      await deleteMaintenance.mutateAsync(id)
      toast({
        title: "Berhasil",
        description: "Jadwal maintenance berhasil dihapus",
      })
    } catch (error) {
      toast({
        title: "Gagal",
        description: "Gagal menghapus jadwal maintenance",
        variant: "destructive",
      })
    }
  }

  const handleCompleteMaintenance = async (id: string, actualCost: number, workPerformed?: string) => {
    try {
      await completeMaintenance.mutateAsync({ id, actualCost, workPerformed })
      toast({
        title: "Berhasil",
        description: "Maintenance berhasil diselesaikan",
      })
    } catch (error) {
      toast({
        title: "Gagal",
        description: "Gagal menyelesaikan maintenance",
        variant: "destructive",
      })
    }
  }

  const getMaintenanceTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      preventive: 'Preventif',
      corrective: 'Korektif',
      inspection: 'Inspeksi',
      calibration: 'Kalibrasi',
      other: 'Lainnya',
    }
    return labels[type] || type
  }

  const getStatusBadge = (status: string, scheduledDate: Date) => {
    const isOverdue = status === 'scheduled' && isPast(scheduledDate) && !isToday(scheduledDate)
    const actualStatus = isOverdue ? 'overdue' : status

    const variants: Record<string, { variant: any; label: string; icon: any }> = {
      scheduled: { variant: 'outline', label: 'Terjadwal', icon: <Calendar className="h-3 w-3" /> },
      in_progress: { variant: 'secondary', label: 'Dalam Proses', icon: <Clock className="h-3 w-3" /> },
      completed: { variant: 'default', label: 'Selesai', icon: <CheckCircle2 className="h-3 w-3" /> },
      cancelled: { variant: 'destructive', label: 'Dibatalkan', icon: <XCircle className="h-3 w-3" /> },
      overdue: { variant: 'destructive', label: 'Terlambat', icon: <AlertTriangle className="h-3 w-3" /> },
    }
    const config = variants[actualStatus] || variants.scheduled
    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        {config.icon}
        {config.label}
      </Badge>
    )
  }

  const getPriorityBadge = (priority: string) => {
    const colors: Record<string, string> = {
      critical: 'bg-red-100 text-red-800 border-red-300',
      high: 'bg-orange-100 text-orange-800 border-orange-300',
      medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      low: 'bg-green-100 text-green-800 border-green-300',
    }
    const labels: Record<string, string> = {
      critical: 'Kritis',
      high: 'Tinggi',
      medium: 'Sedang',
      low: 'Rendah',
    }
    return (
      <Badge variant="outline" className={colors[priority] || colors.medium}>
        {labels[priority] || priority}
      </Badge>
    )
  }

  const getDateStatus = (scheduledDate: Date) => {
    if (isToday(scheduledDate)) {
      return <span className="text-orange-600 font-semibold">Hari Ini</span>
    } else if (isPast(scheduledDate)) {
      return <span className="text-red-600 font-semibold">Terlambat</span>
    } else if (isFuture(scheduledDate)) {
      return <span className="text-blue-600">Akan Datang</span>
    }
    return null
  }

  const filteredRecords = maintenanceRecords.filter(record => {
    if (filterStatus !== 'all' && record.status !== filterStatus) {
      // Handle overdue status
      if (filterStatus === 'overdue') {
        if (!(record.status === 'scheduled' && isPast(record.scheduledDate) && !isToday(record.scheduledDate))) {
          return false
        }
      } else {
        return false
      }
    }
    if (filterType !== 'all' && record.maintenanceType !== filterType) return false
    return true
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Maintenance Aset</h1>
          <p className="text-muted-foreground">
            Jadwal dan riwayat maintenance aset perusahaan
          </p>
        </div>
        <Button onClick={() => {
          setSelectedMaintenance(null)
          setIsDialogOpen(true)
        }}>
          <Plus className="h-4 w-4 mr-2" />
          Jadwalkan Maintenance
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Jadwal</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalScheduled || 0}</div>
            <p className="text-xs text-muted-foreground">Maintenance terjadwal</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Terlambat</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {summary?.overdueCount || 0}
            </div>
            <p className="text-xs text-muted-foreground">Perlu segera ditangani</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dalam Proses</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.inProgressCount || 0}</div>
            <p className="text-xs text-muted-foreground">Sedang dikerjakan</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Biaya Bulan Ini</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(summary?.totalCostThisMonth || 0)}
            </div>
            <p className="text-xs text-muted-foreground">Total pengeluaran</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all" onClick={() => setFilterStatus('all')}>
            Semua
          </TabsTrigger>
          <TabsTrigger value="scheduled" onClick={() => setFilterStatus('scheduled')}>
            Terjadwal
          </TabsTrigger>
          <TabsTrigger value="overdue" onClick={() => setFilterStatus('overdue')}>
            Terlambat
          </TabsTrigger>
          <TabsTrigger value="in_progress" onClick={() => setFilterStatus('in_progress')}>
            Dalam Proses
          </TabsTrigger>
          <TabsTrigger value="completed" onClick={() => setFilterStatus('completed')}>
            Selesai
          </TabsTrigger>
        </TabsList>

        <TabsContent value={filterStatus} className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Daftar Maintenance</CardTitle>
                  <CardDescription>
                    Menampilkan {filteredRecords.length} dari {maintenanceRecords.length} jadwal
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <select
                    className="border rounded-md px-3 py-2 text-sm"
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                  >
                    <option value="all">Semua Tipe</option>
                    <option value="preventive">Preventif</option>
                    <option value="corrective">Korektif</option>
                    <option value="inspection">Inspeksi</option>
                    <option value="calibration">Kalibrasi</option>
                    <option value="other">Lainnya</option>
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Judul</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead>Prioritas</TableHead>
                    <TableHead>Estimasi Biaya</TableHead>
                    <TableHead>Biaya Aktual</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        Tidak ada jadwal maintenance
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRecords.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {format(record.scheduledDate, 'dd MMM yyyy', { locale: localeId })}
                            </span>
                            {getDateStatus(record.scheduledDate)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{record.title}</div>
                            {record.description && (
                              <div className="text-xs text-muted-foreground line-clamp-1">
                                {record.description}
                              </div>
                            )}
                            {record.isRecurring && (
                              <Badge variant="outline" className="mt-1">
                                <RotateCw className="h-3 w-3 mr-1" />
                                Berulang
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{getMaintenanceTypeLabel(record.maintenanceType)}</TableCell>
                        <TableCell>{getPriorityBadge(record.priority)}</TableCell>
                        <TableCell>{formatCurrency(record.estimatedCost)}</TableCell>
                        <TableCell>
                          {record.actualCost > 0 ? (
                            <div className="flex flex-col">
                              <span>{formatCurrency(record.actualCost)}</span>
                              {record.estimatedCost > 0 && (
                                <span className={`text-xs ${
                                  record.actualCost > record.estimatedCost
                                    ? 'text-red-600'
                                    : 'text-green-600'
                                }`}>
                                  {record.actualCost > record.estimatedCost ? '+' : ''}
                                  {formatCurrency(record.actualCost - record.estimatedCost)}
                                </span>
                              )}
                            </div>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>{getStatusBadge(record.status, record.scheduledDate)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {record.status === 'scheduled' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleCompleteMaintenance(record.id, record.estimatedCost)}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-1" />
                                Selesai
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setSelectedMaintenance(record)
                                setIsDialogOpen(true)
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Hapus Jadwal?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Anda yakin ingin menghapus jadwal maintenance "{record.title}"?
                                    Tindakan ini tidak dapat dibatalkan.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Batal</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteMaintenance(record.id)}
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
        </TabsContent>
      </Tabs>

      {/* Maintenance Dialog */}
      <MaintenanceDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        maintenance={selectedMaintenance}
      />
    </div>
  )
}
