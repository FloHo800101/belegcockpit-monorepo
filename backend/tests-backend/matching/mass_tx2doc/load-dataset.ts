import fs from "node:fs";
import path from "node:path";
import type { MatchingDataset } from "./types";

export function loadDatasetFromJson(datasetPath: string): MatchingDataset {
  const resolved = path.resolve(datasetPath);
  const raw = fs.readFileSync(resolved, "utf8");
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in dataset: ${resolved}`);
  }

  return assertDataset(parsed, resolved);
}

export function loadDatasetFromXml(datasetPath: string): MatchingDataset {
  const resolved = path.resolve(datasetPath);
  throw new Error(`XML dataset loader not implemented yet: ${resolved}`);
}

function assertDataset(value: unknown, datasetPath: string): MatchingDataset {
  if (!value || typeof value !== "object") {
    throw new Error(`Dataset must be an object: ${datasetPath}`);
  }

  const record = value as { docs?: unknown; txs?: unknown };

  if (!Array.isArray(record.docs)) {
    throw new Error(`Dataset docs must be an array: ${datasetPath}`);
  }

  if (!Array.isArray(record.txs)) {
    throw new Error(`Dataset txs must be an array: ${datasetPath}`);
  }

  return value as MatchingDataset;
}
