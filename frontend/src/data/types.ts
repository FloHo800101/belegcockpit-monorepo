// BelegCockpit Type Definitions

export type TransactionStatus = 
  | 'matched_confident'
  | 'matched_uncertain'
  | 'missing_receipt'
  | 'resolved_no_receipt'
  | 'resolved_self_receipt'
  | 'resolved_private';

export type MandantPackageKey = 
  | 'monthly_invoices'
  | 'small_no_receipt'
  | 'top_amounts'
  | 'marketplace_statement'
  | 'other_open'
  | 'refunds'
  | 'subscriptions'
  | 'bundles'
  | 'review'
  | 'confirm'
  | 'none';

// Review item for "Zuordnungen kurz prüfen"
export type ReviewReason = 'low_confidence' | 'amount_deviation' | 'date_deviation' | 'classification' | 'ambiguous';

export interface ReviewItem {
  id: string;
  transactionId: string;
  transactionDate: string;
  transactionAmount: number;
  transactionMerchant: string;
  transactionPurpose: string;
  documentId: string;
  documentName: string;
  documentDate: string;
  documentAmount: number;
  confidence: number;
  reviewReason: ReviewReason;
  deviationDetails?: string;
  status: 'pending' | 'confirmed' | 'rejected' | 'handed_over';
}

export type KanzleiCluster = 
  | 'missing'
  | 'many_to_one'
  | 'one_to_many'
  | 'duplicate_risk'
  | 'amount_variance'
  | 'timing'
  | 'vendor_unknown'
  | 'tax_risk'
  | 'fees'
  | 'anomaly'
  | 'refund_reversal';

export type DocumentQuality = 'ok' | 'bad_photo';

export interface Transaction {
  id: string;
  date: string;
  amount: number;
  currency: string;
  merchant: string;
  paymentMethod: string;
  status: TransactionStatus;
  matchConfidence: number;
  mandantActionPrimary: string;
  mandantPackageKey: MandantPackageKey;
  mandantReasonHint: string;
  kanzleiClusterPrimary: KanzleiCluster;
  kanzleiReasonHint: string;
  candidateDocumentIds?: string[];
  /** Realistischer Bank-/Kartenumsatztext – NIEMALS Status-/Systemtexte! */
  purpose?: string;
}

export interface Document {
  id: string;
  supplierName: string;
  date: string;
  total: number;
  vat: number;
  linkedTransactionId: string | null;
  quality: DocumentQuality;
}

export interface Mandant {
  id: string;
  name: string;
  month: string;
  transactionCount: number;
  documentCount: number;
  matchedConfident: number;
  matchedUncertain: number;
  missingReceipt: number;
  hasRiskFlag: boolean;
  lastActivity: string;
}

// Eigenbeleg form data
export interface EigenbelegData {
  date: string;
  amount: number;
  occasion: 'parken' | 'trinkgeld' | 'kleinmaterial' | 'bewirtung' | 'sonstiges';
  note?: string;
}

