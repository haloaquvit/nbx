import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useCreateZakat, useUpdateZakat } from "@/hooks/useZakat"
import { useAccounts } from "@/hooks/useAccounts"
import { ZakatRecord, ZakatFormData } from "@/types/zakat"
import { useToast } from "@/components/ui/use-toast"

interface ZakatDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  record?: ZakatRecord | null
}

export function ZakatDialog({ open, onOpenChange, record }: ZakatDialogProps) {
  const { toast } = useToast()
  const createZakat = useCreateZakat()
  const updateZakat = useUpdateZakat()
  const { accounts = [], isLoading } = useAccounts()

  const [formData, setFormData] = useState<Partial<ZakatFormData>>({
    type: "zakat_mal",
    category: "zakat",
    title: "",
    description: "",
    recipient: "",
    recipientType: "individual",
    amount: 0,
    nishabAmount: 0,
    percentageRate: 2.5,
    paymentDate: new Date(),
    paymentAccountId: "",
    paymentMethod: "transfer",
    receiptNumber: "",
    calculationBasis: "",
    calculationNotes: "",
    isAnonymous: false,
    notes: "",
    hijriYear: "",
    hijriMonth: "",
  })

  useEffect(() => {
    if (record) {
      setFormData({
        type: record.type,
        category: record.category,
        title: record.title,
        description: record.description,
        recipient: record.recipient,
        recipientType: record.recipientType,
        amount: record.amount,
        nishabAmount: record.nishabAmount,
        percentageRate: record.percentageRate,
        paymentDate: record.paymentDate,
        paymentAccountId: record.paymentAccountId,
        paymentMethod: record.paymentMethod,
        receiptNumber: record.receiptNumber,
        calculationBasis: record.calculationBasis,
        calculationNotes: record.calculationNotes,
        isAnonymous: record.isAnonymous,
        notes: record.notes,
        hijriYear: record.hijriYear,
        hijriMonth: record.hijriMonth,
      })
    } else {
      setFormData({
        type: "zakat_mal",
        category: "zakat",
        title: "",
        description: "",
        recipient: "",
        recipientType: "individual",
        amount: 0,
        nishabAmount: 0,
        percentageRate: 2.5,
        paymentDate: new Date(),
        paymentAccountId: "",
        paymentMethod: "transfer",
        receiptNumber: "",
        calculationBasis: "",
        calculationNotes: "",
        isAnonymous: false,
        notes: "",
        hijriYear: "",
        hijriMonth: "",
      })
    }
  }, [record])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.title || !formData.amount) {
      toast({
        title: "Error",
        description: "Judul dan jumlah wajib diisi",
        variant: "destructive",
      })
      return
    }

    try {
      if (record) {
        await updateZakat.mutateAsync({
          id: record.id,
          formData: formData as Partial<ZakatFormData>,
        })
        toast({
          title: "Berhasil",
          description: "Data berhasil diperbarui",
        })
      } else {
        await createZakat.mutateAsync(formData as ZakatFormData)
        toast({
          title: "Berhasil",
          description: "Pembayaran berhasil dicatat",
        })
      }
      onOpenChange(false)
    } catch (error) {
      toast({
        title: "Gagal",
        description: record ? "Gagal memperbarui data" : "Gagal mencatat pembayaran",
        variant: "destructive",
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{record ? "Edit Pembayaran" : "Tambah Pembayaran Baru"}</DialogTitle>
          <DialogDescription>
            {record ? "Perbarui data pembayaran" : "Catat pembayaran zakat atau sedekah"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Kategori *</Label>
              <select
                id="category"
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={formData.category}
                onChange={(e) => {
                  const category = e.target.value as 'zakat' | 'charity'
                  setFormData({
                    ...formData,
                    category,
                    type: category === 'zakat' ? 'zakat_mal' : 'sedekah'
                  })
                }}
                required
              >
                <option value="zakat">Zakat</option>
                <option value="charity">Sedekah</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Jenis *</Label>
              <select
                id="type"
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                required
              >
                {formData.category === 'zakat' ? (
                  <>
                    <option value="zakat_mal">Zakat Mal</option>
                    <option value="zakat_fitrah">Zakat Fitrah</option>
                    <option value="zakat_penghasilan">Zakat Penghasilan</option>
                    <option value="zakat_perdagangan">Zakat Perdagangan</option>
                    <option value="zakat_emas">Zakat Emas/Perak</option>
                  </>
                ) : (
                  <>
                    <option value="sedekah">Sedekah</option>
                    <option value="infaq">Infaq</option>
                    <option value="wakaf">Wakaf</option>
                    <option value="qurban">Qurban</option>
                    <option value="other">Lainnya</option>
                  </>
                )}
              </select>
            </div>

            <div className="col-span-2 space-y-2">
              <Label htmlFor="title">Judul *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Misal: Zakat Mal 1446H"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Jumlah (Rp) *</Label>
              <Input
                id="amount"
                type="number"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentDate">Tanggal Pembayaran</Label>
              <Input
                id="paymentDate"
                type="date"
                value={formData.paymentDate ? formData.paymentDate.toISOString().split('T')[0] : ''}
                onChange={(e) => setFormData({ ...formData, paymentDate: new Date(e.target.value) })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentAccountId">Dari Akun</Label>
              <select
                id="paymentAccountId"
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={formData.paymentAccountId}
                onChange={(e) => setFormData({ ...formData, paymentAccountId: e.target.value })}
              >
                <option value="">Pilih Akun (Opsional)</option>
                {accounts
                  .filter(account => {
                    if (account.isActive === false) return false

                    // If there are payment accounts that are non-header, show only those
                    const hasNonHeaderPaymentAccounts = accounts.some(a =>
                      a.isActive !== false && a.isHeader === false && a.isPaymentAccount
                    )

                    if (hasNonHeaderPaymentAccounts) {
                      return account.isHeader === false && account.isPaymentAccount
                    }

                    // Otherwise show all payment accounts
                    return account.isPaymentAccount
                  })
                  .sort((a, b) => (a.code || '').localeCompare(b.code || ''))
                  .map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.code ? `${account.code} - ` : ''}{account.name}
                    </option>
                  ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Payment Accounts: {accounts.filter(a => a.isPaymentAccount).length},
                Available: {accounts.filter(a => a.isActive !== false && a.isPaymentAccount).length}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentMethod">Metode Pembayaran</Label>
              <select
                id="paymentMethod"
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={formData.paymentMethod}
                onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value as any })}
              >
                <option value="cash">Tunai</option>
                <option value="transfer">Transfer</option>
                <option value="check">Cek</option>
                <option value="other">Lainnya</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="recipient">Penerima</Label>
              <Input
                id="recipient"
                value={formData.recipient}
                onChange={(e) => setFormData({ ...formData, recipient: e.target.value })}
                placeholder="Nama penerima atau lembaga"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="recipientType">Jenis Penerima</Label>
              <select
                id="recipientType"
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={formData.recipientType}
                onChange={(e) => setFormData({ ...formData, recipientType: e.target.value as any })}
              >
                <option value="individual">Perorangan</option>
                <option value="mosque">Masjid</option>
                <option value="orphanage">Panti Asuhan</option>
                <option value="institution">Lembaga</option>
                <option value="other">Lainnya</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="receiptNumber">No. Kwitansi</Label>
              <Input
                id="receiptNumber"
                value={formData.receiptNumber}
                onChange={(e) => setFormData({ ...formData, receiptNumber: e.target.value })}
              />
            </div>

            {formData.category === 'zakat' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="nishabAmount">Nilai Nishab</Label>
                  <Input
                    id="nishabAmount"
                    type="number"
                    value={formData.nishabAmount}
                    onChange={(e) => setFormData({ ...formData, nishabAmount: Number(e.target.value) })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="percentageRate">Tarif (%)</Label>
                  <Input
                    id="percentageRate"
                    type="number"
                    step="0.1"
                    value={formData.percentageRate}
                    onChange={(e) => setFormData({ ...formData, percentageRate: Number(e.target.value) })}
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="hijriYear">Tahun Hijriah</Label>
              <Input
                id="hijriYear"
                value={formData.hijriYear}
                onChange={(e) => setFormData({ ...formData, hijriYear: e.target.value })}
                placeholder="1446H"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="hijriMonth">Bulan Hijriah</Label>
              <Input
                id="hijriMonth"
                value={formData.hijriMonth}
                onChange={(e) => setFormData({ ...formData, hijriMonth: e.target.value })}
                placeholder="Ramadan"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Deskripsi</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
            />
          </div>

          {formData.category === 'zakat' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="calculationBasis">Dasar Perhitungan</Label>
                <Input
                  id="calculationBasis"
                  value={formData.calculationBasis}
                  onChange={(e) => setFormData({ ...formData, calculationBasis: e.target.value })}
                  placeholder="Misal: Harta senilai 100 juta"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="calculationNotes">Catatan Perhitungan</Label>
                <Textarea
                  id="calculationNotes"
                  value={formData.calculationNotes}
                  onChange={(e) => setFormData({ ...formData, calculationNotes: e.target.value })}
                  rows={2}
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Catatan</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
            />
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="isAnonymous"
              checked={formData.isAnonymous}
              onChange={(e) => setFormData({ ...formData, isAnonymous: e.target.checked })}
              className="rounded border-gray-300"
            />
            <Label htmlFor="isAnonymous" className="cursor-pointer">
              Anonim (jangan tampilkan nama pemberi)
            </Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={createZakat.isPending || updateZakat.isPending}>
              {record ? "Perbarui" : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
