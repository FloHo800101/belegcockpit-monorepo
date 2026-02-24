import { resolveConfig, MatchingConfig } from "./config.ts";
import { candidatesForTx } from "./candidates.ts";
import { resolveConflicts } from "./decision-resolver.ts";
import { evaluateDocLifecycle, evaluateTxLifecycle } from "./lifecycles.ts";
import { runItemFirstPhase } from "./item-first.ts";
import { matchManyToMany, matchManyToOne, matchOneToMany, matchOneToOne } from "./matchers.ts";
import { normalizeTx } from "./normalization.ts";
import { prepassHardMatches } from "./prepass.ts";
import { partitionByLinkState } from "./partition.ts";
import { detectRelationsForTx } from "./relations.ts";
import {
  Doc,
  MatchDecision,
  MatchRepository,
  PipelineInput,
  PipelineResult,
  Tx,
} from "./types.ts";

export type PipelineRunOptions = {
  nowISO?: string;
  cfgOverride?: Partial<MatchingConfig>;
  tenantFilter?: string | null;
  limits?: { maxTx?: number; maxDocs?: number; maxRelationsPerTx?: number };
  eventType?: "tx_created" | "doc_created" | "nightly";
  debug?: boolean;
};

export type PipelineDebug = {
  partitions: { doc_tx: { docs: number; txs: number }; doc_only: number; tx_only: number };
  prepass: { final: number; remainingDocs: number; remainingTx: number };
  itemFirst: { decisions: number; remainingDocs: number; remainingTx: number };
  generated: { relations: number; decisions: number };
  resolved: { final: number; suggestions: number };
};

export async function run_pipeline(
  input: PipelineInput,
  repo: MatchRepository,
  options?: PipelineRunOptions
): Promise<PipelineResult & { debug?: PipelineDebug }> {
  const nowISO = options?.nowISO ?? input.nowISO ?? new Date().toISOString();
  const now = new Date(nowISO);
  const cfg = resolveConfig(options?.cfgOverride);
  const tenantFilter = options?.tenantFilter ?? null;
  const limits = options?.limits ?? {};
  const eventType = options?.eventType ?? "nightly";

  const docsInput = applyLimits(applyTenantFilter(input.docs, tenantFilter), limits.maxDocs);
  const txsInput = applyLimits(applyTenantFilter(input.txs, tenantFilter), limits.maxTx);

  const docById = buildDocIndex(docsInput);
  const txById = buildTxIndex(txsInput);

  const partitionResult = partitionByLinkState({ docs: docsInput, txs: txsInput, nowISO });
  const parts =
    "partitions" in partitionResult ? partitionResult.partitions : partitionResult;
  const docLifecycle = parts.doc_only.docs.map((doc) => evaluateDocLifecycle(doc, now, cfg));
  const txLifecycle = await Promise.all(
    parts.tx_only.txs.map(async (tx) => {
      const history =
        eventType === "tx_created" && cfg.enableSubscriptionHistory
          ? await loadTxHistoryForTx(tx, repo, cfg)
          : undefined;
      return evaluateTxLifecycle(tx, now, cfg, history);
    })
  );
  const txLifecycleById = new Map(txLifecycle.map((item) => [item.txId, item]));

  const prepass = prepassHardMatches(parts.doc_tx.docs, parts.doc_tx.txs, cfg);
  const itemFirst = runItemFirstPhase(prepass.remainingDocs, prepass.remainingTx, cfg);
  const decisions: MatchDecision[] = [...prepass.final, ...itemFirst.decisions];

  const relationDocs = itemFirst.remainingDocs;
  const relationTxs = dedupeTxById([...itemFirst.remainingTx, ...parts.tx_only.txs]);

  let relationsCount = 0;
  for (const tx of relationTxs) {
    const includeLinkedDocs = txLifecycleById.get(tx.id)?.kind === "subscription_tx";
    const txForMatching =
      includeLinkedDocs && tx.is_recurring_hint !== true && tx.isRecurringHint !== true
        ? { ...tx, is_recurring_hint: true as const }
        : tx;
    const docsForTx = includeLinkedDocs
      ? mergeDocsById(relationDocs, collectLinkedDocsForTenant(docsInput, tx.tenant_id))
      : relationDocs;
    const docCands = candidatesForTx(txForMatching, docsForTx, cfg, { includeLinkedDocs });
    const relationTxPool = txForMatching === tx ? relationTxs : replaceTxById(relationTxs, txForMatching);
    const relSet = detectRelationsForTx(txForMatching, docCands, relationTxPool, cfg);
    relationsCount +=
      relSet.oneToOne.length +
      relSet.manyToOne.length +
      relSet.oneToMany.length +
      relSet.manyToMany.length;

    const maxRel = limits.maxRelationsPerTx;
    const oneToOne = maxRel ? relSet.oneToOne.slice(0, maxRel) : relSet.oneToOne;
    const manyToOne = maxRel ? relSet.manyToOne.slice(0, maxRel) : relSet.manyToOne;
    const oneToMany = maxRel ? relSet.oneToMany.slice(0, maxRel) : relSet.oneToMany;
    const manyToMany = maxRel ? relSet.manyToMany.slice(0, maxRel) : relSet.manyToMany;

    for (const rel of oneToOne) decisions.push(...matchOneToOne(rel, cfg));
    for (const rel of manyToOne) decisions.push(...matchManyToOne(rel, cfg));
    for (const rel of oneToMany) decisions.push(...matchOneToMany(rel, cfg));
    for (const rel of manyToMany) decisions.push(...matchManyToMany(rel, cfg));
  }

  const enriched = decisions.map((decision) =>
    injectTenantId(decision, docById, txById)
  );
  const resolved = resolveConflicts(enriched);

  await repo.applyMatches(resolved.final);
  await repo.saveSuggestions(resolved.suggestions);
  await repo.audit(resolved.all);

  const result: PipelineResult & { debug?: PipelineDebug } = {
    decisions: resolved.all,
    prepass: { finalCount: prepass.final.length },
    docLifecycle,
    txLifecycle,
  };

  if (options?.debug) {
    result.debug = {
      partitions: {
        doc_tx: { docs: parts.doc_tx.docs.length, txs: parts.doc_tx.txs.length },
        doc_only: parts.doc_only.docs.length,
        tx_only: parts.tx_only.txs.length,
      },
      prepass: {
        final: prepass.final.length,
        remainingDocs: prepass.remainingDocs.length,
        remainingTx: prepass.remainingTx.length,
      },
      itemFirst: {
        decisions: itemFirst.decisions.length,
        remainingDocs: relationDocs.length,
        remainingTx: relationTxs.length,
      },
      generated: { relations: relationsCount, decisions: decisions.length },
      resolved: { final: resolved.final.length, suggestions: resolved.suggestions.length },
    };
  }

  return result;
}

