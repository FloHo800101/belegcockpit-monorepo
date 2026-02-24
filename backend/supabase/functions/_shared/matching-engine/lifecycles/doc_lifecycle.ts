import { MatchingConfig } from "../config.ts";
import {
  Doc,
  DocLifecycleKind,
  DocLifecycleResult,
  NextAction,
  RematchHint,
  Severity,
} from "../types.ts";

export function evaluateDocLifecycle(
  doc: Doc,
  now: Date,
  cfg: MatchingConfig
): DocLifecycleResult {
  if (isDuplicateDoc(doc)) {
    return buildResult(doc.id, "doc_duplicate", "info", "none", ["DUPLICATE"]);
  }

  if (!hasRequiredFields(doc, cfg)) {
    return buildResult(doc.id, "doc_error", "action", "reupload_request", [
      "MISSING_FIELDS",
    ]);
  }

  if (isPrivate(doc)) {
    return buildResult(doc.id, "private", "info", "ask_user", ["PRIVATE_HINT"]);
  }

  if (needsSplit(doc)) {
    return buildResult(doc.id, "split_required", "action", "start_split_ui", [
      "SPLIT_HINT",
    ]);
  }

  if (hasDueDate(doc)) {
    const overdue = isOverdue(doc, now, cfg);
    const rematchHint = buildRematchHint(getDueDate(doc), cfg, "due");
    return buildResult(
      doc.id,
      overdue ? "overdue" : "awaiting_tx",
      overdue ? "warning" : "info",
      overdue ? "inbox_task" : "none",
      ["HAS_DUE_DATE", overdue ? "OVERDUE" : "NOT_OVERDUE"],
      rematchHint
    );
  }

  if (expectsPayment(doc)) {
    const rematchHint = buildRematchHint(getInvoiceDate(doc), cfg, "invoice");
    return buildResult(doc.id, "awaiting_tx", "info", "none", [
      "EXPECTS_PAYMENT",
      "NO_DUE_DATE",
    ], rematchHint);
  }

  if (isEigenbelegCandidate(doc)) {
    return buildResult(doc.id, "eigenbeleg", "action", "start_eigenbeleg_flow", [
      "EIGENBELEG_CANDIDATE",
    ]);
  }

  return buildResult(
    doc.id,
    "awaiting_tx",
    "info",
    "none",
    ["FALLBACK_AWAITING"],
    buildRematchHint(getInvoiceDate(doc), cfg, "invoice")
  );
}

export function isDuplicateDoc(doc: Doc): boolean {
  return Boolean(getDuplicateKey(doc));
}

export function hasRequiredFields(doc: Doc, cfg?: MatchingConfig): boolean {
  if (doc.hasRequiredFields === false || doc.has_required_fields === false) return false;

  const rules = cfg?.minRequiredFields;
  const requireAmount = rules?.requireAmount ?? true;
  const requireCurrency = rules?.requireCurrency ?? true;
  const requireInvoiceDate = rules?.requireInvoiceDate ?? true;

  if (requireAmount && !(Number.isFinite(doc.amount) && doc.amount > 0)) return false;
  if (requireCurrency && !doc.currency) return false;
  if (requireInvoiceDate && !getInvoiceDate(doc)) return false;

  return true;
}

export function isPrivate(doc: Doc): boolean {
  return Boolean(doc.privateHint ?? doc.private_hint);
}

export function needsSplit(doc: Doc): boolean {
  return Boolean(doc.splitHint ?? doc.split_hint);
}

export function hasDueDate(doc: Doc): boolean {
  return Boolean(getDueDate(doc));
}

export function isOverdue(doc: Doc, now: Date, cfg: MatchingConfig): boolean {
  const dueDateISO = getDueDate(doc);
  if (!dueDateISO) return false;
  const due = parseIsoDate(dueDateISO);
  const nowDate = now instanceof Date ? now : new Date(now);
  if (!due || Number.isNaN(nowDate.getTime())) return false;

  const threshold = addDays(due, cfg.graceDays);
  return nowDate.getTime() > threshold.getTime();
}

export function expectsPayment(doc: Doc): boolean {
  const docType = getDocType(doc);
  const paymentHint = getPaymentHint(doc);

  if (docType === "receipt") return false;
  if (paymentHint === "cash" || paymentHint === "ec" || paymentHint === "card") return false;

  return docType === "invoice" || paymentHint === "transfer";
}

export function isEigenbelegCandidate(doc: Doc): boolean {
  const docType = getDocType(doc);
  const paymentHint = getPaymentHint(doc);
  if (docType === "receipt") return true;
  return paymentHint === "cash" || paymentHint === "ec" || paymentHint === "card";
}

function buildResult(
  docId: string,
  kind: DocLifecycleKind,
  severity: Severity,
  nextAction: NextAction,
  explanationCodes: string[],
  rematchHint?: RematchHint
): DocLifecycleResult {
  return { docId, kind, severity, nextAction, rematchHint, explanationCodes };
}

function buildRematchHint(
  anchorISO: string | undefined,
  cfg: MatchingConfig,
  anchorType: "due" | "invoice"
): RematchHint | undefined {
  if (!anchorISO) return undefined;
  const anchor = parseIsoDate(anchorISO);
  if (!anchor) return undefined;

  return {
    anchorDate: anchor.toISOString(),
    windowBeforeDays:
      anchorType === "due" ? cfg.windowBeforeDueDays : cfg.windowBeforeInvoiceDays,
    windowAfterDays:
      anchorType === "due" ? cfg.windowAfterDueDays : cfg.windowAfterInvoiceDays,
  };
}

function getInvoiceDate(doc: Doc): string | undefined {
  return doc.invoiceDate ?? doc.documentDate ?? doc.invoice_date ?? doc.document_date;
}

function getDueDate(doc: Doc): string | undefined {
  return doc.dueDate ?? doc.due_date;
}

function getDocType(doc: Doc): "invoice" | "receipt" | "credit_note" | "unknown" {
  return doc.docType ?? doc.doc_type ?? "unknown";
}

function getPaymentHint(doc: Doc): "cash" | "ec" | "card" | "transfer" | "unknown" {
  return doc.paymentHint ?? doc.payment_hint ?? "unknown";
}

function getDuplicateKey(doc: Doc): string | null | undefined {
  return doc.duplicateKey ?? doc.duplicate_key ?? doc.hash;
}

function parseIsoDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}
