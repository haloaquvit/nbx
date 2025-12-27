/**
 * Bluetooth Thermal Printer Service
 * Menggunakan @capacitor-community/bluetooth-le untuk print ke thermal printer
 */

import { BleClient, BleDevice, numberToUUID } from '@capacitor-community/bluetooth-le';
import { Capacitor } from '@capacitor/core';

// Standard UUIDs untuk Serial Port Profile (SPP) - kebanyakan thermal printer pakai ini
const PRINTER_SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';
const PRINTER_CHARACTERISTIC_UUID = '00002af1-0000-1000-8000-00805f9b34fb';

// Alternative UUIDs yang umum dipakai thermal printer
const ALT_SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Microchip
  '0000ff00-0000-1000-8000-00805f9b34fb', // Generic
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 module
];

const ALT_CHARACTERISTIC_UUIDS = [
  '00002af1-0000-1000-8000-00805f9b34fb',
  '49535343-8841-43f4-a8d4-ecbe34729bb3',
  '0000ff02-0000-1000-8000-00805f9b34fb',
  '0000ffe1-0000-1000-8000-00805f9b34fb',
];

// ESC/POS Commands
const ESC = 0x1B;
const GS = 0x1D;
const LF = 0x0A;

export const ESC_POS = {
  // Initialize printer
  INIT: new Uint8Array([ESC, 0x40]),

  // Text alignment
  ALIGN_LEFT: new Uint8Array([ESC, 0x61, 0x00]),
  ALIGN_CENTER: new Uint8Array([ESC, 0x61, 0x01]),
  ALIGN_RIGHT: new Uint8Array([ESC, 0x61, 0x02]),

  // Text size
  TEXT_NORMAL: new Uint8Array([GS, 0x21, 0x00]),
  TEXT_DOUBLE_HEIGHT: new Uint8Array([GS, 0x21, 0x01]),
  TEXT_DOUBLE_WIDTH: new Uint8Array([GS, 0x21, 0x10]),
  TEXT_DOUBLE: new Uint8Array([GS, 0x21, 0x11]),

  // Text style
  BOLD_ON: new Uint8Array([ESC, 0x45, 0x01]),
  BOLD_OFF: new Uint8Array([ESC, 0x45, 0x00]),
  UNDERLINE_ON: new Uint8Array([ESC, 0x2D, 0x01]),
  UNDERLINE_OFF: new Uint8Array([ESC, 0x2D, 0x00]),

  // Paper
  CUT_PAPER: new Uint8Array([GS, 0x56, 0x00]), // Full cut
  CUT_PAPER_PARTIAL: new Uint8Array([GS, 0x56, 0x01]), // Partial cut
  FEED_LINE: new Uint8Array([LF]),
  FEED_LINES: (n: number) => new Uint8Array([ESC, 0x64, n]),
};

interface PrinterDevice {
  deviceId: string;
  name: string;
  serviceUUID?: string;
  characteristicUUID?: string;
}

interface PrinterConfig {
  deviceId: string;
  serviceUUID: string;
  characteristicUUID: string;
}

const STORAGE_KEY = 'bluetooth_printer_config';

class BluetoothPrintService {
  private isInitialized = false;
  private connectedPrinter: PrinterConfig | null = null;

  /**
   * Initialize Bluetooth
   */
  async initialize(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      throw new Error('Bluetooth hanya tersedia di aplikasi mobile');
    }

    if (this.isInitialized) return;

