/**
 * Account Lookup Service
 *
 * Service untuk mencari akun berdasarkan name/type bukan hardcoded codes.
 * Ini memungkinkan fleksibilitas dalam struktur COA tanpa perlu mengubah kode
 * setiap kali ada perubahan format kode akun.
 */

import { Account } from '@/types/account';

// Account Lookup Types
export type AccountLookupType =
  // Aset
  | 'KAS_UTAMA'           // Kas utama (Kas Besar, Kas Tunai)
  | 'KAS_KECIL'           // Kas kecil / Petty Cash
  | 'BANK'                // Semua rekening bank
  | 'PIUTANG_USAHA'       // Piutang dari pelanggan
  | 'PIUTANG_KARYAWAN'    // Kasbon/pinjaman karyawan
  | 'PERSEDIAAN_BAHAN'    // Persediaan bahan baku
  | 'PERSEDIAAN_BARANG'   // Persediaan barang jadi
  | 'PERSEDIAAN_WIP'      // Work in Progress
  | 'PIUTANG_PAJAK'       // Piutang Pajak / PPN Masukan (Tax Receivable)

  // Kewajiban
  | 'HUTANG_USAHA'        // Hutang ke supplier
  | 'HUTANG_BANK'         // Hutang bank / pinjaman bank
  | 'HUTANG_KARTU_KREDIT' // Hutang kartu kredit
  | 'HUTANG_LAIN'         // Hutang lain-lain
  | 'HUTANG_GAJI'         // Hutang gaji karyawan
  | 'HUTANG_PAJAK'        // Hutang pajak

  // Ekuitas
  | 'MODAL_PEMILIK'       // Modal pemilik
  | 'LABA_DITAHAN'        // Retained earnings
  | 'PRIVE'               // Pengambilan pemilik

  // Pendapatan
  | 'PENDAPATAN_PENJUALAN' // Penjualan produk
  | 'PENDAPATAN_JASA'      // Pendapatan jasa
  | 'PENDAPATAN_LAIN'      // Pendapatan lain-lain

  // HPP (Harga Pokok Penjualan)
  | 'HPP_BAHAN_BAKU'       // HPP dari bahan baku
  | 'HPP_TENAGA_KERJA'     // HPP tenaga kerja langsung
  | 'HPP_OVERHEAD'         // Biaya overhead pabrik

  // Beban Operasional
  | 'BEBAN_GAJI'           // Gaji karyawan
  | 'BEBAN_LISTRIK'        // Biaya listrik
  | 'BEBAN_TELEPON'        // Biaya telepon/internet
  | 'BEBAN_TRANSPORTASI'   // Biaya transportasi
  | 'BEBAN_PENYUSUTAN'     // Beban penyusutan
  | 'BEBAN_SEWA'           // Beban sewa
  | 'BEBAN_ADMIN'          // Beban administrasi umum
  | 'BEBAN_OPERASIONAL';   // Beban operasional lainnya

// Lookup patterns - mendefinisikan cara mencari akun berdasarkan type dan name
interface LookupPattern {
  type?: string | string[];      // Tipe akun (Aset, Kewajiban, dll)
  namePatterns: string[];        // Pattern untuk nama akun (case insensitive)
  excludePatterns?: string[];    // Pattern yang harus dikecualikan
  preferPaymentAccount?: boolean; // Prefer akun yang is_payment_account = true
  preferHeader?: boolean;         // Prefer akun header (untuk total)
}

