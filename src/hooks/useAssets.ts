import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Asset, AssetFormData, AssetSummary } from '@/types/assets';
import { useBranch } from '@/contexts/BranchContext';

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

      return (data || []).map((asset: any) => ({
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

      const { data, error } = await supabase
        .from('assets')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

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
      // Generate proper UUID for the asset ID
      const id = crypto.randomUUID();

      // Auto-assign account based on category if not provided
      let accountId = formData.accountId;

      if (!accountId) {
        // Map asset category to account code
        const categoryToAccountCode: Record<string, string> = {
          'equipment': '1410',    // Peralatan Produksi
          'vehicle': '1420',      // Kendaraan
          'building': '1440',     // Bangunan
          'furniture': '1430',    // Tanah (temporary, should be Furniture)
          'computer': '1410',     // Use Peralatan Produksi for now
          'other': '1400',        // Aset Tetap (header)
        };

        const accountCode = categoryToAccountCode[formData.category] || '1400';

        // Find account by code
        const { data: accountData } = await supabase
          .from('accounts')
          .select('id')
          .eq('code', accountCode)
          .eq('is_active', true)
          .single();

        if (accountData) {
          accountId = accountData.id;
        }
      }

      // Note: asset_name is a GENERATED column from 'name'
      // We must set 'name' (the source column) which is NOT NULL
      const insertData: any = {
        id,
        name: formData.assetName, // Required - source for generated asset_name column
        code: formData.assetCode, // Map to 'code' column
        asset_code: formData.assetCode,
        category: formData.category,
        description: formData.description,
        purchase_date: formData.purchaseDate.toISOString().split('T')[0],
        purchase_price: formData.purchasePrice,
        supplier_name: formData.supplierName,
        brand: formData.brand || formData.assetName,
        model: formData.model,
        serial_number: formData.serialNumber,
        location: formData.location,
        useful_life_years: formData.usefulLifeYears,
        salvage_value: formData.salvageValue,
        depreciation_method: formData.depreciationMethod,
        status: formData.status,
        condition: formData.condition,
        notes: formData.notes,
        photo_url: formData.photoUrl,
        current_value: formData.purchasePrice, // Set initial current_value to purchase price
        account_id: accountId, // Always set account_id
        branch_id: currentBranch?.id || null,
      };

      if (formData.warrantyExpiry) {
        insertData.warranty_expiry = formData.warrantyExpiry.toISOString().split('T')[0];
      }
      if (formData.insuranceExpiry) {
        insertData.insurance_expiry = formData.insuranceExpiry.toISOString().split('T')[0];
      }

      const { error } = await supabase
        .from('assets')
        .insert(insertData);

      if (error) throw error;

      // ============================================================================
      // ASSET COA INTEGRATION
      // Update asset account balance (Debit - increase asset value)
      // Note: This is for initial asset entry, not purchase with cash
      // ============================================================================
      if (accountId && formData.purchasePrice > 0) {
        const { data: account, error: accountError } = await supabase
          .from('accounts')
          .select('balance')
          .eq('id', accountId)
          .single();

        if (!accountError && account) {
          const newBalance = Number(account.balance) + Number(formData.purchasePrice);
          await supabase
            .from('accounts')
            .update({ balance: newBalance })
            .eq('id', accountId);

          console.log('✅ Asset account balance updated:', {
            accountId,
            amount: formData.purchasePrice,
            newBalance
          });
        }
      }

      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

// Update asset
export function useUpdateAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, formData }: { id: string; formData: Partial<AssetFormData> }) => {
      const updateData: any = {};

      // Note: asset_name is a GENERATED column from 'name'
      // Update 'name' (the source column) instead of asset_name
      if (formData.assetName) updateData.name = formData.assetName;
      if (formData.assetCode) {
        updateData.code = formData.assetCode;
        updateData.asset_code = formData.assetCode;
      }
      if (formData.category) updateData.category = formData.category;
      if (formData.description !== undefined) updateData.description = formData.description;
      if (formData.purchaseDate) updateData.purchase_date = formData.purchaseDate.toISOString().split('T')[0];
      if (formData.purchasePrice !== undefined) updateData.purchase_price = formData.purchasePrice;
      if (formData.supplierName !== undefined) updateData.supplier_name = formData.supplierName;
      if (formData.brand !== undefined) updateData.brand = formData.brand;
      if (formData.model !== undefined) updateData.model = formData.model;
      if (formData.serialNumber !== undefined) updateData.serial_number = formData.serialNumber;
      if (formData.location !== undefined) updateData.location = formData.location;
      if (formData.usefulLifeYears !== undefined) updateData.useful_life_years = formData.usefulLifeYears;
      if (formData.salvageValue !== undefined) updateData.salvage_value = formData.salvageValue;
      if (formData.depreciationMethod) updateData.depreciation_method = formData.depreciationMethod;
      if (formData.status) updateData.status = formData.status;
      if (formData.condition) updateData.condition = formData.condition;
      if (formData.accountId !== undefined) updateData.account_id = formData.accountId;
      if (formData.warrantyExpiry !== undefined) updateData.warranty_expiry = formData.warrantyExpiry?.toISOString().split('T')[0];
      if (formData.insuranceExpiry !== undefined) updateData.insurance_expiry = formData.insuranceExpiry?.toISOString().split('T')[0];
      if (formData.notes !== undefined) updateData.notes = formData.notes;
      if (formData.photoUrl !== undefined) updateData.photo_url = formData.photoUrl;

      const { error } = await supabase
        .from('assets')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });
}

