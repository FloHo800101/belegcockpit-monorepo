import { Doc, LinkState, PipelineInput, Tx } from "./types";

export type Partitions = {
  doc_tx: { docs: Doc[]; txs: Tx[] };
  doc_only: { docs: Doc[] };
  tx_only: { txs: Tx[] };
};

export type PartitionMeta = {
  totalDocs: number;
  totalTxs: number;
  docsInMatchingPool: number;
  txsInMatchingPool: number;
  skippedDocs: number;
  skippedTxs: number;
};

export function partitionByLinkState(
  input: PipelineInput,
  opts?: { includeMeta?: boolean }
): Partitions | { partitions: Partitions; meta: PartitionMeta } {
  const docBuckets = new Map<string, Doc[]>();
  const txBuckets = new Map<string, Tx[]>();

  for (const doc of input.docs) {
    const tenantKey = normalizeTenantId(doc.tenant_id);
    const bucket = docBuckets.get(tenantKey) ?? [];
    bucket.push(doc);
    docBuckets.set(tenantKey, bucket);
  }

  for (const tx of input.txs) {
    const tenantKey = normalizeTenantId(tx.tenant_id);
    const bucket = txBuckets.get(tenantKey) ?? [];
    bucket.push(tx);
    txBuckets.set(tenantKey, bucket);
  }

  const partitions: Partitions = {
    doc_tx: { docs: [], txs: [] },
    doc_only: { docs: [] },
    tx_only: { txs: [] },
  };

  let docsInMatchingPool = 0;
  let txsInMatchingPool = 0;
  let skippedDocs = 0;
  let skippedTxs = 0;

  const allTenants = new Set([...docBuckets.keys(), ...txBuckets.keys()]);
  for (const tenantId of allTenants) {
    const docs = docBuckets.get(tenantId) ?? [];
    const txs = txBuckets.get(tenantId) ?? [];

    const docsMatchable = docs.filter((doc) => isMatchableLinkState(doc.link_state));
    const txsMatchable = txs.filter((tx) => isMatchableLinkState(tx.link_state));

    docsInMatchingPool += docsMatchable.length;
    txsInMatchingPool += txsMatchable.length;
    skippedDocs += docs.length - docsMatchable.length;
    skippedTxs += txs.length - txsMatchable.length;

    if (docsMatchable.length > 0 && txsMatchable.length > 0) {
      partitions.doc_tx.docs.push(...docsMatchable);
      partitions.doc_tx.txs.push(...txsMatchable);
    } else if (docsMatchable.length > 0) {
      partitions.doc_only.docs.push(...docsMatchable);
    } else if (txsMatchable.length > 0) {
      partitions.tx_only.txs.push(...txsMatchable);
    }
  }

  if (!opts?.includeMeta) {
    return partitions;
  }

  return {
    partitions,
    meta: {
      totalDocs: input.docs.length,
      totalTxs: input.txs.length,
      docsInMatchingPool,
      txsInMatchingPool,
      skippedDocs,
      skippedTxs,
    },
  };
}

// Matchable states: unlinked or suggested. linked/partial are handled elsewhere.
function isMatchableLinkState(state: LinkState): boolean {
  return state === "unlinked" || state === "suggested";
}

// Missing/empty tenant_id is treated as a separate tenant to avoid mixing.
function normalizeTenantId(value: string | null | undefined): string {
  if (!value) return "__unknown__";
  const trimmed = value.trim();
  return trimmed ? trimmed : "__unknown__";
}

/*
Example:
- Tenant A: 2 docs + 0 tx -> doc_only
- Tenant B: 1 doc + 3 tx -> doc_tx
- Tenant C: 0 doc + 2 tx -> tx_only
*/
