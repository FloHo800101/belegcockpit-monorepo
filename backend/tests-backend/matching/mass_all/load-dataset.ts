import fs from "node:fs";
import path from "node:path";
import type { MatchingDataset } from "./types";

export function loadDatasetFromJson(datasetPath: string): MatchingDataset {
  const raw = fs.readFileSync(datasetPath, "utf8");
  const parsed = JSON.parse(raw) as MatchingDataset;
  if (!parsed || !Array.isArray(parsed.docs) || !Array.isArray(parsed.txs)) {
    throw new Error(`Invalid dataset: ${path.basename(datasetPath)}`);
  }
  return parsed;
}
