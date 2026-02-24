export type LinkState = "unlinked" | "linked" | "partial" | "suggested";
export type MatchState = "final" | "suggested" | "ambiguous" | "partial";
export type MatchRelationType = "one_to_one" | "one_to_many" | "many_to_one" | "many_to_many";
export type Direction = "in" | "out";

export interface DocLineItem {
  id?: string;
  line_index?: number | null;
  description?: string | null;
  amount_signed?: number | null;
  amount_abs?: number | null;
  currency?: string | null;
  link_state?: LinkState;
  open_amount?: number | null;
}

export interface Doc {
  id: string;
  tenant_id: string;
  tenantId?: string;
  amount: number;
  currency: string;
  link_state: LinkState;
  invoice_date?: string;
  invoiceDate?: string;
  due_date?: string;
  dueDate?: string;
  document_date?: string;
  documentDate?: string;
  doc_type?: "invoice" | "receipt" | "credit_note" | "unknown";
  docType?: "invoice" | "receipt" | "credit_note" | "unknown";
  payment_hint?: "cash" | "ec" | "card" | "transfer" | "unknown";
  paymentHint?: "cash" | "ec" | "card" | "transfer" | "unknown";
  extraction_quality?: number | null;
  extractionQuality?: number | null;
  has_required_fields?: boolean | null;
  hasRequiredFields?: boolean | null;
  private_hint?: boolean | null;
  privateHint?: boolean | null;
  split_hint?: boolean | null;
  splitHint?: boolean | null;
  duplicate_key?: string | null;
  duplicateKey?: string | null;
  hash?: string | null;
  iban?: string | null;
  invoice_no?: string | null;
  e2e_id?: string | null;
  vendor_raw?: string | null;
  vendor_norm?: string | null;
  buyer_raw?: string | null;
  buyer_norm?: string | null;
  text_raw?: string | null;
  text_norm?: string | null;
  amount_candidates?: number[] | null;
  items?: DocLineItem[] | null;
  // Only used for partial/remaining matches (1:n); null/undefined when unknown.
  open_amount?: number | null;
}

export interface Tx {
  id: string;
  tenant_id: string;
  amount: number;
  direction: Direction;
  currency: string;
  foreign_amount?: number | null;
  foreign_currency?: string | null;
  exchange_rate?: number | null;
  booking_date: string;
  bookingDate?: string;
  value_date?: string;
  valueDate?: string;
  link_state: LinkState;
  iban?: string | null;
  // Reference / usage text (Verwendungszweck).
  ref?: string | null;
  reference?: string | null;
  e2e_id?: string | null;
  vendor_raw?: string | null;
  counterparty_name?: string | null;
  counterpartyName?: string | null;
  vendor_key?: string | null;
  vendorKey?: string | null;
  vendor_norm?: string | null;
  text_raw?: string | null;
  text_norm?: string | null;
  private_hint?: boolean | null;
  privateHint?: boolean | null;
  is_recurring_hint?: boolean | null;
  isRecurringHint?: boolean | null;
}

export interface FeatureVector {
  amount_delta: number;
  days_delta: number;
  iban_equal?: boolean;
  invoice_no_equal?: boolean;
  e2e_equal?: boolean;
  partial_keywords?: boolean;
  vendor_sim?: number;
  text_sim?: number;
}

export interface DocCandidate {
  doc: Doc;
  features: FeatureVector;
}

export interface TxCandidate {
  tx: Tx;
  features: FeatureVector;
}

export type Relation =
  | { kind: "one_to_one"; tx: Tx; doc: DocCandidate }
  | { kind: "many_to_one"; tx: Tx; docs: DocCandidate[] }
  | { kind: "one_to_many"; doc: Doc; txs: Tx[] }
  | { kind: "many_to_many"; txs: Tx[]; docs: Doc[]; hypothesis?: Record<string, any> };

export interface RelationSet {
  oneToOne: Extract<Relation, { kind: "one_to_one" }>[];
  manyToOne: Extract<Relation, { kind: "many_to_one" }>[];
  oneToMany: Extract<Relation, { kind: "one_to_many" }>[];
  manyToMany: Extract<Relation, { kind: "many_to_many" }>[];
}

export interface MatchDecision {
  state: MatchState;
  relation_type: MatchRelationType;
  tx_ids: readonly string[];
  doc_ids: readonly string[];
  confidence: number;
  reason_codes: readonly string[];
  inputs: Record<string, any>;
  matched_by: "system" | "user";
  // Groups/partials metadata for persistence mapping.
  match_group_id?: string;
  link_state_override?: LinkState;
  open_amount_after?: number | null;
}

export interface PipelineInput {
  docs: Doc[];
  txs: Tx[];
  nowISO?: string;
}

export interface PipelineResult {
  decisions: MatchDecision[];
  prepass?: { finalCount: number };
  docLifecycle?: DocLifecycleResult[];
  txLifecycle?: TxLifecycleResult[];
}

export interface MatchRepository {
  applyMatches(finalDecisions: MatchDecision[]): Promise<void>;
  saveSuggestions(suggestions: MatchDecision[]): Promise<void>;
  audit(allDecisions: MatchDecision[]): Promise<void>;
  loadTxHistory(tenantId: string, opts: TxHistoryOptions): Promise<Tx[]>;
}

export type DocLifecycleKind =
  | "doc_duplicate"
  | "doc_error"
  | "awaiting_tx"
  | "overdue"
  | "eigenbeleg"
  | "private"
  | "split_required";

export type Severity = "info" | "warning" | "action";

export type NextAction =
  | "none"
  | "inbox_task"
  | "ask_user"
  | "start_split_ui"
  | "start_eigenbeleg_flow"
  | "reupload_request";

export type RematchHint = {
  anchorDate: string;
  windowBeforeDays: number;
  windowAfterDays: number;
};

export type DocLifecycleResult = {
  docId: string;
  kind: DocLifecycleKind;
  severity: Severity;
  nextAction: NextAction;
  rematchHint?: RematchHint;
  explanationCodes: string[];
};

export type TxLifecycleKind =
  | "technical_tx"
  | "private_tx"
  | "fee_tx"
  | "subscription_tx"
  | "prepayment_tx"
  | "needs_eigenbeleg"
  | "missing_doc";

export type TxLifecycleResult = {
  txId: string;
  kind: TxLifecycleKind;
  severity: Severity;
  nextAction: NextAction;
  rematchHint?: RematchHint;
  explanationCodes: string[];
  ruleSuggestion?: {
    type: "subscription_rule" | "fee_rule" | "vendor_rule";
    key: string;
    cadence?: "monthly" | "yearly" | "weekly";
  };
};

export type TxHistoryOptions = {
  lookbackDays: number;
  limit: number;
  vendorKey?: string | null;
};
