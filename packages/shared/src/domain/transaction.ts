/**
 * Transaktions-Typen und Lifecycle-Zustände.
 *
 * "Tx" = Banktransaktion (aus dem Kontoauszug des Mandanten).
 */

import type { Severity, NextAction, RematchHint } from "./matching";

/**
 * Zahlungsrichtung einer Transaktion aus Sicht des Mandanten.
 * - in:  Einnahme / Gutschrift
 * - out: Ausgabe / Belastung
 */
export type Direction = "in" | "out";

/**
 * Lifecycle-Kategorie einer Transaktion (Backend-Klassifikation).
 * Wird vom Matching-Pipeline-Ergebnis geliefert.
 *
 * - technical_tx:    Interne/technische Buchung (z.B. Umbuchung zwischen eigenen Konten)
 * - private_tx:      Privatentnahme oder -einlage
 * - fee_tx:          Bankgebühr (kein Beleg erforderlich)
 * - subscription_tx: Erkanntes Abo (Netflix, Adobe, etc.)
 * - prepayment_tx:   Anzahlung / Vorauszahlung
 * - needs_eigenbeleg: Kleinbetrag ohne Beleg → Eigenbeleg erforderlich
 * - missing_doc:     Zahlung ohne zugeordneten Beleg, kein Sonderfall
 */
export type TxLifecycleKind =
  | "technical_tx"
  | "private_tx"
  | "fee_tx"
  | "subscription_tx"
  | "prepayment_tx"
  | "needs_eigenbeleg"
  | "missing_doc";

/** Lifecycle-Ergebnis für eine einzelne Transaktion. */
export interface TxLifecycleResult {
  txId: string;
  kind: TxLifecycleKind;
  severity: Severity;
  nextAction: NextAction;
  rematchHint?: RematchHint;
  explanationCodes: string[];
  /**
   * Regelvorschlag für wiederkehrende Transaktionen.
   * Z.B. "Diesen Lieferanten immer als Abo erkennen".
   */
  ruleSuggestion?: {
    type: "subscription_rule" | "fee_rule" | "vendor_rule";
    key: string;
    cadence?: "monthly" | "yearly" | "weekly";
  };
}

export type { Severity, NextAction, RematchHint };
