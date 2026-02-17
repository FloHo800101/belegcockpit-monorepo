import { parseXmlString } from "./xml-parser.ts";
import { analyzeWithAzure } from "./azure-analyze.ts";
import {
  mapAzureInvoiceToParseResult,
  mapAzureReceiptToParseResult,
  mapAzureLayoutToParseResult,
  mapAzureBankStatementToParseResult,
} from "./azure-mappers.ts";
import { extractEmbeddedXmlFromPdf } from "./pdf-embedded-xml.ts";
import { isImageExtension, pdfHasTextLayer } from "./decision.ts";
import { DocumentType, ParsedDocument, ProcessResult } from "./types.ts";
import { detectDocumentType } from "./document-type-detection.ts";

type SupabaseDownloadResult = {
  data: Blob | null;
  error: { message?: string } | null;
};

type SupabaseStorageBucket = {
  download: (path: string) => Promise<SupabaseDownloadResult>;
};

type SupabaseStorage = {
  from: (bucket: string) => SupabaseStorageBucket;
};

type SupabaseClientLike = {
  storage: SupabaseStorage;
};

type DocumentRow = {
  storage_path: string;
  document_type?: string | null;
};

type AnalyzeResult = {
  content?: string;
  documents?: Array<{ fields?: Record<string, unknown> }>;
  keyValuePairs?: unknown[];
  tables?: unknown[];
};

export function buildDocumentSummary(
  document: { document_type?: string | null },
  parsed: ParsedDocument
) {
  const update: Record<string, unknown> = {};

  if (parsed.invoiceDate) {
    update.receipt_date = parsed.invoiceDate;
  }

  update.amount = parsed.totalGross ?? parsed.totalNet ?? null;
  update.currency = parsed.currency ?? null;
  update.vendor = parsed.vendorName ?? null;

  if (!document.document_type) {
    if (parsed.sourceType === "receipt") {
      update.document_type = "RECEIPT";
    } else if (
      parsed.sourceType === "invoice" ||
      parsed.sourceType === "xml" ||
      parsed.sourceType === "embedded_xml"
    ) {
      update.document_type = "INCOMING_INVOICE";
    }
  }

  return update;
}

