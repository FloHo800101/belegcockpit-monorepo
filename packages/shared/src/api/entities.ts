/**
 * API-Entitäten: die Shapes wie Backend sie über HTTP-Endpunkte liefert.
 *
 * WICHTIG: Alle Felder hier in camelCase – das ist der API-Contract.
 * Das Backend konvertiert intern von snake_case zu camelCase bevor es antwortet.
 * Das Frontend erwartet immer camelCase.
 */

import type { LinkState, DocumentType } from "../domain/document";
import type { Direction } from "../domain/transaction";
import type { TransactionStatus, MandantPackageKey } from "../workflow/mandant";
import type { KanzleiCluster } from "../workflow/kanzlei";

/**
 * Banktransaktion wie sie über die API geliefert wird.
 * Entspricht einer Zeile im Kontoauszug des Mandanten.
 */
export interface ApiTx {
  id: string;
  tenantId: string;
  /** Betrag in Hauptwährungseinheit (positive Zahl; Richtung über `direction`) */
  amount: number;
  direction: Direction;
  currency: string;
  bookingDate: string;       // ISO 8601 (YYYY-MM-DD)
  valueDate?: string;        // ISO 8601, kann von bookingDate abweichen
  linkState: LinkState;
  /** IBAN des Zahlungsempfängers/-senders */
  iban?: string | null;
  /** Verwendungszweck (Referenztext der Bank) */
  ref?: string | null;
  /** End-to-End-ID (SEPA) */
  e2eId?: string | null;
  /** Roh-Name des Zahlungspartners (direkt aus Kontoauszug) */
  counterpartyName?: string | null;
  /** Normalisierter Lieferanten-/Counterparty-Key (für Matching) */
  vendorKey?: string | null;
  /** Hinweis: Privatentnahme/-einlage */
  privateHint?: boolean | null;
  /** Hinweis: wiederkehrende Zahlung (Abo) */
  isRecurringHint?: boolean | null;
}

/**
 * Beleg/Dokument wie er über die API geliefert wird.
 * Entspricht einem hochgeladenen und extrahierten Dokument des Mandanten.
 */
export interface ApiDoc {
  id: string;
  tenantId: string;
  amount: number;
  currency: string;
  linkState: LinkState;
  documentType?: DocumentType;
  invoiceDate?: string;      // ISO 8601
  dueDate?: string;          // ISO 8601 – Fälligkeitsdatum
  documentDate?: string;     // ISO 8601 – Dokumentdatum (wenn kein invoiceDate)
  /** Zahlungsart (Hinweis aus dem Beleg) */
  paymentHint?: "cash" | "ec" | "card" | "transfer" | "unknown";
  /** Qualitätsscore der Extraktion (0-1, null wenn unbekannt) */
  extractionQuality?: number | null;
  /** Alle Pflichtfelder vorhanden und lesbar */
  hasRequiredFields?: boolean | null;
  /** Hinweis: Privatausgabe */
  privateHint?: boolean | null;
  /** Hinweis: Beleg muss aufgeteilt werden (Mischkauf) */
  splitHint?: boolean | null;
  /** Duplikat-Schlüssel (für Duplikatserkennung) */
  duplicateKey?: string | null;
  /** IBAN aus dem Beleg (Bankverbindung des Lieferanten) */
  iban?: string | null;
  /** Rechnungsnummer */
  invoiceNo?: string | null;
  /** End-to-End-ID */
  e2eId?: string | null;
  /** Roh-Name des Lieferanten (direkt aus Dokument) */
  vendorRaw?: string | null;
  /** Normalisierter Lieferanten-Name (für Matching) */
  vendorNorm?: string | null;
  /**
   * Offener Betrag bei Teilmatch (1:N).
   * null = kein Teilmatch aktiv.
   */
  openAmount?: number | null;
}

/**
 * Erweiterte Transaktions-Ansicht für das Frontend (inkl. UI-Workflow-Felder).
 * Kombiniert ApiTx mit den vom Matching-Ergebnis abgeleiteten UI-Feldern.
 */
export interface ApiTxView extends ApiTx {
  /** Aktueller Workflow-Status aus Mandanten-Sicht */
  status: TransactionStatus;
  /** Konfidenz des Matches (0-100) */
  matchConfidence: number;
  /** Paket-Bucket für die Mandanten-Arbeitsliste */
  mandantPackageKey: MandantPackageKey;
  /** Cluster-Kategorie für die Kanzlei-Workbench */
  kanzleiCluster: KanzleiCluster;
  /** IDs der Beleg-Kandidaten für diesen Match */
  candidateDocumentIds?: string[];
}
