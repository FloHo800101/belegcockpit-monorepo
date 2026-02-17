/**
 * API-Response-Typen: Shapes der HTTP-Antworten.
 *
 * Diese Typen definieren was das Frontend vom Backend erwartet.
 * Jeder Endpunkt bekommt eine eigene Response-Type.
 */

import type { DocLifecycleResult } from "../domain/document";
import type { TxLifecycleResult } from "../domain/transaction";
import type { MatchState, MatchRelationType } from "../domain/matching";

/**
 * Dashboard-Zusammenfassung eines Mandanten für einen Buchungsmonat.
 * Geliefert vom Kanzlei-Dashboard-Endpunkt.
 *
 * Entspricht dem aktuellen Frontend-Mock-Typ `Mandant`.
 */
export interface MandantMonthSummary {
  mandantId: string;
  mandantName: string;
  /** z.B. "2026-01" */
  monthId: string;
  /** Anzeigename, z.B. "Januar 2026" */
  monthLabel: string;
  /** Gesamtzahl der Transaktionen im Monat */
  transactionCount: number;
  /** Anzahl hochgeladener Belege */
  documentCount: number;
  /** Automatisch sicher gematchte Transaktionen */
  matchedConfident: number;
  /** Unsichere Matches (Bestätigung ausstehend) */
  matchedUncertain: number;
  /** Transaktionen ohne Beleg */
  missingReceipt: number;
  /** Steuerrisiko-Flag (mindestens ein tax_risk-Cluster vorhanden) */
  hasRiskFlag: boolean;
  /** ISO-Datum der letzten Aktivität */
  lastActivity: string;
}

/**
 * Ergebnis eines Matching-Durchlaufs für einen Mandanten/Monat.
 * Geliefert vom Matching-Endpunkt nach erfolgreichem Lauf.
 */
export interface MatchingRunResult {
  tenantId: string;
  monthId: string;
  /** ISO-Zeitstempel des Laufs */
  ranAt: string;
  /** Anzahl verarbeiteter Transaktionen */
  txCount: number;
  /** Anzahl verarbeiteter Belege */
  docCount: number;
  /** Anzahl finaler Matches */
  finalMatches: number;
  /** Anzahl Vorschläge (suggested) */
  suggestedMatches: number;
  /** Lifecycle-Ergebnisse für Belege mit Sonderstatus */
  docLifecycle: DocLifecycleResult[];
  /** Lifecycle-Ergebnisse für Transaktionen mit Sonderstatus */
  txLifecycle: TxLifecycleResult[];
}

/**
 * Einzelne Match-Entscheidung des Systems (für Audit-Trail und Anzeige).
 */
export interface MatchDecisionView {
  id: string;
  state: MatchState;
  relationType: MatchRelationType;
  txIds: string[];
  docIds: string[];
  /** Konfidenz 0-100 */
  confidence: number;
  /** Maschinenlesbare Begründungscodes */
  reasonCodes: string[];
  /** Wer hat den Match ausgelöst */
  matchedBy: "system" | "user";
  /** Offener Betrag nach Teilmatch (null wenn kein Teilmatch) */
  openAmountAfter?: number | null;
}

/**
 * Standard-Fehlerantwort der API.
 */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
