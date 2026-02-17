export type Currency = "EUR";
export type LinkState = "unlinked" | "suggested";
export type Direction = "out" | "in";
export type ExpectedState =
  | "FINAL_MATCH"
  | "SUGGESTED_MATCH"
  | "NO_MATCH"
  | "AMBIGUOUS"
  | "PARTIAL_MATCH";
export type ExpectedRelationType =
  | "one_to_one"
  | "one_to_many"
  | "many_to_one"
  | "many_to_many"
  | "none";

export type RelationTypeUI =
  | "doc-only"
  | "tx-only"
  | "one_to_one"
  | "one_to_many"
  | "many_to_one"
  | "many_to_many";

export interface CanonicalDoc {
  id: string;
  tenant_id: string;
  amount: number;
  currency: Currency;
  link_state: LinkState;
  invoice_date: string;
  due_date?: string | null;
  invoice_no?: string | null;
  iban?: string | null;
  e2e_id?: string | null;
  vendor_raw: string;
  vendor_norm: string;
  text_raw: string;
  text_norm: string;
  meta?: Record<string, unknown>;
}

export interface CanonicalTx {
  id: string;
  tenant_id: string;
  amount: number;
  direction: Direction;
  currency: Currency;
  booking_date: string;
  link_state: LinkState;
  iban?: string | null;
  reference?: string | null;
  description?: string | null;
  counterparty_name?: string | null;
  e2e_id?: string | null;
  vendor_raw: string;
  vendor_norm: string;
  ref?: string | null;
  text_raw: string;
  text_norm: string;
}

export interface CaseSpec {
  id: string;
  description: string;
  expected_state: ExpectedState;
  expected_relation_type: ExpectedRelationType;
  doc_ids: string[];
  tx_ids: string[];
  must_reason_codes?: string[];
}

export interface DatasetExport {
  meta: {
    name: string;
    tenant_id: string;
    schemaVersion: number;
  };
  docs: CanonicalDoc[];
  txs: CanonicalTx[];
  cases: CaseSpec[];
}

export interface CaseDraft {
  id: string;
  description: string;
  expected_state: ExpectedState;
  expected_relation_type: ExpectedRelationType;
  must_reason_codes?: string[];
  generator_toggles?: GeneratorToggles;
  docs: CanonicalDoc[];
  txs: CanonicalTx[];
}

export interface DatasetState {
  meta: DatasetExport["meta"];
  cases: CaseDraft[];
}

export interface GeneratorToggles {
  txIbanMissing: boolean;
  vendorNoise: boolean;
  invoiceNoNoise: boolean;
  invoiceNoMismatch: boolean;
  dateEdge: boolean;
  dueDateShift: boolean;
  amountEdge: boolean;
  partialKeyword: boolean;
  batchKeyword: boolean;
}

export interface IdGenerator {
  nextDocId: () => string;
  nextTxId: () => string;
  nextCaseId: () => string;
}

export interface TemplateOption {
  id: string;
  label: string;
  relationType: RelationTypeUI;
}
