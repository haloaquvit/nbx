import { useState } from 'react';
import { Plus, BookOpen, Filter, RefreshCw, List, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { JournalEntryForm } from '@/components/JournalEntryForm';
import { JournalEntryTable } from '@/components/JournalEntryTable';
import { useJournalEntries } from '@/hooks/useJournalEntries';
import { JournalEntryFormData } from '@/types/journal';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

export function JournalPage() {
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [mainTab, setMainTab] = useState<string>('entries');

  const {
    journalEntries,
    isLoading,
    refetch,
    createJournalEntry,
    isCreating,
    postJournalEntry,
    isPosting,
    voidJournalEntry,
    isVoiding,
    deleteJournalEntry,
    isDeleting,
    allJournalLines,
    isLoadingLines,
    refetchLines,
  } = useJournalEntries();

  const handleSubmit = (data: JournalEntryFormData) => {
    createJournalEntry(data, {
      onSuccess: () => {
        setShowForm(false);
      },
    });
  };

  // Filter entries by status
  const filteredEntries = (journalEntries || []).filter(entry => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'voided') return entry.isVoided;
    return entry.status === statusFilter && !entry.isVoided;
  });

  // Count by status
  const counts = {
    all: journalEntries?.length || 0,
    draft: journalEntries?.filter(e => e.status === 'draft' && !e.isVoided).length || 0,
    posted: journalEntries?.filter(e => e.status === 'posted' && !e.isVoided).length || 0,
    voided: journalEntries?.filter(e => e.isVoided).length || 0,
  };

  // Calculate totals for journal lines
  const linesTotals = {
    totalDebit: allJournalLines?.reduce((sum, line) => sum + line.debitAmount, 0) || 0,
    totalCredit: allJournalLines?.reduce((sum, line) => sum + line.creditAmount, 0) || 0,
  };

  return (
    <div className="container mx-auto py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BookOpen className="h-8 w-8" />
            Jurnal Umum
          </h1>
          <p className="text-muted-foreground">
            Kelola entri jurnal dengan sistem double-entry bookkeeping
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => { refetch(); refetchLines(); }}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          {mainTab === 'entries' && (
            <Button onClick={() => setShowForm(!showForm)}>
              <Plus className="h-4 w-4 mr-2" />
              {showForm ? 'Tutup Form' : 'Buat Jurnal'}
            </Button>
          )}
        </div>
      </div>

      {/* Main Tabs: Entries vs Lines */}
      <Tabs value={mainTab} onValueChange={setMainTab} className="mb-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="entries" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Journal Entries ({counts.all})
          </TabsTrigger>
          <TabsTrigger value="lines" className="flex items-center gap-2">
            <List className="h-4 w-4" />
            Entry Lines ({allJournalLines?.length || 0})
          </TabsTrigger>
        </TabsList>

        {/* Tab: Journal Entries */}
        <TabsContent value="entries">
          {/* Form Section */}
          {showForm && (
            <div className="mb-6">
              <JournalEntryForm
                onSubmit={handleSubmit}
                isLoading={isCreating}
                onCancel={() => setShowForm(false)}
              />
            </div>
          )}

          {/* Filter & List Section */}
          <div className="space-y-4">
            {/* Tabs for quick filter */}
            <Tabs value={statusFilter} onValueChange={setStatusFilter}>
              <div className="flex items-center justify-between">
                <TabsList>
                  <TabsTrigger value="all">
                    Semua ({counts.all})
                  </TabsTrigger>
                  <TabsTrigger value="draft">
                    Draft ({counts.draft})
                  </TabsTrigger>
                  <TabsTrigger value="posted">
                    Posted ({counts.posted})
                  </TabsTrigger>
                  <TabsTrigger value="voided">
                    Void ({counts.voided})
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value={statusFilter} className="mt-4">
                <JournalEntryTable
                  entries={filteredEntries}
                  isLoading={isLoading}
                  onPost={postJournalEntry}
                  onVoid={(id, reason) => voidJournalEntry({ id, reason })}
                  onDelete={deleteJournalEntry}
                  isPosting={isPosting}
                  isVoiding={isVoiding}
                  isDeleting={isDeleting}
                />
              </TabsContent>
            </Tabs>
          </div>

          {/* Legend */}
          <div className="mt-6 p-4 bg-muted/50 rounded-lg">
            <h3 className="font-semibold mb-2">Keterangan Status:</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="font-medium text-gray-600">Draft:</span>
                <span className="ml-2 text-muted-foreground">
                  Jurnal yang masih bisa diedit/dihapus. Belum mempengaruhi saldo akun.
                </span>
              </div>
              <div>
                <span className="font-medium text-green-600">Posted:</span>
                <span className="ml-2 text-muted-foreground">
                  Jurnal yang sudah final. Saldo akun sudah terupdate.
                </span>
              </div>
              <div>
                <span className="font-medium text-red-600">Void:</span>
                <span className="ml-2 text-muted-foreground">
                  Jurnal yang dibatalkan. Saldo akun sudah dikembalikan.
                </span>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Tab: Journal Entry Lines */}
        <TabsContent value="lines">
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="text-sm text-blue-600 font-medium">Total Baris</div>
                <div className="text-2xl font-bold text-blue-800">{allJournalLines?.length || 0}</div>
              </div>
              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="text-sm text-green-600 font-medium">Total Debit</div>
                <div className="text-2xl font-bold text-green-800">
                  {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(linesTotals.totalDebit)}
                </div>
              </div>
              <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                <div className="text-sm text-red-600 font-medium">Total Credit</div>
                <div className="text-2xl font-bold text-red-800">
                  {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(linesTotals.totalCredit)}
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[140px]">No. Jurnal</TableHead>
                    <TableHead className="w-[100px]">Tanggal</TableHead>
                    <TableHead className="w-[80px]">Kode Akun</TableHead>
                    <TableHead>Nama Akun</TableHead>
                    <TableHead className="text-right w-[130px]">Debit</TableHead>
                    <TableHead className="text-right w-[130px]">Credit</TableHead>
                    <TableHead>Keterangan</TableHead>
                    <TableHead className="w-[80px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingLines ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        Memuat data...
                      </TableCell>
                    </TableRow>
                  ) : !allJournalLines || allJournalLines.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        Tidak ada data journal entry lines
                      </TableCell>
                    </TableRow>
                  ) : (
                    allJournalLines.map((line) => (
                      <TableRow key={line.id} className={line.isVoided ? 'bg-red-50 opacity-60' : ''}>
                        <TableCell className="font-mono text-xs">{line.entryNumber}</TableCell>
                        <TableCell className="text-sm">
                          {line.entryDate ? format(line.entryDate, 'dd/MM/yy', { locale: idLocale }) : '-'}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{line.accountCode}</TableCell>
                        <TableCell className="font-medium">{line.accountName}</TableCell>
                        <TableCell className="text-right font-mono">
                          {line.debitAmount > 0 ? (
                            <span className="text-green-600">
                              {new Intl.NumberFormat('id-ID').format(line.debitAmount)}
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {line.creditAmount > 0 ? (
                            <span className="text-red-600">
                              {new Intl.NumberFormat('id-ID').format(line.creditAmount)}
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                          {line.description || line.journalDescription}
                        </TableCell>
                        <TableCell>
                          {line.isVoided ? (
                            <Badge variant="destructive" className="text-xs">Void</Badge>
                          ) : line.journalStatus === 'posted' ? (
                            <Badge variant="default" className="bg-green-600 text-xs">Posted</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">Draft</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Balance Check */}
            {allJournalLines && allJournalLines.length > 0 && (
              <div className={`p-4 rounded-lg border ${Math.abs(linesTotals.totalDebit - linesTotals.totalCredit) < 0.01 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium">Balance Check:</span>
                  {Math.abs(linesTotals.totalDebit - linesTotals.totalCredit) < 0.01 ? (
                    <span className="text-green-600 font-bold">✓ BALANCED</span>
                  ) : (
                    <span className="text-red-600 font-bold">
                      ✗ UNBALANCED (Selisih: {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(Math.abs(linesTotals.totalDebit - linesTotals.totalCredit))})
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default JournalPage;
