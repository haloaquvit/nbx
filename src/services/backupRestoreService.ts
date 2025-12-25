// Backup & Restore Service untuk PostgREST
// Export semua data ke JSON, Import dari JSON file
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

// Daftar tabel yang akan di-backup (urutan penting untuk foreign key)
const BACKUP_TABLES = [
  // Master data (tidak punya foreign key ke tabel lain)
  'company_settings',
  'companies',
  'branches',
  'roles',
  'profiles', // User data
  'accounts',
  'expense_categories',
  'suppliers',
  'supplier_materials',
  'customers',
  'materials',
  'products',
  'product_materials',
  'commission_rules',
  'sales_commission_settings',
  'nishab_reference',

  // Data transaksional (punya foreign key)
  'transactions',
  'transaction_items',
  'quotations',
  'purchase_orders',
  'purchase_order_items',
  'accounts_payable',
  'deliveries',
  'delivery_items',
  'retasi',
  'journal_entries',
  'journal_entry_lines',
  'payroll_records',
  'employee_salaries',
  'commission_entries',
  'expenses',
  'employee_advances',
  'advance_repayments',
  'attendance',
  'material_stock_movements',
  'stock_movements',
  'production_records',
  'cash_history',
  'payment_history',
  'assets',
  'asset_maintenance',
  'zakat_records',
  'notifications',
];

// Tabel yang tidak boleh di-restore (sistem atau punya constraint khusus)
const SKIP_RESTORE_TABLES = ['roles', 'company_settings', 'branches', 'profiles'];

// Tabel yang memiliki kolom branch_id yang perlu di-remap ke branch aktif
const TABLES_WITH_BRANCH_ID = [
  'accounts',
  'customers',
  'materials',
  'products',
  'transactions',
  'quotations',
  'purchase_orders',
  'deliveries',
  'journal_entries',
  'payroll_records',
  'employee_salaries',
  'expenses',
  'employee_advances',
  'advance_repayments',
  'material_stock_movements',
  'stock_movements',
  'production_records',
  'cash_history',
  'payment_history',
  'assets',
  'zakat_records',
  'retasi',
  'inventory_batches',
];

// Kolom yang harus dihapus saat restore (generated columns, computed columns, etc)
const COLUMNS_TO_REMOVE: { [table: string]: string[] } = {
  'assets': ['asset_name'], // Generated column
};

// Primary key column untuk setiap tabel (jika bukan 'id')
const PRIMARY_KEY_COLUMNS: { [table: string]: string } = {
  'company_settings': 'name', // company_settings uses 'name' as PK or has no standard PK
};

export interface BackupData {
  version: string;
  createdAt: string;
  serverUrl: string;
  tables: {
    [tableName: string]: any[];
  };
  metadata: {
    totalRecords: number;
    tableCount: number;
  };
}

export interface BackupProgress {
  currentTable: string;
  currentIndex: number;
  totalTables: number;
  status: 'idle' | 'backing_up' | 'restoring' | 'completed' | 'error';
  message: string;
}

export interface RestoreProgress {
  currentTable: string;
  currentIndex: number;
  totalTables: number;
  insertedCount: number;
  skippedCount: number;
  status: 'idle' | 'validating' | 'restoring' | 'completed' | 'error';
  message: string;
}

class BackupRestoreService {
  // Export semua data ke JSON
  async createBackup(
    onProgress?: (progress: BackupProgress) => void
  ): Promise<BackupData> {
    const tables: { [key: string]: any[] } = {};
    let totalRecords = 0;

    for (let i = 0; i < BACKUP_TABLES.length; i++) {
      const tableName = BACKUP_TABLES[i];

      onProgress?.({
        currentTable: tableName,
        currentIndex: i + 1,
        totalTables: BACKUP_TABLES.length,
        status: 'backing_up',
        message: `Backup tabel ${tableName}...`,
      });

      try {
        const { data, error } = await supabase
          .from(tableName)
          .select('*');

        if (error) {
          console.warn(`Gagal backup tabel ${tableName}:`, error.message);
          tables[tableName] = [];
        } else {
          tables[tableName] = data || [];
          totalRecords += (data || []).length;
        }
      } catch (err) {
        console.warn(`Error backup tabel ${tableName}:`, err);
        tables[tableName] = [];
      }
    }

    const backup: BackupData = {
      version: '1.0',
      createdAt: new Date().toISOString(),
      serverUrl: window.location.origin,
      tables,
      metadata: {
        totalRecords,
        tableCount: Object.keys(tables).filter(t => tables[t].length > 0).length,
      },
    };

    onProgress?.({
      currentTable: '',
      currentIndex: BACKUP_TABLES.length,
      totalTables: BACKUP_TABLES.length,
      status: 'completed',
      message: `Backup selesai. ${totalRecords} record dari ${backup.metadata.tableCount} tabel.`,
    });

    return backup;
  }

