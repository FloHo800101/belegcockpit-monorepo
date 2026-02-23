import fs from "node:fs";
import path from "node:path";
import type { Doc, MatchDecision, PipelineDebug, Tx } from "../../src/matching-engine";
import type { DocLineItem } from "../../src/matching-engine/types";
import type { DatasetCase } from "./mass_tx2doc/types";

type HtmlReportInput = {
  tenantId: string;
  runId: string;
  decisions: MatchDecision[];
  debug?: PipelineDebug;
  params: Record<string, unknown>;
  createdAtISO: string;
  outputPath: string;
  cases?: DatasetCase[];
  docs?: Doc[];
  txs?: Tx[];
};

export function writeHtmlReport(input: HtmlReportInput): string {
  const html = buildHtmlReport(input);
  const dir = path.dirname(input.outputPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(input.outputPath, html, "utf8");
  return input.outputPath;
}

function buildHtmlReport(input: HtmlReportInput): string {
  const { tenantId, runId, decisions, debug, params, createdAtISO, cases, txs, docs } = input;
  const docAmountById = buildAmountIndex(docs);
  const txAmountById = buildAmountIndex(txs);
  const docItemByDocId = buildDocItemIndex(docs);
  const rows = decisions
    .map((decision) => renderDecisionRow(decision, docAmountById, txAmountById, docItemByDocId))
    .join("\n");
  const caseSection = renderCasesSection(cases, decisions);
  const unmatchedSection = renderUnmatchedTxSection(txs, decisions);
  const rawJson = escapeHtml(
    JSON.stringify({ decisions, debug, params, createdAtISO, cases, docs, txs }, null, 2)
  );
  const simulateLinked = params?.simulateLinked === true;
  const initialFinalCount =
    typeof params?.initialFinalCount === "number" ? params.initialFinalCount : null;
  const remainingDecisionCount =
    typeof params?.remainingDecisionCount === "number" ? params.remainingDecisionCount : null;
  const combinedNote = simulateLinked
    ? `<div><strong>combined</strong> run1 finals + run2 remaining</div>`
    : "";
  const combinedCounts =
    simulateLinked && (initialFinalCount !== null || remainingDecisionCount !== null)
      ? `<div><strong>combined_counts</strong> finals=${initialFinalCount ?? "?"} remaining=${remainingDecisionCount ?? "?"}</div>`
      : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Matching Report ${escapeHtml(tenantId)} ${escapeHtml(runId)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f4ef;
      --panel: #ffffff;
      --ink: #1c1c1c;
      --muted: #6b6b6b;
      --accent: #0f6b5b;
      --border: #e1ddd4;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Source Serif 4", "Georgia", serif;
      background: radial-gradient(circle at top left, #fefaf0, var(--bg));
      color: var(--ink);
      padding: 32px;
    }
    h1, h2 { margin: 0 0 12px 0; }
    h1 { font-size: 28px; }
    h2 { font-size: 18px; color: var(--muted); font-weight: 500; }
    .meta {
      display: grid;
      gap: 6px;
      margin-bottom: 24px;
      font-size: 14px;
    }
    .panel {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 10px 30px rgba(15, 20, 16, 0.05);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th, td {
      text-align: left;
      padding: 10px 8px;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }
    th {
      font-weight: 600;
      color: var(--accent);
    }
    tr:last-child td { border-bottom: none; }
    .muted { color: var(--muted); }
    .status {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .status.ok { background: #d7efe3; color: #0f6b5b; }
    .status.fail { background: #f7d7d7; color: #8a1c1c; }
    .case-grid { display: grid; gap: 12px; margin-bottom: 24px; }
    .case-ok { background: #f4fbf7; }
    .case-fail { background: #fff5f5; }
    .match-detail td {
      background: #fbf8f2;
      color: #4a4a4a;
      font-size: 13px;
    }
    details { margin-top: 16px; }
    pre {
      white-space: pre-wrap;
      word-break: break-word;
      background: #0e1110;
      color: #f3f3f3;
      padding: 12px;
      border-radius: 10px;
      font-size: 12px;
      line-height: 1.4;
    }
  </style>
</head>
<body>
  <h1>Matching Live Replay</h1>
  <h2>${escapeHtml(tenantId)} - ${escapeHtml(runId)}</h2>
  <div class="meta">
    <div><strong>created_at</strong> ${escapeHtml(createdAtISO)}</div>
    <div><strong>decisions</strong> ${decisions.length}</div>
    ${combinedNote}
    ${combinedCounts}
    ${debug ? `<div><strong>debug</strong> ${escapeHtml(JSON.stringify(debug))}</div>` : ""}
  </div>

  ${caseSection}
  ${unmatchedSection}

  <div class="panel">
    <table>
      <thead>
        <tr>
          <th>Type / State</th>
          <th>Tx IDs</th>
          <th>Doc IDs</th>
          <th>Tx Amount Sum</th>
          <th>Doc Amount Sum</th>
          <th>Matched Item Sum / Delta</th>
          <th>Breakdown</th>
          <th>Confidence</th>
          <th>Solutions</th>
          <th>Reason Codes</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="10" class="muted">No decisions</td></tr>`}
      </tbody>
    </table>
    <details>
      <summary>Raw JSON</summary>
      <pre>${rawJson}</pre>
    </details>
  </div>
</body>
</html>`;
}

function renderDecisionRow(
  decision: MatchDecision,
  docAmountById: Map<string, AmountWithCurrency>,
  txAmountById: Map<string, AmountWithCurrency>,
  docItemByDocId: Map<string, Map<string, ItemDescriptor>>
): string {
  const typeState = `${decision.relation_type} / ${decision.state}`;
  const docs = decision.doc_ids.join(", ");
  const txs = decision.tx_ids.join(", ");
  const txAmountSum = formatAmountSum(decision.tx_ids, txAmountById);
  const docAmountSum = formatAmountSum(decision.doc_ids, docAmountById);
  const matchedItemSum = formatNumeric(decision.inputs?.matched_item_sum);
  const breakdownRows = buildDecisionBreakdownRows(
    decision,
    docAmountById,
    txAmountById,
    docItemByDocId
  );
  const breakdownSummary = breakdownRows.length ? `${breakdownRows.length} Zuordnung(en)` : "-";
  const confidence = Number.isFinite(decision.confidence)
    ? decision.confidence.toFixed(3)
    : "";
  const reasons = decision.reason_codes.join(", ");
  const solutions = formatSolutions(decision.inputs?.solutions);
  const detailRows = breakdownRows.map((row) => renderDecisionBreakdownRow(row)).join("\n");

  return `
<tr class="match-main">
  <td>${escapeHtml(typeState)}</td>
  <td>${escapeHtml(txs)}</td>
  <td>${escapeHtml(docs)}</td>
  <td>${escapeHtml(txAmountSum)}</td>
  <td>${escapeHtml(docAmountSum)}</td>
  <td>${escapeHtml(matchedItemSum)}</td>
  <td>${escapeHtml(breakdownSummary)}</td>
  <td>${escapeHtml(confidence)}</td>
  <td>${escapeHtml(solutions)}</td>
  <td>${escapeHtml(reasons)}</td>
</tr>
${detailRows}`;
}

function formatSolutions(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return "";
  return JSON.stringify(value);
}

function formatMatchedItems(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return "-";
  return value
    .map((entry) => (typeof entry === "string" ? entry : ""))
    .filter(Boolean)
    .join(", ") || "-";
}

type ItemDescriptor = {
  description: string | null;
  amountSigned: number | null;
};

type DecisionBreakdownRow = {
  txId: string;
  docId: string;
  txAmount: number | null;
  txCurrency: string | null;
  docAmount: number | null;
  docCurrency: string | null;
  delta: number | null;
  itemsLabel: string;
};

function buildDecisionBreakdownRows(
  decision: MatchDecision,
  docAmountById: Map<string, AmountWithCurrency>,
  txAmountById: Map<string, AmountWithCurrency>,
  docItemByDocId: Map<string, Map<string, ItemDescriptor>>
): DecisionBreakdownRow[] {
  const docId = decision.doc_ids[0] ?? "";
  const itemByRef = docItemByDocId.get(docId);
  const rows: DecisionBreakdownRow[] = [];

  const rawLinks = decision.inputs?.matched_item_links;
  if (Array.isArray(rawLinks) && rawLinks.length > 0) {
    for (const rawLink of rawLinks) {
      if (!rawLink || typeof rawLink !== "object") continue;
      const entry = rawLink as {
        tx_id?: unknown;
        item_ids?: unknown;
      };
      const txId = typeof entry.tx_id === "string" ? entry.tx_id : "";
      if (!txId) continue;

      const itemIds = Array.isArray(entry.item_ids)
        ? entry.item_ids.filter((itemId): itemId is string => typeof itemId === "string")
        : [];
      const txAmountRow = txAmountById.get(txId);
      const txAmount = txAmountRow?.amount ?? null;
      const txCurrency = txAmountRow?.currency ?? null;

      const docAmountParts = itemIds
        .map((itemId) => itemByRef?.get(itemId)?.amountSigned)
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      const docAmount = docAmountParts.length
        ? roundCurrency(docAmountParts.reduce((sum, value) => sum + value, 0))
        : null;
      const docCurrency = docAmountById.get(docId)?.currency ?? txCurrency;
      const delta =
        txAmount == null || docAmount == null
          ? null
          : roundCurrency(Math.abs(txAmount - docAmount));

      rows.push({
        txId,
        docId,
        txAmount,
        txCurrency,
        docAmount,
        docCurrency,
        delta,
        itemsLabel: itemIds.length ? itemIds.map((itemId) => formatItemRef(itemId, itemByRef)).join(", ") : "-",
      });
    }
  }

  if (rows.length > 0) return rows;

  const txTotal = summarizeAmount(decision.tx_ids, txAmountById);
  const docTotalFromItems =
    typeof decision.inputs?.matched_item_sum === "number" && Number.isFinite(decision.inputs.matched_item_sum)
      ? roundCurrency(decision.inputs.matched_item_sum)
      : null;
  const docTotalAmount = docTotalFromItems ?? summarizeAmount(decision.doc_ids, docAmountById).amount;
  const docCurrency =
    docAmountById.get(docId)?.currency ??
    summarizeAmount(decision.doc_ids, docAmountById).currency ??
    txTotal.currency;
  const delta =
    txTotal.amount == null || docTotalAmount == null
      ? null
      : roundCurrency(Math.abs(txTotal.amount - docTotalAmount));

  return [
    {
      txId: decision.tx_ids.join(", "),
      docId: decision.doc_ids.join(", "),
      txAmount: txTotal.amount,
      txCurrency: txTotal.currency,
      docAmount: docTotalAmount,
      docCurrency,
      delta,
      itemsLabel: formatMatchedItems(decision.inputs?.matched_item_ids),
    },
  ];
}

function renderDecisionBreakdownRow(row: DecisionBreakdownRow): string {
  return `
<tr class="match-detail">
  <td>-> Detail</td>
  <td>${escapeHtml(row.txId)}</td>
  <td>${escapeHtml(row.docId)}</td>
  <td>${escapeHtml(formatAmount(row.txAmount, row.txCurrency))}</td>
  <td>${escapeHtml(formatAmount(row.docAmount, row.docCurrency))}</td>
  <td>${escapeHtml(formatNumeric(row.delta))}</td>
  <td>${escapeHtml(row.itemsLabel)}</td>
  <td></td>
  <td></td>
  <td></td>
</tr>`;
}

function summarizeAmount(
  ids: readonly string[],
  amountById: Map<string, AmountWithCurrency>
): { amount: number | null; currency: string | null } {
  let total = 0;
  let found = 0;
  const currencies = new Set<string>();

  for (const id of ids) {
    const row = amountById.get(id);
    if (!row) continue;
    total += row.amount;
    found += 1;
    if (row.currency) currencies.add(row.currency);
  }

  if (found === 0) return { amount: null, currency: null };
  return {
    amount: roundCurrency(total),
    currency: currencies.size === 1 ? [...currencies][0] : null,
  };
}

function formatAmount(amount: number | null, currency: string | null): string {
  if (amount == null || !Number.isFinite(amount)) return "-";
  const amountText = roundCurrency(amount).toFixed(2);
  if (!currency) return amountText;
  return `${amountText} ${currency}`;
}

function formatItemRef(itemRef: string, itemByRef?: Map<string, ItemDescriptor>): string {
  if (!itemByRef) return itemRef;
  const item = itemByRef.get(itemRef);
  if (!item) return itemRef;

  const description = item.description ? ` (${item.description})` : "";
  const amount = item.amountSigned == null ? "" : ` ${item.amountSigned.toFixed(2)}`;
  return `${itemRef}${description}${amount}`;
}

function formatNumeric(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return value.toFixed(2);
}

type AmountWithCurrency = {
  amount: number;
  currency: string | null;
};

function buildDocItemIndex(docs: Doc[] | undefined): Map<string, Map<string, ItemDescriptor>> {
  const map = new Map<string, Map<string, ItemDescriptor>>();
  if (!docs) return map;

  for (const doc of docs) {
    const items = Array.isArray(doc.items) ? doc.items : [];
    if (items.length === 0) continue;

    const itemByRef = new Map<string, ItemDescriptor>();
    for (let fallbackIndex = 0; fallbackIndex < items.length; fallbackIndex += 1) {
      const item = items[fallbackIndex];
      const refs = collectItemRefs(item, fallbackIndex);
      if (refs.length === 0) continue;

      const descriptor: ItemDescriptor = {
        description: normalizeText(item.description),
        amountSigned: toSignedAmount(item),
      };

      for (const ref of refs) {
        itemByRef.set(ref, descriptor);
      }
    }

    if (itemByRef.size > 0) {
      map.set(doc.id, itemByRef);
    }
  }

  return map;
}

function collectItemRefs(item: DocLineItem, fallbackIndex: number): string[] {
  const refs = new Set<string>();
  if (typeof item.id === "string" && item.id.length > 0) {
    refs.add(item.id);
  }

  const lineIndex =
    typeof item.line_index === "number" && Number.isFinite(item.line_index)
      ? item.line_index
      : fallbackIndex;
  refs.add(`line:${lineIndex}`);
  return [...refs];
}

function toSignedAmount(item: DocLineItem): number | null {
  if (typeof item.amount_signed === "number" && Number.isFinite(item.amount_signed)) {
    return roundCurrency(item.amount_signed);
  }
  if (typeof item.amount_abs === "number" && Number.isFinite(item.amount_abs)) {
    return roundCurrency(item.amount_abs);
  }
  if (typeof item.open_amount === "number" && Number.isFinite(item.open_amount)) {
    return roundCurrency(item.open_amount);
  }
  return null;
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildAmountIndex(
  records:
    | Array<{ id: string; amount?: number | null; currency?: string | null }>
    | undefined
): Map<string, AmountWithCurrency> {
  const map = new Map<string, AmountWithCurrency>();
  if (!records) return map;
  for (const record of records) {
    const amount = typeof record.amount === "number" ? record.amount : Number.NaN;
    if (!Number.isFinite(amount)) continue;
    map.set(record.id, { amount, currency: record.currency ?? null });
  }
  return map;
}

function formatAmountSum(
  ids: readonly string[],
  amountById: Map<string, AmountWithCurrency>
): string {
  let total = 0;
  let found = 0;
  const currencies = new Set<string>();

  for (const id of ids) {
    const row = amountById.get(id);
    if (!row) continue;
    total += row.amount;
    found += 1;
    if (row.currency) currencies.add(row.currency);
  }

  if (found === 0) return "-";

  const amountText = total.toFixed(2);
  if (currencies.size === 1) return `${amountText} ${[...currencies][0]}`;
  if (currencies.size > 1) return `${amountText} (MULTI)`;
  return amountText;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function renderUnmatchedTxSection(
  txs: Array<{ id: string }> | undefined,
  decisions: MatchDecision[]
): string {
  if (!txs || txs.length === 0) return "";
  const matched = new Set<string>();
  for (const decision of decisions) {
    for (const txId of decision.tx_ids) matched.add(txId);
  }
  const unmatched = txs.filter((tx) => !matched.has(tx.id));
  if (unmatched.length === 0) {
    return `<div class="panel"><div><strong>unmatched_txs</strong> 0</div></div>`;
  }
  const rows = unmatched
    .map((tx) => `<tr><td>${escapeHtml(tx.id)}</td></tr>`)
    .join("\n");
  return `
  <div class="panel">
    <div><strong>unmatched_txs</strong> ${unmatched.length}</div>
    <table>
      <thead>
        <tr>
          <th>Tx ID</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </div>`;
}

type CaseEvaluation = {
  status: "pass" | "fail";
  expectedLabel: string;
  actualLabel: string;
  actualReasons: string;
  caseId: string;
  description: string;
  docIds: string;
  txIds: string;
  note?: string;
};

function renderCasesSection(cases: DatasetCase[] | undefined, decisions: MatchDecision[]): string {
  if (!cases || cases.length === 0) {
    return `<div class="panel"><div class="muted">No expected cases defined.</div></div>`;
  }

  const results = cases.map((item) => evaluateCase(item, decisions));
  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.length - passed;
  const rows = results.map(renderCaseRow).join("\n");

  return `
  <div class="case-grid">
    <div class="panel">
      <div><strong>cases</strong> ${results.length}</div>
      <div><strong>passed</strong> ${passed}</div>
      <div><strong>failed</strong> ${failed}</div>
    </div>
    <div class="panel">
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Case</th>
            <th>Expected</th>
            <th>Actual</th>
            <th>Tx IDs</th>
            <th>Doc IDs</th>
            <th>Reasons</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="7" class="muted">No cases</td></tr>`}
        </tbody>
      </table>
    </div>
  </div>`;
}

function renderCaseRow(result: CaseEvaluation): string {
  const statusClass = result.status === "pass" ? "ok" : "fail";
  const rowClass = result.status === "pass" ? "case-ok" : "case-fail";
  const statusLabel = result.status === "pass" ? "ok" : "fail";
  const note = result.note ? ` (${result.note})` : "";
  const description = result.description ? ` - ${result.description}` : "";

  return `
<tr class="${rowClass}">
  <td><span class="status ${statusClass}">${statusLabel}</span></td>
  <td>${escapeHtml(result.caseId)}${escapeHtml(description)}</td>
  <td>${escapeHtml(result.expectedLabel)}</td>
  <td>${escapeHtml(result.actualLabel)}${escapeHtml(note)}</td>
  <td>${escapeHtml(result.txIds)}</td>
  <td>${escapeHtml(result.docIds)}</td>
  <td>${escapeHtml(result.actualReasons)}</td>
</tr>`;
}

function evaluateCase(testCase: DatasetCase, decisions: MatchDecision[]): CaseEvaluation {
  const docKey = normalizeIds(testCase.doc_ids);
  const txKey = normalizeIds(testCase.tx_ids);
  const matching = decisions.filter(
    (d) => normalizeIds(d.doc_ids) === docKey && normalizeIds(d.tx_ids) === txKey
  );

  const expectedStateRaw = testCase.expected_state;
  const expectedRelation = testCase.expected_relation_type;
  const expectedLabel = `${expectedStateRaw} / ${expectedRelation}`;

  if (expectedStateRaw === "NO_MATCH") {
    const pass = matching.length === 0;
    return {
      status: pass ? "pass" : "fail",
      expectedLabel,
      actualLabel: pass ? "none" : summarizeDecision(matching[0]),
      actualReasons: matching[0]?.reason_codes.join(", ") ?? "",
      caseId: testCase.id,
      description: testCase.description ?? "",
      docIds: testCase.doc_ids.join(", "),
      txIds: testCase.tx_ids.join(", "),
      note: pass ? undefined : `found ${matching.length} decision(s)`,
    };
  }

  const expectedState = mapExpectedState(expectedStateRaw);
  if (!expectedState) {
    return {
      status: "fail",
      expectedLabel,
      actualLabel: matching[0] ? summarizeDecision(matching[0]) : "none",
      actualReasons: matching[0]?.reason_codes.join(", ") ?? "",
      caseId: testCase.id,
      description: testCase.description ?? "",
      docIds: testCase.doc_ids.join(", "),
      txIds: testCase.tx_ids.join(", "),
      note: "unknown expected_state",
    };
  }

  const candidatesByRelation =
    expectedRelation === "none"
      ? matching
      : matching.filter((d) => d.relation_type === expectedRelation);
  const candidatesByState = candidatesByRelation.filter((d) => d.state === expectedState);
  const best = candidatesByState[0] ?? candidatesByRelation[0] ?? matching[0];
  const actualLabel = best ? summarizeDecision(best) : "none";
  const actualReasons = best?.reason_codes.join(", ") ?? "";
  const hasReasons = ensureReasons(best, testCase.must_reason_codes);
  const pass =
    !!best &&
    best.state === expectedState &&
    (expectedRelation === "none" || best.relation_type === expectedRelation) &&
    hasReasons;

  return {
    status: pass ? "pass" : "fail",
    expectedLabel,
    actualLabel,
    actualReasons,
    caseId: testCase.id,
    description: testCase.description ?? "",
    docIds: testCase.doc_ids.join(", "),
    txIds: testCase.tx_ids.join(", "),
    note: pass ? undefined : buildFailureNote(best, expectedState, expectedRelation, hasReasons),
  };
}

function mapExpectedState(expected: string): MatchDecision["state"] | null {
  switch (expected) {
    case "FINAL_MATCH":
      return "final";
    case "SUGGESTED_MATCH":
      return "suggested";
    case "AMBIGUOUS":
      return "ambiguous";
    case "PARTIAL_MATCH":
      return "partial";
    default:
      return null;
  }
}

function summarizeDecision(decision: MatchDecision): string {
  return `${decision.relation_type} / ${decision.state}`;
}

function normalizeIds(ids: readonly string[]): string {
  return [...ids].sort().join("|");
}

function ensureReasons(
  decision: MatchDecision | undefined,
  expected: string[] | undefined
): boolean {
  if (!expected || expected.length === 0) return true;
  if (!decision) return false;
  const set = new Set(decision.reason_codes);
  return expected.every((code) => set.has(code));
}

function buildFailureNote(
  decision: MatchDecision | undefined,
  expectedState: MatchDecision["state"],
  expectedRelation: DatasetCase["expected_relation_type"],
  hasReasons: boolean
): string {
  if (!decision) return "no decision found";
  if (decision.state !== expectedState) return "state mismatch";
  if (expectedRelation !== "none" && decision.relation_type !== expectedRelation) {
    return "relation mismatch";
  }
  if (!hasReasons) return "reason_codes missing";
  return "mismatch";
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
