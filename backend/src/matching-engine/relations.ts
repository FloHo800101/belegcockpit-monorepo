import { Doc, Tx, DocCandidate, Relation, RelationSet } from "./types";
import { MatchingConfig, amountCompatible, calcWindow } from "./config";

export function detectRelationsForTx(
  tx: Tx,
  docCands: DocCandidate[],
  txsInPool: Tx[],
  cfg: MatchingConfig
): RelationSet {
  const filtered = docCands.filter(
    (c) => c.doc.currency === tx.currency && c.doc.tenant_id === tx.tenant_id
  );
  const manyToOneCandidates = filterManyToOneCandidates(filtered, tx);

  const oneToOne: RelationSet["oneToOne"] = [];
  const manyToOne: RelationSet["manyToOne"] = [];
  const oneToMany: RelationSet["oneToMany"] = [];
  const manyToMany: RelationSet["manyToMany"] = [];

  for (const cand of filtered) {
    if (isOneToOnePlausible(cand, tx, cfg)) {
      oneToOne.push({ kind: "one_to_one", tx, doc: cand });
    }
  }

  if (manyToOneCandidates.length >= 2) {
    if (manyToOneCandidates.length <= cfg.subsetSum.maxCandidates) {
      manyToOne.push({ kind: "many_to_one", tx, docs: manyToOneCandidates });
    }
  }

  const seedDocs = filtered.filter((cand) => isPotentialPartialFlow(cand, tx, cfg));
  for (const seed of seedDocs) {
    const extraTxs = findRelatedTxs(seed.doc, tx, txsInPool, cfg, 10);
    const combined = uniqueById([tx, ...extraTxs]);
    if (combined.length >= 2) {
      oneToMany.push({ kind: "one_to_many", doc: seed.doc, txs: combined });
    }
  }

  const exactManyToMany = buildExactManyToMany(tx, filtered, txsInPool, cfg);
  if (exactManyToMany) {
    manyToMany.push(exactManyToMany);
  }

  const manyToManyNeeded =
    manyToOneCandidates.length > cfg.subsetSum.maxCandidates ||
    (manyToOne.length > 0 && oneToMany.length > 0) ||
    oneToOne.length > 1;

  if (manyToManyNeeded) {
    const clusterDocs = limitStable(filtered.map((c) => c.doc), 20);
    const clusterTxs = limitStable(
      clusterByKey(tx, txsInPool, clusterDocs[0]),
      20
    );
    const key = groupKeyForCluster(tx, clusterDocs[0]);
    manyToMany.push({
      kind: "many_to_many",
      txs: uniqueById([tx, ...clusterTxs]),
      docs: uniqueById(clusterDocs),
      hypothesis: { key, sizeDocs: clusterDocs.length, sizeTxs: clusterTxs.length + 1 },
    });
  }

  return { oneToOne, manyToOne, oneToMany, manyToMany };
}

function filterManyToOneCandidates(cands: DocCandidate[], tx: Tx): DocCandidate[] {
  let filtered = cands;

  if (tx.vendor_norm) {
    filtered = filtered.filter((cand) => {
      if (!cand.doc.vendor_norm) return false;
      return cand.doc.vendor_norm === tx.vendor_norm;
    });
  }

  const hasInvoiceSignal = filtered.some((cand) => cand.features.invoice_no_equal);
  if (hasInvoiceSignal) {
    filtered = filtered.filter((cand) => cand.features.invoice_no_equal);
  }

  return filtered;
}

function buildExactManyToMany(
  tx: Tx,
  docCands: DocCandidate[],
  txsInPool: Tx[],
  cfg: MatchingConfig
): Relation | null {
  if (docCands.length < 2) return null;

  const vendorFiltered = tx.vendor_norm
    ? docCands.filter((cand) => cand.doc.vendor_norm === tx.vendor_norm)
    : docCands;
  if (vendorFiltered.length < 2) return null;

  const docs = vendorFiltered.map((cand) => cand.doc);
  const docWindows = docs.map((doc) => calcWindow(doc, cfg));

  const txCandidates = txsInPool.filter((candidate) => {
    if (candidate.id === tx.id) return true;
    if (candidate.tenant_id !== tx.tenant_id) return false;
    if (candidate.currency !== tx.currency) return false;
    if (tx.vendor_norm && candidate.vendor_norm && candidate.vendor_norm !== tx.vendor_norm) {
      return false;
    }
    if (!candidate.booking_date) return false;
    return docWindows.some((window) => inWindow(candidate.booking_date, window));
  });

  if (txCandidates.length < 2) return null;

  const sumDocs = docs.reduce((acc, doc) => acc + doc.amount, 0);
  const sumTxs = txCandidates.reduce((acc, item) => acc + item.amount, 0);
  if (!amountCompatible(sumDocs, sumTxs, cfg)) return null;

  return {
    kind: "many_to_many",
    txs: uniqueById(txCandidates),
    docs: uniqueById(docs),
    hypothesis: {
      key: "many_to_many_exact_sum",
      sizeDocs: docs.length,
      sizeTxs: txCandidates.length
    }
  };
}

