export type DocumentType = "invoice" | "bank_statement" | "receipt" | "unknown";

export interface ParsedLineItem {
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
  vatRate: number | null;
}

export interface ParsedTransaction {
  bookingDate: string;
  valueDate?: string | null;
  amount: number;
  currency: string;
  foreignAmount?: number | null;
  foreignCurrency?: string | null;
  exchangeRate?: number | null;
  description: string;
  counterpartyName?: string | null;
  counterpartyIban?: string | null;
  counterpartyBic?: string | null;
  reference?: string | null;
  endToEndId?: string | null;
  bookingType?:
    | "transfer"
    | "direct_debit"
    | "card_payment"
    | "fee"
    | "interest"
    | "unknown"
    | null;
}

export interface ParsedVatItem {
  rate: number;
  amount: number;
  netAmount: number;
}

export interface ParsedAddress {
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
}

export interface ParsedRawMeta {
  contentLength?: number;
  qualityGatePassed?: boolean;
  extractionPipeline?:
    | "items"
    | "statement_lines"
    | "legacy_lines"
    | "hybrid_merge"
    | "none";
  itemsCount?: number;
  lineCount?: number;
  mergedCount?: number;
  dedupMatchedCount?: number;
  [key: string]: unknown;
}

export interface ParsedDocument {
  sourceType:
    | "xml"
    | "embedded_xml"
    | "invoice"
    | "bank_statement"
    | "receipt"
    | "layout"
    | "unknown";
  documentType?: DocumentType;
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string | null;
  vendorName?: string | null;
  vendorAddress?: ParsedAddress | null;
  buyerName?: string | null;
  buyerAddress?: ParsedAddress | null;
  customerId?: string | null;
  vendorTaxId?: string | null;
  vendorTaxNumber?: string | null;
  paymentTerms?: string | null;
  serviceDate?: string | null;
  servicePeriod?: string | null;
  totalNet?: number | null;
  totalVat?: number | null;
  totalGross?: number | null;
  currency?: string;
  paymentMethod?: string | null;
  lineItems?: ParsedLineItem[];
  vatItems?: ParsedVatItem[];
  bankName?: string | null;
  iban?: string | null;
  bic?: string | null;
  accountHolder?: string | null;
  statementDate?: string | null;
  statementPeriod?: { from: string; to: string } | null;
  openingBalance?: number | null;
  closingBalance?: number | null;
  transactions?: ParsedTransaction[];
  source?: {
    fileName?: string;
    pageCount?: number;
    extractedBy?: "azure" | "pdf" | "xml";
  } | null;
  rawMeta?: ParsedRawMeta | null;
}

export interface ProcessResult {
  status: "parsed" | "needs_review" | "failed";
  parsing_path: string;
  confidence: number | null;
  detected_document_type?: DocumentType | null;
  detection_confidence?: number | null;
  detection_reasons?: string[] | null;
  parsed_data: ParsedDocument;
  raw_xml?: string;
  raw_result?: unknown;
  model_used?: string;
  decision_reason?: string;
  error?: string;
}

export interface AzureParseResult {
  parsed: ParsedDocument | null;
  confidence: number | null;
  rawResponse: unknown;
}
