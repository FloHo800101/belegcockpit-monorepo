import type { DatasetState } from "../models/types";

const STORAGE_KEY = "dataset_builder_state_v1";

export function loadState(): DatasetState | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as DatasetState;
    if (!parsed?.meta || !Array.isArray(parsed.cases)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveState(state: DatasetState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearState(): void {
  localStorage.removeItem(STORAGE_KEY);
}
