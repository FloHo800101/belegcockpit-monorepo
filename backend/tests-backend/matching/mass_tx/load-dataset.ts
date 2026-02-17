import fs from "node:fs";
import path from "node:path";
import type { TxLifecycleDataset } from "./types";

export function loadDatasetFromJson(datasetPath: string): TxLifecycleDataset {
  const raw = fs.readFileSync(datasetPath, "utf8");
  const parsed = JSON.parse(raw) as TxLifecycleDataset;
  if (!parsed || !Array.isArray(parsed.txs)) {
    throw new Error(`Invalid dataset: ${path.basename(datasetPath)}`);
  }
  return parsed;
}