export async function processDocument(
  supabase: SupabaseClientLike,
  document: DocumentRow,
  bucket = "documents"
): Promise<ProcessResult> {
  const filePath = document.storage_path as string;
  const fileName = filePath.split("/").pop() || "";
  const fileExt = fileName.split(".").pop()?.toLowerCase();
  const documentType = document.document_type as string | null;
  let detectionMeta: {
    documentType: DocumentType;
    confidence: number;
    reasons: string[];
  } | null = null;

  if (fileExt === "xml") {
    const xml = await downloadTextFile(supabase, filePath, bucket);
    const parsed = parseXmlString(xml);
    return {
      status: "parsed",
      parsing_path: "xml_parser",
      confidence: 0.95,
      detected_document_type: parsed.documentType ?? "invoice",
      detection_confidence: 1,
      detection_reasons: ["xml"],
      parsed_data: parsed,
      raw_xml: xml,
      model_used: "xml",
    };
  }

  if (fileExt === "pdf") {
    const embeddedResult = await extractEmbeddedXmlFromPdf(supabase, filePath, bucket);
    if (embeddedResult.found && embeddedResult.xml) {
      const parsed = parseXmlString(embeddedResult.xml, "embedded_xml");
      return {
        status: "parsed",
        parsing_path: "embedded_xml",
        confidence: 0.95,
        detected_document_type: parsed.documentType ?? "invoice",
        detection_confidence: 1,
        detection_reasons: ["embedded_xml"],
        parsed_data: parsed,
        raw_xml: embeddedResult.xml,
        model_used: "embedded_xml",
      };
    }
  }

  if (documentType === "RECEIPT") {
    const receiptResult = await detectReceiptLikeDocument(supabase, filePath, bucket);
    if (receiptResult.parsed) {
      return {
        status:
          receiptResult.confidence && receiptResult.confidence > 0.7 ? "parsed" : "needs_review",
        parsing_path: "azure_receipt",
        confidence: receiptResult.confidence,
        detected_document_type: "receipt",
        detection_confidence: receiptResult.confidence ?? null,
        detection_reasons: ["document_type:RECEIPT"],
        parsed_data: receiptResult.parsed,
        raw_result: receiptResult.rawResponse ?? null,
        model_used: "prebuilt-receipt",
        decision_reason: "document_type:RECEIPT",
      };
    }
  }

  if (isImageExtension(fileExt)) {
    const receiptResult = await detectReceiptLikeDocument(supabase, filePath, bucket);
    if (receiptResult.parsed) {
      return {
        status:
          receiptResult.confidence && receiptResult.confidence > 0.7 ? "parsed" : "needs_review",
        parsing_path: "azure_receipt",
        confidence: receiptResult.confidence,
        detected_document_type: "receipt",
        detection_confidence: receiptResult.confidence ?? null,
        detection_reasons: ["image:receipt"],
        parsed_data: receiptResult.parsed,
        raw_result: receiptResult.rawResponse ?? null,
        model_used: "prebuilt-receipt",
        decision_reason: "image:receipt",
      };
    }
  }

  if (fileExt === "pdf") {
    const azureInvoiceAnalyze = (await analyzeWithAzure(
      supabase,
      filePath,
      "prebuilt-invoice",
      bucket
    )) as AnalyzeResult | null;
    if (azureInvoiceAnalyze) {
      detectionMeta = detectDocumentType({
        text: (azureInvoiceAnalyze?.content ?? "").toString(),
        fileName,
        azureResult: azureInvoiceAnalyze,
      });

      if (detectionMeta.documentType === "bank_statement") {
        const bankResult = mapAzureBankStatementToParseResult(azureInvoiceAnalyze, fileName);
        if (bankResult.parsed) {
          return {
            status: "needs_review",
            parsing_path: "azure_bank_statement",
            confidence: bankResult.confidence,
            detected_document_type: detectionMeta.documentType,
            detection_confidence: detectionMeta.confidence,
            detection_reasons: detectionMeta.reasons,
            parsed_data: bankResult.parsed,
            raw_result: bankResult.rawResponse ?? null,
            model_used: "prebuilt-invoice",
            decision_reason: "detected:bank_statement",
          };
        }
      }

      if (detectionMeta.documentType === "invoice") {
        const invoiceResult = mapAzureInvoiceToParseResult(azureInvoiceAnalyze);
        if (invoiceResult.parsed) {
          return {
            status:
              invoiceResult.confidence && invoiceResult.confidence > 0.7
                ? "parsed"
                : "needs_review",
            parsing_path: "azure_invoice",
            confidence: invoiceResult.confidence,
            detected_document_type: detectionMeta.documentType,
            detection_confidence: detectionMeta.confidence,
            detection_reasons: detectionMeta.reasons,
            parsed_data: invoiceResult.parsed,
            raw_result: invoiceResult.rawResponse ?? null,
            model_used: "prebuilt-invoice",
            decision_reason: "detected:invoice",
          };
        }
      }
    }

    const hasTextLayer = await pdfHasTextLayer(supabase, filePath, bucket);
    const pdfDecision = hasTextLayer ? "textlayer:true" : "textlayer:false";
    const modelResult = hasTextLayer
      ? await detectInvoiceLikeDocument(supabase, filePath, bucket)
      : await detectReceiptLikeDocument(supabase, filePath, bucket);

    if (modelResult.parsed) {
      const detectedType = modelResult.parsed.documentType ?? detectionMeta?.documentType ?? null;
      return {
        status: modelResult.confidence && modelResult.confidence > 0.7 ? "parsed" : "needs_review",
        parsing_path: hasTextLayer ? "azure_invoice" : "azure_receipt",
        confidence: modelResult.confidence,
        detected_document_type: detectedType,
        detection_confidence: detectionMeta?.confidence ?? modelResult.confidence ?? null,
        detection_reasons: detectionMeta?.reasons ?? [pdfDecision],
        parsed_data: modelResult.parsed,
        raw_result: modelResult.rawResponse ?? null,
        model_used: hasTextLayer ? "prebuilt-invoice" : "prebuilt-receipt",
        decision_reason: pdfDecision,
      };
    }
  }

  const invoiceResult = await detectInvoiceLikeDocument(supabase, filePath, bucket);
  if (invoiceResult.parsed) {
    const detectedType =
      invoiceResult.parsed.documentType ?? detectionMeta?.documentType ?? null;
    return {
      status: invoiceResult.confidence && invoiceResult.confidence > 0.7 ? "parsed" : "needs_review",
      parsing_path: "azure_invoice",
      confidence: invoiceResult.confidence,
      detected_document_type: detectedType,
      detection_confidence: detectionMeta?.confidence ?? invoiceResult.confidence ?? null,
      detection_reasons: detectionMeta?.reasons ?? ["fallback:invoice"],
      parsed_data: invoiceResult.parsed,
      raw_result: invoiceResult.rawResponse ?? null,
      model_used: "prebuilt-invoice",
      decision_reason: "fallback:invoice",
    };
  }

  const receiptResult = await detectReceiptLikeDocument(supabase, filePath, bucket);
  if (receiptResult.parsed) {
    const detectedType =
      receiptResult.parsed.documentType ?? detectionMeta?.documentType ?? null;
    return {
      status: receiptResult.confidence && receiptResult.confidence > 0.7 ? "parsed" : "needs_review",
      parsing_path: "azure_receipt",
      confidence: receiptResult.confidence,
      detected_document_type: detectedType,
      detection_confidence: detectionMeta?.confidence ?? receiptResult.confidence ?? null,
      detection_reasons: detectionMeta?.reasons ?? ["fallback:receipt"],
      parsed_data: receiptResult.parsed,
      raw_result: receiptResult.rawResponse ?? null,
      model_used: "prebuilt-receipt",
      decision_reason: "fallback:receipt",
    };
  }

  const layoutResult = await canUseLayoutParsing(supabase, filePath, bucket);
  if (layoutResult.parsed) {
    const detectedType =
      layoutResult.parsed.documentType ?? detectionMeta?.documentType ?? null;
    return {
      status: "needs_review",
      parsing_path: "layout",
      confidence: layoutResult.confidence,
      detected_document_type: detectedType,
      detection_confidence: detectionMeta?.confidence ?? layoutResult.confidence ?? null,
      detection_reasons: detectionMeta?.reasons ?? ["fallback:layout"],
      parsed_data: layoutResult.parsed,
      raw_result: layoutResult.rawResponse ?? null,
      model_used: "prebuilt-layout",
      decision_reason: "fallback:layout",
    };
  }

  return {
    status: "needs_review",
    parsing_path: "unknown",
    confidence: null,
    detected_document_type: detectionMeta?.documentType ?? "unknown",
    detection_confidence: detectionMeta?.confidence ?? null,
    detection_reasons: detectionMeta?.reasons ?? null,
    parsed_data: { sourceType: "unknown", documentType: "unknown" },
    model_used: "unknown",
    decision_reason: "no_parser",
  };
}

