// Steuervorauszahlungs-/Ratenplan-Erkennung und Rechnungsnummer-Extraktion

import { ParsedDocument } from "../types.ts";
import {
  normalizeOcrText,
  parseDateFlexible,
  parseAmountFlexible,
  parseLocalizedNumber,
  roundCurrency,
  escapeRegex,
} from "./parse-utils.ts";
import { extractLabeledAmount } from "./party-extraction.ts";

export type InstallmentPlan = {
  totalAmount: number;
  installmentAmount: number;
  installmentsCount: number;
};

export function extractRecurringContractAmount(content: string | null | undefined): number | null {
  if (!content) return null;
  const labels = [
    "Monatliche Gesamtrate",
    "Monatliche Leasingrate",
    "Leasingrate",
    "Monatsrate",
    "Monatliche Rate",
    "Ratenbetrag",
    "Einzugsbetrag",
    "Zu zahlender Betrag",
    "Rechnungsbetrag",
    "Gesamtbetrag",
  ];
  const labeled = extractLabeledAmount(content, labels);
  if (labeled != null) return labeled;

  const lines = content.split(/\r?\n/).map((line) => normalizeOcrText(line)).filter(Boolean);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lower = line.toLowerCase();
    if (/sonderzahlung|gesamtkilometer|leasingzeit/.test(lower)) continue;
    if (!/monatliche gesamtrate|monatliche leasingrate|monatsrate|ratenbetrag|monatliche rate/.test(lower)) {
      continue;
    }

    const direct = parseAmountFlexible(line);
    if (direct != null) return Math.abs(direct);

    for (let offset = 1; offset <= 3; offset += 1) {
      const next = lines[i + offset];
      if (!next) break;
      const parsed = parseAmountFlexible(next);
      if (parsed != null) return Math.abs(parsed);
      if (/^[a-z]/i.test(next) && !/\b(eur|usd|chf|€|\$)\b/i.test(next)) {
        break;
      }
    }
  }

  return null;
}

export function extractInvoiceNumber(content: string | null | undefined): string | null {
  if (!content) return null;
  const normalizedContent = normalizeOcrText(content);
  const labels = [
    "Rechnungsnummer",
    "Rechnung Nr",
    "Rechnungsnr",
    "Re-Nr",
    "Invoice number",
    "Invoice no",
    "Invoice #",
    "Invoice",
  ];

  for (const label of labels) {
    const escapedLabel = escapeRegex(label).replace(/\s+/g, "\\s+");
    const regex = new RegExp(`${escapedLabel}\\s*[:#\\-]?\\s*([^\\r\\n]+)`, "i");
    const match = normalizedContent.match(regex);
    const candidate = normalizeInvoiceNumberCandidate(match?.[1] ?? null);
    if (candidate) return candidate;
  }

  const fallback = normalizedContent.match(/\b(?:RE|RG|INV)[-_ ]?\d{2,}[A-Z0-9/_-]*\b/i);
  return normalizeInvoiceNumberCandidate(fallback?.[0] ?? null);
}

export function normalizeInvoiceNumberCandidate(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = normalizeOcrText(value);
  if (!cleaned) return null;
  const tokenMatch = cleaned.match(/[A-Z0-9][A-Z0-9/_-]{2,}/i);
  if (!tokenMatch) return null;
  const token = tokenMatch[0].replace(/^[-/_]+|[-/_]+$/g, "").toUpperCase();
  if (!token) return null;
  if (/^UST/i.test(token)) return null;
  if (/^(UID|VAT|TAX)$/i.test(token)) return null;
  if (/^[A-Z]{1,4}$/.test(token)) return null;
  if (/^(DE)?\d{9,}$/.test(token)) return null;
  return token;
}

export function extractTaxInstallmentPlan(
  content: string | null | undefined,
  invoiceTotal: number | null
): InstallmentPlan | null {
  const normalized = normalizeOcrText(content);
  if (!normalized) return null;

  const lower = normalized.toLowerCase();
  const hasTaxHint =
    lower.includes("gewerbesteuer") ||
    lower.includes("umsatzsteuer") ||
    lower.includes("finanzamt") ||
    lower.includes("steuervorauszahlung") ||
    lower.includes("vorauszahlung");
  if (!hasTaxHint) return null;

  const totalAmount = resolveTotalAmount(normalized, invoiceTotal) ?? null;
  if (totalAmount == null) return null;

  const installmentAmount =
    extractInstallmentAmount(normalized, totalAmount) ??
    extractRepeatedInstallmentAmount(normalized, totalAmount);
  if (installmentAmount == null) return null;
  if (totalAmount <= installmentAmount) return null;

  const derivedCount = Math.round(totalAmount / installmentAmount);
  if (!Number.isFinite(derivedCount) || derivedCount < 2 || derivedCount > 8) return null;
  if (Math.abs(totalAmount - installmentAmount * derivedCount) > 0.05) return null;

  return {
    totalAmount: roundCurrency(totalAmount),
    installmentAmount: roundCurrency(installmentAmount),
    installmentsCount: derivedCount,
  };
}

