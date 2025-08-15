import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfDay, endOfDay, format } from 'date-fns';

export interface DailyReportData {
  totalSales: number;
  cashIn: number;
  cashOut: number;
  netCash: number;
  salesSummary: {
    totalCash: number;
    totalCredit: number;
    totalSales: number;
    transactionCount: number;
  };
  cashFlowByAccount: Array<{
    accountName: string;
    cashIn: number;
    cashOut: number;
  }>;
  transactions: Array<{
    id: string;
    orderNumber: string;
    time: string;
    customerName: string;
    total: number;
    paidAmount: number;
    remaining: number;
    paymentStatus: string;
    cashierName: string;
  }>;
}

export function useDailyReport(selectedDate: Date) {
  const {
    data: dailyReport,
    isLoading,
    error
  } = useQuery({
    queryKey: ['dailyReport', format(selectedDate, 'yyyy-MM-dd')],
    queryFn: async (): Promise<DailyReportData> => {
      const startDate = startOfDay(selectedDate);
      const endDate = endOfDay(selectedDate);
      
      // Fetch transactions for the selected date
      const { data: transactions, error: transactionError } = await supabase
        .from('transactions')
        .select('*')
        .gte('order_date', startDate.toISOString())
        .lte('order_date', endDate.toISOString())
        .order('created_at', { ascending: false });

      if (transactionError) {
        throw new Error(`Failed to fetch transactions: ${transactionError.message}`);
      }

      // Fetch cash flow for the selected date
      const { data: cashFlow, error: cashFlowError } = await supabase
        .from('cash_history')
        .select(`
          *,
          accounts!account_id (
            name
          )
        `)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .order('created_at', { ascending: false });

      if (cashFlowError) {
        throw new Error(`Failed to fetch cash flow: ${cashFlowError.message}`);
      }

      // Calculate totals
      const totalSales = transactions?.reduce((sum, t) => sum + (t.total || 0), 0) || 0;
      const totalCash = transactions?.reduce((sum, t) => sum + (t.paid_amount || 0), 0) || 0;
      const totalCredit = totalSales - totalCash;
      const transactionCount = transactions?.length || 0;

      // Calculate cash in/out from cash flow
      const cashIn = cashFlow?.reduce((sum, cf) => sum + (cf.transaction_type === 'income' ? (cf.amount || 0) : 0), 0) || 0;
      const cashOut = cashFlow?.reduce((sum, cf) => sum + (cf.transaction_type === 'expense' ? (cf.amount || 0) : 0), 0) || 0;
      const netCash = cashIn - cashOut;

      // Group cash flow by account
      const cashFlowByAccount = cashFlow?.reduce((acc, cf) => {
        const accountName = cf.account_name || cf.accounts?.name || 'Unknown Account';
        const existing = acc.find(item => item.accountName === accountName);
        
        if (existing) {
          if (cf.transaction_type === 'income') {
            existing.cashIn += cf.amount || 0;
          } else {
            existing.cashOut += cf.amount || 0;
          }
        } else {
          acc.push({
            accountName,
            cashIn: cf.transaction_type === 'income' ? (cf.amount || 0) : 0,
            cashOut: cf.transaction_type === 'expense' ? (cf.amount || 0) : 0,
          });
        }
        
        return acc;
      }, [] as Array<{ accountName: string; cashIn: number; cashOut: number; }>) || [];

      // Format transaction data for display
      const formattedTransactions = transactions?.map(t => ({
        id: t.id,
        orderNumber: t.id,
        time: format(new Date(t.order_date), 'HH:mm'),
        customerName: t.customer_name || 'Unknown',
        total: t.total || 0,
        paidAmount: t.paid_amount || 0,
        remaining: (t.total || 0) - (t.paid_amount || 0),
        paymentStatus: t.payment_status || 'Belum Lunas',
        cashierName: t.cashier_name || 'Unknown',
      })) || [];

      return {
        totalSales,
        cashIn,
        cashOut,
        netCash,
        salesSummary: {
          totalCash,
          totalCredit,
          totalSales,
          transactionCount,
        },
        cashFlowByAccount,
        transactions: formattedTransactions,
      };
    }
  });

  return {
    data: dailyReport,
    isLoading,
    error
  };
}