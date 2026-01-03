// Zakat & Sedekah Management Types

export type ZakatType = 'zakat_mal' | 'zakat_fitrah' | 'zakat_penghasilan' | 'zakat_perdagangan' | 'zakat_emas' | 'other';
export type CharityType = 'sedekah' | 'infaq' | 'wakaf' | 'qurban' | 'other';
export type PaymentStatus = 'pending' | 'paid' | 'cancelled';

export interface ZakatRecord {
  id: string;

  // Type
  type: ZakatType | CharityType;
  category: 'zakat' | 'charity'; // zakat or charity

  // Details
  title: string;
  description?: string;
  recipient?: string; // Person or institution receiving
  recipientType?: 'individual' | 'mosque' | 'orphanage' | 'institution' | 'other';

  // Amount
  amount: number;
  nishabAmount?: number; // Minimum amount for zakat obligation
  percentageRate?: number; // Usually 2.5% for zakat mal

  // Payment Info
  paymentDate: Date;
  paymentAccountId?: string;
  paymentAccountName?: string;
  paymentMethod?: string; // 'cash', 'transfer', 'check'

  // Status
  status: PaymentStatus;

  // Reference
  journalEntryId?: string; // Link to journal_entries table
  receiptNumber?: string;

  // Calculation Details (for zakat)
  calculationBasis?: string; // What was this zakat calculated from
  calculationNotes?: string;

  // Additional Info
  isAnonymous?: boolean;
  notes?: string;
  attachmentUrl?: string; // Receipt or proof

  // Islamic Calendar
  hijriYear?: string;
  hijriMonth?: string;

  // Metadata
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ZakatFormData {
  type: ZakatType | CharityType;
  category: 'zakat' | 'charity';
  title: string;
  description?: string;
  recipient?: string;
  recipientType?: 'individual' | 'mosque' | 'orphanage' | 'institution' | 'other';
  amount: number;
  nishabAmount?: number;
  percentageRate?: number;
  paymentDate: Date;
  paymentAccountId?: string;
  paymentMethod?: string;
  receiptNumber?: string;
  calculationBasis?: string;
  calculationNotes?: string;
  isAnonymous?: boolean;
  notes?: string;
  attachmentUrl?: string;
  hijriYear?: string;
  hijriMonth?: string;
}

export interface ZakatSummary {
  // Totals
  totalZakatPaid: number;
  totalCharityPaid: number;
  totalPaidThisYear: number;
  totalPaidThisMonth: number;

  // By Type
  byType: {
    type: string;
    count: number;
    totalAmount: number;
  }[];

  // By Recipient
  byRecipient: {
    recipient: string;
    count: number;
    totalAmount: number;
  }[];

  // Pending
  pendingZakat: number;
  pendingCharity: number;
}

// Zakat Calculator Helper Types
export interface ZakatCalculation {
  type: ZakatType;
  assetValue: number;
  nishabValue: number;
  isObligatory: boolean;
  zakatAmount: number;
  rate: number; // percentage
  notes: string;
}

// Nishab Reference Values (can be updated regularly)
export interface NishabReference {
  goldPrice: number; // per gram
  silverPrice: number; // per gram
  goldNishab: number; // 85 grams
  silverNishab: number; // 595 grams
  zakatRate: number; // 2.5%
  lastUpdated: Date;
}