function extractInstallmentAmount(content: string, totalAmount: number): number | null {
  const regex =
    /(?:jeweils|vierteljaehrlich|vierteljährlich|vorauszahlung(?:en)?|teilbetrag|rate(?:n)?)(?:[^0-9]{0,30})(\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?|\d+(?:,\d{2})?)/gi;
  const candidates: number[] = [];
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(content)) !== null) {
    const value = parseLocalizedNumber(match[1]);
    if (value == null || value <= 0) continue;
    const rounded = roundCurrency(value);
    if (rounded >= totalAmount) continue;
    candidates.push(rounded);
  }

  for (const candidate of candidates) {
    const derivedCount = Math.round(totalAmount / candidate);
    if (derivedCount < 2 || derivedCount > 8) continue;
    if (Math.abs(totalAmount - candidate * derivedCount) <= 0.05) {
      return candidate;
    }
  }

  for (const candidate of candidates) {
    const hasAmountShape = Math.abs(candidate) >= 100 || Number.isInteger(candidate) === false;
    if (hasAmountShape) return candidate;
  }
  return null;
}

function extractRepeatedInstallmentAmount(content: string, totalAmount: number): number | null {
  const amountRegex = /(\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})|\d+(?:,\d{2}))/g;
  const counts = new Map<string, { amount: number; count: number }>();
  let match: RegExpExecArray | null = null;

  while ((match = amountRegex.exec(content)) !== null) {
    const value = parseLocalizedNumber(match[1]);
    if (value == null || !Number.isFinite(value) || value <= 0) continue;
    const rounded = roundCurrency(value);
    if (rounded >= totalAmount) continue;
    const key = rounded.toFixed(2);
    const current = counts.get(key);
    if (!current) {
      counts.set(key, { amount: rounded, count: 1 });
    } else {
      current.count += 1;
    }
  }

  const sorted = [...counts.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.amount - a.amount;
  });

  for (const entry of sorted) {
    if (entry.count < 2) continue;
    const derivedCount = Math.round(totalAmount / entry.amount);
    if (derivedCount < 2 || derivedCount > 8) continue;
    if (Math.abs(totalAmount - entry.amount * derivedCount) > 0.05) continue;
    return entry.amount;
  }

  return null;
}

function resolveTotalAmount(content: string, invoiceTotal: number | null): number | null {
  if (invoiceTotal != null && Number.isFinite(invoiceTotal) && invoiceTotal > 0) {
    return roundCurrency(invoiceTotal);
  }
  const regex =
    /(?:gesamtbetrag|gesamt\s*festsetzung|festgesetzte\s*steuer|zu\s*zahlender\s*betrag)(?:[^0-9]{0,30})(\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?|\d+(?:,\d{2})?)/gi;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(content)) !== null) {
    const value = parseLocalizedNumber(match[1]);
    if (value != null && value > 0) return roundCurrency(value);
  }
  return null;
}

export function buildInstallmentLineItems(plan: InstallmentPlan): ParsedDocument["lineItems"] {
  const rows: NonNullable<ParsedDocument["lineItems"]> = [];
  for (let i = 0; i < plan.installmentsCount; i += 1) {
    rows.push({
      description: `Steuervorauszahlung Rate ${i + 1}/${plan.installmentsCount}`,
      quantity: 1,
      unitPrice: plan.installmentAmount,
      totalPrice: plan.installmentAmount,
      vatRate: null,
    });
  }
  return rows;
}

export function extractLatestInstallmentDueDate(content: string | null | undefined): string | null {
  const normalized = normalizeOcrText(content);
  if (!normalized) return null;

  const lower = normalized.toLowerCase();
  const anchorIdx = Math.max(
    lower.indexOf("fälligkeiten"),
    lower.indexOf("faelligkeiten"),
    lower.indexOf("terminen"),
    lower.indexOf("zahlung")
  );
  const scope =
    anchorIdx >= 0
      ? normalized.slice(anchorIdx, Math.min(normalized.length, anchorIdx + 600))
      : normalized;

  const dateRegex = /\b(\d{1,2}[./]\d{1,2}[./]\d{2,4})\b/g;
  const values: string[] = [];
  let match: RegExpExecArray | null = null;
  while ((match = dateRegex.exec(scope)) !== null) {
    const iso = parseDateFlexible(match[1]);
    if (iso) values.push(iso);
  }
  if (!values.length) return null;

  values.sort();
  return values[values.length - 1] ?? null;
}
