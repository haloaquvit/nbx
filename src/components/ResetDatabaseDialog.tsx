import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Trash2, AlertTriangle, Database, ShoppingCart, Package, DollarSign, Users, Truck, Settings, Building2, HandCoins, Heart } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

// Define database categories and their tables
interface DataCategory {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  tables: string[];
  dependencies?: string[]; // Tables that depend on this category
}

const dataCategories: DataCategory[] = [
  {
    id: 'sales',
    name: 'Sales & Revenue',
    description: 'Transaksi penjualan, quotasi, dan pengiriman',
    icon: <ShoppingCart className="w-4 h-4" />,
    tables: [
      'transactions',
      'transaction_items',
      'transaction_payments',
      'quotations',
      'deliveries',
      'delivery_items',
      'payment_history',
      'stock_pricings',
      'bonus_pricings'
    ],
    dependencies: ['customers']
  },
  {
    id: 'customers',
    name: 'Customer Data',
    description: 'Data pelanggan dan kontak',
    icon: <Users className="w-4 h-4" />,
    tables: ['customers']
  },
  {
    id: 'inventory',
    name: 'Inventory & Materials',
    description: 'Produk, material, dan pergerakan stok',
    icon: <Package className="w-4 h-4" />,
    tables: [
      'products',
      'materials',
      'material_stock_movements',
      'material_inventory_batches',
      'material_usage_history',
      'stock_movements',
      'product_materials'
    ]
  },
  {
    id: 'production',
    name: 'Production History',
    description: 'Riwayat produksi',
    icon: <Package className="w-4 h-4" />,
    tables: [
      'production_records'
    ]
  },
  {
    id: 'purchasing',
    name: 'Purchasing & Suppliers',
    description: 'Purchase orders, suppliers, dan hutang dagang',
    icon: <Truck className="w-4 h-4" />,
    tables: [
      'purchase_orders',
      'purchase_order_items',
      'suppliers',
      'supplier_materials',
      'accounts_payable'
    ]
  },
  {
    id: 'finance',
    name: 'Finance & Accounting',
    description: 'Akun keuangan, kas, dan laporan',
    icon: <DollarSign className="w-4 h-4" />,
    tables: [
      'expenses',
      'expense_categories',
      'expense_category_mapping',
      'cash_history',
      'account_transfers',
      'manual_journal_entries',
      'manual_journal_entry_lines',
      'balance_adjustments'
    ],
    dependencies: ['accounts']
  },
  {
    id: 'accounts',
    name: 'Chart of Accounts',
    description: 'Reset saldo akun ke 0 (struktur akun tetap)',
    icon: <DollarSign className="w-4 h-4" />,
    tables: ['accounts']
  },
  {
    id: 'hr',
    name: 'Human Resources',
    description: 'Karyawan, absensi, kasbon, payroll, dan komisi',
    icon: <Users className="w-4 h-4" />,
    tables: [
      'employee_advances',
      'advance_repayments',
      'attendance',
      'commission_rules',
      'commission_entries',
      'employee_salaries',
      'payroll_records'
    ]
  },
  {
    id: 'operations',
    name: 'Operations & Logistics',
    description: 'Pengantaran dan operasional',
    icon: <Truck className="w-4 h-4" />,
    tables: ['retasi']
  },
  {
    id: 'system',
    name: 'System & Monitoring',
    description: 'Log audit, notifikasi, dan monitoring sistem',
    icon: <Settings className="w-4 h-4" />,
    tables: [
      'audit_logs',
      'performance_logs',
      'notifications',
      'roles',
      'role_permissions'
    ]
  },
  {
    id: 'branches',
    name: 'Branch Management',
    description: 'Data cabang dan transfer antar cabang',
    icon: <Building2 className="w-4 h-4" />,
    tables: [
      'companies',
      'branches',
      'branch_transfers'
    ]
  },
  {
    id: 'assets',
    name: 'Asset Management',
    description: 'Aset perusahaan dan maintenance',
    icon: <Package className="w-4 h-4" />,
    tables: [
      'assets',
      'asset_maintenance'
    ]
  },
  {
    id: 'loans',
    name: 'Loans & Financing',
    description: 'Pinjaman dan pembayaran cicilan',
    icon: <HandCoins className="w-4 h-4" />,
    tables: [
      'loans',
      'loan_payments',
      'loan_payment_schedules'
    ]
  },
  {
    id: 'zakat',
    name: 'Zakat & Charity',
    description: 'Pencatatan zakat dan nishab',
    icon: <Heart className="w-4 h-4" />,
    tables: [
      'zakat_records',
      'nishab_reference'
    ]
  }
];

