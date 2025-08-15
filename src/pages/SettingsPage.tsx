"use client"
import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { Upload, Image as ImageIcon, MapPin } from 'lucide-react'
import { useCompanySettings } from '@/hooks/useCompanySettings'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/useAuth'

export default function SettingsPage() {
  const { settings, isLoading, updateSettings } = useCompanySettings();
  const { toast } = useToast();
  const { user } = useAuth();
  const [localInfo, setLocalInfo] = useState({ name: '', address: '', phone: '', logo: '', latitude: null as number | null, longitude: null as number | null, attendanceRadius: 50 as number | null });

  useEffect(() => {
    if (settings) {
      setLocalInfo({
        name: settings.name || '',
        address: settings.address || '',
        phone: settings.phone || '',
        logo: settings.logo || '',
        latitude: settings.latitude || null,
        longitude: settings.longitude || null,
        attendanceRadius: settings.attendanceRadius || 50,
      });
    }
  }, [settings]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    setLocalInfo(prev => ({ ...prev, [id]: value }));
  };

  const handleNumberInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setLocalInfo(prev => ({ ...prev, [id]: value === '' ? null : Number(value) }));
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLocalInfo(prev => ({ ...prev, logo: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({ variant: "destructive", title: "Gagal", description: "Geolocation tidak didukung oleh browser ini." });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocalInfo(prev => ({
          ...prev,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }));
        toast({ title: "Sukses", description: "Lokasi saat ini berhasil didapatkan." });
      },
      () => {
        toast({ variant: "destructive", title: "Gagal", description: "Tidak dapat mengambil lokasi. Pastikan Anda memberikan izin." });
      }
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (user?.role !== 'owner') {
      toast({ variant: "destructive", title: "Akses Ditolak", description: "Hanya Owner yang dapat mengubah info perusahaan." });
      return;
    }
    updateSettings.mutate(localInfo as any, {
      onSuccess: () => {
        toast({ title: "Sukses", description: "Informasi perusahaan berhasil diperbarui." });
      },
      onError: (error) => {
        toast({ variant: "destructive", title: "Gagal", description: error.message });
      }
    });
  };

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Pengaturan Perusahaan</CardTitle>
          <CardDescription>
            Atur informasi, logo, dan lokasi kantor untuk fitur absensi.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nama Perusahaan</Label>
                <Input id="name" value={localInfo.name} onChange={handleInputChange} placeholder="Contoh: Percetakan Maju Jaya" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Alamat</Label>
                <Textarea id="address" value={localInfo.address} onChange={handleInputChange} placeholder="Contoh: Jl. Pahlawan No. 123, Kota Bandung" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Nomor Telepon / Kontak</Label>
                <Input id="phone" value={localInfo.phone} onChange={handleInputChange} placeholder="Contoh: 0812-3456-7890" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Logo Perusahaan</Label>
              <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center">
                {localInfo.logo ? (
                  <img src={localInfo.logo} alt="Logo Preview" className="max-h-32 mb-4" />
                ) : (
                  <div className="mb-4 text-muted-foreground">
                    <ImageIcon className="mx-auto h-12 w-12" />
                    <p>Belum ada logo</p>
                  </div>
                )}
                <Button asChild variant="outline">
                  <label htmlFor="logo-upload" className="cursor-pointer">
                    <Upload className="mr-2 h-4 w-4" />
                    {localInfo.logo ? 'Ganti Logo' : 'Unggah Logo'}
                    <input id="logo-upload" type="file" className="sr-only" accept="image/*" onChange={handleLogoUpload} />
                  </label>
                </Button>
                <p className="text-xs text-muted-foreground mt-2">PNG, JPG, GIF (maks. 800x400px)</p>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t">
            <CardTitle className="text-lg mb-2">Pengaturan Absensi Lokasi</CardTitle>
            <CardDescription className="mb-4">
              Tetapkan titik koordinat pusat dan radius toleransi untuk lokasi kantor yang dianggap sah untuk absensi.
            </CardDescription>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="latitude">Latitude</Label>
                <Input id="latitude" type="number" step="any" value={localInfo.latitude ?? ''} onChange={handleNumberInputChange} placeholder="-6.200000" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="longitude">Longitude</Label>
                <Input id="longitude" type="number" step="any" value={localInfo.longitude ?? ''} onChange={handleNumberInputChange} placeholder="106.816666" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="attendanceRadius">Radius Toleransi (meter)</Label>
                <Input id="attendanceRadius" type="number" value={localInfo.attendanceRadius ?? ''} onChange={handleNumberInputChange} placeholder="50" />
              </div>
            </div>
            <Button type="button" variant="secondary" onClick={handleGetCurrentLocation} className="mt-4">
              <MapPin className="mr-2 h-4 w-4" /> Gunakan Lokasi Saat Ini
            </Button>
          </div>

          <div className="flex justify-end pt-6 border-t">
            <Button type="submit" disabled={updateSettings.isPending}>
              {updateSettings.isPending ? "Menyimpan..." : "Simpan Semua Perubahan"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}