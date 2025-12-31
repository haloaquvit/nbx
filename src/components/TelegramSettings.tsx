"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/use-toast"
import { AlertCircle, CheckCircle2, Send, Loader2, ExternalLink } from 'lucide-react'
import { useCompanySettings } from '@/hooks/useCompanySettings'
import { useAuth } from '@/hooks/useAuth'
import { isOwner } from '@/utils/roleUtils'
import { telegramService } from '@/services/telegramService'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function TelegramSettings() {
  const { settings, isLoading, updateSettings } = useCompanySettings()
  const { toast } = useToast()
  const { user } = useAuth()
  const [isTesting, setIsTesting] = useState(false)
  const [localSettings, setLocalSettings] = useState({
    telegramBotToken: '',
    telegramChatId: '',
    telegramEnabled: false,
  })

  useEffect(() => {
    if (settings) {
      setLocalSettings({
        telegramBotToken: settings.telegramBotToken || '',
        telegramChatId: settings.telegramChatId || '',
        telegramEnabled: settings.telegramEnabled || false,
      })
    }
  }, [settings])

  const handleTestConnection = async () => {
    if (!localSettings.telegramBotToken || !localSettings.telegramChatId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Harap isi Bot Token dan Chat ID terlebih dahulu",
      })
      return
    }

    setIsTesting(true)
    try {
      const result = await telegramService.testConnection(
        localSettings.telegramBotToken,
        localSettings.telegramChatId
      )

      if (result.success) {
        toast({
          title: "Berhasil!",
          description: "Pesan test berhasil dikirim ke Telegram",
        })
      } else {
        toast({
          variant: "destructive",
          title: "Gagal",
          description: result.error || "Tidak dapat mengirim pesan ke Telegram",
        })
      }
    } finally {
      setIsTesting(false)
    }
  }

  const handleSave = () => {
    if (!isOwner(user)) {
      toast({
        variant: "destructive",
        title: "Akses Ditolak",
        description: "Hanya Owner yang dapat mengubah pengaturan Telegram.",
      })
      return
    }

    updateSettings.mutate(
      {
        ...settings!,
        telegramBotToken: localSettings.telegramBotToken,
        telegramChatId: localSettings.telegramChatId,
        telegramEnabled: localSettings.telegramEnabled,
      },
      {
        onSuccess: () => {
          telegramService.clearCache()
          toast({
            title: "Sukses",
            description: "Pengaturan Telegram berhasil disimpan",
          })
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: "Gagal",
            description: error.message,
          })
        },
      }
    )
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Info Card */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="space-y-2">
          <p className="font-medium">Cara Setup Telegram Bot:</p>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Buka Telegram, cari <strong>@BotFather</strong></li>
            <li>Ketik <code>/newbot</code> dan ikuti instruksi</li>
            <li>Copy <strong>Bot Token</strong> yang diberikan</li>
            <li>Untuk mendapatkan <strong>Chat ID</strong>:
              <ul className="list-disc list-inside ml-4">
                <li>Untuk pribadi: Kirim pesan ke bot, lalu akses <code>api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code></li>
                <li>Untuk group: Tambahkan bot ke group, kirim pesan, lalu cek getUpdates</li>
              </ul>
            </li>
          </ol>
          <a
            href="https://core.telegram.org/bots#how-do-i-create-a-bot"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline text-sm"
          >
            <ExternalLink className="h-3 w-3" />
            Dokumentasi Telegram Bot
          </a>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Pengaturan Telegram Bot
          </CardTitle>
          <CardDescription>
            Kirim notifikasi otomatis ke Telegram untuk transaksi, penawaran, pembayaran, dan lainnya.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-0.5">
              <Label className="text-base">Aktifkan Notifikasi Telegram</Label>
              <p className="text-sm text-muted-foreground">
                Kirim notifikasi otomatis ke bot/group Telegram
              </p>
            </div>
            <Switch
              checked={localSettings.telegramEnabled}
              onCheckedChange={(checked) =>
                setLocalSettings((prev) => ({ ...prev, telegramEnabled: checked }))
              }
            />
          </div>

          {/* Bot Token */}
          <div className="space-y-2">
            <Label htmlFor="telegramBotToken">Bot Token</Label>
            <Input
              id="telegramBotToken"
              type="password"
              value={localSettings.telegramBotToken}
              onChange={(e) =>
                setLocalSettings((prev) => ({ ...prev, telegramBotToken: e.target.value }))
              }
              placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz..."
            />
            <p className="text-xs text-muted-foreground">
              Token dari @BotFather, format: 123456789:ABCdef...
            </p>
          </div>

          {/* Chat ID */}
          <div className="space-y-2">
            <Label htmlFor="telegramChatId">Chat ID</Label>
            <Input
              id="telegramChatId"
              value={localSettings.telegramChatId}
              onChange={(e) =>
                setLocalSettings((prev) => ({ ...prev, telegramChatId: e.target.value }))
              }
              placeholder="-1001234567890"
            />
            <p className="text-xs text-muted-foreground">
              ID user atau group. Group ID biasanya diawali dengan minus (-).
            </p>
          </div>

          {/* Status & Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={isTesting || !localSettings.telegramBotToken || !localSettings.telegramChatId}
            >
              {isTesting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Mengirim...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Test Kirim Pesan
                </>
              )}
            </Button>
            <Button onClick={handleSave} disabled={updateSettings.isPending}>
              {updateSettings.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Simpan Pengaturan
                </>
              )}
            </Button>
          </div>

          {/* Notification Types Info */}
          <div className="pt-4 border-t">
            <h4 className="font-medium mb-3">Jenis Notifikasi yang Dikirim:</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Transaksi Baru</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Penawaran Baru</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Pembayaran Diterima</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Piutang Jatuh Tempo</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Stok Menipis</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Penawaran Disetujui</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
