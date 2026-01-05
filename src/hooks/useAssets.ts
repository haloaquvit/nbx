import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Asset, AssetFormData, AssetSummary } from '@/types/assets';
import { useBranch } from '@/contexts/BranchContext';
// Journal now handled by RPC create_asset_atomic, update_asset_atomic, delete_asset_atomic, record_depreciation_atomic

// ============================================================================
// CATATAN PENTING: DOUBLE-ENTRY ACCOUNTING SYSTEM
// ============================================================================
// Semua saldo akun HANYA dihitung dari journal_entries (tidak ada update balance langsung)
// Pembelian aset menggunakan createAssetPurchaseJournal
// Penyusutan menggunakan createDepreciationJournal
// ============================================================================

// Fetch all assets
export function useAssets() {
  const { currentBranch } = useBranch();

  return useQuery({
    queryKey: ['assets', currentBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('assets')
        .select('*')
        .order('created_at', { ascending: false });

      // Apply branch filter - ALWAYS filter by selected branch
      if (currentBranch?.id) {
        query = query.eq('branch_id', currentBranch.id);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Deduplicate data by id to prevent duplicate key errors
      const uniqueData = new Map();
      (data || []).forEach((item: any) => {
        if (!uniqueData.has(item.id)) {
          uniqueData.set(item.id, item);
        }
      });

      return Array.from(uniqueData.values()).map((asset: any) => ({
        id: asset.id,
        assetName: asset.asset_name,
        assetCode: asset.asset_code,
        category: asset.category,
        description: asset.description,
        purchaseDate: new Date(asset.purchase_date),
        purchasePrice: asset.purchase_price,
        supplierName: asset.supplier_name,
        brand: asset.brand,
        model: asset.model,
        serialNumber: asset.serial_number,
        location: asset.location,
        usefulLifeYears: asset.useful_life_years,
        salvageValue: asset.salvage_value,
        depreciationMethod: asset.depreciation_method,
        status: asset.status,
        condition: asset.condition,
        accountId: asset.account_id,
        currentValue: asset.current_value,
        warrantyExpiry: asset.warranty_expiry ? new Date(asset.warranty_expiry) : undefined,
        insuranceExpiry: asset.insurance_expiry ? new Date(asset.insurance_expiry) : undefined,
        notes: asset.notes,
        photoUrl: asset.photo_url,
        createdBy: asset.created_by,
        createdAt: new Date(asset.created_at),
        updatedAt: new Date(asset.updated_at),
      })) as Asset[];
    },
    enabled: !!currentBranch,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes cache
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    retryDelay: 1000,
  });
}

// Get asset by ID
export function useAsset(id?: string) {
  return useQuery({
    queryKey: ['assets', id],
    queryFn: async () => {
      if (!id) return null;

      // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
      const { data: dataRaw, error } = await supabase
        .from('assets')
        .select('*')
        .eq('id', id)
        .order('id').limit(1);

      if (error) throw error;
      const data = Array.isArray(dataRaw) ? dataRaw[0] : dataRaw;
      if (!data) return null;

      return {
        id: data.id,
        assetName: data.asset_name,
        assetCode: data.asset_code,
        category: data.category,
        description: data.description,
        purchaseDate: new Date(data.purchase_date),
        purchasePrice: data.purchase_price,
        supplierName: data.supplier_name,
        brand: data.brand,
        model: data.model,
        serialNumber: data.serial_number,
        location: data.location,
        usefulLifeYears: data.useful_life_years,
        salvageValue: data.salvage_value,
        depreciationMethod: data.depreciation_method,
        status: data.status,
        condition: data.condition,
        accountId: data.account_id,
        currentValue: data.current_value,
        warrantyExpiry: data.warranty_expiry ? new Date(data.warranty_expiry) : undefined,
        insuranceExpiry: data.insurance_expiry ? new Date(data.insurance_expiry) : undefined,
        notes: data.notes,
        photoUrl: data.photo_url,
        createdBy: data.created_by,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
      } as Asset;
    },
    enabled: !!id,
  });
}

// Get assets summary
export function useAssetsSummary() {
  const { currentBranch } = useBranch();

  return useQuery({
    queryKey: ['assets', 'summary', currentBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('assets')
        .select('*');

      // Apply branch filter - ALWAYS filter by selected branch
      if (currentBranch?.id) {
        query = query.eq('branch_id', currentBranch.id);
      }

      const { data, error } = await query;

      if (error) throw error;

      const assets = data || [];
      const totalAssets = assets.length;
      const totalValue = assets.reduce((sum, a) => sum + (a.purchase_price || 0), 0);
      const totalDepreciation = assets.reduce((sum, a) => sum + ((a.purchase_price || 0) - (a.current_value || 0)), 0);
      const activeAssets = assets.filter(a => a.status === 'active').length;
      const maintenanceAssets = assets.filter(a => a.status === 'maintenance').length;
      const retiredAssets = assets.filter(a => a.status === 'retired').length;

      // Group by category
      const byCategory = assets.reduce((acc: any[], asset: any) => {
        const existing = acc.find(c => c.category === asset.category);
        if (existing) {
          existing.count += 1;
          existing.totalValue += asset.purchase_price || 0;
        } else {
          acc.push({
            category: asset.category,
            count: 1,
            totalValue: asset.purchase_price || 0,
          });
        }
        return acc;
      }, []);

      return {
        totalAssets,
        totalValue,
        totalDepreciation,
        activeAssets,
        maintenanceAssets,
        retiredAssets,
        byCategory,
      } as AssetSummary;
    },
    enabled: !!currentBranch,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes cache
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    retryDelay: 1000,
  });
}

// Create asset
export function useCreateAsset() {
  const queryClient = useQueryClient();
  const { currentBranch } = useBranch();

  return useMutation({
    mutationFn: async (formData: AssetFormData) => {
      // ============================================================================
      // USE RPC: create_asset_atomic
      // Handles: asset record + journal (Dr. Aset, Cr. Kas) in single transaction
      // ============================================================================
      if (currentBranch?.id) {
        const { data: rpcResultRaw, error: rpcError } = await supabase
          .rpc('create_asset_atomic', {
            p_asset: {
              name: formData.assetName,
              code: formData.assetCode,
              category: formData.category,
              purchase_date: formData.purchaseDate.toISOString().split('T')[0],
              purchase_price: formData.purchasePrice,
              useful_life_years: formData.usefulLifeYears,
              salvage_value: formData.salvageValue,
              depreciation_method: formData.depreciationMethod,
              location: formData.location,
              brand: formData.brand || formData.assetName,
              model: formData.model,
              serial_number: formData.serialNumber,
              supplier_name: formData.supplierName,
              notes: formData.notes,
              status: formData.status,
              condition: formData.condition,
              source: formData.source || 'cash', // cash, credit, migration
            },
            p_branch_id: currentBranch.id,
          });

        if (rpcError) {
          console.error('RPC create_asset_atomic error:', rpcError);
          throw new Error(rpcError.message);
        }

        const rpcResult = Array.isArray(rpcResultRaw) ? rpcResultRaw[0] : rpcResultRaw;
        if (!rpcResult?.success) {
          throw new Error(rpcResult?.error_message || 'Gagal membuat aset');
        }

        console.log('✅ Asset created via RPC:', rpcResult.asset_id, 'Journal:', rpcResult.journal_id);
        return rpcResult.asset_id;
      }

      // Fallback: Legacy method if no branch
      const id = crypto.randomUUID();
      const insertData: any = {
        id,
        name: formData.assetName,
        code: formData.assetCode,
        asset_code: formData.assetCode,
        category: formData.category,
        purchase_date: formData.purchaseDate.toISOString().split('T')[0],
        purchase_price: formData.purchasePrice,
        brand: formData.brand || formData.assetName,
        status: formData.status || 'active',
        condition: formData.condition || 'good',
        current_value: formData.purchasePrice,
        branch_id: null,
      };

      const { error } = await supabase.from('assets').insert(insertData);
      if (error) throw error;

      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
    },
  });
}

// Update asset
export function useUpdateAsset() {
  const queryClient = useQueryClient();
  const { currentBranch } = useBranch();

  return useMutation({
    mutationFn: async ({ id, formData }: { id: string; formData: Partial<AssetFormData> }) => {
      // ============================================================================
      // USE RPC: update_asset_atomic
      // Handles: update asset + update journal if price changed
      // ============================================================================
      if (currentBranch?.id) {
        const { data: rpcResultRaw, error: rpcError } = await supabase
          .rpc('update_asset_atomic', {
            p_asset_id: id,
            p_asset: {
              name: formData.assetName,
              code: formData.assetCode,
              category: formData.category,
              purchase_date: formData.purchaseDate?.toISOString().split('T')[0],
              purchase_price: formData.purchasePrice,
              useful_life_years: formData.usefulLifeYears,
              salvage_value: formData.salvageValue,
              depreciation_method: formData.depreciationMethod,
              location: formData.location,
              brand: formData.brand,
              model: formData.model,
              serial_number: formData.serialNumber,
              supplier_name: formData.supplierName,
              notes: formData.notes,
              status: formData.status,
              condition: formData.condition,
              account_id: formData.accountId,
            },
            p_branch_id: currentBranch.id,
          });

        if (rpcError) {
          console.error('RPC update_asset_atomic error:', rpcError);
          throw new Error(rpcError.message);
        }

        const rpcResult = Array.isArray(rpcResultRaw) ? rpcResultRaw[0] : rpcResultRaw;
        if (!rpcResult?.success) {
          throw new Error(rpcResult?.error_message || 'Gagal update aset');
        }

        console.log('✅ Asset updated via RPC, journal updated:', rpcResult.journal_updated);
        return;
      }

      // Fallback: Legacy method
      const updateData: any = {};
      if (formData.assetName) updateData.name = formData.assetName;
      if (formData.assetCode) updateData.code = formData.assetCode;
      if (formData.category) updateData.category = formData.category;
      if (formData.purchaseDate) updateData.purchase_date = formData.purchaseDate.toISOString().split('T')[0];
      if (formData.purchasePrice !== undefined) updateData.purchase_price = formData.purchasePrice;
      if (formData.status) updateData.status = formData.status;

      const { error } = await supabase.from('assets').update(updateData).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
    },
  });
}

// Delete asset
export function useDeleteAsset() {
  const queryClient = useQueryClient();
  const { currentBranch } = useBranch();

  return useMutation({
    mutationFn: async (id: string) => {
      // ============================================================================
      // USE RPC: delete_asset_atomic
      // Handles: void journals + delete asset in single transaction
      // ============================================================================
      if (currentBranch?.id) {
        const { data: rpcResultRaw, error: rpcError } = await supabase
          .rpc('delete_asset_atomic', {
            p_asset_id: id,
            p_branch_id: currentBranch.id,
          });

        if (rpcError) {
          console.error('RPC delete_asset_atomic error:', rpcError);
          throw new Error(rpcError.message);
        }

        const rpcResult = Array.isArray(rpcResultRaw) ? rpcResultRaw[0] : rpcResultRaw;
        if (!rpcResult?.success) {
          throw new Error(rpcResult?.error_message || 'Gagal menghapus aset');
        }

        console.log('✅ Asset deleted via RPC, journals voided:', rpcResult.journals_voided);
        return;
      }

      // Fallback: Legacy method
      const { error } = await supabase.from('assets').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
    },
  });
}

// Calculate and update asset current value
export function useCalculateAssetValue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (assetId: string) => {
      const { data, error } = await supabase
        .rpc('calculate_asset_current_value', { p_asset_id: assetId });

      if (error) throw error;

      // Update the asset with new current value
      const { error: updateError } = await supabase
        .from('assets')
        .update({ current_value: data })
        .eq('id', assetId);

      if (updateError) throw updateError;

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });
}