    try {
      await BleClient.initialize();
      this.isInitialized = true;

      // Try to restore saved printer
      this.loadSavedPrinter();
    } catch (error) {
      console.error('Failed to initialize Bluetooth:', error);
      throw new Error('Gagal menginisialisasi Bluetooth. Pastikan Bluetooth aktif.');
    }
  }

  /**
   * Request Bluetooth permissions
   */
  async requestPermissions(): Promise<boolean> {
    try {
      await BleClient.requestLEScan({ allowDuplicates: false }, () => {});
      await BleClient.stopLEScan();
      return true;
    } catch (error) {
      console.error('Bluetooth permission denied:', error);
      return false;
    }
  }

  /**
   * Scan for available Bluetooth printers
   */
  async scanForPrinters(timeout = 10000): Promise<PrinterDevice[]> {
    await this.initialize();

    const devices: PrinterDevice[] = [];
    const seenIds = new Set<string>();

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(async () => {
        await BleClient.stopLEScan();
        resolve(devices);
      }, timeout);

      BleClient.requestLEScan(
        {
          allowDuplicates: false,
        },
        (result) => {
          if (result.device.deviceId && !seenIds.has(result.device.deviceId)) {
            seenIds.add(result.device.deviceId);

            // Filter untuk printer (biasanya ada "print" di nama atau nama tertentu)
            const name = result.device.name || result.localName || 'Unknown Device';
            const isPrinterLikely =
              name.toLowerCase().includes('print') ||
              name.toLowerCase().includes('pos') ||
              name.toLowerCase().includes('thermal') ||
              name.toLowerCase().includes('bt') ||
              name.toLowerCase().includes('spp') ||
              name.startsWith('RPP') || // Common thermal printer prefix
              name.startsWith('PT-') ||
              name.startsWith('MTP-') ||
              name.startsWith('MP-');

            devices.push({
              deviceId: result.device.deviceId,
              name: name,
            });
          }
        }
      ).catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  /**
   * Connect to a printer
   */
  async connectToPrinter(device: PrinterDevice): Promise<boolean> {
    await this.initialize();

    try {
      // Disconnect existing connection if any
      if (this.connectedPrinter) {
        await this.disconnect();
      }

      // Connect to device
      await BleClient.connect(device.deviceId, (deviceId) => {
        console.log('Printer disconnected:', deviceId);
        this.connectedPrinter = null;
      });

      // Discover services
      const services = await BleClient.getServices(device.deviceId);

      let foundService: string | null = null;
      let foundCharacteristic: string | null = null;

      // Find compatible service and characteristic
      for (const service of services) {
        const serviceUUID = service.uuid.toLowerCase();

        for (const altService of ALT_SERVICE_UUIDS) {
          if (serviceUUID.includes(altService.substring(4, 8).toLowerCase())) {
            foundService = service.uuid;

            // Find write characteristic
            for (const char of service.characteristics) {
              const props = char.properties;
              if (props.write || props.writeWithoutResponse) {
                foundCharacteristic = char.uuid;
                break;
              }
            }

            if (foundCharacteristic) break;
          }
        }

        if (foundService && foundCharacteristic) break;
      }

      // Fallback: use first writable characteristic
      if (!foundCharacteristic) {
        for (const service of services) {
          for (const char of service.characteristics) {
            if (char.properties.write || char.properties.writeWithoutResponse) {
              foundService = service.uuid;
              foundCharacteristic = char.uuid;
              break;
            }
          }
          if (foundCharacteristic) break;
        }
      }

      if (!foundService || !foundCharacteristic) {
        await BleClient.disconnect(device.deviceId);
        throw new Error('Printer tidak kompatibel. Service tidak ditemukan.');
      }

      this.connectedPrinter = {
        deviceId: device.deviceId,
        serviceUUID: foundService,
        characteristicUUID: foundCharacteristic,
      };

      // Save for auto-reconnect
      this.savePrinter();

      return true;
    } catch (error) {
      console.error('Failed to connect to printer:', error);
      throw error;
    }
  }

  /**
   * Disconnect from printer
   */
  async disconnect(): Promise<void> {
    if (this.connectedPrinter) {
      try {
        await BleClient.disconnect(this.connectedPrinter.deviceId);
      } catch (error) {
        console.error('Error disconnecting:', error);
      }
      this.connectedPrinter = null;
    }
  }

  /**
   * Check if printer is connected
   */
  isConnected(): boolean {
    return this.connectedPrinter !== null;
  }

  /**
   * Get connected printer info
   */
  getConnectedPrinter(): PrinterConfig | null {
    return this.connectedPrinter;
  }

  /**
   * Write raw data to printer
   */
  async writeRaw(data: Uint8Array): Promise<void> {
    if (!this.connectedPrinter) {
      throw new Error('Printer tidak terhubung');
    }

    try {
      // Split data into chunks (BLE has MTU limit, usually 20 bytes for compatibility)
      const chunkSize = 20;
      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, Math.min(i + chunkSize, data.length));
        await BleClient.write(
          this.connectedPrinter.deviceId,
          this.connectedPrinter.serviceUUID,
          this.connectedPrinter.characteristicUUID,
          new DataView(chunk.buffer)
        );
        // Small delay between chunks
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    } catch (error) {
      console.error('Failed to write to printer:', error);
      throw new Error('Gagal mengirim data ke printer');
    }
  }

  /**
   * Print text
   */
  async printText(text: string): Promise<void> {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    await this.writeRaw(new Uint8Array([...data, LF]));
  }

  /**
   * Print receipt
   */
  async printReceipt(lines: string[]): Promise<void> {
    // Initialize printer
    await this.writeRaw(ESC_POS.INIT);

    for (const line of lines) {
      await this.printText(line);
    }

    // Feed and cut
    await this.writeRaw(ESC_POS.FEED_LINES(3));
    await this.writeRaw(ESC_POS.CUT_PAPER_PARTIAL);
  }

  /**
   * Print formatted receipt (for POS transactions)
   */
  async printPOSReceipt(data: {
    storeName: string;
    storeAddress?: string;
    transactionNo: string;
    date: string;
    cashier: string;
    items: Array<{
      name: string;
      qty: number;
      price: number;
      total: number;
    }>;
    subtotal: number;
    discount?: number;
    tax?: number;
    total: number;
    payment: number;
    change: number;
    paymentMethod: string;
    notes?: string;
  }): Promise<void> {
    await this.writeRaw(ESC_POS.INIT);

    // Header - Store name (centered, bold, double size)
    await this.writeRaw(ESC_POS.ALIGN_CENTER);
    await this.writeRaw(ESC_POS.TEXT_DOUBLE);
    await this.writeRaw(ESC_POS.BOLD_ON);
    await this.printText(data.storeName);
    await this.writeRaw(ESC_POS.BOLD_OFF);
    await this.writeRaw(ESC_POS.TEXT_NORMAL);

    if (data.storeAddress) {
      await this.printText(data.storeAddress);
    }

    await this.printText('--------------------------------');

    // Transaction info
    await this.writeRaw(ESC_POS.ALIGN_LEFT);
    await this.printText(`No: ${data.transactionNo}`);
    await this.printText(`Tgl: ${data.date}`);
    await this.printText(`Kasir: ${data.cashier}`);
    await this.printText('--------------------------------');

    // Items
    for (const item of data.items) {
      await this.printText(item.name);
      const itemLine = `${item.qty} x ${this.formatCurrency(item.price)}`;
      const totalStr = this.formatCurrency(item.total);
      await this.printText(this.padLine(itemLine, totalStr, 32));
    }

    await this.printText('--------------------------------');

    // Totals
    await this.printText(this.padLine('Subtotal:', this.formatCurrency(data.subtotal), 32));

    if (data.discount && data.discount > 0) {
      await this.printText(this.padLine('Diskon:', `-${this.formatCurrency(data.discount)}`, 32));
    }

    if (data.tax && data.tax > 0) {
      await this.printText(this.padLine('Pajak:', this.formatCurrency(data.tax), 32));
    }

    await this.writeRaw(ESC_POS.BOLD_ON);
    await this.writeRaw(ESC_POS.TEXT_DOUBLE_HEIGHT);
    await this.printText(this.padLine('TOTAL:', this.formatCurrency(data.total), 32));
    await this.writeRaw(ESC_POS.TEXT_NORMAL);
    await this.writeRaw(ESC_POS.BOLD_OFF);

    await this.printText('--------------------------------');
    await this.printText(this.padLine(`${data.paymentMethod}:`, this.formatCurrency(data.payment), 32));
    await this.printText(this.padLine('Kembali:', this.formatCurrency(data.change), 32));

    if (data.notes) {
      await this.printText('--------------------------------');
      await this.printText(`Catatan: ${data.notes}`);
    }

    // Footer
    await this.printText('--------------------------------');
    await this.writeRaw(ESC_POS.ALIGN_CENTER);
    await this.printText('Terima Kasih');
    await this.printText('Atas Kunjungan Anda');

    // Feed and cut
    await this.writeRaw(ESC_POS.FEED_LINES(4));
    await this.writeRaw(ESC_POS.CUT_PAPER_PARTIAL);
  }

  /**
   * Test print
   */
  async testPrint(): Promise<void> {
    await this.writeRaw(ESC_POS.INIT);
    await this.writeRaw(ESC_POS.ALIGN_CENTER);
    await this.writeRaw(ESC_POS.TEXT_DOUBLE);
    await this.printText('TEST PRINT');
    await this.writeRaw(ESC_POS.TEXT_NORMAL);
    await this.printText('--------------------------------');
    await this.printText('Printer berhasil terhubung!');
    await this.printText(new Date().toLocaleString('id-ID'));
    await this.printText('--------------------------------');
    await this.writeRaw(ESC_POS.FEED_LINES(3));
    await this.writeRaw(ESC_POS.CUT_PAPER_PARTIAL);
  }

  // Helper methods
  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('id-ID').format(amount);
  }

  private padLine(left: string, right: string, width: number): string {
    const spaces = width - left.length - right.length;
    return left + ' '.repeat(Math.max(1, spaces)) + right;
  }

  private savePrinter(): void {
    if (this.connectedPrinter) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.connectedPrinter));
    }
  }

  private loadSavedPrinter(): void {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        // Just store config, actual reconnect needs user action
        console.log('Saved printer config found');
      }
    } catch (error) {
      console.error('Failed to load saved printer:', error);
    }
  }

  getSavedPrinterConfig(): PrinterConfig | null {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  }

  clearSavedPrinter(): void {
    localStorage.removeItem(STORAGE_KEY);
  }
}

// Export singleton instance
export const bluetoothPrintService = new BluetoothPrintService();
