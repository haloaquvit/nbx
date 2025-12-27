/**
 * React Hook untuk Bluetooth Thermal Printer
 */

import { useState, useCallback, useEffect } from 'react';
import { bluetoothPrintService } from '@/services/bluetoothPrintService';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';

interface PrinterDevice {
  deviceId: string;
  name: string;
}

export function useBluetoothPrinter() {
  const [isScanning, setIsScanning] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [devices, setDevices] = useState<PrinterDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<string | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);

  // Check if Bluetooth is available (only on native platform)
  useEffect(() => {
    setIsAvailable(Capacitor.isNativePlatform());
  }, []);

  // Scan for printers
  const scanForPrinters = useCallback(async () => {
    if (!isAvailable) {
      toast.error('Bluetooth hanya tersedia di aplikasi mobile');
      return;
    }

    setIsScanning(true);
    setDevices([]);

    try {
      const hasPermission = await bluetoothPrintService.requestPermissions();
      if (!hasPermission) {
        toast.error('Izin Bluetooth ditolak');
        return;
      }

      toast.info('Mencari printer...', { duration: 2000 });
      const foundDevices = await bluetoothPrintService.scanForPrinters(10000);
      setDevices(foundDevices);

      if (foundDevices.length === 0) {
        toast.warning('Tidak ada printer ditemukan. Pastikan printer menyala dan dalam mode pairing.');
      } else {
        toast.success(`Ditemukan ${foundDevices.length} perangkat`);
      }
    } catch (error) {
      console.error('Scan error:', error);
      toast.error('Gagal mencari printer. Pastikan Bluetooth aktif.');
    } finally {
      setIsScanning(false);
    }
  }, [isAvailable]);

  // Connect to printer
  const connectToPrinter = useCallback(async (device: PrinterDevice) => {
    setIsConnecting(true);

    try {
      toast.info(`Menghubungkan ke ${device.name}...`);
      await bluetoothPrintService.connectToPrinter(device);
      setConnectedDevice(device.deviceId);
      toast.success(`Terhubung ke ${device.name}`);
      return true;
    } catch (error: any) {
      console.error('Connect error:', error);
      toast.error(error.message || 'Gagal menghubungkan ke printer');
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  // Disconnect
  const disconnect = useCallback(async () => {
    try {
      await bluetoothPrintService.disconnect();
      setConnectedDevice(null);
      toast.success('Printer terputus');
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  }, []);

  // Test print
  const testPrint = useCallback(async () => {
    if (!bluetoothPrintService.isConnected()) {
      toast.error('Printer tidak terhubung');
      return false;
    }

    setIsPrinting(true);
    try {
      await bluetoothPrintService.testPrint();
      toast.success('Test print berhasil');
      return true;
    } catch (error: any) {
      console.error('Print error:', error);
      toast.error(error.message || 'Gagal print');
      return false;
    } finally {
      setIsPrinting(false);
    }
  }, []);

  // Print POS receipt
  const printReceipt = useCallback(async (data: Parameters<typeof bluetoothPrintService.printPOSReceipt>[0]) => {
    if (!bluetoothPrintService.isConnected()) {
      toast.error('Printer tidak terhubung');
      return false;
    }

    setIsPrinting(true);
    try {
      await bluetoothPrintService.printPOSReceipt(data);
      toast.success('Struk berhasil dicetak');
      return true;
    } catch (error: any) {
      console.error('Print error:', error);
      toast.error(error.message || 'Gagal mencetak struk');
      return false;
    } finally {
      setIsPrinting(false);
    }
  }, []);

  // Print custom lines
  const printLines = useCallback(async (lines: string[]) => {
    if (!bluetoothPrintService.isConnected()) {
      toast.error('Printer tidak terhubung');
      return false;
    }

    setIsPrinting(true);
    try {
      await bluetoothPrintService.printReceipt(lines);
      return true;
    } catch (error: any) {
      console.error('Print error:', error);
      toast.error(error.message || 'Gagal print');
      return false;
    } finally {
      setIsPrinting(false);
    }
  }, []);

  // Check connection status
  const isConnected = bluetoothPrintService.isConnected();

  // Get saved printer
  const getSavedPrinter = useCallback(() => {
    return bluetoothPrintService.getSavedPrinterConfig();
  }, []);

  // Clear saved printer
  const clearSavedPrinter = useCallback(() => {
    bluetoothPrintService.clearSavedPrinter();
    toast.success('Printer tersimpan dihapus');
  }, []);

  return {
    // State
    isAvailable,
    isScanning,
    isConnecting,
    isPrinting,
    isConnected,
    devices,
    connectedDevice,

    // Actions
    scanForPrinters,
    connectToPrinter,
    disconnect,
    testPrint,
    printReceipt,
    printLines,
    getSavedPrinter,
    clearSavedPrinter,
  };
}
