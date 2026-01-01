import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Asset, AssetFormData, AssetSummary } from '@/types/assets';
import { useBranch } from '@/contexts/BranchContext';
import { createAssetPurchaseJournal, createDepreciationJournal, voidJournalEntry } from '@/services/journalService';

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
      // Generate proper UUID for the asset ID
      const id = crypto.randomUUID();

      // Auto-assign account based on category if not provided
      let accountId = formData.accountId;

      if (!accountId && currentBranch?.id) {
        // ============================================================================
        // MAPPING KATEGORI ASET KE AKUN COA
        // Prioritas pencarian: 1) By Name (lebih fleksibel), 2) By Code (fallback)
        // ============================================================================
        const categoryToAccount: Record<string, { names: string[]; code: string }> = {
          'vehicle': {
            names: ['kendaraan', 'vehicle'],
            code: '1410'
          },
          'equipment': {
            names: ['peralatan', 'mesin', 'equipment'],
            code: '1420'
          },
          'building': {
            names: ['bangunan', 'gedung', 'building'],
            code: '1440'
          },
          'furniture': {
            names: ['furniture', 'inventaris', 'mebel'],
            code: '1450'
          },
          'computer': {
            names: ['komputer', 'computer', 'laptop', 'perangkat ti'],
            code: '1460'
          },
          'other': {
            names: ['aset tetap lain', 'aset lain'],
            code: '1490'
          },
        };

        const mapping = categoryToAccount[formData.category] || categoryToAccount['other'];

        // 1. Cari akun berdasarkan NAMA terlebih dahulu (lebih fleksibel)
        let accountData: { id: string } | null = null;

        for (const searchName of mapping.names) {
          const { data: byNameRaw } = await supabase
            .from('accounts')
            .select('id, name, code')
            .eq('branch_id', currentBranch.id)
            .eq('is_active', true)
            .eq('is_header', false)
            .ilike('name', `%${searchName}%`)
            .order('code')
            .limit(1);

          const byName = Array.isArray(byNameRaw) ? byNameRaw[0] : byNameRaw;
          if (byName) {
            accountData = byName;
            console.log(`[useAssets] Found account by name "${searchName}":`, byName.code, byName.name);
            break;
          }
        }

        // 2. Fallback: cari berdasarkan KODE jika nama tidak ditemukan
        if (!accountData) {
          const { data: byCodeRaw } = await supabase
            .from('accounts')
            .select('id, name, code')
            .eq('branch_id', currentBranch.id)
            .eq('code', mapping.code)
            .eq('is_active', true)
            .order('id')
            .limit(1);

          const byCode = Array.isArray(byCodeRaw) ? byCodeRaw[0] : byCodeRaw;
          if (byCode) {
            accountData = byCode;
            console.log(`[useAssets] Found account by code "${mapping.code}":`, byCode.name);
          }
        }

        // 3. Last fallback: cari akun Aset Tetap manapun yang bukan header
        if (!accountData) {
          const { data: anyAssetRaw } = await supabase
            .from('accounts')
            .select('id, name, code')
            .eq('branch_id', currentBranch.id)
            .eq('type', 'Aset')
            .eq('is_active', true)
            .eq('is_header', false)
            .ilike('code', '14%')
            .order('code')
            .limit(1);

          const anyAsset = Array.isArray(anyAssetRaw) ? anyAssetRaw[0] : anyAssetRaw;
          if (anyAsset) {
            accountData = anyAsset;
            console.log(`[useAssets] Fallback to any fixed asset account:`, anyAsset.code, anyAsset.name);
          }
        }

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
      // ASSET COA INTEGRATION VIA JOURNAL
      // Auto-generate journal: Dr. Aset Tetap, Cr. Kas (tunai)
      // ============================================================================
      if (accountId && formData.purchasePrice > 0 && currentBranch?.id) {
        // Get account info for journal
        // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
        const { data: accountDataRaw2 } = await supabase
          .from('accounts')
          .select('id, code, name')
          .eq('id', accountId)
          .order('id').limit(1);
        const accountData = Array.isArray(accountDataRaw2) ? accountDataRaw2[0] : accountDataRaw2;

        if (accountData) {
          const journalResult = await createAssetPurchaseJournal({
            assetId: id,
            purchaseDate: formData.purchaseDate,
            amount: formData.purchasePrice,
            assetAccountId: accountData.id,
            assetAccountCode: accountData.code || '',
            assetAccountName: accountData.name,
            assetName: formData.assetName,
            paymentMethod: formData.source || 'cash', // cash, credit, or migration
            branchId: currentBranch.id,
          });

          if (journalResult.success) {
            console.log('✅ Asset purchase journal auto-generated:', journalResult.journalId);
          } else {
            console.warn('⚠️ Failed to create asset purchase journal:', journalResult.error);
          }
        }
      }

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
      // 1. GET CURRENT ASSET DATA TO CHECK IF PRICE CHANGED
      // ============================================================================
      const { data: currentAssetRaw } = await supabase
        .from('assets')
        .select('purchase_price, account_id, name, branch_id')
        .eq('id', id)
        .single();

      const currentAsset = currentAssetRaw;
      const oldPrice = currentAsset?.purchase_price || 0;
      const newPrice = formData.purchasePrice;
      const priceChanged = newPrice !== undefined && newPrice !== oldPrice;

      // ============================================================================
      // 2. IF PRICE CHANGED, VOID OLD JOURNAL AND CREATE NEW ONE
      // ============================================================================
      if (priceChanged && currentBranch?.id) {
        console.log(`[useUpdateAsset] Price changed from ${oldPrice} to ${newPrice}, updating journal...`);

        // Void old journal entries for this asset
        const { data: oldJournals } = await supabase
          .from('journal_entries')
          .select('id')
          .eq('reference_id', id)
          .eq('is_voided', false)
          .ilike('description', '%Pembelian Aset%');

        if (oldJournals && oldJournals.length > 0) {
          for (const journal of oldJournals) {
            const voidResult = await voidJournalEntry(journal.id, 'Harga aset diupdate');
            if (voidResult.success) {
              console.log(`✅ Voided old asset journal ${journal.id}`);
            } else {
              console.warn(`⚠️ Failed to void journal ${journal.id}:`, voidResult.error);
            }
          }
        }

        // Get account info for new journal
        const accountId = formData.accountId || currentAsset?.account_id;
        if (accountId && newPrice > 0) {
          const { data: accountDataRaw } = await supabase
            .from('accounts')
            .select('id, code, name')
            .eq('id', accountId)
            .single();

          if (accountDataRaw) {
            const assetName = formData.assetName || currentAsset?.name || 'Aset';
            const purchaseDate = formData.purchaseDate || new Date();

            const journalResult = await createAssetPurchaseJournal({
              assetId: id,
              purchaseDate: purchaseDate,
              amount: newPrice,
              assetAccountId: accountDataRaw.id,
              assetAccountCode: accountDataRaw.code || '',
              assetAccountName: accountDataRaw.name,
              assetName: assetName,
              paymentMethod: formData.source || 'cash',
              branchId: currentBranch.id,
            });

            if (journalResult.success) {
              console.log('✅ New asset purchase journal created:', journalResult.journalId);
            } else {
              console.warn('⚠️ Failed to create new asset journal:', journalResult.error);
            }
          }
        }
      }

      // ============================================================================
      // 3. UPDATE ASSET DATA
      // ============================================================================
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
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
    },
  });
}

