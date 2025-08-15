"use client"
import * as React from "react"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { format } from "date-fns"
import { id } from "date-fns/locale/id"
import { Calendar as CalendarIcon, FileDown } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { CashHistory } from "@/types/cashFlow"
import { supabase } from "@/integrations/supabase/client"

interface DateRangeReportPDFProps {
  cashHistory: CashHistory[];
}

// Helper function to determine if record is income
const isIncomeType = (item: CashHistory) => {
  // Transfers are displayed based on their direction but don't affect total income/expense
  if (item.source_type === 'transfer_masuk') {
    return true;
  }
  if (item.source_type === 'transfer_keluar') {
    return false;
  }
  
  if (item.type) {
    return ['orderan', 'kas_masuk_manual', 'panjar_pelunasan', 'pemutihan_piutang'].includes(item.type);
  }
  if (item.transaction_type) {
    return item.transaction_type === 'income';
  }
  return false;
};

// Helper function to get transaction type label
const getTypeLabel = (item: CashHistory) => {
  // Handle transfers first
  if (item.source_type === 'transfer_masuk') {
    return 'Transfer Masuk';
  } else if (item.source_type === 'transfer_keluar') {
    return 'Transfer Keluar';
  }

  if (item.type) {
    const labels = {
      'orderan': 'Orderan',
      'kas_masuk_manual': 'Kas Masuk Manual',
      'kas_keluar_manual': 'Kas Keluar Manual',
      'panjar_pengambilan': 'Panjar Pengambilan',
      'panjar_pelunasan': 'Panjar Pelunasan',
      'pengeluaran': 'Pengeluaran',
      'pembayaran_po': 'Pembayaran PO',
      'pemutihan_piutang': 'Pembayaran Piutang',
      'transfer_masuk': 'Transfer Masuk',
      'transfer_keluar': 'Transfer Keluar'
    };
    return labels[item.type as keyof typeof labels] || item.type;
  }
  
  if (item.source_type) {
    switch (item.source_type) {
      case 'receivables_payment': return 'Pembayaran Piutang';
      case 'pos_direct': return 'Penjualan (POS)';
      case 'manual_expense': return 'Pengeluaran Manual';
      case 'employee_advance': return 'Panjar Karyawan';
      case 'po_payment': return 'Pembayaran PO';
      case 'receivables_writeoff': return 'Pemutihan Piutang';
      case 'transfer_masuk': return 'Transfer Masuk';
      case 'transfer_keluar': return 'Transfer Keluar';
      default: return item.source_type;
    }
  }
  
  if (item.transaction_type) {
    return item.transaction_type === 'income' ? 'Kas Masuk' : 'Kas Keluar';
  }
  
  return 'Tidak Diketahui';
};

