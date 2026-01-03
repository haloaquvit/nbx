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

// Create zakat record
export function useCreateZakat() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formData: ZakatFormData) => {
      const id = `ZAKAT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const { error } = await supabase
        .from('zakat_records')
        .insert({
          id,
          type: formData.type,
          category: formData.category,
          title: formData.title,
          description: formData.description,
          recipient: formData.recipient,
          recipient_type: formData.recipientType,
          amount: formData.amount,
          nishab_amount: formData.nishabAmount,
          percentage_rate: formData.percentageRate,
          payment_date: formData.paymentDate.toISOString().split('T')[0],
          payment_account_id: formData.paymentAccountId,
          payment_method: formData.paymentMethod,
          status: 'paid', // Default to paid
          receipt_number: formData.receiptNumber,
          calculation_basis: formData.calculationBasis,
          calculation_notes: formData.calculationNotes,
          is_anonymous: formData.isAnonymous,
          notes: formData.notes,
          attachment_url: formData.attachmentUrl,
          hijri_year: formData.hijriYear,
          hijri_month: formData.hijriMonth,
        });

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zakat'] });
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

// Update zakat record
export function useUpdateZakat() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, formData }: { id: string; formData: Partial<ZakatFormData> }) => {
      const updateData: any = {};

      if (formData.type) updateData.type = formData.type;
      if (formData.category) updateData.category = formData.category;
      if (formData.title) updateData.title = formData.title;
      if (formData.description !== undefined) updateData.description = formData.description;
      if (formData.recipient !== undefined) updateData.recipient = formData.recipient;
      if (formData.recipientType !== undefined) updateData.recipient_type = formData.recipientType;
      if (formData.amount !== undefined) updateData.amount = formData.amount;
      if (formData.nishabAmount !== undefined) updateData.nishab_amount = formData.nishabAmount;
      if (formData.percentageRate !== undefined) updateData.percentage_rate = formData.percentageRate;
      if (formData.paymentDate) updateData.payment_date = formData.paymentDate.toISOString().split('T')[0];
      if (formData.paymentAccountId !== undefined) updateData.payment_account_id = formData.paymentAccountId;
      if (formData.paymentMethod !== undefined) updateData.payment_method = formData.paymentMethod;
      if (formData.receiptNumber !== undefined) updateData.receipt_number = formData.receiptNumber;
      if (formData.calculationBasis !== undefined) updateData.calculation_basis = formData.calculationBasis;
      if (formData.calculationNotes !== undefined) updateData.calculation_notes = formData.calculationNotes;
      if (formData.isAnonymous !== undefined) updateData.is_anonymous = formData.isAnonymous;
      if (formData.notes !== undefined) updateData.notes = formData.notes;
      if (formData.attachmentUrl !== undefined) updateData.attachment_url = formData.attachmentUrl;
      if (formData.hijriYear !== undefined) updateData.hijri_year = formData.hijriYear;
      if (formData.hijriMonth !== undefined) updateData.hijri_month = formData.hijriMonth;

      const { error } = await supabase
        .from('zakat_records')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zakat'] });
    },
  });
}

// Delete zakat record
export function useDeleteZakat() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('zakat_records')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zakat'] });
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
