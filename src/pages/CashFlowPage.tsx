import { useCashFlow } from "@/hooks/useCashFlow";
import { CashFlowTable } from "@/components/CashFlowTable";
import { AccountBalanceTable } from "@/components/AccountBalanceTable";
import { DateRangeReportPDF } from "@/components/DateRangeReportPDF";
import { useCashBalance } from "@/hooks/useCashBalance";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, DollarSign } from "lucide-react";

export function CashFlowPage() {
  const { cashHistory, isLoading } = useCashFlow();
  const { cashBalance, isLoading: isBalanceLoading } = useCashBalance();

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Buku Besar</h1>
          <p className="text-muted-foreground">
            Pantau semua aktivitas kas masuk dan keluar
          </p>
        </div>
        
        {/* PDF Export Button with Date Picker */}
        {cashHistory && (
          <DateRangeReportPDF 
            cashHistory={cashHistory}
          />
        )}
      </div>

      {/* Cash Balance Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo Kas Saat Ini</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {isBalanceLoading ? "..." : new Intl.NumberFormat("id-ID", {
                style: "currency",
                currency: "IDR",
                minimumFractionDigits: 0,
              }).format(cashBalance?.currentBalance || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Total saldo semua akun
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo Sebelumnya</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600">
              {isBalanceLoading ? "..." : new Intl.NumberFormat("id-ID", {
                style: "currency",
                currency: "IDR",
                minimumFractionDigits: 0,
              }).format(cashBalance?.previousBalance || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Saldo sebelum hari ini
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Kas Masuk Hari Ini</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {isBalanceLoading ? "..." : new Intl.NumberFormat("id-ID", {
                style: "currency",
                currency: "IDR",
                minimumFractionDigits: 0,
              }).format(cashBalance?.todayIncome || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Total pemasukan hari ini
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Kas Keluar Hari Ini</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {isBalanceLoading ? "..." : new Intl.NumberFormat("id-ID", {
                style: "currency",
                currency: "IDR",
                minimumFractionDigits: 0,
              }).format(cashBalance?.todayExpense || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Total pengeluaran hari ini
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Net Cash Flow Today */}
      {cashBalance && (
        <Card className={`mb-6 ${cashBalance.todayNet >= 0 ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 ${cashBalance.todayNet >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {cashBalance.todayNet >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
              Arus Kas Bersih Hari Ini
            </CardTitle>
            <CardDescription>
              Selisih antara kas masuk dan kas keluar hari ini
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${cashBalance.todayNet >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {new Intl.NumberFormat("id-ID", {
                style: "currency",
                currency: "IDR",
                minimumFractionDigits: 0,
              }).format(cashBalance.todayNet)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Account Balance Details */}
      <div className="mb-6">
        <AccountBalanceTable 
          data={cashBalance?.accountBalances || []} 
          isLoading={isBalanceLoading} 
        />
      </div>
      
      <CashFlowTable data={cashHistory || []} isLoading={isLoading} />
    </div>
  );
}

export default CashFlowPage;