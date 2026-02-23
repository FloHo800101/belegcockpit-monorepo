// Pipeline
export { run_pipeline } from "./pipeline";
export type { PipelineRunOptions, PipelineDebug } from "./pipeline";

// Types
export type {
  Doc,
  Tx,
  PipelineInput,
  PipelineResult,
  MatchDecision,
  MatchRepository,
  LinkState,
  MatchState,
  MatchRelationType,
  Direction,
  DocCandidate,
  FeatureVector,
  Relation,
  RelationSet,
  DocLifecycleKind,
  DocLifecycleResult,
  Severity,
  NextAction,
  RematchHint,
  TxLifecycleKind,
  TxLifecycleResult,
  TxHistoryOptions,
} from "./types";

// Config
export { resolveConfig, amountCompatible, calcWindow, isOverdue, daysBetween } from "./config";
export type { MatchingConfig } from "./config";

// Core modules
export { partitionByLinkState } from "./partition";
export { runItemFirstPhase } from "./item-first";
export type { ItemFirstPhaseResult } from "./item-first";
export type { Partitions, PartitionMeta } from "./partition";

export { evaluateDocLifecycle, evaluateTxLifecycle } from "./lifecycles";

export { prepassHardMatches, hardKeyType, hasPartialOrBatchPaymentHints } from "./prepass";
export type { PrepassResult } from "./prepass";

export { candidatesForTx, candidatesForDoc, buildFeatureVector, inDateWindow } from "./candidates";

export {
  detectRelationsForTx,
  detectRelationsForDoc,
  groupKeyForCluster,
  isPotentialPartialFlow,
  isPotentialBatchFlow,
} from "./relations";

export {
  matchOneToOne,
  matchManyToOne,
  matchOneToMany,
  matchManyToMany,
  scoreOneToOne,
  subsetSumDocsToAmount,
  groupIdFor,
  canonCompact,
} from "./matchers";
export { canonId } from "./ids";

export { resolveConflicts, normalizeDecision, decisionKey as decisionKeyForResolver, hasOverlap, compareByPriority } from "./decision-resolver";
export type { Resolved } from "./decision-resolver";

export {
  toApplyOps,
  toAuditRecord,
  projectUniqueEdgeRefs,
  inferredLinkState,
  assertDecisionPersistable,
  decisionKey as decisionKeyForAudit,
} from "./persistence";
export type { ApplyOp, AuditRecord, EdgeDocRef, EdgeTxRef } from "./persistence";

// Utilities
export { normalizeText, normalizeVendor, extractInvoiceNo, stripDiacritics, tokenize } from "./normalize";
export { normalizeTx } from "./normalization";
