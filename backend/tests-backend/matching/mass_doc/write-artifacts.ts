import fs from "node:fs";
import path from "node:path";
import type { DocLifecycleResult } from "../../../src/matching-engine";
import { writeDocReport } from "../render-doc-report";
import type {
  DocLifecycleCase,
  DocLifecycleDataset,
  OfflineReportInput,
  OfflineRunArtifacts,
  OfflineSummary,
} from "./types";

const KIND_KEYS: DocLifecycleResult["kind"][] = [
  "doc_duplicate",
  "doc_error",
  "awaiting_tx",
  "overdue",
  "eigenbeleg",
  "private",
  "split_required",
];

const SEVERITY_KEYS: DocLifecycleResult["severity"][] = ["info", "warning", "action"];

export function writeActualJson(outDir: string, actual: OfflineRunArtifacts): string {
  ensureDir(outDir);
  const outputPath = path.join(outDir, "actual.json");
  fs.writeFileSync(outputPath, JSON.stringify(actual, null, 2), "utf8");
  return outputPath;
}

export function writeSummaryJson(outDir: string, summary: OfflineSummary): string {
  ensureDir(outDir);
  const outputPath = path.join(outDir, "summary.json");
  fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2), "utf8");
  return outputPath;
}

export function writeHtmlReport(outDir: string, input: OfflineReportInput): string {
  const outputPath = path.join(outDir, "report.html");
  return writeDocReport({ ...input, outputPath });
}

export function buildSummary(params: {
  dataset: DocLifecycleDataset;
  docLifecycle: DocLifecycleResult[];
}): OfflineSummary {
  const { dataset, docLifecycle } = params;
  const kindCounts = buildKindCounts();
  const severityCounts = buildSeverityCounts();

  for (const item of docLifecycle) {
    kindCounts[item.kind] += 1;
    severityCounts[item.severity] += 1;
  }

  return {
    meta: dataset.meta,
    totals: {
      docs: dataset.docs.length,
    },
    kindCounts,
    severityCounts,
  };
}

export type CaseEvaluation = {
  status: "pass" | "fail";
  expectedLabel: string;
  actualLabel: string;
  actualCodes: string;
  caseId: string;
  description: string;
  docId: string;
  note?: string;
};

export function renderCasesSection(
  cases: DocLifecycleCase[] | undefined,
  docLifecycle: DocLifecycleResult[]
): string {
  if (!cases || cases.length === 0) {
    return `<div class="panel"><div class="muted">No expected cases defined.</div></div>`;
  }

  const results = evaluateCases(cases, docLifecycle);
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
            <th>Doc ID</th>
            <th>Explanation Codes</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="6" class="muted">No cases</td></tr>`}
        </tbody>
      </table>
    </div>
  </div>`;
}

export function renderCaseRow(result: CaseEvaluation): string {
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
  <td>${escapeHtml(result.docId)}</td>
  <td>${escapeHtml(result.actualCodes)}</td>
</tr>`;
}

function evaluateCase(
  testCase: DocLifecycleCase,
  docLifecycle: DocLifecycleResult[]
): CaseEvaluation {
  const match = docLifecycle.find((item) => item.docId === testCase.doc_id);
  const expectedLabel = `${testCase.expected_kind} / ${testCase.expected_severity} / ${testCase.expected_next_action}`;
  const actualLabel = match
    ? `${match.kind} / ${match.severity} / ${match.nextAction}`
    : "none";
  const actualCodes = match?.explanationCodes.join(", ") ?? "";

  if (!match) {
    return {
      status: "fail",
      expectedLabel,
      actualLabel,
      actualCodes,
      caseId: testCase.id,
      description: testCase.description ?? "",
      docId: testCase.doc_id,
      note: "no lifecycle result",
    };
  }

  const codesOk = ensureCodes(match.explanationCodes, testCase.expected_explanation_codes);
  const anchorOk = ensureAnchor(match, testCase.expected_rematch_anchor);
  const pass =
    match.kind === testCase.expected_kind &&
    match.severity === testCase.expected_severity &&
    match.nextAction === testCase.expected_next_action &&
    codesOk &&
    anchorOk;

  return {
    status: pass ? "pass" : "fail",
    expectedLabel,
    actualLabel,
    actualCodes,
    caseId: testCase.id,
    description: testCase.description ?? "",
    docId: testCase.doc_id,
    note: pass ? undefined : buildFailureNote(codesOk, anchorOk, match, testCase),
  };
}

export function evaluateCases(
  cases: DocLifecycleCase[] | undefined,
  docLifecycle: DocLifecycleResult[]
): CaseEvaluation[] {
  if (!cases || cases.length === 0) return [];
  return cases.map((item) => evaluateCase(item, docLifecycle));
}

function ensureCodes(actual: string[], expected: string[] | undefined): boolean {
  if (!expected || expected.length === 0) return true;
  const set = new Set(actual);
  return expected.every((code) => set.has(code));
}

function ensureAnchor(
  match: DocLifecycleResult,
  expectedAnchor: string | undefined
): boolean {
  if (!expectedAnchor) return true;
  return match.rematchHint?.anchorDate === expectedAnchor;
}

function buildFailureNote(
  codesOk: boolean,
  anchorOk: boolean,
  match: DocLifecycleResult,
  testCase: DocLifecycleCase
): string {
  if (!codesOk) return "explanation_codes missing";
  if (!anchorOk) return "rematch_anchor mismatch";
  if (match.kind !== testCase.expected_kind) return "kind mismatch";
  if (match.severity !== testCase.expected_severity) return "severity mismatch";
  if (match.nextAction !== testCase.expected_next_action) return "next_action mismatch";
  return "mismatch";
}

function buildKindCounts(): Record<DocLifecycleResult["kind"], number> {
  return KIND_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {} as Record<DocLifecycleResult["kind"], number>);
}

function buildSeverityCounts(): Record<DocLifecycleResult["severity"], number> {
  return SEVERITY_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {} as Record<DocLifecycleResult["severity"], number>);
}

function ensureDir(outDir: string) {
  fs.mkdirSync(outDir, { recursive: true });
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
