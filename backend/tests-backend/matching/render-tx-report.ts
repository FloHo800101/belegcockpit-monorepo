import fs from "node:fs";
import path from "node:path";
import type { PipelineDebug, TxLifecycleResult } from "../../src/matching-engine";
import type { TxLifecycleCase } from "./mass_tx/types";
import { renderCasesSection } from "./mass_tx/write-artifacts";

type TxReportInput = {
  tenantId: string;
  runId: string;
  createdAtISO: string;
  txLifecycle: TxLifecycleResult[];
  debug?: PipelineDebug;
  params?: Record<string, unknown>;
  cases?: TxLifecycleCase[];
  outputPath: string;
};

export function writeTxReport(input: TxReportInput): string {
  const html = buildTxReport(input);
  const dir = path.dirname(input.outputPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(input.outputPath, html, "utf8");
  return input.outputPath;
}

function buildTxReport(input: TxReportInput): string {
  const { tenantId, runId, createdAtISO, txLifecycle, debug, cases } = input;
  const rows = txLifecycle.map(renderLifecycleRow).join("\n");
  const caseSection = renderCasesSection(cases, txLifecycle);
  const rawJson = escapeHtml(
    JSON.stringify({ txLifecycle, debug, createdAtISO, cases }, null, 2)
  );

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Tx Lifecycle Report ${escapeHtml(tenantId)} ${escapeHtml(runId)}</title>
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
  <h1>Tx Lifecycle Live Replay</h1>
  <h2>${escapeHtml(tenantId)} - ${escapeHtml(runId)}</h2>
  <div class="meta">
    <div><strong>created_at</strong> ${escapeHtml(createdAtISO)}</div>
    <div><strong>tx_lifecycle</strong> ${txLifecycle.length}</div>
    ${debug ? `<div><strong>debug</strong> ${escapeHtml(JSON.stringify(debug))}</div>` : ""}
  </div>

  ${caseSection}

  <div class="panel">
    <table>
      <thead>
        <tr>
          <th>Tx ID</th>
          <th>Kind</th>
          <th>Severity</th>
          <th>Next Action</th>
          <th>Rematch Anchor</th>
          <th>Explanation Codes</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="6" class="muted">No lifecycle results</td></tr>`}
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

function renderLifecycleRow(item: TxLifecycleResult): string {
  return `
<tr>
  <td>${escapeHtml(item.txId)}</td>
  <td>${escapeHtml(item.kind)}</td>
  <td>${escapeHtml(item.severity)}</td>
  <td>${escapeHtml(item.nextAction)}</td>
  <td>${escapeHtml(item.rematchHint?.anchorDate ?? "")}</td>
  <td>${escapeHtml(item.explanationCodes.join(", "))}</td>
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
