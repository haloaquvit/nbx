"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"
import { ChartOfAccountsTree } from "@/components/ChartOfAccountsTree"
import { useAccounts } from "@/hooks/useAccounts"
import { STANDARD_COA_TEMPLATE } from "@/utils/chartOfAccountsUtils"
import { Account } from "@/types/account"
import { 
  TreePine, 
  Upload, 
  Database, 
  FileText, 
  Calculator,
  TrendingUp,
  TrendingDown,
  DollarSign
} from "lucide-react"

export default function ChartOfAccountsDemoPage() {
  const { accounts, isLoading, importStandardCoA } = useAccounts()
  const { toast } = useToast()
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)

  const handleImportStandardCoA = () => {
    const templateData = STANDARD_COA_TEMPLATE.map(template => ({
      code: template.code,
      name: template.name,
      type: template.category === 'ASET' ? 'Aset' : 
            template.category === 'KEWAJIBAN' ? 'Kewajiban' :
            template.category === 'MODAL' ? 'Modal' :
            template.category === 'PENDAPATAN' ? 'Pendapatan' : 'Beban',
      parentCode: template.parentCode,
      level: template.level,
      normalBalance: template.normalBalance,
      isHeader: template.isHeader,
      sortOrder: template.sortOrder
    }))

    importStandardCoA.mutate(templateData, {
      onSuccess: (count) => {
        toast({
          title: "Import Berhasil!",
          description: `${count} accounts telah diimport ke database.`
        })
      },
      onError: (error) => {
        toast({
          variant: "destructive",
          title: "Import Gagal",
          description: error.message
        })
      }
    })
  }

  // Calculate statistics
  const stats = {
    totalAccounts: accounts?.length || 0,
    headerAccounts: accounts?.filter(acc => acc.isHeader).length || 0,
    detailAccounts: accounts?.filter(acc => !acc.isHeader).length || 0,
    paymentAccounts: accounts?.filter(acc => acc.isPaymentAccount).length || 0,
    totalBalance: accounts?.reduce((sum, acc) => sum + (acc.balance || 0), 0) || 0
  }

  const accountsByType = {
    Aset: accounts?.filter(acc => acc.type === 'Aset').length || 0,
    Kewajiban: accounts?.filter(acc => acc.type === 'Kewajiban').length || 0,
    Modal: accounts?.filter(acc => acc.type === 'Modal').length || 0,
    Pendapatan: accounts?.filter(acc => acc.type === 'Pendapatan').length || 0,
    Beban: accounts?.filter(acc => acc.type === 'Beban').length || 0,
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <TreePine className="h-8 w-8 text-green-600" />
            Chart of Accounts Demo
          </h1>
          <p className="text-muted-foreground">
            Testing dan demo fungsionalitas Chart of Accounts yang telah dibuat
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={handleImportStandardCoA}
            disabled={importStandardCoA.isPending}
          >
            <Upload className="h-4 w-4 mr-2" />
            {importStandardCoA.isPending ? "Importing..." : "Import Standard CoA"}
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Accounts</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalAccounts}</div>
            <p className="text-xs text-muted-foreground">
              {stats.headerAccounts} header, {stats.detailAccounts} detail
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Payment Accounts</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.paymentAccounts}</div>
            <p className="text-xs text-muted-foreground">
              Accounts yang bisa menerima pembayaran
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Balance</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {new Intl.NumberFormat("id-ID", {
                notation: "compact",
                compactDisplay: "short"
              }).format(stats.totalBalance)}
            </div>
            <p className="text-xs text-muted-foreground">
              Total saldo semua accounts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aset</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{accountsByType.Aset}</div>
            <p className="text-xs text-muted-foreground">
              Accounts tipe Aset
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Kewajiban</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{accountsByType.Kewajiban}</div>
            <p className="text-xs text-muted-foreground">
              Accounts tipe Kewajiban
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="tree" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tree">
            <TreePine className="h-4 w-4 mr-2" />
            Interactive Tree
          </TabsTrigger>
          <TabsTrigger value="template">
            <FileText className="h-4 w-4 mr-2" />
            CoA Template
          </TabsTrigger>
          <TabsTrigger value="structure">
            <Database className="h-4 w-4 mr-2" />
            Account Structure
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tree" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Tree View */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Interactive Chart of Accounts</CardTitle>
                  <CardDescription>
                    Click pada accounts untuk melihat detail, expand/collapse untuk navigasi
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                  ) : (
                    <ChartOfAccountsTree
                      accounts={accounts || []}
                      onAccountSelect={setSelectedAccount}
                      selectedAccountId={selectedAccount?.id}
                      showActions={false}
                      readOnly={true}
                    />
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Selected Account Details */}
            <div>
              <Card>
                <CardHeader>
                  <CardTitle>Account Details</CardTitle>
                  <CardDescription>
                    {selectedAccount ? 'Detail account yang dipilih' : 'Pilih account untuk melihat detail'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {selectedAccount ? (
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">ID</label>
                        <p className="text-sm font-mono">{selectedAccount.id}</p>
                      </div>

                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Nama</label>
                        <p className="font-medium">{selectedAccount.name}</p>
                      </div>
                      
                      {selectedAccount.code && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Kode</label>
                          <p className="text-sm font-mono bg-muted px-2 py-1 rounded inline-block">
                            {selectedAccount.code}
                          </p>
                        </div>
                      )}
                      
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Tipe & Properties</label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          <Badge variant="default">{selectedAccount.type}</Badge>
                          {selectedAccount.normalBalance && (
                            <Badge variant="outline">{selectedAccount.normalBalance}</Badge>
                          )}
                          {selectedAccount.isPaymentAccount && (
                            <Badge variant="secondary">Payment</Badge>
                          )}
                          {selectedAccount.isHeader && (
                            <Badge variant="secondary">Header</Badge>
                          )}
                          <Badge variant="outline">Level {selectedAccount.level || 1}</Badge>
                        </div>
                      </div>
                      
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Balance Information</label>
                        <div className="mt-1 space-y-1">
                          <div className="flex justify-between">
                            <span className="text-sm">Current Balance:</span>
                            <span className="font-semibold">
                              {new Intl.NumberFormat("id-ID", {
                                style: "currency",
                                currency: "IDR",
                                minimumFractionDigits: 0,
                              }).format(selectedAccount.balance)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">Initial Balance:</span>
                            <span className="text-sm">
                              {new Intl.NumberFormat("id-ID", {
                                style: "currency",
                                currency: "IDR",
                                minimumFractionDigits: 0,
                              }).format(selectedAccount.initialBalance)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {selectedAccount.parentId && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Parent Account</label>
                          <p className="text-sm">{selectedAccount.parentId}</p>
                        </div>
                      )}

                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Created</label>
                        <p className="text-sm">
                          {selectedAccount.createdAt.toLocaleDateString('id-ID', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <TreePine className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Pilih account di tree untuk melihat detail</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="template">
          <Card>
            <CardHeader>
              <CardTitle>Standard Chart of Accounts Template</CardTitle>
              <CardDescription>
                Template standar yang akan diimport ke database
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  Template ini berisi {STANDARD_COA_TEMPLATE.length} accounts standar sesuai praktik akuntansi Indonesia.
                </div>
                
                <div className="max-h-96 overflow-auto border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left p-2">Code</th>
                        <th className="text-left p-2">Name</th>
                        <th className="text-left p-2">Category</th>
                        <th className="text-center p-2">Level</th>
                        <th className="text-center p-2">Normal Balance</th>
                        <th className="text-center p-2">Header</th>
                      </tr>
                    </thead>
                    <tbody>
                      {STANDARD_COA_TEMPLATE.map((template, index) => (
                        <tr key={index} className={index % 2 === 0 ? 'bg-background' : 'bg-muted/50'}>
                          <td className="p-2 font-mono">{template.code}</td>
                          <td className="p-2" style={{ paddingLeft: `${(template.level - 1) * 20 + 8}px` }}>
                            {template.isHeader ? '📁' : '💰'} {template.name}
                          </td>
                          <td className="p-2">
                            <Badge variant="outline" className="text-xs">
                              {template.category}
                            </Badge>
                          </td>
                          <td className="p-2 text-center">{template.level}</td>
                          <td className="p-2 text-center">
                            <Badge variant={template.normalBalance === 'DEBIT' ? 'default' : 'secondary'} className="text-xs">
                              {template.normalBalance}
                            </Badge>
                          </td>
                          <td className="p-2 text-center">
                            {template.isHeader ? '✅' : '❌'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="structure">
          <Card>
            <CardHeader>
              <CardTitle>Current Account Structure</CardTitle>
              <CardDescription>
                Struktur accounts yang saat ini ada di database
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                {Object.entries(accountsByType).map(([type, count]) => (
                  <div key={type} className="text-center p-4 border rounded-lg">
                    <div className="text-2xl font-bold">{count}</div>
                    <div className="text-sm text-muted-foreground">{type}</div>
                  </div>
                ))}
              </div>

              {accounts && accounts.length > 0 ? (
                <div className="max-h-64 overflow-auto border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left p-2">Code</th>
                        <th className="text-left p-2">Name</th>
                        <th className="text-left p-2">Type</th>
                        <th className="text-right p-2">Balance</th>
                        <th className="text-center p-2">Properties</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accounts.map(account => (
                        <tr key={account.id} className="hover:bg-muted/50">
                          <td className="p-2 font-mono">{account.code || '-'}</td>
                          <td className="p-2">{account.name}</td>
                          <td className="p-2">{account.type}</td>
                          <td className="p-2 text-right">
                            {new Intl.NumberFormat("id-ID", {
                              style: "currency",
                              currency: "IDR",
                              minimumFractionDigits: 0,
                            }).format(account.balance)}
                          </td>
                          <td className="p-2 text-center">
                            <div className="flex justify-center gap-1">
                              {account.isPaymentAccount && <Badge className="text-xs">Pay</Badge>}
                              {account.isHeader && <Badge variant="secondary" className="text-xs">Header</Badge>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Belum ada accounts di database</p>
                  <p className="text-sm">Import standard CoA untuk memulai</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}