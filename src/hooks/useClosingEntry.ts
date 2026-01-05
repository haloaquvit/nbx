import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import {
  ClosingPreview,
  ClosingPeriod,
  previewClosingEntry,
  executeClosingEntry,
  getClosedYears,
  isYearClosed,
  voidClosingEntry
} from '@/services/closingEntryService';

interface UseClosingEntryReturn {
  loading: boolean;
  preview: ClosingPreview | null;
  closedYears: ClosingPeriod[];
  fetchPreview: (year: number, branchId: string) => Promise<void>;
  fetchClosedYears: (branchId: string) => Promise<void>;
  checkYearClosed: (year: number, branchId: string) => Promise<boolean>;
  executeClosing: (year: number, branchId: string) => Promise<boolean>;
  voidClosing: (year: number, branchId: string) => Promise<boolean>;
  clearPreview: () => void;
}

export function useClosingEntry(): UseClosingEntryReturn {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<ClosingPreview | null>(null);
  const [closedYears, setClosedYears] = useState<ClosingPeriod[]>([]);
  const { toast } = useToast();

  const fetchPreview = useCallback(async (year: number, branchId: string) => {
    setLoading(true);
    try {
      const data = await previewClosingEntry(year, branchId);
      setPreview(data);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Gagal memuat preview tutup buku',
        variant: 'destructive'
      });
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchClosedYears = useCallback(async (branchId: string) => {
    try {
      const data = await getClosedYears(branchId);
      setClosedYears(data);
    } catch (error: any) {
      console.error('Error fetching closed years:', error);
    }
  }, []);

  const checkYearClosed = useCallback(async (year: number, branchId: string) => {
    return await isYearClosed(year, branchId);
  }, []);

  const executeClosing = useCallback(async (
    year: number,
    branchId: string
  ): Promise<boolean> => {
    setLoading(true);
    try {
      const result = await executeClosingEntry(year, branchId);

      if (result.success) {
        toast({
          title: 'Berhasil',
          description: `Tutup buku tahun ${year} berhasil dilakukan`,
        });
        // Refresh closed years
        await fetchClosedYears(branchId);
        setPreview(null);
        return true;
      } else {
        toast({
          title: 'Gagal',
          description: result.error || 'Gagal melakukan tutup buku',
          variant: 'destructive'
        });
        return false;
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Terjadi kesalahan saat tutup buku',
        variant: 'destructive'
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, [toast, fetchClosedYears]);

  const voidClosing = useCallback(async (
    year: number,
    branchId: string
  ): Promise<boolean> => {
    setLoading(true);
    try {
      const result = await voidClosingEntry(year, branchId);

      if (result.success) {
        toast({
          title: 'Berhasil',
          description: `Tutup buku tahun ${year} berhasil dibatalkan`,
        });
        // Refresh closed years
        await fetchClosedYears(branchId);
        return true;
      } else {
        toast({
          title: 'Gagal',
          description: result.error || 'Gagal membatalkan tutup buku',
          variant: 'destructive'
        });
        return false;
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Terjadi kesalahan saat membatalkan tutup buku',
        variant: 'destructive'
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, [toast, fetchClosedYears]);

  const clearPreview = useCallback(() => {
    setPreview(null);
  }, []);

  return {
    loading,
    preview,
    closedYears,
    fetchPreview,
    fetchClosedYears,
    checkYearClosed,
    executeClosing,
    voidClosing,
    clearPreview
  };
}
