"use client"

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  TrendingUp,
  DollarSign,
  BarChart3,
  FileText,
  Calendar,
  Download,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Building,
  CreditCard,
  Banknote,
  Building2
} from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { id } from 'date-fns/locale/id';
import {
  generateBalanceSheet,
  generateIncomeStatement,
  generateCashFlowStatement,
  type BalanceSheetData,
  type IncomeStatementData,
  type CashFlowStatementData,
  formatCurrency
} from '@/utils/financialStatementsUtils';
import { useToast } from '@/hooks/use-toast';
import { downloadCashFlowPDF, PrinterInfo as CashFlowPrinterInfo } from '@/components/CashFlowPDF';
import { downloadBalanceSheetPDF, PrinterInfo as BalanceSheetPrinterInfo } from '@/components/BalanceSheetPDF';
import { downloadIncomeStatementPDF, PrinterInfo } from '@/components/IncomeStatementPDF';
import { useBranch } from '@/contexts/BranchContext';
import { useAuth } from '@/hooks/useAuth';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const FinancialReportsPage = () => {
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheetData | null>(null);
  const [incomeStatement, setIncomeStatement] = useState<IncomeStatementData | null>(null);
  const [cashFlowStatement, setCashFlowStatement] = useState<CashFlowStatementData | null>(null);

  const [loading, setLoading] = useState({ balanceSheet: false, incomeStatement: false, cashFlow: false });

  // Default to current month - all reports use same date range
  const [periodFrom, setPeriodFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [periodTo, setPeriodTo] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

  const { toast } = useToast();

  // Auth context for printer info
  const { user } = useAuth();

  // Branch context
  const { currentBranch, availableBranches, canAccessAllBranches } = useBranch();
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');

  // Sync selectedBranchId when currentBranch changes (after loading)
  useEffect(() => {
    if (currentBranch?.id && !selectedBranchId) {
      setSelectedBranchId(currentBranch.id);
    }
  }, [currentBranch?.id]);

  const handleGenerateBalanceSheet = async () => {
    if (!selectedBranchId) {
      toast({
        variant: 'destructive',
        title: 'Gagal',
        description: 'Silakan pilih cabang terlebih dahulu'
      });
      return;
    }
    setLoading(prev => ({ ...prev, balanceSheet: true }));
    try {
      // Use periodTo as the balance sheet date (as of date)
      const data = await generateBalanceSheet(new Date(periodTo), selectedBranchId);
      setBalanceSheet(data);
      toast({
        title: 'Sukses',
        description: `Neraca per ${format(new Date(periodTo), 'd MMMM yyyy', { locale: id })} berhasil dibuat`
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Gagal',
        description: error instanceof Error ? error.message : 'Terjadi kesalahan'
      });
    } finally {
      setLoading(prev => ({ ...prev, balanceSheet: false }));
    }
  };

  const handleGenerateIncomeStatement = async () => {
    if (!selectedBranchId) {
      toast({
        variant: 'destructive',
        title: 'Gagal',
        description: 'Silakan pilih cabang terlebih dahulu'
      });
      return;
    }
    setLoading(prev => ({ ...prev, incomeStatement: true }));
    try {
      const data = await generateIncomeStatement(new Date(periodFrom), new Date(periodTo), selectedBranchId);
      setIncomeStatement(data);
      toast({
        title: 'Sukses',
        description: 'Laporan Laba Rugi berhasil dibuat dari data transaksi'
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Gagal',
        description: error instanceof Error ? error.message : 'Terjadi kesalahan'
      });
    } finally {
      setLoading(prev => ({ ...prev, incomeStatement: false }));
    }
  };

  const handleGenerateCashFlow = async () => {
    if (!selectedBranchId) {
      toast({
        variant: 'destructive',
        title: 'Gagal',
        description: 'Silakan pilih cabang terlebih dahulu'
      });
      return;
    }
    setLoading(prev => ({ ...prev, cashFlow: true }));
    try {
      const data = await generateCashFlowStatement(new Date(periodFrom), new Date(periodTo), selectedBranchId);
      setCashFlowStatement(data);
      toast({
        title: 'Sukses',
        description: 'Laporan Arus Kas berhasil dibuat dari cash history'
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Gagal',
        description: error instanceof Error ? error.message : 'Terjadi kesalahan'
      });
    } finally {
      setLoading(prev => ({ ...prev, cashFlow: false }));
    }
  };

  const loadPresetPeriod = (months: number) => {
    const endDate = new Date();
    const startDate = subMonths(startOfMonth(endDate), months - 1);
    setPeriodFrom(format(startDate, 'yyyy-MM-dd'));
    setPeriodTo(format(endOfMonth(endDate), 'yyyy-MM-dd'));
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold flex items-center justify-center gap-2">
          <BarChart3 className="h-8 w-8" />
          Laporan Keuangan
        </h1>
        <p className="text-muted-foreground">
          Laporan keuangan berdasarkan data real dari aplikasi Anda
        </p>
      </div>

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Pengaturan Periode</CardTitle>
          <CardDescription>
            Pilih cabang dan periode untuk laporan keuangan
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Branch Selector - ALWAYS show for debugging */}
          <div className="space-y-2">
            <Label htmlFor="branchSelect" className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Pilih Cabang untuk Laporan
            </Label>
            <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
              <SelectTrigger id="branchSelect">
                <SelectValue placeholder="Pilih cabang..." />
              </SelectTrigger>
              <SelectContent>
                {availableBranches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedBranchId && (
              <p className="text-xs text-muted-foreground">
                Branch ID: {selectedBranchId}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="periodFrom">Dari Tanggal</Label>
              <Input
                id="periodFrom"
                type="date"
                value={periodFrom}
                onChange={(e) => setPeriodFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="periodTo">Sampai Tanggal</Label>
              <Input
                id="periodTo"
                type="date"
                value={periodTo}
                onChange={(e) => setPeriodTo(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Neraca akan dibuat per tanggal ini
              </p>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => loadPresetPeriod(1)}>
              Bulan Ini
            </Button>
            <Button variant="outline" size="sm" onClick={() => loadPresetPeriod(3)}>
              3 Bulan
            </Button>
            <Button variant="outline" size="sm" onClick={() => loadPresetPeriod(6)}>
              6 Bulan
            </Button>
            <Button variant="outline" size="sm" onClick={() => loadPresetPeriod(12)}>
              1 Tahun
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Generate Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Button 
          size="lg" 
          className="h-16 gap-2"
          onClick={handleGenerateBalanceSheet}
          disabled={loading.balanceSheet}
        >
          {loading.balanceSheet ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Building className="h-5 w-5" />
          )}
          Generate Neraca
        </Button>
        
        <Button 
          size="lg" 
          className="h-16 gap-2"
          onClick={handleGenerateIncomeStatement}
          disabled={loading.incomeStatement}
        >
          {loading.incomeStatement ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <TrendingUp className="h-5 w-5" />
          )}
          Generate Laba Rugi
        </Button>
        
        <Button 
          size="lg" 
          className="h-16 gap-2"
          onClick={handleGenerateCashFlow}
          disabled={loading.cashFlow}
        >
          {loading.cashFlow ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Banknote className="h-5 w-5" />
          )}
          Generate Arus Kas
        </Button>
      </div>

      {/* Reports Tabs */}
      <Tabs defaultValue="balance-sheet" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="balance-sheet" className="gap-2">
            <Building className="h-4 w-4" />
            Neraca
          </TabsTrigger>
          <TabsTrigger value="income-statement" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            Laba Rugi
          </TabsTrigger>
          <TabsTrigger value="cash-flow" className="gap-2">
            <Banknote className="h-4 w-4" />
            Arus Kas
          </TabsTrigger>
        </TabsList>

        {/* Balance Sheet Tab */}
        <TabsContent value="balance-sheet" className="space-y-4">
          {balanceSheet ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Building className="h-5 w-5" />
                    NERACA (Balance Sheet)
                  </CardTitle>
                  <CardDescription>
                    Per {format(new Date(periodTo), 'd MMMM yyyy', { locale: id })}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {balanceSheet.isBalanced ? (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Seimbang
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Tidak Seimbang
                    </Badge>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const printerInfo: BalanceSheetPrinterInfo = {
                        name: user?.name || user?.email || 'Unknown User',
                        position: user?.role || undefined
                      };
                      downloadBalanceSheetPDF(balanceSheet, new Date(periodTo), currentBranch?.name || 'PT AQUVIT MANUFACTURE', printerInfo);
                    }}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export PDF
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Assets */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-blue-700 border-b pb-2">ASET</h3>
                    
                    {/* Current Assets */}
                    <div className="space-y-2">
                      <h4 className="font-medium text-gray-700">Aset Lancar:</h4>
                      {balanceSheet.assets.currentAssets.kasBank.map(item => (
                        <div key={item.accountId} className="flex justify-between pl-4">
                          <span className="text-sm">{item.accountName}</span>
                          <span className="text-sm font-mono">{item.formattedBalance}</span>
                        </div>
                      ))}
                      {balanceSheet.assets.currentAssets.piutangUsaha.map(item => (
                        <div key={item.accountId} className="flex justify-between pl-4">
                          <span className="text-sm">{item.accountName}</span>
                          <span className="text-sm font-mono">{item.formattedBalance}</span>
                        </div>
                      ))}
                      {balanceSheet.assets.currentAssets.piutangPajak?.map(item => (
                        <div key={item.accountId} className="flex justify-between pl-4">
                          <span className="text-sm">{item.accountName}</span>
                          <span className="text-sm font-mono">{item.formattedBalance}</span>
                        </div>
                      ))}
                      {balanceSheet.assets.currentAssets.persediaan.map(item => (
                        <div key={item.accountId} className="flex justify-between pl-4">
                          <span className="text-sm">{item.accountName}</span>
                          <span className="text-sm font-mono">{item.formattedBalance}</span>
                        </div>
                      ))}
                      {balanceSheet.assets.currentAssets.panjarKaryawan.map(item => (
                        <div key={item.accountId} className="flex justify-between pl-4">
                          <span className="text-sm">{item.accountName}</span>
                          <span className="text-sm font-mono">{item.formattedBalance}</span>
                        </div>
                      ))}
                      <div className="flex justify-between font-medium border-t pt-2">
                        <span>Total Aset Lancar</span>
                        <span className="font-mono">{formatCurrency(balanceSheet.assets.currentAssets.totalCurrentAssets)}</span>
                      </div>
                    </div>

                    {/* Fixed Assets */}
                    <div className="space-y-2">
                      <h4 className="font-medium text-gray-700">Aset Tetap:</h4>
                      {balanceSheet.assets.fixedAssets.peralatan.map(item => (
                        <div key={item.accountId} className="flex justify-between pl-4">
                          <span className="text-sm">{item.accountName}</span>
                          <span className="text-sm font-mono">{item.formattedBalance}</span>
                        </div>
                      ))}
                      {balanceSheet.assets.fixedAssets.akumulasiPenyusutan.map(item => (
                        <div key={item.accountId} className="flex justify-between pl-4">
                          <span className="text-sm">({item.accountName})</span>
                          <span className="text-sm font-mono">({item.formattedBalance})</span>
                        </div>
                      ))}
                      <div className="flex justify-between font-medium border-t pt-2">
                        <span>Total Aset Tetap</span>
                        <span className="font-mono">{formatCurrency(balanceSheet.assets.fixedAssets.totalFixedAssets)}</span>
                      </div>
                    </div>

                    <div className="flex justify-between font-bold text-lg border-t pt-4">
                      <span>TOTAL ASET</span>
                      <span className="font-mono">{formatCurrency(balanceSheet.assets.totalAssets)}</span>
                    </div>
                  </div>

                  {/* Liabilities & Equity */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-red-700 border-b pb-2">KEWAJIBAN & EKUITAS</h3>
                    
                    {/* Liabilities */}
                    <div className="space-y-2">
                      <h4 className="font-medium text-gray-700">Kewajiban Lancar:</h4>
                      {balanceSheet.liabilities.currentLiabilities.hutangUsaha.map(item => (
                        <div key={item.accountId} className="flex justify-between pl-4">
                          <span className="text-sm">{item.accountName}</span>
                          <span className="text-sm font-mono">{item.formattedBalance}</span>
                        </div>
                      ))}
                      {balanceSheet.liabilities.currentLiabilities.hutangBank.map(item => (
                        <div key={item.accountId} className="flex justify-between pl-4">
                          <span className="text-sm">{item.accountName}</span>
                          <span className="text-sm font-mono">{item.formattedBalance}</span>
                        </div>
                      ))}
                      {balanceSheet.liabilities.currentLiabilities.hutangKartuKredit.map(item => (
                        <div key={item.accountId} className="flex justify-between pl-4">
                          <span className="text-sm">{item.accountName}</span>
                          <span className="text-sm font-mono">{item.formattedBalance}</span>
                        </div>
                      ))}
                      {balanceSheet.liabilities.currentLiabilities.hutangLain.map(item => (
                        <div key={item.accountId} className="flex justify-between pl-4">
                          <span className="text-sm">{item.accountName}</span>
                          <span className="text-sm font-mono">{item.formattedBalance}</span>
                        </div>
                      ))}
                      {balanceSheet.liabilities.currentLiabilities.hutangGaji.map(item => (
                        <div key={item.accountId} className="flex justify-between pl-4">
                          <span className="text-sm">{item.accountName}</span>
                          <span className="text-sm font-mono">{item.formattedBalance}</span>
                        </div>
                      ))}
                      {balanceSheet.liabilities.currentLiabilities.hutangPajak.map(item => (
                        <div key={item.accountId} className="flex justify-between pl-4">
                          <span className="text-sm">{item.accountName}</span>
                          <span className="text-sm font-mono">{item.formattedBalance}</span>
                        </div>
                      ))}
                      <div className="flex justify-between font-medium border-t pt-2">
                        <span>Total Kewajiban</span>
                        <span className="font-mono">{formatCurrency(balanceSheet.liabilities.totalLiabilities)}</span>
                      </div>
                    </div>

                    {/* Equity */}
                    <div className="space-y-2">
                      <h4 className="font-medium text-gray-700">Ekuitas:</h4>
                      {balanceSheet.equity.modalPemilik.map(item => (
                        <div key={item.accountId} className="flex justify-between pl-4">
                          <span className="text-sm">{item.accountName}</span>
                          <span className="text-sm font-mono">{item.formattedBalance}</span>
                        </div>
                      ))}
                      <div className="flex justify-between pl-4">
                        <span className="text-sm">Laba Rugi Ditahan</span>
                        <span className="text-sm font-mono">{formatCurrency(balanceSheet.equity.labaRugiDitahan)}</span>
                      </div>
                      <div className="flex justify-between font-medium border-t pt-2">
                        <span>Total Ekuitas</span>
                        <span className="font-mono">{formatCurrency(balanceSheet.equity.totalEquity)}</span>
                      </div>
                    </div>

                    <div className="flex justify-between font-bold text-lg border-t pt-4">
                      <span>TOTAL KEWAJIBAN & EKUITAS</span>
                      <span className="font-mono">{formatCurrency(balanceSheet.totalLiabilitiesEquity)}</span>
                    </div>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground text-center pt-4 border-t">
                  Dibuat pada: {format(balanceSheet.generatedAt, 'dd MMM yyyy HH:mm', { locale: id })} • 
                  Data dari: Accounts, Transactions, Materials
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center py-16">
                <div className="text-center space-y-4">
                  <Building className="h-16 w-16 mx-auto text-muted-foreground" />
                  <div>
                    <p className="text-lg font-medium">Neraca Belum Dibuat</p>
                    <p className="text-sm text-muted-foreground">
                      Klik "Generate Neraca" untuk membuat laporan dari data aplikasi
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Income Statement Tab */}
        <TabsContent value="income-statement" className="space-y-4">
          {incomeStatement ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    LAPORAN LABA RUGI (Income Statement)
                  </CardTitle>
                  <CardDescription>
                    Periode {format(incomeStatement.periodFrom, 'd MMM', { locale: id })} - {format(incomeStatement.periodTo, 'd MMM yyyy', { locale: id })}
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const printerInfo: PrinterInfo = {
                      name: user?.name || user?.email || 'Unknown User',
                      position: user?.role || undefined
                    };
                    downloadIncomeStatementPDF(incomeStatement, currentBranch?.name || 'PT AQUVIT MANUFACTURE', printerInfo);
                  }}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export PDF
                </Button>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  {/* Revenue Section */}
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-green-700 border-b pb-2">PENDAPATAN</h3>
                    {incomeStatement.revenue.penjualan.map((item, index) => (
                      <div key={index} className="flex justify-between">
                        <span>{item.accountName}</span>
                        <span className="font-mono">{item.formattedAmount}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-medium border-t pt-2">
                      <span>Total Pendapatan</span>
                      <span className="font-mono">{formatCurrency(incomeStatement.revenue.totalRevenue)}</span>
                    </div>
                  </div>

                  {/* COGS Section */}
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-orange-700 border-b pb-2">HARGA POKOK PENJUALAN</h3>
                    {incomeStatement.cogs.bahanBaku.map((item, index) => (
                      <div key={index} className="flex justify-between">
                        <span>{item.accountName}</span>
                        <span className="font-mono">({item.formattedAmount})</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-medium border-t pt-2">
                      <span>Total Harga Pokok Penjualan</span>
                      <span className="font-mono">({formatCurrency(incomeStatement.cogs.totalCOGS)})</span>
                    </div>
                  </div>

                  {/* Gross Profit */}
                  <div className="flex justify-between font-semibold text-lg bg-green-50 p-3 rounded">
                    <span>LABA KOTOR</span>
                    <div className="text-right">
                      <span className="font-mono">{formatCurrency(incomeStatement.grossProfit)}</span>
                      <div className="text-sm text-muted-foreground">
                        ({incomeStatement.grossProfitMargin.toFixed(1)}%)
                      </div>
                    </div>
                  </div>

                  {/* Operating Expenses */}
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-red-700 border-b pb-2">BEBAN OPERASIONAL</h3>
                    {incomeStatement.operatingExpenses.bebanOperasional.map((item, index) => (
                      <div key={index} className="flex justify-between">
                        <span>{item.accountName}</span>
                        <span className="font-mono">({item.formattedAmount})</span>
                      </div>
                    ))}
                    {incomeStatement.operatingExpenses.komisi.map((item, index) => (
                      <div key={index} className="flex justify-between">
                        <span>{item.accountName}</span>
                        <span className="font-mono">({item.formattedAmount})</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-medium border-t pt-2">
                      <span>Total Beban Operasional</span>
                      <span className="font-mono">({formatCurrency(incomeStatement.operatingExpenses.totalOperatingExpenses)})</span>
                    </div>
                  </div>

                  {/* Net Income */}
                  <div className="space-y-3">
                    <div className="flex justify-between font-semibold text-lg bg-blue-50 p-3 rounded">
                      <span>LABA OPERASIONAL</span>
                      <span className="font-mono">{formatCurrency(incomeStatement.operatingIncome)}</span>
                    </div>

                    <div className={`flex justify-between font-bold text-xl p-4 rounded ${
                      incomeStatement.netIncome >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      <span>LABA BERSIH</span>
                      <div className="text-right">
                        <span className="font-mono">{formatCurrency(incomeStatement.netIncome)}</span>
                        <div className="text-sm">
                          ({incomeStatement.netProfitMargin.toFixed(1)}%)
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground text-center pt-4 border-t">
                  Dibuat pada: {format(incomeStatement.generatedAt, 'dd MMM yyyy HH:mm', { locale: id })} • 
                  Data dari: Transactions, Cash History, Commission Entries
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center py-16">
                <div className="text-center space-y-4">
                  <TrendingUp className="h-16 w-16 mx-auto text-muted-foreground" />
                  <div>
                    <p className="text-lg font-medium">Laporan Laba Rugi Belum Dibuat</p>
                    <p className="text-sm text-muted-foreground">
                      Klik "Generate Laba Rugi" untuk membuat laporan dari data transaksi
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Cash Flow Tab */}
        <TabsContent value="cash-flow" className="space-y-4">
          {cashFlowStatement ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="text-center">
                  <CardTitle className="flex items-center justify-center gap-2 text-xl">
                    <Banknote className="h-6 w-6" />
                    PT AQUVIT MANUFACTURE
                  </CardTitle>
                  <h3 className="text-lg font-semibold mt-2">LAPORAN ARUS KAS</h3>
                  <CardDescription className="mt-1">
                    Periode {format(cashFlowStatement.periodFrom, 'd MMMM', { locale: id })} sampai dengan {format(cashFlowStatement.periodTo, 'd MMMM yyyy', { locale: id })}
                  </CardDescription>
                  <p className="text-sm text-muted-foreground mt-1">(Metode Langsung - Disajikan dalam Rupiah)</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const printerInfo: CashFlowPrinterInfo = {
                      name: user?.name || user?.email || 'Unknown User',
                      position: user?.role || undefined
                    };
                    downloadCashFlowPDF(cashFlowStatement, currentBranch?.name || 'PT AQUVIT MANUFACTURE', printerInfo);
                  }}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export PDF
                </Button>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  {/* Operating Activities - PSAK Format */}
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-blue-700 border-b pb-2">AKTIVITAS OPERASI</h3>

                    {/* Cash Receipts */}
                    <div className="space-y-1">
                      <h4 className="font-medium text-blue-600">Penerimaan kas dari:</h4>
                      {/* Show receipts by account for more detail */}
                      {cashFlowStatement.operatingActivities.cashReceipts?.byAccount?.map((item, index) => (
                        <div key={index} className="flex justify-between pl-4">
                          <span className="text-sm">{item.accountName} ({item.accountCode})</span>
                          <span className="font-mono">{formatCurrency(item.amount)}</span>
                        </div>
                      ))}
                      {/* Fallback to summary if no detail */}
                      {(!cashFlowStatement.operatingActivities.cashReceipts?.byAccount ||
                        cashFlowStatement.operatingActivities.cashReceipts.byAccount.length === 0) && (
                        <>
                          <div className="flex justify-between pl-4">
                            <span>Pelanggan</span>
                            <span className="font-mono">{formatCurrency(cashFlowStatement.operatingActivities.cashReceipts?.fromCustomers || 0)}</span>
                          </div>
                          <div className="flex justify-between pl-4">
                            <span>Pembayaran piutang</span>
                            <span className="font-mono">{formatCurrency(cashFlowStatement.operatingActivities.cashReceipts?.fromReceivablePayments || 0)}</span>
                          </div>
                          {cashFlowStatement.operatingActivities.cashReceipts?.fromAdvanceRepayment > 0 && (
                            <div className="flex justify-between pl-4">
                              <span>Pelunasan panjar karyawan</span>
                              <span className="font-mono">{formatCurrency(cashFlowStatement.operatingActivities.cashReceipts?.fromAdvanceRepayment || 0)}</span>
                            </div>
                          )}
                          <div className="flex justify-between pl-4">
                            <span>Penerimaan operasi lain</span>
                            <span className="font-mono">{formatCurrency(cashFlowStatement.operatingActivities.cashReceipts?.fromOtherOperating || 0)}</span>
                          </div>
                        </>
                      )}
                      <div className="flex justify-between font-medium text-green-600 border-b pb-1">
                        <span className="pl-4">Total penerimaan kas</span>
                        <span className="font-mono">{formatCurrency(cashFlowStatement.operatingActivities.cashReceipts?.total || 0)}</span>
                      </div>
                    </div>

                    {/* Cash Payments */}
                    <div className="space-y-1">
                      <h4 className="font-medium text-red-600">Pembayaran kas untuk:</h4>
                      {/* Show payments by account for more detail */}
                      {cashFlowStatement.operatingActivities.cashPayments?.byAccount?.map((item, index) => (
                        <div key={index} className="flex justify-between pl-4">
                          <span className="text-sm">{item.accountName} ({item.accountCode})</span>
                          <span className="font-mono">({formatCurrency(item.amount)})</span>
                        </div>
                      ))}
                      {/* Fallback to summary if no detail */}
                      {(!cashFlowStatement.operatingActivities.cashPayments?.byAccount ||
                        cashFlowStatement.operatingActivities.cashPayments.byAccount.length === 0) && (
                        <>
                          <div className="flex justify-between pl-4">
                            <span>Pembayaran ke supplier</span>
                            <span className="font-mono">({formatCurrency(cashFlowStatement.operatingActivities.cashPayments?.forRawMaterials || 0)})</span>
                          </div>
                          {cashFlowStatement.operatingActivities.cashPayments?.forPayablePayments > 0 && (
                            <div className="flex justify-between pl-4">
                              <span>Pembayaran hutang usaha lainnya</span>
                              <span className="font-mono">({formatCurrency(cashFlowStatement.operatingActivities.cashPayments?.forPayablePayments || 0)})</span>
                            </div>
                          )}
                          <div className="flex justify-between pl-4">
                            <span>Hutang Bunga Atas Hutang Bank</span>
                            <span className="font-mono">({formatCurrency(cashFlowStatement.operatingActivities.cashPayments?.forInterestExpense || 0)})</span>
                          </div>
                          <div className="flex justify-between pl-4">
                            <span>Upah tenaga kerja langsung</span>
                            <span className="font-mono">({formatCurrency(cashFlowStatement.operatingActivities.cashPayments?.forDirectLabor || 0)})</span>
                          </div>
                          {cashFlowStatement.operatingActivities.cashPayments?.forEmployeeAdvances > 0 && (
                            <div className="flex justify-between pl-4">
                              <span>Pemberian panjar karyawan</span>
                              <span className="font-mono">({formatCurrency(cashFlowStatement.operatingActivities.cashPayments?.forEmployeeAdvances || 0)})</span>
                            </div>
                          )}
                          <div className="flex justify-between pl-4">
                            <span>Biaya overhead pabrik</span>
                            <span className="font-mono">({formatCurrency(cashFlowStatement.operatingActivities.cashPayments?.forManufacturingOverhead || 0)})</span>
                          </div>
                          <div className="flex justify-between pl-4">
                            <span>Beban operasi lainnya</span>
                            <span className="font-mono">({formatCurrency(cashFlowStatement.operatingActivities.cashPayments?.forOperatingExpenses || 0)})</span>
                          </div>
                          {cashFlowStatement.operatingActivities.cashPayments?.forTaxes > 0 && (
                            <div className="flex justify-between pl-4">
                              <span>Pajak penghasilan</span>
                              <span className="font-mono">({formatCurrency(cashFlowStatement.operatingActivities.cashPayments.forTaxes)})</span>
                            </div>
                          )}
                        </>
                      )}
                      <div className="flex justify-between font-medium text-red-600 border-b pb-1">
                        <span className="pl-4">Total pembayaran kas</span>
                        <span className="font-mono">({formatCurrency(cashFlowStatement.operatingActivities.cashPayments?.total || 0)})</span>
                      </div>
                    </div>

                    <div className="flex justify-between font-bold text-lg bg-blue-50 p-3 rounded">
                      <span>Kas Bersih dari Aktivitas Operasi</span>
                      <span className="font-mono">{formatCurrency(cashFlowStatement.operatingActivities.netCashFromOperations)}</span>
                    </div>
                  </div>

                  {/* Investing Activities */}
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-purple-700 border-b pb-2">AKTIVITAS INVESTASI</h3>
                    {cashFlowStatement.investingActivities.equipmentPurchases.map((item, index) => (
                      <div key={index} className="flex justify-between">
                        <span>{item.description}</span>
                        <span className="font-mono">{item.formattedAmount}</span>
                      </div>
                    ))}
                    {cashFlowStatement.investingActivities.equipmentPurchases.length === 0 && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Tidak ada aktivitas investasi</span>
                        <span className="font-mono">-</span>
                      </div>
                    )}
                    <div className="flex justify-between font-medium border-t pt-2">
                      <span>Kas Bersih dari Aktivitas Investasi</span>
                      <span className="font-mono">{formatCurrency(cashFlowStatement.investingActivities.netCashFromInvesting)}</span>
                    </div>
                  </div>

                  {/* Financing Activities */}
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-green-700 border-b pb-2">AKTIVITAS PENDANAAN</h3>

                    {/* Owner Investments */}
                    {cashFlowStatement.financingActivities.ownerInvestments.map((item, index) => (
                      <div key={`owner-inv-${index}`} className="flex justify-between">
                        <span>{item.description}</span>
                        <span className="font-mono">{item.formattedAmount}</span>
                      </div>
                    ))}

                    {/* Owner Withdrawals */}
                    {cashFlowStatement.financingActivities.ownerWithdrawals.map((item, index) => (
                      <div key={`owner-wd-${index}`} className="flex justify-between">
                        <span>{item.description}</span>
                        <span className="font-mono">{item.formattedAmount}</span>
                      </div>
                    ))}

                    {/* Loans */}
                    {cashFlowStatement.financingActivities.loans.map((item, index) => (
                      <div key={`loan-${index}`} className="flex justify-between">
                        <span>{item.description}</span>
                        <span className="font-mono">{item.formattedAmount}</span>
                      </div>
                    ))}

                    {/* Show "no activity" if all arrays are empty */}
                    {cashFlowStatement.financingActivities.ownerInvestments.length === 0 &&
                     cashFlowStatement.financingActivities.ownerWithdrawals.length === 0 &&
                     cashFlowStatement.financingActivities.loans.length === 0 && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Tidak ada aktivitas pendanaan</span>
                        <span className="font-mono">-</span>
                      </div>
                    )}

                    <div className="flex justify-between font-medium border-t pt-2">
                      <span>Kas Bersih dari Aktivitas Pendanaan</span>
                      <span className="font-mono">{formatCurrency(cashFlowStatement.financingActivities.netCashFromFinancing)}</span>
                    </div>
                  </div>

                  {/* Net Cash Flow */}
                  <div className="space-y-3">
                    <div className={`flex justify-between font-semibold text-lg p-3 rounded ${
                      cashFlowStatement.netCashFlow >= 0 ? 'bg-green-50' : 'bg-red-50'
                    }`}>
                      <span>KENAIKAN (PENURUNAN) KAS BERSIH</span>
                      <span className="font-mono">{formatCurrency(cashFlowStatement.netCashFlow)}</span>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Kas di awal periode</span>
                        <span className="font-mono">{formatCurrency(cashFlowStatement.beginningCash)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-lg border-t pt-2">
                        <span>KAS DI AKHIR PERIODE</span>
                        <span className="font-mono">{formatCurrency(cashFlowStatement.endingCash)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground text-center pt-4 border-t">
                  Dibuat pada: {format(cashFlowStatement.generatedAt, 'dd MMM yyyy HH:mm', { locale: id })} • 
                  Data dari: Cash History, Account Balances
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center py-16">
                <div className="text-center space-y-4">
                  <Banknote className="h-16 w-16 mx-auto text-muted-foreground" />
                  <div>
                    <p className="text-lg font-medium">Laporan Arus Kas Belum Dibuat</p>
                    <p className="text-sm text-muted-foreground">
                      Klik "Generate Arus Kas" untuk membuat laporan dari cash history
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FinancialReportsPage;