export const ResetDatabaseDialog = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);
  const { user } = useAuth();

  // Handle category selection with dependency warnings
  const handleCategoryToggle = (categoryId: string, checked: boolean) => {
    if (checked) {
      // Check if this category has dependencies
      const category = dataCategories.find(cat => cat.id === categoryId);
      if (category?.dependencies) {
        const missingDeps = category.dependencies.filter(depId => !selectedCategories.includes(depId));
        if (missingDeps.length > 0) {
          const depNames = missingDeps.map(depId => dataCategories.find(cat => cat.id === depId)?.name).join(', ');
          toast.warning(`Warning: ${category.name} depends on ${depNames}. Consider selecting those as well to avoid referential integrity issues.`);
        }
      }
      
      setSelectedCategories(prev => [...prev, categoryId]);
    } else {
      // Check if other categories depend on this one
      const dependentCategories = dataCategories.filter(cat => 
        cat.dependencies?.includes(categoryId) && selectedCategories.includes(cat.id)
      );
      
      if (dependentCategories.length > 0) {
        const depNames = dependentCategories.map(cat => cat.name).join(', ');
        toast.warning(`Warning: ${depNames} depend on this category. They may fail to reset properly.`);
      }
      
      setSelectedCategories(prev => prev.filter(id => id !== categoryId));
      setSelectAll(false);
    }
  };

  // Handle select all
  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedCategories(dataCategories.map(cat => cat.id));
    } else {
      setSelectedCategories([]);
    }
  };

  // Get all tables to be cleared based on selected categories
  const getTablesToClear = (categories: string[] = selectedCategories) => {
    const tables: string[] = [];
    const processedCategories = new Set<string>();

    // Helper function to add category tables including dependencies
    const addCategoryTables = (categoryId: string) => {
      if (processedCategories.has(categoryId)) return;

      const category = dataCategories.find(cat => cat.id === categoryId);
      if (!category) return;

      // Add dependency tables first (to maintain referential integrity during deletion)
      if (category.dependencies) {
        category.dependencies.forEach(depId => {
          if (categories.includes(depId)) {
            addCategoryTables(depId);
          }
        });
      }

      // Add this category's tables
      tables.push(...category.tables);
      processedCategories.add(categoryId);
    };

    // Process all selected categories
    categories.forEach(categoryId => {
      addCategoryTables(categoryId);
    });

    return [...new Set(tables)]; // Remove duplicates
  };

  const resetDatabase = async () => {
    console.log('resetDatabase called');
    console.log('Password:', password ? '(provided)' : '(empty)');
    console.log('Selected categories:', selectedCategories);

    if (!password) {
      toast.error('Masukkan password untuk konfirmasi');
      return;
    }

    if (selectedCategories.length === 0) {
      toast.error('Pilih minimal satu kategori data untuk direset');
      return;
    }

    // Safety check: Prevent deletion of critical system data - auto remove system from selection
    const criticalCategories = ['system'];
    const filteredCategories = selectedCategories.filter(cat => !criticalCategories.includes(cat));
    if (filteredCategories.length === 0) {
      toast.error('Tidak ada kategori yang dapat direset (System & Monitoring tidak dapat dihapus)');
      return;
    }
    if (filteredCategories.length !== selectedCategories.length) {
      toast.warning('System & Monitoring dilewati untuk menjaga integritas audit trail.');
    }

    setIsLoading(true);
    toast.info('Memulai proses reset database...');

    try {
      // Verify password by attempting to sign in
      console.log('Verifying password for:', user?.email);
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: password
      });

      if (authError) {
        console.error('Auth error:', authError);
        toast.error('Password salah');
        setIsLoading(false);
        return;
      }

      console.log('Password verified successfully');

      // Get tables to clear based on filtered selection (excludes system)
      const tablesToClear = getTablesToClear(filteredCategories);
      console.log('Tables to clear:', tablesToClear);
      console.log('Filtered categories:', filteredCategories);
      
      // Validation: Check if tables exist before attempting to clear
      const validTables: string[] = [];
      const invalidTables: string[] = [];
      
      for (const table of tablesToClear) {
        try {
          // Test if table exists by attempting to select 0 rows
          const { error } = await supabase
            .from(table)
            .select('id')
            .limit(0);

          if (!error) {
            validTables.push(table);
            console.log(`Table ${table} is valid`);
          } else {
            invalidTables.push(table);
            console.warn(`Table ${table} does not exist or is not accessible:`, error.message);
          }
        } catch (err) {
          invalidTables.push(table);
          console.warn(`Table ${table} validation failed:`, err);
        }
      }

      console.log('Valid tables:', validTables);
      console.log('Invalid tables:', invalidTables);

      let clearedTables: string[] = [];
      let failedTables: string[] = [];

      // Clear each valid table in reverse order (to handle foreign key constraints)
      // Skip 'accounts' table - we only reset balances, not delete accounts
      const reversedTables = [...validTables].reverse().filter(t => t !== 'accounts');

      for (const table of reversedTables) {
        try {
          console.log(`Attempting to clear table: ${table}`);

          // First count how many records exist
          const { count, error: countError } = await supabase
            .from(table)
            .select('*', { count: 'exact', head: true });

          console.log(`Table ${table} has ${count} records`);

          // Delete all records using neq on a column that always exists
          const { error: deleteError } = await supabase
            .from(table)
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // This matches all rows

          if (deleteError) {
            console.error(`Error deleting from ${table}:`, deleteError);
            failedTables.push(table);
          } else {
            clearedTables.push(table);
            console.log(`Successfully cleared ${count || 0} records from ${table}`);
            toast.success(`Berhasil menghapus ${count || 0} data dari ${table}`);
          }

        } catch (err) {
          console.error(`Error clearing table ${table}:`, err);
          failedTables.push(table);
        }
      }

      // Reset account balances to 0 if accounts category is selected (don't delete, just reset balance)
      if (filteredCategories.includes('accounts')) {
        try {
          const { error } = await supabase
            .from('accounts')
            .update({ balance: 0, initial_balance: 0 })
            .neq('id', '');

          if (error) {
            console.warn('Could not reset account balances:', error);
          } else {
            clearedTables.push('accounts (balance reset)');
            console.log('Successfully reset account balances to 0');
          }
        } catch (err) {
          console.warn('Could not reset account balances:', err);
        }
      }

      // Show detailed success/warning message
      const successMessage = `Database reset completed! ${clearedTables.length} tables successfully cleared.`;
      if (failedTables.length > 0 || invalidTables.length > 0) {
        const warningDetails = [];
        if (failedTables.length > 0) warningDetails.push(`${failedTables.length} tables failed to clear`);
        if (invalidTables.length > 0) warningDetails.push(`${invalidTables.length} tables not found`);
        toast.warning(`${successMessage} Note: ${warningDetails.join(', ')}.`);
      } else {
        toast.success(successMessage);
      }
      
      // Close dialogs and reset form
      setIsConfirmOpen(false);
      setIsOpen(false);
      setPassword('');
      setSelectedCategories([]);
      setSelectAll(false);
      
      // Refresh page to show empty state
      setTimeout(() => {
        window.location.reload();
      }, 2000);

    } catch (error: any) {
      console.error('Error resetting database:', error);
      toast.error('Gagal mereset database: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = () => {
    setIsConfirmOpen(true);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button variant="destructive" className="w-full">
            <Database className="w-4 h-4 mr-2" />
            Reset Database
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Selective Reset Database
            </DialogTitle>
            <DialogDescription>
              Pilih kategori data yang ingin dihapus. Data karyawan dan login tetap aman.
            </DialogDescription>
          </DialogHeader>

          <Card className="border-blue-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-blue-700">Pilih Data yang Akan Direset:</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Select All Checkbox */}
              <div className="flex items-center space-x-2 p-2 bg-gray-50 rounded">
                <Checkbox
                  id="select-all"
                  checked={selectAll}
                  onCheckedChange={handleSelectAll}
                />
                <Label htmlFor="select-all" className="font-medium">
                  Select All Categories
                </Label>
              </div>
              
              <Separator />
              
              {/* Category Checkboxes */}
              <div className="grid grid-cols-1 gap-3">
                {dataCategories.map((category) => (
                  <div key={category.id} className="flex items-start space-x-3 p-3 border rounded hover:bg-gray-50">
                    <Checkbox
                      id={category.id}
                      checked={selectedCategories.includes(category.id)}
                      onCheckedChange={(checked) => handleCategoryToggle(category.id, checked as boolean)}
                    />
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        {category.icon}
                        <Label htmlFor={category.id} className="font-medium cursor-pointer">
                          {category.name}
                        </Label>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {category.description}
                      </p>
                      <p className="text-xs text-gray-500">
                        Tables: {category.tables.join(', ')}
                      </p>
                      {category.dependencies && (
                        <p className="text-xs text-orange-600">
                          ⚠️ Depends on: {category.dependencies.join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              
              {selectedCategories.length > 0 && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
                  <p className="text-sm text-red-700 font-medium">
                    {getTablesToClear().length} tabel akan dihapus: {getTablesToClear().join(', ')}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-green-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-green-700">Data yang TIDAK akan dihapus:</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div>• Data karyawan (profiles)</div>
              <div>• Data login dan autentikasi</div>
              <div>• Pengaturan sistem (company_settings)</div>
              <div>• Role dan permission system</div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <Label>Masukkan password Anda untuk konfirmasi:</Label>
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && password && selectedCategories.length > 0) {
                  handleConfirm();
                }
              }}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Batal
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleConfirm}
              disabled={!password || selectedCategories.length === 0 || isLoading}
            >
              Lanjutkan Reset ({selectedCategories.length} kategori)
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600">
              Konfirmasi Reset Database
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Apakah Anda YAKIN ingin menghapus data berikut? Tindakan ini TIDAK DAPAT DIBATALKAN!</p>

                <div className="p-3 bg-blue-50 border border-blue-200 rounded text-blue-700 text-sm">
                  <strong>Kategori yang akan direset:</strong>
                  <ul className="mt-2 space-y-1">
                    {selectedCategories.map(catId => {
                      const category = dataCategories.find(cat => cat.id === catId);
                      return (
                        <li key={catId} className="flex items-center gap-2">
                          {category?.icon}
                          {category?.name}
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                  <strong>⚠️ PERINGATAN:</strong> {getTablesToClear().length} tabel akan dihapus permanen!
                  <span className="mt-1 text-xs block">
                    Tables: {getTablesToClear().join(', ')}
                  </span>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                resetDatabase();
              }}
              disabled={isLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {isLoading ? 'Mereset...' : `Ya, Reset ${selectedCategories.length} Kategori`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};