export function detectRelationsForDoc(
  doc: Doc,
  txCands: Tx[],
  docsInPool: Doc[],
  cfg: MatchingConfig
): RelationSet {
  const candidates = txCands.filter(
    (tx) => tx.currency === doc.currency && tx.tenant_id === doc.tenant_id
  );

  const oneToOne: RelationSet["oneToOne"] = [];
  const manyToOne: RelationSet["manyToOne"] = [];
  const oneToMany: RelationSet["oneToMany"] = [];
  const manyToMany: RelationSet["manyToMany"] = [];

  for (const tx of candidates) {
    const cand: DocCandidate = { doc, features: { amount_delta: 0, days_delta: 0 } };
    if (isOneToOnePlausible(cand, tx, cfg)) {
      oneToOne.push({ kind: "one_to_one", tx, doc: cand });
    }
  }

  if (candidates.length >= 2) {
    oneToMany.push({ kind: "one_to_many", doc, txs: candidates });
  }

  if (docsInPool.length > cfg.subsetSum.maxCandidates) {
    const key = candidates.length ? groupKeyForCluster(candidates[0], doc) : "";
    manyToMany.push({
      kind: "many_to_many",
      txs: limitStable(candidates, 20),
      docs: limitStable(docsInPool, 20),
      hypothesis: { key, sizeDocs: docsInPool.length, sizeTxs: candidates.length },
    });
  }

  if (candidates.length >= 2) {
    manyToOne.push({
      kind: "many_to_one",
      tx: candidates[0],
      docs: docsInPool.map((d) => ({ doc: d, features: { amount_delta: 0, days_delta: 0 } })),
    });
  }

  return { oneToOne, manyToOne, oneToMany, manyToMany };
}

export function groupKeyForCluster(tx: Tx, doc?: Doc): string {
  const parts = [
    tx.tenant_id,
    tx.currency,
    safeLower(tx.vendor_norm ?? doc?.vendor_norm),
    canonCompact(tx.iban ?? doc?.iban ?? ""),
  ];
  return parts.join("|");
}

export function isPotentialPartialFlow(
  docCand: DocCandidate,
  tx: Tx,
  cfg: MatchingConfig
): boolean {
  if (docCand.features.partial_keywords) return true;
  if (docCand.features.iban_equal || docCand.features.invoice_no_equal || docCand.features.e2e_equal) {
    if (!amountCompatible(docCand.doc.amount, tx.amount, cfg)) return true;
  }
  return tx.amount < docCand.doc.amount;
}

export function isPotentialBatchFlow(
  docCand: DocCandidate,
  tx: Tx,
  cfg: MatchingConfig
): boolean {
  if (docCand.features.partial_keywords) return true;
  if (!amountCompatible(docCand.doc.amount, tx.amount, cfg)) return true;
  return isBatchKeywordMatch(tx, docCand.doc, cfg);
}

function isOneToOnePlausible(docCand: DocCandidate, tx: Tx, cfg: MatchingConfig): boolean {
  if (docCand.doc.currency !== tx.currency) return false;
  const amountOk = amountCompatible(docCand.doc.amount, tx.amount, cfg);
  if (docCand.features.iban_equal && amountOk) return true;
  if (docCand.features.invoice_no_equal && amountOk) return true;
  if (docCand.features.e2e_equal && amountOk) return true;
  return amountOk && docCand.features.days_delta <= cfg.dateWindowDays;
}

function findRelatedTxs(doc: Doc, seedTx: Tx, txs: Tx[], cfg: MatchingConfig, limit: number) {
  const window = calcWindow(doc, cfg);
  const related = [];

  for (const tx of txs) {
    if (tx.id === seedTx.id) continue;
    if (tx.tenant_id !== doc.tenant_id) continue;
    if (tx.currency !== doc.currency) continue;
    if (!inWindow(tx.booking_date, window)) continue;

    if (doc.iban && tx.iban && canonCompact(doc.iban) !== canonCompact(tx.iban)) continue;
    if (doc.vendor_norm && tx.vendor_norm && doc.vendor_norm !== tx.vendor_norm) continue;
    if (doc.e2e_id && tx.e2e_id && canonCompact(doc.e2e_id) !== canonCompact(tx.e2e_id)) continue;

    related.push(tx);
    if (related.length >= limit) break;
  }

  return related;
}

function clusterByKey(seedTx: Tx, txs: Tx[], seedDoc?: Doc) {
  const key = groupKeyForCluster(seedTx, seedDoc);
  return txs.filter((tx) => groupKeyForCluster(tx, seedDoc) === key);
}

function inWindow(iso: string, window: { from: string; to: string }) {
  const d = Date.parse(iso);
  return Number.isFinite(d) && d >= Date.parse(window.from) && d <= Date.parse(window.to);
}

function canonCompact(s?: string | null) {
  return (s ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

function safeLower(s?: string | null) {
  return (s ?? "").toLowerCase();
}

function isBatchKeywordMatch(tx: Tx, doc: Doc, cfg: MatchingConfig) {
  const keywords = cfg.keywords ?? DEFAULT_KEYWORDS;
  const haystack = [tx.text_norm, tx.ref, tx.vendor_norm, doc.text_norm, doc.vendor_norm]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return containsAny(haystack, keywords.batchPayment);
}

function containsAny(haystack: string, needles: readonly string[]) {
  for (const needle of needles) {
    if (haystack.includes(needle)) return true;
  }
  return false;
}

function limitStable<T>(arr: T[], limit: number) {
  return arr.length > limit ? arr.slice(0, limit) : arr;
}

function uniqueById<T extends { id: string }>(arr: T[]) {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of arr) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

const DEFAULT_KEYWORDS = {
  partialPayment: ["teilzahlung", "rate", "anzahlung", "partial"],
  batchPayment: ["sammel", "collective", "mehrere rechnungen", "batch"],
};

/*
Testfälle
- 1 tx + 1 doc with iban_equal + compatible => one_to_one present
- 1 tx + 5 docs (<= maxCandidates) => many_to_one present
- 1 tx + 30 docs (> maxCandidates) => many_to_many present, no many_to_one
- e2e_equal aber amount nicht compatible => one_to_many seed oder many_to_many, aber NICHT one_to_one
*/