// Cluster configuration for Kanzlei
export const CLUSTER_CONFIG: Record<KanzleiCluster, { 
  label: string; 
  description: string;
  bulkActions: string[];
}> = {
  missing: {
    label: 'Fehlend (Beleg)',
    description: 'Zahlung ohne Beleg',
    bulkActions: ['Als Paket nachfordern', 'Als ohne Beleg akzeptieren', 'Privat markieren']
  },
  many_to_one: {
    label: 'Sammel/Settlement',
    description: 'Mehrere Zahlungen → ein Beleg',
    bulkActions: ['Statement anfordern', 'Settlement schließen']
  },
  one_to_many: {
    label: 'Split/Teilkauf',
    description: 'Eine Zahlung → mehrere Belege',
    bulkActions: ['Split-Match starten']
  },
  duplicate_risk: {
    label: 'Duplikat-Risiko',
    description: 'Mögliche Doppelbuchung',
    bulkActions: ['In Risiko-Queue']
  },
  amount_variance: {
    label: 'Betragsabweichung',
    description: 'Betrag stimmt nicht überein',
    bulkActions: ['Tolerieren', 'Zur Prüfung']
  },
  timing: {
    label: 'Timing/In-Transit',
    description: 'Periodenabgrenzung',
    bulkActions: ['Als In-Transit markieren']
  },
  vendor_unknown: {
    label: 'Lieferant unklar',
    description: 'Händlername nicht eindeutig',
    bulkActions: ['Lieferant zuordnen (Mapping)']
  },
  tax_risk: {
    label: 'USt-/Tax-Risiko',
    description: 'Steuerliche Prüfung erforderlich',
    bulkActions: ['In Tax-Review']
  },
  fees: {
    label: 'Gebühren',
    description: 'Kein Beleg erwartet',
    bulkActions: ['Regel: Kein Beleg erwartet']
  },
  anomaly: {
    label: 'Auffälligkeiten',
    description: 'Ungewöhnliche Transaktion',
    bulkActions: ['In Risiko-Queue', 'Manuell prüfen']
  },
  refund_reversal: {
    label: 'Refund/Reversal',
    description: 'Erstattung/Storno',
    bulkActions: ['Paar als erledigt markieren']
  }
};

// KPI categories for Kanzlei
export const KPI_CATEGORIES = {
  autoOk: ['fees', 'timing', 'refund_reversal'] as KanzleiCluster[],
  autoRequest: ['missing', 'many_to_one'] as KanzleiCluster[],
  needsHuman: ['duplicate_risk', 'amount_variance', 'vendor_unknown', 'tax_risk', 'anomaly', 'one_to_many'] as KanzleiCluster[]
};

// Risk score base values per cluster
export const RISK_BASE_SCORES: Record<KanzleiCluster, number> = {
  tax_risk: 80,
  duplicate_risk: 70,
  anomaly: 60,
  amount_variance: 50,
  vendor_unknown: 40,
  one_to_many: 35,
  many_to_one: 30,
  missing: 20,
  timing: 10,
  fees: 10,
  refund_reversal: 10
};

// Package configuration for Mandant
export const PACKAGE_CONFIG: Record<string, {
  title: string;
  description: string;
  primaryCTA: string;
  secondaryCTA?: string;
}> = {
  monthly_invoices: {
    title: 'Mögliche wiederkehrende Zahlungen',
    description: 'Wiederkehrende Rechnungen von Anbietern',
    primaryCTA: 'Prüfen & Bearbeiten',
    secondaryCTA: 'Anbieter ansehen'
  },
  marketplace_statement: {
    title: 'Mögliche Sammelzahlungen',
    description: 'Amazon, PayPal & andere Plattformen',
    primaryCTA: 'Prüfen & Bearbeiten',
    secondaryCTA: 'Details ansehen'
  },
  small_no_receipt: {
    title: 'Kleinbeträge ohne Beleg',
    description: 'Parkgebühren, Trinkgeld etc.',
    primaryCTA: 'Prüfen & Bearbeiten',
    secondaryCTA: 'Eigenbeleg erstellen'
  },
  top_amounts: {
    title: 'Wichtige Posten',
    description: 'Hohe Beträge – Beleg fehlt',
    primaryCTA: 'Prüfen & Bearbeiten'
  },
  other_open: {
    title: 'Sonstige offene Zahlungen',
    description: 'Einzelne offene Posten',
    primaryCTA: 'Prüfen & Bearbeiten'
  },
  refunds: {
    title: 'Erstattung / Gutschrift',
    description: 'Hier kam Geld zurück',
    primaryCTA: 'Prüfen & Bestätigen'
  },
  bad_photo: {
    title: 'Belegfoto verbessern',
    description: 'Schlechte Bildqualität',
    primaryCTA: 'Prüfen & Bearbeiten',
    secondaryCTA: 'PDF hochladen'
  }
};