// Delete asset
export function useDeleteAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // ============================================================================
      // 1. VOID RELATED JOURNAL ENTRIES FIRST
      // This ensures proper accounting reversal (kas/modal back to original)
      // ============================================================================
      const { data: journals, error: journalQueryError } = await supabase
        .from('journal_entries')
        .select('id')
        .eq('reference_id', id)
        .eq('is_voided', false);

      if (journalQueryError) {
        console.warn('⚠️ Failed to query related journals:', journalQueryError.message);
      } else if (journals && journals.length > 0) {
        for (const journal of journals) {
          const voidResult = await voidJournalEntry(journal.id, 'Aset dihapus');
          if (voidResult.success) {
            console.log(`✅ Voided journal ${journal.id} for asset ${id}`);
          } else {
            console.warn(`⚠️ Failed to void journal ${journal.id}:`, voidResult.error);
          }
        }
        console.log(`✅ Voided ${journals.length} journal(s) for asset ${id}`);
      }

      // ============================================================================
      // 2. DELETE THE ASSET
      // ============================================================================
      const { error } = await supabase
        .from('assets')
        .delete()
        .eq('id', id);

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
// DEPRECIATION ACCOUNTING VIA JOURNAL
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

      // Get asset details
      // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
      const { data: assetRaw, error: assetError } = await supabase
        .from('assets')
        .select('*')
        .eq('id', assetId)
        .order('id').limit(1);
      const asset = Array.isArray(assetRaw) ? assetRaw[0] : assetRaw;

      if (assetError || !asset) {
        throw new Error('Asset not found');
      }

      // ============================================================================
      // DEPRECIATION VIA JOURNAL - tidak update balance langsung
      // ============================================================================
      const journalResult = await createDepreciationJournal({
        assetId,
        depreciationDate: new Date(),
        amount: depreciationAmount,
        assetName: asset.asset_name || asset.name,
        period,
        branchId: currentBranch.id,
      });

      if (!journalResult.success) {
        throw new Error(journalResult.error || 'Gagal membuat jurnal penyusutan');
      }

      console.log('✅ Depreciation journal auto-generated:', journalResult.journalId);

      // Update asset current value
      const newCurrentValue = Math.max(0, (asset.current_value || asset.purchase_price) - depreciationAmount);
      await supabase
        .from('assets')
        .update({ current_value: newCurrentValue })
        .eq('id', assetId);

      // Record in cash_history for audit trail (MONITORING ONLY)
      try {
        await supabase
          .from('cash_history')
          .insert({
            account_id: null, // No direct account update
            type: 'penyusutan',
            amount: depreciationAmount,
            description: `Penyusutan ${asset.asset_name} periode ${period}`,
            reference_id: assetId,
            reference_name: `Aset ${asset.asset_code || asset.asset_name}`,
            branch_id: currentBranch.id,
            source_type: 'depreciation',
          });
      } catch (historyError) {
        console.warn('cash_history recording failed (non-critical):', historyError);
      }

      console.log('✅ Depreciation accounting created:', {
        asset: asset.asset_name,
        amount: depreciationAmount,
        newCurrentValue,
        period,
        journalId: journalResult.journalId
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
