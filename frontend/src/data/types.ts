/**
 * BelegCockpit Frontend Type Definitions
 *
 * Gemeinsame Domänen-Typen werden aus @beleg-cockpit/shared re-exportiert.
 * Hier verbleiben nur Frontend-spezifische Typen, UI-Konfigurationen und Mock-Daten-Shapes.
 *
 * Bestehende Importe aus '@/data/types' funktionieren weiterhin ohne Änderungen.
 */

// =====================================================================
// Re-Exports aus @beleg-cockpit/shared (Single Source of Truth)
// =====================================================================

export type {
  // Mandant-Workflow
  TransactionStatus,
  MandantPackageKey,
  // Kanzlei-Workflow
  KanzleiCluster,
  SfaQueueId,
  SfaCaseStatus,
  SfaTriggerReason,
  SfaMandantStatus,
  // Matching
  Direction,
} from '@beleg-cockpit/shared';

// =====================================================================
// Frontend-spezifische Typen (UI-State, Mock-Daten, Formulare)
// =====================================================================

import type {
  TransactionStatus,
  MandantPackageKey,
  KanzleiCluster,
  SfaQueueId,
  SfaCaseStatus,
  SfaTriggerReason,
  SfaMandantStatus,
} from '@beleg-cockpit/shared';

/** Qualität des hochgeladenen Belegfotos. */
export type DocumentQuality = 'ok' | 'bad_photo';

/** Auslöser für eine manuelle Review-Anfrage (Konfidenz, Abweichung etc.). */
export type ReviewReason =
  | 'low_confidence'
  | 'amount_deviation'
  | 'date_deviation'
  | 'classification'
  | 'ambiguous';

/** Einzelner Prüfungseintrag für den "Zuordnungen kurz prüfen"-Workflow. */
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
  /** Konfidenz des automatischen Matches (0–100). */
  confidence: number;
  reviewReason: ReviewReason;
  deviationDetails?: string;
  status: 'pending' | 'confirmed' | 'rejected' | 'handed_over';
}

/**
 * Banktransaktion im Frontend-State.
 * Erweitert die API-Entität um UI-Workflow-Felder und Mandanten-Anzeige-Felder.
 */
export interface Transaction {
  id: string;
  date: string;                              // YYYY-MM-DD
  amount: number;                            // positiv = Gutschrift, negativ = Belastung
  currency: string;
  merchant: string;                          // Anzeigename des Händlers/Empfängers
  paymentMethod: string;                     // "Bank" | "Card" | "PayPal" | "Stripe" | "Amazon"
  status: TransactionStatus;
  matchConfidence: number;                   // 0–100
  mandantActionPrimary: string;              // UI-Aktions-Hint
  mandantPackageKey: MandantPackageKey;
  mandantReasonHint: string;                 // Begründungstext für den Mandanten
  kanzleiClusterPrimary: KanzleiCluster;
  kanzleiReasonHint: string;                 // Begründungstext für die SFA
  candidateDocumentIds?: string[];
  /** Realistischer Bank-/Kartenumsatztext – NIEMALS Status-/Systemtexte! */
  purpose?: string;
}

/** Beleg/Dokument im Frontend-State (vereinfachte Ansicht für UI). */
export interface Document {
  id: string;
  supplierName: string;
  date: string;                              // YYYY-MM-DD
  total: number;
  vat: number;
  linkedTransactionId: string | null;
  quality: DocumentQuality;
}

/**
 * Mandanten-Übersicht für das Kanzlei-Dashboard.
 * Entspricht dem API-Typ `MandantMonthSummary` aus @beleg-cockpit/shared,
 * hier als Frontend-Mock-Shape (vereinfacht, ohne monthId-Felder).
 */
export interface Mandant {
  id: string;
  name: string;
  /** z.B. "Januar 2026" */
  month: string;
  transactionCount: number;
  documentCount: number;
  matchedConfident: number;
  matchedUncertain: number;
  missingReceipt: number;
  hasRiskFlag: boolean;
  lastActivity: string;                      // YYYY-MM-DD
}

/** Eigenbeleg-Formular-Daten (Mandant erstellt eigene Quittung). */
export interface EigenbelegData {
  date: string;
  amount: number;
  occasion: 'parken' | 'trinkgeld' | 'kleinmaterial' | 'bewirtung' | 'sonstiges';
  note?: string;
}

// =====================================================================
// Kanzlei-Cluster-Konfiguration (UI-Labels und Bulk-Aktionen)
// =====================================================================

/** Anzeige-Konfiguration und Bulk-Aktionen pro Cluster (nur Frontend). */
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
    description: 'Periodenabgrenzung (inkl. Privatvorschuss + Sammelüberweisung)',
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

/** KPI-Kategorisierung der Cluster für das Kanzlei-Dashboard. */
export const KPI_CATEGORIES = {
  autoOk: ['fees', 'timing', 'refund_reversal'] as KanzleiCluster[],
  autoRequest: ['missing', 'many_to_one'] as KanzleiCluster[],
  needsHuman: ['duplicate_risk', 'amount_variance', 'vendor_unknown', 'tax_risk', 'anomaly', 'one_to_many'] as KanzleiCluster[]
};

/** Basis-Risikopunkte pro Cluster für die UI-Risikosortierung. */
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

// =====================================================================
// Mandant-Paket-Konfiguration (UI-Labels und CTAs)
// =====================================================================

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

// =====================================================================
// SFA (Steuerfachangestellte) – UI-Konfiguration und Kanzlei-Typen
// =====================================================================

/** Queue-Konfiguration mit Anzeige-Labels für die SFA-Workbench. */
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

export const SFA_TRIGGER_LABELS: Record<SfaTriggerReason, string> = {
  ambiguous: 'Mehrdeutig',
  amount_deviation: 'Betrag weicht ab',
  date_deviation: 'Datum weicht ab',
  fee_uncertain: 'Gebühr unsicher',
};

export const SFA_MANDANT_STATUS_LABELS: Record<SfaMandantStatus, string> = {
  handed_over: 'An Kanzlei übergeben',
  rejected_match: 'Zuordnung abgelehnt',
  uploaded_receipt: 'Beleg hochgeladen',
  marked_private: 'Privat markiert',
};

export const SFA_CASE_STATUS_LABELS: Record<SfaCaseStatus, string> = {
  open: 'Offen',
  waiting_mandant: 'Wartet auf Mandant',
  done: 'Erledigt',
};

export type PaymentMethod = 'Bank' | 'Card' | 'PayPal' | 'Stripe' | 'Amazon';

/** Audit-Trail-Eintrag (für SfaCase und InquiryPackage). */
export interface AuditEntry {
  at: string;
  actor: 'mandant' | 'sfa';
  action: string;
  note?: string;
}

/** Anhängender Beleg/Scan an einem SFA-Fall. */
export interface SfaReceipt {
  id: string;
  fileName: string;
  date: string;
  amount: number;
}

/** SFA-Fall – ein einzelner Klärungsfall in der Kanzlei-Workbench. */
export interface SfaCase {
  id: string;
  date: string;
  amount: number;
  direction: 'in' | 'out';
  counterparty: string;
  purpose: string;
  paymentMethod: PaymentMethod;
  mandantStatus: SfaMandantStatus;
  caseStatus: SfaCaseStatus;
  waitingSince?: string;
  confidence?: number;
  triggerReasons: SfaTriggerReason[];
  receipt?: SfaReceipt | null;
  auditTrail: AuditEntry[];
}

/** Einzelner Punkt im Rückfragenpaket der SFA an den Mandanten. */
export interface InquiryPackageItem {
  caseId: string;
  questionText: string;
}
