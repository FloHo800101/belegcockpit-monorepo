import type { CanonicalDoc, CanonicalTx, CaseDraft, IdGenerator } from "../models/types";

function extractMax(prefix: string, ids: string[], separator: string): number {
  let max = 0;
  for (const id of ids) {
    if (!id.startsWith(prefix + separator)) {
      continue;
    }
    const numeric = id.slice(prefix.length + separator.length);
    const value = Number.parseInt(numeric, 10);
    if (!Number.isNaN(value)) {
      max = Math.max(max, value);
    }
  }
  return max;
}

function pad(value: number): string {
  return String(value).padStart(3, "0");
}

export function createIdGenerator(
  docs: CanonicalDoc[],
  txs: CanonicalTx[],
  cases: CaseDraft[]
): IdGenerator {
  const docMax = extractMax("doc", docs.map((doc) => doc.id), "-");
  const txMax = extractMax("tx", txs.map((tx) => tx.id), "-");
  const sharedMax = Math.max(docMax, txMax);
  let docCounter = sharedMax;
  let txCounter = sharedMax;
  let caseCounter = extractMax("C", cases.map((item) => item.id), "");

  return {
    nextDocId() {
      docCounter += 1;
      return `doc-${pad(docCounter)}`;
    },
    nextTxId() {
      txCounter += 1;
      return `tx-${pad(txCounter)}`;
    },
    nextCaseId() {
      caseCounter += 1;
      return `C${pad(caseCounter)}`;
    }
  };
}
