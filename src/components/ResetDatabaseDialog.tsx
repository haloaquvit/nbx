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
import { Trash2, AlertTriangle, Database } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

export const ResetDatabaseDialog = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();

  const resetDatabase = async () => {
    if (!password) {
      toast.error('Masukkan password untuk konfirmasi');
      return;
    }

    setIsLoading(true);

    try {
      // Verify password by attempting to sign in
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: password
      });

      if (authError) {
        toast.error('Password salah');
        setIsLoading(false);
        return;
      }

      // List of tables to clear (excluding auth and profiles)
      const tablesToClear = [
        'transactions',
        'transaction_items', 
        'products',
        'materials',
        'material_movements',
        'customers',
        'accounts',
        'account_transfers',
        'cash_history',
        'receivables',
        'expenses',
        'employee_advances',
        'retasi',
        'stock_movements',
        'purchase_orders',
        'attendance'
      ];

      // Clear each table
      for (const table of tablesToClear) {
        try {
          const { error } = await supabase
            .from(table)
            .delete()
            .neq('id', ''); // Delete all rows (using a condition that matches all)

          if (error && !error.message.includes('does not exist')) {
            console.warn(`Warning clearing table ${table}:`, error);
          }
        } catch (err) {
          console.warn(`Table ${table} might not exist:`, err);
        }
      }

      // Reset account balances to 0
      try {
        await supabase
          .from('accounts')
          .update({ balance: 0 })
          .neq('id', '');
      } catch (err) {
        console.warn('Could not reset account balances:', err);
      }

      toast.success('Database berhasil direset! Semua data transaksi dan master data telah dihapus.');
      
      // Close dialogs and reset form
      setIsConfirmOpen(false);
      setIsOpen(false);
      setPassword('');
      
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Reset Database
            </DialogTitle>
            <DialogDescription>
              Tindakan ini akan menghapus SEMUA data kecuali data karyawan dan login.
            </DialogDescription>
          </DialogHeader>

          <Card className="border-red-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-red-700">Data yang akan dihapus:</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div>• Semua transaksi dan item transaksi</div>
              <div>• Semua data produk dan material</div>
              <div>• Semua data pelanggan</div>
              <div>• Semua data akun keuangan dan saldo</div>
              <div>• Semua data retasi dan pengantaran</div>
              <div>• Semua data absensi</div>
              <div>• Semua laporan dan riwayat</div>
            </CardContent>
          </Card>

          <Card className="border-green-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-green-700">Data yang TIDAK akan dihapus:</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div>• Data karyawan (profiles)</div>
              <div>• Data login dan autentikasi</div>
              <div>• Pengaturan sistem</div>
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
                if (e.key === 'Enter' && password) {
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
              disabled={!password || isLoading}
            >
              Lanjutkan Reset
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600">
              Konfirmasi Reset Database
            </AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda YAKIN ingin menghapus semua data? Tindakan ini TIDAK DAPAT DIBATALKAN!
              
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                <strong>PERINGATAN:</strong> Semua transaksi, produk, pelanggan, dan data bisnis akan hilang permanen!
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction 
              onClick={resetDatabase}
              disabled={isLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {isLoading ? 'Mereset...' : 'Ya, Reset Database'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};