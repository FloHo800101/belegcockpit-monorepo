import fs from "node:fs";
import path from "node:path";
import type {
  MatchDecision,
  MatchRelationType,
  MatchState,
} from "../../../src/matching-engine";
import { writeHtmlReport as renderHtmlReport } from "../render-html-report";
import type {
  MatchingDataset,
  OfflineReportInput,
  OfflineRunArtifacts,
  OfflineSummary,
} from "./types";

const RELATION_KEYS: MatchRelationType[] = [
  "one_to_one",
  "one_to_many",
  "many_to_one",
  "many_to_many",
];

const STATE_KEYS: MatchState[] = ["final", "suggested", "ambiguous", "partial"];

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
  return renderHtmlReport({
    tenantId: input.tenantId,
    runId: input.runId,
    decisions: input.decisions,
    debug: input.debug,
    params: input.params ?? {},
    createdAtISO: input.createdAtISO,
    cases: input.cases,
    txs: input.txs,
    outputPath,
  });
}

export function buildSummary(params: {
  dataset: MatchingDataset;
  decisions: MatchDecision[];
}): OfflineSummary {
  const { dataset, decisions } = params;
  const stateCounts = buildStateCounts();
  const relationCounts = buildRelationCounts();
  const reasonCounts = new Map<string, number>();

  for (const decision of decisions) {
    if (decision.state in stateCounts) {
      stateCounts[decision.state] += 1;
    }

    const relationType = inferRelationType(decision);
    relationCounts[relationType] += 1;

    for (const reason of decision.reason_codes) {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
  }

  const topReasonCodes = [...reasonCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([code, count]) => ({ code, count }));

  return {
    meta: dataset.meta,
    totals: {
      docs: dataset.docs.length,
      txs: dataset.txs.length,
    },
    stateCounts,
    relationCounts,
    topReasonCodes,
  };
}

function ensureDir(outDir: string) {
  fs.mkdirSync(outDir, { recursive: true });
}

function buildStateCounts(): Record<MatchState, number> {
  return STATE_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {} as Record<MatchState, number>);
}

function buildRelationCounts(): Record<MatchRelationType, number> {
  return RELATION_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {} as Record<MatchRelationType, number>);
}

function inferRelationType(decision: MatchDecision): MatchRelationType {
  const rel = decision.relation_type;
  if (RELATION_KEYS.includes(rel)) return rel;

  const docs = decision.doc_ids.length;
  const txs = decision.tx_ids.length;

  if (docs <= 1 && txs <= 1) return "one_to_one";
  if (docs <= 1 && txs > 1) return "one_to_many";
  if (docs > 1 && txs <= 1) return "many_to_one";
  return "many_to_many";
}
