// Pipeline
export { run_pipeline } from "./pipeline.ts";
export type { PipelineRunOptions, PipelineDebug } from "./pipeline.ts";

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
} from "./types.ts";

// Config
export { resolveConfig, amountCompatible, calcWindow, isOverdue, daysBetween } from "./config.ts";
export type { MatchingConfig } from "./config.ts";

// Core modules
export { partitionByLinkState } from "./partition.ts";
export { runItemFirstPhase } from "./item-first.ts";
export type { ItemFirstPhaseResult } from "./item-first.ts";
export type { Partitions, PartitionMeta } from "./partition.ts";

export { evaluateDocLifecycle, evaluateTxLifecycle } from "./lifecycles.ts";

export { prepassHardMatches, hardKeyType, hasPartialOrBatchPaymentHints } from "./prepass.ts";
export type { PrepassResult } from "./prepass.ts";

export { candidatesForTx, candidatesForDoc, buildFeatureVector, inDateWindow } from "./candidates.ts";

export {
  detectRelationsForTx,
  detectRelationsForDoc,
  groupKeyForCluster,
  isPotentialPartialFlow,
  isPotentialBatchFlow,
} from "./relations.ts";

export {
  matchOneToOne,
  matchManyToOne,
  matchOneToMany,
  matchManyToMany,
  scoreOneToOne,
  subsetSumDocsToAmount,
  groupIdFor,
  canonCompact,
} from "./matchers.ts";
export { canonId } from "./ids.ts";

export { resolveConflicts, normalizeDecision, decisionKey as decisionKeyForResolver, hasOverlap, compareByPriority } from "./decision-resolver.ts";
export type { Resolved } from "./decision-resolver.ts";

export {
  toApplyOps,
  toAuditRecord,
  projectUniqueEdgeRefs,
  inferredLinkState,
  assertDecisionPersistable,
  decisionKey as decisionKeyForAudit,
} from "./persistence.ts";
export type { ApplyOp, AuditRecord, EdgeDocRef, EdgeTxRef } from "./persistence.ts";

// Utilities
export { normalizeText, normalizeVendor, extractInvoiceNo, stripDiacritics, tokenize } from "./normalize.ts";
export { normalizeTx } from "./normalization.ts";
