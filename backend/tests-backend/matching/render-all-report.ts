import fs from "node:fs";
import path from "node:path";
import type { MatchDecision, PipelineDebug } from "../../src/matching-engine";
import { renderCasesSection as renderDocCases } from "./mass_doc/write-artifacts";
import { renderCasesSection as renderTxCases } from "./mass_tx/write-artifacts";
import { evaluateMatchingCases } from "./mass_all/write-artifacts";
import type { DatasetCase, OfflineReportInput } from "./mass_all/types";

type AllReportInput = OfflineReportInput & {
  outputPath: string;
};

export function writeAllReport(input: AllReportInput): string {
  const html = buildAllReport(input);
  const dir = path.dirname(input.outputPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(input.outputPath, html, "utf8");
  return input.outputPath;
}

function buildAllReport(input: AllReportInput): string {
  const {
    tenantId,
    runId,
    createdAtISO,
    decisions,
    docLifecycle,
    txLifecycle,
    debug,
    cases,
  } = input;
  const decisionRows = decisions.map(renderDecisionRow).join("\n");
  const matchingSection = renderMatchingCasesSection(cases?.matching, decisions);
  const docSection = renderDocCases(cases?.doc, docLifecycle);
  const txSection = renderTxCases(cases?.tx, txLifecycle);
  const rawJson = escapeHtml(
    JSON.stringify({ decisions, docLifecycle, txLifecycle, debug, createdAtISO, cases }, null, 2)
  );

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
    th { font-weight: 600; color: var(--accent); }
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
  <h1>Matching Full Pipeline</h1>
  <h2>${escapeHtml(tenantId)} - ${escapeHtml(runId)}</h2>
  <div class="meta">
    <div><strong>created_at</strong> ${escapeHtml(createdAtISO)}</div>
    <div><strong>decisions</strong> ${decisions.length}</div>
    <div><strong>doc_lifecycle</strong> ${docLifecycle.length}</div>
    <div><strong>tx_lifecycle</strong> ${txLifecycle.length}</div>
    ${debug ? `<div><strong>debug</strong> ${escapeHtml(JSON.stringify(debug))}</div>` : ""}
  </div>

  ${matchingSection}
  ${docSection}
  ${txSection}

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
        ${decisionRows || `<tr><td colspan="6" class="muted">No decisions</td></tr>`}
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

function renderMatchingCasesSection(
  cases: DatasetCase[] | undefined,
  decisions: MatchDecision[]
): string {
  if (!cases || cases.length === 0) {
    return `<div class="panel"><div class="muted">No expected matching cases defined.</div></div>`;
  }

  const results = evaluateMatchingCases(cases, decisions);
  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.length - passed;
  const rows = results.map(renderMatchingCaseRow).join("\n");

  return `
  <div class="case-grid">
    <div class="panel">
      <div><strong>matching_cases</strong> ${results.length}</div>
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

function renderMatchingCaseRow(result: ReturnType<typeof evaluateMatchingCases>[number]): string {
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

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
