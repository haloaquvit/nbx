import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ZakatRecord, ZakatFormData, ZakatSummary } from '@/types/zakat';

// Fetch all zakat records
export function useZakat() {
  return useQuery({
    queryKey: ['zakat'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('zakat_records')
        .select('*')
        .order('payment_date', { ascending: false });

      if (error) throw error;

      return (data || []).map((zakat: any) => ({
        id: zakat.id,
        type: zakat.type,
        category: zakat.category,
        title: zakat.title,
        description: zakat.description,
        recipient: zakat.recipient,
        recipientType: zakat.recipient_type,
        amount: zakat.amount,
        nishabAmount: zakat.nishab_amount,
        percentageRate: zakat.percentage_rate,
        paymentDate: new Date(zakat.payment_date),
        paymentAccountId: zakat.payment_account_id,
        paymentMethod: zakat.payment_method,
        status: zakat.status,
        journalEntryId: zakat.journal_entry_id,
        receiptNumber: zakat.receipt_number,
        calculationBasis: zakat.calculation_basis,
        calculationNotes: zakat.calculation_notes,
        isAnonymous: zakat.is_anonymous,
        notes: zakat.notes,
        attachmentUrl: zakat.attachment_url,
        hijriYear: zakat.hijri_year,
        hijriMonth: zakat.hijri_month,
        createdBy: zakat.created_by,
        createdAt: new Date(zakat.created_at),
        updatedAt: new Date(zakat.updated_at),
      })) as ZakatRecord[];
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

// Get zakat summary
export function useZakatSummary() {
  return useQuery({
    queryKey: ['zakat', 'summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('zakat_records')
        .select('*')
        .eq('status', 'paid');

      if (error) throw error;

      const records = data || [];
      const now = new Date();
      const thisYear = new Date(now.getFullYear(), 0, 1);
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const totalZakatPaid = records
        .filter(r => r.category === 'zakat')
        .reduce((sum, r) => sum + r.amount, 0);

      const totalCharityPaid = records
        .filter(r => r.category === 'charity')
        .reduce((sum, r) => sum + r.amount, 0);

      const totalPaidThisYear = records
        .filter(r => new Date(r.payment_date) >= thisYear)
        .reduce((sum, r) => sum + r.amount, 0);

      const totalPaidThisMonth = records
        .filter(r => new Date(r.payment_date) >= thisMonth)
        .reduce((sum, r) => sum + r.amount, 0);

      // Group by type
      const byType = records.reduce((acc: any[], record: any) => {
        const existing = acc.find(t => t.type === record.type);
        if (existing) {
          existing.count += 1;
          existing.totalAmount += record.amount;
        } else {
          acc.push({
            type: record.type,
            count: 1,
            totalAmount: record.amount,
          });
        }
        return acc;
      }, []);

      // Group by recipient
      const byRecipient = records
        .filter(r => r.recipient)
        .reduce((acc: any[], record: any) => {
          const existing = acc.find(t => t.recipient === record.recipient);
          if (existing) {
            existing.count += 1;
            existing.totalAmount += record.amount;
          } else {
            acc.push({
              recipient: record.recipient,
              count: 1,
              totalAmount: record.amount,
            });
          }
          return acc;
        }, []);

      // Get pending
      const { data: pendingData } = await supabase
        .from('zakat_records')
        .select('amount, category')
        .eq('status', 'pending');

      const pendingZakat = (pendingData || [])
        .filter(r => r.category === 'zakat')
        .reduce((sum, r) => sum + r.amount, 0);

      const pendingCharity = (pendingData || [])
        .filter(r => r.category === 'charity')
        .reduce((sum, r) => sum + r.amount, 0);

      return {
        totalZakatPaid,
        totalCharityPaid,
        totalPaidThisYear,
        totalPaidThisMonth,
        byType,
        byRecipient,
        pendingZakat,
        pendingCharity,
      } as ZakatSummary;
    },
  });
}

import { useAuth } from './useAuth';
import { useBranch } from '@/contexts/BranchContext';

// Helper to map camelCase (App) to snake_case (DB) for JSONB RPC data
const mapToDb = (formData: Partial<ZakatFormData>) => {
  const mapping: any = {
    type: formData.type,
    category: formData.category,
    title: formData.title,
    description: formData.description,
    recipient: formData.recipient,
    recipient_type: formData.recipientType,
    amount: formData.amount,
    nishab_amount: formData.nishabAmount,
    percentage_rate: formData.percentageRate,
    payment_account_id: formData.paymentAccountId,
    payment_method: formData.paymentMethod,
    receipt_number: formData.receiptNumber,
    calculation_basis: formData.calculationBasis,
    calculation_notes: formData.calculationNotes,
    is_anonymous: formData.isAnonymous,
    notes: formData.notes,
    attachment_url: formData.attachmentUrl,
    hijri_year: formData.hijriYear,
    hijri_month: formData.hijriMonth,
  };

  if (formData.paymentDate) {
    mapping.payment_date = formData.paymentDate.toISOString().split('T')[0];
  }

  // Remove undefined keys
  Object.keys(mapping).forEach(key => mapping[key] === undefined && delete mapping[key]);
  return mapping;
};

// Create or Update zakat record - Atomic via RPC
export function useUpsertZakat() {
  const queryClient = useQueryClient();
  const { currentBranch } = useBranch();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, formData }: { id?: string; formData: ZakatFormData | Partial<ZakatFormData> }) => {
      if (!currentBranch?.id) throw new Error('Branch ID is required');

      console.log('🕌 Upserting Zakat via Atomic RPC...', formData.title);

      const { data: rpcResultRaw, error: rpcError } = await supabase
        .rpc('upsert_zakat_record_atomic', {
          p_branch_id: currentBranch.id,
          p_zakat_id: id || null,
          p_data: mapToDb(formData),
          p_user_id: user?.id || null
        });

      if (rpcError) {
        console.error('❌ RPC Error:', rpcError);
        throw new Error(`Gagal menyimpan zakat: ${rpcError.message}`);
      }

      const rpcResult = Array.isArray(rpcResultRaw) ? rpcResultRaw[0] : rpcResultRaw;
      if (!rpcResult?.success) {
        throw new Error(rpcResult?.error_message || 'Gagal menyimpan zakat');
      }

      console.log('✅ Zakat Upserted via RPC:', rpcResult.zakat_id, 'Journal:', rpcResult.journal_id);
      return rpcResult.zakat_id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zakat'] });
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

// Keep compatible exports but redirect to the new upsert logic
export function useCreateZakat() {
  const upsert = useUpsertZakat();
  return {
    ...upsert,
    mutate: (formData: ZakatFormData) => upsert.mutate({ formData }),
    mutateAsync: (formData: ZakatFormData) => upsert.mutateAsync({ formData }),
  };
}

export function useUpdateZakat() {
  const upsert = useUpsertZakat();
  return upsert;
}

// Delete zakat record - Atomic via RPC
export function useDeleteZakat() {
  const queryClient = useQueryClient();
  const { currentBranch } = useBranch();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!currentBranch?.id) throw new Error('Branch ID is required');

      console.log('🗑️ Deleting Zakat via RPC...', id);

      const { data: rpcResultRaw, error: rpcError } = await supabase
        .rpc('delete_zakat_record_atomic', {
          p_branch_id: currentBranch.id,
          p_zakat_id: id
        });

      if (rpcError) {
        console.error('❌ RPC Error:', rpcError);
        throw new Error(`Gagal menghapus zakat: ${rpcError.message}`);
      }

      const rpcResult = Array.isArray(rpcResultRaw) ? rpcResultRaw[0] : rpcResultRaw;
      if (!rpcResult?.success) {
        throw new Error(rpcResult?.error_message || 'Gagal menghapus zakat');
      }

      console.log('✅ Zakat Deleted via RPC');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zakat'] });
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}


// Get current nishab values
export function useNishabValues() {
  return useQuery({
    queryKey: ['nishab'],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_current_nishab');

      if (error) throw error;
      return data[0] || {
        gold_price: 1100000,
        silver_price: 15000,
        gold_nishab: 85,
        silver_nishab: 595,
        zakat_rate: 2.5,
        gold_nishab_value: 93500000,
        silver_nishab_value: 8925000,
      };
    },
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
  });
}

// Calculate zakat amount
export function useCalculateZakat() {
  return useMutation({
    mutationFn: async ({ assetValue, nishabType }: { assetValue: number; nishabType: 'gold' | 'silver' }) => {
      const { data, error } = await supabase
        .rpc('calculate_zakat_amount', {
          p_asset_value: assetValue,
          p_nishab_type: nishabType,
        });

      if (error) throw error;
      return data[0] || {
        asset_value: assetValue,
        nishab_value: 0,
        is_obligatory: false,
        zakat_amount: 0,
        rate: 2.5,
      };
    },
  });
}

// Update nishab reference
export function useUpdateNishab() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      goldPrice,
      silverPrice,
      effectiveDate,
      notes,
    }: {
      goldPrice: number;
      silverPrice: number;
      effectiveDate: Date;
      notes?: string;
    }) => {
      const { error } = await supabase
        .from('nishab_reference')
        .insert({
          gold_price: goldPrice,
          silver_price: silverPrice,
          effective_date: effectiveDate.toISOString().split('T')[0],
          notes,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nishab'] });
    },
  });
}