const LOOKUP_PATTERNS: Record<AccountLookupType, LookupPattern> = {
  // === ASET ===
  KAS_UTAMA: {
    type: 'Aset',
    namePatterns: ['kas besar', 'kas utama', 'kas tunai', 'kas operasional'],
    excludePatterns: ['kas kecil', 'petty'],
    preferPaymentAccount: true,
  },
  KAS_KECIL: {
    type: 'Aset',
    namePatterns: ['kas kecil', 'petty cash'],
    preferPaymentAccount: true,
  },
  BANK: {
    type: 'Aset',
    namePatterns: ['bank', 'bca', 'mandiri', 'bri', 'bni', 'cimb', 'rekening'],
    excludePatterns: ['piutang bank'],
    preferPaymentAccount: true,
  },
  PIUTANG_USAHA: {
    type: 'Aset',
    namePatterns: ['piutang usaha', 'piutang dagang', 'piutang pelanggan', 'account receivable'],
    excludePatterns: ['piutang karyawan', 'piutang lain'],
  },
  PIUTANG_KARYAWAN: {
    type: 'Aset',
    namePatterns: ['piutang karyawan', 'kasbon', 'pinjaman karyawan', 'employee loan'],
  },
  PERSEDIAAN_BAHAN: {
    type: 'Aset',
    namePatterns: ['persediaan bahan', 'bahan baku', 'raw material', 'material'],
    excludePatterns: ['barang jadi', 'wip', 'dalam proses'],
  },
  PERSEDIAAN_BARANG: {
    type: 'Aset',
    namePatterns: ['persediaan barang', 'barang jadi', 'finished goods', 'produk jadi'],
    excludePatterns: ['bahan baku', 'wip'],
  },
  PERSEDIAAN_WIP: {
    type: 'Aset',
    namePatterns: ['work in progress', 'wip', 'dalam proses', 'barang dalam proses'],
  },
  PIUTANG_PAJAK: {
    type: 'Aset',
    namePatterns: ['piutang pajak', 'ppn masukan', 'pajak masukan', 'vat receivable', 'tax receivable', 'input tax', 'ppn dibayar dimuka'],
    excludePatterns: ['hutang pajak', 'pajak keluaran', 'ppn keluaran'],
  },

  // === KEWAJIBAN ===
  HUTANG_USAHA: {
    type: ['Kewajiban', 'Liabilitas', 'Liability'],
    namePatterns: ['hutang usaha', 'hutang dagang', 'utang usaha', 'utang dagang', 'account payable', 'hutang supplier'],
    excludePatterns: ['hutang gaji', 'hutang pajak', 'hutang bank', 'hutang kartu'],
  },
  HUTANG_BANK: {
    type: ['Kewajiban', 'Liabilitas', 'Liability'],
    namePatterns: ['hutang bank', 'utang bank', 'pinjaman bank', 'kredit bank', 'loan bank'],
    excludePatterns: ['kartu kredit'],
  },
  HUTANG_KARTU_KREDIT: {
    type: ['Kewajiban', 'Liabilitas', 'Liability'],
    namePatterns: ['hutang kartu kredit', 'utang kartu kredit', 'kartu kredit', 'credit card'],
  },
  HUTANG_LAIN: {
    type: ['Kewajiban', 'Liabilitas', 'Liability'],
    namePatterns: ['hutang lain', 'utang lain', 'kewajiban lain', 'other payable', 'hutang barang dagang', 'utang barang dagang'],
    excludePatterns: ['hutang usaha', 'hutang bank', 'hutang gaji', 'hutang pajak', 'kartu kredit'],
  },
  HUTANG_GAJI: {
    type: ['Kewajiban', 'Liabilitas', 'Liability'],
    namePatterns: ['hutang gaji', 'utang gaji', 'gaji terutang', 'accrued salary'],
  },
  HUTANG_PAJAK: {
    type: ['Kewajiban', 'Liabilitas', 'Liability'],
    namePatterns: ['hutang pajak', 'utang pajak', 'pajak terutang', 'pph terutang', 'ppn terutang'],
  },

  // === EKUITAS ===
  MODAL_PEMILIK: {
    type: ['Modal', 'Ekuitas'],
    namePatterns: ['modal pemilik', 'modal disetor', 'modal saham', 'owner equity', 'capital'],
    excludePatterns: ['laba', 'prive'],
  },
  LABA_DITAHAN: {
    type: ['Modal', 'Ekuitas'],
    namePatterns: ['laba ditahan', 'retained earning', 'saldo laba'],
  },
  PRIVE: {
    type: ['Modal', 'Ekuitas'],
    namePatterns: ['prive', 'drawing', 'pengambilan pemilik'],
  },

  // === PENDAPATAN ===
  PENDAPATAN_PENJUALAN: {
    type: 'Pendapatan',
    namePatterns: ['pendapatan penjualan', 'penjualan', 'sales', 'revenue'],
    excludePatterns: ['jasa', 'lain-lain', 'bunga'],
  },
  PENDAPATAN_JASA: {
    type: 'Pendapatan',
    namePatterns: ['pendapatan jasa', 'jasa', 'service revenue'],
  },
  PENDAPATAN_LAIN: {
    type: 'Pendapatan',
    namePatterns: ['pendapatan lain', 'lain-lain', 'other income', 'pendapatan bunga'],
  },

  // === HPP ===
  HPP_BAHAN_BAKU: {
    type: 'HPP',
    namePatterns: ['hpp bahan', 'bahan baku terpakai', 'material used', 'harga pokok bahan'],
  },
  HPP_TENAGA_KERJA: {
    type: 'HPP',
    namePatterns: ['hpp tenaga kerja', 'biaya tenaga kerja langsung', 'direct labor', 'upah langsung'],
  },
  HPP_OVERHEAD: {
    type: 'HPP',
    namePatterns: ['hpp overhead', 'biaya overhead', 'factory overhead', 'bop'],
  },

  // === BEBAN OPERASIONAL ===
  BEBAN_GAJI: {
    type: 'Beban',
    namePatterns: ['beban gaji', 'gaji karyawan', 'salary expense', 'biaya gaji'],
    excludePatterns: ['hpp', 'tenaga kerja langsung'],
  },
  BEBAN_LISTRIK: {
    type: 'Beban',
    namePatterns: ['beban listrik', 'biaya listrik', 'electricity', 'utilitas listrik'],
  },
  BEBAN_TELEPON: {
    type: 'Beban',
    namePatterns: ['beban telepon', 'beban internet', 'biaya telepon', 'telecommunication'],
  },
  BEBAN_TRANSPORTASI: {
    type: 'Beban',
    namePatterns: ['beban transportasi', 'biaya transport', 'ongkos kirim', 'delivery'],
  },
  BEBAN_PENYUSUTAN: {
    type: 'Beban',
    namePatterns: ['beban penyusutan', 'penyusutan', 'depreciation', 'amortisasi'],
  },
  BEBAN_SEWA: {
    type: 'Beban',
    namePatterns: ['beban sewa', 'biaya sewa', 'rent expense', 'sewa gedung', 'sewa kantor'],
  },
  BEBAN_ADMIN: {
    type: 'Beban',
    namePatterns: ['beban administrasi', 'biaya admin', 'administrasi umum', 'general admin'],
  },
  BEBAN_OPERASIONAL: {
    type: 'Beban',
    namePatterns: ['beban operasional', 'biaya operasional', 'operating expense'],
  },
};

