"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "./ui/textarea"
import { useCustomers } from "@/hooks/useCustomers"
import { useToast } from "./ui/use-toast"
import { Customer } from "@/types/customer"
import { MapPin, Upload, ExternalLink } from "lucide-react"
import { googleDriveService } from "@/services/googleDriveService"
import { useState, useRef } from "react"

const customerSchema = z.object({
  name: z.string().min(3, { message: "Nama harus diisi (minimal 3 karakter)." }),
  phone: z.string().min(10, { message: "Nomor telepon tidak valid." }),
  address: z.string().min(5, { message: "Alamat harus diisi (minimal 5 karakter)." }),
  full_address: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  jumlah_galon_titip: z.coerce.number().min(0, { message: "Jumlah galon tidak boleh negatif." }).optional(),
})

type CustomerFormData = z.infer<typeof customerSchema>

interface AddCustomerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCustomerAdded?: (customer: Customer) => void
}

export function AddCustomerDialog({ open, onOpenChange, onCustomerAdded }: AddCustomerDialogProps) {
  const { toast } = useToast()
  const { addCustomer, isLoading } = useCustomers()
  const [isUploading, setIsUploading] = useState(false)
  const [storePhoto, setStorePhoto] = useState<File | null>(null)
  const [storePhotoUrl, setStorePhotoUrl] = useState<string>('')
  const [storePhotoDriveId, setStorePhotoDriveId] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: "",
      phone: "",
      address: "",
      full_address: "",
      latitude: undefined,
      longitude: undefined,
      jumlah_galon_titip: 0,
    },
  })

  const latitude = watch('latitude')
  const longitude = watch('longitude')

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Geolocation tidak didukung di browser ini.",
      })
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        setValue('latitude', latitude)
        setValue('longitude', longitude)
        toast({
          title: "Sukses!",
          description: "Lokasi berhasil diambil.",
        })
      },
      (error) => {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Gagal mendapatkan lokasi. Pastikan GPS aktif.",
        })
      }
    )
  }

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "File harus berupa gambar.",
      })
      return
    }

    setStorePhoto(file)
    setIsUploading(true)

    try {
      const fileName = `store-${Date.now()}-${file.name}`
      const driveId = await googleDriveService.uploadFile(file, fileName)
      const viewUrl = await googleDriveService.getFileUrl(driveId)
      
      setStorePhotoDriveId(driveId)
      setStorePhotoUrl(viewUrl)
      
      toast({
        title: "Sukses!",
        description: "Foto toko berhasil diupload ke Google Drive.",
      })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal mengupload foto ke Google Drive.",
      })
    } finally {
      setIsUploading(false)
    }
  }


  const onSubmit = async (data: CustomerFormData) => {
    const newCustomerData = {
      name: data.name,
      phone: data.phone,
      address: data.address,
      full_address: data.full_address,
      latitude: data.latitude,
      longitude: data.longitude,
      jumlah_galon_titip: data.jumlah_galon_titip || 0,
      store_photo_url: storePhotoUrl,
      store_photo_drive_id: storePhotoDriveId,
    };
    addCustomer.mutate(newCustomerData, {
      onSuccess: (newCustomer) => {
        toast({
          title: "Sukses!",
          description: `Pelanggan "${newCustomer.name}" berhasil ditambahkan.`,
        })
        reset()
        setStorePhoto(null)
        setStorePhotoUrl('')
        setStorePhotoDriveId('')
        onOpenChange(false)
        if (onCustomerAdded) {
          onCustomerAdded(newCustomer)
        }
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: "Gagal!",
          description: "Terjadi kesalahan saat menambah pelanggan.",
        })
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Tambah Pelanggan Baru</DialogTitle>
            <DialogDescription>
              Isi detail pelanggan di bawah ini. Klik simpan jika sudah selesai.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">Nama</Label>
              <Input id="name" {...register("name")} className="col-span-3" />
              {errors.name && <p className="col-span-4 text-red-500 text-sm text-right">{errors.name.message}</p>}
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="phone" className="text-right">Telepon</Label>
              <Input id="phone" {...register("phone")} className="col-span-3" />
              {errors.phone && <p className="col-span-4 text-red-500 text-sm text-right">{errors.phone.message}</p>}
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="address" className="text-right">Alamat</Label>
              <Textarea id="address" {...register("address")} className="col-span-3" />
              {errors.address && <p className="col-span-4 text-red-500 text-sm text-right">{errors.address.message}</p>}
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="full_address" className="text-right">Alamat Lengkap</Label>
              <Textarea id="full_address" {...register("full_address")} className="col-span-3" placeholder="Alamat lengkap untuk Google Maps" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="jumlah_galon_titip" className="text-right">Galon Titip</Label>
              <Input 
                id="jumlah_galon_titip" 
                type="number" 
                min="0"
                {...register("jumlah_galon_titip")} 
                className="col-span-3" 
                placeholder="Jumlah galon yang dititip di pelanggan"
              />
              {errors.jumlah_galon_titip && <p className="col-span-4 text-red-500 text-sm text-right">{errors.jumlah_galon_titip.message}</p>}
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Lokasi</Label>
              <div className="col-span-3 space-y-2">
                <Button 
                  type="button" 
                  onClick={handleGetCurrentLocation}
                  variant="outline"
                  className="w-full"
                >
                  <MapPin className="w-4 h-4 mr-2" />
                  Ambil Lokasi Saat Ini
                </Button>
                {latitude && longitude && (
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>Lat: {latitude.toFixed(6)}</p>
                    <p>Long: {longitude.toFixed(6)}</p>
                    <Button
                      type="button"
                      variant="link"
                      className="p-0 h-auto text-blue-600"
                      onClick={() => window.open(`https://maps.google.com/?q=${latitude},${longitude}`, '_blank')}
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      Lihat di Google Maps
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Foto Toko</Label>
              <div className="col-span-3 space-y-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handlePhotoUpload}
                  accept="image/*"
                  className="hidden"
                />
                <Button 
                  type="button" 
                  onClick={() => fileInputRef.current?.click()}
                  variant="outline"
                  className="w-full"
                  disabled={isUploading}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {isUploading ? 'Mengupload...' : 'Upload Foto Toko'}
                </Button>
                {storePhoto && (
                  <div className="text-sm text-gray-600">
                    <p>File: {storePhoto.name}</p>
                    {storePhotoUrl && (
                      <Button
                        type="button"
                        variant="link"
                        className="p-0 h-auto text-blue-600"
                        onClick={() => window.open(storePhotoUrl, '_blank')}
                      >
                        <ExternalLink className="w-3 h-3 mr-1" />
                        Lihat Foto di Google Drive
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Menyimpan..." : "Simpan Pelanggan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}