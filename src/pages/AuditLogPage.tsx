import { useState } from 'react'
import { format } from 'date-fns'
import { id as localeId } from 'date-fns/locale'
import {
  History,
  Search,
  Filter,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Eye,
  Calendar,
  User,
  Database,
  FileText
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/useAuth'
import { Navigate } from 'react-router-dom'
import {
  useAuditLogs,
  AuditLog,
  AuditLogFilters,
  AUDITED_TABLES,
  TABLE_LABELS,
  OPERATION_LABELS,
  OPERATION_COLORS,
  formatChangedFields,
} from '@/hooks/useAuditLogs'

export default function AuditLogPage() {
  const { user } = useAuth()
  const [filters, setFilters] = useState<AuditLogFilters>({})
  const [limit, setLimit] = useState(100)
  const [showFilters, setShowFilters] = useState(true)
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  // Only owner can access
  if (user?.role !== 'owner') {
    return <Navigate to="/" replace />
  }

  const { data: auditLogs, isLoading, refetch, isFetching } = useAuditLogs(filters, limit)

  const handleFilterChange = (key: keyof AuditLogFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value === 'all' ? undefined : value
    }))
  }

  const clearFilters = () => {
    setFilters({})
  }

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const formatDateTime = (date: Date) => {
    return format(date, 'dd MMM yyyy HH:mm:ss', { locale: localeId })
  }

  const formatDate = (date: Date) => {
    return format(date, 'dd MMM yyyy', { locale: localeId })
  }

  const renderJsonValue = (value: any): string => {
    if (value === null || value === undefined) return 'null'
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2)
    }
    return String(value)
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <History className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Audit Log</h1>
            <p className="text-sm text-muted-foreground">
              Riwayat semua perubahan data sistem
            </p>
          </div>
        </div>
        <Button
          onClick={() => refetch()}
          disabled={isFetching}
          variant="outline"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <Collapsible open={showFilters} onOpenChange={setShowFilters}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Filter
                </CardTitle>
                {showFilters ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Table Filter */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Tabel
                </Label>
                <Select
                  value={filters.tableName || 'all'}
                  onValueChange={(value) => handleFilterChange('tableName', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Semua Tabel" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Tabel</SelectItem>
                    {AUDITED_TABLES.map(table => (
                      <SelectItem key={table} value={table}>
                        {TABLE_LABELS[table] || table}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Operation Filter */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Operasi
                </Label>
                <Select
                  value={filters.operation || 'all'}
                  onValueChange={(value) => handleFilterChange('operation', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Semua Operasi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Operasi</SelectItem>
                    <SelectItem value="INSERT">Tambah (INSERT)</SelectItem>
                    <SelectItem value="UPDATE">Ubah (UPDATE)</SelectItem>
                    <SelectItem value="DELETE">Hapus (DELETE)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* User Filter */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  User
                </Label>
                <Input
                  placeholder="Cari email user..."
                  value={filters.userEmail || ''}
                  onChange={(e) => handleFilterChange('userEmail', e.target.value || undefined)}
                />
              </div>

              {/* Record ID Filter */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  Record ID
                </Label>
                <Input
                  placeholder="Cari ID record..."
                  value={filters.recordId || ''}
                  onChange={(e) => handleFilterChange('recordId', e.target.value || undefined)}
                />
              </div>

              {/* Date From */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Dari Tanggal
                </Label>
                <Input
                  type="date"
                  value={filters.dateFrom ? format(filters.dateFrom, 'yyyy-MM-dd') : ''}
                  onChange={(e) => handleFilterChange('dateFrom', e.target.value ? new Date(e.target.value) : undefined)}
                />
              </div>

              {/* Date To */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Sampai Tanggal
                </Label>
                <Input
                  type="date"
                  value={filters.dateTo ? format(filters.dateTo, 'yyyy-MM-dd') : ''}
                  onChange={(e) => handleFilterChange('dateTo', e.target.value ? new Date(e.target.value) : undefined)}
                />
              </div>

              {/* Limit */}
              <div className="space-y-2">
                <Label>Jumlah Data</Label>
                <Select
                  value={String(limit)}
                  onValueChange={(value) => setLimit(Number(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="50">50 baris</SelectItem>
                    <SelectItem value="100">100 baris</SelectItem>
                    <SelectItem value="200">200 baris</SelectItem>
                    <SelectItem value="500">500 baris</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Clear Filters */}
              <div className="flex items-end">
                <Button variant="outline" onClick={clearFilters} className="w-full">
                  Reset Filter
                </Button>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Results Count */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {isLoading ? 'Memuat...' : `Menampilkan ${auditLogs?.length || 0} log`}
        </span>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]"></TableHead>
                  <TableHead className="w-[180px]">Waktu</TableHead>
                  <TableHead className="w-[150px]">Tabel</TableHead>
                  <TableHead className="w-[100px]">Operasi</TableHead>
                  <TableHead className="w-[200px]">User</TableHead>
                  <TableHead>Perubahan</TableHead>
                  <TableHead className="w-[80px]">Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  // Loading skeleton
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                    </TableRow>
                  ))
                ) : auditLogs?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Tidak ada data audit log
                    </TableCell>
                  </TableRow>
                ) : (
                  auditLogs?.map((log) => {
                    const isExpanded = expandedRows.has(log.id)
                    const changes = formatChangedFields(log.changedFields)

                    return (
                      <>
                        <TableRow
                          key={log.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => toggleRow(log.id)}
                        >
                          <TableCell>
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {formatDateTime(log.createdAt)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {TABLE_LABELS[log.tableName] || log.tableName}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={OPERATION_COLORS[log.operation]}>
                              {OPERATION_LABELS[log.operation] || log.operation}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {log.userEmail || <span className="text-muted-foreground italic">system</span>}
                          </TableCell>
                          <TableCell className="max-w-[300px]">
                            {log.operation === 'INSERT' && (
                              <span className="text-green-600 text-sm">Record baru dibuat</span>
                            )}
                            {log.operation === 'DELETE' && (
                              <span className="text-red-600 text-sm">Record dihapus</span>
                            )}
                            {log.operation === 'UPDATE' && changes.length > 0 && (
                              <div className="text-sm space-y-1">
                                {changes.slice(0, 2).map((change, i) => (
                                  <div key={i} className="truncate text-blue-600">
                                    {change}
                                  </div>
                                ))}
                                {changes.length > 2 && (
                                  <span className="text-muted-foreground text-xs">
                                    +{changes.length - 2} perubahan lainnya
                                  </span>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedLog(log)
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>

                        {/* Expanded Row */}
                        {isExpanded && (
                          <TableRow key={`${log.id}-expanded`}>
                            <TableCell colSpan={7} className="bg-muted/30 p-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <h4 className="font-semibold mb-2 text-sm">Record ID</h4>
                                  <code className="text-xs bg-muted p-2 rounded block break-all">
                                    {log.recordId}
                                  </code>
                                </div>
                                {log.operation === 'UPDATE' && changes.length > 0 && (
                                  <div>
                                    <h4 className="font-semibold mb-2 text-sm">Semua Perubahan</h4>
                                    <div className="space-y-1">
                                      {changes.map((change, i) => (
                                        <div key={i} className="text-xs bg-muted p-2 rounded">
                                          {change}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Detail Audit Log
            </DialogTitle>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-6">
              {/* Meta Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label className="text-muted-foreground">Waktu</Label>
                  <p className="font-mono text-sm">{formatDateTime(selectedLog.createdAt)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Tabel</Label>
                  <p>{TABLE_LABELS[selectedLog.tableName] || selectedLog.tableName}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Operasi</Label>
                  <Badge className={OPERATION_COLORS[selectedLog.operation]}>
                    {OPERATION_LABELS[selectedLog.operation]}
                  </Badge>
                </div>
                <div>
                  <Label className="text-muted-foreground">User</Label>
                  <p className="text-sm">{selectedLog.userEmail || 'system'}</p>
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground">Record ID</Label>
                <code className="block mt-1 p-2 bg-muted rounded text-xs break-all">
                  {selectedLog.recordId}
                </code>
              </div>

              {/* Changed Fields */}
              {selectedLog.operation === 'UPDATE' && selectedLog.changedFields && (
                <div>
                  <Label className="text-muted-foreground">Field yang Berubah</Label>
                  <div className="mt-2 border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Field</TableHead>
                          <TableHead>Nilai Lama</TableHead>
                          <TableHead>Nilai Baru</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(selectedLog.changedFields).map(([field, values]) => (
                          <TableRow key={field}>
                            <TableCell className="font-mono text-sm font-semibold">
                              {field}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-red-600 max-w-[200px]">
                              <pre className="whitespace-pre-wrap break-all">
                                {renderJsonValue(values.old)}
                              </pre>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-green-600 max-w-[200px]">
                              <pre className="whitespace-pre-wrap break-all">
                                {renderJsonValue(values.new)}
                              </pre>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Old Data (for DELETE) */}
              {selectedLog.operation === 'DELETE' && selectedLog.oldData && (
                <div>
                  <Label className="text-muted-foreground">Data yang Dihapus</Label>
                  <pre className="mt-2 p-4 bg-red-50 dark:bg-red-950 rounded-lg text-xs overflow-x-auto">
                    {JSON.stringify(selectedLog.oldData, null, 2)}
                  </pre>
                </div>
              )}

              {/* New Data (for INSERT) */}
              {selectedLog.operation === 'INSERT' && selectedLog.newData && (
                <div>
                  <Label className="text-muted-foreground">Data yang Ditambahkan</Label>
                  <pre className="mt-2 p-4 bg-green-50 dark:bg-green-950 rounded-lg text-xs overflow-x-auto">
                    {JSON.stringify(selectedLog.newData, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