/**
 * Mencari akun berdasarkan lookup type
 */
export function findAccountByLookup(
  accounts: Account[],
  lookupType: AccountLookupType
): Account | null {
  const pattern = LOOKUP_PATTERNS[lookupType];
  if (!pattern) {
    console.warn(`Unknown lookup type: ${lookupType}`);
    return null;
  }

  // Filter berdasarkan type akun
  let candidates = accounts.filter(account => {
    if (!pattern.type) return true;

    const types = Array.isArray(pattern.type) ? pattern.type : [pattern.type];
    return types.some(t =>
      account.type?.toLowerCase() === t.toLowerCase()
    );
  });

  // Filter berdasarkan name patterns (at least one must match)
  candidates = candidates.filter(account => {
    const accountName = account.name.toLowerCase();
    return pattern.namePatterns.some(p =>
      accountName.includes(p.toLowerCase())
    );
  });

  // Exclude berdasarkan exclude patterns
  if (pattern.excludePatterns) {
    candidates = candidates.filter(account => {
      const accountName = account.name.toLowerCase();
      return !pattern.excludePatterns!.some(p =>
        accountName.includes(p.toLowerCase())
      );
    });
  }

  // Exclude header accounts (kecuali diminta)
  if (!pattern.preferHeader) {
    candidates = candidates.filter(account => !account.isHeader);
  }

  // Jika tidak ada kandidat, return null
  if (candidates.length === 0) {
    console.warn(`No account found for lookup type: ${lookupType}`);
    return null;
  }

  // Prefer payment account jika diminta
  if (pattern.preferPaymentAccount) {
    const paymentAccounts = candidates.filter(a => a.isPaymentAccount);
    if (paymentAccounts.length > 0) {
      return paymentAccounts[0];
    }
  }

  // Return kandidat pertama
  return candidates[0];
}

