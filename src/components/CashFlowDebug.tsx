import { useState } from "react";
import { useCashFlow } from "@/hooks/useCashFlow";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfDay, endOfDay } from "date-fns";

interface DebugData {
  cashFlowToday: any[]
  transactionsToday: any[]
  accountsData: any[]
  kasKecilId: string | null
}

export function CashFlowDebug() {
  const { cashHistory, isLoading } = useCashFlow();
  const [debugData, setDebugData] = useState<DebugData | null>(null);
  const [isLoadingDebug, setIsLoadingDebug] = useState(false);

  const fetchDebugData = async () => {
    setIsLoadingDebug(true);
    try {
      const today = new Date();
      const startToday = startOfDay(today);
      const endToday = endOfDay(today);

      // Get accounts
      const { data: accounts } = await supabase
        .from('accounts')
        .select('*')
        .order('name');

      const kasKecilAccount = accounts?.find(acc => acc.name.toLowerCase().includes('kas kecil'));

      // Get today's cash flow
      const { data: cashFlow } = await supabase
        .from('cash_history')
        .select('*')
        .gte('created_at', startToday.toISOString())
        .lte('created_at', endToday.toISOString())
        .order('created_at', { ascending: false });

      // Get today's transactions
      const { data: transactions } = await supabase
        .from('transactions')
        .select('*')
        .gte('order_date', startToday.toISOString())
        .lte('order_date', endToday.toISOString())
        .order('created_at', { ascending: false });

      setDebugData({
        cashFlowToday: cashFlow || [],
        transactionsToday: transactions || [],
        accountsData: accounts || [],
        kasKecilId: kasKecilAccount?.id || null
      });
    } catch (error) {
      console.error('Debug fetch error:', error);
    } finally {
      setIsLoadingDebug(false);
    }
  };

  const kasKecilCashFlow = debugData?.cashFlowToday.filter(cf => 
    cf.account_id === debugData.kasKecilId
  ) || [];

  const kasKecilTotal = kasKecilCashFlow.reduce((sum, cf) => {
    return cf.transaction_type === 'income' ? sum + cf.amount : sum - cf.amount;
  }, 0);

  const transactionsWithKasKecil = debugData?.transactionsToday.filter(t => 
    t.payment_account_id === debugData.kasKecilId
  ) || [];

  const transactionTotal = transactionsWithKasKecil.reduce((sum, t) => sum + (t.paid_amount || 0), 0);

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Debug Cash Flow Kas Kecil Hari Ini</CardTitle>
          <Button onClick={fetchDebugData} disabled={isLoadingDebug}>
            {isLoadingDebug ? 'Loading...' : 'Refresh Data'}
          </Button>
        </CardHeader>
        <CardContent>
          {debugData && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold text-blue-600">
                      {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(kasKecilTotal)}
                    </div>
                    <p className="text-sm text-muted-foreground">Total dari Cash History</p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold text-green-600">
                      {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(transactionTotal)}
                    </div>
                    <p className="text-sm text-muted-foreground">Total dari Transactions</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold text-red-600">
                      {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(Math.abs(kasKecilTotal - transactionTotal))}
                    </div>
                    <p className="text-sm text-muted-foreground">Selisih (Expected: Rp 125)</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Cash History Kas Kecil Hari Ini ({kasKecilCashFlow.length} records)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {kasKecilCashFlow.map((cf, index) => (
                        <div key={index} className="flex justify-between items-center p-2 border rounded">
                          <div className="flex-1">
                            <div className="font-semibold">{cf.description}</div>
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(cf.created_at), 'HH:mm:ss')} - {cf.transaction_type}
                            </div>
                          </div>
                          <div className={`font-bold ${cf.transaction_type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                            {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(cf.amount)}
                          </div>
                        </div>
                      ))}
                      {kasKecilCashFlow.length === 0 && (
                        <p className="text-center text-muted-foreground py-4">Tidak ada cash flow hari ini</p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Transactions Kas Kecil Hari Ini ({transactionsWithKasKecil.length} records)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {transactionsWithKasKecil.map((t, index) => (
                        <div key={index} className="flex justify-between items-center p-2 border rounded">
                          <div className="flex-1">
                            <div className="font-semibold">{t.customer_name}</div>
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(t.order_date), 'HH:mm:ss')} - {t.payment_status}
                            </div>
                          </div>
                          <div className="font-bold text-green-600">
                            {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(t.paid_amount || 0)}
                          </div>
                        </div>
                      ))}
                      {transactionsWithKasKecil.length === 0 && (
                        <p className="text-center text-muted-foreground py-4">Tidak ada transaksi hari ini</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      <div className="p-4 border rounded-lg">
        <h3 className="font-bold mb-4">Debug Cash History Data (Latest 10)</h3>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {(cashHistory || []).slice(0, 10).map((item, index) => (
            <div key={item.id} className="p-3 border rounded text-sm">
              <div><strong>#{index + 1} ID:</strong> {item.id}</div>
              <div><strong>Type:</strong> <Badge variant="outline">{item.type}</Badge></div>
              <div><strong>Amount:</strong> {item.amount}</div>
              <div><strong>Description:</strong> {item.description}</div>
              <div><strong>Account ID:</strong> {item.account_id}</div>
              <div><strong>Account Name:</strong> {item.account_name || 'NOT FOUND'}</div>
              <div><strong>Accounts Join:</strong> {JSON.stringify(item.accounts || 'NO JOIN DATA')}</div>
              <div><strong>Created:</strong> {new Date(item.created_at).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}