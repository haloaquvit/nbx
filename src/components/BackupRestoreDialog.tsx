"use client"

import { useState, useRef } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Download, Upload, Database, AlertTriangle, CheckCircle2, XCircle, FileJson, Clock, Server } from 'lucide-react'
import { backupRestoreService, BackupData, BackupProgress, RestoreProgress, BACKUP_TABLES, SKIP_RESTORE_TABLES } from '@/services/backupRestoreService'
import { format } from 'date-fns'
import { id } from 'date-fns/locale'
import { useToast } from '@/components/ui/use-toast'

export function BackupRestoreDialog() {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('backup')

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
  const [selectedTables, setSelectedTables] = useState<string[]>([])
  const [selectAll, setSelectAll] = useState(true)

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
    setSelectedTables([])
    setSelectAll(true)

    try {
      const data = await backupRestoreService.parseBackupFile(file)
      const validation = backupRestoreService.validateBackupFile(data)

      if (!validation.valid) {
        setParseError(validation.error!)
        return
      }

      setParsedBackup(data)

      // Set default: pilih semua tabel yang ada di backup
      const availableTables = getAvailableTables(data)
      setSelectedTables(availableTables)
    } catch (err: any) {
      setParseError(err.message)
    }
  }

  // Get available tables from backup (excluding skip tables)
  const getAvailableTables = (data: BackupData): string[] => {
    return BACKUP_TABLES.filter(t => {
      if (SKIP_RESTORE_TABLES.includes(t)) return false
      return data.tables[t] && data.tables[t].length > 0
    })
  }

  // Handle select all toggle
  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked)
    if (checked && parsedBackup) {
      setSelectedTables(getAvailableTables(parsedBackup))
    } else {
      setSelectedTables([])
    }
  }

  // Handle individual table toggle
  const handleTableToggle = (tableName: string, checked: boolean) => {
    if (checked) {
      setSelectedTables(prev => [...prev, tableName])
    } else {
      setSelectedTables(prev => prev.filter(t => t !== tableName))
      setSelectAll(false)
    }
  }

  // Handle restore
  const handleRestore = async () => {
    if (!parsedBackup) return

    if (selectedTables.length === 0) {
      alert("Pilih minimal satu tabel untuk di-restore")
      return
    }

    const tableCount = selectedTables.length
    const confirmed = window.confirm(
      clearExisting
        ? `PERINGATAN: Data pada ${tableCount} tabel yang dipilih akan DIHAPUS dan diganti dengan data dari backup. Lanjutkan?`
        : `Data dari ${tableCount} tabel yang dipilih akan di-merge dengan data existing (duplikat akan di-update). Lanjutkan?`
    )

    if (!confirmed) return

    setIsRestoring(true)
    setRestoreProgress(null)
    setRestoreDetails([])

    try {
      const result = await backupRestoreService.restoreFromBackup(
        parsedBackup,
        { clearExisting, skipUsers, selectedTables },
        (progress) => {
          setRestoreProgress(progress)
        }
      )

      setRestoreDetails(result.details)

      if (result.success) {
        toast({
          title: "Restore Berhasil",
          description: result.message,
        })
      } else {
        toast({
          variant: "destructive",
          title: "Restore Selesai dengan Error",
          description: result.message,
        })
      }
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

  // Reset restore state
  const resetRestoreState = () => {
    setSelectedFile(null)
    setParsedBackup(null)
    setParseError(null)
    setRestoreDetails([])
    setRestoreProgress(null)
    setSelectedTables([])
    setSelectAll(true)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      setOpen(newOpen)
      if (!newOpen) {
        resetRestoreState()
        setBackupProgress(null)
      }
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-blue-200 text-blue-700 hover:bg-blue-50">
          <Database className="mr-2 h-4 w-4" />
          Backup & Restore
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Backup & Restore Database
          </DialogTitle>
          <DialogDescription>
            Export semua data ke file JSON atau restore dari backup sebelumnya.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="backup" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Backup
            </TabsTrigger>
            <TabsTrigger value="restore" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Restore
            </TabsTrigger>
          </TabsList>

          {/* BACKUP TAB */}
          <TabsContent value="backup" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Export Database</CardTitle>
                <CardDescription>
                  Download seluruh data database sebagai file JSON.
                  File ini dapat digunakan untuk restore di kemudian hari.
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
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                      Memproses Backup...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Download Backup
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* RESTORE TAB */}
          <TabsContent value="restore" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Import Database</CardTitle>
                <CardDescription>
                  Restore data dari file backup JSON yang sudah di-export sebelumnya.
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
                      file:bg-blue-50 file:text-blue-700
                      hover:file:bg-blue-100
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
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Clock className="h-3 w-3" />
                            <span>
                              Dibuat: {format(new Date(parsedBackup.createdAt), "d MMMM yyyy, HH:mm", { locale: id })}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Server className="h-3 w-3" />
                            <span>Server: {parsedBackup.serverUrl}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Database className="h-3 w-3" />
                            <span>
                              {parsedBackup.metadata.totalRecords} record dari {parsedBackup.metadata.tableCount} tabel
                            </span>
                          </div>
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
                        <Alert variant="destructive" className="mt-2">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription>
                            Semua data existing akan DIHAPUS PERMANEN sebelum restore!
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>

                    {/* Table Selection */}
                    <div className="space-y-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium text-blue-800">Pilih Tabel yang Akan Di-restore</Label>
                        <Badge variant="outline" className="bg-blue-100 text-blue-800">
                          {selectedTables.length} dari {getAvailableTables(parsedBackup).length} tabel
                        </Badge>
                      </div>

                      {/* Select All */}
                      <div className="flex items-center space-x-2 pb-2 border-b border-blue-200">
                        <Checkbox
                          id="select-all"
                          checked={selectAll}
                          onCheckedChange={(checked) => handleSelectAll(checked as boolean)}
                        />
                        <Label htmlFor="select-all" className="text-sm font-medium text-blue-700 cursor-pointer">
                          Pilih Semua
                        </Label>
                      </div>

                      {/* Table List */}
                      <ScrollArea className="h-48 rounded-md border border-blue-200 bg-white">
                        <div className="p-3 space-y-2">
                          {getAvailableTables(parsedBackup).map(tableName => {
                            const recordCount = parsedBackup.tables[tableName]?.length || 0
                            return (
                              <div key={tableName} className="flex items-center justify-between py-1.5 px-2 hover:bg-gray-50 rounded">
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`table-${tableName}`}
                                    checked={selectedTables.includes(tableName)}
                                    onCheckedChange={(checked) => handleTableToggle(tableName, checked as boolean)}
                                  />
                                  <Label htmlFor={`table-${tableName}`} className="text-sm cursor-pointer">
                                    {tableName}
                                  </Label>
                                </div>
                                <Badge variant="secondary" className="text-xs">
                                  {recordCount} record
                                </Badge>
                              </div>
                            )
                          })}
                        </div>
                      </ScrollArea>
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
                        <ScrollArea className="h-40 rounded-md border p-3 bg-gray-900 text-gray-100 font-mono text-xs">
                          {restoreDetails.map((detail, i) => (
                            <div key={i} className="py-0.5">
                              {detail}
                            </div>
                          ))}
                        </ScrollArea>
                      </div>
                    )}

                    {/* Restore Button */}
                    <Button
                      onClick={handleRestore}
                      disabled={isRestoring || selectedTables.length === 0}
                      variant={clearExisting ? "destructive" : "default"}
                      className="w-full"
                    >
                      {isRestoring ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                          Memproses Restore...
                        </>
                      ) : (
                        <>
                          <Upload className="mr-2 h-4 w-4" />
                          {clearExisting
                            ? `Restore ${selectedTables.length} Tabel (Hapus & Ganti)`
                            : `Restore ${selectedTables.length} Tabel (Merge)`}
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
