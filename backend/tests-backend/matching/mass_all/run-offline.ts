// How to run:
// pnpm matching:mass_all:offline
// pnpm matching:mass_all:offline:dataset -- --dataset <path> --out <dir>

import fs from "node:fs";
import path from "node:path";
import { run_pipeline } from "../../../src/matching-engine";
import { FakeRepo } from "../mass_tx2doc/fake-repo";
import { loadDatasetFromJson } from "./load-dataset";
import {
  buildSummary,
  evaluateAllCases,
  writeActualJson,
  writeHtmlReport,
  writeSummaryJson,
} from "./write-artifacts";
import type { MatchingDataset, OfflineRunArtifacts } from "./types";

const DEFAULT_DATASET = "tests-backend/matching/mass_all/datasets/mass_all_smoke.json";
const DEFAULT_OUT = "tests-backend/matching/mass_all/out/latest";
const ARTIFACT_FILES = ["actual.json", "summary.json", "report.html"];

async function main() {
  const args = process.argv.slice(2);
  const datasetArg = readArg(args, "--dataset") ?? DEFAULT_DATASET;
  const outArg = readArg(args, "--out") ?? DEFAULT_OUT;

  const datasetPath = path.resolve(datasetArg);
  const outDir = path.resolve(outArg);

  if (!fs.existsSync(datasetPath)) {
    throw new Error(`Dataset not found: ${datasetPath}`);
  }

  const dataset = loadDatasetFromJson(datasetPath);
  const createdAtISO = dataset.meta?.nowISO ?? new Date().toISOString();
  const runId = dataset.meta?.name ?? path.basename(datasetPath, path.extname(datasetPath));
  const tenantId = dataset.meta?.tenant_id ?? "__unknown__";

  const repo = new FakeRepo();
  const pipeline = await run_pipeline(
    {
      docs: dataset.docs,
      txs: dataset.txs,
      nowISO: createdAtISO,
    },
    repo,
    {
      cfgOverride: dataset.configOverride,
      debug: true,
      eventType: "nightly",
    }
  );

  const artifacts: OfflineRunArtifacts = {
    runId,
    createdAtISO,
    datasetPath,
    dataset,
    pipeline,
    decisions: pipeline.decisions,
  };

  prepareOutDir(outDir);
  writeActualJson(outDir, artifacts);

  const summary = buildSummary({ dataset, decisions: pipeline.decisions });
  writeSummaryJson(outDir, summary);

  writeHtmlReport(outDir, {
    tenantId,
    runId,
    createdAtISO,
    docs: dataset.docs,
    txs: dataset.txs,
    decisions: pipeline.decisions,
    docLifecycle: pipeline.docLifecycle ?? [],
    txLifecycle: pipeline.txLifecycle ?? [],
    debug: pipeline.debug,
    cases: dataset.cases,
  });

  const failures = evaluateAllCases({ dataset, pipeline });
  const failedTotal = failures.matchingFailed + failures.docFailed + failures.txFailed;

  console.log(`[matching:mass_all] dataset=${datasetPath}`);
  console.log(`[matching:mass_all] out=${outDir}`);
  console.log(
    `[matching:mass_all] docs=${dataset.docs.length} txs=${dataset.txs.length} decisions=${pipeline.decisions.length}`
  );
  console.log(
    `[matching:mass_all] cases_failed matching=${failures.matchingFailed} doc=${failures.docFailed} tx=${failures.txFailed}`
  );
  console.log(`[matching:mass_all] report=${path.join(outDir, "report.html")}`);

  if (failedTotal > 0) {
    process.exitCode = 1;
  }
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
