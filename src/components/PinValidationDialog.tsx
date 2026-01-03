import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthContext } from '@/contexts/AuthContext';
import { Lock, AlertCircle } from 'lucide-react';

export const PinValidationDialog = () => {
  const { pinRequired, validatePin, signOut } = useAuthContext();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when dialog opens
  useEffect(() => {
    if (pinRequired && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [pinRequired]);

  // Clear state when dialog opens/closes
  useEffect(() => {
    if (pinRequired) {
      setPin('');
      setError('');
    }
  }, [pinRequired]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim()) {
      setError('Masukkan PIN');
      return;
    }

    setIsValidating(true);
    setError('');

    try {
      const isValid = await validatePin(pin);
      if (!isValid) {
        setError('PIN salah');
        setPin('');
        inputRef.current?.focus();
      }
    } catch (err) {
      setError('Terjadi kesalahan');
    } finally {
      setIsValidating(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
  };

  return (
    <Dialog open={pinRequired} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            Verifikasi PIN
          </DialogTitle>
          <DialogDescription>
            Sesi Anda telah idle. Masukkan PIN untuk melanjutkan.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              placeholder="Masukkan PIN"
              value={pin}
              onChange={(e) => {
                // Only allow numbers
                const value = e.target.value.replace(/\D/g, '');
                setPin(value);
                setError('');
              }}
              maxLength={6}
              className="text-center text-2xl tracking-widest font-mono"
              autoComplete="off"
            />
            {error && (
              <div className="flex items-center gap-1 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleLogout}
              className="flex-1"
            >
              Logout
            </Button>
            <Button
              type="submit"
              disabled={isValidating || !pin.trim()}
              className="flex-1"
            >
              {isValidating ? 'Memverifikasi...' : 'Verifikasi'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
