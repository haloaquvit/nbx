/**
 * Utility untuk tracking kunjungan pelanggan
 * Data disimpan di DATABASE agar terlihat oleh semua driver
 * Fallback ke localStorage jika offline
 */

import { supabase } from '@/integrations/supabase/client'

const STORAGE_KEY = 'customer_visits'
const VISIT_DURATION_MS = 24 * 60 * 60 * 1000 // 24 jam dalam milliseconds

interface CustomerVisit {
  customerId: string
  visitedAt: number // timestamp
  visitedBy?: string
  visitedByName?: string
}

interface DbCustomerVisit {
  id: string
  customer_id: string
  visited_by: string | null
  visited_by_name: string | null
  visited_at: string
  branch_id: string | null
  created_at: string
}

// Cache untuk mengurangi query ke database
let visitCache: Map<string, number> = new Map()
let lastCacheUpdate = 0
const CACHE_DURATION = 30000 // 30 detik

// Get semua visits dari localStorage (fallback/offline)
function getLocalVisits(): CustomerVisit[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (!data) return []
    return JSON.parse(data) as CustomerVisit[]
  } catch {
    return []
  }
}

// Simpan visits ke localStorage (fallback/offline)
function saveLocalVisits(visits: CustomerVisit[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(visits))
  } catch (e) {
    console.error('Failed to save visits:', e)
  }
}

// Bersihkan visits yang sudah expired (lebih dari 24 jam) - local only
export function cleanExpiredVisits(): CustomerVisit[] {
  const now = Date.now()
  const visits = getLocalVisits()
  const validVisits = visits.filter(v => now - v.visitedAt < VISIT_DURATION_MS)

  if (validVisits.length !== visits.length) {
    saveLocalVisits(validVisits)
  }

  return validVisits
}

/**
 * Tandai customer sudah dikunjungi - SAVE TO DATABASE
 * Agar terlihat oleh semua driver
 */
export async function markAsVisitedAsync(
  customerId: string,
  visitedBy?: string,
  visitedByName?: string,
  branchId?: string
): Promise<boolean> {
  try {
    // 1. Hapus visit lama untuk customer ini (jika ada)
    await supabase
      .from('customer_visits')
      .delete()
      .eq('customer_id', customerId)

    // 2. Insert visit baru
    const { error } = await supabase
      .from('customer_visits')
      .insert({
        customer_id: customerId,
        visited_by: visitedBy || null,
        visited_by_name: visitedByName || null,
        branch_id: branchId || null,
        visited_at: new Date().toISOString()
      })

    if (error) {
      console.error('Failed to save visit to database:', error)
      // Fallback to localStorage
      markAsVisited(customerId)
      return false
    }

    // Update cache
    visitCache.set(customerId, Date.now())

    // Also save locally as backup
    markAsVisited(customerId)

    console.log('[CustomerVisit] Marked as visited (DB):', customerId)
    return true
  } catch (e) {
    console.error('Error marking customer as visited:', e)
    // Fallback to localStorage
    markAsVisited(customerId)
    return false
  }
}

/**
 * Tandai customer sudah dikunjungi - LOCAL ONLY (sync/fallback)
 */
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

  saveLocalVisits(visits)

  // Update cache
  visitCache.set(customerId, Date.now())
}

// Hapus tanda kunjungan (undo) - from database
export async function unmarkVisitAsync(customerId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('customer_visits')
      .delete()
      .eq('customer_id', customerId)

    if (error) {
      console.error('Failed to delete visit from database:', error)
    }

    // Also remove from local
    unmarkVisit(customerId)

    // Remove from cache
    visitCache.delete(customerId)

    return !error
  } catch (e) {
    console.error('Error unmarking visit:', e)
    unmarkVisit(customerId)
    return false
  }
}

// Hapus tanda kunjungan (undo) - local only
export function unmarkVisit(customerId: string): void {
  const visits = getLocalVisits()
  const filtered = visits.filter(v => v.customerId !== customerId)
  saveLocalVisits(filtered)
  visitCache.delete(customerId)
}

/**
 * Cek apakah customer sudah dikunjungi (dalam 24 jam terakhir)
 * Cek dari cache dulu, lalu database
 */
export function isVisited(customerId: string): boolean {
  const now = Date.now()

  // Check cache first
  const cachedTime = visitCache.get(customerId)
  if (cachedTime && now - cachedTime < VISIT_DURATION_MS) {
    return true
  }

  // Check local storage as fallback
  const visits = getLocalVisits()
  const visit = visits.find(v => v.customerId === customerId)
  if (visit && now - visit.visitedAt < VISIT_DURATION_MS) {
    return true
  }

  return false
}

/**
 * Get semua customer ID yang sudah dikunjungi dari DATABASE
 * Ini adalah fungsi async yang mengambil data dari server
 */
export async function getVisitedCustomerIdsAsync(branchId?: string): Promise<Set<string>> {
  const now = Date.now()

  // Check if cache is still valid
  if (now - lastCacheUpdate < CACHE_DURATION && visitCache.size > 0) {
    return new Set(visitCache.keys())
  }

  try {
    // Calculate 24 hours ago
    const twentyFourHoursAgo = new Date(now - VISIT_DURATION_MS).toISOString()

    let query = supabase
      .from('customer_visits')
      .select('customer_id, visited_at')
      .gte('visited_at', twentyFourHoursAgo)

    if (branchId) {
      query = query.eq('branch_id', branchId)
    }

    const { data, error } = await query

    if (error) {
      console.error('Failed to fetch visits from database:', error)
      // Fallback to local
      return getVisitedCustomerIds()
    }

    // Update cache
    visitCache.clear()
    const visitedIds = new Set<string>()

    data?.forEach((visit: any) => {
      const visitedAt = new Date(visit.visited_at).getTime()
      visitCache.set(visit.customer_id, visitedAt)
      visitedIds.add(visit.customer_id)
    })

    lastCacheUpdate = now
    console.log(`[CustomerVisit] Loaded ${visitedIds.size} visits from database`)

    return visitedIds
  } catch (e) {
    console.error('Error fetching visits:', e)
    return getVisitedCustomerIds()
  }
}

// Get semua customer ID yang sudah dikunjungi (LOCAL - sync fallback)
export function getVisitedCustomerIds(): Set<string> {
  const validVisits = cleanExpiredVisits()
  return new Set(validVisits.map(v => v.customerId))
}

/**
 * Get jumlah kunjungan hari ini dari DATABASE
 */
export async function getTodayVisitCountAsync(branchId?: string): Promise<number> {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - VISIT_DURATION_MS).toISOString()

    let query = supabase
      .from('customer_visits')
      .select('id', { count: 'exact', head: true })
      .gte('visited_at', twentyFourHoursAgo)

    if (branchId) {
      query = query.eq('branch_id', branchId)
    }

    const { count, error } = await query

    if (error) {
      console.error('Failed to count visits:', error)
      return getTodayVisitCount()
    }

    return count || 0
  } catch (e) {
    console.error('Error counting visits:', e)
    return getTodayVisitCount()
  }
}

// Get jumlah kunjungan hari ini (LOCAL - sync fallback)
export function getTodayVisitCount(): number {
  return cleanExpiredVisits().length
}

// Get waktu kunjungan
export function getVisitTime(customerId: string): Date | null {
  const cachedTime = visitCache.get(customerId)
  if (cachedTime) {
    return new Date(cachedTime)
  }

  const visits = getLocalVisits()
  const visit = visits.find(v => v.customerId === customerId)

  if (!visit) return null
  return new Date(visit.visitedAt)
}

// Alias untuk backward compatibility
export const getVisits = getLocalVisits
