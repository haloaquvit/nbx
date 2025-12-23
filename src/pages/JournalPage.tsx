import { useState } from 'react';
import { Plus, BookOpen, Filter, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { JournalEntryForm } from '@/components/JournalEntryForm';
import { JournalEntryTable } from '@/components/JournalEntryTable';
import { useJournalEntries } from '@/hooks/useJournalEntries';
import { JournalEntryFormData } from '@/types/journal';

export function JournalPage() {
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');

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
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4 mr-2" />
            {showForm ? 'Tutup Form' : 'Buat Jurnal'}
          </Button>
        </div>
      </div>

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
    </div>
  );
}

export default JournalPage;
