import type { CanonicalDoc, CanonicalTx, GeneratorToggles } from "../models/types";
import { normalizeText } from "./normalize";

export function generateIban(): string {
  const digits = Array.from({ length: 16 }, () => Math.floor(Math.random() * 10)).join("");
  const checksum = String(Math.floor(Math.random() * 90) + 10);
  return `DE${checksum}${digits}`;
}

const DUE_DATE_SHIFT_DAYS = 14;

function shiftDate(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export function buildDoc(partial: Partial<CanonicalDoc>): CanonicalDoc {
  const baseDate = new Date();
  baseDate.setUTCHours(0, 0, 0, 0);
  const vendorRaw = partial.vendor_raw ?? "Acme GmbH";
  const textRaw = partial.text_raw ?? `${vendorRaw} ${partial.invoice_no ?? ""}`.trim();
  const iban =
    partial.iban === undefined
      ? generateIban()
      : partial.iban;
  const invoiceDate = partial.invoice_date ?? baseDate.toISOString();
  const dueDate = partial.due_date === undefined ? invoiceDate : partial.due_date;
  return {
    id: partial.id ?? "doc-000",
    tenant_id: partial.tenant_id ?? "t_all",
    amount: partial.amount ?? 0,
    currency: "EUR",
    link_state: partial.link_state ?? "unlinked",
    invoice_date: invoiceDate,
    due_date: dueDate,
    invoice_no: partial.invoice_no ?? null,
    iban,
    e2e_id: partial.e2e_id ?? null,
    vendor_raw: vendorRaw,
    vendor_norm: normalizeText(vendorRaw),
    text_raw: textRaw,
    text_norm: normalizeText(textRaw),
    meta: partial.meta
  };
}

export function buildTx(partial: Partial<CanonicalTx>): CanonicalTx {
  const baseDate = new Date();
  baseDate.setUTCHours(0, 0, 0, 0);
  const counterparty = partial.counterparty_name ?? "Acme GmbH";
  const vendorRaw = partial.vendor_raw ?? counterparty ?? "";
  const reference = partial.reference ?? null;
  const description = partial.description ?? null;
  const e2e = partial.e2e_id ?? null;
  const textRaw = partial.text_raw ?? joinText(reference, description, counterparty, e2e);

  return {
    id: partial.id ?? "tx-000",
    tenant_id: partial.tenant_id ?? "t_all",
    amount: partial.amount ?? 0,
    direction: partial.direction ?? "out",
    currency: "EUR",
    booking_date: partial.booking_date ?? baseDate.toISOString(),
    link_state: partial.link_state ?? "unlinked",
    iban: partial.iban ?? null,
    reference,
    description,
    counterparty_name: counterparty,
    e2e_id: e2e,
    vendor_raw: vendorRaw,
    vendor_norm: normalizeText(vendorRaw),
    ref: partial.ref ?? reference,
    text_raw: textRaw,
    text_norm: normalizeText(textRaw)
  };
}

export function joinText(
  reference?: string | null,
  description?: string | null,
  counterparty?: string | null,
  e2e?: string | null
): string {
  return [reference, description, counterparty, e2e]
    .filter((part) => part && part.trim().length > 0)
    .join(" ");
}

export function applyDocVendor(doc: CanonicalDoc, vendorRaw: string): CanonicalDoc {
  const textRaw = doc.text_raw ?? "";
  return {
    ...doc,
    vendor_raw: vendorRaw,
    vendor_norm: normalizeText(vendorRaw),
    text_raw: textRaw,
    text_norm: normalizeText(textRaw)
  };
}

export function applyDocText(doc: CanonicalDoc, textRaw: string): CanonicalDoc {
  return {
    ...doc,
    text_raw: textRaw,
    text_norm: normalizeText(textRaw)
  };
}

export function applyTxVendor(tx: CanonicalTx, vendorRaw: string): CanonicalTx {
  return {
    ...tx,
    vendor_raw: vendorRaw,
    vendor_norm: normalizeText(vendorRaw)
  };
}

export function applyTxText(tx: CanonicalTx, textRaw: string): CanonicalTx {
  return {
    ...tx,
    text_raw: textRaw,
    text_norm: normalizeText(textRaw)
  };
}

export function applyVendorNoise(value: string): string {
  if (value.toLowerCase().includes("gmbh")) {
    return value.replace(/gmbh/gi, "").trim();
  }
  if (Math.random() > 0.5) {
    return value.toUpperCase();
  }
  return value.replace(/[aeiou]/i, "");
}

export function applyInvoiceNoise(value: string): string {
  const variants = [
    value.replace(".", "/"),
    value.replace(".", "-"),
    `RNr: ${value}`,
    value.split("").join(" ")
  ];
  return variants[Math.floor(Math.random() * variants.length)];
}

export function applyEdgeAmount(amount: number): number {
  return Math.round((amount + (Math.random() > 0.5 ? 0.01 : -0.01)) * 100) / 100;
}

export function applyEdgeDate(date: string): string {
  const base = new Date(date);
  base.setDate(base.getDate() + (Math.random() > 0.5 ? 14 : -14));
  return base.toISOString();
}

export function applyTextKeyword(text: string, keyword: string): string {
  if (!text.includes(keyword)) {
    return `${text} ${keyword}`.trim();
  }
  return text;
}

export function applyTogglesToTx(
  tx: CanonicalTx,
  toggles: GeneratorToggles,
  templateRequiresIban: boolean
): CanonicalTx {
  let updated = { ...tx };
  if (toggles.txIbanMissing && !templateRequiresIban) {
    updated.iban = null;
  }
  if (toggles.vendorNoise) {
    updated = applyTxVendor(updated, applyVendorNoise(updated.vendor_raw));
  }
  if (toggles.dateEdge) {
    updated.booking_date = applyEdgeDate(updated.booking_date);
  }
  if (toggles.amountEdge) {
    updated.amount = applyEdgeAmount(updated.amount);
  }
  if (toggles.partialKeyword) {
    const nextText = applyTextKeyword(updated.text_raw, "Teilzahlung");
    updated = applyTxText(updated, nextText);
  }
  if (toggles.batchKeyword) {
    const nextText = applyTextKeyword(updated.text_raw, "Sammelzahlung");
    updated = applyTxText(updated, nextText);
  }
  return updated;
}

export function applyTogglesToDoc(doc: CanonicalDoc, toggles: GeneratorToggles): CanonicalDoc {
  let updated = { ...doc };
  if (toggles.vendorNoise) {
    updated = applyDocVendor(updated, applyVendorNoise(updated.vendor_raw));
  }
  if (toggles.dateEdge) {
    updated.invoice_date = applyEdgeDate(updated.invoice_date);
  }
  if (toggles.dueDateShift) {
    const base = updated.due_date ?? updated.invoice_date;
    updated.due_date = shiftDate(base, DUE_DATE_SHIFT_DAYS);
  }
  if (toggles.amountEdge) {
    updated.amount = applyEdgeAmount(updated.amount);
  }
  return updated;
}
