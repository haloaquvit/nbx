// Geo Utilities for distance calculation and sorting

export interface Coordinates {
  latitude: number
  longitude: number
}

export interface CustomerWithDistance {
  id: string
  name: string
  phone: string
  address: string
  latitude: number
  longitude: number
  classification?: string
  store_photo_url?: string
  distance: number // in meters
  distanceFormatted: string
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * @returns distance in meters
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000 // Earth's radius in meters
  const dLat = toRadians(lat2 - lat1)
  const dLon = toRadians(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180)
}

/**
 * Format distance for display
 * @param meters distance in meters
 * @returns formatted string (e.g., "150 m" or "2.3 km")
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`
  }
  return `${(meters / 1000).toFixed(1)} km`
}

/**
 * Sort customers by distance from user location
 */
export function sortCustomersByDistance<T extends { latitude?: number | null; longitude?: number | null }>(
  customers: T[],
  userLat: number,
  userLon: number
): (T & { distance: number; distanceFormatted: string })[] {
  return customers
    .filter((c): c is T & { latitude: number; longitude: number } =>
      c.latitude != null && c.longitude != null
    )
    .map(customer => {
      const distance = calculateDistance(
        userLat,
        userLon,
        customer.latitude,
        customer.longitude
      )
      return {
        ...customer,
        distance,
        distanceFormatted: formatDistance(distance)
      }
    })
    .sort((a, b) => a.distance - b.distance)
}

/**
 * Filter customers within a radius
 * @param customers customers with distance
 * @param radiusMeters radius in meters
 */
export function filterByRadius<T extends { distance: number }>(
  customers: T[],
  radiusMeters: number
): T[] {
  return customers.filter(c => c.distance <= radiusMeters)
}

/**
 * Get bounds for all customers with coordinates
 */
export function getCustomerBounds(
  customers: { latitude?: number | null; longitude?: number | null }[]
): [[number, number], [number, number]] | null {
  const withCoords = customers.filter(
    (c): c is { latitude: number; longitude: number } =>
      c.latitude != null && c.longitude != null
  )

  if (withCoords.length === 0) return null

  let minLat = withCoords[0].latitude
  let maxLat = withCoords[0].latitude
  let minLon = withCoords[0].longitude
  let maxLon = withCoords[0].longitude

  for (const c of withCoords) {
    if (c.latitude < minLat) minLat = c.latitude
    if (c.latitude > maxLat) maxLat = c.latitude
    if (c.longitude < minLon) minLon = c.longitude
    if (c.longitude > maxLon) maxLon = c.longitude
  }

  return [[minLat, minLon], [maxLat, maxLon]]
}