// =====================
// SFA (Kanzlei) Types
// =====================

// SFA Queue IDs
export type SfaQueueId = 
  | 'missing_receipts'
  | 'clarify_matching'
  | 'tax_risks'
  | 'duplicates_corrections'
  | 'fees_misc';

// SFA Queue Configuration
export const SFA_QUEUE_CONFIG: Record<SfaQueueId, {
  label: string;
  description: string;
}> = {
  missing_receipts: {
    label: 'Fehlende Belege',
    description: 'Belege fehlen oder es braucht eine klare Erklärung.',
  },
  clarify_matching: {
    label: 'Zuordnung klären',
    description: 'Zuordnungen sind mehrdeutig oder unsicher.',
  },
  tax_risks: {
    label: 'Risikofälle',
    description: 'Steuerlich relevante Fälle mit Prüfbedarf.',
  },
  duplicates_corrections: {
    label: 'Duplikate & Korrekturen',
    description: 'Doppelte Buchungen, Split/Teilkauf, Korrekturen.',
  },
  fees_misc: {
    label: 'Gebühren & Sonstiges',
    description: 'Gebühren, Rückerstattungen und sonstige Sonderfälle.',
  },
};

// Trigger reasons for SFA cases (same labels as Mandant for consistency)
export type SfaTriggerReason = 'ambiguous' | 'amount_deviation' | 'date_deviation' | 'fee_uncertain';

export const SFA_TRIGGER_LABELS: Record<SfaTriggerReason, string> = {
  ambiguous: 'Mehrdeutig',
  amount_deviation: 'Betrag weicht ab',
  date_deviation: 'Datum weicht ab',
  fee_uncertain: 'Gebühr unsicher',
};

// Mandant status as seen by SFA
export type SfaMandantStatus = 
  | 'handed_over'        // An Kanzlei übergeben
  | 'rejected_match'     // Zuordnung abgelehnt
  | 'uploaded_receipt'   // Beleg hochgeladen
  | 'marked_private';    // Privat markiert

export const SFA_MANDANT_STATUS_LABELS: Record<SfaMandantStatus, string> = {
  handed_over: 'An Kanzlei übergeben',
  rejected_match: 'Zuordnung abgelehnt',
  uploaded_receipt: 'Beleg hochgeladen',
  marked_private: 'Privat markiert',
};

// Case status for SFA workflow
export type SfaCaseStatus = 'open' | 'waiting_mandant' | 'done';

export const SFA_CASE_STATUS_LABELS: Record<SfaCaseStatus, string> = {
  open: 'Offen',
  waiting_mandant: 'Wartet auf Mandant',
  done: 'Erledigt',
};

// Payment method type
export type PaymentMethod = 'Bank' | 'Card' | 'PayPal' | 'Stripe' | 'Amazon';

// Audit trail entry
export interface AuditEntry {
  at: string;  // ISO timestamp
  actor: 'mandant' | 'sfa';
  action: string;
  note?: string;
}

// Receipt/Document attached to a case
export interface SfaReceipt {
  id: string;
  fileName: string;
  date: string;
  amount: number;
}

// Main SFA Case interface
export interface SfaCase {
  id: string;
  date: string;
  amount: number;
  direction: 'in' | 'out';
  counterparty: string;
  purpose: string;  // Realistic bank text via purposeGenerator
  paymentMethod: PaymentMethod;
  
  // Status
  mandantStatus: SfaMandantStatus;
  caseStatus: SfaCaseStatus;
  waitingSince?: string;  // ISO timestamp when waiting started
  
  // Matching
  confidence?: number;
  triggerReasons: SfaTriggerReason[];
  
  // Attached receipt (if any)
  receipt?: SfaReceipt | null;
  
  // Audit Trail
  auditTrail: AuditEntry[];
}

// Inquiry package item (Rückfragenpaket)
export interface InquiryPackageItem {
  caseId: string;
  questionText: string;
}