async function loadTxHistoryForTx(
  tx: Tx,
  repo: MatchRepository,
  cfg: MatchingConfig
): Promise<Tx[]> {
  const tenantId = tx.tenant_id ?? (tx as any).tenantId ?? "__unknown__";
  const normalized = normalizeTx(tx);
  const vendorKey = normalized.vendorKey ?? null;
  const historyLimit = 200;

  return repo.loadTxHistory(tenantId, {
    lookbackDays: cfg.subscriptionDetection.lookbackDays,
    limit: historyLimit,
    vendorKey,
  });
}

function applyTenantFilter<T extends { tenant_id: string }>(
  items: T[],
  tenantFilter: string | null
): T[] {
  if (!tenantFilter) return items;
  const key = normalizeTenantId(tenantFilter);
  return items.filter((item) => normalizeTenantId(item.tenant_id) === key);
}

function applyLimits<T>(items: T[], limit?: number): T[] {
  if (!limit || limit <= 0) return items;
  return items.slice(0, limit);
}

function buildDocIndex(docs: Doc[]) {
  const map = new Map<string, Doc>();
  for (const doc of docs) map.set(doc.id, doc);
  return map;
}

function buildTxIndex(txs: Tx[]) {
  const map = new Map<string, Tx>();
  for (const tx of txs) map.set(tx.id, tx);
  return map;
}

function injectTenantId(
  decision: MatchDecision,
  docById: Map<string, Doc>,
  txById: Map<string, Tx>
): MatchDecision {
  if (decision.inputs?.tenant_id) return decision;

  const txId = decision.tx_ids[0];
  const docId = decision.doc_ids[0];
  const tenant =
    (txId && txById.get(txId)?.tenant_id) ||
    (docId && docById.get(docId)?.tenant_id) ||
    "__unknown__";

  return {
    ...decision,
    inputs: { ...decision.inputs, tenant_id: tenant },
  };
}

function normalizeTenantId(value?: string | null): string {
  if (!value) return "__unknown__";
  const trimmed = value.trim();
  return trimmed ? trimmed : "__unknown__";
}

function collectLinkedDocsForTenant(docs: Doc[], tenantId: string): Doc[] {
  const tenantKey = normalizeTenantId(tenantId);
  return docs.filter(
    (doc) => normalizeTenantId(doc.tenant_id) === tenantKey && doc.link_state === "linked"
  );
}

function mergeDocsById(primary: Doc[], extra: Doc[]): Doc[] {
  if (extra.length === 0) return primary;
  const out = [...primary];
  const seen = new Set(out.map((doc) => doc.id));
  for (const doc of extra) {
    if (seen.has(doc.id)) continue;
    seen.add(doc.id);
    out.push(doc);
  }
  return out;
}

function dedupeTxById(txs: Tx[]): Tx[] {
  const out: Tx[] = [];
  const seen = new Set<string>();
  for (const tx of txs) {
    if (seen.has(tx.id)) continue;
    seen.add(tx.id);
    out.push(tx);
  }
  return out;
}

function replaceTxById(txs: Tx[], replacement: Tx): Tx[] {
  return txs.map((item) => (item.id === replacement.id ? replacement : item));
}

/*
Testfälle
- empty inputs => no crash, lifecycles empty, decisions empty, repo called with empty arrays
- prepass produces finals => applyMatches called with finals
- ambiguous decisions never in applyMatches (resolver)
- tenantFilter isolates tenants
*/