  // Download backup sebagai file JSON
  async downloadBackup(onProgress?: (progress: BackupProgress) => void): Promise<void> {
    const backup = await this.createBackup(onProgress);

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aquvit-backup-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Validasi file backup
  validateBackupFile(data: any): { valid: boolean; error?: string } {
    if (!data) {
      return { valid: false, error: 'File kosong atau tidak valid' };
    }

    if (!data.version) {
      return { valid: false, error: 'Format backup tidak valid: versi tidak ditemukan' };
    }

    if (!data.tables || typeof data.tables !== 'object') {
      return { valid: false, error: 'Format backup tidak valid: data tabel tidak ditemukan' };
    }

    if (!data.createdAt) {
      return { valid: false, error: 'Format backup tidak valid: tanggal backup tidak ditemukan' };
    }

    return { valid: true };
  }

  // Restore dari file JSON
  async restoreFromBackup(
    backupData: BackupData,
    options: {
      clearExisting?: boolean; // Hapus data existing sebelum restore
      skipUsers?: boolean; // Jangan restore users (berbahaya)
      activeBranchId?: string; // Branch ID aktif untuk remap semua data
    } = {},
    onProgress?: (progress: RestoreProgress) => void
  ): Promise<{ success: boolean; message: string; details: string[] }> {
    const { clearExisting = false, skipUsers = true, activeBranchId } = options;
    const details: string[] = [];
    let insertedCount = 0;
    let skippedCount = 0;

    // Validasi
    const validation = this.validateBackupFile(backupData);
    if (!validation.valid) {
      return { success: false, message: validation.error!, details: [] };
    }

    onProgress?.({
      currentTable: '',
      currentIndex: 0,
      totalTables: BACKUP_TABLES.length,
      insertedCount: 0,
      skippedCount: 0,
      status: 'validating',
      message: 'Validasi file backup...',
    });

    // Restore dalam urutan yang benar (master dulu, lalu transaksional)
    const tablesToRestore = BACKUP_TABLES.filter(t => {
      if (SKIP_RESTORE_TABLES.includes(t)) return false;
      if (skipUsers && t === 'users') return false;
      return backupData.tables[t] && backupData.tables[t].length > 0;
    });

    for (let i = 0; i < tablesToRestore.length; i++) {
      const tableName = tablesToRestore[i];
      const tableData = backupData.tables[tableName];

      onProgress?.({
        currentTable: tableName,
        currentIndex: i + 1,
        totalTables: tablesToRestore.length,
        insertedCount,
        skippedCount,
        status: 'restoring',
        message: `Restore tabel ${tableName} (${tableData.length} record)...`,
      });

      try {
        // Hapus data existing jika diminta
        if (clearExisting) {
          const { error: deleteError } = await supabase
            .from(tableName)
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Dummy condition to delete all

          if (deleteError) {
            details.push(`⚠️ Gagal hapus ${tableName}: ${deleteError.message}`);
          }
        }

        // Insert data baru (batch insert)
        if (tableData.length > 0) {
          // Batch insert (max 100 per batch untuk avoid timeout)
          const batchSize = 100;
          for (let j = 0; j < tableData.length; j += batchSize) {
            const batch = tableData.slice(j, j + batchSize);

            // Remove auto-generated/computed columns yang bisa conflict
            const columnsToRemove = COLUMNS_TO_REMOVE[tableName] || [];
            const shouldRemapBranch = activeBranchId && TABLES_WITH_BRANCH_ID.includes(tableName);

            const cleanedBatch = batch.map((row: any) => {
              const cleaned = { ...row };
              // Hapus kolom yang generated/computed
              for (const col of columnsToRemove) {
                delete cleaned[col];
              }
              // Remap branch_id ke branch aktif jika ada
              if (shouldRemapBranch && cleaned.branch_id) {
                cleaned.branch_id = activeBranchId;
              }
              return cleaned;
            });

            // Determine primary key for upsert
            const pkColumn = PRIMARY_KEY_COLUMNS[tableName] || 'id';

            const { error: insertError } = await supabase
              .from(tableName)
              .upsert(cleanedBatch, {
                onConflict: pkColumn,
                ignoreDuplicates: false
              });

            if (insertError) {
              details.push(`⚠️ Gagal insert ${tableName} batch ${j}-${j + batch.length}: ${insertError.message}`);
              skippedCount += batch.length;
            } else {
              insertedCount += batch.length;
            }
          }

          details.push(`✓ ${tableName}: ${tableData.length} record`);
        }
      } catch (err: any) {
        details.push(`❌ Error ${tableName}: ${err.message}`);
        skippedCount += tableData.length;
      }
    }

    onProgress?.({
      currentTable: '',
      currentIndex: tablesToRestore.length,
      totalTables: tablesToRestore.length,
      insertedCount,
      skippedCount,
      status: 'completed',
      message: `Restore selesai. ${insertedCount} record berhasil, ${skippedCount} dilewati.`,
    });

    return {
      success: skippedCount === 0,
      message: `Restore selesai. ${insertedCount} record berhasil, ${skippedCount} dilewati.`,
      details,
    };
  }

  // Parse file JSON yang di-upload
  async parseBackupFile(file: File): Promise<BackupData> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);
          resolve(data);
        } catch (err) {
          reject(new Error('File bukan JSON yang valid'));
        }
      };
      reader.onerror = () => reject(new Error('Gagal membaca file'));
      reader.readAsText(file);
    });
  }
}

export const backupRestoreService = new BackupRestoreService();
