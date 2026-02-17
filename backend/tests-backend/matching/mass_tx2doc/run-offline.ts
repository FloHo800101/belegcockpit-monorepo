// How to run:
// pnpm matching:mass_tx2doc:offline
// pnpm matching:mass_tx2doc:offline:dataset -- --dataset <path> --out <dir>
// Simulation (2nd pass with final matches linked):
// pnpm matching:mass_tx2doc:offline -- --simulate-linked

import fs from "node:fs";
import path from "node:path";
import { run_pipeline } from "../../../src/matching-engine";
import { FakeRepo } from "./fake-repo";
import { loadDatasetFromJson, loadDatasetFromXml } from "./load-dataset";
import { buildSummary, writeActualJson, writeHtmlReport, writeSummaryJson } from "./write-artifacts";
import type { MatchingDataset, OfflineRunArtifacts } from "./types";

const DEFAULT_DATASET = "tests-backend/matching/mass_tx2doc/datasets/smoke.json";
const DEFAULT_OUT = "tests-backend/matching/mass_tx2doc/out/latest";
const ARTIFACT_FILES = ["actual.json", "summary.json", "report.html"];

async function main() {
  const args = process.argv.slice(2);
  const datasetArg = readArg(args, "--dataset") ?? DEFAULT_DATASET;
  const outArg = readArg(args, "--out") ?? DEFAULT_OUT;
  const simulateLinked = readBoolArg(args, "--simulate-linked", false);

  const datasetPath = path.resolve(datasetArg);
  const outDir = path.resolve(outArg);

  if (!fs.existsSync(datasetPath)) {
    throw new Error(`Dataset not found: ${datasetPath}`);
  }

  const dataset = loadDataset(datasetPath);
  const createdAtISO = dataset.meta?.nowISO ?? new Date().toISOString();
  const runId = dataset.meta?.name ?? path.basename(datasetPath, path.extname(datasetPath));
  const tenantId = dataset.meta?.tenant_id ?? "__unknown__";

  const initialRun = await runPipelineWithRepo(dataset.docs, dataset.txs, createdAtISO, dataset);

  const finalRun = simulateLinked
    ? await runWithLinkedState(initialRun, dataset, createdAtISO)
    : initialRun;

  const combinedDecisions = simulateLinked
    ? combineDecisions(initialRun.pipeline.decisions, finalRun.pipeline.decisions)
    : finalRun.pipeline.decisions;

  const combinedPipeline = {
    ...finalRun.pipeline,
    decisions: combinedDecisions,
  };

  const artifacts: OfflineRunArtifacts = {
    runId,
    createdAtISO,
    datasetPath,
    dataset,
    pipeline: combinedPipeline,
    repo: finalRun.repo.getResults(),
  };

  prepareOutDir(outDir);
  writeActualJson(outDir, artifacts);

  const summary = buildSummary({ dataset, decisions: combinedDecisions });
  writeSummaryJson(outDir, summary);

  writeHtmlReport(outDir, {
    tenantId,
    runId,
    createdAtISO,
    decisions: combinedDecisions,
    debug: finalRun.pipeline.debug,
    cases: dataset.cases,
    txs: dataset.txs,
    params: {
      datasetPath,
      simulateLinked,
      initialFinalCount: countFinal(initialRun.pipeline.decisions),
      remainingDecisionCount: finalRun.pipeline.decisions.length,
    },
  });

  console.log(`[matching:mass_tx2doc] dataset=${datasetPath}`);
  console.log(`[matching:mass_tx2doc] out=${outDir}`);
  console.log(
    `[matching:mass_tx2doc] docs=${dataset.docs.length} txs=${dataset.txs.length} decisions=${combinedDecisions.length}`
  );
  console.log(`[matching:mass_tx2doc] report=${path.join(outDir, "report.html")}`);
}

function loadDataset(datasetPath: string): MatchingDataset {
  const ext = path.extname(datasetPath).toLowerCase();

  if (ext === ".json") return loadDatasetFromJson(datasetPath);
  if (ext === ".xml") return loadDatasetFromXml(datasetPath);

  throw new Error(`Unsupported dataset extension: ${ext}`);
}

function prepareOutDir(outDir: string): void {
  fs.mkdirSync(outDir, { recursive: true });

  for (const name of ARTIFACT_FILES) {
    const filePath = path.join(outDir, name);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}

function readArg(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function readBoolArg(args: string[], name: string, defaultValue: boolean): boolean {
  if (args.includes(`--no-${name.replace(/^--/, "")}`)) return false;
  const idx = args.indexOf(name);
  if (idx === -1) return defaultValue;
  const next = args[idx + 1];
  if (!next || next.startsWith("--")) return true;
  return next !== "false";
}

async function runWithLinkedState(
  initial: { pipeline: Awaited<ReturnType<typeof run_pipeline>> },
  dataset: MatchingDataset,
  nowISO: string
) {
  const { docs, txs } = applyLinkedState(
    dataset.docs,
    dataset.txs,
    initial.pipeline.decisions
  );
  return runPipelineWithRepo(docs, txs, nowISO, dataset);
}

function applyLinkedState(
  docs: MatchingDataset["docs"],
  txs: MatchingDataset["txs"],
  decisions: Awaited<ReturnType<typeof run_pipeline>>["decisions"]
) {
  const linkedDocs = new Set<string>();
  const linkedTxs = new Set<string>();

  for (const decision of decisions) {
    if (decision.state !== "final") continue;
    for (const docId of decision.doc_ids) linkedDocs.add(docId);
    for (const txId of decision.tx_ids) linkedTxs.add(txId);
  }

  return {
    docs: docs.map((doc) =>
      linkedDocs.has(doc.id) ? { ...doc, link_state: "linked" as const } : doc
    ),
    txs: txs.map((tx) =>
      linkedTxs.has(tx.id) ? { ...tx, link_state: "linked" as const } : tx
    ),
  };
}

async function runPipelineWithRepo(
  docs: MatchingDataset["docs"],
  txs: MatchingDataset["txs"],
  nowISO: string,
  dataset: MatchingDataset
) {
  const repo = new FakeRepo();
  const pipeline = await run_pipeline(
    {
      docs,
      txs,
      nowISO,
    },
    repo,
    {
      cfgOverride: dataset.configOverride,
      debug: true,
    }
  );
  return { pipeline, repo };
}

function combineDecisions(
  initial: Awaited<ReturnType<typeof run_pipeline>>["decisions"],
  remaining: Awaited<ReturnType<typeof run_pipeline>>["decisions"]
) {
  const finals = initial.filter((decision) => decision.state === "final");
  return [...finals, ...remaining];
}

function countFinal(decisions: Awaited<ReturnType<typeof run_pipeline>>["decisions"]) {
  let count = 0;
  for (const decision of decisions) {
    if (decision.state === "final") count += 1;
  }
  return count;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
