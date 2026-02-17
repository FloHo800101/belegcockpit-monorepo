import type { CaseDraft, DatasetExport, DatasetState } from "../models/types";
import type { MatchingDataset } from "../../tests-backend/matching/mass_all/types";

type ImportPayload = DatasetExport | MatchingDataset;

export function parseImport(json: string): { state: DatasetState; warnings: string[] } | null {
  try {
    const parsed = JSON.parse(json) as ImportPayload;
    if (!parsed.meta || !Array.isArray(parsed.docs) || !Array.isArray(parsed.txs)) {
      return null;
    }

    const casesRaw = Array.isArray((parsed as DatasetExport).cases)
      ? (parsed as DatasetExport).cases
      : (parsed as MatchingDataset).cases?.matching ?? [];
    const docMap = new Map(
      parsed.docs.map((doc) => [doc.id, normalizeDoc(doc as DatasetExport["docs"][number])])
    );
    const txMap = new Map(
      parsed.txs.map((tx) => [tx.id, normalizeTx(tx as DatasetExport["txs"][number])])
    );
    const warnings: string[] = [];

    const cases: CaseDraft[] = casesRaw.map((caseItem) => {
      const docs = caseItem.doc_ids.map((id) => docMap.get(id)).filter(Boolean);
      const txs = caseItem.tx_ids.map((id) => txMap.get(id)).filter(Boolean);

      if (docs.length !== caseItem.doc_ids.length) {
        warnings.push(`Missing docs for case ${caseItem.id}`);
      }
      if (txs.length !== caseItem.tx_ids.length) {
        warnings.push(`Missing txs for case ${caseItem.id}`);
      }

      return {
        id: caseItem.id,
        description: caseItem.description,
        expected_state:
          caseItem.expected_state === ("SUGGESTED" as CaseDraft["expected_state"])
            ? "SUGGESTED_MATCH"
            : caseItem.expected_state,
        expected_relation_type: caseItem.expected_relation_type,
        must_reason_codes: caseItem.must_reason_codes ?? [],
        docs: docs.map((doc) => ({ ...doc! })),
        txs: txs.map((tx) => ({ ...tx! }))
      };
    });

    return {
      state: {
        meta: parsed.meta,
        cases
      },
      warnings
    };
  } catch {
    return null;
  }
}

function normalizeDoc(doc: DatasetExport["docs"][number]): DatasetExport["docs"][number] {
  const invoiceDate =
    doc.invoice_date ?? (doc as any).invoiceDate ?? new Date().toISOString();
  const dueDate = doc.due_date ?? (doc as any).dueDate ?? invoiceDate;
  return {
    ...doc,
    invoice_date: invoiceDate,
    due_date: dueDate,
    vendor_raw: doc.vendor_raw ?? (doc as any).vendorRaw ?? "",
    vendor_norm: doc.vendor_norm ?? (doc as any).vendorNorm ?? "",
    text_raw: doc.text_raw ?? (doc as any).textRaw ?? "",
    text_norm: doc.text_norm ?? (doc as any).textNorm ?? ""
  };
}

function normalizeTx(tx: DatasetExport["txs"][number]): DatasetExport["txs"][number] {
  const bookingDate =
    tx.booking_date ?? (tx as any).bookingDate ?? new Date().toISOString();
  const counterpartyName =
    tx.counterparty_name ?? (tx as any).counterpartyName ?? null;
  const ref = tx.ref ?? tx.reference ?? (tx as any).ref ?? (tx as any).reference ?? null;
  return {
    ...tx,
    booking_date: bookingDate,
    counterparty_name: counterpartyName,
    ref,
    vendor_raw: tx.vendor_raw ?? (tx as any).vendorRaw ?? "",
    vendor_norm: tx.vendor_norm ?? (tx as any).vendorNorm ?? "",
    text_raw: tx.text_raw ?? (tx as any).textRaw ?? "",
    text_norm: tx.text_norm ?? (tx as any).textNorm ?? ""
  };
}
