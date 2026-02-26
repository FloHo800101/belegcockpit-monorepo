import { normalizeString } from "./upsert-helpers.ts";

export type InvoiceLineItemInput = {
  description?: string | null;
  totalPrice?: number | null;
};

export type InvoiceLineItemRow = {
  tenant_id: string;
  invoice_id: string;
  document_id: string;
  line_index: number;
  description: string | null;
  amount_signed: number;
  amount_abs: number;
  currency: string;
  link_state: "unlinked";
  open_amount: number;
  match_group_id: null;
  matched_at: null;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export function buildInvoiceLineItemRows(params: {
  tenantId: string;
  invoiceId: string;
  documentId: string;
  currency?: string | null;
  lineItems?: Array<InvoiceLineItemInput | null> | null;
  nowISO: string;
}): InvoiceLineItemRow[] {
  const { tenantId, invoiceId, documentId, currency, lineItems, nowISO } = params;
  const out: InvoiceLineItemRow[] = [];
  const normalizedCurrency = normalizeCurrency(currency);

  for (let index = 0; index < (lineItems?.length ?? 0); index += 1) {
    const item = lineItems?.[index];
    const signed = toFiniteNumber(item?.totalPrice);
    if (!Number.isFinite(signed) || signed === 0) continue;

    const amountSigned = roundCurrency(signed);
    const amountAbs = roundCurrency(Math.abs(amountSigned));
    if (!(amountAbs > 0)) continue;

    out.push({
      tenant_id: tenantId,
      invoice_id: invoiceId,
      document_id: documentId,
      line_index: index,
      description: normalizeString(item?.description),
      amount_signed: amountSigned,
      amount_abs: amountAbs,
      currency: normalizedCurrency,
      link_state: "unlinked",
      open_amount: amountAbs,
      match_group_id: null,
      matched_at: null,
      meta: {
        source: "parsed_line_items",
      },
      created_at: nowISO,
      updated_at: nowISO,
    });
  }

  return out;
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN;
  if (typeof value === "string") {
    const num = Number(value.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(num) ? num : Number.NaN;
  }
  return Number.NaN;
}

function normalizeCurrency(value?: string | null): string {
  if (!value) return "EUR";
  const trimmed = value.trim().toUpperCase();
  return trimmed || "EUR";
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}
