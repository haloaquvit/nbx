/**
 * Utility untuk tracking kunjungan pelanggan
 * Data disimpan di localStorage dan expire setelah 24 jam
 */

const STORAGE_KEY = 'customer_visits'
const VISIT_DURATION_MS = 24 * 60 * 60 * 1000 // 24 jam dalam milliseconds

interface CustomerVisit {
  customerId: string
  visitedAt: number // timestamp
}

// Get semua visits dari localStorage
export function getVisits(): CustomerVisit[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (!data) return []
    return JSON.parse(data) as CustomerVisit[]
  } catch {
    return []
  }
}

// Simpan visits ke localStorage
function saveVisits(visits: CustomerVisit[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(visits))
  } catch (e) {
    console.error('Failed to save visits:', e)
  }
}

// Bersihkan visits yang sudah expired (lebih dari 24 jam)
export function cleanExpiredVisits(): CustomerVisit[] {
  const now = Date.now()
  const visits = getVisits()
  const validVisits = visits.filter(v => now - v.visitedAt < VISIT_DURATION_MS)

  if (validVisits.length !== visits.length) {
    saveVisits(validVisits)
  }

  return validVisits
}

// Tandai customer sudah dikunjungi
export function markAsVisited(customerId: string): void {
  const visits = cleanExpiredVisits()

  // Cek apakah sudah ada
  const existingIndex = visits.findIndex(v => v.customerId === customerId)
  if (existingIndex >= 0) {
    // Update timestamp
    visits[existingIndex].visitedAt = Date.now()
  } else {
    // Tambah baru
    visits.push({
      customerId,
      visitedAt: Date.now()
    })
  }

  saveVisits(visits)
}

// Hapus tanda kunjungan (undo)
export function unmarkVisit(customerId: string): void {
  const visits = getVisits()
  const filtered = visits.filter(v => v.customerId !== customerId)
  saveVisits(filtered)
}

// Cek apakah customer sudah dikunjungi (dalam 24 jam terakhir)
export function isVisited(customerId: string): boolean {
  const now = Date.now()
  const visits = getVisits()
  const visit = visits.find(v => v.customerId === customerId)

  if (!visit) return false

  // Cek apakah masih valid (dalam 24 jam)
  return now - visit.visitedAt < VISIT_DURATION_MS
}

// Get waktu kunjungan
export function getVisitTime(customerId: string): Date | null {
  const visits = getVisits()
  const visit = visits.find(v => v.customerId === customerId)

  if (!visit) return null
  return new Date(visit.visitedAt)
}

// Get semua customer ID yang sudah dikunjungi (masih valid)
export function getVisitedCustomerIds(): Set<string> {
  const validVisits = cleanExpiredVisits()
  return new Set(validVisits.map(v => v.customerId))
}

// Get jumlah kunjungan hari ini
export function getTodayVisitCount(): number {
  return cleanExpiredVisits().length
}
