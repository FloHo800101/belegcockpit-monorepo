/**
 * @beleg-cockpit/shared – Single Source of Truth für gemeinsame Typen.
 *
 * Importiert von Frontend (Vite/React) und Backend (tsx/Supabase Edge Functions).
 * Alle Exports in camelCase (API-Contract-Konvention).
 */

// Domain: Dokumente & Belege
export type {
  DocumentType,
  LinkState,
  DocLifecycleKind,
  DocLifecycleResult,
} from "./domain/document";

// Domain: Transaktionen
export type {
  Direction,
  TxLifecycleKind,
  TxLifecycleResult,
} from "./domain/transaction";

// Domain: Matching
export type {
  Severity,
  NextAction,
  RematchHint,
  MatchState,
  MatchRelationType,
} from "./domain/matching";

// Workflow: Mandant
export type {
  TransactionStatus,
  MandantPackageKey,
} from "./workflow/mandant";

// Workflow: Kanzlei / SFA
export type {
  KanzleiCluster,
  SfaQueueId,
  SfaCaseStatus,
  SfaTriggerReason,
  SfaMandantStatus,
} from "./workflow/kanzlei";

export {
  CLUSTER_RISK_BASE,
  CLUSTER_KPI_GROUPS,
} from "./workflow/kanzlei";

// API: Entitäten
export type {
  ApiTx,
  ApiDoc,
  ApiTxView,
} from "./api/entities";

// API: Responses
export type {
  MandantMonthSummary,
  MatchingRunResult,
  MatchDecisionView,
  ApiError,
} from "./api/responses";
