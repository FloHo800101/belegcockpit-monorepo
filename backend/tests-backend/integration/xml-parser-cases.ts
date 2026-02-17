/// <reference path="../../supabase/functions/deno.d.ts" />
// Run with: pnpm test:xml-parser

import { parseXmlString } from "../../supabase/functions/_shared/xml-parser.ts";
import {
  assert,
  assertClose,
  buildStoragePath,
  createDocumentRow,
  createSupabaseTestClient,
  downloadText,
  getFileName,
  getTestTenantId,
  loadEnvFiles,
  removeFile,
  uploadLocalFile,
} from "./_shared.ts";

const BUCKET = "documents";
const RUNS_TABLE = "document_xml_parse_runs";
const EXTRACTIONS_TABLE = "document_extractions";
const KEEP_FILES = Deno.env.get("SUPABASE_KEEP_TEST_FILES") !== "0";
const XML_DIR = new URL("../documents-analyzes/xml-parser/", import.meta.url);

type CaseConfig = {
  name: string;
  check: (parsed: ReturnType<typeof parseXmlString>) => void;
};

const CASES: Record<string, CaseConfig> = {
  "XML Test 1_CII.xml": {
    name: "cii",
    check: (parsed) => {
      assert(parsed.sourceType === "xml", "CII sourceType should be xml");
      assert(parsed.invoiceNumber === "CII-2025-2001", "CII invoice number");
      assert(parsed.invoiceDate === "2025-11-30", "CII invoice date");
      assert(parsed.vendorName === "Alpha Consulting GmbH", "CII vendor name");
      assert(parsed.buyerName === "Beta Industrie AG", "CII buyer name");
      assertClose(parsed.totalNet, 1000);
      assertClose(parsed.totalVat, 190);
      assertClose(parsed.totalGross, 1190);
      assert(parsed.currency === "EUR", "CII currency");
      assert(parsed.lineItems?.length === 2, "CII line items");
      const first = parsed.lineItems?.[0];
      assertClose(first?.quantity, 8);
      assertClose(first?.unitPrice, 100);
      assertClose(first?.totalPrice, 800);
      assertClose(first?.vatRate, 0.19, 0.001);
    },
  },
  "XML Test 2_UBL.xml": {
    name: "ubl",
    check: (parsed) => {
      assert(parsed.sourceType === "xml", "UBL sourceType should be xml");
      assert(parsed.invoiceNumber === "INV-2025-3002", "UBL invoice number");
      assert(parsed.invoiceDate === "2025-12-02", "UBL invoice date");
      assert(parsed.vendorName === "CityBooks GmbH", "UBL vendor name");
      assert(
        parsed.buyerName === "Kanzlei Hansa & Partner mbB",
        "UBL buyer name"
      );
      assertClose(parsed.totalNet, 1200);
      assertClose(parsed.totalVat, 199.2);
      assertClose(parsed.totalGross, 1399.2);
      assert(parsed.vatItems?.length === 2, "UBL VAT items");
      const rates = (parsed.vatItems ?? []).map((item) => item.rate).sort();
      assertClose(rates[0], 0.07, 0.001);
      assertClose(rates[1], 0.19, 0.001);
      assert(parsed.lineItems?.length === 2, "UBL line items");
      const first = parsed.lineItems?.[0];
      assertClose(first?.quantity, 6);
      assertClose(first?.unitPrice, 40);
      assertClose(first?.totalPrice, 240);
      assertClose(first?.vatRate, 0.07, 0.001);
    },
  },
  "generic-invoice.xml": {
    name: "generic",
    check: (parsed) => {
      assert(parsed.sourceType === "xml", "Generic sourceType should be xml");
      assert(parsed.invoiceNumber === "GEN-1001", "Generic invoice number");
      assert(parsed.invoiceDate === "2025-10-01", "Generic invoice date");
      assert(parsed.dueDate === "2025-10-15", "Generic due date");
      assert(parsed.vendorName === "Generic Supplies", "Generic vendor name");
      assert(parsed.buyerName === "Example Buyer", "Generic buyer name");
      assertClose(parsed.totalNet, 100);
      assertClose(parsed.totalVat, 19);
      assertClose(parsed.totalGross, 119);
      assert(parsed.currency === "EUR", "Generic currency");
      assert(parsed.lineItems?.length === 1, "Generic line items");
      const first = parsed.lineItems?.[0];
      assertClose(first?.quantity, 1);
      assertClose(first?.unitPrice, 100);
      assertClose(first?.totalPrice, 100);
      assertClose(first?.vatRate, 0.19, 0.001);
      assert(parsed.vatItems?.length === 1, "Generic VAT items");
    },
  },
};

async function listXmlFiles(): Promise<string[]> {
  const names: string[] = [];
  for await (const entry of Deno.readDir(XML_DIR)) {
    if (!entry.isFile) continue;
    if (!entry.name.toLowerCase().endsWith(".xml")) continue;
    names.push(entry.name);
  }
  return names;
}

async function run() {
  await loadEnvFiles();
  const supabase = createSupabaseTestClient();
  const tenantId = await getTestTenantId(supabase);
  const files = await listXmlFiles();
  if (!files.length) {
    throw new Error(`No XML files found in ${XML_DIR.pathname}`);
  }

  for (const fileName of files) {
    const fileUrl = new URL(fileName, XML_DIR);
    const config = CASES[fileName];
    const check = config?.check ?? ((parsed) => {
      assert(parsed.sourceType === "xml", "XML sourceType should be xml");
    });
    const caseName = config?.name ?? fileName;
    const storagePath = buildStoragePath("xml-parser", fileName);

    const uploadMeta = await uploadLocalFile(
      supabase,
      BUCKET,
      fileUrl,
      storagePath
    );
    const documentId = await createDocumentRow({
      supabase,
      tenantId,
      storageBucket: BUCKET,
      storagePath,
      originalFilename: fileName,
      mimeType: uploadMeta.contentType,
      fileSize: uploadMeta.size,
    });
    try {
      const xml = await downloadText(supabase, BUCKET, storagePath);
      const parsed = parseXmlString(xml);
      const { data: saved, error: saveError } = await (supabase
        .from(RUNS_TABLE) as any)
        .insert({
          storage_path: storagePath,
          source_type: parsed.sourceType,
          parsed_data: parsed,
        })
        .select("id")
        .single();
      if (saveError) {
        throw new Error(
          `Failed to save XML parse result (${caseName}): ${saveError.message}`
        );
      }

      const { error: extractionError } = await (supabase
        .from(EXTRACTIONS_TABLE) as any)
        .upsert({
          document_id: documentId,
          status: "succeeded",
          parsing_path: "xml_parser",
          model_used: "xml",
          parse_confidence: 0.95,
          detected_document_type: parsed.documentType ?? "invoice",
          detection_confidence: 1,
          detection_reasons: ["xml"],
          parsed_data: parsed,
        });
      if (extractionError) {
        throw new Error(
          `Failed to save extraction (${caseName}): ${extractionError.message}`
        );
      }
      check(parsed);
      console.log(`[xml-parser] ${caseName}: ok`, {
        documentId,
        invoiceNumber: parsed.invoiceNumber,
        totalGross: parsed.totalGross,
        runId: saved?.id,
      });
    } finally {
      if (!KEEP_FILES) {
        await removeFile(supabase, BUCKET, storagePath);
      }
    }
  }
}

if (import.meta.main) {
  run().catch((error) => {
    console.error(error);
    Deno.exit(1);
  });
}
