import fs from "node:fs";
import path from "node:path";
import type {
  MatchDecision,
  MatchRelationType,
  MatchState,
  PipelineResult,
} from "../../../src/matching-engine";
import { evaluateCases as evaluateDocCases } from "../mass_doc/write-artifacts";
import { evaluateCases as evaluateTxCases } from "../mass_tx/write-artifacts";
import { writeAllReport } from "../render-all-report";
import type {
  DatasetCase,
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
  return writeAllReport({ ...input, outputPath });
}

export function buildSummary(params: {
  dataset: MatchingDataset;
  decisions: MatchDecision[];
}): OfflineSummary {
  const { dataset, decisions } = params;
  const stateCounts = buildStateCounts();
  const relationCounts = buildRelationCounts();

  for (const decision of decisions) {
    if (decision.state in stateCounts) {
      stateCounts[decision.state] += 1;
    }
    const relationType = inferRelationType(decision);
    relationCounts[relationType] += 1;
  }

  return {
    meta: dataset.meta,
    totals: {
      docs: dataset.docs.length,
      txs: dataset.txs.length,
    },
    stateCounts,
    relationCounts,
  };
}

export type MatchingCaseResult = {
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

export function evaluateMatchingCases(
  cases: DatasetCase[] | undefined,
  decisions: MatchDecision[]
): MatchingCaseResult[] {
  if (!cases || cases.length === 0) return [];
  return cases.map((item) => evaluateCase(item, decisions));
}

export function evaluateAllCases(params: {
  dataset: MatchingDataset;
  pipeline: PipelineResult;
}): { matchingFailed: number; docFailed: number; txFailed: number } {
  const matchingResults = evaluateMatchingCases(
    params.dataset.cases?.matching,
    params.pipeline.decisions
  );
  const docResults = evaluateDocCases(
    params.dataset.cases?.doc,
    params.pipeline.docLifecycle ?? []
  );
  const txResults = evaluateTxCases(
    params.dataset.cases?.tx,
    params.pipeline.txLifecycle ?? []
  );

  return {
    matchingFailed: matchingResults.filter((item) => item.status === "fail").length,
    docFailed: docResults.filter((item) => item.status === "fail").length,
    txFailed: txResults.filter((item) => item.status === "fail").length,
  };
}

function evaluateCase(testCase: DatasetCase, decisions: MatchDecision[]): MatchingCaseResult {
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

function ensureDir(outDir: string) {
  fs.mkdirSync(outDir, { recursive: true });
}
