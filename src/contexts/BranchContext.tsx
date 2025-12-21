import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode, useRef } from 'react';
import { Branch, Company } from '@/types/branch';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';

interface BranchContextType {
  currentBranch: Branch | null;
  availableBranches: Branch[];
  currentCompany: Company | null;
  isHeadOffice: boolean;
  canAccessAllBranches: boolean;
  switchBranch: (branchId: string) => void;
  refreshBranches: () => Promise<void>;
  loading: boolean;
}

const BranchContext = createContext<BranchContextType | undefined>(undefined);

export function BranchProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [currentBranch, setCurrentBranch] = useState<Branch | null>(null);
  const [availableBranches, setAvailableBranches] = useState<Branch[]>([]);
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  // Use refs to track previous values and prevent unnecessary re-fetches
  const fetchedUserIdRef = useRef<string | null>(null);
  const restoredBranchRef = useRef<boolean>(false);

  // Check if user is head office or can access all branches - memoize to prevent recalculation
  const isHeadOffice = useMemo(() =>
    user?.role === 'super_admin' || user?.role === 'head_office_admin' || user?.role === 'owner',
    [user?.role]
  );
  const canAccessAllBranches = isHeadOffice;

  // Fetch user's branch and available branches
  const fetchBranches = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Get user's profile with branch info
      const { data: profile } = await supabase
        .from('profiles')
        .select('branch_id')
        .eq('id', user.id)
        .single();

      if (!profile?.branch_id) {
        console.warn('User has no branch assigned');
        setLoading(false);
        return;
      }

      // Get current branch details
      const { data: branch } = await supabase
        .from('branches')
        .select('*')
        .eq('id', profile.branch_id)
        .single();

      if (branch) {
        setCurrentBranch({
          id: branch.id,
          companyId: branch.company_id,
          name: branch.name,
          code: branch.code,
          address: branch.address,
          phone: branch.phone,
          email: branch.email,
          managerId: branch.manager_id,
          managerName: branch.manager_name,
          isActive: branch.is_active,
          settings: branch.settings,
          createdAt: new Date(branch.created_at),
          updatedAt: new Date(branch.updated_at),
        });

        // Get company details (only if company_id exists)
        if (branch.company_id) {
          const { data: company } = await supabase
            .from('companies')
            .select('*')
            .eq('id', branch.company_id)
            .single();

          if (company) {
          setCurrentCompany({
            id: company.id,
            name: company.name,
            code: company.code,
            isHeadOffice: company.is_head_office,
            address: company.address,
            phone: company.phone,
            email: company.email,
            taxId: company.tax_id,
            logoUrl: company.logo_url,
            isActive: company.is_active,
            createdAt: new Date(company.created_at),
            updatedAt: new Date(company.updated_at),
          });
          }
        }
      }

      // Get all available branches (based on user role)
      let branchesQuery = supabase
        .from('branches')
        .select('*')
        .eq('is_active', true);

      // If not head office, only get user's branch
      if (!canAccessAllBranches) {
        branchesQuery = branchesQuery.eq('id', profile.branch_id);
      }

      const { data: branches } = await branchesQuery;

      if (branches) {
        setAvailableBranches(
          branches.map((b) => ({
            id: b.id,
            companyId: b.company_id,
            name: b.name,
            code: b.code,
            address: b.address,
            phone: b.phone,
            email: b.email,
            managerId: b.manager_id,
            managerName: b.manager_name,
            isActive: b.is_active,
            settings: b.settings,
            createdAt: new Date(b.created_at),
            updatedAt: new Date(b.updated_at),
          }))
        );
      }
    } catch (error) {
      console.error('Error fetching branches:', error);
    } finally {
      setLoading(false);
    }
  };

  // Switch to different branch (only for head office users)
  const switchBranch = (branchId: string) => {
    if (!canAccessAllBranches) {
      console.warn('User cannot switch branches');
      return;
    }

    const branch = availableBranches.find((b) => b.id === branchId);
    if (branch) {
      setCurrentBranch(branch);
      // Save to localStorage for persistence
      localStorage.setItem('selectedBranchId', branchId);

      // Show notification first
      toast({
        title: 'Cabang berhasil dipindah',
        description: `Sekarang menampilkan data untuk ${branch.name}`,
      });

      // Clear cache and invalidate queries with staggered timing to prevent freeze
      // First, clear the cache to free memory
      queryClient.clear();

      // Then invalidate in batches with small delays to prevent UI freeze
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['customers'] });
        queryClient.invalidateQueries({ queryKey: ['deliveries'] });
      }, 100);

      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['invoices'] });
        queryClient.invalidateQueries({ queryKey: ['inventory'] });
      }, 200);

      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
        queryClient.invalidateQueries({ queryKey: ['stock'] });
      }, 300);

      setTimeout(() => {
        // Invalidate remaining queries
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
        queryClient.invalidateQueries({ queryKey: ['reports'] });
      }, 400);
    }
  };

  // Restore selected branch from localStorage - only run once when branches are first loaded
  useEffect(() => {
    if (canAccessAllBranches && availableBranches.length > 0 && !restoredBranchRef.current) {
      const savedBranchId = localStorage.getItem('selectedBranchId');
      if (savedBranchId) {
        const branch = availableBranches.find((b) => b.id === savedBranchId);
        if (branch) {
          setCurrentBranch(branch);
        }
      }
      restoredBranchRef.current = true;
    }
  }, [availableBranches.length, canAccessAllBranches]);

  // Fetch branches only when user ID changes (not on every user object change)
  useEffect(() => {
    const userId = user?.id;
    if (userId && fetchedUserIdRef.current !== userId) {
      fetchedUserIdRef.current = userId;
      fetchBranches();
    } else if (!userId) {
      fetchedUserIdRef.current = null;
      setLoading(false);
    }
  }, [user?.id]);

  const value: BranchContextType = {
    currentBranch,
    availableBranches,
    currentCompany,
    isHeadOffice,
    canAccessAllBranches,
    switchBranch,
    refreshBranches: fetchBranches,
    loading,
  };

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export function useBranch() {
  const context = useContext(BranchContext);
  if (context === undefined) {
    throw new Error('useBranch must be used within a BranchProvider');
  }
  return context;
}