/**
 * Mencari semua akun yang cocok dengan lookup type
 */
export function findAllAccountsByLookup(
  accounts: Account[],
  lookupType: AccountLookupType
): Account[] {
  const pattern = LOOKUP_PATTERNS[lookupType];
  if (!pattern) {
    console.warn(`Unknown lookup type: ${lookupType}`);
    return [];
  }

  // Filter berdasarkan type akun
  let candidates = accounts.filter(account => {
    if (!pattern.type) return true;

    const types = Array.isArray(pattern.type) ? pattern.type : [pattern.type];
    return types.some(t =>
      account.type?.toLowerCase() === t.toLowerCase()
    );
  });

  // Filter berdasarkan name patterns
  candidates = candidates.filter(account => {
    const accountName = account.name.toLowerCase();
    return pattern.namePatterns.some(p =>
      accountName.includes(p.toLowerCase())
    );
  });

  // Exclude berdasarkan exclude patterns
  if (pattern.excludePatterns) {
    candidates = candidates.filter(account => {
      const accountName = account.name.toLowerCase();
      return !pattern.excludePatterns!.some(p =>
        accountName.includes(p.toLowerCase())
      );
    });
  }

  // Exclude header accounts
  if (!pattern.preferHeader) {
    candidates = candidates.filter(account => !account.isHeader);
  }

  return candidates;
}

/**
 * Mencari akun berdasarkan ID
 */
export function findAccountById(accounts: Account[], accountId: string): Account | null {
  return accounts.find(a => a.id === accountId) || null;
}

/**
 * Mencari akun berdasarkan code
 */
export function findAccountByCode(accounts: Account[], code: string): Account | null {
  return accounts.find(a => a.code === code) || null;
}

/**
 * Mencari akun berdasarkan nama persis
 */
export function findAccountByExactName(accounts: Account[], name: string): Account | null {
  return accounts.find(a => a.name.toLowerCase() === name.toLowerCase()) || null;
}

/**
 * Mencari akun berdasarkan nama partial
 */
export function findAccountByNameContains(accounts: Account[], namePattern: string): Account | null {
  const pattern = namePattern.toLowerCase();
  return accounts.find(a => a.name.toLowerCase().includes(pattern)) || null;
}

/**
 * Mencari semua akun payment (kas dan bank)
 */
export function findPaymentAccounts(accounts: Account[]): Account[] {
  return accounts.filter(a =>
    a.isPaymentAccount === true &&
    !a.isHeader &&
    a.type?.toLowerCase() === 'aset'
  );
}

/**
 * Mencari semua akun berdasarkan tipe
 */
export function findAccountsByType(accounts: Account[], type: string): Account[] {
  return accounts.filter(a =>
    a.type?.toLowerCase() === type.toLowerCase() &&
    !a.isHeader
  );
}

/**
 * Mendapatkan total saldo dari kumpulan akun
 */
export function getTotalBalance(accounts: Account[]): number {
  return accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);
}

/**
 * Mendapatkan saldo untuk lookup type tertentu (sum dari semua akun yang match)
 */
export function getBalanceByLookup(
  accounts: Account[],
  lookupType: AccountLookupType
): number {
  const matchedAccounts = findAllAccountsByLookup(accounts, lookupType);
  return getTotalBalance(matchedAccounts);
}

