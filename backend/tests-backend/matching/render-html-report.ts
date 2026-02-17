import fs from "node:fs";
import path from "node:path";
import type { MatchDecision, PipelineDebug } from "../../src/matching-engine";
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
  txs?: Array<{ id: string }>;
};

export function writeHtmlReport(input: HtmlReportInput): string {
  const html = buildHtmlReport(input);
  const dir = path.dirname(input.outputPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(input.outputPath, html, "utf8");
  return input.outputPath;
}

function buildHtmlReport(input: HtmlReportInput): string {
  const { tenantId, runId, decisions, debug, params, createdAtISO, cases, txs } = input;
  const rows = decisions.map(renderDecisionRow).join("\n");
  const caseSection = renderCasesSection(cases, decisions);
  const unmatchedSection = renderUnmatchedTxSection(txs, decisions);
  const rawJson = escapeHtml(
    JSON.stringify({ decisions, debug, params, createdAtISO, cases }, null, 2)
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
          <th>Confidence</th>
          <th>Solutions</th>
          <th>Reason Codes</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="5" class="muted">No decisions</td></tr>`}
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

function renderDecisionRow(decision: MatchDecision): string {
  const typeState = `${decision.relation_type} / ${decision.state}`;
  const docs = decision.doc_ids.join(", ");
  const txs = decision.tx_ids.join(", ");
  const confidence = Number.isFinite(decision.confidence)
    ? decision.confidence.toFixed(3)
    : "";
  const reasons = decision.reason_codes.join(", ");
  const solutions = formatSolutions(decision.inputs?.solutions);

  return `
<tr>
  <td>${escapeHtml(typeState)}</td>
  <td>${escapeHtml(txs)}</td>
  <td>${escapeHtml(docs)}</td>
  <td>${escapeHtml(confidence)}</td>
  <td>${escapeHtml(solutions)}</td>
  <td>${escapeHtml(reasons)}</td>
</tr>`;
}

function formatSolutions(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return "";
  return JSON.stringify(value);
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

function normalizeIds(ids: string[]): string {
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
