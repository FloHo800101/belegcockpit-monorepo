/**
 * Workflow-Typen aus Kanzlei-/SFA-Perspektive.
 *
 * SFA = Steuerfachangestellte (Mitarbeiterin der Kanzlei).
 * Die SFA arbeitet eine Arbeitsliste (Arbeitskorb) aller Mandanten ab.
 * Fälle werden in Cluster gruppiert und nach Risiko priorisiert.
 */

/**
 * Cluster-Kategorie für die Kanzlei-Workbench.
 * Jeder Cluster bündelt fachlich ähnliche Fälle, die die SFA gemeinsam bearbeiten kann.
 *
 * - missing:          Zahlung ohne Beleg (Mandant muss Beleg nachreichen)
 * - many_to_one:      N Zahlungen → 1 Beleg (z.B. Ratenzahlung)
 * - one_to_many:      1 Zahlung → N Belege (Split / Sammelüberweisung)
 * - duplicate_risk:   Verdacht auf doppelte Buchung
 * - amount_variance:  Betragsdifferenz zwischen Transaktion und Beleg
 * - timing:           Periodenabgrenzungsproblem (Zahlung und Beleg in verschiedenen Perioden;
 *                     z.B. Privatvorschuss in Feb/März, Sammelerstattung im April)
 * - vendor_unknown:   Zahlungsempfänger unklar / nicht erkannt
 * - tax_risk:         Steuerlich relevanter Sachverhalt (VST-Abzug gefährdet)
 * - fees:             Bankgebühren und ähnliche Kosten (kein Beleg erwartet)
 * - anomaly:          Ungewöhnliche Transaktion (Ausreißer, unbekanntes Muster)
 * - refund_reversal:  Erstattung oder Stornobuchung
 */
export type KanzleiCluster =
  | "missing"
  | "many_to_one"
  | "one_to_many"
  | "duplicate_risk"
  | "amount_variance"
  | "timing"
  | "vendor_unknown"
  | "tax_risk"
  | "fees"
  | "anomaly"
  | "refund_reversal";

/**
 * SFA-Queue-Kategorie für die strukturierte Bearbeitung in der Kanzlei.
 * Queues bündeln Fälle nach Bearbeitungsschritt / Eskalationsstufe.
 *
 * - missing_receipts:        Fehlende Belege (häufigste Queue)
 * - clarify_matching:        Unsichere Matches → Klärung mit Mandant
 * - tax_risks:               Steuerrisiken → SFA-Entscheidung
 * - duplicates_corrections:  Duplikate und Korrekturbuchungen
 * - fees_misc:               Gebühren und Sonstiges (Massenbearbeitung)
 */
export type SfaQueueId =
  | "missing_receipts"
  | "clarify_matching"
  | "tax_risks"
  | "duplicates_corrections"
  | "fees_misc";

/**
 * Status eines SFA-Falls.
 * - open:           Offen, noch nicht bearbeitet
 * - waiting_mandant: Rückfrage an Mandant gesendet, Antwort ausstehend
 * - done:           Abgeschlossen
 */
export type SfaCaseStatus = "open" | "waiting_mandant" | "done";

/**
 * Auslöser für eine SFA-Eskalation (warum dieser Fall in die Queue kam).
 * - ambiguous:        Matching-Algorithmus konnte nicht eindeutig entscheiden
 * - amount_deviation: Betragsdifferenz über Schwellenwert
 * - date_deviation:   Datumsdifferenz über Schwellenwert (Cross-Period)
 * - fee_uncertain:    Unklar ob Gebühr oder Beleg erwartet wird
 */
export type SfaTriggerReason =
  | "ambiguous"
  | "amount_deviation"
  | "date_deviation"
  | "fee_uncertain";

/**
 * Status des Mandanten in Bezug auf einen SFA-Fall
 * (was hat der Mandant zuletzt getan?).
 */
export type SfaMandantStatus =
  | "handed_over"
  | "rejected_match"
  | "uploaded_receipt"
  | "marked_private";

/**
 * Basis-Risikopunkte pro Cluster (für Priorisierung in der Arbeitsliste).
 * Addiert werden Betragspunkte: Math.min(40, |amount| / 50)
 */
export const CLUSTER_RISK_BASE: Record<KanzleiCluster, number> = {
  tax_risk: 80,
  duplicate_risk: 70,
  amount_variance: 60,
  vendor_unknown: 50,
  anomaly: 50,
  missing: 40,
  many_to_one: 30,
  one_to_many: 30,
  timing: 25,
  refund_reversal: 20,
  fees: 10,
};

/**
 * KPI-Gruppierung der Cluster für das Kanzlei-Dashboard.
 * - autoOk:       Automatisch ok, kein SFA-Eingriff nötig
 * - autoRequest:  System fordert automatisch Beleg an (Standardfall)
 * - needsHuman:   SFA muss manuell entscheiden
 */
export const CLUSTER_KPI_GROUPS = {
  autoOk: ["fees", "timing", "refund_reversal"] as KanzleiCluster[],
  autoRequest: ["missing", "many_to_one"] as KanzleiCluster[],
  needsHuman: [
    "duplicate_risk",
    "amount_variance",
    "vendor_unknown",
    "tax_risk",
    "anomaly",
    "one_to_many",
  ] as KanzleiCluster[],
};
