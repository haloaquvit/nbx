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
import { backupRestoreService, BackupData, BackupProgress, RestoreProgress } from '@/services/backupRestoreService'
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
        ? "PERINGATAN: Semua data existing akan DIHAPUS dan diganti dengan data dari backup. Lanjutkan?"
        : "Data dari backup akan di-merge dengan data existing (duplikat akan di-update). Lanjutkan?"
    )

    if (!confirmed) return

    setIsRestoring(true)
    setRestoreProgress(null)
    setRestoreDetails([])

    try {
      const result = await backupRestoreService.restoreFromBackup(
        parsedBackup,
        { clearExisting, skipUsers },
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
                      disabled={isRestoring}
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
                          {clearExisting ? 'Restore (Hapus & Ganti)' : 'Restore (Merge)'}
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