/**
 * Validasi apakah semua akun yang dibutuhkan untuk laporan keuangan sudah ada
 */
export function validateRequiredAccounts(accounts: Account[]): {
  isValid: boolean;
  missingAccounts: AccountLookupType[];
} {
  const requiredLookups: AccountLookupType[] = [
    'KAS_UTAMA',
    'PIUTANG_USAHA',
    'PERSEDIAAN_BARANG',
    'HUTANG_USAHA',
    'MODAL_PEMILIK',
    'PENDAPATAN_PENJUALAN',
    'BEBAN_OPERASIONAL',
  ];

  const missingAccounts: AccountLookupType[] = [];

  for (const lookup of requiredLookups) {
    const account = findAccountByLookup(accounts, lookup);
    if (!account) {
      missingAccounts.push(lookup);
    }
  }

  return {
    isValid: missingAccounts.length === 0,
    missingAccounts,
  };
}

// ============================================================================
// FINANCIAL STATEMENT HELPERS
// ============================================================================

/**
 * Mendapatkan saldo kas dan setara kas (untuk Neraca dan Arus Kas)
 */
export function getCashAndEquivalents(accounts: Account[]): {
  total: number;
  details: { name: string; balance: number }[];
} {
  // Ambil semua akun kas dan bank
  const kasAccounts = findAllAccountsByLookup(accounts, 'KAS_UTAMA');
  const kasKecilAccounts = findAllAccountsByLookup(accounts, 'KAS_KECIL');
  const bankAccounts = findAllAccountsByLookup(accounts, 'BANK');

  const allCashAccounts = [...kasAccounts, ...kasKecilAccounts, ...bankAccounts];

  return {
    total: getTotalBalance(allCashAccounts),
    details: allCashAccounts.map(a => ({ name: a.name, balance: a.balance || 0 })),
  };
}

/**
 * Mendapatkan total piutang (untuk Neraca)
 */
export function getTotalReceivables(accounts: Account[]): {
  total: number;
  usaha: number;
  karyawan: number;
} {
  const piutangUsaha = getBalanceByLookup(accounts, 'PIUTANG_USAHA');
  const piutangKaryawan = getBalanceByLookup(accounts, 'PIUTANG_KARYAWAN');

  return {
    total: piutangUsaha + piutangKaryawan,
    usaha: piutangUsaha,
    karyawan: piutangKaryawan,
  };
}

/**
 * Mendapatkan total persediaan (untuk Neraca)
 */
export function getTotalInventory(accounts: Account[]): {
  total: number;
  bahanBaku: number;
  barangJadi: number;
  wip: number;
} {
  const bahanBaku = getBalanceByLookup(accounts, 'PERSEDIAAN_BAHAN');
  const barangJadi = getBalanceByLookup(accounts, 'PERSEDIAAN_BARANG');
  const wip = getBalanceByLookup(accounts, 'PERSEDIAAN_WIP');

  return {
    total: bahanBaku + barangJadi + wip,
    bahanBaku,
    barangJadi,
    wip,
  };
}

/**
 * Mendapatkan total kewajiban (untuk Neraca)
 */
export function getTotalLiabilities(accounts: Account[]): {
  total: number;
  hutangUsaha: number;
  hutangBank: number;
  hutangKartuKredit: number;
  hutangLain: number;
  hutangGaji: number;
  hutangPajak: number;
} {
  const hutangUsaha = getBalanceByLookup(accounts, 'HUTANG_USAHA');
  const hutangBank = getBalanceByLookup(accounts, 'HUTANG_BANK');
  const hutangKartuKredit = getBalanceByLookup(accounts, 'HUTANG_KARTU_KREDIT');
  const hutangLain = getBalanceByLookup(accounts, 'HUTANG_LAIN');
  const hutangGaji = getBalanceByLookup(accounts, 'HUTANG_GAJI');
  const hutangPajak = getBalanceByLookup(accounts, 'HUTANG_PAJAK');

  return {
    total: hutangUsaha + hutangBank + hutangKartuKredit + hutangLain + hutangGaji + hutangPajak,
    hutangUsaha,
    hutangBank,
    hutangKartuKredit,
    hutangLain,
    hutangGaji,
    hutangPajak,
  };
}

