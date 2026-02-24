import { amountCompatible, calcWindow, MatchingConfig } from "./config.ts";
import { groupIdFor } from "./matchers.ts";
import { Doc, DocLineItem, MatchDecision, Tx } from "./types.ts";
import { vendorCompatible } from "./vendor.ts";
import { docPartyNormForTx } from "./doc-party.ts";
import { txAmountForCurrency, txSupportsCurrency } from "./tx-amounts.ts";

const ITEM_FIRST_LINE_ITEM_MATCH = "ITEM_FIRST_LINE_ITEM_MATCH";
const ITEM_FIRST_BUNDLE_MATCH = "ITEM_FIRST_BUNDLE_MATCH";
const ITEM_FIRST_FINAL_COVERAGE = "ITEM_FIRST_FINAL_COVERAGE";

export type ItemFirstPhaseResult = {
  decisions: MatchDecision[];
  remainingDocs: Doc[];
  remainingTx: Tx[];
};

type OpenItem = {
  key: string;
  id?: string;
  lineIndex: number | null;
  description: string | null;
  openAmount: number;
  signedAmount: number;
};

type ItemAllocation = {
  tx: Tx;
  items: OpenItem[];
  viaBundle: boolean;
  matchedAmount: number;
};

export function runItemFirstPhase(
  docs: Doc[],
  txs: Tx[],
  cfg: MatchingConfig
): ItemFirstPhaseResult {
  const decisions: MatchDecision[] = [];
  const consumedTxIds = new Set<string>();
  const handledDocIds = new Set<string>();

  for (const doc of docs) {
    const openItems = toOpenItems(doc.items);
    if (openItems.length === 0) continue;

    const txCandidates = txs
      .filter((tx) => !consumedTxIds.has(tx.id))
      .filter((tx) => isTxCandidateForDoc(doc, tx, cfg))
      .map((tx) => {
        const amountForDocCurrency = txAmountForCurrency(tx, doc.currency);
        if (amountForDocCurrency == null) return null;
        return { ...tx, amount: amountForDocCurrency };
      })
      .filter((tx): tx is Tx => tx != null)
      .sort(compareTx);

    if (txCandidates.length === 0) continue;

    const allocations = allocateTxToItems(openItems, txCandidates, cfg);
    if (allocations.length === 0) continue;

    for (const allocation of allocations) {
      consumedTxIds.add(allocation.tx.id);
    }

    const decision = buildDecision(doc, allocations, cfg);
    decisions.push(decision);
    handledDocIds.add(doc.id);
  }

  return {
    decisions,
    remainingDocs: docs.filter((doc) => !handledDocIds.has(doc.id)),
    remainingTx: txs.filter((tx) => !consumedTxIds.has(tx.id)),
  };
}

function allocateTxToItems(openItems: OpenItem[], txs: Tx[], cfg: MatchingConfig): ItemAllocation[] {
  const takenItems = new Set<string>();
  const allocations: ItemAllocation[] = [];

  for (const tx of txs) {
    const remaining = openItems.filter((item) => !takenItems.has(item.key));
    if (remaining.length === 0) break;

    const direct = findBestDirectItem(tx.amount, remaining, cfg);
    if (direct) {
      takenItems.add(direct.key);
      allocations.push({
        tx,
        items: [direct],
        viaBundle: false,
        matchedAmount: roundCurrency(tx.amount),
      });
      continue;
    }

    const bundle = findBestBundle(tx.amount, remaining, cfg);
    if (!bundle) continue;

    for (const item of bundle.items) takenItems.add(item.key);
    allocations.push({
      tx,
      items: bundle.items,
      viaBundle: true,
      matchedAmount: roundCurrency(tx.amount),
    });
  }

  return allocations;
}

