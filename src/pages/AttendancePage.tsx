"use client"
import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { useCompanySettings } from "@/hooks/useCompanySettings"
import { useAttendance } from "@/hooks/useAttendance"
import { getDistance } from "@/lib/utils"
import { format } from "date-fns"
import { id } from "date-fns/locale/id"
import { Loader2, LogIn, LogOut, MapPin, AlertTriangle } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"

export default function AttendancePage() {
  const { toast } = useToast()
  const { settings, isLoading: isLoadingSettings } = useCompanySettings()
  const { todayAttendance, isLoadingToday, checkIn, checkOut } = useAttendance()
  const [isProcessing, setIsProcessing] = useState(false)
  const [currentLocation, setCurrentLocation] = useState<{ lat: number, lon: number } | null>(null)

  const handleAttendance = () => {
    setIsProcessing(true)
    if (!navigator.geolocation) {
      toast({ variant: "destructive", title: "Gagal", description: "Geolocation tidak didukung browser ini." })
      setIsProcessing(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        setCurrentLocation({ lat: latitude, lon: longitude })

        if (!settings?.latitude || !settings?.longitude || !settings?.attendanceRadius) {
          toast({ variant: "destructive", title: "Gagal", description: "Lokasi kantor belum diatur oleh Admin." })
          setIsProcessing(false)
          return
        }

        const distance = getDistance(latitude, longitude, settings.latitude, settings.longitude)

        if (distance > settings.attendanceRadius) {
          toast({ variant: "destructive", title: "Di Luar Jangkauan", description: `Anda berada ${Math.round(distance)} meter dari kantor. Maksimal ${settings.attendanceRadius} meter.` })
          setIsProcessing(false)
          return
        }

        const locationString = `${latitude}, ${longitude}`
        if (todayAttendance && todayAttendance.status === 'Hadir') {
          // Clock out
          checkOut.mutate({ attendanceId: todayAttendance.id, location: locationString }, {
            onSuccess: () => toast({ title: "Sukses", description: "Anda berhasil clock out." }),
            onError: (err) => toast({ variant: "destructive", title: "Gagal", description: err.message }),
            onSettled: () => setIsProcessing(false)
          })
        } else {
          // Clock in
          checkIn.mutate({ location: locationString }, {
            onSuccess: () => toast({ title: "Sukses", description: "Anda berhasil clock in." }),
            onError: (err) => toast({ variant: "destructive", title: "Gagal", description: err.message }),
            onSettled: () => setIsProcessing(false)
          })
        }
      },
      () => {
        toast({ variant: "destructive", title: "Gagal", description: "Tidak dapat mengambil lokasi. Pastikan izin lokasi telah diberikan." })
        setIsProcessing(false)
      }
    )
  }

  const renderStatus = () => {
    if (isLoadingToday || isLoadingSettings) {
      return <Skeleton className="h-24 w-full" />
    }

    if (!settings?.latitude || !settings?.longitude) {
        return (
            <div className="text-center text-destructive p-4 border border-destructive/50 bg-destructive/10 rounded-lg">
                <AlertTriangle className="mx-auto h-8 w-8 mb-2" />
                <p className="font-semibold">Lokasi Kantor Belum Diatur</p>
                <p className="text-sm">Admin perlu mengatur koordinat lokasi kantor di halaman Pengaturan untuk mengaktifkan fitur absensi.</p>
            </div>
        )
    }

    if (todayAttendance) {
      if (todayAttendance.status === 'Hadir') {
        return (
          <div className="text-center">
            <p className="text-lg">Anda sudah absen masuk pada:</p>
            <p className="text-2xl font-bold text-primary">{format(new Date(todayAttendance.check_in_time), "HH:mm:ss", { locale: id })}</p>
            <p className="text-sm text-muted-foreground">Silakan tekan tombol di bawah untuk absen pulang.</p>
          </div>
        )
      } else { // status === 'Pulang'
        return (
          <div className="text-center">
            <p className="text-lg">Anda sudah absen untuk hari ini.</p>
            <p className="text-sm text-muted-foreground">Masuk: {format(new Date(todayAttendance.check_in_time), "HH:mm", { locale: id })} | Pulang: {format(new Date(todayAttendance.check_out_time!), "HH:mm", { locale: id })}</p>
          </div>
        )
      }
    }

    return (
      <div className="text-center">
        <p className="text-lg">Anda belum melakukan absensi hari ini.</p>
        <p className="text-sm text-muted-foreground">Silakan tekan tombol di bawah untuk absen masuk.</p>
      </div>
    )
  }

  const isClockOut = todayAttendance?.status === 'Hadir';
  const isAttendanceDone = todayAttendance?.status === 'Pulang';
  const isButtonDisabled = isProcessing || isAttendanceDone || isLoadingToday || isLoadingSettings || !settings?.latitude;

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-center text-2xl">Absensi Karyawan</CardTitle>
        <CardDescription className="text-center">{format(new Date(), "eeee, d MMMM yyyy", { locale: id })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="p-4 border rounded-lg bg-muted/40 min-h-[100px] flex items-center justify-center">
          {renderStatus()}
        </div>
        <Button
          size="lg"
          className="w-full h-16 text-lg"
          onClick={handleAttendance}
          disabled={isButtonDisabled}
        >
          {isProcessing ? (
            <Loader2 className="mr-2 h-6 w-6 animate-spin" />
          ) : isClockOut ? (
            <LogOut className="mr-2 h-6 w-6" />
          ) : (
            <LogIn className="mr-2 h-6 w-6" />
          )}
          {isProcessing ? 'Memproses...' : isClockOut ? 'Clock Out' : 'Clock In'}
        </Button>
        {currentLocation && (
          <div className="text-xs text-center text-muted-foreground">
            <MapPin className="inline-block mr-1 h-3 w-3" />
            Lokasi Anda: {currentLocation.lat.toFixed(5)}, {currentLocation.lon.toFixed(5)}
          </div>
        )}
      </CardContent>
    </Card>
  )
}