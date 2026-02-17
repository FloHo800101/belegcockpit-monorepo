/**
 * Dokumenten-Typen und Lifecycle-Zustände.
 *
 * "Doc" = Beleg/Rechnung (was der Mandant hochlädt oder aus Azure extrahiert wird).
 * "LinkState" = Matching-Status in der Datenbank.
 */

/** Art des Dokuments (Rechnungs- oder Belegtyp). */
export type DocumentType = "invoice" | "bank_statement" | "receipt" | "credit_note" | "unknown";

/**
 * Matching-Status eines Dokuments oder einer Transaktion in der DB.
 * - unlinked:  noch kein Match gefunden
 * - suggested: System-Vorschlag, Mandant/SFA muss bestätigen
 * - partial:   Teilmatch (z.B. 1 Tx deckt nur einen Teil des Belegs)
 * - linked:    vollständig und final gematcht
 */
export type LinkState = "unlinked" | "suggested" | "partial" | "linked";

/**
 * Lifecycle-Kategorie eines Dokuments (Backend-Klassifikation).
 * Wird vom Matching-Pipeline-Ergebnis geliefert.
 *
 * - doc_duplicate:    Duplikat erkannt (gleicher Hash/InvoiceNo)
 * - doc_error:        Extraktion fehlgeschlagen (Azure-Fehler o.ä.)
 * - awaiting_tx:      Beleg hochgeladen, aber passende Transaktion fehlt noch
 * - overdue:          Fälligkeitsdatum überschritten
 * - eigenbeleg:       Als Eigenbeleg klassifiziert
 * - private:          Als Privatausgabe markiert
 * - split_required:   Rechnung muss aufgeteilt werden (Mischkauf privat/betrieblich)
 */
export type DocLifecycleKind =
  | "doc_duplicate"
  | "doc_error"
  | "awaiting_tx"
  | "overdue"
  | "eigenbeleg"
  | "private"
  | "split_required";

/** Lifecycle-Ergebnis für ein einzelnes Dokument. */
export interface DocLifecycleResult {
  docId: string;
  kind: DocLifecycleKind;
  severity: Severity;
  nextAction: NextAction;
  rematchHint?: RematchHint;
  explanationCodes: string[];
}

// Re-export for convenience
export type { Severity, NextAction, RematchHint } from "./matching";
