/**
 * Utility untuk mendapatkan waktu berdasarkan timezone kantor
 *
 * Indonesia Timezones:
 * - Asia/Jakarta (WIB - UTC+7): Sumatera, Jawa, Kalimantan Barat & Tengah
 * - Asia/Makassar (WITA - UTC+8): Kalimantan Timur & Selatan, Sulawesi, Bali, NTB, NTT
 * - Asia/Jayapura (WIT - UTC+9): Papua, Maluku
 */

export type IndonesiaTimezone = 'Asia/Jakarta' | 'Asia/Makassar' | 'Asia/Jayapura';

export const INDONESIA_TIMEZONES: { value: IndonesiaTimezone; label: string; offset: string }[] = [
  { value: 'Asia/Jakarta', label: 'WIB (Waktu Indonesia Barat)', offset: 'UTC+7' },
  { value: 'Asia/Makassar', label: 'WITA (Waktu Indonesia Tengah)', offset: 'UTC+8' },
  { value: 'Asia/Jayapura', label: 'WIT (Waktu Indonesia Timur)', offset: 'UTC+9' },
];

/**
 * Mendapatkan waktu saat ini berdasarkan timezone kantor
 */
export function getOfficeTime(timezone: string = 'Asia/Jakarta'): Date {
  // Dapatkan waktu UTC saat ini
  const now = new Date();

  // Format ke timezone yang diinginkan
  const options: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  };

  const formatter = new Intl.DateTimeFormat('en-CA', options);
  const parts = formatter.formatToParts(now);

  const dateParts: Record<string, string> = {};
  parts.forEach(part => {
    dateParts[part.type] = part.value;
  });

  // Buat Date object baru dengan waktu kantor
  return new Date(
    parseInt(dateParts.year),
    parseInt(dateParts.month) - 1,
    parseInt(dateParts.day),
    parseInt(dateParts.hour),
    parseInt(dateParts.minute),
    parseInt(dateParts.second)
  );
}

/**
 * Format waktu ke string dengan timezone kantor
 */
export function formatOfficeTime(date: Date, timezone: string = 'Asia/Jakarta', formatOptions?: Intl.DateTimeFormatOptions): string {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...formatOptions,
  };

  return new Intl.DateTimeFormat('id-ID', defaultOptions).format(date);
}

/**
 * Format tanggal saja (tanpa waktu) dengan timezone kantor
 */
export function formatOfficeDate(date: Date, timezone: string = 'Asia/Jakarta'): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: timezone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/**
 * Format waktu saja (jam:menit) dengan timezone kantor
 */
export function formatOfficeTimeOnly(date: Date, timezone: string = 'Asia/Jakarta'): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * Mendapatkan tanggal hari ini di timezone kantor (untuk default input form)
 */
export function getOfficeDateString(timezone: string = 'Asia/Jakarta'): string {
  const now = new Date();
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Mendapatkan tanggal dengan offset hari di timezone kantor
 * @param offsetDays - jumlah hari offset (negatif untuk hari lalu, positif untuk hari depan)
 * @param timezone - timezone kantor
 */
export function getOfficeDateWithOffset(offsetDays: number, timezone: string = 'Asia/Jakarta'): string {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Safe format date - handles null, undefined, and invalid dates
 * Returns '-' if date is invalid
 */
export function safeFormatDate(
  date: Date | string | null | undefined,
  timezone: string = 'Asia/Jakarta',
  options?: Intl.DateTimeFormatOptions
): string {
  if (!date) return '-';

  try {
    const dateObj = date instanceof Date ? date : new Date(date);

    // Check if date is valid
    if (isNaN(dateObj.getTime())) return '-';

    const defaultOptions: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      ...options,
    };

    return new Intl.DateTimeFormat('id-ID', defaultOptions).format(dateObj);
  } catch {
    return '-';
  }
}

/**
 * Safe format date only (no time)
 */
export function safeFormatDateOnly(
  date: Date | string | null | undefined,
  timezone: string = 'Asia/Jakarta'
): string {
  return safeFormatDate(date, timezone, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: undefined,
    minute: undefined,
  });
}

/**
 * Safe format time only
 */
export function safeFormatTimeOnly(
  date: Date | string | null | undefined,
  timezone: string = 'Asia/Jakarta'
): string {
  return safeFormatDate(date, timezone, {
    day: undefined,
    month: undefined,
    year: undefined,
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Konversi tanggal string (YYYY-MM-DD) ke Date dengan start of day di timezone kantor
 * Menghasilkan Date yang benar untuk query database dengan filter >=
 *
 * Contoh: dateString='2025-12-31', timezone='Asia/Jakarta' (UTC+7)
 * Hasil: Date yang merepresentasikan 2025-12-31 00:00:00 WIB = 2025-12-30T17:00:00.000Z
 */
export function toOfficeStartOfDay(dateString: string, timezone: string = 'Asia/Jakarta'): Date {
  // Dapatkan offset UTC untuk timezone dalam jam
  const offsetHours = getTimezoneOffsetHours(timezone);

  // Parse tanggal dari string format YYYY-MM-DD
  const [year, month, day] = dateString.split('-').map(Number);

  // Buat date di UTC dengan kompensasi offset
  // Jika timezone UTC+7, untuk mendapatkan 00:00 WIB kita perlu 00:00 - 7 jam = -7 jam = kemarin 17:00 UTC
  const utcDate = new Date(Date.UTC(year, month - 1, day, -offsetHours, 0, 0, 0));

  return utcDate;
}

/**
 * Konversi tanggal string (YYYY-MM-DD) ke Date dengan end of day di timezone kantor
 * Menghasilkan Date yang benar untuk query database dengan filter <=
 *
 * Contoh: dateString='2025-12-31', timezone='Asia/Jakarta' (UTC+7)
 * Hasil: Date yang merepresentasikan 2025-12-31 23:59:59.999 WIB = 2025-12-31T16:59:59.999Z
 */
export function toOfficeEndOfDay(dateString: string, timezone: string = 'Asia/Jakarta'): Date {
  // Dapatkan offset UTC untuk timezone dalam jam
  const offsetHours = getTimezoneOffsetHours(timezone);

  // Parse tanggal dari string format YYYY-MM-DD
  const [year, month, day] = dateString.split('-').map(Number);

  // Buat date di UTC dengan kompensasi offset
  // Jika timezone UTC+7, untuk mendapatkan 23:59 WIB kita perlu 23:59 - 7 jam = 16:59 UTC
  const utcDate = new Date(Date.UTC(year, month - 1, day, 23 - offsetHours, 59, 59, 999));

  return utcDate;
}

/**
 * Mendapatkan offset timezone dari UTC dalam jam (integer)
 * Menggunakan lookup table untuk Indonesia timezones
 *
 * @returns offset dalam jam (7 untuk WIB, 8 untuk WITA, 9 untuk WIT)
 */
function getTimezoneOffsetHours(timezone: string): number {
  // Hardcode offset untuk Indonesia timezones - lebih reliable daripada kalkulasi dinamis
  const offsets: Record<string, number> = {
    'Asia/Jakarta': 7,    // WIB UTC+7
    'Asia/Makassar': 8,   // WITA UTC+8
    'Asia/Jayapura': 9,   // WIT UTC+9
    // Fallback untuk timezone umum lainnya
    'UTC': 0,
    'GMT': 0,
  };

  return offsets[timezone] ?? 7; // Default ke WIB jika tidak dikenal
}
