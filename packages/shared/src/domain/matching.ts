/**
 * Matching-Ergebnis-Typen und Workflow-Steuerungstypen.
 *
 * Diese Typen beschreiben das Ergebnis des Matching-Prozesses
 * sowie die daraus abgeleiteten UI-Aktionen.
 */

/**
 * Priorität/Dringlichkeit eines Lifecycle-Ergebnisses.
 * - info:    Hinweis, kein Handlungsbedarf
 * - warning: Aufmerksamkeit erforderlich
 * - action:  Sofortige Aktion notwendig
 */
export type Severity = "info" | "warning" | "action";

/**
 * Empfohlene nächste Aktion nach einem Lifecycle-Ergebnis.
 * Steuert die UI-Navigation und Dialog-Flows.
 *
 * - none:                  Nichts zu tun
 * - inbox_task:            Aufgabe im Posteingang erstellen
 * - ask_user:              Rückfrage an den Mandanten stellen
 * - start_split_ui:        Aufteilungs-Dialog öffnen
 * - start_eigenbeleg_flow: Eigenbeleg-Erstellungs-Flow starten
 * - reupload_request:      Erneutes Hochladen des Belegs anfordern
 */
export type NextAction =
  | "none"
  | "inbox_task"
  | "ask_user"
  | "start_split_ui"
  | "start_eigenbeleg_flow"
  | "reupload_request";

/**
 * Hint für einen erneuten Matching-Lauf mit angepasstem Zeitfenster.
 * Relevant bei Cross-Period-Szenarien (z.B. Privatvorschuss + Sammelüberweisung).
 */
export interface RematchHint {
  /** ISO-Datum als Ankerpunkt für das neue Matching-Fenster. */
  anchorDate: string;
  /** Tage vor anchorDate die durchsucht werden sollen. */
  windowBeforeDays: number;
  /** Tage nach anchorDate die durchsucht werden sollen. */
  windowAfterDays: number;
}

/**
 * Match-Status einer einzelnen Matching-Entscheidung.
 * - final:     Bestätigter Match (manuell oder automatisch mit hoher Konfidenz)
 * - suggested: System-Vorschlag, noch nicht bestätigt
 * - ambiguous: Mehrere mögliche Matches, eindeutige Zuordnung nicht möglich
 * - partial:   Teilmatch (z.B. 1 Tx deckt N Belege, Restbetrag offen)
 */
export type MatchState = "final" | "suggested" | "ambiguous" | "partial";

/**
 * Art der Beziehung zwischen Transaktionen und Belegen.
 * - one_to_one:   1 Tx ↔ 1 Beleg (Normalfall)
 * - many_to_one:  N Tx ↔ 1 Beleg (z.B. Ratenzahlung)
 * - one_to_many:  1 Tx ↔ N Belege (z.B. Sammelüberweisung / Privatvorschuss)
 * - many_to_many: N Tx ↔ N Belege (komplexe Fälle)
 */
export type MatchRelationType =
  | "one_to_one"
  | "many_to_one"
  | "one_to_many"
  | "many_to_many";