// Delete asset
export function useDeleteAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('assets')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
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
// DEPRECIATION ACCOUNTING
// Record depreciation expense for an asset:
// Debit: 6240 Beban Penyusutan (increase expense)
// Credit: 1420 Akumulasi Penyusutan (increase contra-asset)
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

      // Get asset details
      const { data: asset, error: assetError } = await supabase
        .from('assets')
        .select('*')
        .eq('id', assetId)
        .single();

      if (assetError || !asset) {
        throw new Error('Asset not found');
      }

      // Find Beban Penyusutan account (6240)
      const { data: bebanPenyusutanAccount } = await supabase
        .from('accounts')
        .select('id, name, code, balance')
        .eq('code', '6240')
        .single();

      // Find Akumulasi Penyusutan account (1420 or 1450)
      const { data: akumulasiAccount } = await supabase
        .from('accounts')
        .select('id, name, code, balance')
        .or('code.eq.1420,code.eq.1450')
        .limit(1)
        .single();

      if (!bebanPenyusutanAccount || !akumulasiAccount) {
        throw new Error('Beban Penyusutan (6240) or Akumulasi Penyusutan (1420/1450) account not found');
      }

      // Update Beban Penyusutan (Debit - increase expense)
      const newBebanBalance = (bebanPenyusutanAccount.balance || 0) + depreciationAmount;
      await supabase
        .from('accounts')
        .update({ balance: newBebanBalance })
        .eq('id', bebanPenyusutanAccount.id);

      // Update Akumulasi Penyusutan (Credit - increase contra-asset)
      // For contra-asset accounts, credit increases the balance
      const newAkumulasiBalance = (akumulasiAccount.balance || 0) + depreciationAmount;
      await supabase
        .from('accounts')
        .update({ balance: newAkumulasiBalance })
        .eq('id', akumulasiAccount.id);

      // Update asset current value
      const newCurrentValue = Math.max(0, (asset.current_value || asset.purchase_price) - depreciationAmount);
      await supabase
        .from('assets')
        .update({ current_value: newCurrentValue })
        .eq('id', assetId);

      // Record in cash_history for audit trail
      await supabase
        .from('cash_history')
        .insert({
          account_id: bebanPenyusutanAccount.id,
          account_name: bebanPenyusutanAccount.name,
          type: 'pengeluaran',
          amount: depreciationAmount,
          description: `Penyusutan ${asset.asset_name} periode ${period}`,
          reference_id: assetId,
          reference_name: `Aset ${asset.asset_code || asset.asset_name}`,
          branch_id: currentBranch?.id || null,
          expense_account_id: bebanPenyusutanAccount.id,
          expense_account_name: bebanPenyusutanAccount.name,
        });

      console.log('✅ Depreciation accounting created:', {
        asset: asset.asset_name,
        bebanPenyusutan: { account: bebanPenyusutanAccount.code, amount: depreciationAmount },
        akumulasi: { account: akumulasiAccount.code, amount: depreciationAmount },
        newCurrentValue,
        period
      });

      return {
        assetId,
        depreciationAmount,
        newCurrentValue,
        period
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
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
