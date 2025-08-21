"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/components/ui/use-toast"
import { Shield, Search, Filter, Download, Eye, AlertTriangle, CheckCircle, XCircle } from "lucide-react"
import { format } from "date-fns"
import { id as idLocale } from "date-fns/locale/id"
import { useOptimizedQuery } from "@/hooks/useOptimizedQuery"
import { supabase } from "@/integrations/supabase/client"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

interface AuditLog {
  id: string
  table_name: string
  operation: string
  record_id: string
  old_data?: any
  new_data?: any
  user_email: string
  user_role: string
  timestamp: string
  additional_info?: any
}

interface AuditLogViewerProps {
  className?: string
}

export function AuditLogViewer({ className }: AuditLogViewerProps) {
  const { toast } = useToast()
  const [searchTerm, setSearchTerm] = useState("")
  const [tableFilter, setTableFilter] = useState<string>("all")
  const [operationFilter, setOperationFilter] = useState<string>("all")
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)

  // Fetch audit logs with filters - with fallback to local storage
  const { data: auditLogs, isLoading, error, refetch } = useOptimizedQuery({
    queryKey: ['audit_logs', searchTerm, tableFilter, operationFilter],
    tableName: 'audit_logs',
    logPerformance: false, // Disable performance logging for audit logs to avoid recursion
    queryFn: async () => {
      try {
        let query = supabase
          .from('audit_logs')
          .select('*')
          .order('timestamp', { ascending: false })
          .limit(100)

        // Apply filters
        if (tableFilter !== 'all') {
          query = query.eq('table_name', tableFilter)
        }

        if (operationFilter !== 'all') {
          query = query.eq('operation', operationFilter)
        }

        if (searchTerm.trim()) {
          query = query.or(`user_email.ilike.%${searchTerm}%,record_id.ilike.%${searchTerm}%`)
        }

        const { data, error } = await query

        if (error) {
          // If audit_logs table doesn't exist, return local logs
          if (error.message.includes('relation') && error.message.includes('does not exist')) {
            console.warn('[Audit Log] Table not found, using local storage fallback')
            const { getLocalAuditLogs } = await import('@/utils/safeAuditLog')
            const localLogs = getLocalAuditLogs()
            
            // Apply same filters to local logs
            return localLogs.filter(log => {
              if (tableFilter !== 'all' && log.table_name !== tableFilter) return false
              if (operationFilter !== 'all' && log.operation !== operationFilter) return false
              if (searchTerm.trim() && 
                  !log.user_email?.toLowerCase().includes(searchTerm.toLowerCase()) &&
                  !log.record_id?.toLowerCase().includes(searchTerm.toLowerCase())) return false
              return true
            }).slice(0, 100) // Limit to 100
          }
          throw error
        }
        return data || []
      } catch (error) {
        console.warn('[Audit Log] Database query failed, using local fallback:', error)
        const { getLocalAuditLogs } = await import('@/utils/safeAuditLog')
        return getLocalAuditLogs().slice(0, 20) // Limited fallback
      }
    },
    staleTime: 30 * 1000, // 30 seconds for audit logs
  })

  // Fetch audit summary
  const { data: auditSummary } = useOptimizedQuery({
    queryKey: ['audit_summary'],
    tableName: 'audit_summary',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_summary')
        .select('*')
        .limit(20)

      if (error) throw error
      return data || []
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  const getOperationIcon = (operation: string) => {
    switch (operation) {
      case 'INSERT':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'UPDATE':
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />
      case 'DELETE':
        return <XCircle className="h-4 w-4 text-red-600" />
      default:
        return <Eye className="h-4 w-4 text-blue-600" />
    }
  }

  const getOperationBadge = (operation: string) => {
    const variants = {
      INSERT: 'success',
      UPDATE: 'default',
      DELETE: 'destructive',
      CLEANUP: 'secondary'
    } as const

    return (
      <Badge variant={variants[operation as keyof typeof variants] || 'default'}>
        {operation}
      </Badge>
    )
  }

  const exportAuditLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(1000)

      if (error) throw error

      // Create CSV content
      const csvContent = [
        ['Timestamp', 'Table', 'Operation', 'Record ID', 'User Email', 'User Role'],
        ...(data || []).map(log => [
          format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss'),
          log.table_name,
          log.operation,
          log.record_id,
          log.user_email || '',
          log.user_role || ''
        ])
      ].map(row => row.join(',')).join('\n')

      // Download file
      const blob = new Blob([csvContent], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit_logs_${format(new Date(), 'yyyy-MM-dd')}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      toast({
        title: "Export Berhasil",
        description: "Audit logs berhasil diekspor ke file CSV."
      })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Export Gagal",
        description: "Terjadi kesalahan saat mengekspor audit logs."
      })
    }
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold">Error Loading Audit Logs</h3>
            <p className="text-muted-foreground mb-4">
              {error instanceof Error ? error.message : 'Unknown error occurred'}
            </p>
            <Button onClick={() => refetch()}>Try Again</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Shield className="h-6 w-6 text-blue-600" />
              <div>
                <CardTitle>Audit Log System</CardTitle>
                <CardDescription>
                  Monitor and track all system operations and changes
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="outline" onClick={() => refetch()}>
                <Search className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button onClick={exportAuditLogs}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="Search by user email or record ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full"
              />
            </div>
            <Select value={tableFilter} onValueChange={setTableFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Table" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tables</SelectItem>
                <SelectItem value="profiles">Profiles</SelectItem>
                <SelectItem value="transactions">Transactions</SelectItem>
                <SelectItem value="customers">Customers</SelectItem>
                <SelectItem value="products">Products</SelectItem>
              </SelectContent>
            </Select>
            <Select value={operationFilter} onValueChange={setOperationFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Operation" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Operations</SelectItem>
                <SelectItem value="INSERT">Create</SelectItem>
                <SelectItem value="UPDATE">Update</SelectItem>
                <SelectItem value="DELETE">Delete</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      {auditSummary && auditSummary.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Activity Summary (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {auditSummary.slice(0, 8).map((summary, index) => (
                <div key={index} className="text-center p-3 bg-muted/50 rounded-lg">
                  <div className="font-semibold text-lg">{summary.operation_count}</div>
                  <div className="text-sm text-muted-foreground">
                    {summary.table_name} {summary.operation.toLowerCase()}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Audit Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Activity</CardTitle>
          <CardDescription>
            Showing {auditLogs?.length || 0} recent audit log entries
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Operation</TableHead>
                  <TableHead>Table</TableHead>
                  <TableHead>Record ID</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    </TableRow>
                  ))
                ) : auditLogs?.length ? (
                  auditLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono text-sm">
                        {format(new Date(log.timestamp), 'dd/MM HH:mm:ss', { locale: idLocale })}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          {getOperationIcon(log.operation)}
                          {getOperationBadge(log.operation)}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{log.table_name}</TableCell>
                      <TableCell className="font-mono text-sm">{log.record_id}</TableCell>
                      <TableCell>{log.user_email || 'System'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.user_role || 'system'}</Badge>
                      </TableCell>
                      <TableCell>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Audit Log Details</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="text-sm font-medium">Timestamp</label>
                                  <p className="font-mono text-sm">
                                    {format(new Date(log.timestamp), 'dd MMMM yyyy, HH:mm:ss', { locale: idLocale })}
                                  </p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium">Operation</label>
                                  <p>{getOperationBadge(log.operation)}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium">Table</label>
                                  <p className="font-medium">{log.table_name}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium">Record ID</label>
                                  <p className="font-mono text-sm">{log.record_id}</p>
                                </div>
                              </div>
                              
                              {log.old_data && (
                                <div>
                                  <label className="text-sm font-medium">Previous Data</label>
                                  <ScrollArea className="h-32">
                                    <pre className="text-xs bg-muted p-2 rounded mt-1">
                                      {JSON.stringify(log.old_data, null, 2)}
                                    </pre>
                                  </ScrollArea>
                                </div>
                              )}
                              
                              {log.new_data && (
                                <div>
                                  <label className="text-sm font-medium">New Data</label>
                                  <ScrollArea className="h-32">
                                    <pre className="text-xs bg-muted p-2 rounded mt-1">
                                      {JSON.stringify(log.new_data, null, 2)}
                                    </pre>
                                  </ScrollArea>
                                </div>
                              )}
                              
                              {log.additional_info && (
                                <div>
                                  <label className="text-sm font-medium">Additional Information</label>
                                  <ScrollArea className="h-24">
                                    <pre className="text-xs bg-muted p-2 rounded mt-1">
                                      {JSON.stringify(log.additional_info, null, 2)}
                                    </pre>
                                  </ScrollArea>
                                </div>
                              )}
                            </div>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      No audit logs found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}