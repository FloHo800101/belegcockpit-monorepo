// How to run:
// pnpm matching:mass_doc:offline
// pnpm matching:mass_doc:offline:dataset -- --dataset <path> --out <dir>

import fs from "node:fs";
import path from "node:path";
import { run_pipeline } from "../../../src/matching-engine";
import { FakeRepo } from "../mass_tx2doc/fake-repo";
import { loadDatasetFromJson } from "./load-dataset";
import {
  buildSummary,
  evaluateCases,
  writeActualJson,
  writeHtmlReport,
  writeSummaryJson,
} from "./write-artifacts";
import type { DocLifecycleDataset, OfflineRunArtifacts } from "./types";

const DEFAULT_DATASET = "tests-backend/matching/mass_doc/datasets/doc_lifecycle_smoke.json";
const DEFAULT_OUT = "tests-backend/matching/mass_doc/out/latest";
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
      txs: dataset.txs ?? [],
      nowISO: createdAtISO,
    },
    repo,
    {
      cfgOverride: dataset.configOverride,
      debug: true,
    }
  );

  const artifacts: OfflineRunArtifacts = {
    runId,
    createdAtISO,
    datasetPath,
    dataset,
    pipeline,
    repo: repo.getResults(),
  };

  prepareOutDir(outDir);
  writeActualJson(outDir, artifacts);

  const summary = buildSummary({ dataset, docLifecycle: pipeline.docLifecycle ?? [] });
  writeSummaryJson(outDir, summary);

  writeHtmlReport(outDir, {
    tenantId,
    runId,
    createdAtISO,
    docLifecycle: pipeline.docLifecycle ?? [],
    debug: pipeline.debug,
    cases: dataset.cases,
  });

  const caseResults = evaluateCases(dataset.cases, pipeline.docLifecycle ?? []);
  const failed = caseResults.filter((item) => item.status === "fail").length;

  console.log(`[matching:mass_doc] dataset=${datasetPath}`);
  console.log(`[matching:mass_doc] out=${outDir}`);
  console.log(
    `[matching:mass_doc] docs=${dataset.docs.length} docLifecycle=${pipeline.docLifecycle?.length ?? 0}`
  );
  if (dataset.cases && dataset.cases.length > 0) {
    console.log(`[matching:mass_doc] cases=${caseResults.length} failed=${failed}`);
  }
  console.log(`[matching:mass_doc] report=${path.join(outDir, "report.html")}`);

  if (failed > 0) {
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
