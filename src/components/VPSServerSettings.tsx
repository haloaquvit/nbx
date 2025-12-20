"use client"
import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { Server, CheckCircle, XCircle, RefreshCw } from 'lucide-react'
import { PhotoUploadService } from '@/services/photoUploadService'

const VPS_SETTINGS_KEY = 'aquvit_vps_settings'

export interface VPSSettings {
  serverUrl: string
  port: string
}

// Default settings
const DEFAULT_SETTINGS: VPSSettings = {
  serverUrl: '103.197.190.54',
  port: '3001'
}

// Get VPS settings from localStorage
export function getVPSSettings(): VPSSettings {
  try {
    const saved = localStorage.getItem(VPS_SETTINGS_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      // Sanitize port - remove any non-numeric characters (like thousand separators)
      if (parsed.port) {
        parsed.port = String(parsed.port).replace(/[^0-9]/g, '')
      }
      return parsed
    }
  } catch (error) {
    console.error('Failed to load VPS settings:', error)
  }
  return DEFAULT_SETTINGS
}

// Save VPS settings to localStorage
export function saveVPSSettings(settings: VPSSettings): void {
  try {
    localStorage.setItem(VPS_SETTINGS_KEY, JSON.stringify(settings))
  } catch (error) {
    console.error('Failed to save VPS settings:', error)
  }
}

// Get full VPS URL
export function getVPSBaseUrl(): string {
  const settings = getVPSSettings()
  return `http://${settings.serverUrl}:${settings.port}`
}

// Get VPS files URL
export function getVPSFilesUrl(): string {
  return `${getVPSBaseUrl()}/files`
}

export function VPSServerSettings() {
  const { toast } = useToast()
  const [settings, setSettings] = useState<VPSSettings>(DEFAULT_SETTINGS)
  const [isChecking, setIsChecking] = useState(false)
  const [serverStatus, setServerStatus] = useState<'online' | 'offline' | 'unknown'>('unknown')
  const [isSaving, setIsSaving] = useState(false)

  // Load settings on mount
  useEffect(() => {
    const savedSettings = getVPSSettings()
    setSettings(savedSettings)
    // Check server status on load
    checkServerStatus(savedSettings)
  }, [])

  const checkServerStatus = async (settingsToCheck?: VPSSettings) => {
    setIsChecking(true)
    try {
      const currentSettings = settingsToCheck || settings
      const url = `http://${currentSettings.serverUrl}:${currentSettings.port}/health`
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(5000) // 5 second timeout
      })

      if (response.ok) {
        setServerStatus('online')
        toast({
          title: "Server Online",
          description: "VPS Upload Server terhubung dengan baik.",
        })
      } else {
        setServerStatus('offline')
        toast({
          variant: "destructive",
          title: "Server Offline",
          description: "Server tidak merespons dengan benar.",
        })
      }
    } catch (error) {
      setServerStatus('offline')
      toast({
        variant: "destructive",
        title: "Koneksi Gagal",
        description: "Tidak dapat terhubung ke VPS Server. Periksa URL dan port.",
      })
    } finally {
      setIsChecking(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      // Save to localStorage
      saveVPSSettings(settings)

      // Update PhotoUploadService
      PhotoUploadService.updateConfig(settings.serverUrl, settings.port)

      toast({
        title: "Berhasil Disimpan",
        description: "Pengaturan VPS Server berhasil disimpan.",
      })

      // Check server status after saving
      await checkServerStatus(settings)
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan",
        description: "Terjadi kesalahan saat menyimpan pengaturan.",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS)
    saveVPSSettings(DEFAULT_SETTINGS)
    PhotoUploadService.updateConfig(DEFAULT_SETTINGS.serverUrl, DEFAULT_SETTINGS.port)
    toast({
      title: "Reset Berhasil",
      description: "Pengaturan dikembalikan ke default.",
    })
    checkServerStatus(DEFAULT_SETTINGS)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5" />
          VPS Upload Server
        </CardTitle>
        <CardDescription>
          Konfigurasi server VPS untuk penyimpanan foto pelanggan.
          Jika server berganti, ubah URL di sini.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Server Status */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
          <div className="flex items-center gap-2">
            {serverStatus === 'online' && (
              <CheckCircle className="h-5 w-5 text-green-500" />
            )}
            {serverStatus === 'offline' && (
              <XCircle className="h-5 w-5 text-red-500" />
            )}
            {serverStatus === 'unknown' && (
              <div className="h-5 w-5 rounded-full bg-gray-300" />
            )}
            <span className="font-medium">
              Status: {serverStatus === 'online' ? 'Online' : serverStatus === 'offline' ? 'Offline' : 'Tidak Diketahui'}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => checkServerStatus()}
            disabled={isChecking}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${isChecking ? 'animate-spin' : ''}`} />
            Cek Status
          </Button>
        </div>

        {/* Server URL */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="serverUrl">IP Address / Domain</Label>
            <Input
              id="serverUrl"
              value={settings.serverUrl}
              onChange={(e) => setSettings(prev => ({ ...prev, serverUrl: e.target.value }))}
              placeholder="103.197.190.54 atau upload.domain.com"
            />
            <p className="text-xs text-muted-foreground">
              IP address atau domain server VPS
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="port">Port</Label>
            <Input
              id="port"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={settings.port}
              onChange={(e) => {
                // Only allow numeric input, no formatting
                const value = e.target.value.replace(/[^0-9]/g, '')
                setSettings(prev => ({ ...prev, port: value }))
              }}
              placeholder="3001"
            />
            <p className="text-xs text-muted-foreground">
              Port upload server (default: 3001)
            </p>
          </div>
        </div>

        {/* Preview URL */}
        <div className="p-3 rounded-lg bg-muted">
          <Label className="text-xs text-muted-foreground">URL Server Aktif:</Label>
          <p className="font-mono text-sm mt-1">
            http://{settings.serverUrl}:{settings.port}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Menyimpan..." : "Simpan Pengaturan"}
          </Button>
          <Button variant="outline" onClick={handleReset}>
            Reset ke Default
          </Button>
        </div>

        {/* Info */}
        <div className="text-sm text-muted-foreground space-y-2 pt-4 border-t">
          <p><strong>Catatan:</strong></p>
          <ul className="list-disc list-inside space-y-1">
            <li>Pastikan server VPS sudah berjalan sebelum upload foto</li>
            <li>Port default adalah 3001, sesuaikan jika berbeda</li>
            <li>Pengaturan akan tersimpan di browser ini</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
