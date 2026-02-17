/**
 * Workflow-Typen aus Mandanten-Perspektive.
 *
 * Der Mandant arbeitet seine Bankperiode Monat für Monat ab.
 * Die offenen Punkte werden in "Pakete" (MandantPackageKey) gruppiert.
 */

/**
 * Aktueller Workflow-Status einer Transaktion aus Sicht des Mandanten.
 *
 * - matched_confident:   Automatisch mit hoher Konfidenz gematcht (kein Handlungsbedarf)
 * - matched_uncertain:   Match gefunden, aber Bestätigung durch Mandant erforderlich
 * - missing_receipt:     Keine passender Beleg gefunden (Mandant muss handeln)
 * - resolved_no_receipt: Mandant hat bestätigt: kein Beleg erwartet (z.B. Bankgebühr)
 * - resolved_self_receipt: Mandant hat Eigenbeleg erstellt
 * - resolved_private:    Mandant hat als Privatausgabe markiert
 */
export type TransactionStatus =
  | "matched_confident"
  | "matched_uncertain"
  | "missing_receipt"
  | "resolved_no_receipt"
  | "resolved_self_receipt"
  | "resolved_private";

/**
 * Paket-Kategorie für offene Punkte des Mandanten.
 * Die Matching Engine ordnet jede Transaktion einem Paket zu,
 * damit der Mandant homogene Gruppen gemeinsam bearbeiten kann.
 *
 * - monthly_invoices:    Regelmäßige Monatsrechnungen (Telekom, Strom, SaaS)
 * - small_no_receipt:    Kleinstbeträge ohne Beleg (Parkschein, Trinkgeld)
 * - top_amounts:         Hochbeträge ohne Beleg (erhöhtes Risiko)
 * - marketplace_statement: Marktplatz-Abrechnungen (Amazon, eBay – 1 Tx = N Artikel)
 * - subscriptions:       Erkannte Abonnements (Netflix, Adobe, etc.)
 * - bundles:             Sammelüberweisungen (1 Tx → N Belege, inkl. Cross-Period)
 * - refunds:             Erstattungen / Gutschriften
 * - review:              Manuelle Prüfung erforderlich
 * - confirm:             Unsichere Matches, Bestätigung ausstehend
 * - other_open:          Sonstige offene Punkte
 * - none:                Kein Paket (z.B. bereits erledigt)
 */
export type MandantPackageKey =
  | "monthly_invoices"
  | "small_no_receipt"
  | "top_amounts"
  | "marketplace_statement"
  | "subscriptions"
  | "bundles"
  | "refunds"
  | "review"
  | "confirm"
  | "other_open"
  | "none";