// ============================================================================
// DEPRECIATION ACCOUNTING VIA RPC
// Record depreciation expense for an asset:
// Dr. Beban Penyusutan (6240)
//   Cr. Akumulasi Penyusutan (1420/1450)
// ============================================================================
export function useRecordDepreciation() {
  const queryClient = useQueryClient();
  const { currentBranch } = useBranch();

  return useMutation({
    mutationFn: async ({ assetId, depreciationAmount, period }: {
      assetId: string;
      depreciationAmount: number;
      period: string; // e.g., "2024-12" for December 2024
    }) => {
      if (depreciationAmount <= 0) {
        throw new Error('Depreciation amount must be greater than 0');
      }

      if (!currentBranch?.id) {
        throw new Error('Branch tidak ditemukan');
      }

      // ============================================================================
      // USE RPC: record_depreciation_atomic
      // Handles: journal + update asset current_value in single transaction
      // ============================================================================
      const { data: rpcResultRaw, error: rpcError } = await supabase
        .rpc('record_depreciation_atomic', {
          p_asset_id: assetId,
          p_amount: depreciationAmount,
          p_period: period,
          p_branch_id: currentBranch.id,
        });

      if (rpcError) {
        console.error('RPC record_depreciation_atomic error:', rpcError);
        throw new Error(rpcError.message);
      }

      const rpcResult = Array.isArray(rpcResultRaw) ? rpcResultRaw[0] : rpcResultRaw;
      if (!rpcResult?.success) {
        throw new Error(rpcResult?.error_message || 'Gagal mencatat penyusutan');
      }

      console.log('✅ Depreciation recorded via RPC:', {
        journalId: rpcResult.journal_id,
        newCurrentValue: rpcResult.new_current_value,
        period
      });

      return {
        assetId,
        depreciationAmount,
        newCurrentValue: rpcResult.new_current_value,
        period
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
    },
  });
}

// Calculate monthly depreciation for all assets
export function useCalculateAllDepreciations() {
  const queryClient = useQueryClient();
  const { currentBranch } = useBranch();

  return useMutation({
    mutationFn: async (period: string) => {
      // Get all active assets
      let query = supabase
        .from('assets')
        .select('*')
        .eq('status', 'active');

      if (currentBranch?.id) {
        query = query.eq('branch_id', currentBranch.id);
      }

      const { data: assets, error } = await query;

      if (error) throw error;

      const results: any[] = [];

      for (const asset of assets || []) {
        // Calculate monthly depreciation based on method
        const purchasePrice = asset.purchase_price || 0;
        const salvageValue = asset.salvage_value || 0;
        const usefulLifeYears = asset.useful_life_years || 5;
        const depreciableAmount = purchasePrice - salvageValue;

        let monthlyDepreciation = 0;

        if (asset.depreciation_method === 'straight_line') {
          // Straight line: (Cost - Salvage) / (Useful Life in months)
          monthlyDepreciation = depreciableAmount / (usefulLifeYears * 12);
        } else if (asset.depreciation_method === 'declining_balance') {
          // Double declining: 2 * (1/Useful Life) * Book Value
          const currentValue = asset.current_value || purchasePrice;
          const rate = 2 / usefulLifeYears;
          monthlyDepreciation = (currentValue * rate) / 12;
        } else {
          // Default to straight line
          monthlyDepreciation = depreciableAmount / (usefulLifeYears * 12);
        }

        // Don't depreciate below salvage value
        const currentValue = asset.current_value || purchasePrice;
        if (currentValue - monthlyDepreciation < salvageValue) {
          monthlyDepreciation = currentValue - salvageValue;
        }

        if (monthlyDepreciation > 0) {
          results.push({
            assetId: asset.id,
            assetName: asset.asset_name,
            depreciationAmount: Math.round(monthlyDepreciation),
            currentValue: currentValue,
            newValue: currentValue - Math.round(monthlyDepreciation)
          });
        }
      }

      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });
}
