import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useBranch } from '@/contexts/BranchContext'

export interface AuditLog {
  id: string
  tableName: string
  operation: 'INSERT' | 'UPDATE' | 'DELETE'
  recordId: string
  oldData: Record<string, any> | null
  newData: Record<string, any> | null
  changedFields: Record<string, { old: any; new: any }> | null
  userId: string | null
  userEmail: string | null
  userRole: string | null
  createdAt: Date
}

export interface AuditLogFilters {
  tableName?: string
  operation?: string
  recordId?: string
  userEmail?: string
  dateFrom?: Date
  dateTo?: Date
}

// Daftar tabel yang di-audit
export const AUDITED_TABLES = [
  'accounts',
  'assets',
  'commission_entries',
  'customers',
  'deliveries',
  'delivery_items',
  'employee_advances',
  'expenses',
  'inventory_batches',
  'journal_entries',
  'journal_entry_lines',
  'materials',
  'production_records',
  'products',
  'profiles',
  'purchase_orders',
  'purchase_order_items',
  'retasi',
  'retasi_items',
  'suppliers',
  'transactions',
]

// Label tabel dalam Bahasa Indonesia
export const TABLE_LABELS: Record<string, string> = {
  accounts: 'Akun (COA)',
  assets: 'Aset Tetap',
  commission_entries: 'Komisi',
  customers: 'Pelanggan',
  deliveries: 'Pengantaran',
  delivery_items: 'Item Pengantaran',
  employee_advances: 'Panjar Karyawan',
  expenses: 'Pengeluaran',
  inventory_batches: 'Batch Persediaan',
  journal_entries: 'Jurnal',
  journal_entry_lines: 'Baris Jurnal',
  materials: 'Bahan Baku',
  production_records: 'Produksi',
  products: 'Produk',
  profiles: 'Profil User',
  purchase_orders: 'Purchase Order',
  purchase_order_items: 'Item PO',
  retasi: 'Retasi',
  retasi_items: 'Item Retasi',
  suppliers: 'Supplier',
  transactions: 'Transaksi',
}

// Label operasi
export const OPERATION_LABELS: Record<string, string> = {
  INSERT: 'Tambah',
  UPDATE: 'Ubah',
  DELETE: 'Hapus',
}

// Warna badge operasi
export const OPERATION_COLORS: Record<string, string> = {
  INSERT: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  UPDATE: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  DELETE: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
}

export function useAuditLogs(filters: AuditLogFilters = {}, limit: number = 100) {
  const { currentBranch } = useBranch()

  return useQuery({
    queryKey: ['audit-logs', filters, limit, currentBranch?.id],
    queryFn: async (): Promise<AuditLog[]> => {
      let query = supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)

      // Apply filters
      if (filters.tableName) {
        query = query.eq('table_name', filters.tableName)
      }

      if (filters.operation) {
        query = query.eq('operation', filters.operation)
      }

      if (filters.recordId) {
        query = query.ilike('record_id', `%${filters.recordId}%`)
      }

      if (filters.userEmail) {
        query = query.ilike('user_email', `%${filters.userEmail}%`)
      }

      if (filters.dateFrom) {
        query = query.gte('created_at', filters.dateFrom.toISOString())
      }

      if (filters.dateTo) {
        // Add 1 day to include the entire end date
        const endDate = new Date(filters.dateTo)
        endDate.setDate(endDate.getDate() + 1)
        query = query.lt('created_at', endDate.toISOString())
      }

      const { data, error } = await query

      if (error) {
        console.error('[useAuditLogs] Error:', error)
        throw error
      }

      return (data || []).map((log: any) => ({
        id: log.id,
        tableName: log.table_name,
        operation: log.operation,
        recordId: log.record_id,
        oldData: log.old_data,
        newData: log.new_data,
        changedFields: log.changed_fields,
        userId: log.user_id,
        userEmail: log.user_email,
        userRole: log.user_role,
        createdAt: new Date(log.created_at),
      }))
    },
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  })
}

// Hook untuk mendapatkan history record tertentu
export function useRecordHistory(tableName: string, recordId: string) {
  return useQuery({
    queryKey: ['record-history', tableName, recordId],
    queryFn: async (): Promise<AuditLog[]> => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('table_name', tableName)
        .eq('record_id', recordId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('[useRecordHistory] Error:', error)
        throw error
      }

      return (data || []).map((log: any) => ({
        id: log.id,
        tableName: log.table_name,
        operation: log.operation,
        recordId: log.record_id,
        oldData: log.old_data,
        newData: log.new_data,
        changedFields: log.changed_fields,
        userId: log.user_id,
        userEmail: log.user_email,
        userRole: log.user_role,
        createdAt: new Date(log.created_at),
      }))
    },
    enabled: !!tableName && !!recordId,
  })
}

// Helper function untuk format perubahan field
export function formatChangedFields(changedFields: Record<string, { old: any; new: any }> | null): string[] {
  if (!changedFields) return []

  return Object.entries(changedFields).map(([field, values]) => {
    const oldVal = values.old === null ? 'null' : String(values.old)
    const newVal = values.new === null ? 'null' : String(values.new)
    return `${field}: ${oldVal} → ${newVal}`
  })
}
