import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Lock, Eye, EyeOff, Trash2, Shield } from 'lucide-react';
import { Employee } from '@/types/employee';

interface PinSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Employee | null;
}

export function PinSetupDialog({ open, onOpenChange, employee }: PinSetupDialogProps) {
  const { toast } = useToast();
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasExistingPin, setHasExistingPin] = useState(false);

  // Check if employee has existing PIN when dialog opens
  useEffect(() => {
    if (open && employee) {
      checkExistingPin();
    } else {
      // Reset state when dialog closes
      setNewPin('');
      setConfirmPin('');
      setShowPin(false);
      setHasExistingPin(false);
    }
  }, [open, employee]);

  const checkExistingPin = async () => {
    if (!employee) return;

    try {
      const { data } = await supabase
        .from('profiles')
        .select('pin')
        .eq('id', employee.id)
        .limit(1);

      const profile = Array.isArray(data) ? data[0] : data;
      setHasExistingPin(!!profile?.pin);
    } catch (error) {
      console.error('Error checking PIN:', error);
    }
  };

  const handleSavePin = async () => {
    if (!employee) return;

    // Validate PIN
    if (!newPin || newPin.length < 4) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'PIN harus minimal 4 digit',
      });
      return;
    }

    if (newPin.length > 6) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'PIN maksimal 6 digit',
      });
      return;
    }

    if (newPin !== confirmPin) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'PIN tidak cocok',
      });
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ pin: newPin })
        .eq('id', employee.id);

      if (error) throw error;

      toast({
        title: 'Sukses',
        description: `PIN untuk ${employee.name} berhasil disimpan`,
      });

      onOpenChange(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal',
        description: error.message || 'Gagal menyimpan PIN',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemovePin = async () => {
    if (!employee) return;

    setIsLoading(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ pin: null })
        .eq('id', employee.id);

      if (error) throw error;

      toast({
        title: 'Sukses',
        description: `PIN untuk ${employee.name} berhasil dihapus`,
      });

      setHasExistingPin(false);
      setNewPin('');
      setConfirmPin('');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal',
        description: error.message || 'Gagal menghapus PIN',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            {hasExistingPin ? 'Ganti PIN' : 'Set PIN'} - {employee?.name}
          </DialogTitle>
          <DialogDescription>
            {hasExistingPin
              ? 'Masukkan PIN baru untuk mengganti PIN yang sudah ada.'
              : 'Atur PIN untuk keamanan akun. PIN akan diminta setelah 3 menit idle.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Status PIN */}
          {hasExistingPin && (
            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-green-700 dark:text-green-300">
                    PIN sudah diatur
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRemovePin}
                  disabled={isLoading}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Hapus PIN
                </Button>
              </div>
            </div>
          )}

          {/* New PIN Input */}
          <div className="space-y-2">
            <Label htmlFor="newPin">PIN Baru (4-6 digit)</Label>
            <div className="relative">
              <Input
                id="newPin"
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                placeholder="Masukkan PIN baru"
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowPin(!showPin)}
              >
                {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Confirm PIN Input */}
          <div className="space-y-2">
            <Label htmlFor="confirmPin">Konfirmasi PIN</Label>
            <Input
              id="confirmPin"
              type={showPin ? 'text' : 'password'}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
              placeholder="Konfirmasi PIN"
            />
          </div>

          {/* Validation message */}
          {newPin && confirmPin && newPin !== confirmPin && (
            <p className="text-sm text-destructive">PIN tidak cocok</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            onClick={handleSavePin}
            disabled={isLoading || !newPin || newPin.length < 4 || newPin !== confirmPin}
          >
            {isLoading ? 'Menyimpan...' : 'Simpan PIN'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