async function downloadTextFile(
  supabase: SupabaseClientLike,
  filePath: string,
  bucket: string
) {
  const { data, error } = await supabase.storage.from(bucket).download(filePath);
  if (error || !data) {
    throw new Error(`Failed to download file: ${error?.message ?? "unknown"}`);
  }
  return await data.text();
}

async function detectInvoiceLikeDocument(
  supabaseClient: SupabaseClientLike,
  filePath: string,
  bucket: string
) {
  const azureResult = await analyzeWithAzure(supabaseClient, filePath, "prebuilt-invoice", bucket);
  if (!azureResult) {
    return { parsed: null, confidence: null, rawResponse: null };
  }
  return mapAzureInvoiceToParseResult(azureResult);
}

async function detectReceiptLikeDocument(
  supabaseClient: SupabaseClientLike,
  filePath: string,
  bucket: string
) {
  const azureResult = await analyzeWithAzure(supabaseClient, filePath, "prebuilt-receipt", bucket);
  if (!azureResult) {
    return { parsed: null, confidence: null, rawResponse: null };
  }
  return mapAzureReceiptToParseResult(azureResult);
}

async function canUseLayoutParsing(
  supabaseClient: SupabaseClientLike,
  filePath: string,
  bucket: string
) {
  const azureResult = await analyzeWithAzure(supabaseClient, filePath, "prebuilt-layout", bucket);
  if (!azureResult) {
    return { parsed: null, confidence: null, rawResponse: null };
  }
  return mapAzureLayoutToParseResult(azureResult);
}
