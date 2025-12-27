"use client"

import { useMemo, useState, useEffect } from 'react'
import { Customer } from '@/types/customer'
import { sortCustomersByDistance, filterByRadius } from '@/utils/geoUtils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Phone, Navigation, Store, Home, MapPin, AlertCircle, ShoppingCart, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '@/components/ui/use-toast'
import {
  markAsVisited,
  getVisitedCustomerIds,
  cleanExpiredVisits,
  getTodayVisitCount
} from '@/utils/customerVisitUtils'
import { PhotoUploadService } from '@/services/photoUploadService'
import { useGranularPermission } from '@/hooks/useGranularPermission'

interface NearbyCustomerListProps {
  customers: Customer[]
  userLocation: { lat: number; lng: number } | null
  radiusMeters: number
  onRadiusChange: (radius: number) => void
  onCustomerSelect?: (customer: Customer) => void
}

const RADIUS_OPTIONS = [
  { value: 500, label: '500 m' },
  { value: 1000, label: '1 km' },
  { value: 2000, label: '2 km' },
  { value: 5000, label: '5 km' },
  { value: 10000, label: '10 km' },
  { value: 999999, label: 'Semua' },
]

export function NearbyCustomerList({
  customers,
  userLocation,
  radiusMeters,
  onRadiusChange,
  onCustomerSelect
}: NearbyCustomerListProps) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { hasGranularPermission } = useGranularPermission()

  // Check permissions
  const canAccessDriverPos = hasGranularPermission('pos_driver_access')

  // State untuk hide visited customers
  const [hideVisited, setHideVisited] = useState(true)
  const [visitedIds, setVisitedIds] = useState<Set<string>>(new Set())
  const [visitCount, setVisitCount] = useState(0)

  // Load visited customers on mount
  useEffect(() => {
    cleanExpiredVisits()
    setVisitedIds(getVisitedCustomerIds())
    setVisitCount(getTodayVisitCount())
  }, [])

  // Sort and filter customers by distance
  const nearbyCustomers = useMemo(() => {
    if (!userLocation) return []

    const sorted = sortCustomersByDistance(
      customers,
      userLocation.lat,
      userLocation.lng
    )

    let filtered = filterByRadius(sorted, radiusMeters)

    // Filter out visited customers if hideVisited is true
    if (hideVisited) {
      filtered = filtered.filter(c => !visitedIds.has(c.id))
    }

    return filtered
  }, [customers, userLocation, radiusMeters, hideVisited, visitedIds])

  // Handle mark as visited
  const handleMarkVisited = (customer: Customer, e: React.MouseEvent) => {
    e.stopPropagation()
    markAsVisited(customer.id)
    setVisitedIds(getVisitedCustomerIds())
    setVisitCount(getTodayVisitCount())
    toast({
      title: 'Ditandai Dikunjungi',
      description: `${customer.name} akan tersembunyi selama 24 jam`
    })
  }

  const handleOpenMaps = (customer: Customer) => {
    if (userLocation) {
      // Open with directions from user location
      window.open(
        `https://www.google.com/maps/dir/${userLocation.lat},${userLocation.lng}/${customer.latitude},${customer.longitude}`,
        '_blank'
      )
    } else {
      window.open(
        `https://www.google.com/maps/dir//${customer.latitude},${customer.longitude}`,
        '_blank'
      )
    }
  }

  const handleCall = (phone: string) => {
    window.location.href = `tel:${phone}`
  }

  const handleOpenDriverPos = (customer: Customer) => {
    navigate(`/driver-pos?customerId=${customer.id}`)
  }

  if (!userLocation) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="h-12 w-12 text-orange-500 mb-4" />
        <h3 className="font-semibold text-lg mb-2">Lokasi Tidak Tersedia</h3>
        <p className="text-muted-foreground text-sm max-w-xs">
          Aktifkan GPS untuk melihat pelanggan terdekat dari lokasi Anda
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Radius Filter */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Radius:</span>
        </div>
        <Select
          value={radiusMeters.toString()}
          onValueChange={v => onRadiusChange(Number(v))}
        >
          <SelectTrigger className="w-28 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RADIUS_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value.toString()}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Hide visited toggle */}
      <div className="flex items-center justify-between px-1 py-2 bg-muted/50 dark:bg-slate-800/50 rounded-lg">
        <div className="flex items-center gap-2">
          {hideVisited ? (
            <EyeOff className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Eye className="h-4 w-4 text-muted-foreground" />
          )}
          <Label htmlFor="hide-visited" className="text-sm cursor-pointer">
            Sembunyikan yang sudah dikunjungi
          </Label>
          {visitCount > 0 && (
            <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300">
              {visitCount} dikunjungi
            </Badge>
          )}
        </div>
        <Switch
          id="hide-visited"
          checked={hideVisited}
          onCheckedChange={setHideVisited}
        />
      </div>

      {/* Results count */}
      <div className="px-1">
        <Badge variant="secondary">
          {nearbyCustomers.length} pelanggan ditemukan
        </Badge>
      </div>

      {/* Customer List */}
      {nearbyCustomers.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Tidak ada pelanggan dalam radius {radiusMeters >= 1000 ? `${radiusMeters/1000} km` : `${radiusMeters} m`}</p>
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-22rem)] md:h-[calc(100vh-280px)]">
          <div className="space-y-3 pr-4">
            {nearbyCustomers.map((customer, index) => {
              const isKiosk = customer.classification === 'Kios/Toko'

              return (
                <Card
                  key={customer.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => onCustomerSelect?.(customer as Customer)}
                >
                  <CardContent className="p-3">
                    <div className="flex gap-3">
                      {/* Photo or Icon */}
                      <div className="flex-shrink-0">
                        {customer.store_photo_url ? (
                          <img
                            src={PhotoUploadService.getPhotoUrl(customer.store_photo_url, 'Customers_Images')}
                            alt={customer.name}
                            className="w-16 h-16 object-cover rounded-lg"
                          />
                        ) : (
                          <div className={`w-16 h-16 rounded-lg flex items-center justify-center ${
                            isKiosk ? 'bg-green-100 dark:bg-green-900/50' : 'bg-blue-100 dark:bg-blue-900/50'
                          }`}>
                            {isKiosk ? (
                              <Store className="h-8 w-8 text-green-600 dark:text-green-400" />
                            ) : (
                              <Home className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                            )}
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h4 className="font-semibold text-sm truncate">
                              {customer.name}
                            </h4>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {customer.address}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className="flex-shrink-0 bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/50 dark:text-orange-300 dark:border-orange-700"
                          >
                            {customer.distanceFormatted}
                          </Badge>
                        </div>

                        {/* Classification & Order Count */}
                        <div className="flex items-center gap-2 mt-1">
                          <Badge
                            variant="secondary"
                            className={`text-xs ${
                              isKiosk
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                            }`}
                          >
                            {customer.classification || 'Umum'}
                          </Badge>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-1 mt-2">
                          {canAccessDriverPos && (
                            <Button
                              size="sm"
                              className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700"
                              onClick={e => {
                                e.stopPropagation()
                                handleOpenDriverPos(customer as Customer)
                              }}
                            >
                              <ShoppingCart className="h-3 w-3 mr-1" />
                              POS
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            onClick={e => {
                              e.stopPropagation()
                              handleCall(customer.phone)
                            }}
                          >
                            <Phone className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            onClick={e => {
                              e.stopPropagation()
                              handleOpenMaps(customer as Customer)
                            }}
                          >
                            <Navigation className="h-3 w-3" />
                          </Button>
                        </div>

                      </div>

                      {/* Rank & Visited Button */}
                      <div className="flex-shrink-0 flex flex-col items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          index === 0
                            ? 'bg-yellow-400 text-yellow-900 dark:bg-yellow-500 dark:text-yellow-900'
                            : index === 1
                            ? 'bg-gray-300 text-gray-700 dark:bg-gray-600 dark:text-gray-200'
                            : index === 2
                            ? 'bg-orange-300 text-orange-800 dark:bg-orange-600 dark:text-orange-100'
                            : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'
                        }`}>
                          {index + 1}
                        </div>
                        <Button
                          size="sm"
                          variant={visitedIds.has(customer.id) ? "secondary" : "outline"}
                          className={`h-auto py-1 px-2 text-[10px] leading-tight ${
                            visitedIds.has(customer.id)
                              ? 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/50 dark:text-green-300 dark:border-green-700'
                              : 'border-dashed'
                          }`}
                          onClick={e => handleMarkVisited(customer as Customer, e)}
                        >
                          <CheckCircle2 className="h-3 w-3 mr-0.5" />
                          <span className="whitespace-nowrap">Sudah<br/>Dikunjungi</span>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
