import { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { CalendarIcon, Plus, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { useAccounts } from '@/hooks/useAccounts';
import { JournalEntryFormData, JournalEntryLineFormData } from '@/types/journal';

interface JournalEntryFormProps {
  onSubmit: (data: JournalEntryFormData) => void;
  isLoading?: boolean;
  onCancel?: () => void;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
};

export function JournalEntryForm({ onSubmit, isLoading, onCancel }: JournalEntryFormProps) {
  const { accounts } = useAccounts();
  const [entryDate, setEntryDate] = useState<Date>(new Date());

  // Filter only non-header accounts for selection
  const selectableAccounts = (accounts || []).filter(acc => !acc.isHeader && acc.isActive);

  const { register, control, handleSubmit, watch, setValue, formState: { errors } } = useForm<{
    description: string;
    referenceType: string;
    referenceId: string;
    lines: JournalEntryLineFormData[];
  }>({
    defaultValues: {
      description: '',
      referenceType: 'manual',
      referenceId: '',
      lines: [
        { accountId: '', accountCode: '', accountName: '', debitAmount: 0, creditAmount: 0, description: '' },
        { accountId: '', accountCode: '', accountName: '', debitAmount: 0, creditAmount: 0, description: '' },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'lines',
  });

  const watchLines = watch('lines');

  // Calculate totals
  const totalDebit = watchLines.reduce((sum, line) => sum + (Number(line.debitAmount) || 0), 0);
  const totalCredit = watchLines.reduce((sum, line) => sum + (Number(line.creditAmount) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;
  const difference = totalDebit - totalCredit;

  // Handle account selection
  const handleAccountSelect = (index: number, accountId: string) => {
    const account = selectableAccounts.find(acc => acc.id === accountId);
    if (account) {
      setValue(`lines.${index}.accountId`, account.id);
      setValue(`lines.${index}.accountCode`, account.code || '');
      setValue(`lines.${index}.accountName`, account.name);
    }
  };

  // Handle form submission
  const onFormSubmit = handleSubmit((data) => {
    // Filter out empty lines
    const validLines = data.lines.filter(line =>
      line.accountId && (line.debitAmount > 0 || line.creditAmount > 0)
    );

    if (validLines.length < 2) {
      alert('Minimal harus ada 2 baris jurnal dengan akun dan jumlah');
      return;
    }

    if (!isBalanced) {
      alert('Debit dan Credit harus seimbang');
      return;
    }

    onSubmit({
      entryDate,
      description: data.description,
      referenceType: data.referenceType,
      referenceId: data.referenceId,
      lines: validLines,
    });
  });

  return (
    <form onSubmit={onFormSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Jurnal Baru</CardTitle>
          <CardDescription>
            Buat jurnal umum dengan entri debit dan kredit yang seimbang
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Header Fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Date */}
            <div className="space-y-2">
              <Label>Tanggal</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !entryDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {entryDate ? format(entryDate, 'dd MMM yyyy', { locale: localeId }) : 'Pilih tanggal'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={entryDate}
                    onSelect={(date) => date && setEntryDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Reference Type */}
            <div className="space-y-2">
              <Label>Tipe Referensi</Label>
              <Select
                defaultValue="manual"
                onValueChange={(value) => setValue('referenceType', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih tipe" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="adjustment">Penyesuaian</SelectItem>
                  <SelectItem value="closing">Penutup</SelectItem>
                  <SelectItem value="opening">Pembukaan</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Reference ID */}
            <div className="space-y-2">
              <Label>No. Referensi (Opsional)</Label>
              <Input
                {...register('referenceId')}
                placeholder="No. dokumen referensi"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Keterangan</Label>
            <Textarea
              {...register('description', { required: 'Keterangan harus diisi' })}
              placeholder="Deskripsi jurnal..."
              rows={2}
            />
            {errors.description && (
              <p className="text-sm text-destructive">{errors.description.message}</p>
            )}
          </div>

          {/* Journal Lines */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Baris Jurnal</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ accountId: '', accountCode: '', accountName: '', debitAmount: 0, creditAmount: 0, description: '' })}
              >
                <Plus className="h-4 w-4 mr-1" />
                Tambah Baris
              </Button>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">No</TableHead>
                    <TableHead className="min-w-[250px]">Akun</TableHead>
                    <TableHead className="w-[200px]">Keterangan</TableHead>
                    <TableHead className="w-[150px] text-right">Debit</TableHead>
                    <TableHead className="w-[150px] text-right">Credit</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((field, index) => (
                    <TableRow key={field.id}>
                      <TableCell className="font-medium">{index + 1}</TableCell>
                      <TableCell>
                        <Select
                          value={watchLines[index]?.accountId || ''}
                          onValueChange={(value) => handleAccountSelect(index, value)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Pilih akun...">
                              {watchLines[index]?.accountId && (
                                <span>
                                  {watchLines[index]?.accountCode} - {watchLines[index]?.accountName}
                                </span>
                              )}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {selectableAccounts.map((account) => (
                              <SelectItem key={account.id} value={account.id}>
                                <span className="font-mono text-xs mr-2">{account.code}</span>
                                {account.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          {...register(`lines.${index}.description`)}
                          placeholder="Ket. baris"
                          className="h-9"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          {...register(`lines.${index}.debitAmount`, { valueAsNumber: true })}
                          placeholder="0"
                          className="h-9 text-right font-mono"
                          min={0}
                          onChange={(e) => {
                            const value = Number(e.target.value) || 0;
                            setValue(`lines.${index}.debitAmount`, value);
                            if (value > 0) {
                              setValue(`lines.${index}.creditAmount`, 0);
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          {...register(`lines.${index}.creditAmount`, { valueAsNumber: true })}
                          placeholder="0"
                          className="h-9 text-right font-mono"
                          min={0}
                          onChange={(e) => {
                            const value = Number(e.target.value) || 0;
                            setValue(`lines.${index}.creditAmount`, value);
                            if (value > 0) {
                              setValue(`lines.${index}.debitAmount`, 0);
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        {fields.length > 2 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => remove(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3} className="text-right font-semibold">
                      Total
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {formatCurrency(totalDebit)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {formatCurrency(totalCredit)}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </div>

          {/* Balance Status */}
          {totalDebit > 0 || totalCredit > 0 ? (
            <Alert variant={isBalanced ? 'default' : 'destructive'}>
              {isBalanced ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription>
                {isBalanced ? (
                  <span className="text-green-600 font-medium">
                    Jurnal seimbang (Balance)
                  </span>
                ) : (
                  <span>
                    Selisih: {formatCurrency(Math.abs(difference))} ({difference > 0 ? 'Debit lebih' : 'Credit lebih'})
                  </span>
                )}
              </AlertDescription>
            </Alert>
          ) : null}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                Batal
              </Button>
            )}
            <Button
              type="submit"
              disabled={isLoading || !isBalanced || totalDebit === 0}
            >
              {isLoading ? 'Menyimpan...' : 'Simpan Draft'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
