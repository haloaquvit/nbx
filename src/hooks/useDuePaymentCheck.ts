import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useBranch } from '@/contexts/BranchContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { DebtInstallmentService } from '@/services/debtInstallmentService';

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // Check every hour
const INITIAL_DELAY_MS = 3 * 1000; // Wait 3 seconds after app load

export interface DuePaymentSummary {
  overdueCount: number;
  overdueAmount: number;
  dueSoonCount: number; // Due within 7 days
  dueSoonAmount: number;
  nextDueDate?: Date;
  nextDueAmount?: number;
}

/**
 * Hook to check for due/overdue debt installments and show notifications
 */
export function useDuePaymentCheck() {
  const { user } = useAuth();
  const { currentBranch } = useBranch();
  const { toast } = useToast();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasRunInitialCheck = useRef(false);
  const [summary, setSummary] = useState<DuePaymentSummary | null>(null);

  // Check if user should receive payment notifications
  const shouldCheck = useCallback(() => {
    if (!user) return false;
    const role = user.role?.toLowerCase() || '';
    return (
      role.includes('owner') ||
      role.includes('supervisor') ||
      role.includes('admin') ||
      role.includes('manager') ||
      role.includes('finance') ||
      role.includes('keuangan')
    );
  }, [user]);

  // Run the due payment check
  const runCheck = useCallback(async (): Promise<DuePaymentSummary | null> => {
    console.log('[useDuePaymentCheck] Running check...', {
      shouldCheck: shouldCheck(),
      branchId: currentBranch?.id,
      hasRunInitialCheck: hasRunInitialCheck.current
    });

    if (!shouldCheck() || !currentBranch?.id) {
      console.log('[useDuePaymentCheck] Skipped - conditions not met');
      return null;
    }

    try {
      // First update overdue status
      await DebtInstallmentService.updateOverdueStatus();

      // Get all pending/overdue installments for this branch
      const { data: installments, error } = await supabase
        .from('debt_installments')
        .select('*, accounts_payable:debt_id(supplier_name)')
        .eq('branch_id', currentBranch.id)
        .in('status', ['pending', 'overdue'])
        .order('due_date', { ascending: true });

      if (error) {
        console.error('[useDuePaymentCheck] Error fetching installments:', error);
        return null;
      }

      if (!installments || installments.length === 0) {
        setSummary({ overdueCount: 0, overdueAmount: 0, dueSoonCount: 0, dueSoonAmount: 0 });
        return null;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const sevenDaysFromNow = new Date(today);
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

      // Categorize installments
      const overdue = installments.filter(i => i.status === 'overdue' || new Date(i.due_date) < today);
      const dueSoon = installments.filter(i => {
        const dueDate = new Date(i.due_date);
        return i.status === 'pending' && dueDate >= today && dueDate <= sevenDaysFromNow;
      });

      const result: DuePaymentSummary = {
        overdueCount: overdue.length,
        overdueAmount: overdue.reduce((sum, i) => sum + Number(i.total_amount), 0),
        dueSoonCount: dueSoon.length,
        dueSoonAmount: dueSoon.reduce((sum, i) => sum + Number(i.total_amount), 0),
        nextDueDate: installments[0] ? new Date(installments[0].due_date) : undefined,
        nextDueAmount: installments[0] ? Number(installments[0].total_amount) : undefined,
      };

      setSummary(result);

      console.log('[useDuePaymentCheck] Result:', {
        overdueCount: overdue.length,
        dueSoonCount: dueSoon.length,
        hasRunInitialCheck: hasRunInitialCheck.current
      });

      // Show notification on initial check (not on periodic checks to avoid spam)
      const formatCurrency = (amount: number) =>
        new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);

      // Only show on initial check to avoid repeated toasts
      if (!hasRunInitialCheck.current) {
        // Show notification if there are overdue payments
        if (overdue.length > 0) {
          console.log('[useDuePaymentCheck] Showing overdue notification');
          toast({
            title: `⚠️ ${overdue.length} Tagihan Terlambat!`,
            description: `Total ${formatCurrency(result.overdueAmount)} perlu segera dibayar`,
            variant: 'destructive',
            duration: 10000, // Show longer (10 seconds)
          });
        }
        // Show warning for due soon (only if no overdue)
        else if (dueSoon.length > 0) {
          console.log('[useDuePaymentCheck] Showing due soon notification');
          toast({
            title: `📅 ${dueSoon.length} Tagihan Jatuh Tempo Minggu Ini`,
            description: `Total ${formatCurrency(result.dueSoonAmount)}`,
            duration: 8000, // Show 8 seconds
          });
        }
      }

      return result;
    } catch (error) {
      console.error('[useDuePaymentCheck] Error running check:', error);
      return null;
    }
  }, [shouldCheck, currentBranch?.id, toast]);

  // Setup periodic check
  useEffect(() => {
    if (!shouldCheck()) {
      return;
    }

    // Initial check after delay
    const initialTimeout = setTimeout(() => {
      runCheck().then(() => {
        hasRunInitialCheck.current = true;
      });
    }, INITIAL_DELAY_MS);

    // Periodic check
    intervalRef.current = setInterval(() => {
      runCheck();
    }, CHECK_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [shouldCheck, runCheck]);

  return {
    summary,
    runCheck,
    isEnabled: shouldCheck(),
  };
}

/**
 * Hook to get upcoming installments for display
 */
export function useUpcomingInstallments(limit: number = 5) {
  const { currentBranch } = useBranch();
  const [installments, setInstallments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchUpcoming = useCallback(async () => {
    if (!currentBranch?.id) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('debt_installments')
        .select('*, accounts_payable:debt_id(supplier_name, description)')
        .eq('branch_id', currentBranch.id)
        .in('status', ['pending', 'overdue'])
        .order('due_date', { ascending: true })
        .limit(limit);

      if (error) throw error;
      setInstallments(data || []);
    } catch (error) {
      console.error('[useUpcomingInstallments] Error:', error);
      setInstallments([]);
    } finally {
      setLoading(false);
    }
  }, [currentBranch?.id, limit]);

  useEffect(() => {
    fetchUpcoming();
  }, [fetchUpcoming]);

  return { installments, loading, refresh: fetchUpcoming };
}
