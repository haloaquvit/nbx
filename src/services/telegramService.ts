/**
 * Telegram Bot Notification Service
 *
 * Digunakan untuk mengirim notifikasi ke Telegram Bot/Group
 *
 * Setup:
 * 1. Buat bot via @BotFather di Telegram
 * 2. Copy Bot Token yang diberikan
 * 3. Untuk Group: Tambahkan bot ke group, ambil chat_id dengan mengakses:
 *    https://api.telegram.org/bot<TOKEN>/getUpdates
 * 4. Simpan Bot Token dan Chat ID di Settings
 */

import { supabase } from '@/integrations/supabase/client';

interface TelegramSettings {
  botToken: string;
  chatId: string;
  enabled: boolean;
}

interface SendMessageParams {
  message: string;
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
}

class TelegramService {
  private settings: TelegramSettings | null = null;
  private settingsLoaded = false;

  /**
   * Load telegram settings from database
   */
  async loadSettings(): Promise<TelegramSettings | null> {
    if (this.settingsLoaded && this.settings) {
      return this.settings;
    }

    try {
      const { data, error } = await supabase
        .from('company_settings')
        .select('key, value')
        .in('key', ['telegram_bot_token', 'telegram_chat_id', 'telegram_enabled']);

      if (error) {
        console.error('[TelegramService] Failed to load settings:', error);
        return null;
      }

      const settingsMap = data.reduce((acc, { key, value }) => {
        acc[key] = value;
        return acc;
      }, {} as Record<string, string>);

      this.settings = {
        botToken: settingsMap.telegram_bot_token || '',
        chatId: settingsMap.telegram_chat_id || '',
        enabled: settingsMap.telegram_enabled === 'true',
      };
      this.settingsLoaded = true;

      return this.settings;
    } catch (err) {
      console.error('[TelegramService] Error loading settings:', err);
      return null;
    }
  }

  /**
   * Clear cached settings (call when settings are updated)
   */
  clearCache(): void {
    this.settings = null;
    this.settingsLoaded = false;
  }

  /**
   * Check if telegram notification is configured and enabled
   */
  async isEnabled(): Promise<boolean> {
    const settings = await this.loadSettings();
    return !!(settings?.enabled && settings?.botToken && settings?.chatId);
  }

  /**
   * Send message to Telegram
   */
  async sendMessage({ message, parseMode = 'HTML' }: SendMessageParams): Promise<boolean> {
    const settings = await this.loadSettings();

    if (!settings?.enabled || !settings?.botToken || !settings?.chatId) {
      console.log('[TelegramService] Telegram not configured or disabled');
      return false;
    }

    try {
      const url = `https://api.telegram.org/bot${settings.botToken}/sendMessage`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: settings.chatId,
          text: message,
          parse_mode: parseMode,
        }),
      });

      const result = await response.json();

      if (!result.ok) {
        console.error('[TelegramService] Failed to send message:', result);
        return false;
      }

      console.log('[TelegramService] Message sent successfully');
      return true;
    } catch (err) {
      console.error('[TelegramService] Error sending message:', err);
      return false;
    }
  }

  /**
   * Send notification for new transaction
   */
  async notifyNewTransaction(data: {
    transactionNo: string;
    customerName: string;
    total: number;
    paymentStatus: string;
    createdBy: string;
  }): Promise<boolean> {
    const { transactionNo, customerName, total, paymentStatus, createdBy } = data;

    const statusEmoji = paymentStatus === 'Lunas' ? '✅' : '🕐';
    const message = `
<b>🛒 Transaksi Baru</b>

No: <code>${transactionNo}</code>
Pelanggan: ${customerName}
Total: <b>Rp ${total.toLocaleString('id-ID')}</b>
Status: ${statusEmoji} ${paymentStatus}
Oleh: ${createdBy}
    `.trim();

    return this.sendMessage({ message });
  }

  /**
   * Send notification for new quotation
   */
  async notifyNewQuotation(data: {
    quotationNo: string;
    customerName: string;
    total: number;
    createdBy: string;
  }): Promise<boolean> {
    const { quotationNo, customerName, total, createdBy } = data;

    const message = `
<b>📝 Penawaran Baru</b>

No: <code>${quotationNo}</code>
Pelanggan: ${customerName}
Total: <b>Rp ${total.toLocaleString('id-ID')}</b>
Oleh: ${createdBy}
    `.trim();

    return this.sendMessage({ message });
  }

  /**
   * Send notification for quotation converted to invoice
   */
  async notifyQuotationConverted(data: {
    quotationNo: string;
    transactionNo: string;
    customerName: string;
    total: number;
    convertedBy: string;
  }): Promise<boolean> {
    const { quotationNo, transactionNo, customerName, total, convertedBy } = data;

    const message = `
<b>✅ Penawaran Disetujui</b>

Penawaran: <code>${quotationNo}</code>
Invoice: <code>${transactionNo}</code>
Pelanggan: ${customerName}
Total: <b>Rp ${total.toLocaleString('id-ID')}</b>
Oleh: ${convertedBy}
    `.trim();

    return this.sendMessage({ message });
  }

  /**
   * Send notification for payment received
   */
  async notifyPaymentReceived(data: {
    transactionNo: string;
    customerName: string;
    amount: number;
    paymentMethod: string;
    receivedBy: string;
  }): Promise<boolean> {
    const { transactionNo, customerName, amount, paymentMethod, receivedBy } = data;

    const message = `
<b>💰 Pembayaran Diterima</b>

Invoice: <code>${transactionNo}</code>
Pelanggan: ${customerName}
Jumlah: <b>Rp ${amount.toLocaleString('id-ID')}</b>
Metode: ${paymentMethod}
Diterima: ${receivedBy}
    `.trim();

    return this.sendMessage({ message });
  }

  /**
   * Send notification for low stock alert
   */
  async notifyLowStock(data: {
    productName: string;
    currentStock: number;
    minStock: number;
  }): Promise<boolean> {
    const { productName, currentStock, minStock } = data;

    const message = `
<b>⚠️ Stok Menipis</b>

Produk: ${productName}
Stok Sekarang: <b>${currentStock}</b>
Stok Minimum: ${minStock}

Segera lakukan pembelian/produksi!
    `.trim();

    return this.sendMessage({ message });
  }

  /**
   * Send notification for due payment reminder
   */
  async notifyDuePayment(data: {
    transactionNo: string;
    customerName: string;
    dueDate: string;
    amount: number;
    daysOverdue: number;
  }): Promise<boolean> {
    const { transactionNo, customerName, dueDate, amount, daysOverdue } = data;

    const emoji = daysOverdue > 0 ? '🔴' : '🟡';
    const statusText = daysOverdue > 0
      ? `Terlambat ${daysOverdue} hari`
      : 'Jatuh tempo hari ini';

    const message = `
<b>${emoji} Piutang Jatuh Tempo</b>

Invoice: <code>${transactionNo}</code>
Pelanggan: ${customerName}
Jatuh Tempo: ${dueDate}
Jumlah: <b>Rp ${amount.toLocaleString('id-ID')}</b>
Status: ${statusText}
    `.trim();

    return this.sendMessage({ message });
  }

  /**
   * Test telegram connection
   */
  async testConnection(botToken: string, chatId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: '✅ Koneksi Telegram berhasil!\n\nBot ini akan mengirim notifikasi dari AQUVIT ERP.',
          parse_mode: 'HTML',
        }),
      });

      const result = await response.json();

      if (!result.ok) {
        return {
          success: false,
          error: result.description || 'Unknown error'
        };
      }

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error'
      };
    }
  }
}

// Export singleton instance
export const telegramService = new TelegramService();
