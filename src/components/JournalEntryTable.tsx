import { useState } from 'react';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import {
  Eye,
  Send,
  Trash2,
  Ban,
  ChevronDown,
  ChevronUp,
  FileText,
  CheckCircle,
  XCircle,
  Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { JournalEntry } from '@/types/journal';

interface JournalEntryTableProps {
  entries: JournalEntry[];
  isLoading?: boolean;
  onPost?: (id: string) => void;
  onVoid?: (id: string, reason: string) => void;
  onDelete?: (id: string) => void;
  isPosting?: boolean;
  isVoiding?: boolean;
  isDeleting?: boolean;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
};

const getStatusBadge = (status: string, isVoided: boolean) => {
  if (isVoided) {
    return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Void</Badge>;
  }
  switch (status) {
    case 'draft':
      return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Draft</Badge>;
    case 'posted':
      return <Badge variant="default" className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Posted</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

const getReferenceTypeBadge = (type?: string) => {
  switch (type) {
    case 'manual':
      return <Badge variant="outline">Manual</Badge>;
    case 'adjustment':
      return <Badge variant="outline" className="bg-yellow-50">Penyesuaian</Badge>;
    case 'closing':
      return <Badge variant="outline" className="bg-purple-50">Penutup</Badge>;
    case 'opening':
      return <Badge variant="outline" className="bg-blue-50">Pembukaan</Badge>;
    case 'transaction':
      return <Badge variant="outline" className="bg-green-50">Transaksi</Badge>;
    case 'expense':
      return <Badge variant="outline" className="bg-red-50">Pengeluaran</Badge>;
    case 'payroll':
      return <Badge variant="outline" className="bg-orange-50">Gaji</Badge>;
    default:
      return null;
  }
};

export function JournalEntryTable({
  entries,
  isLoading,
  onPost,
  onVoid,
  onDelete,
  isPosting,
  isVoiding,
  isDeleting
}: JournalEntryTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showVoidDialog, setShowVoidDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [voidReason, setVoidReason] = useState('');

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handlePost = () => {
    if (selectedEntry && onPost) {
      onPost(selectedEntry.id);
      setSelectedEntry(null);
    }
  };

  const handleVoid = () => {
    if (selectedEntry && onVoid && voidReason) {
      onVoid(selectedEntry.id, voidReason);
      setShowVoidDialog(false);
      setVoidReason('');
      setSelectedEntry(null);
    }
  };

  const handleDelete = () => {
    if (selectedEntry && onDelete) {
      onDelete(selectedEntry.id);
      setShowDeleteDialog(false);
      setSelectedEntry(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
        <p className="text-lg font-medium">Belum ada jurnal</p>
        <p className="text-sm text-muted-foreground">
          Klik "Buat Jurnal" untuk membuat jurnal baru
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]"></TableHead>
              <TableHead>No. Jurnal</TableHead>
              <TableHead>Tanggal</TableHead>
              <TableHead>Keterangan</TableHead>
              <TableHead>Tipe</TableHead>
              <TableHead className="text-right">Debit</TableHead>
              <TableHead className="text-right">Credit</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[120px]">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <>
                <TableRow
                  key={entry.id}
                  className={entry.isVoided ? 'bg-red-50/50' : ''}
                >
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => toggleRow(entry.id)}
                    >
                      {expandedRows.has(entry.id) ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                  <TableCell className="font-mono font-medium">
                    {entry.entryNumber}
                  </TableCell>
                  <TableCell>
                    {format(entry.entryDate, 'dd MMM yyyy', { locale: localeId })}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate" title={entry.description}>
                    {entry.description}
                  </TableCell>
                  <TableCell>
                    {getReferenceTypeBadge(entry.referenceType)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(entry.totalDebit)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(entry.totalCredit)}
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(entry.status, entry.isVoided)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          setSelectedEntry(entry);
                          setShowDetailDialog(true);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>

                      {entry.status === 'draft' && !entry.isVoided && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-green-600"
                            onClick={() => {
                              setSelectedEntry(entry);
                              if (onPost) onPost(entry.id);
                            }}
                            disabled={isPosting}
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => {
                              setSelectedEntry(entry);
                              setShowDeleteDialog(true);
                            }}
                            disabled={isDeleting}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}

                      {entry.status === 'posted' && !entry.isVoided && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-orange-600"
                          onClick={() => {
                            setSelectedEntry(entry);
                            setShowVoidDialog(true);
                          }}
                          disabled={isVoiding}
                        >
                          <Ban className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>

                {/* Expanded Row - Journal Lines */}
                {expandedRows.has(entry.id) && (
                  <TableRow className="bg-muted/30">
                    <TableCell colSpan={9} className="p-0">
                      <div className="p-4">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[50px]">No</TableHead>
                              <TableHead>Kode Akun</TableHead>
                              <TableHead>Nama Akun</TableHead>
                              <TableHead>Keterangan</TableHead>
                              <TableHead className="text-right">Debit</TableHead>
                              <TableHead className="text-right">Credit</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {entry.lines.map((line) => (
                              <TableRow key={line.id}>
                                <TableCell>{line.lineNumber}</TableCell>
                                <TableCell className="font-mono">{line.accountCode}</TableCell>
                                <TableCell>{line.accountName}</TableCell>
                                <TableCell className="text-muted-foreground">{line.description || '-'}</TableCell>
                                <TableCell className="text-right font-mono">
                                  {line.debitAmount > 0 ? formatCurrency(line.debitAmount) : '-'}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {line.creditAmount > 0 ? formatCurrency(line.creditAmount) : '-'}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>

                        {/* Entry metadata */}
                        <div className="mt-4 text-xs text-muted-foreground space-y-1">
                          <p>Dibuat oleh: {entry.createdByName || '-'} pada {format(entry.createdAt, 'dd MMM yyyy HH:mm', { locale: localeId })}</p>
                          {entry.approvedByName && (
                            <p>Diposting oleh: {entry.approvedByName} pada {entry.approvedAt && format(entry.approvedAt, 'dd MMM yyyy HH:mm', { locale: localeId })}</p>
                          )}
                          {entry.isVoided && (
                            <p className="text-destructive">
                              Dibatalkan oleh: {entry.voidedByName} pada {entry.voidedAt && format(entry.voidedAt, 'dd MMM yyyy HH:mm', { locale: localeId })}
                              {entry.voidReason && ` - Alasan: ${entry.voidReason}`}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Detail Jurnal {selectedEntry?.entryNumber}</DialogTitle>
            <DialogDescription>
              {selectedEntry && format(selectedEntry.entryDate, 'dd MMMM yyyy', { locale: localeId })}
            </DialogDescription>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {getStatusBadge(selectedEntry.status, selectedEntry.isVoided)}
                {getReferenceTypeBadge(selectedEntry.referenceType)}
              </div>

              <div>
                <Label>Keterangan</Label>
                <p className="mt-1">{selectedEntry.description}</p>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Akun</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedEntry.lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>
                        <span className="font-mono text-xs mr-2">{line.accountCode}</span>
                        {line.accountName}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {line.debitAmount > 0 ? formatCurrency(line.debitAmount) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {line.creditAmount > 0 ? formatCurrency(line.creditAmount) : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailDialog(false)}>
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Void Dialog */}
      <Dialog open={showVoidDialog} onOpenChange={setShowVoidDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Batalkan Jurnal</DialogTitle>
            <DialogDescription>
              Jurnal yang sudah diposting tidak bisa dihapus, tapi bisa dibatalkan (void).
              Saldo akun akan dikembalikan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Alasan Pembatalan</Label>
              <Input
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Masukkan alasan pembatalan..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVoidDialog(false)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={handleVoid}
              disabled={!voidReason || isVoiding}
            >
              {isVoiding ? 'Memproses...' : 'Batalkan Jurnal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Jurnal Draft?</AlertDialogTitle>
            <AlertDialogDescription>
              Jurnal draft "{selectedEntry?.entryNumber}" akan dihapus permanen.
              Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Menghapus...' : 'Hapus'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
