import fs from "node:fs";
import path from "node:path";
import type { DocLifecycleDataset } from "./types";

export function loadDatasetFromJson(datasetPath: string): DocLifecycleDataset {
  const raw = fs.readFileSync(datasetPath, "utf8");
  const parsed = JSON.parse(raw) as DocLifecycleDataset;
  if (!parsed || !Array.isArray(parsed.docs)) {
    throw new Error(`Invalid dataset: ${path.basename(datasetPath)}`);
  }
  return parsed;
}
