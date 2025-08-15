import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Quotation, QuotationStatus } from '@/types/quotation'
import { supabase } from '@/integrations/supabase/client'

// Helper to map from DB (snake_case) to App (camelCase)
const fromDb = (dbQuotation: any): Quotation => ({
  id: dbQuotation.id,
  customerId: dbQuotation.customer_id,
  customerName: dbQuotation.customer_name,
  preparedBy: dbQuotation.prepared_by,
  items: dbQuotation.items || [],
  total: dbQuotation.total,
  status: dbQuotation.status,
  createdAt: new Date(dbQuotation.created_at),
  validUntil: new Date(dbQuotation.valid_until),
  transactionId: dbQuotation.transaction_id,
});

// Helper to map from App (camelCase) to DB (snake_case)
const toDb = (appQuotation: Partial<Omit<Quotation, 'id' | 'createdAt'>>) => ({
  customer_id: appQuotation.customerId,
  customer_name: appQuotation.customerName,
  prepared_by: appQuotation.preparedBy,
  items: appQuotation.items,
  total: appQuotation.total,
  status: appQuotation.status,
  valid_until: appQuotation.validUntil,
  transaction_id: appQuotation.transactionId,
});

export const useQuotations = () => {
  const queryClient = useQueryClient();

  const { data: quotations, isLoading } = useQuery<Quotation[]>({
    queryKey: ['quotations'],
    queryFn: async () => {
      const { data, error } = await supabase.from('quotations').select('*').order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data ? data.map(fromDb) : [];
    }
  });

  const addQuotation = useMutation({
    mutationFn: async (newQuotationData: Omit<Quotation, 'id' | 'createdAt'>): Promise<Quotation> => {
      const dbData = toDb(newQuotationData);
      const { data, error } = await supabase
        .from('quotations')
        .insert({ ...dbData, id: `Q-${Date.now()}` })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return fromDb(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
    }
  });

  const updateQuotation = useMutation({
    mutationFn: async ({ quotationId, newData }: { quotationId: string, newData: Partial<Quotation> }): Promise<Quotation> => {
      const dbData = toDb(newData);
      const { data, error } = await supabase
        .from('quotations')
        .update(dbData)
        .eq('id', quotationId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return fromDb(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: ['quotation', data.id] });
    }
  });

  return { quotations, isLoading, addQuotation, updateQuotation };
}

export const useQuotationById = (id: string) => {
  const { data: quotation, isLoading } = useQuery<Quotation | undefined>({
    queryKey: ['quotation', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('quotations').select('*').eq('id', id).single();
      if (error) return undefined;
      return fromDb(data);
    },
    enabled: !!id,
  });
  return { quotation, isLoading };
}