/**
 * Mendapatkan total ekuitas (untuk Neraca)
 */
export function getTotalEquity(accounts: Account[]): {
  total: number;
  modal: number;
  labaDitahan: number;
  prive: number;
} {
  const modal = getBalanceByLookup(accounts, 'MODAL_PEMILIK');
  const labaDitahan = getBalanceByLookup(accounts, 'LABA_DITAHAN');
  const prive = getBalanceByLookup(accounts, 'PRIVE');

  // Prive mengurangi ekuitas (normalBalance = DEBIT)
  return {
    total: modal + labaDitahan - prive,
    modal,
    labaDitahan,
    prive,
  };
}

/**
 * Mendapatkan total pendapatan (untuk Laba Rugi)
 */
export function getTotalRevenue(accounts: Account[]): {
  total: number;
  penjualan: number;
  jasa: number;
  lainnya: number;
} {
  const penjualan = getBalanceByLookup(accounts, 'PENDAPATAN_PENJUALAN');
  const jasa = getBalanceByLookup(accounts, 'PENDAPATAN_JASA');
  const lainnya = getBalanceByLookup(accounts, 'PENDAPATAN_LAIN');

  return {
    total: penjualan + jasa + lainnya,
    penjualan,
    jasa,
    lainnya,
  };
}

/**
 * Mendapatkan total HPP (untuk Laba Rugi)
 */
export function getTotalCOGS(accounts: Account[]): {
  total: number;
  bahanBaku: number;
  tenagaKerja: number;
  overhead: number;
} {
  const bahanBaku = getBalanceByLookup(accounts, 'HPP_BAHAN_BAKU');
  const tenagaKerja = getBalanceByLookup(accounts, 'HPP_TENAGA_KERJA');
  const overhead = getBalanceByLookup(accounts, 'HPP_OVERHEAD');

  return {
    total: bahanBaku + tenagaKerja + overhead,
    bahanBaku,
    tenagaKerja,
    overhead,
  };
}

/**
 * Mendapatkan total beban operasional (untuk Laba Rugi)
 */
export function getTotalOperatingExpenses(accounts: Account[]): {
  total: number;
  gaji: number;
  listrik: number;
  transportasi: number;
  penyusutan: number;
  lainnya: number;
} {
  const gaji = getBalanceByLookup(accounts, 'BEBAN_GAJI');
  const listrik = getBalanceByLookup(accounts, 'BEBAN_LISTRIK');
  const transportasi = getBalanceByLookup(accounts, 'BEBAN_TRANSPORTASI');
  const penyusutan = getBalanceByLookup(accounts, 'BEBAN_PENYUSUTAN');

  // Hitung semua beban operasional
  const allExpenseAccounts = findAccountsByType(accounts, 'Beban');
  const totalAllExpenses = getTotalBalance(allExpenseAccounts);

  // Lainnya = total - yang sudah diidentifikasi
  const lainnya = totalAllExpenses - gaji - listrik - transportasi - penyusutan;

  return {
    total: totalAllExpenses,
    gaji,
    listrik,
    transportasi,
    penyusutan,
    lainnya: Math.max(0, lainnya),
  };
}

export default {
  findAccountByLookup,
  findAllAccountsByLookup,
  findAccountById,
  findAccountByCode,
  findAccountByExactName,
  findAccountByNameContains,
  findPaymentAccounts,
  findAccountsByType,
  getTotalBalance,
  getBalanceByLookup,
  validateRequiredAccounts,
  getCashAndEquivalents,
  getTotalReceivables,
  getTotalInventory,
  getTotalLiabilities,
  getTotalEquity,
  getTotalRevenue,
  getTotalCOGS,
  getTotalOperatingExpenses,
};
