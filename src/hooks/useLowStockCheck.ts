import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useBranch } from '@/contexts/BranchContext';
import { LowStockNotificationService, LowStockCheckResult } from '@/services/lowStockNotificationService';

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // Check once per day (24 hours)
const INITIAL_DELAY_MS = 10 * 1000; // Wait 10 seconds after app load

/**
 * Hook to periodically check for low stock items and create notifications
 * Only runs for users with appropriate roles (Owner, Supervisor, Admin)
 */
export function useLowStockCheck() {
  const { user } = useAuth();
  const { currentBranch } = useBranch();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasRunInitialCheck = useRef(false);

  // Check if user should receive low stock notifications
  const shouldCheck = useCallback(() => {
    if (!user) return false;
    const role = user.role?.toLowerCase() || '';
    return (
      role.includes('owner') ||
      role.includes('supervisor') ||
      role.includes('admin') ||
      role.includes('manager')
    );
  }, [user]);

  // Run the low stock check
  const runCheck = useCallback(async (): Promise<LowStockCheckResult | null> => {
    if (!shouldCheck()) return null;

    try {
      const result = await LowStockNotificationService.runLowStockCheck(currentBranch?.id);
      return result;
    } catch (error) {
      console.error('[useLowStockCheck] Error running check:', error);
      return null;
    }
  }, [shouldCheck, currentBranch?.id]);

  // Setup periodic check
  useEffect(() => {
    if (!shouldCheck()) {
      return;
    }

    // Initial check after delay
    const initialTimeout = setTimeout(() => {
      if (!hasRunInitialCheck.current) {
        hasRunInitialCheck.current = true;
        runCheck();
      }
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
    runCheck,
    isEnabled: shouldCheck(),
  };
}

/**
 * Hook to manually trigger low stock check
 * Can be used by any component that needs to trigger a check
 */
export function useManualLowStockCheck() {
  const { currentBranch } = useBranch();

  const triggerCheck = useCallback(async () => {
    try {
      const result = await LowStockNotificationService.runLowStockCheck(currentBranch?.id);
      return result;
    } catch (error) {
      console.error('[useManualLowStockCheck] Error:', error);
      return null;
    }
  }, [currentBranch?.id]);

  return { triggerCheck };
}
