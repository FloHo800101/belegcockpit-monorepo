import type { CaseDraft, DatasetExport, DatasetState } from "../models/types";

export function buildExport(state: DatasetState): DatasetExport & {
  cases: {
    matching: DatasetExport["cases"];
    doc: [];
    tx: [];
  };
} {
  const docsMap = new Map<string, DatasetExport["docs"][number] & {
    invoiceDate?: string;
    dueDate?: string;
  }>();
  const txsMap = new Map<string, DatasetExport["txs"][number] & {
    bookingDate?: string;
    counterpartyName?: string | null;
  }>();

  for (const caseItem of state.cases) {
    for (const doc of caseItem.docs) {
      docsMap.set(doc.id, toEngineDoc(doc));
    }
    for (const tx of caseItem.txs) {
      txsMap.set(tx.id, toEngineTx(tx));
    }
  }

  const matchingCases = state.cases.map((caseItem) => buildCaseSpec(caseItem));

  return {
    meta: {
      ...state.meta,
      nowISO: new Date().toISOString()
    },
    docs: Array.from(docsMap.values()),
    txs: Array.from(txsMap.values()),
    cases: {
      matching: matchingCases,
      doc: [],
      tx: []
    }
  };
}

function buildCaseSpec(caseItem: CaseDraft): DatasetExport["cases"][number] {
  return {
    id: caseItem.id,
    description: caseItem.description,
    expected_state: caseItem.expected_state,
    expected_relation_type: caseItem.expected_relation_type,
    doc_ids: caseItem.docs.map((doc) => doc.id),
    tx_ids: caseItem.txs.map((tx) => tx.id),
    must_reason_codes: caseItem.must_reason_codes?.filter((code) => code.length > 0) || undefined
  };
}

function toEngineDoc(doc: DatasetExport["docs"][number]) {
  const invoiceDate = doc.invoice_date ?? new Date().toISOString();
  const dueDate = doc.due_date ?? undefined;
  return {
    id: doc.id,
    tenant_id: doc.tenant_id,
    amount: doc.amount,
    currency: doc.currency,
    link_state: doc.link_state,
    invoice_date: invoiceDate,
    due_date: dueDate,
    invoiceDate,
    dueDate,
    invoice_no: doc.invoice_no ?? null,
    iban: doc.iban ?? null,
    e2e_id: doc.e2e_id ?? null,
    vendor_raw: doc.vendor_raw,
    vendor_norm: doc.vendor_norm,
    text_raw: doc.text_raw,
    text_norm: doc.text_norm,
    open_amount: null
  };
}

function toEngineTx(tx: DatasetExport["txs"][number]) {
  const bookingDate = tx.booking_date ?? new Date().toISOString();
  const counterpartyName = tx.counterparty_name ?? null;
  return {
    id: tx.id,
    tenant_id: tx.tenant_id,
    amount: tx.amount,
    direction: tx.direction,
    currency: tx.currency,
    booking_date: bookingDate,
    bookingDate,
    link_state: tx.link_state,
    iban: tx.iban ?? null,
    ref: tx.ref ?? tx.reference ?? null,
    reference: tx.reference ?? null,
    e2e_id: tx.e2e_id ?? null,
    vendor_raw: tx.vendor_raw,
    vendor_norm: tx.vendor_norm,
    counterparty_name: counterpartyName,
    counterpartyName,
    text_raw: tx.text_raw,
    text_norm: tx.text_norm
  };
}

export function downloadExport(dataset: DatasetExport): void {
  const data = JSON.stringify(dataset, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  link.href = url;
  link.download = `dataset_${timestamp}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