export function DateRangeReportPDF({ cashHistory }: DateRangeReportPDFProps) {
  const [selectedDate, setSelectedDate] = React.useState<Date>(new Date());
  const [isCalendarOpen, setIsCalendarOpen] = React.useState(false);

  // Calculate data for selected date using accounts table + cash history (same as dashboard)
  const calculateDataForDate = async (targetDate: Date) => {
    const dateStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const dateEnd = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1);

    // Get current account balances from accounts table
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, name, balance')
      .order('name');

    if (accountsError) {
      throw new Error(`Failed to fetch accounts: ${accountsError.message}`);
    }

    // Filter transactions for selected date
    const dateTransactions = cashHistory.filter(item => {
      const itemDate = new Date(item.date || item.created_at);
      return itemDate >= dateStart && itemDate < dateEnd;
    });

    // Initialize tracking variables
    let dateIncome = 0;
    let dateExpense = 0;
    let totalBalance = 0;
    const accountBalances = new Map();

    // Initialize account data with current balances from accounts table
    (accounts || []).forEach(account => {
      accountBalances.set(account.id, {
        accountId: account.id,
        accountName: account.name,
        currentBalance: account.balance || 0,
        previousBalance: 0,
        dateIncome: 0,
        dateExpense: 0,
        dateNet: 0,
        todayChange: 0
      });
      totalBalance += account.balance || 0;
    });

    // Calculate for selected date
    dateTransactions.forEach(item => {
      // Skip transfers in total calculation (they don't change total cash, only move between accounts)
      if (item.source_type === 'transfer_masuk' || item.source_type === 'transfer_keluar') {
        // Still update per-account data for transfers
        if (item.account_id && accountBalances.has(item.account_id)) {
          const current = accountBalances.get(item.account_id);
          if (item.source_type === 'transfer_masuk') {
            current.dateIncome += item.amount;
          } else if (item.source_type === 'transfer_keluar') {
            current.dateExpense += item.amount;
          }
          current.dateNet = current.dateIncome - current.dateExpense;
          current.todayChange = current.dateNet;
        }
        return; // Skip adding to total income/expense
      }

      const isIncome = isIncomeType(item);
      if (isIncome) {
        dateIncome += item.amount;
      } else {
        dateExpense += item.amount;
      }

      // Update account data for the date
      if (item.account_id && accountBalances.has(item.account_id)) {
        const current = accountBalances.get(item.account_id);
        if (isIncome) {
          current.dateIncome += item.amount;
        } else {
          current.dateExpense += item.amount;
        }
        current.dateNet = current.dateIncome - current.dateExpense;
        current.todayChange = current.dateNet;
      }
    });

    // Calculate totals based on accounts table + selected date activity
    const dateNet = dateIncome - dateExpense;
    const totalPreviousBalance = totalBalance - dateNet;

    // Calculate previous balance for each account
    accountBalances.forEach(account => {
      account.previousBalance = account.currentBalance - account.dateNet;
    });

    return {
      dateIncome,
      dateExpense,
      dateNet,
      currentBalance: totalBalance,
      previousBalance: totalPreviousBalance,
      dateTransactions,
      accountBalances: Array.from(accountBalances.values())
    };
  };

  const generatePDF = async () => {
    try {
      const data = await calculateDataForDate(selectedDate);
      const doc = new jsPDF('p', 'mm', 'a4');
    
      // Company header
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('LAPORAN KEUANGAN HARIAN', 105, 20, { align: 'center' });
      
      doc.setFontSize(14);
      doc.setFont('helvetica', 'normal');
      doc.text(`Tanggal: ${format(selectedDate, 'dd MMMM yyyy', { locale: id })}`, 105, 30, { align: 'center' });
      
      // Add line separator
      doc.setLineWidth(0.5);
      doc.line(20, 35, 190, 35);
      
      let currentY = 45;

      // Summary Section
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('RINGKASAN KEUANGAN', 20, currentY);
      currentY += 10;

      // Summary data
      const summaryData = [
        ['Saldo Sebelumnya', formatCurrency(data.previousBalance)],
        ['Kas Masuk Hari Ini', formatCurrency(data.dateIncome)],
        ['Kas Keluar Hari Ini', formatCurrency(data.dateExpense)],
        ['Arus Kas Bersih', formatCurrency(data.dateNet)],
        ['Saldo Saat Ini', formatCurrency(data.currentBalance)]
      ];

      autoTable(doc, {
        startY: currentY,
        head: [['Keterangan', 'Jumlah']],
        body: summaryData,
        theme: 'grid',
        headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255] },
        styles: { fontSize: 11 },
        columnStyles: {
          0: { cellWidth: 80 },
          1: { cellWidth: 80, halign: 'right' }
        }
      });

      currentY = (doc as any).lastAutoTable.finalY + 15;

      // Account Balances Section
      if (data.accountBalances.length > 0) {
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('SALDO PER AKUN', 20, currentY);
        currentY += 10;

        const accountData = data.accountBalances.map(account => [
          account.accountName,
          formatCurrency(account.previousBalance),
          formatCurrency(account.dateIncome),
          formatCurrency(account.dateExpense),
          formatCurrency(account.dateNet),
          formatCurrency(account.currentBalance)
        ]);

        autoTable(doc, {
          startY: currentY,
          head: [['Akun', 'Saldo Sebelumnya', 'Masuk', 'Keluar', 'Net', 'Saldo Saat Ini']],
          body: accountData,
          theme: 'grid',
          headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255] },
          styles: { fontSize: 9 },
          columnStyles: {
            0: { cellWidth: 35 },
            1: { cellWidth: 30, halign: 'right' },
            2: { cellWidth: 25, halign: 'right' },
            3: { cellWidth: 25, halign: 'right' },
            4: { cellWidth: 25, halign: 'right' },
            5: { cellWidth: 30, halign: 'right' }
          }
        });
      }

      // Start new page for transactions
      doc.addPage();
      currentY = 20;

      // Transactions Section
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(`DETAIL TRANSAKSI - ${format(selectedDate, 'dd MMMM yyyy', { locale: id })}`, 20, currentY);
      currentY += 10;

      if (data.dateTransactions.length === 0) {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.text('Tidak ada transaksi pada tanggal ini.', 20, currentY);
      } else {
        // Income transactions
        const incomeTransactions = data.dateTransactions.filter(isIncomeType);
        const expenseTransactions = data.dateTransactions.filter(item => !isIncomeType(item));

        if (incomeTransactions.length > 0) {
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.text('KAS MASUK', 20, currentY);
          currentY += 7;

          const incomeData = incomeTransactions.map(item => [
            format(new Date(item.created_at), 'HH:mm', { locale: id }),
            item.account_name || '-',
            getTypeLabel(item),
            item.description || '-',
            formatCurrency(item.amount)
          ]);

          autoTable(doc, {
            startY: currentY,
            head: [['Waktu', 'Akun', 'Jenis', 'Deskripsi', 'Jumlah']],
            body: incomeData,
            theme: 'striped',
            headStyles: { fillColor: [34, 197, 94], textColor: [255, 255, 255] },
            styles: { fontSize: 9 },
            columnStyles: {
              0: { cellWidth: 20 },
              1: { cellWidth: 35 },
              2: { cellWidth: 35 },
              3: { cellWidth: 70 },
              4: { cellWidth: 30, halign: 'right' }
            }
          });

          currentY = (doc as any).lastAutoTable.finalY + 10;
        }

        if (expenseTransactions.length > 0) {
          // Check if we need a new page
          if (currentY > 250) {
            doc.addPage();
            currentY = 20;
          }

          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.text('KAS KELUAR', 20, currentY);
          currentY += 7;

          const expenseData = expenseTransactions.map(item => [
            format(new Date(item.created_at), 'HH:mm', { locale: id }),
            item.account_name || '-',
            getTypeLabel(item),
            item.description || '-',
            formatCurrency(item.amount)
          ]);

          autoTable(doc, {
            startY: currentY,
            head: [['Waktu', 'Akun', 'Jenis', 'Deskripsi', 'Jumlah']],
            body: expenseData,
            theme: 'striped',
            headStyles: { fillColor: [239, 68, 68], textColor: [255, 255, 255] },
            styles: { fontSize: 9 },
            columnStyles: {
              0: { cellWidth: 20 },
              1: { cellWidth: 35 },
              2: { cellWidth: 35 },
              3: { cellWidth: 70 },
              4: { cellWidth: 30, halign: 'right' }
            }
          });
        }
      }

      // Footer
      const pageCount = doc.internal.pages.length - 1;
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(
          `Dicetak pada: ${format(new Date(), 'dd MMMM yyyy HH:mm', { locale: id })}`,
          20, 287
        );
        doc.text(`Halaman ${i} dari ${pageCount}`, 190, 287, { align: 'right' });
      }

      // Save the PDF
      const fileName = `laporan-keuangan-${format(selectedDate, 'yyyy-MM-dd')}.pdf`;
      doc.save(fileName);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Terjadi kesalahan saat menghasilkan PDF. Silakan coba lagi.');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="flex items-center gap-2">
      <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "justify-start text-left font-normal",
              !selectedDate && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {selectedDate ? format(selectedDate, "dd MMM yyyy", { locale: id }) : "Pilih tanggal"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => {
              if (date) {
                setSelectedDate(date);
                setIsCalendarOpen(false);
              }
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>

      <Button onClick={generatePDF} variant="default" size="sm">
        <FileDown className="mr-2 h-4 w-4" />
        Cetak Laporan PDF
      </Button>
    </div>
  );
}