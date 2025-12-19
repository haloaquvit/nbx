"use client"
import { useParams, Link } from "react-router-dom"
import { useCustomerById } from "@/hooks/useCustomers" // Perbaikan: Mengimpor hook yang benar
import { useTransactionsByCustomer } from "@/hooks/useTransactions"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Phone, MapPin, ExternalLink, Camera } from "lucide-react"
import { PhotoUploadService } from "@/services/photoUploadService"
import { Skeleton } from "@/components/ui/skeleton"
import { CustomerTransactionHistoryTable } from "@/components/CustomerTransactionHistoryTable"

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { customer, isLoading: isLoadingCustomer } = useCustomerById(id || "")
  const { transactions, isLoading: isLoadingTransactions } = useTransactionsByCustomer(id || "")

  if (isLoadingCustomer) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Card>
          <CardHeader><Skeleton className="h-6 w-1/4" /></CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><Skeleton className="h-6 w-1/4" /></CardHeader>
          <CardContent><Skeleton className="h-32 w-full" /></CardContent>
        </Card>
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="text-center">
        <h2 className="text-2xl font-bold">Pelanggan tidak ditemukan</h2>
        <p className="text-muted-foreground">Pelanggan dengan ID ini tidak ada dalam sistem.</p>
        <Button asChild className="mt-4">
          <Link to="/customers"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Daftar Pelanggan</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{customer.name}</h1>
        <Button asChild variant="outline">
          <Link to="/customers">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Kembali ke Daftar
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informasi Kontak</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="flex items-center gap-4">
            <Phone className="h-5 w-5 text-muted-foreground" />
            <span>{customer.phone}</span>
          </div>
          <div className="flex items-center gap-4">
            <MapPin className="h-5 w-5 text-muted-foreground" />
            <span>{customer.address}</span>
          </div>
          {customer.full_address && (
            <div className="flex items-center gap-4 md:col-span-2">
              <MapPin className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Alamat Lengkap: {customer.full_address}</span>
            </div>
          )}
          {customer.latitude && customer.longitude && (
            <div className="flex items-center gap-4">
              <MapPin className="h-5 w-5 text-muted-foreground" />
              <Button
                variant="link"
                className="p-0 h-auto text-blue-600"
                onClick={() => window.open(`https://www.google.com/maps/dir//${customer.latitude},${customer.longitude}`, '_blank')}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Buka di Google Maps
              </Button>
            </div>
          )}
          {customer.store_photo_url && (
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-2">
                <Camera className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium">Foto Toko</span>
              </div>
              <img
                src={PhotoUploadService.getPhotoUrl(customer.store_photo_url, 'Customers_Images')}
                alt={`Foto toko ${customer.name}`}
                className="w-full max-w-[300px] h-auto rounded-lg border shadow-sm cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => window.open(PhotoUploadService.getPhotoUrl(customer.store_photo_url!, 'Customers_Images'), '_blank')}
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Riwayat Transaksi</CardTitle>
          <CardDescription>
            Berikut adalah semua transaksi yang pernah dilakukan oleh {customer.name}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CustomerTransactionHistoryTable 
            transactions={transactions || []} 
            isLoading={isLoadingTransactions} 
          />
        </CardContent>
      </Card>
    </div>
  )
}