function findBestDirectItem(targetAmount: number, items: OpenItem[], cfg: MatchingConfig): OpenItem | null {
  const normalizedTarget = roundCurrency(Math.abs(targetAmount));
  let best: { item: OpenItem; diff: number } | null = null;

  for (const item of items) {
    if (!amountCompatible(item.openAmount, normalizedTarget, cfg)) continue;
    const diff = Math.abs(item.openAmount - normalizedTarget);
    if (!best || diff < best.diff) {
      best = { item, diff };
    }
  }

  return best?.item ?? null;
}

function findBestBundle(
  targetAmount: number,
  items: OpenItem[],
  cfg: MatchingConfig
): { items: OpenItem[]; diff: number } | null {
  const normalizedTarget = roundCurrency(Math.abs(targetAmount));
  const source = items.slice(0, 20);
  let best: { items: OpenItem[]; diff: number } | null = null;

  for (let i = 0; i < source.length; i += 1) {
    for (let j = i + 1; j < source.length; j += 1) {
      const pair = [source[i], source[j]];
      if (!pair.some((item) => item.signedAmount < 0)) continue;
      const sumAbs = roundCurrency(Math.abs(pair[0].signedAmount + pair[1].signedAmount));
      if (!amountCompatible(sumAbs, normalizedTarget, cfg)) continue;
      const diff = Math.abs(sumAbs - normalizedTarget);
      if (!best || diff < best.diff) {
        best = { items: pair, diff };
      }
    }
  }

  for (let i = 0; i < source.length; i += 1) {
    for (let j = i + 1; j < source.length; j += 1) {
      for (let k = j + 1; k < source.length; k += 1) {
        const triple = [source[i], source[j], source[k]];
        if (!triple.some((item) => item.signedAmount < 0)) continue;
        const sumAbs = roundCurrency(
          Math.abs(triple[0].signedAmount + triple[1].signedAmount + triple[2].signedAmount)
        );
        if (!amountCompatible(sumAbs, normalizedTarget, cfg)) continue;
        const diff = Math.abs(sumAbs - normalizedTarget);
        if (!best || diff < best.diff) {
          best = { items: triple, diff };
        }
      }
    }
  }

  return best;
}

function buildDecision(doc: Doc, allocations: ItemAllocation[], cfg: MatchingConfig): MatchDecision {
  const txIds = allocations.map((item) => item.tx.id);
  const matchedSum = roundCurrency(allocations.reduce((acc, item) => acc + item.matchedAmount, 0));
  const targetAmount = resolveTargetAmount(doc);
  const isCovered = isCoveredAmount(matchedSum, targetAmount, cfg);
  const openAfter = isCovered
    ? 0
    : roundCurrency(Math.max(0, targetAmount - matchedSum));

  const matchedItemRefs = uniqueItemRefs(allocations.flatMap((item) => item.items));
  const matchedItemIds = matchedItemRefs.map((item) => item.id ?? `line:${item.line_index}`);
  const matchedViaBundle = allocations.some((item) => item.viaBundle);

  const reasonCodes = [
    matchedViaBundle ? ITEM_FIRST_BUNDLE_MATCH : ITEM_FIRST_LINE_ITEM_MATCH,
    ...(isCovered ? [ITEM_FIRST_FINAL_COVERAGE] : ["PARTIAL_PAYMENT_SUM"]),
  ];

  return {
    state: isCovered ? "final" : "partial",
    relation_type: "one_to_many",
    tx_ids: txIds,
    doc_ids: [doc.id],
    confidence: isCovered ? 0.97 : 0.9,
    reason_codes: reasonCodes,
    inputs: {
      tenant_id: doc.tenant_id,
      target_amount: targetAmount,
      matched_item_sum: matchedSum,
      matched_item_ids: matchedItemIds,
      matched_item_refs: matchedItemRefs,
      matched_via_bundle: matchedViaBundle,
      matched_item_links: allocations.map((allocation) => ({
        tx_id: allocation.tx.id,
        item_ids: allocation.items.map((item) => item.id ?? `line:${item.lineIndex ?? -1}`),
        via_bundle: allocation.viaBundle,
      })),
      open_amount_before: targetAmount,
      open_amount_after: openAfter,
    },
    matched_by: "system",
    match_group_id: groupIdFor({ tx_ids: txIds, doc_ids: [doc.id] }),
    open_amount_after: openAfter,
  };
}

