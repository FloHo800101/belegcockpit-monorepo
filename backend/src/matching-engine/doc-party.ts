import { Direction, Doc, Tx } from "./types";

export function docPartyNormForTx(doc: Doc, tx: Tx): string | null {
  return docPartyNormForDirection(doc, tx.direction);
}

export function docPartyNormForDirection(
  doc: Doc,
  direction: Direction
): string | null {
  if (direction === "in") {
    return firstNonEmpty(doc.buyer_norm, doc.vendor_norm);
  }
  return firstNonEmpty(doc.vendor_norm, doc.buyer_norm);
}

export function docPartyNorms(doc: Doc): string[] {
  const values = [normalize(doc.vendor_norm), normalize(doc.buyer_norm)].filter(
    Boolean
  ) as string[];
  return Array.from(new Set(values));
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const normalized = normalize(value);
    if (normalized) return normalized;
  }
  return null;
}

function normalize(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}