function uniqueItemRefs(items: OpenItem[]): Array<{ id?: string; line_index: number | null }> {
  const out: Array<{ id?: string; line_index: number | null }> = [];
  const seen = new Set<string>();

  for (const item of items) {
    const key = item.id ? `id:${item.id}` : `line:${item.lineIndex ?? -1}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: item.id, line_index: item.lineIndex });
  }

  return out;
}

function resolveTargetAmount(doc: Doc): number {
  const open = toPositiveNumber(doc.open_amount);
  if (open != null) return open;
  return roundCurrency(Math.abs(doc.amount));
}

function isCoveredAmount(matched: number, target: number, cfg: MatchingConfig): boolean {
  if (amountCompatible(matched, target, cfg)) return true;
  const tolerance = Math.max(
    cfg.amountToleranceAbs,
    cfg.amountTolerancePct * Math.max(Math.abs(matched), Math.abs(target))
  );
  return matched + tolerance >= target;
}

function toOpenItems(items?: DocLineItem[] | null): OpenItem[] {
  if (!items || items.length === 0) return [];

  const out: OpenItem[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const raw = items[index];
    const amountAbs = toPositiveNumber(raw.open_amount) ?? toPositiveNumber(raw.amount_abs);
    if (amountAbs == null) continue;

    const signed = toFiniteNumber(raw.amount_signed);
    const signedAmount = Number.isFinite(signed)
      ? roundCurrency(signed)
      : roundCurrency(amountAbs);

    const lineIndex = typeof raw.line_index === "number" ? raw.line_index : index;

    out.push({
      key: raw.id ? `id:${raw.id}` : `line:${lineIndex}`,
      id: raw.id,
      lineIndex,
      description: raw.description ?? null,
      openAmount: roundCurrency(amountAbs),
      signedAmount,
    });
  }

  return out;
}

function isTxCandidateForDoc(doc: Doc, tx: Tx, cfg: MatchingConfig): boolean {
  if (doc.tenant_id !== tx.tenant_id) return false;
  if (!txSupportsCurrency(tx, doc.currency)) return false;
  if (!isDirectionCompatible(doc, tx)) return false;

  const window = calcWindow(doc, cfg);
  if (!inWindow(tx.booking_date, window)) return false;

  const docParty = docPartyNormForTx(doc, tx);
  if (docParty && tx.vendor_norm && !vendorCompatible(docParty, tx.vendor_norm)) {
    return false;
  }

  return true;
}

function compareTx(a: Tx, b: Tx): number {
  const dateA = Date.parse(a.booking_date);
  const dateB = Date.parse(b.booking_date);
  if (Number.isFinite(dateA) && Number.isFinite(dateB) && dateA !== dateB) {
    return dateA - dateB;
  }
  if (a.amount !== b.amount) return a.amount - b.amount;
  return a.id.localeCompare(b.id);
}

function inWindow(iso: string, window: { from: string; to: string }): boolean {
  const date = Date.parse(iso);
  return Number.isFinite(date) && date >= Date.parse(window.from) && date <= Date.parse(window.to);
}

function isDirectionCompatible(doc: Doc, tx: Tx): boolean {
  if (doc.amount >= 0 && tx.direction !== "out") return false;
  if (doc.amount < 0 && tx.direction !== "in") return false;
  return true;
}

function toPositiveNumber(value: unknown): number | null {
  const numeric = toFiniteNumber(value);
  if (!Number.isFinite(numeric)) return null;
  const rounded = roundCurrency(Math.abs(numeric));
  return rounded > 0 ? rounded : null;
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN;
  if (typeof value === "string") {
    const normalized = Number(value.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(normalized) ? normalized : Number.NaN;
  }
  return Number.NaN;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}
